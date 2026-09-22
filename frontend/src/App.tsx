import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "./lib/api";
import { AuthProvider, useAuth, roleRank } from "./auth/AuthContext";
import { ToastProvider } from "./components/toast";
import { Layout } from "./components/Layout";
import { LoadingState } from "./components/ui";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Inbox from "./pages/Inbox";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import Bookings from "./pages/Bookings";
import Workshops from "./pages/Workshops";
import CalendarPage from "./pages/Calendar";
import FollowUps from "./pages/FollowUps";
import Payments from "./pages/Payments";
import Automations from "./pages/Automations";
import Templates from "./pages/Templates";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import PublicBooking from "./pages/PublicBooking";
import PublicEnquiry from "./pages/PublicEnquiry";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => (err instanceof ApiError && err.status === 401 ? false : count < 1),
      refetchOnWindowFocus: false,
      staleTime: 15000,
    },
  },
});

function RequireAuth({ children, minRole }: { children: JSX.Element; minRole?: string }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingState label="Loading StudioFlow..." />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (minRole && roleRank(user.role) < roleRank(minRole)) {
    return <Navigate to={user.role === "STAFF" ? "/inbox" : "/"} replace />;
  }
  return children;
}

function HomeRedirect() {
  const { user } = useAuth();
  if (user?.role === "STAFF") return <Navigate to="/inbox" replace />;
  return <Dashboard />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/book" element={<PublicBooking />} />
              <Route path="/enquire" element={<PublicEnquiry />} />
              <Route
                element={
                  <RequireAuth>
                    <Layout />
                  </RequireAuth>
                }
              >
                <Route path="/" element={<HomeRedirect />} />
                <Route path="/inbox" element={<Inbox />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/customers/:id" element={<CustomerDetail />} />
                <Route path="/bookings" element={<Bookings />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/followups" element={<FollowUps />} />
                <Route path="/payments" element={<Payments />} />
                <Route path="/templates" element={<Templates />} />
                <Route
                  path="/classes"
                  element={
                    <RequireAuth minRole="MANAGER">
                      <Workshops />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/automation"
                  element={
                    <RequireAuth minRole="MANAGER">
                      <Automations />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/reports"
                  element={
                    <RequireAuth minRole="MANAGER">
                      <Reports />
                    </RequireAuth>
                  }
                />
                <Route path="/settings" element={<Settings />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
