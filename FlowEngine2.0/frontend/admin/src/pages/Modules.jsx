import { useEffect, useState } from "react";
import { api } from "../api";
import CreateModuleModal from "../components/CreateModuleModal";
import EditModuleModal from "../components/EditModuleModal";
import DeleteModuleModal from "../components/DeleteModuleModal";

export default function Modules() {
  const [modules, setModules] = useState([]);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingModule, setEditingModule] = useState(null);
  const [deletingModule, setDeletingModule] = useState(null);

  useEffect(() => {
    loadModules();
  }, []);

  async function loadModules() {
    setError("");
    try {
      const d = await api.get("/admin/modules");
      setModules(d.modules || []);
    } catch (_) {
      setError("Failed to load modules.");
    }
  }

  const total = modules.length;
  const active = modules.filter((m) => m.status === "active").length;
  const defaultCount = modules.filter((m) => m.is_default).length;

  return (
    <>
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-lbl">Total Modules</div>
          <div className="stat-row-inner">
            <div className="stat-val">{total}</div>
            <div className="stat-ico">📦</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Active</div>
          <div className="stat-row-inner">
            <div className="stat-val">{active}</div>
            <div className="stat-ico">✅</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Default</div>
          <div className="stat-row-inner">
            <div className="stat-val">{defaultCount}</div>
            <div className="stat-ico">⭐</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div
          className="card-head"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div className="card-title">
            <div className="card-icon">📦</div>All Modules
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setCreateOpen(true)}
          >
            + Add Module
          </button>
        </div>

        {error && (
          <div className="alert alert-error" style={{ margin: "14px 20px 0" }}>
            {error}
          </div>
        )}

        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Version</th>
                <th>Status</th>
                <th>Default</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {modules.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty">
                      <div className="empty-ico">📦</div>
                      <div className="empty-title">No modules yet</div>
                      <div className="empty-sub">
                        Create your first module using the + Add Module button
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              {modules.map((m) => (
                <tr key={m.id}>
                  <td className="hi">{m.name}</td>
                  <td>{m.description || "—"}</td>
                  <td className="mono">{m.version || "—"}</td>
                  <td>
                    <span
                      className={
                        "badge " +
                        (m.status === "active"
                          ? "badge-green"
                          : m.status === "inactive"
                            ? "badge-amber"
                            : "badge-red")
                      }
                    >
                      {m.status}
                    </span>
                  </td>
                  <td>
                    <span
                      className={
                        "badge " + (m.is_default ? "badge-blue" : "badge-amber")
                      }
                    >
                      {m.is_default ? "Default" : "Optional"}
                    </span>
                  </td>
                  <td className="mono">
                    {m.created_at
                      ? new Date(m.created_at).toLocaleDateString()
                      : "—"}
                  </td>
                  <td>
                    <div className="t-actions">
                      <button
                        className="t-btn t-edit"
                        onClick={() => setEditingModule(m)}
                      >
                        Edit
                      </button>
                      <button
                        className="t-btn t-del"
                        onClick={() => setDeletingModule(m)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <CreateModuleModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          loadModules();
        }}
      />
      <EditModuleModal
        module={editingModule}
        onClose={() => setEditingModule(null)}
        onSaved={() => {
          setEditingModule(null);
          loadModules();
        }}
      />
      <DeleteModuleModal
        module={deletingModule}
        onClose={() => setDeletingModule(null)}
        onDeleted={() => {
          setDeletingModule(null);
          loadModules();
        }}
      />
    </>
  );
}
