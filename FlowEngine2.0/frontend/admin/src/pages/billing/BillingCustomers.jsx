import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function BillingCustomers() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const listRes = await fetch(
        "/killbill-api/v1/accounts/pagination?limit=50",
        {
          headers: { Accept: "application/json" },
        },
      );
      let accounts = [];
      if (listRes.ok) {
        const data = await listRes.json();
        if (Array.isArray(data)) accounts = data;
      }
      setCustomers(accounts);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const filtered = customers.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.name || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <p className="f-sub" style={{ marginBottom: 16 }}>
        {filtered.length} of {customers.length} accounts
      </p>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      <div className="search-with-icon" style={{ marginBottom: 16 }}>
        <span className="search-icon">🔍</span>
        <input
          type="text"
          className="f-input"
          style={{
            paddingLeft: 32,
            paddingRight: search ? 32 : 12,
            maxWidth: 360,
          }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email..."
        />
        {search && (
          <button className="search-clear" onClick={() => setSearch("")}>
            ✕
          </button>
        )}
      </div>

      <div className="card">
        {loading ? (
          <div className="card-body">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton-row" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-title">No customers match "{search}"</div>
          </div>
        ) : (
          <div className="customer-list">
            {filtered.map((acc) => (
              <button
                key={acc.accountId}
                className="customer-row"
                onClick={() => navigate(`/billing/customers/${acc.accountId}`)}
              >
                <div className="customer-avatar">
                  {(acc.name || "U")[0].toUpperCase()}
                </div>
                <span className="customer-name">{acc.name || "Unnamed"}</span>
                <span className="customer-arrow">→</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
