import { useEffect, useState } from "react";
import { api } from "../api";
import CreateSidebarItemModal from "../components/CreateSidebarItemModal";
import EditSidebarItemModal from "../components/EditSidebarItemModal";
import DeleteSidebarItemModal from "../components/DeleteSidebarItemModal";

export default function SidebarItems() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deletingItem, setDeletingItem] = useState(null);

  useEffect(() => {
    loadItems();
  }, []);

  async function loadItems() {
    setError("");
    try {
      const d = await api.get("/admin/sidebar-items");
      setItems(d.items || []);
    } catch (_) {
      setError("Failed to load sidebar items.");
    }
  }

  const total = items.length;
  const active = items.filter((i) => i.status === "active").length;
  const external = items.filter((i) => i.type === "external").length;

  return (
    <>
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-lbl">Total Left Nav Items</div>
          <div className="stat-row-inner">
            <div className="stat-val">{total}</div>
            <div className="stat-ico">📋</div>
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
          <div className="stat-lbl">External</div>
          <div className="stat-row-inner">
            <div className="stat-val">{external}</div>
            <div className="stat-ico">🔗</div>
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
            <div className="card-icon">📋</div>All Client Side Left Nav Items
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setCreateOpen(true)}
          >
            + Add Left Nav Item
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
                <th>Label</th>
                <th>Value</th>
                <th>Section</th>
                <th>Type</th>
                <th>Hidden From Module User</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty">
                      <div className="empty-ico">📋</div>
                      <div className="empty-title">No client-side left nav items yet</div>
                      <div className="empty-sub">
                        Create your first client-side left nav item using the + Add Left Nav
                        Item button
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              {items.map((i) => (
                <tr key={i.id}>
                  <td className="hi">{i.label}</td>
                  <td className="mono">{i.value}</td>
                  <td>
                    <span
                      className={
                        "badge " +
                        (i.nav_section === "primary"
                          ? "badge-blue"
                          : "badge-amber")
                      }
                    >
                      {i.nav_section === "primary" ? "Primary" : "More"}
                    </span>
                  </td>
                  <td>
                    <span
                      className={
                        "badge " +
                        (i.type === "internal" ? "badge-blue" : "badge-amber")
                      }
                    >
                      {i.type === "internal" ? "Internal" : "External"}
                    </span>
                  </td>
                  <td>{i.hidden_from_module_user ? "Yes" : "No"}</td>
                  <td>
                    <span
                      className={
                        "badge " +
                        (i.status === "active" ? "badge-green" : "badge-amber")
                      }
                    >
                      {i.status}
                    </span>
                  </td>
                  <td>
                    <div className="t-actions">
                      <button
                        className="t-btn t-edit"
                        onClick={() => setEditingItem(i)}
                      >
                        Edit
                      </button>
                      <button
                        className="t-btn t-del"
                        onClick={() => setDeletingItem(i)}
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

      <CreateSidebarItemModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          loadItems();
        }}
      />
      <EditSidebarItemModal
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onSaved={() => {
          setEditingItem(null);
          loadItems();
        }}
      />
      <DeleteSidebarItemModal
        item={deletingItem}
        onClose={() => setDeletingItem(null)}
        onDeleted={() => {
          setDeletingItem(null);
          loadItems();
        }}
      />
    </>
  );
}
