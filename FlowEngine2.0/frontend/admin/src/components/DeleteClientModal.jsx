import { useState } from "react";
import Modal from "./Modal";
import { api } from "../api";

export default function DeleteClientModal({ email, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setDeleting(true);
    setError("");
    try {
      await api.del(`/api/accounts/${encodeURIComponent(email)}`);
      onDeleted();
    } catch (err) {
      setError((err.data && err.data.detail) || "Failed to delete client.");
    } finally {
      setDeleting(false);
    }
  }

  if (!email) return null;

  return (
    <Modal
      open={!!email}
      title="Delete Client"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-danger"
            disabled={deleting}
            onClick={handleDelete}
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error">{error}</div>}
      <p>
        Are you sure you want to delete <strong>{email}</strong>? This cannot be
        undone.
      </p>
    </Modal>
  );
}
