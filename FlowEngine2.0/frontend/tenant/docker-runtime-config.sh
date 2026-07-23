#!/bin/sh
set -eu

escape_js() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

cat > /usr/share/nginx/html/runtime-config.js <<EOF
window.__TENANT_ENV__ = {
  keycloakUrl: "$(escape_js "${TENANT_KEYCLOAK_URL:-http://localhost:7000}")",
  keycloakRealm: "$(escape_js "${TENANT_KEYCLOAK_REALM:-flowengine}")",
  keycloakClientId: "$(escape_js "${TENANT_KEYCLOAK_CLIENT_ID:-agentryx-app}")",
  appUrl: "$(escape_js "${TENANT_APP_URL:-http://localhost:8001}")",
  portalBase: "$(escape_js "${TENANT_PORTAL_BASE:-/tenant}")",
  billingPortalBase: "$(escape_js "${TENANT_BILLING_PORTAL_BASE:-/tenant/billing}")",
  killbillGatewayUrl: "$(escape_js "${TENANT_KILLBILL_GATEWAY_URL:-http://localhost:3002}")",
  stripePublishableKey: "$(escape_js "${STRIPE_PUBLISHABLE_KEY:-}")",
  razorpayKeyId: "$(escape_js "${RAZORPAY_KEY_ID:-}")",
};
EOF
