import { Router } from "express";
import { z } from "zod";
import { db, uuid, nowIso, ts } from "../db";
import { mapBooking, mapCustomer, mapSession, mapWorkshop, mapPayment, mapFollowUp, mapConversation, mapMessage, mapAudit } from "../db/map";
import { contains, countRows } from "../db/queries";
import { asyncHandler, validate, pagination, paged, ApiError } from "../utils/http";
import { requireAuth } from "../middleware/auth";
import { audit } from "../services/audit";
import { notifyStaff } from "../services/notifications";
import { fireTrigger } from "../services/automation";
import { sendViaChannel, Channel } from "../services/messaging";
import { renderTemplate, formatDate, formatTime } from "../services/templates";

const router = Router();
router.use(requireAuth);

function bookingCode(): string {
  const d = new Date();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `SF-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}-${rand}`;
}

async function sessionBooked(sessionId: string, excludeBookingId?: string): Promise<number> {
  let q = db
    .selectFrom("bookings")
    .select((eb) => eb.fn.sum("participants").as("total"))
    .where("sessionId", "=", sessionId)
    .where("status", "not in", ["CANCELLED", "NO_SHOW"]);
  if (excludeBookingId) q = q.where("id", "!=", excludeBookingId);
  const row = await q.executeTakeFirst();
  return Number(row?.total ?? 0) || 0;
}

async function bookingContext(bookingId: string) {
  const b = await db.selectFrom("bookings").selectAll().where("id", "=", bookingId).executeTakeFirst();
  if (!b) return null;
  const customer = await db.selectFrom("customers").selectAll().where("id", "=", b.customerId).executeTakeFirst();
  const session = await db.selectFrom("sessions").selectAll().where("id", "=", b.sessionId).executeTakeFirst();
  if (!customer || !session) return null;
  const workshop = await db.selectFrom("workshops").selectAll().where("id", "=", session.workshopId).executeTakeFirst();
  return {
    booking: { ...mapBooking(b), session: { ...mapSession(session), workshop: workshop ? mapWorkshop(workshop) : null } },
    customer: mapCustomer(customer),
    session: mapSession(session),
    workshop: workshop ? mapWorkshop(workshop) : null,
  };
}

const bookingSchema = z.object({
  customerId: z.string().min(1),
  sessionId: z.string().min(1),
  participants: z.number().int().min(1).default(1),
  pricePerPerson: z.number().min(0).optional(),
  discount: z.number().min(0).optional().default(0),
  status: z.string().optional().default("PENDING"),
  source: z.string().optional().default("MANUAL"),
  notes: z.string().optional().nullable(),
});

// GET /api/bookings
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pagination(req);
    const status = String(req.query.status || "");
    const paymentStatus = String(req.query.paymentStatus || "");
    const sessionId = String(req.query.sessionId || "");
    const customerId = String(req.query.customerId || "");
    const from = String(req.query.from || "");
    const to = String(req.query.to || "");
    const q = String(req.query.q || "").trim();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let base: any = db.selectFrom("bookings as b").selectAll("b");
    if (status) base = base.where("b.status", "=", status);
    if (paymentStatus) base = base.where("b.paymentStatus", "=", paymentStatus);
    if (sessionId) base = base.where("b.sessionId", "=", sessionId);
    if (customerId) base = base.where("b.customerId", "=", customerId);
    if (from) base = base.where("b.createdAt", ">=", new Date(from).toISOString());
    if (to) base = base.where("b.createdAt", "<=", new Date(to).toISOString());
    if (q) {
      base = base
        .innerJoin("customers as cu", "cu.id", "b.customerId")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .where((eb: any) =>
          eb.or([contains(eb, "b.bookingCode", q), contains(eb, "cu.firstName", q), contains(eb, "cu.lastName", q), contains(eb, "cu.phone", q)])
        );
    }
    const rows = await base.clearSelect().selectAll("b").orderBy("b.createdAt", "desc").limit(limit).offset(skip).execute();
    let countBase = db.selectFrom("bookings").select((eb) => eb.fn.countAll().as("count"));
    if (status) countBase = countBase.where("status", "=", status);
    if (paymentStatus) countBase = countBase.where("paymentStatus", "=", paymentStatus);
    if (sessionId) countBase = countBase.where("sessionId", "=", sessionId);
    if (customerId) countBase = countBase.where("customerId", "=", customerId);
    const total = countRows(await countBase.executeTakeFirst());

    const data = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rows.map(async (b: any) => {
        const customer = await db
          .selectFrom("customers")
          .select(["id", "firstName", "lastName", "phone"])
          .where("id", "=", b.customerId)
          .executeTakeFirst();
        const session = await db.selectFrom("sessions").selectAll().where("id", "=", b.sessionId).executeTakeFirst();
        const workshop = session
          ? await db.selectFrom("workshops").select(["id", "name"]).where("id", "=", session.workshopId).executeTakeFirst()
          : null;
        return {
          ...mapBooking(b),
          customer: customer ?? null,
          session: session ? { ...mapSession(session), workshop: workshop ?? null } : null,
        };
      })
    );
    res.json(paged(data, total, page, limit));
  })
);

