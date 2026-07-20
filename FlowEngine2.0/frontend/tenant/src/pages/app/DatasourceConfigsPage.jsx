import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DatasourceLogo } from "../../components/datasources/DatasourceOptionRow";
import { Banner as NoticeBanner } from "../../components/feedback/Banner";
import { AppButton } from "../../components/primitives/AppButton";
import { Tooltip } from "../../components/primitives/Tooltip";
import { useAuth } from "../../providers/AuthProvider";
import { fetchDatasources, fetchDatasourceTypes } from "../../lib/datasources";
import {
  createDatasourceConfig,
  deleteDatasourceConfig,
  fetchDatasourceConfigs,
  updateDatasourceConfig,
} from "../../lib/datasource-configs";

const initialForm = {
  configId: "",
  selectedDatasourceId: "",
  datasourceSearch: "",
  name: "",
  protocol: "",
  driverFamily: "",
  baseUrl: "",
  authType: "",
  authConfig: "",
  connectionJson: "",
  metadataRef: "",
  routerBaseUrl: "",
  poolSize: "",
  maxOverflow: "",
  poolTimeoutSeconds: "",
  poolRecycleSeconds: "",
  profilingSampleLimit: "",
  defaultResultFormat: "",
  driverServiceUrl: "",
  sgateEnabled: true,
  profilingEnabled: false,
  defaultExecute: true,
  isActive: true,
};

