import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Zap, History, Pencil, RotateCcw, X } from "lucide-react";
import { api, qs, Paged } from "../lib/api";
import { Card, Button, Tabs, Th, Td, StatusBadge, Modal, Field, Input, Select, Textarea, ConfirmModal, LoadingState, ErrorState, EmptyState } from "../components/ui";
import { useToast } from "../components/toast";
import { fmtDateTime, timeAgo } from "../lib/utils";
import { AutomationRule, MessageTemplate } from "../lib/types";

const VAR_HINT = "Variables: {{customer_name}} {{class_name}} {{date}} {{time}} {{amount}} {{location}} {{booking_id}} {{payment_link}}";

interface Execution {
  id: string;
  ruleId: string;
  triggerEntity: string;
  triggerEntityId: string;
  status: string;
  runAt: string;
  details: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  rule?: { id: string; name: string; trigger: string; action: string } | null;
}

function ActionLabel({ rule }: { rule: AutomationRule }) {
  const cfg = (rule.actionConfig || {}) as Record<string, string>;
  const extra =
    rule.action === "CREATE_FOLLOWUP" ? ` · ${cfg.reason || "follow-up"}` :
    rule.action === "UPDATE_BOOKING" ? ` → ${[cfg.status, cfg.paymentStatus].filter(Boolean).join(" / ")}` :
    rule.action === "UPDATE_CUSTOMER" ? ` → ${[cfg.status, cfg.tags ? `+${cfg.tags}` : ""].filter(Boolean).join(" ")}` :
    rule.action === "SEND_WEBHOOK" ? (cfg.url ? ` · custom URL` : ` · default n8n URL`) :
    rule.action === "NOTIFY_STAFF" ? (cfg.title ? ` · ${cfg.title}` : "") : "";
  return <span>{rule.action.replace(/_/g, " ")}{extra}</span>;
}

