// StudioFlow demo seed. Idempotent: skips if users already exist.
import { db, uuid, nowIso, jstr } from "./db";
import { countRows } from "./db/queries";
import { runMigrations } from "./db/migrate";
import { hashPassword } from "./utils/auth";

const firstNames = [
  ["Priya", "Sharma"], ["Rahul", "Verma"], ["Ananya", "Iyer"], ["Vikram", "Mehta"],
  ["Sneha", "Kulkarni"], ["Arjun", "Nair"], ["Kavya", "Reddy"], ["Rohan", "Gupta"],
  ["Divya", "Menon"], ["Aditya", "Patel"], ["Meera", "Joshi"], ["Karan", "Singh"],
  ["Pooja", "Agarwal"], ["Nikhil", "Bose"], ["Ritu", "Malhotra"], ["Sahil", "Khan"],
  ["Anjali", "Desai"], ["Varun", "Chopra"], ["Lakshmi", "Venkat"], ["Imran", "Sheikh"],
  ["Shreya", "Ghosh"], ["Manav", "Trivedi"], ["Tara", "Kapoor"], ["Dev", "Pillai"],
  ["Naina", "Rao"],
];

const sources = ["WHATSAPP", "INSTAGRAM", "WEBSITE", "EMAIL", "MANUAL"];

