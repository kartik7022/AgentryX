# AgentryX FlowEngine

This folder contains the AgentryX application stack: the FastAPI backend, PostgreSQL schema, Keycloak realm/theme, Vault configuration, the tenant-facing React app, the admin React app, and the unified Docker Compose stack that also starts Kill Bill and the KillBill gateway from the sibling `KillBill` folder.

The folder name is still `FlowEngine2.0`, but the user-facing product name in the current code is AgentryX.

## What This Module Does

FlowEngine is the application and identity layer for AgentryX.

It provides:

- Tenant registration and login through Keycloak.
- Tenant, admin, co-admin, module-user, and API-key authentication.
- Tenant module access controlled by active Kill Bill subscriptions.
- Dynamic module tabs and sidebar items driven by `auth.modules` and `auth.sidebar_items`.
- Datasource, datasource configuration, credential, intent, intent policy, validation rule, inbox, user, RBAC, API key, billing, and dashboard functionality.
- A tenant-facing React application at port `3000`.
- A platform/admin React application at port `5000`.
- A FastAPI API service at port `8001`.
- A local Postgres database at port `5433`.
- Keycloak at port `7000`.
- Vault at port `8201`.
- Kill Bill at port `8080`.
- KillBill gateway at ports `3002` and `3005`.

The current user-facing tenant UI is `frontend/tenant`. Legacy tenant HTML folders are intentionally not the active UI. The backend still keeps compatibility mappings from old sidebar hrefs to the new `/app/...` routes.

## System Overview

### Modules/Features

FlowEngine is the main AgentryX platform application. It combines tenant onboarding, identity, tenant-facing operations, platform administration, subscription enforcement, credential storage, and local infrastructure wiring.

Core application features:

- Tenant landing and registration: the tenant React app provides the public landing page, custom tenant registration page, default/free module assignment during onboarding, and payment-result helper flow.
- Keycloak login and logout: users authenticate through Keycloak, using the AgentryX realm/client/theme stored under `infra/keycloak`. The tenant UI starts login by redirecting to Keycloak and receives the session through `/auth/keycloak/callback`.
- Session management: the backend stores Keycloak tokens in cookies, exposes `/auth/me`, supports `/auth/refresh`, and deletes cookies through logout routes.
- Google sign-in and Keycloak email: the realm export includes placeholder-safe Google and SMTP settings, and the `keycloak-google-bootstrap` Compose service applies real local Google OAuth and SMTP credentials from `.env`.
- Tenant account provisioning: registration creates a Keycloak tenant admin, application tenant records, a Kill Bill account, a default/free module subscription, first-login milestone records, and an active API key.
- Module subscription enforcement: tenant access to module features is controlled by active Kill Bill subscriptions. Cancelled or inactive subscriptions should remove module visibility and block backend permission checks.
- Dynamic module navigation: `auth.modules`, `auth.module_groups`, and `auth.sidebar_items` drive tenant module tabs, sidebar entries, primary/more sections, and hidden-from-module-user filtering.
- Platform/admin portal: `frontend/admin` provides admin-facing management of tenant clients, modules, sidebar items, module groups, datasource driver definitions, platform admins, and billing dashboards.
- Tenant portal: `frontend/tenant` provides tenant-facing dashboards, datasources, datasource configs, credentials, intents, intent policies, validation rules, users, roles, API keys, connected inboxes, playground, billing, checkout, and generic feature routes.
- Datasource management: tenants can create datasource records, configure driver/connection metadata, choose data/query credential mode, and manage active/inactive datasource state.
- Datasource driver catalog: platform admins can manage supported datasource types, driver families, aliases, icon/logo metadata, connection protocols, and tenant-visible datasource descriptors.
- Credential gateway: datasource and inbox credentials are tested where connector support exists, saved to Vault, and referenced from datasource config or inbox records by Vault path.
- Email inbox management: tenant users can create and configure Gmail, Microsoft 365, IMAP, and Exchange inbox metadata and store provider credentials in Vault.
- Intent configuration: tenants can define intents, language-specific intent policies, confidence thresholds, multi-intent behavior, rerouting behavior, and validation rules.
- Validation rules: tenants can define datasource-backed validation rules with execution order, rule metadata, query/prompt fields, and activation state.
- Tenant user management: tenant admins can create co-admins and module users in Keycloak, assign modules, update status/name/module access, and delete users with self-delete protection.
- RBAC helper endpoints: tenant UI can list supported tenant roles from Keycloak-facing backend routes.
- API key management: tenants can generate, view, and revoke API keys. API keys are hashed at rest and must be exchanged through `/auth/token` before API use.
- Billing integration: tenant billing pages and admin billing pages call the KillBill gateway for plans, accounts, subscriptions, invoices, payments, payment methods, module subscription changes, and billing config.
- Tenant purge: admin purge logic deletes tenant-owned `eivs.*` rows in FK-safe order and returns Vault paths that need cleanup.
- Notifications: the backend can send metadata-confirmed emails and user invitation/setup emails through SMTP when configured.
- Local infrastructure stack: this folder starts the application backend, tenant UI, admin UI, Postgres, Vault, Keycloak, Kill Bill, KillBill gateway, and one-shot bootstrap containers.

Backend module responsibilities:

- `accounts`: admin-created and managed tenant accounts, tenant deletion, account upgrades, module edits, and API-key lookups.
- `admins`: platform admin and superadmin management.
- `api_keys`: tenant API key generation, listing, active-key lookup, and revocation.
- `auth`: Keycloak OAuth callback, registration, user/session token routes, refresh/logout, billing token verification, payment verification stub, and production upgrade flow.
- `credential_gateway`: Vault-backed datasource/inbox credential tests, saves, metadata confirmation, and Vault path deletion.
- `datasources`: tenant datasource route/service/repository/schema files and associated config cleanup.
- `datasource_types`: admin-managed datasource driver definitions and aliases plus public datasource descriptors for tenant UI.
- `email_inboxes`: tenant connected inbox CRUD, inbox test operation, and provider type descriptors.
- `intents`: tenant intents and language policy CRUD.
- `module_groups`: platform module group CRUD and group assignment behavior.
- `plans`: currently placeholder files; active plan/billing behavior is handled through the KillBill gateway and module/account services.
- `platforms_modules`: platform module CRUD, tenant module assignment helpers, public module lists, module subscription helper routes, and gateway product sync.
- `rbac`: tenant role listing.
- `sidebar_items`: platform sidebar metadata CRUD and tenant sidebar discovery.
- `tenant_purge`: destructive tenant-data cleanup helper.
- `users`: tenant co-admin/module-user lifecycle in Keycloak.
- `validation_rules`: tenant validation rule CRUD and query helpers.

