import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { api, qs, Paged } from "../lib/api";
import { Card, Button, SearchInput, Select, Th, Td, Avatar, StatusBadge, Pagination, Modal, Field, Input, Textarea, ConfirmModal, LoadingState, ErrorState, EmptyState } from "../components/ui";
import { useToast } from "../components/toast";
import { useBusiness } from "../components/Layout";
import { fullName, money, timeAgo } from "../lib/utils";
import { Customer } from "../lib/types";

export default function Customers() {
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ open: boolean; editing: Customer | null }>({ open: false, editing: null });
  const [del, setDel] = useState<Customer | null>(null);
  const { currency } = useBusiness();
  const toast = useToast();
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["customers", q, source, status, page],
    queryFn: () => api<Paged<Customer>>(`/customers${qs({ q, source, status, page, limit: 15 })}`),
  });

  const remove = async () => {
    if (!del) return;
    try {
      await api(`/customers/${del.id}`, { method: "DELETE" });
      toast.success("Customer deleted");
      setDel(null);
      qc.invalidateQueries({ queryKey: ["customers"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-bold">Customers</h1>
        <Button onClick={() => setModal({ open: true, editing: null })}><Plus className="h-4 w-4" /> New customer</Button>
      </div>
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search name, phone, email..." className="w-64" />
          <Select value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }} className="!w-40">
            <option value="">All sources</option>
            {["WHATSAPP", "INSTAGRAM", "EMAIL", "WEBSITE", "MANUAL", "OTHER"].map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="!w-36">
            <option value="">All statuses</option>
            {["ACTIVE", "INACTIVE", "LEAD"].map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
        {isLoading && <LoadingState />}
        {error && <ErrorState message="Failed to load customers" onRetry={() => refetch()} />}
        {data && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead><tr className="border-b border-slate-100"><Th>Name</Th><Th>Phone</Th><Th>Source</Th><Th>Bookings</Th><Th>Total spend</Th><Th>Last contact</Th><Th>Status</Th><Th /></tr></thead>
                <tbody>
                  {data.data.map((c) => (
                    <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                      <Td>
                        <Link to={`/customers/${c.id}`} className="flex items-center gap-2.5">
                          <Avatar first={c.firstName} last={c.lastName} size="sm" />
                          <span className="font-medium text-slate-800 hover:text-brand-700">{fullName(c)}</span>
                        </Link>
                      </Td>
                      <Td>{c.phone || "—"}</Td>
                      <Td><span className="text-xs font-medium text-slate-500">{c.source}</span></Td>
                      <Td>{c.bookingsCount ?? 0}</Td>
                      <Td className="font-medium">{money(c.totalSpend, currency)}</Td>
                      <Td className="whitespace-nowrap text-slate-500">{timeAgo(c.updatedAt)}</Td>
                      <Td><StatusBadge status={c.status} /></Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setModal({ open: true, editing: c })} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => setDel(c)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.data.length === 0 && <EmptyState title="No customers found" message="Try adjusting your search or add a new customer." />}
            </div>
            <Pagination page={data.meta.page} pages={data.meta.pages} total={data.meta.total} onPage={setPage} />
          </>
        )}
      </Card>

      <CustomerModal
        open={modal.open}
        editing={modal.editing}
        onClose={() => setModal({ open: false, editing: null })}
        onDone={() => {
          setModal({ open: false, editing: null });
          qc.invalidateQueries({ queryKey: ["customers"] });
        }}
      />
      <ConfirmModal
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={remove}
        title="Delete customer"
        message={`Delete ${del ? fullName(del) : ""}? This removes their conversations, bookings and history. This cannot be undone.`}
      />
    </div>
  );
}

export function CustomerModal({ open, editing, onClose, onDone }: { open: boolean; editing: Customer | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({ firstName: "", lastName: "", phone: "", whatsappNumber: "", email: "", instagramHandle: "", source: "MANUAL", status: "ACTIVE", address: "", notes: "", tags: "" });

  useState(() => {
    if (open && editing) {
      setF({
        firstName: editing.firstName, lastName: editing.lastName, phone: editing.phone || "", whatsappNumber: editing.whatsappNumber || "",
        email: editing.email || "", instagramHandle: editing.instagramHandle || "", source: editing.source, status: editing.status,
        address: editing.address || "", notes: editing.notes || "", tags: (editing.tags || []).join(", "),
      });
    } else if (open) {
      setF({ firstName: "", lastName: "", phone: "", whatsappNumber: "", email: "", instagramHandle: "", source: "MANUAL", status: "ACTIVE", address: "", notes: "", tags: "" });
    }
  });

  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = async (skipDup = false) => {
    if (!f.firstName.trim()) return toast.error("First name is required");
    setSaving(true);
    try {
      const body = { ...f, email: f.email || null, tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean) };
      if (editing) await api(`/customers/${editing.id}`, { method: "PUT", body });
      else await api(`/customers${skipDup ? "?skipDuplicateCheck=true" : ""}`, { method: "POST", body });
      toast.success(editing ? "Customer updated" : "Customer created");
      onDone();
    } catch (e) {
      const err = e as { message?: string; details?: { duplicate?: Customer } };
      if (!skipDup && err?.details && (err.details as { duplicateId?: string }).duplicateId) {
        const dup = (err.details as { duplicate?: Customer }).duplicate;
        if (window.confirm(`Possible duplicate: ${dup ? fullName(dup) : ""} (${dup?.phone || dup?.email}). Create anyway?`)) {
          await save(true);
          return;
        }
      }
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit customer" : "New customer"} wide>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="First name" required><Input value={f.firstName} onChange={(e) => set("firstName", e.target.value)} /></Field>
        <Field label="Last name"><Input value={f.lastName} onChange={(e) => set("lastName", e.target.value)} /></Field>
        <Field label="Phone"><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="WhatsApp number"><Input value={f.whatsappNumber} onChange={(e) => set("whatsappNumber", e.target.value)} /></Field>
        <Field label="Email"><Input value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Instagram handle"><Input value={f.instagramHandle} onChange={(e) => set("instagramHandle", e.target.value)} placeholder="@handle" /></Field>
        <Field label="Source">
          <Select value={f.source} onChange={(e) => set("source", e.target.value)}>
            {["MANUAL", "WHATSAPP", "INSTAGRAM", "EMAIL", "WEBSITE", "OTHER"].map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={f.status} onChange={(e) => set("status", e.target.value)}>
            {["ACTIVE", "INACTIVE", "LEAD"].map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Address"><Input value={f.address} onChange={(e) => set("address", e.target.value)} /></Field>
        <Field label="Tags (comma separated)"><Input value={f.tags} onChange={(e) => set("tags", e.target.value)} placeholder="VIP, repeat" /></Field>
        <div className="md:col-span-2"><Field label="Notes"><Textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field></div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => save()} loading={saving}>{editing ? "Save changes" : "Create customer"}</Button>
      </div>
    </Modal>
  );
}
