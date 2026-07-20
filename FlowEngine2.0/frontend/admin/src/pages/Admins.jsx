import { useEffect, useState } from "react";
import { api } from "../api";
import CreateAdminModal from "../components/CreateAdminModal";
import EditAdminModal from "../components/EditAdminModal";
import DeleteAdminModal from "../components/DeleteAdminModal";

export default function Admins() {
  const [admins, setAdmins] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [deletingAdmin, setDeletingAdmin] = useState(null);
  const [banner, setBanner] = useState({ type: "", msg: "" });

  useEffect(() => {
    loadAdmins();
  }, []);

  async function loadAdmins() {
    try {
      const d = await api.get("/admin/admins");
      setAdmins(d || []);
    } catch (_) {
      flash("error", "Failed to load admins.");
    }
  }

  function flash(type, msg) {
    setBanner({ type, msg });
    setTimeout(() => setBanner({ type: "", msg: "" }), 4000);
  }

  return (
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
          <div className="card-icon">🔐</div>Admin Accounts
        </div>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          + Add Admin
        </button>
      </div>

      {banner.msg && (
        <div
          className={"alert alert-" + banner.type}
          style={{ margin: "14px 20px 0" }}
        >
          {banner.msg}
        </div>
      )}

      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Role</th>
              <th>Status</th>
              <th>Created By</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {admins.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty">
                    <div className="empty-ico">🔐</div>
                    <div className="empty-title">No admins yet</div>
                    <div className="empty-sub">
                      Add your first admin using the button above
                    </div>
                  </div>
                </td>
              </tr>
            )}
            {admins.map((a) => (
              <tr key={a.id}>
                <td className="hi">{a.username}</td>
                <td>
                  <span
                    className={
                      "badge " +
                      (a.role === "superadmin" ? "badge-amber" : "badge-blue")
                    }
                  >
                    {a.role}
                  </span>
                </td>
                <td>
                  <span
                    className={
                      "badge " + (a.is_active ? "badge-green" : "badge-red")
                    }
                  >
                    {a.is_active ? "Active" : "Disabled"}
                  </span>
                </td>
                <td className="mono">{a.created_by_username || "—"}</td>
                <td className="mono">
                  {a.created_at
                    ? new Date(a.created_at).toLocaleDateString()
                    : "—"}
                </td>
                <td>
                  {a.role !== "superadmin" ? (
                    <div className="t-actions">
                      <button
                        className="t-btn t-edit"
                        onClick={() => setEditingAdmin(a)}
                      >
                        Edit
                      </button>
                      <button
                        className="t-btn t-del"
                        onClick={() => setDeletingAdmin(a)}
                      >
                        Delete
                      </button>
                    </div>
                  ) : (
                    <span className="protected-lbl">Protected</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CreateAdminModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(username) => {
          setCreateOpen(false);
          flash("success", `Admin "${username}" created successfully.`);
          loadAdmins();
        }}
      />
      <EditAdminModal
        admin={editingAdmin}
        onClose={() => setEditingAdmin(null)}
        onSaved={() => {
          setEditingAdmin(null);
          flash("success", "Admin updated successfully.");
          loadAdmins();
        }}
      />
      <DeleteAdminModal
        admin={deletingAdmin}
        onClose={() => setDeletingAdmin(null)}
        onDeleted={() => {
          setDeletingAdmin(null);
          flash("success", "Admin deleted successfully.");
          loadAdmins();
        }}
      />
    </div>
  );
}
