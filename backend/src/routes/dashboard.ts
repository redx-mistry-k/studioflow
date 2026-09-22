import { Router } from "express";
import { db, num, ts } from "../db";
import { mapSession, mapWorkshop, mapConversation, mapMessage, mapFollowUp, mapBooking, mapAudit } from "../db/map";
import { countRows } from "../db/queries";
import { asyncHandler } from "../utils/http";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

function dayRange(offsetDays = 0) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + offsetDays);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

// GET /api/dashboard
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const { start: todayStart, end: todayEnd } = dayRange(0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const sessionRows = await db
      .selectFrom("sessions")
      .selectAll()
      .where("startsAt", ">=", todayStart)
      .where("startsAt", "<", todayEnd)
      .where("status", "not in", ["CANCELLED"])
      .orderBy("startsAt", "asc")
      .execute();
    const schedule = await Promise.all(
      sessionRows.map(async (s) => {
        const w = await db.selectFrom("workshops").select("name").where("id", "=", s.workshopId).executeTakeFirst();
        const partRow = await db
          .selectFrom("bookings")
          .select((eb) => eb.fn.sum("participants").as("total"))
          .where("sessionId", "=", s.id)
          .where("status", "not in", ["CANCELLED", "NO_SHOW"])
          .executeTakeFirst();
        const participants = num(partRow?.total);
        return {
          id: s.id,
          startsAt: ts(s.startsAt),
          endsAt: ts(s.endsAt),
          title: s.title || w?.name || "Session",
          instructor: s.instructor,
          participants,
          capacity: s.capacity,
          status: participants >= s.capacity ? "FULL" : s.status,
        };
      })
    );

    const newEnqRow = await db.selectFrom("enquiries").select((eb) => eb.fn.countAll().as("count")).where("createdAt", ">=", todayStart).executeTakeFirst();
    const awaitRow = await db.selectFrom("conversations").select((eb) => eb.fn.countAll().as("count")).where("status", "in", ["NEW", "OPEN"]).executeTakeFirst();
    const confRow = await db.selectFrom("bookings").select((eb) => eb.fn.countAll().as("count")).where("status", "=", "CONFIRMED").executeTakeFirst();
    const pendAgg = await db
      .selectFrom("bookings")
      .select((eb) => [eb.fn.sum("totalAmount").as("total"), eb.fn.sum("amountPaid").as("paid"), eb.fn.countAll().as("count")])
      .where("paymentStatus", "in", ["UNPAID", "PARTIALLY_PAID"])
      .where("status", "not in", ["CANCELLED", "NO_SHOW"])
      .executeTakeFirst();
    const fuRow = await db
      .selectFrom("followUps")
      .select((eb) => eb.fn.countAll().as("count"))
      .where("status", "in", ["PENDING", "OVERDUE"])
      .where("dueAt", "<", todayEnd)
      .executeTakeFirst();
    const revRow = await db
      .selectFrom("payments")
      .select((eb) => eb.fn.sum("amount").as("total"))
      .where("receivedAt", ">=", monthStart)
      .where("status", "=", "COMPLETED")
      .executeTakeFirst();
    const todayBookRow = await db.selectFrom("bookings").select((eb) => eb.fn.countAll().as("count")).where("createdAt", ">=", todayStart).executeTakeFirst();

    const todaysParticipants = schedule.reduce((s, x) => s + x.participants, 0);
    const pendingPayments = num(pendAgg?.total) - num(pendAgg?.paid);

    const attentionRows = await db
      .selectFrom("conversations")
      .selectAll()
      .where("status", "in", ["NEW", "OPEN"])
      .orderBy("lastMessageAt", "asc")
      .limit(6)
      .execute();
    const attention = await Promise.all(
      attentionRows.map(async (cv) => {
        const customer = await db.selectFrom("customers").select(["id", "firstName", "lastName"]).where("id", "=", cv.customerId).executeTakeFirst();
        const assignee = cv.assignedToId ? await db.selectFrom("users").select(["id", "name"]).where("id", "=", cv.assignedToId).executeTakeFirst() : null;
        const msgs = await db.selectFrom("messages").selectAll().where("conversationId", "=", cv.id).orderBy("createdAt", "desc").limit(1).execute();
        return { ...mapConversation(cv), customer: customer ?? null, assignedTo: assignee ?? null, messages: msgs.map(mapMessage) };
      })
    );

    const fuRows = await db
      .selectFrom("followUps")
      .selectAll()
      .where("status", "in", ["PENDING", "OVERDUE"])
      .where("dueAt", "<", todayEnd)
      .orderBy("dueAt", "asc")
      .limit(6)
      .execute();
    const followups = await Promise.all(
      fuRows.map(async (f) => {
        const customer = await db.selectFrom("customers").select(["id", "firstName", "lastName"]).where("id", "=", f.customerId).executeTakeFirst();
        return { ...mapFollowUp(f), customer: customer ?? null };
      })
    );

    const pendRows = await db
      .selectFrom("bookings")
      .selectAll()
      .where("paymentStatus", "in", ["UNPAID", "PARTIALLY_PAID"])
      .where("status", "not in", ["CANCELLED", "NO_SHOW"])
      .orderBy("createdAt", "desc")
      .limit(6)
      .execute();
    const pendingList = await Promise.all(
      pendRows.map(async (b) => {
        const customer = await db.selectFrom("customers").select(["id", "firstName", "lastName"]).where("id", "=", b.customerId).executeTakeFirst();
        const session = await db.selectFrom("sessions").selectAll().where("id", "=", b.sessionId).executeTakeFirst();
        const workshop = session ? await db.selectFrom("workshops").select("name").where("id", "=", session.workshopId).executeTakeFirst() : null;
        const mapped = mapBooking(b);
        return {
          ...mapped,
          customer: customer ?? null,
          session: session ? { startsAt: ts(session.startsAt), workshop: workshop ?? null } : null,
          balance: mapped.totalAmount - mapped.amountPaid,
        };
      })
    );

    const auditRows = await db.selectFrom("auditLogs").selectAll().orderBy("createdAt", "desc").limit(12).execute();
    const activity = await Promise.all(
      auditRows.map(async (a) => {
        const u = a.userId ? await db.selectFrom("users").select("name").where("id", "=", a.userId).executeTakeFirst() : null;
        return { ...mapAudit(a), user: u ?? null };
      })
    );

    // ---- Charts ----
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400_000).toISOString();
    const bySource = await db
      .selectFrom("enquiries")
      .select(["source", (eb) => eb.fn.countAll().as("count")])
      .where("createdAt", ">=", thirtyDaysAgo)
      .groupBy("source")
      .execute();

    const bookingsPerWeek: { week: string; bookings: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const wStart = new Date(now);
      wStart.setHours(0, 0, 0, 0);
      wStart.setDate(wStart.getDate() - i * 7 - wStart.getDay());
      const wEnd = new Date(wStart);
      wEnd.setDate(wEnd.getDate() + 7);
      const r = await db
        .selectFrom("bookings")
        .select((eb) => eb.fn.countAll().as("count"))
        .where("createdAt", ">=", wStart.toISOString())
        .where("createdAt", "<", wEnd.toISOString())
        .executeTakeFirst();
      bookingsPerWeek.push({ week: wStart.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), bookings: countRows(r) });
    }

    const monthlyRevenue: { month: string; revenue: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const r = await db
        .selectFrom("payments")
        .select((eb) => eb.fn.sum("amount").as("total"))
        .where("receivedAt", ">=", mStart.toISOString())
        .where("receivedAt", "<", mEnd.toISOString())
        .where("status", "=", "COMPLETED")
        .executeTakeFirst();
      monthlyRevenue.push({ month: mStart.toLocaleDateString("en-IN", { month: "short" }), revenue: num(r?.total) });
    }

    const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400_000).toISOString();
    const popular = await db
      .selectFrom("bookings")
      .select(["sessionId", (eb) => eb.fn.countAll().as("count")])
      .where("createdAt", ">=", ninetyDaysAgo)
      .where("status", "not in", ["CANCELLED"])
      .groupBy("sessionId")
      .orderBy("count", "desc")
      .limit(5)
      .execute();
    const popularWorkshops = await Promise.all(
      popular.map(async (p) => {
        const s = await db.selectFrom("sessions").select("workshopId").where("id", "=", p.sessionId).executeTakeFirst();
        const w = s ? await db.selectFrom("workshops").select("name").where("id", "=", s.workshopId).executeTakeFirst() : null;
        return { name: w?.name || "Unknown", bookings: countRows(p) };
      })
    );

    const totalEnqRow = await db.selectFrom("enquiries").select((eb) => eb.fn.countAll().as("count")).where("createdAt", ">=", thirtyDaysAgo).executeTakeFirst();
    const convEnqRow = await db
      .selectFrom("enquiries")
      .select((eb) => eb.fn.countAll().as("count"))
      .where("createdAt", ">=", thirtyDaysAgo)
      .where("status", "=", "CONVERTED")
      .executeTakeFirst();
    const totalEnq = countRows(totalEnqRow);
    const convEnq = countRows(convEnqRow);

    res.json({
      kpis: {
        todaysClasses: sessionRows.length,
        todaysParticipants,
        newEnquiries: countRows(newEnqRow),
        awaitingReply: countRows(awaitRow),
        confirmedBookings: countRows(confRow),
        pendingPayments,
        pendingPaymentsCount: countRows(pendAgg),
        followupsDue: countRows(fuRow),
        revenueMonth: num(revRow?.total),
        todaysBookings: countRows(todayBookRow),
      },
      schedule,
      attention,
      followups,
      pendingList,
      activity,
      charts: {
        enquiriesBySource: bySource.map((e) => ({ source: e.source, count: Number(e.count) })),
        bookingsPerWeek,
        monthlyRevenue,
        popularWorkshops,
        conversion: { total: totalEnq, converted: convEnq, rate: totalEnq ? Math.round((convEnq / totalEnq) * 100) : 0 },
      },
    });
  })
);

export default router;
export { mapSession, mapWorkshop };
