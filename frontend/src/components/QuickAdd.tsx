import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs, Paged } from "../lib/api";
import { Modal, Button, Field, Input, Select, Textarea } from "./ui";
import { useToast } from "./toast";
import { Customer, Session } from "../lib/types";

type Kind = "customer" | "enquiry" | "booking" | "session" | "followup" | null;

export function QuickAddModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [kind, setKind] = useState<Exclude<Kind, null>>("customer");
  return (
    <Modal open={open} onClose={onClose} title="Quick Add">
      <div className="mb-4 flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {(
          [
            ["customer", "Customer"],
            ["enquiry", "Enquiry"],
            ["booking", "Booking"],
            ["session", "Class"],
            ["followup", "Follow-up"],
          ] as [Exclude<Kind, null>, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setKind(id)}
            className={`flex-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-[13px] font-medium ${kind === id ? "bg-white shadow-card" : "text-slate-500"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {kind === "customer" && <CustomerForm onDone={onDone} />}
      {kind === "enquiry" && <EnquiryForm onDone={onDone} />}
      {kind === "booking" && <BookingForm onDone={onDone} />}
      {kind === "session" && <SessionForm onDone={onDone} />}
      {kind === "followup" && <FollowUpForm onDone={onDone} />}
    </Modal>
  );
}

function useCustomers(q: string) {
  return useQuery({
    queryKey: ["customers-mini", q],
    queryFn: () => api<Paged<Customer>>(`/customers${qs({ q, limit: 8 })}`),
  });
}

export function CustomerPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [q, setQ] = useState("");
  const { data } = useCustomers(q);
  return (
    <div>
      <Input placeholder="Search customer..." value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-1 max-h-36 overflow-y-auto rounded-lg border border-slate-200">
        {(data?.data || []).map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 ${value === c.id ? "bg-brand-50 font-medium" : ""}`}
          >
            <span>
              {c.firstName} {c.lastName}
            </span>
            <span className="text-xs text-slate-400">{c.phone}</span>
          </button>
        ))}
        {(data?.data || []).length === 0 && <p className="px-3 py-2 text-[13px] text-slate-400">Type to search customers</p>}
      </div>
    </div>
  );
}

function CustomerForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ firstName: "", lastName: "", phone: "", email: "", source: "MANUAL" });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!f.firstName.trim()) return toast.error("First name is required");
    setSaving(true);
    try {
      await api("/customers", { method: "POST", body: f });
      toast.success("Customer created");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="First name" required>
        <Input value={f.firstName} onChange={(e) => set("firstName", e.target.value)} />
      </Field>
      <Field label="Last name">
        <Input value={f.lastName} onChange={(e) => set("lastName", e.target.value)} />
      </Field>
      <Field label="Phone">
        <Input value={f.phone} onChange={(e) => set("phone", e.target.value)} />
      </Field>
      <Field label="Email">
        <Input value={f.email} onChange={(e) => set("email", e.target.value)} />
      </Field>
      <div className="col-span-2">
        <Field label="Source">
          <Select value={f.source} onChange={(e) => set("source", e.target.value)}>
            {["MANUAL", "WHATSAPP", "INSTAGRAM", "EMAIL", "WEBSITE", "OTHER"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="col-span-2 flex justify-end">
        <Button onClick={save} loading={saving}>
          Create customer
        </Button>
      </div>
    </div>
  );
}

function EnquiryForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: "", phone: "", message: "", source: "MANUAL" });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!f.name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      await api("/enquiries", { method: "POST", body: f });
      toast.success("Enquiry created");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div className="flex flex-col gap-3">
      <Field label="Name" required>
        <Input value={f.name} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <Field label="Phone">
        <Input value={f.phone} onChange={(e) => set("phone", e.target.value)} />
      </Field>
      <Field label="Message">
        <Textarea rows={3} value={f.message} onChange={(e) => set("message", e.target.value)} />
      </Field>
      <div className="flex justify-end">
        <Button onClick={save} loading={saving}>
          Create enquiry
        </Button>
      </div>
    </div>
  );
}

function BookingForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [customerId, setCustomerId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [participants, setParticipants] = useState(1);
  const [saving, setSaving] = useState(false);
  const { data: sessions } = useQuery({
    queryKey: ["sessions-mini"],
    queryFn: () => api<Paged<Session>>(`/sessions${qs({ limit: 30 })}`),
  });
  const save = async () => {
    if (!customerId || !sessionId) return toast.error("Customer and class are required");
    setSaving(true);
    try {
      await api("/bookings", { method: "POST", body: { customerId, sessionId, participants } });
      toast.success("Booking created");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <Field label="Customer" required>
        <CustomerPicker value={customerId} onChange={setCustomerId} />
      </Field>
      <Field label="Class / session" required>
        <Select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
          <option value="">Select a session...</option>
          {(sessions?.data || []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.title || s.workshop?.name} — {new Date(s.startsAt).toLocaleDateString("en-IN")} ({s.available ?? "?"} seats)
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Participants">
        <Input type="number" min={1} value={participants} onChange={(e) => setParticipants(Number(e.target.value))} />
      </Field>
      <div className="flex justify-end">
        <Button onClick={save} loading={saving}>
          Create booking
        </Button>
      </div>
    </div>
  );
}

function SessionForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [workshopId, setWorkshopId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const { data: workshops } = useQuery({
    queryKey: ["workshops-mini"],
    queryFn: () => api<Paged<{ id: string; name: string }>>(`/workshops${qs({ limit: 50, active: "true" })}`),
  });
  const save = async () => {
    if (!workshopId || !startsAt || !endsAt) return toast.error("Workshop, start and end are required");
    setSaving(true);
    try {
      await api("/sessions", { method: "POST", body: { workshopId, startsAt, endsAt } });
      toast.success("Class scheduled");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <Field label="Workshop" required>
        <Select value={workshopId} onChange={(e) => setWorkshopId(e.target.value)}>
          <option value="">Select workshop...</option>
          {(workshops?.data || []).map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts at" required>
          <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </Field>
        <Field label="Ends at" required>
          <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button onClick={save} loading={saving}>
          Schedule class
        </Button>
      </div>
    </div>
  );
}

function FollowUpForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [customerId, setCustomerId] = useState("");
  const [reason, setReason] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!customerId || !reason.trim() || !dueAt) return toast.error("Customer, reason and due time are required");
    setSaving(true);
    try {
      await api("/followups", { method: "POST", body: { customerId, reason, dueAt } });
      toast.success("Follow-up created");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <Field label="Customer" required>
        <CustomerPicker value={customerId} onChange={setCustomerId} />
      </Field>
      <Field label="Reason" required>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Confirm weekend booking" />
      </Field>
      <Field label="Due at" required>
        <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
      </Field>
      <div className="flex justify-end">
        <Button onClick={save} loading={saving}>
          Create follow-up
        </Button>
      </div>
    </div>
  );
}
