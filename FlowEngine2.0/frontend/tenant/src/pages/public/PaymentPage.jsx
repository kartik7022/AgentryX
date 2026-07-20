import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppButton } from "../../components/primitives/AppButton";
import { Tooltip } from "../../components/primitives/Tooltip";
import { api } from "../../lib/api";
import { authUrls } from "../../config/env";

export function PaymentPage() {
  const pendingRegistration = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem("pending_registration") || "null");
    } catch {
      return null;
    }
  }, []);

  const flow = pendingRegistration ? "register" : "upgrade";
  const [paymentSuccess, setPaymentSuccess] = useState(null);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  async function handleProcess() {
    if (paymentSuccess === null) {
      setStatus("error");
      setMessage("Please choose whether the payment should succeed or fail before continuing.");
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const verification = await api.post("/auth/payment/verify", {
        payment_success: paymentSuccess,
      });

      if (!verification?.payment_success) {
        setStatus("error");
        setMessage("Payment failed. Please try again or contact support.");
        return;
      }

      if (flow === "register") {
        await api.post("/auth/register", pendingRegistration);
        sessionStorage.removeItem("pending_registration");
        setStatus("success");
        setMessage("Your production account has been created. Please check your email to verify your address before logging in.");
        return;
      }

      const upgrade = await api.post("/auth/upgrade-to-production", {});
      setStatus("success");
      setMessage(upgrade?.message || "Your account has been upgraded to Production.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Network error. Please try again.");
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "var(--space-8)" }}>
      <div className="surface-card" style={{ width: "100%", maxWidth: "560px", overflow: "hidden" }}>
        <div style={{ padding: "var(--space-8)", borderBottom: "1px solid var(--color-border-soft)", background: "var(--color-bg-elevated)" }}>
          <div className="mono-label" style={{ color: "var(--color-status-warning-text)", marginBottom: "var(--space-3)" }}>
            Payment Flow
          </div>
          <h1 style={{ margin: 0, fontSize: "var(--font-size-2xl)", fontWeight: "var(--font-weight-bold)", letterSpacing: "var(--tracking-tight)" }}>
            Complete Payment
          </h1>
          <p style={{ margin: "var(--space-4) 0 0", color: "var(--color-text-muted)" }}>
            You are upgrading to a Production account with full platform access.
          </p>
        </div>

        <div style={{ padding: "var(--space-8)" }}>
          <div className="surface-card" style={{ padding: "var(--space-5)", background: "var(--color-status-warning-bg)", borderColor: "var(--color-status-warning-border)", marginBottom: "var(--space-6)" }}>
            <div className="mono-label" style={{ color: "var(--color-status-warning-text)", marginBottom: "var(--space-2)" }}>Detected Flow</div>
            <div style={{ color: "var(--color-text-base)" }}>
              {flow === "register"
                ? "New production registration will be completed after payment succeeds."
                : "Existing trial tenant will be upgraded after payment succeeds."}
            </div>
          </div>

          {message ? (
            <div style={{ marginBottom: "var(--space-5)", padding: "14px 16px", borderRadius: "var(--radius-xs)", border: status === "error" ? "1px solid var(--color-status-error-border)" : "1px solid var(--color-status-success-border)", background: status === "error" ? "var(--color-status-error-bg)" : "var(--color-status-success-bg)", color: status === "error" ? "var(--color-status-error-text)" : "var(--color-status-success-text)" }}>
              {message}
            </div>
          ) : null}

          {status !== "success" ? (
            <>
              <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-3)" }}>Select payment result</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)", marginBottom: "var(--space-6)" }}>
                <SelectableResult
                  selected={paymentSuccess === true}
                  label="Payment Success"
                  detail="Continue with account creation or upgrade."
                  tone="success"
                  onClick={() => setPaymentSuccess(true)}
                />
                <SelectableResult
                  selected={paymentSuccess === false}
                  label="Payment Failure"
                  detail="Stop the upgrade and show payment recovery options."
                  tone="error"
                  onClick={() => setPaymentSuccess(false)}
                />
              </div>

              <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
                <AppButton tooltip="Process this payment result" onClick={handleProcess} disabled={status === "loading"}>
                  {status === "loading" ? "Processing..." : "Process Payment"}
                </AppButton>
                <AppButton tooltip="Return to sign in" variant="secondary" onClick={() => { window.location.href = authUrls.login; }}>
                  Go to Sign In
                </AppButton>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
              <AppButton
                tooltip={flow === "register" ? "Open the sign-in screen" : "Open the tenant dashboard"}
                onClick={() => {
                  window.location.href = flow === "register" ? authUrls.login : "/app";
                }}
              >
                {flow === "register" ? "Go to Sign In" : "Go to Dashboard"}
              </AppButton>
            </div>
          )}

          <div style={{ marginTop: "var(--space-8)", color: "var(--color-text-muted)" }}>
            Need a different path? <Link to="/register">Return to registration</Link>.
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectableResult({ selected, label, detail, tone, onClick }) {
  const tones = {
    success: {
      border: selected ? "var(--color-status-success-text)" : "var(--color-border-soft)",
      background: selected ? "var(--color-status-success-bg)" : "var(--color-bg-surface)",
      color: "var(--color-status-success-text)",
    },
    error: {
      border: selected ? "var(--color-status-error-text)" : "var(--color-border-soft)",
      background: selected ? "var(--color-status-error-bg)" : "var(--color-bg-surface)",
      color: "var(--color-status-error-text)",
    },
  };
  const style = tones[tone];
  return (
    <Tooltip content={`Select ${label}`}>
      <button
        type="button"
        onClick={onClick}
        style={{
          textAlign: "left",
          padding: "var(--space-5)",
          borderRadius: "var(--radius-sm)",
          border: `2px solid ${style.border}`,
          background: style.background,
          cursor: "pointer",
        }}
      >
        <div style={{ fontWeight: "var(--font-weight-semibold)", color: style.color, marginBottom: "var(--space-2)" }}>{label}</div>
        <div style={{ color: "var(--color-text-muted)" }}>{detail}</div>
      </button>
    </Tooltip>
  );
}
