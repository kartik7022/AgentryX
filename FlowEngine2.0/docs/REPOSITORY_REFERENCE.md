# FlowEngine 2.0 Repository Reference Manual

## 1. Scope

This manual documents the checked-in first-party repository at `FlowEngine2.0` as inspected on 2026-07-15.

Coverage rules used for this reference:

- First-party source, config, schema, infra, migration, static UI, and tests are covered.
- Vendored third-party dependencies under `frontend/node_modules/` are treated as external packages, not authored project code.
- Binary assets (`.jpg`, `.svg`) are described by purpose rather than decoded line-by-line.
- Empty placeholder files are explicitly identified because they matter architecturally even when they contain no code.

## 2. System Overview

FlowEngine is a multi-tenant platform that combines:

- A FastAPI backend in [backend/main.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/main.py:1)
- A Postgres-backed application schema split primarily across `eivs.*` and `auth.*`
- Keycloak for identity, session cookies, tenant attributes, and admin accounts
- Kill Bill, via an external gateway, for billing products, plans, accounts, bundles, and entitlements
- HashiCorp Vault for datasource and inbox credentials
- Several frontend surfaces:
  - `frontend/admin`: custom React admin console
  - `frontend/react-admin`: tenant portal shell built on `react-admin`
  - `frontend/killbill-portal-step1`: billing/customer portal
  - `frontend/portal`: legacy HTML/JS portal pages loaded in iframes
  - `frontend/*.html`: public landing and registration pages

The main architectural pattern on the backend is:

1. Router validates transport concerns and authentication.
2. Service layer enforces business rules and cross-module orchestration.
3. Repository layer issues raw SQL against Postgres or HTTP requests to Keycloak/Kill Bill.

## 3. Runtime Topology

### 3.1 Backend bootstrap

[backend/main.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/main.py:1) constructs the FastAPI app, injects permissive CORS, overrides OpenAPI to add bearer auth metadata, initializes the database on startup by running `init_schema.sql`, and seeds the Keycloak superadmin account.

Key interactions:

- `settings` comes from [backend/core/config.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/core/config.py:1)
- `init_db()` comes from [backend/core/database.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/core/database.py:1)
- Every domain router is registered here, so this file is the canonical route map.
- Static frontend files are mounted from `/frontend`.
- `/` redirects to `frontend/landing.html`.

### 3.2 Configuration

[backend/core/config.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/core/config.py:1) is the central configuration model. It uses `pydantic-settings` and reads `.env`. The class exposes:

- database DSN
- app identity and debug flags
- JWT secret and TTLs
- SMTP settings
- Vault connectivity and auth mode
- broker URL and TTL for ephemeral credentials
- Keycloak internal and external URLs plus admin credentials
- Kill Bill gateway and API credentials
- admin UI, portal, and frontend URLs

Important design detail: many modules depend directly on this singleton, so environment consistency is critical.

### 3.3 Database bootstrap and schema authority

[backend/core/database.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/core/database.py:1) creates a global SQLAlchemy engine, then `init_db()` reads [init_schema.sql](/C:/Users/karik/Desktop/Project/FlowEngine2.0/init_schema.sql:1) and executes it under a Postgres advisory lock. That lock prevents concurrent worker startup races.

`init_schema.sql` is the real schema authority in practice. Alembic exists, but startup bootstrap uses the SQL file directly.

### 3.4 Authentication and authorization model

[backend/core/middleware/auth.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/core/middleware/auth.py:1) is the core access-control implementation.

Key behaviors:

- API keys are parsed as `ak_live_<key_id>_<secret>`.
- API key secrets are compared with bcrypt against `auth.api_clients`.
- Direct API-key-to-resource access is intentionally disabled; callers are expected to exchange an API key for a JWT via `/auth/token`.
- Session cookies are validated via Keycloak/tenant JWT helpers.
- Role model includes `tenant_admin`, `tenant_co_admin`, `tenant_module_user`, and `tenant_api`.
- `require_permission(feature)` checks both role and paid entitlement by querying Kill Bill and mapping active products to `auth.modules.sidebar_items`.
- Module users must also have the feature present in their assigned module list and not be blocked by `auth.sidebar_items.hidden_from_module_user`.

