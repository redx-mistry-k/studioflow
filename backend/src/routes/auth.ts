import { Router } from "express";
import { z } from "zod";
import { db, uuid, nowIso, toBool } from "../db";
import { asyncHandler, validate, ApiError } from "../utils/http";
import { hashPassword, verifyPassword, signToken, setAuthCookie, clearAuthCookie } from "../utils/auth";
import { requireAuth } from "../middleware/auth";
import { audit } from "../services/audit";
import { countRows } from "../db/queries";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/login
router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = validate(loginSchema, req.body);
    const user = await db.selectFrom("users").selectAll().where("email", "=", email.toLowerCase()).executeTakeFirst();
    if (!user || !toBool(user.active)) throw new ApiError(401, "Invalid email or password");
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw new ApiError(401, "Invalid email or password");
    const token = signToken({ sub: user.id, email: user.email, role: user.role, name: user.name });
    await audit(user.id, "LOGIN", "User", user.id);
    setAuthCookie(res, token);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  })
);

// POST /api/auth/bootstrap — create the very first admin when no users exist
router.post(
  "/bootstrap",
  asyncHandler(async (req, res) => {
    const row = await db.selectFrom("users").select((eb) => eb.fn.countAll().as("count")).executeTakeFirst();
    if (countRows(row) > 0) throw new ApiError(403, "Setup already completed");
    const schema = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8) });
    const { name, email, password } = validate(schema, req.body);
    const now = nowIso();
    const user = await db
      .insertInto("users")
      .values({ id: uuid(), name, email: email.toLowerCase(), passwordHash: await hashPassword(password), role: "ADMIN", active: true, createdAt: now, updatedAt: now })
      .returningAll()
      .executeTakeFirstOrThrow();
    const token = signToken({ sub: user.id, email: user.email, role: user.role, name: user.name });
    setAuthCookie(res, token);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  })
);

// GET /api/auth/me
router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await db
      .selectFrom("users")
      .select(["id", "email", "name", "role", "active", "createdAt"])
      .where("id", "=", req.user!.sub)
      .executeTakeFirst();
    if (!user) throw new ApiError(404, "User not found");
    res.json({ ...user, active: toBool(user.active) });
  })
);

// POST /api/auth/logout — clears the auth cookie (no auth required)
router.post(
  "/logout",
  asyncHandler(async (_req, res) => {
    clearAuthCookie(res);
    res.json({ ok: true });
  })
);

// PUT /api/auth/password
router.put(
  "/password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const schema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) });
    const { currentPassword, newPassword } = validate(schema, req.body);
    const user = await db.selectFrom("users").selectAll().where("id", "=", req.user!.sub).executeTakeFirst();
    if (!user) throw new ApiError(404, "User not found");
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new ApiError(400, "Current password is incorrect");
    }
    await db.updateTable("users").set({ passwordHash: await hashPassword(newPassword), updatedAt: nowIso() }).where("id", "=", user.id).execute();
    res.json({ ok: true });
  })
);

export default router;
