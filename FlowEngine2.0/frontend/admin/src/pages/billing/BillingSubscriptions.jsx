import { useEffect, useState } from "react";

const STATE_BADGE = {
  ACTIVE: "badge-green",
  CANCELLED: "badge-red",
  BLOCKED: "badge-amber",
  PENDING: "badge-blue",
  EXPIRED: "",
};

export default function BillingSubscriptions() {
  const [bundles, setBundles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [selectedBundle, setSelectedBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState("");
  const [cancelling, setCancelling] = useState(false);

  function notify(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  async function loadAllBundles() {
    // Fetch all accounts dynamically, then fetch bundles for each
    const accRes = await fetch(
      "/killbill-api/v1/accounts/pagination?limit=50",
      {
        headers: { Accept: "application/json" },
      },
    );
    if (!accRes.ok)
      throw new Error("Failed to fetch accounts: " + accRes.status);
    const accounts = await accRes.json();
    const accountList = Array.isArray(accounts) ? accounts : [];

    const allBundles = [];
    await Promise.all(
      accountList.map(async (acc) => {
        try {
          const res = await fetch(
            `/killbill-api/v1/accounts/${acc.accountId}/bundles`,
            {
              headers: { Accept: "application/json" },
            },
          );
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) allBundles.push(...data);
          }
        } catch (e) {
          /* skip failed account */
        }
      }),
    );
    return allBundles;
  }

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const list = await loadAllBundles();
      setBundles(list);
      if (list.length > 0 && list[0].subscriptions?.length > 0) {
        setSelected(list[0].subscriptions[0]);
        setSelectedBundle(list[0]);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(sub) {
    if (
      !window.confirm(
        `Cancel subscription "${sub.planName}"? This cannot be undone.`,
      )
    )
      return;
    setCancelling(true);
    try {
      const res = await fetch(
        `/killbill-api/v1/subscriptions/${sub.subscriptionId}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "X-Killbill-CreatedBy": "admin",
          },
        },
      );
      if (res.ok) {
        notify("Subscription cancelled successfully");
        const refreshed = await loadAllBundles();
        setBundles(refreshed);
      } else {
        notify("Cancel failed — " + res.status);
      }
    } catch (e) {
      notify("Error: " + e.message);
    } finally {
      setCancelling(false);
    }
  }

  const allSubs = bundles.flatMap((b) =>
    b.subscriptions.map((s) => ({ ...s, bundleId: b.bundleId })),
  );
  const activeSubs = allSubs.filter((s) => s.state === "ACTIVE");
  const cancelledSubs = allSubs.filter((s) => s.state === "CANCELLED");

  return (
    <div className="sub-layout">
      {/* Left Panel */}
      <div className="sub-list-panel">
        <div className="sub-list-head">
          <h2 className="card-title" style={{ fontSize: 14 }}>
            Subscriptions
          </h2>
          <p className="f-sub">
            {allSubs.length} total · {activeSubs.length} active
          </p>
        </div>

        <div className="sub-list-scroll">
          {loading ? (
            <div style={{ padding: 16 }}>
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton-row" />
              ))}
            </div>
          ) : bundles.length === 0 ? (
            <div className="empty">
              <div className="empty-title">No subscriptions found</div>
            </div>
          ) : (
            <>
              {activeSubs.length > 0 && (
                <div>
                  <div className="sub-list-group-label">
                    Active ({activeSubs.length})
                  </div>
                  {bundles.map((bundle) =>
                    bundle.subscriptions
                      .filter((s) => s.state === "ACTIVE")
                      .map((sub) => (
                        <button
                          key={sub.subscriptionId}
                          className={
                            "sub-list-item" +
                            (selected?.subscriptionId === sub.subscriptionId
                              ? " active"
                              : "")
                          }
                          onClick={() => {
                            setSelected(sub);
                            setSelectedBundle(bundle);
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <p className="sub-list-item-name">{sub.planName}</p>
                            <span
                              className={
                                "badge " + (STATE_BADGE[sub.state] || "")
                              }
                            >
                              {sub.state}
                            </span>
                          </div>
                          <p className="f-sub" style={{ marginTop: 4 }}>
                            Started: {sub.startDate}
                          </p>
                        </button>
                      )),
                  )}
                </div>
              )}

              {cancelledSubs.length > 0 && (
                <div>
                  <div className="sub-list-group-label">
                    Cancelled ({cancelledSubs.length})
                  </div>
                  {bundles.map((bundle) =>
                    bundle.subscriptions
                      .filter((s) => s.state === "CANCELLED")
                      .map((sub) => (
                        <button
                          key={sub.subscriptionId}
                          className={
                            "sub-list-item cancelled" +
                            (selected?.subscriptionId === sub.subscriptionId
                              ? " active"
                              : "")
                          }
                          onClick={() => {
                            setSelected(sub);
                            setSelectedBundle(bundle);
                          }}
                        >
                          <p className="sub-list-item-name">{sub.planName}</p>
                          <p className="f-sub" style={{ marginTop: 4 }}>
                            Cancelled: {sub.cancelledDate || "—"}
                          </p>
                        </button>
                      )),
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right Panel */}
      <div className="sub-detail-panel">
        {loading ? (
          <div>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="stat-card-b skeleton"
                style={{ marginBottom: 16 }}
              />
            ))}
          </div>
        ) : error ? (
          <div className="alert alert-error">⚠️ {error}</div>
        ) : !selected ? (
          <div className="sub-detail-empty">
            Select a subscription to view details
          </div>
        ) : (
          <div style={{ maxWidth: 640 }}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 700 }}>
                    {selected.planName}
                  </h2>
                  <span
                    className={"badge " + (STATE_BADGE[selected.state] || "")}
                  >
                    {selected.state}
                  </span>
                </div>
                <p className="f-sub mono" style={{ marginTop: 4 }}>
                  ID: {selected.subscriptionId}
                </p>
              </div>
              {selected.state === "ACTIVE" && (
                <button
                  className="btn btn-danger"
                  disabled={cancelling}
                  onClick={() => handleCancel(selected)}
                >
                  {cancelling ? "Cancelling…" : "Cancel Subscription"}
                </button>
              )}
            </div>

            <div
              className={
                "sub-status-card" +
                (selected.state === "ACTIVE" ? " active" : "")
              }
            >
              <p className="stat-card-b-label">Status</p>
              <p
                className={
                  "stat-card-b-value" +
                  (selected.state === "ACTIVE" ? " c-green" : "")
                }
              >
                {selected.state}
              </p>
              {selected.state === "ACTIVE" && selected.chargedThroughDate && (
                <p className="f-sub" style={{ marginTop: 4, color: "#059669" }}>
                  Paid through: {selected.chargedThroughDate}
                </p>
              )}
            </div>

            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-body">
                <h3
                  className="settings-section-title"
                  style={{ marginBottom: 4 }}
                >
                  Subscription Details
                </h3>
                {[
                  { label: "Plan Name", value: selected.planName },
                  { label: "Product", value: selected.productName || "—" },
                  { label: "Category", value: selected.productCategory || "—" },
                  {
                    label: "Billing Period",
                    value: selected.billingPeriod || "—",
                  },
                  { label: "Start Date", value: selected.startDate },
                  {
                    label: "Trial End Date",
                    value: selected.events?.find(e => e.eventType === "PHASE")?.effectiveDate || "—",
                  },
                  {
                    label: "Charged Through",
                    value: selected.chargedThroughDate || "—",
                  },
                  {
                    label: "Cancelled Date",
                    value: selected.cancelledDate || "—",
                  },
                ].map(({ label, value }) => (
                  <div key={label} className="detail-row">
                    <span className="f-sub">{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {selectedBundle && (
              <div className="card" style={{ marginTop: 16 }}>
                <div className="card-body">
                  <h3
                    className="settings-section-title"
                    style={{ marginBottom: 4 }}
                  >
                    Bundle Info
                  </h3>
                  {[
                    { label: "Bundle ID", value: selectedBundle.bundleId },
                    {
                      label: "External Key",
                      value: selectedBundle.externalKey || "—",
                    },
                    { label: "Account ID", value: selectedBundle.accountId },
                    {
                      label: "Total Subscriptions",
                      value: selectedBundle.subscriptions.length,
                    },
                  ].map(({ label, value }) => (
                    <div key={label} className="detail-row">
                      <span className="f-sub">{label}</span>
                      <span
                        className="mono"
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          textAlign: "right",
                          maxWidth: 260,
                          wordBreak: "break-all",
                        }}
                      >
                        {String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  );
}