Frontend feature areas:

- Tenant public pages: landing, registration, and payment/upgrade result pages.
- Tenant authenticated workspace: dashboard, module-aware layout, datasources, configs, credential setup, connected inboxes, intents, policies, rules, users, roles, API keys, playground, billing, checkout, and feature fallbacks.
- Admin workspace: clients, admins, modules, module groups, sidebar items, datasource types, billing dashboards, billing plans, subscriptions, payments, customers, revenue, and configuration.
- Shared tenant design system: centralized theme tokens, typography tokens, button tokens, tooltip tokens, global responsive CSS, reusable buttons, tooltips, banners, typeahead selects, and datasource option rows.

### Folder Structure Details

Top-level folder:

- `.dockerignore`: excludes local and generated files from Docker build contexts.
- `.env.example`: sanitized local environment template for backend, Keycloak, Kill Bill, Vault, SMTP, payment, and optional integration settings.
- `.gitignore`: excludes secrets, generated files, runtime artifacts, dependency folders, caches, and local tooling state.
- `Dockerfile`: builds the FastAPI backend container.
- `docker-compose.yml`: the unified local stack for FlowEngine, Keycloak, Vault, Kill Bill, KillBill gateway, tenant UI, and admin UI.
- `requirements.txt`: Python backend dependencies.
- `alembic.ini`: Alembic configuration scaffold.
- `init_schema.sql`: startup schema creation, migrations, and seed data for `auth` and `eivs`.
- `backend/`: FastAPI application source.
- `frontend/`: tenant and admin React applications.
- `infra/`: service-specific infrastructure configuration.
- `migrations/`: Alembic scaffold.
- `tests/`: placeholder test files.
- `tools/`: local utility scripts.
- `docs/`: project documentation and supporting notes.

Backend structure:

- `backend/main.py`: FastAPI app creation, CORS, router registration, startup behavior, health/root routes, and tenant purge route.
- `backend/core/config.py`: Pydantic settings and environment variable mapping.
- `backend/core/database.py`: psycopg connection handling and startup schema execution under advisory lock.
- `backend/core/middleware/auth.py`: session parsing, Keycloak userinfo validation, role/module/feature permission checks, API-key token handling, and module subscription enforcement.
- `backend/core/dependencies.py`: empty placeholder.
- `backend/core/security.py`: empty placeholder.
- `backend/core/middleware/rate_limit.py`: empty placeholder.
- `backend/core/middleware/tenant.py`: empty placeholder.
- `backend/common/exceptions.py`: shared API exception helpers.
- `backend/common/responses.py`: shared response helpers.
- `backend/common/utils/time.py`: shared time utilities.
- `backend/common/logger.py`: empty placeholder.
- `backend/common/validators.py`: empty placeholder.
- `backend/modules/accounts/`: tenant-account administration and module/account synchronization.
- `backend/modules/admins/`: platform admin management.
- `backend/modules/api_keys/`: API key hashing, generation, storage, lookup, and revocation.
- `backend/modules/auth/`: login/callback/register/session/token/payment helper routes and services.
- `backend/modules/credential_gateway/`: connector tests, Vault integration, datasource credential save/fetch behavior, and inbox credential behavior.
- `backend/modules/datasources/`: tenant datasource route/service/repository/schema files.
- `backend/modules/datasource_types/`: supported datasource driver and alias management.
- `backend/modules/email_inboxes/`: connected inbox routes/services/repository/schema files.
- `backend/modules/intents/`: intent and intent-policy routes/services/repository/schema files.
- `backend/modules/module_groups/`: module group routes/services/repository/schema files.
- `backend/modules/plans/`: currently empty placeholder module.
- `backend/modules/platforms_modules/`: platform module routes/services/repository/schema files and KillBill gateway sync logic.
- `backend/modules/rbac/`: role discovery routes.
- `backend/modules/sidebar_items/`: sidebar item metadata routes/services/repository/schema files.
- `backend/modules/tenant_purge/`: tenant purge service.
- `backend/modules/users/`: tenant user creation/update/delete/listing logic backed by Keycloak.
- `backend/modules/validation_rules/`: validation rule routes/services/repository/schema files.
- `backend/notifications/`: SMTP email service and HTML notification template.

Tenant frontend structure:

- `frontend/tenant/package.json`: Vite/React tenant app dependencies and scripts.
- `frontend/tenant/Dockerfile`: builds tenant React app and serves it through Nginx.
- `frontend/tenant/nginx.conf`: SPA serving and backend API proxy configuration.
- `frontend/tenant/index.html`: Vite entry HTML and runtime local config defaults.
- `frontend/tenant/src/main.jsx`: React root bootstrap.
- `frontend/tenant/src/app/`: tenant app root and router.
- `frontend/tenant/src/components/layout/`: app shell, sidebar, module navigation, public layout, mobile layout behavior.
- `frontend/tenant/src/components/feedback/`: sticky/auto-dismissing banners and first-login/metadata popups.
- `frontend/tenant/src/components/primitives/`: reusable button, tooltip, and typeahead primitives.
- `frontend/tenant/src/components/datasources/`: datasource picker/list row helpers.
- `frontend/tenant/src/components/routing/`: protected route wrapper.
- `frontend/tenant/src/lib/`: API clients grouped by feature.
- `frontend/tenant/src/pages/`: public and authenticated tenant pages.
- `frontend/tenant/src/providers/`: auth, billing event, and workspace providers.
- `frontend/tenant/src/theme/`: centralized theme, typography, button, and tooltip tokens.
- `frontend/tenant/src/styles/global.css`: global design system, responsive behavior, form wrapping, shell layout, cards, tables, buttons, modals, and mobile drawer behavior.

Admin frontend structure:

- `frontend/admin/package.json`: Vite/React admin app dependencies and scripts.
- `frontend/admin/Dockerfile.admin`: builds the admin React app and serves it through Nginx.
- `frontend/admin/nginx.conf`: admin SPA serving and gateway/backend proxy behavior.
- `frontend/admin/src/main.jsx`: React root bootstrap.
- `frontend/admin/src/App.jsx`: admin routes.
- `frontend/admin/src/api.js`: admin API wrapper and KillBill gateway proxy calls.
- `frontend/admin/src/components/`: auth guard, sidebar, modals, and CRUD dialogs.
- `frontend/admin/src/pages/`: client, module, sidebar, admin, datasource type, module group, and billing pages.
- `frontend/admin/public/`: favicon/icon assets.
- `frontend/admin/src/assets/`: UI assets.
- `frontend/admin/dashboard.html`: legacy/static artifact, not the active admin app.

