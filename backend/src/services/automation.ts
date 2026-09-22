// ============================================================
// Internal automation engine + n8n-friendly outgoing webhooks.
// Rules: trigger + conditions + delay + action (+ optional template).
// fireTrigger() is called from API routes/services on domain events.
// A scheduler (scheduler.ts) executes SCHEDULED runs whose runAt <= now.
// ============================================================
import { db, uuid, nowIso, jstr, jparse } from "../db";
import { mapRule } from "../db/map";
import { renderTemplate, TemplateVars, formatDate, formatTime, money } from "./templates";
import { sendViaChannel, Channel } from "./messaging";
import { notifyStaff } from "./notifications";
import { audit } from "./audit";
import { getSettings } from "./settings";

export const TRIGGERS = [
  "CUSTOMER_CREATED",
  "ENQUIRY_RECEIVED",
  "BOOKING_CREATED",
  "BOOKING_CONFIRMED",
  "BOOKING_CANCELLED",
  "PAYMENT_PENDING",
  "PAYMENT_RECEIVED",
  "SESSION_STARTING_SOON",
  "SESSION_COMPLETED",
  "NO_CUSTOMER_RESPONSE",
] as const;

export const ACTIONS = [
  "SEND_EMAIL",
  "SEND_WHATSAPP",
  "SEND_INSTAGRAM",
  "CREATE_FOLLOWUP",
  "UPDATE_BOOKING",
  "UPDATE_CUSTOMER",
  "SEND_WEBHOOK",
  "NOTIFY_STAFF",
] as const;

interface FireContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
}

function conditionsMatch(conditions: Record<string, unknown>, ctx: FireContext): boolean {
  if (!conditions || Object.keys(conditions).length === 0) return true;
  for (const [path, expected] of Object.entries(conditions)) {
    if (expected === "" || expected === null || expected === undefined) continue;
    const got = path.split(".").reduce<unknown>((acc, key) => {
      if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
      return undefined;
    }, ctx);
    if (String(got) !== String(expected)) return false;
  }
  return true;
}

function safeJson(v: unknown) {
  try {
    return JSON.parse(JSON.stringify(v ?? null));
  } catch {
    return null;
  }
}

export async function fireTrigger(
  trigger: string,
  entityType: string,
  entityId: string,
  ctx: FireContext = {}
): Promise<void> {
  try {
    const rules = await db
      .selectFrom("automationRules")
      .selectAll()
      .where("trigger", "=", trigger)
      .where("enabled", "=", true)
      .execute();
    const now = nowIso();
    for (const raw of rules) {
      const rule = mapRule(raw);
      if (!conditionsMatch(rule.conditions, ctx)) {
        await db
          .insertInto("automationExecutions")
          .values({
            id: uuid(),
            ruleId: rule.id,
            triggerEntity: entityType,
            triggerEntityId: entityId,
            status: "SKIPPED",
            runAt: now,
            details: jstr({ reason: "conditions did not match" }),
            createdAt: now,
          })
          .execute();
        continue;
      }
      const runAt = new Date(Date.now() + (rule.delayMinutes || 0) * 60_000).toISOString();
      const execution = await db
        .insertInto("automationExecutions")
        .values({
          id: uuid(),
          ruleId: rule.id,
          triggerEntity: entityType,
          triggerEntityId: entityId,
          status: "SCHEDULED",
          runAt,
          details: jstr({ trigger, snapshot: safeJson(ctx) }),
          createdAt: now,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      if ((rule.delayMinutes || 0) <= 0) {
        await executeRun(execution.id);
      }
    }
    forwardToN8n(trigger, entityType, entityId, ctx).catch(() => undefined);
  } catch (e) {
    console.error("fireTrigger failed", e);
  }
}

async function forwardToN8n(trigger: string, entityType: string, entityId: string, ctx: FireContext) {
  const s = await getSettings();
  const url = s?.n8nWebhookUrl || process.env.N8N_WEBHOOK_URL;
  if (!url) return;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: trigger, entityType, entityId, data: safeJson(ctx), at: new Date().toISOString() }),
  });
}

