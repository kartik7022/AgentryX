import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppButton } from "../../components/primitives/AppButton";
import { api } from "../../lib/api";
import { authUrls } from "../../config/env";

export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const moduleId = searchParams.get("module_id") || "";
  const plan = searchParams.get("plan") || "basic";
  const [success, setSuccess] = useState(false);
  const [moduleName, setModuleName] = useState(searchParams.get("module_name") || "");

  const moduleLabel = useMemo(() => {
    if (!moduleId) {
      return "Creating your account";
    }
    if (moduleName) {
      return `Signing up for ${moduleName} - ${plan} plan`;
    }
    return `Signing up for selected module - ${plan} plan`;
  }, [moduleId, moduleName, plan]);

  useEffect(() => {
    let cancelled = false;

    async function loadModule() {
      if (!moduleId) return;

      try {
        const data = await api.get("/api/public/modules");
        const module = (data?.modules || []).find((entry) => String(entry.id) === String(moduleId));
        if (!cancelled && module) {
          setModuleName(module.name);
        }
      } catch {
        // Module display is non-blocking; registration still submits the selected module id.
      }
    }

    loadModule();

    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!form.email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    if (!form.password) {
      setError("Please enter a password.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/auth/register", {
        email: form.email.trim(),
        password: form.password,
        module_id: moduleId,
        plan,
      });
      setSuccess(true);
    } catch (err) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleGoogleSignup() {
    const state = btoa(JSON.stringify({ module_id: moduleId, plan }));
    window.location.href = authUrls.googleSignup(state);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "var(--space-8)",
      }}
    >
      <div style={{ width: "100%", maxWidth: "420px" }}>
        <div style={{ textAlign: "center", marginBottom: "var(--space-8)" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              margin: "0 auto var(--space-4)",
              borderRadius: "18px",
              background: "linear-gradient(180deg, var(--color-text-brand), var(--color-primary-800))",
              display: "grid",
              placeItems: "center",
              color: "var(--color-text-inverse)",
              boxShadow: "var(--shadow-md)",
            }}
          >
            FE
          </div>
          <div style={{ fontSize: "var(--font-size-xl)", fontWeight: "var(--font-weight-extrabold)", letterSpacing: "var(--tracking-tight)" }}>
            AgentryX
          </div>
          <div className="mono-label" style={{ color: "var(--color-text-soft)", marginTop: "var(--space-2)" }}>
            Create your account
          </div>
        </div>

        <div className="surface-card" style={{ padding: "var(--space-8)" }}>
          {!success ? (
            <form onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-4)" }}>
              <div>
                <div style={{ fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", marginBottom: "var(--space-1)" }}>
                  Get started
                </div>
                <div style={{ color: "var(--color-text-muted)" }}>{moduleLabel}</div>
              </div>

              {error ? (
                <div
                  style={{
                    padding: "12px 14px",
                    borderRadius: "var(--radius-xs)",
                    border: "1px solid var(--color-status-error-border)",
                    background: "var(--color-status-error-bg)",
                    color: "var(--color-status-error-text)",
                  }}
                >
                  {error}
                </div>
              ) : null}

              <label style={{ display: "grid", gap: "var(--space-2)" }}>
                <span className="mono-label" style={{ color: "var(--color-text-muted)" }}>
                  Email Address
                </span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="you@company.com"
                  autoComplete="email"
                  style={inputStyle}
                />
              </label>

              <label style={{ display: "grid", gap: "var(--space-2)" }}>
                <span className="mono-label" style={{ color: "var(--color-text-muted)" }}>
                  Password
                </span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                  style={inputStyle}
                />
              </label>

              <label style={{ display: "grid", gap: "var(--space-2)" }}>
                <span className="mono-label" style={{ color: "var(--color-text-muted)" }}>
                  Confirm Password
                </span>
                <input
                  type="password"
                  value={form.confirmPassword}
                  onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                  placeholder="Re-enter your password"
                  autoComplete="new-password"
                  style={inputStyle}
                />
              </label>

              <AppButton
                type="submit"
                tooltip="Create your tenant account"
                fullWidth
                disabled={submitting}
              >
                {submitting ? "Creating account..." : "Create Account"}
              </AppButton>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto 1fr",
                  alignItems: "center",
                  gap: "var(--space-3)",
                  color: "var(--color-text-soft)",
                }}
              >
                <div style={{ height: "1px", background: "var(--color-border-soft)" }} />
                <span style={{ fontSize: "var(--font-size-xs)" }}>or</span>
                <div style={{ height: "1px", background: "var(--color-border-soft)" }} />
              </div>

              <AppButton
                type="button"
                tooltip="Continue registration with Google"
                fullWidth
                variant="secondary"
                onClick={handleGoogleSignup}
              >
                Continue with Google
              </AppButton>

              <div style={{ textAlign: "center", color: "var(--color-text-muted)" }}>
                Already have an account? <a href={authUrls.login}>Sign in</a>
              </div>
            </form>
          ) : (
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  margin: "0 auto var(--space-4)",
                  borderRadius: "999px",
                  background: "var(--color-status-success-bg)",
                  color: "var(--color-status-success-text)",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: "var(--font-weight-bold)",
                }}
              >
                OK
              </div>
              <div style={{ fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", marginBottom: "var(--space-3)" }}>
                Check your email
              </div>
              <div style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-6)" }}>
                We've sent a verification link to <strong>{form.email}</strong>.
                Verify your account, then return to sign in.
              </div>
              <AppButton
                tooltip="Open the sign-in screen"
                variant="secondary"
                onClick={() => (window.location.href = authUrls.login)}
              >
                Go to Sign In
              </AppButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  minHeight: "46px",
  padding: "0 14px",
  borderRadius: "var(--radius-xs)",
  border: "1px solid var(--color-border-base)",
  background: "var(--color-bg-surface)",
  color: "var(--color-text-strong)",
  outline: "none",
};
