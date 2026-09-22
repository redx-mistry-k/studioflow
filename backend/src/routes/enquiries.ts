import { Router } from "express";
import { z } from "zod";
import { db, uuid, nowIso } from "../db";
import { mapEnquiry } from "../db/map";
import { contains, countRows } from "../db/queries";
import { asyncHandler, validate, pagination, paged, ApiError } from "../utils/http";
import { requireAuth } from "../middleware/auth";
import { audit } from "../services/audit";
import { findOrCreateCustomer, findOrCreateConversation } from "../services/inbox";
import { notifyStaff } from "../services/notifications";
import { fireTrigger } from "../services/automation";

const router = Router();
router.use(requireAuth);

const enquirySchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  workshopId: z.string().optional().nullable(),
  preferredDate: z.string().optional().nullable(),
  participants: z.number().int().min(1).optional().default(1),
  message: z.string().optional().nullable(),
  source: z.string().optional().default("MANUAL"),
});

// GET /api/enquiries
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pagination(req);
    const status = String(req.query.status || "");
    const source = String(req.query.source || "");
    const q = String(req.query.q || "").trim();
    let base = db.selectFrom("enquiries").selectAll();
    if (status) base = base.where("status", "=", status);
    if (source) base = base.where("source", "=", source);
    if (q) {
      base = base.where((eb) => eb.or([contains(eb, "name", q), contains(eb, "phone", q), contains(eb, "email", q), contains(eb, "message", q)]));
    }
    const totalRow = await base.clearSelect().select((eb) => eb.fn.countAll().as("count")).executeTakeFirst();
    const rows = await base.clearSelect().selectAll().orderBy("createdAt", "desc").limit(limit).offset(skip).execute();
    const data = await Promise.all(
      rows.map(async (e) => {
        const customer = e.customerId
          ? await db.selectFrom("customers").select(["id", "firstName", "lastName"]).where("id", "=", e.customerId).executeTakeFirst()
          : null;
        const workshop = e.workshopId
          ? await db.selectFrom("workshops").select(["id", "name"]).where("id", "=", e.workshopId).executeTakeFirst()
          : null;
        const conversation = e.conversationId
          ? await db.selectFrom("conversations").select(["id", "status"]).where("id", "=", e.conversationId).executeTakeFirst()
          : null;
        return { ...mapEnquiry(e), customer: customer ?? null, workshop: workshop ?? null, conversation: conversation ?? null };
      })
    );
    res.json(paged(data, countRows(totalRow), page, limit));
  })
);

// POST /api/enquiries
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = validate(enquirySchema, req.body);
    const parts = body.name.trim().split(/\s+/);
    const customer = await findOrCreateCustomer({
      firstName: parts[0],
      lastName: parts.slice(1).join(" "),
      phone: body.phone,
      email: body.email,
      source: body.source || "MANUAL",
    });
    const conversation = await findOrCreateConversation(customer.id, (body.source as "WEBSITE" | "MANUAL") || "MANUAL");
    const msgText =
      body.message ||
      `Enquiry for ${body.workshopId ? "workshop" : "classes"}${body.preferredDate ? ` on ${body.preferredDate}` : ""} (${body.participants || 1} participant(s))`;
    const now = nowIso();
    await db
      .insertInto("messages")
      .values({
        id: uuid(),
        conversationId: conversation.id,
        direction: "IN",
        channel: conversation.channel,
        senderType: "CUSTOMER",
        senderName: body.name,
        body: msgText,
        createdAt: now,
      })
      .execute();
    await db
      .updateTable("conversations")
      .set((eb) => ({ lastMessageAt: now, unreadCount: eb("unreadCount", "+", 1), status: "NEW", updatedAt: now }))
      .where("id", "=", conversation.id)
      .execute();
    const enquiry = await db
      .insertInto("enquiries")
      .values({
        id: uuid(),
        customerId: customer.id,
        conversationId: conversation.id,
        name: body.name,
        phone: body.phone || null,
        email: body.email || null,
        workshopId: body.workshopId || null,
        preferredDate: body.preferredDate || null,
        participants: body.participants || 1,
        message: body.message || null,
        source: body.source || "MANUAL",
        status: "NEW",
        createdAt: now,
        updatedAt: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const mapped = mapEnquiry(enquiry);
    await notifyStaff({
      type: "NEW_ENQUIRY",
      title: "New enquiry",
      body: `${body.name}: ${msgText.slice(0, 120)}`,
      entityType: "Enquiry",
      entityId: mapped.id,
    });
    await audit(req.user!.sub, "ENQUIRY_CREATED", "Enquiry", mapped.id, undefined, mapped);
    await fireTrigger("ENQUIRY_RECEIVED", "Enquiry", mapped.id, { enquiry: mapped, customer, conversation });
    res.status(201).json(mapped);
  })
);

// PATCH /api/enquiries/:id
router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const schema = z.object({ status: z.string().min(1) });
    const { status } = validate(schema, req.body);
    const existing = await db.selectFrom("enquiries").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!existing) throw new ApiError(404, "Enquiry not found");
    const updated = await db
      .updateTable("enquiries")
      .set({ status, updatedAt: nowIso() })
      .where("id", "=", req.params.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    await audit(req.user!.sub, "ENQUIRY_UPDATED", "Enquiry", updated.id, { status: existing.status }, { status });
    res.json(mapEnquiry(updated));
  })
);

export default router;
