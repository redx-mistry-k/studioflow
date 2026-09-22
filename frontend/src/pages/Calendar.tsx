import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, CalendarX } from "lucide-react";
import { api, qs } from "../lib/api";
import { Card, Button, Modal, Field, Input, Select, Textarea, LoadingState, StatusBadge } from "../components/ui";
import { useToast } from "../components/toast";
import { useBusiness } from "../components/Layout";
import { fmtTime, money } from "../lib/utils";

interface CalSession {
  id: string; title: string; startsAt: string; endsAt: string; instructor: string | null;
  location: string | null; capacity: number; price: number; status: string; color: string;
  workshop: { name: string }; participants: number; available: number; computedStatus: string;
}
interface CalData { start: string; end: string; sessions: CalSession[] }
interface Workshop { id: string; name: string }

function mondayOf(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export default function CalendarPage() {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [formOpen, setFormOpen] = useState(false);
  const [formDate, setFormDate] = useState<Date | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const { currency } = useBusiness();

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const startStr = days[0].toISOString();
  const endStr = addDays(days[6], 1).toISOString();

  const { data, isLoading } = useQuery({
    queryKey: ["calendar", startStr, endStr],
    queryFn: () => api<CalData>(`/calendar${qs({ start: startStr, end: endStr })}`),
  });

  const byDay = useMemo(() => {
    const map: Record<string, CalSession[]> = {};
    (data?.sessions || []).forEach((s) => {
      const key = new Date(s.startsAt).toDateString();
      (map[key] = map[key] || []).push(s);
    });
    Object.values(map).forEach((arr) => arr.sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)));
    return map;
  }, [data]);

  const cancelSession = async (id: string) => {
    if (!window.confirm("Cancel this class?")) return;
    setBusy(id);
    try {
      await api(`/sessions/${id}`, { method: "PUT", body: { status: "CANCELLED" } });
      toast.success("Class cancelled");
      qc.invalidateQueries({ queryKey: ["calendar"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  const today = new Date().toDateString();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="mr-auto text-xl font-bold">Calendar</h1>
        <Button variant="outline" size="sm" onClick={() => setWeekStart(mondayOf(new Date()))}>Today</Button>
        <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight className="h-4 w-4" /></Button>
        <Button onClick={() => { setFormDate(new Date()); setFormOpen(true); }}><Plus className="h-4 w-4" /> New class</Button>
      </div>
      <p className="text-sm text-slate-500">
        {days[0].toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – {days[6].toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
      </p>

      {isLoading && <LoadingState />}
      {data && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7 xl:gap-2">
          {days.map((d) => {
            const list = byDay[d.toDateString()] || [];
            const isToday = d.toDateString() === today;
            return (
              <Card key={d.toISOString()} className={`flex min-h-[180px] flex-col ${isToday ? "ring-2 ring-brand-500" : ""}`}>
                <div className={`flex items-center justify-between border-b px-3 py-2 ${isToday ? "border-brand-100 bg-brand-50/50" : "border-slate-100"}`}>
                  <div>
                    <p className="text-[11px] font-semibold uppercase text-slate-400">{d.toLocaleDateString("en-IN", { weekday: "short" })}</p>
                    <p className={`text-sm font-bold ${isToday ? "text-brand-700" : "text-slate-800"}`}>{d.getDate()}</p>
                  </div>
                  <button
                    onClick={() => { setFormDate(d); setFormOpen(true); }}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    title="Add class"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-2">
                  {list.length === 0 && <p className="px-1 py-2 text-xs text-slate-300">—</p>}
                  {list.map((s) => (
                    <div
                      key={s.id}
                      className="group relative rounded-lg border-l-4 bg-slate-50 p-2 text-xs"
                      style={{ borderLeftColor: s.color }}
                      title={`${s.title} · ${s.instructor || ""} · ${money(s.price, currency)}`}
                    >
                      <p className="font-semibold text-slate-800">{fmtTime(s.startsAt)}</p>
                      <p className="truncate font-medium">{s.title}</p>
                      <p className="truncate text-slate-500">{s.participants}/{s.capacity} booked</p>
                      <div className="mt-1"><StatusBadge status={s.computedStatus} /></div>
                      {s.status !== "CANCELLED" && (
                        <button
                          onClick={() => cancelSession(s.id)}
                          disabled={busy === s.id}
                          className="absolute right-1 top-1 hidden rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-500 group-hover:block"
                          title="Cancel class"
                        >
                          <CalendarX className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {formOpen && formDate && (
        <SessionFormModal
          date={formDate}
          onClose={() => setFormOpen(false)}
          onDone={() => {
            setFormOpen(false);
            qc.invalidateQueries({ queryKey: ["calendar"] });
          }}
        />
      )}
    </div>
  );
}

export function SessionFormModal({ date, onClose, onDone }: { date: Date; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [workshopId, setWorkshopId] = useState("");
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState(() => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T10:00`);
  const [endsAt, setEndsAt] = useState(() => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T12:00`);
  const [capacity, setCapacity] = useState("");
  const [price, setPrice] = useState("");
  const [instructor, setInstructor] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: workshops } = useQuery({
    queryKey: ["workshops-mini"],
    queryFn: () => api<{ data: Workshop[] }>("/workshops?limit=50&active=true"),
  });

  const save = async () => {
    if (!workshopId || !startsAt || !endsAt) return toast.error("Workshop, start and end are required");
    setSaving(true);
    try {
      await api("/sessions", {
        method: "POST",
        body: {
          workshopId, title: title || undefined, startsAt, endsAt,
          capacity: capacity ? Number(capacity) : undefined,
          price: price ? Number(price) : undefined,
          instructor: instructor || undefined, location: location || undefined, notes: notes || undefined,
        },
      });
      toast.success("Class scheduled");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Schedule a class" wide>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <Field label="Workshop" required>
            <Select value={workshopId} onChange={(e) => setWorkshopId(e.target.value)}>
              <option value="">Select workshop...</option>
              {(workshops?.data || []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="md:col-span-2"><Field label="Session title (optional)"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Defaults to workshop name" /></Field></div>
        <Field label="Starts at" required><Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></Field>
        <Field label="Ends at" required><Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></Field>
        <Field label="Capacity (optional)"><Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Workshop default" /></Field>
        <Field label="Price (optional)"><Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Workshop default" /></Field>
        <Field label="Instructor"><Input value={instructor} onChange={(e) => setInstructor(e.target.value)} /></Field>
        <Field label="Location"><Input value={location} onChange={(e) => setLocation(e.target.value)} /></Field>
        <div className="md:col-span-2"><Field label="Notes"><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}>Schedule</Button></div>
    </Modal>
  );
}
