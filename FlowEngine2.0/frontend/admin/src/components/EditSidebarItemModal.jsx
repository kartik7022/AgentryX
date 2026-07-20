import { useEffect, useState } from "react";
import Modal from "./Modal";
import { api } from "../api";

export default function EditSidebarItemModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!item) return;
    setError("");
    setForm({
      label: item.label || "",
      icon: item.icon || "",
      href: item.href || "",
      type: item.type || "internal",
      navSection: item.nav_section || "primary",
      openMode: item.open_mode || "iframe",
      hiddenFromModuleUser: !!item.hidden_from_module_user,
      displayOrder: String(item.display_order || "0"),
      status: item.status || "active",
    });
  }, [item]);

  async function handleSave() {
    if (!form) return;
    setError("");
    const isExternal = form.type === "external";
    if (!form.href.trim()) {
      setError(isExternal ? "External URL is required." : "Page path is required.");
      return;
    }

    setSaving(true);
    try {
      const body = {
        label: form.label.trim(),
        icon: form.icon.trim(),
        href: form.href.trim(),
        type: form.type,
        nav_section: form.navSection,
        open_mode: isExternal ? form.openMode : null,
        hidden_from_module_user: form.hiddenFromModuleUser,
        display_order: parseInt(form.displayOrder) || 0,
        status: form.status,
      };
      await api.patch(`/admin/sidebar-items/${item.id}`, body);
      onSaved();
    } catch (err) {
      setError((err.data && err.data.detail) || "Failed to update sidebar item.");
    } finally {
      setSaving(false);
    }
  }

  if (!item || !form) return null;

  return (
    <Modal
      open={!!item}
      title={`Edit Sidebar Item — ${item.label}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error">{error}</div>}

      <div className="field" style={{ marginBottom: 16 }}>
        <label className="f-label">Type</label>
        <div className="module-type-toggle">
          <button
            type="button"
            className={"module-type-btn" + (form.type === "internal" ? " active" : "")}
            onClick={() => setForm((f) => ({ ...f, type: "internal" }))}
          >
            Internal
          </button>
          <button
            type="button"
            className={"module-type-btn" + (form.type === "external" ? " active" : "")}
            onClick={() => setForm((f) => ({ ...f, type: "external" }))}
          >
            External
          </button>
        </div>
      </div>

      <div className="form-grid col1">
        <div className="field">
          <label className="f-label">Value</label>
          <input className="f-input" value={item.value} disabled />
          <span className="f-sub">Value cannot be changed after creation.</span>
        </div>

        <div className="field">
          <label className="f-label">Label</label>
          <input
            className="f-input"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
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
          <label className="f-label">
            {form.type === "internal" ? "Page Path" : "External URL"}
          </label>
          <input
            className="f-input"
            type={form.type === "external" ? "url" : "text"}
            value={form.href}
            onChange={(e) => setForm((f) => ({ ...f, href: e.target.value }))}
          />
        </div>

        <div className="field">
          <label className="f-label">Sidebar Section</label>
          <select
            className="f-input"
            value={form.navSection}
            onChange={(e) => setForm((f) => ({ ...f, navSection: e.target.value }))}
          >
            <option value="primary">Primary (always visible)</option>
            <option value="more">More (under "More" toggle)</option>
          </select>
        </div>

        {form.type === "external" && (
          <div className="field">
            <label className="f-label">Open Mode</label>
            <select
              className="f-input"
              value={form.openMode}
              onChange={(e) => setForm((f) => ({ ...f, openMode: e.target.value }))}
            >
              <option value="iframe">Embedded (iframe)</option>
              <option value="new_tab">New Tab</option>
            </select>
          </div>
        )}

        <div className="field">
          <label className="f-label">Display Order</label>
          <input
            className="f-input"
            type="number"
            min="0"
            value={form.displayOrder}
            onChange={(e) => setForm((f) => ({ ...f, displayOrder: e.target.value }))}
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
          <div
            className={"check-item" + (form.hiddenFromModuleUser ? " checked" : "")}
            onClick={() => setForm((f) => ({ ...f, hiddenFromModuleUser: !f.hiddenFromModuleUser }))}
          >
            <input type="checkbox" checked={form.hiddenFromModuleUser} readOnly />
            <div className="check-box">✓</div>
            <span className="check-lbl">Hide from Module Users (visible only to tenant_admin / tenant_co_admin)</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}