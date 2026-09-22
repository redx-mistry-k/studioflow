// Lightweight in-process scheduler (no Redis needed for a single business).
// - Runs due automation executions every 30s
// - Fires time-based triggers (SESSION_STARTING_SOON, PAYMENT_PENDING,
//   NO_CUSTOMER_RESPONSE, SESSION_COMPLETED) every 5 minutes
import { db, nowIso } from "../db";
import { mapCustomer, mapSession, mapWorkshop, mapBooking } from "../db/map";
import { executeRun, fireTrigger } from "./automation";
import { notifyStaff } from "./notifications";

let started = false;

async function runDueExecutions() {
  try {
    const due = await db
      .selectFrom("automationExecutions")
      .selectAll()
      .where("status", "=", "SCHEDULED")
      .where("runAt", "<=", new Date().toISOString())
      .orderBy("runAt", "asc")
      .limit(50)
      .execute();
    for (const d of due) await executeRun(d.id);
  } catch (e) {
    console.error("scheduler: runDueExecutions failed", e);
  }
}

async function bookingContext(bookingId: string) {
  const b = await db.selectFrom("bookings").selectAll().where("id", "=", bookingId).executeTakeFirst();
  if (!b) return null;
  const customer = await db.selectFrom("customers").selectAll().where("id", "=", b.customerId).executeTakeFirst();
  const session = await db.selectFrom("sessions").selectAll().where("id", "=", b.sessionId).executeTakeFirst();
  if (!customer || !session) return null;
  const workshop = await db.selectFrom("workshops").selectAll().where("id", "=", session.workshopId).executeTakeFirst();
  const booking = { ...mapBooking(b), session: { ...mapSession(session), workshop: workshop ? mapWorkshop(workshop) : null } };
  return { booking, customer: mapCustomer(customer), session: mapSession(session), workshop: workshop ? mapWorkshop(workshop) : null };
}

