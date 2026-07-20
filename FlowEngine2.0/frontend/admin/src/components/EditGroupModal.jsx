import { useState, useEffect } from 'react';
import Modal from './Modal';
import { api } from '../api';

export default function EditGroupModal({ group, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [order, setOrder] = useState('0');
  const [status, setStatus] = useState('active');
  const [eligibleModules, setEligibleModules] = useState([]);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [loadingModules, setLoadingModules] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!group) return;
    setName(group.name);
    setDescription(group.description || '');
    setOrder(String(group.display_order));
    setStatus(group.status);
    setError('');
    loadEligible();
  }, [group]);

  async function loadEligible() {
    setLoadingModules(true);
    try {
      const d = await api.get('/admin/modules');
      const mods = d.modules || [];
      const eligible = mods.filter((m) => !m.group_id || m.group_id === group.id);
      setEligibleModules(eligible);
      setCheckedIds(new Set(eligible.filter((m) => m.group_id === group.id).map((m) => String(m.id))));
    } catch (_) {
      setEligibleModules([]);
    } finally {
      setLoadingModules(false);
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
    setError('');
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Group name is required.'); return; }

    setSaving(true);
    try {
      await api.patch(`/admin/module-groups/${group.id}`, {
        name: trimmedName,
        description: description.trim() || null,
        display_order: parseInt(order) || 0,
        status,
      });

      await Promise.all(
        eligibleModules.map((m) => {
          const shouldBeInGroup = checkedIds.has(String(m.id));
          const alreadyInGroup = m.group_id === group.id;
          if (shouldBeInGroup === alreadyInGroup) return Promise.resolve();
          return api.patch(`/admin/modules/${m.id}`, { group_id: shouldBeInGroup ? group.id : null });
        })
      );

      onSaved();
    } catch (err) {
      setError((err.data && err.data.detail) || 'Failed to update group.');
    } finally {
      setSaving(false);
    }
  }

  if (!group) return null;

  return (
    <Modal
      open={!!group}
      title="Edit Module Group"
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
          <label className="f-label">Group Name <em>*</em></label>
          <input className="f-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label className="f-label">Description</label>
          <input className="f-input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field">
          <label className="f-label">Display Order</label>
          <input className="f-input" type="number" min="0" value={order} onChange={(e) => setOrder(e.target.value)} />
        </div>
        <div className="field">
          <label className="f-label">Status</label>
          <select className="f-input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="field">
          <label className="f-label">Assign Modules to this Group</label>
          <div className="check-grid">
            {loadingModules && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading…</span>}
            {!loadingModules && eligibleModules.map((m) => {
              const checked = checkedIds.has(String(m.id));
              return (
                <div key={m.id} className={'check-item' + (checked ? ' checked' : '')} onClick={() => toggle(m.id)}>
                  <input type="checkbox" checked={checked} readOnly />
                  <div className="check-box">✓</div>
                  <span className="check-lbl">{m.name}</span>
                </div>
              );
            })}
          </div>
          <span className="f-sub">Only modules not already in another group are shown.</span>
        </div>
      </div>
    </Modal>
  );
}