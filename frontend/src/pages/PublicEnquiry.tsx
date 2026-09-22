import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { MessageSquareText, CheckCircle } from "lucide-react";
import { api } from "../lib/api";
import { Field, Input, Textarea, Button, Select } from "../components/ui";

interface PubInfo { businessName: string; phone: string | null; email: string | null; address: string | null }
interface PubWorkshop { id: string; name: string; description: string | null }

export default function PublicEnquiry() {
  const [f, setF] = useState({ name: "", phone: "", email: "", message: "", workshopId: "" });
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: info } = useQuery({ queryKey: ["pub-info"], queryFn: () => api<PubInfo>("/public/info", { token: null }) });
  const { data: workshops } = useQuery({ queryKey: ["pub-workshops"], queryFn: () => api<PubWorkshop[]>("/public/workshops", { token: null }) });
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  const submit = async () => {
    if (!f.name.trim()) return setError("Please tell us your name");
    if (f.phone.trim().length < 5) return setError("Please enter a valid phone number so we can reach you");
    if (!f.message.trim()) return setError("Please write your message");
    setBusy(true);
    setError("");
    try {
      await api("/public/enquiries", {
        method: "POST",
        body: { name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim() || undefined, message: f.message.trim(), workshopId: f.workshopId || undefined },
        token: null,
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-slate-100">
      <div className="mx-auto max-w-lg px-4 py-10">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-pop">
            <MessageSquareText className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold">{info?.businessName || "Send an enquiry"}</h1>
          <p className="text-sm text-slate-500">Ask us anything — we usually reply within a day.</p>
        </div>
        {!done ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
            <div className="flex flex-col gap-3">
              <Field label="Your name" required><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Full name" /></Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Phone" required><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 ..." /></Field>
                <Field label="Email"><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
              </div>
              {(workshops || []).length > 0 && (
                <Field label="Interested in (optional)">
                  <Select value={f.workshopId} onChange={(e) => set("workshopId", e.target.value)}>
                    <option value="">General enquiry</option>
                    {(workshops || []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </Select>
                </Field>
              )}
              <Field label="Message" required><Textarea rows={4} value={f.message} onChange={(e) => set("message", e.target.value)} placeholder="Hi! I'd like to know about..." /></Field>
              {error && <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-600">{error}</p>}
              <Button onClick={submit} loading={busy} size="lg">Send enquiry</Button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-card">
            <CheckCircle className="mx-auto h-12 w-12 text-emerald-500" />
            <h2 className="mt-3 text-xl font-bold">Thanks, {f.name.split(" ")[0]}!</h2>
            <p className="mt-1 text-sm text-slate-500">Your enquiry has been received. We'll get back to you soon.</p>
            <Link to="/book" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">Or browse upcoming classes →</Link>
          </div>
        )}
        <p className="mt-6 text-center text-[13px] text-slate-400">
          <Link to="/login" className="font-medium text-brand-600 hover:underline">Staff sign in</Link>
        </p>
      </div>
    </div>
  );
}
