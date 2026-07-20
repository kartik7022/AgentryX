import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AppButton } from "../primitives/AppButton";
import { Tooltip } from "../primitives/Tooltip";
import { useAuth } from "../../providers/AuthProvider";
import { useTenantWorkspace } from "../../providers/TenantWorkspaceProvider";

const routeMap = {
  dashboard: "/app",
  datasources: "/app/datasources",
  "datasource-configs": "/app/datasource-configs",
  vault: "/app/credentials",
  intents: "/app/intents",
  "intent-policies": "/app/intent-policies",
  "validation-rules": "/app/rules",
  users: "/app/users",
  rbac: "/app/roles",
  "api-keys": "/app/api-keys",
  "connected-inboxes": "/app/connected-inboxes",
  playground: "/app/playground",
  billing: "/app/billing",
};

function routeValueForPath(pathname) {
  const matches = Object.entries(routeMap)
    .filter(([, path]) => (
      path === "/app"
        ? pathname === "/app"
        : pathname === path || pathname.startsWith(`${path}/`)
    ))
    .sort((left, right) => right[1].length - left[1].length);

  return matches[0]?.[0] || null;
}

function firstRouteForModule(module, sidebarItems = [], role) {
  const itemByValue = new Map(sidebarItems.map((item) => [item.value, item]));
  const firstValue = (module?.sidebarItems || []).find((value) => {
    const item = itemByValue.get(value);
    return routeMap[value] && !(role === "tenant_module_user" && item?.hiddenFromModuleUser);
  });
  return firstValue ? routeMap[firstValue] : "/app";
}

