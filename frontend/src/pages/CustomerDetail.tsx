import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { api } from "../lib/api";
import { Card, Tabs, Avatar, StatusBadge, ChannelBadge, Badge, LoadingState, ErrorState, EmptyState } from "../components/ui";
import { useBusiness } from "../components/Layout";
import { fullName, money, fmtDateTime, fmtDate, timeAgo } from "../lib/utils";
import { Customer, Conversation, Booking, Payment, FollowUp } from "../lib/types";

interface Detail {
  customer: Customer & { conversations: Conversation[]; bookings: Booking[]; payments: Payment[]; followUps: FollowUp[] };
  stats: { totalSpend: number; completedClasses: number; nextBooking: Booking | null };
  activity: { id: string; action: string; createdAt: string; user: { name: string } | null }[];
}

type Tab = "overview" | "conversations" | "bookings" | "payments" | "followups" | "notes" | "activity";

export default function CustomerDetail() {
  const { id } = useParams();
  const [tab, setTab] = useState<Tab>("overview");
  const { currency } = useBusiness();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["customer", id],
    queryFn: () => api<Detail>(`/customers/${id}`),
  });

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState message="Failed to load customer" onRetry={() => refetch()} />;
  const c = data.customer;

  return (
    <div className="flex flex-col gap-4">
      <Link to="/customers" className="flex w-fit items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Back to customers
      </Link>
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar first={c.firstName} last={c.lastName} size="lg" />
          <div className="mr-auto">
            <h1 className="text-xl font-bold">{fullName(c)}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={c.status} />
              <Badge className="bg-slate-100 text-slate-600">{c.source}</Badge>
              {c.tags.map((t) => <Badge key={t} className="bg-brand-100 text-brand-700">{t}</Badge>)}
            </div>
          </div>
          <div className="flex gap-6 text-center">
            <div><p className="text-lg font-bold">{c.bookings.length}</p><p className="text-xs text-slate-500">Bookings</p></div>
            <div><p className="text-lg font-bold">{data.stats.completedClasses}</p><p className="text-xs text-slate-500">Completed</p></div>
            <div><p className="text-lg font-bold">{money(data.stats.totalSpend, currency)}</p><p className="text-xs text-slate-500">Spent</p></div>
          </div>
        </div>
      </Card>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "conversations", label: "Conversations", count: c.conversations.length },
          { id: "bookings", label: "Bookings", count: c.bookings.length },
          { id: "payments", label: "Payments", count: c.payments.length },
          { id: "followups", label: "Follow-ups", count: c.followUps.length },
          { id: "notes", label: "Notes" },
          { id: "activity", label: "Activity" },
        ]}
      />

      {tab === "overview" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card className="p-5">
            <h3 className="mb-3 font-semibold">Contact information</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-400">Phone</dt><dd>{c.phone || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">WhatsApp</dt><dd>{c.whatsappNumber || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Email</dt><dd className="truncate pl-4">{c.email || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Instagram</dt><dd>{c.instagramHandle || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Address</dt><dd className="text-right">{c.address || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Date of birth</dt><dd>{c.dateOfBirth ? fmtDate(c.dateOfBirth) : "—"}</dd></div>
            </dl>
          </Card>
          <Card className="p-5">
            <h3 className="mb-3 font-semibold">Engagement</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-400">Customer since</dt><dd>{fmtDate(c.createdAt)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Last interaction</dt><dd>{timeAgo(c.updatedAt)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Next booking</dt><dd>{data.stats.nextBooking ? `${data.stats.nextBooking.bookingCode}` : "None"}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Total bookings</dt><dd>{c.bookings.length}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Total spending</dt><dd className="font-semibold">{money(data.stats.totalSpend, currency)}</dd></div>
            </dl>
          </Card>
        </div>
      )}

      {tab === "conversations" && (
        <Card>
          {c.conversations.length === 0 && <EmptyState title="No conversations" />}
          {c.conversations.map((cv) => (
            <Link key={cv.id} to={`/inbox?c=${cv.id}`} className="flex items-center gap-3 border-b border-slate-50 px-5 py-3 hover:bg-slate-50">
              <ChannelBadge channel={cv.channel} />
              <p className="flex-1 truncate text-sm">{cv.subject || `${cv.channel} conversation`}</p>
              <StatusBadge status={cv.status} />
              <span className="text-xs text-slate-400">{timeAgo(cv.lastMessageAt)}</span>
            </Link>
          ))}
        </Card>
      )}

      {tab === "bookings" && (
        <Card>
          {c.bookings.length === 0 && <EmptyState title="No bookings" />}
          {c.bookings.map((b) => (
            <Link key={b.id} to={`/bookings?highlight=${b.id}`} className="flex flex-wrap items-center gap-3 border-b border-slate-50 px-5 py-3 hover:bg-slate-50">
              <p className="text-sm font-medium">{b.bookingCode}</p>
              <p className="flex-1 text-sm text-slate-500">{(b.session as unknown as { workshop?: { name: string } })?.workshop?.name || ""}</p>
              <span className="text-sm">{money(b.totalAmount, currency)}</span>
              <StatusBadge status={b.status} />
              <StatusBadge status={b.paymentStatus} />
            </Link>
          ))}
        </Card>
      )}

      {tab === "payments" && (
        <Card>
          {c.payments.length === 0 && <EmptyState title="No payments" />}
          {c.payments.map((p) => (
            <div key={p.id} className="flex items-center gap-3 border-b border-slate-50 px-5 py-3">
              <p className="text-sm font-medium">{money(p.amount, currency)}</p>
              <Badge className="bg-slate-100 text-slate-600">{p.method}</Badge>
              <p className="flex-1 text-xs text-slate-400">{p.reference || ""} · {fmtDateTime(p.receivedAt)}</p>
              <StatusBadge status={p.status} />
            </div>
          ))}
        </Card>
      )}

      {tab === "followups" && (
        <Card>
          {c.followUps.length === 0 && <EmptyState title="No follow-ups" />}
          {c.followUps.map((f) => (
            <div key={f.id} className="flex items-center gap-3 border-b border-slate-50 px-5 py-3">
              <div className="flex-1">
                <p className="text-sm font-medium">{f.reason}</p>
                <p className="text-xs text-slate-400">{fmtDateTime(f.dueAt)} · {f.channel}</p>
              </div>
              <StatusBadge status={f.status} />
            </div>
          ))}
        </Card>
      )}

      {tab === "notes" && (
        <Card className="p-5">
          <p className="whitespace-pre-wrap text-sm text-slate-700">{c.notes || "No notes yet."}</p>
        </Card>
      )}

      {tab === "activity" && (
        <Card>
          {data.activity.length === 0 && <EmptyState title="No activity" />}
          {data.activity.map((a) => (
            <div key={a.id} className="flex items-center gap-3 border-b border-slate-50 px-5 py-2.5 text-sm">
              <div className="h-2 w-2 rounded-full bg-brand-400" />
              <p className="flex-1 text-slate-600">{a.action.replace(/_/g, " ").toLowerCase()}{a.user ? ` · ${a.user.name}` : ""}</p>
              <span className="text-xs text-slate-400">{timeAgo(a.createdAt)}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
