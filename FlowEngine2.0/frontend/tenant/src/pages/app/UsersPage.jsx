import { useEffect, useMemo, useState } from "react";
import { Banner as NoticeBanner } from "../../components/feedback/Banner";
import { AppButton } from "../../components/primitives/AppButton";
import { useAuth } from "../../providers/AuthProvider";
import { usersApi } from "../../lib/users";

const addInitial = {
  fullName: "",
  email: "",
  role: "tenant_module_user",
  status: "active",
  modules: [],
};

const editInitial = {
  id: "",
  fullName: "",
  role: "",
  status: "active",
  modules: [],
};

export function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(null);
  const [tableSearch, setTableSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [addForm, setAddForm] = useState(addInitial);
  const [editForm, setEditForm] = useState(editInitial);
  const [submitting, setSubmitting] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState("");
  const [expandedUserIds, setExpandedUserIds] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [userRows, moduleRows] = await Promise.all([
          usersApi.list(),
          usersApi.modules(),
        ]);
        if (cancelled) return;
        setUsers(userRows || []);
        setModules(moduleRows || []);
      } catch (error) {
        if (!cancelled) {
          setBanner({
            tone: "error",
            title: "Failed to load users",
            detail: error.message || "Unable to load tenant users.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        reloadUsers().catch(() => null);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const filteredUsers = useMemo(() => {
    const query = tableSearch.trim().toLowerCase();
    if (!query) return users;
    return users.filter((entry) =>
      `${entry.full_name} ${entry.email} ${entry.role}`.toLowerCase().includes(query),
    );
  }, [users, tableSearch]);

  async function reloadUsers() {
    const rows = await usersApi.list();
    setUsers(rows || []);
  }

  function openAdd() {
    setAddForm(addInitial);
    setAddOpen(true);
  }

  function openEdit(entry) {
    setEditForm({
      id: String(entry.id),
      fullName: entry.full_name || "",
      role: entry.role || "",
      status: entry.status || "active",
      modules: entry.modules || [],
    });
    setEditOpen(true);
  }

  function toggleExpandedUser(userId) {
    setExpandedUserIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  async function submitAdd(event) {
    event.preventDefault();
    setBanner(null);
    if (!addForm.fullName.trim() || !addForm.email.trim()) {
      setBanner({
        tone: "warning",
        title: "Required fields missing",
        detail: "Full name and email are required.",
      });
      return;
    }
    if (addForm.role === "tenant_module_user" && addForm.modules.length === 0) {
      setBanner({
        tone: "warning",
        title: "Assign a module",
        detail: "Please assign at least one module to a tenant module user.",
      });
      return;
    }
    setSubmitting(true);
    const payload = {
      full_name: addForm.fullName.trim(),
      email: addForm.email.trim(),
      role: addForm.role,
      modules: addForm.role === "tenant_module_user" ? addForm.modules : [],
      status: addForm.status,
    };
    try {
      await usersApi.create(payload);
      setAddOpen(false);
      setBanner({
        tone: "success",
        title: "User added",
        detail: "The user has been created successfully.",
      });
      await reloadUsers();
    } catch (error) {
      let rows = null;
      let createdUser = null;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        rows = await usersApi.list().catch(() => null);
        createdUser = (rows || []).find((entry) => (
          String(entry.email || "").toLowerCase() === payload.email.toLowerCase()
        ));

        if (createdUser) break;
        if (attempt < 2) {
          await delay(900);
        }
      }

      if (createdUser) {
        setUsers(rows || []);
        setAddOpen(false);
        setBanner({
          tone: "success",
          title: "User added",
          detail: "The user was created successfully. The invite may have taken longer than usual to complete.",
        });
        return;
      }

      setBanner({
        tone: "error",
        title: "Create failed",
        detail: error.message || "Unable to create the user.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function submitEdit(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await usersApi.update(editForm.id, {
        full_name: editForm.fullName.trim() || undefined,
        status: editForm.status,
        modules: editForm.role === "tenant_module_user" ? editForm.modules : null,
      });
      setEditOpen(false);
      setBanner({
        tone: "success",
        title: "User updated",
        detail: "The user has been updated successfully.",
      });
      await reloadUsers();
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Update failed",
        detail: error.message || "Unable to update the user.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeletingUserId(String(deleteTarget.id));
    try {
      await usersApi.delete(deleteTarget.id);
      setDeleteTarget(null);
      setBanner({
        tone: "success",
        title: "User deleted",
        detail: "The user has been deleted successfully.",
      });
      await reloadUsers();
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Delete failed",
        detail: error.message || "Unable to delete the user.",
      });
    } finally {
      setDeletingUserId("");
    }
  }

  return (
    <section>
      <PageHeader
        label="Tenant User Management"
        title="Users"
        description="Manage tenant users, statuses, and module assignments."
        actions={
          <AppButton tooltip="Open the add user composer" onClick={openAdd}>
            + Add User
          </AppButton>
        }
      />

      {banner ? <NoticeBanner {...banner} /> : null}

      <div className="surface-card" style={{ overflow: "hidden" }}>
        <TableHeader
          title="User Directory"
          meta={`${filteredUsers.length} ${filteredUsers.length === 1 ? "user" : "users"}`}
          searchValue={tableSearch}
          onSearchChange={setTableSearch}
          placeholder="Search by name, email, or role..."
        />

        {loading ? (
          <EmptyState text="Loading users..." />
        ) : filteredUsers.length === 0 ? (
          <EmptyState text="No tenant users found." />
        ) : (
          <div style={{ display: "grid" }}>
            {filteredUsers.map((entry) => {
              const isSelf = entry.email === user?.email;
              return (
                <div key={entry.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleExpandedUser(entry.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleExpandedUser(entry.id);
                      }
                    }}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) minmax(180px, 0.6fr) minmax(120px, 0.45fr) minmax(140px, 0.45fr) auto",
                      gap: "var(--space-4)",
                      alignItems: "center",
                      padding: "var(--space-5) var(--space-6)",
                      borderTop: "1px solid var(--color-border-soft)",
                      cursor: "pointer",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-1)" }}>
                        {entry.full_name}
                      </div>
                      <div style={{ color: "var(--color-text-muted)" }}>{entry.email}</div>
                    </div>
                    <div>
                      <Chip tone={entry.role === "tenant_admin" || entry.role === "tenant_co_admin" ? "info" : "warning"}>
                        {entry.role}
                      </Chip>
                    </div>
                    <div>
                      <Chip tone={entry.status === "active" ? "success" : "warning"}>
                        {entry.status}
                      </Chip>
                    </div>
                    <div style={{ color: "var(--color-text-muted)" }}>{formatDate(entry.created_at)}</div>
                    <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <AppButton
                        tooltip={isSelf ? "You cannot edit your own account here" : `Edit ${entry.full_name}`}
                        size="sm"
                        variant="secondary"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!isSelf) openEdit(entry);
                        }}
                        disabled={isSelf}
                      >
                        Edit
                      </AppButton>
                      <AppButton
                        tooltip={isSelf ? "You cannot delete your own account here" : `Delete ${entry.full_name}`}
                        size="sm"
                        variant="ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!isSelf) setDeleteTarget(entry);
                        }}
                        disabled={isSelf}
                      >
                        Delete
                      </AppButton>
                    </div>
                  </div>
                  {expandedUserIds.has(entry.id) ? <ExpandedUserDetails user={entry} /> : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {addOpen ? (
        <FormPanel
          title="Add user"
          subtitle="Create a tenant user and assign modules when needed."
          onClose={() => setAddOpen(false)}
        >
          <form onSubmit={submitAdd} style={{ display: "grid", gap: "var(--space-4)" }}>
            <Field label="Full Name">
              <input value={addForm.fullName} onChange={(event) => setAddForm((current) => ({ ...current, fullName: event.target.value }))} style={inputStyle} />
            </Field>
            <Field label="Email">
              <input value={addForm.email} onChange={(event) => setAddForm((current) => ({ ...current, email: event.target.value }))} style={inputStyle} type="email" />
            </Field>
            <Field label="Role">
              <select value={addForm.role} onChange={(event) => setAddForm((current) => ({ ...current, role: event.target.value, modules: [] }))} style={inputStyle}>
                <option value="tenant_module_user">tenant_module_user</option>
                <option value="tenant_co_admin">tenant_co_admin</option>
                <option value="tenant_admin">tenant_admin</option>
              </select>
            </Field>
            <Field label="Status">
              <select value={addForm.status} onChange={(event) => setAddForm((current) => ({ ...current, status: event.target.value }))} style={inputStyle}>
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </Field>
            {addForm.role === "tenant_module_user" ? (
              <ModuleChecklist modules={modules} selected={addForm.modules} onChange={(next) => setAddForm((current) => ({ ...current, modules: next }))} />
            ) : null}
            <PanelActions
              onCancel={() => setAddOpen(false)}
              submitting={submitting}
              submitLabel="Create User"
              submitTooltip="Create this tenant user"
            />
          </form>
        </FormPanel>
      ) : null}

      {editOpen ? (
        <FormPanel
          title="Edit user"
          subtitle="Update user status and module assignments."
          onClose={() => setEditOpen(false)}
        >
          <form onSubmit={submitEdit} style={{ display: "grid", gap: "var(--space-4)" }}>
            <Field label="Full Name">
              <input value={editForm.fullName} onChange={(event) => setEditForm((current) => ({ ...current, fullName: event.target.value }))} style={inputStyle} />
            </Field>
            <Field label="Role">
              <input value={editForm.role} style={{ ...inputStyle, background: "var(--color-bg-elevated)" }} readOnly />
            </Field>
            <Field label="Status">
              <select value={editForm.status} onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value }))} style={inputStyle}>
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </Field>
            {editForm.role === "tenant_module_user" ? (
              <ModuleChecklist modules={modules} selected={editForm.modules} onChange={(next) => setEditForm((current) => ({ ...current, modules: next }))} />
            ) : null}
            <PanelActions
              onCancel={() => setEditOpen(false)}
              submitting={submitting}
              submitLabel="Save Changes"
              submitTooltip="Save user changes"
            />
          </form>
        </FormPanel>
      ) : null}

      {deleteTarget ? (
        <DeleteDialog
          title="Delete user"
          description={`Are you sure you want to delete ${deleteTarget.email}?`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
          deleting={deletingUserId === String(deleteTarget.id)}
        />
      ) : null}
    </section>
  );
}

