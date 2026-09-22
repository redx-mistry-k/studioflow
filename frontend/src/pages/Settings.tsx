import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Send, KeyRound, ShieldAlert } from "lucide-react";
import { api, qs, Paged } from "../lib/api";
import { Card, Button, Tabs, Th, Td, Badge, StatusBadge, Pagination, Modal, Field, Input, Select, Textarea, ConfirmModal, LoadingState, ErrorState, EmptyState } from "../components/ui";
import { useToast } from "../components/toast";
import { useAuth, roleRank } from "../auth/AuthContext";
import { fmtDateTime } from "../lib/utils";
import { StaffUser } from "../lib/types";

type Tab = "business" | "users" | "providers" | "email" | "security" | "audit";

interface BusinessSettings {
  businessName: string; logoUrl: string | null; phone: string | null; email: string | null; address: string | null;
  timezone: string; currency: string; autoConfirmBookings: boolean; notificationsEnabled: boolean;
  smtpHost: string | null; smtpPort: number; smtpUser: string | null; smtpPass: string | null;
  smtpFromEmail: string | null; smtpFromName: string | null; smtpEnabled: boolean;
  whatsappPhoneNumberId: string | null; whatsappBusinessAccountId: string | null; whatsappAccessToken: string | null;
  whatsappVerifyToken: string | null; whatsappEnabled: boolean;
  instagramPageAccessToken: string | null; instagramVerifyToken: string | null; instagramEnabled: boolean;
  n8nWebhookUrl: string | null;
}

interface Providers { email: "LIVE" | "MOCK"; whatsapp: "LIVE" | "MOCK"; instagram: "LIVE" | "MOCK" }

export default function Settings() {
  const [tab, setTab] = useState<Tab>("business");
  const { user } = useAuth();
  const isManager = roleRank(user?.role || "") >= roleRank("MANAGER");
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Settings</h1>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "business", label: "Business" },
          { id: "users", label: "Users & Roles" },
          { id: "providers", label: "Providers" },
          { id: "email", label: "Email & SMTP" },
          { id: "security", label: "Security" },
          ...(isManager ? [{ id: "audit" as Tab, label: "Audit Log" }] : []),
        ]}
      />
      {tab === "business" && <BusinessTab />}
      {tab === "users" && <UsersTab />}
      {tab === "providers" && <ProvidersTab />}
      {tab === "email" && <EmailTab />}
      {tab === "security" && <SecurityTab />}
      {tab === "audit" && isManager && <AuditTab />}
    </div>
  );
}

function BusinessTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const canEdit = roleRank(user?.role || "") >= roleRank("MANAGER");
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<{ settings: BusinessSettings; providers: Providers }>("/settings"),
  });
  const [f, setF] = useState<BusinessSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useState(() => {
    if (data) setF({ ...data.settings });
  });

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState message="Failed to load settings" onRetry={() => refetch()} />;
  const v = f || data.settings;
  const set = (k: string, val: string | boolean) => setF((x) => ({ ...(x || data.settings), [k]: val }));
  const save = async () => {
    setSaving(true);
    try {
      await api("/settings", {
        method: "PUT",
        body: {
          businessName: v.businessName, phone: v.phone, email: v.email, address: v.address,
          timezone: v.timezone, currency: v.currency,
          autoConfirmBookings: v.autoConfirmBookings, notificationsEnabled: v.notificationsEnabled,
        },
      });
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["business"] });
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="max-w-2xl p-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Business name"><Input value={v.businessName} onChange={(e) => set("businessName", e.target.value)} disabled={!canEdit} /></Field>
        <Field label="Currency"><Input value={v.currency} onChange={(e) => set("currency", e.target.value)} placeholder="INR" disabled={!canEdit} /></Field>
        <Field label="Phone"><Input value={v.phone || ""} onChange={(e) => set("phone", e.target.value)} disabled={!canEdit} /></Field>
        <Field label="Email"><Input value={v.email || ""} onChange={(e) => set("email", e.target.value)} disabled={!canEdit} /></Field>
        <div className="md:col-span-2"><Field label="Address"><Textarea rows={2} value={v.address || ""} onChange={(e) => set("address", e.target.value)} disabled={!canEdit} /></Field></div>
        <Field label="Timezone"><Input value={v.timezone} onChange={(e) => set("timezone", e.target.value)} placeholder="Asia/Kolkata" disabled={!canEdit} /></Field>
        <div className="flex flex-col justify-end gap-2 pb-1">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={v.autoConfirmBookings} onChange={(e) => set("autoConfirmBookings", e.target.checked)} disabled={!canEdit} className="h-4 w-4 accent-brand-600" />
            Auto-confirm website bookings
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={v.notificationsEnabled} onChange={(e) => set("notificationsEnabled", e.target.checked)} disabled={!canEdit} className="h-4 w-4 accent-brand-600" />
            Staff notifications
          </label>
        </div>
      </div>
      {canEdit ? (
        <div className="mt-4"><Button onClick={save} loading={saving}>Save settings</Button></div>
      ) : (
        <p className="mt-4 text-[13px] text-slate-400">Managers and admins can edit business settings.</p>
      )}
      <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
        <p className="font-medium">Public pages (always on)</p>
        <p className="mt-1 text-slate-500">Booking: <a className="text-brand-600 hover:underline" href="/book" target="_blank" rel="noreferrer">{window.location.origin}/book</a></p>
        <p className="text-slate-500">Enquiry: <a className="text-brand-600 hover:underline" href="/enquire" target="_blank" rel="noreferrer">{window.location.origin}/enquire</a></p>
      </div>
    </Card>
  );
}

