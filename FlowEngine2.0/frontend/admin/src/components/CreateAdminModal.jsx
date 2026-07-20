import { useState } from 'react';
import Modal from './Modal';
import { api } from '../api';

export default function CreateAdminModal({ open, onClose, onCreated }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function close() {
    setUsername('');
    setPassword('');
    setError('');
    onClose();
  }

  async function handleCreate() {
    setError('');
    const trimmed = username.trim();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/admin/admins', { username: trimmed, password });
      setUsername('');
      setPassword('');
      onCreated(trimmed);
    } catch (err) {
      setError((err.data && err.data.detail) || 'Failed to create admin.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Add Admin"
      onClose={close}
      footer={
        <>
          <button className="btn btn-secondary" onClick={close}>Cancel</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleCreate}>
            {saving ? 'Creating…' : 'Create Admin'}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-grid col1">
        <div className="field">
          <label className="f-label">Username (Email) <em>*</em></label>
          <input className="f-input" type="email" placeholder="admin@company.com" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="field">
          <label className="f-label">Password <em>*</em></label>
          <input className="f-input" type="password" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}