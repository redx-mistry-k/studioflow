import { Router } from "express";
import { z } from "zod";
import { db, uuid, nowIso } from "../db";
import { mapFollowUp } from "../db/map";
import { contains, countRows } from "../db/queries";
import { asyncHandler, validate, pagination, paged, ApiError } from "../utils/http";
import { requireAuth } from "../middleware/auth";
import { audit } from "../services/audit";

const router = Router();
router.use(requireAuth);

const followUpSchema = z.object({
  customerId: z.string().min(1),
  bookingId: z.string().optional().nullable(),
  conversationId: z.string().optional().nullable(),
  reason: z.string().min(1),
  channel: z.string().optional().default("WHATSAPP"),
  dueAt: z.string().min(1),
  assignedToId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

function dayBounds(d: Date) {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

// GET /api/followups?view=today|upcoming|overdue|completed|all
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pagination(req);
    const view = String(req.query.view || "all");
    const q = String(req.query.q || "").trim();
    const now = new Date().toISOString();
    const { start, end } = dayBounds(new Date());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let base: any = db.selectFrom("followUps as f").selectAll("f");
    if (view === "today") base = base.where("f.status", "in", ["PENDING", "OVERDUE"]).where("f.dueAt", ">=", start).where("f.dueAt", "<=", end);
    else if (view === "upcoming") base = base.where("f.status", "=", "PENDING").where("f.dueAt", ">", end);
    else if (view === "overdue") base = base.where("f.status", "=", "OVERDUE");
    else if (view === "completed") base = base.where("f.status", "=", "COMPLETED");
    else if (view === "pending") base = base.where("f.status", "in", ["PENDING", "OVERDUE"]);
    if (q) {
      base = base
        .innerJoin("customers as cu", "cu.id", "f.customerId")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .where((eb: any) => eb.or([contains(eb, "f.reason", q), contains(eb, "cu.firstName", q), contains(eb, "cu.lastName", q)]));
    }
    if (["all", "pending", "today"].includes(view)) {
      await db.updateTable("followUps").set({ status: "OVERDUE", updatedAt: nowIso() }).where("status", "=", "PENDING").where("dueAt", "<", now).execute();
    }
    const rows = await base
      .clearSelect()
      .selectAll("f")
      .orderBy(view === "completed" ? "f.completedAt" : "f.dueAt", view === "completed" ? "desc" : "asc")
      .limit(limit)
      .offset(skip)
      .execute();
    // Total for the same view (without search join)
    let countBase = db.selectFrom("followUps").select((eb) => eb.fn.countAll().as("count"));
    if (view === "today") countBase = countBase.where("status", "in", ["PENDING", "OVERDUE"]).where("dueAt", ">=", start).where("dueAt", "<=", end);
    else if (view === "upcoming") countBase = countBase.where("status", "=", "PENDING").where("dueAt", ">", end);
    else if (view === "overdue") countBase = countBase.where("status", "=", "OVERDUE");
    else if (view === "completed") countBase = countBase.where("status", "=", "COMPLETED");
    else if (view === "pending") countBase = countBase.where("status", "in", ["PENDING", "OVERDUE"]);
    const total = countRows(await countBase.executeTakeFirst());

    const data = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rows.map(async (f: any) => {
        const customer = await db
          .selectFrom("customers")
          .select(["id", "firstName", "lastName", "phone"])
          .where("id", "=", f.customerId)
          .executeTakeFirst();
        const booking = f.bookingId
          ? await db.selectFrom("bookings").select(["id", "bookingCode"]).where("id", "=", f.bookingId).executeTakeFirst()
          : null;
        const assignee = f.assignedToId
          ? await db.selectFrom("users").select(["id", "name"]).where("id", "=", f.assignedToId).executeTakeFirst()
          : null;
        return { ...mapFollowUp(f), customer: customer ?? null, booking: booking ?? null, assignedTo: assignee ?? null };
      })
    );
    const counts = await db.selectFrom("followUps").select(["status", (eb) => eb.fn.countAll().as("count")]).groupBy("status").execute();
    res.json({ ...paged(data, total, page, limit), counts: counts.map((c) => ({ status: c.status, count: Number(c.count) })) });
  })
);

// POST /api/followups
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = validate(followUpSchema, req.body);
    const customer = await db.selectFrom("customers").select("id").where("id", "=", body.customerId).executeTakeFirst();
    if (!customer) throw new ApiError(404, "Customer not found");
    const now = nowIso();
    const created = await db
      .insertInto("followUps")
      .values({
        id: uuid(),
        customerId: customer.id,
        bookingId: body.bookingId || null,
        conversationId: body.conversationId || null,
        reason: body.reason,
        channel: body.channel || "WHATSAPP",
        dueAt: new Date(body.dueAt).toISOString(),
        status: "PENDING",
        assignedToId: body.assignedToId || req.user!.sub,
        notes: body.notes || null,
        createdAt: now,
        updatedAt: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const mapped = mapFollowUp(created);
    await audit(req.user!.sub, "FOLLOWUP_CREATED", "FollowUp", mapped.id, undefined, mapped);
    res.status(201).json(mapped);
  })
);

// PATCH /api/followups/:id
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const schema = z.object({
      action: z.enum(["complete", "snooze", "cancel", "reopen"]).optional(),
      snoozeUntil: z.string().optional(),
      reason: z.string().optional(),
      channel: z.string().optional(),
      dueAt: z.string().optional(),
      assignedToId: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    });
    const body = validate(schema, req.body);
    const existing = await db.selectFrom("followUps").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!existing) throw new ApiError(404, "Follow-up not found");
    const patch: Record<string, unknown> = { updatedAt: nowIso() };
    if (body.action === "complete") {
      patch.status = "COMPLETED";
      patch.completedAt = nowIso();
    } else if (body.action === "cancel") {
      patch.status = "CANCELLED";
    } else if (body.action === "reopen") {
      patch.status = "PENDING";
      patch.completedAt = null;
    } else if (body.action === "snooze") {
      patch.dueAt = body.snoozeUntil ? new Date(body.snoozeUntil).toISOString() : new Date(Date.now() + 24 * 3600_000).toISOString();
      patch.status = "PENDING";
    }
    if (body.reason) patch.reason = body.reason;
    if (body.channel) patch.channel = body.channel;
    if (body.dueAt) patch.dueAt = new Date(body.dueAt).toISOString();
    if (body.assignedToId !== undefined) patch.assignedToId = body.assignedToId;
    if (body.notes !== undefined) patch.notes = body.notes;
    const updated = await db
      .updateTable("followUps")
      .set(patch as never)
      .where("id", "=", req.params.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    await audit(req.user!.sub, "FOLLOWUP_UPDATED", "FollowUp", updated.id, mapFollowUp(existing), mapFollowUp(updated));
    res.json(mapFollowUp(updated));
  })
);

// DELETE /api/followups/:id
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await db.selectFrom("followUps").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!existing) throw new ApiError(404, "Follow-up not found");
    await db.deleteFrom("followUps").where("id", "=", req.params.id).execute();
    await audit(req.user!.sub, "FOLLOWUP_DELETED", "FollowUp", req.params.id, mapFollowUp(existing));
    res.json({ ok: true });
  })
);

export default router;
