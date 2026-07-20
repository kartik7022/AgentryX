import { useEffect, useState } from "react";
import { Banner as NoticeBanner } from "../../components/feedback/Banner";
import { AppButton } from "../../components/primitives/AppButton";
import { apiKeysApi } from "../../lib/api-keys";

export function ApiKeysPage() {
  const [loading, setLoading] = useState(true);
  const [activeKey, setActiveKey] = useState(null);
  const [banner, setBanner] = useState(null);
  const [revealValue, setRevealValue] = useState("");
  const [confirmMode, setConfirmMode] = useState("");

  useEffect(() => {
    loadKey().catch(() => null);
  }, []);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        loadKey().catch(() => null);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  async function loadKey() {
    setLoading(true);
    try {
      const data = await apiKeysApi.list();
      const keys = data?.api_keys || [];
      const active = keys.find((entry) => entry.status === "active") || keys[0] || null;
      setActiveKey(active);
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Failed to load API keys",
        detail: error.message || "Unable to load API key data.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke() {
    try {
      await apiKeysApi.revoke();
      setConfirmMode("");
      setRevealValue("");
      setBanner({
        tone: "success",
        title: "Key revoked",
        detail: "Your API key has been revoked.",
      });
      await loadKey();
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Revoke failed",
        detail: error.message || "Unable to revoke the API key.",
      });
    }
  }

  async function handleRegenerate() {
    try {
      await apiKeysApi.revoke().catch(() => null);
      const data = await apiKeysApi.generate();
      setRevealValue(data?.api_key || data?.key || "");
      setConfirmMode("");
      setBanner({
        tone: "success",
        title: "Key regenerated",
        detail: "A new API key has been generated for your tenant.",
      });
      await loadKey();
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Regenerate failed",
        detail: error.message || "Unable to regenerate the API key.",
      });
    }
  }

  async function copyKey(value) {
    try {
      await navigator.clipboard.writeText(value || "");
      setBanner({
        tone: "success",
        title: "Copied",
        detail: "API key copied to clipboard.",
      });
    } catch {
      setBanner({
        tone: "warning",
        title: "Copy unavailable",
        detail: "Your browser did not allow clipboard access.",
      });
    }
  }

  return (
    <section>
      <Header
        label="API Keys"
        title="API Keys"
        description="Your tenant API key grants access to subscribed AgentryX modules."
      />
      {banner ? <NoticeBanner {...banner} /> : null}

      <div className="surface-card" style={{ padding: "var(--space-8)" }}>
        {loading ? (
          <div style={{ color: "var(--color-text-muted)" }}>Loading API key...</div>
        ) : !activeKey ? (
          <div style={{ display: "grid", gap: "var(--space-4)" }}>
            <div style={{ color: "var(--color-text-muted)" }}>No active API key found.</div>
            <AppButton tooltip="Generate a new API key for this tenant" onClick={handleRegenerate}>Generate API Key</AppButton>
          </div>
        ) : (
          <div style={{ display: "grid", gap: "var(--space-5)" }}>
            <div>
              <div className="mono-label" style={{ color: "var(--color-text-soft)", marginBottom: "var(--space-2)" }}>Current Key</div>
              <div style={secretBoxStyle}>
                {activeKey.api_key || "************************"}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "var(--space-4)" }}>
              <Metric label="Created" value={formatDate(activeKey.created_at)} />
              <Metric label="Status" value={activeKey.status || "active"} />
            </div>
            <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
              <AppButton tooltip="Copy the active API key" variant="secondary" onClick={() => copyKey(activeKey.api_key || "")}>Copy Key</AppButton>
              <AppButton tooltip="Revoke the current API key" variant="ghost" onClick={() => setConfirmMode("revoke")}>Revoke Key</AppButton>
              <AppButton tooltip="Generate a new API key and invalidate the current one" onClick={() => setConfirmMode("regenerate")}>Regenerate Key</AppButton>
            </div>
          </div>
        )}
      </div>

      {revealValue ? (
        <Dialog
          title="New API key"
          description="Copy this key now. Treat it like a secret and store it securely."
          onClose={() => setRevealValue("")}
          actions={
            <>
              <AppButton tooltip="Close this API key dialog" variant="secondary" onClick={() => setRevealValue("")}>Close</AppButton>
              <AppButton tooltip="Copy the newly generated API key" onClick={() => copyKey(revealValue)}>Copy Key</AppButton>
            </>
          }
        >
          <div style={secretBoxStyle}>{revealValue}</div>
        </Dialog>
      ) : null}

      {confirmMode ? (
        <Dialog
          title={confirmMode === "revoke" ? "Revoke API key" : "Regenerate API key"}
          description={
            confirmMode === "revoke"
              ? "Are you sure you want to revoke the current API key?"
              : "This will revoke the current key and issue a new one."
          }
          onClose={() => setConfirmMode("")}
          actions={
            <>
              <AppButton tooltip="Cancel this action" variant="secondary" onClick={() => setConfirmMode("")}>Cancel</AppButton>
              <AppButton tooltip={confirmMode === "revoke" ? "Confirm API key revocation" : "Confirm API key regeneration"} onClick={confirmMode === "revoke" ? handleRevoke : handleRegenerate}>
                {confirmMode === "revoke" ? "Revoke" : "Regenerate"}
              </AppButton>
            </>
          }
        />
      ) : null}
    </section>
  );
}

function Header({ label, title, description }) {
  return (
    <div style={{ marginBottom: "var(--space-6)" }}>
      <h1 style={{ margin: 0, color: "var(--color-text-strong)", fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", letterSpacing: "var(--tracking-tight)" }}>{title}</h1>
      <p style={{ margin: "var(--space-3) 0 0", color: "var(--color-text-muted)", maxWidth: "72ch" }}>{description}</p>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="surface-card" style={{ padding: "var(--space-5)", background: "var(--color-bg-elevated)" }}>
      <div className="mono-label" style={{ color: "var(--color-text-soft)", marginBottom: "var(--space-2)" }}>{label}</div>
      <div style={{ fontWeight: "var(--font-weight-semibold)" }}>{value}</div>
    </div>
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

function Dialog({ title, description, children, actions, onClose }) {
  return (
    <div style={dialogOverlayStyle} onClick={onClose}>
      <div className="surface-card" style={dialogCardStyle} onClick={(event) => event.stopPropagation()}>
        <div style={{ fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", marginBottom: "var(--space-3)" }}>{title}</div>
        <div style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-6)" }}>{description}</div>
        {children}
        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end", marginTop: "var(--space-6)" }}>{actions}</div>
      </div>
    </div>
  );
}

function formatDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

const dialogOverlayStyle = { position: "fixed", inset: 0, zIndex: 40, display: "grid", placeItems: "center", background: "var(--color-overlay-scrim)", backdropFilter: "blur(8px)" };
const dialogCardStyle = { width: "min(480px, calc(100vw - 32px))", padding: "var(--space-8)" };
const secretBoxStyle = { fontFamily: "var(--font-family-mono)", fontSize: "var(--font-size-md)", padding: "14px 16px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-soft)", background: "var(--color-bg-elevated)", wordBreak: "break-all" };
