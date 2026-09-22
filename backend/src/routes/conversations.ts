import { Router } from "express";
import { z } from "zod";
import { db, uuid, nowIso, jstr, num } from "../db";
import { mapConversation, mapMessage, mapCustomer, mapSession, mapWorkshop, mapBooking } from "../db/map";
import { contains, countRows } from "../db/queries";
import { asyncHandler, validate, pagination, paged, ApiError } from "../utils/http";
import { requireAuth } from "../middleware/auth";
import { audit } from "../services/audit";
import { sendViaChannel, Channel } from "../services/messaging";
import { handleIncomingMessage } from "../services/inbox";

const router = Router();
router.use(requireAuth);

// GET /api/conversations — list with filters
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pagination(req);
    const filter = String(req.query.filter || "ALL");
    const q = String(req.query.q || "").trim();
    const assignedTo = String(req.query.assignedTo || "");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let base: any = db.selectFrom("conversations as c").selectAll("c");
    if (["WHATSAPP", "INSTAGRAM", "EMAIL", "WEBSITE", "MANUAL"].includes(filter)) base = base.where("c.channel", "=", filter);
    else if (filter === "UNREAD") base = base.where("c.unreadCount", ">", 0);
    else if (filter === "AWAITING_REPLY") base = base.where("c.status", "in", ["NEW", "OPEN"]);
    else if (filter === "FOLLOW_UP") base = base.where("c.status", "=", "FOLLOW_UP");
    else if (filter === "RESOLVED") base = base.where("c.status", "=", "RESOLVED");
    if (assignedTo) base = base.where("c.assignedToId", "=", assignedTo);
    if (q) {
      base = base
        .innerJoin("customers as cu", "cu.id", "c.customerId")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .where((eb: any) =>
          eb.or([contains(eb, "cu.firstName", q), contains(eb, "cu.lastName", q), contains(eb, "cu.phone", q), contains(eb, "cu.email", q)])
        );
    }
    const totalRow = await base
      .clearSelect()
      .clearOrderBy()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select((eb: any) => eb.fn.countAll().as("count"))
      .executeTakeFirst();
    const rows = await base.clearSelect().selectAll("c").orderBy("c.lastMessageAt", "desc").limit(limit).offset(skip).execute();

    const data = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rows.map(async (cv: any) => {
        const customer = await db
          .selectFrom("customers")
          .select(["id", "firstName", "lastName", "phone"])
          .where("id", "=", cv.customerId)
          .executeTakeFirst();
        const assignee = cv.assignedToId
          ? await db.selectFrom("users").select(["id", "name"]).where("id", "=", cv.assignedToId).executeTakeFirst()
          : null;
        const last = await db
          .selectFrom("messages")
          .selectAll()
          .where("conversationId", "=", cv.id)
          .orderBy("createdAt", "desc")
          .limit(1)
          .execute();
        return { ...mapConversation(cv), customer: customer ?? null, assignedTo: assignee ?? null, messages: last.map(mapMessage) };
      })
    );
    res.json(paged(data, countRows(totalRow), page, limit));
  })
);

// GET /api/conversations/:id — thread + customer panel data
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const cv = await db.selectFrom("conversations").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!cv) throw new ApiError(404, "Conversation not found");
    const customer = await db.selectFrom("customers").selectAll().where("id", "=", cv.customerId).executeTakeFirst();
    if (!customer) throw new ApiError(404, "Customer not found");
    const assignee = cv.assignedToId
      ? await db.selectFrom("users").select(["id", "name"]).where("id", "=", cv.assignedToId).executeTakeFirst()
      : null;
    const msgs = await db
      .selectFrom("messages")
      .selectAll()
      .where("conversationId", "=", cv.id)
      .orderBy("createdAt", "asc")
      .limit(500)
      .execute();
    const bookingRows = await db
      .selectFrom("bookings")
      .selectAll()
      .where("customerId", "=", customer.id)
      .orderBy("createdAt", "desc")
      .limit(10)
      .execute();
    const bookings = await Promise.all(
      bookingRows.map(async (b) => {
        const s = await db.selectFrom("sessions").selectAll().where("id", "=", b.sessionId).executeTakeFirst();
        const w = s ? await db.selectFrom("workshops").selectAll().where("id", "=", s.workshopId).executeTakeFirst() : null;
        return { ...mapBooking(b), session: s ? { ...mapSession(s), workshop: w ? mapWorkshop(w) : null } : null };
      })
    );
    const spendRow = await db
      .selectFrom("bookings")
      .select((eb) => eb.fn.sum("amountPaid").as("paid"))
      .where("customerId", "=", customer.id)
      .executeTakeFirst();
    const upcomingRows = await db
      .selectFrom("bookings")
      .selectAll()
      .where("customerId", "=", customer.id)
      .where("status", "in", ["PENDING", "CONFIRMED"])
      .orderBy("createdAt", "desc")
      .limit(5)
      .execute();
    const upcomingBookings = await Promise.all(
      upcomingRows.map(async (b) => {
        const s = await db.selectFrom("sessions").selectAll().where("id", "=", b.sessionId).executeTakeFirst();
        const w = s ? await db.selectFrom("workshops").selectAll().where("id", "=", s.workshopId).executeTakeFirst() : null;
        return { ...mapBooking(b), session: s ? { ...mapSession(s), workshop: w ? mapWorkshop(w) : null } : null };
      })
    );
    res.json({
      conversation: {
        ...mapConversation(cv),
        customer: { ...mapCustomer(customer), bookings },
        assignedTo: assignee ?? null,
        messages: msgs.map(mapMessage),
      },
      totalSpent: num(spendRow?.paid),
      upcomingBookings,
    });
  })
);

