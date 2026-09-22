import { Router } from "express";
import { db } from "../db";
import { mapNotification } from "../db/map";
import { countRows } from "../db/queries";
import { asyncHandler, pagination, paged, ApiError } from "../utils/http";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// GET /api/notifications
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pagination(req);
    const unreadOnly = req.query.unread === "true";
    let base = db.selectFrom("notifications").selectAll().where("userId", "=", req.user!.sub);
    if (unreadOnly) base = base.where("read", "=", false);
    const [totalRow, rows, unreadRow] = await Promise.all([
      base.clearSelect().clearOrderBy().select((eb) => eb.fn.countAll().as("count")).executeTakeFirst(),
      base.clearSelect().selectAll().orderBy("createdAt", "desc").limit(limit).offset(skip).execute(),
      db.selectFrom("notifications").select((eb) => eb.fn.countAll().as("count")).where("userId", "=", req.user!.sub).where("read", "=", false).executeTakeFirst(),
    ]);
    res.json({ ...paged(rows.map(mapNotification), countRows(totalRow), page, limit), unread: countRows(unreadRow) });
  })
);

// POST /api/notifications/:id/read
router.post(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const n = await db
      .selectFrom("notifications")
      .select("id")
      .where("id", "=", req.params.id)
      .where("userId", "=", req.user!.sub)
      .executeTakeFirst();
    if (!n) throw new ApiError(404, "Notification not found");
    await db.updateTable("notifications").set({ read: true }).where("id", "=", n.id).execute();
    res.json({ ok: true });
  })
);

// POST /api/notifications/read-all
router.post(
  "/read-all",
  asyncHandler(async (req, res) => {
    await db.updateTable("notifications").set({ read: true }).where("userId", "=", req.user!.sub).where("read", "=", false).execute();
    res.json({ ok: true });
  })
);

export default router;
