import { Router } from "express";
import { z } from "zod";
import { db, uuid, nowIso, jstr, num } from "../db";
import { mapCustomer, mapConversation, mapBooking, mapSession, mapWorkshop, mapPayment, mapFollowUp, mapAudit } from "../db/map";
import { contains, countRows } from "../db/queries";
import { asyncHandler, validate, pagination, paged, ApiError } from "../utils/http";
import { requireAuth } from "../middleware/auth";
import { audit } from "../services/audit";
import { fireTrigger } from "../services/automation";

const router = Router();
router.use(requireAuth);

const customerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional().default(""),
  phone: z.string().optional().nullable(),
  whatsappNumber: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  instagramHandle: z.string().optional().nullable(),
  source: z.string().optional().default("MANUAL"),
  status: z.string().optional().default("ACTIVE"),
  dateOfBirth: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().default([]),
});

// GET /api/customers
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pagination(req);
    const q = String(req.query.q || "").trim();
    const source = String(req.query.source || "");
    const status = String(req.query.status || "");
    const sort = String(req.query.sort || "createdAt:desc");
    const [sortField, sortDir] = sort.split(":");
    const dir = sortDir === "asc" ? "asc" : "desc";
    const orderCol = (["createdAt", "firstName", "updatedAt"] as const).includes(sortField as never) ? (sortField as "createdAt") : "createdAt";

    let base = db.selectFrom("customers").selectAll();
    if (source) base = base.where("source", "=", source);
    if (status) base = base.where("status", "=", status);
    if (q) {
      base = base.where((eb) =>
        eb.or([
          contains(eb, "firstName", q),
          contains(eb, "lastName", q),
          contains(eb, "phone", q),
          contains(eb, "email", q),
          contains(eb, "whatsappNumber", q),
          contains(eb, "instagramHandle", q),
        ])
      );
    }
    const totalRow = await base
      .clearSelect()
      .clearOrderBy()
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirst();
    const rows = await base.orderBy(orderCol, dir).limit(limit).offset(skip).execute();

    // Aggregates per customer (bookings count, spend)
    const shaped = await Promise.all(
      rows.map(async (c) => {
        const agg = await db
          .selectFrom("bookings")
          .select((eb) => [eb.fn.countAll().as("count"), eb.fn.sum("amountPaid").as("paid"), eb.fn.sum("totalAmount").as("booked")])
          .where("customerId", "=", c.id)
          .executeTakeFirst();
        const convRow = await db
          .selectFrom("conversations")
          .select((eb) => eb.fn.countAll().as("count"))
          .where("customerId", "=", c.id)
          .executeTakeFirst();
        return {
          ...mapCustomer(c),
          bookingsCount: countRows(agg),
          conversationsCount: countRows(convRow),
          totalSpend: num(agg?.paid),
          totalBooked: num(agg?.booked),
        };
      })
    );
    res.json(paged(shaped, countRows(totalRow), page, limit));
  })
);

// GET /api/customers/:id — full profile
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const c = await db.selectFrom("customers").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!c) throw new ApiError(404, "Customer not found");
    const customer = mapCustomer(c);

    const convos = await db
      .selectFrom("conversations")
      .selectAll()
      .where("customerId", "=", c.id)
      .orderBy("lastMessageAt", "desc")
      .limit(20)
      .execute();
    const convosWithAssignee = await Promise.all(
      convos.map(async (cv) => {
        const assignee = cv.assignedToId
          ? await db.selectFrom("users").select(["id", "name"]).where("id", "=", cv.assignedToId).executeTakeFirst()
          : null;
        return { ...mapConversation(cv), assignedTo: assignee ?? null };
      })
    );

    const bookingRows = await db
      .selectFrom("bookings")
      .selectAll()
      .where("customerId", "=", c.id)
      .orderBy("createdAt", "desc")
      .execute();
    const bookings = await Promise.all(
      bookingRows.map(async (b) => {
        const s = await db.selectFrom("sessions").selectAll().where("id", "=", b.sessionId).executeTakeFirst();
        const w = s ? await db.selectFrom("workshops").selectAll().where("id", "=", s.workshopId).executeTakeFirst() : null;
        const pays = await db.selectFrom("payments").selectAll().where("bookingId", "=", b.id).orderBy("receivedAt", "desc").execute();
        return { ...mapBooking(b), session: s ? { ...mapSession(s), workshop: w ? mapWorkshop(w) : null } : null, payments: pays.map(mapPayment) };
      })
    );

    const payRows = await db.selectFrom("payments").selectAll().where("customerId", "=", c.id).orderBy("receivedAt", "desc").limit(50).execute();
    const fuRows = await db.selectFrom("followUps").selectAll().where("customerId", "=", c.id).orderBy("dueAt", "desc").limit(50).execute();
    const followUps = await Promise.all(
      fuRows.map(async (f) => {
        const assignee = f.assignedToId
          ? await db.selectFrom("users").select(["id", "name"]).where("id", "=", f.assignedToId).executeTakeFirst()
          : null;
        return { ...mapFollowUp(f), assignedTo: assignee ?? null };
      })
    );

    const totalSpend = bookings.reduce((s, b) => s + b.amountPaid, 0);
    const completedClasses = bookings.filter((b) => b.status === "COMPLETED").length;
    const now = Date.now();
    const nextBooking =
      bookings
        .filter((b) => ["PENDING", "CONFIRMED"].includes(b.status) && b.session && new Date(b.session.startsAt).getTime() >= now)
        .sort((a, b) => +new Date(a.session!.startsAt) - +new Date(b.session!.startsAt))[0] || null;

    const auditRows = await db
      .selectFrom("auditLogs")
      .selectAll()
      .where("entityType", "=", "Customer")
      .where("entityId", "=", c.id)
      .orderBy("createdAt", "desc")
      .limit(30)
      .execute();
    const activity = await Promise.all(
      auditRows.map(async (a) => {
        const u = a.userId ? await db.selectFrom("users").select("name").where("id", "=", a.userId).executeTakeFirst() : null;
        return { ...mapAudit(a), user: u ?? null };
      })
    );

    res.json({
      customer: { ...customer, conversations: convosWithAssignee, bookings, payments: payRows.map(mapPayment), followUps },
      stats: { totalSpend, completedClasses, nextBooking },
      activity,
    });
  })
);

