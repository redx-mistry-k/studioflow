import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  GraduationCap, Users, MessageSquarePlus, Hourglass, CalendarCheck2,
  Wallet, PhoneCall, TrendingUp, ArrowRight,
} from "lucide-react";
import { api } from "../lib/api";
import { Card, CardHeader, LoadingState, ErrorState, StatusBadge, ChannelBadge, Button, Badge } from "../components/ui";
import { useBusiness } from "../components/Layout";
import { money, fmtTime, fmtDateTime, timeAgo, waitingSince, fullName } from "../lib/utils";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, AreaChart, Area, CartesianGrid, PieChart, Pie, Cell,
} from "recharts";

interface DashboardData {
  kpis: {
    todaysClasses: number; todaysParticipants: number; newEnquiries: number; awaitingReply: number;
    confirmedBookings: number; pendingPayments: number; pendingPaymentsCount: number;
    followupsDue: number; revenueMonth: number; todaysBookings: number;
  };
  schedule: { id: string; startsAt: string; endsAt: string; title: string; instructor: string | null; participants: number; capacity: number; status: string }[];
  attention: { id: string; channel: string; status: string; lastMessageAt: string; customer: { firstName: string; lastName: string } | null; assignedTo: { name: string } | null; messages: { body: string }[] }[];
  followups: { id: string; reason: string; dueAt: string; channel: string; status: string; customer: { firstName: string; lastName: string } | null }[];
  pendingList: { id: string; bookingCode: string; totalAmount: number; amountPaid: number; balance: number; paymentStatus: string; customer: { firstName: string; lastName: string } | null; session: { workshop: { name: string } } | null }[];
  activity: { id: string; action: string; entityType: string; createdAt: string; user: { name: string } | null }[];
  charts: {
    enquiriesBySource: { source: string; count: number }[];
    bookingsPerWeek: { week: string; bookings: number }[];
    monthlyRevenue: { month: string; revenue: number }[];
    popularWorkshops: { name: string; bookings: number }[];
    conversion: { total: number; converted: number; rate: number };
  };
}

const PIE_COLORS = ["#7c3aed", "#0d9488", "#f59e0b", "#e11d48", "#2563eb", "#64748b"];