Infrastructure structure:

- `infra/keycloak/realm-export.json`: Keycloak realm, client, roles, and placeholder-safe identity provider config.
- `infra/keycloak/bootstrap-google-idp.py`: one-shot script that applies local Google IdP credentials to Keycloak.
- `infra/keycloak/themes/agentryx/login/`: custom Keycloak login/logout theme files.
- `infra/postgres/init-keycloak-db.sql`: creates Keycloak database/schema/user inside the shared Postgres service.
- `infra/vault/vault.hcl`: Vault server config.
- `infra/vault/adapter-tenant-jwt-policy.hcl`: Vault policy for tenant JWT adapter access.
- `infra/killbill/bootstrap-catalog.sh`: one-shot Kill Bill tenant/catalog bootstrap script.

Supporting structure:

- `migrations/`: Alembic environment and initial placeholder migration.
- `tests/`: placeholder backend test files.
- `tools/create_api_key.py`: local API-key creation helper with a stale fallback DSN noted later in this README.
- `docs/`: additional project documentation.

### Tech Stack

Frontend:

- React 19 for tenant and admin applications.
- React DOM 19.
- React Router DOM 7 for client-side routing.
- Vite 8 for development/build.
- Nginx for serving built tenant/admin SPAs in Docker.
- Socket.IO client in tenant UI for gateway billing events.
- Stripe React/Stripe.js packages in tenant UI.
- Recharts in admin UI billing dashboards.
- CSS variables and central token files for tenant theme, typography, buttons, and tooltip styling.

Backend:

- Python 3.11.
- FastAPI.
- Uvicorn with standard extras.
- Pydantic and Pydantic Settings.
- SQLAlchemy plus psycopg and psycopg2 for Postgres access paths.
- Alembic scaffold.
- python-jose, PyJWT, passlib, and bcrypt for JWT/password-related helpers.
- httpx for internal HTTP calls.
- python-multipart for form/file support.
- APScheduler dependency.

Databases and storage:

- PostgreSQL 15 for FlowEngine application data and Keycloak data.
- MariaDB through the Kill Bill image for Kill Bill billing data.
- HashiCorp Vault 1.14.0 for datasource and inbox secrets.
- Keycloak internal persistence uses the shared Postgres service.

Identity, billing, and infrastructure:

- Keycloak 26.2.4 for identity, OAuth, user roles, custom attributes, custom login/logout theme, and Google IdP integration.
- Kill Bill server for billing accounts, subscriptions, invoices, bundles, and catalog.
- KillBill gateway from sibling `KillBill/gateway` for local-friendly billing APIs, subscription helpers, payment integrations, and webhooks.
- Docker and Docker Compose v2 for local orchestration.

External services and integrations:

- Google OAuth through Keycloak.
- SMTP/Gmail app-password email sending.
- Razorpay and Stripe keys are supported by configuration and gateway integration.
- Mautic configuration is present as optional/best-effort integration through gateway settings.
- Datasource connector libraries include Snowflake, ODBC, Oracle DB, PostgreSQL, Salesforce REST-style testing, and inbox protocol support.

Developer tooling:

- npm/package-lock for tenant/admin frontend dependency management.
- pip/requirements.txt for backend dependency management.
- pytest and pytest-asyncio dependencies are present, though current test files are placeholders.
- ESLint is configured for the admin React app.

## Source Inventory

Project-owned source/config reviewed in this folder:

- Root stack files: `.env.example`, `.dockerignore`, `.gitignore`, `Dockerfile`, `docker-compose.yml`, `requirements.txt`, `alembic.ini`, `init_schema.sql`.
- FastAPI entrypoint: `backend/main.py`.
- Core backend config: `backend/core/config.py`, `backend/core/database.py`, `backend/core/middleware/auth.py`.
- Empty/scaffolded core placeholders: `backend/core/dependencies.py`, `backend/core/security.py`, `backend/core/middleware/rate_limit.py`, `backend/core/middleware/tenant.py`, `backend/common/logger.py`, `backend/common/validators.py`.
- Shared backend helpers: `backend/common/exceptions.py`, `backend/common/responses.py`, `backend/common/utils/time.py`.
- Backend modules: `accounts`, `admins`, `api_keys`, `auth`, `credential_gateway`, `datasources`, `datasource_types`, `email_inboxes`, `intents`, `module_groups`, `plans`, `platforms_modules`, `rbac`, `sidebar_items`, `tenant_purge`, `users`, `validation_rules`.
- Backend notifications: `backend/notifications/email_service.py` and `backend/notifications/templates/metadata_confirmed.html`.
- Tenant React app: `frontend/tenant`.
- Admin React app: `frontend/admin`.
- Infra files: `infra/keycloak`, `infra/postgres`, `infra/vault`, `infra/killbill`.
- Alembic scaffold: `migrations`.
- Tools/tests/docs: `tools/create_api_key.py`, `tests`, `docs`.

Current `frontend` tree:

- `frontend/tenant`: active tenant-facing React app.
- `frontend/admin`: active platform/admin React app.
- `frontend/package.json`: minimal root dependency file containing `react-router-dom`.
- `frontend/package-lock.json`: lockfile for the minimal root frontend package.
- `frontend/techkasetti_logo.jpg`: checked-in image asset.

Legacy tenant HTML folders are not present in the current `frontend` tree. The only raw HTML artifact under the active frontend tree is `frontend/admin/dashboard.html`, which is a legacy/static admin artifact and not the active tenant UI.

Tenant React file map:

- App/routing: `src/main.jsx`, `src/app/App.jsx`, `src/app/TenantRouter.jsx`, `src/components/routing/ProtectedRoute.jsx`.
- Layout: `src/components/layout/AppShell.jsx`, `src/components/layout/PublicLayout.jsx`.
- Feedback: `src/components/feedback/Banner.jsx`, `FirstLoginPopup.jsx`, `MetadataPopup.jsx`.
- Primitives: `src/components/primitives/AppButton.jsx`, `Tooltip.jsx`, `TypeaheadSelect.jsx`.
- Datasource UI helper: `src/components/datasources/DatasourceOptionRow.jsx`.
- Providers: `src/providers/AuthProvider.jsx`, `BillingEventsProvider.jsx`, `TenantWorkspaceProvider.jsx`.
- API clients: `src/lib/api.js`, `api-keys.js`, `billing.js`, `credentials.js`, `datasource-configs.js`, `datasources.js`, `inboxes.js`, `intents.js`, `playground.js`, `roles.js`, `rules.js`, `users.js`.
- Public pages: `LandingPage.jsx`, `RegisterPage.jsx`, `PaymentPage.jsx`.
- App pages: `DashboardPage.jsx`, `DatasourcesPage.jsx`, `DatasourceConfigsPage.jsx`, `CredentialsPage.jsx`, `IntentsPage.jsx`, `IntentPoliciesPage.jsx`, `RulesPage.jsx`, `UsersPage.jsx`, `RolesPage.jsx`, `ApiKeysPage.jsx`, `ConnectedInboxesPage.jsx`, `PlaygroundPage.jsx`, `BillingPage.jsx`, `CheckoutPage.jsx`, `FeaturePage.jsx`.
- Theme/styles: `src/theme/tokens.js`, `typography.js`, `button-tokens.js`, `tooltip-tokens.js`, `ThemeProvider.jsx`, `src/styles/global.css`.
- Build/runtime config: `package.json`, `vite.config.js`, `Dockerfile`, `nginx.conf`, `index.html`.

