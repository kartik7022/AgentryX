import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

const TABS = ["overview", "subscriptions", "invoices"];

function getModule(planName) {
  if (!planName) return "—";
  return planName
    .replace(/-basic|-standard|-pro|-evergreen|-trial/g, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function getPlanTier(planName) {
  if (!planName) return "—";
  if (planName.includes("basic")) return "Basic";
  if (planName.includes("standard")) return "Standard";
  if (planName.includes("pro")) return "Pro";
  return planName;
}

function getCountryFlag(country) {
  if (!country) return "🌍";
  if (country === "IN") return "🇮🇳";
  if (country === "US") return "🇺🇸";
  if (country === "GB") return "🇬🇧";
  if (country === "SG") return "🇸🇬";
  if (country === "AE") return "🇦🇪";
  return "🌍";
}

export default function BillingCustomerDetail() {
  const { accountId } = useParams();
  const navigate = useNavigate();

  const [account, setAccount] = useState(null);
  const [bundles, setBundles] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    if (!accountId) return;
    load();
  }, [accountId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [accRes, subRes, invRes] = await Promise.all([
        fetch(`/killbill-api/v1/accounts/${accountId}`, {
          headers: { Accept: "application/json" },
        }),
        fetch(`/killbill-api/v1/accounts/${accountId}/bundles`, {
          headers: { Accept: "application/json" },
        }),
        fetch(`/killbill-api/v1/accounts/${accountId}/invoices`, {
          headers: { Accept: "application/json" },
        }),
      ]);
      if (!accRes.ok) throw new Error(`Failed to load account: HTTP ${accRes.status}`);
      const acc = await accRes.json();
      const subs = subRes.ok ? await subRes.json() : [];
      const invs = invRes.ok ? await invRes.json() : [];
      setAccount(acc);
      setBundles(Array.isArray(subs) ? subs : []);
      setInvoices(Array.isArray(invs) ? invs : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="card">
        <div className="card-body">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton-row" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !account) {
    return (
      <div>
        <button className="btn btn-secondary" style={{ marginBottom: 16 }} onClick={() => navigate("/billing/customers")}>
          ← Back to customers
        </button>
        <div className="alert alert-error">⚠️ {error || "Customer not found"}</div>
      </div>
    );
  }

  const activeSubs = bundles.flatMap((b) => (b.subscriptions || []).filter((s) => s.state === "ACTIVE"));

  return (
    <div>
      <button className="btn btn-secondary" style={{ marginBottom: 16 }} onClick={() => navigate("/billing/customers")}>
        ← Back to customers
      </button>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body customer-detail-head">
          <div className="customer-detail-avatar">{(account.name || "U")[0].toUpperCase()}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{account.name || "Unnamed"}</h2>
              <span style={{ fontSize: 18 }}>{getCountryFlag(account.country)}</span>
            </div>
            <p className="f-sub" style={{ margin: "4px 0" }}>{account.email}</p>
            <div className="tag-list">
              {activeSubs.map((s, i) => (
                <span key={i} className="badge badge-blue">
                  {getModule(s.planName)} — {getPlanTier(s.planName)}
                </span>
              ))}
              <span className="badge">{account.currency || "INR"}</span>
            </div>
          </div>
          <span className="badge badge-green">Active</span>
        </div>
      </div>

      <div className="customer-detail-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className={"customer-detail-tab" + (tab === t ? " active" : "")}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === "subscriptions" ? ` (${bundles.length})` : t === "invoices" ? ` (${invoices.length})` : ""}
          </button>
        ))}
      </div>

      <div style={{ paddingTop: 16 }}>
        {tab === "overview" && (
          <div className="form-grid" style={{ maxWidth: 640 }}>
            {[
              { label: "Account ID", value: account.accountId },
              { label: "Currency", value: account.currency || "INR" },
              { label: "Phone", value: account.phone },
              { label: "Timezone", value: account.timeZone },
              { label: "Address", value: account.address1 },
              { label: "City", value: account.city },
              { label: "State", value: account.stateName },
              { label: "Country", value: account.country },
              { label: "Postal Code", value: account.postalCode },
              { label: "Total Invoices", value: invoices.length },
            ].map(({ label, value }) => (
              <div key={label} className="stat-card">
                <p className="stat-lbl">{label}</p>
                <p style={{ fontSize: 13, marginTop: 4, wordBreak: "break-all" }}>{String(value || "—")}</p>
              </div>
            ))}
          </div>
        )}

        {tab === "subscriptions" && (
          <div className="card" style={{ maxWidth: 640 }}>
            {bundles.length === 0 ? (
              <div className="empty">
                <div className="empty-title">No subscriptions found</div>
              </div>
            ) : (
              bundles.map((bundle, i) =>
                (bundle.subscriptions || []).map((sub, j) => (
                  <div key={`${i}-${j}`} className="customer-row" style={{ cursor: "default" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{sub.planName}</p>
                        <span className="badge badge-blue">{getModule(sub.planName)}</span>
                        <span className="badge">{getPlanTier(sub.planName)}</span>
                      </div>
                      <p className="f-sub" style={{ margin: "4px 0 0" }}>Started: {sub.startDate}</p>
                      {sub.chargedThroughDate && (
                        <p className="f-sub" style={{ margin: 0 }}>Billed through: {sub.chargedThroughDate}</p>
                      )}
                    </div>
                    <span
                      className={
                        "badge " +
                        (sub.state === "ACTIVE" ? "badge-green" : sub.state === "CANCELLED" ? "badge-red" : "badge-amber")
                      }
                    >
                      {sub.state}
                    </span>
                  </div>
                )),
              )
            )}
          </div>
        )}

        {tab === "invoices" && (
          <div className="card" style={{ maxWidth: 640 }}>
            {invoices.length === 0 ? (
              <div className="empty">
                <div className="empty-title">No invoices found</div>
              </div>
            ) : (
              invoices.map((inv) => (
                <div key={inv.invoiceId || inv.id} className="customer-row" style={{ cursor: "default" }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Invoice #{inv.invoiceNumber}</p>
                    <p className="f-sub" style={{ margin: "4px 0 0" }}>{inv.invoiceDate}</p>
                  </div>
                  <div style={{ marginLeft: "auto", textAlign: "right" }}>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
                      {account.currency === "USD" ? "$" : "₹"}
                      {inv.amount?.toFixed(2)}
                    </p>
                    <span className={"badge " + (inv.balance === 0 ? "badge-green" : "badge-red")}>
                      {inv.balance === 0 ? "Paid" : "Unpaid"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}