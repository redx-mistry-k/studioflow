import { Router } from "express";
import { db, num } from "../db";
import { mapSession, mapWorkshop } from "../db/map";
import { asyncHandler } from "../utils/http";
import { requireAuth } from "../middleware/auth";
import { deriveSessionStatus } from "./sessions";

const router = Router();
router.use(requireAuth);

// GET /api/calendar?start=ISO&end=ISO
// Returns all sessions overlapping [start, end) with booking counts,
// shaped for the week-calendar UI.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const now = new Date();
    const start = req.query.start ? new Date(String(req.query.start)) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = req.query.end
      ? new Date(String(req.query.end))
      : new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    const rows = await db
      .selectFrom("sessions as s")
      .innerJoin("workshops as w", "w.id", "s.workshopId")
      .selectAll("s")
      .select([
        "w.name as workshopName",
        "w.color as workshopColor",
        "w.instructor as workshopInstructor",
        "w.location as workshopLocation",
      ])
      .where("s.startsAt", "<", endIso)
      .where("s.endsAt", ">", startIso)
      .orderBy("s.startsAt", "asc")
      .limit(500)
      .execute();

    const ids = rows.map((r) => String(r.id));
    const counts = new Map<string, number>();
    if (ids.length) {
      const booked = await db
        .selectFrom("bookings")
        .select(["sessionId", (eb) => eb.fn.sum("participants").as("total")])
        .where("sessionId", "in", ids)
        .where("status", "not in", ["CANCELLED", "NO_SHOW"])
        .groupBy("sessionId")
        .execute();
      for (const b of booked) counts.set(String(b.sessionId), num(b.total));
    }

    const sessions = rows.map((r) => {
      const s = mapSession(r);
      const w = mapWorkshop({
        id: r.workshopId,
        name: r.workshopName,
        color: r.workshopColor,
        instructor: r.workshopInstructor,
        location: r.workshopLocation,
      });
      const participants = counts.get(s.id) || 0;
      return {
        ...s,
        title: s.title || w.name,
        instructor: s.instructor || w.instructor,
        location: s.location || w.location,
        color: w.color,
        workshop: { name: w.name },
        participants,
        available: Math.max(0, s.capacity - participants),
        computedStatus: deriveSessionStatus(participants, s.capacity, s.status),
      };
    });

    res.json({ start: startIso, end: endIso, sessions });
  })
);

export default router;