Admin React file map:

- App/routing/auth: `src/main.jsx`, `src/App.jsx`, `src/api.js`, `src/components/AuthGuard.jsx`, `src/components/Sidebar.jsx`.
- Shared components: `Modal.jsx`, `FieldsModal.jsx`.
- Client/admin/module/sidebar modals: `CreateAdminModal.jsx`, `EditAdminModal.jsx`, `DeleteAdminModal.jsx`, `CreateModuleModal.jsx`, `EditModuleModal.jsx`, `DeleteModuleModal.jsx`, `CreateSidebarItemModal.jsx`, `EditSidebarItemModal.jsx`, `DeleteSidebarItemModal.jsx`, `CreateGroupModal.jsx`, `EditGroupModal.jsx`, `DeleteGroupModal.jsx`, `CreateDstypeModal.jsx`, `EditDstypeModal.jsx`, `DeleteDstypeModal.jsx`, `EditClientModal.jsx`, `DeleteClientModal.jsx`, `UpgradeClientModal.jsx`.
- Platform pages: `RegisterClient.jsx`, `ManageClients.jsx`, `Modules.jsx`, `SidebarItems.jsx`, `Admins.jsx`, `DatasourceTypes.jsx`, `ModuleGroups.jsx`.
- Billing pages: `BillingDashboard.jsx`, `BillingCustomers.jsx`, `BillingCustomerDetail.jsx`, `BillingSubscriptions.jsx`, `BillingPayments.jsx`, `BillingRevenue.jsx`, `BillingConfig.jsx`, `BillingPlans.jsx`.
- Build/runtime config: `package.json`, `vite.config.js`, `Dockerfile.admin`, `nginx.conf`, `index.html`, `eslint.config.js`.
- Static/assets: `public/favicon.svg`, `public/icons.svg`, `src/assets/hero.png`, `react.svg`, `vite.svg`, `App.css`, `index.css`.
- Legacy/static artifact: `dashboard.html`.

Generated/vendor/local files intentionally excluded from documentation detail:

- `node_modules`, `dist`, `build`, `__pycache__`, `.pytest_cache`, local `.env`, local `.git.backup`, and Docker volumes.

## Runtime Architecture

Docker Compose is the primary local orchestration layer.

Active services in `docker-compose.yml`:

- `app`: FastAPI backend built from this folder, exposed as `http://localhost:8001`.
- `db`: PostgreSQL 15, exposed as `localhost:5433`, database `AgentryX`.
- `vault`: HashiCorp Vault 1.14.0, exposed as `localhost:8201`.
- `killbill-db`: MariaDB for Kill Bill, exposed as `localhost:3306`.
- `killbill`: Kill Bill server image `killbill-fixed`, exposed as `localhost:8080`.
- `killbill-catalog-bootstrap`: one-shot catalog bootstrapper that creates Kill Bill tenant `company_a/company_a_secret` and uploads `../KillBill/catalog.xml`.
- `killbill-gateway`: Node gateway built from `../KillBill/gateway`, exposed as `localhost:3002` and webhook listener `localhost:3005`.
- `keycloak`: Keycloak 26.2.4, exposed as `localhost:7000`, imports `infra/keycloak/realm-export.json`.
- `keycloak-google-bootstrap`: one-shot Keycloak configurator that reads SMTP and Google OAuth values from `.env`, updates the realm SMTP server, and updates the `google` identity provider without committing secrets to `realm-export.json`.
- `tenant-ui`: tenant-facing React/Nginx app, container name `tenant-ui`, exposed as `localhost:3000`.
- `admin-ui`: admin React/Nginx app, exposed as `localhost:5000`.

Commented optional services in `docker-compose.yml`:

- KAUI.
- Metabase.
- Mautic DB.
- Mautic.

These optional services are not started unless uncommented. The admin UI sidebar includes a `Tools` group with external links to Metabase at `http://localhost:3003` and Mautic at `http://localhost:3004`; those links are only shortcuts and will work only after the matching optional services are intentionally uncommented and started.

## Database Schema

`backend/core/database.py` runs `init_schema.sql` on backend startup under Postgres advisory lock `918273645`. This avoids multiple Uvicorn workers running schema initialization concurrently.

Schemas created:

- `auth`.
- `eivs`.

Main tables created:

- `auth.tenant_milestones`: first-login and milestone tracking.
- `auth.module_groups`: groups modules into top-level module tabs.
- `auth.modules`: module metadata, features, default flags, sidebar item values, optional external URLs, free-plan metadata, trial weeks, API-call allowance.
- `auth.api_clients`: generated tenant API keys with hashed secrets, scopes, roles, expiry, and status.
- `auth.sidebar_items`: dynamic tenant sidebar item metadata, primary/more sections, hidden-from-module-user flag.
- `eivs.datasources`: tenant datasource records, connection keys, active flag, and `data`/`query` mode.
- `eivs.datasource_configs`: connection metadata, routing metadata, driver details, Vault secret path, pool/profiling fields.
- `eivs.intents`: tenant intent definitions.
- `eivs.intent_policies`: per-intent language policy, confidence thresholds, rerouting, and multi-intent settings.
- `eivs.validation_rules`: validation rules tied to intents and datasources.
- `eivs.email_inboxes`: connected inbox metadata and Vault path.
- `eivs.email_sync_logs`: sync log records for inboxes.
- `eivs.driver_definitions`: supported datasource driver definitions.
- `eivs.driver_aliases`: aliases for canonical datasource drivers.

Seeded modules:

- `email_validate`.
- `data`.
- `sql_query`.

Seeded datasource drivers:

