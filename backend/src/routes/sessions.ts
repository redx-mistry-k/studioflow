import { Router } from "express";
import { z } from "zod";
import { db, uuid, nowIso, num } from "../db";
import { mapSession, mapWorkshop } from "../db/map";
import { contains, countRows } from "../db/queries";
import { asyncHandler, validate, pagination, paged, ApiError } from "../utils/http";
import { requireAuth } from "../middleware/auth";
import { audit } from "../services/audit";

const router = Router();
router.use(requireAuth);

export function deriveSessionStatus(booked: number, capacity: number, manual: string): string {
  if (["COMPLETED", "CANCELLED"].includes(manual)) return manual;
  if (booked >= capacity) return "FULL";
  if (capacity > 0 && booked / capacity >= 0.8) return "ALMOST_FULL";
  return manual === "SCHEDULED" ? "SCHEDULED" : "OPEN";
}

const sessionSchema = z.object({
  workshopId: z.string().min(1),
  title: z.string().optional().nullable(),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  instructor: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  capacity: z.number().int().min(1).optional(),
  price: z.number().min(0).optional(),
  status: z.string().optional(),
  notes: z.string().optional().nullable(),
});

async function bookedCounts(sessionIds: string[]): Promise<Map<string, number>> {
  if (!sessionIds.length) return new Map();
  const rows = await db
    .selectFrom("bookings")
    .select(["sessionId", (eb) => eb.fn.sum("participants").as("total")])
    .where("sessionId", "in", sessionIds)
    .where("status", "not in", ["CANCELLED", "NO_SHOW"])
    .groupBy("sessionId")
    .execute();
  return new Map(rows.map((r) => [r.sessionId, num(r.total)]));
}

// GET /api/sessions
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pagination(req);
    const workshopId = String(req.query.workshopId || "");
    const instructor = String(req.query.instructor || "");
    const status = String(req.query.status || "");
    const from = String(req.query.from || "");
    const to = String(req.query.to || "");
    const q = String(req.query.q || "").trim();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let base: any = db.selectFrom("sessions as s").selectAll("s");
    if (workshopId) base = base.where("s.workshopId", "=", workshopId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (instructor) base = base.where((eb: any) => contains(eb, "s.instructor", instructor));
    if (status) base = base.where("s.status", "=", status);
    if (from) base = base.where("s.startsAt", ">=", new Date(from).toISOString());
    if (to) base = base.where("s.startsAt", "<=", new Date(to).toISOString());
    if (q) {
      base = base
        .innerJoin("workshops as w", "w.id", "s.workshopId")
        .where((eb: never) => (eb as { or: (x: unknown[]) => unknown }).or([contains(eb, "s.title", q), contains(eb, "w.name", q)]));
    }
    const totalRow = await base.clearSelect().clearOrderBy().select((eb: { fn: { countAll: () => unknown } }) => (eb.fn.countAll() as never)).executeTakeFirst();
    void totalRow;
    const rows = await base.clearSelect().selectAll("s").orderBy("s.startsAt", "asc").limit(limit).offset(skip).execute();
    // Re-count without join complications for accuracy
    let countBase = db.selectFrom("sessions").select((eb) => eb.fn.countAll().as("count"));
    if (workshopId) countBase = countBase.where("workshopId", "=", workshopId);
    if (status) countBase = countBase.where("status", "=", status);
    if (from) countBase = countBase.where("startsAt", ">=", new Date(from).toISOString());
    if (to) countBase = countBase.where("startsAt", "<=", new Date(to).toISOString());
    const total = countRows(await countBase.executeTakeFirst());

    const counts = await bookedCounts(rows.map((r: { id: string }) => r.id));
    const data = await Promise.all(
      rows.map(async (s: Record<string, never>) => {
        const w = await db.selectFrom("workshops").selectAll().where("id", "=", String(s.workshopId)).executeTakeFirst();
        const booked = counts.get(String(s.id)) || 0;
        const mapped = mapSession(s);
        return {
          ...mapped,
          workshop: w ? mapWorkshop(w) : null,
          booked,
          available: Math.max(0, mapped.capacity - booked),
          computedStatus: deriveSessionStatus(booked, mapped.capacity, mapped.status),
        };
      })
    );
    res.json(paged(data, total, page, limit));
  })
);

