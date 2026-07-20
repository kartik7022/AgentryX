import { useEffect, useMemo, useState } from "react";
import { Banner as NoticeBanner } from "../../components/feedback/Banner";
import { AppButton } from "../../components/primitives/AppButton";
import { useAuth } from "../../providers/AuthProvider";
import { inboxesApi } from "../../lib/inboxes";

const providerOptions = [
  { value: "google", label: "Google Workspace" },
  { value: "microsoft365", label: "Microsoft 365" },
  { value: "imap", label: "IMAP" },
  { value: "exchange", label: "Exchange" },
];

const protocolOptions = ["imap", "pop3", "smtp"];

const initialForm = {
  inboxId: "",
  inboxName: "",
  providerType: "",
  emailAddress: "",
  password: "",
  pollingInterval: "5",
  serverHost: "",
  serverPort: "",
  protocol: "",
  useSsl: true,
  status: "active",
};

export function ConnectedInboxesPage() {
  const { user } = useAuth();
  const [inboxes, setInboxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(null);
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [connectionTested, setConnectionTested] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testingInboxId, setTestingInboxId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingInboxId, setDeletingInboxId] = useState("");
  const [expandedInboxIds, setExpandedInboxIds] = useState(() => new Set());

  useEffect(() => {
    load();
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
      const rows = await inboxesApi.list();
      setInboxes(rows || []);
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Failed to load inboxes",
        detail: error.message || "Unable to load connected inboxes.",
      });
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    return inboxes.filter((inbox) => {
      const matchesSearch =
        !search ||
        `${inbox.inbox_name} ${inbox.email_address || ""}`.toLowerCase().includes(search.toLowerCase());
      const matchesProvider = !providerFilter || inbox.provider_type === providerFilter;
      const matchesStatus = !statusFilter || inbox.status === statusFilter;
      return matchesSearch && matchesProvider && matchesStatus;
    });
  }, [inboxes, providerFilter, search, statusFilter]);

  const stats = useMemo(() => ({
    total: inboxes.length,
    active: inboxes.filter((inbox) => inbox.status === "active").length,
    inactive: inboxes.filter((inbox) => inbox.status === "inactive").length,
    providers: new Set(inboxes.map((inbox) => inbox.provider_type).filter(Boolean)).size,
  }), [inboxes]);

  function openAdd() {
    setForm(initialForm);
    setConnectionTested(false);
    setEditorOpen(true);
  }

  function openEdit(inbox) {
    setForm({
      inboxId: String(inbox.inbox_id),
      inboxName: inbox.inbox_name || "",
      providerType: inbox.provider_type || "",
      emailAddress: inbox.email_address || "",
      password: "",
      pollingInterval: String(inbox.polling_interval || 5),
      serverHost: inbox.server_host || "",
      serverPort: String(inbox.server_port || ""),
      protocol: inbox.protocol || "",
      useSsl: Boolean(inbox.use_ssl),
      status: inbox.status || "active",
    });
    setConnectionTested(false);
    setEditorOpen(true);
  }

  function validateInboxForm() {
    const required = [
      ["Inbox Name", form.inboxName],
      ["Provider Type", form.providerType],
      ["Email Address", form.emailAddress],
      ["Password", form.password],
      ["Host", form.serverHost],
      ["Port", form.serverPort],
      ["Protocol", form.protocol],
    ];
    const missing = required.find(([, value]) => !String(value || "").trim());

    if (missing) {
      setBanner({
        tone: "warning",
        title: "Required field missing",
        detail: `${missing[0]} is required.`,
      });
      return false;
    }

    const duplicate = inboxes.find(
      (inbox) =>
        inbox.email_address &&
        inbox.email_address.toLowerCase() === form.emailAddress.trim().toLowerCase() &&
        String(inbox.inbox_id) !== String(form.inboxId || ""),
    );

    if (duplicate) {
      setBanner({
        tone: "error",
        title: "Already Exists",
        detail: `An inbox with email '${form.emailAddress.trim()}' already exists.`,
      });
      return false;
    }

    return true;
  }

  function toggleExpandedInbox(inboxId) {
    setExpandedInboxIds((current) => {
      const next = new Set(current);
      if (next.has(inboxId)) {
        next.delete(inboxId);
      } else {
        next.add(inboxId);
      }
      return next;
    });
  }

  async function testConnection() {
    if (!validateInboxForm()) return;

    setTestingConnection(true);
    try {
      const payload = {
        inbox_id: form.inboxId ? Number(form.inboxId) : 0,
        provider_type: form.providerType,
        tenant_id: user?.tenantId,
        inbox_name: form.inboxName.trim(),
        connection_params: {
          username: form.emailAddress.trim(),
          password: form.password,
          host: form.serverHost.trim(),
          port: Number(form.serverPort) || 0,
          protocol: form.protocol,
          use_ssl: form.useSsl,
        },
      };
      const data = await inboxesApi.testConnection(payload);
      if (data.connection_status === "VERIFIED") {
        setConnectionTested(true);
        setBanner({
          tone: "success",
          title: "Connection OK",
          detail: data.message || "Connection successful.",
        });
      } else {
        setConnectionTested(false);
        setBanner({
          tone: "error",
          title: "Connection failed",
          detail: data.last_error_summary || "Check your inbox credentials.",
        });
      }
    } catch (error) {
      setConnectionTested(false);
      setBanner({
        tone: "error",
        title: "Connection test failed",
        detail: error.message || "Unable to test inbox connection.",
      });
    } finally {
      setTestingConnection(false);
    }
  }

  async function submitInbox(event) {
    event.preventDefault();
    if (!validateInboxForm()) return;

    if (!connectionTested) {
      setBanner({
        tone: "warning",
        title: "Test required",
        detail: "Please test the inbox connection before saving.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const credentialPayload = {
        inbox_id: form.inboxId ? Number(form.inboxId) : 0,
        inbox_name: form.inboxName.trim(),
        provider_type: form.providerType,
        tenant_id: user?.tenantId,
        connection_params: {
          username: form.emailAddress.trim(),
          password: form.password,
          host: form.serverHost.trim(),
          port: Number(form.serverPort) || null,
          protocol: form.protocol || null,
          use_ssl: form.useSsl,
        },
      };
      const vaultData = await inboxesApi.saveCredentials(credentialPayload);
      const payload = {
        inbox_name: form.inboxName.trim(),
        provider_type: form.providerType,
        email_address: form.emailAddress.trim() || null,
        polling_interval: Number(form.pollingInterval) || 5,
        use_ssl: form.useSsl,
        status: form.status,
        server_host: form.serverHost.trim() || null,
        server_port: Number(form.serverPort) || null,
        protocol: form.protocol || null,
        vault_path: vaultData.vault_secret_path,
      };

      if (form.inboxId) {
        await inboxesApi.update(form.inboxId, payload);
      } else {
        await inboxesApi.create(payload);
      }

      setEditorOpen(false);
      setBanner({
        tone: "success",
        title: form.inboxId ? "Inbox updated" : "Inbox created",
        detail: "Inbox credentials and metadata were saved successfully.",
      });
      await load();
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Save failed",
        detail: error.message || "Unable to save inbox.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function testById(inboxId) {
    setTestingInboxId(String(inboxId));
    try {
      const data = await inboxesApi.testById(inboxId);
      setBanner({
        tone: data.status === "success" ? "success" : data.status === "warning" ? "warning" : "error",
        title: data.status === "success" ? "Connection OK" : data.status === "warning" ? "Not Configured" : "Connection Failed",
        detail: data.message || "No message returned.",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Connection test failed",
        detail: error.message || "Unable to test this inbox.",
      });
    } finally {
      setTestingInboxId("");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeletingInboxId(String(deleteTarget.inbox_id));
    try {
      await inboxesApi.delete(deleteTarget.inbox_id);
      setDeleteTarget(null);
      setBanner({
        tone: "success",
        title: "Inbox deleted",
        detail: "Inbox deleted successfully.",
      });
      await load();
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Delete failed",
        detail: error.message || "Unable to delete inbox.",
      });
    } finally {
      setDeletingInboxId("");
    }
  }

  return (
    <section>
      <PageHeader
        label="Connected Inboxes"
        title="Connected Inboxes"
        description="Connect, validate, save, and monitor tenant inbox integrations."
        actions={<AppButton tooltip="Open the inbox composer" onClick={openAdd}>+ Add Inbox</AppButton>}
      />
      {banner ? <NoticeBanner {...banner} /> : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "var(--space-4)", marginBottom: "var(--space-6)" }}>
        <Metric label="Total" value={stats.total} />
        <Metric label="Active" value={stats.active} />
        <Metric label="Inactive" value={stats.inactive} />
        <Metric label="Providers" value={stats.providers} />
      </div>

      <div className="surface-card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "var(--space-5) var(--space-6)", borderBottom: "1px solid var(--color-border-soft)", display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search inboxes..." style={searchInputStyle} />
          <select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)} style={filterStyle}>
            <option value="">All providers</option>
            {providerOptions.map((provider) => <option key={provider.value} value={provider.value}>{provider.label}</option>)}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={filterStyle}>
            <option value="">All statuses</option>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
        </div>
        {loading ? (
          <EmptyState text="Loading inboxes..." />
        ) : filtered.length === 0 ? (
          <EmptyState text="No inboxes found." />
        ) : (
          <div style={{ display: "grid" }}>
            {filtered.map((inbox) => (
              <div key={inbox.inbox_id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleExpandedInbox(inbox.inbox_id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleExpandedInbox(inbox.inbox_id);
                    }
                  }}
                  style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(140px, 0.45fr) minmax(120px, 0.35fr) auto", gap: "var(--space-4)", alignItems: "center", padding: "var(--space-5) var(--space-6)", borderTop: "1px solid var(--color-border-soft)", cursor: "pointer" }}
                >
                  <div>
                    <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-1)" }}>{inbox.inbox_name}</div>
                    <div style={{ color: "var(--color-text-muted)" }}>{inbox.email_address || "No email set"}</div>
                  </div>
                  <Chip tone="info">{providerLabel(inbox.provider_type)}</Chip>
                  <Chip tone={inbox.status === "active" ? "success" : "warning"}>{inbox.status}</Chip>
                  <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <AppButton tooltip={`Test ${inbox.inbox_name}`} size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); testById(inbox.inbox_id); }} loading={testingInboxId === String(inbox.inbox_id)}>{testingInboxId === String(inbox.inbox_id) ? "Testing..." : "Test"}</AppButton>
                    <AppButton tooltip={`Edit ${inbox.inbox_name}`} size="sm" variant="secondary" onClick={(event) => { event.stopPropagation(); openEdit(inbox); }}>Edit</AppButton>
                    <AppButton tooltip={`Delete ${inbox.inbox_name}`} size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); setDeleteTarget(inbox); }}>Delete</AppButton>
                  </div>
                </div>
                {expandedInboxIds.has(inbox.inbox_id) ? <ExpandedInboxDetails inbox={inbox} /> : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {editorOpen ? (
        <FormPanel
          title={form.inboxId ? "Edit inbox" : "Add inbox"}
          subtitle="Test the connection first, then save credentials and inbox metadata."
          onClose={() => setEditorOpen(false)}
        >
          <form onSubmit={submitInbox} style={{ display: "grid", gap: "var(--space-4)" }}>
            <Field label="Inbox Name"><input value={form.inboxName} onChange={(event) => { setConnectionTested(false); setForm((current) => ({ ...current, inboxName: event.target.value })); }} style={inputStyle} /></Field>
            <Field label="Provider Type">
              <select value={form.providerType} onChange={(event) => { setConnectionTested(false); setForm((current) => ({ ...current, providerType: event.target.value })); }} style={inputStyle}>
                <option value="">Select provider...</option>
                {providerOptions.map((provider) => <option key={provider.value} value={provider.value}>{provider.label}</option>)}
              </select>
            </Field>
            <Field label="Email Address"><input value={form.emailAddress} onChange={(event) => { setConnectionTested(false); setForm((current) => ({ ...current, emailAddress: event.target.value })); }} style={inputStyle} /></Field>
            <Field label="Password"><input value={form.password} onChange={(event) => { setConnectionTested(false); setForm((current) => ({ ...current, password: event.target.value })); }} style={inputStyle} type="password" /></Field>
            <Field label="Server Host"><input value={form.serverHost} onChange={(event) => { setConnectionTested(false); setForm((current) => ({ ...current, serverHost: event.target.value })); }} style={inputStyle} /></Field>
            <Field label="Server Port"><input value={form.serverPort} onChange={(event) => { setConnectionTested(false); setForm((current) => ({ ...current, serverPort: event.target.value })); }} style={inputStyle} type="number" /></Field>
            <Field label="Protocol">
              <select value={form.protocol} onChange={(event) => { setConnectionTested(false); setForm((current) => ({ ...current, protocol: event.target.value })); }} style={inputStyle}>
                <option value="">Select protocol...</option>
                {protocolOptions.map((protocol) => <option key={protocol} value={protocol}>{protocol}</option>)}
              </select>
            </Field>
            <Field label="Polling Interval"><input value={form.pollingInterval} onChange={(event) => setForm((current) => ({ ...current, pollingInterval: event.target.value }))} style={inputStyle} type="number" /></Field>
            <ToggleRow label="Use SSL" checked={form.useSsl} onChange={(checked) => { setConnectionTested(false); setForm((current) => ({ ...current, useSsl: checked })); }} />
            <Field label="Status">
              <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} style={inputStyle}>
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </Field>
            <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "space-between", flexWrap: "wrap" }}>
              <AppButton tooltip="Test the current inbox connection" type="button" variant="ghost" onClick={testConnection} loading={testingConnection}>{testingConnection ? "Testing..." : "Test Connection"}</AppButton>
              <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
                <AppButton tooltip="Cancel and close this panel" type="button" variant="secondary" onClick={() => setEditorOpen(false)}>Cancel</AppButton>
                <AppButton tooltip="Save this inbox and its credentials" type="submit" disabled={submitting || !connectionTested}>{submitting ? "Saving..." : "Save Inbox"}</AppButton>
              </div>
            </div>
          </form>
        </FormPanel>
      ) : null}

      {deleteTarget ? (
        <DeleteDialog
          title="Delete inbox"
          description={`Are you sure you want to delete ${deleteTarget.inbox_name}?`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
          deleting={deletingInboxId === String(deleteTarget.inbox_id)}
        />
      ) : null}
    </section>
  );
}