- Salesforce Tooling API.
- ServiceNow REST API.
- PostgreSQL.
- SAP HANA.
- Oracle Database.
- Microsoft SQL Server.
- Progress DataDirect.
- CData Generic Connector.
- Microsoft Dataverse.
- NetSuite SuiteAnalytics.
- Epicor SQL Server.
- JDE Oracle.

## Authentication And Authorization

Keycloak is the primary identity provider.

Current Keycloak realm behavior:

- Realm name: `flowengine`.
- Display name: `AgentryX`.
- Client: `agentryx-app`.
- Redirect URIs: `http://localhost:3000/*` and `http://localhost:8001/*`.
- Web origins: `http://localhost:3000` and `http://localhost:8001`.
- Email verification is enabled.
- Registration is allowed in the realm, but the application uses its own React registration page.
- SMTP and the Google identity provider are declared in the realm export with placeholder-safe values, then `keycloak-google-bootstrap` updates the live Keycloak realm from local `.env` values when `SMTP_*`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` are configured.
- Custom login/logout theme: `infra/keycloak/themes/agentryx/login`.

Keycloak roles used:

- `tenant_admin`.
- `tenant_co_admin`.
- `tenant_module_user`.
- `superadmin`.
- `admin`.

FastAPI session/auth behavior:

- The `session` cookie stores a Keycloak access token.
- The `refresh_token` cookie is used by `/auth/refresh`.
- `/auth/me` validates the current session through Keycloak userinfo.
- Admin UI uses `admin_session`.
- API clients use keys formatted like `ak_live_<key_id>_<secret>`, but direct use as a portal session is disabled. API keys must be exchanged through `/auth/token`.

Permission behavior:

- `require_permission(feature)` is the central portal authorization dependency.
- For tenant admins, co-admins, and API clients, the requested feature must be present in a module that has an ACTIVE Kill Bill subscription for the tenant.
- For tenant module users, access is the intersection of their Keycloak `modules` attribute, the tenant's active Kill Bill subscriptions, the selected module's sidebar items, and `auth.sidebar_items.hidden_from_module_user`.
- If a Kill Bill subscription is cancelled or not ACTIVE, module access should be denied by backend permission checks and the module should disappear from `/portal/my-modules`.

## Backend API Surface

### Health And Root

- `GET /`: redirects to `settings.admin_hub_url`, which is configured as the tenant UI URL in `.env.example`.
- `GET /health`: returns `{"status":"healthy"}`.

### Auth

- `GET /auth/keycloak/callback`: OAuth callback. Handles tenant/admin routing, Google auto-provisioning, email verification flow, first-login milestone, optional checkout redirect, and cookie setting.
- `POST /auth/logout`: deletes the `session` cookie.
- `POST /auth/refresh`: refreshes Keycloak session and refresh-token cookies.
- `POST /auth/register`: creates a tenant admin account, Keycloak user, Kill Bill account, default/free subscription, and API key.
- `GET /auth/me`: returns current tenant session state.
- `POST /auth/payment/verify`: lightweight/stub-style verification that returns success based on `payment_success` in the request body.
- `POST /auth/upgrade-to-production`: marks a tenant as production and extends API key expiry.
- `POST /auth/user-token`: username/password grant for sub-users and co-admins.
- `POST /auth/token`: exchanges a tenant API key for a short-lived JWT.
- `GET /auth/billing-token`: creates a 5-minute billing portal token for tenant admin/co-admin.
- `GET /auth/billing-verify`: verifies a billing token.

### Admins

- `POST /admin/auth/logout`: deletes `admin_session`.
- `GET /admin/auth/me`: verifies admin session.
- `POST /admin/admins`: superadmin-only admin creation.
- `GET /admin/admins`: list admins.
- `PATCH /admin/admins/{admin_id}`: update admin password/status.
- `DELETE /admin/admins/{admin_id}`: delete admin, with self-delete and superadmin delete protection.

### Accounts

- `GET /api/modules`: admin-protected module list for account forms.
- `GET /api/public/modules`: public list of default active modules.
- `POST /api/accounts`: admin-created tenant account.
- `GET /api/accounts`: list Keycloak tenant admins with module/account metadata.
- `GET /api/accounts/{email}`: fetch tenant account by email.
- `DELETE /api/accounts/{email}`: delete tenant admin, sub-users, API keys, FlowEngine tenant data, Vault paths, and best-effort Kill Bill subscriptions.
- `PATCH /api/accounts/{email}/upgrade`: upgrade trial account to production.
- `PATCH /api/accounts/{email}/edit`: update account status/account type/modules and sync Kill Bill subscriptions.
- `GET /api/accounts/{email}/apikey`: fetch active API key metadata for tenant.

### Modules And Sidebar

- `GET /admin/modules`: admin list of modules.
- `GET /admin/modules/default`: admin list of default active modules.
- `GET /admin/modules/public/list`: public active modules.
- `GET /admin/modules/public/list-all`: public all-status modules for plan forms/gateway sync.
- `GET /admin/modules/{module_id}`: fetch module.
- `POST /admin/modules`: create module and sync product/plan metadata to KillBill gateway.
- `PATCH /admin/modules/{module_id}`: update module and sync relevant fields to KillBill gateway.
- `DELETE /admin/modules/{module_id}`: delete module after KillBill gateway verifies no active subscribers.
- `GET /admin/modules/tenant/{tenant_id}`: admin view of tenant modules.
- `POST /admin/modules/tenant/{tenant_id}/assign`: updates tenant admin Keycloak module attribute.
- `DELETE /admin/modules/tenant/{tenant_id}/module/{module_id}`: removes module from tenant admin Keycloak attribute.
- `GET /portal/my-modules`: tenant visible modules, using active Kill Bill subscriptions as source of truth.
- `GET /portal/available-modules`: modules available for subscription.
- `POST /portal/add-module`: adds a module id to tenant admin Keycloak attributes after subscription flow.
- `GET /admin/module-groups`: list module groups.
- `POST /admin/module-groups`: superadmin-only create group.
- `PATCH /admin/module-groups/{group_id}`: superadmin-only update group.
- `DELETE /admin/module-groups/{group_id}`: superadmin-only delete group and unassign modules.
- `GET /admin/sidebar-items`: list sidebar items.
- `POST /admin/sidebar-items`: create sidebar item.
- `PATCH /admin/sidebar-items/{item_id}`: update sidebar item.
- `DELETE /admin/sidebar-items/{item_id}`: delete sidebar item.
- `GET /portal/sidebar-items`: public active sidebar metadata used by tenant UI.

### Datasources And Configs

- `GET /datasources`: list tenant datasources.
- `GET /datasources/{datasource_id}`: get datasource.
- `POST /datasources`: create datasource.
- `PUT /datasources/{datasource_id}`: update datasource.
- `DELETE /datasources/{datasource_id}`: delete datasource and associated config/Vault secret where applicable.
- `GET /datasource-configs`: list tenant datasource configs.
- `GET /datasource-configs/by-name/{name}`: get config by tenant and name.
- `GET /datasource-configs/driver/{driver_family}`: list configs by driver family.
- `GET /datasource-configs/protocol/{protocol}`: list configs by protocol.
- `GET /datasource-configs/{config_id}`: get config.
- `POST /datasource-configs`: create config.
- `PUT /datasource-configs/{config_id}`: update config.
- `DELETE /datasource-configs/{config_id}`: delete config and Vault secret where applicable.
- `POST /datasource-configs/{config_id}/test`: currently returns success from a stub service method.

### Datasource Types

- `GET /admin/datasource-types/public`: public active datasource descriptors for tenant UI.
- `GET /admin/datasource-types`: superadmin list of drivers.
- `GET /admin/datasource-types/{driver_id}`: driver with aliases.
- `POST /admin/datasource-types`: create driver.
- `PATCH /admin/datasource-types/{driver_id}`: update driver.
- `DELETE /admin/datasource-types/{driver_id}`: delete driver.
- `GET /admin/datasource-types/{driver_id}/aliases`: list aliases.
- `POST /admin/datasource-types/{driver_id}/aliases`: create alias.
- `DELETE /admin/datasource-types/aliases/{alias_id}`: delete alias.

### Credentials And Vault

- `GET /flowengine/datasources?tenant_id=...`: tenant datasource list enriched with config id and Vault path.
- `POST /test-connection`: tests datasource credentials for supported connector functions.
- `PUT /save-credentials`: saves datasource credentials to Vault and writes `vault_secret_path` to datasource config.
- `DELETE /vault/delete`: deletes a Vault path if possible.
- `POST /email-inbox/test-connection`: tests inbox credentials.
- `PUT /email-inbox/save-credentials`: saves inbox credentials to Vault and returns path.
- `POST /credentials/metadata-confirmed`: emails metadata-confirmation notice and clears query-mode credentials.

### Email Inboxes

- `GET /api/email-inboxes`: list inboxes.
- `GET /api/email-inboxes/{inbox_id}`: get inbox.
- `POST /api/email-inboxes`: create inbox metadata.
- `PUT /api/email-inboxes/{inbox_id}`: update inbox metadata.
- `DELETE /api/email-inboxes/{inbox_id}`: delete inbox and Vault secret where applicable.
- `POST /api/email-inboxes/{inbox_id}/test`: test existing inbox by Vault path.
- `GET /api/email-inbox-types`: provider descriptors for Google Gmail, Microsoft 365, IMAP, and Exchange.

### Intents, Policies, Rules

- `GET /intents`: list tenant intents.
- `GET /intents/{intent_id}`: get intent.
- `POST /intents`: create intent, optionally with nested policies.
- `PUT /intents/{intent_id}`: update intent.
- `DELETE /intents/{intent_id}`: delete intent.
- `GET /intents/policies/all`: list all policies with intent metadata.
- `GET /intents/policies`: list policies.
- `GET /intents/{intent_id}/policies`: list policies for intent.
- `POST /intents/{intent_id}/policies`: create policy.
- `GET /intents/{intent_id}/policies/{language_code}`: get policy.
- `PUT /intents/{intent_id}/policies/{language_code}`: update policy.
- `DELETE /intents/{intent_id}/policies/{language_code}`: delete policy.
- `GET /validation-rules`: list rules with filters.
- `GET /validation-rules/{rule_id}`: get rule.
- `GET /validation-rules/intent/{intent_id}/language/{language_code}`: active rules by intent/language.
- `GET /validation-rules/next-order/{intent_id}`: suggest next execution order.
- `POST /validation-rules`: create rule.
- `PUT /validation-rules/{rule_id}`: update rule.
- `DELETE /validation-rules/{rule_id}`: delete rule.

### Users, RBAC, API Keys

- `GET /users`: list tenant sub-users.
- `POST /users`: create tenant co-admin or module user in Keycloak and send password setup email.
- `GET /users/{user_id}`: get user.
- `PATCH /users/{user_id}`: update user full name/status/modules.
- `DELETE /users/{user_id}`: delete user, with self-delete protection.
- `GET /rbac/roles`: returns Keycloak roles limited to tenant roles.
- `POST /portal/api-keys/generate`: generate a new active API key and revoke previous active keys.
- `GET /portal/api-keys`: list tenant API keys.
- `GET /portal/api-keys/me`: get active API key.
- `DELETE /portal/api-keys`: revoke active API key.

### Tenant Purge

- `DELETE /admin/tenants/{tenant_id}/purge`: deletes tenant `eivs.*` data in FK-safe order and returns collected Vault paths. The route currently has no explicit admin dependency in the code, so protect it at network/API-gateway level before production exposure.

## Tenant React App

Location: `frontend/tenant`.

Runtime:

- Vite/React 19 app.
- Docker builds with Node 20 Alpine and serves `dist` with Nginx.
- Port in Compose: `3000`.

Routes:

- `/`: landing page.
- `/landing`: redirects to `/`.
- `/register`: custom tenant registration.
- `/payment`: payment-result simulation/upgrade helper page.
- `/app`: authenticated dashboard.
- `/app/datasources`.
- `/app/datasource-configs`.
- `/app/credentials`.
- `/app/intents`.
- `/app/intent-policies`.
- `/app/rules`.
- `/app/users`.
- `/app/roles`.
- `/app/api-keys`.
- `/app/connected-inboxes`.
- `/app/playground`.
- `/app/billing`.
- `/app/checkout`.

Important frontend behavior:

- Auth state comes from `/auth/me`.
- Session refresh is attempted every 30 seconds through `/auth/refresh`.
- Unauthorized API calls redirect to Keycloak login.
- Workspace navigation loads `/portal/sidebar-items` and `/portal/my-modules`.
- Module tabs are dynamic and respect module groups.
- Sidebar primary/more sections are driven by `auth.sidebar_items.nav_section`.
- Sidebar items hidden from module users are filtered in the UI and enforced by backend auth.
- Every button uses the reusable tooltip/button pattern where implemented through `AppButton` or `Tooltip`.
- Colors, typography, buttons, and tooltip tokens are centralized in `frontend/tenant/src/theme`.
- Runtime frontend defaults are defined in `frontend/tenant/index.html` and `src/config/env.js`.
- `Banner.jsx` uses sticky positioning, auto-scrolls error notices into view, focuses the notice for accessibility, auto-dismisses by default after 4500 ms, and keeps a manual dismiss button.
- `global.css` contains the shared responsive behavior: mobile sidebar drawer, sticky mobile top bar, responsive form wrapping, entity row wrapping, reduced field sizes on mobile, and fixed form panels converted to mobile-safe panels.

Tenant UI integration files:

- `src/lib/api.js`: cookie-aware API wrapper with 401 redirect.
- `src/lib/datasources.js`.
- `src/lib/datasource-configs.js`.
- `src/lib/credentials.js`.
- `src/lib/intents.js`.
- `src/lib/rules.js`.
- `src/lib/users.js`.
- `src/lib/roles.js`.
- `src/lib/api-keys.js`.
- `src/lib/inboxes.js`.
- `src/lib/billing.js`.
- `src/lib/playground.js`.

Known tenant UI limitation:

The following are the main middleware integration points still requiring production wiring:

| Tenant UI area | Required production behavior | Current documented status |
| -------------- | ---------------------------- | ------------------------- |
| Setup Credentials page | Test Connection must call middleware to validate the selected real datasource connection. Save and Fetch Metadata must call middleware that connects to the real datasource, fetches metadata/schema, updates datasource configuration metadata/Vault state, and persists credentials according to datasource mode. | The current metadata-confirmed/proxy yes-no style confirmation is a testing shortcut. It should not be treated as proof that metadata was fetched from the real datasource. |
| Playground page | Tenant users should be able to write a query to fetch data or write a prompt to generate a query. The Run button must call middleware that generates SQL where needed, executes against the selected live datasource using stored configuration/credentials, and returns real-time results. | `src/lib/playground.js` posts to `/demo/execute`, but no `/demo/execute` backend route was found in this folder. Execution requires that endpoint to exist elsewhere or be added later. |
| Datasources sub-tabs | Full Refresh, Lite Refresh, Check Drift, Profile, Principal Context Preview, and similar buttons should call middleware only where the middleware supports those operations. | These are integration placeholders from a UX perspective. Unsupported buttons should be modified, hidden, or repurposed to match the actual middleware feature set. |

Nginx note:

- `frontend/tenant/nginx.conf` proxies backend API calls to `http://flowengine-app-2:8000`, using the container name. If the backend container name changes, update this proxy target or switch it to the Compose service name.

