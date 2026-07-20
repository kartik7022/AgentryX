import { useEffect, useState } from 'react';
import Modal from './Modal';
import { api } from '../api';

export default function FieldsModal({ dstype, onClose }) {
  const [aliases, setAliases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('legacy');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!dstype) return;
    setNewName('');
    setNewType('legacy');
    setError('');
    loadAliases();
  }, [dstype]);

  async function loadAliases() {
    setLoading(true);
    try {
      const d = await api.get(`/admin/datasource-types/${dstype.driver_id}/aliases`);
      setAliases(d || []);
    } catch (_) {
      setError('Failed to load aliases.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    setError('');
    if (!newName.trim()) { setError('Alias name is required.'); return; }
    setAdding(true);
    try {
      await api.post(`/admin/datasource-types/${dstype.driver_id}/aliases`, {
        alias_name: newName.trim(),
        alias_type: newType,
        is_active: true,
      });
      setNewName('');
      loadAliases();
    } catch (err) {
      setError((err.data && err.data.detail) || 'Failed to add alias.');
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(aliasId) {
    if (!window.confirm('Delete this alias?')) return;
    try {
      await api.del(`/admin/datasource-types/aliases/${aliasId}`);
      loadAliases();
    } catch (err) {
      alert((err.data && err.data.detail) || 'Failed to delete alias.');
    }
  }

  if (!dstype) return null;

  return (
    <Modal
      open={!!dstype}
      title="Manage Aliases"
      onClose={onClose}
      footer={<button className="btn btn-secondary" onClick={onClose}>Done</button>}
    >
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
        Aliases for: {dstype.display_name}
      </p>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="tbl-wrap" style={{ marginBottom: 16 }}>
        <table>
          <thead>
            <tr><th>Alias Name</th><th>Type</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>Loading…</td></tr>
            )}
            {!loading && aliases.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>No aliases yet.</td></tr>
            )}
            {!loading && aliases.map((a) => (
              <tr key={a.alias_id}>
                <td className="hi mono">{a.alias_name}</td>
                <td><span className="badge badge-blue">{a.alias_type}</span></td>
                <td><span className={'badge ' + (a.is_active ? 'badge-green' : 'badge-red')}>{a.is_active ? 'Active' : 'Inactive'}</span></td>
                <td><button className="t-btn t-del" onClick={() => handleDelete(a.alias_id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="field-row">
        <input className="f-input" placeholder="New alias name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <select className="f-input" value={newType} onChange={(e) => setNewType(e.target.value)}>
          <option value="legacy">legacy</option>
          <option value="current">current</option>
        </select>
        <button className="btn btn-primary" disabled={adding} onClick={handleAdd}>
          {adding ? 'Adding…' : 'Add Alias'}
        </button>
      </div>
    </Modal>
  );
}