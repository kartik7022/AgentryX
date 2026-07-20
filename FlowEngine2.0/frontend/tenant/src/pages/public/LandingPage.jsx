import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppButton } from "../../components/primitives/AppButton";
import { Tooltip } from "../../components/primitives/Tooltip";
import { authUrls } from "../../config/env";
import { api } from "../../lib/api";

const capabilities = [
  {
    n: "01",
    h: "Multi-source Connectivity",
    p: "Connect PostgreSQL, MySQL, SQL Server, BigQuery and more. Credentials stored in Vault and never exposed in plaintext.",
  },
  {
    n: "02",
    h: "Validation Engine",
    p: "Define rules once, apply everywhere. From simple type checks to complex business logic, version-controlled and auditable.",
  },
  {
    n: "03",
    h: "Intent Orchestration",
    p: "Map business intents to data flows. Declarative policies keep data operations consistent and predictable.",
  },
  {
    n: "04",
    h: "SQL Generation",
    p: "Generate optimized, injection-safe SQL from structured intent definitions. Zero manual query writing.",
  },
  {
    n: "05",
    h: "API Key Management",
    p: "Scoped keys with rate limiting, quota tracking, and trial or production tiers. Full control over who accesses what.",
  },
  {
    n: "06",
    h: "Multi-tenant Architecture",
    p: "Complete data isolation between tenants with enterprise-grade RBAC, audit logging, and compliance-ready foundations.",
  },
];

const processSteps = [
  {
    n: "01",
    h: "Connect Datasource",
    p: "Add your database credentials. AgentryX securely tests and stores the connection using Vault encryption.",
  },
  {
    n: "02",
    h: "Define Intents",
    p: "Declare what data operations you need. Intents become the semantic layer between your app and your data.",
  },
  {
    n: "03",
    h: "Set Validation Rules",
    p: "Attach business rules to each intent. Every data request is validated before execution.",
  },
  {
    n: "04",
    h: "Call the API",
    p: "Use your API key to trigger flows. Get real-time data or generated SQL in a clean, safe, deterministic flow.",
  },
];

