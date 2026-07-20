import { useEffect, useMemo, useState } from "react";
import { Banner as NoticeBanner } from "../../components/feedback/Banner";
import { AppButton } from "../../components/primitives/AppButton";
import { rolesApi } from "../../lib/roles";
import { usersApi } from "../../lib/users";

export function RolesPage() {
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => {
    load().catch(() => null);
  }, []);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        load().catch(() => null);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [roleRows, userRows] = await Promise.all([
        rolesApi.list().catch(() => []),
        usersApi.list(),
      ]);
      setRoles(roleRows || []);
      setUsers(userRows || []);
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Failed to load roles",
        detail: error.message || "Unable to load RBAC role data.",
      });
    } finally {
      setLoading(false);
    }
  }

  const roleNames = useMemo(() => {
    const names = new Set([
      ...roles.map((role) => role.name).filter(Boolean),
      ...users.map((user) => user.role).filter(Boolean),
    ]);
    return Array.from(names);
  }, [roles, users]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch =
        !query ||
        `${user.full_name || ""} ${user.email || ""} ${user.role || ""}`.toLowerCase().includes(query);
      const matchesRole = !roleFilter || user.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [roleFilter, search, users]);

  const roleSummary = useMemo(() => {
    return roleNames.map((name) => ({
      name,
      count: users.filter((user) => user.role === name).length,
      description: roles.find((role) => role.name === name)?.description || "",
    }));
  }, [roleNames, roles, users]);

  return (
    <section>
      <Header
        label="Roles & Access"
        title="Roles"
        description="Review tenant RBAC roles, assigned users, module access, and status."
      />
      {banner ? <NoticeBanner {...banner} /> : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--space-4)", marginBottom: "var(--space-6)" }}>
        {roleSummary.slice(0, 3).map((role) => (
          <Metric key={role.name} label={role.name} value={`${role.count} users`} detail={role.description || "Tenant role"} />
        ))}
        {roleSummary.length === 0 ? <Metric label="Users" value={users.length} detail="Tenant RBAC assignments" /> : null}
      </div>

      <div className="surface-card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "var(--space-5) var(--space-6)", borderBottom: "1px solid var(--color-border-soft)", display: "flex", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: "var(--font-weight-semibold)" }}>RBAC User Directory</div>
            <div style={{ color: "var(--color-text-muted)" }}>{filteredUsers.length} users</div>
          </div>
          <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users..." style={searchInputStyle} />
            <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} style={filterStyle}>
              <option value="">All roles</option>
              {roleNames.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <EmptyState text="Loading users..." />
        ) : filteredUsers.length === 0 ? (
          <EmptyState text="No users found." />
        ) : (
          <div style={{ display: "grid" }}>
            {filteredUsers.map((user) => {
              const isAdmin = user.role === "tenant_admin" || user.role === "tenant_co_admin";
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => setSelectedUser(user)}
                  style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 0.7fr) minmax(150px, 0.4fr) auto", gap: "var(--space-4)", alignItems: "center", padding: "var(--space-5) var(--space-6)", border: 0, borderTop: "1px solid var(--color-border-soft)", background: "transparent", textAlign: "left", cursor: "pointer", font: "inherit", color: "var(--color-text-strong)" }}
                >
                  <div>
                    <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-1)" }}>{user.full_name}</div>
                    <div style={{ color: "var(--color-text-muted)" }}>{user.email}</div>
                  </div>
                  <Chip tone={isAdmin ? "info" : "warning"}>{isAdmin ? "Admin" : "Module User"}</Chip>
                  <Chip tone={user.status === "active" ? "success" : "error"}>{user.status}</Chip>
                  <span style={{ color: "var(--color-text-soft)" }}>View</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedUser ? (
        <UserDetailDialog user={selectedUser} onClose={() => setSelectedUser(null)} />
      ) : null}
    </section>
  );
}

