import { useEffect, useState } from 'react';
import Modal from './Modal';
import { api } from '../api';

export default function UpgradeClientModal({ client, onClose, onSaved }) {
  const [accountType, setAccountType] = useState('production');
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!client) return;
    setAccountType(client.account_type === 'trial' ? 'production' : 'trial');
    setExpiresAt('');
    setError('');
  }, [client]);

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const body = { account_type: accountType };
      if (expiresAt) body.expires_at = expiresAt;
      await api.patch(`/api/accounts/${encodeURIComponent(client.email)}/upgrade`, body);
      onSaved();
    } catch (err) {
      setError((err.data && err.data.detail) || 'Failed to upgrade client.');
    } finally {
      setSaving(false);
    }
  }

  if (!client) return null;

  return (
    <Modal
      open={!!client}
      title="Change Account Type"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
            {saving ? 'Saving…' : 'Confirm'}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-grid">
        <div className="field s2">
          <label className="f-label">Account Type</label>
          <select className="f-input" value={accountType} onChange={(e) => setAccountType(e.target.value)}>
            <option value="trial">Trial</option>
            <option value="production">Production</option>
          </select>
        </div>
        <div className="field s2">
          <label className="f-label">Expires At</label>
          <input className="f-input" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}