function navItemFromSidebarItem(item) {
  const href = routeMap[item.value] || item.href || "/app";

  return {
    to: href,
    label: item.value === "dashboard" ? "Overview" : item.label,
    value: item.value,
    openMode: item.openMode,
    external: item.openMode === "new_tab" || /^https?:\/\//i.test(href),
  };
}

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    loading,
    modules,
    activeModule,
    activeModuleIndex,
    setActiveModuleIndex,
    sidebarItems,
    primaryItems,
    moreItems,
  } = useTenantWorkspace();
  const [showMore, setShowMore] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (!modules.length) return;

    const currentValue = routeValueForPath(location.pathname);
    if (!currentValue || activeModule?.sidebarItems?.includes(currentValue)) return;

    const moduleIndex = modules.findIndex((module) => module.sidebarItems?.includes(currentValue));
    if (moduleIndex !== -1 && moduleIndex !== activeModuleIndex) {
      setActiveModuleIndex(moduleIndex);
    }
  }, [activeModule, activeModuleIndex, location.pathname, modules, setActiveModuleIndex]);

  useEffect(() => {
    const currentValue = routeValueForPath(location.pathname);
    setShowMore(moreItems.some((item) => item.value === currentValue));
  }, [activeModuleIndex, location.pathname, moreItems]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  const primaryNavItems = useMemo(
    () => primaryItems.map(navItemFromSidebarItem),
    [primaryItems],
  );

  const moreNavItems = useMemo(
    () => moreItems.map(navItemFromSidebarItem),
    [moreItems],
  );

  const visiblePrimaryNavItems = primaryNavItems;
  const hasMoreItems = moreNavItems.length > 0;
  const canOpenBilling = user?.role !== "tenant_module_user";

  function handleModuleSelect(index) {
    const nextModule = modules[index];
    if (!nextModule) return;

    setActiveModuleIndex(index);

    if (nextModule.externalUrl) return;

    const currentValue = routeValueForPath(location.pathname);
    if (!currentValue || !nextModule.sidebarItems.includes(currentValue)) {
      navigate(firstRouteForModule(nextModule, sidebarItems, user?.role));
    }
  }

  return (
    <div
      className="app-shell"
    >
      <div className="app-shell__mobilebar">
        <Tooltip content={mobileSidebarOpen ? "Close navigation" : "Open navigation"}>
          <button
            type="button"
            className="app-shell__menu-button"
            aria-label={mobileSidebarOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileSidebarOpen}
            onClick={() => setMobileSidebarOpen((current) => !current)}
          >
            <span />
            <span />
            <span />
          </button>
        </Tooltip>
        <div>
          <div className="app-shell__mobile-title">AgentryX</div>
          <div className="app-shell__mobile-subtitle">{activeModule?.name || "Tenant portal"}</div>
        </div>
      </div>

      <div
        className="app-shell__backdrop"
        aria-hidden="true"
        data-open={mobileSidebarOpen}
        onClick={() => setMobileSidebarOpen(false)}
      />

      <aside
        className="app-shell__sidebar"
        data-open={mobileSidebarOpen}
      >
        <div className="app-shell__sidebar-header">
          <div>
            <div style={{ fontSize: "var(--font-size-xl)", fontWeight: "var(--font-weight-bold)", letterSpacing: "var(--tracking-tight)" }}>
              AgentryX
            </div>
            <div style={{ marginTop: "var(--space-1)", color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" }}>
              Tenant portal
            </div>
          </div>
          <AppButton
            tooltip="Close navigation"
            className="app-shell__sidebar-close"
            size="sm"
            variant="ghost"
            onClick={() => setMobileSidebarOpen(false)}
          >
            Close
          </AppButton>
        </div>

        <nav style={{ display: "grid", gap: "2px" }}>
          {loading ? (
            <div style={{ color: "var(--color-text-muted)", padding: "12px 14px" }}>
              Loading navigation...
            </div>
          ) : null}
          {visiblePrimaryNavItems.map((item) => (
            <SidebarNavItem
              key={item.value || item.to}
              item={item}
              onNavigate={() => setMobileSidebarOpen(false)}
            />
          ))}

          {hasMoreItems ? (
            <>
              <Tooltip content={showMore ? "Hide more navigation items" : "Show more navigation items"}>
                <button
                  type="button"
                  aria-expanded={showMore}
                  onClick={() => setShowMore((current) => !current)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "var(--space-2)",
                    padding: "6px 10px",
                    borderRadius: "var(--radius-xs)",
                    border: "1px solid transparent",
                    background: "transparent",
                    color: "var(--color-text-base)",
                    fontWeight: "var(--font-weight-medium)",
                    fontSize: "var(--font-size-xs)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span>More</span>
                  <span aria-hidden="true" style={{ color: "var(--color-text-soft)", fontSize: "10px" }}>
                    {showMore ? "Less" : "+"}
                  </span>
                </button>
              </Tooltip>

              {showMore ? moreNavItems.map((item) => (
                <SidebarNavItem
                  key={item.value || item.to}
                  item={item}
                  nested
                  onNavigate={() => setMobileSidebarOpen(false)}
                />
              )) : null}
            </>
          ) : null}
        </nav>

        <div
          className="surface-card"
          style={{
            marginTop: "var(--space-4)",
            padding: "12px",
            background: "var(--color-bg-elevated)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
            <div
              aria-hidden="true"
              style={{
                width: "30px",
                height: "30px",
                borderRadius: "999px",
                display: "grid",
                placeItems: "center",
                background: "var(--color-primary-50)",
                border: "1px solid var(--color-primary-200)",
                color: "var(--color-text-strong)",
                fontSize: "12px",
                fontWeight: "var(--font-weight-bold)",
                flex: "0 0 auto",
              }}
            >
              {initialsFor(user?.email)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontWeight: "var(--font-weight-semibold)",
                  color: "var(--color-text-strong)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  lineHeight: 1.25,
                }}
                title={user?.email || "Unknown user"}
              >
                {user?.email || "Unknown user"}
              </div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  maxWidth: "100%",
                  marginTop: "5px",
                  padding: "2px 7px",
                  borderRadius: "999px",
                  background: "var(--color-bg-muted)",
                  color: "var(--color-text-muted)",
                  fontSize: "11px",
                  fontWeight: "var(--font-weight-medium)",
                  whiteSpace: "nowrap",
                }}
              >
                {formatRole(user?.role)}
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gap: "var(--space-2)" }}>
            {canOpenBilling ? (
              <AppButton
                tooltip="Open subscription details"
                variant="secondary"
                size="sm"
                fullWidth
                onClick={() => {
                  navigate("/app/billing");
                  setMobileSidebarOpen(false);
                }}
              >
                Subscription Details
              </AppButton>
            ) : null}
            <AppButton
              tooltip="Sign out of the tenant application"
              variant="secondary"
              size="sm"
              fullWidth
              onClick={logout}
            >
              Log Out
            </AppButton>
          </div>
        </div>
      </aside>

      <main
        className="app-shell__main"
      >
        <ModuleSwitcher
          modules={modules}
          activeIndex={activeModuleIndex}
          onSelect={handleModuleSelect}
        />
        {activeModule?.externalUrl ? (
          <iframe
            title={activeModule.name}
            src={activeModule.externalUrl}
            style={{
              width: "100%",
              minHeight: "calc(100dvh - 132px)",
              border: "1px solid var(--color-border-soft)",
              borderRadius: "var(--radius-md)",
              background: "var(--color-bg-surface)",
            }}
          />
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}

function sidebarLinkStyle(isActive, nested = false) {
  return {
    display: "block",
    padding: nested ? "5px 10px 5px 18px" : "6px 10px",
    borderRadius: "var(--radius-xs)",
    border: `1px solid ${isActive ? "var(--color-primary-200)" : "transparent"}`,
    background: isActive ? "var(--color-primary-50)" : "transparent",
    color: isActive ? "var(--color-text-strong)" : "var(--color-text-base)",
    fontWeight: isActive ? "var(--font-weight-semibold)" : "var(--font-weight-medium)",
    fontSize: "var(--font-size-xs)",
    textDecoration: "none",
  };
}

function SidebarNavItem({ item, nested = false, onNavigate }) {
  if (item.external) {
    return (
      <a
        href={item.to}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNavigate}
        style={sidebarLinkStyle(false, nested)}
      >
        {item.label}
      </a>
    );
  }

  return (
    <NavLink
      to={item.to}
      end={item.to === "/app"}
      onClick={onNavigate}
      style={({ isActive }) => sidebarLinkStyle(isActive, nested)}
    >
      {item.label}
    </NavLink>
  );
}

function initialsFor(email) {
  const value = String(email || "User").trim();
  const namePart = value.split("@")[0] || value;
  const parts = namePart.split(/[._\-\s]+/).filter(Boolean);
  const initials = parts.length > 1
    ? `${parts[0][0]}${parts[1][0]}`
    : namePart.slice(0, 2);

  return initials.toUpperCase();
}

function formatRole(role) {
  return String(role || "guest")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ModuleSwitcher({ modules, activeIndex, onSelect }) {
  const activeModule = modules[activeIndex] || null;
  const topTabs = useMemo(() => {
    const seenGroups = new Set();
    const tabs = [];

    modules.forEach((module, index) => {
      if (module.groupId) {
        if (seenGroups.has(module.groupId)) return;
        seenGroups.add(module.groupId);
        tabs.push({
          key: module.groupId,
          label: module.groupName || module.name,
          representativeIndex: index,
          groupId: module.groupId,
        });
        return;
      }

      tabs.push({
        key: module.id || module.name,
        label: module.name,
        representativeIndex: index,
        groupId: null,
      });
    });

    return tabs;
  }, [modules]);

  const groupModules = activeModule?.groupId
    ? modules.filter((module) => module.groupId === activeModule.groupId)
    : [];

  if (!modules.length) return null;

  return (
    <div
      style={{
        display: "grid",
        gap: "var(--space-2)",
        marginBottom: "var(--space-6)",
      }}
    >
      <div
        className="surface-card"
        style={{
          display: "flex",
          gap: "var(--space-2)",
          alignItems: "center",
          overflowX: "auto",
          padding: "var(--space-2)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {topTabs.map((tab) => {
          const selected = tab.groupId
            ? tab.groupId === activeModule?.groupId
            : tab.representativeIndex === activeIndex;

          return (
            <ModuleTab
              key={tab.key}
              label={tab.label}
              selected={selected}
              tooltip={`Switch to ${tab.label}`}
              onClick={() => onSelect(tab.representativeIndex)}
            />
          );
        })}
      </div>

      {groupModules.length > 1 ? (
        <div
          style={{
            display: "flex",
            gap: "var(--space-2)",
            alignItems: "center",
            overflowX: "auto",
            padding: "0 var(--space-1)",
          }}
        >
          {groupModules.map((module) => {
            const moduleIndex = modules.findIndex((entry) => entry.id === module.id);
            return (
              <ModuleTab
                key={module.id || module.name}
                label={module.name}
                selected={moduleIndex === activeIndex}
                compact
                tooltip={`Open ${module.name}`}
                onClick={() => onSelect(moduleIndex)}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function ModuleTab({ label, selected, compact = false, tooltip, onClick }) {
  return (
    <Tooltip content={tooltip}>
      <button
        type="button"
        onClick={onClick}
        style={{
          minHeight: compact ? "32px" : "38px",
          padding: compact ? "0 12px" : "0 16px",
          borderRadius: "999px",
          border: `1px solid ${selected ? "var(--color-primary-200)" : "transparent"}`,
          background: selected ? "var(--color-primary-700)" : "transparent",
          color: selected ? "var(--color-text-strong)" : "var(--color-text-base)",
          fontSize: compact ? "var(--font-size-xs)" : "var(--font-size-sm)",
          fontWeight: selected ? "var(--font-weight-semibold)" : "var(--font-weight-medium)",
          whiteSpace: "nowrap",
          boxShadow: selected ? "var(--shadow-sm)" : "none",
        }}
      >
        {label}
      </button>
    </Tooltip>
  );
}
