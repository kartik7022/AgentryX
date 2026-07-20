import { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

function StatCard({ label, value, sub, colorClass }) {
  return (
    <div className="stat-card-b">
      <p className="stat-card-b-label">{label}</p>
      <p className={"stat-card-b-value " + colorClass}>{value}</p>
      {sub && <p className="stat-card-b-sub">{sub}</p>}
    </div>
  );
}

export default function BillingRevenue() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      // Fetch all accounts dynamically, then aggregate invoices across all of them
      const accRes = await fetch("/killbill-api/v1/accounts/pagination?limit=50", {
        headers: { Accept: "application/json" },
      });
      if (!accRes.ok) throw new Error("Failed to fetch accounts: " + accRes.status);
      const accounts = await accRes.json();
      const accountList = Array.isArray(accounts) ? accounts : [];

      const allInvoices = [];
      await Promise.all(
        accountList.map(async (acc) => {
          try {
            const res = await fetch(`/killbill-api/v1/accounts/${acc.accountId}/invoices`, {
              headers: { Accept: "application/json" },
            });
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data)) allInvoices.push(...data);
            }
          } catch (e) {
            /* skip failed account */
          }
        }),
      );

      setInvoices(allInvoices);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Derived stats
  const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.amount - inv.balance), 0);
  const totalBilled = invoices.reduce((sum, inv) => sum + inv.amount, 0);
  const totalUnpaid = invoices.reduce((sum, inv) => sum + inv.balance, 0);
  const paidInvoices = invoices.filter((inv) => inv.balance === 0).length;
  const unpaidInvoices = invoices.filter((inv) => inv.balance > 0).length;

  // Chart data — group by month
  const monthlyMap = {};
  invoices.forEach((inv) => {
    const month = inv.invoiceDate?.slice(0, 7) || "Unknown";
    if (!monthlyMap[month]) monthlyMap[month] = { billed: 0, collected: 0 };
    monthlyMap[month].billed += inv.amount;
    monthlyMap[month].collected += inv.amount - inv.balance;
  });
  const chartData = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, vals]) => ({
      month: new Date(month + "-01").toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
      Billed: Number(vals.billed.toFixed(2)),
      Collected: Number(vals.collected.toFixed(2)),
    }));

  return (
    <div>
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div className="stats-row-b" style={{ marginBottom: 16 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stat-card-b skeleton" />
          ))}
        </div>
      ) : (
        <>
          <div className="stats-row-b" style={{ marginBottom: 16 }}>
            <StatCard label="Total Collected" value={`₹${totalRevenue.toFixed(2)}`} sub="Paid invoices" colorClass="c-green" />
            <StatCard label="Total Billed" value={`₹${totalBilled.toFixed(2)}`} sub="All invoices" colorClass="c-indigo" />
            <StatCard label="Outstanding" value={`₹${totalUnpaid.toFixed(2)}`} sub="Unpaid balance" colorClass="c-red" />
            <StatCard label="Invoices" value={`${paidInvoices} / ${invoices.length}`} sub={`${unpaidInvoices} unpaid`} colorClass="c-blue" />
          </div>

          {chartData.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-body">
                <h2 className="settings-section-title" style={{ marginBottom: 16 }}>Monthly Revenue</h2>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="collected" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="billed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v) => `₹${v}`} />
                    <Legend />
                    <Area type="monotone" dataKey="Billed" stroke="#10b981" strokeWidth={2} fill="url(#billed)" />
                    <Area type="monotone" dataKey="Collected" stroke="#6366f1" strokeWidth={2} fill="url(#collected)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <p className="card-title">All Invoices</p>
            </div>
            {invoices.length === 0 ? (
              <div className="empty">
                <div className="empty-title">No invoices found</div>
              </div>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Date</th>
                      <th style={{ textAlign: "right" }}>Amount</th>
                      <th style={{ textAlign: "right" }}>Balance</th>
                      <th style={{ textAlign: "center" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.invoiceId}>
                        <td className="hi">#{inv.invoiceNumber}</td>
                        <td>{inv.invoiceDate}</td>
                        <td style={{ textAlign: "right" }} className="hi">₹{inv.amount?.toFixed(2)}</td>
                        <td style={{ textAlign: "right" }} className="hi">
                          <span style={{ color: inv.balance > 0 ? "#dc2626" : "#059669" }}>
                            ₹{inv.balance?.toFixed(2)}
                          </span>
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <span className={"badge " + (inv.balance === 0 ? "badge-green" : "badge-red")}>
                            {inv.balance === 0 ? "Paid" : "Unpaid"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}