async function buildVars(execDetails: Record<string, unknown>): Promise<TemplateVars> {
  const snap = (execDetails?.snapshot as Record<string, unknown>) || {};
  const vars: TemplateVars = {};
  const customer = (snap.customer as Record<string, unknown>) || {};
  const booking = (snap.booking as Record<string, unknown>) || {};
  const session = ((booking.session as Record<string, unknown>) || (snap.session as Record<string, unknown>) || {}) as Record<string, unknown>;
  const workshop = ((session.workshop as Record<string, unknown>) || (snap.workshop as Record<string, unknown>) || {}) as Record<string, unknown>;
  if (customer.firstName || customer.lastName) vars.customer_name = `${customer.firstName || ""} ${customer.lastName || ""}`.trim();
  if (workshop.name) vars.class_name = String(workshop.name);
  if (session.startsAt) {
    vars.date = formatDate(new Date(String(session.startsAt)));
    vars.time = formatTime(new Date(String(session.startsAt)));
  }
  if (booking.totalAmount !== undefined) vars.amount = money(Number(booking.totalAmount));
  if (session.location || workshop.location) vars.location = String(session.location || workshop.location || "");
  if (booking.bookingCode) vars.booking_id = String(booking.bookingCode);
  vars.payment_link = "";
  return vars;
}

async function resolveRecipient(execDetails: Record<string, unknown>) {
  const snap = (execDetails?.snapshot as Record<string, unknown>) || {};
  const customerSnap = (snap.customer as { id?: string }) || {};
  const bookingSnap = (snap.booking as { id?: string; customerId?: string }) || {};
  const customerId = customerSnap.id || bookingSnap.customerId;
  if (!customerId) return null;
  return db.selectFrom("customers").selectAll().where("id", "=", String(customerId)).executeTakeFirst();
}

