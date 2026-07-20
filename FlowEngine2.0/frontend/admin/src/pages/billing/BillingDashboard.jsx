import { useEffect, useState } from "react";

function StatCard({ label, value, sub, colorClass }) {
  return (
    <div className="stat-card-b">
      <p className="stat-card-b-label">{label}</p>
      <p className={"stat-card-b-value " + colorClass}>{value}</p>
      {sub && <p className="stat-card-b-sub">{sub}</p>}
    </div>
  );
}

export default function BillingDashboard() {
  const [stats, setStats] = useState({
    totalAccounts: 0,
    activeSubscriptions: 0,
    totalInvoices: 0,
    unpaidInvoices: 0,
  });
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const accRes = await fetch(
        "/killbill-api/v1/accounts/pagination?limit=50",
        {
          headers: { Accept: "application/json" },
        },
      );
      if (!accRes.ok)
        throw new Error(`Failed to fetch accounts: HTTP ${accRes.status}`);
      const accList = await accRes.json();
      const validAccounts = Array.isArray(accList) ? accList : [];
      setAccounts(validAccounts.slice(0, 10));

      let totalActiveSubs = 0;
      let totalInv = 0;
      let unpaidInv = 0;

      await Promise.all(
        validAccounts.map(async (acc) => {
          try {
            const [subRes, invRes] = await Promise.all([
              fetch(`/killbill-api/v1/accounts/${acc.accountId}/bundles`, {
                headers: { Accept: "application/json" },
              }),
              fetch(`/killbill-api/v1/accounts/${acc.accountId}/invoices`, {
                headers: { Accept: "application/json" },
              }),
            ]);
            const subs = subRes.ok ? await subRes.json() : [];
            const invs = invRes.ok ? await invRes.json() : [];

            if (Array.isArray(subs)) totalActiveSubs += subs.length;
            if (Array.isArray(invs)) {
              totalInv += invs.length;
              unpaidInv += invs.filter((inv) => inv.balance > 0).length;
            }
          } catch (_) {
            // skip failed accounts
          }
        }),
      );

      setStats({
        totalAccounts: validAccounts.length,
        activeSubscriptions: totalActiveSubs,
        totalInvoices: totalInv,
        unpaidInvoices: unpaidInv,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          ⚠️ {error} — make sure Kill Bill and gateway are running.
        </div>
      )}

      {loading ? (
        <div className="stats-row-b">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stat-card-b skeleton" />
          ))}
        </div>
      ) : (
        <div className="stats-row-b">
          <StatCard
            label="Total Customers"
            value={stats.totalAccounts}
            sub="Kill Bill accounts"
            colorClass="c-indigo"
          />
          <StatCard
            label="Active Subscriptions"
            value={stats.activeSubscriptions}
            sub="Across all accounts"
            colorClass="c-green"
          />
          <StatCard
            label="Total Invoices"
            value={stats.totalInvoices}
            sub="All time"
            colorClass="c-blue"
          />
          <StatCard
            label="Unpaid Invoices"
            value={stats.unpaidInvoices}
            sub="Balance > 0"
            colorClass="c-red"
          />
        </div>
      )}

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-head">
          <div className="card-title">Recent Customers</div>
        </div>
        {loading ? (
          <div className="card-body">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton-row" />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="empty">
            <div className="empty-title">No accounts found in Kill Bill</div>
          </div>
        ) : (
          <div className="recent-customer-list">
            {accounts.map((acc) => (
              <div key={acc.accountId} className="recent-customer-row">
                <div>
                  <p className="recent-customer-name">
                    {acc.name || "Unnamed"}
                  </p>
                  <p className="recent-customer-email">
                    {acc.email || "No email"}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p className="recent-customer-id">
                    {acc.accountId?.slice(0, 8)}...
                  </p>
                  <span className="badge badge-green">Active</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-body">
          <h2 className="settings-section-title">Service Status</h2>
          <div className="service-status-row">
            {[
              { label: "Kill Bill", url: "localhost:8080", ok: !error },
              { label: "Gateway", url: "localhost:3002", ok: !error },
              { label: "Customer Portal", url: "localhost:3000", ok: true },
            ].map(({ label, url, ok }) => (
              <div key={label} className="service-status-item">
                <span className={"status-dot" + (ok ? " ok" : " bad")} />
                <div>
                  <p className="service-status-label">{label}</p>
                  <p className="service-status-url">{url}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
