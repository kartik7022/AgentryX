import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DatasourceOptionRow } from "../../components/datasources/DatasourceOptionRow";
import { Banner as NoticeBanner } from "../../components/feedback/Banner";
import { AppButton } from "../../components/primitives/AppButton";
import { Tooltip } from "../../components/primitives/Tooltip";
import {
  createDatasource,
  deleteDatasource,
  deleteVaultPath,
  fetchDatasources,
  fetchDatasourceTypes,
  findDatasourceConfigByName,
  updateDatasource,
} from "../../lib/datasources";

const initialForm = {
  datasourceId: "",
  name: "",
  driverId: "",
  datasourceType: "",
  connectionKey: "",
  description: "",
  datasourceMode: "data",
  isActive: true,
};

export function DatasourcesPage() {
  const navigate = useNavigate();
  const [datasourceTypes, setDatasourceTypes] = useState([]);
  const [datasources, setDatasources] = useState([]);
  const [selectedType, setSelectedType] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [tableSearch, setTableSearch] = useState("");
  const [pickerSearch, setPickerSearch] = useState("");
  const [form, setForm] = useState(initialForm);
  const [activeTab, setActiveTab] = useState("datasources");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingDatasourceId, setDeletingDatasourceId] = useState("");
  const [detailsTarget, setDetailsTarget] = useState(null);
  const [detailsConfig, setDetailsConfig] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [modeConfirm, setModeConfirm] = useState(null);
  const [selectedDatasourceFilter, setSelectedDatasourceFilter] = useState(null);
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const [expandedDatasourceIds, setExpandedDatasourceIds] = useState(() => new Set());
  const pickerPanelRef = useRef(null);
  const pickerSearchRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [typesResult, rowsResult] = await Promise.allSettled([
          fetchDatasourceTypes(),
          fetchDatasources(),
        ]);

        if (cancelled) return;

        if (typesResult.status === "fulfilled") {
          setDatasourceTypes(typesResult.value || []);
        }

        if (rowsResult.status === "fulfilled") {
          setDatasources(rowsResult.value || []);
        }

        const failures = [];
        if (typesResult.status === "rejected") {
          failures.push(`datasource types: ${typesResult.reason?.message || "request failed"}`);
        }
        if (rowsResult.status === "rejected") {
          failures.push(`datasources: ${rowsResult.reason?.message || "request failed"}`);
        }

        if (failures.length > 0) {
          setBanner({
            tone: "error",
            title: "Failed to load datasource data",
            detail: failures.join("; "),
          });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
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
        reloadDatasources().catch(() => null);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (!pickerOpen) return undefined;

    const timeoutId = window.setTimeout(() => {
      pickerPanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
        inline: "nearest",
      });
      pickerSearchRef.current?.focus({ preventScroll: true });
    }, 40);

    return () => window.clearTimeout(timeoutId);
  }, [pickerOpen]);

  const filteredTypes = useMemo(() => {
    const query = pickerSearch.trim().toLowerCase();
    if (!query) {
      return datasourceTypes;
    }
    return datasourceTypes.filter((type) => {
      const haystack = `${type.label} ${type.datasource_type}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [datasourceTypes, pickerSearch]);

  const filteredDatasources = useMemo(() => {
    if (selectedDatasourceFilter !== null && selectedDatasourceFilter !== undefined) {
      return datasources.filter(
        (datasource) => datasource.datasource_id === selectedDatasourceFilter,
      );
    }

    const query = tableSearch.trim().toLowerCase();
    if (!query || query === "all" || query === "all datasources") {
      return datasources;
    }
    return datasources.filter((datasource) => {
      const haystack = `${datasource.name} ${datasource.datasource_type} ${datasource.connection_key}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [datasources, selectedDatasourceFilter, tableSearch]);

  const searchSuggestions = useMemo(() => {
    const query = tableSearch.trim().toLowerCase();
    if (!query) {
      return { showAll: false, matches: [] };
    }

    const showAll = "all".includes(query) || "all datasources".includes(query);
    const matches = datasources.filter((datasource) => {
      const haystack = `${datasource.name} ${datasource.datasource_type} ${datasource.connection_key}`.toLowerCase();
      return haystack.includes(query);
    });

    return { showAll, matches };
  }, [datasources, tableSearch]);

  function typeLabelFor(datasourceType) {
    return (
      datasourceTypes.find((type) => type.datasource_type === datasourceType)?.label ||
      datasourceType
    );
  }

  function openCreatePicker() {
    setPickerSearch("");
    setActiveTab("datasources");
    setPickerOpen(true);
    setEditorOpen(false);
    setSelectedType(null);
  }

  function selectType(type) {
    setSelectedType(type);
    setForm({
      ...initialForm,
      driverId: String(type.driver_id),
      datasourceType: type.datasource_type,
    });
    setPickerOpen(false);
    setEditorOpen(true);
  }

  function beginEdit(datasource) {
    const mappedType = datasourceTypes.find(
      (type) => type.datasource_type === datasource.datasource_type,
    );
    setSelectedType(mappedType || null);
    setForm({
      datasourceId: String(datasource.datasource_id),
      name: datasource.name || "",
      driverId: String(mappedType?.driver_id || ""),
      datasourceType: datasource.datasource_type || "",
      connectionKey: datasource.connection_key || "",
      description: datasource.description || "",
      datasourceMode: datasource.datasource_mode || "data",
      isActive: Boolean(datasource.is_active),
    });
    setEditorOpen(true);
    setPickerOpen(false);
  }

  function resetComposer() {
    setPickerOpen(false);
    setEditorOpen(false);
    setSelectedType(null);
    setForm(initialForm);
  }

  function selectSearchDatasource(datasourceId) {
    if (datasourceId === null) {
      setSelectedDatasourceFilter(null);
      setTableSearch("All Datasources");
      setSearchDropdownOpen(false);
      return;
    }

    const datasource = datasources.find((row) => row.datasource_id === datasourceId);
    if (!datasource) return;

    setSelectedDatasourceFilter(datasourceId);
    setTableSearch(datasource.name);
    setSearchDropdownOpen(false);
  }

  function handleTableSearchChange(event) {
    setTableSearch(event.target.value);
    setSelectedDatasourceFilter(null);
    setSearchDropdownOpen(Boolean(event.target.value.trim()));
  }

  function toggleExpandedDatasource(datasourceId) {
    setExpandedDatasourceIds((current) => {
      const next = new Set(current);
      if (next.has(datasourceId)) {
        next.delete(datasourceId);
      } else {
        next.add(datasourceId);
      }
      return next;
    });
  }

  async function reloadDatasources() {
    const rows = await fetchDatasources();
    setDatasources(rows || []);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBanner(null);

    const payload = {
      name: form.name.trim(),
      driver_id: Number(form.driverId),
      connection_key: form.connectionKey.trim(),
      description: form.description.trim() || null,
      is_active: form.isActive,
      datasource_mode: form.datasourceMode,
    };

    if (!payload.name || !payload.driver_id || !payload.connection_key || !payload.datasource_mode) {
      setBanner({
        tone: "warning",
        title: "Required fields missing",
        detail: "Name, datasource type, connection key, and mode are required.",
      });
      return;
    }

    if (!["data", "query"].includes(payload.datasource_mode)) {
      setBanner({
        tone: "warning",
        title: "Invalid mode",
        detail: "Please select a valid datasource mode.",
      });
      return;
    }

    const duplicate = datasources.find(
      (datasource) =>
        datasource.connection_key === payload.connection_key &&
        datasource.datasource_id !== Number(form.datasourceId || 0),
    );
    if (duplicate) {
      setBanner({
        tone: "warning",
        title: "Duplicate connection key",
        detail: `Connection key "${payload.connection_key}" is already used by "${duplicate.name}".`,
      });
      return;
    }

    await persistDatasource(payload);
  }

  async function persistDatasource(payload, options = {}) {
    setSubmitting(true);

    try {
      if (form.datasourceId) {
        const current = datasources.find(
          (datasource) => datasource.datasource_id === Number(form.datasourceId),
        );
        const oldMode = current?.datasource_mode || "data";
        const newMode = payload.datasource_mode;

        if (oldMode === "data" && newMode === "query" && !options.confirmedQueryMode) {
          setModeConfirm({ payload });
          setSubmitting(false);
          return;
        }

        if (oldMode === "query" && newMode === "data") {
          const config = await findDatasourceConfigByName(payload.connection_key).catch(
            () => null,
          );
          if (!config?.vault_secret_path) {
            setBanner({
              tone: "warning",
              title: "Credentials required",
              detail: "Please configure credentials for this datasource before switching to data mode.",
            });
            setSubmitting(false);
            return;
          }
        }

        await updateDatasource(form.datasourceId, payload);

        if (oldMode === "data" && newMode === "query") {
          const config = await findDatasourceConfigByName(payload.connection_key).catch(
            () => null,
          );
          if (config?.vault_secret_path) {
            await deleteVaultPath(config.vault_secret_path).catch(() => null);
          }
        }

        setBanner({
          tone: "success",
          title: "Datasource updated",
          detail: "Datasource has been updated successfully.",
        });
      } else {
        await createDatasource(payload);
        setBanner({
          tone: "success",
          title: "Datasource created",
          detail: "Datasource has been created successfully.",
        });
      }

      await reloadDatasources();
      resetComposer();
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Save failed",
        detail: error.message || "Failed to save datasource.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function showDetails(datasource) {
    setDetailsTarget(datasource);
    setDetailsConfig(null);
    setDetailsLoading(true);

    try {
      const config = await findDatasourceConfigByName(datasource.connection_key);
      setDetailsConfig(config);
    } catch {
      setDetailsConfig(null);
    } finally {
      setDetailsLoading(false);
    }
  }

  function handleConfigAction() {
    if (!detailsTarget) return;
    const params = detailsConfig?.config_id
      ? `configId=${encodeURIComponent(detailsConfig.config_id)}`
      : `datasourceId=${encodeURIComponent(detailsTarget.datasource_id)}`;
    navigate(`/app/datasource-configs?${params}`);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    setDeletingDatasourceId(String(deleteTarget.datasource_id));
    try {
      await deleteDatasource(deleteTarget.datasource_id);
      setBanner({
        tone: "success",
        title: "Datasource deleted",
        detail: `${deleteTarget.name} and its associated configuration were deleted.`,
      });
      setDeleteTarget(null);
      await reloadDatasources();
    } catch (error) {
      if (error.status === 400) {
        setBanner({
          tone: "warning",
          title: "Failed to delete",
          detail: error.message || "Datasource cannot be deleted because it is still referenced.",
          actionLabel: "Go to Validation Rules",
          onAction: () => navigate("/app/rules"),
        });
        setDeleteTarget(null);
        return;
      }

      setBanner({
        tone: "error",
        title: "Delete failed",
        detail: error.message || "Failed to delete datasource.",
      });
    } finally {
      setDeletingDatasourceId("");
    }
  }

  return (
    <section>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "var(--space-6)",
          marginBottom: "var(--space-6)",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ margin: 0, color: "var(--color-text-strong)", fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", letterSpacing: "var(--tracking-tight)" }}>
            Datasources
          </h1>
          <p style={{ margin: "var(--space-3) 0 0", color: "var(--color-text-muted)", maxWidth: "72ch" }}>
            Create datasources, manage connection keys, and configure credential behavior.
          </p>
        </div>
        <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
          <AppButton tooltip="Open the datasource type picker" onClick={openCreatePicker}>
            + Add Datasource
          </AppButton>
          <AppButton
            tooltip="Open the credentials setup workspace"
            variant="secondary"
            onClick={() => navigate("/app/credentials")}
          >
            Setup Credentials
          </AppButton>
        </div>
      </div>

      <DatasourceInfoBanner />

      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--color-border-soft)", marginBottom: "var(--space-6)" }}>
        <TabButton active={activeTab === "datasources"} onClick={() => setActiveTab("datasources")} tooltip="Show datasources">
          Datasources
        </TabButton>
        <TabButton active={activeTab === "metadata"} onClick={() => setActiveTab("metadata")} tooltip="Show metadata controls">
          Metadata Controls
        </TabButton>
      </div>

      {banner ? <NoticeBanner {...banner} /> : null}

      {activeTab === "metadata" ? (
        <MetadataControls />
      ) : (
        <div
        className={`workspace-composer${pickerOpen || editorOpen ? " workspace-composer--with-panel" : ""}`}
        style={{
          display: "grid",
          gridTemplateColumns: pickerOpen || editorOpen ? "minmax(0, 1fr) minmax(520px, 0.58fr)" : "1fr",
          gap: "var(--space-5)",
          alignItems: "start",
        }}
      >
        <div className="surface-card entity-list-card" style={{ overflow: "hidden" }}>
          <div
            style={{
              padding: "var(--space-5) var(--space-6)",
              borderBottom: "1px solid var(--color-border-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--space-4)",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontWeight: "var(--font-weight-semibold)" }}>All Datasources</div>
              <div style={{ color: "var(--color-text-muted)" }}>
                {filteredDatasources.length} {filteredDatasources.length === 1 ? "datasource" : "datasources"}
              </div>
            </div>
            <div style={{ position: "relative", width: "min(360px, 100%)" }}>
              <input
                type="text"
                value={tableSearch}
                onChange={handleTableSearchChange}
                onFocus={() => setSearchDropdownOpen(Boolean(tableSearch.trim()))}
                onBlur={() => window.setTimeout(() => setSearchDropdownOpen(false), 120)}
                placeholder="Type to search datasources or type 'all' for all datasources..."
                style={searchInputStyle}
              />
              {searchDropdownOpen ? (
                <SearchDropdown>
                  {searchSuggestions.showAll ? (
                    <SearchOption
                      title="All Datasources"
                      detail="Show all datasources"
                      tooltip="Show all datasources"
                      onClick={() => selectSearchDatasource(null)}
                    />
                  ) : null}
                  {searchSuggestions.matches.map((datasource) => (
                    <SearchOption
                      key={datasource.datasource_id}
                      title={datasource.name}
                      detail={`Type: ${typeLabelFor(datasource.datasource_type)}`}
                      tooltip={`Filter to ${datasource.name}`}
                      onClick={() => selectSearchDatasource(datasource.datasource_id)}
                    />
                  ))}
                  {!searchSuggestions.showAll && searchSuggestions.matches.length === 0 ? (
                    <div style={{ padding: "10px 12px", color: "var(--color-text-muted)", textAlign: "center" }}>
                      No matching datasources found
                    </div>
                  ) : null}
                </SearchDropdown>
              ) : null}
            </div>
          </div>

          {loading ? (
            <div style={{ padding: "var(--space-8)", color: "var(--color-text-muted)" }}>
              Loading datasources...
            </div>
          ) : filteredDatasources.length === 0 ? (
            <div style={{ padding: "var(--space-8)", color: "var(--color-text-muted)" }}>
              No datasources found yet.
            </div>
          ) : (
            <div style={{ display: "grid" }}>
              {filteredDatasources.map((datasource) => (
                <div key={datasource.datasource_id}>
                  <div
                    className="entity-row entity-row--datasource"
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleExpandedDatasource(datasource.datasource_id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleExpandedDatasource(datasource.datasource_id);
                      }
                    }}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1.1fr) minmax(140px, 0.7fr) minmax(140px, 0.7fr) minmax(110px, 0.45fr) auto",
                      gap: "var(--space-4)",
                      alignItems: "center",
                      padding: "var(--space-5) var(--space-6)",
                      borderTop: "1px solid var(--color-border-soft)",
                      cursor: "pointer",
                    }}
                  >
                    <div className="entity-row__primary">
                      <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-1)" }}>
                        {datasource.name}
                      </div>
                      <div style={{ color: "var(--color-text-muted)" }}>
                        {datasource.connection_key}
                      </div>
                    </div>
                    <div>
                      <Chip tone="info">{typeLabelFor(datasource.datasource_type)}</Chip>
                    </div>
                    <div>
                      <Chip tone={datasource.datasource_mode === "query" ? "warning" : "success"}>
                        {datasource.datasource_mode === "query" ? "Query" : "Data"}
                      </Chip>
                    </div>
                    <div>
                      <Chip tone={datasource.is_active ? "success" : "warning"}>
                        {datasource.is_active ? "Active" : "Inactive"}
                      </Chip>
                    </div>
                    <div className="entity-row__actions" style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <AppButton
                        tooltip={`Configure ${datasource.name}`}
                        size="sm"
                        variant="ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(
                            `/app/datasource-configs?datasourceId=${datasource.datasource_id}`,
                          );
                        }}
                      >
                        Configure
                      </AppButton>
                      <AppButton
                        tooltip={`View ${datasource.name} details`}
                        size="sm"
                        variant="ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          showDetails(datasource);
                        }}
                      >
                        Details
                      </AppButton>
                      <AppButton
                        tooltip={`Edit ${datasource.name}`}
                        size="sm"
                        variant="secondary"
                        onClick={(event) => {
                          event.stopPropagation();
                          beginEdit(datasource);
                        }}
                      >
                        Edit
                      </AppButton>
                      <AppButton
                        tooltip={`Delete ${datasource.name}`}
                        size="sm"
                        variant="ghost"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteTarget(datasource);
                        }}
                      >
                        Delete
                      </AppButton>
                    </div>
                  </div>
                  {expandedDatasourceIds.has(datasource.datasource_id) ? (
                    <ExpandedDetails
                      fields={[
                        ["Datasource ID", datasource.datasource_id],
                        ["Name", datasource.name],
                        ["Type", datasource.datasource_type],
                        ["Connection Key", datasource.connection_key],
                        ["Description", datasource.description],
                        ["Mode", datasource.datasource_mode],
                        ["Is Active", datasource.is_active],
                      ]}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        {pickerOpen ? (
          <FloatingPanel
            title="Choose datasource type"
            subtitle="Select a supported datasource to continue."
            onClose={resetComposer}
            panelRef={pickerPanelRef}
          >
            <div style={{ display: "grid", gap: "var(--space-2)" }}>
              <input
                ref={pickerSearchRef}
                type="text"
                value={pickerSearch}
                onChange={(event) => setPickerSearch(event.target.value)}
                placeholder="Search datasource types..."
                style={inputStyle}
              />
              <div
                style={{
                  display: "grid",
                  gap: "2px",
                  maxHeight: "min(58dvh, 540px)",
                  overflowY: "auto",
                  padding: "var(--space-1)",
                  borderRadius: "12px",
                  border: "1px solid var(--color-border-soft)",
                  background: "var(--color-bg-surface)",
                }}
              >
                {filteredTypes.map((type) => (
                  <DatasourceOptionRow
                    key={type.driver_id}
                    source={type}
                    title={type.label}
                    subtitle={type.datasource_type}
                    actionLabel="Create"
                    onClick={() => selectType(type)}
                  />
                ))}
                {filteredTypes.length === 0 ? (
                  <div
                    style={{
                      padding: "var(--space-4)",
                      color: "var(--color-text-muted)",
                      fontSize: "var(--font-size-sm)",
                    }}
                  >
                    No datasource types match this search.
                  </div>
                ) : null}
              </div>
            </div>
          </FloatingPanel>
        ) : null}

        {editorOpen ? (
          <FloatingPanel
            title={form.datasourceId ? "Edit datasource" : "Create datasource"}
            subtitle={selectedType ? `Selected type: ${selectedType.label}` : "Fill in datasource details."}
            onClose={resetComposer}
          >
            <form className="enterprise-form" onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-3)" }}>
              <Field label="Datasource Type">
                <div
                  style={{
                    minHeight: "40px",
                    padding: "10px 12px",
                    borderRadius: "var(--radius-xs)",
                    border: "1px solid var(--color-border-soft)",
                    background: "var(--color-bg-elevated)",
                    color: "var(--color-text-base)",
                  }}
                >
                  {selectedType?.label || form.datasourceType || "Unknown datasource type"}
                </div>
              </Field>

              <Field label="Name">
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="e.g. CRM_DB"
                  style={inputStyle}
                />
              </Field>

              <Field label="Connection Key">
                <input
                  value={form.connectionKey}
                  onChange={(event) => setForm((current) => ({ ...current, connectionKey: event.target.value }))}
                  placeholder="References datasource configuration name"
                  style={inputStyle}
                />
              </Field>

              <Field label="Description">
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Describe this datasource"
                  rows={4}
                  style={{ ...inputStyle, minHeight: "92px", padding: "10px 12px", resize: "vertical" }}
                />
              </Field>

              <Field label="Mode">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
                  {[
                    { value: "data", label: "Data", detail: "Stored securely in Vault" },
                    { value: "query", label: "Query", detail: "Credentials not retained" },
                  ].map((option) => (
                    <Tooltip key={option.value} content={`Select ${option.label.toLowerCase()} mode`}>
                      <button
                        type="button"
                        onClick={() => setForm((current) => ({ ...current, datasourceMode: option.value }))}
                        style={{
                          textAlign: "left",
                          padding: "10px 12px",
                          borderRadius: "var(--radius-xs)",
                          border: `1px solid ${form.datasourceMode === option.value ? "var(--color-primary-200)" : "var(--color-border-soft)"}`,
                          background: form.datasourceMode === option.value ? "var(--color-primary-50)" : "var(--color-bg-surface)",
                        }}
                      >
                        <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-1)" }}>
                          {option.label}
                        </div>
                        <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)" }}>
                          {option.detail}
                        </div>
                      </button>
                    </Tooltip>
                  ))}
                </div>
              </Field>

              <label style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", color: "var(--color-text-base)" }}>
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                />
                Active datasource
              </label>

              <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end", flexWrap: "wrap" }}>
                <AppButton tooltip="Close the datasource editor" type="button" variant="secondary" onClick={resetComposer}>
                  Cancel
                </AppButton>
                <AppButton
                  tooltip={form.datasourceId ? "Save datasource changes" : "Create this datasource"}
                  type="submit"
                  disabled={submitting}
                >
                  {submitting ? "Saving..." : form.datasourceId ? "Save Changes" : "Create Datasource"}
                </AppButton>
              </div>
            </form>
          </FloatingPanel>
        ) : null}
      </div>
      )}

      {deleteTarget ? (
        <DeleteDialog
          datasource={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
          deleting={deletingDatasourceId === String(deleteTarget.datasource_id)}
        />
      ) : null}

      {detailsTarget ? (
        <DetailsDialog
          datasource={detailsTarget}
          typeLabel={typeLabelFor(detailsTarget.datasource_type)}
          config={detailsConfig}
          loading={detailsLoading}
          onClose={() => {
            setDetailsTarget(null);
            setDetailsConfig(null);
          }}
          onConfigAction={handleConfigAction}
        />
      ) : null}

      {modeConfirm ? (
        <ModeConfirmDialog
          onCancel={() => setModeConfirm(null)}
          onConfirm={() => {
            const pending = modeConfirm.payload;
            setModeConfirm(null);
            persistDatasource(pending, { confirmedQueryMode: true });
          }}
        />
      ) : null}
    </section>
  );
}

