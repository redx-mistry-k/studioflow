// Shared inbox helpers: find-or-create customer + conversation,
// store incoming/outgoing messages, staff notifications.
import { db, uuid, nowIso, jstr } from "../db";
import { mapCustomer } from "../db/map";
import { contains } from "../db/queries";
import { notifyStaff } from "./notifications";
import { fireTrigger } from "./automation";

export type InboundChannel = "WHATSAPP" | "INSTAGRAM" | "EMAIL" | "WEBSITE" | "MANUAL";

function normalizePhone(p?: string | null): string | null {
  if (!p) return null;
  const d = p.replace(/\D/g, "");
  return d ? d.slice(-12) : null;
}

export async function findOrCreateCustomer(input: {
  firstName: string;
  lastName?: string;
  phone?: string | null;
  whatsappNumber?: string | null;
  email?: string | null;
  instagramHandle?: string | null;
  instagramId?: string | null;
  source: string;
}) {
  const phone = normalizePhone(input.phone);
  const wa = normalizePhone(input.whatsappNumber) || phone;
  const email = input.email?.trim().toLowerCase() || null;

  // Duplicate detection across identifiers
  const hasIds = phone || wa || email || input.instagramHandle || input.instagramId;
  if (hasIds) {
    const existing = await db
      .selectFrom("customers")
      .selectAll()
      .where((eb) => {
        const ors = [];
        if (phone) {
          const tail = phone.slice(-10);
          ors.push(contains(eb, "phone", tail), contains(eb, "whatsappNumber", tail));
        }
        if (wa && wa !== phone) ors.push(contains(eb, "whatsappNumber", wa.slice(-10)));
        if (email) ors.push(eb("email", "=", email));
        if (input.instagramHandle) ors.push(eb("instagramHandle", "=", input.instagramHandle));
        if (input.instagramId) ors.push(eb("instagramId", "=", input.instagramId));
        return eb.or(ors);
      })
      .executeTakeFirst();
    if (existing) {
      const patch: Record<string, unknown> = {};
      if (!existing.phone && phone) patch.phone = input.phone;
      if (!existing.whatsappNumber && wa) patch.whatsappNumber = input.whatsappNumber || input.phone;
      if (!existing.email && email) patch.email = email;
      if (!existing.instagramHandle && input.instagramHandle) patch.instagramHandle = input.instagramHandle;
      if (!existing.instagramId && input.instagramId) patch.instagramId = input.instagramId;
      if (Object.keys(patch).length) {
        const updated = await db
          .updateTable("customers")
          .set({ ...patch, updatedAt: nowIso() } as never)
          .where("id", "=", existing.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        return mapCustomer(updated);
      }
      return mapCustomer(existing);
    }
  }

  const now = nowIso();
  const created = await db
    .insertInto("customers")
    .values({
      id: uuid(),
      firstName: input.firstName,
      lastName: input.lastName || "",
      phone: input.phone || null,
      whatsappNumber: input.whatsappNumber || input.phone || null,
      email,
      instagramHandle: input.instagramHandle || null,
      instagramId: input.instagramId || null,
      source: input.source,
      status: "ACTIVE",
      tags: jstr([]),
      createdAt: now,
      updatedAt: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const mapped = mapCustomer(created);
  await fireTrigger("CUSTOMER_CREATED", "Customer", mapped.id, { customer: mapped });
  return mapped;
}

export async function findOrCreateConversation(customerId: string, channel: InboundChannel, externalId?: string) {
  if (externalId) {
    const byExt = await db
      .selectFrom("conversations")
      .selectAll()
      .where("externalId", "=", externalId)
      .where("channel", "=", channel)
      .executeTakeFirst();
    if (byExt) return byExt;
  }
  const open = await db
    .selectFrom("conversations")
    .selectAll()
    .where("customerId", "=", customerId)
    .where("channel", "=", channel)
    .where("status", "!=", "RESOLVED")
    .orderBy("lastMessageAt", "desc")
    .executeTakeFirst();
  if (open) return open;
  const now = nowIso();
  return db
    .insertInto("conversations")
    .values({
      id: uuid(),
      customerId,
      channel,
      status: "NEW",
      externalId: externalId || null,
      lastMessageAt: now,
      unreadCount: 0,
      tags: jstr([]),
      createdAt: now,
      updatedAt: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** Full incoming-message flow used by webhooks + simulators. */
export async function handleIncomingMessage(input: {
  channel: InboundChannel;
  externalId?: string;
  senderName: string;
  phone?: string | null;
  whatsappNumber?: string | null;
  email?: string | null;
  instagramHandle?: string | null;
  instagramId?: string | null;
  body: string;
  subject?: string;
  externalMessageId?: string;
}) {
  const nameParts = input.senderName.trim().split(/\s+/);
  const customer = await findOrCreateCustomer({
    firstName: nameParts[0] || "Unknown",
    lastName: nameParts.slice(1).join(" "),
    phone: input.phone,
    whatsappNumber: input.whatsappNumber,
    email: input.email,
    instagramHandle: input.instagramHandle,
    instagramId: input.instagramId,
    source: input.channel,
  });

  const conversation = await findOrCreateConversation(customer.id, input.channel, input.externalId);
  const now = nowIso();

  const message = await db
    .insertInto("messages")
    .values({
      id: uuid(),
      conversationId: conversation.id,
      direction: "IN",
      channel: input.channel,
      senderType: "CUSTOMER",
      senderName: input.senderName,
      body: input.body,
      externalId: input.externalMessageId || null,
      createdAt: now,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  await db
    .updateTable("conversations")
    .set((eb) => ({
      status: conversation.status === "RESOLVED" ? "NEW" : conversation.status === "NEW" ? "NEW" : "OPEN",
      lastMessageAt: now,
      unreadCount: eb("unreadCount", "+", 1),
      updatedAt: now,
      ...(input.subject ? { subject: input.subject } : {}),
    }))
    .where("id", "=", conversation.id)
    .execute();

  await notifyStaff({
    type: "NEW_MESSAGE",
    title: `New ${input.channel.toLowerCase()} message`,
    body: `${input.senderName}: ${input.body.slice(0, 120)}`,
    entityType: "Conversation",
    entityId: conversation.id,
  });

  await fireTrigger("ENQUIRY_RECEIVED", "Conversation", conversation.id, {
    customer,
    conversation,
    message,
  });

  return { customer, conversation, message };
}
