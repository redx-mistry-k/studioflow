import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarCheck, CheckCircle } from "lucide-react";
import { api } from "../lib/api";
import { Field, Input, Textarea, Button, LoadingState } from "../components/ui";
import { money, fmtDateTime } from "../lib/utils";

interface PubInfo { businessName: string; currency: string; phone: string | null; email: string | null; address: string | null }
interface PubSession {
  id: string; title: string | null; startsAt: string; endsAt: string; instructor: string | null;
  location: string | null; price: number; available: number; booked: number;
  workshop: { id: string; name: string; color: string } | null;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-slate-100">
      {children}
      <footer className="border-t border-slate-200 py-6 text-center text-[13px] text-slate-400">
        <Link to="/login" className="font-medium text-brand-600 hover:underline">Staff sign in</Link>
      </footer>
    </div>
  );
}

export default function PublicBooking() {
  const [step, setStep] = useState(1);
  const [sessionId, setSessionId] = useState("");
  const [participants, setParticipants] = useState(1);
  const [f, setF] = useState({ name: "", phone: "", email: "", notes: "" });
  const [result, setResult] = useState<{ bookingCode: string; status: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: info } = useQuery({ queryKey: ["pub-info"], queryFn: () => api<PubInfo>("/public/info", { token: null }) });
  const { data: sessions, isLoading } = useQuery({
    queryKey: ["pub-sessions"],
    queryFn: () => api<PubSession[]>("/public/sessions", { token: null }),
  });

  const sel = (sessions || []).find((s) => s.id === sessionId);
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  const submit = async () => {
    if (!sel) return setError("Please choose a class");
    if (!f.name.trim()) return setError("Please tell us your name");
    if (f.phone.trim().length < 5) return setError("Please enter a valid phone number");
    if (participants > sel.available) return setError(`Only ${sel.available} seat(s) left`);
    setBusy(true);
    setError("");
    try {
      const res = await api<{ bookingCode: string; status: string }>("/public/bookings", {
        method: "POST",
        body: { sessionId, participants, name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim() || undefined, notes: f.notes || undefined },
        token: null,
      });
      setResult(res);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Booking failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-pop">
            <CalendarCheck className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold">{info?.businessName || "Book a class"}</h1>
          <p className="text-sm text-slate-500">{info?.address || "Choose a class and reserve your seat"}</p>
        </div>

        {step === 1 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <h2 className="mb-3 font-semibold">1. Choose a class</h2>
            {isLoading && <LoadingState />}
            <div className="flex flex-col gap-2.5">
              {(sessions || []).map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setSessionId(s.id); setParticipants(1); setStep(2); }}
                  className={`rounded-xl border-2 p-3.5 text-left transition hover:border-brand-300 ${sessionId === s.id ? "border-brand-500 bg-brand-50/50" : "border-slate-150"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{s.title || s.workshop?.name || "Class"}</p>
                    <p className="font-bold text-brand-700">{money(s.price, info?.currency)}</p>
                  </div>
                  <p className="mt-0.5 text-[13px] text-slate-500">{s.workshop?.name || ""} · {fmtDateTime(s.startsAt)}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{s.available} seats left{s.instructor ? ` · ${s.instructor}` : ""}{s.location ? ` · ${s.location}` : ""}</p>
                </button>
              ))}
              {sessions && sessions.length === 0 && <p className="py-4 text-center text-sm text-slate-400">No upcoming classes right now — please check back soon.</p>}
            </div>
          </div>
        )}

        {step === 2 && sel && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <h2 className="mb-3 font-semibold">2. Your details</h2>
            <div className="mb-4 rounded-xl bg-brand-50 p-3 text-sm">
              <p className="font-semibold">{sel.title || sel.workshop?.name} — {money(sel.price, info?.currency)}</p>
              <p className="text-slate-600">{fmtDateTime(sel.startsAt)}</p>
              <button onClick={() => setStep(1)} className="mt-1 text-[13px] font-medium text-brand-600 hover:underline">Change class</button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><Field label="Full name" required><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Your name" /></Field></div>
              <Field label="Phone (WhatsApp)" required><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 ..." /></Field>
              <Field label="Email"><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
              <Field label="Participants"><Input type="number" min={1} max={sel.available} value={participants} onChange={(e) => setParticipants(Number(e.target.value))} /></Field>
              <div className="flex items-end pb-1 text-sm text-slate-600">Total: <b className="ml-1">{money(sel.price * participants, info?.currency)}</b></div>
              <div className="sm:col-span-2"><Field label="Notes (optional)"><Textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field></div>
            </div>
            {error && <p className="mt-3 rounded-lg bg-red-50 p-2.5 text-sm text-red-600">{error}</p>}
            <Button onClick={submit} loading={busy} className="mt-4 w-full" size="lg">Confirm booking</Button>
            <p className="mt-2 text-center text-xs text-slate-400">Pay at the studio — we'll confirm on WhatsApp.</p>
          </div>
        )}

        {step === 3 && result && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-card">
            <CheckCircle className="mx-auto h-12 w-12 text-emerald-500" />
            <h2 className="mt-3 text-xl font-bold">{result.status === "CONFIRMED" ? "Booking confirmed!" : "Booking received!"}</h2>
            <p className="mt-1 text-sm text-slate-500">Your booking reference is</p>
            <p className="mx-auto mt-2 w-fit rounded-xl bg-slate-100 px-4 py-2 font-mono text-lg font-bold">{result.bookingCode}</p>
            <p className="mt-2 text-sm text-slate-500">We'll confirm shortly on WhatsApp.</p>
            <button onClick={() => { setStep(1); setResult(null); setSessionId(""); }} className="mt-4 text-sm font-medium text-brand-600 hover:underline">Book another class</button>
          </div>
        )}
      </div>
    </Shell>
  );
}
