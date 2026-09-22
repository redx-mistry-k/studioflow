import { Router } from "express";
import { db } from "../db";
import { contains } from "../db/queries";
import { asyncHandler } from "../utils/http";
import { requireAuth } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

// GET /api/search?q=... — global search
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.json({ customers: [], bookings: [], sessions: [], conversations: [] });
    const customers = await db
      .selectFrom("customers")
      .select(["id", "firstName", "lastName", "phone", "email"])
      .where((eb) =>
        eb.or([contains(eb, "firstName", q), contains(eb, "lastName", q), contains(eb, "phone", q), contains(eb, "email", q), contains(eb, "whatsappNumber", q)])
      )
      .limit(6)
      .execute();
    const bookings = await db
      .selectFrom("bookings as b")
      .innerJoin("customers as c", "c.id", "b.customerId")
      .select(["b.id", "b.bookingCode", "b.status", "c.firstName", "c.lastName"])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .where((eb: any) => eb.or([contains(eb, "b.bookingCode", q), contains(eb, "c.firstName", q), contains(eb, "c.phone", q)]))
      .limit(6)
      .execute();
    const sessions = await db
      .selectFrom("sessions as s")
      .innerJoin("workshops as w", "w.id", "s.workshopId")
      .select(["s.id", "s.title", "s.startsAt", "w.name as workshopName"])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .where((eb: any) => eb.or([contains(eb, "s.title", q), contains(eb, "w.name", q), contains(eb, "s.instructor", q)]))
      .limit(6)
      .execute();
    const conversations = await db
      .selectFrom("conversations as cv")
      .innerJoin("customers as c", "c.id", "cv.customerId")
      .select(["cv.id", "cv.channel", "cv.status", "c.firstName", "c.lastName"])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .where((eb: any) => eb.or([contains(eb, "c.firstName", q), contains(eb, "c.phone", q)]))
      .limit(6)
      .execute();
    res.json({
      customers,
      bookings: bookings.map((b) => ({ id: b.id, bookingCode: b.bookingCode, status: b.status, customer: { firstName: b.firstName, lastName: b.lastName } })),
      sessions: sessions.map((s) => ({ id: s.id, title: s.title, startsAt: s.startsAt, workshop: { name: s.workshopName } })),
      conversations: conversations.map((c) => ({ id: c.id, channel: c.channel, status: c.status, customer: { firstName: c.firstName, lastName: c.lastName } })),
    });
  })
);

export default router;
