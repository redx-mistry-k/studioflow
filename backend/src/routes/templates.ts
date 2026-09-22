import { Router } from "express";
import { z } from "zod";
import { db, uuid, nowIso, jstr } from "../db";
import { mapTemplate } from "../db/map";
import { contains, countRows } from "../db/queries";
import { asyncHandler, validate, pagination, paged, ApiError } from "../utils/http";
import { requireAuth } from "../middleware/auth";
import { audit } from "../services/audit";
import { extractVariables, renderTemplate } from "../services/templates";

const router = Router();
router.use(requireAuth);

const templateSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional().default("GENERAL"),
  channel: z.string().optional().default("ANY"),
  subject: z.string().optional().nullable(),
  body: z.string().min(1),
  active: z.boolean().optional().default(true),
});

export const TEMPLATE_CATEGORIES = [
  "ENQUIRY",
  "BOOKING_CONFIRMATION",
  "PAYMENT_REMINDER",
  "CLASS_REMINDER",
  "THANK_YOU",
  "REVIEW_REQUEST",
  "CANCELLATION",
  "RESCHEDULE",
  "GENERAL",
];

// GET /api/templates
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pagination(req);
    const category = String(req.query.category || "");
    const q = String(req.query.q || "").trim();
    let base = db.selectFrom("messageTemplates").selectAll();
    if (category) base = base.where("category", "=", category);
    if (q) base = base.where((eb) => eb.or([contains(eb, "name", q), contains(eb, "body", q)]));
    const [totalRow, rows] = await Promise.all([
      base.clearSelect().clearOrderBy().select((eb) => eb.fn.countAll().as("count")).executeTakeFirst(),
      base.clearSelect().selectAll().orderBy("name", "asc").limit(limit).offset(skip).execute(),
    ]);
    res.json({ ...paged(rows.map(mapTemplate), countRows(totalRow), page, limit), categories: TEMPLATE_CATEGORIES });
  })
);

// POST /api/templates
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = validate(templateSchema, req.body);
    const now = nowIso();
    const created = await db
      .insertInto("messageTemplates")
      .values({
        id: uuid(),
        name: body.name,
        category: body.category ?? "GENERAL",
        channel: body.channel ?? "ANY",
        subject: body.subject ?? null,
        body: body.body,
        variables: jstr(extractVariables(body.body)),
        active: body.active ?? true,
        createdAt: now,
        updatedAt: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const mapped = mapTemplate(created);
    await audit(req.user!.sub, "TEMPLATE_CREATED", "MessageTemplate", mapped.id, undefined, mapped);
    res.status(201).json(mapped);
  })
);

// PUT /api/templates/:id
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = validate(templateSchema.partial(), req.body);
    const existing = await db.selectFrom("messageTemplates").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!existing) throw new ApiError(404, "Template not found");
    const patch: Record<string, unknown> = { updatedAt: nowIso() };
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      patch[k] = v;
    }
    if (body.body) patch.variables = jstr(extractVariables(body.body));
    const updated = await db
      .updateTable("messageTemplates")
      .set(patch as never)
      .where("id", "=", req.params.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    await audit(req.user!.sub, "TEMPLATE_UPDATED", "MessageTemplate", updated.id, mapTemplate(existing), mapTemplate(updated));
    res.json(mapTemplate(updated));
  })
);

// DELETE /api/templates/:id
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await db.selectFrom("messageTemplates").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!existing) throw new ApiError(404, "Template not found");
    const usedRow = await db
      .selectFrom("automationRules")
      .select((eb) => eb.fn.countAll().as("count"))
      .where("templateId", "=", req.params.id)
      .executeTakeFirst();
    const used = countRows(usedRow);
    if (used > 0) throw new ApiError(400, `Template is used by ${used} automation rule(s). Remove it from those rules first.`);
    await db.deleteFrom("messageTemplates").where("id", "=", req.params.id).execute();
    await audit(req.user!.sub, "TEMPLATE_DELETED", "MessageTemplate", req.params.id, mapTemplate(existing));
    res.json({ ok: true });
  })
);

// POST /api/templates/preview
router.post(
  "/preview",
  asyncHandler(async (req, res) => {
    const schema = z.object({ body: z.string(), vars: z.record(z.string()).optional() });
    const { body, vars } = validate(schema, req.body);
    const sample = {
      customer_name: "Priya Sharma",
      class_name: "Pottery Workshop",
      date: "28 Sep 2026",
      time: "11:00 AM",
      amount: "₹1,200",
      payment_link: "https://pay.example.com/abc",
      location: "Studio, MG Road",
      booking_id: "SF-202609-1234",
      ...(vars || {}),
    };
    res.json({ rendered: renderTemplate(body, sample), variables: extractVariables(body) });
  })
);

export default router;
