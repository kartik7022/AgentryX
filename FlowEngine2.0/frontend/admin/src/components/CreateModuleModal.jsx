import { useState, useEffect } from 'react';
import Modal from './Modal';
import { api } from '../api';

const initialState = {
  name: '',
  description: '',
  features: '',
  icon: '',
  version: '1.0.0',
  isDefault: false,
  freePlan: 'no',
  trialWeeks: '2',
  apiCalls: '',
  moduleType: 'internal',
  externalUrl: '',
  sidebarItems: new Set(),
};

export default function CreateModuleModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState(initialState);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sidebarItems, setSidebarItems] = useState([]);

  useEffect(() => {
    if (open) {
      api.get('/admin/sidebar-items')
        .then((d) => setSidebarItems(d.items || []))
        .catch(() => setSidebarItems([]));
    }
  }, [open]);

  function reset() {
    setForm(initialState);
    setError('');
  }

  function close() {
    reset();
    onClose();
  }

  function toggleSidebarItem(value) {
    setForm((f) => {
      const next = new Set(f.sidebarItems);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...f, sidebarItems: next };
    });
  }

  async function handleCreate() {
    setError('');
    const name = form.name.trim();
    const isExternal = form.moduleType === 'external';
    if (!name) { setError('Module name is required.'); return; }
    if (isExternal && !form.externalUrl.trim()) { setError('External service URL is required.'); return; }

    setSaving(true);
    try {
      const features = form.features.trim() ? form.features.trim().split('\n').map((s) => s.trim()).filter(Boolean) : [];
      const body = {
        name,
        description: form.description.trim() || '',
        features,
        icon: form.icon.trim() || null,
        version: form.version.trim(),
        is_default: form.isDefault,
        sidebar_items: isExternal ? [] : [...form.sidebarItems],
        free_plan: form.freePlan === 'yes',
        trial_weeks: parseInt(form.trialWeeks),
        api_calls_allowed: parseInt(form.apiCalls) || 0,
      };
      if (isExternal) body.external_url = form.externalUrl.trim();

      await api.post('/admin/modules', body);
      reset();
      onCreated();
    } catch (err) {
      setError((err.data && err.data.detail) || 'Failed to create module.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Create Module"
      onClose={close}
      footer={
        <>
          <button className="btn btn-secondary" onClick={close}>Cancel</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleCreate}>
            {saving ? 'Creating…' : 'Create Module'}
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
        Add a new module that can be assigned to client accounts.
      </p>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="field" style={{ marginBottom: 16 }}>
        <label className="f-label">Module Type</label>
        <div className="module-type-toggle">
          <button
            type="button"
            className={'module-type-btn' + (form.moduleType === 'internal' ? ' active' : '')}
            onClick={() => setForm((f) => ({ ...f, moduleType: 'internal' }))}
          >
            Internal
          </button>
          <button
            type="button"
            className={'module-type-btn' + (form.moduleType === 'external' ? ' active' : '')}
            onClick={() => setForm((f) => ({ ...f, moduleType: 'external' }))}
          >
            External Service
          </button>
        </div>
      </div>

      <div className="form-grid col1">
        <div className="field">
          <label className="f-label">Module Name <em>*</em></label>
          <input className="f-input" placeholder="e.g. nlp.query" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>

        <div className="field">
          <label className="f-label">Description</label>
          <textarea className="f-input textarea" rows={3} placeholder="One or two sentences describing what this module does." value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>

        <div className="field">
          <label className="f-label">Features</label>
          <textarea className="f-input textarea" rows={5} placeholder={'One feature per line e.g.\nReal-time email validation\nMX record lookup\nBulk API support'} value={form.features} onChange={(e) => setForm((f) => ({ ...f, features: e.target.value }))} />
          <span className="f-sub">One feature per line. Shown as bullet points on the landing page.</span>
        </div>

        <div className="field">
          <label className="f-label">Icon</label>
          <input className="f-input" placeholder="e.g. database, mail-check, terminal-square" value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} />
          <span className="f-sub">Lucide icon name. Reference: lucide.dev/icons</span>
        </div>

        <div className="field">
          <label className="f-label">Version</label>
          <input className="f-input" placeholder="e.g. 1.0.0" value={form.version} onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))} />
        </div>

        <div className="field">
          <label className="f-label">Free Plan</label>
          <select className="f-input" value={form.freePlan} onChange={(e) => setForm((f) => ({ ...f, freePlan: e.target.value }))}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>

        <div className="field">
          <label className="f-label">Trial Weeks</label>
          <select className="f-input" value={form.trialWeeks} onChange={(e) => setForm((f) => ({ ...f, trialWeeks: e.target.value }))}>
            <option value="1">1 Week</option>
            <option value="2">2 Weeks</option>
            <option value="3">3 Weeks</option>
            <option value="4">4 Weeks</option>
          </select>
        </div>

        <div className="field">
          <label className="f-label">API Calls Allowed</label>
          <input className="f-input" type="number" min="0" placeholder="e.g. 1000" value={form.apiCalls} onChange={(e) => setForm((f) => ({ ...f, apiCalls: e.target.value }))} />
        </div>

        <div className="field">
          <div
            className={'check-item' + (form.isDefault ? ' checked' : '')}
            onClick={() => setForm((f) => ({ ...f, isDefault: !f.isDefault }))}
          >
            <input type="checkbox" checked={form.isDefault} readOnly />
            <div className="check-box">✓</div>
            <span className="check-lbl">Set as Default Module</span>
          </div>
        </div>

        {form.moduleType === 'internal' && (
          <div className="field">
            <label className="f-label">Sidebar Pages</label>
            <div className="check-grid">
              {sidebarItems.map((item) => {
                const checked = form.sidebarItems.has(item.value);
                return (
                  <div key={item.value} className={'check-item' + (checked ? ' checked' : '')} onClick={() => toggleSidebarItem(item.value)}>
                    <input type="checkbox" checked={checked} readOnly />
                    <div className="check-box">✓</div>
                    <span className="check-lbl">{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {form.moduleType === 'external' && (
          <div className="field">
            <label className="f-label">External Service URL <em>*</em></label>
            <input className="f-input" type="url" placeholder="https://your-service.com" value={form.externalUrl} onChange={(e) => setForm((f) => ({ ...f, externalUrl: e.target.value }))} />
            <span className="f-sub">Tenants will be redirected to this URL when they open this module.</span>
          </div>
        )}
      </div>
    </Modal>
  );
}