function ModuleChecklist({ modules, selected, onChange }) {
  return (
    <Field label="Assigned Modules">
      <div style={{ display: "grid", gap: "var(--space-2)" }}>
        {modules.map((module) => {
          const checked = selected.includes(module.name);
          return (
            <label key={module.name} style={checkRowStyle}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => {
                  if (event.target.checked) {
                    onChange([...selected, module.name]);
                  } else {
                    onChange(selected.filter((entry) => entry !== module.name));
                  }
                }}
              />
              <span>{module.name}</span>
            </label>
          );
        })}
      </div>
    </Field>
  );
}

function ExpandedUserDetails({ user }) {
  const fields = [
    ["User ID", user.id],
    ["Full Name", user.full_name],
    ["Email", user.email],
    ["Role", user.role],
    ["Status", user.status],
    ["Modules", Array.isArray(user.modules) && user.modules.length ? user.modules.join(", ") : "No modules assigned"],
    ["Created At", formatDate(user.created_at)],
    ["Updated At", formatDate(user.updated_at)],
  ];

  return (
    <div style={{ padding: "0 var(--space-6) var(--space-5)", borderTop: "1px solid var(--color-border-soft)", background: "var(--color-bg-elevated)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "var(--space-3)", paddingTop: "var(--space-5)" }}>
        {fields.map(([label, value]) => (
          <div key={label} style={{ display: "grid", gap: "var(--space-1)" }}>
            <span className="mono-label" style={{ color: "var(--color-text-soft)" }}>{label}</span>
            <span style={{ color: "var(--color-text-strong)", overflowWrap: "anywhere" }}>{formatFieldValue(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PageHeader({ label, title, description, actions }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-6)", marginBottom: "var(--space-6)", flexWrap: "wrap" }}>
      <div>
        <h1 style={{ margin: 0, color: "var(--color-text-strong)", fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", letterSpacing: "var(--tracking-tight)" }}>{title}</h1>
        <p style={{ margin: "var(--space-3) 0 0", color: "var(--color-text-muted)", maxWidth: "72ch" }}>{description}</p>
      </div>
      {actions}
    </div>
  );
}

function TableHeader({ title, meta, searchValue, onSearchChange, placeholder }) {
  return (
    <div style={{ padding: "var(--space-5) var(--space-6)", borderBottom: "1px solid var(--color-border-soft)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-4)", flexWrap: "wrap" }}>
      <div>
        <div style={{ fontWeight: "var(--font-weight-semibold)" }}>{title}</div>
        <div style={{ color: "var(--color-text-muted)" }}>{meta}</div>
      </div>
      <input value={searchValue} onChange={(event) => onSearchChange(event.target.value)} placeholder={placeholder} style={searchInputStyle} />
    </div>
  );
}

function EmptyState({ text }) {
  return <div style={{ padding: "var(--space-8)", color: "var(--color-text-muted)" }}>{text}</div>;
}

function FormPanel({ title, subtitle, children, onClose }) {
  return (
    <aside className="surface-card" style={{ position: "fixed", top: "var(--space-8)", right: "var(--space-8)", bottom: "var(--space-8)", width: "min(420px, calc(100vw - 32px))", overflow: "auto", padding: "var(--space-6)", zIndex: 20, background: "linear-gradient(180deg, var(--color-bg-surface), var(--color-bg-elevated))" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-3)", marginBottom: "var(--space-5)" }}>
        <div>
          <div style={{ fontWeight: "var(--font-weight-bold)", fontSize: "var(--font-size-lg)", marginBottom: "var(--space-1)" }}>{title}</div>
          <div style={{ color: "var(--color-text-muted)" }}>{subtitle}</div>
        </div>
        <AppButton tooltip="Close this panel" size="sm" variant="ghost" onClick={onClose}>Close</AppButton>
      </div>
      {children}
    </aside>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: "var(--space-2)" }}>
      <span className="mono-label" style={{ color: "var(--color-text-muted)" }}>{label}</span>
      {children}
    </label>
  );
}

function PanelActions({ onCancel, submitting, submitLabel, submitTooltip }) {
  return (
    <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end", flexWrap: "wrap" }}>
      <AppButton tooltip="Cancel and close this panel" type="button" variant="secondary" onClick={onCancel}>Cancel</AppButton>
      <AppButton tooltip={submitTooltip} type="submit" disabled={submitting}>{submitting ? "Saving..." : submitLabel}</AppButton>
    </div>
  );
}

function DeleteDialog({ title, description, onCancel, onConfirm, deleting = false }) {
  return (
    <div style={dialogOverlayStyle}>
      <div className="surface-card" style={dialogCardStyle}>
        <div style={{ fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", marginBottom: "var(--space-3)" }}>{title}</div>
        <div style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-6)" }}>{description}</div>
        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}>
          <AppButton tooltip="Cancel this deletion" variant="secondary" onClick={onCancel} disabled={deleting}>Cancel</AppButton>
          <AppButton tooltip="Confirm this deletion" onClick={onConfirm} loading={deleting}>{deleting ? "Deleting..." : "Delete"}</AppButton>
        </div>
      </div>
    </div>
  );
}

function Banner({ tone, title, detail }) {
  const styles = {
    success: { border: "var(--color-status-success-border)", background: "var(--color-status-success-bg)", color: "var(--color-status-success-text)" },
    warning: { border: "var(--color-status-warning-border)", background: "var(--color-status-warning-bg)", color: "var(--color-status-warning-text)" },
    error: { border: "var(--color-status-error-border)", background: "var(--color-status-error-bg)", color: "var(--color-status-error-text)" },
  };
  return (
    <div style={{ marginBottom: "var(--space-6)", padding: "14px 16px", borderRadius: "var(--radius-sm)", border: `1px solid ${styles[tone].border}`, background: styles[tone].background, color: styles[tone].color }}>
      <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-1)" }}>{title}</div>
      <div>{detail}</div>
    </div>
  );
}

function Chip({ tone, children }) {
  const tones = {
    info: { background: "var(--color-status-info-bg)", color: "var(--color-status-info-text)", border: "var(--color-status-info-border)" },
    success: { background: "var(--color-status-success-bg)", color: "var(--color-status-success-text)", border: "var(--color-status-success-border)" },
    warning: { background: "var(--color-status-warning-bg)", color: "var(--color-status-warning-text)", border: "var(--color-status-warning-border)" },
  };
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "6px 10px", borderRadius: "var(--radius-pill)", border: `1px solid ${tones[tone].border}`, background: tones[tone].background, color: tones[tone].color, fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)" }}>{children}</span>;
}

function formatFieldValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function formatDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

const inputStyle = { width: "100%", minHeight: "44px", padding: "0 14px", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-base)", background: "var(--color-bg-surface)", color: "var(--color-text-strong)", outline: "none" };
const searchInputStyle = { width: "min(320px, 100%)", minHeight: "42px", padding: "0 14px", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-base)", background: "var(--color-bg-surface)" };
const checkRowStyle = { display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "10px 12px", border: "1px solid var(--color-border-soft)", borderRadius: "var(--radius-xs)" };
const dialogOverlayStyle = { position: "fixed", inset: 0, zIndex: 40, display: "grid", placeItems: "center", background: "var(--color-overlay-scrim)", backdropFilter: "blur(8px)" };
const dialogCardStyle = { width: "min(440px, calc(100vw - 32px))", padding: "var(--space-8)" };
