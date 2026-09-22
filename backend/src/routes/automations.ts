import { Router } from "express";
import { z } from "zod";
import { db, uuid, nowIso, jstr } from "../db";
import { mapRule, mapExecution } from "../db/map";
import { countRows } from "../db/queries";
import { asyncHandler, validate, pagination, paged, ApiError } from "../utils/http";
import { requireAuth, requireMinRole } from "../middleware/auth";
import { audit } from "../services/audit";
import { TRIGGERS, ACTIONS, executeRun } from "../services/automation";

const router = Router();
router.use(requireAuth);

const ruleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  trigger: z.enum(TRIGGERS as unknown as [string, ...string[]]),
  conditions: z.record(z.unknown()).optional().default({}),
  delayMinutes: z.number().int().min(0).optional().default(0),
  action: z.enum(ACTIONS as unknown as [string, ...string[]]),
  actionConfig: z.record(z.unknown()).optional().default({}),
  templateId: z.string().optional().nullable(),
  enabled: z.boolean().optional().default(true),
});

// GET /api/automations/meta
router.get(
  "/meta",
  asyncHandler(async (_req, res) => {
    res.json({ triggers: TRIGGERS, actions: ACTIONS });
  })
);

// GET /api/automations
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pagination(req);
    const [totalRow, rows] = await Promise.all([
      db.selectFrom("automationRules").select((eb) => eb.fn.countAll().as("count")).executeTakeFirst(),
      db.selectFrom("automationRules").selectAll().orderBy("createdAt", "desc").limit(limit).offset(skip).execute(),
    ]);
    const data = await Promise.all(
      rows.map(async (r) => {
        const template = r.templateId
          ? await db.selectFrom("messageTemplates").select(["id", "name"]).where("id", "=", r.templateId).executeTakeFirst()
          : null;
        const execRow = await db
          .selectFrom("automationExecutions")
          .select((eb) => eb.fn.countAll().as("count"))
          .where("ruleId", "=", r.id)
          .executeTakeFirst();
        return { ...mapRule(r), template: template ?? null, executionsCount: countRows(execRow) };
      })
    );
    res.json(paged(data, countRows(totalRow), page, limit));
  })
);

// POST /api/automations (Manager+)
router.post(
  "/",
  requireMinRole("MANAGER"),
  asyncHandler(async (req, res) => {
    const body = validate(ruleSchema, req.body);
    const now = nowIso();
    const created = await db
      .insertInto("automationRules")
      .values({
        id: uuid(),
        name: body.name,
        description: body.description ?? null,
        trigger: body.trigger,
        conditions: jstr(body.conditions ?? {}),
        delayMinutes: body.delayMinutes ?? 0,
        action: body.action,
        actionConfig: jstr(body.actionConfig ?? {}),
        templateId: body.templateId ?? null,
        enabled: body.enabled ?? true,
        createdAt: now,
        updatedAt: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const mapped = mapRule(created);
    await audit(req.user!.sub, "AUTOMATION_CREATED", "AutomationRule", mapped.id, undefined, mapped);
    res.status(201).json(mapped);
  })
);

// PUT /api/automations/:id (Manager+)
router.put(
  "/:id",
  requireMinRole("MANAGER"),
  asyncHandler(async (req, res) => {
    const body = validate(ruleSchema.partial(), req.body);
    const existing = await db.selectFrom("automationRules").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!existing) throw new ApiError(404, "Rule not found");
    const patch: Record<string, unknown> = { updatedAt: nowIso() };
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      if (k === "conditions" || k === "actionConfig") patch[k] = jstr(v);
      else patch[k] = v;
    }
    const updated = await db
      .updateTable("automationRules")
      .set(patch as never)
      .where("id", "=", req.params.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    await audit(req.user!.sub, "AUTOMATION_UPDATED", "AutomationRule", updated.id, mapRule(existing), mapRule(updated));
    res.json(mapRule(updated));
  })
);

// PATCH /api/automations/:id/toggle
router.patch(
  "/:id/toggle",
  requireMinRole("MANAGER"),
  asyncHandler(async (req, res) => {
    const existing = await db.selectFrom("automationRules").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!existing) throw new ApiError(404, "Rule not found");
    const enabled = !existing.enabled;
    const updated = await db
      .updateTable("automationRules")
      .set({ enabled, updatedAt: nowIso() })
      .where("id", "=", existing.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    res.json(mapRule(updated));
  })
);

// DELETE /api/automations/:id
router.delete(
  "/:id",
  requireMinRole("MANAGER"),
  asyncHandler(async (req, res) => {
    const existing = await db.selectFrom("automationRules").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!existing) throw new ApiError(404, "Rule not found");
    await db.deleteFrom("automationRules").where("id", "=", req.params.id).execute();
    await audit(req.user!.sub, "AUTOMATION_DELETED", "AutomationRule", req.params.id, mapRule(existing));
    res.json({ ok: true });
  })
);

// GET /api/automations/executions/list
router.get(
  "/executions/list",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pagination(req);
    const status = String(req.query.status || "");
    const ruleId = String(req.query.ruleId || "");
    let base = db.selectFrom("automationExecutions").selectAll();
    if (status) base = base.where("status", "=", status);
    if (ruleId) base = base.where("ruleId", "=", ruleId);
    const [totalRow, rows] = await Promise.all([
      base.clearSelect().clearOrderBy().select((eb) => eb.fn.countAll().as("count")).executeTakeFirst(),
      base.clearSelect().selectAll().orderBy("createdAt", "desc").limit(limit).offset(skip).execute(),
    ]);
    const data = await Promise.all(
      rows.map(async (e) => {
        const rule = await db
          .selectFrom("automationRules")
          .select(["id", "name", "trigger", "action"])
          .where("id", "=", e.ruleId)
          .executeTakeFirst();
        return { ...mapExecution(e), rule: rule ?? null };
      })
    );
    res.json(paged(data, countRows(totalRow), page, limit));
  })
);

// POST /api/automations/executions/:id/retry
router.post(
  "/executions/:id/retry",
  requireMinRole("MANAGER"),
  asyncHandler(async (req, res) => {
    const existing = await db.selectFrom("automationExecutions").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!existing) throw new ApiError(404, "Execution not found");
    await db
      .updateTable("automationExecutions")
      .set({ status: "SCHEDULED", runAt: nowIso(), error: null })
      .where("id", "=", existing.id)
      .execute();
    await executeRun(existing.id);
    const updated = await db.selectFrom("automationExecutions").selectAll().where("id", "=", existing.id).executeTakeFirst();
    res.json(updated ? mapExecution(updated) : null);
  })
);

export default router;
