import { useState } from 'react';
import Modal from './Modal';
import { api } from '../api';

export default function DeleteAdminModal({ admin, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleDelete() {
    setDeleting(true);
    setError('');
    try {
      await api.del(`/admin/admins/${admin.id}`);
      onDeleted();
    } catch (err) {
      setError((err.data && err.data.detail) || 'Failed to delete admin.');
    } finally {
      setDeleting(false);
    }
  }

  if (!admin) return null;

  return (
    <Modal
      open={!!admin}
      title="Delete Admin"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" disabled={deleting} onClick={handleDelete}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error">{error}</div>}
      <p>Are you sure you want to delete <strong>{admin.username}</strong>? This cannot be undone.</p>
    </Modal>
  );
}