function UsersTab() {
  const { user } = useAuth();
  const isAdmin = roleRank(user?.role || "") >= roleRank("ADMIN");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ open: boolean; editing: StaffUser | null }>({ open: false, editing: null });
  const [del, setDel] = useState<StaffUser | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["users", page],
    queryFn: () => api<Paged<StaffUser>>(`/users${qs({ page, limit: 15 })}`),
  });

  const remove = async () => {
    if (!del) return;
    try {
      await api(`/users/${del.id}`, { method: "DELETE" });
      toast.success("User deleted");
      setDel(null);
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  if (!isAdmin) {
    return (
      <Card className="p-8 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-2 font-medium">Admins only</p>
        <p className="text-sm text-slate-500">You need an admin account to manage users.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end"><Button onClick={() => setModal({ open: true, editing: null })}><Plus className="h-4 w-4" /> New user</Button></div>
      <Card>
        {isLoading && <LoadingState />}
        {error && <ErrorState message="Failed to load users" onRetry={() => refetch()} />}
        {data && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead><tr className="border-b border-slate-100"><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Status</Th><Th>Created</Th><Th /></tr></thead>
                <tbody>
                  {data.data.map((u) => (
                    <tr key={u.id} className="border-b border-slate-50">
                      <Td className="font-medium">{u.name}</Td>
                      <Td>{u.email}</Td>
                      <Td><Badge className={u.role === "ADMIN" ? "bg-violet-100 text-violet-700" : u.role === "MANAGER" ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-600"}>{u.role}</Badge></Td>
                      <Td><StatusBadge status={u.active ? "ACTIVE" : "INACTIVE"} /></Td>
                      <Td className="text-slate-500">{fmtDateTime(u.createdAt)}</Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setModal({ open: true, editing: u })} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => setDel(u)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.meta.page} pages={data.meta.pages} total={data.meta.total} onPage={setPage} />
          </>
        )}
      </Card>
      <UserModal open={modal.open} editing={modal.editing} onClose={() => setModal({ open: false, editing: null })} onDone={() => { setModal({ open: false, editing: null }); qc.invalidateQueries({ queryKey: ["users"] }); }} />
      <ConfirmModal open={!!del} onClose={() => setDel(null)} onConfirm={remove} title="Delete user" message={`Permanently delete ${del?.name}? They will no longer be able to sign in. You cannot delete your own account.`} confirmLabel="Delete" danger />
    </div>
  );
}

function UserModal({ open, editing, onClose, onDone }: { open: boolean; editing: StaffUser | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("STAFF");
  const [password, setPassword] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useState(() => {
    if (open && editing) { setName(editing.name); setEmail(editing.email); setRole(editing.role); setActive(editing.active); setPassword(""); }
    else if (open) { setName(""); setEmail(""); setRole("STAFF"); setPassword(""); setActive(true); }
  });

  const save = async () => {
    if (!name.trim() || !email.trim()) return toast.error("Name and email are required");
    if (!editing && password.length < 8) return toast.error("Password must be at least 8 characters");
    if (editing && password && password.length < 8) return toast.error("New password must be at least 8 characters");
    setSaving(true);
    try {
      if (editing) await api(`/users/${editing.id}`, { method: "PUT", body: { name, role, active, ...(password ? { password } : {}) } });
      else await api("/users", { method: "POST", body: { name, email, role, password } });
      toast.success(editing ? "User updated" : "User created");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit user" : "New staff user"}>
      <div className="flex flex-col gap-3">
        <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email" required><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!editing} /></Field>
        <Field label={editing ? "New password (leave blank to keep)" : "Temporary password"} required={!editing}>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="STAFF">STAFF — daily operations</option>
            <option value="MANAGER">MANAGER — + reports, automation, classes</option>
            <option value="ADMIN">ADMIN — full access, users</option>
          </Select>
        </Field>
        {editing && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-brand-600" />
            Active
          </label>
        )}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving}>{editing ? "Save" : "Create"}</Button></div>
      </div>
    </Modal>
  );
}

function ProvidersTab() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<{ settings: BusinessSettings; providers: Providers }>("/settings"),
  });
  const { user } = useAuth();
  const isAdmin = roleRank(user?.role || "") >= roleRank("ADMIN");
  const toast = useToast();
  const qc = useQueryClient();
  const [n8n, setN8n] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useState(() => {
    if (data) setN8n(data.settings.n8nWebhookUrl || "");
  });

  if (isLoading) return <LoadingState />;
  if (error || !data) return <ErrorState message="Failed to load providers" onRetry={() => refetch()} />;

  const cards = [
    { key: "whatsapp", name: "WhatsApp", state: data.providers.whatsapp, hint: "Configure Phone Number ID + Access Token (admin) to go live." },
    { key: "instagram", name: "Instagram", state: data.providers.instagram, hint: "Configure Page Access Token (admin) to go live." },
    { key: "email", name: "Email (SMTP)", state: data.providers.email, hint: "Configure SMTP on the Email tab to go live." },
  ];

  const saveN8n = async () => {
    setSaving(true);
    try {
      await api("/settings", { method: "PUT", body: { n8nWebhookUrl: n8n || null } });
      toast.success("n8n URL saved — all automation events are forwarded there");
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {cards.map((p) => (
        <Card key={p.key} className="p-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${p.state === "LIVE" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              <Send className="h-5 w-5" />
            </div>
            <div className="mr-auto">
              <p className="font-semibold">{p.name}</p>
            </div>
            {p.state === "MOCK" ? <Badge className="bg-amber-100 text-amber-700">MOCK MODE</Badge> : <Badge className="bg-emerald-100 text-emerald-700">LIVE</Badge>}
          </div>
          <p className="mt-2.5 text-[13px] text-slate-500">{p.hint}</p>
        </Card>
      ))}
      <Card className="p-4 md:col-span-3">
        <h3 className="font-semibold">n8n bridge</h3>
        <p className="mt-1 text-[13px] text-slate-500">Every automation event is POSTed here as JSON. Rules can also target custom URLs via the SEND_WEBHOOK action.</p>
        {isAdmin ? (
          <div className="mt-2 flex gap-2">
            <Input value={n8n ?? ""} onChange={(e) => setN8n(e.target.value)} placeholder="https://n8n.example.com/webhook/studioflow" />
            <Button onClick={saveN8n} loading={saving}>Save</Button>
          </div>
        ) : (
          <p className="mt-2 font-mono text-[13px]">{data.settings.n8nWebhookUrl || "Not configured (admins can set this)."}</p>
        )}
      </Card>
      <Card className="p-4 md:col-span-3">
        <h3 className="font-semibold">Webhook endpoints</h3>
        <p className="mt-1 text-[13px] text-slate-500">Point your WhatsApp / Instagram app webhooks at these URLs. Verify tokens live in Settings (admin) or server env.</p>
        <div className="mt-2 space-y-1.5 font-mono text-[13px]">
          <p className="rounded-lg bg-slate-50 px-3 py-2">GET/POST {window.location.origin}/api/webhooks/whatsapp</p>
          <p className="rounded-lg bg-slate-50 px-3 py-2">GET/POST {window.location.origin}/api/webhooks/instagram</p>
        </div>
      </Card>
    </div>
  );
}

function EmailTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = roleRank(user?.role || "") >= roleRank("ADMIN");
  const isManager = roleRank(user?.role || "") >= roleRank("MANAGER");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; mocked: boolean; externalId?: string; error?: string } | null>(null);
  const [smtp, setSmtp] = useState({ host: "", port: 587, user: "", pass: "", fromEmail: "", fromName: "", enabled: false });
  const [saving, setSaving] = useState(false);
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<{ settings: BusinessSettings; providers: Providers }>("/settings"),
  });

  useState(() => {
    if (data) {
      const s = data.settings;
      setSmtp({
        host: s.smtpHost || "", port: s.smtpPort || 587, user: s.smtpUser || "",
        pass: s.smtpPass && !s.smtpPass.includes("•") ? s.smtpPass : "",
        fromEmail: s.smtpFromEmail || "", fromName: s.smtpFromName || "", enabled: s.smtpEnabled,
      });
    }
  });

  const send = async () => {
    if (!to.trim()) return toast.error("Enter a recipient email");
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; mocked: boolean; externalId?: string; error?: string }>("/settings/test-email", { method: "POST", body: { to } });
      setResult(res);
      toast.success(res.mocked ? "Mocked — check server logs" : "Test email sent");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const saveSmtp = async () => {
    setSaving(true);
    try {
      await api("/settings", {
        method: "PUT",
        body: {
          smtpHost: smtp.host || null, smtpPort: Number(smtp.port) || 587, smtpUser: smtp.user || null,
          ...(smtp.pass ? { smtpPass: smtp.pass } : {}),
          smtpFromEmail: smtp.fromEmail || null, smtpFromName: smtp.fromName || null, smtpEnabled: smtp.enabled,
        },
      });
      toast.success("SMTP settings saved");
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid max-w-2xl grid-cols-1 gap-3">
      <Card className="p-5">
        <h3 className="font-semibold">SMTP status</h3>
        <div className="mt-2 space-y-1.5 text-sm">
          <p><span className="text-slate-400">Mode:</span> {data ? (data.providers.email === "LIVE" ? <Badge className="bg-emerald-100 text-emerald-700">LIVE</Badge> : <Badge className="bg-amber-100 text-amber-700">MOCK</Badge>) : "…"}</p>
          <p><span className="text-slate-400">From:</span> {data?.settings.smtpFromEmail || data?.settings.email || "—"}{data?.settings.smtpFromName ? ` (${data.settings.smtpFromName})` : ""}</p>
        </div>
        {!data?.settings.smtpHost && <p className="mt-2 text-[13px] text-slate-500">No SMTP host configured — emails are logged as mock. Admins can configure SMTP below.</p>}
      </Card>
      {isAdmin && (
        <Card className="p-5">
          <h3 className="font-semibold">SMTP configuration</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="SMTP host"><Input value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} placeholder="smtp.gmail.com" /></Field>
            <Field label="Port"><Input type="number" value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })} /></Field>
            <Field label="Username"><Input value={smtp.user} onChange={(e) => setSmtp({ ...smtp, user: e.target.value })} /></Field>
            <Field label="Password" hint="Leave blank to keep the stored password"><Input type="password" value={smtp.pass} onChange={(e) => setSmtp({ ...smtp, pass: e.target.value })} placeholder={data?.settings.smtpPass ? "•••••• (stored)" : ""} /></Field>
            <Field label="From email"><Input value={smtp.fromEmail} onChange={(e) => setSmtp({ ...smtp, fromEmail: e.target.value })} placeholder="hello@studio.com" /></Field>
            <Field label="From name"><Input value={smtp.fromName} onChange={(e) => setSmtp({ ...smtp, fromName: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={smtp.enabled} onChange={(e) => setSmtp({ ...smtp, enabled: e.target.checked })} className="h-4 w-4 accent-brand-600" />
              Enable SMTP sending
            </label>
          </div>
          <div className="mt-3"><Button onClick={saveSmtp} loading={saving}>Save SMTP settings</Button></div>
        </Card>
      )}
      {isManager && (
        <Card className="p-5">
          <h3 className="font-semibold">Send a test email</h3>
          <div className="mt-3 flex gap-2">
            <Input placeholder="you@example.com" value={to} onChange={(e) => setTo(e.target.value)} />
            <Button onClick={send} loading={busy}><Send className="h-4 w-4" /> Send</Button>
          </div>
          {result && (
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
              <p>Delivered: <b>{String(result.ok)}</b> · Mocked: <b>{String(result.mocked)}</b></p>
              {result.externalId && <p className="font-mono text-xs">ID: {result.externalId}</p>}
              {result.error && <p className="text-red-600">{result.error}</p>}
              {result.mocked && <p className="mt-1 text-[13px] text-slate-500">Check the backend console log for the rendered email content.</p>}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function SecurityTab() {
  const toast = useToast();
  const [currentPassword, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const change = async () => {
    if (next.length < 8) return toast.error("New password must be at least 8 characters");
    if (next !== confirm) return toast.error("Passwords do not match");
    setBusy(true);
    try {
      await api("/auth/password", { method: "PUT", body: { currentPassword, newPassword: next } });
      toast.success("Password changed");
      setCurrent(""); setNext(""); setConfirm("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="max-w-md p-5">
      <h3 className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4" /> Change password</h3>
      <div className="mt-3 flex flex-col gap-3">
        <Field label="Current password"><Input type="password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} /></Field>
        <Field label="New password"><Input type="password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
        <Field label="Confirm new password"><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
        <div><Button onClick={change} loading={busy}>Change password</Button></div>
      </div>
    </Card>
  );
}

interface AuditRow { id: string; action: string; entityType: string; entityId: string | null; createdAt: string; user: { name: string } | null }

const AUDIT_ACTIONS = [
  "LOGIN", "CUSTOMER_CREATED", "CUSTOMER_UPDATED", "CUSTOMER_DELETED",
  "BOOKING_CREATED", "BOOKING_UPDATED", "BOOKING_CONFIRMED", "BOOKING_CANCELLED", "BOOKING_COMPLETED", "BOOKING_NO_SHOW",
  "BOOKING_CONFIRMATION_SENT", "BOOKING_REMINDER_SENT",
  "PAYMENT_RECORDED", "PAYMENT_REFUNDED", "PAYMENT_DELETED",
  "FOLLOWUP_CREATED", "FOLLOWUP_UPDATED", "FOLLOWUP_DELETED",
  "CONVERSATION_UPDATED", "MESSAGE_SENT", "ENQUIRY_CREATED", "ENQUIRY_UPDATED",
  "AUTOMATION_CREATED", "AUTOMATION_UPDATED", "AUTOMATION_DELETED", "AUTOMATION_EXECUTED",
  "TEMPLATE_CREATED", "TEMPLATE_UPDATED", "TEMPLATE_DELETED",
  "USER_CREATED", "USER_UPDATED", "USER_DELETED",
  "SETTINGS_UPDATED", "TEST_EMAIL_SENT", "EMAIL_SENT",
  "SESSION_CREATED", "SESSION_UPDATED", "SESSION_DELETED", "SESSION_CANCELLED",
];

function AuditTab() {
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["audit", action, entityType, page],
    queryFn: () => api<Paged<AuditRow>>(`/audit${qs({ action, entityType, page, limit: 15 })}`),
  });
  return (
    <Card>
      <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
        <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="!w-60">
          <option value="">All actions</option>
          {AUDIT_ACTIONS.map((a) => <option key={a} value={a}>{a.replace(/_/g, " ")}</option>)}
        </Select>
        <Select value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }} className="!w-52">
          <option value="">All entities</option>
          {["User", "Customer", "Conversation", "Enquiry", "Booking", "Payment", "FollowUp", "Session", "Workshop", "AutomationRule", "MessageTemplate", "BusinessSetting", "Email", "Notification"].map((a) => <option key={a} value={a}>{a}</option>)}
        </Select>
      </div>
      {isLoading && <LoadingState />}
      {error && <ErrorState message="Failed to load audit log" onRetry={() => refetch()} />}
      {data && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead><tr className="border-b border-slate-100"><Th>When</Th><Th>Action</Th><Th>Entity</Th><Th>By</Th></tr></thead>
              <tbody>
                {data.data.map((a) => (
                  <tr key={a.id} className="border-b border-slate-50">
                    <Td className="whitespace-nowrap">{fmtDateTime(a.createdAt)}</Td>
                    <Td><Badge className="bg-slate-100 text-slate-600">{a.action.replace(/_/g, " ")}</Badge></Td>
                    <Td className="text-slate-500">{a.entityType}{a.entityId ? ` · ${a.entityId.slice(0, 8)}` : ""}</Td>
                    <Td>{a.user?.name || "System"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.data.length === 0 && <EmptyState title="No audit entries" />}
          </div>
          <Pagination page={data.meta.page} pages={data.meta.pages} total={data.meta.total} onPage={setPage} />
        </>
      )}
    </Card>
  );
}