This middleware is the most important cross-cutting dependency in the repository because nearly every tenant-facing endpoint depends on it.

## 4. Backend Domain Map

### 4.1 Auth and admin

- [backend/modules/auth/routes.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/auth/routes.py:1)
  - Implements logout, session refresh, self-registration, current-user lookup, API-key JWT issuance, sub-user JWT issuance, billing-token issuance, and billing-token verification.
  - Registration delegates to `accounts.service.create_account`.
  - Session refresh uses Keycloak refresh tokens stored in cookies.
  - `/auth/me` relies on Keycloak `userinfo`.
- [backend/modules/auth/keycloak_callback.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/auth/keycloak_callback.py:1)
  - Handles OAuth callback flow from Keycloak.
  - Exchanges authorization code for token.
  - Reads Keycloak claims and attributes to branch users into admin UI, tenant portal, or sub-user portal.
  - Contains logic for federated sign-in and tenant bootstrap.
- [backend/modules/auth/jwt_service.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/auth/jwt_service.py:1)
  - Small helper that validates locally-issued tenant JWTs used by middleware and portal flows.
- [backend/modules/admins/routes.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/admins/routes.py:1)
  - Admin-only CRUD over Keycloak-backed admin accounts.
  - Blocks self-edit and self-delete for safety.
- [backend/modules/admins/repository.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/admins/repository.py:1)
  - Performs actual Keycloak admin API calls.
  - Creates users, assigns realm roles, lists admins, resets passwords, toggles active status, and deletes users.
- [backend/modules/admins/service.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/admins/service.py:1)
  - Decodes JWT payloads without signature verification and infers whether an admin session is valid by realm roles.
- [backend/modules/admins/seeder.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/admins/seeder.py:1)
  - Waits for Keycloak availability on startup, then ensures a `superadmin` account exists.

### 4.2 Accounts, tenant lifecycle, and user management

- [backend/modules/accounts/routes.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/accounts/routes.py:1)
  - Admin-facing account registration, listing, read, delete, upgrade, edit, and API-key lookup.
  - Mixes data from Keycloak, Kill Bill, and Postgres.
- [backend/modules/accounts/service.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/accounts/service.py:1)
  - Largest business-logic file in the repository.
  - Creates tenant admins in Keycloak, generates tenant IDs, links modules, provisions billing, edits tenant metadata, upgrades trial accounts, and purges tenant data on delete.
  - Also resolves active modules from Kill Bill subscriptions.
- [backend/modules/accounts/repository.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/accounts/repository.py:1)
  - Minimal helper module; tenant ID generation lives here.
- [backend/modules/users/routes.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/users/routes.py:1)
  - CRUD for tenant sub-users.
- [backend/modules/users/service.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/users/service.py:1)
  - Creates Keycloak sub-users, sets attributes, assigns realm roles, sends password setup emails, and enforces role/module limits.
  - Module-user quota enforcement is implemented here.
- [backend/modules/users/repository.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/users/repository.py:1)
  - Queries Keycloak to answer cross-system questions like “does email exist anywhere?”, “how many active co-admins?”, and “how many active users are assigned to this module?”

### 4.3 Modules, sidebar items, and portal composition

- [backend/modules/platforms_modules/routes.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/platforms_modules/routes.py:1)
  - Admin CRUD for platform modules.
  - Syncs module definitions to Kill Bill product endpoints.
  - Exposes tenant-facing `/portal/my-modules`, `/portal/available-modules`, and `/portal/add-module`.
- [backend/modules/platforms_modules/repository.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/platforms_modules/repository.py:1)
  - SQL CRUD over `auth.modules`.
  - Also updates Keycloak tenant `modules` attributes for assignment/removal.
- [backend/modules/sidebar_items/routes.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/sidebar_items/routes.py:1)
  - Admin CRUD plus read-only portal list of active sidebar metadata.
