import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Plus, Pencil, Trash2, Palette } from "lucide-react";
import { api, qs, Paged } from "../lib/api";
import { Card, Button, SearchInput, Th, Td, StatusBadge, Pagination, Modal, Field, Input, Textarea, ConfirmModal, LoadingState, ErrorState, EmptyState, Tabs, Badge } from "../components/ui";
import { useToast } from "../components/toast";
import { useBusiness } from "../components/Layout";
import { money, fmtDateTime } from "../lib/utils";
import { Workshop, Session } from "../lib/types";

const COLORS = ["#7c3aed", "#0d9488", "#f59e0b", "#e11d48", "#2563eb", "#16a34a", "#d946ef", "#64748b"];

export default function Workshops() {
  const [tab, setTab] = useState<"workshops" | "sessions">("workshops");
  const [params] = useSearchParams();
  const highlight = params.get("session");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState("");
  const [modal, setModal] = useState<{ open: boolean; editing: Workshop | null }>({ open: false, editing: null });
  const [del, setDel] = useState<Workshop | null>(null);
  const [delSession, setDelSession] = useState<Session | null>(null);
  const { currency } = useBusiness();
  const toast = useToast();
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["workshops", q, page, activeFilter],
    queryFn: () => api<Paged<Workshop>>(`/workshops${qs({ q, page, limit: 15, active: activeFilter || undefined })}`),
    enabled: tab === "workshops",
  });
  const sessionsQ = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api<Paged<Session>>(`/sessions${qs({ limit: 50 })}`),
    enabled: tab === "sessions",
  });

  const remove = async () => {
    if (!del) return;
    try {
      await api(`/workshops/${del.id}`, { method: "DELETE" });
      toast.success("Workshop deleted");
      setDel(null);
      qc.invalidateQueries({ queryKey: ["workshops"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const removeSession = async () => {
    if (!delSession) return;
    try {
      await api(`/sessions/${delSession.id}`, { method: "DELETE" });
      toast.success("Session deleted");
      setDelSession(null);
      qc.invalidateQueries({ queryKey: ["sessions"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-bold">Classes & Workshops</h1>
        {tab === "workshops" && <Button onClick={() => setModal({ open: true, editing: null })}><Plus className="h-4 w-4" /> New workshop</Button>}
      </div>
      <Tabs value={tab} onChange={(t) => setTab(t)} tabs={[{ id: "workshops", label: "Workshops" }, { id: "sessions", label: "Sessions" }]} />

      {tab === "workshops" && (
        <Card>
          <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
            <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search workshops..." className="w-64" />
            <div className="flex gap-1">
              {(["", "true", "false"] as string[]).map((v) => (
                <button key={v} onClick={() => { setActiveFilter(v); setPage(1); }} className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${activeFilter === v ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                  {v === "" ? "All" : v === "true" ? "Active" : "Inactive"}
                </button>
              ))}
            </div>
          </div>
          {isLoading && <LoadingState />}
          {error && <ErrorState message="Failed to load workshops" onRetry={() => refetch()} />}
          {data && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px]">
                  <thead><tr className="border-b border-slate-100"><Th>Workshop</Th><Th>Category</Th><Th>Duration</Th><Th>Price</Th><Th>Capacity</Th><Th>Instructor</Th><Th>Sessions</Th><Th>Status</Th><Th /></tr></thead>
                  <tbody>
                    {data.data.map((w) => (
                      <tr key={w.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                        <Td>
                          <div className="flex items-center gap-2">
                            <span className="h-4 w-4 rounded" style={{ background: w.color }} />
                            <span className="font-medium">{w.name}</span>
                          </div>
                        </Td>
                        <Td>{w.category || "—"}</Td>
                        <Td>{w.durationMins} min</Td>
                        <Td>{money(w.defaultPrice, currency)}</Td>
                        <Td>{w.defaultCapacity}</Td>
                        <Td>{w.instructor || "—"}</Td>
                        <Td>{w.sessionsCount ?? 0}</Td>
                        <Td><StatusBadge status={w.active ? "ACTIVE" : "INACTIVE"} /></Td>
                        <Td>
                          <div className="flex justify-end gap-1">
                            <button onClick={() => setModal({ open: true, editing: w })} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => setDel(w)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.data.length === 0 && <EmptyState title="No workshops yet" message="Create your first workshop to start scheduling classes." />}
              </div>
              <Pagination page={data.meta.page} pages={data.meta.pages} total={data.meta.total} onPage={setPage} />
            </>
          )}
        </Card>
      )}

      {tab === "sessions" && (
        <Card>
          {sessionsQ.isLoading && <LoadingState />}
          {sessionsQ.data && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead><tr className="border-b border-slate-100"><Th>Session</Th><Th>When</Th><Th>Instructor</Th><Th>Booked</Th><Th>Price</Th><Th>Status</Th><Th /></tr></thead>
                <tbody>
                  {sessionsQ.data.data.map((s) => (
                    <tr key={s.id} className={`border-b border-slate-50 hover:bg-slate-50/60 ${highlight === s.id ? "bg-brand-50/60" : ""}`}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <span className="h-4 w-4 rounded" style={{ background: s.workshop?.color }} />
                          <span className="font-medium">{s.title || s.workshop?.name}</span>
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap">{fmtDateTime(s.startsAt)}</Td>
                      <Td>{s.instructor || "—"}</Td>
                      <Td><SessionFill booked={s.booked || 0} capacity={s.capacity} /></Td>
                      <Td>{money(s.price, currency)}</Td>
                      <Td><StatusBadge status={s.computedStatus || s.status} /></Td>
                      <Td>
                        <div className="flex justify-end">
                          <button onClick={() => setDelSession(s)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sessionsQ.data.data.length === 0 && <EmptyState title="No sessions scheduled" />}
            </div>
          )}
        </Card>
      )}

      <WorkshopModal
        open={modal.open}
        editing={modal.editing}
        onClose={() => setModal({ open: false, editing: null })}
        onDone={() => { setModal({ open: false, editing: null }); qc.invalidateQueries({ queryKey: ["workshops"] }); }}
      />
      <ConfirmModal open={!!del} onClose={() => setDel(null)} onConfirm={remove} title="Delete workshop" message={`Delete "${del?.name}"? Its sessions are kept as standalone. This cannot be undone.`} confirmLabel="Delete" danger />
      <ConfirmModal open={!!delSession} onClose={() => setDelSession(null)} onConfirm={removeSession} title="Delete session" message="Delete this session? Only possible when it has no bookings." confirmLabel="Delete" danger />
    </div>
  );
}

function SessionFill({ booked, capacity }: { booked: number; capacity: number }) {
  const pct = capacity > 0 ? Math.min(100, (booked / capacity) * 100) : 0;
  return (
    <div className="flex w-36 items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${pct >= 100 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium">{booked}/{capacity}</span>
    </div>
  );
}

function WorkshopModal({ open, editing, onClose, onDone }: { open: boolean; editing: Workshop | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [f, setFState] = useState({ name: "", description: "", category: "", durationMins: 60, defaultPrice: 0, defaultCapacity: 10, instructor: "", location: "", color: COLORS[0], active: true });

  useState(() => {
    if (open && editing) {
      setFState({
        name: editing.name, description: editing.description || "", category: editing.category || "",
        durationMins: editing.durationMins, defaultPrice: editing.defaultPrice, defaultCapacity: editing.defaultCapacity,
        instructor: editing.instructor || "", location: editing.location || "", color: editing.color, active: editing.active,
      });
    } else if (open) {
      setFState({ name: "", description: "", category: "", durationMins: 60, defaultPrice: 0, defaultCapacity: 10, instructor: "", location: "", color: COLORS[0], active: true });
    }
  });

  const set = (k: string, v: string | number | boolean) => setFState((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (!f.name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      if (editing) await api(`/workshops/${editing.id}`, { method: "PUT", body: f });
      else await api("/workshops", { method: "POST", body: f });
      toast.success(editing ? "Workshop updated" : "Workshop created");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit workshop" : "New workshop"} wide>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="md:col-span-2"><Field label="Name" required><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field></div>
        <div className="md:col-span-2"><Field label="Description"><Textarea rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} /></Field></div>
        <Field label="Category"><Input value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="Art, Music, Dance..." /></Field>
        <Field label="Instructor"><Input value={f.instructor} onChange={(e) => set("instructor", e.target.value)} /></Field>
        <Field label="Duration (minutes)"><Input type="number" min={15} value={f.durationMins} onChange={(e) => set("durationMins", Number(e.target.value))} /></Field>
        <Field label="Default price"><Input type="number" min={0} value={f.defaultPrice} onChange={(e) => set("defaultPrice", Number(e.target.value))} /></Field>
        <Field label="Default capacity"><Input type="number" min={1} value={f.defaultCapacity} onChange={(e) => set("defaultCapacity", Number(e.target.value))} /></Field>
        <Field label="Location"><Input value={f.location} onChange={(e) => set("location", e.target.value)} /></Field>
        <Field label="Colour">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-slate-400" />
            {COLORS.map((c) => (
              <button key={c} onClick={() => set("color", c)} className={`h-7 w-7 rounded-lg ${f.color === c ? "ring-2 ring-slate-900 ring-offset-2" : ""}`} style={{ background: c }} />
            ))}
          </div>
        </Field>
        <Field label="Status">
          <label className="flex h-10 items-center gap-2 text-sm">
            <input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} className="h-4 w-4 accent-brand-600" />
            Active
          </label>
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}>{editing ? "Save changes" : "Create workshop"}</Button></div>
      {editing && <p className="mt-2 text-xs text-slate-400">Schedule sessions for this workshop from the <Badge>Calendar</Badge> or Quick Add.</p>}
    </Modal>
  );
}
