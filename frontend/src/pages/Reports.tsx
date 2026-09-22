import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, TrendingUp, CalendarCheck, Percent, UserPlus, Undo2, Clock } from "lucide-react";
import { api, qs } from "../lib/api";
import { getToken } from "../lib/api";
import { Card, Button, Select, Th, Td, LoadingState, ErrorState } from "../components/ui";
import { useToast } from "../components/toast";
import { useBusiness } from "../components/Layout";
import { money, fmtDate } from "../lib/utils";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  PieChart, Pie,
} from "recharts";

type Preset = "today" | "week" | "month";

interface ReportData {
  from: string;
  to: string;
  enquiriesBySource: { source: string; count: number }[];
  enquiriesTotal: number;
  enquiriesConverted: number;
  conversionRate: number;
  bookingsTotal: number;
  bookingConversionRate: number;
  revenue: number;
  paymentsCount: number;
  revenueByWorkshop: { name: string; revenue: number }[];
  popularWorkshops: { name: string; bookings: number }[];
  cancelled: number;
  noShows: number;
  outstanding: { amount: number; count: number };
  returnRate: number;
  avgResponseMins: number;
  responseSamples: number;
  byMethod: { method: string; amount: number }[];
}

const PIE_COLORS = ["#7c3aed", "#0d9488", "#f59e0b", "#e11d48", "#2563eb", "#64748b"];

export default function Reports() {
  const [preset, setPreset] = useState<Preset>("month");
  const { currency } = useBusiness();
  const toast = useToast();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["reports", preset],
    queryFn: () => api<ReportData>(`/reports/overview${qs({ preset })}`),
  });

  const download = async (type: string) => {
    try {
      const token = getToken();
      const res = await fetch(`/api/reports/export${qs({ type, preset })}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `studioflow-${type}-${preset}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`${type} CSV downloaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-bold">Reports</h1>
        <Select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} className="!w-36">
          <option value="today">Today</option>
          <option value="week">Last 7 days</option>
          <option value="month">This month</option>
        </Select>
        <Button variant="outline" size="sm" onClick={() => download("bookings")}><Download className="h-4 w-4" /> Bookings</Button>
        <Button variant="outline" size="sm" onClick={() => download("payments")}><Download className="h-4 w-4" /> Payments</Button>
        <Button variant="outline" size="sm" onClick={() => download("customers")}><Download className="h-4 w-4" /> Customers</Button>
        <Button variant="outline" size="sm" onClick={() => download("enquiries")}><Download className="h-4 w-4" /> Enquiries</Button>
      </div>

      {isLoading && <LoadingState />}
      {error && <ErrorState message="Failed to load reports" onRetry={() => refetch()} />}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-700"><TrendingUp className="h-5 w-5" /></div>
              <div className="min-w-0"><p className="truncate text-xl font-bold">{money(data.revenue, currency)}</p><p className="text-[13px] text-slate-500">Revenue ({data.paymentsCount} payments)</p></div>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700"><CalendarCheck className="h-5 w-5" /></div>
              <div><p className="text-xl font-bold">{data.bookingsTotal}</p><p className="text-[13px] text-slate-500">Bookings</p></div>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700"><UserPlus className="h-5 w-5" /></div>
              <div><p className="text-xl font-bold">{data.enquiriesTotal}</p><p className="text-[13px] text-slate-500">Enquiries ({data.enquiriesConverted} converted)</p></div>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><Percent className="h-5 w-5" /></div>
              <div><p className="text-xl font-bold">{data.conversionRate}%</p><p className="text-[13px] text-slate-500">Enquiry conversion</p></div>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700"><Undo2 className="h-5 w-5" /></div>
              <div><p className="text-xl font-bold">{money(data.outstanding.amount, currency)}</p><p className="text-[13px] text-slate-500">Outstanding ({data.outstanding.count})</p></div>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Clock className="h-5 w-5" /></div>
              <div><p className="text-xl font-bold">{data.avgResponseMins}m</p><p className="text-[13px] text-slate-500">Avg first response ({data.responseSamples})</p></div>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><Percent className="h-5 w-5" /></div>
              <div><p className="text-xl font-bold">{data.returnRate}%</p><p className="text-[13px] text-slate-500">Repeat customers</p></div>
            </Card>
            <Card className="p-4">
              <p className="text-xl font-bold">{data.cancelled} <span className="text-sm font-normal text-slate-400">cancelled</span></p>
              <p className="text-[13px] text-slate-500">{data.noShows} no-shows · {data.bookingConversionRate}% enquiry→booking</p>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-3 font-semibold">Enquiries by source</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.enquiriesBySource} dataKey="count" nameKey="source" innerRadius={45} outerRadius={75} paddingAngle={3}>
                      {data.enquiriesBySource.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.enquiriesBySource.map((s, i) => (
                  <span key={s.source} className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    {s.source} ({s.count})
                  </span>
                ))}
                {data.enquiriesBySource.length === 0 && <p className="text-sm text-slate-400">No enquiries in this period</p>}
              </div>
            </Card>
            <Card className="p-5">
              <h3 className="mb-3 font-semibold">Revenue by payment method</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.byMethod} dataKey="amount" nameKey="method" innerRadius={45} outerRadius={75} paddingAngle={3}>
                      {data.byMethod.map((_, i) => <Cell key={i} fill={PIE_COLORS[(i + 2) % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => money(Number(v), currency)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.byMethod.map((s, i) => (
                  <span key={s.method} className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: PIE_COLORS[(i + 2) % PIE_COLORS.length] }} />
                    {s.method} ({money(s.amount, currency)})
                  </span>
                ))}
                {data.byMethod.length === 0 && <p className="text-sm text-slate-400">No payments in this period</p>}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card className="p-5">
              <h3 className="mb-3 font-semibold">Revenue by workshop</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.revenueByWorkshop} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v) => money(Number(v), currency)} />
                    <Bar dataKey="revenue" fill="#0d9488" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card>
              <div className="border-b border-slate-100 px-5 py-4"><h3 className="font-semibold">Popular workshops (by bookings)</h3></div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-slate-100"><Th>Workshop</Th><Th>Bookings</Th><Th>Share</Th></tr></thead>
                  <tbody>
                    {data.popularWorkshops.map((w) => {
                      const max = Math.max(1, ...data.popularWorkshops.map((x) => x.bookings));
                      return (
                        <tr key={w.name} className="border-b border-slate-50">
                          <Td className="font-medium">{w.name}</Td>
                          <Td>{w.bookings}</Td>
                          <Td>
                            <div className="h-2.5 w-40 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-brand-500" style={{ width: `${(w.bookings / max) * 100}%` }} />
                            </div>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {data.popularWorkshops.length === 0 && <p className="px-5 py-6 text-center text-sm text-slate-400">No bookings in this period</p>}
              </div>
            </Card>
          </div>
          <p className="text-xs text-slate-400">Period: {fmtDate(data.from)} – {fmtDate(data.to)}</p>
        </>
      )}
    </div>
  );
}
