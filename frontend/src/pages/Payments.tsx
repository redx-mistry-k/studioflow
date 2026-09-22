import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Wallet, AlertCircle, CheckCircle, Banknote, Undo2 } from "lucide-react";
import { api, qs, Paged } from "../lib/api";
import { Card, CardHeader, Th, Td, StatusBadge, Pagination, SearchInput, Select, LoadingState, ErrorState, EmptyState, Button, ConfirmModal } from "../components/ui";
import { useBusiness } from "../components/Layout";
import { useAuth, roleRank } from "../auth/AuthContext";
import { useToast } from "../components/toast";
import { fullName, money, fmtDateTime } from "../lib/utils";
import { Payment, Booking } from "../lib/types";
import { PaymentModal } from "./Bookings";

type PaymentRow = Payment & {
  customer?: { firstName: string; lastName: string } | null;
  booking?: { bookingCode: string; totalAmount: number; amountPaid: number; paymentStatus: string } | null;
};

interface DashPending {
  kpis: { pendingPayments: number; pendingPaymentsCount: number };
  pendingList: (Booking & { balance: number })[];
}

export default function Payments() {
  const [q, setQ] = useState("");
  const [method, setMethod] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [payFor, setPayFor] = useState<Booking | null>(null);
  const [refund, setRefund] = useState<PaymentRow | null>(null);
  const { currency } = useBusiness();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const isManager = roleRank(user?.role || "") >= roleRank("MANAGER");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["payments", q, method, status, page],
    queryFn: () => api<Paged<PaymentRow>>(`/payments${qs({ q, method, status, page, limit: 15 })}`),
  });
  const { data: pending } = useQuery({
    queryKey: ["dashboard-pending"],
    queryFn: () => api<DashPending>("/dashboard"),
  });
  const { data: month } = useQuery({
    queryKey: ["payments-month"],
    queryFn: () => api<{ revenue: number; paymentsCount: number }>("/reports/overview?preset=month"),
    enabled: isManager,
    retry: false,
  });

  const doRefund = async () => {
    if (!refund) return;
    try {
      await api(`/payments/${refund.id}/refund`, { method: "POST", body: {} });
      toast.success("Payment refunded");
      setRefund(null);
      qc.invalidateQueries({ queryKey: ["payments"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Payments</h1>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {isManager && (
          <Card className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><Wallet className="h-5 w-5" /></div>
            <div><p className="text-xl font-bold">{money(month?.revenue, currency)}</p><p className="text-[13px] text-slate-500">Collected this month ({month?.paymentsCount ?? 0})</p></div>
          </Card>
        )}
        <Card className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-700"><AlertCircle className="h-5 w-5" /></div>
          <div><p className="text-xl font-bold">{money(pending?.kpis.pendingPayments, currency)}</p><p className="text-[13px] text-slate-500">Outstanding ({pending?.kpis.pendingPaymentsCount || 0} bookings)</p></div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700"><CheckCircle className="h-5 w-5" /></div>
          <div><p className="text-xl font-bold">{data?.meta.total ?? "—"}</p><p className="text-[13px] text-slate-500">Payments on record</p></div>
        </Card>
      </div>

      {pending && pending.pendingList.length > 0 && (
        <Card>
          <CardHeader title="Outstanding balances" />
          <div className="divide-y divide-slate-50">
            {pending.pendingList.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{b.customer ? fullName(b.customer) : "—"}</p>
                  <p className="text-xs text-slate-400">{b.bookingCode} · {(b.session as unknown as { workshop?: { name: string } } | null)?.workshop?.name || ""}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-red-600">{money(b.balance, currency)}</p>
                  <p className="text-xs text-slate-400">of {money(b.totalAmount, currency)}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setPayFor(b)}><Banknote className="h-3.5 w-3.5" /> Collect</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search customer, code, reference..." className="w-64" />
          <Select value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }} className="!w-40">
            <option value="">All methods</option>
            {["UPI", "CASH", "CARD", "NETBANKING", "OTHER"].map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="!w-40">
            <option value="">All statuses</option>
            {["COMPLETED", "REFUNDED"].map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </div>
        {isLoading && <LoadingState />}
        {error && <ErrorState message="Failed to load payments" onRetry={() => refetch()} />}
        {data && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead><tr className="border-b border-slate-100"><Th>Received</Th><Th>Customer</Th><Th>Booking</Th><Th>Amount</Th><Th>Method</Th><Th>Reference</Th><Th>Status</Th><Th /></tr></thead>
                <tbody>
                  {data.data.map((p) => (
                    <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <Td className="whitespace-nowrap">{fmtDateTime(p.receivedAt)}</Td>
                      <Td>{p.customer ? fullName(p.customer) : "—"}</Td>
                      <Td><Link to={`/bookings?highlight=${p.bookingId}`} className="font-mono text-[13px] text-brand-700 hover:underline">{p.booking?.bookingCode || p.bookingId.slice(0, 8)}</Link></Td>
                      <Td className="font-semibold">{money(p.amount, currency)}</Td>
                      <Td><span className="text-xs font-medium text-slate-500">{p.method}</span></Td>
                      <Td className="text-slate-500">{p.reference || "—"}</Td>
                      <Td><StatusBadge status={p.status} /></Td>
                      <Td>
                        {p.status === "COMPLETED" && (
                          <div className="flex justify-end">
                            <button title="Refund" onClick={() => setRefund(p)} className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600"><Undo2 className="h-4 w-4" /></button>
                          </div>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.data.length === 0 && <EmptyState title="No payments recorded" />}
            </div>
            <Pagination page={data.meta.page} pages={data.meta.pages} total={data.meta.total} onPage={setPage} />
          </>
        )}
      </Card>

      {payFor && <PaymentModal booking={payFor} onClose={() => setPayFor(null)} onDone={() => { setPayFor(null); qc.invalidateQueries({ queryKey: ["payments"] }); qc.invalidateQueries({ queryKey: ["dashboard-pending"] }); qc.invalidateQueries({ queryKey: ["payments-month"] }); }} />}
      <ConfirmModal open={!!refund} onClose={() => setRefund(null)} onConfirm={doRefund} title="Refund payment" message={`Refund ${refund ? money(refund.amount, currency) : ""}? The booking balance will be updated.`} confirmLabel="Refund" danger />
    </div>
  );
}
