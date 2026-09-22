import { Router } from "express";
import { asyncHandler } from "../utils/http";
import { handleIncomingMessage } from "../services/inbox";
import { getSettings } from "../services/settings";

const router = Router();

// GET /api/webhooks/whatsapp — Meta verification handshake
router.get("/whatsapp", async (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const s = await getSettings();
  const verifyToken = s?.whatsappVerifyToken || process.env.WHATSAPP_VERIFY_TOKEN || "studioflow_verify_token";
  if (mode === "subscribe" && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// POST /api/webhooks/whatsapp — incoming messages + status updates
router.post(
  "/whatsapp",
  asyncHandler(async (req, res) => {
    res.sendStatus(200);
    try {
      const body = req.body as {
        entry?: { changes?: { value?: { messages?: { from: string; id: string; type: string; text?: { body: string }; image?: { caption?: string }; button?: { text: string }; interactive?: unknown }[]; contacts?: { profile?: { name?: string } }[] } }[] }[];
      };
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const value = change.value;
          const contactName = value?.contacts?.[0]?.profile?.name || "WhatsApp Customer";
          for (const msg of value?.messages || []) {
            const text =
              msg.text?.body || msg.image?.caption || msg.button?.text || (msg.type === "interactive" ? "[interactive message]" : `[${msg.type} message]`);
            if (!text) continue;
            await handleIncomingMessage({
              channel: "WHATSAPP",
              externalId: `wa:${msg.from}`,
              senderName: contactName,
              phone: msg.from,
              whatsappNumber: msg.from,
              body: text,
              externalMessageId: msg.id,
            });
          }
        }
      }
    } catch (e) {
      console.error("whatsapp webhook error", e);
    }
  })
);

// GET /api/webhooks/instagram — Meta verification handshake
router.get("/instagram", async (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const s = await getSettings();
  const verifyToken = s?.instagramVerifyToken || process.env.INSTAGRAM_VERIFY_TOKEN || "studioflow_verify_token";
  if (mode === "subscribe" && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// POST /api/webhooks/instagram — incoming DMs
router.post(
  "/instagram",
  asyncHandler(async (req, res) => {
    res.sendStatus(200);
    try {
      const body = req.body as {
        entry?: { messaging?: { sender?: { id: string }; message?: { mid: string; text?: string }; postback?: { title: string } }[] }[];
      };
      for (const entry of body.entry || []) {
        for (const item of entry.messaging || []) {
          const text = item.message?.text || item.postback?.title;
          const senderId = item.sender?.id;
          if (!text || !senderId) continue;
          await handleIncomingMessage({
            channel: "INSTAGRAM",
            externalId: `ig:${senderId}`,
            senderName: `Instagram User ${senderId.slice(-4)}`,
            instagramId: senderId,
            body: text,
            externalMessageId: item.message?.mid,
          });
        }
      }
    } catch (e) {
      console.error("instagram webhook error", e);
    }
  })
);

// POST /api/webhooks/inbound — generic inbound (n8n / custom forms)
router.post(
  "/inbound",
  asyncHandler(async (req, res) => {
    const { channel, name, phone, email, instagramHandle, subject, body } = req.body as Record<string, string>;
    if (!body || !name) return res.status(400).json({ error: "name and body are required" });
    const allowed = ["WHATSAPP", "INSTAGRAM", "EMAIL", "WEBSITE", "MANUAL"];
    const ch = allowed.includes(String(channel)) ? String(channel) : "WEBSITE";
    const result = await handleIncomingMessage({
      channel: ch as "WEBSITE",
      senderName: String(name),
      phone,
      email,
      instagramHandle,
      subject,
      body: String(body),
    });
    res.status(201).json({ ok: true, conversationId: result.conversation.id, customerId: result.customer.id });
  })
);

export default router;
