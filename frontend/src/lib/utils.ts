export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function money(n: number | null | undefined, currency = "INR"): string {
  const v = Number(n ?? 0);
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
  } catch {
    return `${currency} ${v.toLocaleString("en-IN")}`;
  }
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(+d)) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(+d)) return "—";
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(+d)) return "—";
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  if (isNaN(d)) return "—";
  const s = Math.max(0, Math.floor((Date.now() - d) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(iso);
}

export function initials(first: string, last?: string): string {
  return `${(first || "?")[0]}${(last || "")[0] || ""}`.toUpperCase();
}

export function fullName(c: { firstName?: string; lastName?: string; name?: string }): string {
  if (c.name) return c.name;
  return `${c.firstName || ""} ${c.lastName || ""}`.trim() || "Unknown";
}

export function waitingSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function toLocalInput(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const CHANNEL_LABELS: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
  EMAIL: "Email",
  WEBSITE: "Website",
  MANUAL: "Manual",
  CALL: "Call",
  ANY: "Any",
};

export const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-700",
  OPEN: "bg-amber-100 text-amber-700",
  PENDING: "bg-amber-100 text-amber-700",
  AWAITING_CUSTOMER: "bg-purple-100 text-purple-700",
  AWAITING_REPLY: "bg-amber-100 text-amber-700",
  FOLLOW_UP: "bg-orange-100 text-orange-700",
  RESOLVED: "bg-emerald-100 text-emerald-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CONFIRMED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-slate-200 text-slate-600",
  NO_SHOW: "bg-red-100 text-red-700",
  ENQUIRY: "bg-sky-100 text-sky-700",
  UNPAID: "bg-red-100 text-red-700",
  PARTIALLY_PAID: "bg-amber-100 text-amber-700",
  PAID: "bg-emerald-100 text-emerald-700",
  REFUNDED: "bg-slate-200 text-slate-600",
  OVERDUE: "bg-red-100 text-red-700",
  SCHEDULED: "bg-sky-100 text-sky-700",
  ALMOST_FULL: "bg-orange-100 text-orange-700",
  FULL: "bg-red-100 text-red-700",
  SUCCESS: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-red-100 text-red-700",
  SKIPPED: "bg-slate-200 text-slate-600",
  ACTIVE: "bg-emerald-100 text-emerald-700",
  INACTIVE: "bg-slate-200 text-slate-600",
  LEAD: "bg-sky-100 text-sky-700",
  CONVERTED: "bg-emerald-100 text-emerald-700",
  CONTACTED: "bg-amber-100 text-amber-700",
  QUALIFIED: "bg-purple-100 text-purple-700",
  LOST: "bg-slate-200 text-slate-600",
};

export function statusColor(s: string): string {
  return STATUS_COLORS[s] || "bg-slate-200 text-slate-600";
}
