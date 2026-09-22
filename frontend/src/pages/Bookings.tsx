import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Plus, Check, X, Send, Banknote, UserX } from "lucide-react";
import { api, qs, Paged } from "../lib/api";
import { Card, Button, SearchInput, Select, Th, Td, StatusBadge, Pagination, Modal, Field, Input, Textarea, LoadingState, ErrorState, EmptyState } from "../components/ui";
import { CustomerPicker } from "../components/QuickAdd";
import { useToast } from "../components/toast";
import { useBusiness } from "../components/Layout";
import { cn, fullName, money, fmtDateTime } from "../lib/utils";
import { Booking, Session, Payment, FollowUp } from "../lib/types";

const STATUSES = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"];

export default function Bookings() {
  const [params, setParams] = useSearchParams();
  const highlight = params.get("highlight");
  const [status, setStatus] = useState(params.get("status") || "");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [pay, setPay] = useState<Booking | null>(null);
  const { currency } = useBusiness();
  const toast = useToast();
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["bookings", q, status, page],
    queryFn: () => api<Paged<Booking>>(`/bookings${qs({ q, status, page, limit: 15 })}`),
  });

  useEffect(() => {
    if (highlight && data) {
      const b = data.data.find((x) => x.id === highlight);
      if (b) setDetailId(b.id);
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight, data]);

  const mutate = async (id: string, action: string, body?: Record<string, unknown>) => {
    try {
      const res = await api<{ mocked?: boolean }>(`/bookings/${id}/${action}`, { method: "POST", body: body || {} });
      toast.success(action === "send" ? (res.mocked ? "Sent (mock mode)" : "Message sent") : "Done");
      qc.invalidateQueries({ queryKey: ["bookings"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-bold">Bookings</h1>
        <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New booking</Button>
      </div>
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search code, customer, phone..." className="w-64" />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="!w-44">
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </Select>
        </div>
        {isLoading && <LoadingState />}
        {error && <ErrorState message="Failed to load bookings" onRetry={() => refetch()} />}
        {data && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead><tr className="border-b border-slate-100"><Th>Code</Th><Th>Customer</Th><Th>Class</Th><Th>When</Th><Th>Seats</Th><Th>Total</Th><Th>Paid</Th><Th>Status</Th><Th>Payment</Th><Th /></tr></thead>
                <tbody>
                  {data.data.map((b) => (
                    <tr key={b.id} className="cursor-pointer border-b border-slate-50 hover:bg-slate-50/60" onClick={() => setDetailId(b.id)}>
                      <Td className="font-mono text-[13px] font-medium text-brand-700">{b.bookingCode}</Td>
                      <Td>{b.customer ? fullName(b.customer) : "—"}</Td>
                      <Td>{b.session?.title || b.session?.workshop?.name || "—"}</Td>
                      <Td className="whitespace-nowrap">{b.session ? fmtDateTime(b.session.startsAt) : "—"}</Td>
                      <Td>{b.participants}</Td>
                      <Td className="font-medium">{money(b.totalAmount, currency)}</Td>
                      <Td>{money(b.amountPaid, currency)}</Td>
                      <Td><StatusBadge status={b.status} /></Td>
                      <Td><StatusBadge status={b.paymentStatus} /></Td>
                      <Td onClick={(e) => e.stopPropagation()}>
                        <RowActions
                          b={b}
                          onConfirm={() => mutate(b.id, "confirm")}
                          onCancel={() => mutate(b.id, "cancel")}
                          onNoShow={() => mutate(b.id, "no-show")}
                          onSend={() => mutate(b.id, "send", { kind: "confirmation", channel: "WHATSAPP" })}
                          onPay={() => setPay(b)}
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.data.length === 0 && <EmptyState title="No bookings found" />}
            </div>
            <Pagination page={data.meta.page} pages={data.meta.pages} total={data.meta.total} onPage={setPage} />
          </>
        )}
      </Card>

      <CreateBookingModal open={createOpen} onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); qc.invalidateQueries({ queryKey: ["bookings"] }); }} />
      {detailId && <BookingDetailModal id={detailId} onClose={() => setDetailId(null)} onChanged={() => qc.invalidateQueries({ queryKey: ["bookings"] })} />}
      {pay && <PaymentModal booking={pay} onClose={() => setPay(null)} onDone={() => { setPay(null); qc.invalidateQueries({ queryKey: ["bookings"] }); }} />}
    </div>
  );
}

function RowActions({ b, onConfirm, onCancel, onNoShow, onSend, onPay }: {
  b: Booking; onConfirm: () => void; onCancel: () => void; onNoShow: () => void; onSend: () => void; onPay: () => void;
}) {
  return (
    <div className="flex justify-end gap-1">
      {b.status === "PENDING" && (
        <button title="Confirm" onClick={onConfirm} className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50"><Check className="h-4 w-4" /></button>
      )}
      {(b.status === "PENDING" || b.status === "CONFIRMED") && (
        <>
          <button title="Cancel" onClick={onCancel} className="rounded-lg p-1.5 text-amber-600 hover:bg-amber-50"><X className="h-4 w-4" /></button>
          <button title="Mark no-show" onClick={onNoShow} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><UserX className="h-4 w-4" /></button>
        </>
      )}
      <button title="Record payment" onClick={onPay} className="rounded-lg p-1.5 text-sky-600 hover:bg-sky-50"><Banknote className="h-4 w-4" /></button>
      <button title="Send confirmation to customer" onClick={onSend} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><Send className="h-4 w-4" /></button>
    </div>
  );
}

function CreateBookingModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [customerId, setCustomerId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [participants, setParticipants] = useState(1);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const { data: sessions } = useQuery({
    queryKey: ["sessions-mini"],
    queryFn: () => api<Paged<Session>>(`/sessions${qs({ limit: 50 })}`),
    enabled: open,
  });
  const save = async () => {
    if (!customerId || !sessionId) return toast.error("Customer and class are required");
    setSaving(true);
    try {
      await api("/bookings", { method: "POST", body: { customerId, sessionId, participants, notes: notes || undefined } });
      toast.success("Booking created");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="New booking">
      <div className="flex flex-col gap-3">
        <Field label="Customer" required><CustomerPicker value={customerId} onChange={setCustomerId} /></Field>
        <Field label="Class / session" required>
          <Select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            <option value="">Select a session...</option>
            {(sessions?.data || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.title || s.workshop?.name} — {new Date(s.startsAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} ({s.available ?? "?"} seats · ₹{s.price})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Participants"><Input type="number" min={1} value={participants} onChange={(e) => setParticipants(Number(e.target.value))} /></Field>
        <Field label="Notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}>Create booking</Button></div>
      </div>
    </Modal>
  );
}

export function PaymentModal({ booking, onClose, onDone }: { booking: Booking; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { currency } = useBusiness();
  const balance = booking.totalAmount - booking.amountPaid;
  const [amount, setAmount] = useState(balance > 0 ? balance : 0);
  const [method, setMethod] = useState("UPI");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (amount <= 0) return toast.error("Amount must be greater than zero");
    setSaving(true);
    try {
      await api("/payments", { method: "POST", body: { bookingId: booking.id, amount, method, reference: reference || undefined } });
      toast.success("Payment recorded");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`Record payment — ${booking.bookingCode}`}>
      <div className="flex flex-col gap-3">
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Total</span><b>{money(booking.totalAmount, currency)}</b></div>
          <div className="flex justify-between"><span className="text-slate-500">Paid</span><b>{money(booking.amountPaid, currency)}</b></div>
          <div className="flex justify-between"><span className="text-slate-500">Balance</span><b className="text-red-600">{money(balance, currency)}</b></div>
        </div>
        <Field label="Amount" required><Input type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
        <Field label="Method">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {["UPI", "CASH", "CARD", "NETBANKING", "OTHER"].map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label="Reference"><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction ID / note" /></Field>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}>Record payment</Button></div>
      </div>
    </Modal>
  );
}

interface BookingDetail {
  booking: Booking & { payments: Payment[]; followUps: FollowUp[] };
  balance: number;
}

function BookingDetailModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const { currency } = useBusiness();
  const [payOpen, setPayOpen] = useState(false);
  const [sendKind, setSendKind] = useState<"confirmation" | "reminder">("confirmation");
  const [sendChannel, setSendChannel] = useState("WHATSAPP");
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["booking", id],
    queryFn: () => api<BookingDetail>(`/bookings/${id}`),
  });
  const act = async (action: string, body?: Record<string, unknown>) => {
    try {
      const res = await api<{ mocked?: boolean }>(`/bookings/${id}/${action}`, { method: "POST", body: body || {} });
      toast.success(action === "send" ? (res.mocked ? "Sent (mock mode)" : "Message sent") : "Done");
      qc.invalidateQueries({ queryKey: ["booking", id] });
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };
  const b = data?.booking;
  return (
    <Modal open onClose={onClose} title={b ? `Booking ${b.bookingCode}` : "Booking"} wide>
      {isLoading && <LoadingState />}
      {b && data && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">Customer</span><b>{b.customer ? fullName(b.customer) : "—"}</b></div>
              <div className="flex justify-between"><span className="text-slate-400">Class</span><b>{b.session?.title || b.session?.workshop?.name || "—"}</b></div>
              <div className="flex justify-between"><span className="text-slate-400">When</span><b>{b.session ? fmtDateTime(b.session.startsAt) : "—"}</b></div>
              <div className="flex justify-between"><span className="text-slate-400">Participants</span><b>{b.participants}</b></div>
              <div className="flex justify-between"><span className="text-slate-400">Source</span><b>{b.source}</b></div>
              {b.notes && <p className="rounded-lg bg-slate-50 p-2.5 text-[13px]">{b.notes}</p>}
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">Status</span><StatusBadge status={b.status} /></div>
              <div className="flex justify-between"><span className="text-slate-400">Payment</span><StatusBadge status={b.paymentStatus} /></div>
              <div className="flex justify-between"><span className="text-slate-400">Total</span><b>{money(b.totalAmount, currency)}</b></div>
              <div className="flex justify-between"><span className="text-slate-400">Paid</span><b>{money(b.amountPaid, currency)}</b></div>
              <div className={cn("flex justify-between rounded-lg p-2", data.balance > 0 ? "bg-red-50" : "bg-emerald-50")}>
                <span className="text-slate-500">Balance</span><b>{money(data.balance, currency)}</b>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <p className="mb-1.5 text-[13px] font-semibold">Payment history</p>
            {b.payments.length === 0 && <p className="text-[13px] text-slate-400">No payments recorded yet.</p>}
            {b.payments.map((p) => (
              <div key={p.id} className="flex items-center gap-2 border-b border-slate-50 py-1.5 text-[13px]">
                <b>{money(p.amount, currency)}</b>
                <span className="text-slate-500">{p.method}</span>
                <span className="flex-1 truncate text-slate-400">{p.reference || ""}</span>
                <StatusBadge status={p.status} />
                <span className="text-xs text-slate-400">{fmtDateTime(p.receivedAt)}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl bg-slate-50 p-3">
            <p className="mb-2 text-[13px] font-semibold">Message customer</p>
            <div className="flex flex-wrap gap-2">
              <Select value={sendKind} onChange={(e) => setSendKind(e.target.value as "confirmation" | "reminder")} className="!w-40 !bg-white">
                <option value="confirmation">Confirmation</option>
                <option value="reminder">Reminder</option>
              </Select>
              <Select value={sendChannel} onChange={(e) => setSendChannel(e.target.value)} className="!w-40 !bg-white">
                {["WHATSAPP", "EMAIL", "INSTAGRAM"].map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
              <Button variant="outline" className="!bg-white" onClick={() => act("send", { kind: sendKind, channel: sendChannel })}>
                <Send className="h-4 w-4" /> Send
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {b.status === "PENDING" && <Button variant="outline" onClick={() => act("confirm")}><Check className="h-4 w-4" /> Confirm</Button>}
            {b.status === "CONFIRMED" && <Button variant="outline" onClick={() => act("complete")}>Mark completed</Button>}
            {(b.status === "PENDING" || b.status === "CONFIRMED") && (
              <>
                <Button variant="outline" onClick={() => act("no-show")}><UserX className="h-4 w-4" /> No-show</Button>
                <Button variant="outline" onClick={() => act("cancel")}><X className="h-4 w-4" /> Cancel booking</Button>
              </>
            )}
            <Button variant="outline" onClick={() => setPayOpen(true)}><Banknote className="h-4 w-4" /> Record payment</Button>
          </div>
          {payOpen && <PaymentModal booking={b} onClose={() => setPayOpen(false)} onDone={() => { setPayOpen(false); qc.invalidateQueries({ queryKey: ["booking", id] }); onChanged(); }} />}
        </>
      )}
    </Modal>
  );
}
