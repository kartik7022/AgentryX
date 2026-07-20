import { NavLink } from "react-router-dom";
import { KEYCLOAK_LOGOUT_URL } from "../api";
import { useAdminAuth } from "./AuthGuard";

const PLATFORM_TABS = [
  { path: "/register", label: "Register Client" },
  { path: "/clients", label: "Manage Clients" },
  { path: "/modules", label: "Modules" },
  { path: "/sidebar-items", label: "Client Side Left Nav Setup" },
  { path: "/admins", label: "Admins" },
  { path: "/datasource-types", label: "Datasource Types" },
  { path: "/module-groups", label: "Module Groups" },
];

const BILLING_TABS = [
  { path: "/billing/dashboard", label: "Dashboard" },
  { path: "/billing/customers", label: "Customers" },
  { path: "/billing/subscriptions", label: "Subscriptions" },
  { path: "/billing/payments", label: "Payments" },
  { path: "/billing/revenue", label: "Revenue" },
  { path: "/billing/config", label: "Billing Config" },
  { path: "/billing/plans", label: "Plans" },
];

const TOOL_LINKS = [
  { href: "http://localhost:3003", label: "Metabase" },
  { href: "http://localhost:3004", label: "Mautic" },
];

async function handleLogout() {
  await fetch("/admin/auth/logout", { method: "POST", credentials: "include" });
  window.location.replace(KEYCLOAK_LOGOUT_URL);
}
export default function Sidebar() {
  const { isSuperadmin } = useAdminAuth();
  const platformTabs = isSuperadmin
    ? PLATFORM_TABS
    : PLATFORM_TABS.filter((tab) => tab.path !== "/admins");

  return (
    <aside className="sidebar">
      <div className="sidebar-scroll">
        <div className="sidebar-logo">AgentryX Admin</div>
        <div className="sidebar-group-label">Platform</div>
        <nav>
          {platformTabs.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={({ isActive }) =>
                "sidebar-link" + (isActive ? " active" : "")
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
        {isSuperadmin ? (
          <>
            <div className="sidebar-group-label">Subscription Details</div>
            <nav>
              {BILLING_TABS.map((tab) => (
                <NavLink
                  key={tab.path}
                  to={tab.path}
                  className={({ isActive }) =>
                    "sidebar-link" + (isActive ? " active" : "")
                  }
                >
                  {tab.label}
                </NavLink>
              ))}
            </nav>
          </>
        ) : null}
        <div className="sidebar-group-label">Tools</div>
        <nav>
          {TOOL_LINKS.map((tool) => (
            <a
              key={tool.href}
              className="sidebar-link"
              href={tool.href}
              target="_blank"
              rel="noreferrer"
            >
              {tool.label}
            </a>
          ))}
        </nav>
      </div>
      <button className="sidebar-logout" onClick={handleLogout}>
        Logout
      </button>
    </aside>
  );
}
