import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/toast";
import { Button, Field, Input } from "../components/ui";
import { api, ApiError, getToken } from "../lib/api";

type Probe = "ok" | "blocked" | "error";

interface Diag {
  header: Probe;
  cookie: Probe;
}

async function probe(url: string, init: RequestInit): Promise<Probe> {
  try {
    const r = await fetch(url, init);
    if (r.status === 200) return "ok";
    if (r.status === 401) return "blocked";
    return "error";
  } catch {
    return "error";
  }
}

export default function Login() {
  const [expired] = useState(() => {
    try {
      if (sessionStorage.getItem("sf_expired")) {
        sessionStorage.removeItem("sf_expired");
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  });
  const [email, setEmail] = useState("admin@studioflow.local");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState(false);
  const [name, setName] = useState("");
  const [diag, setDiag] = useState<Diag | null>(null);
  const { login, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from || "/";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setDiag(null);
    try {
      if (setup) {
        if (!name.trim() || !email.trim() || password.length < 8) {
          toast.error("Enter your name, email and a password (min 8 characters)");
          return;
        }
        const res = await api<{ token: string }>("/auth/bootstrap", { method: "POST", body: { name, email, password }, token: null });
        localStorage.setItem("sf_token", res.token);
        window.location.href = "/";
        return;
      }
      await login(email, password);
      // Gate: prove an authenticated request actually works before entering
      // the app — otherwise we'd bounce straight back here in a loop.
      // Raw fetch (not api()) so the global 401 handler stays out of this.
      const token = getToken();
      const gate = await probe("/api/auth/me", {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}`, "X-SF-Token": token } : {},
      });
      if (gate !== "ok") {
        const [header, cookie] = await Promise.all([
          token
            ? probe("/api/auth/me", {
                credentials: "omit",
                headers: { Authorization: `Bearer ${token}`, "X-SF-Token": token },
              })
            : Promise.resolve("blocked" as Probe),
          probe("/api/auth/me", { credentials: "include" }),
        ]);
        setDiag({ header, cookie });
        logout();
        return;
      }
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-100 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-2xl font-bold text-white shadow-pop">
            S
          </div>
          <h1 className="text-2xl font-bold text-slate-900">StudioFlow</h1>
          <p className="text-sm text-slate-500">Classes, bookings & customer operations</p>
        </div>
        <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          <h2 className="mb-4 text-[15px] font-semibold">{setup ? "First-time setup" : "Sign in"}</h2>
          {expired && !setup && (
            <p className="mb-3 rounded-lg bg-amber-50 p-2.5 text-center text-[13px] text-amber-700">
              Your session expired — please sign in again.
            </p>
          )}
          {diag && (
            <div className="mb-3 rounded-lg bg-red-50 p-3 text-[13px] text-red-700">
              <p className="font-semibold">Signed in, but follow-up requests are blocked.</p>
              <p className="mt-1 text-red-600">
                Something between your browser and the server strips credentials. Try opening this page in a{" "}
                <b>new browser tab</b> instead of the embedded preview.
              </p>
              <p className="mt-2 font-mono text-xs">
                header: {diag.header} · cookie: {diag.cookie}
              </p>
            </div>
          )}
          {setup && (
            <div className="mb-3">
              <Field label="Your name" required>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Aarav Owner" />
              </Field>
            </div>
          )}
          <div className="mb-3">
            <Field label="Email" required>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@studio.com" />
            </Field>
          </div>
          <div className="mb-4">
            <Field label="Password" required>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </Field>
          </div>
          <Button type="submit" loading={busy} className="w-full" size="lg">
            {setup ? "Create admin account" : "Sign in"}
          </Button>
          <div className="mt-3 text-center">
            <button type="button" onClick={() => setSetup(!setup)} className="text-[13px] font-medium text-brand-600 hover:underline">
              {setup ? "Back to sign in" : "First time? Create the admin account"}
            </button>
          </div>
          {!setup && (
            <p className="mt-4 rounded-lg bg-slate-50 p-2.5 text-center text-xs text-slate-500">
              Demo logins — admin: <b>admin@studioflow.local / admin123</b>
            </p>
          )}
        </form>
        <p className="mt-4 text-center text-[13px] text-slate-400">
          Customer?{" "}
          <Link to="/book" className="font-medium text-brand-600 hover:underline">
            Book a class
          </Link>{" "}
          ·{" "}
          <Link to="/enquire" className="font-medium text-brand-600 hover:underline">
            Send an enquiry
          </Link>
        </p>
      </div>
    </div>
  );
}
