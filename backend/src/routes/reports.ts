import { Router } from "express";
import { db, num } from "../db";
import { countRows } from "../db/queries";
import { asyncHandler } from "../utils/http";
import { requireAuth, requireMinRole } from "../middleware/auth";

const router = Router();
router.use(requireAuth, requireMinRole("MANAGER"));

function range(req: { query: Record<string, unknown> }) {
  const preset = String(req.query.preset || "month");
  const now = new Date();
  let from: Date;
  let to: Date = now;
  if (preset === "today") {
    from = new Date(now);
    from.setHours(0, 0, 0, 0);
  } else if (preset === "week") {
    from = new Date(now.getTime() - 7 * 86400_000);
  } else if (preset === "custom" && req.query.from) {
    from = new Date(String(req.query.from));
    if (req.query.to) to = new Date(String(req.query.to));
  } else {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

// GET /api/reports/overview
router.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const { from, to } = range(req);
    const bySource = await db
      .selectFrom("enquiries")
      .select(["source", (eb) => eb.fn.countAll().as("count")])
      .where("createdAt", ">=", from)
      .where("createdAt", "<=", to)
      .groupBy("source")
      .execute();
    const enqTotalRow = await db.selectFrom("enquiries").select((eb) => eb.fn.countAll().as("count")).where("createdAt", ">=", from).where("createdAt", "<=", to).executeTakeFirst();
    const enqConvRow = await db.selectFrom("enquiries").select((eb) => eb.fn.countAll().as("count")).where("createdAt", ">=", from).where("createdAt", "<=", to).where("status", "=", "CONVERTED").executeTakeFirst();
    const revRow = await db
      .selectFrom("payments")
      .select((eb) => [eb.fn.sum("amount").as("total"), eb.fn.countAll().as("count")])
      .where("receivedAt", ">=", from)
      .where("receivedAt", "<=", to)
      .where("status", "=", "COMPLETED")
      .executeTakeFirst();
    const bookingRows = await db
      .selectFrom("bookings")
      .select(["amountPaid", "sessionId"])
      .where("createdAt", ">=", from)
      .where("createdAt", "<=", to)
      .where("status", "not in", ["CANCELLED", "NO_SHOW"])
      .execute();
    const cancelRow = await db.selectFrom("bookings").select((eb) => eb.fn.countAll().as("count")).where("createdAt", ">=", from).where("createdAt", "<=", to).where("status", "=", "CANCELLED").executeTakeFirst();
    const noShowRow = await db.selectFrom("bookings").select((eb) => eb.fn.countAll().as("count")).where("createdAt", ">=", from).where("createdAt", "<=", to).where("status", "=", "NO_SHOW").executeTakeFirst();
    const outRow = await db
      .selectFrom("bookings")
      .select((eb) => [eb.fn.sum("totalAmount").as("total"), eb.fn.sum("amountPaid").as("paid"), eb.fn.countAll().as("count")])
      .where("paymentStatus", "in", ["UNPAID", "PARTIALLY_PAID"])
      .where("status", "not in", ["CANCELLED", "NO_SHOW"])
      .executeTakeFirst();
    const bookTotalRow = await db.selectFrom("bookings").select((eb) => eb.fn.countAll().as("count")).where("createdAt", ">=", from).where("createdAt", "<=", to).where("status", "not in", ["CANCELLED"]).executeTakeFirst();
    const payRows = await db.selectFrom("payments").select(["method", "amount", "status"]).where("receivedAt", ">=", from).where("receivedAt", "<=", to).execute();

    const revenueByWorkshopMap = new Map<string, number>();
    for (const b of bookingRows) {
      const s = await db.selectFrom("sessions").select("workshopId").where("id", "=", b.sessionId).executeTakeFirst();
      const w = s ? await db.selectFrom("workshops").select("name").where("id", "=", s.workshopId).executeTakeFirst() : null;
      const name = w?.name || "Unknown";
      revenueByWorkshopMap.set(name, (revenueByWorkshopMap.get(name) || 0) + num(b.amountPaid));
    }
    const revenueByWorkshop = [...revenueByWorkshopMap.entries()].map(([name, revenue]) => ({ name, revenue })).sort((a, b) => b.revenue - a.revenue);

    const popRaw = await db
      .selectFrom("bookings")
      .select(["sessionId", (eb) => eb.fn.countAll().as("count")])
      .where("createdAt", ">=", from)
      .where("createdAt", "<=", to)
      .where("status", "not in", ["CANCELLED", "NO_SHOW"])
      .groupBy("sessionId")
      .orderBy("count", "desc")
      .limit(10)
      .execute();
    const popularWorkshops: { name: string; bookings: number }[] = [];
    for (const p of popRaw) {
      const s = await db.selectFrom("sessions").select("workshopId").where("id", "=", p.sessionId).executeTakeFirst();
      const w = s ? await db.selectFrom("workshops").select("name").where("id", "=", s.workshopId).executeTakeFirst() : null;
      const name = w?.name || "Unknown";
      const f = popularWorkshops.find((a) => a.name === name);
      if (f) f.bookings += countRows(p);
      else popularWorkshops.push({ name, bookings: countRows(p) });
    }

    const bookingCounts = await db.selectFrom("bookings").select(["customerId", (eb) => eb.fn.countAll().as("count")]).groupBy("customerId").execute();
    const withBookings = bookingCounts.length;
    const returning = bookingCounts.filter((b) => Number(b.count) > 1).length;

    const convos = await db.selectFrom("conversations").select("id").orderBy("lastMessageAt", "desc").limit(100).execute();
    let totalResponseMs = 0;
    let responseSamples = 0;
    for (const c of convos) {
      const firstIn = await db.selectFrom("messages").select("createdAt").where("conversationId", "=", c.id).where("direction", "=", "IN").orderBy("createdAt", "asc").executeTakeFirst();
      if (!firstIn) continue;
      const firstOut = await db
        .selectFrom("messages")
        .select("createdAt")
        .where("conversationId", "=", c.id)
        .where("direction", "=", "OUT")
        .where("isNote", "=", false)
        .where("createdAt", ">", String(firstIn.createdAt))
        .orderBy("createdAt", "asc")
        .executeTakeFirst();
      if (firstOut) {
        totalResponseMs += new Date(String(firstOut.createdAt)).getTime() - new Date(String(firstIn.createdAt)).getTime();
        responseSamples++;
      }
    }
    const avgResponseMins = responseSamples ? Math.round(totalResponseMs / responseSamples / 60000) : 0;

    const byMethod = payRows
      .filter((p) => p.status === "COMPLETED")
      .reduce<Record<string, number>>((acc, p) => {
        acc[p.method] = (acc[p.method] || 0) + num(p.amount);
        return acc;
      }, {});

    const enquiriesTotal = countRows(enqTotalRow);
    const enquiriesConverted = countRows(enqConvRow);
    const bookingsTotal = countRows(bookTotalRow);

    res.json({
      from,
      to,
      enquiriesBySource: bySource.map((e) => ({ source: e.source, count: Number(e.count) })),
      enquiriesTotal,
      enquiriesConverted,
      conversionRate: enquiriesTotal ? Math.round((enquiriesConverted / enquiriesTotal) * 100) : 0,
      bookingsTotal,
      bookingConversionRate: enquiriesTotal ? Math.round((bookingsTotal / enquiriesTotal) * 100) : 0,
      revenue: num(revRow?.total),
      paymentsCount: countRows(revRow),
      revenueByWorkshop,
      popularWorkshops,
      cancelled: countRows(cancelRow),
      noShows: countRows(noShowRow),
      outstanding: { amount: num(outRow?.total) - num(outRow?.paid), count: countRows(outRow) },
      returnRate: withBookings ? Math.round((returning / withBookings) * 100) : 0,
      avgResponseMins,
      responseSamples,
      byMethod: Object.entries(byMethod).map(([method, amount]) => ({ method, amount })),
    });
  })
);

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /api/reports/export?type=bookings|payments|customers|enquiries
router.get(
  "/export",
  asyncHandler(async (req, res) => {
    const type = String(req.query.type || "bookings");
    const { from, to } = range(req);
    let header: string[] = [];
    let rows: unknown[][] = [];
    if (type === "bookings") {
      header = ["BookingCode", "Customer", "Phone", "Workshop", "SessionDate", "Participants", "Total", "Paid", "PaymentStatus", "Status", "Source", "CreatedAt"];
      const data = await db.selectFrom("bookings").selectAll().where("createdAt", ">=", from).where("createdAt", "<=", to).orderBy("createdAt", "desc").limit(2000).execute();
      for (const b of data) {
        const c = await db.selectFrom("customers").select(["firstName", "lastName", "phone"]).where("id", "=", b.customerId).executeTakeFirst();
        const s = await db.selectFrom("sessions").select(["startsAt", "workshopId"]).where("id", "=", b.sessionId).executeTakeFirst();
        const w = s ? await db.selectFrom("workshops").select("name").where("id", "=", s.workshopId).executeTakeFirst() : null;
        rows.push([b.bookingCode, `${c?.firstName || ""} ${c?.lastName || ""}`.trim(), c?.phone, w?.name, s ? String(s.startsAt) : "", b.participants, b.totalAmount, b.amountPaid, b.paymentStatus, b.status, b.source, String(b.createdAt)]);
      }
    } else if (type === "payments") {
      header = ["Date", "BookingCode", "Customer", "Amount", "Method", "Reference", "Status"];
      const data = await db.selectFrom("payments").selectAll().where("receivedAt", ">=", from).where("receivedAt", "<=", to).orderBy("receivedAt", "desc").limit(2000).execute();
      for (const p of data) {
        const b = await db.selectFrom("bookings").select("bookingCode").where("id", "=", p.bookingId).executeTakeFirst();
        const c = await db.selectFrom("customers").select(["firstName", "lastName"]).where("id", "=", p.customerId).executeTakeFirst();
        rows.push([String(p.receivedAt), b?.bookingCode, `${c?.firstName || ""} ${c?.lastName || ""}`.trim(), p.amount, p.method, p.reference, p.status]);
      }
    } else if (type === "customers") {
      header = ["FirstName", "LastName", "Phone", "Email", "Source", "Status", "CreatedAt"];
      const data = await db.selectFrom("customers").selectAll().where("createdAt", ">=", from).where("createdAt", "<=", to).orderBy("createdAt", "desc").limit(2000).execute();
      rows = data.map((c) => [c.firstName, c.lastName, c.phone, c.email, c.source, c.status, String(c.createdAt)]);
    } else {
      header = ["Date", "Name", "Phone", "Email", "Source", "Status", "Message"];
      const data = await db.selectFrom("enquiries").selectAll().where("createdAt", ">=", from).where("createdAt", "<=", to).orderBy("createdAt", "desc").limit(2000).execute();
      rows = data.map((e) => [String(e.createdAt), e.name, e.phone, e.email, e.source, e.status, e.message]);
    }
    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="studioflow-${type}.csv"`);
    res.send(csv);
  })
);

export default router;
