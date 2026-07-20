import { useEffect, useState } from "react";
import { api } from "../api";

const DEFAULT_CHECKED = ["basic", "email_validate"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterClient() {
  const [moduleNames, setModuleNames] = useState([]);
  const [checkedModules, setCheckedModules] = useState(new Set());
  const [email, setEmail] = useState("");
  const [accountType, setAccountType] = useState("trial");
  const [expiresAt, setExpiresAt] = useState("");
  const [loadingModules, setLoadingModules] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    loadModules();
  }, []);

  async function loadModules() {
    setLoadingModules(true);
    try {
      const d = await api.get("/admin/modules");
      const active = (d.modules || [])
        .filter((m) => m.status === "active")
        .map((m) => m.name);
      setModuleNames(active);
      // only default-check modules that actually exist in this list
      setCheckedModules(
        new Set(active.filter((name) => DEFAULT_CHECKED.includes(name))),
      );
    } catch (_) {
      setModuleNames([]);
      setCheckedModules(new Set());
    } finally {
      setLoadingModules(false);
    }
  }

  function toggleModule(name) {
    setCheckedModules((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function handleSubmit() {
    setSuccessMsg("");
    setErrorMsg("");

    const trimmedEmail = email.trim();
    const modules = [...checkedModules];

    if (!trimmedEmail) {
      setErrorMsg("Please enter a client email address.");
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }
    if (!modules.length) {
      setErrorMsg("Please select at least one module.");
      return;
    }

    setSubmitting(true);
    try {
      const body = { email: trimmedEmail, modules, account_type: accountType };
      if (expiresAt) body.expires_at = expiresAt;

      const d = await api.post("/api/accounts", body);
      setSuccessMsg(
        `Account created for ${d.email}. Tenant ID: ${d.tenant_id}`,
      );
      setEmail("");
      setExpiresAt("");
      setCheckedModules(
        new Set(moduleNames.filter((name) => DEFAULT_CHECKED.includes(name))),
      );
    } catch (err) {
      setErrorMsg((err.data && err.data.detail) || "Failed to create account.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">
          <div className="card-icon">✉</div>New Client Account
        </div>
      </div>
      <div className="card-body">
        {successMsg && <div className="alert alert-success">{successMsg}</div>}
        {errorMsg && <div className="alert alert-error">{errorMsg}</div>}

        <div className="form-grid">
          <div className="field s2">
            <label className="f-label">
              Client Email <em>*</em>
            </label>
            <input
              className="f-input"
              type="email"
              placeholder="client@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <span className="f-sub">
              password setup link will be sent to this address
            </span>
          </div>

          <div className="field s2">
            <label className="f-label">
              Modules / Scopes <em>*</em>
            </label>
            <div className="check-grid">
              {loadingModules && (
                <span style={{ color: "var(--tx3)", fontSize: 12 }}>
                  Loading…
                </span>
              )}
              {!loadingModules &&
                moduleNames.map((name) => {
                  const checked = checkedModules.has(name);
                  return (
                    <div
                      key={name}
                      className={"check-item" + (checked ? " checked" : "")}
                      onClick={() => toggleModule(name)}
                    >
                      <input
                        type="checkbox"
                        value={name}
                        checked={checked}
                        readOnly
                      />
                      <div className="check-box">✓</div>
                      <span className="check-lbl">{name}</span>
                    </div>
                  );
                })}
            </div>
          </div>

          <div className="field">
            <label className="f-label">
              Account Type <em>*</em>
            </label>
            <select
              className="f-input"
              value={accountType}
              onChange={(e) => setAccountType(e.target.value)}
            >
              <option value="trial">Trial</option>
              <option value="production">Production</option>
            </select>
          </div>

          <div className="field">
            <label className="f-label">
              Expires At <em>*</em>
            </label>
            <input
              className="f-input"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <span className="f-sub">
              Leave blank — production defaults to 1 year, trial to 30 days
            </span>
          </div>
        </div>

        <div className="form-footer">
          <button
            className="btn btn-primary"
            disabled={submitting}
            onClick={handleSubmit}
          >
            <span className="btn-text">
              {submitting ? "Creating…" : "Create Account & Send API Key"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
