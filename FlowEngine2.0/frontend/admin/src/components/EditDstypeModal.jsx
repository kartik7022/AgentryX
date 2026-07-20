import { useEffect, useState } from 'react';
import Modal from './Modal';
import { api } from '../api';
import { PROTOCOLS, AUTH_STYLES } from '../constants';

export default function EditDstypeModal({ dstype, onClose, onSaved }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!dstype) return;
    setError('');
    setForm({
      display: dstype.display_name,
      protocol: dstype.protocol,
      dialect: dstype.dialect_token,
      impl: dstype.implementation_key,
      auth: dstype.auth_style,
      required: (dstype.config_schema && dstype.config_schema.required) ? dstype.config_schema.required.join(', ') : '',
      optional: (dstype.config_schema && dstype.config_schema.optional) ? dstype.config_schema.optional.join(', ') : '',
      isActive: dstype.is_active,
    });
  }, [dstype]);

  async function handleSave() {
    if (!form) return;
    setError('');
    if (!form.display.trim()) { setError('Display name is required.'); return; }

    setSaving(true);
    try {
      const required = form.required.trim() ? form.required.trim().split(',').map((s) => s.trim()).filter(Boolean) : [];
      const optional = form.optional.trim() ? form.optional.trim().split(',').map((s) => s.trim()).filter(Boolean) : [];
      await api.patch(`/admin/datasource-types/${dstype.driver_id}`, {
        display_name: form.display.trim(),
        protocol: form.protocol,
        dialect_token: form.dialect.trim(),
        implementation_key: form.impl.trim(),
        auth_style: form.auth,
        runtime_owner: dstype.runtime_owner || 'shared',
        capabilities: dstype.capabilities || {},
        config_schema: { required, optional },
        is_active: form.isActive,
      });
      onSaved();
    } catch (err) {
      setError((err.data && err.data.detail) || 'Failed to update.');
    } finally {
      setSaving(false);
    }
  }

  if (!dstype || !form) return null;

  return (
    <Modal
      open={!!dstype}
      title={`Edit Driver — ${dstype.display_name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-grid col1">
        <div className="field">
          <label className="f-label">Canonical Name</label>
          <input className="f-input" value={dstype.canonical_name} disabled />
        </div>
        <div className="field">
          <label className="f-label">Display Name <em>*</em></label>
          <input className="f-input" value={form.display} onChange={(e) => setForm((f) => ({ ...f, display: e.target.value }))} />
        </div>
        <div className="field">
          <label className="f-label">Protocol</label>
          <select className="f-input" value={form.protocol} onChange={(e) => setForm((f) => ({ ...f, protocol: e.target.value }))}>
            {PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="f-label">Dialect Token</label>
          <input className="f-input" value={form.dialect} onChange={(e) => setForm((f) => ({ ...f, dialect: e.target.value }))} />
        </div>
        <div className="field">
          <label className="f-label">Implementation Key</label>
          <input className="f-input" value={form.impl} onChange={(e) => setForm((f) => ({ ...f, impl: e.target.value }))} />
        </div>
        <div className="field">
          <label className="f-label">Auth Style</label>
          <select className="f-input" value={form.auth} onChange={(e) => setForm((f) => ({ ...f, auth: e.target.value }))}>
            {AUTH_STYLES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="f-label">Required Fields (comma separated)</label>
          <input className="f-input" value={form.required} onChange={(e) => setForm((f) => ({ ...f, required: e.target.value }))} />
        </div>
        <div className="field">
          <label className="f-label">Optional Fields (comma separated)</label>
          <input className="f-input" value={form.optional} onChange={(e) => setForm((f) => ({ ...f, optional: e.target.value }))} />
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