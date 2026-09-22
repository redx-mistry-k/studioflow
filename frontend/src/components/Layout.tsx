import { createContext, useContext, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard, Inbox, Users, CalendarCheck, GraduationCap, CalendarDays, PhoneCall,
  CreditCard, Zap, BarChart3, Settings, Plus, Bell, Search, Menu, X, LogOut, FileText, User as UserIcon,
} from "lucide-react";
import { api, qs, Paged } from "../lib/api";
import { useAuth, roleRank } from "../auth/AuthContext";
import { cn, fullName, timeAgo } from "../lib/utils";
import { Notification } from "../lib/types";
import { QuickAddModal } from "./QuickAdd";

// ---------- Business info context (name/currency for the whole app) ----------
const BusinessContext = createContext<{ name: string; currency: string }>({ name: "StudioFlow", currency: "INR" });
export const useBusiness = () => useContext(BusinessContext);

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, minRole: "MANAGER" },
  { to: "/inbox", label: "Inbox", icon: Inbox, minRole: "STAFF" },
  { to: "/customers", label: "Customers", icon: Users, minRole: "STAFF" },
  { to: "/bookings", label: "Bookings", icon: CalendarCheck, minRole: "STAFF" },
  { to: "/classes", label: "Classes & Workshops", icon: GraduationCap, minRole: "MANAGER" },
  { to: "/calendar", label: "Calendar", icon: CalendarDays, minRole: "STAFF" },
  { to: "/followups", label: "Follow-ups", icon: PhoneCall, minRole: "STAFF" },
  { to: "/payments", label: "Payments", icon: CreditCard, minRole: "STAFF" },
  { to: "/automation", label: "Automation", icon: Zap, minRole: "MANAGER" },
  { to: "/reports", label: "Reports", icon: BarChart3, minRole: "MANAGER" },
  { to: "/settings", label: "Settings", icon: Settings, minRole: "STAFF" },
];

function Sidebar({ mobile, onNav }: { mobile?: boolean; onNav?: () => void }) {
  const { user } = useAuth();
  const { name } = useBusiness();
  const rank = roleRank(user?.role || "STAFF");
  return (
    <div className={cn("flex h-full w-60 flex-col bg-white", !mobile && "hidden lg:flex")}>
      <Link to="/" className="flex items-center gap-2.5 px-5 py-5" onClick={onNav}>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
          {name[0] || "S"}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold text-slate-900">{name}</p>
          <p className="text-xs text-slate-400">Operations</p>
        </div>
      </Link>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {NAV.filter((n) => rank >= roleRank(n.minRole)).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === "/"}
            onClick={onNav}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"
              )
            }
          >
            <n.icon className="h-[18px] w-[18px]" />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-100 p-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">
            {user?.name?.[0] || "?"}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-800">{user?.name}</p>
            <p className="text-xs capitalize text-slate-400">{user?.role.toLowerCase()}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SearchResults {
  customers: { id: string; firstName: string; lastName: string; phone: string | null }[];
  bookings: { id: string; bookingCode: string; status: string; customer: { firstName: string } }[];
  sessions: { id: string; title: string | null; startsAt: string; workshop: { name: string } }[];
  conversations: { id: string; channel: string; customer: { firstName: string; lastName: string } }[];
}

function GlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ["search", q],
    queryFn: () => api<SearchResults>(`/search${qs({ q })}`),
    enabled: q.trim().length >= 2,
  });
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", fn);
    return () => window.removeEventListener("mousedown", fn);
  }, []);
  const go = (path: string) => {
    setOpen(false);
    setQ("");
    navigate(path);
  };
  const has = data && (data.customers.length + data.bookings.length + data.sessions.length + data.conversations.length > 0);
  return (
    <div ref={boxRef} className="relative hidden w-full max-w-md md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search customers, bookings, classes..."
        className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-11 z-40 max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-pop">
          {!has && <p className="px-3 py-4 text-center text-[13px] text-slate-400">No results</p>}
          {(data?.customers || []).map((c) => (
            <button key={c.id} onClick={() => go(`/customers/${c.id}`)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50">
              <UserIcon className="h-4 w-4 text-slate-400" />
              <span className="font-medium">{c.firstName} {c.lastName}</span>
              <span className="ml-auto text-xs text-slate-400">{c.phone}</span>
            </button>
          ))}
          {(data?.bookings || []).map((b) => (
            <button key={b.id} onClick={() => go(`/bookings?highlight=${b.id}`)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50">
              <CalendarCheck className="h-4 w-4 text-slate-400" />
              <span className="font-medium">{b.bookingCode}</span>
              <span className="ml-auto text-xs text-slate-400">{b.customer.firstName}</span>
            </button>
          ))}
          {(data?.sessions || []).map((s) => (
            <button key={s.id} onClick={() => go(`/classes?session=${s.id}`)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50">
              <GraduationCap className="h-4 w-4 text-slate-400" />
              <span className="font-medium">{s.title || s.workshop.name}</span>
            </button>
          ))}
          {(data?.conversations || []).map((c) => (
            <button key={c.id} onClick={() => go(`/inbox?c=${c.id}`)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50">
              <Inbox className="h-4 w-4 text-slate-400" />
              <span className="font-medium">{c.customer.firstName} {c.customer.lastName}</span>
              <span className="ml-auto text-xs text-slate-400">{c.channel}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<Paged<Notification> & { unread: number }>("/notifications?limit=15"),
    refetchInterval: 30000,
  });
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", fn);
    return () => window.removeEventListener("mousedown", fn);
  }, []);
  const markAll = async () => {
    await api("/notifications/read-all", { method: "POST" });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };
  const openOne = async (n: Notification) => {
    if (!n.read) {
      await api(`/notifications/${n.id}/read`, { method: "POST" });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    }
  };
  return (
    <div ref={boxRef} className="relative">
      <button onClick={() => setOpen(!open)} className="relative rounded-xl p-2.5 text-slate-500 hover:bg-slate-100">
        <Bell className="h-5 w-5" />
        {(data?.unread || 0) > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
            {data!.unread > 9 ? "9+" : data!.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-40 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-pop">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            <button onClick={markAll} className="text-[13px] font-medium text-brand-600 hover:underline">
              Mark all read
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {(data?.data || []).length === 0 && <p className="px-4 py-8 text-center text-[13px] text-slate-400">No notifications</p>}
            {(data?.data || []).map((n) => (
              <button key={n.id} onClick={() => openOne(n)} className={cn("flex w-full flex-col gap-0.5 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50", !n.read && "bg-brand-50/40")}>
                <span className="text-sm font-medium text-slate-800">{n.title}</span>
                {n.body && <span className="line-clamp-2 text-[13px] text-slate-500">{n.body}</span>}
                <span className="text-xs text-slate-400">{timeAgo(n.createdAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const [mobileNav, setMobileNav] = useState(false);
  const [quickAdd, setQuickAdd] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["business"],
    queryFn: () => api<{ settings: { businessName: string; currency: string } }>("/settings"),
  });

  return (
    <BusinessContext.Provider value={{ name: settings?.settings.businessName || "StudioFlow", currency: settings?.settings.currency || "INR" }}>
      <div className="flex h-screen overflow-hidden">
        <aside className="hidden border-r border-slate-200 lg:block">
          <Sidebar />
        </aside>
        {mobileNav && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileNav(false)} />
            <div className="absolute left-0 top-0 h-full">
              <Sidebar mobile onNav={() => setMobileNav(false)} />
            </div>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4">
            <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setMobileNav(true)}>
              <Menu className="h-5 w-5" />
            </button>
            <GlobalSearch />
            <div className="ml-auto flex items-center gap-1.5">
              <Link to="/templates" className="hidden rounded-xl p-2.5 text-slate-500 hover:bg-slate-100 md:block" title="Message templates">
                <FileText className="h-5 w-5" />
              </Link>
              <NotificationsBell />
              <button
                onClick={() => setQuickAdd(true)}
                className="ml-1 hidden h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700 sm:inline-flex"
              >
                <Plus className="h-4 w-4" /> Quick Add
              </button>
              <button onClick={() => setQuickAdd(true)} className="rounded-xl bg-brand-600 p-2.5 text-white sm:hidden">
                <Plus className="h-5 w-5" />
              </button>
              <div className="relative">
                <button onClick={() => setUserMenu(!userMenu)} className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                  {user?.name?.[0] || "?"}
                </button>
                {userMenu && (
                  <div className="absolute right-0 top-11 z-40 w-52 rounded-xl border border-slate-200 bg-white py-1 shadow-pop">
                    <div className="border-b border-slate-100 px-4 py-2">
                      <p className="truncate text-sm font-medium">{fullName({ name: user?.name })}</p>
                      <p className="truncate text-xs text-slate-400">{user?.email}</p>
                    </div>
                    <button onClick={logout} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-50">
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>
          <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
      <button className="hidden" onClick={() => setMobileNav(false)}>
        <X />
      </button>
      <QuickAddModal
        open={quickAdd}
        onClose={() => setQuickAdd(false)}
        onDone={() => {
          setQuickAdd(false);
          qc.invalidateQueries();
        }}
      />
    </BusinessContext.Provider>
  );
}
