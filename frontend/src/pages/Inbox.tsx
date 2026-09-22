import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, Link } from "react-router-dom";
import { Send, StickyNote, Plus, CheckCheck, FlaskConical, Tag } from "lucide-react";
import { api, qs, Paged } from "../lib/api";
import { Card, Button, Badge, StatusBadge, ChannelBadge, Avatar, Modal, Field, Select, Input, Textarea, SearchInput, EmptyState, LoadingState } from "../components/ui";
import { useToast } from "../components/toast";
import { useBusiness } from "../components/Layout";
import { cn, fullName, timeAgo, fmtDateTime, money } from "../lib/utils";
import { Conversation, Message, Customer, Booking, StaffUser } from "../lib/types";

const FILTERS = ["ALL", "UNREAD", "WHATSAPP", "INSTAGRAM", "EMAIL", "WEBSITE", "MANUAL", "AWAITING_REPLY", "FOLLOW_UP", "RESOLVED"];
const STATUSES = ["NEW", "OPEN", "AWAITING_CUSTOMER", "FOLLOW_UP", "RESOLVED"];

interface ThreadData {
  conversation: Conversation & { customer: Customer & { bookings: Booking[] }; messages: Message[] };
  totalSpent: number;
  upcomingBookings: Booking[];
}

export default function Inbox() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("c") || "";
  const [filter, setFilter] = useState(params.get("filter") || "ALL");
  const [q, setQ] = useState("");
  const [showMobile, setShowMobile] = useState<"list" | "thread">("list");
  const toast = useToast();

  const { data: list, isLoading } = useQuery({
    queryKey: ["conversations", filter, q],
    queryFn: () => api<Paged<Conversation>>(`/conversations${qs({ filter, q, limit: 50 })}`),
    refetchInterval: 20000,
  });

  const select = (id: string) => {
    setParams({ c: id });
    setShowMobile("thread");
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-xl font-bold">Inbox</h1>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn("rounded-lg px-2.5 py-1.5 text-xs font-medium", filter === f ? "bg-brand-600 text-white" : "bg-white text-slate-600 hover:bg-slate-100")}
            >
              {f.replace(/_/g, " ")}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <SimulateButtons onDone={() => toast.success("Simulated message received")} />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[300px_1fr_280px]">
        {/* List */}
        <Card className={cn("flex min-h-0 flex-col overflow-hidden", showMobile !== "list" && "hidden lg:flex")}>
          <div className="border-b border-slate-100 p-3">
            <SearchInput value={q} onChange={setQ} placeholder="Search conversations..." />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading && <LoadingState />}
            {(list?.data || []).map((c) => {
              const last = c.messages?.[0];
              return (
                <button
                  key={c.id}
                  onClick={() => select(c.id)}
                  className={cn("flex w-full items-start gap-2.5 border-b border-slate-50 px-3 py-3 text-left hover:bg-slate-50", selectedId === c.id && "bg-brand-50/60")}
                >
                  <Avatar first={c.customer?.firstName || "?"} last={c.customer?.lastName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className="truncate text-sm font-medium text-slate-800">{c.customer ? fullName(c.customer) : "—"}</p>
                      <span className="whitespace-nowrap text-[11px] text-slate-400">{timeAgo(c.lastMessageAt)}</span>
                    </div>
                    <p className="truncate text-[13px] text-slate-500">{last?.isNote ? `📝 ${last.body}` : last?.body || "—"}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <ChannelBadge channel={c.channel} />
                      {c.unreadCount > 0 && <Badge className="bg-brand-600 text-white">{c.unreadCount} new</Badge>}
                    </div>
                  </div>
                </button>
              );
            })}
            {!isLoading && (list?.data || []).length === 0 && <EmptyState title="No conversations" message="Conversations from all channels appear here." />}
          </div>
        </Card>

        {/* Thread */}
        <div className={cn("min-h-0", showMobile !== "thread" && "hidden lg:block")}>
          {selectedId ? (
            <ThreadView id={selectedId} onBack={() => setShowMobile("list")} />
          ) : (
            <Card className="flex h-full items-center justify-center">
              <EmptyState title="Select a conversation" message="Choose a conversation from the list to start replying." />
            </Card>
          )}
        </div>

        {/* Customer panel */}
        <div className={cn("min-h-0 overflow-y-auto", "hidden xl:block")}>
          {selectedId ? <CustomerPanel id={selectedId} /> : null}
        </div>
      </div>
    </div>
  );
}