export default function Automations() {
  const [tab, setTab] = useState<"rules" | "log">("rules");
  const [modal, setModal] = useState<{ open: boolean; editing: AutomationRule | null }>({ open: false, editing: null });
  const [del, setDel] = useState<AutomationRule | null>(null);
  const [ruleFilter, setRuleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const qc = useQueryClient();

  const rulesQ = useQuery({
    queryKey: ["automation-rules"],
    queryFn: () => api<Paged<AutomationRule>>("/automations?limit=50"),
  });
  const logQ = useQuery({
    queryKey: ["automation-log", ruleFilter, statusFilter],
    queryFn: () => api<Paged<Execution>>(`/automations/executions/list${qs({ ruleId: ruleFilter || undefined, status: statusFilter || undefined, limit: 30 })}`),
    enabled: tab === "log",
  });

  const toggle = async (r: AutomationRule) => {
    try {
      await api(`/automations/${r.id}/toggle`, { method: "PATCH" });
      toast.success(r.enabled ? "Rule paused" : "Rule enabled");
      qc.invalidateQueries({ queryKey: ["automation-rules"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const retry = async (id: string) => {
    setBusy(id);
    try {
      const res = await api<Execution>(`/automations/executions/${id}/retry`, { method: "POST" });
      toast.success(`Retry finished: ${res.status}`);
      qc.invalidateQueries({ queryKey: ["automation-log"] });
      qc.invalidateQueries({ queryKey: ["automation-rules"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!del) return;
    try {
      await api(`/automations/${del.id}`, { method: "DELETE" });
      toast.success("Rule deleted");
      setDel(null);
      qc.invalidateQueries({ queryKey: ["automation-rules"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-bold">Automations</h1>
        <Button onClick={() => setModal({ open: true, editing: null })}><Plus className="h-4 w-4" /> New rule</Button>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "rules", label: "Rules" }, { id: "log", label: "Execution log" }]} />

      {tab === "rules" && (
        <>
          {rulesQ.isLoading && <LoadingState />}
          {rulesQ.error && <ErrorState message="Failed to load rules" onRetry={() => rulesQ.refetch()} />}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {(rulesQ.data?.data || []).map((r) => (
              <Card key={r.id} className={`p-4 ${r.enabled ? "" : "opacity-70"}`}>
                <div className="flex items-start gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${r.enabled ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-400"}`}>
                    <Zap className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{r.name}</p>
                    {r.description && <p className="truncate text-[13px] text-slate-500">{r.description}</p>}
                    <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                      <span className="rounded-md bg-sky-100 px-2 py-1 font-medium text-sky-700">⚡ {r.trigger.replace(/_/g, " ")}</span>
                      <span className="rounded-md bg-emerald-100 px-2 py-1 font-medium text-emerald-700"><ActionLabel rule={r} /></span>
                      {r.delayMinutes > 0 && <span className="rounded-md bg-amber-100 px-2 py-1 font-medium text-amber-700">⏳ +{r.delayMinutes}m</span>}
                      {Object.keys(r.conditions || {}).length > 0 && (
                        <span className="rounded-md bg-violet-100 px-2 py-1 font-medium text-violet-700">
                          if {Object.entries(r.conditions).map(([k, v]) => `${k}=${String(v)}`).join(", ")}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-xs text-slate-400">
                      {r.executionsCount ?? 0} runs{r.template ? ` · template: ${r.template.name}` : ""}{r.lastRunAt ? ` · last run ${timeAgo(r.lastRunAt)}` : " · never run"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium">
                    <input type="checkbox" checked={r.enabled} onChange={() => toggle(r)} className="h-4 w-4 accent-brand-600" />
                    {r.enabled ? "Enabled" : "Paused"}
                  </label>
                  <div className="ml-auto flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setRuleFilter(r.id); setTab("log"); }}
                    >
                      <History className="h-3.5 w-3.5" /> Runs
                    </Button>
                    <button onClick={() => setModal({ open: true, editing: r })} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => setDel(r)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          {rulesQ.data && rulesQ.data.data.length === 0 && <Card><EmptyState title="No automation rules" message="Create your first rule to respond to enquiries automatically." /></Card>}
        </>
      )}

      {tab === "log" && (
        <Card>
          <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
            <Select value={ruleFilter} onChange={(e) => setRuleFilter(e.target.value)} className="!w-56">
              <option value="">All rules</option>
              {(rulesQ.data?.data || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="!w-40">
              <option value="">All statuses</option>
              {["SUCCESS", "FAILED", "SKIPPED", "SCHEDULED"].map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            {(ruleFilter || statusFilter) && (
              <Button variant="ghost" size="sm" onClick={() => { setRuleFilter(""); setStatusFilter(""); }}><X className="h-3.5 w-3.5" /> Clear</Button>
            )}
          </div>
          {logQ.isLoading && <LoadingState />}
          {logQ.data && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead><tr className="border-b border-slate-100"><Th>When</Th><Th>Rule</Th><Th>Trigger</Th><Th>Result</Th><Th>Status</Th><Th /></tr></thead>
                <tbody>
                  {logQ.data.data.map((e) => (
                    <tr key={e.id} className="border-b border-slate-50">
                      <Td className="whitespace-nowrap">{fmtDateTime(e.createdAt)}</Td>
                      <Td className="font-medium">{e.rule?.name || "—"}</Td>
                      <Td className="text-slate-500">{e.triggerEntity}</Td>
                      <Td className="max-w-[320px] truncate text-slate-500" title={e.error || JSON.stringify((e.details as { result?: unknown })?.result || (e.details as { reason?: string })?.reason || "")}>
                        {e.error || (e.details && typeof (e.details as { reason?: string }).reason === "string" ? (e.details as { reason?: string }).reason : "") || "—"}
                      </Td>
                      <Td><StatusBadge status={e.status} /></Td>
                      <Td>
                        {e.status === "FAILED" && (
                          <Button size="sm" variant="outline" disabled={busy === e.id} onClick={() => retry(e.id)}>
                            <RotateCcw className="h-3.5 w-3.5" /> Retry
                          </Button>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {logQ.data.data.length === 0 && <EmptyState title="No executions yet" message="Automation runs will appear here." />}
            </div>
          )}
        </Card>
      )}

      <RuleModal open={modal.open} editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} onDone={() => { setModal({ open: false, editing: null }); qc.invalidateQueries({ queryKey: ["automation-rules"] }); }} />
      <ConfirmModal open={!!del} onClose={() => setDel(null)} onConfirm={remove} title="Delete rule" message={`Delete "${del?.name}"? Past executions are kept.`} confirmLabel="Delete" danger />
    </div>
  );
}

function RuleModal({ open, editing, onClose, onDone }: { open: boolean; editing: AutomationRule | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [f, setFState] = useState({
    name: "", description: "", trigger: "", delayMinutes: 0, action: "",
    templateId: "", message: "",
    followupReason: "", followupChannel: "WHATSAPP", followupDueHours: 24,
    bookingStatus: "", bookingPaymentStatus: "", customerStatus: "", customerTags: "",
    webhookUrl: "", notifyTitle: "", notifyBody: "",
  });
  const [conds, setConds] = useState<{ path: string; value: string }[]>([]);

  const { data: meta } = useQuery({
    queryKey: ["automation-meta"],
    queryFn: () => api<{ triggers: string[]; actions: string[] }>("/automations/meta"),
    enabled: open,
  });

  useState(() => {
    if (open && editing) {
      const cfg = (editing.actionConfig || {}) as Record<string, string | number>;
      setFState({
        name: editing.name, description: editing.description || "", trigger: editing.trigger,
        delayMinutes: editing.delayMinutes, action: editing.action, templateId: editing.templateId || "",
        message: String(cfg.message || ""),
        followupReason: String(cfg.reason || ""), followupChannel: String(cfg.channel || "WHATSAPP"),
        followupDueHours: Number(cfg.dueInHours ?? 24),
        bookingStatus: String(cfg.status || ""), bookingPaymentStatus: String(cfg.paymentStatus || ""),
        customerStatus: String(cfg.status || ""), customerTags: String(cfg.tags || ""),
        webhookUrl: String(cfg.url || ""),
        notifyTitle: String(cfg.title || ""), notifyBody: String(cfg.body || ""),
      });
      setConds(Object.entries(editing.conditions || {}).map(([path, value]) => ({ path, value: String(value) })));
    } else if (open) {
      setFState({
        name: "", description: "", trigger: meta?.triggers[0] || "ENQUIRY_RECEIVED", delayMinutes: 0,
        action: meta?.actions[0] || "SEND_WHATSAPP", templateId: "", message: "",
        followupReason: "", followupChannel: "WHATSAPP", followupDueHours: 24,
        bookingStatus: "", bookingPaymentStatus: "", customerStatus: "", customerTags: "",
        webhookUrl: "", notifyTitle: "", notifyBody: "",
      });
      setConds([]);
    }
  });

  const { data: templates } = useQuery({
    queryKey: ["templates-mini"],
    queryFn: () => api<Paged<MessageTemplate>>("/templates?limit=100"),
    enabled: open,
  });
  const activeTemplates = (templates?.data || []).filter((t) => t.active);

  const set = (k: string, v: string | number) => setFState((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (!f.name.trim()) return toast.error("Name is required");
    if (!f.trigger || !f.action) return toast.error("Trigger and action are required");
    const conditions: Record<string, unknown> = {};
    for (const c of conds) {
      if (c.path.trim()) conditions[c.path.trim()] = c.value;
    }
    let actionConfig: Record<string, unknown> = {};
    if (f.action.startsWith("SEND_")) {
      if (!f.templateId && !f.message.trim()) return toast.error("Pick a template or write a message");
      actionConfig = f.message.trim() ? { message: f.message } : {};
    } else if (f.action === "CREATE_FOLLOWUP") {
      actionConfig = { reason: f.followupReason || undefined, channel: f.followupChannel, dueInHours: Number(f.followupDueHours) || 24 };
    } else if (f.action === "UPDATE_BOOKING") {
      if (!f.bookingStatus && !f.bookingPaymentStatus) return toast.error("Set at least one booking field");
      actionConfig = { status: f.bookingStatus || undefined, paymentStatus: f.bookingPaymentStatus || undefined };
    } else if (f.action === "UPDATE_CUSTOMER") {
      if (!f.customerStatus && !f.customerTags.trim()) return toast.error("Set a status and/or tags");
      actionConfig = { status: f.customerStatus || undefined, tags: f.customerTags.trim() || undefined };
    } else if (f.action === "SEND_WEBHOOK") {
      actionConfig = f.webhookUrl.trim() ? { url: f.webhookUrl.trim() } : {};
    } else if (f.action === "NOTIFY_STAFF") {
      actionConfig = { title: f.notifyTitle || undefined, body: f.notifyBody || undefined };
    }
    const body = {
      name: f.name, description: f.description || undefined, trigger: f.trigger,
      conditions, delayMinutes: Number(f.delayMinutes) || 0, action: f.action,
      actionConfig, templateId: f.templateId || null,
    };
    setSaving(true);
    try {
      if (editing) await api(`/automations/${editing.id}`, { method: "PUT", body });
      else await api("/automations", { method: "POST", body });
      toast.success(editing ? "Rule updated" : "Rule created");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const isMsg = f.action.startsWith("SEND_") && f.action !== "SEND_WEBHOOK";

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit automation rule" : "New automation rule"} wide>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="md:col-span-2"><Field label="Rule name" required><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. WhatsApp welcome on new enquiry" /></Field></div>
        <div className="md:col-span-2"><Field label="Description"><Input value={f.description} onChange={(e) => set("description", e.target.value)} /></Field></div>
        <Field label="When (trigger)">
          <Select value={f.trigger} onChange={(e) => set("trigger", e.target.value)}>
            {(meta?.triggers || []).map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
          </Select>
        </Field>
        <Field label="Wait before running (minutes)"><Input type="number" min={0} value={f.delayMinutes} onChange={(e) => set("delayMinutes", Number(e.target.value))} /></Field>
        <div className="md:col-span-2">
          <Field label="Only when (optional conditions)" hint='Match trigger data, e.g. path "customer.source" = "WEBSITE". All must match.'>
            <div className="flex flex-col gap-2">
              {conds.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <Input placeholder="path, e.g. customer.source" value={c.path} onChange={(e) => setConds(conds.map((x, j) => j === i ? { ...x, path: e.target.value } : x))} />
                  <Input placeholder="equals" value={c.value} onChange={(e) => setConds(conds.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
                  <Button variant="ghost" size="sm" onClick={() => setConds(conds.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-fit" onClick={() => setConds([...conds, { path: "", value: "" }])}><Plus className="h-3.5 w-3.5" /> Add condition</Button>
            </div>
          </Field>
        </div>
        <Field label="Do this (action)">
          <Select value={f.action} onChange={(e) => set("action", e.target.value)}>
            {(meta?.actions || []).map((a) => <option key={a} value={a}>{a.replace(/_/g, " ")}</option>)}
          </Select>
        </Field>
        {isMsg && (
          <>
            <Field label="Message template (optional)">
              <Select value={f.templateId} onChange={(e) => set("templateId", e.target.value)}>
                <option value="">Custom message below</option>
                {activeTemplates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.channel})</option>)}
              </Select>
            </Field>
            <div className="md:col-span-2">
              <Field label={f.templateId ? "Message (overrides template if filled)" : "Message"} hint={VAR_HINT}>
                <Textarea rows={3} value={f.message} onChange={(e) => set("message", e.target.value)} placeholder="Hi {{customer_name}}, ..." />
              </Field>
            </div>
          </>
        )}
        {f.action === "CREATE_FOLLOWUP" && (
          <>
            <Field label="Follow-up reason"><Input value={f.followupReason} onChange={(e) => set("followupReason", e.target.value)} placeholder="Defaults to rule name" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Channel">
                <Select value={f.followupChannel} onChange={(e) => set("followupChannel", e.target.value)}>
                  {["WHATSAPP", "PHONE", "EMAIL", "INSTAGRAM"].map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Due in (hours)"><Input type="number" min={1} value={f.followupDueHours} onChange={(e) => set("followupDueHours", Number(e.target.value))} /></Field>
            </div>
          </>
        )}
        {f.action === "UPDATE_BOOKING" && (
          <>
            <Field label="Set booking status">
              <Select value={f.bookingStatus} onChange={(e) => set("bookingStatus", e.target.value)}>
                <option value="">— don't change —</option>
                {["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"].map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="Set payment status">
              <Select value={f.bookingPaymentStatus} onChange={(e) => set("bookingPaymentStatus", e.target.value)}>
                <option value="">— don't change —</option>
                {["UNPAID", "PARTIALLY_PAID", "PAID", "REFUNDED"].map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          </>
        )}
        {f.action === "UPDATE_CUSTOMER" && (
          <>
            <Field label="Set customer status">
              <Select value={f.customerStatus} onChange={(e) => set("customerStatus", e.target.value)}>
                <option value="">— don't change —</option>
                {["ACTIVE", "INACTIVE", "LEAD"].map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="Add tags (comma separated)"><Input value={f.customerTags} onChange={(e) => set("customerTags", e.target.value)} placeholder="VIP, repeat" /></Field>
          </>
        )}
        {f.action === "SEND_WEBHOOK" && (
          <div className="md:col-span-2">
            <Field label="Webhook URL (optional)" hint="POSTs the event JSON. Empty = use the workspace n8n URL from Settings (all events are also forwarded there automatically).">
              <Input value={f.webhookUrl} onChange={(e) => set("webhookUrl", e.target.value)} placeholder="https://n8n.example.com/webhook/studioflow" />
            </Field>
          </div>
        )}
        {f.action === "NOTIFY_STAFF" && (
          <>
            <Field label="Notification title"><Input value={f.notifyTitle} onChange={(e) => set("notifyTitle", e.target.value)} placeholder="Defaults to rule name" /></Field>
            <Field label="Notification body"><Input value={f.notifyBody} onChange={(e) => set("notifyBody", e.target.value)} placeholder="Optional details" /></Field>
          </>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}>{editing ? "Save changes" : "Create rule"}</Button></div>
      <p className="mt-2 flex items-center gap-1 text-xs text-slate-400"><History className="h-3.5 w-3.5" /> Rules run automatically in the background (scheduler checks every 30 seconds).</p>
    </Modal>
  );
}
