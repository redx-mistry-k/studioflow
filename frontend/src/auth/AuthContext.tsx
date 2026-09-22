import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { api, getToken, ApiError } from "../lib/api";

export interface User {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "STAFF";
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => getToken());
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem("sf_token");
    setToken(null);
    setUser(null);
    // Best-effort: also clear the HttpOnly auth cookie server-side.
    api("/auth/logout", { method: "POST", token: null }).catch(() => undefined);
  }, []);

  const refresh = useCallback(async () => {
    const t = getToken();
    if (!t) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api<User>("/auth/me", { token: t });
      setUser(me);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) logout();
      else setUser(null);
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Any API call that 401s mid-session (expired/disabled/cleared) bounces here.
  useEffect(() => {
    const onUnauthorized = () => {
      if (!getToken()) return;
      try {
        sessionStorage.setItem("sf_expired", "1");
      } catch {
        /* ignore */
      }
      logout();
    };
    window.addEventListener("sf:unauthorized", onUnauthorized);
    return () => window.removeEventListener("sf:unauthorized", onUnauthorized);
  }, [logout]);

  // Signed out in another tab? Follow along.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "sf_token" && !e.newValue) {
        setToken(null);
        setUser(null);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api<{ token: string; user: User }>("/auth/login", {
        method: "POST",
        body: { email, password },
        token: null,
      });
      localStorage.setItem("sf_token", res.token);
      setToken(res.token);
      setUser(res.user);
    },
    []
  );

  return <AuthContext.Provider value={{ user, token, loading, login, logout, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function roleRank(role: string): number {
  return role === "ADMIN" ? 3 : role === "MANAGER" ? 2 : 1;
}
