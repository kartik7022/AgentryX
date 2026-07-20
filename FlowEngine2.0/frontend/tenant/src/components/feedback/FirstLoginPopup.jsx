import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppButton } from "../primitives/AppButton";

export function FirstLoginPopup() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [tenantId, setTenantId] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (searchParams.get("first_login") !== "true") {
      return;
    }

    setTenantId(searchParams.get("tenant_id") || "");
    setVisible(true);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("first_login");
    nextParams.delete("tenant_id");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  if (!visible) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "grid",
        placeItems: "center",
        background: "var(--color-overlay-scrim)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div className="surface-card" style={{ width: "min(520px, calc(100vw - 32px))", padding: "var(--space-8)" }}>
        <div className="mono-label" style={{ color: "var(--color-primary-700)", marginBottom: "var(--space-3)" }}>
          Account Created
        </div>
        <div style={{ fontSize: "var(--font-size-xl)", fontWeight: "var(--font-weight-bold)", marginBottom: "var(--space-3)" }}>
          Your account has been created
        </div>
        <div style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-5)" }}>
          Tenant ID: <strong style={{ color: "var(--color-text-strong)" }}>{tenantId}</strong>
        </div>
        <div
          style={{
            padding: "var(--space-5)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--color-border-soft)",
            background: "var(--color-bg-elevated)",
            marginBottom: "var(--space-5)",
          }}
        >
          <div className="mono-label" style={{ color: "var(--color-text-soft)", marginBottom: "var(--space-3)" }}>
            Next Steps
          </div>
          <ol style={{ margin: 0, paddingLeft: "18px", color: "var(--color-text-base)" }}>
            <li>Set up your datasource and its credentials.</li>
            <li>We'll run a background process to fetch your datasource's metadata.</li>
            <li>You'll get an email with your API key once that's done.</li>
          </ol>
        </div>
        <div style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-6)" }}>
          We store your credentials in secure Vault only when you use the{" "}
          <strong>data module</strong>. If you use the{" "}
          <strong>SQL module</strong>, credentials are used only to fetch
          metadata and are not retained.
        </div>
        <AppButton
          tooltip="Continue into datasource setup"
          onClick={() => {
            setVisible(false);
            navigate("/app/datasources");
          }}
        >
          Continue
        </AppButton>
      </div>
    </div>
  );
}
