import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Banner as NoticeBanner } from "../../components/feedback/Banner";
import { AppButton } from "../../components/primitives/AppButton";
import { Tooltip } from "../../components/primitives/Tooltip";
import { fetchDatasources } from "../../lib/datasources";
import { intentsApi } from "../../lib/intents";
import { rulesApi } from "../../lib/rules";

const emptyForm = {
  ruleId: "",
  intentId: "",
  ruleCode: "",
  ruleName: "",
  ruleDescription: "",
  datasourceId: "",
  languageCode: "multi",
  executionOrder: "1",
  severity: "CRITICAL",
  isActive: true,
};

export function RulesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const presetIntentId = searchParams.get("intentId") || searchParams.get("intent_id") || "";
  const [rules, setRules] = useState([]);
  const [intents, setIntents] = useState([]);
  const [datasources, setDatasources] = useState([]);
  const [selectedIntentId, setSelectedIntentId] = useState(presetIntentId);
  const [filterSearch, setFilterSearch] = useState("");
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [intentComposerSearch, setIntentComposerSearch] = useState("");
  const [datasourceComposerSearch, setDatasourceComposerSearch] = useState("");
  const [expandedRuleIds, setExpandedRuleIds] = useState(() => new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [banner, setBanner] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingRuleId, setDeletingRuleId] = useState("");

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
    openAdd().catch(() => null);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("new");
    setSearchParams(nextParams, { replace: true });
  }, [editorOpen, loading, searchParams]);

  async function loadWorkspace() {
    setLoading(true);
    try {
      const [ruleRows, intentRows, datasourceRows] = await Promise.all([
        rulesApi.list().catch(() => []),
        intentsApi.list().catch(() => []),
        fetchDatasources().catch(() => []),
      ]);
      setRules(ruleRows || []);
      setIntents(intentRows || []);
      setDatasources((datasourceRows || []).filter((datasource) => datasource.is_active));
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Failed to load validation rules",
        detail: error.message || "Unable to load validation rule data.",
      });
    } finally {
      setLoading(false);
    }
  }

  const filteredRules = useMemo(() => {
    return rules.filter((rule) => {
      const matchesIntent = !selectedIntentId || String(rule.intent_id) === String(selectedIntentId);
      const matchesSearch =
        !search.trim() ||
        `${rule.rule_code || ""} ${rule.rule_name || ""} ${rule.rule_description || ""}`
          .toLowerCase()
          .includes(search.trim().toLowerCase());
      return matchesIntent && matchesSearch;
    });
  }, [rules, search, selectedIntentId]);

  const filterSuggestions = useMemo(() => {
    const query = filterSearch.trim().toLowerCase();
    if (!query) return { showAll: false, matches: [] };

    const showAll = "all".includes(query) || "all intents".includes(query);
    const matches = intents.filter((intent) =>
      `${intent.intent_code || ""} ${intent.display_name || ""}`.toLowerCase().includes(query),
    );

    return { showAll, matches };
  }, [filterSearch, intents]);

  const filteredComposerIntents = useMemo(() => {
    const query = intentComposerSearch.trim().toLowerCase();
    if (!query) return [];
    return intents.filter((intent) =>
      `${intent.intent_code || ""} ${intent.display_name || ""}`.toLowerCase().includes(query),
    );
  }, [intentComposerSearch, intents]);

  const filteredComposerDatasources = useMemo(() => {
    const query = datasourceComposerSearch.trim().toLowerCase();
    if (!query) return [];
    return datasources.filter((datasource) =>
      `${datasource.name || ""} ${datasource.datasource_type || ""}`.toLowerCase().includes(query),
    );
  }, [datasourceComposerSearch, datasources]);

  function selectFilterIntent(intentId) {
    if (intentId === null) {
      handleIntentFilterChange("");
      setFilterSearch("All Intents");
      setFilterDropdownOpen(false);
      return;
    }

    const intent = intents.find((row) => row.intent_id === intentId);
    if (!intent) return;

    handleIntentFilterChange(String(intentId));
    setFilterSearch(intent.display_name || intent.intent_code || "");
    setFilterDropdownOpen(false);
  }

  function handleFilterSearchChange(event) {
    setFilterSearch(event.target.value);
    handleIntentFilterChange("");
    setFilterDropdownOpen(Boolean(event.target.value.trim()));
  }

  async function selectComposerIntent(intent) {
    const nextOrder = await suggestNextOrder(intent.intent_id, form.languageCode);
    setForm((current) => ({
      ...current,
      intentId: String(intent.intent_id),
      executionOrder: current.ruleId ? current.executionOrder : nextOrder,
    }));
    setIntentComposerSearch(intent.display_name || intent.intent_code || "");
  }

  function selectComposerDatasource(datasource) {
    setForm((current) => ({ ...current, datasourceId: String(datasource.datasource_id) }));
    setDatasourceComposerSearch(datasource.name || "");
  }

  function toggleExpandedRule(ruleId) {
    setExpandedRuleIds((current) => {
      const next = new Set(current);
      if (next.has(ruleId)) {
        next.delete(ruleId);
      } else {
        next.add(ruleId);
      }
      return next;
    });
  }

  async function suggestNextOrder(intentId, languageCode = "multi") {
    if (!intentId) return "1";
    const data = await rulesApi.nextOrder(intentId, languageCode).catch(() => null);
    return String(data?.next_execution_order || 1);
  }

  async function openAdd() {
    const nextOrder = await suggestNextOrder(selectedIntentId || presetIntentId || "", "multi");
    const selectedIntent = intents.find((intent) => String(intent.intent_id) === String(selectedIntentId || presetIntentId || ""));
    setForm({
      ...emptyForm,
      intentId: selectedIntentId || presetIntentId || "",
      executionOrder: nextOrder,
    });
    setIntentComposerSearch(selectedIntent?.display_name || selectedIntent?.intent_code || "");
    setDatasourceComposerSearch("");
    setEditorOpen(true);
  }

  function openEdit(rule) {
    const intent = intents.find((entry) => String(entry.intent_id) === String(rule.intent_id));
    const datasource = datasources.find((entry) => String(entry.datasource_id) === String(rule.datasource_id));
    setForm({
      ruleId: String(rule.rule_id),
      intentId: String(rule.intent_id),
      ruleCode: rule.rule_code || "",
      ruleName: rule.rule_name || "",
      ruleDescription: rule.rule_description || "",
      datasourceId: String(rule.datasource_id || ""),
      languageCode: rule.language_code || "multi",
      executionOrder: String(rule.execution_order || 1),
      severity: rule.severity || "CRITICAL",
      isActive: Boolean(rule.is_active),
    });
    setIntentComposerSearch(intent?.display_name || intent?.intent_code || "");
    setDatasourceComposerSearch(datasource?.name || "");
    setEditorOpen(true);
  }

  async function handleIntentFilterChange(value) {
    setSelectedIntentId(value);
    if (value) {
      setSearchParams({ intentId: value });
    } else {
      setSearchParams({});
    }
  }

  async function submitRule(event) {
    event.preventDefault();
    setBanner(null);

    if (!form.intentId) {
      setBanner({
        tone: "warning",
        title: "Intent required",
        detail: "Please select a valid intent from the dropdown list before saving.",
      });
      return;
    }
    if (!form.datasourceId) {
      setBanner({
        tone: "warning",
        title: "Datasource required",
        detail: "Please select a valid datasource from the dropdown list before saving.",
      });
      return;
    }
    if (!form.ruleCode.trim()) {
      setBanner({ tone: "warning", title: "Rule code required", detail: "Please enter a rule code before saving." });
      return;
    }
    if (!form.ruleName.trim()) {
      setBanner({ tone: "warning", title: "Rule name required", detail: "Please enter a rule name before saving." });
      return;
    }
    if (!form.ruleDescription.trim()) {
      setBanner({ tone: "warning", title: "Rule description required", detail: "Please enter a rule description before saving." });
      return;
    }

    const duplicateRule = rules.find(
      (rule) =>
        String(rule.rule_code || "").toLowerCase() === form.ruleCode.trim().toLowerCase() &&
        String(rule.rule_id) !== String(form.ruleId || ""),
    );
    if (duplicateRule) {
      setBanner({
        tone: "error",
        title: "Duplicate rule code",
        detail: form.ruleId
          ? `Another validation rule already uses the code "${form.ruleCode.trim()}". Please use a unique rule code.`
          : `A validation rule with code "${form.ruleCode.trim()}" already exists. Please use a unique rule code.`,
      });
      return;
    }

    const payload = {
      intent_id: Number(form.intentId),
      rule_code: form.ruleCode.trim(),
      rule_name: form.ruleName.trim(),
      rule_description: form.ruleDescription.trim(),
      datasource_id: Number(form.datasourceId),
      language_code: form.languageCode,
      execution_order: Number(form.executionOrder) || 1,
      severity: form.severity,
      is_active: form.isActive,
    };

    setSaving(true);
    try {
      if (form.ruleId) {
        await rulesApi.update(form.ruleId, payload);
      } else {
        await rulesApi.create(payload);
      }
      setEditorOpen(false);
      setForm(emptyForm);
      setBanner({
        tone: "success",
        title: form.ruleId ? "Rule updated" : "Rule created",
        detail: "The validation rule has been saved successfully.",
      });
      await loadWorkspace();
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Save failed",
        detail: error.message || "Unable to save the rule.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeletingRuleId(String(deleteTarget.rule_id));
    try {
      await rulesApi.delete(deleteTarget.rule_id);
      setDeleteTarget(null);
      setBanner({
        tone: "success",
        title: "Rule deleted",
        detail: "The validation rule has been deleted.",
      });
      await loadWorkspace();
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Delete failed",
        detail: error.message || "Unable to delete the rule.",
      });
    } finally {
      setDeletingRuleId("");
    }
  }

  return (
    <section>
      <PageHeader
        label="Validation Rules"
        title="Validation Rules"
        description="Select an intent, create validation rules, and manage rule execution order and severity."
        actions={<AppButton tooltip="Create a new validation rule" onClick={openAdd}>+ Add Rule</AppButton>}
      />

      {banner ? <NoticeBanner {...banner} /> : null}

      <div className="surface-card" style={{ padding: "var(--space-6)", marginBottom: "var(--space-6)", display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "end" }}>
        <label style={{ display: "grid", gap: "var(--space-2)", minWidth: "260px", flex: "1 1 260px" }}>
          <span className="mono-label" style={{ color: "var(--color-text-muted)" }}>Intent</span>
          <div style={{ position: "relative" }}>
            <input
              value={filterSearch}
              onChange={handleFilterSearchChange}
              onFocus={() => setFilterDropdownOpen(Boolean(filterSearch.trim()))}
              onBlur={() => window.setTimeout(() => setFilterDropdownOpen(false), 120)}
              placeholder="Type to search intents or type 'all' for all intents..."
              style={inputStyle}
            />
            {filterDropdownOpen ? (
              <SearchDropdown>
                {filterSuggestions.showAll ? (
                  <SearchOption
                    title="All Intents"
                    detail="View validation rules for all intents"
                    tooltip="Show all validation rules"
                    onClick={() => selectFilterIntent(null)}
                  />
                ) : null}
                {filterSuggestions.matches.map((intent) => (
                  <SearchOption
                    key={intent.intent_id}
                    title={intent.display_name || intent.intent_code}
                    detail={`Code: ${intent.intent_code}`}
                    tooltip={`Filter rules for ${intent.display_name || intent.intent_code}`}
                    onClick={() => selectFilterIntent(intent.intent_id)}
                  />
                ))}
                {!filterSuggestions.showAll && filterSuggestions.matches.length === 0 ? (
                  <div style={{ padding: "20px", textAlign: "center", color: "var(--color-text-muted)" }}>
                    No matching intents found
                  </div>
                ) : null}
              </SearchDropdown>
            ) : null}
          </div>
        </label>
        <label style={{ display: "grid", gap: "var(--space-2)", minWidth: "260px", flex: "1 1 260px" }}>
          <span className="mono-label" style={{ color: "var(--color-text-muted)" }}>Search</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search validation rules..." style={inputStyle} />
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--space-4)", marginBottom: "var(--space-6)" }}>
        <Metric label="Rules" value={String(filteredRules.length)} />
        <Metric label="Intents" value={String(intents.length)} />
        <Metric label="Datasources" value={String(datasources.length)} />
      </div>

      <div className="surface-card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "var(--space-5) var(--space-6)", borderBottom: "1px solid var(--color-border-soft)", display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontWeight: "var(--font-weight-semibold)" }}>Rule Directory</div>
          <div className="mono-label" style={{ color: "var(--color-text-soft)" }}>{filteredRules.length} rules</div>
        </div>
        {loading ? (
          <EmptyState text="Loading rules..." />
        ) : filteredRules.length === 0 ? (
          <EmptyState text="No validation rules found." />
        ) : (
          <div style={{ display: "grid" }}>
            {filteredRules.map((rule) => {
              const intent = intents.find((entry) => String(entry.intent_id) === String(rule.intent_id));
              const datasource = datasources.find((entry) => String(entry.datasource_id) === String(rule.datasource_id));
              return (
                <div key={rule.rule_id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleExpandedRule(rule.rule_id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleExpandedRule(rule.rule_id);
                      }
                    }}
                    style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(170px, 0.45fr) minmax(220px, 0.5fr) auto", gap: "var(--space-4)", alignItems: "center", padding: "var(--space-5) var(--space-6)", borderTop: "1px solid var(--color-border-soft)", cursor: "pointer" }}
                  >
                  <div>
                    <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-1)" }}>{rule.rule_name || rule.rule_code}</div>
                    <div style={{ color: "var(--color-text-muted)" }}>{rule.rule_code} - {intent?.display_name || intent?.intent_code || `Intent ${rule.intent_id}`}</div>
                    <div style={{ color: "var(--color-text-soft)", marginTop: "var(--space-2)" }}>{rule.rule_description}</div>
                  </div>
                  <div style={{ color: "var(--color-text-muted)" }}>{datasource?.name || `Datasource ${rule.datasource_id}`}</div>
                  <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                    <Chip tone={rule.severity === "CRITICAL" ? "error" : "warning"}>{rule.severity}</Chip>
                    <Chip tone={rule.is_active ? "success" : "warning"}>
                      {rule.is_active ? "active" : "inactive"}
                    </Chip>
                    <Chip tone="info">Order {rule.execution_order}</Chip>
                  </div>
                    <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <AppButton tooltip={`Edit ${rule.rule_name || rule.rule_code}`} size="sm" variant="secondary" onClick={(event) => { event.stopPropagation(); openEdit(rule); }}>Edit</AppButton>
                      <AppButton tooltip={`Delete ${rule.rule_name || rule.rule_code}`} size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); setDeleteTarget(rule); }}>Delete</AppButton>
                    </div>
                  </div>
                  {expandedRuleIds.has(rule.rule_id) ? <ExpandedRuleDetails rule={rule} /> : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editorOpen ? (
        <FormPanel
          title={form.ruleId ? "Edit validation rule" : "Add validation rule"}
          subtitle="Rules link an intent to a datasource-backed validation step with ordered execution."
          onClose={() => setEditorOpen(false)}
        >
          <form onSubmit={submitRule} style={{ display: "grid", gap: "var(--space-4)" }}>
            <Field label="Intent">
              {form.ruleId ? (
                <input value={intentComposerSearch} readOnly style={{ ...inputStyle, background: "var(--color-bg-muted)" }} />
              ) : (
                <div style={{ position: "relative" }}>
                  <input
                    value={intentComposerSearch}
                    onChange={(event) => {
                      setIntentComposerSearch(event.target.value);
                      setForm((current) => ({ ...current, intentId: "" }));
                    }}
                    style={inputStyle}
                    placeholder="Search intent..."
                  />
                  <div style={{ marginTop: "var(--space-2)", display: "grid", gap: "var(--space-1)", maxHeight: "190px", overflow: "auto" }}>
                    {filteredComposerIntents.map((intent) => (
                      <SearchOption
                        key={intent.intent_id}
                        tooltip={`Select ${intent.display_name || intent.intent_code}`}
                        onClick={() => selectComposerIntent(intent)}
                      >
                        {intent.display_name || intent.intent_code}
                      </SearchOption>
                    ))}
                    {!intentComposerSearch.trim() ? (
                      <div style={{ padding: "9px 10px", color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" }}>
                        Start typing to search intents.
                      </div>
                    ) : filteredComposerIntents.length === 0 ? (
                      <div style={{ padding: "9px 10px", color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" }}>
                        No intents match this search.
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </Field>
            <Field label="Rule Code">
              <input value={form.ruleCode} onChange={(event) => setForm((current) => ({ ...current, ruleCode: event.target.value }))} style={inputStyle} placeholder="SENDER_EMAIL_MATCH" />
            </Field>
            <Field label="Rule Name">
              <input value={form.ruleName} onChange={(event) => setForm((current) => ({ ...current, ruleName: event.target.value }))} style={inputStyle} placeholder="Sender Email Match" />
            </Field>
            <Field label="Rule Description">
              <textarea value={form.ruleDescription} onChange={(event) => setForm((current) => ({ ...current, ruleDescription: event.target.value }))} style={textareaStyle} placeholder="Natural language description for this validation rule..." />
            </Field>
            <Field label="Datasource">
              <div style={{ position: "relative" }}>
                <input
                  value={datasourceComposerSearch}
                  onChange={(event) => {
                    setDatasourceComposerSearch(event.target.value);
                    setForm((current) => ({ ...current, datasourceId: "" }));
                  }}
                  style={inputStyle}
                  placeholder="Search active datasource..."
                />
                <div style={{ marginTop: "var(--space-2)", display: "grid", gap: "var(--space-1)", maxHeight: "190px", overflow: "auto" }}>
                  {filteredComposerDatasources.map((datasource) => (
                    <SearchOption
                      key={datasource.datasource_id}
                      tooltip={`Select ${datasource.name}`}
                      onClick={() => selectComposerDatasource(datasource)}
                    >
                      {datasource.name}
                    </SearchOption>
                  ))}
                  {!datasourceComposerSearch.trim() ? (
                    <div style={{ padding: "9px 10px", color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" }}>
                      Start typing to search active datasources.
                    </div>
                  ) : filteredComposerDatasources.length === 0 ? (
                    <div style={{ padding: "9px 10px", color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" }}>
                      No active datasource matches this search.
                    </div>
                  ) : null}
                </div>
              </div>
            </Field>
            <Field label="Language">
              <select
                value={form.languageCode}
                onChange={async (event) => {
                  const languageCode = event.target.value;
                  const nextOrder = await suggestNextOrder(form.intentId, languageCode);
                  setForm((current) => ({ ...current, languageCode, executionOrder: current.ruleId ? current.executionOrder : nextOrder }));
                }}
                style={inputStyle}
              >
                <option value="multi">Multi</option>
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
              </select>
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
              <Field label="Execution Order">
                <input value={form.executionOrder} onChange={(event) => setForm((current) => ({ ...current, executionOrder: event.target.value }))} style={inputStyle} type="number" min="1" />
              </Field>
              <Field label="Severity">
                <select value={form.severity} onChange={(event) => setForm((current) => ({ ...current, severity: event.target.value }))} style={inputStyle}>
                  <option value="CRITICAL">Critical</option>
                  <option value="WARNING">Warning</option>
                </select>
              </Field>
            </div>
            <ToggleRow label="Active" checked={form.isActive} onChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))} />
            <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end", flexWrap: "wrap" }}>
              <AppButton tooltip="Cancel rule editing" type="button" variant="secondary" onClick={() => setEditorOpen(false)}>Cancel</AppButton>
              <AppButton tooltip="Save this validation rule" type="submit" disabled={saving}>{saving ? "Saving..." : "Save Rule"}</AppButton>
            </div>
          </form>
        </FormPanel>
      ) : null}

      {deleteTarget ? (
        <DeleteDialog
          title="Delete validation rule"
          description={`Delete ${deleteTarget.rule_name || deleteTarget.rule_code}? This cannot be undone.`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
          deleting={deletingRuleId === String(deleteTarget.rule_id)}
        />
      ) : null}
    </section>
  );
}

function SearchDropdown({ children }) {
  return (
    <div style={{ position: "absolute", zIndex: 8, top: "calc(100% + 6px)", left: 0, right: 0, padding: "var(--space-2)", border: "1px solid var(--color-border-soft)", borderRadius: "var(--radius-sm)", background: "var(--color-bg-surface)", boxShadow: "var(--shadow-lg)", display: "grid", gap: "var(--space-1)" }}>
      {children}
    </div>
  );
}

function SearchOption({ children, onClick, tooltip }) {
  return (
    <Tooltip content={tooltip || "Select option"} fullWidth>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
        style={{ width: "100%", border: 0, background: "transparent", color: "var(--color-text-strong)", padding: "8px 10px", borderRadius: "var(--radius-xs)", textAlign: "left", font: "inherit", cursor: "pointer" }}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function ExpandedRuleDetails({ rule }) {
  const fields = [
    ["Rule ID", rule.rule_id],
    ["Rule Code", rule.rule_code],
    ["Rule Name", rule.rule_name],
    ["Rule Description", rule.rule_description],
    ["Intent ID", rule.intent_id],
    ["Datasource ID", rule.datasource_id],
    ["Language", rule.language_code],
    ["Execution Order", rule.execution_order],
    ["Severity", rule.severity],
    ["Status", rule.is_active ? "Active" : "Inactive"],
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

function formatFieldValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function PageHeader({ label, title, description, actions }) { return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-6)", marginBottom: "var(--space-6)", flexWrap: "wrap" }}><div><h1 style={{ margin: 0, color: "var(--color-text-strong)", fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", letterSpacing: "var(--tracking-tight)" }}>{title}</h1><p style={{ margin: "var(--space-3) 0 0", color: "var(--color-text-muted)", maxWidth: "72ch" }}>{description}</p></div>{actions}</div>; }
function Metric({ label, value }) { return <div className="surface-card" style={{ padding: "var(--space-5)", background: "var(--color-bg-elevated)" }}><div className="mono-label" style={{ color: "var(--color-text-soft)", marginBottom: "var(--space-2)" }}>{label}</div><div style={{ fontWeight: "var(--font-weight-semibold)" }}>{value}</div></div>; }
function Banner({ tone, title, detail }) { const styles = { success: { border: "var(--color-status-success-border)", background: "var(--color-status-success-bg)", color: "var(--color-status-success-text)" }, warning: { border: "var(--color-status-warning-border)", background: "var(--color-status-warning-bg)", color: "var(--color-status-warning-text)" }, error: { border: "var(--color-status-error-border)", background: "var(--color-status-error-bg)", color: "var(--color-status-error-text)" }, }; return <div style={{ marginBottom: "var(--space-6)", padding: "14px 16px", borderRadius: "var(--radius-sm)", border: `1px solid ${styles[tone].border}`, background: styles[tone].background, color: styles[tone].color }}><div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-1)" }}>{title}</div><div>{detail}</div></div>; }
function EmptyState({ text }) { return <div style={{ padding: "var(--space-8)", color: "var(--color-text-muted)" }}>{text}</div>; }
function FormPanel({ title, subtitle, children, onClose }) { return <aside className="surface-card" style={{ position: "fixed", top: "var(--space-8)", right: "var(--space-8)", bottom: "var(--space-8)", width: "min(480px, calc(100vw - 32px))", overflow: "auto", padding: "var(--space-6)", zIndex: 20, background: "linear-gradient(180deg, var(--color-bg-surface), var(--color-bg-elevated))" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-3)", marginBottom: "var(--space-5)" }}><div><div style={{ fontWeight: "var(--font-weight-bold)", fontSize: "var(--font-size-lg)", marginBottom: "var(--space-1)" }}>{title}</div><div style={{ color: "var(--color-text-muted)" }}>{subtitle}</div></div><AppButton tooltip="Close this panel" size="sm" variant="ghost" onClick={onClose}>Close</AppButton></div>{children}</aside>; }
function Field({ label, children }) { return <label style={{ display: "grid", gap: "var(--space-2)" }}><span className="mono-label" style={{ color: "var(--color-text-muted)" }}>{label}</span>{children}</label>; }
function ToggleRow({ label, checked, onChange }) { return <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4)" }}><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>; }
function DeleteDialog({ title, description, onCancel, onConfirm, deleting = false }) { return <div style={dialogOverlayStyle}><div className="surface-card" style={dialogCardStyle}><div style={{ fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", marginBottom: "var(--space-3)" }}>{title}</div><div style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-6)" }}>{description}</div><div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}><AppButton tooltip="Cancel this deletion" variant="secondary" onClick={onCancel} disabled={deleting}>Cancel</AppButton><AppButton tooltip="Confirm this deletion" onClick={onConfirm} loading={deleting}>{deleting ? "Deleting..." : "Delete"}</AppButton></div></div></div>; }
function Chip({ tone, children }) { const tones = { info: { background: "var(--color-status-info-bg)", color: "var(--color-status-info-text)", border: "var(--color-status-info-border)" }, success: { background: "var(--color-status-success-bg)", color: "var(--color-status-success-text)", border: "var(--color-status-success-border)" }, warning: { background: "var(--color-status-warning-bg)", color: "var(--color-status-warning-text)", border: "var(--color-status-warning-border)" }, error: { background: "var(--color-status-error-bg)", color: "var(--color-status-error-text)", border: "var(--color-status-error-border)" } }; return <span style={{ display: "inline-flex", alignItems: "center", padding: "6px 10px", borderRadius: "var(--radius-pill)", border: `1px solid ${tones[tone].border}`, background: tones[tone].background, color: tones[tone].color, fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)" }}>{children}</span>; }

const inputStyle = { width: "100%", minHeight: "44px", padding: "0 14px", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-base)", background: "var(--color-bg-surface)", color: "var(--color-text-strong)", outline: "none" };
const textareaStyle = { ...inputStyle, minHeight: "120px", padding: "12px 14px", resize: "vertical" };
const dialogOverlayStyle = { position: "fixed", inset: 0, zIndex: 40, display: "grid", placeItems: "center", background: "var(--color-overlay-scrim)", backdropFilter: "blur(8px)" };
const dialogCardStyle = { width: "min(440px, calc(100vw - 32px))", padding: "var(--space-8)" };