function SimulateButtons({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState("WHATSAPP");
  const [body, setBody] = useState("Hi! I want to know more about your workshops.");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();
  const send = async () => {
    setBusy(true);
    try {
      await api("/conversations/simulate-incoming", { method: "POST", body: { channel, body } });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      onDone();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FlaskConical className="h-4 w-4" /> Simulate
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Simulate incoming message (dev)">
        <div className="flex flex-col gap-3">
          <Field label="Channel">
            <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
              {["WHATSAPP", "INSTAGRAM", "EMAIL", "WEBSITE"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Message">
            <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <div className="flex justify-end">
            <Button onClick={send} loading={busy}>Send simulated message</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function ThreadView({ id, onBack }: { id: string; onBack: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [tab, setTab] = useState<"reply" | "note">("reply");
  const [sending, setSending] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => api<ThreadData>(`/conversations/${id}`),
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (data && data.conversation.unreadCount > 0) {
      api(`/conversations/${id}`, { method: "PATCH", body: { markRead: true } }).then(() => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, data?.conversation.unreadCount]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.conversation.messages.length]);

  const { data: staff } = useQuery({
    queryKey: ["staff-list"],
    queryFn: () => api<Paged<StaffUser>>("/users?limit=50"),
    retry: false,
  });

  if (isLoading || !data) return <Card className="h-full"><LoadingState /></Card>;
  const c = data.conversation;

  const sendReply = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const res = await api<{ mocked: boolean }>(`/conversations/${id}/messages`, { method: "POST", body: { body: reply } });
      setReply("");
      qc.invalidateQueries({ queryKey: ["conversation", id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success(res.mocked ? "Sent (mock mode — no credentials configured)" : "Reply sent");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const saveNote = async () => {
    if (!note.trim()) return;
    setSending(true);
    try {
      await api(`/conversations/${id}/notes`, { method: "POST", body: { body: note } });
      setNote("");
      qc.invalidateQueries({ queryKey: ["conversation", id] });
      toast.success("Note added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSending(false);
    }
  };

  const patch = async (body: Record<string, unknown>, msg = "Updated") => {
    try {
      await api(`/conversations/${id}`, { method: "PATCH", body });
      qc.invalidateQueries({ queryKey: ["conversation", id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success(msg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    patch({ tags: [...c.tags, t] }, "Tag added");
    setTagInput("");
  };

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
        <button onClick={onBack} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden">←</button>
        <Avatar first={c.customer.firstName} last={c.customer.lastName} />
        <div className="mr-auto">
          <p className="text-sm font-semibold">{fullName(c.customer)}</p>
          <div className="flex items-center gap-1.5">
            <ChannelBadge channel={c.channel} />
            <StatusBadge status={c.status} />
          </div>
        </div>
        <Select
          value={c.status}
          onChange={(e) => patch({ status: e.target.value }, "Status updated")}
          className="!h-8 !w-auto text-xs"
        >
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </Select>
        <Select
          value={c.assignedToId || ""}
          onChange={(e) => patch({ assignedToId: e.target.value || null }, "Assigned")}
          className="!h-8 !w-auto text-xs"
        >
          <option value="">Unassigned</option>
          {(staff?.data || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      </div>

      {(c.tags.length > 0 || true) && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-4 py-2">
          <Tag className="h-3.5 w-3.5 text-slate-400" />
          {c.tags.map((t) => (
            <Badge key={t} className="bg-slate-100 text-slate-600">
              {t}
              <button className="ml-1" onClick={() => patch({ tags: c.tags.filter((x) => x !== t) }, "Tag removed")}>×</button>
            </Badge>
          ))}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTag()}
            placeholder="Add tag..."
            className="h-7 w-24 rounded-md border border-dashed border-slate-300 px-2 text-xs outline-none focus:border-brand-400"
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 px-4 py-4">
        <div className="flex flex-col gap-2.5">
          {c.messages.map((m) =>
            m.isNote ? (
              <div key={m.id} className="mx-auto w-full max-w-lg rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="flex items-center gap-1 text-[11px] font-semibold text-amber-700"><StickyNote className="h-3 w-3" /> NOTE · {m.senderName} · {fmtDateTime(m.createdAt)}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-amber-900">{m.body}</p>
              </div>
            ) : (
              <div key={m.id} className={cn("flex", m.direction === "OUT" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[75%] rounded-2xl px-3.5 py-2.5", m.direction === "OUT" ? (m.senderType === "SYSTEM" ? "bg-violet-100 text-violet-900" : "bg-brand-600 text-white") : "bg-white text-slate-800 shadow-card")}>
                  <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                  <p className={cn("mt-1 flex items-center justify-end gap-1 text-[11px]", m.direction === "OUT" ? (m.senderType === "SYSTEM" ? "text-violet-500" : "text-brand-200") : "text-slate-400")}>
                    {m.senderName} · {fmtDateTime(m.createdAt)}
                    {m.direction === "OUT" && m.status === "MOCKED" && " · mock"}
                    {m.direction === "OUT" && <CheckCheck className="h-3 w-3" />}
                  </p>
                </div>
              </div>
            )
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-slate-100 p-3">
        <div className="mb-2 flex gap-1">
          <button onClick={() => setTab("reply")} className={cn("rounded-lg px-3 py-1.5 text-[13px] font-medium", tab === "reply" ? "bg-brand-50 text-brand-700" : "text-slate-500")}>Reply</button>
          <button onClick={() => setTab("note")} className={cn("flex items-center gap-1 rounded-lg px-3 py-1.5 text-[13px] font-medium", tab === "note" ? "bg-amber-50 text-amber-700" : "text-slate-500")}><StickyNote className="h-3.5 w-3.5" /> Internal note</button>
        </div>
        {tab === "reply" ? (
          <div className="flex gap-2">
            <Textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={`Reply via ${c.channel}...`} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendReply(); }} />
            <Button onClick={sendReply} loading={sending} className="shrink-0 self-end"><Send className="h-4 w-4" /> Send</Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Only visible to staff..." />
            <Button variant="secondary" onClick={saveNote} loading={sending} className="shrink-0 self-end">Save</Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function CustomerPanel({ id }: { id: string }) {
  const { currency } = useBusiness();
  const [followOpen, setFollowOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [dueAt, setDueAt] = useState("");
  const toast = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => api<ThreadData>(`/conversations/${id}`),
  });
  if (!data) return null;
  const cu = data.conversation.customer;

  const createFollowUp = async () => {
    if (!reason.trim() || !dueAt) return toast.error("Reason and due time required");
    try {
      await api("/followups", { method: "POST", body: { customerId: cu.id, conversationId: id, reason, dueAt } });
      toast.success("Follow-up created");
      setFollowOpen(false);
      setReason("");
      qc.invalidateQueries({ queryKey: ["followups"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <Avatar first={cu.firstName} last={cu.lastName} size="lg" />
        <div>
          <p className="font-semibold">{fullName(cu)}</p>
          <p className="text-xs text-slate-400">Customer since {new Date(cu.createdAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</p>
        </div>
      </div>
      <div className="mt-3 space-y-1.5 text-[13px]">
        {cu.phone && <p><span className="text-slate-400">Phone:</span> {cu.phone}</p>}
        {cu.whatsappNumber && <p><span className="text-slate-400">WhatsApp:</span> {cu.whatsappNumber}</p>}
        {cu.email && <p className="truncate"><span className="text-slate-400">Email:</span> {cu.email}</p>}
        {cu.instagramHandle && <p><span className="text-slate-400">Instagram:</span> {cu.instagramHandle}</p>}
        <p><span className="text-slate-400">Total spent:</span> <b>{money(data.totalSpent, currency)}</b></p>
      </div>
      {cu.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {cu.tags.map((t) => <Badge key={t} className="bg-slate-100 text-slate-600">{t}</Badge>)}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <Link to={`/customers/${cu.id}`} className="flex-1"><Button variant="outline" size="sm" className="w-full">View profile</Button></Link>
        <Button variant="outline" size="sm" onClick={() => setFollowOpen(true)}><Plus className="h-3.5 w-3.5" /> Follow-up</Button>
      </div>
      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Upcoming bookings</p>
        {data.upcomingBookings.length === 0 && <p className="text-[13px] text-slate-400">None</p>}
        {data.upcomingBookings.map((b) => (
          <div key={b.id} className="mb-1.5 rounded-lg bg-slate-50 px-2.5 py-2 text-[13px]">
            <p className="font-medium">{b.session?.workshop?.name || b.bookingCode}</p>
            <p className="text-xs text-slate-500">{b.session ? fmtDateTime(b.session.startsAt) : ""} · <StatusBadge status={b.status} /></p>
          </div>
        ))}
      </div>
      <Modal open={followOpen} onClose={() => setFollowOpen(false)} title="Create follow-up">
        <div className="flex flex-col gap-3">
          <Field label="Reason" required><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <Field label="Due at" required><Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></Field>
          <div className="flex justify-end"><Button onClick={createFollowUp}>Create</Button></div>
        </div>
      </Modal>
    </Card>
  );
}
