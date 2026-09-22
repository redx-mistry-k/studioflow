// API client — same-origin `/api` (vite proxies in dev, nginx in prod).
// Auth travels two ways: the Authorization header (API clients, curl) AND an
// HttpOnly cookie set at login (browsers). The cookie survives proxies that
// strip the Authorization header, so `credentials: "include"` is required.
const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function getToken(): string | null {
  return localStorage.getItem("sf_token");
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string | null } = {}
): Promise<T> {
  const token = opts.token !== undefined ? opts.token : getToken();
  const res = await fetch(`${BASE}/api${path}`, {
    method: opts.method || "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error || `Request failed (${res.status})`;
    if (res.status === 401 && getToken() && !path.startsWith("/auth/login")) {
      // Session died mid-use (expired token, disabled account, signed out
      // elsewhere). Tell the auth layer to bounce back to the login screen.
      window.dispatchEvent(new CustomEvent("sf:unauthorized"));
    }
    throw new ApiError(res.status, msg, (data as { details?: unknown })?.details);
  }
  return data as T;
}

export interface Paged<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; pages: number };
}

export function qs(params: Record<string, unknown>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    s.set(k, String(v));
  }
  const str = s.toString();
  return str ? `?${str}` : "";
}