function UserDetailDialog({ user, onClose }) {
  const isAdmin = user.role === "tenant_admin" || user.role === "tenant_co_admin";
  return (
    <div style={dialogOverlayStyle}>
      <div className="surface-card" style={dialogCardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", alignItems: "flex-start", marginBottom: "var(--space-6)" }}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", marginBottom: "var(--space-1)" }}>{user.full_name}</div>
            <div style={{ color: "var(--color-text-muted)" }}>{user.email}</div>
          </div>
          <AppButton tooltip="Close role details" size="sm" variant="ghost" onClick={onClose}>Close</AppButton>
        </div>

        <div style={{ display: "grid", gap: "var(--space-4)" }}>
          <DetailRow label="Full Name" value={user.full_name} />
          <DetailRow label="Email" value={user.email} />
          <DetailRow label="Role" value={user.role} />
          <DetailRow label="Status" value={user.status} />
          <div>
            <div className="mono-label" style={{ color: "var(--color-text-soft)", marginBottom: "var(--space-2)" }}>Modules</div>
            {isAdmin ? (
              <div style={{ color: "var(--color-text-muted)" }}>Full access to all modules</div>
            ) : Array.isArray(user.modules) && user.modules.length ? (
              <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                {user.modules.map((module) => <Chip key={module} tone="info">{module}</Chip>)}
              </div>
            ) : (
              <div style={{ color: "var(--color-text-soft)" }}>No modules assigned</div>
            )}
          </div>
          <DetailRow label="Created At" value={formatLongDate(user.created_at)} />
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div>
      <div className="mono-label" style={{ color: "var(--color-text-soft)", marginBottom: "var(--space-1)" }}>{label}</div>
      <div style={{ color: "var(--color-text-strong)", fontWeight: "var(--font-weight-medium)", overflowWrap: "anywhere" }}>{formatValue(value)}</div>
    </div>
  );
}

function Header({ label, title, description }) {
  return <div style={{ marginBottom: "var(--space-6)" }}><h1 style={{ margin: 0, color: "var(--color-text-strong)", fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", letterSpacing: "var(--tracking-tight)" }}>{title}</h1><p style={{ margin: "var(--space-3) 0 0", color: "var(--color-text-muted)", maxWidth: "72ch" }}>{description}</p></div>;
}
function Metric({ label, value, detail }) { return <div className="surface-card" style={{ padding: "var(--space-5)", background: "var(--color-bg-elevated)" }}><div className="mono-label" style={{ color: "var(--color-text-soft)", marginBottom: "var(--space-2)" }}>{label}</div><div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-1)" }}>{value}</div><div style={{ color: "var(--color-text-muted)" }}>{detail}</div></div>; }
function EmptyState({ text }) { return <div style={{ padding: "var(--space-8)", color: "var(--color-text-muted)" }}>{text}</div>; }
function Chip({ tone, children }) { const tones = { info: { background: "var(--color-status-info-bg)", color: "var(--color-status-info-text)", border: "var(--color-status-info-border)" }, success: { background: "var(--color-status-success-bg)", color: "var(--color-status-success-text)", border: "var(--color-status-success-border)" }, warning: { background: "var(--color-status-warning-bg)", color: "var(--color-status-warning-text)", border: "var(--color-status-warning-border)" }, error: { background: "var(--color-status-error-bg)", color: "var(--color-status-error-text)", border: "var(--color-status-error-border)" } }; return <span style={{ display: "inline-flex", alignItems: "center", width: "fit-content", padding: "6px 10px", borderRadius: "var(--radius-pill)", border: `1px solid ${tones[tone].border}`, background: tones[tone].background, color: tones[tone].color, fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)" }}>{children}</span>; }

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function formatLongDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return value;
  }
}

const searchInputStyle = { width: "min(280px, 100%)", minHeight: "42px", padding: "0 14px", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-base)", background: "var(--color-bg-surface)" };
const filterStyle = { minHeight: "42px", padding: "0 14px", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-base)", background: "var(--color-bg-surface)" };
const dialogOverlayStyle = { position: "fixed", inset: 0, zIndex: 40, display: "grid", placeItems: "center", background: "var(--color-overlay-scrim)", backdropFilter: "blur(8px)" };
const dialogCardStyle = { width: "min(560px, calc(100vw - 32px))", maxHeight: "calc(100vh - 48px)", overflow: "auto", padding: "var(--space-8)" };