// GET /api/bookings/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const ctx = await bookingContext(req.params.id);
    if (!ctx) throw new ApiError(404, "Booking not found");
    const payRows = await db.selectFrom("payments").selectAll().where("bookingId", "=", req.params.id).orderBy("receivedAt", "desc").execute();
    const fuRows = await db.selectFrom("followUps").selectAll().where("bookingId", "=", req.params.id).orderBy("dueAt", "desc").execute();
    const convoRows = await db
      .selectFrom("conversations")
      .selectAll()
      .where("customerId", "=", ctx.booking.customerId)
      .orderBy("lastMessageAt", "desc")
      .limit(5)
      .execute();
    const conversations = await Promise.all(
      convoRows.map(async (cv) => {
        const msgs = await db
          .selectFrom("messages")
          .selectAll()
          .where("conversationId", "=", cv.id)
          .orderBy("createdAt", "desc")
          .limit(5)
          .execute();
        return { ...mapConversation(cv), messages: msgs.map(mapMessage) };
      })
    );
    const auditRows = await db
      .selectFrom("auditLogs")
      .selectAll()
      .where("entityType", "=", "Booking")
      .where("entityId", "=", req.params.id)
      .orderBy("createdAt", "desc")
      .limit(30)
      .execute();
    const activity = await Promise.all(
      auditRows.map(async (a) => {
        const u = a.userId ? await db.selectFrom("users").select("name").where("id", "=", a.userId).executeTakeFirst() : null;
        return { ...mapAudit(a), user: u ?? null };
      })
    );
    res.json({
      booking: { ...ctx.booking, customer: ctx.customer, payments: payRows.map(mapPayment), followUps: fuRows.map(mapFollowUp) },
      conversations,
      activity,
      balance: ctx.booking.totalAmount - ctx.booking.amountPaid,
    });
  })
);

// POST /api/bookings
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = validate(bookingSchema, req.body);
    const customer = await db.selectFrom("customers").selectAll().where("id", "=", body.customerId).executeTakeFirst();
    if (!customer) throw new ApiError(404, "Customer not found");
    const session = await db.selectFrom("sessions").selectAll().where("id", "=", body.sessionId).executeTakeFirst();
    if (!session) throw new ApiError(404, "Session not found");
    if (["CANCELLED", "COMPLETED"].includes(session.status)) throw new ApiError(400, `Cannot book a ${session.status.toLowerCase()} session`);

    const booked = await sessionBooked(session.id);
    if (booked + body.participants > session.capacity) {
      throw new ApiError(400, `Only ${session.capacity - booked} seat(s) left in this session`);
    }
    const pricePerPerson = body.pricePerPerson ?? session.price;
    const totalAmount = Math.max(0, pricePerPerson * body.participants - (body.discount || 0));
    const now = nowIso();
    const created = await db
      .insertInto("bookings")
      .values({
        id: uuid(),
        bookingCode: bookingCode(),
        customerId: customer.id,
        sessionId: session.id,
        participants: body.participants,
        pricePerPerson,
        discount: body.discount || 0,
        totalAmount,
        amountPaid: 0,
        paymentStatus: "UNPAID",
        status: body.status || "PENDING",
        source: body.source || "MANUAL",
        notes: body.notes || null,
        createdAt: now,
        updatedAt: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const ctx = await bookingContext(created.id);
    await audit(req.user!.sub, "BOOKING_CREATED", "Booking", created.id, undefined, mapBooking(created));
    await notifyStaff({
      type: "NEW_BOOKING",
      title: "New booking",
      body: `${created.bookingCode} — ${customer.firstName} for session`,
      entityType: "Booking",
      entityId: created.id,
    });
    if (ctx) await fireTrigger("BOOKING_CREATED", "Booking", created.id, ctx);
    res.status(201).json(ctx ? { ...ctx.booking, customer: ctx.customer } : mapBooking(created));
  })
);

