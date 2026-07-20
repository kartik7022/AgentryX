import { useState } from 'react';
import Modal from './Modal';
import { api } from '../api';

export default function DeleteModuleModal({ module, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleDelete() {
    setDeleting(true);
    setError('');
    try {
      await api.del(`/admin/modules/${module.id}`);
      onDeleted();
    } catch (err) {
      setError((err.data && err.data.detail) || 'Failed to delete module.');
    } finally {
      setDeleting(false);
    }
  }

  if (!module) return null;

  return (
    <Modal
      open={!!module}
      title="Delete Module"
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
      <p>Are you sure you want to delete <strong>{module.name}</strong>? This cannot be undone.</p>
    </Modal>
  );
}