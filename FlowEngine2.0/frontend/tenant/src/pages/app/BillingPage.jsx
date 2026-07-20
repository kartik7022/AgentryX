import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Banner as NoticeBanner } from "../../components/feedback/Banner";
import { AppButton } from "../../components/primitives/AppButton";
import { TypeaheadSelect } from "../../components/primitives/TypeaheadSelect";
import { env } from "../../config/env";
import { billingApi } from "../../lib/billing";
import { useAuth } from "../../providers/AuthProvider";
import { useTenantWorkspace } from "../../providers/TenantWorkspaceProvider";

const billingTabs = [
  { id: "overview", label: "Overview" },
  { id: "subscriptions", label: "Subscriptions" },
  { id: "invoices", label: "Invoices" },
  { id: "payments", label: "Payment Methods" },
  { id: "usage", label: "Usage" },
  { id: "subscribe", label: "Subscribe", route: "/app/checkout" },
  { id: "health", label: "Health" },
];

const ALL_SUBSCRIPTIONS_FILTER = "__all_subscriptions__";

function getLast12Months() {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: date.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    });
  }
  return months;
}

function getDaysForMonth(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const today = new Date();
  const effectiveEnd = end > today ? today : end;
  return Math.max(Math.ceil((effectiveEnd.getTime() - start.getTime()) / 86400000) + 1, 1);
}