// PUT /api/bookings/:id
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const schema = bookingSchema.partial().extend({ sessionId: z.string().optional() });
    const body = validate(schema, req.body);
    const existing = await db.selectFrom("bookings").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!existing) throw new ApiError(404, "Booking not found");
    const targetSessionId = body.sessionId || existing.sessionId;
    const targetSession = await db.selectFrom("sessions").selectAll().where("id", "=", targetSessionId).executeTakeFirst();
    if (!targetSession) throw new ApiError(404, "Session not found");
    const participants = body.participants ?? existing.participants;
    const booked = await sessionBooked(targetSessionId, existing.id);
    if (booked + participants > targetSession.capacity) {
      throw new ApiError(400, `Only ${targetSession.capacity - booked} seat(s) left in this session`);
    }
    const pricePerPerson = body.pricePerPerson ?? existing.pricePerPerson;
    const discount = body.discount ?? existing.discount;
    const patch: Record<string, unknown> = {
      updatedAt: nowIso(),
      totalAmount: Math.max(0, pricePerPerson * participants - discount),
    };
    if (body.sessionId) patch.sessionId = body.sessionId;
    if (body.participants !== undefined) patch.participants = body.participants;
    if (body.pricePerPerson !== undefined) patch.pricePerPerson = body.pricePerPerson;
    if (body.discount !== undefined) patch.discount = body.discount;
    if (body.status) patch.status = body.status;
    if (body.source) patch.source = body.source;
    if (body.notes !== undefined) patch.notes = body.notes;
    let updated = await db
      .updateTable("bookings")
      .set(patch as never)
      .where("id", "=", req.params.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    const paymentStatus =
      updated.amountPaid <= 0 ? "UNPAID" : updated.amountPaid >= updated.totalAmount ? "PAID" : "PARTIALLY_PAID";
    if (paymentStatus !== updated.paymentStatus && updated.paymentStatus !== "REFUNDED") {
      updated = await db
        .updateTable("bookings")
        .set({ paymentStatus, updatedAt: nowIso() })
        .where("id", "=", updated.id)
        .returningAll()
        .executeTakeFirstOrThrow();
    }
    await audit(req.user!.sub, "BOOKING_UPDATED", "Booking", updated.id, mapBooking(existing), mapBooking(updated));
    res.json(mapBooking(updated));
  })
);

// POST /api/bookings/:id/confirm
router.post(
  "/:id/confirm",
  asyncHandler(async (req, res) => {
    const b = await db.selectFrom("bookings").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!b) throw new ApiError(404, "Booking not found");
    if (!["PENDING", "ENQUIRY"].includes(b.status)) throw new ApiError(400, `Only pending bookings can be confirmed (current: ${b.status})`);
    await db.updateTable("bookings").set({ status: "CONFIRMED", updatedAt: nowIso() }).where("id", "=", b.id).execute();
    const ctx = await bookingContext(b.id);
    await audit(req.user!.sub, "BOOKING_CONFIRMED", "Booking", b.id, { status: b.status }, { status: "CONFIRMED" });
    if (ctx) await fireTrigger("BOOKING_CONFIRMED", "Booking", b.id, ctx);
    res.json(ctx?.booking ?? mapBooking({ ...b, status: "CONFIRMED" }));
  })
);

// POST /api/bookings/:id/cancel
router.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const schema = z.object({ reason: z.string().optional() });
    const { reason } = validate(schema, req.body ?? {});
    const b = await db.selectFrom("bookings").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!b) throw new ApiError(404, "Booking not found");
    if (["CANCELLED", "COMPLETED"].includes(b.status)) throw new ApiError(400, `Booking is already ${b.status.toLowerCase()}`);
    await db
      .updateTable("bookings")
      .set({ status: "CANCELLED", notes: reason ? `${b.notes ? b.notes + "\n" : ""}Cancelled: ${reason}` : b.notes, updatedAt: nowIso() })
      .where("id", "=", b.id)
      .execute();
    const ctx = await bookingContext(b.id);
    await audit(req.user!.sub, "BOOKING_CANCELLED", "Booking", b.id, { status: b.status }, { status: "CANCELLED", reason });
    if (ctx) await fireTrigger("BOOKING_CANCELLED", "Booking", b.id, ctx);
    res.json(ctx?.booking ?? null);
  })
);

