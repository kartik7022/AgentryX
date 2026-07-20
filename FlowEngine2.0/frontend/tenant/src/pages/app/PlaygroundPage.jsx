import { useEffect, useMemo, useState } from "react";
import { Banner as NoticeBanner } from "../../components/feedback/Banner";
import { AppButton } from "../../components/primitives/AppButton";
import { TypeaheadSelect } from "../../components/primitives/TypeaheadSelect";
import { useAuth } from "../../providers/AuthProvider";
import { fetchDatasources } from "../../lib/datasources";
import { fetchDatasourceConfigs } from "../../lib/datasource-configs";
import { playgroundApi } from "../../lib/playground";

export function PlaygroundPage() {
  const { user } = useAuth();
  const [datasources, setDatasources] = useState([]);
  const [configs, setConfigs] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [datasourceSearch, setDatasourceSearch] = useState("");
  const [currentAction, setCurrentAction] = useState("");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);
  const [executedAt, setExecutedAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    loadDatasources().catch(() => null);
  }, []);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        loadDatasources().catch(() => null);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  async function loadDatasources() {
    setLoading(true);
    try {
      const [datasourceResult, configResult] = await Promise.allSettled([
        fetchDatasources(),
        fetchDatasourceConfigs(),
      ]);

      if (datasourceResult.status === "fulfilled") {
        setDatasources((datasourceResult.value || []).filter((entry) => entry.is_active));
      }

      if (configResult.status === "fulfilled") {
        setConfigs(configResult.value || []);
      }

      const failures = [];
      if (datasourceResult.status === "rejected") {
        failures.push(`datasources: ${datasourceResult.reason?.message || "request failed"}`);
      }
      if (configResult.status === "rejected") {
        failures.push(`configs: ${configResult.reason?.message || "request failed"}`);
      }

      if (failures.length > 0) {
        setBanner({
          tone: "error",
          title: "Failed to load playground data",
          detail: failures.join("; "),
        });
      }
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Failed to load datasources",
        detail: error.message || "Unable to load active datasources.",
      });
    } finally {
      setLoading(false);
    }
  }

  const selectedDatasource = useMemo(
    () => datasources.find((entry) => String(entry.datasource_id) === String(selectedId)) || null,
    [datasources, selectedId],
  );

  const selectedConfig = useMemo(() => {
    if (!selectedDatasource) return null;

    return configs.find((config) => (
      String(config.datasource_id || "") === String(selectedDatasource.datasource_id) ||
      String(config.config_id || "") === String(selectedDatasource.config_id || "") ||
      String(config.name || "") === String(selectedDatasource.connection_key || "")
    )) || null;
  }, [configs, selectedDatasource]);

  const selectedCredentialPath =
    selectedDatasource?.vault_secret_path ||
    selectedConfig?.vault_secret_path ||
    selectedConfig?.secret_path ||
    selectedConfig?.vault_path ||
    "";

  const activeStep = selectedDatasource ? (currentAction ? (result ? 4 : 3) : 2) : 1;

  function handleDatasourceChange(value) {
    setSelectedId(value);
    const datasource = datasources.find((entry) => String(entry.datasource_id) === String(value));
    setDatasourceSearch(datasource ? datasource.name : "");
    setCurrentAction("");
    setQuery("");
    setResult(null);
    setExecutedAt("");
    setBanner(null);
  }

  function handleActionChange(action) {
    setCurrentAction(action);
    setQuery("");
    setResult(null);
    setExecutedAt("");
    setBanner(null);
  }

  async function execute() {
    if (!selectedDatasource) {
      setBanner({ tone: "warning", title: "Datasource required", detail: "Please choose an active datasource first." });
      return;
    }
    if (!currentAction) {
      setBanner({ tone: "warning", title: "Action required", detail: "Please choose Fetch Data or Generate SQL." });
      return;
    }
    if (!query.trim()) {
      setBanner({ tone: "warning", title: "Input required", detail: "Please enter a SQL query or intent prompt." });
      return;
    }

    setExecuting(true);
    setResult(null);
    setBanner(null);
    try {
      const payload = {
        action: currentAction === "fetch" ? "fetch_data" : "generate_sql",
        datasource_type: selectedDatasource.datasource_type,
        datasource_name: selectedDatasource.name,
        vault_secret_path: selectedCredentialPath,
        connection_key: selectedDatasource.connection_key,
        tenant_id: user?.tenantId,
        datasource_id: selectedDatasource.datasource_id,
        query: currentAction === "fetch" ? query.trim() : "",
        intent: currentAction === "sql" ? query.trim() : "",
        connection_params: {},
      };
      const data = await playgroundApi.execute(payload);
      setResult(data);
      setExecutedAt(new Date().toLocaleTimeString());
    } catch (error) {
      const message = error.message || "Failed to execute playground request.";
      setResult({ error: message });
      setBanner({
        tone: "error",
        title: "Playground request failed",
        detail: message,
      });
      setExecutedAt(new Date().toLocaleTimeString());
    } finally {
      setExecuting(false);
    }
  }

  return (
    <section>
      <div style={{ marginBottom: "var(--space-6)" }}>
        <h1 style={{ margin: 0, color: "var(--color-text-strong)", fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", letterSpacing: "var(--tracking-tight)" }}>Playground</h1>
        <p style={{ margin: "var(--space-3) 0 0", color: "var(--color-text-muted)", maxWidth: "72ch" }}>Run direct fetch queries or generate SQL from intent prompts against connected datasources.</p>
      </div>

      {banner ? <NoticeBanner {...banner} /> : null}

      <div className="surface-card" style={{ padding: "var(--space-8)", display: "grid", gap: "var(--space-5)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--space-3)" }}>
          <StepCard index={1} label="Choose datasource" active={activeStep === 1} done={activeStep > 1} />
          <StepCard index={2} label="Select action" active={activeStep === 2} done={activeStep > 2} />
          <StepCard index={3} label="Run request" active={activeStep >= 3} done={activeStep > 3} />
        </div>

        <Field label="Choose Datasource">
          <TypeaheadSelect
            value={datasourceSearch}
            onInputChange={(next) => {
              setDatasourceSearch(next);
              setSelectedId("");
              setCurrentAction("");
              setQuery("");
              setResult(null);
              setExecutedAt("");
            }}
            options={datasources}
            getKey={(datasource) => datasource.datasource_id}
            getLabel={(datasource) => datasource.name}
            getDetail={(datasource) => `${datasource.connection_key || ""} ${datasource.datasource_type} - ${credentialPathFor(datasource, configs) ? "Credentials configured" : "No credentials"}`}
            onSelect={(datasource) => handleDatasourceChange(String(datasource.datasource_id))}
            placeholder="Type to search active datasources..."
            emptyText="No active datasource matches this search."
            startText="Start typing a datasource name, type, or connection key."
            inputStyle={inputStyle}
          />
        </Field>

        {loading ? <div style={{ color: "var(--color-text-muted)" }}>Loading datasources...</div> : null}
        {!loading && datasources.length === 0 ? (
          <NoticeBanner
            tone="warning"
            title="No active datasources"
            detail="Create and activate a datasource before using the playground."
            autoDismissMs={0}
          />
        ) : null}

        {selectedDatasource ? (
          <>
            <div className="surface-card" style={{ padding: "var(--space-5)", background: "var(--color-bg-elevated)" }}>
              <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-2)" }}>{selectedDatasource.name}</div>
              <div style={{ color: "var(--color-text-muted)" }}>{selectedDatasource.datasource_type} - {selectedCredentialPath ? "Credentials configured" : "No credentials configured"}</div>
            </div>

            {!selectedCredentialPath ? (
              <NoticeBanner
                tone="warning"
                title="Credentials not configured"
                detail="This datasource is active but does not have a Vault secret path yet."
                autoDismissMs={0}
              />
            ) : null}

            <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
              <AppButton tooltip="Switch to direct data fetch mode" variant={currentAction === "fetch" ? "primary" : "secondary"} onClick={() => handleActionChange("fetch")}>Fetch Data</AppButton>
              <AppButton tooltip="Switch to SQL generation mode" variant={currentAction === "sql" ? "primary" : "secondary"} onClick={() => handleActionChange("sql")}>Generate SQL</AppButton>
            </div>

            {currentAction ? (
              <>
                <Field label={currentAction === "fetch" ? "SQL Query" : "Intent Prompt"}>
                  <textarea value={query} onChange={(event) => setQuery(event.target.value)} rows={6} style={textareaStyle} placeholder={currentAction === "fetch" ? "SELECT * FROM customers LIMIT 10" : "Show me total sales by region for last month"} />
                </Field>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap" }}>
                  <AppButton tooltip="Reset playground input" variant="ghost" onClick={() => { setQuery(""); setResult(null); setExecutedAt(""); }}>Reset</AppButton>
                  <AppButton tooltip="Execute the current playground request" onClick={execute} disabled={executing || !query.trim()}>{executing ? "Executing..." : "Run"}</AppButton>
                </div>
              </>
            ) : null}
          </>
        ) : null}
      </div>

      {result ? (
        <div className="surface-card" style={{ marginTop: "var(--space-6)", padding: "var(--space-6)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
            <div style={{ fontWeight: "var(--font-weight-semibold)" }}>{currentAction === "sql" ? "Generated SQL" : "Query Result"}</div>
            <div className="mono-label" style={{ color: "var(--color-text-soft)" }}>
              {currentAction === "fetch" ? `${result.rows_returned ?? (Array.isArray(result.data) ? result.data.length : "-")} rows - ` : ""}{executedAt}
            </div>
          </div>

          {"error" in result ? (
            <div style={{ color: "var(--color-status-error-text)" }}>{result.error}</div>
          ) : currentAction === "sql" ? (
            <pre style={codeStyle}>{result.sql || result.query_executed || JSON.stringify(result, null, 2)}</pre>
          ) : Array.isArray(result.data) && result.data.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {Object.keys(result.data[0]).map((column) => <th key={column} style={cellHeadStyle}>{column}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((row, index) => (
                    <tr key={index}>
                      {Object.keys(result.data[0]).map((column) => <td key={column} style={cellStyle}>{String(row[column] ?? "")}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <pre style={codeStyle}>{JSON.stringify(result, null, 2)}</pre>
          )}
        </div>
      ) : null}
    </section>
  );
}

function Field({ label, children }) { return <label style={{ display: "grid", gap: "var(--space-2)" }}><span className="mono-label" style={{ color: "var(--color-text-muted)" }}>{label}</span>{children}</label>; }
function StepCard({ index, label, active, done }) { return <div style={{ padding: "var(--space-4)", borderRadius: "var(--radius-sm)", border: `1px solid ${active ? "var(--color-primary-200)" : "var(--color-border-soft)"}`, background: done ? "var(--color-status-success-bg)" : active ? "var(--color-primary-50)" : "var(--color-bg-elevated)" }}><div className="mono-label" style={{ color: done ? "var(--color-status-success-text)" : active ? "var(--color-primary-700)" : "var(--color-text-soft)", marginBottom: "var(--space-2)" }}>Step {index}</div><div style={{ fontWeight: "var(--font-weight-semibold)" }}>{label}</div></div>; }
function Banner({ tone, title, detail }) { const styles = { success: { border: "var(--color-status-success-border)", background: "var(--color-status-success-bg)", color: "var(--color-status-success-text)" }, warning: { border: "var(--color-status-warning-border)", background: "var(--color-status-warning-bg)", color: "var(--color-status-warning-text)" }, error: { border: "var(--color-status-error-border)", background: "var(--color-status-error-bg)", color: "var(--color-status-error-text)" }, }; return <div style={{ marginBottom: "var(--space-6)", padding: "14px 16px", borderRadius: "var(--radius-sm)", border: `1px solid ${styles[tone].border}`, background: styles[tone].background, color: styles[tone].color }}><div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-1)" }}>{title}</div><div>{detail}</div></div>; }

function credentialPathFor(datasource, configs) {
  if (!datasource) return "";
  const config = (configs || []).find((entry) => (
    String(entry.datasource_id || "") === String(datasource.datasource_id) ||
    String(entry.config_id || "") === String(datasource.config_id || "") ||
    String(entry.name || "") === String(datasource.connection_key || "")
  ));

  return datasource.vault_secret_path || config?.vault_secret_path || config?.secret_path || config?.vault_path || "";
}

const inputStyle = { width: "100%", minHeight: "44px", padding: "0 14px", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-base)", background: "var(--color-bg-surface)", color: "var(--color-text-strong)", outline: "none" };
const textareaStyle = { ...inputStyle, minHeight: "140px", padding: "12px 14px", resize: "vertical", fontFamily: "var(--font-family-mono)" };
const codeStyle = { margin: 0, padding: "16px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-soft)", background: "var(--color-bg-elevated)", overflowX: "auto", fontFamily: "var(--font-family-mono)", fontSize: "var(--font-size-xs)" };
const cellHeadStyle = { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid var(--color-border-soft)", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" };
const cellStyle = { padding: "10px 12px", borderBottom: "1px solid var(--color-border-soft)", fontSize: "var(--font-size-sm)" };
