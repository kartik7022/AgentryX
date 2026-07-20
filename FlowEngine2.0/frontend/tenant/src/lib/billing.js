import { env } from "../config/env";
import { api } from "./api";

const gatewayBase = `${env.killbillGatewayUrl}/api`;
const killbillApiBase = `${env.killbillGatewayUrl}/api/v1`;

async function gatewayRequest(path, options = {}) {
  const response = await fetch(`${gatewayBase}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  if (!response.ok) {
    const message =
      (typeof data === "object" && data && (data.detail || data.error || data.message)) ||
      `Gateway request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}

async function killbillRequest(path, options = {}) {
  const response = await fetch(`${killbillApiBase}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  if (!response.ok && response.status !== 204) {
    const message =
      (typeof data === "object" && data && (data.detail || data.error || data.message)) ||
      `Kill Bill request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}

export const billingApi = {
  authMe: () => api.get("/auth/me"),
  plansByModule: () => gatewayRequest("/plans/modules"),
  createSubscription: (payload) =>
    killbillRequest("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        accountId: payload.accountId,
        planName: payload.planName || payload.planId,
        ...(payload.externalKey ? { externalKey: payload.externalKey } : {}),
        ...(payload.startDate ? { startDate: payload.startDate } : {}),
      }),
    }),
  usageSummary: (accountId, days) =>
    gatewayRequest(`/usage/summary?accountId=${encodeURIComponent(accountId)}&days=${days}`),
  usageSeries: (accountId, metric, days) =>
    gatewayRequest(`/usage/series?accountId=${encodeURIComponent(accountId)}&metric=${encodeURIComponent(metric)}&days=${days}`),
  createRazorpayOrder: (payload) => gatewayRequest("/razorpay/order", { method: "POST", body: JSON.stringify(payload) }),
  recordPayment: (payload) => gatewayRequest("/payments/record", { method: "POST", body: JSON.stringify(payload) }),
  stripeIntent: (payload) => gatewayRequest("/stripe/create-payment-intent", { method: "POST", body: JSON.stringify(payload) }),
  accountByExternalKey: (tenantId) => killbillRequest(`/accounts?externalKey=${encodeURIComponent(tenantId)}`),
  bundles: (accountId) => killbillRequest(`/accounts/${accountId}/bundles`),
  invoices: (accountId) => killbillRequest(`/accounts/${accountId}/invoices`),
  invoicePdf: async (invoiceId) => {
    const response = await fetch(`${killbillApiBase}/invoices/${invoiceId}/pdf`, {
      credentials: "include",
      headers: { Accept: "application/pdf" },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch invoice PDF (${response.status})`);
    }
    return response.blob();
  },
  paymentMethods: (accountId) => killbillRequest(`/accounts/${accountId}/paymentMethods`),
  checkHealth: async () => {
    try {
      const data = await killbillRequest("/nodesInfo");
      return { isAlive: true, message: "Kill Bill is reachable", data };
    } catch (error) {
      return { isAlive: false, message: error.message || "Unreachable" };
    }
  },
  createPaymentMethod: (accountId, token) =>
    killbillRequest(`/accounts/${accountId}/paymentMethods`, {
      method: "POST",
      body: JSON.stringify({ token, pluginName: "razorpay" }),
    }),
  subscriptionPreview: (subscriptionId, newPlanId) =>
    killbillRequest(
      `/subscriptions/${subscriptionId}/proration-preview?newPlanId=${encodeURIComponent(newPlanId)}`,
    ),
  changeSubscription: (subscriptionId, payload) =>
    killbillRequest(`/subscriptions/${subscriptionId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  cancelSubscription: (subscriptionId) =>
    killbillRequest(`/subscriptions/${subscriptionId}`, { method: "DELETE" }),
};
