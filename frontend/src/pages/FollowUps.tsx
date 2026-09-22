import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, Link } from "react-router-dom";
import { Plus, Check, X, RotateCcw, AlarmClock, Trash2 } from "lucide-react";
import { api, qs, Paged } from "../lib/api";
import { Card, Button, Tabs, Modal, Field, Input, Select, Textarea, StatusBadge, Avatar, Badge, LoadingState, ErrorState, EmptyState, ConfirmModal } from "../components/ui";
import { CustomerPicker } from "../components/QuickAdd";
import { useToast } from "../components/toast";
import { fullName, fmtDateTime } from "../lib/utils";
import { FollowUp } from "../lib/types";

type View = "today" | "overdue" | "upcoming" | "completed" | "all";

export default function FollowUps() {
  const [params] = useSearchParams();
  const [view, setView] = useState<View>((params.get("view") as View) || "today");
  const [modalOpen, setModalOpen] = useState(false);
  const [del, setDel] = useState<FollowUp | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["followups", view],
    queryFn: () => api<Paged<FollowUp> & { counts: { status: string; count: number }[] }>(`/followups${qs({ view, limit: 50 })}`),
  });

  const act = async (id: string, action: "complete" | "cancel" | "reopen" | "snooze", snoozeUntil?: string) => {
    setBusy(id);
    try {
      await api(`/followups/${id}`, { method: "PATCH", body: { action, snoozeUntil } });
      toast.success(
        action === "complete" ? "Follow-up completed 🎉" :
        action === "snooze" ? "Snoozed for 24 hours" : `Follow-up ${action}led`
      );
      qc.invalidateQueries({ queryKey: ["followups"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!del) return;
    try {
      await api(`/followups/${del.id}`, { method: "DELETE" });
      toast.success("Follow-up deleted");
      setDel(null);
      qc.invalidateQueries({ queryKey: ["followups"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const countFor = (s: string) => data?.counts.find((c) => c.status === s)?.count;
  const tabs: { id: View; label: string; count?: number }[] = [
    { id: "today", label: "Today" },
    { id: "overdue", label: "Overdue", count: countFor("OVERDUE") },
    { id: "upcoming", label: "Upcoming", count: countFor("PENDING") },
    { id: "completed", label: "Completed", count: countFor("COMPLETED") },
    { id: "all", label: "All" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-bold">Follow-ups</h1>
        <Button onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> New follow-up</Button>
      </div>
      <Tabs<View> value={view} onChange={setView} tabs={tabs} />
      {isLoading && <LoadingState />}
      {error && <ErrorState message="Failed to load follow-ups" onRetry={() => refetch()} />}
      {data && data.data.length === 0 && <Card><EmptyState title={`No ${view} follow-ups`} message="Create one to keep track of pending outreach." /></Card>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(data?.data || []).map((f) => (
          <Card key={f.id} className="p-4">
            <div className="flex items-start gap-3">
              <Avatar first={f.customer?.firstName || "?"} last={f.customer?.lastName} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {f.customer ? <Link to={`/customers/${f.customer.id}`} className="hover:text-brand-700">{fullName(f.customer)}</Link> : "—"}
                </p>
                <p className="text-[13px] text-slate-500">{f.customer?.phone || ""}</p>
              </div>
              <StatusBadge status={f.status} />
            </div>
            <p className="mt-2.5 text-sm text-slate-700">{f.reason}</p>
            {f.booking && <p className="mt-1 text-xs text-slate-400">Booking {f.booking.bookingCode}</p>}
            {f.notes && <p className="mt-1.5 rounded-lg bg-slate-50 p-2 text-[13px] text-slate-600">{f.notes}</p>}
            <div className="mt-2.5 flex items-center gap-2 text-xs text-slate-500">
              <Badge className="bg-slate-100 text-slate-600">{f.channel}</Badge>
              <span>Due {fmtDateTime(f.dueAt)}</span>
              {f.assignedTo && <span className="ml-auto truncate">· {f.assignedTo.name}</span>}
            </div>
            <div className="mt-3 flex gap-2">
              {(f.status === "PENDING" || f.status === "OVERDUE") && (
                <>
                  <Button size="sm" variant="outline" className="flex-1" disabled={busy === f.id} onClick={() => act(f.id, "complete")}>
                    <Check className="h-3.5 w-3.5" /> Complete
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy === f.id} onClick={() => act(f.id, "snooze")} title="Snooze 24h">
                    <AlarmClock className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy === f.id} onClick={() => act(f.id, "cancel")}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
              {(f.status === "COMPLETED" || f.status === "CANCELLED") && (
                <Button size="sm" variant="ghost" disabled={busy === f.id} onClick={() => act(f.id, "reopen")}>
                  <RotateCcw className="h-3.5 w-3.5" /> Reopen
                </Button>
              )}
              <Button size="sm" variant="ghost" className="ml-auto !text-slate-400 hover:!text-red-500" onClick={() => setDel(f)} title="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
      {modalOpen && (
        <FollowUpModal
          onClose={() => setModalOpen(false)}
          onDone={() => { setModalOpen(false); qc.invalidateQueries({ queryKey: ["followups"] }); }}
        />
      )}
      <ConfirmModal open={!!del} onClose={() => setDel(null)} onConfirm={remove} title="Delete follow-up" message="Delete this follow-up permanently?" confirmLabel="Delete" danger />
    </div>
  );
}

export function FollowUpModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [customerId, setCustomerId] = useState("");
  const [reason, setReason] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [channel, setChannel] = useState("WHATSAPP");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!customerId || !reason.trim() || !dueAt) return toast.error("Customer, reason and due time are required");
    setSaving(true);
    try {
      await api("/followups", { method: "POST", body: { customerId, reason, dueAt, channel, notes: notes || undefined } });
      toast.success("Follow-up created");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="New follow-up">
      <div className="flex flex-col gap-3">
        <Field label="Customer" required><CustomerPicker value={customerId} onChange={setCustomerId} /></Field>
        <Field label="Reason" required><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Confirm weekend booking" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due at" required><Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></Field>
          <Field label="Channel">
            <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
              {["WHATSAPP", "PHONE", "EMAIL", "INSTAGRAM"].map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}>Create</Button></div>
      </div>
    </Modal>
  );
}
