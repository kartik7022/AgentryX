import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Banner as NoticeBanner } from "../../components/feedback/Banner";
import { AppButton } from "../../components/primitives/AppButton";
import { Tooltip } from "../../components/primitives/Tooltip";
import { apiKeysApi } from "../../lib/api-keys";
import { fetchDatasourceConfigs } from "../../lib/datasource-configs";
import { fetchDatasources } from "../../lib/datasources";
import { inboxesApi } from "../../lib/inboxes";
import { intentsApi } from "../../lib/intents";
import { rolesApi } from "../../lib/roles";
import { rulesApi } from "../../lib/rules";
import { usersApi } from "../../lib/users";

export function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    datasources: 0,
    configs: 0,
    users: 0,
    inboxes: 0,
    apiKeys: 0,
    intents: 0,
    policies: 0,
    rules: 0,
    roles: 0,
    activeDatasources: 0,
    configuredDatasources: 0,
  });
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [datasources, configs, users, inboxes, apiKeys, intents, policies, rules, roles] = await Promise.all([
          fetchDatasources().catch(() => []),
          fetchDatasourceConfigs().catch(() => []),
          usersApi.list().catch(() => []),
          inboxesApi.list().catch(() => []),
          apiKeysApi.list().catch(() => ({ api_keys: [] })),
          intentsApi.list().catch(() => []),
          intentsApi.allPolicies().catch(() => []),
          rulesApi.list().catch(() => []),
          rolesApi.list().catch(() => []),
        ]);
        if (cancelled) return;
        setStats({
          datasources: datasources.length || 0,
          configs: configs.length || 0,
          users: users.length || 0,
          inboxes: inboxes.length || 0,
          apiKeys: (apiKeys.api_keys || []).length || 0,
          intents: intents.length || 0,
          policies: policies.length || 0,
          rules: rules.length || 0,
          roles: roles.length || 0,
          activeDatasources: datasources.filter((datasource) => datasource.is_active).length || 0,
          configuredDatasources: datasources.filter((datasource) => datasource.vault_secret_path).length || 0,
        });
        setBanner(null);
      } catch (error) {
        if (!cancelled) {
          setBanner({
            tone: "error",
            title: "Dashboard refresh failed",
            detail: error.message || "Unable to refresh dashboard data.",
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
  }, [refreshTick]);

  const cards = [
    { label: "Datasources", value: stats.datasources, to: "/app/datasources", detail: "Datasource records and connector types" },
    { label: "Configs", value: stats.configs, to: "/app/datasource-configs", detail: "Configuration records and connection metadata" },
    { label: "Configured", value: stats.configuredDatasources, to: "/app/credentials", detail: "Datasources with Vault credentials" },
    { label: "Users", value: stats.users, to: "/app/users", detail: "Tenant users and module assignments" },
    { label: "Roles", value: stats.roles, to: "/app/roles", detail: "RBAC roles and access review" },
    { label: "Inboxes", value: stats.inboxes, to: "/app/connected-inboxes", detail: "Connected email channels" },
    { label: "API Keys", value: stats.apiKeys, to: "/app/api-keys", detail: "Current API access secrets" },
    { label: "Intents", value: stats.intents, to: "/app/intents", detail: "Intent and policy configuration" },
    { label: "Policies", value: stats.policies, to: "/app/intent-policies", detail: "Intent confidence and routing policies" },
    { label: "Rules", value: stats.rules, to: "/app/rules", detail: "Validation and execution rules" },
  ];

  return (
    <section>
      <h1 style={{ margin: 0, color: "var(--color-text-strong)", fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", letterSpacing: "var(--tracking-tight)" }}>
        Dashboard
      </h1>
      <p style={{ maxWidth: "68ch", color: "var(--color-text-muted)", marginTop: "var(--space-4)", marginBottom: "var(--space-6)" }}>
        Manage datasources, credentials, users, intents, validation rules, API keys, and billing.
      </p>

      {banner ? <NoticeBanner {...banner} /> : null}

      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-6)" }}>
        <AppButton tooltip="Open datasource creation and management" onClick={() => navigate("/app/datasources")}>
          Open Datasources
        </AppButton>
        <AppButton tooltip="Open subscription details" variant="secondary" onClick={() => navigate("/app/billing")}>
          Subscription Details
        </AppButton>
        <AppButton
          tooltip="Refresh dashboard statistics"
          variant="secondary"
          size="sm"
          aria-label="Refresh dashboard statistics"
          style={{ width: "38px", padding: 0 }}
          onClick={() => setRefreshTick((value) => value + 1)}
        >
          ↻
        </AppButton>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--space-4)" }}>
        {cards.map((card) => (
          <Tooltip key={card.label} content={`Open ${card.label.toLowerCase()}`}>
            <button
              type="button"
              onClick={() => navigate(card.to)}
              className="surface-card"
              style={{
                textAlign: "left",
                padding: "var(--space-6)",
                background: "linear-gradient(180deg, var(--color-bg-surface), var(--color-bg-elevated))",
              }}
            >
              <div className="mono-label" style={{ color: "var(--color-text-soft)", marginBottom: "var(--space-3)" }}>
                {card.label}
              </div>
              <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: "var(--font-weight-bold)", marginBottom: "var(--space-2)" }}>
                {loading ? "-" : card.value}
              </div>
              <div style={{ color: "var(--color-text-muted)" }}>{card.detail}</div>
            </button>
          </Tooltip>
        ))}
      </div>
    </section>
  );
}

function Banner({ tone, title, detail }) {
  const styles = {
    success: { border: "var(--color-status-success-border)", background: "var(--color-status-success-bg)", color: "var(--color-status-success-text)" },
    warning: { border: "var(--color-status-warning-border)", background: "var(--color-status-warning-bg)", color: "var(--color-status-warning-text)" },
    error: { border: "var(--color-status-error-border)", background: "var(--color-status-error-bg)", color: "var(--color-status-error-text)" },
  };
  return <div style={{ marginBottom: "var(--space-6)", padding: "14px 16px", borderRadius: "var(--radius-sm)", border: `1px solid ${styles[tone].border}`, background: styles[tone].background, color: styles[tone].color }}><div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-1)" }}>{title}</div><div>{detail}</div></div>;
}
