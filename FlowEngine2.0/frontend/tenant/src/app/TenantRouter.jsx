import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { PublicLayout } from "../components/layout/PublicLayout";
import { ProtectedRoute } from "../components/routing/ProtectedRoute";
import { TenantWorkspaceProvider } from "../providers/TenantWorkspaceProvider";
import { DashboardPage } from "../pages/app/DashboardPage";
import { DatasourcesPage } from "../pages/app/DatasourcesPage";
import { DatasourceConfigsPage } from "../pages/app/DatasourceConfigsPage";
import { UsersPage } from "../pages/app/UsersPage";
import { ApiKeysPage } from "../pages/app/ApiKeysPage";
import { ConnectedInboxesPage } from "../pages/app/ConnectedInboxesPage";
import { PlaygroundPage } from "../pages/app/PlaygroundPage";
import { BillingPage } from "../pages/app/BillingPage";
import { CheckoutPage } from "../pages/app/CheckoutPage";
import { CredentialsPage } from "../pages/app/CredentialsPage";
import { RolesPage } from "../pages/app/RolesPage";
import { IntentsPage } from "../pages/app/IntentsPage";
import { IntentPoliciesPage } from "../pages/app/IntentPoliciesPage";
import { RulesPage } from "../pages/app/RulesPage";
import { LandingPage } from "../pages/public/LandingPage";
import { RegisterPage } from "../pages/public/RegisterPage";
import { PaymentPage } from "../pages/public/PaymentPage";

export function TenantRouter() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/landing" element={<Navigate to="/" replace />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/payment" element={<PaymentPage />} />
      </Route>

      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <TenantWorkspaceProvider>
              <AppShell />
            </TenantWorkspaceProvider>
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="datasources" element={<DatasourcesPage />} />
        <Route path="datasource-configs" element={<DatasourceConfigsPage />} />
        <Route path="credentials" element={<CredentialsPage />} />
        <Route path="intents" element={<IntentsPage />} />
        <Route path="intent-policies" element={<IntentPoliciesPage />} />
        <Route path="rules" element={<RulesPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="roles" element={<RolesPage />} />
        <Route path="api-keys" element={<ApiKeysPage />} />
        <Route path="connected-inboxes" element={<ConnectedInboxesPage />} />
        <Route path="playground" element={<PlaygroundPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="checkout" element={<CheckoutPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
