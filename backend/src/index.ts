import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { config } from "./config";
import { errorHandler } from "./middleware/errorHandler";
import { startScheduler } from "./services/scheduler";
import { runMigrations } from "./db/migrate";

import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import customerRoutes from "./routes/customers";
import conversationRoutes from "./routes/conversations";
import enquiryRoutes from "./routes/enquiries";
import workshopRoutes from "./routes/workshops";
import sessionRoutes from "./routes/sessions";
import bookingRoutes from "./routes/bookings";
import paymentRoutes from "./routes/payments";
import followupRoutes from "./routes/followups";
import automationRoutes from "./routes/automations";
import templateRoutes from "./routes/templates";
import settingsRoutes from "./routes/settings";
import notificationRoutes from "./routes/notifications";
import searchRoutes from "./routes/search";
import dashboardRoutes from "./routes/dashboard";
import reportRoutes from "./routes/reports";
import webhookRoutes from "./routes/webhooks";
import publicRoutes from "./routes/public";
import auditRoutes from "./routes/audit";
import calendarRoutes from "./routes/calendar";

async function main() {
  await runMigrations();

  const app = express();
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(
    cors({
      origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(",").map((s) => s.trim()),
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(config.isDev ? "dev" : "combined"));

  const apiLimiter = rateLimit({ windowMs: 60_000, max: 600, standardHeaders: true, legacyHeaders: false });
  app.use("/api/", apiLimiter);
  const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: 100, standardHeaders: true, legacyHeaders: false });
  app.use("/api/auth/", authLimiter);

  app.get("/api/health", (_req, res) => res.json({ ok: true, service: "studioflow-backend", time: new Date().toISOString() }));

  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/customers", customerRoutes);
  app.use("/api/conversations", conversationRoutes);
  app.use("/api/enquiries", enquiryRoutes);
  app.use("/api/workshops", workshopRoutes);
  app.use("/api/sessions", sessionRoutes);
  app.use("/api/bookings", bookingRoutes);
  app.use("/api/payments", paymentRoutes);
  app.use("/api/followups", followupRoutes);
  app.use("/api/automations", automationRoutes);
  app.use("/api/templates", templateRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/search", searchRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/webhooks", webhookRoutes);
  app.use("/api/public", publicRoutes);
  app.use("/api/audit", auditRoutes);
  app.use("/api/calendar", calendarRoutes);

  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));
  app.use(errorHandler);

  app.listen(config.port, "0.0.0.0", () => {
    console.log(`[studioflow] backend listening on :${config.port} (${config.nodeEnv})`);
    startScheduler();
  });
}

main().catch((e) => {
  console.error("Failed to start:", e);
  process.exit(1);
});
