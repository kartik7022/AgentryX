import { useEffect, useState } from "react";
import { api } from "../api";
import EditClientModal from "../components/EditClientModal";
import UpgradeClientModal from "../components/UpgradeClientModal";
import DeleteClientModal from "../components/DeleteClientModal";

export default function ManageClients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [editingClient, setEditingClient] = useState(null);
  const [upgradingClient, setUpgradingClient] = useState(null);
  const [deletingEmail, setDeletingEmail] = useState(null);

  useEffect(() => {
    loadClients();
  }, []);

  async function loadClients() {
    setError("");
    setLoading(true);
    try {
      const d = await api.get("/api/accounts");
      setClients(d.accounts || []);
    } catch (_) {
      setError("Failed to load clients.");
    } finally {
      setLoading(false);
    }
  }

  const filtered = clients.filter(
    (c) =>
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.tenant_id.toLowerCase().includes(search.toLowerCase()),
  );

  const total = clients.length;
  const active = clients.filter((c) => c.status === "active").length;

  return (
    <>
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-lbl">Total Clients</div>
          <div className="stat-row-inner">
            <div className="stat-val">{total}</div>
            <div className="stat-ico">👥</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Active</div>
          <div className="stat-row-inner">
            <div className="stat-val">{active}</div>
            <div className="stat-ico">✅</div>
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
            <div className="card-icon">👥</div>All Client Accounts
          </div>
          <input
            className="f-input search-input"
            type="text"
            placeholder="Search by email or tenant…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
                <th>Email</th>
                <th>Tenant ID</th>
                <th>Modules</th>
                <th>Status</th>
                <th>Account Type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty">
                      <div className="empty-title">Loading clients…</div>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty">
                      <div className="empty-ico">👥</div>
                      <div className="empty-title">No clients yet</div>
                      <div className="empty-sub">
                        Register your first client using the Register Client tab
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              {filtered.map((c) => (
                <tr key={c.email}>
                  <td className="hi">{c.email}</td>
                  <td>
                    <span className="mono">{c.tenant_id}</span>
                  </td>
                  <td>
                    <div className="tag-list">
                      {(c.modules || []).map((m) => (
                        <span className="tag" key={m}>
                          {m}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <span
                      className={
                        "badge " +
                        (c.status === "active" ? "badge-green" : "badge-red")
                      }
                    >
                      {c.status}
                    </span>
                  </td>
                  <td>
                    <span
                      className={
                        "badge " +
                        (c.account_type === "production"
                          ? "badge-blue"
                          : "badge-amber")
                      }
                    >
                      {c.account_type || "—"}
                    </span>
                  </td>
                  <td>
                    <div className="t-actions">
                      <button
                        className="t-btn t-edit"
                        onClick={() => setEditingClient(c)}
                      >
                        Edit
                      </button>
                      <button
                        className="t-btn t-upgrade"
                        onClick={() => setUpgradingClient(c)}
                      >
                        Upgrade
                      </button>
                      <button
                        className="t-btn t-del"
                        onClick={() => setDeletingEmail(c.email)}
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

      <EditClientModal
        client={editingClient}
        onClose={() => setEditingClient(null)}
        onSaved={() => {
          setEditingClient(null);
          loadClients();
        }}
      />
      <UpgradeClientModal
        client={upgradingClient}
        onClose={() => setUpgradingClient(null)}
        onSaved={() => {
          setUpgradingClient(null);
          loadClients();
        }}
      />
      <DeleteClientModal
        email={deletingEmail}
        onClose={() => setDeletingEmail(null)}
        onDeleted={() => {
          setDeletingEmail(null);
          loadClients();
        }}
      />
    </>
  );
}