// POST /api/bookings/:id/complete
router.post(
  "/:id/complete",
  asyncHandler(async (req, res) => {
    const b = await db.selectFrom("bookings").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!b) throw new ApiError(404, "Booking not found");
    const updated = await db
      .updateTable("bookings")
      .set({ status: "COMPLETED", updatedAt: nowIso() })
      .where("id", "=", b.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    await audit(req.user!.sub, "BOOKING_COMPLETED", "Booking", b.id, { status: b.status }, { status: "COMPLETED" });
    res.json(mapBooking(updated));
  })
);

// POST /api/bookings/:id/no-show
router.post(
  "/:id/no-show",
  asyncHandler(async (req, res) => {
    const b = await db.selectFrom("bookings").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!b) throw new ApiError(404, "Booking not found");
    const updated = await db
      .updateTable("bookings")
      .set({ status: "NO_SHOW", updatedAt: nowIso() })
      .where("id", "=", b.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    await audit(req.user!.sub, "BOOKING_NO_SHOW", "Booking", b.id, { status: b.status }, { status: "NO_SHOW" });
    res.json(mapBooking(updated));
  })
);

// POST /api/bookings/:id/send — confirmation or reminder via template
router.post(
  "/:id/send",
  asyncHandler(async (req, res) => {
    const schema = z.object({
      kind: z.enum(["confirmation", "reminder"]),
      channel: z.enum(["WHATSAPP", "INSTAGRAM", "EMAIL"]).default("WHATSAPP"),
      templateId: z.string().optional(),
    });
    const { kind, channel, templateId } = validate(schema, req.body);
    const ctx = await bookingContext(req.params.id);
    if (!ctx) throw new ApiError(404, "Booking not found");
    let template = templateId
      ? await db.selectFrom("messageTemplates").selectAll().where("id", "=", templateId).executeTakeFirst()
      : undefined;
    if (!template) {
      template = await db
        .selectFrom("messageTemplates")
        .selectAll()
        .where("category", "=", kind === "confirmation" ? "BOOKING_CONFIRMATION" : "CLASS_REMINDER")
        .where("active", "=", true)
        .executeTakeFirst();
    }
    const fallback =
      kind === "confirmation"
        ? "Hi {{customer_name}}, your booking for {{class_name}} is confirmed. Date: {{date}}, Time: {{time}}, Location: {{location}}. Booking ID: {{booking_id}}. See you soon!"
        : "Hi {{customer_name}}, reminder: {{class_name}} is on {{date}} at {{time}}, {{location}}. Booking ID: {{booking_id}}. Reply if you need to reschedule.";
    const text = renderTemplate(template?.body || fallback, {
      customer_name: `${ctx.customer.firstName} ${ctx.customer.lastName}`.trim(),
      class_name: ctx.workshop?.name || "class",
      date: formatDate(ctx.session.startsAt),
      time: formatTime(ctx.session.startsAt),
      amount: ctx.booking.totalAmount,
      location: ctx.session.location || ctx.workshop?.location || "",
      booking_id: ctx.booking.bookingCode,
    });
    const customer = await db.selectFrom("customers").selectAll().where("id", "=", ctx.booking.customerId).executeTakeFirst();
    const result = await sendViaChannel(
      channel as Channel,
      { phone: customer?.phone, whatsappNumber: customer?.whatsappNumber, email: customer?.email, instagramId: customer?.instagramId },
      text,
      kind === "confirmation" ? "Booking confirmed" : "Class reminder"
    );
    if (!result.ok) throw new ApiError(502, `Send failed: ${result.error}`);
    await audit(req.user!.sub, kind === "confirmation" ? "BOOKING_CONFIRMATION_SENT" : "BOOKING_REMINDER_SENT", "Booking", ctx.booking.id, undefined, { channel, mocked: result.mocked });
    res.json({ ok: true, mocked: result.mocked, text });
  })
);

export default router;
