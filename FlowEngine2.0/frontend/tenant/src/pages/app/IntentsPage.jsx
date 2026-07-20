import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Banner as NoticeBanner } from "../../components/feedback/Banner";
import { AppButton } from "../../components/primitives/AppButton";
import { Tooltip } from "../../components/primitives/Tooltip";
import { intentsApi } from "../../lib/intents";
import { rulesApi } from "../../lib/rules";

const emptyForm = {
  intentId: "",
  intentCode: "",
  displayName: "",
  description: "",
  category: "",
  isActive: true,
};

export function IntentsPage() {
  const navigate = useNavigate();
  const [intents, setIntents] = useState([]);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIntentFilter, setSelectedIntentFilter] = useState(null);
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const [expandedIntentIds, setExpandedIntentIds] = useState(() => new Set());
  const [banner, setBanner] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingIntentId, setDeletingIntentId] = useState("");
  const [detailsTarget, setDetailsTarget] = useState(null);
  const [detailsPolicy, setDetailsPolicy] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    loadWorkspace();
  }, []);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        loadWorkspace().catch(() => null);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  async function loadWorkspace() {
    setLoading(true);
    try {
      const [intentRows, ruleRows] = await Promise.all([
        intentsApi.list().catch(() => []),
        rulesApi.list().catch(() => []),
      ]);
      setIntents(intentRows || []);
      setRules(ruleRows || []);
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Failed to load intents",
        detail: error.message || "Unable to load intents.",
      });
    } finally {
      setLoading(false);
    }
  }

  const filteredIntents = useMemo(() => {
    if (selectedIntentFilter !== null && selectedIntentFilter !== undefined) {
      return intents.filter((intent) => intent.intent_id === selectedIntentFilter);
    }

    const query = search.trim().toLowerCase();
    if (!query || query === "all" || query === "all intents") {
      return intents;
    }
    return intents.filter((intent) =>
      `${intent.intent_code || ""} ${intent.display_name || ""} ${intent.description || ""} ${intent.category || ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [intents, search, selectedIntentFilter]);

  const searchSuggestions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return { showAll: false, matches: [] };

    const showAll = "all".includes(query) || "all intents".includes(query);
    const matches = intents.filter((intent) =>
      `${intent.intent_code || ""} ${intent.display_name || ""}`
        .toLowerCase()
        .includes(query),
    );

    return { showAll, matches };
  }, [intents, search]);

  function selectSearchIntent(intentId) {
    if (intentId === null) {
      setSelectedIntentFilter(null);
      setSearch("All Intents");
      setSearchDropdownOpen(false);
      return;
    }

    const intent = intents.find((row) => row.intent_id === intentId);
    if (!intent) return;

    setSelectedIntentFilter(intentId);
    setSearch(intent.display_name || intent.intent_code || "");
    setSearchDropdownOpen(false);
  }

  function handleSearchChange(event) {
    setSearch(event.target.value);
    setSelectedIntentFilter(null);
    setSearchDropdownOpen(Boolean(event.target.value.trim()));
  }

  function toggleExpandedIntent(intentId) {
    setExpandedIntentIds((current) => {
      const next = new Set(current);
      if (next.has(intentId)) {
        next.delete(intentId);
      } else {
        next.add(intentId);
      }
      return next;
    });
  }

  async function showDetails(intent) {
    setDetailsTarget(intent);
    setDetailsPolicy(null);
    setDetailsLoading(true);

    try {
      const policy = await intentsApi.getPolicy(intent.intent_id, "multi");
      setDetailsPolicy(policy);
    } catch {
      setDetailsPolicy(null);
    } finally {
      setDetailsLoading(false);
    }
  }

  function openAdd() {
    setForm(emptyForm);
    setEditorOpen(true);
  }

  function openEdit(intent) {
    setForm({
      intentId: String(intent.intent_id),
      intentCode: intent.intent_code || "",
      displayName: intent.display_name || "",
      description: intent.description || "",
      category: intent.category || "",
      isActive: Boolean(intent.is_active),
    });
    setEditorOpen(true);
  }

  async function submitIntent(event) {
    event.preventDefault();
    setBanner(null);

    const payload = {
      intent_code: form.intentCode.trim(),
      display_name: form.displayName.trim(),
      description: form.description.trim() || null,
      category: form.category.trim() || null,
      is_active: form.isActive,
    };

    if (!payload.intent_code || !payload.display_name) {
      setBanner({
        tone: "warning",
        title: "Required fields missing",
        detail: "Intent code and display name are required.",
      });
      return;
    }

    const duplicate = intents.find(
      (intent) =>
        intent.intent_code?.toLowerCase() === payload.intent_code.toLowerCase() &&
        intent.intent_id !== Number(form.intentId || 0),
    );
    if (duplicate) {
      setBanner({
        tone: "warning",
        title: "Duplicate intent code",
        detail: `Intent code "${payload.intent_code}" is already in use.`,
      });
      return;
    }

    setSaving(true);
    try {
      if (form.intentId) {
        await intentsApi.update(form.intentId, payload);
      } else {
        await intentsApi.create(payload);
      }
      setEditorOpen(false);
      setForm(emptyForm);
      setBanner({
        tone: "success",
        title: form.intentId ? "Intent updated" : "Intent created",
        detail: "The intent has been saved successfully.",
      });
      await loadWorkspace();
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Save failed",
        detail: error.message || "Unable to save the intent.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeletingIntentId(String(deleteTarget.intent_id));
    try {
      await intentsApi.delete(deleteTarget.intent_id);
      setDeleteTarget(null);
      setBanner({
        tone: "success",
        title: "Intent deleted",
        detail: `${deleteTarget.display_name || deleteTarget.intent_code} has been deleted.`,
      });
      await loadWorkspace();
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Delete failed",
        detail: error.message || "Unable to delete the intent.",
      });
    } finally {
      setDeletingIntentId("");
    }
  }

  return (
    <section>
      <PageHeader
        label="Intents"
        title="Intents"
        description="Create, edit, search, and remove intent definitions."
        actions={
          <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
            <AppButton
              tooltip="Open intent policy management"
              variant="secondary"
              onClick={() => navigate("/app/intent-policies")}
            >
              Policies
            </AppButton>
            <AppButton tooltip="Create a new intent" onClick={openAdd}>
              + Add Intent
            </AppButton>
          </div>
        }
      />

      {banner ? <NoticeBanner {...banner} /> : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--space-4)", marginBottom: "var(--space-6)" }}>
        <Metric label="Intents" value={String(intents.length)} />
        <Metric label="Active" value={String(intents.filter((intent) => intent.is_active).length)} />
        <Metric label="Validation Rules" value={String(rules.length)} />
      </div>

      <div className="surface-card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "var(--space-5) var(--space-6)", borderBottom: "1px solid var(--color-border-soft)", display: "flex", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontWeight: "var(--font-weight-semibold)" }}>Intent Directory</div>
          <div style={{ position: "relative", width: "min(360px, 100%)" }}>
            <input
              value={search}
              onChange={handleSearchChange}
              onFocus={() => setSearchDropdownOpen(Boolean(search.trim()))}
              onBlur={() => window.setTimeout(() => setSearchDropdownOpen(false), 120)}
              placeholder="Type to search intents or type 'all' for all intents..."
              style={searchInputStyle}
            />
            {searchDropdownOpen ? (
              <SearchDropdown>
                {searchSuggestions.showAll ? (
                  <SearchOption
                    title="All Intents"
                    detail="View all intents"
                    tooltip="Show all intents"
                    onClick={() => selectSearchIntent(null)}
                  />
                ) : null}
                {searchSuggestions.matches.map((intent) => (
                  <SearchOption
                    key={intent.intent_id}
                    title={intent.display_name || intent.intent_code}
                    detail={`Code: ${intent.intent_code}`}
                    tooltip={`Filter to ${intent.display_name || intent.intent_code}`}
                    onClick={() => selectSearchIntent(intent.intent_id)}
                  />
                ))}
                {!searchSuggestions.showAll && searchSuggestions.matches.length === 0 ? (
                  <div style={{ padding: "20px", textAlign: "center", color: "var(--color-text-muted)" }}>
                    No matching intents found
                  </div>
                ) : null}
              </SearchDropdown>
            ) : null}
          </div>
        </div>

        {loading ? (
          <EmptyState text="Loading intents..." />
        ) : filteredIntents.length === 0 ? (
          <EmptyState text="No intents found." />
        ) : (
          <div style={{ display: "grid" }}>
            {filteredIntents.map((intent) => {
              const ruleCount = rules.filter((rule) => String(rule.intent_id) === String(intent.intent_id)).length;
              return (
                <div key={intent.intent_id}>
                  <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleExpandedIntent(intent.intent_id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleExpandedIntent(intent.intent_id);
                    }
                  }}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1.4fr) minmax(180px, 0.45fr) minmax(120px, 0.3fr) auto",
                    gap: "var(--space-4)",
                    alignItems: "center",
                    padding: "var(--space-5) var(--space-6)",
                    borderTop: "1px solid var(--color-border-soft)",
                    cursor: "pointer",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-1)" }}>
                      {intent.display_name || intent.intent_code}
                    </div>
                    <div style={{ color: "var(--color-text-muted)" }}>
                      {intent.intent_code}
                      {intent.category ? ` - ${intent.category}` : ""}
                    </div>
                    {intent.description ? (
                      <div style={{ color: "var(--color-text-soft)", marginTop: "var(--space-2)" }}>{intent.description}</div>
                    ) : null}
                  </div>
                  <div style={{ color: "var(--color-text-muted)" }}>{ruleCount} linked rules</div>
                  <Chip tone={intent.is_active ? "success" : "warning"}>
                    {intent.is_active ? "active" : "inactive"}
                  </Chip>
                  <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <AppButton
                      tooltip={`View details for ${intent.display_name || intent.intent_code}`}
                      size="sm"
                      variant="ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        showDetails(intent);
                      }}
                    >
                      Details
                    </AppButton>
                    <AppButton
                      tooltip={`Open policies for ${intent.display_name || intent.intent_code}`}
                      size="sm"
                      variant="ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        navigate(`/app/intent-policies?intentId=${intent.intent_id}`);
                      }}
                    >
                      Policies
                    </AppButton>
                    <AppButton
                      tooltip={`Open rules for ${intent.display_name || intent.intent_code}`}
                      size="sm"
                      variant="ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        navigate(`/app/rules?intentId=${intent.intent_id}`);
                      }}
                    >
                      Rules
                    </AppButton>
                    <AppButton tooltip={`Edit ${intent.display_name || intent.intent_code}`} size="sm" variant="secondary" onClick={(event) => { event.stopPropagation(); openEdit(intent); }}>
                      Edit
                    </AppButton>
                    <AppButton tooltip={`Delete ${intent.display_name || intent.intent_code}`} size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); setDeleteTarget(intent); }}>
                      Delete
                    </AppButton>
                  </div>
                  </div>
                  {expandedIntentIds.has(intent.intent_id) ? (
                    <ExpandedDetails
                      fields={[
                        ["Intent ID", intent.intent_id],
                        ["Intent Code", intent.intent_code],
                        ["Display Name", intent.display_name],
                        ["Description", intent.description],
                        ["Category", intent.category],
                        ["Is Active", intent.is_active],
                      ]}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editorOpen ? (
        <FormPanel
          title={form.intentId ? "Edit intent" : "Add intent"}
          subtitle="Intent definitions drive policy and validation workflows."
          onClose={() => setEditorOpen(false)}
        >
          <form onSubmit={submitIntent} style={{ display: "grid", gap: "var(--space-4)" }}>
            <Field label="Intent Code">
              <input
                value={form.intentCode}
                onChange={(event) => setForm((current) => ({ ...current, intentCode: event.target.value }))}
                style={inputStyle}
                placeholder="payment_request"
              />
            </Field>
            <Field label="Display Name">
              <input
                value={form.displayName}
                onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
                style={inputStyle}
                placeholder="Payment Request"
              />
            </Field>
            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                style={textareaStyle}
                placeholder="Describe the purpose of this intent..."
              />
            </Field>
            <Field label="Category">
              <input
                value={form.category}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                style={inputStyle}
                placeholder="Financial"
              />
            </Field>
            <ToggleRow
              label="Active"
              checked={form.isActive}
              onChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))}
            />
            <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end", flexWrap: "wrap" }}>
              <AppButton tooltip="Cancel intent editing" type="button" variant="secondary" onClick={() => setEditorOpen(false)}>
                Cancel
              </AppButton>
              <AppButton tooltip="Save this intent" type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Intent"}
              </AppButton>
            </div>
          </form>
        </FormPanel>
      ) : null}

      {deleteTarget ? (
        <DeleteDialog
          title="Delete intent"
          description={`Are you sure you want to delete ${deleteTarget.display_name || deleteTarget.intent_code}?`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
          deleting={deletingIntentId === String(deleteTarget.intent_id)}
        />
      ) : null}

      {detailsTarget ? (
        <IntentDetailsDialog
          intent={detailsTarget}
          policy={detailsPolicy}
          loading={detailsLoading}
          onClose={() => {
            setDetailsTarget(null);
            setDetailsPolicy(null);
          }}
          onPolicyAction={() => navigate(`/app/intent-policies?intentId=${detailsTarget.intent_id}&new=1`)}
          onRuleAction={() => navigate(`/app/rules?intentId=${detailsTarget.intent_id}&new=1`)}
        />
      ) : null}
    </section>
  );
}

function SearchDropdown({ children }) {
  return (
    <div style={{
      position: "absolute",
      zIndex: 30,
      top: "calc(100% + 6px)",
      left: 0,
      right: 0,
      display: "grid",
      gap: "2px",
      maxHeight: "260px",
      overflowY: "auto",
      padding: "var(--space-1)",
      borderRadius: "var(--radius-sm)",
      border: "1px solid var(--color-border-soft)",
      background: "var(--color-bg-surface)",
      boxShadow: "var(--shadow-lg)",
    }}>
      {children}
    </div>
  );
}

function SearchOption({ title, detail, tooltip, onClick }) {
  return (
    <Tooltip fullWidth content={tooltip}>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
        style={{
          width: "100%",
          border: "none",
          borderRadius: "10px",
          background: "transparent",
          padding: "10px 12px",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <div style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-strong)" }}>{title}</div>
        <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", marginTop: "2px" }}>{detail}</div>
      </button>
    </Tooltip>
  );
}

function ExpandedDetails({ fields }) {
  return (
    <div style={{ borderTop: "1px solid var(--color-border-soft)", background: "var(--color-bg-elevated)", padding: "var(--space-5) var(--space-6)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--space-4)" }}>
        {fields.map(([label, value]) => (
          <div key={label}>
            <div className="mono-label" style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-1)" }}>{label}</div>
            <div style={{ color: "var(--color-text-strong)", fontWeight: "var(--font-weight-semibold)", wordBreak: "break-word" }}>
              {formatFieldValue(value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function IntentDetailsDialog({ intent, policy, loading, onClose, onPolicyAction, onRuleAction }) {
  const fields = [
    ["Intent Code", intent.intent_code],
    ["Display Name", intent.display_name],
    ["Category", intent.category],
    ["Status", intent.is_active ? "Active" : "Inactive"],
  ];
  if (intent.description) fields.push(["Description", intent.description]);

  return (
    <div style={dialogOverlayStyle}>
      <div className="surface-card" style={{ width: "min(560px, calc(100vw - 32px))", padding: "var(--space-7)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", alignItems: "flex-start", marginBottom: "var(--space-5)" }}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", marginBottom: "var(--space-1)" }}>Intent Details</div>
            <div style={{ color: "var(--color-text-muted)" }}>
              {loading ? "Checking intent policy..." : policy ? "Intent policy found." : "No intent policy found."}
            </div>
          </div>
          <AppButton tooltip="Close intent details" size="sm" variant="ghost" onClick={onClose}>Close</AppButton>
        </div>
        <div style={{ display: "grid", gap: "var(--space-3)", marginBottom: "var(--space-6)" }}>
          {fields.map(([label, value]) => (
            <div key={label}>
              <div className="mono-label" style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-1)" }}>{label}</div>
              <div style={{ padding: "10px 12px", borderRadius: "var(--radius-xs)", background: "var(--color-bg-elevated)", fontWeight: "var(--font-weight-semibold)" }}>
                {formatFieldValue(value)}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end", flexWrap: "wrap" }}>
          <AppButton tooltip="Close intent details" variant="secondary" onClick={onClose}>Close</AppButton>
          <AppButton tooltip={policy ? "Edit intent policy" : "Add intent policy"} variant="secondary" onClick={onPolicyAction}>
            {policy ? "Edit Intent Policy" : "Add Intent Policy"}
          </AppButton>
          <AppButton tooltip="Add a validation rule for this intent" onClick={onRuleAction}>Add Validation Rule</AppButton>
        </div>
      </div>
    </div>
  );
}

function formatFieldValue(value) {
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function PageHeader({ label, title, description, actions }) {
  return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-6)", marginBottom: "var(--space-6)", flexWrap: "wrap" }}><div><h1 style={{ margin: 0, color: "var(--color-text-strong)", fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", letterSpacing: "var(--tracking-tight)" }}>{title}</h1><p style={{ margin: "var(--space-3) 0 0", color: "var(--color-text-muted)", maxWidth: "72ch" }}>{description}</p></div>{actions}</div>;
}
function Metric({ label, value }) { return <div className="surface-card" style={{ padding: "var(--space-5)", background: "var(--color-bg-elevated)" }}><div className="mono-label" style={{ color: "var(--color-text-soft)", marginBottom: "var(--space-2)" }}>{label}</div><div style={{ fontWeight: "var(--font-weight-semibold)" }}>{value}</div></div>; }
function Banner({ tone, title, detail }) { const styles = { success: { border: "var(--color-status-success-border)", background: "var(--color-status-success-bg)", color: "var(--color-status-success-text)" }, warning: { border: "var(--color-status-warning-border)", background: "var(--color-status-warning-bg)", color: "var(--color-status-warning-text)" }, error: { border: "var(--color-status-error-border)", background: "var(--color-status-error-bg)", color: "var(--color-status-error-text)" }, }; return <div style={{ marginBottom: "var(--space-6)", padding: "14px 16px", borderRadius: "var(--radius-sm)", border: `1px solid ${styles[tone].border}`, background: styles[tone].background, color: styles[tone].color }}><div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-1)" }}>{title}</div><div>{detail}</div></div>; }
function EmptyState({ text }) { return <div style={{ padding: "var(--space-8)", color: "var(--color-text-muted)" }}>{text}</div>; }
function FormPanel({ title, subtitle, children, onClose }) { return <aside className="surface-card" style={{ position: "fixed", top: "var(--space-8)", right: "var(--space-8)", bottom: "var(--space-8)", width: "min(460px, calc(100vw - 32px))", overflow: "auto", padding: "var(--space-6)", zIndex: 20, background: "linear-gradient(180deg, var(--color-bg-surface), var(--color-bg-elevated))" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-3)", marginBottom: "var(--space-5)" }}><div><div style={{ fontWeight: "var(--font-weight-bold)", fontSize: "var(--font-size-lg)", marginBottom: "var(--space-1)" }}>{title}</div><div style={{ color: "var(--color-text-muted)" }}>{subtitle}</div></div><AppButton tooltip="Close this panel" size="sm" variant="ghost" onClick={onClose}>Close</AppButton></div>{children}</aside>; }
function Field({ label, children }) { return <label style={{ display: "grid", gap: "var(--space-2)" }}><span className="mono-label" style={{ color: "var(--color-text-muted)" }}>{label}</span>{children}</label>; }
function ToggleRow({ label, checked, onChange }) { return <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4)" }}><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>; }
function DeleteDialog({ title, description, onCancel, onConfirm, deleting = false }) { return <div style={dialogOverlayStyle}><div className="surface-card" style={dialogCardStyle}><div style={{ fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", marginBottom: "var(--space-3)" }}>{title}</div><div style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-6)" }}>{description}</div><div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}><AppButton tooltip="Cancel this deletion" variant="secondary" onClick={onCancel} disabled={deleting}>Cancel</AppButton><AppButton tooltip="Confirm this deletion" onClick={onConfirm} loading={deleting}>{deleting ? "Deleting..." : "Delete"}</AppButton></div></div></div>; }
function Chip({ tone, children }) { const tones = { success: { background: "var(--color-status-success-bg)", color: "var(--color-status-success-text)", border: "var(--color-status-success-border)" }, warning: { background: "var(--color-status-warning-bg)", color: "var(--color-status-warning-text)", border: "var(--color-status-warning-border)" } }; return <span style={{ display: "inline-flex", alignItems: "center", padding: "6px 10px", borderRadius: "var(--radius-pill)", border: `1px solid ${tones[tone].border}`, background: tones[tone].background, color: tones[tone].color, fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)" }}>{children}</span>; }

const searchInputStyle = { width: "100%", minHeight: "42px", padding: "0 14px", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-base)", background: "var(--color-bg-surface)" };
const inputStyle = { width: "100%", minHeight: "44px", padding: "0 14px", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-base)", background: "var(--color-bg-surface)", color: "var(--color-text-strong)", outline: "none" };
const textareaStyle = { ...inputStyle, minHeight: "120px", padding: "12px 14px", resize: "vertical" };
const dialogOverlayStyle = { position: "fixed", inset: 0, zIndex: 40, display: "grid", placeItems: "center", background: "var(--color-overlay-scrim)", backdropFilter: "blur(8px)" };
const dialogCardStyle = { width: "min(440px, calc(100vw - 32px))", padding: "var(--space-8)" };
