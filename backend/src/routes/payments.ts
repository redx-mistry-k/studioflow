import { Router } from "express";
import { z } from "zod";
import { db, uuid, nowIso, num } from "../db";
import { mapPayment, mapBooking, mapCustomer, mapSession, mapWorkshop } from "../db/map";
import { contains, countRows } from "../db/queries";
import { asyncHandler, validate, pagination, paged, ApiError } from "../utils/http";
import { requireAuth } from "../middleware/auth";
import { audit } from "../services/audit";
import { notifyStaff } from "../services/notifications";
import { fireTrigger } from "../services/automation";

const router = Router();
router.use(requireAuth);

const paymentSchema = z.object({
  bookingId: z.string().min(1),
  amount: z.number().positive(),
  method: z.string().default("UPI"),
  reference: z.string().optional().nullable(),
  receivedAt: z.string().optional(),
  notes: z.string().optional().nullable(),
});

async function recomputeBooking(bookingId: string) {
  const pays = await db.selectFrom("payments").select(["amount", "status"]).where("bookingId", "=", bookingId).execute();
  const booking = await db.selectFrom("bookings").selectAll().where("id", "=", bookingId).executeTakeFirst();
  if (!booking) return null;
  const paid = pays.filter((p) => p.status === "COMPLETED").reduce((s, p) => s + num(p.amount), 0);
  const refunded = pays.filter((p) => p.status === "REFUNDED").reduce((s, p) => s + num(p.amount), 0);
  const net = Math.max(0, paid - refunded);
  let paymentStatus = "UNPAID";
  if (paid > 0 && refunded >= paid) paymentStatus = "REFUNDED";
  else if (net >= booking.totalAmount && booking.totalAmount > 0) paymentStatus = "PAID";
  else if (net > 0) paymentStatus = "PARTIALLY_PAID";
  else if (booking.totalAmount === 0) paymentStatus = "PAID";
  const updated = await db
    .updateTable("bookings")
    .set({ amountPaid: net, paymentStatus, updatedAt: nowIso() })
    .where("id", "=", bookingId)
    .returningAll()
    .executeTakeFirstOrThrow();
  return mapBooking(updated);
}

// GET /api/payments
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pagination(req);
    const bookingId = String(req.query.bookingId || "");
    const customerId = String(req.query.customerId || "");
    const method = String(req.query.method || "");
    const status = String(req.query.status || "");
    const q = String(req.query.q || "").trim();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let base: any = db.selectFrom("payments as p").selectAll("p");
    if (bookingId) base = base.where("p.bookingId", "=", bookingId);
    if (customerId) base = base.where("p.customerId", "=", customerId);
    if (method) base = base.where("p.method", "=", method);
    if (status) base = base.where("p.status", "=", status);
    if (q) {
      base = base
        .innerJoin("bookings as b", "b.id", "p.bookingId")
        .innerJoin("customers as cu", "cu.id", "p.customerId")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .where((eb: any) => eb.or([contains(eb, "p.reference", q), contains(eb, "b.bookingCode", q), contains(eb, "cu.firstName", q)]));
    }
    const rows = await base.clearSelect().selectAll("p").orderBy("p.receivedAt", "desc").limit(limit).offset(skip).execute();
    let countBase = db.selectFrom("payments").select((eb) => eb.fn.countAll().as("count"));
    if (bookingId) countBase = countBase.where("bookingId", "=", bookingId);
    if (customerId) countBase = countBase.where("customerId", "=", customerId);
    if (method) countBase = countBase.where("method", "=", method);
    if (status) countBase = countBase.where("status", "=", status);
    const total = countRows(await countBase.executeTakeFirst());

    const data = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rows.map(async (p: any) => {
        const booking = await db
          .selectFrom("bookings")
          .select(["id", "bookingCode", "totalAmount", "amountPaid", "paymentStatus"])
          .where("id", "=", p.bookingId)
          .executeTakeFirst();
        const customer = await db
          .selectFrom("customers")
          .select(["id", "firstName", "lastName"])
          .where("id", "=", p.customerId)
          .executeTakeFirst();
        return { ...mapPayment(p), booking: booking ?? null, customer: customer ?? null };
      })
    );
    res.json(paged(data, total, page, limit));
  })
);

// POST /api/payments — record payment (partial or full)
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = validate(paymentSchema, req.body);
    const booking = await db.selectFrom("bookings").selectAll().where("id", "=", body.bookingId).executeTakeFirst();
    if (!booking) throw new ApiError(404, "Booking not found");
    const now = nowIso();
    const payment = await db
      .insertInto("payments")
      .values({
        id: uuid(),
        bookingId: booking.id,
        customerId: booking.customerId,
        amount: body.amount,
        method: body.method,
        reference: body.reference || null,
        receivedAt: body.receivedAt ? new Date(body.receivedAt).toISOString() : now,
        notes: body.notes || null,
        createdById: req.user!.sub,
        status: "COMPLETED",
        createdAt: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const updated = await recomputeBooking(booking.id);
    const mapped = mapPayment(payment);
    await audit(req.user!.sub, "PAYMENT_RECORDED", "Payment", mapped.id, undefined, mapped);
    await notifyStaff({
      type: "PAYMENT_RECEIVED",
      title: "Payment received",
      body: `${booking.bookingCode}: ${body.amount} via ${body.method}`,
      entityType: "Payment",
      entityId: mapped.id,
    });
    const customer = await db.selectFrom("customers").selectAll().where("id", "=", booking.customerId).executeTakeFirst();
    const session = await db.selectFrom("sessions").selectAll().where("id", "=", booking.sessionId).executeTakeFirst();
    const workshop = session ? await db.selectFrom("workshops").selectAll().where("id", "=", session.workshopId).executeTakeFirst() : null;
    await fireTrigger("PAYMENT_RECEIVED", "Payment", mapped.id, {
      payment: mapped,
      booking: updated || mapBooking(booking),
      customer: customer ? mapCustomer(customer) : null,
      session: session ? mapSession(session) : null,
      workshop: workshop ? mapWorkshop(workshop) : null,
    });
    res.status(201).json({ payment: mapped, booking: updated });
  })
);

// POST /api/payments/:id/refund
router.post(
  "/:id/refund",
  asyncHandler(async (req, res) => {
    const schema = z.object({ reason: z.string().optional() });
    const { reason } = validate(schema, req.body ?? {});
    const existing = await db.selectFrom("payments").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!existing) throw new ApiError(404, "Payment not found");
    if (existing.status === "REFUNDED") throw new ApiError(400, "Payment already refunded");
    const updated = await db
      .updateTable("payments")
      .set({ status: "REFUNDED", notes: reason ? `${existing.notes ? existing.notes + "\n" : ""}Refund: ${reason}` : existing.notes })
      .where("id", "=", existing.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    const booking = await recomputeBooking(existing.bookingId);
    await audit(req.user!.sub, "PAYMENT_REFUNDED", "Payment", existing.id, mapPayment(existing), mapPayment(updated));
    res.json({ payment: mapPayment(updated), booking });
  })
);

// DELETE /api/payments/:id
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await db.selectFrom("payments").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!existing) throw new ApiError(404, "Payment not found");
    await db.deleteFrom("payments").where("id", "=", req.params.id).execute();
    const booking = await recomputeBooking(existing.bookingId);
    await audit(req.user!.sub, "PAYMENT_DELETED", "Payment", req.params.id, mapPayment(existing));
    res.json({ ok: true, booking });
  })
);

export default router;