export function LandingPage() {
  const navigate = useNavigate();
  const [modules, setModules] = useState([]);
  const [loadingModules, setLoadingModules] = useState(true);
  const [activeModuleTab, setActiveModuleTab] = useState(0);
  const [activeSubModule, setActiveSubModule] = useState(0);
  const [moduleFlow, setModuleFlow] = useState(null);

  const moduleTabs = useMemo(() => buildModuleTabs(modules), [modules]);
  const safeTabIndex = moduleTabs.length > 0 ? Math.min(activeModuleTab, moduleTabs.length - 1) : 0;
  const currentTab = moduleTabs[safeTabIndex] || null;
  const tabModules = currentTab?.modules || [];
  const safeSubIndex = tabModules.length > 0 ? Math.min(activeSubModule, tabModules.length - 1) : 0;
  const selectedModule = tabModules[safeSubIndex] || null;

  useEffect(() => {
    async function loadModules() {
      setLoadingModules(true);
      try {
        const data = await api.get("/admin/modules/public/list").catch(() => api.get("/api/public/modules"));
        setModules(data?.modules || []);
      } catch {
        setModules([]);
      } finally {
        setLoadingModules(false);
      }
    }
    loadModules();
  }, []);

  return (
    <div style={{ minHeight: "100dvh", background: "var(--color-bg-surface)" }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          height: "58px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-4)",
          padding: "0 var(--space-8)",
          borderBottom: "1px solid var(--color-border-soft)",
          background: "var(--color-bg-surface)",
          backdropFilter: "blur(20px)",
        }}
      >
        <Tooltip content="Return to the landing page">
          <button
            type="button"
            onClick={() => navigate("/")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-3)",
              border: 0,
              background: "transparent",
              color: "var(--color-text-strong)",
              padding: 0,
            }}
          >
            <span
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "var(--radius-xs)",
                display: "grid",
                placeItems: "center",
                background: "var(--color-primary-700)",
                color: "var(--color-text-strong)",
                fontWeight: "var(--font-weight-bold)",
              }}
            >
              AX
            </span>
            <span style={{ display: "grid", lineHeight: 1.05, textAlign: "left" }}>
              <span style={{ fontWeight: "var(--font-weight-bold)" }}>AgentryX</span>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
                Kasetti Technologies
              </span>
            </span>
          </button>
        </Tooltip>

        <nav style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
          <a href="#capabilities" style={navLinkStyle}>Capabilities</a>
          <a href="#process" style={navLinkStyle}>Process</a>
          <a href="#modules" style={navLinkStyle}>Modules</a>
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
          <AppButton tooltip="Sign in as an existing user" variant="secondary" size="sm" onClick={() => { window.location.href = authUrls.login; }}>
            Sign In
          </AppButton>
          <AppButton tooltip="Start with available modules" size="sm" onClick={() => document.getElementById("modules")?.scrollIntoView({ behavior: "smooth" })}>
            Get Started
          </AppButton>
        </div>
      </header>

      <main>
        <section
          style={{
            minHeight: "calc(100dvh - 58px)",
            display: "grid",
            placeItems: "center",
            padding: "var(--space-16) var(--space-8)",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background:
                "linear-gradient(var(--color-primary-50) 1px, transparent 1px), linear-gradient(90deg, var(--color-primary-50) 1px, transparent 1px)",
              backgroundSize: "72px 72px",
              maskImage: "radial-gradient(ellipse 70% 80% at 50% 40%, black 10%, transparent 80%)",
            }}
          />
          <div style={{ position: "relative", maxWidth: "960px" }}>
            <div
              className="mono-label"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-2)",
                padding: "6px 14px",
                border: "1px solid var(--color-border-base)",
                borderRadius: "var(--radius-xs)",
                background: "var(--color-bg-surface)",
                color: "var(--color-text-base)",
                marginBottom: "var(--space-8)",
              }}
            >
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--color-accent-500)" }} />
              Enterprise Data Flow Platform
            </div>

            <h1
              style={{
                margin: 0,
                color: "var(--color-text-strong)",
                fontFamily: "'Instrument Serif', Georgia, serif",
                fontSize: "clamp(46px, 6.5vw, 88px)",
                fontWeight: 400,
                lineHeight: 1.02,
                letterSpacing: "-1px",
              }}
            >
              Validate. Orchestrate.
              <br />
              <em style={{ color: "var(--color-primary-700)" }}>Flow at Enterprise Scale.</em>
            </h1>

            <p
              style={{
                maxWidth: "560px",
                margin: "var(--space-6) auto var(--space-10)",
                color: "var(--color-text-muted)",
                fontSize: "var(--font-size-md)",
                lineHeight: "var(--line-height-relaxed)",
              }}
            >
              AgentryX connects your datasources, enforces validation rules, and generates real-time SQL,
              all through a single, secure API. Built for teams that cannot afford downtime.
            </p>

            <div style={{ display: "flex", justifyContent: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
              <AppButton tooltip="View available modules" onClick={() => document.getElementById("modules")?.scrollIntoView({ behavior: "smooth" })}>
                Get Started Free
              </AppButton>
              <AppButton tooltip="Explore platform capabilities" variant="secondary" onClick={() => document.getElementById("capabilities")?.scrollIntoView({ behavior: "smooth" })}>
                Explore Features
              </AppButton>
            </div>
          </div>
        </section>

        <section id="capabilities" style={sectionStyle}>
          <div style={sectionInnerStyle}>
            <SectionHeader
              eyebrow="Capabilities"
              title={
                <>
                  Everything your data
                  <br />
                  <em style={{ color: "var(--color-primary-700)" }}>pipeline needs</em>
                </>
              }
              description="From raw datasource connection to intelligent query generation, AgentryX handles the complexity so your team does not have to."
            />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "1px", background: "var(--color-border-soft)", border: "1px solid var(--color-border-soft)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
              {capabilities.map((feature) => (
                <article key={feature.n} style={{ padding: "32px 28px", background: "var(--color-bg-surface)" }}>
                  <div className="mono-label" style={{ color: "var(--color-text-soft)", marginBottom: "var(--space-4)" }}>{feature.n}</div>
                  <div style={{ fontWeight: "var(--font-weight-bold)", marginBottom: "var(--space-2)" }}>{feature.h}</div>
                  <p style={{ margin: 0, color: "var(--color-text-muted)", lineHeight: "var(--line-height-relaxed)" }}>{feature.p}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="process" style={{ ...sectionStyle, background: "var(--color-bg-elevated)", color: "var(--color-text-strong)" }}>
          <div style={sectionInnerStyle}>
            <SectionHeader
              eyebrow="Process"
              title={
                <>
                  From connection to insight
                  <br />
                  <em style={{ color: "var(--color-primary-700)" }}>in four steps</em>
                </>
              }
              description="No black boxes. Every data operation is traceable, auditable, and repeatable, exactly as your enterprise requires."
            />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "var(--space-5)" }}>
              {processSteps.map((step) => (
                <article key={step.n}>
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      border: "1px solid var(--color-border-soft)",
                      color: "var(--color-text-muted)",
                      fontFamily: "var(--font-family-mono)",
                      marginBottom: "var(--space-6)",
                    }}
                  >
                    {step.n}
                  </div>
                  <div style={{ fontWeight: "var(--font-weight-bold)", marginBottom: "var(--space-2)" }}>{step.h}</div>
                  <p style={{ margin: 0, color: "var(--color-text-muted)", lineHeight: "var(--line-height-relaxed)" }}>{step.p}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="modules" style={sectionStyle}>
          <div style={sectionInnerStyle}>
            <SectionHeader
              eyebrow="Modules"
              title="Choose a module"
              description="Select an active module, start a free trial, or sign in with an existing account."
            />

            {loadingModules ? (
              <div style={{ color: "var(--color-text-muted)" }}>Loading modules...</div>
            ) : modules.length === 0 ? (
              <div className="surface-card" style={{ padding: "var(--space-6)", color: "var(--color-text-muted)" }}>
                No active modules. Add modules from the admin panel and they will appear here automatically.
              </div>
            ) : (
              <ModuleBrowser
                tabs={moduleTabs}
                activeTab={safeTabIndex}
                activeSubModule={safeSubIndex}
                selectedModule={selectedModule}
                onTabChange={(index) => {
                  setActiveModuleTab(index);
                  setActiveSubModule(0);
                }}
                onSubModuleChange={setActiveSubModule}
                onChooseModule={setModuleFlow}
              />
            )}
          </div>
        </section>
      </main>

      {moduleFlow ? (
        <ModuleFlowDialog
          module={moduleFlow}
          onClose={() => setModuleFlow(null)}
          onExistingUser={() => {
            const state = btoa(JSON.stringify({ module_id: getModuleId(moduleFlow), plan: "basic" }));
            window.location.href = `${authUrls.login}&state=${encodeURIComponent(state)}`;
          }}
          onNewRegistration={() => {
            navigate(`/register?module_id=${getModuleId(moduleFlow)}&module_name=${encodeURIComponent(getModuleName(moduleFlow))}&plan=basic`);
          }}
        />
      ) : null}
    </div>
  );
}

function ModuleBrowser({ tabs, activeTab, activeSubModule, selectedModule, onTabChange, onSubModuleChange, onChooseModule }) {
  const currentTab = tabs[activeTab] || tabs[0];
  const features = getModuleFeatures(selectedModule);

  return (
    <div className="surface-card" style={{ overflow: "hidden" }}>
      <div style={{ padding: "var(--space-4)", borderBottom: "1px solid var(--color-border-soft)", background: "var(--color-bg-elevated)" }}>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          {tabs.map((tab, index) => (
            <Tooltip key={tab.key} content={`Show ${tab.name}`}>
              <button type="button" onClick={() => onTabChange(index)} style={tabButtonStyle(index === activeTab)}>
                {tab.name}
              </button>
            </Tooltip>
          ))}
        </div>

        {currentTab?.type === "group" && currentTab.modules.length > 1 ? (
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-4)" }}>
            {currentTab.modules.map((module, index) => (
              <Tooltip key={getModuleId(module)} content={`Preview ${getModuleName(module)}`}>
                <button type="button" onClick={() => onSubModuleChange(index)} style={subTabButtonStyle(index === activeSubModule)}>
                  {getModuleName(module)}
                </button>
              </Tooltip>
            ))}
          </div>
        ) : null}
      </div>

      {selectedModule ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(280px, 0.85fr)", gap: "1px", background: "var(--color-border-soft)" }}>
          <article style={{ padding: "var(--space-8)", background: "var(--color-bg-surface)" }}>
            <div className="mono-label" style={{ color: "var(--color-accent-700)", marginBottom: "var(--space-3)" }}>
              {selectedModule.status || "active"} {selectedModule.version ? `- v${selectedModule.version}` : ""}
            </div>
            <h3 style={{ margin: 0, fontSize: "var(--font-size-2xl)", fontWeight: "var(--font-weight-bold)", letterSpacing: "var(--tracking-tight)" }}>
              {getModuleName(selectedModule)}
            </h3>
            <p style={{ color: "var(--color-text-muted)", margin: "var(--space-4) 0 var(--space-6)", lineHeight: "var(--line-height-relaxed)" }}>
              {selectedModule.description || "Core platform features with API access and analytics."}
            </p>
            <AppButton tooltip={`Continue with ${getModuleName(selectedModule)}`} onClick={() => onChooseModule(selectedModule)}>
              Get Started
            </AppButton>
          </article>

          <aside style={{ padding: "var(--space-8)", background: "var(--color-bg-elevated)" }}>
            <div className="mono-label" style={{ color: "var(--color-text-soft)", marginBottom: "var(--space-4)" }}>
              Included Features
            </div>
            {features.length > 0 ? (
              <div style={{ display: "grid", gap: "var(--space-3)" }}>
                {features.map((feature) => (
                  <div key={feature} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", color: "var(--color-text-base)" }}>
                    <span style={{ width: "7px", height: "7px", borderRadius: "999px", background: "var(--color-accent-500)", flex: "0 0 auto" }} />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "var(--color-text-muted)", lineHeight: "var(--line-height-relaxed)" }}>
                Sign in or register to view the enabled feature set for this module.
              </div>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function ModuleFlowDialog({ module, onClose, onExistingUser, onNewRegistration }) {
  const moduleName = getModuleName(module);

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "grid",
        placeItems: "center",
        padding: "var(--space-6)",
        background: "var(--color-overlay-scrim)",
      }}
    >
      <div className="surface-card" role="dialog" aria-modal="true" aria-labelledby="module-flow-title" style={{ width: "100%", maxWidth: "460px", padding: "var(--space-7)" }}>
        <div className="mono-label" style={{ color: "var(--color-primary-700)", marginBottom: "var(--space-3)" }}>
          {moduleName}
        </div>
        <h3 id="module-flow-title" style={{ margin: 0, fontSize: "var(--font-size-xl)", fontWeight: "var(--font-weight-bold)", letterSpacing: "var(--tracking-tight)" }}>
          Continue with this module
        </h3>
        <p style={{ margin: "var(--space-3) 0 var(--space-6)", color: "var(--color-text-muted)", lineHeight: "var(--line-height-relaxed)" }}>
          Choose whether you already have an account or want to create a new one.
        </p>
        <div style={{ display: "grid", gap: "var(--space-3)" }}>
          <AppButton tooltip={`Sign in and attach ${moduleName}`} fullWidth onClick={onExistingUser}>
            Existing User
          </AppButton>
          <AppButton tooltip={`Create a new account for ${moduleName}`} fullWidth variant="secondary" onClick={onNewRegistration}>
            New Registration
          </AppButton>
          <AppButton tooltip="Close module selection" fullWidth variant="ghost" onClick={onClose}>
            Cancel
          </AppButton>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ eyebrow, title, description, dark = false }) {
  return (
    <div style={{ marginBottom: "var(--space-10)" }}>
      <div className="mono-label" style={{ color: dark ? "var(--color-accent-500)" : "var(--color-primary-700)", marginBottom: "var(--space-4)" }}>
        {eyebrow}
      </div>
      <h2
        style={{
          margin: 0,
          color: dark ? "var(--color-text-inverse)" : "var(--color-text-strong)",
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontSize: "clamp(32px, 4vw, 52px)",
          fontWeight: 400,
          lineHeight: 1.07,
          letterSpacing: "-0.5px",
        }}
      >
        {title}
      </h2>
      <p style={{ maxWidth: "520px", color: dark ? "var(--color-text-muted)" : "var(--color-text-muted)", lineHeight: "var(--line-height-relaxed)", margin: "var(--space-4) 0 0" }}>
        {description}
      </p>
    </div>
  );
}

function buildModuleTabs(modules) {
  const tabs = [];
  const groups = new Map();

  (modules || []).forEach((module) => {
    const groupId = module.group_id || module.groupId;
    if (!groupId) {
      tabs.push({
        type: "module",
        key: getModuleId(module),
        name: getModuleName(module),
        modules: [module],
      });
      return;
    }

    const key = String(groupId);
    if (!groups.has(key)) {
      const group = {
        type: "group",
        key,
        name: module.group_name || module.groupName || key,
        modules: [],
      };
      groups.set(key, group);
      tabs.push(group);
    }
    groups.get(key).modules.push(module);
  });

  return tabs;
}

function getModuleId(module) {
  return String(module?.id ?? module?.module_id ?? module?.name ?? "module");
}

function getModuleName(module) {
  return module?.name || module?.module_name || "Module";
}

function getModuleFeatures(module) {
  if (!module?.features) return [];
  if (Array.isArray(module.features)) return module.features.filter(Boolean).map(String);
  if (typeof module.features === "string") {
    try {
      const parsed = JSON.parse(module.features);
      return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
    } catch {
      return module.features.split(",").map((feature) => feature.trim()).filter(Boolean);
    }
  }
  return [];
}

function tabButtonStyle(active) {
  return {
    minHeight: "36px",
    padding: "0 var(--space-4)",
    borderRadius: "var(--radius-xs)",
    border: active ? "1px solid var(--color-primary-700)" : "1px solid var(--color-border-soft)",
    background: active ? "var(--color-primary-700)" : "var(--color-bg-surface)",
    color: active ? "var(--color-text-strong)" : "var(--color-text-base)",
    fontWeight: "var(--font-weight-semibold)",
  };
}

function subTabButtonStyle(active) {
  return {
    minHeight: "32px",
    padding: "0 var(--space-3)",
    borderRadius: "var(--radius-pill)",
    border: active ? "1px solid var(--color-primary-200)" : "1px solid var(--color-border-soft)",
    background: active ? "var(--color-primary-50)" : "var(--color-bg-surface)",
    color: active ? "var(--color-text-strong)" : "var(--color-text-muted)",
    fontSize: "var(--font-size-xs)",
    fontWeight: "var(--font-weight-semibold)",
  };
}

const navLinkStyle = {
  color: "var(--color-text-muted)",
  fontSize: "var(--font-size-sm)",
  fontWeight: "var(--font-weight-medium)",
};

const sectionStyle = {
  padding: "80px var(--space-8)",
  background: "var(--color-bg-surface)",
};

const sectionInnerStyle = {
  width: "100%",
  maxWidth: "1120px",
  margin: "0 auto",
};
