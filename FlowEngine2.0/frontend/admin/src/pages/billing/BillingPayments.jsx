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

function ProviderBadge({ provider }) {
  const cls = provider === "razorpay" ? "badge-blue" : provider === "stripe" ? "badge-purple" : "";
  const label = provider === "razorpay" ? "🪙 Razorpay" : provider === "stripe" ? "💳 Stripe" : provider;
  return <span className={"badge " + cls}>{label}</span>;
}

function StatusBadge({ status }) {
  return status === "succeeded" ? (
    <span className="badge badge-green">Succeeded</span>
  ) : (
    <span className="badge badge-red">Failed</span>
  );
}

export default function BillingPayments() {
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [payRes, sumRes] = await Promise.all([
        fetch("/killbill-api/payments", { headers: { Accept: "application/json" } }),
        fetch("/killbill-api/payments/summary", { headers: { Accept: "application/json" } }),
      ]);
      if (!payRes.ok) throw new Error(`Failed to load payments: HTTP ${payRes.status}`);
      const payData = await payRes.json();
      const sumData = sumRes.ok ? await sumRes.json() : null;
      setPayments(Array.isArray(payData) ? payData : []);
      setSummary(sumData);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const filtered = payments.filter((p) => {
    if (filter !== "all" && p.status !== filter) return false;
    if (providerFilter !== "all" && p.provider !== providerFilter) return false;
    return true;
  });

  function formatAmount(amount, currency) {
    const symbol = currency === "USD" ? "$" : currency === "INR" ? "₹" : currency + " ";
    return `${symbol}${amount.toFixed(2)}`;
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
    } catch {
      return iso;
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: 16 }}>
        <button className="btn btn-secondary" onClick={load}>↻ Refresh</button>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          ⚠️ {error} — make sure the gateway is running.
        </div>
      )}

      {loading ? (
        <div className="stats-row-b" style={{ marginBottom: 16 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stat-card-b skeleton" />
          ))}
        </div>
      ) : (
        <div className="stats-row-b" style={{ marginBottom: 16 }}>
          <StatCard label="Total Payments" value={summary?.totalPayments || 0} sub="All time" colorClass="c-indigo" />
          <StatCard label="Succeeded" value={summary?.succeeded || 0} sub="Completed payments" colorClass="c-green" />
          <StatCard label="Failed" value={summary?.failed || 0} sub="Declined or cancelled" colorClass="c-red" />
          <StatCard
            label="Total Collected"
            value={summary ? `₹${summary.totalAmount.toFixed(0)}` : "₹0"}
            sub="Succeeded payments only"
            colorClass="c-blue"
          />
        </div>
      )}

      {summary?.byProvider && Object.keys(summary.byProvider).length > 0 && (
        <div className="provider-stats-row" style={{ marginBottom: 16 }}>
          {Object.entries(summary.byProvider).map(([provider, stats]) => (
            <div key={provider} className="provider-stat-card">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ProviderBadge provider={provider} />
                <span className="f-sub">{stats.count} transactions</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 600 }}>₹{stats.amount.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-head payments-toolbar">
          <div className="filter-pills">
            {["all", "succeeded", "failed"].map((f) => (
              <button
                key={f}
                className={"filter-pill" + (filter === f ? " active" : "")}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="filter-pills">
            {["all", "razorpay", "stripe"].map((f) => (
              <button
                key={f}
                className={"filter-pill" + (providerFilter === f ? " active" : "")}
                onClick={() => setProviderFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
          <span className="f-sub" style={{ marginLeft: "auto" }}>
            {filtered.length} of {payments.length} transactions
          </span>
        </div>

        {loading ? (
          <div className="card-body">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton-row" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-title">No payments recorded yet</div>
            <div className="empty-sub">New transactions from checkout will appear here automatically.</div>
          </div>
        ) : (
          <div className="recent-customer-list">
            {filtered.map((p) => (
              <div key={p.id} className="recent-customer-row">
                <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                  <div className="customer-avatar">{(p.customerName || "U")[0].toUpperCase()}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <p className="recent-customer-name">{p.customerName || "Unknown customer"}</p>
                      <ProviderBadge provider={p.provider} />
                    </div>
                    <p className="recent-customer-email">{p.planName || "—"} · {formatDate(p.createdAt)}</p>
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 16 }}>
                  <p style={{ fontSize: 13, fontWeight: 600 }}>{formatAmount(p.amount, p.currency)}</p>
                  <StatusBadge status={p.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}