## Admin React App

Location: `frontend/admin`.

Runtime:

- Vite/React 19 app.
- Docker builds with `Dockerfile.admin`.
- Port in Compose: `5000`.

Routes:

- `/register`: admin-created tenant client account.
- `/clients`: manage tenant accounts.
- `/modules`: manage modules.
- `/sidebar-items`: manage sidebar metadata.
- `/admins`: manage platform admins.
- `/datasource-types`: manage datasource driver definitions and aliases.
- `/module-groups`: manage module groups.
- `/billing/dashboard`.
- `/billing/customers`.
- `/billing/customers/:accountId`.
- `/billing/subscriptions`.
- `/billing/payments`.
- `/billing/revenue`.
- `/billing/config`.
- `/billing/plans`.

Admin UI API wrapper:

- `frontend/admin/src/api.js` redirects 401 responses to a hardcoded local Keycloak login URL.
- Billing pages use `/killbill-api/...`, proxied to the KillBill gateway.

Known admin UI artifact:

- `frontend/admin/dashboard.html` is a legacy/static admin dashboard artifact still present in the folder. The active admin app is the React source under `frontend/admin/src`.

## External Integrations

FlowEngine integrates with:

- PostgreSQL for application, Keycloak, and schema storage.
- Keycloak for identity and OAuth.
- Kill Bill through the KillBill gateway for accounts, subscriptions, bundles, invoices, payment methods, catalog plans, and module subscription source-of-truth.
- Vault for datasource and inbox credential storage.
- SMTP for metadata-confirmed notification emails.
- Google identity provider through Keycloak, if configured.
- Datasource connection libraries: Salesforce REST, PostgreSQL, Snowflake, IMAP/POP3/SMTP, plus installed ODBC/Oracle dependencies.

