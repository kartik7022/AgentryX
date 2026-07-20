import { useEffect, useState } from "react";
import Modal from "./Modal";
import { api } from "../api";

export default function EditClientModal({ client, onClose, onSaved }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState("trial");
  const [status, setStatus] = useState("active");
  const [allModules, setAllModules] = useState([]);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!client) return;
    setEmail(client.email);
    setPassword("");
    setAccountType(client.account_type || "trial");
    setStatus(client.status || "active");
    setError("");
    loadModules();
  }, [client]);

  async function loadModules() {
    setLoading(true);
    try {
      const [modRes, assignedRes] = await Promise.all([
        api.get("/admin/modules"),
        api.get(`/admin/modules/tenant/${client.tenant_id}`),
      ]);
      const mods = modRes.modules || [];
      const assignedIds = new Set(
        (assignedRes || []).map((a) => String(a.module_id)),
      );
      setAllModules(mods);
      setCheckedIds(
        new Set(
          mods
            .filter((m) => assignedIds.has(String(m.id)))
            .map((m) => String(m.id)),
        ),
      );
    } catch (_) {
      setAllModules([]);
    } finally {
      setLoading(false);
    }
  }

  function toggle(id) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const body = {
        new_email: email.trim(),
        password,
        account_type: accountType,
        status,
        modules: [...checkedIds],
      };
      await api.patch(
        `/api/accounts/${encodeURIComponent(client.email)}/edit`,
        body,
      );
      onSaved();
    } catch (err) {
      setError((err.data && err.data.detail) || "Failed to update client.");
    } finally {
      setSaving(false);
    }
  }

  if (!client) return null;

  return (
    <Modal
      open={!!client}
      title="Edit Client"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-grid">
        <div className="field s2">
          <label className="f-label">Email</label>
          <input
            className="f-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field s2">
          <label className="f-label">
            New Password (leave blank to keep current)
          </label>
          <input
            className="f-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="f-label">Account Type</label>
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
          <label className="f-label">Status</label>
          <select
            className="f-input"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="field s2">
          <label className="f-label">Modules</label>
          <div className="check-grid">
            {loading && (
              <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                Loading…
              </span>
            )}
            {!loading &&
              allModules.map((m) => {
                const checked = checkedIds.has(String(m.id));
                return (
                  <div
                    key={m.id}
                    className={"check-item" + (checked ? " checked" : "")}
                    onClick={() => toggle(m.id)}
                  >
                    <input type="checkbox" checked={checked} readOnly />
                    <div className="check-box">✓</div>
                    <span className="check-lbl">{m.name}</span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