export async function executeRun(executionId: string): Promise<void> {
  const exec = await db.selectFrom("automationExecutions").selectAll().where("id", "=", executionId).executeTakeFirst();
  if (!exec || exec.status !== "SCHEDULED") return;
  const ruleRow = await db.selectFrom("automationRules").selectAll().where("id", "=", exec.ruleId).executeTakeFirst();
  if (!ruleRow) {
    await db.updateTable("automationExecutions").set({ status: "FAILED", error: "Rule not found" }).where("id", "=", exec.id).execute();
    return;
  }
  const rule = mapRule(ruleRow);
  const template = rule.templateId
    ? await db.selectFrom("messageTemplates").selectAll().where("id", "=", rule.templateId).executeTakeFirst()
    : undefined;
  const details = jparse<Record<string, unknown>>(exec.details, {});
  const actionConfig = rule.actionConfig;

  try {
    let result: unknown = null;
    const vars = await buildVars(details);

    switch (rule.action) {
      case "SEND_EMAIL":
      case "SEND_WHATSAPP":
      case "SEND_INSTAGRAM": {
        const channel: Channel = rule.action === "SEND_EMAIL" ? "EMAIL" : rule.action === "SEND_WHATSAPP" ? "WHATSAPP" : "INSTAGRAM";
        const recipient = await resolveRecipient(details);
        if (!recipient) {
          // e.g. session-level SESSION_STARTING_SOON has no single customer — skip quietly.
          await db
            .updateTable("automationExecutions")
            .set({ status: "SKIPPED", details: jstr({ ...details, reason: "No recipient customer in trigger context" }) })
            .where("id", "=", exec.id)
            .execute();
          return;
        }
        const templateBody = template?.body || String(actionConfig.message || "");
        if (!templateBody) throw new Error("No template/message configured for this rule");
        const text = renderTemplate(templateBody, vars);
        const subject = template?.subject ? renderTemplate(template.subject, vars) : `Message from StudioFlow`;
        const res = await sendViaChannel(channel, recipient, text, subject);
        if (!res.ok) throw new Error(res.error || "send failed");
        result = { channel, mocked: res.mocked, externalId: res.externalId };
        const convo = await db
          .selectFrom("conversations")
          .selectAll()
          .where("customerId", "=", recipient.id)
          .where("channel", "=", channel)
          .orderBy("lastMessageAt", "desc")
          .executeTakeFirst();
        if (convo) {
          await db
            .insertInto("messages")
            .values({
              id: uuid(),
              conversationId: convo.id,
              direction: "OUT",
              channel,
              senderType: "SYSTEM",
              senderName: `Automation: ${rule.name}`,
              body: text,
              externalId: res.externalId || null,
              createdAt: nowIso(),
            })
            .execute();
        }
        break;
      }
      case "CREATE_FOLLOWUP": {
        const recipient = await resolveRecipient(details);
        if (!recipient) throw new Error("No customer found for follow-up action");
        const snap = (details.snapshot as Record<string, unknown>) || {};
        const bookingSnap = snap.booking as { id?: string } | undefined;
        const convoSnap = snap.conversation as { id?: string } | undefined;
        const dueInHours = Number(actionConfig.dueInHours ?? 24);
        const now = nowIso();
        const fu = await db
          .insertInto("followUps")
          .values({
            id: uuid(),
            customerId: recipient.id,
            bookingId: bookingSnap?.id ? String(bookingSnap.id) : null,
            conversationId: convoSnap?.id ? String(convoSnap.id) : null,
            reason: String(actionConfig.reason || `Automated follow-up (${rule.name})`),
            channel: String(actionConfig.channel || "WHATSAPP"),
            dueAt: new Date(Date.now() + dueInHours * 3600_000).toISOString(),
            status: "PENDING",
            notes: `Created by automation rule: ${rule.name}`,
            createdAt: now,
            updatedAt: now,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        result = { followUpId: fu.id };
        break;
      }
      case "UPDATE_BOOKING": {
        const snap = (details.snapshot as Record<string, unknown>) || {};
        const bookingSnap = snap.booking as { id?: string } | undefined;
        if (!bookingSnap?.id) throw new Error("No booking in context for UPDATE_BOOKING");
        const patch: Record<string, unknown> = { updatedAt: nowIso() };
        if (actionConfig.status) patch.status = String(actionConfig.status);
        if (actionConfig.paymentStatus) patch.paymentStatus = String(actionConfig.paymentStatus);
        if (Object.keys(patch).length <= 1) throw new Error("UPDATE_BOOKING has no fields configured");
        await db.updateTable("bookings").set(patch as never).where("id", "=", String(bookingSnap.id)).execute();
        result = { updated: patch };
        break;
      }
      case "UPDATE_CUSTOMER": {
        const recipient = await resolveRecipient(details);
        if (!recipient) {
          await db
            .updateTable("automationExecutions")
            .set({ status: "SKIPPED", details: jstr({ ...details, reason: "No customer in trigger context" }) })
            .where("id", "=", exec.id)
            .execute();
          return;
        }
        const patch: Record<string, unknown> = { updatedAt: nowIso() };
        if (actionConfig.status) patch.status = String(actionConfig.status);
        if (actionConfig.tags) {
          const tags = new Set([...jparse<string[]>(recipient.tags, []), ...String(actionConfig.tags).split(",").map((t) => t.trim()).filter(Boolean)]);
          patch.tags = jstr([...tags]);
        }
        if (Object.keys(patch).length <= 1) throw new Error("UPDATE_CUSTOMER has no fields configured");
        await db.updateTable("customers").set(patch as never).where("id", "=", recipient.id).execute();
        result = { updated: patch };
        break;
      }
      case "SEND_WEBHOOK": {
        const url = String(actionConfig.url || "");
        if (!url) {
          await forwardToN8n(`RULE:${rule.name}`, exec.triggerEntity, exec.triggerEntityId, details);
          result = { forwarded: "default-n8n-url" };
        } else {
          await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rule: rule.name, trigger: details.trigger, details, at: new Date().toISOString() }),
          });
          result = { url };
        }
        break;
      }
      case "NOTIFY_STAFF": {
        await notifyStaff({
          type: "AUTOMATION",
          title: String(actionConfig.title || `Automation: ${rule.name}`),
          body: String(actionConfig.body || `Rule fired for ${exec.triggerEntity} ${exec.triggerEntityId}`),
          entityType: exec.triggerEntity,
          entityId: exec.triggerEntityId,
        });
        result = { notified: true };
        break;
      }
      default:
        throw new Error(`Unknown action ${rule.action}`);
    }

    await db
      .updateTable("automationExecutions")
      .set({ status: "SUCCESS", details: jstr({ ...details, result }) })
      .where("id", "=", exec.id)
      .execute();
    await db.updateTable("automationRules").set({ lastRunAt: nowIso() }).where("id", "=", rule.id).execute();
    await audit(undefined, "AUTOMATION_EXECUTED", "AutomationRule", rule.id, undefined, { executionId: exec.id, result });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.updateTable("automationExecutions").set({ status: "FAILED", error }).where("id", "=", exec.id).execute();
    await notifyStaff({
      type: "AUTOMATION_FAILED",
      title: `Automation failed: ${rule.name}`,
      body: error,
      entityType: "AutomationRule",
      entityId: rule.id,
    });
  }
}
