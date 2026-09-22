import { Router } from "express";
import { z } from "zod";
import { db, uuid, nowIso, toBool } from "../db";
import { asyncHandler, validate, pagination, paged, ApiError } from "../utils/http";
import { requireAuth, requireRole } from "../middleware/auth";
import { hashPassword } from "../utils/auth";
import { audit } from "../services/audit";
import { countRows } from "../db/queries";

const router = Router();
router.use(requireAuth);

const upsertSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  role: z.enum(["ADMIN", "MANAGER", "STAFF"]).default("STAFF"),
  active: z.boolean().optional(),
});

// GET /api/users
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pagination(req);
    const [totalRow, rows] = await Promise.all([
      db.selectFrom("users").select((eb) => eb.fn.countAll().as("count")).executeTakeFirst(),
      db
        .selectFrom("users")
        .select(["id", "email", "name", "role", "active", "createdAt"])
        .orderBy("createdAt", "desc")
        .limit(limit)
        .offset(skip)
        .execute(),
    ]);
    res.json(paged(rows.map((u) => ({ ...u, active: toBool(u.active) })), countRows(totalRow), page, limit));
  })
);

// POST /api/users (admin only)
router.post(
  "/",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const body = validate(upsertSchema, req.body);
    if (!body.password) throw new ApiError(400, "Password is required for new users");
    const exists = await db.selectFrom("users").select("id").where("email", "=", body.email.toLowerCase()).executeTakeFirst();
    if (exists) throw new ApiError(409, "A user with this email already exists");
    const now = nowIso();
    const user = await db
      .insertInto("users")
      .values({
        id: uuid(),
        name: body.name,
        email: body.email.toLowerCase(),
        passwordHash: await hashPassword(body.password),
        role: body.role,
        active: body.active ?? true,
        createdAt: now,
        updatedAt: now,
      })
      .returning(["id", "email", "name", "role", "active", "createdAt"])
      .executeTakeFirstOrThrow();
    await audit(req.user!.sub, "USER_CREATED", "User", user.id, undefined, { email: user.email, role: user.role });
    res.status(201).json({ ...user, active: toBool(user.active) });
  })
);

// PUT /api/users/:id (admin only)
router.put(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const body = validate(upsertSchema.partial().extend({ email: z.string().email().optional() }), req.body);
    const existing = await db.selectFrom("users").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!existing) throw new ApiError(404, "User not found");
    if (existing.id === req.user!.sub && body.active === false) {
      throw new ApiError(400, "You cannot deactivate your own account");
    }
    const patch: Record<string, unknown> = { updatedAt: nowIso() };
    if (body.name) patch.name = body.name;
    if (body.email) patch.email = body.email.toLowerCase();
    if (body.role) patch.role = body.role;
    if (body.active !== undefined) patch.active = body.active;
    if (body.password) patch.passwordHash = await hashPassword(body.password);
    const user = await db
      .updateTable("users")
      .set(patch as never)
      .where("id", "=", req.params.id)
      .returning(["id", "email", "name", "role", "active", "createdAt"])
      .executeTakeFirstOrThrow();
    await audit(req.user!.sub, "USER_UPDATED", "User", user.id, { active: toBool(existing.active), role: existing.role }, body);
    res.json({ ...user, active: toBool(user.active) });
  })
);

// DELETE /api/users/:id (admin only)
router.delete(
  "/:id",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user!.sub) throw new ApiError(400, "You cannot delete your own account");
    const existing = await db.selectFrom("users").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!existing) throw new ApiError(404, "User not found");
    await db.deleteFrom("users").where("id", "=", req.params.id).execute();
    await audit(req.user!.sub, "USER_DELETED", "User", req.params.id, { email: existing.email });
    res.json({ ok: true });
  })
);

export default router;