- [backend/modules/sidebar_items/repository.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/sidebar_items/repository.py:1)
  - SQL CRUD over `auth.sidebar_items`.
- [backend/modules/module_groups/routes.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/module_groups/routes.py:1)
  - CRUD over logical module groups used to cluster modules in the portal.

### 4.4 Intents, rules, datasources

- [backend/modules/intents/*](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/intents/routes.py:1)
  - Manages `eivs.intents` and `eivs.intent_policies`.
  - Repository is raw SQL; service enforces uniqueness and parent existence.
  - Routes deliberately place policy endpoints before `/intents/{intent_id}` to avoid route conflicts.
- [backend/modules/validation_rules/*](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/validation_rules/routes.py:1)
  - Manages `eivs.validation_rules`.
  - Validates referenced intents and datasources.
  - Preserves per-intent rule-code uniqueness.
  - Computes next execution order for new rules.
- [backend/modules/datasources/*](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/datasources/routes.py:1)
  - CRUD for datasources and datasource configs.
  - Handles transition rules between `data` and `query` modes.
  - Cleans Vault credentials when datasource mode switches or records are deleted.
  - Uses driver definitions to resolve canonical datasource type and protocol metadata.
- [backend/modules/datasources/connector.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/datasources/connector.py:1)
  - Concrete connection test implementations for Salesforce, Snowflake, Postgres, and email protocols.

### 4.5 Driver catalog and credentials

- [backend/modules/datasource_types/*](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/datasource_types/routes.py:1)
  - Superadmin-maintained catalog of driver definitions and aliases.
  - Public endpoint transforms internal driver records into UI field descriptors.
- [backend/modules/credential_gateway/routes.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/credential_gateway/routes.py:1)
  - Credential testing and persistence surface.
  - Writes datasource or inbox credentials to Vault.
  - Updates corresponding datasource config or inbox metadata with Vault paths.
  - Sends metadata-confirmed notification emails.
- [backend/modules/credential_gateway/service.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/credential_gateway/service.py:1)
  - HTTP client for an external broker that mints ephemeral credentials.
- [backend/modules/credential_gateway/vault.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/credential_gateway/vault.py:1)
  - Vault adapter used by credential flows.

### 4.6 Email inboxes, API keys, and destructive maintenance

- [backend/modules/email_inboxes/*](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/email_inboxes/routes.py:1)
  - CRUD and connection testing for tenant inbox integrations.
  - Actual credentials are always read from Vault, not stored in Postgres.
- [backend/modules/api_keys/*](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/api_keys/routes.py:1)
  - Tenant-facing API key generation, listing, retrieval, and revocation.
  - Delegates generation to [tools/create_api_key.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/tools/create_api_key.py:1).
- [backend/modules/tenant_purge/*](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/modules/tenant_purge/service.py:1)
  - Implements irreversible tenant data deletion across `eivs.*` tables in foreign-key-safe order.

### 4.7 Notifications and common helpers

- [backend/notifications/email_service.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/notifications/email_service.py:1)
  - Central SMTP sender for HTML email templates.
- [backend/notifications/templates/metadata_confirmed.html](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/notifications/templates/metadata_confirmed.html:1)
  - HTML template for datasource metadata confirmation.
- [backend/common/exceptions.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/common/exceptions.py:1)
  - Small typed HTTP exception wrappers.
- [backend/common/responses.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/common/responses.py:1)
  - Shared success response schema.
- [backend/common/utils/time.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/backend/common/utils/time.py:1)
  - Timestamp helper used by credential gateway.

## 5. Frontend Surfaces

### 5.1 `frontend/admin`

This is the main custom React admin console.

- [frontend/admin/src/App.jsx](/C:/Users/karik/Desktop/Project/FlowEngine2.0/frontend/admin/src/App.jsx:1)
  - Defines routing, layout shell, and page titles.
- [frontend/admin/src/api.js](/C:/Users/karik/Desktop/Project/FlowEngine2.0/frontend/admin/src/api.js:1)
  - Wraps `fetch`, forces credentialed requests, and redirects to Keycloak on 401.
- `src/pages/*`
  - Each page corresponds closely to one backend admin domain.
  - `ManageClients.jsx`, `Modules.jsx`, `Admins.jsx`, `DatasourceTypes.jsx`, and `ModuleGroups.jsx` front corresponding admin APIs.
  - `billing/*` pages consume Kill Bill gateway data and show dashboards, plans, invoices, revenue, customers, and subscriptions.
- `src/components/*`
  - Mostly modal components for CRUD operations and confirmations.
- [frontend/admin/src/App.css](/C:/Users/karik/Desktop/Project/FlowEngine2.0/frontend/admin/src/App.css:1)
  - Main design system and layout stylesheet.

### 5.2 `frontend/react-admin`

This is the tenant portal shell.

- [frontend/react-admin/src/App.jsx](/C:/Users/karik/Desktop/Project/FlowEngine2.0/frontend/react-admin/src/App.jsx:1)
  - Very large orchestration file.
  - Fetches sidebar metadata from `/portal/sidebar-items`.
  - Fetches tenant modules from `/portal/my-modules`.
  - Builds a hybrid portal where module-specific HTML pages are loaded inside an iframe.
  - Filters visible navigation based on assigned modules and role.
- [frontend/react-admin/src/MetadataPopup.jsx](/C:/Users/karik/Desktop/Project/FlowEngine2.0/frontend/react-admin/src/MetadataPopup.jsx:1)
  - Popup flow around metadata confirmation.
- [frontend/react-admin/src/FirstLoginPopup.jsx](/C:/Users/karik/Desktop/Project/FlowEngine2.0/frontend/react-admin/src/FirstLoginPopup.jsx:1)
  - First-login UX component.

### 5.3 `frontend/portal`

Legacy static HTML application pages rendered inside the tenant portal iframe.

Key files:

- [frontend/portal/dashboard.html](/C:/Users/karik/Desktop/Project/FlowEngine2.0/frontend/portal/dashboard.html:1)
- [frontend/portal/datasources.html](/C:/Users/karik/Desktop/Project/FlowEngine2.0/frontend/portal/datasources.html:1)
- [frontend/portal/datasource-configs.html](/C:/Users/karik/Desktop/Project/FlowEngine2.0/frontend/portal/datasource-configs.html:1)
- [frontend/portal/intents.html](/C:/Users/karik/Desktop/Project/FlowEngine2.0/frontend/portal/intents.html:1)
- [frontend/portal/intent-policies.html](/C:/Users/karik/Desktop/Project/FlowEngine2.0/frontend/portal/intent-policies.html:1)
- [frontend/portal/rules.html](/C:/Users/karik/Desktop/Project/FlowEngine2.0/frontend/portal/rules.html:1)
- [frontend/portal/users.html](/C:/Users/karik/Desktop/Project/FlowEngine2.0/frontend/portal/users.html:1)
- [frontend/portal/roles.html](/C:/Users/karik/Desktop/Project/FlowEngine2.0/frontend/portal/roles.html:1)
- [frontend/portal/connected-inboxes.html](/C:/Users/karik/Desktop/Project/FlowEngine2.0/frontend/portal/connected-inboxes.html:1)
- [frontend/portal/api-keys.html](/C:/Users/karik/Desktop/Project/FlowEngine2.0/frontend/portal/api-keys.html:1)
- [frontend/portal/playground.html](/C:/Users/karik/Desktop/Project/FlowEngine2.0/frontend/portal/playground.html:1)

Shared support files:

- [frontend/portal/auth.js](/C:/Users/karik/Desktop/Project/FlowEngine2.0/frontend/portal/auth.js:1): cookie/session bootstrapping and auth helpers
- [frontend/portal/common.css](/C:/Users/karik/Desktop/Project/FlowEngine2.0/frontend/portal/common.css:1): shared visual language
- [frontend/portal/responsive.js](/C:/Users/karik/Desktop/Project/FlowEngine2.0/frontend/portal/responsive.js:1): responsive menu behavior

### 5.4 `frontend/killbill-portal-step1`

Standalone billing/customer portal in TypeScript/React.

- [frontend/killbill-portal-step1/src/App.tsx](/C:/Users/karik/Desktop/Project/FlowEngine2.0/frontend/killbill-portal-step1/src/App.tsx:1)
  - Main route shell.
- [frontend/killbill-portal-step1/src/api/killbillClient.ts](/C:/Users/karik/Desktop/Project/FlowEngine2.0/frontend/killbill-portal-step1/src/api/killbillClient.ts:1)
  - Kill Bill gateway client wrapper.
- `src/pages/*`
  - Billing overview, checkout, invoices, health, usage, and payment methods.
- `src/contexts/*`
  - Auth and billing-event state management.

### 5.5 Public landing and registration pages

- [frontend/landing.html](/C:/Users/karik/Desktop/Project/FlowEngine2.0/frontend/landing.html:1)
- [frontend/register.html](/C:/Users/karik/Desktop/Project/FlowEngine2.0/frontend/register.html:1)
- [frontend/credentials/index.html](/C:/Users/karik/Desktop/Project/FlowEngine2.0/frontend/credentials/index.html:1)

These are large static pages that anchor public entry, self-registration, and credentials workflows.

## 6. Infrastructure, Schema, and Build Assets

- [Dockerfile](/C:/Users/karik/Desktop/Project/FlowEngine2.0/Dockerfile:1)
  - Backend image build.
- [docker-compose.yml](/C:/Users/karik/Desktop/Project/FlowEngine2.0/docker-compose.yml:1)
  - Local topology for backend, Keycloak, databases, and related services.
- [requirements.txt](/C:/Users/karik/Desktop/Project/FlowEngine2.0/requirements.txt:1)
  - Python dependencies including FastAPI, SQLAlchemy, Keycloak/Vault helpers, and connector libraries.
- [init_schema.sql](/C:/Users/karik/Desktop/Project/FlowEngine2.0/init_schema.sql:1)
  - Bootstraps database schemas, tables, constraints, and seed data.
- [infra/keycloak/realm-export.json](/C:/Users/karik/Desktop/Project/FlowEngine2.0/infra/keycloak/realm-export.json:1)
  - Keycloak realm definition.
- [infra/vault/vault.hcl](/C:/Users/karik/Desktop/Project/FlowEngine2.0/infra/vault/vault.hcl:1)
  - Vault server config.
- [infra/vault/adapter-tenant-jwt-policy.hcl](/C:/Users/karik/Desktop/Project/FlowEngine2.0/infra/vault/adapter-tenant-jwt-policy.hcl:1)
  - Vault policy for tenant-scoped access.
- [alembic.ini](/C:/Users/karik/Desktop/Project/FlowEngine2.0/alembic.ini:1), [migrations/env.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/migrations/env.py:1), [migrations/script.py.mako](/C:/Users/karik/Desktop/Project/FlowEngine2.0/migrations/script.py.mako:1), [migrations/versions/versions/4102758f0241_initial_schema.py](/C:/Users/karik/Desktop/Project/FlowEngine2.0/migrations/versions/versions/4102758f0241_initial_schema.py:1)
  - Alembic scaffolding. Present, but startup initialization is driven by `init_schema.sql`.

## 7. Observations and Technical Debt

- The repository contains many empty placeholders (`README.md`, `tests/*`, `plans/*`, several `__init__.py` files), which suggests partially scaffolded or incomplete areas.
- Some backend code decodes JWT payloads manually without signature verification before using claims for routing decisions. That is expedient but weaker than full verification.
- Route handlers in several modules mix transport, business logic, and external HTTP orchestration more heavily than ideal.
- `frontend/admin` and `frontend/portal` contain emoji-like mojibake in some strings, which indicates encoding issues in checked-in text.
- `frontend/node_modules` is committed into the repo, which makes the repository substantially larger and obscures first-party code boundaries.
- Tests are effectively absent despite a visible test package layout.

## 8. Complete First-Party File Inventory

The following appendix is the full first-party path inventory gathered from the repository, excluding `frontend/node_modules`, Python bytecode, and cache directories. The number after each path is the line count of the checked-in file.

```text
alembic.ini|29
backend\__init__.py|0
backend\common\__init__.py|0
backend\common\exceptions.py|10
backend\common\logger.py|0
backend\common\responses.py|5
backend\common\utils\__init__.py|0
backend\common\utils\time.py|4
backend\common\validators.py|0
backend\core\__init__.py|0
backend\core\config.py|88
backend\core\database.py|25
backend\core\dependencies.py|0
backend\core\middleware\__init__.py|0
backend\core\middleware\auth.py|213
backend\core\middleware\rate_limit.py|0
backend\core\middleware\tenant.py|0
backend\core\security.py|0
backend\main.py|105
backend\modules\__init__.py|0
backend\modules\accounts\__init__.py|0
backend\modules\accounts\models.py|0
backend\modules\accounts\repository.py|9
backend\modules\accounts\routes.py|233
backend\modules\accounts\schemas.py|35
backend\modules\accounts\service.py|791
backend\modules\admins\__init__.py|0
backend\modules\admins\models.py|0
backend\modules\admins\repository.py|147
backend\modules\admins\routes.py|122
backend\modules\admins\schemas.py|25
backend\modules\admins\seeder.py|107
backend\modules\admins\service.py|25
backend\modules\api_keys\__init__.py|0
backend\modules\api_keys\repository.py|88
backend\modules\api_keys\routes.py|58
backend\modules\api_keys\schemas.py|22
backend\modules\api_keys\service.py|19
backend\modules\auth\__init__.py|0
backend\modules\auth\jwt_service.py|42
backend\modules\auth\keycloak_callback.py|281
backend\modules\auth\routes.py|268
backend\modules\credential_gateway\__init__.py|0
backend\modules\credential_gateway\routes.py|304
backend\modules\credential_gateway\schemas.py|73
backend\modules\credential_gateway\service.py|53
backend\modules\credential_gateway\vault.py|94
backend\modules\datasource_types\__init__.py|0
backend\modules\datasource_types\repository.py|211
backend\modules\datasource_types\routes.py|80
backend\modules\datasource_types\schemas.py|57
backend\modules\datasource_types\service.py|128
backend\modules\datasources\__init__.py|0
backend\modules\datasources\connector.py|195
backend\modules\datasources\repository.py|214
backend\modules\datasources\routes.py|133
backend\modules\datasources\schemas.py|164
backend\modules\datasources\service.py|230
backend\modules\datasources\types.py|12
backend\modules\email_inboxes\repository.py|117
backend\modules\email_inboxes\routes.py|73
backend\modules\email_inboxes\schemas.py|79
backend\modules\email_inboxes\service.py|160
backend\modules\email_inboxes\types.py|47
backend\modules\intents\__init__.py|0
backend\modules\intents\repository.py|211
backend\modules\intents\routes.py|113
backend\modules\intents\schemas.py|73
backend\modules\intents\service.py|117
backend\modules\module_groups\__init__.py|0
backend\modules\module_groups\repository.py|96
backend\modules\module_groups\routes.py|69
backend\modules\module_groups\schemas.py|24
backend\modules\module_groups\service.py|13
backend\modules\plans\__init__.py|0
backend\modules\plans\models.py|0
backend\modules\plans\repository.py|0
backend\modules\plans\routes.py|0
backend\modules\plans\schemas.py|0
backend\modules\plans\service.py|0
backend\modules\platforms_modules\__init__.py|0
backend\modules\platforms_modules\repository.py|286
backend\modules\platforms_modules\routes.py|388
backend\modules\platforms_modules\schemas.py|81
backend\modules\platforms_modules\service.py|33
backend\modules\rbac\__init__.py|0
backend\modules\rbac\routes.py|26
backend\modules\sidebar_items\repository.py|130
backend\modules\sidebar_items\routes.py|79
backend\modules\sidebar_items\schemas.py|83
backend\modules\sidebar_items\service.py|15
backend\modules\tenant_purge\__init__.py|0
backend\modules\tenant_purge\routes.py|55
backend\modules\tenant_purge\service.py|95
backend\modules\users\__init__.py|0
backend\modules\users\repository.py|84
backend\modules\users\routes.py|46
backend\modules\users\schemas.py|55
backend\modules\users\service.py|323
backend\modules\validation_rules\__init__.py|0
backend\modules\validation_rules\repository.py|156
backend\modules\validation_rules\routes.py|71
backend\modules\validation_rules\schemas.py|85
backend\modules\validation_rules\service.py|128
backend\notifications\__init__.py|0
backend\notifications\email_service.py|52
backend\notifications\templates\__init__.py|0
backend\notifications\templates\metadata_confirmed.html|219
docker-compose.yml|107
Dockerfile|26
frontend\admin\dashboard.html|2940
frontend\admin\Dockerfile.admin|11
frontend\admin\eslint.config.js|20
frontend\admin\index.html|13
frontend\admin\nginx.conf|23
frontend\admin\package.json|29
frontend\admin\package-lock.json|2894
frontend\admin\public\favicon.svg|1
frontend\admin\public\icons.svg|24
frontend\admin\README.md|9
frontend\admin\src\api.js|44
frontend\admin\src\App.css|1127
frontend\admin\src\App.jsx|78
frontend\admin\src\assets\hero.png|98
frontend\admin\src\assets\react.svg|1
frontend\admin\src\assets\vite.svg|1
frontend\admin\src\components\AuthGuard.jsx|26
frontend\admin\src\components\CreateAdminModal.jsx|65
frontend\admin\src\components\CreateDstypeModal.jsx|112
frontend\admin\src\components\CreateGroupModal.jsx|121
frontend\admin\src\components\CreateModuleModal.jsx|194
frontend\admin\src\components\CreateSidebarItemModal.jsx|163
frontend\admin\src\components\DeleteAdminModal.jsx|38
frontend\admin\src\components\DeleteClientModal.jsx|47
frontend\admin\src\components\DeleteDstypeModal.jsx|38
frontend\admin\src\components\DeleteGroupModal.jsx|41
frontend\admin\src\components\DeleteModuleModal.jsx|38
frontend\admin\src\components\DeleteSidebarItemModal.jsx|38
frontend\admin\src\components\EditAdminModal.jsx|66
frontend\admin\src\components\EditClientModal.jsx|171
frontend\admin\src\components\EditDstypeModal.jsx|112
frontend\admin\src\components\EditGroupModal.jsx|129
frontend\admin\src\components\EditModuleModal.jsx|264
frontend\admin\src\components\EditSidebarItemModal.jsx|180
frontend\admin\src\components\FieldsModal.jsx|103
frontend\admin\src\components\Modal.jsx|17
frontend\admin\src\components\Sidebar.jsx|64
frontend\admin\src\components\UpgradeClientModal.jsx|60
frontend\admin\src\constants.js|2
frontend\admin\src\index.css|0
frontend\admin\src\main.jsx|9
frontend\admin\src\pages\Admins.jsx|160
frontend\admin\src\pages\billing\BillingConfig.jsx|233
frontend\admin\src\pages\billing\BillingCustomerDetail.jsx|216
frontend\admin\src\pages\billing\BillingCustomers.jsx|103
frontend\admin\src\pages\billing\BillingDashboard.jsx|177
frontend\admin\src\pages\billing\BillingPayments.jsx|174
frontend\admin\src\pages\billing\BillingPlans.jsx|580
frontend\admin\src\pages\billing\BillingRevenue.jsx|170
frontend\admin\src\pages\billing\BillingSubscriptions.jsx|375
frontend\admin\src\pages\DatasourceTypes.jsx|99
frontend\admin\src\pages\ManageClients.jsx|205
frontend\admin\src\pages\ModuleGroups.jsx|106
frontend\admin\src\pages\Modules.jsx|184
frontend\admin\src\pages\RegisterClient.jsx|181
frontend\admin\src\pages\SidebarItems.jsx|189
frontend\admin\vite.config.js|15
frontend\credentials\index.html|1537
frontend\killbill-portal-step1\Dockerfile|11
frontend\killbill-portal-step1\index.js|101
frontend\killbill-portal-step1\nginx.conf|8
frontend\killbill-portal-step1\package.json|47
frontend\killbill-portal-step1\package-lock.json|19147
frontend\killbill-portal-step1\postcss.config.js|6
frontend\killbill-portal-step1\public\index.html|12
frontend\killbill-portal-step1\README.md|76
frontend\killbill-portal-step1\src\api\killbillClient.ts|107
frontend\killbill-portal-step1\src\api\types.ts|113
frontend\killbill-portal-step1\src\App.tsx|58
frontend\killbill-portal-step1\src\components\Layout\AppShell.tsx|18
frontend\killbill-portal-step1\src\components\Layout\Sidebar.tsx|80
frontend\killbill-portal-step1\src\components\PaymentReminderToast.tsx|84
frontend\killbill-portal-step1\src\contexts\AuthContext.tsx|93
frontend\killbill-portal-step1\src\contexts\BillingEventsContext.tsx|66
frontend\killbill-portal-step1\src\index.css|23
frontend\killbill-portal-step1\src\index.tsx|13
frontend\killbill-portal-step1\src\InvoicesPage.tsx|0
frontend\killbill-portal-step1\src\pages\BillingPage.tsx|419
frontend\killbill-portal-step1\src\pages\CheckoutPage.tsx|947
frontend\killbill-portal-step1\src\pages\HealthPage.tsx|148
frontend\killbill-portal-step1\src\pages\InvoicesPage.tsx|213
frontend\killbill-portal-step1\src\pages\OverviewPage.tsx|76
frontend\killbill-portal-step1\src\pages\PaymentMethodsPage.tsx|61
frontend\killbill-portal-step1\src\pages\UsagePage.tsx|458
frontend\killbill-portal-step1\src\utils\formatCurrency.ts|30
frontend\killbill-portal-step1\tailwind.config.js|22
frontend\killbill-portal-step1\tsconfig.json|23
frontend\landing.html|1507
frontend\package.json|5
frontend\package-lock.json|98
frontend\portal\api-keys.html|486
frontend\portal\auth.js|182
frontend\portal\common.css|1838
frontend\portal\connected-inboxes.html|603
frontend\portal\dashboard.html|2942
frontend\portal\datasource-configs.html|769
frontend\portal\datasources.html|1182
frontend\portal\intent-policies.html|698
frontend\portal\intents.html|1003
frontend\portal\payment.html|525
frontend\portal\playground.html|968
frontend\portal\responsive.js|50
frontend\portal\roles.html|817
frontend\portal\rules.html|783
frontend\portal\users.html|497
frontend\react-admin\Dockerfile.admin|24
frontend\react-admin\index.html|15
frontend\react-admin\nginx.conf|35
frontend\react-admin\package.json|24
frontend\react-admin\src\App.jsx|1471
frontend\react-admin\src\FirstLoginPopup.jsx|157
frontend\react-admin\src\main.jsx|8
frontend\react-admin\src\MetadataPopup.jsx|209
frontend\react-admin\vite.config.js|16
frontend\register.html|387
frontend\techkasetti_logo.jpg|52
infra\keycloak\realm-export.json|2589
infra\postgres\init-keycloak-db.sql|5
infra\vault\adapter-tenant-jwt-policy.hcl|9
infra\vault\vault.hcl|11
init_schema.sql|681
migrations\env.py|47
migrations\README|1
migrations\script.py.mako|18
migrations\versions\versions\4102758f0241_initial_schema.py|21
README.md|0
requirements.txt|32
scripts\__init__.py|0
tests\__init__.py|0
tests\conftest.py|0
tests\integration\__init__.py|0
tests\integration\test_datasource_flow.py|0
tests\integration\test_login_flow.py|0
tests\unit\__init__.py|0
tests\unit\modules\__init__.py|0
tests\unit\modules\test_accounts.py|0
tests\unit\modules\test_auth.py|0
tests\unit\modules\test_plans.py|0
tools\create_api_key.py|76
```