// GET /api/sessions/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const s = await db.selectFrom("sessions").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!s) throw new ApiError(404, "Session not found");
    const w = await db.selectFrom("workshops").selectAll().where("id", "=", s.workshopId).executeTakeFirst();
    const bookingRows = await db
      .selectFrom("bookings")
      .selectAll()
      .where("sessionId", "=", s.id)
      .orderBy("createdAt", "desc")
      .execute();
    const bookings = await Promise.all(
      bookingRows.map(async (b) => {
        const c = await db
          .selectFrom("customers")
          .select(["id", "firstName", "lastName", "phone"])
          .where("id", "=", b.customerId)
          .executeTakeFirst();
        return { ...b, customer: c ?? null };
      })
    );
    const mapped = mapSession(s);
    const booked = bookings.filter((b) => !["CANCELLED", "NO_SHOW"].includes(b.status)).reduce((x, b) => x + num(b.participants), 0);
    res.json({
      ...mapped,
      workshop: w ? mapWorkshop(w) : null,
      bookings,
      booked,
      available: Math.max(0, mapped.capacity - booked),
      computedStatus: deriveSessionStatus(booked, mapped.capacity, mapped.status),
    });
  })
);

// POST /api/sessions
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = validate(sessionSchema, req.body);
    const workshop = await db.selectFrom("workshops").selectAll().where("id", "=", body.workshopId).executeTakeFirst();
    if (!workshop) throw new ApiError(404, "Workshop not found");
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    if (!(startsAt < endsAt)) throw new ApiError(400, "End time must be after start time");
    const now = nowIso();
    const created = await db
      .insertInto("sessions")
      .values({
        id: uuid(),
        workshopId: workshop.id,
        title: body.title || workshop.name,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        instructor: body.instructor ?? workshop.instructor,
        location: body.location ?? workshop.location,
        capacity: body.capacity ?? workshop.defaultCapacity,
        price: body.price ?? workshop.defaultPrice,
        status: body.status || "OPEN",
        notes: body.notes || null,
        createdAt: now,
        updatedAt: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const mapped = mapSession(created);
    await audit(req.user!.sub, "SESSION_CREATED", "Session", mapped.id, undefined, mapped);
    res.status(201).json({ ...mapped, workshop: mapWorkshop(workshop) });
  })
);

// PUT /api/sessions/:id
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = validate(sessionSchema.partial().extend({ workshopId: z.string().optional() }), req.body);
    const existing = await db.selectFrom("sessions").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!existing) throw new ApiError(404, "Session not found");
    const patch: Record<string, unknown> = { updatedAt: nowIso() };
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      if (k === "startsAt" || k === "endsAt") patch[k] = new Date(v as string).toISOString();
      else patch[k] = v;
    }
    const updated = await db
      .updateTable("sessions")
      .set(patch as never)
      .where("id", "=", req.params.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    const mapped = mapSession(updated);
    await audit(req.user!.sub, "SESSION_UPDATED", "Session", mapped.id, mapSession(existing), mapped);
    res.json(mapped);
  })
);

// DELETE /api/sessions/:id
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await db.selectFrom("sessions").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!existing) throw new ApiError(404, "Session not found");
    const countRow = await db
      .selectFrom("bookings")
      .select((eb) => eb.fn.countAll().as("count"))
      .where("sessionId", "=", req.params.id)
      .where("status", "not in", ["CANCELLED"])
      .executeTakeFirst();
    if (countRows(countRow) > 0) {
      await db.updateTable("sessions").set({ status: "CANCELLED", updatedAt: nowIso() }).where("id", "=", req.params.id).execute();
      await audit(req.user!.sub, "SESSION_CANCELLED", "Session", req.params.id, mapSession(existing));
      return res.json({ ok: true, cancelled: true });
    }
    await db.deleteFrom("sessions").where("id", "=", req.params.id).execute();
    await audit(req.user!.sub, "SESSION_DELETED", "Session", req.params.id, mapSession(existing));
    res.json({ ok: true });
  })
);

export default router;
