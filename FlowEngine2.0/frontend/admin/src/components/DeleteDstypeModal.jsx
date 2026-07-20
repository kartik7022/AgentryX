import { useState } from 'react';
import Modal from './Modal';
import { api } from '../api';

export default function DeleteDstypeModal({ dstype, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleDelete() {
    setDeleting(true);
    setError('');
    try {
      await api.del(`/admin/datasource-types/${dstype.driver_id}`);
      onDeleted();
    } catch (err) {
      setError((err.data && err.data.detail) || 'Failed to delete.');
    } finally {
      setDeleting(false);
    }
  }

  if (!dstype) return null;

  return (
    <Modal
      open={!!dstype}
      title="Delete Driver"
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
      <p>Are you sure you want to delete <strong>{dstype.display_name}</strong>? This cannot be undone.</p>
    </Modal>
  );
}