async function main() {
  await runMigrations();
  const userCount = await db.selectFrom("users").select((eb) => eb.fn.countAll().as("count")).executeTakeFirst();
  if (countRows(userCount) > 0) {
    console.log("[seed] database already has users — skipping");
    return;
  }
  console.log("[seed] creating demo data...");
  const now = new Date();
  const isoNow = now.toISOString();

  // ---- Users ----
  const mkUser = async (name: string, email: string, password: string, role: string) =>
    db
      .insertInto("users")
      .values({ id: uuid(), name, email, passwordHash: await hashPassword(password), role, active: true, createdAt: isoNow, updatedAt: isoNow })
      .returningAll()
      .executeTakeFirstOrThrow();
  const admin = await mkUser("Aarav Owner", "admin@studioflow.local", "admin123", "ADMIN");
  const manager = await mkUser("Sara Manager", "manager@studioflow.local", "manager123", "MANAGER");
  const staff = await mkUser("Ravi Staff", "staff@studioflow.local", "staff123", "STAFF");

  // ---- Settings ----
  await db
    .insertInto("businessSettings")
    .values({
      id: "default",
      businessName: "StudioFlow Art Studio",
      phone: "+91 98765 43210",
      email: "hello@studioflow.local",
      address: "2nd Floor, MG Road, Bengaluru 560001",
      timezone: "Asia/Kolkata",
      currency: "INR",
      autoConfirmBookings: false,
      updatedAt: isoNow,
    })
    .execute();

  // ---- Workshops ----
  const workshopDefs = [
    { name: "Pottery Workshop", description: "Hand-building and wheel pottery for beginners. All materials included.", category: "Pottery", durationMins: 180, defaultPrice: 1499, defaultCapacity: 15, instructor: "Meera Joshi", location: "Studio A", color: "#b45309" },
    { name: "Resin Art Workshop", description: "Create coasters, trays and wall art with epoxy resin.", category: "Resin Art", durationMins: 150, defaultPrice: 1799, defaultCapacity: 12, instructor: "Arjun Nair", location: "Studio B", color: "#0d9488" },
    { name: "Canvas Painting", description: "Acrylic on canvas — a guided painting evening.", category: "Painting", durationMins: 120, defaultPrice: 999, defaultCapacity: 20, instructor: "Divya Menon", location: "Studio A", color: "#7c3aed" },
    { name: "Candle Making", description: "Soy candles, scents and styling. Take home 3 candles.", category: "Craft", durationMins: 120, defaultPrice: 1199, defaultCapacity: 16, instructor: "Sara Manager", location: "Studio B", color: "#e11d48" },
    { name: "Weekend Art Workshop", description: "A full-day creative retreat: painting, journaling and clay.", category: "Retreat", durationMins: 360, defaultPrice: 2499, defaultCapacity: 25, instructor: "Aarav Owner", location: "Terrace Studio", color: "#2563eb" },
  ];
  const workshops = [];
  for (const w of workshopDefs) {
    workshops.push(
      await db.insertInto("workshops").values({ id: uuid(), ...w, active: true, createdAt: isoNow, updatedAt: isoNow }).returningAll().executeTakeFirstOrThrow()
    );
  }

  // ---- Sessions ----
  const at = (dayOffset: number, hour: number, min = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, min, 0, 0);
    return d;
  };
  const sessionDefs = [
    { w: 0, start: at(0, 11), hours: 3 }, { w: 2, start: at(0, 17), hours: 2 },
    { w: 1, start: at(1, 10), hours: 2.5 }, { w: 3, start: at(1, 16), hours: 2 },
    { w: 0, start: at(3, 11), hours: 3 }, { w: 4, start: at(4, 10), hours: 6 },
    { w: 2, start: at(5, 17), hours: 2 }, { w: 1, start: at(6, 11), hours: 2.5 },
    { w: 3, start: at(7, 15), hours: 2 }, { w: 0, start: at(8, 11), hours: 3 },
    { w: 4, start: at(11, 10), hours: 6 }, { w: 2, start: at(12, 17), hours: 2 },
  ];
  const sessions = [];
  for (const s of sessionDefs) {
    const w = workshops[s.w];
    const startsAt = s.start;
    const endsAt = new Date(startsAt.getTime() + s.hours * 3600_000);
    sessions.push(
      await db
        .insertInto("sessions")
        .values({
          id: uuid(), workshopId: w.id, title: w.name,
          startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(),
          instructor: w.instructor, location: w.location,
          capacity: w.defaultCapacity, price: w.defaultPrice, status: "OPEN",
          createdAt: isoNow, updatedAt: isoNow,
        })
        .returningAll()
        .executeTakeFirstOrThrow()
    );
  }

  // ---- Customers ----
  const customers = [];
  for (let i = 0; i < firstNames.length; i++) {
    const [fn, ln] = firstNames[i];
    const phone = `+91 98${String(1000000 + i * 137913).slice(0, 7)}`;
    customers.push(
      await db
        .insertInto("customers")
        .values({
          id: uuid(), firstName: fn, lastName: ln, phone, whatsappNumber: phone,
          email: `${fn.toLowerCase()}.${ln.toLowerCase()}@example.com`,
          instagramHandle: i % 2 === 0 ? `@${fn.toLowerCase()}.${ln.toLowerCase()}` : null,
          source: sources[i % sources.length], status: "ACTIVE",
          tags: jstr(i % 4 === 0 ? ["VIP"] : i % 3 === 0 ? ["repeat"] : []),
          createdAt: new Date(now.getTime() - (i * 3 + 2) * 86400_000).toISOString(), updatedAt: isoNow,
        })
        .returningAll()
        .executeTakeFirstOrThrow()
    );
  }

  // ---- Bookings + payments ----
  const bookingStatuses = ["CONFIRMED", "CONFIRMED", "PENDING", "CONFIRMED", "PENDING", "COMPLETED", "CONFIRMED", "PENDING"];
  const methods = ["UPI", "CASH", "CARD", "BANK_TRANSFER", "ONLINE"];
  for (let i = 0; i < 20; i++) {
    const customer = customers[i % customers.length];
    const session = sessions[i % sessions.length];
    const participants = 1 + (i % 3 === 0 ? 1 : 0);
    const totalAmount = session.price * participants;
    const status = bookingStatuses[i % bookingStatuses.length];
    const createdAt = new Date(now.getTime() - (i % 9) * 86400_000).toISOString();
    const booking = await db
      .insertInto("bookings")
      .values({
        id: uuid(), bookingCode: `SF-202609-${1000 + i}`, customerId: customer.id, sessionId: session.id,
        participants, pricePerPerson: session.price, discount: 0, totalAmount, amountPaid: 0,
        paymentStatus: "UNPAID", status, source: sources[(i + 1) % sources.length], createdAt, updatedAt: isoNow,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    if (status === "CONFIRMED" || status === "COMPLETED" || i % 3 === 0) {
      const full = i % 3 !== 0;
      const amount = full ? totalAmount : Math.round(totalAmount / 2);
      await db
        .insertInto("payments")
        .values({
          id: uuid(), bookingId: booking.id, customerId: customer.id, amount,
          method: methods[i % methods.length], reference: `TXN${2026000 + i}`, status: "COMPLETED",
          receivedAt: new Date(new Date(createdAt).getTime() + 3600_000).toISOString(), createdById: staff.id, createdAt: isoNow,
        })
        .execute();
      await db.updateTable("bookings").set({ amountPaid: amount, paymentStatus: full ? "PAID" : "PARTIALLY_PAID" }).where("id", "=", booking.id).execute();
    }
  }

  // ---- Conversations + messages ----
  const convoSamples: { c: number; channel: string; status: string; msgs: [string, string][] }[] = [
    { c: 0, channel: "WHATSAPP", status: "NEW", msgs: [["IN", "Hi! Do you have pottery slots this weekend?"]] },
    { c: 1, channel: "INSTAGRAM", status: "OPEN", msgs: [["IN", "Hey! Loved your resin art reel. When is the next batch?"], ["OUT", "Hi Rahul! Thanks so much. Our next Resin Art batch is tomorrow at 10 AM. Want me to hold a seat?"]] },
    { c: 2, channel: "WEBSITE", status: "NEW", msgs: [["IN", "I'm interested in Canvas Painting for 2 participants next week."]] },
    { c: 3, channel: "EMAIL", status: "OPEN", msgs: [["IN", "What is the duration of the candle making workshop?"], ["OUT", "Hi Vikram, it's a 2-hour session and you take home 3 candles!"]] },
    { c: 4, channel: "WHATSAPP", status: "AWAITING_CUSTOMER", msgs: [["IN", "Is the weekend retreat suitable for kids?"], ["OUT", "Hi Sneha! Yes, kids 8+ are welcome with a parent. Shall I book 2 seats?"]] },
    { c: 5, channel: "WHATSAPP", status: "OPEN", msgs: [["IN", "Can I reschedule my booking to Sunday?"], ["IN", "My booking ID is SF-202609-1005"]] },
    { c: 6, channel: "INSTAGRAM", status: "NEW", msgs: [["IN", "Price for pottery workshop?"]] },
    { c: 7, channel: "WEBSITE", status: "FOLLOW_UP", msgs: [["IN", "Need bulk booking for 8 people for a team outing."], ["OUT", "Hi Rohan! We offer group discounts for 6+. I'll call you today to plan this."]] },
    { c: 8, channel: "EMAIL", status: "RESOLVED", msgs: [["IN", "Thank you! The painting class was wonderful."], ["OUT", "So glad you enjoyed it, Divya! Hope to see you again soon."]] },
    { c: 9, channel: "WHATSAPP", status: "OPEN", msgs: [["IN", "I paid via UPI, please confirm my booking"]] },
    { c: 10, channel: "MANUAL", status: "OPEN", msgs: [["IN", "Walk-in: asked about weekend retreat dates"]] },
    { c: 11, channel: "WHATSAPP", status: "NEW", msgs: [["IN", "Hi, location please?"]] },
    { c: 12, channel: "INSTAGRAM", status: "OPEN", msgs: [["IN", "Do beginners need to bring anything?"], ["OUT", "Nothing at all, Pooja — all materials are included!"]] },
    { c: 13, channel: "WEBSITE", status: "NEW", msgs: [["IN", "Resin art for 3 participants, preferred date next Saturday."]] },
    { c: 14, channel: "EMAIL", status: "OPEN", msgs: [["IN", "Can I get a refund? I can't attend anymore."], ["OUT", "Hi Ritu, sorry to hear that. We can reschedule you free of charge or process a refund — which would you prefer?"]] },
  ];
  for (let i = 0; i < convoSamples.length; i++) {
    const s = convoSamples[i];
    const customer = customers[s.c];
    const convo = await db
      .insertInto("conversations")
      .values({
        id: uuid(), customerId: customer.id, channel: s.channel, status: s.status,
        assignedToId: i % 3 === 0 ? staff.id : i % 3 === 1 ? manager.id : null,
        lastMessageAt: new Date(now.getTime() - i * 3600_000).toISOString(),
        unreadCount: s.status === "NEW" ? 1 : 0, tags: jstr([]), createdAt: isoNow, updatedAt: isoNow,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    let t = now.getTime() - (i + 1) * 3600_000;
    for (const [dir, body] of s.msgs) {
      t += 15 * 60_000;
      await db
        .insertInto("messages")
        .values({
          id: uuid(), conversationId: convo.id, direction: dir, channel: s.channel,
          senderType: dir === "IN" ? "CUSTOMER" : "STAFF",
          senderName: dir === "IN" ? `${customer.firstName} ${customer.lastName}`.trim() : "Ravi Staff",
          body, createdAt: new Date(t).toISOString(),
        })
        .execute();
    }
    await db.updateTable("conversations").set({ lastMessageAt: new Date(t).toISOString() }).where("id", "=", convo.id).execute();
    if (i < 6) {
      await db
        .insertInto("enquiries")
        .values({
          id: uuid(), customerId: customer.id, conversationId: convo.id,
          name: `${customer.firstName} ${customer.lastName}`.trim(), phone: customer.phone, email: customer.email,
          participants: 2, message: s.msgs[0][1], source: s.channel, status: i === 5 ? "CONVERTED" : "NEW",
          createdAt: new Date(now.getTime() - (i + 1) * 7200_000).toISOString(), updatedAt: isoNow,
        })
        .execute();
    }
  }

  // ---- Follow-ups ----
  const reasons = ["Confirm weekend booking", "Payment reminder", "Share workshop details", "Post-class feedback", "Group booking discussion", "Reschedule request"];
  for (let i = 0; i < 8; i++) {
    await db
      .insertInto("followUps")
      .values({
        id: uuid(), customerId: customers[i].id, reason: reasons[i % reasons.length],
        channel: ["WHATSAPP", "CALL", "EMAIL", "INSTAGRAM"][i % 4],
        dueAt: new Date(now.getTime() + (i - 2) * 12 * 3600_000).toISOString(),
        status: i === 6 ? "COMPLETED" : "PENDING",
        assignedToId: i % 2 === 0 ? staff.id : manager.id,
        completedAt: i === 6 ? new Date(now.getTime() - 86400_000).toISOString() : null,
        createdAt: isoNow, updatedAt: isoNow,
      })
      .execute();
  }

  // ---- Templates ----
  const templates = [
    { name: "Booking Confirmation", category: "BOOKING_CONFIRMATION", channel: "ANY", body: "Hi {{customer_name}},\n\nYour booking for {{class_name}} has been confirmed.\n\nDate: {{date}}\nTime: {{time}}\nLocation: {{location}}\n\nBooking ID: {{booking_id}}\n\nSee you soon!" },
    { name: "Class Reminder", category: "CLASS_REMINDER", channel: "ANY", body: "Hi {{customer_name}}, just a reminder that {{class_name}} is tomorrow — {{date}} at {{time}}, {{location}}. Booking ID: {{booking_id}}. Reply here if you need anything!" },
    { name: "Payment Reminder", category: "PAYMENT_REMINDER", channel: "ANY", body: "Hi {{customer_name}}, a gentle reminder that {{amount}} is still due for {{class_name}} on {{date}}. Booking ID: {{booking_id}}. You can pay at the studio or reply for a payment link." },
    { name: "Thank You", category: "THANK_YOU", channel: "ANY", body: "Hi {{customer_name}}, thank you for attending {{class_name}}! We hope you had a wonderful time. We'd love to see you again soon." },
    { name: "Review Request", category: "REVIEW_REQUEST", channel: "ANY", body: "Hi {{customer_name}}, hope you're enjoying your {{class_name}} creation! If you have a minute, a Google review would mean the world to us. Thank you!" },
    { name: "Enquiry Welcome", category: "ENQUIRY", channel: "ANY", body: "Hi {{customer_name}}, thanks for reaching out! We're excited to host you for {{class_name}}. Our team will confirm your slot shortly." },
    { name: "Cancellation", category: "CANCELLATION", channel: "ANY", body: "Hi {{customer_name}}, your booking {{booking_id}} for {{class_name}} on {{date}} has been cancelled. Reply if you'd like to reschedule instead." },
  ];
  const createdTemplates: Record<string, string> = {};
  for (const t of templates) {
    const vars = [...new Set([...t.body.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]))];
    const created = await db
      .insertInto("messageTemplates")
      .values({ id: uuid(), ...t, variables: jstr(vars), active: true, createdAt: isoNow, updatedAt: isoNow })
      .returningAll()
      .executeTakeFirstOrThrow();
    createdTemplates[t.category] = created.id;
  }

  // ---- Automation rules ----
  const rules = [
    { name: "Send booking confirmation", trigger: "BOOKING_CREATED", action: "SEND_WHATSAPP", template: "BOOKING_CONFIRMATION", description: "WhatsApp the customer as soon as a booking is created." },
    { name: "24h class reminder", trigger: "SESSION_STARTING_SOON", action: "SEND_WHATSAPP", template: "CLASS_REMINDER", description: "Remind customers a day before their session." },
    { name: "Payment reminder (6h)", trigger: "PAYMENT_PENDING", action: "SEND_WHATSAPP", template: "PAYMENT_REMINDER", description: "Nudge customers with pending payments." },
    { name: "Thank you after class", trigger: "SESSION_COMPLETED", action: "SEND_WHATSAPP", template: "THANK_YOU", delayMinutes: 120, description: "Thank customers 2 hours after class ends." },
    { name: "Request review next day", trigger: "SESSION_COMPLETED", action: "SEND_WHATSAPP", template: "REVIEW_REQUEST", delayMinutes: 1440, description: "Ask for a review one day after class." },
    { name: "Follow up on unanswered enquiry", trigger: "NO_CUSTOMER_RESPONSE", action: "CREATE_FOLLOWUP", actionConfig: { reason: "No response to enquiry — follow up", channel: "WHATSAPP", dueInHours: 4 }, description: "Create a follow-up task when an enquiry goes cold." },
    { name: "Notify staff on new booking", trigger: "BOOKING_CREATED", action: "NOTIFY_STAFF", actionConfig: { title: "New booking created", body: "A new booking was created — review it in Bookings." }, description: "In-app notification for every new booking." },
  ];
  for (const r of rules) {
    await db
      .insertInto("automationRules")
      .values({
        id: uuid(), name: r.name, description: r.description, trigger: r.trigger,
        conditions: jstr({}), delayMinutes: ("delayMinutes" in r ? (r as { delayMinutes: number }).delayMinutes : 0) || 0,
        action: r.action, actionConfig: jstr(("actionConfig" in r ? (r as { actionConfig: object }).actionConfig : {}) || {}),
        templateId: ("template" in r ? createdTemplates[(r as { template: string }).template] : null) || null,
        enabled: true, createdAt: isoNow, updatedAt: isoNow,
      })
      .execute();
  }

  // ---- Notifications ----
  for (const u of [admin, manager]) {
    await db
      .insertInto("notifications")
      .values({ id: uuid(), userId: u.id, type: "NEW_ENQUIRY", title: "New enquiry", body: "Priya Sharma asked about pottery slots", entityType: "Customer", entityId: customers[0].id, read: false, createdAt: isoNow })
      .execute();
  }
  await db
    .insertInto("notifications")
    .values({ id: uuid(), userId: staff.id, type: "FOLLOWUP_OVERDUE", title: "Follow-ups due", body: "You have follow-ups due today", entityType: "FollowUp", entityId: "", read: false, createdAt: isoNow })
    .execute();

  await db
    .insertInto("auditLogs")
    .values({ id: uuid(), userId: admin.id, action: "SEED", entityType: "System", entityId: "seed", newValue: jstr({ ok: true }), createdAt: isoNow })
    .execute();

  console.log("[seed] done!");
  console.log("[seed] logins: admin@studioflow.local/admin123, manager@studioflow.local/manager123, staff@studioflow.local/staff123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.destroy().catch(() => undefined);
    process.exit(0);
  });
