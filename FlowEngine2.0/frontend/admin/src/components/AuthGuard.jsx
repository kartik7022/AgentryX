import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { KEYCLOAK_LOGIN_URL } from "../api";

const AdminAuthContext = createContext({
  user: null,
  isSuperadmin: false,
});

export function useAdminAuth() {
  return useContext(AdminAuthContext);
}

export default function AuthGuard({ children }) {
  const [checked, setChecked] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch("/admin/auth/me", { credentials: "include" });
        const d = await res.json();
        if (!d.authenticated) {
          window.location.replace(KEYCLOAK_LOGIN_URL);
          return;
        }
        if (!cancelled) {
          setUser({
            username: d.username,
            role: d.role,
          });
          setChecked(true);
        }
      } catch (_) {
        window.location.replace(KEYCLOAK_LOGIN_URL);
      }
    }
    check();

    const interval = setInterval(check, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const value = useMemo(
    () => ({
      user,
      isSuperadmin: user?.role === "superadmin",
    }),
    [user],
  );

  if (!checked) return null;

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}
