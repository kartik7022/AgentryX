import { useState } from 'react';
import Modal from './Modal';
import { api } from '../api';
import { PROTOCOLS, AUTH_STYLES } from '../constants';

const initial = {
  canonical: '', display: '', protocol: 'sql', dialect: '', impl: '',
  auth: 'broker', required: '', optional: '', isActive: true,
};

export default function CreateDstypeModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function close() {
    setForm(initial);
    setError('');
    onClose();
  }

  async function handleCreate() {
    setError('');
    if (!form.canonical.trim()) { setError('Canonical name is required.'); return; }
    if (!form.display.trim()) { setError('Display name is required.'); return; }
    if (!form.dialect.trim()) { setError('Dialect token is required.'); return; }
    if (!form.impl.trim()) { setError('Implementation key is required.'); return; }

    setSaving(true);
    try {
      const required = form.required.trim() ? form.required.trim().split(',').map((s) => s.trim()).filter(Boolean) : [];
      const optional = form.optional.trim() ? form.optional.trim().split(',').map((s) => s.trim()).filter(Boolean) : [];
      await api.post('/admin/datasource-types', {
        canonical_name: form.canonical.trim(),
        display_name: form.display.trim(),
        protocol: form.protocol,
        dialect_token: form.dialect.trim(),
        implementation_key: form.impl.trim(),
        auth_style: form.auth,
        capabilities: {},
        config_schema: { required, optional },
        is_active: form.isActive,
      });
      close();
      onCreated(form.display.trim());
    } catch (err) {
      setError((err.data && err.data.detail) || 'Failed to create driver.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Add Driver"
      onClose={close}
      footer={
        <>
          <button className="btn btn-secondary" onClick={close}>Cancel</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleCreate}>
            {saving ? 'Creating…' : 'Create Driver'}
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>Define a new driver definition.</p>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-grid col1">
        <div className="field">
          <label className="f-label">Canonical Name <em>*</em></label>
          <input className="f-input" placeholder="e.g. mysql" value={form.canonical} onChange={(e) => setForm((f) => ({ ...f, canonical: e.target.value }))} />
          <span className="f-sub">Unique identifier, lowercase with underscores</span>
        </div>
        <div className="field">
          <label className="f-label">Display Name <em>*</em></label>
          <input className="f-input" placeholder="e.g. MySQL" value={form.display} onChange={(e) => setForm((f) => ({ ...f, display: e.target.value }))} />
        </div>
        <div className="field">
          <label className="f-label">Protocol <em>*</em></label>
          <select className="f-input" value={form.protocol} onChange={(e) => setForm((f) => ({ ...f, protocol: e.target.value }))}>
            {PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="f-label">Dialect Token <em>*</em></label>
          <input className="f-input" placeholder="e.g. mysql" value={form.dialect} onChange={(e) => setForm((f) => ({ ...f, dialect: e.target.value }))} />
        </div>
        <div className="field">
          <label className="f-label">Implementation Key <em>*</em></label>
          <input className="f-input" placeholder="e.g. mysql" value={form.impl} onChange={(e) => setForm((f) => ({ ...f, impl: e.target.value }))} />
        </div>
        <div className="field">
          <label className="f-label">Auth Style</label>
          <select className="f-input" value={form.auth} onChange={(e) => setForm((f) => ({ ...f, auth: e.target.value }))}>
            {AUTH_STYLES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="f-label">Required Fields (comma separated)</label>
          <input className="f-input" placeholder="e.g. host,port,database,username,password" value={form.required} onChange={(e) => setForm((f) => ({ ...f, required: e.target.value }))} />
          <span className="f-sub">These are shown to tenant as credential fields</span>
        </div>
        <div className="field">
          <label className="f-label">Optional Fields (comma separated)</label>
          <input className="f-input" placeholder="e.g. timeout_seconds,max_workers" value={form.optional} onChange={(e) => setForm((f) => ({ ...f, optional: e.target.value }))} />
        </div>
        <div className="field">
          <div className={'check-item' + (form.isActive ? ' checked' : '')} onClick={() => setForm((f) => ({ ...f, isActive: !f.isActive }))}>
            <input type="checkbox" checked={form.isActive} readOnly />
            <div className="check-box">✓</div>
            <span className="check-lbl">Active (visible to tenants)</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}