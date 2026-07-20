import { useState } from 'react';
import Modal from './Modal';
import { api } from '../api';

export default function DeleteSidebarItemModal({ item, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleDelete() {
    setDeleting(true);
    setError('');
    try {
      await api.del(`/admin/sidebar-items/${item.id}`);
      onDeleted();
    } catch (err) {
      setError((err.data && err.data.detail) || 'Failed to delete sidebar item.');
    } finally {
      setDeleting(false);
    }
  }

  if (!item) return null;

  return (
    <Modal
      open={!!item}
      title="Delete Sidebar Item"
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
      <p>Are you sure you want to delete <strong>{item.label}</strong>? Any module currently assigning this item will lose it. This cannot be undone.</p>
    </Modal>
  );
}