function DatasourceInfoBanner() {
  const steps = [
    ["1", "Create a Datasource", "Click Add Datasource at the top right."],
    [
      "2",
      "Set up Datasource Configuration",
      "Click Details, then Add Configuration on the datasource row, or use the Datasource Configs sidebar tab.",
    ],
    [
      "3",
      "Set up Credentials",
      "Click Setup Credentials at the top right, or use the Setup Credentials sidebar tab.",
    ],
  ];

  return (
    <div className="surface-card" style={{ padding: "var(--space-6)", marginBottom: "var(--space-6)", background: "var(--color-bg-elevated)" }}>
      <div style={{ display: "grid", gap: "var(--space-5)" }}>
        <div>
          <div className="mono-label" style={{ color: "var(--color-text-soft)", marginBottom: "var(--space-2)" }}>
            Credential Security
          </div>
          <div style={{ color: "var(--color-text-muted)", lineHeight: "var(--line-height-relaxed)" }}>
            <strong style={{ color: "var(--color-primary-700)" }}>Data Mode -</strong> Credentials are AES-256 encrypted and stored in HashiCorp Vault. Never exposed in plain text.
          </div>
          <div style={{ color: "var(--color-text-muted)", lineHeight: "var(--line-height-relaxed)" }}>
            <strong style={{ color: "var(--color-status-error-text)" }}>Query Mode -</strong> Credentials are never stored. Used once in-memory for schema metadata, then discarded immediately.
          </div>
        </div>
        <div style={{ borderTop: "1px solid var(--color-border-soft)" }} />
        <div>
          <div className="mono-label" style={{ color: "var(--color-text-soft)", marginBottom: "var(--space-4)" }}>
            Required Setup Steps
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--space-4)" }}>
            {steps.map(([step, title, detail]) => (
              <div key={step} style={{ display: "flex", gap: "var(--space-3)" }}>
                <div
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "999px",
                    background: "var(--color-text-muted)",
                    color: "var(--color-text-inverse)",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                    fontWeight: "var(--font-weight-bold)",
                    fontSize: "var(--font-size-xs)",
                  }}
                >
                  {step}
                </div>
                <div>
                  <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-1)" }}>{title}</div>
                  <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>{detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, tooltip, children }) {
  return (
    <Tooltip content={tooltip}>
      <button
        type="button"
        onClick={onClick}
        style={{
          padding: "10px 24px",
          border: "none",
          borderBottom: `3px solid ${active ? "var(--color-primary-700)" : "transparent"}`,
          background: "transparent",
          color: active ? "var(--color-primary-700)" : "var(--color-text-muted)",
          marginBottom: "-1px",
          fontWeight: "var(--font-weight-semibold)",
          cursor: "pointer",
        }}
      >
        {children}
      </button>
    </Tooltip>
  );
}

