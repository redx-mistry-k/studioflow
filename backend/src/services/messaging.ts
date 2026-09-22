// ============================================================
// Modular messaging layer: WhatsApp / Instagram / Email.
// Each provider runs in MOCK MODE when credentials are missing,
// so the whole app stays usable in development.
// ============================================================
import nodemailer from "nodemailer";
import { getSettings } from "./settings";

export type Channel = "WHATSAPP" | "INSTAGRAM" | "EMAIL" | "WEBSITE" | "MANUAL" | "CALL";

export interface SendResult {
  ok: boolean;
  mocked: boolean;
  externalId?: string;
  error?: string;
}

export async function providerStatus() {
  const s = await getSettings();
  const smtpReady = Boolean(s.smtpEnabled && s.smtpHost && s.smtpUser);
  const waReady = Boolean(s.whatsappEnabled && s.whatsappPhoneNumberId && s.whatsappAccessToken);
  const igReady = Boolean(s.instagramEnabled && s.instagramPageAccessToken);
  return {
    email: smtpReady ? "LIVE" : "MOCK",
    whatsapp: waReady ? "LIVE" : "MOCK",
    instagram: igReady ? "LIVE" : "MOCK",
  };
}

// ---------------- Email (SMTP via Nodemailer) ----------------
export async function sendEmail(to: string, subject: string, htmlOrText: string): Promise<SendResult> {
  const s = await getSettings();
  const mocked = !(s.smtpEnabled && s.smtpHost && s.smtpUser && s.smtpPass);
  if (mocked) {
    console.log(`[email:MOCK] to=${to} subject=${subject}\n${htmlOrText.slice(0, 500)}`);
    await logEmail(to, subject, htmlOrText, true);
    return { ok: true, mocked: true, externalId: `mock-email-${Date.now()}` };
  }
  try {
    const transporter = nodemailer.createTransport({
      host: s.smtpHost!,
      port: s.smtpPort || 587,
      secure: (s.smtpPort || 587) === 465,
      auth: { user: s.smtpUser!, pass: s.smtpPass! },
    });
    const info = await transporter.sendMail({
      from: `"${s.smtpFromName || s.businessName}" <${s.smtpFromEmail || s.smtpUser!}>`,
      to,
      subject,
      text: htmlOrText,
      html: `<p>${htmlOrText.replace(/\n/g, "<br/>")}</p>`,
    });
    await logEmail(to, subject, htmlOrText, false);
    return { ok: true, mocked: false, externalId: info.messageId };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[email] send failed:", error);
    return { ok: false, mocked: false, error };
  }
}

async function logEmail(to: string, subject: string, body: string, mocked: boolean) {
  const { audit } = await import("./audit");
  await audit(undefined, "EMAIL_SENT", "Email", undefined, undefined, { to, subject, mocked, preview: body.slice(0, 200) });
}

// ---------------- WhatsApp Cloud API ----------------
export async function sendWhatsApp(toPhone: string, text: string): Promise<SendResult> {
  const s = await getSettings();
  const mocked = !(s.whatsappEnabled && s.whatsappPhoneNumberId && s.whatsappAccessToken);
  if (mocked) {
    console.log(`[whatsapp:MOCK] to=${toPhone} text=${text.slice(0, 300)}`);
    return { ok: true, mocked: true, externalId: `mock-wa-${Date.now()}` };
  }
  try {
    const url = `https://graph.facebook.com/v21.0/${s.whatsappPhoneNumberId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${s.whatsappAccessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toPhone.replace(/\D/g, ""),
        type: "text",
        text: { body: text },
      }),
    });
    const data = (await res.json()) as { messages?: { id: string }[]; error?: { message: string } };
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    return { ok: true, mocked: false, externalId: data.messages?.[0]?.id };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[whatsapp] send failed:", error);
    return { ok: false, mocked: false, error };
  }
}

// ---------------- Instagram Messaging API ----------------
export async function sendInstagram(igScopedId: string, text: string): Promise<SendResult> {
  const s = await getSettings();
  const mocked = !(s.instagramEnabled && s.instagramPageAccessToken);
  if (mocked) {
    console.log(`[instagram:MOCK] to=${igScopedId} text=${text.slice(0, 300)}`);
    return { ok: true, mocked: true, externalId: `mock-ig-${Date.now()}` };
  }
  try {
    const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${s.instagramPageAccessToken}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: igScopedId }, message: { text } }),
    });
    const data = (await res.json()) as { message_id?: string; error?: { message: string } };
    if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
    return { ok: true, mocked: false, externalId: data.message_id };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[instagram] send failed:", error);
    return { ok: false, mocked: false, error };
  }
}

// Generic dispatcher used by inbox replies & automations.
export async function sendViaChannel(
  channel: Channel,
  to: { phone?: string | null; whatsappNumber?: string | null; email?: string | null; instagramId?: string | null },
  text: string,
  subject?: string
): Promise<SendResult> {
  switch (channel) {
    case "WHATSAPP":
      return sendWhatsApp(to.whatsappNumber || to.phone || "", text);
    case "INSTAGRAM":
      return sendInstagram(to.instagramId || "", text);
    case "EMAIL":
      return sendEmail(to.email || "", subject || "Message", text);
    default:
      console.log(`[${channel}:MOCK] ${text.slice(0, 300)}`);
      return { ok: true, mocked: true, externalId: `mock-${Date.now()}` };
  }
}
