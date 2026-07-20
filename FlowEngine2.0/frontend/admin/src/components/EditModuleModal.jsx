import { useEffect, useState } from "react";
import Modal from "./Modal";
import { api } from "../api";

export default function EditModuleModal({ module, onClose, onSaved }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sidebarItems, setSidebarItems] = useState([]);

  useEffect(() => {
    if (!module) return;
    api.get('/admin/sidebar-items')
      .then((d) => setSidebarItems(d.items || []))
      .catch(() => setSidebarItems([]));
    setError("");
    setForm({
      description: module.description || "",
      features: (module.features || []).join("\n"),
      icon: module.icon || "",
      version: module.version || "",
      status: module.status || "active",
      isDefault: !!module.is_default,
      moduleType: module.external_url ? "external" : "internal",
      externalUrl: module.external_url || "",
      freePlan: module.free_plan ? "yes" : "no",
      trialWeeks: String(module.trial_weeks || "2"),
      apiCalls: module.api_calls_allowed || "",
      sidebarItems: new Set(module.sidebar_items || []),
    });
  }, [module]);

  function toggleSidebarItem(value) {
    setForm((f) => {
      const next = new Set(f.sidebarItems);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...f, sidebarItems: next };
    });
  }

  async function handleSave() {
    if (!form) return;
    setError("");
    const isExternal = form.moduleType === "external";
    if (isExternal && !form.externalUrl.trim()) {
      setError("External service URL is required.");
      return;
    }

    setSaving(true);
    try {
      const features = form.features.trim()
        ? form.features
            .trim()
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      const body = {
        description: form.description.trim(),
        features,
        icon: form.icon.trim() || null,
        version: form.version.trim(),
        status: form.status,
        is_default: form.isDefault,
        sidebar_items: isExternal ? [] : [...form.sidebarItems],
        free_plan: form.freePlan === "yes",
        trial_weeks: parseInt(form.trialWeeks),
        api_calls_allowed: parseInt(form.apiCalls) || 0,
        external_url: isExternal ? form.externalUrl.trim() : null,
      };
      await api.patch(`/admin/modules/${module.id}`, body);
      onSaved();
    } catch (err) {
      setError((err.data && err.data.detail) || "Failed to update module.");
    } finally {
      setSaving(false);
    }
  }

  if (!module || !form) return null;

  return (
    <Modal
      open={!!module}
      title={`Edit Module — ${module.name}`}
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

      <div className="field" style={{ marginBottom: 16 }}>
        <label className="f-label">Module Type</label>
        <div className="module-type-toggle">
          <button
            type="button"
            className={
              "module-type-btn" +
              (form.moduleType === "internal" ? " active" : "")
            }
            onClick={() => setForm((f) => ({ ...f, moduleType: "internal" }))}
          >
            Internal
          </button>
          <button
            type="button"
            className={
              "module-type-btn" +
              (form.moduleType === "external" ? " active" : "")
            }
            onClick={() => setForm((f) => ({ ...f, moduleType: "external" }))}
          >
            External Service
          </button>
        </div>
      </div>

      <div className="form-grid col1">
        <div className="field">
          <label className="f-label">Description</label>
          <textarea
            className="f-input textarea"
            rows={3}
            value={form.description}
            onChange={(e) =>
              setForm((f) => ({ ...f, description: e.target.value }))
            }
          />
        </div>
        <div className="field">
          <label className="f-label">Features</label>
          <textarea
            className="f-input textarea"
            rows={5}
            value={form.features}
            onChange={(e) =>
              setForm((f) => ({ ...f, features: e.target.value }))
            }
          />
        </div>
        <div className="field">
          <label className="f-label">Icon</label>
          <input
            className="f-input"
            value={form.icon}
            onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
          />
        </div>
        <div className="field">
          <label className="f-label">Version</label>
          <input
            className="f-input"
            value={form.version}
            onChange={(e) =>
              setForm((f) => ({ ...f, version: e.target.value }))
            }
          />
        </div>
        <div className="field">
          <label className="f-label">Status</label>
          <select
            className="f-input"
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="field">
          <label className="f-label">Free Plan</label>
          <select
            className="f-input"
            value={form.freePlan}
            onChange={(e) =>
              setForm((f) => ({ ...f, freePlan: e.target.value }))
            }
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>
        <div className="field">
          <label className="f-label">Trial Weeks</label>
          <select
            className="f-input"
            value={form.trialWeeks}
            onChange={(e) =>
              setForm((f) => ({ ...f, trialWeeks: e.target.value }))
            }
          >
            <option value="1">1 Week</option>
            <option value="2">2 Weeks</option>
            <option value="3">3 Weeks</option>
            <option value="4">4 Weeks</option>
          </select>
        </div>
        <div className="field">
          <label className="f-label">API Calls Allowed</label>
          <input
            className="f-input"
            type="number"
            min="0"
            value={form.apiCalls}
            onChange={(e) =>
              setForm((f) => ({ ...f, apiCalls: e.target.value }))
            }
          />
        </div>
        <div className="field">
          <div
            className={"check-item" + (form.isDefault ? " checked" : "")}
            onClick={() => setForm((f) => ({ ...f, isDefault: !f.isDefault }))}
          >
            <input type="checkbox" checked={form.isDefault} readOnly />
            <div className="check-box">✓</div>
            <span className="check-lbl">Set as Default Module</span>
          </div>
        </div>

        {form.moduleType === "internal" && (
          <div className="field">
            <label className="f-label">Sidebar Pages</label>
            <div className="check-grid">
              {sidebarItems.map((item) => {
                const checked = form.sidebarItems.has(item.value);
                return (
                  <div
                    key={item.value}
                    className={"check-item" + (checked ? " checked" : "")}
                    onClick={() => toggleSidebarItem(item.value)}
                  >
                    <input type="checkbox" checked={checked} readOnly />
                    <div className="check-box">✓</div>
                    <span className="check-lbl">{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {form.moduleType === "external" && (
          <div className="field">
            <label className="f-label">
              External Service URL <em>*</em>
            </label>
            <input
              className="f-input"
              type="url"
              value={form.externalUrl}
              onChange={(e) =>
                setForm((f) => ({ ...f, externalUrl: e.target.value }))
              }
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
