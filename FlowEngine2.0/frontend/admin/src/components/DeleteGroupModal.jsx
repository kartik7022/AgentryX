import { useState } from 'react';
import Modal from './Modal';
import { api } from '../api';

export default function DeleteGroupModal({ group, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleDelete() {
    setDeleting(true);
    setError('');
    try {
      await api.del(`/admin/module-groups/${group.id}`);
      onDeleted();
    } catch (err) {
      setError((err.data && err.data.detail) || 'Failed to delete group.');
    } finally {
      setDeleting(false);
    }
  }

  if (!group) return null;

  return (
    <Modal
      open={!!group}
      title="Delete Module Group"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" disabled={deleting} onClick={handleDelete}>
            {deleting ? 'Deleting…' : 'Delete Group'}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error">{error}</div>}
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
        All modules in this group will become standalone. This cannot be undone.
      </p>
      <div className="danger-box">{group.name}</div>
    </Modal>
  );
}