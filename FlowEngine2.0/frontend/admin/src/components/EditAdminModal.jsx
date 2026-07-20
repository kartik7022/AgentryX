import { useEffect, useState } from 'react';
import Modal from './Modal';
import { api } from '../api';

export default function EditAdminModal({ admin, onClose, onSaved }) {
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!admin) return;
    setPassword('');
    setIsActive(admin.is_active);
    setError('');
  }, [admin]);

  async function handleSave() {
    setError('');
    if (password && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSaving(true);
    try {
      const body = { is_active: isActive };
      if (password) body.password = password;
      await api.patch(`/admin/admins/${admin.id}`, body);
      onSaved();
    } catch (err) {
      setError((err.data && err.data.detail) || 'Failed to update admin.');
    } finally {
      setSaving(false);
    }
  }

  if (!admin) return null;

  return (
    <Modal
      open={!!admin}
      title={`Edit Admin — ${admin.username}`}
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
          <label className="f-label">New Password (leave blank to keep current)</label>
          <input className="f-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="field">
          <button
            type="button"
            className={isActive ? 'btn btn-danger' : 'btn btn-secondary'}
            onClick={() => setIsActive((v) => !v)}
          >
            {isActive ? 'Disable Admin' : 'Enable Admin'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
