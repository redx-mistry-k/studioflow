import { Router } from "express";
import { z } from "zod";
import { db, uuid, nowIso, num } from "../db";
import { mapWorkshop, mapSession } from "../db/map";
import { asyncHandler, validate, ApiError } from "../utils/http";
import { findOrCreateCustomer, findOrCreateConversation } from "../services/inbox";
import { notifyStaff } from "../services/notifications";
import { fireTrigger } from "../services/automation";
import { getSettings } from "../services/settings";

const router = Router();

// GET /api/public/info
router.get(
  "/info",
  asyncHandler(async (_req, res) => {
    const s = await getSettings();
    res.json({ businessName: s.businessName, logoUrl: s.logoUrl, phone: s.phone, email: s.email, address: s.address, currency: s.currency });
  })
);

// GET /api/public/workshops
router.get(
  "/workshops",
  asyncHandler(async (_req, res) => {
    const data = await db.selectFrom("workshops").selectAll().where("active", "=", true).orderBy("name", "asc").execute();
    res.json(data.map(mapWorkshop));
  })
);

// GET /api/public/sessions?workshopId=
router.get(
  "/sessions",
  asyncHandler(async (req, res) => {
    const workshopId = String(req.query.workshopId || "");
    let base = db.selectFrom("sessions").selectAll().where("startsAt", ">=", new Date().toISOString()).where("status", "in", ["SCHEDULED", "OPEN", "ALMOST_FULL"]);
    if (workshopId) base = base.where("workshopId", "=", workshopId);
    const sessions = await base.orderBy("startsAt", "asc").limit(100).execute();
    const counts = await db
      .selectFrom("bookings")
      .select(["sessionId", (eb) => eb.fn.sum("participants").as("total")])
      .where("sessionId", "in", sessions.map((s) => s.id))
      .where("status", "not in", ["CANCELLED", "NO_SHOW"])
      .groupBy("sessionId")
      .execute();
    const map = new Map(counts.map((c) => [c.sessionId, num(c.total)]));
    const data = await Promise.all(
      sessions.map(async (s) => {
        const w = await db.selectFrom("workshops").select(["id", "name", "color"]).where("id", "=", s.workshopId).executeTakeFirst();
        const booked = map.get(s.id) || 0;
        const mapped = mapSession(s);
        return { ...mapped, workshop: w ?? null, booked, available: Math.max(0, mapped.capacity - booked) };
      })
    );
    res.json(data);
  })
);

// POST /api/public/enquiries
router.post(
  "/enquiries",
  asyncHandler(async (req, res) => {
    const schema = z.object({
      name: z.string().min(1),
      phone: z.string().min(5),
      email: z.string().email().optional().or(z.literal("")),
      workshopId: z.string().optional(),
      preferredDate: z.string().optional(),
      participants: z.number().int().min(1).optional().default(1),
      message: z.string().optional().default(""),
    });
    const body = validate(schema, req.body);
    const parts = body.name.trim().split(/\s+/);
    const customer = await findOrCreateCustomer({
      firstName: parts[0],
      lastName: parts.slice(1).join(" "),
      phone: body.phone,
      email: body.email || null,
      source: "WEBSITE",
    });
    const conversation = await findOrCreateConversation(customer.id, "WEBSITE");
    const workshop = body.workshopId ? await db.selectFrom("workshops").select(["id", "name"]).where("id", "=", body.workshopId).executeTakeFirst() : null;
    const text =
      body.message ||
      `Hi! I'm interested in ${workshop ? workshop.name : "your workshops"}${body.preferredDate ? ` around ${body.preferredDate}` : ""} for ${body.participants || 1} participant(s).`;
    const now = nowIso();
    await db
      .insertInto("messages")
      .values({ id: uuid(), conversationId: conversation.id, direction: "IN", channel: "WEBSITE", senderType: "CUSTOMER", senderName: body.name, body: text, createdAt: now })
      .execute();
    await db
      .updateTable("conversations")
      .set((eb) => ({ lastMessageAt: now, unreadCount: eb("unreadCount", "+", 1), status: "NEW", updatedAt: now }))
      .where("id", "=", conversation.id)
      .execute();
    const enquiry = await db
      .insertInto("enquiries")
      .values({
        id: uuid(),
        customerId: customer.id,
        conversationId: conversation.id,
        name: body.name,
        phone: body.phone,
        email: body.email || null,
        workshopId: body.workshopId || null,
        preferredDate: body.preferredDate || null,
        participants: body.participants || 1,
        message: text,
        source: "WEBSITE",
        status: "NEW",
        createdAt: now,
        updatedAt: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await notifyStaff({ type: "NEW_ENQUIRY", title: "New website enquiry", body: `${body.name}: ${text.slice(0, 120)}`, entityType: "Enquiry", entityId: enquiry.id });
    await fireTrigger("ENQUIRY_RECEIVED", "Enquiry", enquiry.id, { enquiry, customer, conversation });
    res.status(201).json({ ok: true, enquiryId: enquiry.id });
  })
);

// POST /api/public/bookings
router.post(
  "/bookings",
  asyncHandler(async (req, res) => {
    const schema = z.object({
      sessionId: z.string().min(1),
      name: z.string().min(1),
      phone: z.string().min(5),
      email: z.string().email().optional().or(z.literal("")),
      participants: z.number().int().min(1).default(1),
      notes: z.string().optional().default(""),
    });
    const body = validate(schema, req.body);
    const session = await db.selectFrom("sessions").selectAll().where("id", "=", body.sessionId).executeTakeFirst();
    if (!session) throw new ApiError(404, "Session not found");
    if (!["SCHEDULED", "OPEN", "ALMOST_FULL"].includes(session.status)) throw new ApiError(400, "This session is not open for booking");
    const agg = await db
      .selectFrom("bookings")
      .select((eb) => eb.fn.sum("participants").as("total"))
      .where("sessionId", "=", session.id)
      .where("status", "not in", ["CANCELLED", "NO_SHOW"])
      .executeTakeFirst();
    const booked = num(agg?.total);
    if (booked + body.participants > session.capacity) throw new ApiError(400, `Only ${session.capacity - booked} seat(s) left`);
    const parts = body.name.trim().split(/\s+/);
    const customer = await findOrCreateCustomer({
      firstName: parts[0],
      lastName: parts.slice(1).join(" "),
      phone: body.phone,
      email: body.email || null,
      source: "WEBSITE",
    });
    const s = await getSettings();
    const d = new Date();
    const now = nowIso();
    const mappedSession = mapSession(session);
    const booking = await db
      .insertInto("bookings")
      .values({
        id: uuid(),
        bookingCode: `SF-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`,
        customerId: customer.id,
        sessionId: session.id,
        participants: body.participants,
        pricePerPerson: mappedSession.price,
        totalAmount: mappedSession.price * body.participants,
        amountPaid: 0,
        paymentStatus: "UNPAID",
        status: s.autoConfirmBookings ? "CONFIRMED" : "PENDING",
        source: "WEBSITE",
        notes: body.notes || null,
        createdAt: now,
        updatedAt: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await notifyStaff({ type: "NEW_BOOKING", title: "New website booking request", body: `${booking.bookingCode} — ${body.name}`, entityType: "Booking", entityId: booking.id });
    await fireTrigger("BOOKING_CREATED", "Booking", booking.id, { booking, customer, session: mappedSession });
    res.status(201).json({ ok: true, bookingCode: booking.bookingCode, status: booking.status });
  })
);

export default router;