export function BillingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { refreshWorkspace } = useTenantWorkspace();
  const months = useMemo(() => getLast12Months(), []);
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "overview");
  const [accountId, setAccountId] = useState("");
  const [plansByModule, setPlansByModule] = useState({});
  const [bundles, setBundles] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [usageSummary, setUsageSummary] = useState(null);
  const [usageSeries, setUsageSeries] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(months[0]?.value || "");
  const [selectedModule, setSelectedModule] = useState(ALL_SUBSCRIPTIONS_FILTER);
  const [alertThreshold, setAlertThreshold] = useState("500");
  const [alerts, setAlerts] = useState([]);
  const [health, setHealth] = useState({ isAlive: false, message: "Not checked" });
  const [loading, setLoading] = useState(true);
  const [usageLoading, setUsageLoading] = useState(false);
  const [banner, setBanner] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [planSearchBySubscription, setPlanSearchBySubscription] = useState({});
  const [changeTarget, setChangeTarget] = useState(null);
  const [changingSubscriptionId, setChangingSubscriptionId] = useState("");
  const [cancellingSubscriptionId, setCancellingSubscriptionId] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState("");

  useEffect(() => {
    loadBillingWorkspace();
  }, [user?.tenantId, selectedMonth]);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (requestedTab && billingTabs.some((tab) => tab.id === requestedTab && !tab.route)) {
      setActiveTab(requestedTab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (accountId) {
      loadUsage(accountId, selectedMonth);
      loadHealth();
    }
  }, [accountId, selectedMonth]);

  async function loadBillingWorkspace() {
    setLoading(true);
    try {
      const me = await billingApi.authMe().catch(() => null);
      const tenantId = me?.tenant_id || user?.tenantId;
      const [planMap, account] = await Promise.all([
        billingApi.plansByModule().catch(() => ({})),
        tenantId ? billingApi.accountByExternalKey(tenantId).catch(() => null) : null,
      ]);
      setPlansByModule(planMap || {});

      const resolvedAccountId = account?.accountId || account?.account_id || "";
      setAccountId(resolvedAccountId);
      if (!resolvedAccountId) {
        setBundles([]);
        setInvoices([]);
        setPaymentMethods([]);
        setUsageSummary(null);
        setUsageSeries([]);
        return;
      }

      const [bundleRows, invoiceRows, paymentRows] = await Promise.all([
        billingApi.bundles(resolvedAccountId).catch(() => []),
        billingApi.invoices(resolvedAccountId).catch(() => []),
        billingApi.paymentMethods(resolvedAccountId).catch(() => []),
      ]);
      setBundles(bundleRows || []);
      setInvoices(invoiceRows || []);
      setPaymentMethods(paymentRows || []);
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Failed to load billing workspace",
        detail: error.message || "Unable to load billing data.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function loadUsage(resolvedAccountId, monthValue) {
    setUsageLoading(true);
    try {
      const days = getDaysForMonth(monthValue);
      const [summary, series] = await Promise.all([
        billingApi.usageSummary(resolvedAccountId, days).catch(() => null),
        billingApi.usageSeries(resolvedAccountId, "api_calls", days).catch(() => null),
      ]);
      setUsageSummary(summary);
      setUsageSeries(series?.series || []);
    } catch (error) {
      setBanner({
        tone: "warning",
        title: "Usage unavailable",
        detail: error.message || "Unable to load usage metrics.",
      });
    } finally {
      setUsageLoading(false);
    }
  }

  async function loadHealth() {
    const result = await billingApi.checkHealth();
    setHealth(result);
  }

  const flatPlans = useMemo(() => {
    const items = [];
    Object.entries(plansByModule || {}).forEach(([moduleName, plans]) => {
      (plans || []).forEach((plan) => items.push({ ...plan, moduleName }));
    });
    return items;
  }, [plansByModule]);

  const subscriptions = useMemo(() => {
    const rows = [];
    (bundles || []).forEach((bundle) => {
      (bundle.subscriptions || []).forEach((subscription) => {
        rows.push({
          id: subscription.subscriptionId,
          productName: subscription.productName,
          planName: subscription.planName,
          state: subscription.state,
          phase: subscription.phaseType,
          startDate: subscription.startDate,
          chargedThroughDate: subscription.chargedThroughDate,
        });
      });
    });
    return rows;
  }, [bundles]);

  const availableModules = useMemo(() => {
    const names = subscriptions.map((subscription) => subscription.productName).filter(Boolean);
    return [...new Set(names)];
  }, [subscriptions]);

  useEffect(() => {
    if (selectedModule !== ALL_SUBSCRIPTIONS_FILTER && !availableModules.includes(selectedModule)) {
      setSelectedModule(ALL_SUBSCRIPTIONS_FILTER);
    }
  }, [availableModules, selectedModule]);

  const filteredSubscriptions = useMemo(() => {
    if (selectedModule === ALL_SUBSCRIPTIONS_FILTER) return subscriptions;
    return subscriptions.filter((subscription) => !subscription.productName || subscription.productName === selectedModule);
  }, [selectedModule, subscriptions]);

  const sortedInvoices = useMemo(() => {
    return [...(invoices || [])].sort((left, right) => new Date(right.invoiceDate || 0).getTime() - new Date(left.invoiceDate || 0).getTime());
  }, [invoices]);

  const triggeredAlerts = useMemo(() => {
    return alerts.filter((alert) => usageSeries.some((entry) => Number(entry.value || 0) >= alert.threshold));
  }, [alerts, usageSeries]);

  async function handlePlanChange() {
    if (!changeTarget || !selectedPlan) return;
    setChangingSubscriptionId(String(changeTarget.id));
    try {
      await billingApi.changeSubscription(changeTarget.id, { planName: selectedPlan });
      setSelectedPlan("");
      setPlanSearchBySubscription((current) => ({ ...current, [changeTarget.id]: "" }));
      setChangeTarget(null);
      setBanner({
        tone: "success",
        title: "Subscription updated",
        detail: "The subscription plan change has been submitted.",
      });
      await loadBillingWorkspace();
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Plan change failed",
        detail: error.message || "Unable to change the subscription plan.",
      });
    } finally {
      setChangingSubscriptionId("");
    }
  }

  async function handleCancel(subscriptionId) {
    setCancellingSubscriptionId(String(subscriptionId));
    try {
      await billingApi.cancelSubscription(subscriptionId);
      setBanner({
        tone: "success",
        title: "Subscription cancelled",
        detail: "The subscription has been cancelled.",
      });
      await loadBillingWorkspace();
      refreshWorkspace();
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Cancellation failed",
        detail: error.message || "Unable to cancel the subscription.",
      });
    } finally {
      setCancellingSubscriptionId("");
    }
  }

  async function handleDownloadInvoice(invoice) {
    const invoiceId = invoice.invoiceId || invoice.invoice_id || invoice.id;
    if (!invoiceId) return;
    setDownloadingInvoiceId(invoiceId);
    try {
      const blob = await billingApi.invoicePdf(invoiceId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `invoice-${invoiceId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setBanner({
        tone: "error",
        title: "Download failed",
        detail: error.message || "Unable to download the invoice PDF.",
      });
    } finally {
      setDownloadingInvoiceId("");
    }
  }

  function addAlert() {
    const threshold = Number(alertThreshold);
    if (Number.isNaN(threshold) || threshold <= 0) return;
    setAlerts((current) => [...current, { id: Date.now(), threshold }]);
  }

  const healthChecks = [
    { label: "Kill Bill gateway reachable", ok: health.isAlive, detail: health.message },
    { label: "Tenant account resolved", ok: Boolean(accountId), detail: accountId || "No account found" },
    { label: "Plan catalog available", ok: flatPlans.length > 0, detail: flatPlans.length > 0 ? `${flatPlans.length} plans available` : "No plans returned" },
    { label: "Usage summary available", ok: Boolean(usageSummary), detail: usageSummary ? `${usageSummary.eventCount || 0} events loaded` : "Usage summary not returned" },
  ];

  return (
    <section>
      <PageHeader
        label="Billing"
        title="Billing"
        description="Manage subscriptions, invoices, payment methods, usage, and account health."
        actions={<AppButton tooltip="Refresh billing data" onClick={loadBillingWorkspace}>Refresh</AppButton>}
      />

      {banner ? <NoticeBanner {...banner} /> : null}
      {triggeredAlerts.length > 0 ? (
        <NoticeBanner tone="warning" title="Usage alert triggered" detail={triggeredAlerts.map((alert) => `API Calls exceeded ${alert.threshold}`).join(" - ")} />
      ) : null}

      <div className="surface-card" style={{ padding: "var(--space-2)", display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginBottom: "var(--space-6)" }}>
        {billingTabs.map((tab) => <AppButton key={tab.id} tooltip={`Open ${tab.label.toLowerCase()}`} variant={activeTab === tab.id ? "primary" : "ghost"} size="sm" onClick={() => (tab.route ? navigate(tab.route) : setActiveTab(tab.id))}>{tab.label}</AppButton>)}
      </div>

      {loading ? (
        <div className="surface-card" style={{ padding: "var(--space-8)", color: "var(--color-text-muted)" }}>Loading billing data...</div>
      ) : selectedInvoice ? (
        <InvoiceDetail
          invoice={selectedInvoice}
          downloading={downloadingInvoiceId === (selectedInvoice.invoiceId || selectedInvoice.invoice_id || selectedInvoice.id)}
          onBack={() => setSelectedInvoice(null)}
          onDownload={() => handleDownloadInvoice(selectedInvoice)}
        />
      ) : (
        <div style={{ display: "grid", gap: "var(--space-6)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "var(--space-4)" }}>
            <Metric label="Account ID" value={accountId || "Not resolved"} />
            <Metric label="Subscriptions" value={String(subscriptions.length)} />
            <Metric label="Invoices" value={String(sortedInvoices.length)} />
            <Metric label="Payment Methods" value={String(paymentMethods.length)} />
          </div>

          {activeTab === "overview" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: "var(--space-6)" }}>
              <div className="surface-card" style={{ padding: "var(--space-6)" }}>
                <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-4)" }}>Billing Summary</div>
                <div style={{ display: "grid", gap: "var(--space-4)" }}>
                  <Row title="Active subscriptions" detail={String(subscriptions.filter((subscription) => subscription.state === "ACTIVE").length)} />
                  <Row title="Latest invoice" detail={sortedInvoices[0] ? `${formatDate(sortedInvoices[0].invoiceDate)} - ${formatMoney(sortedInvoices[0].amount, sortedInvoices[0].currency)}` : "No invoices yet"} />
                  <Row title="Usage events" detail={String(usageSummary?.eventCount || 0)} />
                  <Row title="Gateway" detail={env.killbillGatewayUrl} />
                </div>
              </div>
              <div className="surface-card" style={{ padding: "var(--space-6)", background: "var(--color-bg-elevated)" }}>
                <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-4)" }}>Quick Actions</div>
                <div style={{ display: "grid", gap: "var(--space-3)" }}>
                  <AppButton tooltip="Open subscriptions" variant="secondary" fullWidth onClick={() => setActiveTab("subscriptions")}>Manage Subscriptions</AppButton>
                  <AppButton tooltip="Open invoices" variant="secondary" fullWidth onClick={() => setActiveTab("invoices")}>View Invoices</AppButton>
                  <AppButton tooltip="Open payment methods" variant="secondary" fullWidth onClick={() => setActiveTab("payments")}>Payment Methods</AppButton>
                  <AppButton tooltip="Open usage" variant="secondary" fullWidth onClick={() => setActiveTab("usage")}>View Usage</AppButton>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "subscriptions" ? (
            <div className="surface-card" style={{ padding: "var(--space-6)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "center", flexWrap: "wrap", marginBottom: "var(--space-4)" }}>
                <div style={{ fontWeight: "var(--font-weight-semibold)" }}>Subscriptions</div>
                {availableModules.length > 0 ? (
                  <select value={selectedModule} onChange={(event) => setSelectedModule(event.target.value)} style={inputStyle}>
                    <option value={ALL_SUBSCRIPTIONS_FILTER}>All subscriptions</option>
                    {availableModules.map((moduleName) => <option key={moduleName} value={moduleName}>{moduleName}</option>)}
                  </select>
                ) : null}
              </div>
              {filteredSubscriptions.length === 0 ? <div style={{ color: "var(--color-text-muted)" }}>No subscriptions found.</div> : (
                <div style={{ display: "grid", gap: "var(--space-4)" }}>
                  {filteredSubscriptions.map((subscription) => (
                    <div key={subscription.id} className="surface-card" style={{ padding: "var(--space-5)", background: "var(--color-bg-elevated)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap" }}>
                        <div>
                          <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-1)" }}>{subscription.planName || subscription.productName || subscription.id}</div>
                          <div style={{ color: "var(--color-text-muted)" }}>Started {formatDate(subscription.startDate)} - Next billing {formatDate(subscription.chargedThroughDate)}</div>
                          <div style={{ color: "var(--color-text-soft)", marginTop: "var(--space-2)" }}>Phase: {subscription.phase || "Unknown"}</div>
                        </div>
                        <Chip tone={subscription.state === "ACTIVE" ? "success" : "warning"}>{subscription.state}</Chip>
                      </div>
                      <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-4)", flexWrap: "wrap" }}>
                        <TypeaheadSelect
                          value={planSearchBySubscription[subscription.id] || ""}
                          onInputChange={(value) => {
                            setPlanSearchBySubscription((current) => ({ ...current, [subscription.id]: value }));
                            setSelectedPlan("");
                            setChangeTarget(subscription);
                          }}
                          options={flatPlans}
                          getKey={(plan) => plan.id}
                          getLabel={(plan) => plan.name || plan.id}
                          getDetail={(plan) => `${plan.moduleName || "Module"} ${plan.billingPeriod || ""}`}
                          onSelect={(plan) => {
                            setSelectedPlan(plan.id);
                            setChangeTarget(subscription);
                            setPlanSearchBySubscription((current) => ({
                              ...current,
                              [subscription.id]: `${plan.name || plan.id} (${plan.moduleName || "Module"})`,
                            }));
                          }}
                          placeholder="Search plan change..."
                          startText="Start typing to search plans."
                          inputStyle={{ ...inputStyle, width: "min(320px, 100%)" }}
                        />
                        <AppButton tooltip="Submit the selected plan change" variant="secondary" onClick={handlePlanChange} loading={changingSubscriptionId === String(subscription.id)} disabled={!selectedPlan || changeTarget?.id !== subscription.id}>
                          {changingSubscriptionId === String(subscription.id) ? "Changing..." : "Change Plan"}
                        </AppButton>
                        <AppButton tooltip="Cancel this subscription" variant="ghost" onClick={() => handleCancel(subscription.id)} loading={cancellingSubscriptionId === String(subscription.id)}>
                          {cancellingSubscriptionId === String(subscription.id) ? "Cancelling..." : "Cancel Subscription"}
                        </AppButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {activeTab === "invoices" ? (
            <div className="surface-card" style={{ overflow: "hidden" }}>
              <div style={{ padding: "var(--space-5) var(--space-6)", borderBottom: "1px solid var(--color-border-soft)", fontWeight: "var(--font-weight-semibold)" }}>Invoices</div>
              {sortedInvoices.length === 0 ? <EmptyState text="No invoices found." /> : (
                <div style={{ display: "grid" }}>
                  {sortedInvoices.map((invoice) => {
                    const invoiceId = invoice.invoiceId || invoice.invoice_id || invoice.id;
                    return (
                      <div key={invoiceId} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(150px, 0.4fr) minmax(220px, 0.45fr)", gap: "var(--space-4)", alignItems: "center", padding: "var(--space-5) var(--space-6)", borderTop: "1px solid var(--color-border-soft)" }}>
                        <div>
                          <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-1)" }}>{invoiceId}</div>
                          <div style={{ color: "var(--color-text-muted)" }}>{formatDate(invoice.invoiceDate)}</div>
                        </div>
                        <div style={{ fontWeight: "var(--font-weight-medium)" }}>{formatMoney(invoice.amount || invoice.balance || 0, invoice.currency)}</div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)", flexWrap: "wrap" }}>
                          <Chip tone={invoice.status === "PAID" ? "success" : "warning"}>{invoice.status || "Unknown"}</Chip>
                          <AppButton tooltip={`View invoice ${invoiceId}`} size="sm" variant="secondary" onClick={() => setSelectedInvoice(invoice)}>View</AppButton>
                          <AppButton tooltip={`Download invoice ${invoiceId}`} size="sm" variant="ghost" onClick={() => handleDownloadInvoice(invoice)} disabled={downloadingInvoiceId === invoiceId}>{downloadingInvoiceId === invoiceId ? "Downloading..." : "PDF"}</AppButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {activeTab === "payments" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-6)" }}>
              <div className="surface-card" style={{ padding: "var(--space-6)" }}>
                <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-4)" }}>Stored Payment Methods</div>
                {paymentMethods.length === 0 ? <div style={{ color: "var(--color-text-muted)", lineHeight: 1.7 }}>No saved payment methods were returned. In this environment, payments are typically handled directly through Razorpay or Stripe during subscription and plan changes.</div> : <div style={{ display: "grid", gap: "var(--space-3)" }}>{paymentMethods.map((method, index) => <Row key={method.paymentMethodId || index} title={method.pluginName || "Payment Method"} detail={method.paymentMethodId || "Registered"} />)}</div>}
              </div>
              <div className="surface-card" style={{ padding: "var(--space-6)", background: "var(--color-bg-elevated)" }}>
                <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-4)" }}>Subscribe Guidance</div>
                <div style={{ color: "var(--color-text-muted)", lineHeight: 1.7, marginBottom: "var(--space-4)" }}>Payments are captured during the subscription flow. You can revisit Subscribe any time to start a new subscription or upgrade an existing plan.</div>
                <AppButton tooltip="Open the subscribe flow" fullWidth onClick={() => navigate("/app/checkout")}>Open Subscribe</AppButton>
              </div>
            </div>
          ) : null}

          {activeTab === "usage" ? (
            <div style={{ display: "grid", gap: "var(--space-6)" }}>
              <div className="surface-card" style={{ padding: "var(--space-6)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", alignItems: "center", flexWrap: "wrap", marginBottom: "var(--space-4)" }}>
                  <div style={{ fontWeight: "var(--font-weight-semibold)" }}>Usage Controls</div>
                  <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
                    <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} style={inputStyle}>
                      {months.map((month) => <option key={month.value} value={month.value}>{month.label}</option>)}
                    </select>
                    {availableModules.length > 0 ? <select value={selectedModule} onChange={(event) => setSelectedModule(event.target.value)} style={inputStyle}>{availableModules.map((moduleName) => <option key={moduleName} value={moduleName}>{moduleName}</option>)}</select> : null}
                    <AppButton tooltip="Refresh usage metrics" variant="secondary" onClick={() => loadUsage(accountId, selectedMonth)}>Refresh</AppButton>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "center" }}>
                  <input value={alertThreshold} onChange={(event) => setAlertThreshold(event.target.value)} style={{ ...inputStyle, width: "160px" }} type="number" min="1" />
                  <AppButton tooltip="Add a usage alert threshold" variant="ghost" onClick={addAlert}>Add Alert</AppButton>
                </div>
              </div>
              <div className="surface-card" style={{ padding: "var(--space-6)" }}>
                <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-4)" }}>Usage Summary</div>
                {usageLoading ? <div style={{ color: "var(--color-text-muted)" }}>Loading usage summary...</div> : !usageSummary ? <div style={{ color: "var(--color-text-muted)" }}>No usage summary available.</div> : <div style={{ display: "grid", gap: "var(--space-3)" }}>{Object.entries(usageSummary.totals || {}).map(([metric, value]) => <Row key={metric} title={metric} detail={`Value: ${value}`} />)}<div style={{ color: "var(--color-text-muted)" }}>Event count: {usageSummary.eventCount || 0}</div></div>}
              </div>
              <div className="surface-card" style={{ padding: "var(--space-6)" }}>
                <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-4)" }}>Daily API Call Trend</div>
                {usageLoading ? <div style={{ color: "var(--color-text-muted)" }}>Loading usage trend...</div> : usageSeries.length === 0 ? <div style={{ color: "var(--color-text-muted)" }}>No usage series available.</div> : <UsageBars rows={usageSeries} />}
              </div>
            </div>
          ) : null}

          {activeTab === "health" ? (
            <div className="surface-card" style={{ padding: "var(--space-6)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", alignItems: "center", marginBottom: "var(--space-4)", flexWrap: "wrap" }}>
                <div style={{ fontWeight: "var(--font-weight-semibold)" }}>Billing Health Checks</div>
                <AppButton tooltip="Re-run health checks" variant="secondary" onClick={loadHealth}>Re-run checks</AppButton>
              </div>
              <div style={{ display: "grid", gap: "var(--space-3)" }}>
                {healthChecks.map((check) => (
                  <div key={check.label} className="surface-card" style={{ padding: "var(--space-4)", background: "var(--color-bg-elevated)", display: "flex", justifyContent: "space-between", gap: "var(--space-4)", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: "var(--font-weight-medium)", marginBottom: "var(--space-1)" }}>{check.label}</div>
                      <div style={{ color: "var(--color-text-muted)" }}>{check.detail}</div>
                    </div>
                    <Chip tone={check.ok ? "success" : "warning"}>{check.ok ? "OK" : "Attention"}</Chip>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function InvoiceDetail({ invoice, downloading, onBack, onDownload }) {
  const lines = invoice.lines || [];
  return (
    <div className="surface-card" style={{ padding: "var(--space-6)", maxWidth: "900px" }}>
      <div style={{ marginBottom: "var(--space-6)", display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
        <AppButton tooltip="Return to invoices" variant="ghost" onClick={onBack}>Back to Invoices</AppButton>
        <div style={{ fontWeight: "var(--font-weight-semibold)" }}>Invoice {invoice.invoiceId || invoice.invoice_id || invoice.id}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", alignItems: "flex-start", flexWrap: "wrap", marginBottom: "var(--space-6)" }}>
        <div>
          <div style={{ fontSize: "var(--font-size-xl)", fontWeight: "var(--font-weight-bold)", marginBottom: "var(--space-2)" }}>Invoice Detail</div>
          <div style={{ color: "var(--color-text-muted)" }}>{formatDate(invoice.invoiceDate)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "var(--font-size-xl)", fontWeight: "var(--font-weight-bold)" }}>{formatMoney(invoice.amount, invoice.currency)}</div>
          <div style={{ marginTop: "var(--space-2)" }}><Chip tone={invoice.status === "PAID" ? "success" : "warning"}>{invoice.status}</Chip></div>
        </div>
      </div>
      <div className="surface-card" style={{ overflow: "hidden", marginBottom: "var(--space-6)" }}>
        <div style={{ padding: "var(--space-4) var(--space-5)", borderBottom: "1px solid var(--color-border-soft)", fontWeight: "var(--font-weight-semibold)" }}>Line Items</div>
        {lines.length === 0 ? <EmptyState text="No invoice lines returned." /> : <div style={{ display: "grid" }}>{lines.map((line) => <div key={line.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "var(--space-4)", padding: "var(--space-4) var(--space-5)", borderTop: "1px solid var(--color-border-soft)" }}><div><div style={{ fontWeight: "var(--font-weight-medium)", marginBottom: "var(--space-1)" }}>{line.description}</div><div style={{ color: "var(--color-text-muted)" }}>{line.startDate && line.endDate ? `${formatDate(line.startDate)} - ${formatDate(line.endDate)}` : line.itemType || "Line item"}</div></div><div style={{ fontWeight: "var(--font-weight-semibold)" }}>{formatMoney(line.amount, invoice.currency)}</div></div>)}</div>}
      </div>
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <AppButton tooltip="Download the invoice PDF" onClick={onDownload} disabled={downloading}>{downloading ? "Downloading..." : "Download PDF"}</AppButton>
        <AppButton tooltip="Return to the invoice list" variant="secondary" onClick={onBack}>Close</AppButton>
      </div>
    </div>
  );
}

function UsageBars({ rows }) { const maxValue = Math.max(...rows.map((row) => Number(row.value || 0)), 1); return <div style={{ display: "grid", gap: "var(--space-3)" }}>{rows.map((row) => <div key={row.rawDate || row.date} style={{ display: "grid", gridTemplateColumns: "140px minmax(0, 1fr) 90px", gap: "var(--space-3)", alignItems: "center" }}><div style={{ color: "var(--color-text-muted)" }}>{row.date}</div><div style={{ height: "10px", borderRadius: "999px", background: "var(--color-primary-100)", overflow: "hidden" }}><div style={{ width: `${Math.max((Number(row.value || 0) / maxValue) * 100, 3)}%`, height: "100%", background: "var(--color-primary-700)" }} /></div><div style={{ textAlign: "right", fontWeight: "var(--font-weight-medium)" }}>{row.value || 0}</div></div>)}</div>; }
function PageHeader({ label, title, description, actions }) { return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-6)", marginBottom: "var(--space-6)", flexWrap: "wrap" }}><div><h1 style={{ margin: 0, color: "var(--color-text-strong)", fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", letterSpacing: "var(--tracking-tight)" }}>{title}</h1><p style={{ margin: "var(--space-3) 0 0", color: "var(--color-text-muted)", maxWidth: "72ch" }}>{description}</p></div>{actions}</div>; }
function Metric({ label, value }) { return <div className="surface-card" style={{ padding: "var(--space-5)", background: "var(--color-bg-elevated)" }}><div className="mono-label" style={{ color: "var(--color-text-soft)", marginBottom: "var(--space-2)" }}>{label}</div><div style={{ fontWeight: "var(--font-weight-semibold)" }}>{value}</div></div>; }
function Row({ title, detail }) { return <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", padding: "10px 0", borderBottom: "1px solid var(--color-border-soft)" }}><div style={{ fontWeight: "var(--font-weight-medium)" }}>{title}</div><div style={{ color: "var(--color-text-muted)" }}>{detail}</div></div>; }
function Banner({ tone, title, detail }) { const styles = { success: { border: "var(--color-status-success-border)", background: "var(--color-status-success-bg)", color: "var(--color-status-success-text)" }, warning: { border: "var(--color-status-warning-border)", background: "var(--color-status-warning-bg)", color: "var(--color-status-warning-text)" }, error: { border: "var(--color-status-error-border)", background: "var(--color-status-error-bg)", color: "var(--color-status-error-text)" }, }; return <div style={{ marginBottom: "var(--space-6)", padding: "14px 16px", borderRadius: "var(--radius-sm)", border: `1px solid ${styles[tone].border}`, background: styles[tone].background, color: styles[tone].color }}><div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-1)" }}>{title}</div><div>{detail}</div></div>; }
function EmptyState({ text }) { return <div style={{ padding: "var(--space-8)", color: "var(--color-text-muted)" }}>{text}</div>; }
function Chip({ tone, children }) { const tones = { success: { background: "var(--color-status-success-bg)", color: "var(--color-status-success-text)", border: "var(--color-status-success-border)" }, warning: { background: "var(--color-status-warning-bg)", color: "var(--color-status-warning-text)", border: "var(--color-status-warning-border)" } }; return <span style={{ display: "inline-flex", alignItems: "center", padding: "6px 10px", borderRadius: "var(--radius-pill)", border: `1px solid ${tones[tone].border}`, background: tones[tone].background, color: tones[tone].color, fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)" }}>{children}</span>; }
function formatDate(value) { if (!value) return "-"; try { return new Date(value).toLocaleDateString(); } catch { return value; } }
function formatMoney(value, currency = "USD") { const numeric = Number(value || 0); try { return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(numeric); } catch { return `${numeric} ${currency}`; } }
const inputStyle = { minHeight: "42px", padding: "0 14px", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-base)", background: "var(--color-bg-surface)", color: "var(--color-text-strong)" };