function PageHeader({ label, title, description, actions }) {
  return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-6)", marginBottom: "var(--space-6)", flexWrap: "wrap" }}><div><h1 style={{ margin: 0, color: "var(--color-text-strong)", fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", letterSpacing: "var(--tracking-tight)" }}>{title}</h1><p style={{ margin: "var(--space-3) 0 0", color: "var(--color-text-muted)", maxWidth: "72ch" }}>{description}</p></div>{actions}</div>;
}
function Metric({ label, value }) { return <div className="surface-card" style={{ padding: "var(--space-5)", background: "var(--color-bg-elevated)" }}><div className="mono-label" style={{ color: "var(--color-text-soft)", marginBottom: "var(--space-2)" }}>{label}</div><div style={{ fontWeight: "var(--font-weight-semibold)" }}>{value}</div></div>; }
function EmptyState({ text }) { return <div style={{ padding: "var(--space-8)", color: "var(--color-text-muted)" }}>{text}</div>; }
function FormPanel({ title, subtitle, children, onClose }) { return <aside className="surface-card" style={{ position: "fixed", top: "var(--space-8)", right: "var(--space-8)", bottom: "var(--space-8)", width: "min(420px, calc(100vw - 32px))", overflow: "auto", padding: "var(--space-6)", zIndex: 20, background: "linear-gradient(180deg, var(--color-bg-surface), var(--color-bg-elevated))" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-3)", marginBottom: "var(--space-5)" }}><div><div style={{ fontWeight: "var(--font-weight-bold)", fontSize: "var(--font-size-lg)", marginBottom: "var(--space-1)" }}>{title}</div><div style={{ color: "var(--color-text-muted)" }}>{subtitle}</div></div><AppButton tooltip="Close this panel" size="sm" variant="ghost" onClick={onClose}>Close</AppButton></div>{children}</aside>; }
function Field({ label, children }) { return <label style={{ display: "grid", gap: "var(--space-2)" }}><span className="mono-label" style={{ color: "var(--color-text-muted)" }}>{label}</span>{children}</label>; }
function ToggleRow({ label, checked, onChange }) { return <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4)" }}><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>; }
function DeleteDialog({ title, description, onCancel, onConfirm, deleting = false }) { return <div style={dialogOverlayStyle}><div className="surface-card" style={dialogCardStyle}><div style={{ fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", marginBottom: "var(--space-3)" }}>{title}</div><div style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-6)" }}>{description}</div><div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}><AppButton tooltip="Cancel this deletion" variant="secondary" onClick={onCancel} disabled={deleting}>Cancel</AppButton><AppButton tooltip="Confirm this deletion" onClick={onConfirm} loading={deleting}>{deleting ? "Deleting..." : "Delete"}</AppButton></div></div></div>; }
function Chip({ tone, children }) { const tones = { info: { background: "var(--color-status-info-bg)", color: "var(--color-status-info-text)", border: "var(--color-status-info-border)" }, success: { background: "var(--color-status-success-bg)", color: "var(--color-status-success-text)", border: "var(--color-status-success-border)" }, warning: { background: "var(--color-status-warning-bg)", color: "var(--color-status-warning-text)", border: "var(--color-status-warning-border)" } }; return <span style={{ display: "inline-flex", alignItems: "center", padding: "6px 10px", borderRadius: "var(--radius-pill)", border: `1px solid ${tones[tone].border}`, background: tones[tone].background, color: tones[tone].color, fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)" }}>{children}</span>; }

function ExpandedInboxDetails({ inbox }) {
  const showServerFields = inbox.provider_type === "imap" || inbox.provider_type === "exchange";
  const fields = [
    ["Inbox ID", inbox.inbox_id],
    ["Inbox Name", inbox.inbox_name],
    ["Provider", providerLabel(inbox.provider_type)],
    ["Email Address", inbox.email_address || "Not set"],
    ["Vault Path", inbox.vault_path],
    ["Status", inbox.status],
    ["Polling Interval", `${inbox.polling_interval || 5} minutes`],
    ["SSL / TLS", inbox.use_ssl ? "Enabled" : "Disabled"],
    ...(showServerFields
      ? [
          ["Server Host", inbox.server_host || "Not set"],
          ["Server Port", inbox.server_port || "Not set"],
          ["Protocol", inbox.protocol ? inbox.protocol.toUpperCase() : "Not set"],
        ]
      : []),
    ["Created At", formatDate(inbox.created_at)],
    ["Updated At", formatDate(inbox.updated_at)],
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

function providerLabel(value) {
  return providerOptions.find((provider) => provider.value === value)?.label || value || "-";
}

function formatFieldValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function formatDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return value;
  }
}
const inputStyle = { width: "100%", minHeight: "44px", padding: "0 14px", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-base)", background: "var(--color-bg-surface)", color: "var(--color-text-strong)", outline: "none" };
const searchInputStyle = { width: "min(260px, 100%)", minHeight: "42px", padding: "0 14px", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-base)", background: "var(--color-bg-surface)" };
const filterStyle = { minHeight: "42px", padding: "0 14px", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-base)", background: "var(--color-bg-surface)" };
const dialogOverlayStyle = { position: "fixed", inset: 0, zIndex: 40, display: "grid", placeItems: "center", background: "var(--color-overlay-scrim)", backdropFilter: "blur(8px)" };
const dialogCardStyle = { width: "min(440px, calc(100vw - 32px))", padding: "var(--space-8)" };
