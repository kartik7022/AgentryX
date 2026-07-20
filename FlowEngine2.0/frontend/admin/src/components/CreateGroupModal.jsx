import { useState, useEffect } from 'react';
import Modal from './Modal';
import { api } from '../api';

export default function CreateGroupModal({ open, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [order, setOrder] = useState('0');
  const [ungroupedModules, setUngroupedModules] = useState([]);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [loadingModules, setLoadingModules] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('');
    setDescription('');
    setOrder('0');
    setCheckedIds(new Set());
    setError('');
    loadUngrouped();
  }, [open]);

  async function loadUngrouped() {
    setLoadingModules(true);
    try {
      const d = await api.get('/admin/modules');
      const mods = d.modules || [];
      setUngroupedModules(mods.filter((m) => !m.group_id));
    } catch (_) {
      setUngroupedModules([]);
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

  async function handleCreate() {
    setError('');
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Group name is required.'); return; }

    setSaving(true);
    try {
      const d = await api.post('/admin/module-groups', {
        name: trimmedName,
        description: description.trim() || null,
        display_order: parseInt(order) || 0,
      });
      await Promise.all(
        [...checkedIds].map((mid) =>
          api.patch(`/admin/modules/${mid}`, { group_id: d.id })
        )
      );
      onCreated(trimmedName);
    } catch (err) {
      setError((err.data && err.data.detail) || 'Failed to create group.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Create Module Group"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleCreate}>
            {saving ? 'Creating…' : 'Create Group'}
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
        Group modules together — they will appear under one tab in the portal.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-grid col1">
        <div className="field">
          <label className="f-label">Group Name <em>*</em></label>
          <input className="f-input" placeholder="e.g. Analytics Suite" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label className="f-label">Description</label>
          <input className="f-input" placeholder="What does this group contain?" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field">
          <label className="f-label">Display Order</label>
          <input className="f-input" type="number" min="0" value={order} onChange={(e) => setOrder(e.target.value)} />
          <span className="f-sub">Lower numbers appear first in the portal topbar.</span>
        </div>
        <div className="field">
          <label className="f-label">Assign Modules</label>
          <div className="check-grid">
            {loadingModules && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading…</span>}
            {!loadingModules && ungroupedModules.length === 0 && (
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No ungrouped modules available.</span>
            )}
            {!loadingModules && ungroupedModules.map((m) => {
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
          <span className="f-sub">Only modules not already in a group are shown.</span>
        </div>
      </div>
    </Modal>
  );
}