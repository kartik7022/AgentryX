import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Banner as NoticeBanner } from "../../components/feedback/Banner";
import { AppButton } from "../../components/primitives/AppButton";
import { Tooltip } from "../../components/primitives/Tooltip";
import { intentsApi } from "../../lib/intents";

const emptyForm = {
  intentId: "",
  languageCode: "multi",
  n8nOrchestrationUrl: "",
  autoProcessMinConf: "90",
  manualReviewMinConf: "80",
  rerouteEmail: "",
  multiIntentMode: "STRICT_SINGLE",
  allowMultiAuto: false,
  allowSubsetAuto: false,
};

export function IntentPoliciesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const presetIntentId = searchParams.get("intentId") || searchParams.get("intent_id") || "";
  const [intents, setIntents] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [selectedIntentId, setSelectedIntentId] = useState(presetIntentId);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [banner, setBanner] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editingKey, setEditingKey] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingPolicyKey, setDeletingPolicyKey] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [composerSearch, setComposerSearch] = useState("");
  const [expandedPolicyKeys, setExpandedPolicyKeys] = useState(() => new Set());

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

  useEffect(() => {
    setSelectedIntentId(presetIntentId);
  }, [presetIntentId]);

  useEffect(() => {
    if (!presetIntentId || intents.length === 0) return;
    const intent = intents.find((row) => String(row.intent_id) === String(presetIntentId));
    if (intent) {
      setFilterSearch(intent.display_name || intent.intent_code || "");
    }
  }, [intents, presetIntentId]);

  useEffect(() => {
    if (searchParams.get("new") !== "1" || loading || editorOpen) return;
    openAdd();
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("new");
    setSearchParams(nextParams, { replace: true });
  }, [editorOpen, loading, searchParams]);

  async function loadWorkspace() {
    setLoading(true);
    try {
      const [intentRows, policyRows] = await Promise.all([
        intentsApi.list().catch(() => []),
        intentsApi.allPolicies().catch(() => []),
      ]);
      setIntents(intentRows || []);
      setPolicies(policyRows || []);
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Failed to load intent policies",
        detail: error.message || "Unable to load policy data.",
      });
    } finally {
      setLoading(false);
    }
  }

  const filteredPolicies = useMemo(() => {
    if (!selectedIntentId) return policies;
    return policies.filter((policy) => String(policy.intent_id) === String(selectedIntentId));
  }, [policies, selectedIntentId]);

  const filterSuggestions = useMemo(() => {
    const query = filterSearch.trim().toLowerCase();
    if (!query) return { showAll: false, matches: [] };

    const showAll = "all".includes(query) || "all intents".includes(query) || "all policies".includes(query);
    const matches = intents.filter((intent) =>
      `${intent.intent_code || ""} ${intent.display_name || ""}`.toLowerCase().includes(query),
    );

    return { showAll, matches };
  }, [filterSearch, intents]);

  const intentsWithoutPolicyForLanguage = useMemo(() => {
    const language = form.languageCode || "multi";
    return intents.filter((intent) => {
      if (form.intentId && String(intent.intent_id) === String(form.intentId)) {
        return true;
      }
      return !policies.some(
        (policy) =>
          String(policy.intent_id) === String(intent.intent_id) &&
          String(policy.language_code || "multi") === String(language),
      );
    });
  }, [form.intentId, form.languageCode, intents, policies]);

  const filteredComposerIntents = useMemo(() => {
    const query = composerSearch.trim().toLowerCase();
    if (!query) return [];

    return intentsWithoutPolicyForLanguage.filter((intent) =>
      `${intent.intent_code || ""} ${intent.display_name || ""}`.toLowerCase().includes(query),
    );
  }, [composerSearch, intentsWithoutPolicyForLanguage]);

  function handleFilterChange(value) {
    setSelectedIntentId(value);
    if (value) {
      setSearchParams({ intentId: value });
    } else {
      setSearchParams({});
    }
  }

  function selectFilterIntent(intentId) {
    if (intentId === null) {
      handleFilterChange("");
      setFilterSearch("All Intents");
      setFilterDropdownOpen(false);
      return;
    }

    const intent = intents.find((row) => row.intent_id === intentId);
    if (!intent) return;

    handleFilterChange(String(intentId));
    setFilterSearch(intent.display_name || intent.intent_code || "");
    setFilterDropdownOpen(false);
  }

  function handleFilterSearchChange(event) {
    setFilterSearch(event.target.value);
    handleFilterChange("");
    setFilterDropdownOpen(Boolean(event.target.value.trim()));
  }

  function selectComposerIntent(intent) {
    setForm((current) => ({ ...current, intentId: String(intent.intent_id) }));
    setComposerSearch(intent.display_name || intent.intent_code || "");
  }

  function toggleExpandedPolicy(key) {
    setExpandedPolicyKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function openAdd() {
    setEditingKey(null);
    const selectedIntent = intents.find((intent) => String(intent.intent_id) === String(selectedIntentId || presetIntentId || ""));
    setForm({
      ...emptyForm,
      intentId: selectedIntentId || presetIntentId || "",
    });
    setComposerSearch(selectedIntent?.display_name || selectedIntent?.intent_code || "");
    setEditorOpen(true);
  }

  function openEdit(policy) {
    setEditingKey(`${policy.intent_id}:${policy.language_code}`);
    setForm({
      intentId: String(policy.intent_id),
      languageCode: policy.language_code || "multi",
      n8nOrchestrationUrl: policy.n8n_orchestration_url || "",
      autoProcessMinConf: String(policy.auto_process_min_conf ?? ""),
      manualReviewMinConf: String(policy.manual_review_min_conf ?? ""),
      rerouteEmail: policy.reroute_email || "",
      multiIntentMode: policy.multi_intent_mode || "STRICT_SINGLE",
      allowMultiAuto: Boolean(policy.allow_multi_auto),
      allowSubsetAuto: Boolean(policy.allow_subset_auto),
    });
    const intent = intents.find((row) => String(row.intent_id) === String(policy.intent_id));
    setComposerSearch(intent?.display_name || intent?.intent_code || "");
    setEditorOpen(true);
  }

  async function submitPolicy(event) {
    event.preventDefault();
    setBanner(null);

    if (!form.intentId) {
      setBanner({
        tone: "warning",
        title: "Intent required",
        detail: "Please select an intent before saving the policy.",
      });
      return;
    }

    const autoProcess = Number(form.autoProcessMinConf);
    const manualReview = Number(form.manualReviewMinConf);
    if (Number.isNaN(autoProcess) || Number.isNaN(manualReview)) {
      setBanner({
        tone: "warning",
        title: "Confidence values required",
        detail: "Please enter valid confidence thresholds.",
      });
      return;
    }

    const payload = {
      language_code: form.languageCode,
      n8n_orchestration_url: form.n8nOrchestrationUrl.trim() || null,
      auto_process_min_conf: autoProcess,
      manual_review_min_conf: manualReview,
      reroute_email: form.rerouteEmail.trim() || null,
      multi_intent_mode: form.multiIntentMode,
      allow_multi_auto: form.allowMultiAuto,
      allow_subset_auto: form.allowSubsetAuto,
    };

    if (
      !editingKey &&
      policies.some(
        (policy) =>
          String(policy.intent_id) === String(form.intentId) &&
          String(policy.language_code || "multi") === String(form.languageCode),
      )
    ) {
      setBanner({
        tone: "warning",
        title: "Duplicate policy",
        detail: "A policy already exists for this intent and language.",
      });
      return;
    }

    setSaving(true);
    try {
      if (editingKey) {
        await intentsApi.updatePolicy(form.intentId, form.languageCode, payload);
      } else {
        await intentsApi.createPolicy(form.intentId, payload);
      }
      setEditorOpen(false);
      setEditingKey(null);
      setForm(emptyForm);
      setBanner({
        tone: "success",
        title: editingKey ? "Policy updated" : "Policy created",
        detail: "The intent policy has been saved successfully.",
      });
      await loadWorkspace();
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Save failed",
        detail: error.message || "Unable to save the policy.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeletingPolicyKey(policyKey(deleteTarget));
    try {
      await intentsApi.deletePolicy(deleteTarget.intent_id, deleteTarget.language_code);
      setDeleteTarget(null);
      setBanner({
        tone: "success",
        title: "Policy deleted",
        detail: "The intent policy has been deleted.",
      });
      await loadWorkspace();
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Delete failed",
        detail: error.message || "Unable to delete the policy.",
      });
    } finally {
      setDeletingPolicyKey("");
    }
  }

  return (
    <section>
      <PageHeader
        label="Intent Policies"
        title="Intent Policies"
        description="Filter policies by intent, create language-specific processing behavior, and manage policy thresholds."
        actions={<AppButton tooltip="Create a new intent policy" onClick={openAdd}>+ Add Policy</AppButton>}
      />

      {banner ? <NoticeBanner {...banner} /> : null}

      <div className="surface-card" style={{ padding: "var(--space-6)", marginBottom: "var(--space-6)" }}>
        <label style={{ display: "grid", gap: "var(--space-2)", maxWidth: "420px", position: "relative" }}>
          <span className="mono-label" style={{ color: "var(--color-text-muted)" }}>Filter by Intent</span>
          <input
            value={filterSearch}
            onChange={handleFilterSearchChange}
            onFocus={() => setFilterDropdownOpen(Boolean(filterSearch.trim()))}
            onBlur={() => window.setTimeout(() => setFilterDropdownOpen(false), 120)}
            placeholder="Type to search intents or type 'all' for all policies..."
            style={inputStyle}
          />
          {filterDropdownOpen ? (
            <SearchDropdown>
              {filterSuggestions.showAll ? (
                <SearchOption
                  title="All Intents"
                  detail="View policies for all intents"
                  tooltip="Show policies for all intents"
                  onClick={() => selectFilterIntent(null)}
                />
              ) : null}
              {filterSuggestions.matches.map((intent) => (
                <SearchOption
                  key={intent.intent_id}
                  title={intent.display_name || intent.intent_code}
                  detail={`Code: ${intent.intent_code}`}
                  tooltip={`Filter policies for ${intent.display_name || intent.intent_code}`}
                  onClick={() => selectFilterIntent(intent.intent_id)}
                />
              ))}
              {!filterSuggestions.showAll && filterSuggestions.matches.length === 0 ? (
                <div style={{ padding: "10px 12px", color: "var(--color-text-muted)", textAlign: "center" }}>
                  No matching intents found
                </div>
              ) : null}
            </SearchDropdown>
          ) : null}
        </label>
      </div>

      <div className="surface-card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "var(--space-5) var(--space-6)", borderBottom: "1px solid var(--color-border-soft)", display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontWeight: "var(--font-weight-semibold)" }}>Policy Directory</div>
          <div className="mono-label" style={{ color: "var(--color-text-soft)" }}>{filteredPolicies.length} policies</div>
        </div>
        {loading ? (
          <EmptyState text="Loading policies..." />
        ) : filteredPolicies.length === 0 ? (
          <EmptyState text="No policies found." />
        ) : (
          <div style={{ display: "grid" }}>
            {filteredPolicies.map((policy) => {
              const intent = intents.find((row) => String(row.intent_id) === String(policy.intent_id));
              const key = `${policy.intent_id}:${policy.language_code || "multi"}`;
              return (
                <div key={key}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleExpandedPolicy(key)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleExpandedPolicy(key);
                    }
                  }}
                  style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(140px, 0.25fr) minmax(220px, 0.6fr) auto", gap: "var(--space-4)", alignItems: "center", padding: "var(--space-5) var(--space-6)", borderTop: "1px solid var(--color-border-soft)", cursor: "pointer" }}
                >
                  <div>
                    <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-1)" }}>
                      {intent?.display_name || intent?.intent_code || `Intent ${policy.intent_id}`}
                    </div>
                    <div style={{ color: "var(--color-text-muted)" }}>{intent?.intent_code || "Unknown intent code"}</div>
                  </div>
                  <Chip tone="info">{policy.language_code || "multi"}</Chip>
                  <div style={{ color: "var(--color-text-muted)" }}>
                    Auto {policy.auto_process_min_conf}% - Manual {policy.manual_review_min_conf}% - {policy.multi_intent_mode}
                  </div>
                  <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <AppButton tooltip={`Edit ${intent?.display_name || "this policy"}`} size="sm" variant="secondary" onClick={(event) => { event.stopPropagation(); openEdit(policy); }}>
                      Edit
                    </AppButton>
                    <AppButton tooltip={`Delete ${intent?.display_name || "this policy"}`} size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); setDeleteTarget(policy); }}>
                      Delete
                    </AppButton>
                  </div>
                  </div>
                  {expandedPolicyKeys.has(key) ? <ExpandedPolicyDetails policy={policy} /> : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editorOpen ? (
        <FormPanel
          title={editingKey ? "Edit policy" : "Add policy"}
          subtitle="Policies control confidence thresholds, orchestration behavior, and multi-intent handling by language."
          onClose={() => setEditorOpen(false)}
        >
          <form onSubmit={submitPolicy} style={{ display: "grid", gap: "var(--space-4)" }}>
            <Field label="Intent">
              {editingKey ? (
                <input value={composerSearch} style={inputStyle} disabled />
              ) : (
                <div style={{ display: "grid", gap: "var(--space-2)" }}>
                  <input
                    value={composerSearch}
                    onChange={(event) => {
                      setComposerSearch(event.target.value);
                      setForm((current) => ({ ...current, intentId: "" }));
                    }}
                    placeholder="Type to search intents without policies..."
                    style={inputStyle}
                  />
                  <div style={{ display: "grid", gap: "2px", maxHeight: "220px", overflowY: "auto", padding: "var(--space-1)", borderRadius: "12px", border: "1px solid var(--color-border-soft)", background: "var(--color-bg-surface)" }}>
                    {filteredComposerIntents.map((intent) => (
                      <SearchOption
                        key={intent.intent_id}
                        title={intent.display_name || intent.intent_code}
                        detail={`Code: ${intent.intent_code}`}
                        tooltip={`Select ${intent.display_name || intent.intent_code}`}
                        onClick={() => selectComposerIntent(intent)}
                      />
                    ))}
                    {!composerSearch.trim() ? (
                      <div style={{ padding: "10px 12px", color: "var(--color-text-muted)", textAlign: "center" }}>
                        Start typing to search intents without policies.
                      </div>
                    ) : filteredComposerIntents.length === 0 ? (
                      <div style={{ padding: "10px 12px", color: "var(--color-text-muted)", textAlign: "center" }}>
                        No intents without policies found
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </Field>
            <Field label="Language Code">
              <select
                value={form.languageCode}
                onChange={(event) => {
                  setComposerSearch("");
                  setForm((current) => ({ ...current, languageCode: event.target.value, intentId: editingKey ? current.intentId : "" }));
                }}
                style={inputStyle}
                disabled={Boolean(editingKey)}
              >
                <option value="multi">Multi</option>
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
              </select>
            </Field>
            <Field label="N8N Orchestration URL">
              <input value={form.n8nOrchestrationUrl} onChange={(event) => setForm((current) => ({ ...current, n8nOrchestrationUrl: event.target.value }))} style={inputStyle} placeholder="https://n8n.example.com/webhook/..." />
            </Field>
            <Field label="Auto Process Min Confidence (%)">
              <input value={form.autoProcessMinConf} onChange={(event) => setForm((current) => ({ ...current, autoProcessMinConf: event.target.value }))} style={inputStyle} type="number" min="0" max="100" step="0.01" />
            </Field>
            <Field label="Manual Review Min Confidence (%)">
              <input value={form.manualReviewMinConf} onChange={(event) => setForm((current) => ({ ...current, manualReviewMinConf: event.target.value }))} style={inputStyle} type="number" min="0" max="100" step="0.01" />
            </Field>
            <Field label="Reroute Email">
              <input value={form.rerouteEmail} onChange={(event) => setForm((current) => ({ ...current, rerouteEmail: event.target.value }))} style={inputStyle} type="email" placeholder="example@domain.com" />
            </Field>
            <Field label="Multi-Intent Mode">
              <select value={form.multiIntentMode} onChange={(event) => setForm((current) => ({ ...current, multiIntentMode: event.target.value }))} style={inputStyle}>
                <option value="STRICT_SINGLE">Strict Single</option>
                <option value="AUTO_ALL">Auto All</option>
                <option value="AUTO_SUBSET">Auto Subset</option>
              </select>
            </Field>
            <ToggleRow label="Allow Multi Auto" checked={form.allowMultiAuto} onChange={(checked) => setForm((current) => ({ ...current, allowMultiAuto: checked }))} />
            <ToggleRow label="Allow Subset Auto" checked={form.allowSubsetAuto} onChange={(checked) => setForm((current) => ({ ...current, allowSubsetAuto: checked }))} />
            <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end", flexWrap: "wrap" }}>
              <AppButton tooltip="Cancel policy editing" type="button" variant="secondary" onClick={() => setEditorOpen(false)}>Cancel</AppButton>
              <AppButton tooltip="Save this intent policy" type="submit" disabled={saving}>{saving ? "Saving..." : "Save Policy"}</AppButton>
            </div>
          </form>
        </FormPanel>
      ) : null}

      {deleteTarget ? (
        <DeleteDialog
          title="Delete policy"
          description={`Delete the ${deleteTarget.language_code || "multi"} policy for this intent?`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
          deleting={deletingPolicyKey === policyKey(deleteTarget)}
        />
      ) : null}
    </section>
  );
}

function SearchDropdown({ children }) {
  return <div style={{ position: "absolute", zIndex: 30, top: "calc(100% + 6px)", left: 0, right: 0, display: "grid", gap: "2px", maxHeight: "260px", overflowY: "auto", padding: "var(--space-1)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-soft)", background: "var(--color-bg-surface)", boxShadow: "var(--shadow-lg)" }}>{children}</div>;
}
function SearchOption({ title, detail, tooltip, onClick }) {
  return (
    <Tooltip fullWidth content={tooltip}>
      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onClick} style={{ width: "100%", border: "none", borderRadius: "10px", background: "transparent", padding: "10px 12px", textAlign: "left", cursor: "pointer" }}>
        <div style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-strong)" }}>{title}</div>
        <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", marginTop: "2px" }}>{detail}</div>
      </button>
    </Tooltip>
  );
}
function ExpandedPolicyDetails({ policy }) {
  const fields = [
    ["Intent ID", policy.intent_id],
    ["Language Code", policy.language_code],
    ["Auto Process Min Confidence (%)", policy.auto_process_min_conf],
    ["Manual Review Min Confidence (%)", policy.manual_review_min_conf],
    ["Multi Intent Mode", policy.multi_intent_mode],
    ["Allow Multi Auto", policy.allow_multi_auto],
    ["Allow Subset Auto", policy.allow_subset_auto],
    ["N8N Orchestration URL", policy.n8n_orchestration_url],
    ["Reroute Email", policy.reroute_email],
  ];

  return (
    <div style={{ borderTop: "1px solid var(--color-border-soft)", background: "var(--color-bg-elevated)", padding: "var(--space-5) var(--space-6)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "var(--space-4)" }}>
        {fields.map(([label, value]) => (
          <div key={label}>
            <div className="mono-label" style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-1)" }}>{label}</div>
            <div style={{ color: "var(--color-text-strong)", fontWeight: "var(--font-weight-semibold)", wordBreak: "break-word" }}>{formatFieldValue(value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
function formatFieldValue(value) {
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
function PageHeader({ label, title, description, actions }) { return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-6)", marginBottom: "var(--space-6)", flexWrap: "wrap" }}><div><h1 style={{ margin: 0, color: "var(--color-text-strong)", fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", letterSpacing: "var(--tracking-tight)" }}>{title}</h1><p style={{ margin: "var(--space-3) 0 0", color: "var(--color-text-muted)", maxWidth: "72ch" }}>{description}</p></div>{actions}</div>; }
function Banner({ tone, title, detail }) { const styles = { success: { border: "var(--color-status-success-border)", background: "var(--color-status-success-bg)", color: "var(--color-status-success-text)" }, warning: { border: "var(--color-status-warning-border)", background: "var(--color-status-warning-bg)", color: "var(--color-status-warning-text)" }, error: { border: "var(--color-status-error-border)", background: "var(--color-status-error-bg)", color: "var(--color-status-error-text)" }, }; return <div style={{ marginBottom: "var(--space-6)", padding: "14px 16px", borderRadius: "var(--radius-sm)", border: `1px solid ${styles[tone].border}`, background: styles[tone].background, color: styles[tone].color }}><div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-1)" }}>{title}</div><div>{detail}</div></div>; }
function EmptyState({ text }) { return <div style={{ padding: "var(--space-8)", color: "var(--color-text-muted)" }}>{text}</div>; }
function FormPanel({ title, subtitle, children, onClose }) { return <aside className="surface-card" style={{ position: "fixed", top: "var(--space-8)", right: "var(--space-8)", bottom: "var(--space-8)", width: "min(460px, calc(100vw - 32px))", overflow: "auto", padding: "var(--space-6)", zIndex: 20, background: "linear-gradient(180deg, var(--color-bg-surface), var(--color-bg-elevated))" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-3)", marginBottom: "var(--space-5)" }}><div><div style={{ fontWeight: "var(--font-weight-bold)", fontSize: "var(--font-size-lg)", marginBottom: "var(--space-1)" }}>{title}</div><div style={{ color: "var(--color-text-muted)" }}>{subtitle}</div></div><AppButton tooltip="Close this panel" size="sm" variant="ghost" onClick={onClose}>Close</AppButton></div>{children}</aside>; }
function policyKey(policy) { return `${policy?.intent_id || ""}:${policy?.language_code || ""}`; }
function Field({ label, children }) { return <label style={{ display: "grid", gap: "var(--space-2)" }}><span className="mono-label" style={{ color: "var(--color-text-muted)" }}>{label}</span>{children}</label>; }
function ToggleRow({ label, checked, onChange }) { return <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4)" }}><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>; }
function DeleteDialog({ title, description, onCancel, onConfirm, deleting = false }) { return <div style={dialogOverlayStyle}><div className="surface-card" style={dialogCardStyle}><div style={{ fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", marginBottom: "var(--space-3)" }}>{title}</div><div style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-6)" }}>{description}</div><div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}><AppButton tooltip="Cancel this deletion" variant="secondary" onClick={onCancel} disabled={deleting}>Cancel</AppButton><AppButton tooltip="Confirm this deletion" onClick={onConfirm} loading={deleting}>{deleting ? "Deleting..." : "Delete"}</AppButton></div></div></div>; }
function Chip({ tone, children }) { const tones = { info: { background: "var(--color-status-info-bg)", color: "var(--color-status-info-text)", border: "var(--color-status-info-border)" } }; return <span style={{ display: "inline-flex", alignItems: "center", padding: "6px 10px", borderRadius: "var(--radius-pill)", border: `1px solid ${tones[tone].border}`, background: tones[tone].background, color: tones[tone].color, fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)" }}>{children}</span>; }

const inputStyle = { width: "100%", minHeight: "44px", padding: "0 14px", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-base)", background: "var(--color-bg-surface)", color: "var(--color-text-strong)", outline: "none" };
const dialogOverlayStyle = { position: "fixed", inset: 0, zIndex: 40, display: "grid", placeItems: "center", background: "var(--color-overlay-scrim)", backdropFilter: "blur(8px)" };
const dialogCardStyle = { width: "min(440px, calc(100vw - 32px))", padding: "var(--space-8)" };