function MetadataControls() {
  const controls = [
    ["Full Refresh", "Scans the entire datasource schema from scratch and rebuilds all metadata"],
    ["Lite Refresh", "Updates only the changed parts of the metadata, faster than full refresh"],
    ["Check Drift", "Detects if the actual datasource schema has changed compared to what was last stored"],
    ["Profile", "Samples data from columns to understand data distribution, types and patterns"],
    ["Principal Context Preview", "Shows what data a specific user can access based on their permissions"],
  ];

  return (
    <div className="surface-card" style={{ padding: "var(--space-6)" }}>
      <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-5)" }}>
        Metadata Controls
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
        {controls.map(([label, tooltip]) => (
          <AppButton key={label} tooltip={tooltip} variant="secondary">
            {label}
          </AppButton>
        ))}
      </div>
    </div>
  );
}

function FloatingPanel({ title, subtitle, children, onClose, panelRef }) {
  return (
    <aside
      ref={panelRef}
      className="surface-card workspace-panel"
      style={{
        position: "sticky",
        top: "var(--space-8)",
        padding: "var(--space-5)",
        background: "linear-gradient(180deg, var(--color-bg-surface), var(--color-bg-elevated))",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
        <div>
          <div style={{ fontWeight: "var(--font-weight-bold)", fontSize: "var(--font-size-lg)", marginBottom: "var(--space-1)" }}>
            {title}
          </div>
          <div style={{ color: "var(--color-text-muted)" }}>{subtitle}</div>
        </div>
        <AppButton tooltip="Close this panel" size="sm" variant="ghost" onClick={onClose}>
          Close
        </AppButton>
      </div>
      {children}
    </aside>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: "6px" }}>
      <span className="mono-label" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Banner({ tone, title, detail, actionLabel, onAction }) {
  const styles = {
    success: {
      border: "var(--color-status-success-border)",
      background: "var(--color-status-success-bg)",
      color: "var(--color-status-success-text)",
    },
    warning: {
      border: "var(--color-status-warning-border)",
      background: "var(--color-status-warning-bg)",
      color: "var(--color-status-warning-text)",
    },
    error: {
      border: "var(--color-status-error-border)",
      background: "var(--color-status-error-bg)",
      color: "var(--color-status-error-text)",
    },
  };

  return (
    <div
      style={{
        marginBottom: "var(--space-6)",
        padding: "14px 16px",
        borderRadius: "var(--radius-sm)",
        border: `1px solid ${styles[tone].border}`,
        background: styles[tone].background,
        color: styles[tone].color,
      }}
    >
      <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-1)" }}>{title}</div>
      <div>{detail}</div>
      {actionLabel && onAction ? (
        <div style={{ marginTop: "var(--space-3)" }}>
          <AppButton tooltip={actionLabel} size="sm" variant="secondary" onClick={onAction}>
            {actionLabel}
          </AppButton>
        </div>
      ) : null}
    </div>
  );
}

function SearchDropdown({ children }) {
  return (
    <div
      style={{
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
      }}
    >
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
        <div style={{ fontWeight: "var(--font-weight-semibold)", color: "var(--color-text-strong)" }}>
          {title}
        </div>
        <div style={{ color: "var(--color-text-muted)", fontSize: "var(--font-size-xs)", marginTop: "2px" }}>
          {detail}
        </div>
      </button>
    </Tooltip>
  );
}

function ExpandedDetails({ fields }) {
  return (
    <div
      style={{
        borderTop: "1px solid var(--color-border-soft)",
        background: "var(--color-bg-elevated)",
        padding: "var(--space-5) var(--space-6)",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--space-4)" }}>
        {fields.map(([label, value]) => (
          <div key={label}>
            <div className="mono-label" style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-1)" }}>
              {label}
            </div>
            <div style={{ color: "var(--color-text-strong)", fontWeight: "var(--font-weight-semibold)", wordBreak: "break-word" }}>
              {formatFieldValue(value)}
            </div>
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

function Chip({ tone, children }) {
  const tones = {
    info: {
      background: "var(--color-status-info-bg)",
      color: "var(--color-status-info-text)",
      border: "var(--color-status-info-border)",
    },
    success: {
      background: "var(--color-status-success-bg)",
      color: "var(--color-status-success-text)",
      border: "var(--color-status-success-border)",
    },
    warning: {
      background: "var(--color-status-warning-bg)",
      color: "var(--color-status-warning-text)",
      border: "var(--color-status-warning-border)",
    },
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: "var(--radius-pill)",
        border: `1px solid ${tones[tone].border}`,
        background: tones[tone].background,
        color: tones[tone].color,
        fontSize: "var(--font-size-xs)",
        fontWeight: "var(--font-weight-semibold)",
      }}
    >
      {children}
    </span>
  );
}

function DeleteDialog({ datasource, onCancel, onConfirm, deleting = false }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        display: "grid",
        placeItems: "center",
        background: "var(--color-overlay-scrim)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div className="surface-card" style={{ width: "min(440px, calc(100vw - 32px))", padding: "var(--space-8)" }}>
        <div style={{ fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", marginBottom: "var(--space-3)" }}>
          Delete datasource
        </div>
        <div style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-6)" }}>
          Are you sure you want to delete <strong>{datasource.name}</strong>? This will also delete its associated configuration. This action cannot be undone.
        </div>
        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}>
          <AppButton tooltip="Cancel datasource deletion" variant="secondary" onClick={onCancel} disabled={deleting}>
            Cancel
          </AppButton>
          <AppButton tooltip="Confirm datasource deletion" onClick={onConfirm} loading={deleting}>
            {deleting ? "Deleting..." : "Delete"}
          </AppButton>
        </div>
      </div>
    </div>
  );
}

function DetailsDialog({ datasource, typeLabel, config, loading, onClose, onConfigAction }) {
  const fields = [
    ["Name", datasource.name],
    ["Type", typeLabel],
    ["Connection Key", datasource.connection_key],
    ["Status", datasource.is_active ? "Active" : "Inactive"],
  ];

  if (datasource.description) {
    fields.push(["Description", datasource.description]);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        display: "grid",
        placeItems: "center",
        background: "var(--color-overlay-scrim)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div className="surface-card" style={{ width: "min(520px, calc(100vw - 32px))", padding: "var(--space-7)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", alignItems: "flex-start", marginBottom: "var(--space-5)" }}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", marginBottom: "var(--space-1)" }}>
              Datasource Details
            </div>
            <div style={{ color: "var(--color-text-muted)" }}>
              {loading ? "Checking configuration..." : config ? "Configuration found." : "No configuration found."}
            </div>
          </div>
          <AppButton tooltip="Close datasource details" size="sm" variant="ghost" onClick={onClose}>
            Close
          </AppButton>
        </div>

        <div style={{ display: "grid", gap: "var(--space-3)", marginBottom: "var(--space-6)" }}>
          {fields.map(([label, value]) => (
            <div key={label}>
              <div className="mono-label" style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-1)" }}>
                {label}
              </div>
              <div style={{ padding: "10px 12px", borderRadius: "var(--radius-xs)", background: "var(--color-bg-elevated)", fontWeight: "var(--font-weight-semibold)" }}>
                {String(value)}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end", flexWrap: "wrap" }}>
          <AppButton tooltip="Close datasource details" variant="secondary" onClick={onClose}>
            Close
          </AppButton>
          <AppButton tooltip={config ? "Edit datasource configuration" : "Add datasource configuration"} onClick={onConfigAction}>
            {config ? "Edit Configuration" : "Add Configuration"}
          </AppButton>
        </div>
      </div>
    </div>
  );
}

function ModeConfirmDialog({ onCancel, onConfirm }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 45,
        display: "grid",
        placeItems: "center",
        background: "var(--color-overlay-scrim)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div className="surface-card" style={{ width: "min(460px, calc(100vw - 32px))", padding: "var(--space-8)", textAlign: "center" }}>
        <div style={{ fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", marginBottom: "var(--space-3)" }}>
          Switch to Query Mode
        </div>
        <div style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-6)" }}>
          Switching to query mode will permanently delete your stored credentials from Vault. To switch back to data mode, you will need to reconfigure credentials again.
        </div>
        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "center", flexWrap: "wrap" }}>
          <AppButton tooltip="Cancel mode change" variant="secondary" onClick={onCancel}>
            Cancel
          </AppButton>
          <AppButton tooltip="Switch to query mode and delete credentials" onClick={onConfirm}>
            Yes, Switch & Delete Creds
          </AppButton>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  minHeight: "40px",
  padding: "0 12px",
  borderRadius: "var(--radius-xs)",
  border: "1px solid var(--color-border-base)",
  background: "var(--color-bg-surface)",
  color: "var(--color-text-strong)",
  outline: "none",
};

const searchInputStyle = {
  width: "100%",
  minHeight: "38px",
  padding: "0 12px",
  borderRadius: "var(--radius-xs)",
  border: "1px solid var(--color-border-base)",
  background: "var(--color-bg-surface)",
  color: "var(--color-text-strong)",
  outline: "none",
};
