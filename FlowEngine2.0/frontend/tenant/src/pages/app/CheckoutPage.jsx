import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadStripe } from "@stripe/stripe-js";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { Banner as NoticeBanner } from "../../components/feedback/Banner";
import { AppButton } from "../../components/primitives/AppButton";
import { Tooltip } from "../../components/primitives/Tooltip";
import { env } from "../../config/env";
import { api } from "../../lib/api";
import { billingApi } from "../../lib/billing";
import { useAuth } from "../../providers/AuthProvider";
import { useTenantWorkspace } from "../../providers/TenantWorkspaceProvider";

const stripePromise = env.stripePublishableKey ? loadStripe(env.stripePublishableKey) : null;

const billingTabs = [
  { label: "Overview", route: "/app/billing" },
  { label: "Subscriptions", route: "/app/billing?tab=subscriptions" },
  { label: "Invoices", route: "/app/billing?tab=invoices" },
  { label: "Payment Methods", route: "/app/billing?tab=payments" },
  { label: "Usage", route: "/app/billing?tab=usage" },
  { label: "Subscribe", route: "/app/checkout" },
  { label: "Health", route: "/app/billing?tab=health" },
];

const countryOptions = [
  { code: "IN", label: "India" },
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "AU", label: "Australia" },
  { code: "CA", label: "Canada" },
  { code: "SG", label: "Singapore" },
  { code: "AE", label: "United Arab Emirates" },
  { code: "OTHER", label: "Other" },
];

const indianStates = [
  "AN","AP","AR","AS","BR","CH","CG","DL","GA","GJ","HR","HP","JK","JH","KA","KL","LA","MP","MH","MN","ML","MZ","NL","OD","PY","PB","RJ","SK","TN","TS","TR","UP","UK","WB",
];

const taxRates = {
  IN: { rate: 18, label: "GST (18%)" },
  GB: { rate: 20, label: "VAT (20%)" },
  DE: { rate: 19, label: "VAT (19%)" },
  FR: { rate: 20, label: "VAT (20%)" },
  AU: { rate: 10, label: "GST (10%)" },
  CA: { rate: 5, label: "GST (5%)" },
  OTHER: { rate: 0, label: "No tax" },
  US: { rate: 0, label: "No tax" },
  SG: { rate: 0, label: "No tax" },
  AE: { rate: 0, label: "No tax" },
};

function moduleKey(value) {
  return String(value || "").replace(/[\s-]+/g, "_").toLowerCase();
}

function mergeModuleCatalog(...moduleLists) {
  const merged = new Map();

  moduleLists.flat().forEach((module) => {
    if (!module) return;
    const key = moduleKey(module.name || module.module_name || module.id);
    if (!key || merged.has(key)) return;
    merged.set(key, module);
  });

  return [...merged.values()];
}

function themeColor(variableName, fallback = "blue") {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(variableName).trim() || fallback;
}