// POST /api/customers — with duplicate detection
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = validate(customerSchema, req.body);
    const hasIds = body.phone || body.whatsappNumber || body.email || body.instagramHandle;
    if (req.query.skipDuplicateCheck !== "true" && hasIds) {
      let q = db.selectFrom("customers").selectAll();
      q = q.where((eb) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ors: any[] = [];
        if (body.phone) ors.push(eb("phone", "=", body.phone as string), eb("whatsappNumber", "=", body.phone as string));
        if (body.whatsappNumber) ors.push(eb("whatsappNumber", "=", body.whatsappNumber as string), eb("phone", "=", body.whatsappNumber as string));
        if (body.email) ors.push(eb("email", "=", body.email as string));
        if (body.instagramHandle) ors.push(eb("instagramHandle", "=", body.instagramHandle as string));
        return eb.or(ors);
      });
      const dup = await q.executeTakeFirst();
      if (dup) throw new ApiError(409, "Possible duplicate customer found", { duplicateId: dup.id, duplicate: mapCustomer(dup) });
    }
    const now = nowIso();
    const created = await db
      .insertInto("customers")
      .values({
        id: uuid(),
        firstName: body.firstName,
        lastName: body.lastName || "",
        phone: body.phone || null,
        whatsappNumber: body.whatsappNumber || null,
        email: body.email || null,
        instagramHandle: body.instagramHandle || null,
        source: body.source || "MANUAL",
        status: body.status || "ACTIVE",
        dateOfBirth: body.dateOfBirth || null,
        address: body.address || null,
        notes: body.notes || null,
        tags: jstr(body.tags || []),
        createdAt: now,
        updatedAt: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    const mapped = mapCustomer(created);
    await audit(req.user!.sub, "CUSTOMER_CREATED", "Customer", mapped.id, undefined, mapped);
    await fireTrigger("CUSTOMER_CREATED", "Customer", mapped.id, { customer: mapped });
    res.status(201).json(mapped);
  })
);

// PUT /api/customers/:id
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const body = validate(customerSchema.partial(), req.body);
    const existing = await db.selectFrom("customers").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!existing) throw new ApiError(404, "Customer not found");
    const patch: Record<string, unknown> = { updatedAt: nowIso() };
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      if (k === "tags") patch.tags = jstr(v);
      else if (k === "email" && v === "") patch.email = null;
      else patch[k] = v;
    }
    const updated = await db
      .updateTable("customers")
      .set(patch as never)
      .where("id", "=", req.params.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    const mapped = mapCustomer(updated);
    await audit(req.user!.sub, "CUSTOMER_UPDATED", "Customer", mapped.id, mapCustomer(existing), mapped);
    res.json(mapped);
  })
);

// DELETE /api/customers/:id
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await db.selectFrom("customers").selectAll().where("id", "=", req.params.id).executeTakeFirst();
    if (!existing) throw new ApiError(404, "Customer not found");
    await db.deleteFrom("customers").where("id", "=", req.params.id).execute();
    await audit(req.user!.sub, "CUSTOMER_DELETED", "Customer", req.params.id, mapCustomer(existing));
    res.json({ ok: true });
  })
);

export default router;