// PATCH /api/conversations/:id
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const schema = z.object({
      status: z.string().optional(),
      assignedToId: z.string().nullable().optional(),
      tags: z.array(z.string()).optional(),
      markRead: z.boolean().optional(),
    });
    const body = validate(schema, req.body);
    const existing = await db.selectFrom("conversations").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!existing) throw new ApiError(404, "Conversation not found");
    const patch: Record<string, unknown> = { updatedAt: nowIso() };
    if (body.status) patch.status = body.status;
    if (body.assignedToId !== undefined) patch.assignedToId = body.assignedToId;
    if (body.tags) patch.tags = jstr(body.tags);
    if (body.markRead) patch.unreadCount = 0;
    const updated = await db
      .updateTable("conversations")
      .set(patch as never)
      .where("id", "=", req.params.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    await audit(req.user!.sub, "CONVERSATION_UPDATED", "Conversation", updated.id, { status: existing.status }, body);
    res.json(mapConversation(updated));
  })
);

// POST /api/conversations/:id/messages — staff reply
router.post(
  "/:id/messages",
  asyncHandler(async (req, res) => {
    const schema = z.object({ body: z.string().min(1).max(4000) });
    const { body } = validate(schema, req.body);
    const convo = await db.selectFrom("conversations").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!convo) throw new ApiError(404, "Conversation not found");
    const customer = await db.selectFrom("customers").selectAll().where("id", "=", convo.customerId).executeTakeFirst();
    if (!customer) throw new ApiError(404, "Customer not found");

    const result = await sendViaChannel(convo.channel as Channel, customer, body);
    if (!result.ok) throw new ApiError(502, `Failed to send via ${convo.channel}: ${result.error}`);

    const now = nowIso();
    const message = await db
      .insertInto("messages")
      .values({
        id: uuid(),
        conversationId: convo.id,
        direction: "OUT",
        channel: convo.channel,
        senderType: "STAFF",
        senderName: req.user!.name,
        body,
        externalId: result.externalId || null,
        status: result.mocked ? "MOCKED" : "SENT",
        createdAt: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await db
      .updateTable("conversations")
      .set({ lastMessageAt: now, status: "AWAITING_CUSTOMER", unreadCount: 0, updatedAt: now })
      .where("id", "=", convo.id)
      .execute();
    await audit(req.user!.sub, "MESSAGE_SENT", "Conversation", convo.id, undefined, { body: body.slice(0, 200), mocked: result.mocked });
    res.status(201).json({ message: mapMessage(message), mocked: result.mocked });
  })
);

// POST /api/conversations/:id/notes — internal note
router.post(
  "/:id/notes",
  asyncHandler(async (req, res) => {
    const schema = z.object({ body: z.string().min(1).max(4000) });
    const { body } = validate(schema, req.body);
    const convo = await db.selectFrom("conversations").select("id").where("id", "=", req.params.id).executeTakeFirst();
    if (!convo) throw new ApiError(404, "Conversation not found");
    const note = await db
      .insertInto("messages")
      .values({
        id: uuid(),
        conversationId: convo.id,
        direction: "OUT",
        channel: "MANUAL",
        senderType: "STAFF",
        senderName: req.user!.name,
        body,
        isNote: true,
        createdAt: nowIso(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    res.status(201).json(mapMessage(note));
  })
);

// POST /api/conversations — start a manual conversation
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const schema = z.object({
      customerId: z.string().min(1),
      channel: z.string().default("MANUAL"),
      subject: z.string().optional(),
      message: z.string().optional(),
    });
    const body = validate(schema, req.body);
    const customer = await db.selectFrom("customers").select("id").where("id", "=", body.customerId).executeTakeFirst();
    if (!customer) throw new ApiError(404, "Customer not found");
    const now = nowIso();
    const convo = await db
      .insertInto("conversations")
      .values({
        id: uuid(),
        customerId: customer.id,
        channel: body.channel,
        subject: body.subject || null,
        status: "OPEN",
        lastMessageAt: now,
        unreadCount: 0,
        tags: jstr([]),
        createdAt: now,
        updatedAt: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    if (body.message) {
      await db
        .insertInto("messages")
        .values({
          id: uuid(),
          conversationId: convo.id,
          direction: "OUT",
          channel: convo.channel,
          senderType: "STAFF",
          senderName: req.user!.name,
          body: body.message,
          createdAt: now,
        })
        .execute();
    }
    res.status(201).json(mapConversation(convo));
  })
);

// POST /api/conversations/simulate-incoming — DEV: simulate inbound message
router.post(
  "/simulate-incoming",
  asyncHandler(async (req, res) => {
    const schema = z.object({
      channel: z.enum(["WHATSAPP", "INSTAGRAM", "EMAIL", "WEBSITE"]).default("WHATSAPP"),
      customerId: z.string().optional(),
      senderName: z.string().optional(),
      body: z.string().min(1),
    });
    const body = validate(schema, req.body);
    let senderName = body.senderName || "Demo Customer";
    let phone: string | null = null;
    let email: string | null = null;
    let instagramHandle: string | null = null;
    if (body.customerId) {
      const c = await db.selectFrom("customers").selectAll().where("id", "=", body.customerId).executeTakeFirst();
      if (!c) throw new ApiError(404, "Customer not found");
      senderName = `${c.firstName} ${c.lastName}`.trim();
      phone = c.phone || c.whatsappNumber;
      email = c.email;
      instagramHandle = c.instagramHandle;
    } else {
      phone = `+91${Math.floor(7000000000 + Math.random() * 99999999)}`;
    }
    const result = await handleIncomingMessage({ channel: body.channel, senderName, phone, email, instagramHandle, body: body.body });
    res.status(201).json(result);
  })
);

export default router;
