import { useState } from 'react';
import Modal from './Modal';
import { api } from '../api';

const initialState = {
  value: '',
  label: '',
  icon: '',
  href: '',
  type: 'internal',
  navSection: 'primary',
  openMode: 'iframe',
  hiddenFromModuleUser: false,
  displayOrder: '0',
};

export default function CreateSidebarItemModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState(initialState);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setForm(initialState);
    setError('');
  }

  function close() {
    reset();
    onClose();
  }

  async function handleCreate() {
    setError('');
    const value = form.value.trim();
    const label = form.label.trim();
    const icon = form.icon.trim();
    const href = form.href.trim();
    const isExternal = form.type === 'external';

    if (!value) { setError('Value is required.'); return; }
    if (!label) { setError('Label is required.'); return; }
    if (!icon) { setError('Icon is required.'); return; }
    if (!href) { setError('Link is required.'); return; }

    setSaving(true);
    try {
      const body = {
        value,
        label,
        icon,
        href,
        type: form.type,
        nav_section: form.navSection,
        open_mode: isExternal ? form.openMode : null,
        hidden_from_module_user: form.hiddenFromModuleUser,
        display_order: parseInt(form.displayOrder) || 0,
      };
      await api.post('/admin/sidebar-items', body);
      reset();
      onCreated();
    } catch (err) {
      setError((err.data && err.data.detail) || 'Failed to create sidebar item.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Create Sidebar Item"
      onClose={close}
      footer={
        <>
          <button className="btn btn-secondary" onClick={close}>Cancel</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleCreate}>
            {saving ? 'Creating…' : 'Create Sidebar Item'}
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
        Add a new sidebar item that can be assigned to modules.
      </p>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="field" style={{ marginBottom: 16 }}>
        <label className="f-label">Type</label>
        <div className="module-type-toggle">
          <button
            type="button"
            className={'module-type-btn' + (form.type === 'internal' ? ' active' : '')}
            onClick={() => setForm((f) => ({ ...f, type: 'internal' }))}
          >
            Internal
          </button>
          <button
            type="button"
            className={'module-type-btn' + (form.type === 'external' ? ' active' : '')}
            onClick={() => setForm((f) => ({ ...f, type: 'external' }))}
          >
            External
          </button>
        </div>
      </div>

      <div className="form-grid col1">
        <div className="field">
          <label className="f-label">Value (unique key) <em>*</em></label>
          <input className="f-input" placeholder="e.g. reports" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
          <span className="f-sub">Used internally to link this item to modules. Lowercase, no spaces.</span>
        </div>

        <div className="field">
          <label className="f-label">Label <em>*</em></label>
          <input className="f-input" placeholder="e.g. Reports" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
          <span className="f-sub">Shown in the sidebar.</span>
        </div>

        <div className="field">
          <label className="f-label">Icon <em>*</em></label>
          <input className="f-input" placeholder="e.g. DashboardIcon" value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} />
          <span className="f-sub">MUI icon component name.</span>
        </div>

        <div className="field">
          <label className="f-label">
            {form.type === 'internal' ? 'Page Path' : 'External URL'} <em>*</em>
          </label>
          <input
            className="f-input"
            type={form.type === 'external' ? 'url' : 'text'}
            placeholder={form.type === 'internal' ? '/frontend/portal/reports.html' : 'https://your-service.com'}
            value={form.href}
            onChange={(e) => setForm((f) => ({ ...f, href: e.target.value }))}
          />
          <span className="f-sub">
            {form.type === 'internal'
              ? 'Route/path to the page that renders this item.'
              : 'Tenants will be sent to this URL.'}
          </span>
        </div>

        <div className="field">
          <label className="f-label">Sidebar Section</label>
          <select className="f-input" value={form.navSection} onChange={(e) => setForm((f) => ({ ...f, navSection: e.target.value }))}>
            <option value="primary">Primary (always visible)</option>
            <option value="more">More (under "More" toggle)</option>
          </select>
        </div>

        {form.type === 'external' && (
          <div className="field">
            <label className="f-label">Open Mode</label>
            <select className="f-input" value={form.openMode} onChange={(e) => setForm((f) => ({ ...f, openMode: e.target.value }))}>
              <option value="iframe">Embedded (iframe)</option>
              <option value="new_tab">New Tab</option>
            </select>
          </div>
        )}

        <div className="field">
          <label className="f-label">Display Order</label>
          <input className="f-input" type="number" min="0" placeholder="0" value={form.displayOrder} onChange={(e) => setForm((f) => ({ ...f, displayOrder: e.target.value }))} />
        </div>

        <div className="field">
          <div
            className={'check-item' + (form.hiddenFromModuleUser ? ' checked' : '')}
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