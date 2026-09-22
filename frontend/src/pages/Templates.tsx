import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Eye } from "lucide-react";
import { api, qs, Paged } from "../lib/api";
import { Card, Button, Modal, Field, Input, Select, Textarea, ConfirmModal, LoadingState, ErrorState, EmptyState, ChannelBadge, Badge, SearchInput } from "../components/ui";
import { useToast } from "../components/toast";
import { MessageTemplate } from "../lib/types";

const VAR_HINT = "{{customer_name}} {{class_name}} {{date}} {{time}} {{amount}} {{location}} {{booking_id}} {{payment_link}}";
const CHANNELS = ["ANY", "WHATSAPP", "EMAIL", "SMS", "INSTAGRAM"];

export default function Templates() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [modal, setModal] = useState<{ open: boolean; editing: MessageTemplate | null }>({ open: false, editing: null });
  const [del, setDel] = useState<MessageTemplate | null>(null);
  const [preview, setPreview] = useState<MessageTemplate | null>(null);
  const toast = useToast();
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["templates", q, category],
    queryFn: () => api<Paged<MessageTemplate> & { categories: string[] }>(`/templates${qs({ q, category, limit: 100 })}`),
  });

  const remove = async () => {
    if (!del) return;
    try {
      await api(`/templates/${del.id}`, { method: "DELETE" });
      toast.success("Template deleted");
      setDel(null);
      qc.invalidateQueries({ queryKey: ["templates"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-bold">Message Templates</h1>
        <Button onClick={() => setModal({ open: true, editing: null })}><Plus className="h-4 w-4" /> New template</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search templates..." className="w-64" />
        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="!w-52">
          <option value="">All categories</option>
          {(data?.categories || []).map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
        </Select>
      </div>
      {isLoading && <LoadingState />}
      {error && <ErrorState message="Failed to load templates" onRetry={() => refetch()} />}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(data?.data || []).map((t) => (
          <Card key={t.id} className="flex flex-col p-4">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{t.name}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <ChannelBadge channel={t.channel} />
                  <Badge className="bg-slate-100 text-slate-600">{t.category.replace(/_/g, " ")}</Badge>
                  {!t.active && <Badge className="bg-slate-200 text-slate-500">Inactive</Badge>}
                </div>
              </div>
              <div className="flex gap-0.5">
                <button onClick={() => setPreview(t)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Preview with sample data"><Eye className="h-4 w-4" /></button>
                <button onClick={() => setModal({ open: true, editing: t })} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => setDel(t)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            {t.subject && <p className="mt-2 truncate text-[13px] font-medium text-slate-700">Subject: {t.subject}</p>}
            <p className="mt-1 line-clamp-3 flex-1 whitespace-pre-wrap text-[13px] text-slate-500">{t.body}</p>
            {t.variables.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {t.variables.map((v) => <code key={v} className="rounded bg-brand-50 px-1.5 py-0.5 text-[11px] text-brand-700">{`{{${v}}}`}</code>)}
              </div>
            )}
          </Card>
        ))}
      </div>
      {data && data.data.length === 0 && <Card><EmptyState title="No templates found" /></Card>}

      <TemplateModal
        open={modal.open}
        editing={modal.editing}
        categories={data?.categories || []}
        onClose={() => setModal({ open: false, editing: null })}
        onDone={() => { setModal({ open: false, editing: null }); qc.invalidateQueries({ queryKey: ["templates"] }); }}
      />
      <ConfirmModal open={!!del} onClose={() => setDel(null)} onConfirm={remove} title="Delete template" message={`Delete "${del?.name}"?${"\n"}Blocked if an automation rule still uses it.`} confirmLabel="Delete" danger />
      {preview && <PreviewModal template={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function TemplateModal({ open, editing, categories, onClose, onDone }: { open: boolean; editing: MessageTemplate | null; categories: string[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({ name: "", category: "GENERAL", channel: "ANY", subject: "", body: "", active: true });

  useState(() => {
    if (open && editing) setF({ name: editing.name, category: editing.category, channel: editing.channel, subject: editing.subject || "", body: editing.body, active: editing.active });
    else if (open) setF({ name: "", category: "GENERAL", channel: "ANY", subject: "", body: "", active: true });
  });

  const vars = Array.from(new Set([...(f.body.matchAll(/\{\{\s*(\w+)\s*\}\}/g))].map((m) => m[1])));
  const set = (k: string, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (!f.name.trim() || !f.body.trim()) return toast.error("Name and body are required");
    setSaving(true);
    try {
      const body = { ...f, subject: f.subject || null };
      if (editing) await api(`/templates/${editing.id}`, { method: "PUT", body });
      else await api("/templates", { method: "POST", body });
      toast.success(editing ? "Template updated" : "Template created");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit template" : "New template"} wide>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="md:col-span-2"><Field label="Name" required><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Booking confirmation" /></Field></div>
        <Field label="Category">
          <Select value={f.category} onChange={(e) => set("category", e.target.value)}>
            {(categories.length ? categories : ["GENERAL"]).map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
          </Select>
        </Field>
        <Field label="Channel">
          <Select value={f.channel} onChange={(e) => set("channel", e.target.value)}>
            {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        {f.channel === "EMAIL" && <div className="md:col-span-2"><Field label="Subject"><Input value={f.subject} onChange={(e) => set("subject", e.target.value)} /></Field></div>}
        <div className="md:col-span-2">
          <Field label="Body" required hint={`Variables: ${VAR_HINT}`}>
            <Textarea rows={5} value={f.body} onChange={(e) => set("body", e.target.value)} placeholder="Hi {{customer_name}}, ..." />
          </Field>
        </div>
        <Field label="Status">
          <label className="flex h-10 items-center gap-2 text-sm">
            <input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} className="h-4 w-4 accent-brand-600" />
            Active
          </label>
        </Field>
        <div className="text-sm text-slate-500">
          <p className="text-[13px]">Detected variables: {vars.length === 0 ? "none" : vars.map((v) => `{{${v}}}`).join(" ")}</p>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}>{editing ? "Save changes" : "Create template"}</Button></div>
      <p className="mt-2 text-xs text-slate-400">Booking confirmations/reminders fall back to built-in text when no template of that category is active.</p>
    </Modal>
  );
}

function PreviewModal({ template, onClose }: { template: MessageTemplate; onClose: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [rendered, setRendered] = useState<{ rendered: string; variables: string[] } | null>(null);
  const previewIt = async () => {
    setBusy(true);
    try {
      const res = await api<{ rendered: string; variables: string[] }>("/templates/preview", {
        method: "POST", body: { body: template.body },
      });
      setRendered(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={`Preview — ${template.name}`}>
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-slate-500">Rendered with built-in sample data (Priya Sharma, Pottery Workshop, …).</p>
        <Button variant="outline" onClick={previewIt} loading={busy}>Render preview</Button>
        {rendered && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="whitespace-pre-wrap text-sm">{rendered.rendered}</p>
            {rendered.variables.length > 0 && (
              <p className="mt-2 text-xs text-slate-400">Variables: {rendered.variables.map((v) => `{{${v}}}`).join(" ")}</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