## Known Incomplete, Stubbed, Or Risky Behavior

- Setup Credentials integration gap: Test Connection, Save Credentials, and Fetch Metadata should be middleware-backed real datasource operations. As of this documentation pass, metadata confirmation still has a testing/proxy confirmation path instead of guaranteeing that metadata was fetched from the real datasource through middleware.
- Playground integration gap: the tenant Playground is intended to let tenants test the application by either writing a query to fetch data or writing a prompt to generate a query. The Run button should call middleware that generates SQL where needed, executes against the selected real datasource using stored configuration/credentials, and returns live results. Currently the frontend posts to `/demo/execute`, and no matching FlowEngine FastAPI route was found in this folder.
- Datasource operation buttons integration gap: Full Refresh, Lite Refresh, Check Drift, Profile, and Principal Context Preview should be wired to middleware only if those exact operations exist. They are not mandatory features by themselves; their labels/actions should be aligned with the actual middleware capabilities before claiming production completeness.
- `backend/modules/plans/*` files are empty placeholders. Plan operations are currently handled by the KillBill gateway and module/account services, not by this module.
- `backend/core/dependencies.py`, `backend/core/security.py`, `backend/core/middleware/rate_limit.py`, `backend/core/middleware/tenant.py`, `backend/common/logger.py`, and `backend/common/validators.py` are empty placeholders.
- `tests/*` files are empty placeholders.
- Alembic is scaffolded but not active: the initial migration has `pass`, and `migrations/env.py` imports `Base` from `backend.core.database`, but `Base` is not defined there.
- `POST /auth/payment/verify` only checks a request-body flag and is not a real payment verification.
- `DatasourceConfigService.test_connection` currently returns success without performing a real connection test.
- Actual datasource connection testing exists only for Salesforce Tooling, PostgreSQL, Snowflake, and inbox protocols mapped in `datasources/connector.py`. Other seeded datasource types can be configured but do not have a real test function in this backend file.
- Vault has an in-memory stub fallback if Vault settings are incomplete. That fallback is per-process and not durable, so it is not suitable for production or multi-worker reliability.
- The real Vault container in Compose is not automatically initialized/unsealed by the checked-in Compose file. A fresh machine or `docker compose down -v` may require Vault initialization/unseal and a valid `VAULT_TOKEN`.
- `tools/create_api_key.py` has a stale local fallback DSN of `postgresql://postgres:postgres@localhost:5432/flowengine`; the Compose database is `AgentryX` on host port `5433`.
- The metadata-confirmed email subject still says `FlowEngine`, while much of the template uses AgentryX branding.
- Some checked-in frontend defaults still contain local URLs and old `FlowEngine Tenant` title text.
- The Keycloak realm export intentionally does not store real SMTP credentials or the real Google IdP secret. Keep real SMTP and Google OAuth values in `.env`; `keycloak-google-bootstrap` applies them after Keycloak starts.
- `DELETE /admin/tenants/{tenant_id}/purge` is destructive and does not currently require an admin dependency in the route.
- The tenant frontend currently uses direct `localhost` runtime config in `frontend/tenant/index.html`; adjust that for non-local deployments.
- The Docker Compose service `killbill` references image `killbill-fixed`. This folder does not build that image. A new machine must load the provided image archive into Docker before starting the stack, for example `docker load -i C:\path\to\your\image.tar` or, from the repository root, `docker load -i .\killbill-fixed.tar`.