async function timeBasedTriggers() {
  try {
    const now = new Date();
    const nowIsoStr = now.toISOString();
    const soon = new Date(now.getTime() + 24 * 3600_000).toISOString();

    // SESSION_STARTING_SOON
    const upcoming = await db
      .selectFrom("sessions")
      .selectAll()
      .where("startsAt", ">", nowIsoStr)
      .where("startsAt", "<=", soon)
      .where("status", "in", ["SCHEDULED", "OPEN", "ALMOST_FULL", "FULL"])
      .limit(50)
      .execute();
    for (const s of upcoming) {
      const already = await db
        .selectFrom("automationExecutions as e")
        .innerJoin("automationRules as r", "r.id", "e.ruleId")
        .select("e.id")
        .where("e.triggerEntity", "=", "Session")
        .where("e.triggerEntityId", "=", s.id)
        .where("e.status", "in", ["SCHEDULED", "SUCCESS"])
        .where("r.trigger", "=", "SESSION_STARTING_SOON")
        .executeTakeFirst();
      if (already) continue;
      const workshop = await db.selectFrom("workshops").selectAll().where("id", "=", s.workshopId).executeTakeFirst();
      await fireTrigger("SESSION_STARTING_SOON", "Session", s.id, {
        session: mapSession(s),
        workshop: workshop ? mapWorkshop(workshop) : null,
      });
      const bookings = await db
        .selectFrom("bookings")
        .select("id")
        .where("sessionId", "=", s.id)
        .where("status", "in", ["PENDING", "CONFIRMED"])
        .execute();
      for (const bb of bookings) {
        const ctx = await bookingContext(bb.id);
        if (ctx) await fireTrigger("SESSION_STARTING_SOON", "Booking", bb.id, ctx);
      }
    }

    // SESSION_COMPLETED
    const ended = await db
      .selectFrom("sessions")
      .selectAll()
      .where("endsAt", "<=", nowIsoStr)
      .where("status", "not in", ["COMPLETED", "CANCELLED"])
      .limit(50)
      .execute();
    for (const s of ended) {
      await db.updateTable("sessions").set({ status: "COMPLETED", updatedAt: nowIso() }).where("id", "=", s.id).execute();
      const workshop = await db.selectFrom("workshops").selectAll().where("id", "=", s.workshopId).executeTakeFirst();
      await fireTrigger("SESSION_COMPLETED", "Session", s.id, {
        session: mapSession(s),
        workshop: workshop ? mapWorkshop(workshop) : null,
      });
      const bookings = await db.selectFrom("bookings").select("id").where("sessionId", "=", s.id).where("status", "=", "CONFIRMED").execute();
      for (const bb of bookings) {
        await db.updateTable("bookings").set({ status: "COMPLETED", updatedAt: nowIso() }).where("id", "=", bb.id).execute();
        const ctx = await bookingContext(bb.id);
        if (ctx) await fireTrigger("SESSION_COMPLETED", "Booking", bb.id, ctx);
      }
    }

    // PAYMENT_PENDING
    const sixHoursAgo = new Date(now.getTime() - 6 * 3600_000).toISOString();
    const pending = await db
      .selectFrom("bookings")
      .select("id")
      .where("paymentStatus", "in", ["UNPAID", "PARTIALLY_PAID"])
      .where("status", "in", ["PENDING", "CONFIRMED"])
      .where("createdAt", "<=", sixHoursAgo)
      .limit(50)
      .execute();
    for (const bb of pending) {
      const already = await db
        .selectFrom("automationExecutions as e")
        .innerJoin("automationRules as r", "r.id", "e.ruleId")
        .select("e.id")
        .where("e.triggerEntity", "=", "Booking")
        .where("e.triggerEntityId", "=", bb.id)
        .where("e.status", "in", ["SCHEDULED", "SUCCESS"])
        .where("r.trigger", "=", "PAYMENT_PENDING")
        .executeTakeFirst();
      if (already) continue;
      const ctx = await bookingContext(bb.id);
      if (ctx) await fireTrigger("PAYMENT_PENDING", "Booking", bb.id, ctx);
    }

    // NO_CUSTOMER_RESPONSE
    const dayAgo = new Date(now.getTime() - 24 * 3600_000).toISOString();
    const stale = await db
      .selectFrom("conversations")
      .selectAll()
      .where("status", "in", ["NEW", "OPEN"])
      .where("lastMessageAt", "<=", dayAgo)
      .limit(50)
      .execute();
    for (const c of stale) {
      const lastOut = await db
        .selectFrom("messages")
        .selectAll()
        .where("conversationId", "=", c.id)
        .where("direction", "=", "OUT")
        .where("isNote", "=", false)
        .orderBy("createdAt", "desc")
        .executeTakeFirst();
      const lastIn = await db
        .selectFrom("messages")
        .selectAll()
        .where("conversationId", "=", c.id)
        .where("direction", "=", "IN")
        .orderBy("createdAt", "desc")
        .executeTakeFirst();
      if (!lastIn || String(lastIn.createdAt) > dayAgo) continue;
      if (lastOut && String(lastOut.createdAt) >= String(lastIn.createdAt)) continue;
      const already = await db
        .selectFrom("automationExecutions as e")
        .innerJoin("automationRules as r", "r.id", "e.ruleId")
        .select("e.id")
        .where("e.triggerEntity", "=", "Conversation")
        .where("e.triggerEntityId", "=", c.id)
        .where("e.status", "in", ["SCHEDULED", "SUCCESS"])
        .where("r.trigger", "=", "NO_CUSTOMER_RESPONSE")
        .executeTakeFirst();
      if (already) continue;
      const customer = await db.selectFrom("customers").selectAll().where("id", "=", c.customerId).executeTakeFirst();
      await fireTrigger("NO_CUSTOMER_RESPONSE", "Conversation", c.id, {
        conversation: c,
        customer: customer ? mapCustomer(customer) : null,
      });
    }

    // Mark overdue follow-ups + notify
    const overdue = await db
      .selectFrom("followUps")
      .select("id")
      .where("status", "=", "PENDING")
      .where("dueAt", "<=", nowIsoStr)
      .limit(100)
      .execute();
    for (const f of overdue) {
      await db.updateTable("followUps").set({ status: "OVERDUE", updatedAt: nowIso() }).where("id", "=", f.id).execute();
    }
    if (overdue.length) {
      await notifyStaff({
        type: "FOLLOWUP_OVERDUE",
        title: `${overdue.length} follow-up(s) overdue`,
        body: "Some follow-ups passed their due time.",
      });
    }
  } catch (e) {
    console.error("scheduler: timeBasedTriggers failed", e);
  }
}

export function startScheduler() {
  if (started) return;
  started = true;
  setInterval(runDueExecutions, 30_000);
  setInterval(timeBasedTriggers, 5 * 60_000);
  setTimeout(runDueExecutions, 5_000);
  setTimeout(timeBasedTriggers, 15_000);
  console.log("[scheduler] started (executions every 30s, time triggers every 5m)");
}