export function DatasourceConfigsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [configs, setConfigs] = useState([]);
  const [datasources, setDatasources] = useState([]);
  const [datasourceTypes, setDatasourceTypes] = useState([]);
  const [tableSearch, setTableSearch] = useState("");
  const [composerSearch, setComposerSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingConfigId, setDeletingConfigId] = useState("");
  const [selectedConfigFilter, setSelectedConfigFilter] = useState(null);
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const [expandedConfigIds, setExpandedConfigIds] = useState(() => new Set());
  const datasourceSearchRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [configResult, datasourceResult, typeResult] = await Promise.allSettled([
          fetchDatasourceConfigs(),
          fetchDatasources(),
          fetchDatasourceTypes(),
        ]);

        if (cancelled) return;

        if (configResult.status === "fulfilled") {
          setConfigs(configResult.value || []);
        }
        if (datasourceResult.status === "fulfilled") {
          setDatasources(datasourceResult.value || []);
        }
        if (typeResult.status === "fulfilled") {
          setDatasourceTypes(typeResult.value || []);
        }

        const failures = [];
        if (configResult.status === "rejected") {
          failures.push(`configs: ${configResult.reason?.message || "request failed"}`);
        }
        if (datasourceResult.status === "rejected") {
          failures.push(`datasources: ${datasourceResult.reason?.message || "request failed"}`);
        }
        if (typeResult.status === "rejected") {
          failures.push(`datasource types: ${typeResult.reason?.message || "request failed"}`);
        }

        if (failures.length > 0) {
          setBanner({
            tone: "error",
            title: "Failed to load datasource configuration data",
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
        reload().catch(() => null);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (loading) return;

    const configId = searchParams.get("configId");
    if (configId && !editorOpen) {
      const config = configs.find(
        (row) => String(row.config_id) === String(configId),
      );
      if (config) {
        beginEdit(config);
        return;
      }
    }

    const datasourceId = searchParams.get("datasourceId");
    if (!datasourceId || editorOpen) return;

    const datasource = datasources.find(
      (row) => String(row.datasource_id) === String(datasourceId),
    );

    if (!datasource) return;

    openCreateWithDatasource(datasource);
  }, [configs, datasources, editorOpen, loading, searchParams]);

  const filteredConfigs = useMemo(() => {
    if (selectedConfigFilter !== null && selectedConfigFilter !== undefined) {
      return configs.filter((config) => config.config_id === selectedConfigFilter);
    }

    const query = tableSearch.trim().toLowerCase();
    if (!query || query === "all" || query === "all configs") return configs;

    return configs.filter((config) => {
      const haystack = `${config.name} ${config.protocol} ${config.driver_family}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [configs, selectedConfigFilter, tableSearch]);

  const searchSuggestions = useMemo(() => {
    const query = tableSearch.trim().toLowerCase();
    if (!query) {
      return { showAll: false, matches: [] };
    }

    const showAll = "all".includes(query) || "all configs".includes(query);
    const matches = configs.filter((config) => {
      const haystack = `${config.name} ${config.protocol} ${config.driver_family}`.toLowerCase();
      return haystack.includes(query);
    });

    return { showAll, matches };
  }, [configs, tableSearch]);

  const datasourcesWithoutConfigs = useMemo(() => {
    const configNames = new Set(configs.map((config) => config.name));
    return datasources.filter((datasource) => !configNames.has(datasource.connection_key));
  }, [configs, datasources]);

  const filteredComposerDatasources = useMemo(() => {
    const query = composerSearch.trim().toLowerCase();
    if (!query) return [];

    return datasourcesWithoutConfigs.filter((datasource) => {
      const haystack = `${datasource.name} ${datasource.connection_key} ${datasource.datasource_type}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [composerSearch, datasourcesWithoutConfigs]);

  function driverInfoForDatasource(datasource) {
    return datasourceTypes.find(
      (type) =>
        type.driver_id === datasource.driver_id ||
        type.datasource_type === datasource.datasource_type ||
        type.canonical_name === datasource.datasource_type,
    );
  }

  function protocolLabel(protocol) {
    return protocol ? protocol.toUpperCase() : "N/A";
  }

  function openCreate() {
    setForm(initialForm);
    setComposerSearch("");
    setEditorOpen(true);
  }

  function openCreateWithDatasource(datasource) {
    const driverInfo = driverInfoForDatasource(datasource);

    setForm({
      ...initialForm,
      selectedDatasourceId: String(datasource.datasource_id),
      datasourceSearch: datasource.name,
      name: datasource.connection_key || "",
      protocol: driverInfo?.protocol || "",
      driverFamily: driverInfo?.driver_family || datasource.datasource_type || "",
    });
    setComposerSearch(datasource.name || "");
    setEditorOpen(true);
  }

  function selectDatasource(datasource) {
    const driverInfo = driverInfoForDatasource(datasource);

    setForm((current) => ({
      ...current,
      selectedDatasourceId: String(datasource.datasource_id),
      datasourceSearch: datasource.name,
      name: datasource.connection_key || "",
      protocol: driverInfo?.protocol || "",
      driverFamily: driverInfo?.driver_family || datasource.datasource_type || "",
    }));
    setComposerSearch(datasource.name || "");
  }

  function beginEdit(config) {
    setForm({
      configId: String(config.config_id),
      selectedDatasourceId: "",
      datasourceSearch: "",
      name: config.name || "",
      protocol: config.protocol || "",
      driverFamily: config.driver_family || "",
      baseUrl: config.base_url || "",
      authType: config.auth_type || "",
      authConfig: config.auth_config ? JSON.stringify(config.auth_config, null, 2) : "",
      connectionJson: config.connection_json ? JSON.stringify(config.connection_json, null, 2) : "",
      metadataRef: config.metadata_ref || "",
      routerBaseUrl: config.router_base_url || "",
      poolSize: config.pool_size ?? "",
      maxOverflow: config.max_overflow ?? "",
      poolTimeoutSeconds: config.pool_timeout_seconds ?? "",
      poolRecycleSeconds: config.pool_recycle_seconds ?? "",
      profilingSampleLimit: config.profiling_sample_limit ?? "",
      defaultResultFormat: config.default_result_format || "",
      driverServiceUrl: config.driver_service_url || "",
      sgateEnabled: config.sgate_enabled !== false,
      profilingEnabled: Boolean(config.profiling_enabled),
      defaultExecute: config.default_execute !== false,
      isActive: Boolean(config.is_active),
    });
    setComposerSearch("");
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setForm(initialForm);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("datasourceId");
    nextParams.delete("configId");
    setSearchParams(nextParams, { replace: true });
  }

  function selectSearchConfig(configId) {
    if (configId === null) {
      setSelectedConfigFilter(null);
      setTableSearch("All Configs");
      setSearchDropdownOpen(false);
      return;
    }

    const config = configs.find((row) => row.config_id === configId);
    if (!config) return;

    setSelectedConfigFilter(configId);
    setTableSearch(config.name);
    setSearchDropdownOpen(false);
  }

  function handleTableSearchChange(event) {
    setTableSearch(event.target.value);
    setSelectedConfigFilter(null);
    setSearchDropdownOpen(Boolean(event.target.value.trim()));
  }

  function toggleExpandedConfig(configId) {
    setExpandedConfigIds((current) => {
      const next = new Set(current);
      if (next.has(configId)) {
        next.delete(configId);
      } else {
        next.add(configId);
      }
      return next;
    });
  }

  async function reload() {
    const [configRows, datasourceRows, typeRows] = await Promise.all([
      fetchDatasourceConfigs(),
      fetchDatasources(),
      fetchDatasourceTypes(),
    ]);
    setConfigs(configRows || []);
    setDatasources(datasourceRows || []);
    setDatasourceTypes(typeRows || []);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBanner(null);

    if (!form.configId && !form.selectedDatasourceId) {
      setBanner({
        tone: "warning",
        title: "Datasource required",
        detail: "Please select a valid datasource from the dropdown list before saving the configuration.",
      });
      datasourceSearchRef.current?.focus();
      return;
    }

    let authConfig = null;
    let connectionJson = null;

    try {
      authConfig = form.authConfig.trim() ? JSON.parse(form.authConfig) : null;
      connectionJson = form.connectionJson.trim() ? JSON.parse(form.connectionJson) : null;
    } catch {
      setBanner({
        tone: "error",
        title: "Invalid JSON",
        detail: "Auth Config or Connection JSON is not valid JSON.",
      });
      return;
    }

    const payload = {
      tenant_id: user?.tenantId,
      name: form.name.trim(),
      protocol: form.protocol.trim(),
      driver_family: form.driverFamily.trim(),
      base_url: form.baseUrl.trim() || null,
      auth_type: form.authType.trim() || null,
      auth_config: authConfig,
      connection_json: connectionJson,
      metadata_ref: form.metadataRef.trim() || null,
      router_base_url: form.routerBaseUrl.trim() || null,
      pool_size: numericOrNull(form.poolSize),
      max_overflow: numericOrNull(form.maxOverflow),
      pool_timeout_seconds: numericOrNull(form.poolTimeoutSeconds),
      pool_recycle_seconds: numericOrNull(form.poolRecycleSeconds),
      profiling_sample_limit: numericOrNull(form.profilingSampleLimit),
      default_result_format: form.defaultResultFormat.trim() || null,
      driver_service_url: form.driverServiceUrl.trim() || null,
      sgate_enabled: form.sgateEnabled,
      profiling_enabled: form.profilingEnabled,
      default_execute: form.defaultExecute,
      is_active: form.isActive,
    };

    if (!payload.name || !payload.protocol || !payload.driver_family) {
      setBanner({
        tone: "warning",
        title: "Required fields missing",
        detail: "Name, protocol, and driver family are required.",
      });
      return;
    }

    setSubmitting(true);

    try {
      if (form.configId) {
        await updateDatasourceConfig(form.configId, payload);
        setBanner({
          tone: "success",
          title: "Configuration updated",
          detail: `${payload.name} has been updated successfully.`,
        });
      } else {
        await createDatasourceConfig(payload);
        setBanner({
          tone: "success",
          title: "Configuration created",
          detail: `${payload.name} has been created successfully.`,
        });
      }

      await reload();
      closeEditor();
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Save failed",
        detail: error.message || "Unable to save datasource configuration.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    setDeletingConfigId(String(deleteTarget.config_id));
    try {
      await deleteDatasourceConfig(deleteTarget.config_id);
      setBanner({
        tone: "success",
        title: "Configuration deleted",
        detail: `${deleteTarget.name} has been deleted successfully.`,
      });
      setDeleteTarget(null);
      await reload();
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Delete failed",
        detail: error.message || "Unable to delete datasource configuration.",
      });
    } finally {
      setDeletingConfigId("");
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
            Datasource Configs
          </h1>
          <p style={{ margin: "var(--space-3) 0 0", color: "var(--color-text-muted)", maxWidth: "72ch" }}>
            Create and manage datasource configuration details.
          </p>
        </div>
        <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
          <AppButton tooltip="Create a new datasource configuration" onClick={openCreate}>
            + Add Config
          </AppButton>
          <AppButton tooltip="Return to the datasource workspace" variant="secondary" onClick={() => navigate("/app/datasources")}>
            Back to Datasources
          </AppButton>
        </div>
      </div>

      {banner ? <NoticeBanner {...banner} /> : null}

      <div
        className={`workspace-composer${editorOpen ? " workspace-composer--with-panel" : ""}`}
        style={{
          display: "grid",
          gridTemplateColumns: editorOpen ? "minmax(0, 1fr) minmax(560px, 0.62fr)" : "1fr",
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
              justifyContent: "space-between",
              alignItems: "center",
              gap: "var(--space-4)",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontWeight: "var(--font-weight-semibold)" }}>Configuration Details</div>
              <div style={{ color: "var(--color-text-muted)" }}>
                {filteredConfigs.length} {filteredConfigs.length === 1 ? "config" : "configs"}
              </div>
            </div>
            <div style={{ position: "relative", width: "min(360px, 100%)" }}>
              <input
                type="text"
                value={tableSearch}
                onChange={handleTableSearchChange}
                onFocus={() => setSearchDropdownOpen(Boolean(tableSearch.trim()))}
                onBlur={() => window.setTimeout(() => setSearchDropdownOpen(false), 120)}
                placeholder="Type to search configs or type 'all' for all configs..."
                style={searchInputStyle}
              />
              {searchDropdownOpen ? (
                <SearchDropdown>
                  {searchSuggestions.showAll ? (
                    <SearchOption
                      title="All Configs"
                      detail="Show all configurations"
                      tooltip="Show all datasource configurations"
                      onClick={() => selectSearchConfig(null)}
                    />
                  ) : null}
                  {searchSuggestions.matches.map((config) => (
                    <SearchOption
                      key={config.config_id}
                      title={config.name}
                      detail={`Protocol: ${protocolLabel(config.protocol)} | Driver: ${config.driver_family}`}
                      tooltip={`Filter to ${config.name}`}
                      onClick={() => selectSearchConfig(config.config_id)}
                    />
                  ))}
                  {!searchSuggestions.showAll && searchSuggestions.matches.length === 0 ? (
                    <div style={{ padding: "10px 12px", color: "var(--color-text-muted)", textAlign: "center" }}>
                      No matching configs found
                    </div>
                  ) : null}
                </SearchDropdown>
              ) : null}
            </div>
          </div>

          {loading ? (
            <div style={{ padding: "var(--space-8)", color: "var(--color-text-muted)" }}>
              Loading datasource configurations...
            </div>
          ) : filteredConfigs.length === 0 ? (
            <div style={{ padding: "var(--space-8)", color: "var(--color-text-muted)" }}>
              No datasource configurations found.
            </div>
          ) : (
            <div style={{ display: "grid" }}>
              {filteredConfigs.map((config) => (
                <div key={config.config_id}>
                  <div
                  className="entity-row entity-row--config"
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleExpandedConfig(config.config_id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleExpandedConfig(config.config_id);
                    }
                  }}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 1.1fr) minmax(120px, 0.45fr) minmax(140px, 0.55fr) minmax(110px, 0.45fr) auto",
                    gap: "var(--space-4)",
                    alignItems: "center",
                    padding: "var(--space-5) var(--space-6)",
                    borderTop: "1px solid var(--color-border-soft)",
                    cursor: "pointer",
                  }}
                >
                  <div className="entity-row__primary">
                    <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-1)" }}>
                      {config.name}
                    </div>
                    <div style={{ color: "var(--color-text-muted)" }}>
                      {config.driver_family} - {config.base_url || "No base URL"}
                    </div>
                  </div>
                  <Chip tone="info">{protocolLabel(config.protocol)}</Chip>
                  <Chip tone="info">{config.driver_family}</Chip>
                  <Chip tone={config.is_active ? "success" : "warning"}>
                    {config.is_active ? "Active" : "Inactive"}
                  </Chip>
                  <div className="entity-row__actions" style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <AppButton
                      tooltip={`Edit ${config.name}`}
                      size="sm"
                      variant="secondary"
                      onClick={(event) => {
                        event.stopPropagation();
                        beginEdit(config);
                      }}
                    >
                      Edit
                    </AppButton>
                    <AppButton
                      tooltip={`Delete ${config.name}`}
                      size="sm"
                      variant="ghost"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteTarget(config);
                      }}
                    >
                      Delete
                    </AppButton>
                  </div>
                  </div>
                  {expandedConfigIds.has(config.config_id) ? (
                    <ExpandedConfigDetails config={config} />
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        {editorOpen ? (
          <FloatingPanel
            title={form.configId ? "Edit configuration" : "Create configuration"}
            subtitle={form.configId ? "Edit Config" : "Add Config"}
            onClose={closeEditor}
          >
            <form className="enterprise-form" onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-3)" }}>
              {!form.configId ? (
                <Field label="Select Datasource">
                  <input
                    ref={datasourceSearchRef}
                    value={composerSearch}
                    onChange={(event) => setComposerSearch(event.target.value)}
                    placeholder="Search datasources without configs..."
                    style={inputStyle}
                  />
                  <div
                    style={{
                      display: "grid",
                      gap: "2px",
                      maxHeight: "240px",
                      overflowY: "auto",
                      padding: "var(--space-1)",
                      marginTop: "var(--space-2)",
                      borderRadius: "12px",
                      border: "1px solid var(--color-border-soft)",
                      background: "var(--color-bg-surface)",
                    }}
                  >
                    {filteredComposerDatasources.map((datasource) => (
                      <Tooltip fullWidth key={datasource.datasource_id} content={`Select ${datasource.name}`}>
                        <button
                          type="button"
                          onClick={() => selectDatasource(datasource)}
                          style={{
                            width: "100%",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            textAlign: "left",
                            padding: "6px 8px",
                            minHeight: "36px",
                            borderRadius: "8px",
                            border: `1px solid ${form.selectedDatasourceId === String(datasource.datasource_id) ? "var(--color-primary-200)" : "transparent"}`,
                            background: form.selectedDatasourceId === String(datasource.datasource_id) ? "var(--color-primary-50)" : "transparent",
                            cursor: "pointer",
                          }}
                        >
                          <DatasourceLogo source={datasource} size={22} />
                          <span style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)", marginBottom: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {datasource.name}
                        </div>
                        <div style={{ color: "var(--color-text-muted)", fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {datasource.connection_key} - {datasource.datasource_type}
                        </div>
                          </span>
                          <span style={{ color: "var(--color-text-muted)", fontSize: "16px", lineHeight: 1 }}>
                            +
                          </span>
                        </button>
                      </Tooltip>
                    ))}
                    {!composerSearch.trim() ? (
                      <div style={{ padding: "var(--space-4)", color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
                        Start typing to search datasources without configurations.
                      </div>
                    ) : filteredComposerDatasources.length === 0 ? (
                      <div style={{ padding: "var(--space-4)", color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
                        No datasource without a configuration matches this search.
                      </div>
                    ) : null}
                  </div>
                </Field>
              ) : null}

              <Field label="Name">
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  style={inputStyle}
                  placeholder="Configuration name"
                  readOnly={!form.configId}
                />
              </Field>

              <Field label="Protocol">
                <input
                  value={form.protocol}
                  onChange={(event) => setForm((current) => ({ ...current, protocol: event.target.value }))}
                  style={inputStyle}
                  placeholder="Protocol"
                  readOnly={!form.configId}
                />
              </Field>

              <Field label="Driver Family">
                <input
                  value={form.driverFamily}
                  onChange={(event) => setForm((current) => ({ ...current, driverFamily: event.target.value }))}
                  style={inputStyle}
                  placeholder="Driver family"
                  readOnly={!form.configId}
                />
              </Field>

              <Field label="Base URL">
                <input
                  value={form.baseUrl}
                  onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))}
                  style={inputStyle}
                  placeholder="https://api.example.com"
                />
              </Field>

              <Field label="Auth Type">
                <select
                  value={form.authType}
                  onChange={(event) => setForm((current) => ({ ...current, authType: event.target.value }))}
                  style={inputStyle}
                >
                  <option value="">Select auth type...</option>
                  <option value="oauth2">OAuth 2.0</option>
                  <option value="apikey">API Key</option>
                  <option value="basic">Basic Auth</option>
                  <option value="none">None</option>
                </select>
              </Field>

              <Field label="Auth Config JSON">
                <textarea
                  value={form.authConfig}
                  onChange={(event) => setForm((current) => ({ ...current, authConfig: event.target.value }))}
                  rows={4}
                  style={textareaStyle}
                  placeholder='{"client_id":"...", "token_url":"..."}'
                />
              </Field>

              <Field label="Connection JSON">
                <textarea
                  value={form.connectionJson}
                  onChange={(event) => setForm((current) => ({ ...current, connectionJson: event.target.value }))}
                  rows={4}
                  style={textareaStyle}
                  placeholder='{"host":"...", "port":5432}'
                />
              </Field>

              <Field label="Metadata Reference">
                <input
                  value={form.metadataRef}
                  onChange={(event) => setForm((current) => ({ ...current, metadataRef: event.target.value }))}
                  style={inputStyle}
                />
              </Field>

              <Field label="Router Base URL">
                <input
                  value={form.routerBaseUrl}
                  onChange={(event) => setForm((current) => ({ ...current, routerBaseUrl: event.target.value }))}
                  style={inputStyle}
                />
              </Field>

              <FieldGrid>
                <Field label="Pool Size">
                  <input value={form.poolSize} onChange={(event) => setForm((current) => ({ ...current, poolSize: event.target.value }))} style={inputStyle} type="number" />
                </Field>
                <Field label="Max Overflow">
                  <input value={form.maxOverflow} onChange={(event) => setForm((current) => ({ ...current, maxOverflow: event.target.value }))} style={inputStyle} type="number" />
                </Field>
                <Field label="Pool Timeout">
                  <input value={form.poolTimeoutSeconds} onChange={(event) => setForm((current) => ({ ...current, poolTimeoutSeconds: event.target.value }))} style={inputStyle} type="number" />
                </Field>
                <Field label="Pool Recycle">
                  <input value={form.poolRecycleSeconds} onChange={(event) => setForm((current) => ({ ...current, poolRecycleSeconds: event.target.value }))} style={inputStyle} type="number" />
                </Field>
                <Field label="Profiling Sample Limit">
                  <input value={form.profilingSampleLimit} onChange={(event) => setForm((current) => ({ ...current, profilingSampleLimit: event.target.value }))} style={inputStyle} type="number" />
                </Field>
                <Field label="Default Result Format">
                  <input value={form.defaultResultFormat} onChange={(event) => setForm((current) => ({ ...current, defaultResultFormat: event.target.value }))} style={inputStyle} />
                </Field>
              </FieldGrid>

              <Field label="Driver Service URL">
                <input
                  value={form.driverServiceUrl}
                  onChange={(event) => setForm((current) => ({ ...current, driverServiceUrl: event.target.value }))}
                  style={inputStyle}
                />
              </Field>

              <ToggleRow
                label="SGate Enabled"
                checked={form.sgateEnabled}
                onChange={(checked) => setForm((current) => ({ ...current, sgateEnabled: checked }))}
              />
              <ToggleRow
                label="Profiling Enabled"
                checked={form.profilingEnabled}
                onChange={(checked) => setForm((current) => ({ ...current, profilingEnabled: checked }))}
              />
              <ToggleRow
                label="Default Execute"
                checked={form.defaultExecute}
                onChange={(checked) => setForm((current) => ({ ...current, defaultExecute: checked }))}
              />
              <ToggleRow
                label="Active"
                checked={form.isActive}
                onChange={(checked) => setForm((current) => ({ ...current, isActive: checked }))}
              />

              <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end", flexWrap: "wrap" }}>
                <AppButton tooltip="Close the datasource configuration editor" type="button" variant="secondary" onClick={closeEditor}>
                  Cancel
                </AppButton>
                <AppButton tooltip={form.configId ? "Save datasource configuration changes" : "Create this datasource configuration"} type="submit" disabled={submitting}>
                  {submitting ? "Saving..." : form.configId ? "Save Changes" : "Create Config"}
                </AppButton>
              </div>
            </form>
          </FloatingPanel>
        ) : null}
      </div>

      {deleteTarget ? (
        <DeleteDialog
          title="Delete configuration"
          description={`Are you sure you want to delete ${deleteTarget.name}?`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
          deleting={deletingConfigId === String(deleteTarget.config_id)}
        />
      ) : null}
    </section>
  );
}

function FloatingPanel({ title, subtitle, children, onClose }) {
  return (
    <aside
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

function FieldGrid({ children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
      {children}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4)" }}>
      <span style={{ color: "var(--color-text-base)" }}>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
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

function ExpandedConfigDetails({ config }) {
  const fields = [
    ["Config ID", config.config_id],
    ["Driver ID", config.driver_id],
    ["Name", config.name],
    ["Protocol", config.protocol],
    ["Driver Family", config.driver_family],
    ["Base URL", config.base_url],
    ["Auth Type", config.auth_type],
    ["Metadata Reference", config.metadata_ref],
    ["Router Base URL", config.router_base_url],
    ["Is Active", config.is_active],
    ["Auth Config", config.auth_config],
    ["Connection JSON", config.connection_json],
    ["Vault Secret Path", config.vault_secret_path],
    ["Pool Size", config.pool_size],
    ["Max Overflow", config.max_overflow],
    ["Pool Timeout (s)", config.pool_timeout_seconds],
    ["Pool Recycle (s)", config.pool_recycle_seconds],
    ["SGate Enabled", config.sgate_enabled],
    ["Profiling Enabled", config.profiling_enabled],
    ["Profiling Sample Limit", config.profiling_sample_limit],
    ["Default Execute", config.default_execute],
    ["Default Result Format", config.default_result_format],
    ["Driver Service URL", config.driver_service_url],
    ["Tenant ID", config.tenant_id],
    ["Created At", config.created_at ? new Date(config.created_at).toLocaleString() : null],
    ["Updated At", config.updated_at ? new Date(config.updated_at).toLocaleString() : null],
  ];

  return (
    <div
      style={{
        borderTop: "1px solid var(--color-border-soft)",
        background: "var(--color-bg-elevated)",
        padding: "var(--space-5) var(--space-6)",
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "var(--space-4)" }}>
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
  if (typeof value === "object") {
    return (
      <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "var(--font-family-mono)", fontSize: "var(--font-size-xs)" }}>
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  return String(value);
}

function Banner({ tone, title, detail }) {
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
    </div>
  );
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

function DeleteDialog({ title, description, onCancel, onConfirm, deleting = false }) {
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
          {title}
        </div>
        <div style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-6)" }}>
          {description}
        </div>
        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}>
          <AppButton tooltip="Cancel this deletion" variant="secondary" onClick={onCancel} disabled={deleting}>
            Cancel
          </AppButton>
          <AppButton tooltip="Confirm this deletion" onClick={onConfirm} loading={deleting}>
            {deleting ? "Deleting..." : "Delete"}
          </AppButton>
        </div>
      </div>
    </div>
  );
}

function numericOrNull(value) {
  return value === "" ? null : Number(value);
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

const textareaStyle = {
  ...inputStyle,
  minHeight: "92px",
  padding: "10px 12px",
  resize: "vertical",
  fontFamily: "var(--font-family-mono)",
};

const searchInputStyle = {
  width: "100%",
  minHeight: "38px",
  padding: "0 12px",
  borderRadius: "var(--radius-xs)",
  border: "1px solid var(--color-border-base)",
  background: "var(--color-bg-surface)",
};