## Environment Variables

Copy `.env.example` to `.env` and fill real values.

Required for backend startup:

- `DATABASE_URL`.
- `JWT_SECRET`.
- `SUPER_ADMIN_USERNAME`.
- `SUPER_ADMIN_PASSWORD`.

Important app URLs:

- `FRONTEND_BASE_URL`.
- `ADMIN_HUB_URL`.
- `ADMIN_UI_URL`.
- `PORTAL_URL`.

Keycloak:

- `KEYCLOAK_URL`.
- `KEYCLOAK_EXTERNAL_URL`.
- `KEYCLOAK_INTERNAL_EXTERNAL_URL`.
- `KEYCLOAK_REALM`.
- `KEYCLOAK_CLIENT_ID`.
- `KEYCLOAK_CLIENT_SECRET`.
- `KEYCLOAK_ADMIN_USERNAME`.
- `KEYCLOAK_ADMIN_PASSWORD`.
- `KEYCLOAK_REDIRECT_URI`.

Kill Bill:

- `KILLBILL_GATEWAY_URL`.
- `KILLBILL_API_KEY`.
- `KILLBILL_API_SECRET`.
- `KB_HOST`.
- `KB_BASE`.
- `KB_API_KEY`.
- `KB_API_SECRET`.
- `KB_USERNAME`.
- `KB_PASSWORD`.
- `KB_WEBHOOK_CALLBACK_URL`.

Vault:

- `VAULT_ADDR`.
- `VAULT_TOKEN`.
- `VAULT_KV_MOUNT`.
- `VAULT_ROLE_ID`.
- `VAULT_SECRET_ID`.
- `VAULT_AUTH_METHOD`.

Email/SMTP:

- `SMTP_HOST`.
- `SMTP_PORT`.
- `SMTP_USER`.
- `SMTP_PASSWORD`.
- `SMTP_FROM_EMAIL`.
- `SMTP_FROM_NAME`.

Payments and optional integrations:

- `RAZORPAY_KEY_ID`.
- `RAZORPAY_KEY_SECRET`.
- `STRIPE_SECRET_KEY`.
- `GMAIL_USER`.
- `GMAIL_APP_PASSWORD`.
- `MAIL_FROM_NAME`.
- `MAIL_FROM_EMAIL`.
- `TEST_EMAIL_TO`.
- `MAUTIC_URL`.
- `MAUTIC_USER`.
- `MAUTIC_PASS`.

## Local Setup

### Prerequisites

- Docker Desktop.
- Docker Compose v2.
- Git.
- PowerShell on Windows.
- Node.js 20 only if running frontends outside Docker.
- Python 3.11 only if running the backend outside Docker.
- Ports available: `3000`, `5000`, `7000`, `8001`, `8080`, `8201`, `5433`, `3306`, `3002`, `3005`.
- The Docker image `killbill-fixed` must exist locally. Load the provided root-level `killbill-fixed.tar` first with `docker load -i C:\path\to\your\image.tar`; if running from the repository root, use `docker load -i .\killbill-fixed.tar`.

### First Run With Docker

From this folder:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and replace all `replace-with-*` values.

Load the custom Kill Bill image before starting the stack. From this `FlowEngine2.0` folder:

```powershell
docker load -i ..\killbill-fixed.tar
```

From the repository root:

```powershell
docker load -i .\killbill-fixed.tar
```

Or from any folder, use the full path:

```powershell
docker load -i C:\path\to\your\image.tar
```

Start the stack:

```powershell
docker compose up --build -d
```

Wait for:

- Postgres health check to pass.
- Keycloak import/startup to finish.
- Kill Bill to finish startup.
- `killbill-catalog-bootstrap` to complete successfully.
- `killbill-gateway` to start.
- `app`, `tenant-ui`, and `admin-ui` to start.

Useful URLs:

- Tenant UI: `http://localhost:3000`.
- Admin UI: `http://localhost:5000`.
- Backend health: `http://localhost:8001/health`.
- Keycloak: `http://localhost:7000`.
- Kill Bill: `http://localhost:8080`.
- KillBill gateway: `http://localhost:3002/api/plans`.

### Full Reset

This deletes all Docker volumes for the stack:

```powershell
docker compose down -v
docker compose up --build -d
```

After a full reset:

- Keycloak can take time to fully import and become ready.
- Kill Bill can take time to initialize.
- The catalog bootstrapper should automatically create tenant `company_a/company_a_secret` and upload `../KillBill/catalog.xml`.
- Vault may need initialization/unseal/token setup before credential saving works with real Vault.

### Troubleshooting

- If `killbill-catalog-bootstrap` fails, inspect `docker logs killbill-catalog-bootstrap` and `docker logs killbill-server`.
- If tenant pages redirect to Keycloak repeatedly, verify `KEYCLOAK_REDIRECT_URI`, `KEYCLOAK_EXTERNAL_URL`, cookie domain, and client redirect URIs in the realm.
- If API calls fail from the tenant UI, verify `tenant-ui` can reach `flowengine-app-2:8000` or update `frontend/tenant/nginx.conf`.
- If subscriptions fail, verify the bootstrap catalog contains `data-basic`, `email-validate-basic`, and `sql-query-basic`, and verify gateway `/api/plans/modules`.
- If credential saving fails, verify Vault is unsealed and `VAULT_TOKEN` has access to the configured KV mount.
- If emails do not send, verify SMTP/Gmail app-password variables. The code skips email sending when credentials are missing.
- If Playground execution fails, note that `/demo/execute` is not implemented in this folder.

## Running Parts Outside Docker

Backend:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Tenant UI:

```powershell
cd frontend/tenant
npm install
npm run dev
```

Admin UI:

```powershell
cd frontend/admin
npm install
npm run dev
```

Standalone runs still require reachable Postgres, Keycloak, Kill Bill, KillBill gateway, and Vault if real credential persistence is expected.
