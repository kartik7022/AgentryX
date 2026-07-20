import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Banner as NoticeBanner } from "../../components/feedback/Banner";
import { AppButton } from "../../components/primitives/AppButton";
import { Tooltip } from "../../components/primitives/Tooltip";
import { TypeaheadSelect } from "../../components/primitives/TypeaheadSelect";
import { credentialsApi } from "../../lib/credentials";
import { fetchDatasourceTypes } from "../../lib/datasources";
import { useAuth } from "../../providers/AuthProvider";

const emptyState = {
  selectedDatasourceId: "",
  values: {},
  passed: false,
  locked: false,
  dirty: false,
  status: "Idle",
  result: null,
};

export function CredentialsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [datasourceTypes, setDatasourceTypes] = useState([]);
  const [datasources, setDatasources] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState(emptyState);

  const tenantId = searchParams.get("tenant") || user?.tenantId || "";
  const autoDatasourceId = searchParams.get("datasource_id") || "";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!tenantId) return;
      setLoading(true);
      const [typeResult, datasourceResult] = await Promise.allSettled([
        fetchDatasourceTypes(),
        credentialsApi.flowengineDatasources(tenantId),
      ]);

      if (cancelled) return;

      if (typeResult.status === "fulfilled")
        setDatasourceTypes(typeResult.value || []);
      if (datasourceResult.status === "fulfilled")
        setDatasources(datasourceResult.value || []);

      const failures = [];
      if (typeResult.status === "rejected")
        failures.push(
          `datasource types: ${typeResult.reason?.message || "request failed"}`,
        );
      if (datasourceResult.status === "rejected")
        failures.push(
          `datasources: ${datasourceResult.reason?.message || "request failed"}`,
        );

      setState((current) => ({
        ...current,
        result: failures.length
          ? {
              tone: "error",
              title: "Failed to load credentials data",
              detail: failures.join("; "),
            }
          : current.result,
        selectedDatasourceId: autoDatasourceId || current.selectedDatasourceId,
      }));
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [autoDatasourceId, tenantId]);

  const selectedDatasource = useMemo(
    () =>
      datasources.find(
        (entry) =>
          String(entry.datasource_id) === String(state.selectedDatasourceId),
      ) || null,
    [datasources, state.selectedDatasourceId],
  );

  const currentType = useMemo(() => {
    if (!selectedDatasource) return null;
    return (
      datasourceTypes.find(
        (type) =>
          type.datasource_type === selectedDatasource.datasource_type ||
          type.canonical_name === selectedDatasource.datasource_type ||
          type.driver_family === selectedDatasource.datasource_type,
      ) || null
    );
  }, [datasourceTypes, selectedDatasource]);

  const fields = useMemo(() => {
    if (!currentType) return [];
    return [
      ...(currentType.required_fields || []).map((field) => ({
        ...field,
        required: true,
      })),
      ...(currentType.optional_fields || []).map((field) => ({
        ...field,
        required: false,
      })),
    ];
  }, [currentType]);

  function resetForSelection(next) {
    setState((current) => ({
      ...current,
      ...next,
      values: {},
      passed: false,
      locked: false,
      dirty: false,
      status: "Idle",
      result: null,
    }));
  }

  function updateValue(name, value) {
    setState((current) => ({
      ...current,
      values: {
        ...current.values,
        [name]: value,
      },
      passed: false,
      locked: false,
      dirty: true,
      status: "Idle",
      result: null,
    }));
  }

  function validateRequired() {
    const missing = fields
      .filter(
        (field) =>
          field.required && !String(state.values[field.name] || "").trim(),
      )
      .map((field) => field.label || field.name);
    if (missing.length) {
      setState((current) => ({
        ...current,
        result: {
          tone: "error",
          title: "Validation Error",
          detail: `Fill in: ${missing.join(", ")}`,
        },
      }));
      return false;
    }
    return true;
  }

  function connectionParams() {
    return Object.fromEntries(
      Object.entries(state.values)
        .map(([key, value]) => [
          key,
          typeof value === "string" ? value.trim() : value,
        ])
        .filter(
          ([, value]) => value !== "" && value !== null && value !== undefined,
        ),
    );
  }

  async function testConnection() {
    if (!selectedDatasource) {
      setState((current) => ({
        ...current,
        result: {
          tone: "error",
          title: "No Datasource Selected",
          detail: "Please select a datasource first.",
        },
      }));
      return;
    }
    if (!selectedDatasource.config_id) {
      setState((current) => ({
        ...current,
        passed: false,
        locked: false,
        status: "Config Required",
        result: {
          tone: "error",
          title: "Datasource Configuration Required",
          detail:
            "Create a datasource configuration before adding credentials. The Vault path is stored on the configuration row.",
        },
      }));
      return;
    }
    if (!currentType) {
      setState((current) => ({
        ...current,
        result: {
          tone: "error",
          title: "Unknown Type",
          detail: "No credential definition for this datasource type.",
        },
      }));
      return;
    }
    if (!state.dirty) {
      setState((current) => ({
        ...current,
        result: {
          tone: "warning",
          title: "No Changes",
          detail: "Edit at least one credential field before testing or fetching metadata.",
        },
      }));
      return;
    }
    if (!validateRequired()) return;

    setTesting(true);
    setState((current) => ({ ...current, status: "Testing...", result: null }));

    try {
      const payload = {
        flowengine_datasource_id: selectedDatasource.datasource_id,
        datasource_type: selectedDatasource.datasource_type,
        tenant_id: tenantId,
        datasource_name: selectedDatasource.name,
        connection_params: connectionParams(),
      };

      const data = await credentialsApi.testDatasource(payload);

      if (data.connection_status === "VERIFIED") {
        setState((current) => ({
          ...current,
          passed: true,
          locked: true,
          status: "Verified",
          result: {
            tone: "success",
            title: "Connection Successful",
            detail:
              data.message || `Connected - ${new Date().toLocaleTimeString()}`,
          },
        }));
      } else {
        setState((current) => ({
          ...current,
          passed: false,
          locked: false,
          status: "Failed",
          result: {
            tone: "error",
            title: "Connection Failed",
            detail:
              data.last_error_summary || data.message || "Could not connect.",
          },
        }));
      }
    } catch (error) {
      setState((current) => ({
        ...current,
        passed: false,
        locked: false,
        status: "Error",
        result: {
          tone: "error",
          title: "Request Error",
          detail: error.message || "Backend unreachable.",
        },
      }));
    } finally {
      setTesting(false);
    }
  }

  async function saveCredentials() {
    if (!state.passed) return;
    if (!state.dirty) {
      setState((current) => ({
        ...current,
        result: {
          tone: "warning",
          title: "No Changes",
          detail: "There are no credential changes to save or fetch.",
        },
      }));
      return;
    }
    if (!selectedDatasource?.config_id) {
      setState((current) => ({
        ...current,
        passed: false,
        locked: false,
        status: "Config Required",
        result: {
          tone: "error",
          title: "Datasource Configuration Required",
          detail:
            "Credentials cannot be saved until the datasource has a configuration row.",
        },
      }));
      return;
    }
    setSaving(true);

    try {
      if (selectedDatasource.datasource_mode === "query") {
        localStorage.setItem(
          "metadata_pending",
          JSON.stringify({
            datasourceName: selectedDatasource.name,
            datasourceMode: selectedDatasource.datasource_mode,
          }),
        );
        window.dispatchEvent(new Event("metadata-pending"));
        setState((current) => ({
          ...current,
          passed: false,
          locked: true,
          dirty: false,
          status: "Metadata Pending",
          result: {
            tone: "success",
            title: "Connection Successful",
            detail:
              "Credentials are not stored for query mode. Continue with metadata fetch.",
          },
        }));
        return;
      }

      const data = await credentialsApi.saveDatasource({
        flowengine_datasource_id: selectedDatasource.datasource_id,
        config_id: selectedDatasource.config_id,
        datasource_type: selectedDatasource.datasource_type,
        datasource_name: selectedDatasource.name,
        tenant_id: tenantId,
        connection_params: connectionParams(),
      });

      localStorage.setItem(
        "metadata_pending",
        JSON.stringify({
          datasourceName: selectedDatasource.name,
          datasourceMode: selectedDatasource.datasource_mode,
        }),
      );
      window.dispatchEvent(new Event("metadata-pending"));
      setState((current) => ({
        ...current,
        passed: false,
        locked: true,
        dirty: false,
        status: "Saved to Vault",
        result: {
          tone: "success",
          title: "Credentials Saved",
          detail: data.vault_secret_path,
        },
      }));
      setDatasources(
        await credentialsApi
          .flowengineDatasources(tenantId)
          .catch(() => datasources),
      );
    } catch (error) {
      setState((current) => ({
        ...current,
        result: {
          tone: "error",
          title: "Save Failed",
          detail: error.message || "Failed to save credentials.",
        },
      }));
    } finally {
      setSaving(false);
    }
  }

  const activeRecord = selectedDatasource;
  const hasExistingVault = Boolean(selectedDatasource?.vault_secret_path);
  const hasDatasourceConfig = Boolean(selectedDatasource?.config_id);
  const configRoute = selectedDatasource
    ? `/app/datasource-configs?datasourceId=${encodeURIComponent(selectedDatasource.datasource_id)}`
    : "/app/datasource-configs";

  return (
    <section>
      <PageHeader
        title="Credentials"
        description="Select a datasource, test its credentials, and save datasource secrets to Vault."
        actions={
          <div
            style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}
          >
            <AppButton
              tooltip="Open datasource management"
              variant="secondary"
              onClick={() => navigate("/app/datasources")}
            >
              Datasources
            </AppButton>
          </div>
        }
      />

      {state.result ? <NoticeBanner {...state.result} /> : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(280px, 360px) minmax(0, 1fr)",
          gap: "var(--space-6)",
          alignItems: "start",
        }}
      >
        <div className="surface-card" style={{ padding: "var(--space-6)" }}>
          <Field label="Choose a datasource">
            <TypeaheadSelect
              value={search}
              onInputChange={(nextSearch) => {
                setSearch(nextSearch);
                if (
                  selectedDatasource &&
                  nextSearch !== selectedDatasource.name
                ) {
                  resetForSelection({ selectedDatasourceId: "" });
                }
              }}
              options={datasources}
              getKey={(datasource) => datasource.datasource_id}
              getLabel={(datasource) => datasource.name}
              getDetail={(datasource) =>
                `${datasource.datasource_type} - ${datasource.is_active ? "Active" : "Inactive"} - Config: ${datasource.config_id ? "Ready" : "Missing"}`
              }
              onSelect={(datasource) => {
                setSearch(datasource.name);
                resetForSelection({
                  selectedDatasourceId: String(datasource.datasource_id),
                });
              }}
              placeholder={
                loading
                  ? "Loading datasources..."
                  : "Type to search datasources..."
              }
              emptyText="No datasources match your search."
              startText="Start typing to search datasources."
              inputStyle={inputStyle}
              disabled={loading}
              selectOnFocus
            />
          </Field>
          {loading ? (
            <EmptyState text="Loading datasources from AgentryX..." />
          ) : selectedDatasource ? (
            <div
              style={{
                marginTop: "var(--space-3)",
                padding: "12px 14px",
                borderRadius: "var(--radius-xs)",
                border: "1px solid var(--color-primary-200)",
                background: "var(--color-primary-50)",
              }}
            >
              <div
                style={{
                  fontWeight: "var(--font-weight-semibold)",
                  marginBottom: "var(--space-1)",
                }}
              >
                {selectedDatasource.name}
              </div>
              <div
                style={{
                  color: "var(--color-text-muted)",
                  fontSize: "var(--font-size-xs)",
                }}
              >
                {`${selectedDatasource.datasource_type} - ${selectedDatasource.is_active ? "Active" : "Inactive"} - Config: ${selectedDatasource.config_id ? "Ready" : "Missing"}`}
              </div>
            </div>
          ) : (
            <EmptyState text="Start typing to find a configured datasource." />
          )}
        </div>

        <div className="surface-card" style={{ padding: "var(--space-6)" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "var(--space-4)",
              alignItems: "flex-start",
              flexWrap: "wrap",
              marginBottom: "var(--space-5)",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "var(--font-size-lg)",
                  fontWeight: "var(--font-weight-bold)",
                  marginBottom: "var(--space-1)",
                }}
              >
                {activeRecord
                  ? recordName(activeRecord)
                  : "No datasource selected"}
              </div>
              <div style={{ color: "var(--color-text-muted)" }}>
                {activeRecord
                  ? recordDetail(activeRecord)
                  : "Choose a datasource first."}
              </div>
            </div>
            <Chip
              tone={
                state.status === "Verified" || state.status === "Saved to Vault"
                  ? "success"
                  : state.status === "Failed" || state.status === "Error"
                    ? "error"
                    : "info"
              }
            >
              {state.status}
            </Chip>
          </div>

          {hasExistingVault ? (
            <NoticeBanner
              tone="success"
              title="Already Configured"
              detail={selectedDatasource?.vault_secret_path}
              autoDismissMs={0}
            />
          ) : null}

          {activeRecord && !hasDatasourceConfig ? (
            <NoticeBanner
              tone="warning"
              title="Datasource Configuration Required"
              detail="Create a datasource configuration first. Vault path is saved to the configuration row, so this page is locked until that row exists."
              actionLabel="Open Datasource Configs"
              onAction={() => navigate(configRoute)}
              autoDismissMs={0}
            />
          ) : null}

          {activeRecord && !currentType ? (
            <NoticeBanner
              tone="error"
              title="Unknown Type"
              detail="No credential fields defined for this datasource type."
              autoDismissMs={0}
            />
          ) : null}

          {fields.length > 0 && hasDatasourceConfig ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "var(--space-4)",
                marginBottom: "var(--space-6)",
              }}
            >
              {fields.map((field) => (
                <Field
                  key={field.name}
                  label={`${field.label}${field.required ? " *" : " (optional)"}`}
                >
                  <input
                    value={state.values[field.name] || ""}
                    onChange={(event) =>
                      updateValue(field.name, event.target.value)
                    }
                    type={field.type === "password" ? "password" : "text"}
                    style={inputStyle}
                    disabled={state.locked}
                    autoComplete="off"
                  />
                </Field>
              ))}
            </div>
          ) : (
            <EmptyState
              text={
                activeRecord && !hasDatasourceConfig
                  ? "Create a datasource configuration first to unlock credential fields."
                  : "Credential fields will appear after you select a configured resource."
              }
            />
          )}

          {state.locked ? (
            <NoticeBanner
              tone="success"
              title="Fields Locked"
              detail="Connection verified. Reset fields if you need to edit values before saving."
              autoDismissMs={0}
            />
          ) : null}

          <div
            style={{
              display: "flex",
              gap: "var(--space-3)",
              justifyContent: "space-between",
              flexWrap: "wrap",
            }}
          >
            <AppButton
              tooltip="Reset the credential fields"
              type="button"
              variant="ghost"
              onClick={() =>
                setState((current) => ({
                  ...current,
                  values: {},
                  passed: false,
                  locked: false,
                  dirty: false,
                  status: "Idle",
                  result: null,
                }))
              }
            >
              Reset Fields
            </AppButton>
            <div
              style={{
                display: "flex",
                gap: "var(--space-3)",
                flexWrap: "wrap",
              }}
            >
              <AppButton
                tooltip="Test the connection with the entered credentials"
                type="button"
                variant="secondary"
                onClick={testConnection}
                disabled={
                  !activeRecord || !hasDatasourceConfig || !state.dirty || testing
                }
              >
                {testing ? "Testing..." : "Test Connection"}
              </AppButton>
              <AppButton
                tooltip={
                  selectedDatasource?.datasource_mode === "query"
                    ? "Fetch metadata"
                    : "Save credentials to Vault"
                }
                type="button"
                onClick={saveCredentials}
                disabled={
                  !hasDatasourceConfig || !state.passed || !state.dirty || saving
                }
              >
                {saving
                  ? "Saving..."
                  : selectedDatasource?.datasource_mode === "query"
                    ? "Fetch Metadata"
                    : "Save & Fetch Metadata"}
              </AppButton>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PageHeader({ title, description, actions }) {
  return (
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
        <h1
          style={{
            margin: 0,
            color: "var(--color-text-strong)",
            fontSize: "var(--font-size-lg)",
            fontWeight: "var(--font-weight-bold)",
            letterSpacing: "var(--tracking-tight)",
          }}
        >
          {title}
        </h1>
        <p
          style={{
            margin: "var(--space-3) 0 0",
            color: "var(--color-text-muted)",
            maxWidth: "72ch",
          }}
        >
          {description}
        </p>
      </div>
      {actions}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "grid", gap: "var(--space-2)" }}>
      <span className="mono-label" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function SelectableRow({ selected, title, detail, onClick }) {
  return (
    <Tooltip content={`Select ${title}`}>
      <button
        type="button"
        onClick={onClick}
        style={{
          textAlign: "left",
          padding: "12px 14px",
          borderRadius: "var(--radius-xs)",
          border: `1px solid ${selected ? "var(--color-primary-200)" : "var(--color-border-soft)"}`,
          background: selected
            ? "var(--color-primary-50)"
            : "var(--color-bg-surface)",
          color: "var(--color-text-base)",
        }}
      >
        <div
          style={{
            fontWeight: "var(--font-weight-semibold)",
            marginBottom: "var(--space-1)",
          }}
        >
          {title}
        </div>
        <div
          style={{
            color: "var(--color-text-muted)",
            fontSize: "var(--font-size-xs)",
          }}
        >
          {detail}
        </div>
      </button>
    </Tooltip>
  );
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
    info: {
      border: "var(--color-status-info-border)",
      background: "var(--color-status-info-bg)",
      color: "var(--color-status-info-text)",
    },
  };
  return (
    <div
      style={{
        marginBottom: "var(--space-5)",
        padding: "14px 16px",
        borderRadius: "var(--radius-sm)",
        border: `1px solid ${styles[tone].border}`,
        background: styles[tone].background,
        color: styles[tone].color,
      }}
    >
      <div
        style={{
          fontWeight: "var(--font-weight-semibold)",
          marginBottom: "var(--space-1)",
        }}
      >
        {title}
      </div>
      <div style={{ overflowWrap: "anywhere" }}>{detail}</div>
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
    error: {
      background: "var(--color-status-error-bg)",
      color: "var(--color-status-error-text)",
      border: "var(--color-status-error-border)",
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

function EmptyState({ text }) {
  return (
    <div
      style={{ padding: "var(--space-4)", color: "var(--color-text-muted)" }}
    >
      {text}
    </div>
  );
}

function recordName(record) {
  return record.name;
}

function recordDetail(record) {
  return `${record.datasource_type}${record.connection_key ? ` - key: ${record.connection_key}` : ""}`;
}

const inputStyle = {
  width: "100%",
  minHeight: "44px",
  padding: "0 14px",
  borderRadius: "var(--radius-xs)",
  border: "1px solid var(--color-border-base)",
  background: "var(--color-bg-surface)",
  color: "var(--color-text-strong)",
  outline: "none",
};
