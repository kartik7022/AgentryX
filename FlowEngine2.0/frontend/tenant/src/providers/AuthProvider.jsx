import { createContext, useContext, useEffect, useState } from "react";
import { authUrls } from "../config/env";
import { api } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    user: null,
    loading: true,
    authenticated: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      try {
        const data = await api.get("/auth/me", { redirectOn401: false });
        if (cancelled) return;

        if (!data?.authenticated) {
          setState({ user: null, loading: false, authenticated: false });
          return;
        }

        setState({
          user: {
            tenantId: data.tenant_id,
            role: data.role,
            email: data.email,
            accountType: data.account_type || "trial",
            permissions: data.permissions || [],
            modules: data.modules || [],
          },
          loading: false,
          authenticated: true,
        });
      } catch {
        if (!cancelled) {
          setState({ user: null, loading: false, authenticated: false });
        }
      }
    }

    loadSession();

    const interval = setInterval(async () => {
      try {
        const data = await api.get("/auth/me", { redirectOn401: false });
        if (!data?.authenticated) {
          const refresh = await api.post("/auth/refresh", undefined, { redirectOn401: false }).catch(() => null);
          if (!refresh?.authenticated) {
            setState({ user: null, loading: false, authenticated: false });
          }
        }
      } catch {
        // Skip on transient failure.
      }
    }, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const value = {
    ...state,
    login: () => window.location.replace(authUrls.login),
    logout: () => window.location.replace(authUrls.logout),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
