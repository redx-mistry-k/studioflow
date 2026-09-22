import { Router } from "express";
import { z } from "zod";
import { db, nowIso } from "../db";
import { mapSettings } from "../db/map";
import { asyncHandler, validate } from "../utils/http";
import { requireAuth, requireMinRole } from "../middleware/auth";
import { audit } from "../services/audit";
import { sendEmail, providerStatus } from "../services/messaging";
import { getSettings } from "../services/settings";

const router = Router();
router.use(requireAuth);

function maskSecret(v: string | null | undefined): string | null {
  if (!v) return v ?? null;
  if (v.length <= 4) return "••••";
  return `${"•".repeat(Math.min(8, v.length - 4))}${v.slice(-4)}`;
}

function sanitize(s: Record<string, unknown>, role: string) {
  const out = { ...s };
  for (const k of ["smtpPass", "whatsappAccessToken", "instagramPageAccessToken"]) {
    if (typeof out[k] === "string" && out[k]) out[k] = role === "ADMIN" ? maskSecret(out[k] as string) : null;
  }
  return out;
}

// GET /api/settings
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const s = await getSettings();
    const providers = await providerStatus();
    res.json({ settings: sanitize(s as unknown as Record<string, unknown>, req.user!.role), providers });
  })
);

// PUT /api/settings
router.put(
  "/",
  requireMinRole("MANAGER"),
  asyncHandler(async (req, res) => {
    const schema = z.object({
      businessName: z.string().optional(),
      logoUrl: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      address: z.string().nullable().optional(),
      timezone: z.string().optional(),
      currency: z.string().optional(),
      autoConfirmBookings: z.boolean().optional(),
      smtpHost: z.string().nullable().optional(),
      smtpPort: z.number().int().optional(),
      smtpUser: z.string().nullable().optional(),
      smtpPass: z.string().nullable().optional(),
      smtpFromEmail: z.string().nullable().optional(),
      smtpFromName: z.string().nullable().optional(),
      smtpEnabled: z.boolean().optional(),
      whatsappPhoneNumberId: z.string().nullable().optional(),
      whatsappBusinessAccountId: z.string().nullable().optional(),
      whatsappAccessToken: z.string().nullable().optional(),
      whatsappVerifyToken: z.string().nullable().optional(),
      whatsappEnabled: z.boolean().optional(),
      instagramPageAccessToken: z.string().nullable().optional(),
      instagramVerifyToken: z.string().nullable().optional(),
      instagramEnabled: z.boolean().optional(),
      n8nWebhookUrl: z.string().nullable().optional(),
      notificationsEnabled: z.boolean().optional(),
    });
    const body = validate(schema, req.body);
    const isAdmin = req.user!.role === "ADMIN";
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) if (v !== undefined) data[k] = v;
    if (!isAdmin) {
      for (const k of ["smtpHost", "smtpPort", "smtpUser", "smtpPass", "smtpFromEmail", "smtpFromName", "smtpEnabled", "whatsappPhoneNumberId", "whatsappBusinessAccountId", "whatsappAccessToken", "whatsappVerifyToken", "whatsappEnabled", "instagramPageAccessToken", "instagramVerifyToken", "instagramEnabled", "n8nWebhookUrl"]) {
        delete data[k];
      }
    }
    for (const k of ["smtpPass", "whatsappAccessToken", "instagramPageAccessToken"]) {
      if (typeof data[k] === "string" && ((data[k] as string).includes("•") || (data[k] as string) === "")) {
        delete data[k];
      }
    }
    data.updatedAt = nowIso();
    await getSettings(); // ensure row
    const updated = await db
      .updateTable("businessSettings")
      .set(data as never)
      .where("id", "=", "default")
      .returningAll()
      .executeTakeFirstOrThrow();
    await audit(req.user!.sub, "SETTINGS_UPDATED", "BusinessSetting", "default", undefined, { changed: Object.keys(data) });
    res.json({ settings: sanitize(mapSettings(updated) as unknown as Record<string, unknown>, req.user!.role) });
  })
);

// POST /api/settings/test-email
router.post(
  "/test-email",
  requireMinRole("MANAGER"),
  asyncHandler(async (req, res) => {
    const schema = z.object({ to: z.string().email() });
    const { to } = validate(schema, req.body);
    const result = await sendEmail(to, "StudioFlow test email", "This is a test email from your StudioFlow setup. If you received it, SMTP is configured correctly.");
    await audit(req.user!.sub, "TEST_EMAIL_SENT", "BusinessSetting", "default", undefined, { to, mocked: result.mocked });
    res.json(result);
  })
);

export default router;
