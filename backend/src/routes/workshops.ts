import { Router } from "express";
import { z } from "zod";
import { db, uuid, nowIso } from "../db";
import { mapWorkshop } from "../db/map";
import { contains, countRows } from "../db/queries";
import { asyncHandler, validate, pagination, paged, ApiError } from "../utils/http";
import { requireAuth } from "../middleware/auth";
import { audit } from "../services/audit";

const router = Router();
router.use(requireAuth);

const workshopSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  durationMins: z.number().int().min(15).optional().default(120),
  defaultPrice: z.number().min(0).optional().default(0),
  defaultCapacity: z.number().int().min(1).optional().default(20),
  instructor: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  color: z.string().optional().default("#7c3aed"),
  active: z.boolean().optional().default(true),
});

// GET /api/workshops
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pagination(req);
    const q = String(req.query.q || "").trim();
    const active = req.query.active;
    let base = db.selectFrom("workshops").selectAll();
    if (q) {
      base = base.where((eb) => eb.or([contains(eb, "name", q), contains(eb, "category", q), contains(eb, "instructor", q)]));
    }
    if (active === "true") base = base.where("active", "=", true);
    if (active === "false") base = base.where("active", "=", false);
    const totalRow = await base.clearSelect().clearOrderBy().select((eb) => eb.fn.countAll().as("count")).executeTakeFirst();
    const rows = await base.clearSelect().selectAll().orderBy("name", "asc").limit(limit).offset(skip).execute();
    const data = await Promise.all(
      rows.map(async (w) => {
        const countRow = await db
          .selectFrom("sessions")
          .select((eb) => eb.fn.countAll().as("count"))
          .where("workshopId", "=", w.id)
          .executeTakeFirst();
        const upcoming = await db
          .selectFrom("sessions")
          .select(["id", "startsAt", "status", "capacity"])
          .where("workshopId", "=", w.id)
          .where("startsAt", ">=", new Date().toISOString())
          .orderBy("startsAt", "asc")
          .limit(3)
          .execute();
        return { ...mapWorkshop(w), sessionsCount: countRows(countRow), sessions: upcoming };
      })
    );
    res.json(paged(data, countRows(totalRow), page, limit));
  })
);

// GET /api/workshops/:id
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const w = await db.selectFrom("workshops").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!w) throw new ApiError(404, "Workshop not found");
    const sessions = await db
      .selectFrom("sessions")
      .selectAll()
      .where("workshopId", "=", w.id)
      .orderBy("startsAt", "desc")
      .limit(30)
      .execute();
    res.json({ ...mapWorkshop(w), sessions });
  })
);

// POST /api/workshops
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = validate(workshopSchema, req.body);
    const now = nowIso();
    const created = await db
      .insertInto("workshops")
      .values({
        id: uuid(),
        name: body.name,
        description: body.description ?? null,
        category: body.category ?? null,
        durationMins: body.durationMins ?? 120,
        defaultPrice: body.defaultPrice ?? 0,
        defaultCapacity: body.defaultCapacity ?? 20,
        instructor: body.instructor ?? null,
        location: body.location ?? null,
        color: body.color ?? "#7c3aed",
        active: body.active ?? true,
        createdAt: now,
        updatedAt: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const mapped = mapWorkshop(created);
    await audit(req.user!.sub, "WORKSHOP_CREATED", "Workshop", mapped.id, undefined, mapped);
    res.status(201).json(mapped);
  })
);

// PUT /api/workshops/:id
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = validate(workshopSchema.partial(), req.body);
    const existing = await db.selectFrom("workshops").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!existing) throw new ApiError(404, "Workshop not found");
    const patch: Record<string, unknown> = { updatedAt: nowIso() };
    for (const [k, v] of Object.entries(body)) if (v !== undefined) patch[k] = v;
    const updated = await db
      .updateTable("workshops")
      .set(patch as never)
      .where("id", "=", req.params.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    const mapped = mapWorkshop(updated);
    await audit(req.user!.sub, "WORKSHOP_UPDATED", "Workshop", mapped.id, mapWorkshop(existing), mapped);
    res.json(mapped);
  })
);

// DELETE /api/workshops/:id
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await db.selectFrom("workshops").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!existing) throw new ApiError(404, "Workshop not found");
    const countRow = await db
      .selectFrom("sessions")
      .select((eb) => eb.fn.countAll().as("count"))
      .where("workshopId", "=", req.params.id)
      .executeTakeFirst();
    if (countRows(countRow) > 0) {
      await db.updateTable("workshops").set({ active: false, updatedAt: nowIso() }).where("id", "=", req.params.id).execute();
      await audit(req.user!.sub, "WORKSHOP_DEACTIVATED", "Workshop", req.params.id, mapWorkshop(existing));
      return res.json({ ok: true, deactivated: true });
    }
    await db.deleteFrom("workshops").where("id", "=", req.params.id).execute();
    await audit(req.user!.sub, "WORKSHOP_DELETED", "Workshop", req.params.id, mapWorkshop(existing));
    res.json({ ok: true });
  })
);

export default router;