export default function Dashboard() {
  const { currency } = useBusiness();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<DashboardData>("/dashboard"),
  });

  if (isLoading) return <LoadingState label="Loading dashboard..." />;
  if (error || !data) return <ErrorState message={error instanceof Error ? error.message : "Failed"} onRetry={() => refetch()} />;

  const k = data.kpis;
  const kpis = [
    { label: "Today's Classes", value: k.todaysClasses, icon: GraduationCap, tone: "bg-violet-100 text-violet-700", link: "/calendar" },
    { label: "Today's Participants", value: k.todaysParticipants, icon: Users, tone: "bg-sky-100 text-sky-700", link: "/calendar" },
    { label: "New Enquiries", value: k.newEnquiries, icon: MessageSquarePlus, tone: "bg-blue-100 text-blue-700", link: "/inbox" },
    { label: "Awaiting Reply", value: k.awaitingReply, icon: Hourglass, tone: "bg-amber-100 text-amber-700", link: "/inbox?filter=AWAITING_REPLY" },
    { label: "Confirmed Bookings", value: k.confirmedBookings, icon: CalendarCheck2, tone: "bg-emerald-100 text-emerald-700", link: "/bookings?status=CONFIRMED" },
    { label: "Pending Payments", value: money(k.pendingPayments, currency), icon: Wallet, tone: "bg-red-100 text-red-700", link: "/payments", sub: `${k.pendingPaymentsCount} open` },
    { label: "Follow-ups Due", value: k.followupsDue, icon: PhoneCall, tone: "bg-orange-100 text-orange-700", link: "/followups?view=today" },
    { label: "Revenue This Month", value: money(k.revenueMonth, currency), icon: TrendingUp, tone: "bg-teal-100 text-teal-700", link: "/reports" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Good day! Here's your studio at a glance.</h1>
          <p className="text-sm text-slate-500">{k.todaysBookings} bookings created today</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((x) => (
          <Link key={x.label} to={x.link}>
            <Card className="p-4 transition hover:shadow-pop">
              <div className="flex items-center justify-between">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${x.tone}`}>
                  <x.icon className="h-[18px] w-[18px]" />
                </div>
              </div>
              <p className="mt-3 text-2xl font-bold text-slate-900">{x.value}</p>
              <p className="text-[13px] text-slate-500">
                {x.label} {x.sub && <span className="text-slate-400">· {x.sub}</span>}
              </p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Today's Schedule" action={<Link to="/calendar" className="flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:underline">Calendar <ArrowRight className="h-3.5 w-3.5" /></Link>} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-2.5 font-semibold">Time</th>
                  <th className="px-3 py-2.5 font-semibold">Class</th>
                  <th className="px-3 py-2.5 font-semibold">Booked</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.schedule.length === 0 && <tr><td colSpan={4} className="px-5 py-6 text-center text-sm text-slate-400">No classes today</td></tr>}
                {data.schedule.map((s) => (
                  <tr key={s.id} className="border-b border-slate-50 text-sm">
                    <td className="whitespace-nowrap px-5 py-2.5 font-medium">{fmtTime(s.startsAt)}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-slate-800">{s.title}</p>
                      <p className="text-xs text-slate-400">{s.instructor || "—"}</p>
                    </td>
                    <td className="px-3 py-2.5">{s.participants}/{s.capacity}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Enquiries Needing Attention" action={<Link to="/inbox" className="flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:underline">Inbox <ArrowRight className="h-3.5 w-3.5" /></Link>} />
          <div className="divide-y divide-slate-50">
            {data.attention.length === 0 && <p className="px-5 py-6 text-center text-sm text-slate-400">All caught up 🎉</p>}
            {data.attention.map((a) => (
              <Link key={a.id} to={`/inbox?c=${a.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-slate-800">{a.customer ? fullName(a.customer) : "Unknown"}</p>
                    <ChannelBadge channel={a.channel} />
                  </div>
                  <p className="truncate text-[13px] text-slate-500">{a.messages[0]?.body || "—"}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-amber-600">waiting {waitingSince(a.lastMessageAt)}</p>
                  <p className="text-xs text-slate-400">{a.assignedTo?.name || "Unassigned"}</p>
                </div>
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Follow-ups Due" action={<Link to="/followups" className="flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:underline">All <ArrowRight className="h-3.5 w-3.5" /></Link>} />
          <div className="divide-y divide-slate-50">
            {data.followups.length === 0 && <p className="px-5 py-6 text-center text-sm text-slate-400">Nothing due</p>}
            {data.followups.map((f) => (
              <Link key={f.id} to="/followups" className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{f.customer ? fullName(f.customer) : "—"}</p>
                  <p className="truncate text-[13px] text-slate-500">{f.reason}</p>
                </div>
                <Badge className="bg-slate-100 text-slate-600">{f.channel}</Badge>
                <span className="whitespace-nowrap text-xs text-slate-500">{fmtDateTime(f.dueAt)}</span>
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Pending Payments" action={<Link to="/payments" className="flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:underline">All <ArrowRight className="h-3.5 w-3.5" /></Link>} />
          <div className="divide-y divide-slate-50">
            {data.pendingList.length === 0 && <p className="px-5 py-6 text-center text-sm text-slate-400">No pending payments</p>}
            {data.pendingList.map((b) => (
              <Link key={b.id} to={`/bookings?highlight=${b.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{b.customer ? fullName(b.customer) : "—"}</p>
                  <p className="truncate text-xs text-slate-400">{b.bookingCode} · {b.session?.workshop.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{money(b.balance, currency)}</p>
                  <StatusBadge status={b.paymentStatus} />
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="p-5">
          <h3 className="mb-3 text-[15px] font-semibold">Enquiries by Source</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.charts.enquiriesBySource} dataKey="count" nameKey="source" innerRadius={45} outerRadius={75} paddingAngle={3}>
                  {data.charts.enquiriesBySource.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.charts.enquiriesBySource.map((s, i) => (
              <span key={s.source} className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                {s.source} ({s.count})
              </span>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 text-[15px] font-semibold">Bookings per Week</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.charts.bookingsPerWeek}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="bookings" fill="#7c3aed" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 text-[15px] font-semibold">Monthly Revenue</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.charts.monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(v) => money(Number(v), currency)} />
                <Area type="monotone" dataKey="revenue" stroke="#0d9488" fill="#99f6e4" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 text-[15px] font-semibold">Popular Workshops</h3>
          <div className="flex flex-col gap-2.5">
            {data.charts.popularWorkshops.map((w) => (
              <div key={w.name} className="flex items-center gap-3">
                <p className="w-40 truncate text-sm text-slate-600">{w.name}</p>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, (w.bookings / Math.max(1, data.charts.popularWorkshops[0]?.bookings || 1)) * 100)}%` }} />
                </div>
                <p className="w-8 text-right text-sm font-medium">{w.bookings}</p>
              </div>
            ))}
            {data.charts.popularWorkshops.length === 0 && <p className="text-sm text-slate-400">No bookings yet</p>}
          </div>
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
            <span className="font-semibold text-slate-800">Conversion rate: {data.charts.conversion.rate}%</span>
            <span className="text-slate-500"> ({data.charts.conversion.converted}/{data.charts.conversion.total} enquiries converted)</span>
          </div>
        </Card>
        <Card>
          <CardHeader title="Recent Activity" />
          <div className="max-h-72 divide-y divide-slate-50 overflow-y-auto">
            {data.activity.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-5 py-2.5">
                <div className="h-2 w-2 shrink-0 rounded-full bg-brand-400" />
                <p className="min-w-0 flex-1 truncate text-[13px] text-slate-600">
                  <span className="font-medium text-slate-800">{a.action.replace(/_/g, " ").toLowerCase()}</span>
                  {" · "}{a.entityType}{a.user ? ` · ${a.user.name}` : ""}
                </p>
                <span className="whitespace-nowrap text-xs text-slate-400">{timeAgo(a.createdAt)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
