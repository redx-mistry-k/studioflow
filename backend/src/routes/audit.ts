import { Router } from "express";
import { db } from "../db";
import { mapAudit } from "../db/map";
import { countRows } from "../db/queries";
import { asyncHandler, pagination, paged } from "../utils/http";
import { requireAuth, requireMinRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth, requireMinRole("MANAGER"));

// GET /api/audit
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pagination(req);
    const entityType = String(req.query.entityType || "");
    const action = String(req.query.action || "");
    const entityId = String(req.query.entityId || "");
    let base = db.selectFrom("auditLogs").selectAll();
    if (entityType) base = base.where("entityType", "=", entityType);
    if (entityId) base = base.where("entityId", "=", entityId);
    if (action) base = base.where("action", "=", action);
    const [totalRow, rows] = await Promise.all([
      base.clearSelect().clearOrderBy().select((eb) => eb.fn.countAll().as("count")).executeTakeFirst(),
      base.clearSelect().selectAll().orderBy("createdAt", "desc").limit(limit).offset(skip).execute(),
    ]);
    const data = await Promise.all(
      rows.map(async (a) => {
        const user = a.userId ? await db.selectFrom("users").select(["id", "name"]).where("id", "=", a.userId).executeTakeFirst() : null;
        return { ...mapAudit(a), user: user ?? null };
      })
    );
    res.json(paged(data, countRows(totalRow), page, limit));
  })
);

export default router;