export function CheckoutPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refreshWorkspace } = useTenantWorkspace();
  const [accountId, setAccountId] = useState("");
  const [modulePlans, setModulePlans] = useState({});
  const [moduleCatalog, setModuleCatalog] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [step, setStep] = useState("select-module");
  const [selectedModule, setSelectedModule] = useState("");
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [name, setName] = useState(user?.email?.split("@")[0] || "");
  const [email, setEmail] = useState(user?.email || "");
  const [country, setCountry] = useState("IN");
  const [billingState, setBillingState] = useState("KA");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [showStripeForm, setShowStripeForm] = useState(false);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    async function load() {
      try {
        const me = await billingApi.authMe().catch(() => null);
        const tenantId = me?.tenant_id || user?.tenantId;
        const [planMap, account, availableModules, publicModulesResponse] = await Promise.all([
          billingApi.plansByModule().catch(() => ({})),
          tenantId ? billingApi.accountByExternalKey(tenantId).catch(() => null) : null,
          api.get("/portal/available-modules").catch(() => []),
          api.get("/admin/modules/public/list")
            .catch(() => api.get("/api/public/modules").catch(() => ({ modules: [] }))),
        ]);
        setModulePlans(planMap || {});
        setModuleCatalog(mergeModuleCatalog(
          availableModules || [],
          publicModulesResponse?.modules || publicModulesResponse || [],
        ));
        setAccountId(account?.accountId || account?.account_id || "");
      } catch (loadError) {
        setError(loadError.message || "Unable to load subscribe data.");
      } finally {
        setLoadingPlans(false);
      }
    }
    load();
  }, [user?.tenantId, user?.email]);

  const taxInfo = taxRates[country] || taxRates.OTHER;
  const basePrice = selectedPlan?.price || 0;
  const taxAmount = (basePrice * taxInfo.rate) / 100;
  const totalAmount = basePrice + taxAmount;
  const isIndia = country === "IN";

  async function handlePlanContinue() {
    setError("");
    if (!selectedPlan) return;
    setShowStripeForm(false);
    setStep("enter-details");
  }

  async function assignSubscribedModule() {
    const moduleRecord = moduleCatalog.find((module) => moduleKey(module.name) === moduleKey(selectedModule));

    if (!moduleRecord?.id) {
      return false;
    }

    await api.post("/portal/add-module", { module_id: moduleRecord.id });
    await api.post("/auth/refresh", undefined, { redirectOn401: false }).catch(() => null);
    return true;
  }

  async function handleSubscription(paymentId, provider) {
    if (!selectedPlan || !accountId || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setError("");
    setStep("processing");
    try {
      const killBillPlanName = selectedPlan.id || selectedPlan.planName || selectedPlan.name;
      if (paymentId && provider) {
        await billingApi.recordPayment({
          provider,
          paymentId,
          customerName: name,
          customerEmail: email,
          planName: selectedPlan.name,
          amount: totalAmount,
          currency: isIndia ? "INR" : "USD",
          status: "succeeded",
        }).catch(() => null);
      }
      await billingApi.createSubscription({
        accountId,
        planName: killBillPlanName,
      });
      await assignSubscribedModule();
      refreshWorkspace?.(selectedModule);
      setSuccessMessage(`Subscribed to ${selectedPlan.name} successfully.`);
      setStep("success");
    } catch (submitError) {
      setError(submitError.message || "Unable to create the subscription.");
      setStep("error");
    } finally {
      isSubmittingRef.current = false;
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!selectedPlan) return;
    setError("");
    if (!accountId) {
      setError("No billing account was found for this tenant.");
      return;
    }
    if (selectedPlan.price > 0 && !selectedPlan.trialDays && !isIndia) {
      setShowStripeForm(true);
      return;
    }
    if (selectedPlan.price > 0 && !selectedPlan.trialDays && isIndia) {
      try {
        const paymentId = await initiateRazorpayPayment({
          amount: Math.round(totalAmount * 100),
          customerName: name,
          customerEmail: email,
          planName: selectedPlan.name,
        });
        await handleSubscription(paymentId, "razorpay");
      } catch (paymentError) {
        setError(paymentError.message || "Payment failed.");
      }
      return;
    }
    await handleSubscription();
  }

  async function initiateRazorpayPayment({ amount, customerName, customerEmail, planName }) {
    const loaded = await loadRazorpayScript();
    if (!loaded) {
      throw new Error("Failed to load Razorpay payment form.");
    }
    const order = await billingApi.createRazorpayOrder({
      amount,
      currency: "INR",
    });
    return new Promise((resolve, reject) => {
      const razorpay = new window.Razorpay({
        key: env.razorpayKeyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.id,
        name: "AgentryX",
        description: `Subscribe to ${planName}`,
        prefill: { name: customerName, email: customerEmail },
        theme: { color: themeColor("--color-primary-700") },
        handler: (response) => resolve(response.razorpay_payment_id),
        modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
      });
      razorpay.on("payment.failed", (response) => {
        reject(new Error(response.error?.description || "Payment failed"));
      });
      razorpay.open();
    });
  }

  const modules = Object.keys(modulePlans || {});

  return (
    <section>
      <PageHeader
        label="Subscribe"
        title="Subscribe"
        description="Choose a module, select a plan, enter billing details, and complete subscription."
      />

      <div className="surface-card" style={{ padding: "var(--space-2)", display: "flex", gap: "var(--space-2)", flexWrap: "wrap", marginBottom: "var(--space-6)" }}>
        {billingTabs.map((tab) => (
          <AppButton
            key={tab.label}
            tooltip={`Open ${tab.label.toLowerCase()}`}
            variant={tab.label === "Subscribe" ? "primary" : "ghost"}
            size="sm"
            onClick={() => navigate(tab.route)}
          >
            {tab.label}
          </AppButton>
        ))}
      </div>

      {error ? <NoticeBanner tone="error" title="Subscribe issue" detail={error} /> : null}
      {successMessage ? <NoticeBanner tone="success" title="Subscription created" detail={successMessage} /> : null}

      {loadingPlans ? (
        <div className="surface-card" style={{ padding: "var(--space-8)", color: "var(--color-text-muted)" }}>Loading plans...</div>
      ) : step === "select-module" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--space-4)" }}>
          {modules.map((moduleName) => {
            const plans = modulePlans[moduleName] || [];
            const minPrice = Math.min(...plans.map((plan) => Number(plan.price || 0)), 0);
            return (
              <Tooltip key={moduleName} content={`Select ${moduleName}`}>
              <button
                type="button"
                className="surface-card"
                onClick={() => {
                  setSelectedModule(moduleName);
                  setStep("select-plan");
                }}
                style={{ textAlign: "left", padding: "var(--space-6)", background: "linear-gradient(180deg, var(--color-bg-surface), var(--color-bg-elevated))" }}
              >
                <div className="mono-label" style={{ color: "var(--color-accent-700)", marginBottom: "var(--space-3)" }}>Module</div>
                <div style={{ fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", marginBottom: "var(--space-2)" }}>{moduleName}</div>
                <div style={{ color: "var(--color-text-muted)", marginBottom: "var(--space-4)" }}>{plans.length} plan options</div>
                <div style={{ fontWeight: "var(--font-weight-semibold)" }}>{minPrice === 0 ? "Free available" : `From ₹${minPrice}/month`}</div>
              </button>
              </Tooltip>
            );
          })}
        </div>
      ) : null}

      {step === "select-plan" && selectedModule ? (
        <div>
          <div style={{ marginBottom: "var(--space-6)", display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
            <AppButton tooltip="Go back to module selection" variant="ghost" onClick={() => setStep("select-module")}>Back</AppButton>
            <span style={{ color: "var(--color-text-muted)" }}>{selectedModule}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--space-4)" }}>
            {(modulePlans[selectedModule] || []).map((plan, index) => (
              <Tooltip key={plan.id} content={`Select ${plan.name}`}>
              <button
                type="button"
                className="surface-card"
                onClick={() => setSelectedPlan(plan)}
                style={{
                  textAlign: "left",
                  padding: "var(--space-6)",
                  border: `2px solid ${selectedPlan?.id === plan.id ? "var(--color-primary-700)" : "var(--color-border-soft)"}`,
                  background: selectedPlan?.id === plan.id ? "var(--color-primary-50)" : "var(--color-bg-surface)",
                }}
              >
                {index === 1 ? <div className="mono-label" style={{ color: "var(--color-primary-700)", marginBottom: "var(--space-3)" }}>Popular</div> : null}
                {plan.trialDays ? <div className="mono-label" style={{ color: "var(--color-status-success-text)", marginBottom: "var(--space-3)" }}>{plan.trialDays} day trial</div> : null}
                <div style={{ fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", marginBottom: "var(--space-2)" }}>{plan.name}</div>
                <div style={{ fontSize: "var(--font-size-xl)", fontWeight: "var(--font-weight-extrabold)", marginBottom: "var(--space-2)" }}>
                  {Number(plan.price) === 0 ? "Free" : `₹${plan.price}`}
                </div>
                <div style={{ color: "var(--color-text-muted)" }}>{plan.description || "Plan details available during subscription."}</div>
              </button>
              </Tooltip>
            ))}
          </div>
          <div style={{ marginTop: "var(--space-6)" }}>
            <AppButton tooltip="Continue with the selected plan" onClick={handlePlanContinue} disabled={!selectedPlan}>Continue</AppButton>
          </div>
        </div>
      ) : null}

      {step === "enter-details" && selectedPlan ? (
        <div style={{ maxWidth: "560px" }}>
          <div className="surface-card" style={{ padding: "var(--space-6)", background: "var(--color-primary-50)", borderColor: "var(--color-primary-200)", marginBottom: "var(--space-6)" }}>
            <div className="mono-label" style={{ color: "var(--color-primary-700)", marginBottom: "var(--space-2)" }}>Selected Plan</div>
            <div style={{ fontWeight: "var(--font-weight-bold)", marginBottom: "var(--space-1)" }}>{selectedModule} - {selectedPlan.name}</div>
            <div style={{ color: "var(--color-text-muted)" }}>{selectedPlan.trialDays ? `${selectedPlan.trialDays} day free trial` : "Paid plan starts immediately"}</div>
          </div>

          {!showStripeForm ? (
            <form onSubmit={handleSubmit} style={{ display: "grid", gap: "var(--space-4)" }}>
              <Field label="Full name"><input value={name} onChange={(event) => setName(event.target.value)} style={inputStyle} required /></Field>
              <Field label="Email address"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} style={inputStyle} required /></Field>
              <Field label="Country">
                <select value={country} onChange={(event) => setCountry(event.target.value)} style={inputStyle}>
                  {countryOptions.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
                </select>
              </Field>
              {country === "IN" ? (
                <Field label="State">
                  <select value={billingState} onChange={(event) => setBillingState(event.target.value)} style={inputStyle}>
                    {indianStates.map((stateCode) => <option key={stateCode} value={stateCode}>{stateCode}</option>)}
                  </select>
                </Field>
              ) : null}
              <PriceSummary basePrice={basePrice} taxLabel={taxInfo.label} taxAmount={taxAmount} totalAmount={totalAmount} />
              <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
                <AppButton tooltip="Go back to plan selection" type="button" variant="secondary" onClick={() => setStep("select-plan")}>Back</AppButton>
                <AppButton tooltip="Continue with this subscribe flow" type="submit">
                  {selectedPlan.price === 0 || selectedPlan.trialDays ? "Start Subscription" : country === "IN" ? `Pay INR ${totalAmount.toFixed(2)}` : `Pay $${(totalAmount / 83).toFixed(2)}`}
                </AppButton>
              </div>
            </form>
          ) : stripePromise ? (
            <Elements stripe={stripePromise}>
              <StripePaymentForm
                amount={Number((totalAmount / 83).toFixed(2))}
                customerName={name}
                customerEmail={email}
                planName={selectedPlan.name}
                onBack={() => setShowStripeForm(false)}
                onSuccess={(paymentId) => handleSubscription(paymentId, "stripe")}
              />
            </Elements>
          ) : (
            <div className="surface-card" style={{ padding: "var(--space-6)" }}>
              Stripe publishable key is not configured.
            </div>
          )}
        </div>
      ) : null}

      {step === "processing" ? <div className="surface-card" style={{ padding: "var(--space-8)", color: "var(--color-text-muted)" }}>Processing your subscription...</div> : null}
      {step === "success" ? <div className="surface-card" style={{ padding: "var(--space-8)" }}><AppButton tooltip="Return to billing workspace" onClick={() => { window.location.href = "/app/billing"; }}>Go to Billing</AppButton></div> : null}
    </section>
  );
}

function StripePaymentForm({ amount, customerName, customerEmail, planName, onBack, onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  async function handleStripePay() {
    if (!stripe || !elements) return;
    setProcessing(true);
    setError("");
    try {
      const data = await billingApi.stripeIntent({
        amount: Math.round(amount * 100),
        currency: "usd",
        description: `Subscribe to ${planName}`,
      });
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error("Card form is unavailable.");
      }
      const result = await stripe.confirmCardPayment(data.clientSecret, {
        payment_method: { card: cardElement, billing_details: { name: customerName, email: customerEmail } },
      });
      if (result.error) {
        throw new Error(result.error.message || "Payment failed");
      }
      if (result.paymentIntent?.status === "succeeded") {
        onSuccess(result.paymentIntent.id);
      }
    } catch (paymentError) {
      setError(paymentError.message || "Payment failed.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="surface-card" style={{ padding: "var(--space-6)" }}>
      <div style={{ fontWeight: "var(--font-weight-semibold)", marginBottom: "var(--space-4)" }}>Secure Stripe Payment</div>
      <div style={{ border: "1px solid var(--color-border-soft)", borderRadius: "var(--radius-xs)", padding: "14px 16px", marginBottom: "var(--space-4)" }}>
        <CardElement
          options={{
            style: {
              base: {
                fontSize: "14px",
                color: themeColor("--color-text-base", "slategray"),
                "::placeholder": { color: themeColor("--color-text-soft", "gray") },
              },
            },
          }}
        />
      </div>
      {error ? <NoticeBanner tone="error" title="Payment failed" detail={error} /> : null}
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <AppButton tooltip="Go back to billing details" type="button" variant="secondary" onClick={onBack}>Back</AppButton>
        <AppButton tooltip="Pay securely with Stripe" type="button" onClick={handleStripePay} disabled={!stripe || processing}>
          {processing ? "Processing..." : `Pay $${amount.toFixed(2)} USD`}
        </AppButton>
      </div>
    </div>
  );
}

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function PageHeader({ label, title, description }) { return <div style={{ marginBottom: "var(--space-6)" }}><h1 style={{ margin: 0, color: "var(--color-text-strong)", fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", letterSpacing: "var(--tracking-tight)" }}>{title}</h1><p style={{ margin: "var(--space-3) 0 0", color: "var(--color-text-muted)", maxWidth: "72ch" }}>{description}</p></div>; }
function Field({ label, children }) { return <label style={{ display: "grid", gap: "var(--space-2)" }}><span className="mono-label" style={{ color: "var(--color-text-muted)" }}>{label}</span>{children}</label>; }
function PriceSummary({ basePrice, taxLabel, taxAmount, totalAmount }) { return <div className="surface-card" style={{ padding: "var(--space-5)", background: "var(--color-bg-elevated)" }}><Row title="Base price" detail={basePrice === 0 ? "Free" : `INR ${basePrice.toFixed(2)}`} /><Row title={taxLabel} detail={`INR ${taxAmount.toFixed(2)}`} /><Row title="Total" detail={`INR ${totalAmount.toFixed(2)}`} /></div>; }
function Row({ title, detail }) { return <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", padding: "8px 0", borderBottom: "1px solid var(--color-border-soft)" }}><div>{title}</div><div style={{ fontWeight: "var(--font-weight-semibold)" }}>{detail}</div></div>; }
const inputStyle = { width: "100%", minHeight: "44px", padding: "0 14px", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border-base)", background: "var(--color-bg-surface)", color: "var(--color-text-strong)" };
