const runtime = window.__TENANT_ENV__ || {};

export const env = {
  keycloakUrl: runtime.keycloakUrl || "http://localhost:7000",
  keycloakRealm: runtime.keycloakRealm || "flowengine",
  keycloakClientId: runtime.keycloakClientId || "agentryx-app",
  appUrl: runtime.appUrl || window.location.origin,
  portalBase: runtime.portalBase || "/tenant",
  billingPortalBase: runtime.billingPortalBase || "/tenant/billing",
  killbillGatewayUrl: runtime.killbillGatewayUrl || "http://localhost:3002",
  stripePublishableKey: runtime.stripePublishableKey || "",
  razorpayKeyId: runtime.razorpayKeyId || "",
};

export const authUrls = {
  login: `${env.keycloakUrl}/realms/${env.keycloakRealm}/protocol/openid-connect/auth?client_id=${env.keycloakClientId}&response_type=code&scope=openid email profile&redirect_uri=http://localhost:3000/auth/keycloak/callback`,
  silentLogin: `${env.keycloakUrl}/realms/${env.keycloakRealm}/protocol/openid-connect/auth?client_id=${env.keycloakClientId}&response_type=code&scope=openid email profile&redirect_uri=http://localhost:3000/auth/keycloak/callback&prompt=none`,
  logout: `${env.keycloakUrl}/realms/${env.keycloakRealm}/protocol/openid-connect/logout?post_logout_redirect_uri=${env.appUrl}&client_id=${env.keycloakClientId}`,
  googleSignup: (state) =>
    `${env.keycloakUrl}/realms/${env.keycloakRealm}/protocol/openid-connect/auth?client_id=${env.keycloakClientId}&response_type=code&scope=openid email profile&redirect_uri=http://localhost:3000/auth/keycloak/callback&kc_idp_hint=google&state=${encodeURIComponent(state)}`,
};
