# AgentryX Repository

This repository contains the current AgentryX product modules that have been consolidated into one GitHub repository. It is not a single-package monorepo with one root build command. Each top-level product folder remains independently runnable and keeps its own backend, frontend, Docker, database, and setup conventions unless explicitly documented otherwise.

This README is the universal source of truth for the repository as it exists today. It consolidates the individual module READMEs and runbooks, plus a final source/configuration pass across tracked files. It documents what the code currently does, what is wired, what is only present but not active, and what still needs verification.

## Canonical Project Groups

The repository should be understood in seven product groups. These groups are the authoritative reading order for the project:

| Group                    | Folders                       | Relationship                                                                                                                                                                                                                                                                                                                               |
| ------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. FlowEngine + KillBill | `FlowEngine2.0/`, `KillBill/` | The main AgentryX SaaS platform and its billing/catalog/payment gateway support. FlowEngine owns tenant/admin/product UX, auth, tenant data, Vault credentials, Keycloak integration, and runtime service composition. KillBill owns catalog scripts, billing gateway code, webhooks, payment/reminder helpers, and compatibility scripts. |
| 2. Template Builder      | `TemplateBuilder/`            | Standalone document template studio with its own React UI, FastAPI engine, render/document generation pipeline, marketplace, placeholder registry, tests, migrations, and demo datasource SQL.                                                                                                                                             |
| 3. Prompt Builder        | `PromptBuilder/`              | Standalone prompt lifecycle studio with React UI, FastAPI backend, prompt versioning, prompt execution, test cases, audit, datasource context, AI tools, and Template Builder document generation bridge.                                                                                                                                  |
| 4. Orchestration         | `orchestration/`              | Standalone orchestration/runtime product for plans, DAG execution, human review, ITSM, copilot, evidence, governance, knowledge graph, domain packs, agent task control, and demo tenant/datasource workflows.                                                                                                                             |
| 5. DocAI                 | `Docai/`                      | Standalone document AI product for document type setup, parsing, auto-detection, parser/model registry, compliance, RAG/vector search, parse history, review/correction workflows, monitoring, and Kubernetes deployment assets.                                                                                                           |
| 6. ServiceNow NLP Explorer | `ServiceNow_NLP_Explorer_Reconstructed_Source/` | Reconstructed ServiceNow Service Portal widget and Script Include for natural-language datasource querying through an `AgentaryxNlp` REST Message. It is explicitly reconstructed source, not a direct export from the original ServiceNow instance. |
| 7. SAP Salesforce Integration | `SAP-Salesforce-Integration/` | Salesforce Apex/LWC, Node/SAP middleware, and SAP Fiori app sample for connecting Salesforce UI to SAP BTP/HANA, XSUAA auth, role-aware employee queries, prompt routing, and Fiori launch/query screens. |

There is no shared runtime package between these groups. UI restyling copied the FlowEngine visual design language into the other frontends, but the projects remain independently runnable and do not import shared FlowEngine code.

Local implementation/audit folders such as `.codex-audit/`, `.agents/`, `.git/`, dependency folders, build outputs, and `.env` files are not product modules. They are intentionally ignored or local-only and should not be treated as deployable application folders.

## Group 1: FlowEngine + KillBill

### System Role

`FlowEngine2.0/` is the main AgentryX tenant/platform application. It combines:

| Area               | Responsibility                                                                                                                                                                                                                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant-facing app  | Public landing, tenant registration/payment, protected tenant workspace, dynamic module tabs, dynamic left navigation, datasource setup, credential setup, intents, policies, validation rules, users, RBAC view, API keys, connected inboxes, playground, subscription details, and subscribe/checkout. |
| Platform/admin app | Platform-side tenant creation, client management, module setup, module groups, client-side left nav setup, datasource type registry, admin user management, and superadmin-only subscription detail screens.                                                                                             |
| Backend            | FastAPI service that owns tenant/account creation, Keycloak integration, Kill Bill integration, role and permission checks, EIVS tables, Vault credential operations, module/sidebar APIs, API keys, users, email inboxes, and tenant purge.                                                             |
| Infrastructure     | Docker Compose for FlowEngine backend, Postgres, Vault, Keycloak, tenant UI, admin UI, Kill Bill, KillBill gateway, catalog bootstrap, and optional/commented services such as Kaui, Metabase, Mautic, and Kill Bill admin/portal helper UIs.                                                            |
| Billing            | Runtime billing and subscription truth comes from Kill Bill through the gateway. Tenant module visibility and permission checks are expected to respect active Kill Bill subscriptions.                                                                                                                  |

`KillBill/` is the companion billing support folder. It contains the Kill Bill product catalog, PowerShell scripts for setup/testing, a Node/Express gateway, webhook/reminder/payment helpers, and compatibility code. In the unified local runtime, the active Kill Bill server and gateway are launched from `FlowEngine2.0/docker-compose.yml`; the standalone `KillBill/docker-compose.yml` was intentionally retired/removed so local orchestration is not split between two compose files.

### Runtime Boundaries And Ports

| Service                      | Current local purpose                                                                                                                                                                                                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenant-ui`                  | Tenant-facing React/Vite app, served on `http://localhost:3000`.                                                                                                                                                                                                                                                 |
| `admin-ui`                   | Platform/admin React/Vite app, served on `http://localhost:5173` when mapped by compose.                                                                                                                                                                                                                         |
| `app` / FlowEngine backend   | FastAPI API service, internally reachable by the UIs and gateway.                                                                                                                                                                                                                                                |
| `flowengine-postgres-2`      | FlowEngine Postgres database with `auth` and `eivs` schemas from `init_schema.sql`.                                                                                                                                                                                                                              |
| `flowengine-vault-2`         | Vault for datasource/email credentials. Requires initialization/unseal when volumes are recreated.                                                                                                                                                                                                               |
| `flowengine-keycloak`        | Keycloak auth server, realm currently configured by env/realm export.                                                                                                                                                                                                                                            |
| `killbill-server`            | Kill Bill billing server.                                                                                                                                                                                                                                                                                        |
| `killbill-gateway`           | Node gateway that wraps Kill Bill, payment providers, usage, reminders, and product sync.                                                                                                                                                                                                                        |
| `killbill-catalog-bootstrap` | One-shot container that waits for Kill Bill and uploads the catalog automatically.                                                                                                                                                                                                                               |
| Optional/commented services  | Kaui, Metabase, Mautic, Kill Bill admin UI, and legacy billing helper UIs are intentionally included as commented compose blocks, not active by default. The admin UI still shows `Tools` links for Metabase and Mautic so those tools are easy to open after the services are manually uncommented and started. |

### FlowEngine Authentication, Roles, And Access Control

FlowEngine has two sides:

| Side                  | Who uses it                                                            | Main auth behavior                                                                                                                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant/client side    | Tenant admins, tenant co-admins, tenant module users, tenant API users | Uses Keycloak browser login or custom registration. The React app receives/refreshes app tokens and calls protected APIs. Tenant module access is filtered by both active Kill Bill subscription and assigned module/sidebar permissions. |
| Platform/company side | Superadmin and platform admins                                         | Uses admin auth. Platform admins can manage most platform configuration, while superadmin-only screens include admin-user management and subscription detail/billing areas.                                                               |

Important role behavior implemented in code:

| Role                 | Behavior                                                                                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `superadmin`         | Platform owner. Can access superadmin-only admin pages and billing/subscription detail pages.                                                                                                                                                           |
| `admin`              | Platform/company admin. Can access platform operational pages such as clients, modules, client-side left nav setup, datasource types, and module groups, but superadmin-only admin tabs and subscription detail tabs should remain hidden/restricted.   |
| `tenant_admin`       | Tenant owner/admin. Can access tenant module features when the tenant has an active Kill Bill subscription for the module.                                                                                                                              |
| `tenant_co_admin`    | Tenant co-admin. Shares tenant-level access where allowed by backend permission checks.                                                                                                                                                                 |
| `tenant_module_user` | Restricted tenant user. Sees only module/sidebar items assigned to that user through Keycloak module attributes and active subscriptions. Sidebar items with `hidden_from_module_user = true` must be hidden, not merely shown and blocked after click. |
| `tenant_api`         | API-facing tenant identity. The middleware contains API-key related structures, but direct API-key fallback is disabled in `get_tenant_context`; normal tenant APIs require bearer/session auth in the current code.                                    |

The permission middleware checks the token/session, tenant context, role, and feature. For tenant-facing feature routes, it calls the KillBill gateway to verify active subscription state before allowing module access. This is intentional because module assignment alone is not sufficient if the paid/free subscription is cancelled, paused, or otherwise inactive.

### FlowEngine Module, Sidebar, And Navigation Model

The module/sidebar model is easy to misunderstand, so this is the precise current behavior:

| Concept                          | Source table/code                            | Meaning                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Module                           | `auth.modules`                               | A product module that may be assigned/subscribed to by a tenant. It stores metadata such as name, description, icon, version, status, features, default permissions, display order, group, `free_plan`, `trial_weeks`, API-call allowance, assigned `sidebar_items`, and optional `external_url`. There is no `modules.type` column in the schema. |
| External module behavior         | `auth.modules.external_url`                  | If a module has an external URL, the tenant shell can render/open the external module. The external behavior is module-level and is controlled by URL, not by a module `type` column.                                                                                                                                                              |
| Sidebar item                     | `auth.sidebar_items`                         | A platform-defined tenant left-nav item. It has `value`, `label`, `icon`, `href`, `type`, `nav_section`, `open_mode`, `hidden_from_module_user`, status, and display order.                                                                                                                                                                        |
| Sidebar item type                | `auth.sidebar_items.type`                    | The `internal`/`external` distinction belongs to sidebar items. `internal` items route inside the tenant React app; `external` items can use an external `href` and `open_mode`.                                                                                                                                                                   |
| Sidebar primary/more behavior    | `auth.sidebar_items.nav_section`             | `primary` items render directly in the tenant left nav without showing the word "Primary". `more` items render under the visible `More` expander.                                                                                                                                                                                                  |
| Hidden-from-module-user behavior | `auth.sidebar_items.hidden_from_module_user` | Items flagged true are hidden for `tenant_module_user`; they can still be visible to tenant admins/co-admins when assigned and allowed.                                                                                                                                                                                                            |
| Tenant sidebar rendering         | `TenantWorkspaceProvider` and `AppShell`     | The tenant UI loads `/portal/my-modules` and `/portal/sidebar-items`, computes the active module, filters the sidebar to that module's assigned item values, filters hidden module-user items, groups into primary/more, and routes internal items through the tenant route map.                                                                   |
| Subscription truth               | Kill Bill via gateway                        | `/portal/my-modules` and backend permission checks are expected to reflect active Kill Bill module subscriptions. Cancelling a module subscription should remove that module from tenant navigation after refresh/state reload.                                                                                                                    |

### FlowEngine Tenant Account Creation Flows

All tenant account creation paths converge through backend account creation service logic:

| Flow                                         | Entry point                                                             | Current behavior                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant self-registration with email/password | Tenant UI `/register` calls backend `/auth/register`                    | Creates a Keycloak user, assigns tenant role, stores tenant attributes, creates a Kill Bill account through the gateway, attempts free/basic subscriptions for selected modules, creates tenant milestone state, generates API key, and sends verification/invite email through configured SMTP/Keycloak behavior.                                      |
| Tenant Google/Keycloak registration callback | Keycloak callback `/auth/keycloak/callback` and backend account service | Uses Keycloak federated user data, maps tenant attributes, creates/updates tenant context, creates Kill Bill account, and assigns module subscription where selected. Google identity provider setup is bootstrapped by `infra/keycloak/bootstrap-google-idp.py`.                                                                                       |
| Platform-created tenant                      | Admin UI `/register` calls backend `/api/accounts`                      | Superadmin/admin creates a tenant account on behalf of a client. Backend creates the Keycloak tenant admin, sends a set-password/verification style email where configured, creates Kill Bill account, creates selected free/basic subscriptions, milestone, and API key.                                                                               |
| Tenant module subscription later             | Tenant UI `/app/checkout` and backend portal/module APIs                | Tenant chooses an available module/plan and subscribes/adds the module. The UI refreshes tenant auth/module state after success so dynamic module navigation can update.                                                                                                                                                                                |
| Account deletion                             | Admin UI client management calls `/api/accounts/{email}` delete         | Backend resolves the tenant, purges FlowEngine tenant-owned records and Vault paths through tenant purge code, deletes/removes Keycloak user state, and coordinates with Kill Bill where implemented. Exact Kill Bill customer hard-delete behavior should be verified against Kill Bill API state before relying on it as permanent customer deletion. |

Important current edge behavior:

| Case                      | Current behavior or limitation                                                                                                                                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Zero module selection     | Backend account creation can create the account even if zero modules are selected, depending on caller payload. If zero modules are assigned/subscribed, tenant navigation should be empty because modules are the source of truth for sidebar visibility.                                                   |
| Missing free/basic plan   | If a selected module has no matching free/basic plan in Kill Bill/gateway plan data, module subscription creation can fail or be skipped depending on backend branch. The user-facing registration/subscription UI should surface this clearly; it is not safe to assume every module has a valid free plan. |
| Kill Bill startup/caching | After `docker compose down -v`, Kill Bill and Keycloak are slow to become fully ready. Bootstrap services must wait for real readiness, not container-created status. Catalog bootstrap is required after volume reset and is automated through compose.                                                     |
| Email delivery            | SMTP settings in `.env` must be valid. Some account/user flows treat email sending as best-effort after the main user record exists, so a send timeout may not always mean the account was not created.                                                                                                      |

### FlowEngine Tenant UI Routes And Page Behavior

Tenant React routes are defined under `FlowEngine2.0/frontend/tenant/src/app/TenantRouter.jsx`:

| Route                     | Page                 | Functional behavior                                                                                                                                                                                                                                                                                                           |
| ------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                       | Landing page         | Public landing page copied from legacy landing content and restyled into the tenant React app. The old useless "Continue to app" CTA was removed.                                                                                                                                                                             |
| `/landing`                | Redirect             | Redirects to `/`.                                                                                                                                                                                                                                                                                                             |
| `/register`               | Register page        | Custom registration UI. Loads public modules, collects tenant/company/admin/password/module choices, submits to backend registration, and supports payment/checkout flow where applicable.                                                                                                                                    |
| `/payment`                | Payment page         | Payment verification/continuation screen tied to the registration/payment flow.                                                                                                                                                                                                                                               |
| `/app`                    | Dashboard/overview   | Protected tenant landing. Shows tenant/module overview, status cards, setup guidance, and navigation shortcuts such as Subscription Details and datasource setup.                                                                                                                                                             |
| `/app/datasources`        | Datasources          | Type-ahead/search list, datasource type picker with real logos where mapped, datasource CRUD, active flag, query/data mode, setup links, details actions, and credential/config guidance.                                                                                                                                     |
| `/app/datasource-configs` | Datasource configs   | Configuration CRUD for datasource connection metadata, driver/protocol fields, JDBC/host/database/schema/warehouse-style fields, active flags, JSON config zones, test connection action, and validation that configs connect to existing datasources.                                                                        |
| `/app/credentials`        | Setup credentials    | Type-ahead datasource selection, blocks credential setup when datasource config is missing, saves Vault credentials only through the credential gateway, fetches metadata through the modal/action path, and stores/uses Vault path through datasource config. Email inbox credentials are intentionally not configured here. |
| `/app/intents`            | Intents              | Tenant CRUD for intent definitions, language/query metadata, datasource/config associations, and navigation into policy/rule setup.                                                                                                                                                                                           |
| `/app/intent-policies`    | Intent policies      | Tenant CRUD for language-specific prompt/policy text for each intent, including create/edit/delete and selection by intent/language.                                                                                                                                                                                          |
| `/app/rules`              | Validation rules     | Tenant CRUD for validation rules, execution order lookup, active flag, severity/status fields, and intent/language-specific listing.                                                                                                                                                                                          |
| `/app/users`              | Users                | Tenant user CRUD for co-admin/module-user style users, module assignment, invite/set-password behavior, status changes, and delete.                                                                                                                                                                                           |
| `/app/roles`              | Roles                | Displays backend RBAC roles exposed by `/rbac/roles`.                                                                                                                                                                                                                                                                         |
| `/app/api-keys`           | API keys             | Tenant API key generation/list/current-key/revoke flows through `/portal/api-keys`.                                                                                                                                                                                                                                           |
| `/app/connected-inboxes`  | Connected inboxes    | Email inbox CRUD, provider selection, credential test/save through email-inbox credential gateway endpoints, and sync-log metadata.                                                                                                                                                                                           |
| `/app/playground`         | Playground           | Lets tenant choose operation mode such as SQL/Data and run a configured query/data operation. Current frontend run helper calls `/demo/execute`; this endpoint must be verified in the active backend/gateway before treating playground execution as fully wired.                                                            |
| `/app/billing`            | Subscription details | Tenant subscription overview, subscription list, invoices, payment methods, usage, health/status views, and filters including the default "All" option.                                                                                                                                                                       |
| `/app/checkout`           | Subscribe            | Lets tenant choose a module/plan and subscribe/add a module. The page is intentionally named Subscribe in the UI, not Checkout.                                                                                                                                                                                               |

Tenant UI details that are centrally styled:

| UI behavior            | Implementation intent                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Light enterprise theme | Centralized design tokens/CSS variables in tenant UI theme files. Colors should be changed in the central theme layer rather than hardcoded per component.      |
| Typography             | Central typography tokens and global CSS define the FlowEngine look. Later modules were visually aligned to this design without importing code from FlowEngine. |
| Buttons/tooltips       | Buttons are expected to use reusable button/tooltip patterns so every button can show a hover tooltip and consistent interaction states.                        |
| Notifications          | Toast/notification behavior is expected to auto-dismiss and remain visible/sticky enough for long forms.                                                        |
| Responsive forms       | Form rows should wrap rather than compress unreadably; datasource/config/intent/rule/user forms use compact enterprise spacing.                                 |

### FlowEngine Admin UI Routes And Page Behavior

Admin React routes are defined in `FlowEngine2.0/frontend/admin/src/App.jsx`:

| Route                           | Visibility           | Functional behavior                                                                                                                                                                                                           |
| ------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                             | Admin app            | Redirects to `/register`.                                                                                                                                                                                                     |
| `/register`                     | Admin and superadmin | Platform-side tenant creation form. Loads modules, collects tenant/admin details, posts to `/api/accounts`, and triggers Keycloak/KillBill/API-key setup through backend.                                                     |
| `/clients`                      | Admin and superadmin | Client/tenant list, search, detail, edit/upgrade, delete, and API key lookup.                                                                                                                                                 |
| `/modules`                      | Admin and superadmin | Platform module CRUD. Configures module metadata, default/free/trial/API-call fields, group assignment, assigned sidebar items, optional `external_url`, and KillBill product sync on create/update/delete.                   |
| `/sidebar-items`                | Admin and superadmin | Renamed in UI to "Client Side Left Nav Set Up". Creates/edits/deletes tenant nav items, including `value`, label, icon, href, item type, primary/more section, open mode, hidden-from-module-user, status, and display order. |
| `/admins`                       | Superadmin only      | Platform admin user CRUD. Hidden from normal admins.                                                                                                                                                                          |
| `/datasource-types`             | Admin and superadmin | Supported datasource driver registry. Admin can access this; normal tenant users cannot. Manages driver definitions and aliases used by tenant datasource type picker and datasource config defaults.                         |
| `/module-groups`                | Admin and superadmin | Module group CRUD for grouping module tabs/navigation.                                                                                                                                                                        |
| `/billing/dashboard`            | Superadmin only      | Subscription detail dashboard. Hidden from normal admins.                                                                                                                                                                     |
| `/billing/customers`            | Superadmin only      | KillBill customer/account subscription information.                                                                                                                                                                           |
| `/billing/customers/:accountId` | Superadmin only      | Customer detail page.                                                                                                                                                                                                         |
| `/billing/subscriptions`        | Superadmin only      | Subscription listing/management view.                                                                                                                                                                                         |
| `/billing/payments`             | Superadmin only      | Payment records/status view.                                                                                                                                                                                                  |
| `/billing/revenue`              | Superadmin only      | Revenue analytics view.                                                                                                                                                                                                       |
| `/billing/config`               | Superadmin only      | Billing/gateway configuration view.                                                                                                                                                                                           |
| `/billing/plans`                | Superadmin only      | Plan/product pricing management.                                                                                                                                                                                              |

The admin sidebar also contains a `Tools` group with external links to Metabase at `http://localhost:3003` and Mautic at `http://localhost:3004`. These are navigation links only. The Docker services for Metabase, Mautic DB, and Mautic remain commented out in `FlowEngine2.0/docker-compose.yml`, so the links will open only after those optional services are intentionally enabled.

### FlowEngine Backend Endpoint Catalog

All FlowEngine endpoints are served by `FlowEngine2.0/backend/main.py` and module routers:

| Module               | Endpoints                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Health/root          | `GET /`, `GET /health`. Root redirects to configured admin hub URL.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Keycloak callback    | `GET /auth/keycloak/callback`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Auth                 | `POST /auth/logout`, `POST /auth/refresh`, `POST /auth/register`, `GET /auth/me`, `POST /auth/payment/verify`, `POST /auth/upgrade-to-production`, `POST /auth/user-token`, `POST /auth/token`, `GET /auth/billing-token`, `GET /auth/billing-verify`.                                                                                                                                                                                                                                                                         |
| Accounts             | `GET /api/modules`, `POST /api/accounts`, `GET /api/accounts`, `GET /api/accounts/{email}`, `DELETE /api/accounts/{email}`, `PATCH /api/accounts/{email}/upgrade`, `PATCH /api/accounts/{email}/edit`, `GET /api/accounts/{email}/apikey`, `GET /api/public/modules`.                                                                                                                                                                                                                                                          |
| Platform admins      | `POST /admin/auth/logout`, `GET /admin/auth/me`, `POST /admin/admins`, `GET /admin/admins`, `PATCH /admin/admins/{admin_id}`, `DELETE /admin/admins/{admin_id}`.                                                                                                                                                                                                                                                                                                                                                               |
| Modules              | `GET /admin/modules`, `GET /admin/modules/default`, `GET /admin/modules/public/list`, `GET /admin/modules/public/list-all`, `GET /admin/modules/{module_id}`, `POST /admin/modules`, `PATCH /admin/modules/{module_id}`, `DELETE /admin/modules/{module_id}`, `GET /admin/modules/tenant/{tenant_id}`, `POST /admin/modules/tenant/{tenant_id}/assign`, `DELETE /admin/modules/tenant/{tenant_id}/module/{module_id}`.                                                                                                         |
| Tenant module portal | `GET /portal/my-modules`, `GET /portal/available-modules`, `POST /portal/add-module`.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Sidebar items        | `GET /admin/sidebar-items`, `GET /admin/sidebar-items/{item_id}`, `POST /admin/sidebar-items`, `PATCH /admin/sidebar-items/{item_id}`, `DELETE /admin/sidebar-items/{item_id}`, `GET /portal/sidebar-items`.                                                                                                                                                                                                                                                                                                                   |
| Module groups        | `GET /admin/module-groups`, `GET /admin/module-groups/{group_id}`, `POST /admin/module-groups`, `PATCH /admin/module-groups/{group_id}`, `DELETE /admin/module-groups/{group_id}`.                                                                                                                                                                                                                                                                                                                                             |
| Datasource types     | `GET /admin/datasource-types/public`, `GET /admin/datasource-types`, `GET /admin/datasource-types/{driver_id}`, `POST /admin/datasource-types`, `PATCH /admin/datasource-types/{driver_id}`, `DELETE /admin/datasource-types/{driver_id}`, `GET /admin/datasource-types/{driver_id}/aliases`, `POST /admin/datasource-types/{driver_id}/aliases`, `DELETE /admin/datasource-types/aliases/{alias_id}`.                                                                                                                         |
| Datasources/configs  | `GET /datasources`, `GET /datasources/{datasource_id}`, `POST /datasources`, `PUT /datasources/{datasource_id}`, `DELETE /datasources/{datasource_id}`, `GET /datasource-configs`, `GET /datasource-configs/by-name/{name}`, `GET /datasource-configs/driver/{driver_family}`, `GET /datasource-configs/protocol/{protocol}`, `GET /datasource-configs/{config_id}`, `POST /datasource-configs`, `PUT /datasource-configs/{config_id}`, `DELETE /datasource-configs/{config_id}`, `POST /datasource-configs/{config_id}/test`. |
| Credential gateway   | `GET /flowengine/datasources`, `POST /test-connection`, `PUT /save-credentials`, `DELETE /vault/delete`, `POST /email-inbox/test-connection`, `PUT /email-inbox/save-credentials`, `POST /credentials/metadata-confirmed`.                                                                                                                                                                                                                                                                                                     |
| Email inboxes        | `GET /api/email-inboxes`, `GET /api/email-inboxes/{inbox_id}`, `POST /api/email-inboxes`, `PUT /api/email-inboxes/{inbox_id}`, `DELETE /api/email-inboxes/{inbox_id}`, `POST /api/email-inboxes/{inbox_id}/test`, `GET /api/email-inbox-types`.                                                                                                                                                                                                                                                                                |
| Intents and policies | `GET /intents`, `GET /intents/policies/all`, `GET /intents/policies`, `GET /intents/{intent_id}/policies`, `POST /intents/{intent_id}/policies`, `GET /intents/{intent_id}/policies/{language_code}`, `PUT /intents/{intent_id}/policies/{language_code}`, `DELETE /intents/{intent_id}/policies/{language_code}`, `GET /intents/{intent_id}`, `POST /intents`, `PUT /intents/{intent_id}`, `DELETE /intents/{intent_id}`.                                                                                                     |
| Validation rules     | `GET /validation-rules`, `GET /validation-rules/{rule_id}`, `GET /validation-rules/intent/{intent_id}/language/{language_code}`, `GET /validation-rules/next-order/{intent_id}`, `POST /validation-rules`, `PUT /validation-rules/{rule_id}`, `DELETE /validation-rules/{rule_id}`.                                                                                                                                                                                                                                            |
| Tenant users         | `POST /users`, `GET /users`, `GET /users/{user_id}`, `PATCH /users/{user_id}`, `DELETE /users/{user_id}`.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| RBAC                 | `GET /rbac/roles`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| API keys             | `POST /portal/api-keys/generate`, `GET /portal/api-keys`, `GET /portal/api-keys/me`, `DELETE /portal/api-keys`.                                                                                                                                                                                                                                                                                                                                                                                                                |
| Tenant purge         | Internal/admin tenant purge route under `/admin/tenants/...`; used during account deletion/cleanup.                                                                                                                                                                                                                                                                                                                                                                                                                            |

### FlowEngine Database And Seeded Data

`FlowEngine2.0/init_schema.sql` creates the following schemas and tables:

| Schema/table              | Purpose                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.tenant_milestones`  | Tracks tenant onboarding/first-login milestone state.                                                                                                                                       |
| `auth.module_groups`      | Platform-defined grouping for module tabs/navigation.                                                                                                                                       |
| `auth.modules`            | Module product catalog used by admin UI, tenant module tabs, registration, and subscription mapping. Includes `external_url`, not a module `type` column.                                   |
| `auth.api_clients`        | Tenant API key/client records.                                                                                                                                                              |
| `auth.sidebar_items`      | Platform-defined client-side left-nav items, including internal/external item type, primary/more section, open mode, and hidden-from-module-user flag.                                      |
| `eivs.datasources`        | Tenant datasource records with name/type/mode/status and connection-key metadata.                                                                                                           |
| `eivs.datasource_configs` | Datasource connection/config rows, including driver/protocol fields, connection metadata, Vault path/credential status, active flags, schema metadata, and last metadata fetch status/time. |
| `eivs.intents`            | Tenant intent records.                                                                                                                                                                      |
| `eivs.intent_policies`    | Language-specific policies/prompts for intents.                                                                                                                                             |
| `eivs.validation_rules`   | Tenant validation rules with order/severity/language/intent association.                                                                                                                    |
| `eivs.email_inboxes`      | Tenant email inbox connection records.                                                                                                                                                      |
| `eivs.email_sync_logs`    | Email inbox sync result history.                                                                                                                                                            |
| `eivs.driver_definitions` | Supported datasource type registry shown by tenant datasource picker and administered by platform datasource type page.                                                                     |
| `eivs.driver_aliases`     | Aliases for datasource driver matching/search.                                                                                                                                              |

The seeded sidebar values include `dashboard`, `datasources`, `datasource-configs`, `intents`, `intent-policies`, `validation-rules`, `vault`, `playground`, `users`, `rbac`, `api-keys`, and `connected-inboxes`. The seeded "more" section includes items such as playground, users, RBAC, API keys, and connected inboxes. User/RBAC/API key style items are hidden from `tenant_module_user` by seed flags.

Supported datasource types are seeded through `eivs.driver_definitions` and `eivs.driver_aliases`. The tenant UI should load this registry instead of hardcoding supported datasource behavior, and datasource logos are mapped in frontend metadata for known products with a fallback when no logo mapping exists.

### FlowEngine Configuration

Key configuration comes from `.env` and `.env.example`:

| Variable area         | Meaning                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| App identity          | `APP_NAME`, `APP_VERSION`, `DEBUG`, `ENVIRONMENT`, cookie/domain settings.                                                                        |
| Database              | `DATABASE_URL`.                                                                                                                                   |
| JWT/session           | `JWT_SECRET`, `JWT_ALGORITHM`, `JWT_TTL_HOURS`, password token TTL.                                                                               |
| Frontend URLs         | `FRONTEND_BASE_URL`, `ADMIN_HUB_URL`, `ADMIN_UI_URL`, `PORTAL_URL`.                                                                               |
| SMTP/email            | SMTP host, port, username, password, from address/name, TLS flags. Needed for verification/invite emails.                                         |
| Vault                 | `VAULT_ADDR`, `VAULT_TOKEN`, secret path/config. Must match initialized Vault token/path.                                                         |
| Keycloak              | Server URL, realm, client id/secret, admin credentials. Current client naming is AgentryX-oriented; realm naming must match realm export and env. |
| Google OAuth          | Google client id/secret and bootstrap values consumed by Keycloak IDP bootstrap.                                                                  |
| Kill Bill             | KillBill server URL, gateway URL, admin credentials, tenant API key/secret, catalog/product settings.                                             |
| Payments              | Razorpay/Stripe keys where enabled by gateway/UI.                                                                                                 |
| Optional integrations | Gmail, Mautic, broker settings, Groq key where code paths reference AI.                                                                           |

### KillBill Folder Details

`KillBill/` contains billing artifacts and helpers:

| Path                                    | Role                                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `catalog.xml`                           | Kill Bill XML catalog defining products/plans/phases used by billing and module subscription flows.                                                                                                    |
| `00-setup.ps1` through numbered scripts | PowerShell operational scripts for setup, catalog upload, test account/subscription creation, usage/event/payment checks, upgrade tests, invoice checks, webhook tests, and complete-script execution. |
| `gateway/`                              | Node/Express billing gateway source, package manifest/lockfile, Dockerfile, local SQLite/storage helpers, Kill Bill proxy/sync/payment/reminder/webhook logic.                                         |
| `server.js`                             | Standalone helper/admin server retained in the folder. Not the primary UI after FlowEngine tenant/admin UI consolidation.                                                                              |
| `webhook-listener.js`                   | Basic webhook listener/helper code.                                                                                                                                                                    |
| `README.md` and `RUNBOOK.md`            | Folder-level documentation and operating guide.                                                                                                                                                        |

KillBill gateway endpoint categories include plan/module discovery, plan CRUD, gateway config, Kill Bill webhooks, webhook registration/test, reminder email sending/test, usage ingestion and summaries, payment recording and summaries, Razorpay order creation, Stripe payment intent/confirmation, reminder cron trigger, Kill Bill product sync/update/delete, and proxy access to Kill Bill API paths where configured.

Known KillBill/FlowEngine integration points:

| Flow                     | Behavior                                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog bootstrap        | `FlowEngine2.0/infra/killbill/bootstrap-catalog.sh` and the compose one-shot service wait for Kill Bill readiness and upload the catalog after a fresh volume reset.                                                                  |
| Product sync             | FlowEngine module create/update/delete calls the gateway product endpoints so module products and billing products do not drift.                                                                                                      |
| Account creation         | FlowEngine account service calls the gateway/Kill Bill account endpoint with tenant external key mapping.                                                                                                                             |
| Subscription creation    | FlowEngine account/subscription flows use plan data from the gateway and call Kill Bill subscription APIs using fields Kill Bill accepts, especially `planName`, not unsupported fields such as `planId` in the subscription payload. |
| Subscription enforcement | Tenant module visibility and permission middleware depend on active Kill Bill subscription state, not only local module assignment.                                                                                                   |

Main FlowEngine middleware integration points still pending:

| Tenant UI area | Required production behavior | Current documented status |
| -------------- | ---------------------------- | ------------------------- |
| Setup Credentials page | The Test Connection button must call middleware to test the real datasource connection using the selected datasource/config/credential context. Save and Fetch Metadata must call middleware that connects to the real datasource, fetches schema/metadata, updates the datasource configuration metadata path/state, and persists credentials only according to the datasource mode. | The current UI has the buttons/flows, but the metadata-confirmed or proxy yes/no confirmation behavior is a testing shortcut. It must not be treated as proof that middleware connected to a real datasource and fetched metadata. |
| Playground page | Tenants should be able to write a query to fetch data or write a prompt to generate a query. The Run button must call middleware that generates the query where needed, executes against the selected live datasource using stored configuration/credentials, and returns real-time results. | The tenant frontend currently targets `/demo/execute`; the active FlowEngine backend route list does not include that endpoint, so this remains demo/unverified until middleware/API wiring is completed. |
| Datasources sub-tabs | Buttons such as Full Refresh, Lite Refresh, Check Drift, Profile, and Principal Context Preview should call middleware only when those middleware capabilities really exist. | These buttons are not mandatory production features by themselves. They should be hidden, renamed, repurposed, or wired based on the actual middleware feature set rather than preserved as unsupported actions. |

### Group 1 Known Gaps And Verification Notes

| Item                             | Current status                                                                                                                                                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Setup Credentials middleware gap | The tenant Setup Credentials page has Test Connection, Save, Fetch Metadata, and metadata confirmation flows. Production behavior should call middleware for the real datasource connection test and for real metadata extraction, then update Vault/config metadata based on the middleware result. The current metadata-confirmed/proxy yes-no confirmation path is a testing shortcut and should not be treated as proof that metadata was fetched from a real datasource. |
| Playground execution endpoint    | Tenant frontend references `/demo/execute`; the active FlowEngine backend route list does not show that endpoint. Verify whether a gateway/proxy or another service supplies it before relying on playground execution as complete. |
| Playground middleware gap        | The tenant Playground should let users either write a query to fetch live datasource data or write a prompt to generate a query. The Run button should call middleware that generates SQL where needed, executes against the selected real datasource using stored config/credentials, and returns live results. The current `/demo/execute` path is still demo/unverified. |
| Datasource sub-tab action gap    | Datasource sub-tab buttons such as Full Refresh, Lite Refresh, Check Drift, Profile, and Principal Context Preview should be aligned with real middleware capabilities. They are not mandatory features by themselves; unsupported buttons should be hidden, renamed, or repurposed rather than documented as complete functionality. |
| Kill Bill customer hard deletion | Tenant deletion purges FlowEngine-owned records and Keycloak user state. Confirm exact Kill Bill account/customer deletion or cancellation behavior against a running Kill Bill instance before promising hard deletion semantics.  |
| Email reliability                | SMTP must be valid and reachable. Some user/account creation flows can succeed while email delivery times out or fails.                                                                                                             |
| Vault after `down -v`            | Vault must be initialized/unsealed and `.env` must contain the live token. This is an operational step, not an automatic app behavior unless a future bootstrap automates Vault initialization.                                     |
| Realm naming                     | Runtime must keep Keycloak realm, client id, redirect URLs, `.env`, and realm export aligned. If the realm name changes, all references must be changed together.                                                                   |

## Group 2: Template Builder

### System Role

`TemplateBuilder/` is a standalone document template studio. It is not a FlowEngine sub-app and does not import FlowEngine code. Its UI was visually reskinned to match the FlowEngine design system, but its routes, text, operations, API calls, and backend behavior remain its own.

Template Builder is made of:

| Area                                      | Responsibility                                                                                                                                                                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `template-builder-ui/`                    | Primary React/Vite frontend. Provides the document studio shell, template list, prebuilt templates, editor, placeholder registry, marketplace, audit log, and generated documents pages.                                                 |
| `template-builder-engine/`                | FastAPI backend engine, migrations, render/document generation APIs, placeholder registry APIs, template APIs, AI helper endpoints, datasource context, marketplace APIs, import APIs, tests APIs, worker code, and demo datasource SQL. |
| `template-builder-engine/frontend/`       | Older/minimal frontend experiment with TemplateList/TemplateEditor components and UI service helpers. It is present in the repo but the active UI is `template-builder-ui/`.                                                             |
| `template-builder-engine/sql/kasetti-db/` | Demo domain schemas/data for banking, finance, health, insurance, and manufacturing.                                                                                                                                                     |
| `template-builder-engine/db/migrations/`  | Template Builder Postgres schema initialization.                                                                                                                                                                                         |

### Template Builder Frontend Routes And UI Behavior

Routes are defined in `TemplateBuilder/template-builder-ui/src/App.tsx`:

| Route                    | Page                 | Functional behavior                                                                                                                                                  |
| ------------------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                      | Redirect             | Redirects to `/templates`.                                                                                                                                           |
| `/templates`             | Templates page       | Lists templates, supports create/import/search/filter/navigation/delete actions, status summaries, and opens editor pages.                                           |
| `/templates/prebuilt`    | Prebuilt templates   | Shows prebuilt/demo template offerings and related actions while preserving existing labels/copy.                                                                    |
| `/templates/:id`         | Editor page          | Full document template editor shell with top bar, block canvas, placeholder palette, inspector, preview, generate panel, tests panel, AI tools, and version history. |
| `/registry/placeholders` | Placeholder registry | CRUD for reusable placeholders, sample values, datasource SQL configuration/testing, filters, and create/edit dialogs.                                               |
| `/marketplace`           | Marketplace          | Lists/publishes/imports/rates/deletes marketplace items for templates, blocks, or placeholders where backend supports the item type.                                 |
| `/audit`                 | Audit log            | Lists audit events with filters/expandable details.                                                                                                                  |
| `/documents`             | Documents            | Lists generated render jobs, supports detail/download/view/delete and navigation back to template creation/generation.                                               |

Template Builder UI component categories:

| Component area    | Purpose                                                                                                                                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layout            | `AppLayout` owns the left nav/header/page shell. The sidebar heading is visually styled but should not change navigation behavior.                                                                                                     |
| Shared components | Status badges, error alerts, loading spinners, modals/panels/buttons/cards used across pages.                                                                                                                                          |
| Editor components | Block canvas, editor top bar, placeholder palette, preview pane, inspector panel, generate panel, tests panel, version history panel, and AI tools panel. These coordinate editor actions but should not change backend payload shape. |
| Import components | Import modal supports file and URL import paths and navigates to the created template.                                                                                                                                                 |
| API clients       | `src/api/*.ts` centralize calls to backend endpoints. Styling work should not alter these clients unless a functional bug is explicitly requested.                                                                                     |
| Styles            | `src/styles/*.css`, `src/index.css`, and `src/App.css` contain visual theme alignment.                                                                                                                                                 |
| Tests             | Jest/RTL tests cover app routing, layout, templates page, editor page, placeholder registry, marketplace, documents, and audit log.                                                                                                    |

### Template Builder Backend Endpoint Catalog

Active routers are included in `TemplateBuilder/template-builder-engine/backend/src/main.py`:

| API area             | Endpoints                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health/debug         | `GET /_debug/routes`, `GET /healthz`, `GET /v1/healthz`.                                                                                                                                                                                                                                                                                                                                                                                      |
| Templates            | `POST /v1/templates`, `GET /v1/templates`, `GET /v1/templates/{template_id}`, `PUT /v1/templates/{template_id}`, `DELETE /v1/templates/{template_id}`, `POST /v1/templates/{template_id}/publish`, `POST /v1/templates/{template_id}/revert-to-draft`, `GET /v1/templates/{template_id}/versions`, `GET /v1/templates/{template_id}/placeholders`, `POST /v1/templates/{template_id}/placeholders`, `GET /v1/templates/{template_id}/inputs`. |
| Blocks               | `GET /v1/blocks/`, `POST /v1/blocks/`, `GET /v1/blocks/{block_id}`, `DELETE /v1/blocks/{block_id}`.                                                                                                                                                                                                                                                                                                                                           |
| Placeholder registry | `POST /v1/registry/placeholders`, `GET /v1/registry/placeholders`, `GET /v1/registry/placeholders/{registry_id}`, `PUT /v1/registry/placeholders/{registry_id}`, `DELETE /v1/registry/placeholders/{registry_id}`.                                                                                                                                                                                                                            |
| Datasources          | `GET /v1/datasources`, `POST /v1/datasources/test-sql`.                                                                                                                                                                                                                                                                                                                                                                                       |
| Render/documents     | `POST /v1/generate`, `POST /v1/documents/preview`, `POST /v1/documents/generate`, `GET /v1/documents/jobs`, `GET /v1/documents/jobs/{job_id}`, `GET /v1/documents/jobs/{job_id}/download`, `GET /v1/documents/{job_id}` alias, `GET /v1/documents/templates`, `DELETE /v1/documents/jobs/{job_id}`.                                                                                                                                           |
| Audit                | `GET /v1/audit/events`.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Marketplace          | `GET /v1/marketplace/`, `POST /v1/marketplace/`, `GET /v1/marketplace/{item_id}`, `POST /v1/marketplace/{item_id}/rate`, `POST /v1/marketplace/{item_id}/import`, `DELETE /v1/marketplace/{item_id}`.                                                                                                                                                                                                                                         |
| AI tools             | `POST /v1/ai/tools`, `POST /v1/ai/generate-sql`.                                                                                                                                                                                                                                                                                                                                                                                              |
| Tests                | `GET /v1/templates/{template_id}/tests`, `POST /v1/templates/{template_id}/tests`, `PUT /v1/templates/{template_id}/tests/{test_id}`, `DELETE /v1/templates/{template_id}/tests/{test_id}`, `POST /v1/templates/{template_id}/tests/{test_id}/run`, `POST /v1/templates/{template_id}/tests/run-all`.                                                                                                                                         |
| Import               | `POST /v1/templates/import/file`, `POST /v1/templates/import/url`.                                                                                                                                                                                                                                                                                                                                                                            |

### Template Builder Functional Flows

| Flow                           | End-to-end behavior                                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Template CRUD                  | UI creates or edits template metadata/layout/blocks, backend persists into `template_builder.templates`, and audit events are written for important changes.                                                  |
| Publish/revert/versioning      | Publishing creates a version snapshot in `template_builder.template_versions`; revert returns template status to draft. Version history UI reads version list and lets the user inspect historical snapshots. |
| Block editing                  | Editor page manipulates ordered content blocks. Backend block library endpoints support reusable block library records.                                                                                       |
| Placeholder registry           | Placeholder records store name/key/type/source/sample/SQL-like metadata. They can be attached to templates and resolved during preview/generation.                                                            |
| Datasource-backed placeholders | Datasource list/test-sql endpoints let placeholder SQL be tested against configured demo datasource context. Demo schemas are provided in Kasetti-style SQL files.                                            |
| Preview and generation         | Preview resolves placeholders and renders output preview. Generate creates a render job, writes output file metadata, and exposes job detail/download endpoints.                                              |
| Import from file/URL           | Import endpoints parse uploaded PDF/DOCX/HTML or remote URL content and create a new template record. URL support includes Google/Dropbox/OneDrive/direct URL style handling where implemented.               |
| Marketplace                    | Marketplace stores published items and lets the user import them back into templates/blocks/placeholders depending on item type.                                                                              |
| AI helpers                     | AI endpoints can transform content, translate, or generate SQL through configured LLM/Cohere/webhook behavior.                                                                                                |
| Tests                          | Template tests store inputs/expected output and can run individually or all together to validate rendering expectations.                                                                                      |

### Template Builder Data And Configuration

| Area                   | Details                                                                                                                                                                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Database schema        | `template-builder-engine/db/migrations/V1__init.sql` creates `template_builder` tables for templates, versions, blocks, placeholder registry/relations, render jobs, audit events, marketplace items, tests, plus supporting objects. It also includes minimal EIVS-style compatibility tables where used by datasource flows. |
| Demo data              | `template-builder-engine/sql/kasetti-db/*.sql` creates banking, finance, health, insurance, and manufacturing demo schemas and rows.                                                                                                                                                                                           |
| Environment            | Uses database URLs, Redis URL, Kasetti datasource URL, Cohere/API LLM variables, Google Translate key, LLM webhook URL, and UI `VITE_API_BASE`. Exact local values are intentionally kept out of Git.                                                                                                                          |
| Docker                 | `template-builder-engine/docker-compose.yml` runs backend/database/support services for the engine. UI is a separate Vite app.                                                                                                                                                                                                 |
| Generated/sample files | Sample generated PDFs such as `NOC_LN12345.pdf` and `NOC_LN99999.pdf` are checked in as fixtures/examples.                                                                                                                                                                                                                     |

### Template Builder Known Gaps And Verification Notes

| Item                                  | Current status                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two import modules                    | Both `import_routes.py` and `import_template.py` exist; `main.py` mounts the import router currently imported there. When changing import behavior, verify which implementation is active before editing.                                                                                                                                                     |
| Placeholder get/update implementation | `api/placeholders.py` has apparent current bugs: the single-placeholder GET path references an undefined `req` while writing an audit event, and GET/PUT paths call `result.mappings().first()` twice, which can consume the row and turn an existing row into a false "not found" or runtime error. This is documented as-is; it is not fixed by the README. |
| Old engine frontend                   | `template-builder-engine/frontend/` exists but is not the primary UI used after the Vite UI work.                                                                                                                                                                                                                                                             |
| LLM/webhook behavior                  | AI helpers depend on configured external services. If keys/webhook URLs are absent, behavior may degrade or fail based on each endpoint branch.                                                                                                                                                                                                               |
| Render fidelity                       | Document generation is functional through backend render/job APIs, but generated output quality must be verified with real templates and expected formats.                                                                                                                                                                                                    |

## Group 3: Prompt Builder

### System Role

`PromptBuilder/` is a standalone prompt authoring and execution studio. It is visually aligned to the FlowEngine design language but remains independent and does not import shared FlowEngine code.

| Area                     | Responsibility                                                                                                                                                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/`              | React/Vite TypeScript UI for prompt list, AI Studio, run console, test cases, run history, and audit log.                                                                                                                                     |
| `backend/`               | FastAPI backend with prompt CRUD, blocks, inputs, context bindings, output schema, versioning, publishing, rollback, test cases, evaluations, runs, audit, datasource context, AI tools, document-generation bridge, and database migrations. |
| `backend/kasetti-db/`    | Demo domain SQL for banking, finance, health, insurance, and manufacturing datasource examples.                                                                                                                                               |
| `backend/db/migrations/` | Prompt Builder schema initialization.                                                                                                                                                                                                         |

### Prompt Builder Frontend Routes And UI Behavior

Routes are defined in `PromptBuilder/frontend/src/App.tsx`:

| Route                  | Page                   | Functional behavior                                                                                                      |
| ---------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `/`                    | Redirect               | Redirects to `/prompts`.                                                                                                 |
| `/prompts`             | My Prompts             | Lists prompts, supports create/search/filter/open/duplicate/delete actions where wired.                                  |
| `/prompts/studio`      | Prompt Studio new/edit | Creates a new prompt or edits selected prompt structure.                                                                 |
| `/prompts/studio/:id`  | Prompt Studio detail   | Loads prompt detail, blocks, inputs, context bindings, schema, versions, tests, and editor state for an existing prompt. |
| `/prompts/run`         | Run Console            | Runs prompts with input/context, displays response/traces/status, and stores run history through backend.                |
| `/prompts/test-cases`  | Test Cases             | Manages prompt test cases and can execute tests/evaluations.                                                             |
| `/prompts/run-history` | Run History            | Lists and opens historical prompt runs.                                                                                  |
| `/audit`               | Audit Log              | Displays backend audit events.                                                                                           |

The sidebar labels, button wording, user label (`dev_user`), and all existing copy are functional/text artifacts and were intentionally preserved during visual reskinning.

### Prompt Builder Backend Endpoint Catalog

Active routers are included in `PromptBuilder/backend/src/main.py`:

| API area                   | Endpoints                                                                                                                                                                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Health/debug               | `GET /_debug/routes`, `GET /healthz`, `GET /v1/healthz`.                                                                                                                                                                                                                                                                 |
| AI                         | `POST /v1/ai/tools`, `POST /v1/ai/generate-sql`.                                                                                                                                                                                                                                                                         |
| Documents bridge           | `POST /v1/documents/preview`, `POST /v1/documents/generate`, `GET /v1/documents/jobs/{job_id}`, `GET /v1/documents/jobs/{job_id}/download`, `GET /v1/documents/jobs`, `GET /v1/documents/{job_id}` alias, `GET /v1/documents/templates`, `DELETE /v1/documents/jobs/{job_id}`.                                           |
| Datasources                | `GET /v1/datasources`, `POST /v1/datasources/test-sql`.                                                                                                                                                                                                                                                                  |
| Prompts                    | `POST /v1/prompts`, `GET /v1/prompts`, `GET /v1/prompts/{prompt_id}`, `PUT /v1/prompts/{prompt_id}`, `DELETE /v1/prompts/{prompt_id}`, `POST /v1/prompts/{prompt_id}/duplicate`.                                                                                                                                         |
| Prompt blocks              | `GET /v1/prompts/{prompt_id}/blocks`, `PUT /v1/prompts/{prompt_id}/blocks`.                                                                                                                                                                                                                                              |
| Prompt inputs              | `GET /v1/prompts/{prompt_id}/inputs`, `PUT /v1/prompts/{prompt_id}/inputs`.                                                                                                                                                                                                                                              |
| Context bindings           | `GET /v1/prompts/{prompt_id}/context-bindings`, `PUT /v1/prompts/{prompt_id}/context-bindings`.                                                                                                                                                                                                                          |
| Output schema              | `GET /v1/prompts/{prompt_id}/schema`, `PUT /v1/prompts/{prompt_id}/schema`.                                                                                                                                                                                                                                              |
| Execution                  | `POST /v1/prompts/run`, `GET /v1/prompts/{prompt_id}/runs`, `GET /v1/prompts/runs/{run_id}`.                                                                                                                                                                                                                             |
| Versioning                 | `GET /v1/prompts/{prompt_id}/versions`, `POST /v1/prompts/{prompt_id}/versions`, `POST /v1/prompts/{prompt_id}/publish`, `POST /v1/prompts/{prompt_id}/rollback`.                                                                                                                                                        |
| Testing/evaluation         | `GET /v1/prompts/{prompt_id}/test-cases`, `POST /v1/prompts/{prompt_id}/test-cases`, `PUT /v1/prompts/{prompt_id}/test-cases/{test_id}`, `DELETE /v1/prompts/{prompt_id}/test-cases/{test_id}`, `POST /v1/prompts/{prompt_id}/test`, `POST /v1/prompts/{prompt_id}/evaluate`, `GET /v1/prompts/{prompt_id}/evaluations`. |
| Prompt-document generation | `POST /v1/prompts/{prompt_id}/generate-document` as defined by the prompt router.                                                                                                                                                                                                                                        |
| Audit                      | `GET /v1/audit/events`.                                                                                                                                                                                                                                                                                                  |

Other API modules such as blocks, templates, placeholders, marketplace, import, render, and UI helpers exist in `backend/src/api/`, but `main.py` currently mounts only health, AI, documents, datasources, prompts, and audit. Those unmounted files are present code, not active routes in the current running backend unless `main.py` is changed.

### Prompt Builder Functional Flows

| Flow                       | End-to-end behavior                                                                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt CRUD                | Creates, lists, opens, updates, deletes, and duplicates prompt records in `prompt_builder.prompts`.                                                                   |
| Prompt composition         | Stores prompt blocks, ordered block content, input variables, context bindings, and schema/guardrail data.                                                            |
| Publish/version lifecycle  | Creates version records, publishes prompt versions, and can roll back to prior versions.                                                                              |
| Prompt run                 | Builds prompt content from stored blocks and provided inputs/context, calls configured LLM/Cohere behavior, stores run status/output/traces, and exposes run history. |
| Test cases                 | Stores prompt test cases and runs them to compare actual output/evaluation status.                                                                                    |
| Evaluation                 | Stores evaluation results for prompts and exposes historical evaluation records.                                                                                      |
| Datasource context         | Lists datasources from configured datasource tables/URLs and can test SQL for datasource-aware prompt flows.                                                          |
| AI SQL/tooling             | AI helper endpoints can generate SQL or transform prompt content through configured LLM/Cohere/webhook integration.                                                   |
| Document generation bridge | Prompt Builder can call Template Builder through `TEMPLATE_BUILDER_URL` to generate documents from prompt-driven data.                                                |
| Audit                      | Important actions write audit records returned by the audit API.                                                                                                      |

### Prompt Builder Data And Configuration

| Area            | Details                                                                                                                                                                                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database schema | `backend/db/migrations/0001_prompt_builder.sql` creates `prompt_builder.prompts`, `prompt_versions`, `prompt_blocks`, `prompt_inputs`, `prompt_context_bindings`, `prompt_test_cases`, `prompt_runs`, `prompt_run_traces`, `prompt_evaluations`, `prompt_approvals`, and `audit_events`. |
| Demo data       | `backend/kasetti-db/*.sql` provides the same banking/finance/health/insurance/manufacturing demo domain schemas used by datasource-aware flows.                                                                                                                                          |
| LLM providers   | Uses Cohere by default in current code paths when a custom LLM endpoint is not configured. Some code paths reference `command-r-plus-08-2024`, Google Translate, generic `LLM_ENDPOINT`, and `LLM_WEBHOOK_URL`.                                                                          |
| Document bridge | `TEMPLATE_BUILDER_URL` must point to a running Template Builder backend for prompt-to-document generation.                                                                                                                                                                               |
| Runtime ports   | Backend and frontend are separate; local docs/runbooks identify the active host ports and `VITE_API_BASE`.                                                                                                                                                                               |

### Prompt Builder Known Gaps And Verification Notes

| Item                        | Current status                                                                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unmounted route files       | Several API files exist but are not mounted by `main.py`. They should not be assumed active.                                                          |
| External AI keys            | Real LLM, Cohere, Google Translate, and webhook behavior requires environment variables.                                                              |
| Redis variable              | Redis appears in config/docs, but active usage/service wiring must be verified before relying on Redis-backed behavior.                               |
| Template Builder dependency | Prompt-to-document flows require Template Builder to be running and reachable. Prompt Builder itself can run without importing Template Builder code. |

## Group 4: Orchestration

### System Role

`orchestration/` is a standalone orchestration/runtime product. It models orchestration plans, executes DAG-like step graphs, records executions and traces, manages human approvals, exposes ITSM/knowledge/evidence/governance features, and includes a React UI for operating those flows.

| Area                       | Responsibility                                                                                                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/`                | React/Vite TypeScript UI for dashboard, plan lifecycle, execution monitor, history, admin console, datasources, domain packs, evidence, approvals, billing/usage, AI copilot, ITSM, and knowledge graph. |
| `services/`                | FastAPI backend, auth, route handlers, orchestration runtime, executors, config, schemas, database service, metrics, tests, and integrations.                                                            |
| `db-init/`                 | Postgres schema and demo domain SQL for orchestration and datasource examples.                                                                                                                           |
| `docs/adr/`                | Architecture decision record for EIVS orchestration integration.                                                                                                                                         |
| `infra/` and compose files | Docker/runtime support for backend, frontend, Postgres, demo datasource database, and related local services.                                                                                            |

### Orchestration Frontend Routes And UI Behavior

Routes are defined in `orchestration/frontend/src/App.tsx`:

| Route                | Page               | Functional behavior                                                                        |
| -------------------- | ------------------ | ------------------------------------------------------------------------------------------ |
| `/`                  | Dashboard          | Overview of orchestration activity and shortcuts.                                          |
| `/plans`             | Plans list         | Lists orchestration plans and navigates to create/detail/edit/version/canvas/canary views. |
| `/plans/new`         | New plan           | Creates an orchestration plan and steps.                                                   |
| `/plans/import`      | Import plan        | Imports plan definitions.                                                                  |
| `/plans/:id`         | Plan detail        | Shows plan metadata, steps, and actions.                                                   |
| `/plans/:id/edit`    | Edit plan          | Edits plan metadata/steps.                                                                 |
| `/plans/:id/history` | Version history    | Lists plan versions and restore actions.                                                   |
| `/plans/:id/canvas`  | DAG canvas         | Visualizes plan step graph.                                                                |
| `/plans/:id/canary`  | Canary             | Supports canary/testing style plan behavior.                                               |
| `/execute`           | Execute 360        | Runs plans against entity/tenant input.                                                    |
| `/execute/monitor`   | Execution monitor  | Tracks execution state and step results.                                                   |
| `/history`           | History            | Lists prior executions.                                                                    |
| `/history/:id`       | Execution detail   | Shows detail for one execution.                                                            |
| `/admin`             | Admin console      | Tenant policies, budgets, runtime/admin settings, and governance controls where wired.     |
| `/datasources`       | Datasource catalog | Datasource CRUD/test UI for orchestration datasource registry.                             |
| `/packs`             | Domain packs       | Lists/install/uninstall domain packs.                                                      |
| `/evidence`          | Evidence viewer    | Lists evidence bundles and displays evidence metadata.                                     |
| `/approvals`         | Approvals          | Human-review approvals and agent approvals workflow.                                       |
| `/billing`           | Usage/Billing      | Usage/budget-related UI for orchestration tenants.                                         |
| `/copilot`           | AI Copilot         | Generates/optimizes/lints plan designs through backend AI endpoints.                       |
| `/itsm`              | ITSM               | Lists/creates/resolves ITSM tickets.                                                       |
| `/knowledge`         | Knowledge graph    | Entity type, entity detail, and synthesize behavior.                                       |
| `*`                  | Not found          | Displays not-found page.                                                                   |

The Orchestration sidebar is defined inside `frontend/src/components/layout/AppLayout.tsx`, not in a separate sidebar file. It groups navigation as Core, AI Features, Governance, and Admin. It polls `GET /v1/itsm/tickets?status=OPEN` every 20 seconds for the ITSM badge.

### Orchestration Backend Endpoint Catalog

All active backend endpoints are in `orchestration/services/main.py`:

| API area              | Endpoints                                                                                                                                                                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health/metrics        | `GET /health`, `GET /metrics`.                                                                                                                                                                                                                                                    |
| Auth                  | `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`. Demo users are hardcoded in code as `admin/admin123` and `viewer/viewer123`.                                                                                                                                            |
| Plans                 | `POST /admin/plans`, `GET /admin/plans`, `GET /admin/plans/{plan_id}`, `PUT /admin/plans/{plan_id}`, `DELETE /admin/plans/{plan_id}`, `PATCH /admin/plans/{plan_id}/deactivate`, `PATCH /admin/plans/{plan_id}/activate`, `POST /admin/plans/{plan_id}/clone`.                    |
| Legacy 360 execution  | `POST /v1/360`.                                                                                                                                                                                                                                                                   |
| Executions            | `GET /v1/executions`, `GET /v1/executions/{execution_id}`, `DELETE /v1/executions/{execution_id}`.                                                                                                                                                                                |
| Plan versions         | `GET /admin/plans/{plan_id}/versions`, `POST /admin/plans/{plan_id}/versions`, `POST /admin/plans/{plan_id}/versions/{version}/restore`.                                                                                                                                          |
| Tenant policy/budget  | `GET /admin/tenants/{tenant_id}/policy`, `POST /admin/tenants/{tenant_id}/policy`, `GET /admin/tenants`, `GET /admin/tenants/{tenant_id}/budget`, `POST /admin/tenants/{tenant_id}/budget`.                                                                                       |
| Datasources           | `GET /admin/datasources`, `POST /admin/datasources`, `GET /admin/datasources/{datasource_id}`, `PUT /admin/datasources/{datasource_id}`, `DELETE /admin/datasources/{datasource_id}`, `POST /admin/datasources/{datasource_id}/test`.                                             |
| ITSM                  | `POST /v1/itsm/tickets`, `GET /v1/itsm/tickets/{ticket_id}`, `GET /v1/itsm/tickets`, `POST /v1/itsm/tickets/{ticket_id}/resolve`.                                                                                                                                                 |
| Copilot               | `POST /v1/copilot/design`, `POST /v1/copilot/safety-lint`, `POST /v1/copilot/optimize`.                                                                                                                                                                                           |
| Evidence              | `GET /v1/evidence/bundles`.                                                                                                                                                                                                                                                       |
| Knowledge             | `GET /v1/knowledge/entity-types`, `GET /v1/knowledge/entities/{entity_type}/{entity_id}`, `POST /v1/knowledge/synthesize`.                                                                                                                                                        |
| Domain packs          | `GET /admin/domain-packs`, `POST /admin/domain-packs/{pack_id}/install`, `DELETE /admin/domain-packs/{pack_id}/uninstall`.                                                                                                                                                        |
| Governance/audit      | `POST /v1/zkp/validate`, `POST /v1/redaction/policy`, `GET /v1/redaction/policies`, `POST /v1/audit/narrative`, `POST /v1/audit/counterfactual`.                                                                                                                                  |
| Runtime orchestration | `POST /v1/orchestrations/run`, `GET /v1/orchestrations/runs/{execution_id}`, `GET /v1/orchestrations/runs/{execution_id}/steps`, `GET /v1/orchestrations/runs`.                                                                                                                   |
| Runtime contracts     | `GET /v1/runtime/contracts/{plan_name}`, `GET /v1/runtime/contracts/{plan_name}/openapi`.                                                                                                                                                                                         |
| Human review          | `GET /v1/human-review-approvals`, `GET /v1/human-review-approvals/{approval_id}`, `POST /v1/human-review-approvals/{approval_id}/approve`, `POST /v1/human-review-approvals/{approval_id}/reject`.                                                                                |
| Intent mapping        | `POST /admin/intent-plan-mappings`, `GET /admin/intent-plan-mappings`, `GET /admin/intent-plan-mappings/{mapping_id}`, `PUT /admin/intent-plan-mappings/{mapping_id}`, `DELETE /admin/intent-plan-mappings/{mapping_id}`, `GET /v1/intents/{intent_code}/plan`.                   |
| Agent tasks           | `GET /v1/agent-task-runs/{agent_run_id}`, `GET /v1/agent-task-runs/{agent_run_id}/trace`, `GET /v1/orchestrations/runs/{execution_id}/agent-tasks`, `GET /v1/agent-approvals`, `POST /v1/agent-approvals/{approval_id}/approve`, `POST /v1/agent-approvals/{approval_id}/reject`. |

### Orchestration Runtime And Executor Behavior

| Runtime category          | Behavior                                                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan graph                | Plans consist of ordered steps with dependencies. The runtime schedules executable steps when dependencies are satisfied.                          |
| Parallelism               | The orchestrator uses a thread pool to execute ready steps concurrently where dependencies permit.                                                 |
| Conditions                | Step `condition_expr` values can gate whether a step should run.                                                                                   |
| Error policy              | Supports `best_effort`, `fail_fast`, and dependent-fail behavior.                                                                                  |
| Human review pause/resume | `human_review` steps can pause execution and create approval records. Approve/reject endpoints resume or terminate according to approval decision. |
| Execution traces          | Runtime writes execution rows and step rows to `orchestration.executions` and `orchestration.execution_steps` when DB context is available.        |
| Runtime contracts         | Contract endpoints expose expected input/output shape for a named plan and an OpenAPI-style view.                                                  |

Executor kinds registered in the service include `sql`, `rest`, `graphql`, `ai_transform`, `intent_classify`, `policy_route`, `intent_validate`, `adapter_analyze`, `prompt_run`, `document_generate`, `human_review`, `webhook`, and `agent_task`.

### Orchestration Data And Configuration

| Area               | Details                                                                                                                                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database schema    | `db-init/schema.sql` creates orchestration tables for plans, plan steps, versions, executions, tenant policies, tenant budgets, datasources, users, domain pack installations, knowledge graph config, execution steps, intent-plan mappings, agent task runs/traces/approvals, human review approvals, and ITSM tickets. |
| EIVS compatibility | Schema contains EIVS-style tables for intents, policies, datasource configs, validation rules/runs, prompts, and email intent runs where orchestration integrates with EIVS-style workflows.                                                                                                                              |
| Demo domain SQL    | `db-init/*_domain.sql` creates banking, finance, health, insurance, and manufacturing demo datasets.                                                                                                                                                                                                                      |
| Auth config        | Uses JWT secret/algorithm from environment. Demo users are hardcoded, so this is not production identity management.                                                                                                                                                                                                      |
| AI config          | Groq is used for real copilot plan generation when `GROQ_API_KEY` is present. Without it, fallback/mock behavior or errors depend on endpoint branch.                                                                                                                                                                     |
| Ports              | Local runbooks use backend `8060`, frontend `3100`, Postgres/datasource DB ports adjusted to avoid FlowEngine conflicts.                                                                                                                                                                                                  |

### Orchestration Known Gaps And Verification Notes

| Item                     | Current status                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Demo auth                | Hardcoded demo users are suitable for local testing but not enterprise production auth.                                                    |
| Datasource test          | `/admin/datasources/{datasource_id}/test` includes placeholder wording indicating real tests are not fully implemented in that branch.     |
| Evidence detail endpoint | Frontend API expectations should be compared to backend because backend route scan shows list bundles but not every possible detail route. |
| External integrations    | ITSM URLs and several governance/knowledge responses include simulated/demo data unless integrated services are configured.                |
| AI dependency            | Copilot quality depends on valid Groq credentials and network access.                                                                      |

## Group 5: DocAI

### System Role

`Docai/` is a standalone document AI project. It contains a FastAPI document parsing/training/compliance backend, a React UI, Docker infra for Postgres/Weaviate/Prometheus/Grafana, Kubernetes manifests, tests, parser implementations, connectors, and migrations.

| Area                            | Responsibility                                                                                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docai-ui/`                     | React/CRA UI for login, dashboard, document type setup, parse document, auto-detect, and parse history.                                                                                  |
| `docai_service/app/`            | FastAPI backend app with auth, DB access, parsers, document routes, parsing rules, field mappings, parse history, corrections, audit, metrics, compliance, vector store, and connectors. |
| `docai_service/app/parsers/`    | Parser implementations and fallback paths for Docling, GROBID, OCR, and Unstructured-based extraction.                                                                                   |
| `docai_service/app/connectors/` | Connector base, dispatcher, RAG connector, Salesforce connector, and SAP connector.                                                                                                      |
| `docai_service/migrations/`     | SQL migrations for initial schema, seeded document types, active flags, field mappings, and parse corrections.                                                                           |
| `docai_service/k8s/`            | Kubernetes namespace/config/secret/deployment/service/statefulset/HPA assets for DocAI and supporting services.                                                                          |
| `docai_service/config/`         | Prometheus and Grafana configuration/dashboards.                                                                                                                                         |
| `docai_service/tests/`          | Backend tests covering API, auth, compliance, connectors, deployment, e2e, classifier, metrics, model registry, parsers, parsing rules, and vector store.                                |

### DocAI Frontend Routes And UI Behavior

Routes are defined in `Docai/docai-ui/src/App.js`:

| Route             | Page           | Functional behavior                                                                                                                                                                  |
| ----------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/login`          | Login          | Calls backend JWT login, stores `docai_token` in localStorage, handles submit loading/error state, then enters protected app.                                                        |
| `/dashboard`      | Dashboard      | Displays dashboard cards/charts/stats and operational overview.                                                                                                                      |
| `/doc-types`      | Document Types | Lists document types, opens detail/edit flows, manages field mappings, parsing rules, rule versions/activation, schema suggestion upload, and training upload/actions.               |
| `/parse-document` | Parse Document | Uploads a document, selects document type/template where required, shows parsing/compliance/classification stages, displays parsed JSON, and supports JSON download/toggle behavior. |
| `/auto-detect`    | Auto Detect    | Uploads a file and calls backend auto-detection to identify document type/classification.                                                                                            |
| `/parse-history`  | Parse History  | Lists parse requests, opens details, review/correction flows, and saves parse corrections.                                                                                           |
| `*` protected     | Redirect       | Redirects unknown protected paths to `/dashboard`.                                                                                                                                   |

`ProtectedRoute` checks for `docai_token` in local storage. There is no Keycloak/FlowEngine auth layer in DocAI. The UI design was reskinned visually only; backend code and functional API calls should remain unchanged.

### DocAI Backend Endpoint Catalog

Endpoints are defined in `Docai/docai_service/app/main.py`:

| API area               | Endpoints                                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth                   | `POST /auth/register`, `POST /auth/jwt/login`, `GET /auth/me`, `POST /auth/logout`.                                                                                                                                                  |
| Upload/schema/train    | `POST /upload/`, `POST /schema-suggest/`, `POST /train/`.                                                                                                                                                                            |
| Parsing rules          | `GET /parsing-rules/`, `POST /parsing-rules/`, `DELETE /parsing-rules/{rule_id}`, `GET /parsing-rules/{rule_id}/versions`, `POST /parsing-rules/{rule_id}/versions`, `POST /parsing-rules/{rule_id}/versions/{version_id}/activate`. |
| Field mappings         | `GET /field-mappings/`, `POST /field-mappings/`, `DELETE /field-mappings/{mapping_id}`.                                                                                                                                              |
| Detection/parsing/RAG  | `POST /auto-detect/`, `POST /parse/`, `POST /query-rag/`.                                                                                                                                                                            |
| Document types         | `GET /doc-types/`, `GET /doc-types/{doc_type_id}`, `DELETE /doc-types/{doc_type_id}`.                                                                                                                                                |
| Parse history/review   | `GET /parse-history/`, `GET /review-queue/`, `GET /parse-history/{parse_request_id}/corrections`, `POST /parse-history/{parse_request_id}/corrections`.                                                                              |
| Stats/audit/monitoring | `GET /parse-stats/`, `GET /audit-trail/{parse_request_id}`, `GET /health/`, `GET /metrics`, `GET /metrics/`.                                                                                                                         |

### DocAI Functional Flows

| Flow                | End-to-end behavior                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Login/session       | User submits credentials, backend returns JWT, frontend stores token, protected pages require token.                                                                                             |
| Document type setup | Users configure document types, field mappings, parsing rules, active rule versions, and training data for document parsing.                                                                     |
| Schema suggestion   | User uploads a sample document and backend suggests schema/fields through parser/model logic.                                                                                                    |
| Training            | User uploads files for a selected document type/rule path. Local setup may use mock training depending on environment flags.                                                                     |
| Parsing             | User uploads a document, backend chooses parser/rule/model path, extracts fields, stores parse request/history, runs compliance/classification where implemented, and returns structured output. |
| Auto-detection      | Backend analyzes uploaded document and returns likely document type/classification.                                                                                                              |
| Review/correction   | Parse history/review queue exposes records needing review; corrections can be saved against parse history.                                                                                       |
| RAG/vector          | Vector store/RAG connector code supports document/query retrieval flows when Weaviate and required config are available.                                                                         |
| Monitoring          | Prometheus metrics and health endpoints expose runtime state; Grafana/Prometheus compose config exists for observability.                                                                        |

### DocAI Data, Infrastructure, And Configuration

| Area            | Details                                                                                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Migrations      | `001_initial_schema.sql`, `002_seed_doc_types.sql`, `003_document_types_is_active.sql`, `004_field_mappings.sql`, and `005_parse_corrections.sql` create/extend document type, parsing, mapping, history, and correction data. |
| Docker compose  | Starts supporting infrastructure such as Postgres, Weaviate, Prometheus, and Grafana. Backend/UI may require separate local commands depending on the current compose file.                                                    |
| Backend config  | Requires JWT secret, database configuration, and optional parser/model/vector settings. Secrets are not committed.                                                                                                             |
| Frontend config | CRA app uses React scripts and API base environment variables. Dependencies must be installed before `npm start`; missing `react-scripts` means `npm install` has not been run in `docai-ui`.                                  |
| Kubernetes      | Manifests include namespace, configmap, secret, DocAI deployment/service, Postgres statefulset/service, MLflow deployment, and HPA.                                                                                            |
| Tests           | Backend test files cover API routes, auth, compliance, connectors, deployment, e2e behavior, intent classifier, metrics, model registry, parsers, parsing rules, and vector store.                                             |

### DocAI Known Gaps And Verification Notes

| Item                    | Current status                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Full local stack        | Compose brings up infrastructure, but backend/UI startup may be manual unless additional compose wiring is added later.                |
| Auth model              | Uses local JWT/local auth rather than FlowEngine/Keycloak.                                                                             |
| Model/training behavior | Local testing may require mock training or local model assets. Real ML training/inference should be verified with configured services. |
| Parser dependencies     | Docling/GROBID/OCR/Unstructured behavior depends on installed system and Python dependencies.                                          |
| Vector/RAG              | Weaviate must be running and configured for vector search paths.                                                                       |

## Group 6: ServiceNow NLP Explorer

### System Role

`ServiceNow_NLP_Explorer_Reconstructed_Source/` contains a reconstructed ServiceNow NLP Data Explorer implementation. The folder README explicitly states that the original Personal Developer Instance was reclaimed due to inactivity, so this source is a reconstruction based on the earlier design and workflow, not a direct export from the original instance.

| Area | Responsibility |
| --- | --- |
| `README.md` | Explains the reconstructed nature of the package, included files, functional flow, REST Message names, middleware endpoint expectations, and ServiceNow setup notes. |
| `widget/html-template.html` | Service Portal widget markup with datasource selector, prompt textarea, Run Query button, generated query display, results table, pagination controls, and empty/error states. |
| `widget/client-controller.js` | Angular-style Service Portal client controller. Validates prompt input, calls the widget server script through `c.server.get`, manages loading/error state, applies response data, and handles previous/next pagination. |
| `widget/server-script.js` | Widget server script. Initializes datasource options for ServiceNow, Salesforce, and Snowflake; handles `runNlp` and `paginate` actions; invokes the Script Include; normalizes rows/columns/query/request/page metadata; and returns unsupported-action or service-error messages where needed. |
| `widget/style.css` | Basic Service Portal styling for panel radius, spacing, title size, textarea resizing, generated-query pre wrapping, result section spacing, table column behavior, and pagination layout. |
| `script-include/NlpExplorerService.js` | Script Include that wraps ServiceNow `sn_ws.RESTMessageV2` calls to an `AgentaryxNlp` REST Message. It sends JSON payloads to `run_nlp` and `paginate`, handles HTTP errors, parses JSON responses, and contains an optional tenant-JWT helper. |

### ServiceNow NLP Functional Flow

| Step | Behavior |
| --- | --- |
| Prompt entry | User selects datasource and enters a natural-language prompt in the Service Portal widget. Empty prompt is blocked client-side with `Please enter a prompt.` |
| Run Query | Client controller sends `action: "runNlp"`, prompt, datasource, page `1`, and page size to the widget server script. |
| Server handling | Server script creates `global.NlpExplorerService()` and calls `runNlp(prompt, dataSource, page, pageSize)`. |
| Middleware call | Script Include calls ServiceNow REST Message `AgentaryxNlp` method `run_nlp`, posting JSON with prompt, datasource, page, and page size. |
| Response normalization | Server script accepts `records` or `rows`, `generatedQuery` or `query` or `sql`, `requestId` or `request_id`, and both camelCase/snake_case pagination metadata. |
| Results UI | Widget displays generated query, table columns derived from response columns or first record keys, total records, page count, and previous/next buttons. |
| Pagination | Client sends `action: "paginate"`, request id, page, and page size. Script Include calls REST Message method `paginate`. Missing request id returns `Request ID is required for pagination.` |

### ServiceNow NLP Middleware And Configuration

| Requirement | Details |
| --- | --- |
| REST Message | ServiceNow must define a REST Message named `AgentaryxNlp`. |
| REST Message methods | Expected method names are `run_nlp`, `paginate`, and optionally `tenant_jwt` if middleware requires a tenant JWT. |
| Middleware paths | Folder README says the REST Message should point to deployed middleware paths such as `/v1/analyze`, `/v1/paginate`, and `/v1/tenant/jwt`. |
| Authentication | ServiceNow authentication should use Credential Alias, OAuth profile, or Basic Authentication. Production passwords, client secrets, and JWT values must not be hardcoded in scripts. |
| Optional tenant JWT | `_getTenantJwt` exists, but the header call is commented out in `_execute`; it must be enabled/configured only if middleware requires `X-Tenant-Context`. |

### ServiceNow NLP Known Gaps And Verification Notes

| Item | Current status |
| --- | --- |
| Reconstructed source | This is not an exact export from the original ServiceNow instance. Instance-specific metadata, REST Message records, credentials, and portal/widget registration must be recreated manually. |
| Middleware dependency | No middleware implementation is included in this folder. The widget only works once `AgentaryxNlp` REST Message methods point to a live middleware returning the expected JSON shape. |
| Limited datasource list | Server script hardcodes ServiceNow, Salesforce, and Snowflake datasource options. Adding more datasources requires updating the widget/server behavior or moving datasource discovery to middleware. |
| Basic styling | Styling is ServiceNow panel/bootstrap-oriented and not documented as reskinned to the FlowEngine light UI system. |

## Group 7: SAP Salesforce Integration

### System Role

`SAP-Salesforce-Integration/` is a small standalone integration sample between Salesforce and SAP BTP/HANA. It now has three visible parts: a Salesforce Apex/LWC source tree under `salesforce/force-app`, a Node middleware layer under `sap-middleware`, and a SAP UI5/Fiori application under `fiori-app`. It is not part of FlowEngine runtime and does not share FlowEngine code.

| Area | Responsibility |
| --- | --- |
| `README.md` | Folder setup guide covering middleware `.env`, SAP BTP deployment, Salesforce deployment, one-time Salesforce metadata/setup, role mapping, and the end-to-end LWC-to-HANA flow. |
| `salesforce/force-app/main/default/classes/SAPBTPController.cls` | Apex controller for SAP login, prompt/question calls, HANA query proxy, and auth status. |
| `salesforce/force-app/main/default/lwc/sapBtpIntegration` | Lightning Web Component for choosing system, logging in to SAP, asking questions, showing results, opening Fiori, and displaying loading/error states. |
| `sap-middleware/server.js` | Express server with SAP HANA connection, XSUAA setup where available, environment-driven table/department names, employee table creation/seed, role-aware query helper, and HTTP APIs. |
| `sap-middleware/xs-security.json` | XSUAA scopes, role templates, role collections, OAuth redirect URIs, grant types, and provider configuration. |
| `sap-middleware/manifest.yml` | Cloud Foundry deployment manifest for the middleware app and XSUAA service binding. |
| `sap-middleware/package.json` | Node package manifest for Express, CORS, dotenv, Passport, SAP HANA client, SAP xsenv, and xssec. |
| `fiori-app/` | SAP UI5/Fiori app with staticfile Cloud Foundry manifest, HTML5 app router config, UI5 manifest, component, main controller, XML view, and package scripts for `fiori run` and `fiori build`. |

### SAP Salesforce UI Flow

| UI step | Behavior |
| --- | --- |
| System selection | LWC offers SAP BTP/HANA, Salesforce CRM, and Other Systems. Only SAP flow is implemented; other selections show "coming soon" style messages. |
| SAP login | User enters username/password. Apex `loginToSAP` obtains XSUAA client-credentials token using custom metadata config, then locally validates password length and infers user role from the email string. |
| Dashboard | Successful login stores user info, role, email, Fiori URL, and opens the dashboard. |
| Ask question | LWC sends question, role, and email to Apex `askQuestion`, which posts JSON to `Pipedream_URL__c`; response is parsed and displayed. |
| Fiori launch | Opens configured Fiori URL with role/user query parameters. |
| Reset/logout | Returns to system selection and clears local UI state. |

### SAP Fiori App Flow

| Fiori file/behavior | Details |
| --- | --- |
| `fiori-app/webapp/index.html` | Loads SAP UI5 `1.108.0` from `https://ui5.sap.com`, uses theme `sap_fiori_3`, and mounts component `sapqueryapp`. |
| `fiori-app/webapp/Component.js` | Reads URL query parameters `role`, `user`, and `query`; defaults role to `Admin`; initializes app JSON model; auto-runs the query if `query` is present. |
| `fiori-app/webapp/controller/Main.controller.js` | Has a hardcoded middleware base URL `https://sap-middleware.cfapps.us10-001.hana.ondemand.com`; posts questions to `/ask`; sets `X-User-Role` and `X-User-Email`; handles loading, results, clear, and logout actions. |
| `fiori-app/webapp/view/Main.view.xml` | Displays SAP HANA Query App header, role badge, search field, Ask Question/Clear buttons, busy indicator, error/description strips, results table, and empty prompt guidance. |
| `fiori-app/xs-app.json` | Uses `authenticationMethod: "none"` and allows Salesforce/Force/Lightning frame ancestors through CSP. |
| `fiori-app/manifest.yml` | Deploys the app as `sapqueryapp` using `staticfile_buildpack` with `path: webapp`. |

### SAP Middleware Endpoint Catalog

| Endpoint | Behavior |
| --- | --- |
| `GET /` | Returns health-style JSON `{ message: "SAP Middleware running!", status: "ok" }`. |
| `GET /userinfo` | Returns middleware-running status JSON. |
| `POST /ask` | Accepts `question`, role/email headers or body values, chooses role-based SQL through `getRoleBasedQuery`, queries HANA, and returns question, role, description, count, and result rows. |
| `POST /api/query` | Accepts `queryType`, role, and question, runs role-based SQL, and returns success, query type, role, description, count, and data rows. |
| `GET /employees` | Returns all rows from the seeded `EMPLOYEES` table. |

### SAP Middleware Data And Role Behavior

| Role | Query behavior |
| --- | --- |
| Finance | Returns finance department rows including salary, ordered by salary descending. |
| HR | Returns department headcount if question asks department/count; otherwise returns employee rows with salary hidden. |
| Sales | Returns Sales department rows without salary. |
| IT | Returns IT department rows without salary. |
| Admin/default | Returns all employee columns and rows ordered by department/name. |

On startup, middleware listens on `PORT` or defaults to `8080`. It attempts to connect to SAP HANA using `HANA_HOST`, `HANA_PORT`, `HANA_USER`, and `HANA_PASSWORD` from `.env`. The table name and department strings are environment configurable through `TABLE_NAME`, `DEFAULT_ROLE`, `DEPT_FINANCE`, `DEPT_HR`, `DEPT_SALES`, and `DEPT_IT`. If connected, it creates the employee table if needed and inserts eight sample employee rows when the table is empty.

### SAP Salesforce Integration Configuration

| Requirement | Details |
| --- | --- |
| Salesforce custom metadata | `SAP_BTP_Config__mdt` with record `Production` is expected by Apex, but its metadata definition/fields are not present in this folder. Required fields include XSUAA URL, client id, client secret, Fiori URL, and Pipedream URL based on code references. |
| Salesforce Named Credential | `queryHANA` uses `callout:SAP_BTP_NC/api/query`, so `SAP_BTP_NC` must exist in the org. |
| SAP HANA env | `sap-middleware/.env` is ignored and must contain real HANA connection details. |
| XSUAA | `xs-security.json` defines scopes and grant types; `server.js` tries to initialize XSUAA from bound services but continues with a warning if XSUAA is unavailable. |
| Cloud Foundry | `manifest.yml` deploys `sap-middleware` with Node buildpack and service binding `sapqueryapp-xsuaa`. |

### SAP Salesforce Integration Known Gaps And Verification Notes

| Item | Current status |
| --- | --- |
| Demo login validation | `loginToSAP` gets an XSUAA token but validates user credentials only by checking password length and deriving role from email text. This is demo behavior, not real user authentication. |
| Missing metadata definitions | `SAP_BTP_Config__mdt` object/fields are referenced but not checked into this folder. Deploying this source alone is not enough unless those metadata objects already exist. |
| Pipedream dependency | `askQuestion` posts to `Pipedream_URL__c`; that external URL must exist and return the expected JSON shape. |
| HANA dependency | Middleware needs real SAP HANA credentials and reachable host/port. If the HANA connection fails, API queries will fail. |
| Sample data | The middleware creates/seeds a simple `EMPLOYEES` demo table. It is not a generalized SAP schema integration. |
| XSUAA fallback | Middleware logs a warning and continues if XSUAA is unavailable, so local testing can run without full SAP auth but production should not rely on that fallback. |
| Hardcoded Fiori middleware URL | The Fiori controller/component call `https://sap-middleware.cfapps.us10-001.hana.ondemand.com` directly. Changing middleware deployment URL requires updating the Fiori source/config. |
| Fiori auth disabled | `fiori-app/xs-app.json` sets `authenticationMethod` to `none`; production auth expectations must be verified before use outside demo contexts. |

## Cross-Project Setup And Ownership Rules

### Independence Rule

Each product folder must remain independently runnable. Do not create runtime dependencies by importing frontend code, backend code, CSS, or package modules across project folders. If a visual style must match FlowEngine, copy the needed token values into that project's own styling layer rather than importing FlowEngine files.

### Secret Handling

Real `.env` files, API keys, SMTP passwords, Google client secrets, Vault tokens/unseal keys, Keycloak admin passwords, Kill Bill credentials, payment keys, and generated runtime state must remain out of Git. Each folder should document required variables in README/RUNBOOK and keep only examples/templates committed.

### Local Port Coordination

FlowEngine + KillBill occupy the main SaaS ports. Orchestration, Template Builder, Prompt Builder, DocAI, ServiceNow NLP Explorer, and SAP Salesforce Integration should be run one at a time unless their compose/env host ports are adjusted. When testing multiple products simultaneously, check backend, frontend, database, Keycloak, Vault, Kill Bill, Grafana, Prometheus, Weaviate, ServiceNow instance configuration, SAP middleware, and SAP HANA ports for collisions.

### Documentation Completeness Standard

This README is not meant to copy every line of source code verbatim. It is meant to give a complete operational and architectural picture: folders, routes, schemas, flows, user actions, roles, configs, integrations, known gaps, and setup boundaries. If exact implementation details are needed for a bug fix, the referenced source file remains the line-level authority.

## Repository Scope

Current top-level source entries:

| Path               | Purpose                                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.gitattributes`   | Normalizes line endings. Linux-mounted shell/config files are forced to LF; PowerShell scripts are CRLF.                                                   |
| `.gitignore`       | Prevents secrets, local runtime state, dependency folders, build outputs, logs, generated DB files, and local Codex/audit folders from being committed.    |
| `FlowEngine2.0/`   | Main AgentryX FlowEngine SaaS platform with FastAPI backend, tenant React UI, admin React UI, Keycloak, Vault, Postgres, and unified Kill Bill startup.    |
| `KillBill/`        | Kill Bill catalog, gateway, billing scripts, webhook/payment/reminder helpers, and FlowEngine billing integration code.                                    |
| `orchestration/`   | Standalone orchestration service and UI for plans, executions, approvals, datasources, ITSM, evidence, AI copilot, EIVS-style validation, and agent tasks. |
| `PromptBuilder/`   | Standalone prompt authoring, versioning, testing, execution, audit, datasource-context, and document bridge module.                                        |
| `TemplateBuilder/` | Standalone document template studio with template CRUD, editor UI, placeholders, tests, marketplace, rendering, and worker code.                           |
| `Docai/`           | Standalone DocAI document parsing/training/compliance service and React UI.                                                                                |
| `ServiceNow_NLP_Explorer_Reconstructed_Source/` | Reconstructed ServiceNow NLP Service Portal widget and Script Include source for middleware-backed natural-language query/pagination flows. |
| `SAP-Salesforce-Integration/` | Salesforce Apex/LWC, Node/SAP middleware, and SAP Fiori app sample for SAP BTP/HANA login/query flows, role-aware employee data, XSUAA config, and Fiori launch/query screens. |
| `killbill-fixed.tar` | Local Docker image archive for the custom `killbill-fixed` image required by FlowEngine Compose. New users must load it into Docker before starting FlowEngine + KillBill. |

Ignored local folders such as `.git/`, `.agents/`, `.codex-audit/`, `node_modules/`, `build/`, `dist/`, and `.env` files are intentionally not product modules and are not part of this README's functional scope.

## Current File Audit And Coverage Standard

This document was updated after a current working-directory source pass. The scan excluded `.git`, `.agents`, dependency folders, and build outputs:

```powershell
rg --files --hidden -g '!.git' -g '!.agents' -g '!node_modules' -g '!dist' -g '!build'
```

The current source tree contains 813 files in that scan:

| Area              | Current files |
| ----------------- | ------------: |
| `.gitattributes`  |             1 |
| `.gitignore`      |             1 |
| `Docai`           |           107 |
| `FlowEngine2.0`   |           265 |
| `KillBill`        |            22 |
| `killbill-fixed.tar` |         1 |
| `orchestration`   |           137 |
| `PromptBuilder`   |            84 |
| `README.md`       |             1 |
| `SAP-Salesforce-Integration` |            18 |
| `ServiceNow_NLP_Explorer_Reconstructed_Source` | 6 |
| `TemplateBuilder` |           170 |

Exact current file-type inventory from the scan:

| Extension/type   | Count | Notes |
| ---------------- | ----: | ----- |
| `.admin`         |     1 | Kill Bill/tenant admin API credential artifact. |
| `.cjs`           |     1 | CommonJS JavaScript configuration. |
| `.cls`           |     1 | Salesforce Apex controller currently present under SAP integration. |
| `.conf`          |     2 | Nginx/runtime config files. |
| `.css`           |    21 | Frontend stylesheets across React, LWC, and ServiceNow widget projects. |
| `.dockerignore`  |     3 | Docker build-context ignore files. |
| `.docx`          |     1 | Sample/generated document fixture. |
| `.example`       |     3 | Environment/config examples. |
| `.ftl`           |     2 | Keycloak theme templates. |
| `.gitattributes` |     1 | Repository Git attributes. |
| `.gitignore`     |     8 | Git ignore rules at root/module level. |
| `.gitkeep`       |     2 | Empty-directory keep markers. |
| `.hcl`           |     2 | Vault/config policy files. |
| `.html`          |    11 | Static HTML templates/pages/assets. |
| `.ico`           |     1 | Browser icon asset. |
| `.ini`           |     1 | Python/test/runtime config. |
| `.jpg`           |     1 | Static image asset. |
| `.js`            |    46 | JavaScript services, LWC files, ServiceNow scripts, SAP UI5 code, config, and React support code. |
| `.json`          |    37 | Package manifests/locks, dashboards, Salesforce/SAP config, and metadata. |
| `.jsx`           |    83 | React components/pages across FlowEngine and DocAI. |
| `.mako`          |     1 | Alembic migration template. |
| `.md`            |    21 | READMEs, runbooks, ADR/reference docs, and this universal README. |
| `.pdf`           |     5 | Sample/reference document fixtures. |
| `.png`           |     6 | Static image assets. |
| `.properties`    |     2 | Java/Kill Bill/logging-style properties files. |
| `.ps1`           |     9 | PowerShell setup/test scripts. |
| `.py`            |   293 | FastAPI services, modules, migrations, tests, workers, parsers, scripts, and model helpers. |
| `.sh`            |     9 | Shell startup/bootstrap scripts. |
| `.sql`           |    26 | Schema, migration, seed, and demo-domain SQL. |
| `.svg`           |    11 | Frontend vector assets/icons. |
| `.tar`           |     1 | `killbill-fixed.tar`, the Docker image archive for the custom Kill Bill image. |
| `.ts`            |    32 | TypeScript API clients, types, utilities, and frontend logic. |
| `.tsx`           |   122 | React/TypeScript pages and components. |
| `.txt`           |    11 | Text fixtures/reference files. |
| `.xml`           |     4 | SAP UI5 XML view plus billing/catalog XML. |
| `.yaml`          |    11 | Kubernetes/Cloud Foundry/YAML config. |
| `.yml`           |    10 | Compose, workflow, and deployment YAML. |
| `<no extension>` |    11 | Dockerfiles, lock/runtime/tooling files without extensions. |

How to read this README:

- Source files are documented by module, runtime role, routes, schemas, setup behavior, known gaps, and important implementation notes.
- Generated dependency lockfiles such as `package-lock.json` are documented as dependency-resolution artifacts, not expanded package by package in prose.
- Binary/static assets such as PNG/JPG/ICO/PDF/DOCX fixtures are documented by purpose and location, not byte by byte.
- Test fixtures and sample documents are documented as validation/demo assets; individual binary contents should be inspected directly when changing parser or renderer behavior.
- This README is intended to explain the repository completely enough for setup, ownership, review, debugging, and onboarding. It does not duplicate every source line verbatim because the source files themselves remain the authoritative line-by-line implementation.

## Complete Current Directory Coverage

Every current source directory below was included in the final scan and is covered either in the module sections or in the file-audit notes:

| Directory                                                                    | Role                                                                                    |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `Docai`                                                                      | DocAI module root.                                                                      |
| `Docai/.github/workflows`                                                    | Nested DocAI CI/CD workflow location.                                                   |
| `Docai/docai_service`                                                        | DocAI FastAPI backend, Docker, README/RUNBOOK, requirements.                            |
| `Docai/docai_service/app`                                                    | DocAI backend app, auth, DB, parsers, routing, schemas, vector store, compliance.       |
| `Docai/docai_service/app/connectors`                                         | Salesforce, SAP, RAG, dispatcher, and connector base classes.                           |
| `Docai/docai_service/app/models`                                             | DocAI model registry.                                                                   |
| `Docai/docai_service/app/parsers`                                            | Docling, GROBID, OCR, Unstructured parser implementations.                              |
| `Docai/docai_service/config`                                                 | Prometheus and Grafana configuration root.                                              |
| `Docai/docai_service/config/grafana/dashboards`                              | Grafana dashboard JSON.                                                                 |
| `Docai/docai_service/config/grafana/datasources`                             | Grafana Prometheus datasource config.                                                   |
| `Docai/docai_service/k8s`                                                    | Kubernetes manifests for namespace, config, secrets, deployment, HPA, MLflow, Postgres. |
| `Docai/docai_service/scripts`                                                | Setup, migration, image-pull, fixture, and MLflow scripts.                              |
| `Docai/docai_service/scripts/migrations`                                     | DocAI SQL migrations and seed data.                                                     |
| `Docai/docai_service/tests`                                                  | DocAI pytest suite.                                                                     |
| `Docai/docai_service/tests/fixtures`                                         | DocAI sample documents/text fixtures.                                                   |
| `Docai/docai-ui`                                                             | DocAI Create React App frontend.                                                        |
| `Docai/docai-ui/public`                                                      | CRA public assets and HTML manifest.                                                    |
| `Docai/docai-ui/src`                                                         | DocAI app entry, theme, CSS, API client, pages and components.                          |
| `Docai/docai-ui/src/api`                                                     | Axios client and token/error handling.                                                  |
| `Docai/docai-ui/src/components`                                              | Sidebar, field table, intent badge.                                                     |
| `Docai/docai-ui/src/pages`                                                   | Login, dashboard, doc types, parse document, auto-detect, parse history.                |
| `ServiceNow_NLP_Explorer_Reconstructed_Source`                               | Reconstructed ServiceNow NLP Explorer source root.                                      |
| `ServiceNow_NLP_Explorer_Reconstructed_Source/widget`                        | Service Portal widget HTML, client controller, server script, and CSS.                  |
| `ServiceNow_NLP_Explorer_Reconstructed_Source/script-include`                | ServiceNow Script Include wrapping `AgentaryxNlp` REST Message calls.                   |
| `SAP-Salesforce-Integration`                                                 | Salesforce/SAP integration sample root.                                                |
| `SAP-Salesforce-Integration/fiori-app`                                       | SAP UI5/Fiori app package, app router config, Cloud Foundry manifest, and webapp root. |
| `SAP-Salesforce-Integration/fiori-app/webapp`                                | SAP UI5 component, index, app manifest, controller, and view folders.                  |
| `SAP-Salesforce-Integration/fiori-app/webapp/controller`                     | Main SAP UI5/Fiori controller for middleware question calls and UI state.              |
| `SAP-Salesforce-Integration/fiori-app/webapp/view`                           | Main SAP UI5 XML view for query input, status, table, and empty state.                 |
| `SAP-Salesforce-Integration/salesforce/force-app/main/default/classes`        | Apex controller and metadata for SAP BTP/HANA integration.                             |
| `SAP-Salesforce-Integration/salesforce/force-app/main/default/lwc/sapBtpIntegration` | LWC for SAP system selection, login, question prompt, results, and Fiori launch.        |
| `SAP-Salesforce-Integration/sap-middleware`                                  | Node/Express SAP HANA middleware, XSUAA config, Cloud Foundry manifest, package config. |
| `FlowEngine2.0`                                                              | Main FlowEngine module root.                                                            |
| `FlowEngine2.0/backend`                                                      | FlowEngine FastAPI backend.                                                             |
| `FlowEngine2.0/backend/common`                                               | Shared errors, responses, logging, validators.                                          |
| `FlowEngine2.0/backend/common/utils`                                         | Shared time utilities.                                                                  |
| `FlowEngine2.0/backend/core`                                                 | Config, DB, security, dependencies, middleware root.                                    |
| `FlowEngine2.0/backend/core/middleware`                                      | Auth, tenant, and rate-limit middleware.                                                |
| `FlowEngine2.0/backend/modules`                                              | FlowEngine modular backend feature packages.                                            |
| `FlowEngine2.0/backend/modules/accounts`                                     | Tenant/account lifecycle APIs.                                                          |
| `FlowEngine2.0/backend/modules/admins`                                       | Admin auth, CRUD, seed.                                                                 |
| `FlowEngine2.0/backend/modules/api_keys`                                     | Tenant API key APIs.                                                                    |
| `FlowEngine2.0/backend/modules/auth`                                         | Tenant auth/JWT/payment/Keycloak callback flows.                                        |
| `FlowEngine2.0/backend/modules/credential_gateway`                           | Vault-backed datasource and inbox credential gateway.                                   |
| `FlowEngine2.0/backend/modules/datasource_types`                             | Supported datasource drivers and aliases.                                               |
| `FlowEngine2.0/backend/modules/datasources`                                  | Datasource and datasource-config CRUD/test APIs.                                        |
| `FlowEngine2.0/backend/modules/email_inboxes`                                | Connected email inbox APIs.                                                             |
| `FlowEngine2.0/backend/modules/intents`                                      | Intent and intent-policy APIs.                                                          |
| `FlowEngine2.0/backend/modules/module_groups`                                | Admin module group APIs.                                                                |
| `FlowEngine2.0/backend/modules/plans`                                        | Plan models/repository/service support.                                                 |
| `FlowEngine2.0/backend/modules/platforms_modules`                            | Platform module and tenant module assignment APIs.                                      |
| `FlowEngine2.0/backend/modules/rbac`                                         | RBAC role endpoint.                                                                     |
| `FlowEngine2.0/backend/modules/sidebar_items`                                | Dynamic sidebar admin and portal APIs.                                                  |
| `FlowEngine2.0/backend/modules/tenant_purge`                                 | Tenant cleanup API/service.                                                             |
| `FlowEngine2.0/backend/modules/users`                                        | Tenant user CRUD/invite APIs.                                                           |
| `FlowEngine2.0/backend/modules/validation_rules`                             | Validation rule APIs.                                                                   |
| `FlowEngine2.0/backend/notifications`                                        | Email sending service.                                                                  |
| `FlowEngine2.0/backend/notifications/templates`                              | Email HTML templates.                                                                   |
| `FlowEngine2.0/docs`                                                         | FlowEngine repository reference manual.                                                 |
| `FlowEngine2.0/frontend`                                                     | FlowEngine frontend root, shared package marker and logo asset.                         |
| `FlowEngine2.0/frontend/admin`                                               | Admin Vite React app.                                                                   |
| `FlowEngine2.0/frontend/admin/public`                                        | Admin public assets.                                                                    |
| `FlowEngine2.0/frontend/admin/src`                                           | Admin React entry, API client, constants, pages/components.                             |
| `FlowEngine2.0/frontend/admin/src/assets`                                    | Admin image/svg assets.                                                                 |
| `FlowEngine2.0/frontend/admin/src/components`                                | Admin modal/sidebar/auth components.                                                    |
| `FlowEngine2.0/frontend/admin/src/pages`                                     | Admin feature pages.                                                                    |
| `FlowEngine2.0/frontend/admin/src/pages/billing`                             | Admin billing pages.                                                                    |
| `FlowEngine2.0/frontend/tenant`                                              | Tenant Vite React app.                                                                  |
| `FlowEngine2.0/frontend/tenant/src`                                          | Tenant app source root.                                                                 |
| `FlowEngine2.0/frontend/tenant/src/app`                                      | Tenant app and router.                                                                  |
| `FlowEngine2.0/frontend/tenant/src/components/datasources`                   | Datasource picker/logo row.                                                             |
| `FlowEngine2.0/frontend/tenant/src/components/feedback`                      | Banner and popup components.                                                            |
| `FlowEngine2.0/frontend/tenant/src/components/layout`                        | Tenant shell/sidebar/top-level layout.                                                  |
| `FlowEngine2.0/frontend/tenant/src/components/primitives`                    | AppButton, Tooltip, TypeaheadSelect.                                                    |
| `FlowEngine2.0/frontend/tenant/src/components/routing`                       | Protected route.                                                                        |
| `FlowEngine2.0/frontend/tenant/src/config`                                   | Tenant env config.                                                                      |
| `FlowEngine2.0/frontend/tenant/src/lib`                                      | Tenant API clients.                                                                     |
| `FlowEngine2.0/frontend/tenant/src/pages/app`                                | Protected tenant pages.                                                                 |
| `FlowEngine2.0/frontend/tenant/src/pages/public`                             | Landing, registration, payment pages.                                                   |
| `FlowEngine2.0/frontend/tenant/src/providers`                                | Auth, billing events, workspace providers.                                              |
| `FlowEngine2.0/frontend/tenant/src/styles`                                   | Global CSS.                                                                             |
| `FlowEngine2.0/frontend/tenant/src/theme`                                    | Central tenant design tokens.                                                           |
| `FlowEngine2.0/infra/keycloak`                                               | Keycloak realm, Google IdP bootstrap, theme root.                                       |
| `FlowEngine2.0/infra/keycloak/themes/agentryx/login`                         | Custom Keycloak login/logout theme.                                                     |
| `FlowEngine2.0/infra/keycloak/themes/agentryx/login/messages`                | Keycloak login messages.                                                                |
| `FlowEngine2.0/infra/keycloak/themes/agentryx/login/resources/css`           | Keycloak login CSS.                                                                     |
| `FlowEngine2.0/infra/killbill`                                               | FlowEngine-side Kill Bill catalog bootstrap script.                                     |
| `FlowEngine2.0/infra/postgres`                                               | Postgres/Keycloak initialization SQL.                                                   |
| `FlowEngine2.0/infra/vault`                                                  | Vault server config and policy.                                                         |
| `FlowEngine2.0/migrations`                                                   | Alembic migration environment.                                                          |
| `FlowEngine2.0/migrations/versions/versions`                                 | Initial Alembic migration location.                                                     |
| `FlowEngine2.0/scripts`                                                      | FlowEngine scripts package marker.                                                      |
| `FlowEngine2.0/tests`                                                        | FlowEngine test package.                                                                |
| `FlowEngine2.0/tests/integration`                                            | FlowEngine integration tests.                                                           |
| `FlowEngine2.0/tests/unit`                                                   | FlowEngine unit test root.                                                              |
| `FlowEngine2.0/tests/unit/modules`                                           | FlowEngine module unit tests.                                                           |
| `FlowEngine2.0/tools`                                                        | FlowEngine helper tooling.                                                              |
| `KillBill`                                                                   | KillBill catalog/scripts/root helpers.                                                  |
| `KillBill/gateway`                                                           | Active Node billing gateway.                                                            |
| `orchestration`                                                              | Orchestration module root.                                                              |
| `orchestration/db-init`                                                      | Demo domain SQL loaded into Orchestration Postgres.                                     |
| `orchestration/docs/adr`                                                     | Orchestration architecture decision record.                                             |
| `orchestration/frontend`                                                     | Orchestration Vite React app.                                                           |
| `orchestration/frontend/src`                                                 | Orchestration frontend source root.                                                     |
| `orchestration/frontend/src/assets`                                          | Orchestration image/svg assets.                                                         |
| `orchestration/frontend/src/components`                                      | Agent/layout/auth/UI components.                                                        |
| `orchestration/frontend/src/components/auth`                                 | Protected route.                                                                        |
| `orchestration/frontend/src/components/layout`                               | App layout/sidebar.                                                                     |
| `orchestration/frontend/src/components/ui`                                   | Skeleton/UI primitives.                                                                 |
| `orchestration/frontend/src/context`                                         | Auth context.                                                                           |
| `orchestration/frontend/src/pages`                                           | Orchestration routed pages.                                                             |
| `orchestration/frontend/src/pages/admin`                                     | Admin console page.                                                                     |
| `orchestration/frontend/src/pages/approvals`                                 | Approvals page.                                                                         |
| `orchestration/frontend/src/pages/billing`                                   | Usage billing page.                                                                     |
| `orchestration/frontend/src/pages/copilot`                                   | AI Copilot page.                                                                        |
| `orchestration/frontend/src/pages/dashboard`                                 | Dashboard page.                                                                         |
| `orchestration/frontend/src/pages/datasources`                               | Datasource catalog page.                                                                |
| `orchestration/frontend/src/pages/domainpacks`                               | Domain packs page.                                                                      |
| `orchestration/frontend/src/pages/evidence`                                  | Evidence viewer page.                                                                   |
| `orchestration/frontend/src/pages/execute`                                   | Execute and execution monitor pages/tests.                                              |
| `orchestration/frontend/src/pages/history`                                   | Execution history/detail pages.                                                         |
| `orchestration/frontend/src/pages/itsm`                                      | ITSM tickets page.                                                                      |
| `orchestration/frontend/src/pages/knowledge`                                 | Knowledge graph page.                                                                   |
| `orchestration/frontend/src/pages/plans`                                     | Plan CRUD/detail/history/canvas/canary pages/tests.                                     |
| `orchestration/frontend/src/services`                                        | API/auth/history clients.                                                               |
| `orchestration/frontend/src/types`                                           | TypeScript types.                                                                       |
| `orchestration/mock_services`                                                | Mock adapter/evidence/LLM services.                                                     |
| `orchestration/services`                                                     | Orchestration backend services root.                                                    |
| `orchestration/services/agent`                                               | Agent runtime, tools, approval, budget, validation.                                     |
| `orchestration/services/common`                                              | LLM client.                                                                             |
| `orchestration/services/eivs`                                                | EIVS adapter/intent/validation services.                                                |
| `orchestration/services/eivs/models_runtime`                                 | Runtime intent request model.                                                           |
| `orchestration/services/executors`                                           | Step executor implementations and registry.                                             |
| `orchestration/services/models`                                              | Runtime context model.                                                                  |
| `orchestration/services/tests`                                               | Orchestration backend tests.                                                            |
| `PromptBuilder`                                                              | PromptBuilder module root.                                                              |
| `PromptBuilder/backend`                                                      | PromptBuilder backend, compose, Docker, requirements.                                   |
| `PromptBuilder/backend/db/migrations`                                        | PromptBuilder DB migration.                                                             |
| `PromptBuilder/backend/kasetti-db`                                           | PromptBuilder demo datasource seed SQL.                                                 |
| `PromptBuilder/backend/src`                                                  | PromptBuilder backend source root.                                                      |
| `PromptBuilder/backend/src/adapter`                                          | Datasource adapter/model helpers.                                                       |
| `PromptBuilder/backend/src/api`                                              | PromptBuilder active and present-but-unmounted API modules.                             |
| `PromptBuilder/backend/src/core`                                             | Prompt compiler, context, validation, orchestration, audit, resolver, versioning.       |
| `PromptBuilder/backend/src/core/renderers`                                   | Document renderers.                                                                     |
| `PromptBuilder/frontend`                                                     | PromptBuilder Vite React UI.                                                            |
| `PromptBuilder/frontend/src`                                                 | PromptBuilder frontend source root.                                                     |
| `PromptBuilder/frontend/src/api`                                             | API clients.                                                                            |
| `PromptBuilder/frontend/src/components/layout`                               | App layout/sidebar.                                                                     |
| `PromptBuilder/frontend/src/components/prompts`                              | Prompt editor panels.                                                                   |
| `PromptBuilder/frontend/src/components/shared`                               | Shared UI components.                                                                   |
| `PromptBuilder/frontend/src/pages`                                           | PromptBuilder routed pages.                                                             |
| `PromptBuilder/frontend/src/styles`                                          | App shell styling.                                                                      |
| `PromptBuilder/frontend/src/types`                                           | TypeScript API types.                                                                   |
| `TemplateBuilder`                                                            | TemplateBuilder module root.                                                            |
| `TemplateBuilder/template-builder-engine`                                    | Backend/worker/compose/docs/demo data/root artifacts.                                   |
| `TemplateBuilder/template-builder-engine/backend`                            | Backend config, DB, schemas, source.                                                    |
| `TemplateBuilder/template-builder-engine/backend/src`                        | TemplateBuilder backend source root.                                                    |
| `TemplateBuilder/template-builder-engine/backend/src/adapter`                | Datasource adapter/model helpers.                                                       |
| `TemplateBuilder/template-builder-engine/backend/src/api`                    | TemplateBuilder API modules.                                                            |
| `TemplateBuilder/template-builder-engine/backend/src/core`                   | Core models, resolver, audit, versioning.                                               |
| `TemplateBuilder/template-builder-engine/backend/src/core/renderers`         | Document renderers.                                                                     |
| `TemplateBuilder/template-builder-engine/db/migrations`                      | TemplateBuilder app DB migration.                                                       |
| `TemplateBuilder/template-builder-engine/docs`                               | Architecture docs.                                                                      |
| `TemplateBuilder/template-builder-engine/frontend`                           | Older/skeletal frontend inside engine folder.                                           |
| `TemplateBuilder/template-builder-engine/frontend/src`                       | Older/skeletal frontend source.                                                         |
| `TemplateBuilder/template-builder-engine/frontend/src/components`            | Older/skeletal editor components.                                                       |
| `TemplateBuilder/template-builder-engine/frontend/src/components/services`   | Older/skeletal frontend API/UI services.                                                |
| `TemplateBuilder/template-builder-engine/phases/config/semantic_model_yaml`  | Loan semantic model YAML.                                                               |
| `TemplateBuilder/template-builder-engine/phases/openapi`                     | Template engine OpenAPI reference.                                                      |
| `TemplateBuilder/template-builder-engine/phases/seed`                        | Phase seed datasource SQL.                                                              |
| `TemplateBuilder/template-builder-engine/sql/kasetti-db`                     | TemplateBuilder demo datasource seed SQL.                                               |
| `TemplateBuilder/template-builder-ui`                                        | Active TemplateBuilder Vite React UI.                                                   |
| `TemplateBuilder/template-builder-ui/__mocks__`                              | Jest mocks.                                                                             |
| `TemplateBuilder/template-builder-ui/public`                                 | Public assets/icons.                                                                    |
| `TemplateBuilder/template-builder-ui/src`                                    | Active UI source root.                                                                  |
| `TemplateBuilder/template-builder-ui/src/__tests__`                          | Jest test root.                                                                         |
| `TemplateBuilder/template-builder-ui/src/__tests__/api`                      | API client tests.                                                                       |
| `TemplateBuilder/template-builder-ui/src/__tests__/components`               | Component tests.                                                                        |
| `TemplateBuilder/template-builder-ui/src/__tests__/components/editor`        | Editor component tests.                                                                 |
| `TemplateBuilder/template-builder-ui/src/__tests__/components/editor/blocks` | Block component tests.                                                                  |
| `TemplateBuilder/template-builder-ui/src/__tests__/components/layout`        | Layout tests.                                                                           |
| `TemplateBuilder/template-builder-ui/src/__tests__/components/shared`        | Shared UI tests.                                                                        |
| `TemplateBuilder/template-builder-ui/src/__tests__/pages`                    | Page tests.                                                                             |
| `TemplateBuilder/template-builder-ui/src/api`                                | API clients.                                                                            |
| `TemplateBuilder/template-builder-ui/src/assets`                             | UI image/svg assets.                                                                    |
| `TemplateBuilder/template-builder-ui/src/components`                         | Modal/editor/layout/shared components.                                                  |
| `TemplateBuilder/template-builder-ui/src/components/editor`                  | Active document editor components.                                                      |
| `TemplateBuilder/template-builder-ui/src/components/editor/blocks`           | Active block components.                                                                |
| `TemplateBuilder/template-builder-ui/src/components/layout`                  | Active app layout/sidebar.                                                              |
| `TemplateBuilder/template-builder-ui/src/components/shared`                  | Shared UI components.                                                                   |
| `TemplateBuilder/template-builder-ui/src/pages`                              | Active routed pages.                                                                    |
| `TemplateBuilder/template-builder-ui/src/styles`                             | Active page/shared styles.                                                              |
| `TemplateBuilder/template-builder-ui/src/types`                              | Shared API types.                                                                       |

## Final File-Audit Additions

These details were added or clarified after the full tracked-file scan because they are easy to miss when reading only the main module READMEs.

Root-level governance:

- The root `.gitignore` is the active repo-wide secret safety file. It ignores all `.env` and `.env.*` files except `.env.example`, and also ignores generated runtime state for KillBill gateway, local DBs, dependency folders, build outputs, local audit/tool folders, IDE folders, and compose overrides.
- The root `.gitattributes` protects Linux container-mounted files from Windows CRLF issues by forcing LF on shell/config/Docker/YAML/HCL files and CRLF on PowerShell scripts.

FlowEngine2.0 additions:

- `FlowEngine2.0/docs/REPOSITORY_REFERENCE.md` is an additional FlowEngine-specific reference manual and notes placeholder/incomplete areas. The root README does not replace that file; it documents the current repo alongside it.
- `FlowEngine2.0/frontend/package.json` is a minimal root frontend package marker containing only `react-router-dom`; the active runnable apps are `frontend/admin` and `frontend/tenant`.
- `FlowEngine2.0/frontend/admin/dashboard.html` is still tracked as a legacy/static admin HTML artifact. The active admin app is the Vite React app under `frontend/admin/src`.
- `FlowEngine2.0/backend/modules/credential_gateway/vault.py` includes `_VaultStub` and `_VaultClient` style behavior. That means credential flows must be tested with real Vault configuration, not inferred from the stub path.
- `FlowEngine2.0/scripts/__init__.py` is only a Python package marker in the tracked repo.
- `FlowEngine2.0/tests` contains actual unit/integration tests, but some package `__init__.py` files are structural markers only.
- `FlowEngine2.0/migrations/versions/versions/4102758f0241_initial_schema.py` exists alongside `init_schema.sql`; startup behavior should be verified against `backend/core/database.py` before assuming Alembic alone creates the active schema.

KillBill additions:

- `KillBill/server.js` and `KillBill/webhook-listener.js` are tracked helper/legacy Node files separate from the active gateway. The active gateway is `KillBill/gateway/index.js`.
- `KillBill/gateway/catalog-sync.js` is the catalog/product sync helper used by the gateway.
- `KillBill/gateway/package-lock.json` locks gateway Node dependencies; it is a generated dependency artifact, not custom application logic.
- PowerShell scripts `00` through `08` are manual/fallback billing workflow scripts and should be treated as operational scripts, not automatically executed by FlowEngine Compose except where explicitly called by a developer.

Orchestration additions:

- `orchestration/package-lock.json` exists at module root but contains an empty package map and no sibling root `package.json`; the actual frontend package is `orchestration/frontend/package.json`.
- `orchestration/mock_services/evidence_service.py` and `llm_service.py` are tracked, but `docker-compose.yml` currently starts the adapter command. Evidence and LLM mock usage should be verified before assuming they are active in Compose.
- `orchestration/docs/adr/ADR-001-eivs-orchestration-integration.md` documents EIVS plus Orchestration architecture decisions and includes current-state/target-state context.
- `orchestration/frontend/src/pages/plans/__tests__` and `orchestration/frontend/src/pages/execute/__tests__` contain frontend tests for selected plan/execution pages.
- `orchestration/services/tests` contains backend executor/agent/EIVS integration tests.

PromptBuilder additions:

- `PromptBuilder/backend/src/api/blocks.py`, `templates.py`, `placeholders.py`, `tests.py`, `marketplace.py`, `import_routes.py`, `import_template.py`, `render.py`, and `ui.py` are tracked source files, but they are not mounted by `PromptBuilder/backend/src/main.py` today unless that file is changed.
- `PromptBuilder/backend/src/worker.py` is tracked but no worker service is defined in `PromptBuilder/backend/docker-compose.yml`.
- `PromptBuilder/backend/src/core/renderers` contains renderer implementations shared conceptually with TemplateBuilder-style document behavior.
- `PromptBuilder/backend/kasetti-db` contains domain datasource SQL for banking, finance, health, insurance, and manufacturing.
- `PromptBuilder/frontend/src/styles/app-shell.css` is where the UI reskin styling is concentrated alongside component-level styles.

TemplateBuilder additions:

- `TemplateBuilder/template-builder-engine/debug_test.sh` and `test_phase-1.sh` are tracked shell test/debug scripts.
- `TemplateBuilder/template-builder-engine/filelist.txt` is a tracked text inventory/reference artifact.
- `TemplateBuilder/template-builder-engine/NOC_LN12345.pdf` and `NOC_LN99999.pdf` are tracked sample generated PDF artifacts.
- `TemplateBuilder/template-builder-engine/frontend` is not the active UI used by the current setup. The active UI is `TemplateBuilder/template-builder-ui`.
- `TemplateBuilder/template-builder-engine/phases` contains reference semantic model/OpenAPI/seed artifacts, not the primary runtime API implementation.
- `TemplateBuilder/template-builder-ui/__mocks__` and `src/__tests__` provide Jest mocks and broad UI/API test coverage for the active UI.
- `TemplateBuilder/template-builder-ui/src/api/documents.ts` also stores generated job metadata in browser `localStorage`; backend job state and local UI cache are separate concerns.

DocAI additions:

- `Docai/docai-ui/package-lock.json` is large because it locks the CRA/MUI/react dependency tree; it is not hand-authored app logic.
- `Docai/docai-ui/public` contains default CRA/static assets and manifest files.
- `Docai/docai_service/scripts/setup_base.sh`, `setup_python_env.sh`, `setup_postgres_pgvector.sh`, `run_migrations.sh`, `start_mlflow.sh`, `pull_docker_images.sh`, `generate_fixtures.py`, and `generate_test_fixtures.py` are operational/setup/test-data scripts.
- `Docai/docai_service/config/prometheus.yml`, `config/grafana/datasources/prometheus.yml`, and `config/grafana/dashboards/docai_dashboard.json` are monitoring configuration files.
- `Docai/docai_service/k8s/secret.yaml` contains replacement placeholders and must not be used without real base64-encoded secrets.
- `Docai/docai_service/tests/fixtures` contains sample PDF, DOCX, PNG, and text fixtures used by parser/compliance/e2e tests.
- `Docai/docai_service/app/db.py` only calls `Base.metadata.create_all()` automatically in SQLite mode. In Postgres mode, SQL migrations must cover required tables or tests/setup must create them separately.

## Global Architecture

AgentryX is currently a collection of related but independently runnable product modules:

- `FlowEngine2.0` is the operational SaaS core. It manages tenants, modules, sidebar access, datasource catalog/configuration, credentials in Vault, users, API keys, intents, validation rules, connected inboxes, billing subscriptions, Keycloak auth, and tenant/admin UI entry points.
- `KillBill` provides subscription billing support for FlowEngine. FlowEngine's Docker Compose starts the Kill Bill server, MariaDB, catalog bootstrapper, and Node gateway from this folder.
- `orchestration` is an independent workflow orchestration application. It can run by itself with its own Postgres database, backend API, mock adapter service, and React UI.
- `PromptBuilder` is an independent prompt lifecycle application. It can run by itself with a FastAPI backend, React UI, PromptBuilder database, and demo Kasetti datasource database.
- `TemplateBuilder` is an independent document template application. It can run by itself with a FastAPI backend, worker, Postgres database, Redis, demo Kasetti datasource database, and React UI.
- `Docai` is an independent document AI service and UI. Its checked-in Docker Compose starts infrastructure only; the API and UI are run manually unless additional compose wiring is added later.

There is no checked-in root-level `docker-compose.yml`, `package.json`, or workspace manager. Start each module from its own folder.

## Visual Design System Status

The FlowEngine tenant UI established the shared AgentryX light SaaS visual language used across the updated UIs:

- Light-only backgrounds built on white and light neutral surfaces.
- Blue primary actions and soft slate/neutral text.
- Rounded cards, subtle borders, polished shadows, compact enterprise form spacing, and consistent sidebars.
- Centralized tokens in FlowEngine tenant under `FlowEngine2.0/frontend/tenant/src/theme/`.
- UI-only reskins were later applied to `orchestration`, `PromptBuilder`, `TemplateBuilder`, and `Docai` to visually align with FlowEngine.

Important implementation detail: the apps do not import a shared design package. Each project owns its own local CSS/tokens/styling, so every app can run independently without a runtime dependency on FlowEngine.

## Root Files

### `.gitattributes`

This file exists to keep cross-platform Docker and script behavior stable:

- `* text=auto` lets Git normalize normal text files.
- `*.sh`, `*.bash`, `Dockerfile`, `*.conf`, `*.hcl`, `*.yml`, and `*.yaml` are forced to LF because they are mounted into Linux containers.
- `*.ps1` is forced to CRLF because the KillBill scripts are primarily run from Windows PowerShell.

### `.gitignore`

This file is security-critical. It excludes:

- All real `.env` files while allowing committed `.env.example` files.
- Python caches, virtual environments, pytest/mypy/coverage outputs.
- Node `node_modules`, `dist`, `build`, coverage, npm/vite caches, and TypeScript build info.
- Logs, temp files, local DB files, SQLite files, backups, and generated runtime artifacts.
- KillBill gateway runtime files such as `plans.json`, `payments.json`, `usage-data.json`, `trial-usage.db`, and billing config JSON.
- Local tool/audit directories such as `.agents/`, `.codex/`, and `.codex-audit/`.
- IDE/OS files and local compose overrides.

Developers should commit `.env.example` files and runbooks, but never commit real local `.env` files or generated runtime DB/JSON files.

## Port Matrix And Conflict Notes

Only run multiple modules together if their ports do not conflict or you intentionally edit local ports.

| Module                      | Main local URLs/ports                                                                                                                                                                                                                                                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FlowEngine full stack       | Tenant UI `http://localhost:3000`, Admin UI `http://localhost:5000`, backend `http://localhost:8001`, Keycloak `http://localhost:7000`, Vault `http://localhost:8201`, FlowEngine Postgres host port `5433`, Kill Bill `http://localhost:8080`, KillBill gateway `http://localhost:3002`, gateway webhooks/socket `3005`, KillBill MariaDB `3306`. |
| KillBill gateway standalone | Gateway normally listens on `3002` and uses webhook/socket support around `3005` when run from FlowEngine Compose or manually.                                                                                                                                                                                                                     |
| Orchestration               | Frontend `http://localhost:3100`, backend `http://localhost:8060`, mock adapter `http://localhost:8101`, Postgres host port `5434`.                                                                                                                                                                                                                |
| PromptBuilder               | Frontend container `http://localhost:5174`, backend `http://localhost:10002`, demo Kasetti datasource DB host port `5434`, app DB internal only.                                                                                                                                                                                                   |
| TemplateBuilder             | Backend `http://localhost:10001`, demo Kasetti datasource DB host port `5433`, app DB internal only, Redis internal only, frontend usually Vite local default `http://localhost:5173` unless changed.                                                                                                                                              |
| DocAI                       | UI Create React App default `http://localhost:3000`, API is commonly run on `http://localhost:8001` to match the UI default, Postgres `5432`, Weaviate `8080`, Grafana `3000`, Prometheus `9090`.                                                                                                                                                  |

Known conflicts:

- FlowEngine tenant UI and DocAI UI/Grafana both use `3000`.
- FlowEngine Kill Bill and DocAI Weaviate both use `8080`.
- FlowEngine Postgres and TemplateBuilder demo datasource both use `5433`.
- Orchestration Postgres and PromptBuilder demo datasource both use `5434`.
- FlowEngine backend and DocAI UI default API target can both involve `8001`.

Safest workflow: stop all Docker services before switching modules unless you deliberately adjusted ports.

## FlowEngine2.0

### Purpose

`FlowEngine2.0` is the main AgentryX tenant/admin SaaS platform. It combines:

- A modular FastAPI backend.
- A tenant-facing React app at `frontend/tenant`.
- An admin-facing React app at `frontend/admin`.
- PostgreSQL schemas for auth and EIVS-style application data.
- Keycloak identity provider and custom AgentryX login/logout theme.
- Vault credential storage.
- Kill Bill billing integration through the sibling `KillBill` folder.
- Docker Compose orchestration for the full FlowEngine plus Kill Bill runtime.

The backend root path redirects to the configured admin hub/tenant UI URL. In Docker, the tenant UI is served on port `3000`, and the admin UI is served on port `5000`.

### Major Features

Tenant and module lifecycle:

- Tenant registration and account creation.
- Default module assignment during registration.
- Tenant module assignment and removal.
- Available-module discovery for tenants.
- Billing-backed module subscription checks.
- Dynamic tenant sidebar rendering based on assigned modules, sidebar definitions, `primary`/`more` section, and `hidden_from_module_user`.
- Tenant purge endpoints for administrative cleanup.

Authentication and authorization:

- Keycloak OAuth/OIDC login callback.
- JWT issuing, refresh, billing token, and user-token flows.
- Custom Keycloak login/logout theme under `infra/keycloak/themes/agentryx`.
- Google identity provider bootstrap from FlowEngine `.env`.
- Tenant context middleware and auth middleware.
- Superadmin seeding at backend startup.
- Role-based API behavior for tenant admin versus tenant module user.

Admin console:

- Register client/tenant accounts.
- Manage clients.
- Manage platform modules and module groups.
- Manage dynamic sidebar items.
- Manage admins.
- Manage supported datasource types and aliases.
- Billing admin pages for dashboard, customers, customer detail, subscriptions, payments, revenue, config, and plans.

Tenant console:

- Landing page, registration page, and payment result page.
- Dashboard overview.
- Datasource CRUD.
- Datasource configuration CRUD and connection testing.
- Vault-backed datasource credential setup.
- Connected email inbox CRUD, credential save, and test connection.
- Intent CRUD.
- Intent policy CRUD.
- Validation rule CRUD and next-order lookup.
- Playground execution support using datasource credentials/config.
- User management and invitations.
- Roles and permissions view.
- API key generation/list/current/delete.
- Billing subscription, invoices, payment methods, usage, health, and subscribe/checkout flows.

Credential and datasource management:

- Supported datasource types are stored in `eivs.driver_definitions`.
- Datasource aliases are stored in `eivs.driver_aliases`.
- Datasources are stored in `eivs.datasources`.
- Datasource configs are stored in `eivs.datasource_configs`.
- Credential paths are stored on datasource config rows through `vault_secret_path`.
- Actual secrets are stored in Vault, not directly in Postgres.
- Supported connector logos in the tenant UI are local/static mappings with CDN fallbacks in `DatasourceOptionRow.jsx`.

Billing:

- FlowEngine backend talks to KillBill gateway using `KILLBILL_GATEWAY_URL`.
- Tenant access to modules is expected to depend on active subscription/module assignment behavior.
- KillBill catalog bootstrap is automated through the FlowEngine Compose service `killbill-catalog-bootstrap`.
- The tenant billing page shows subscriptions, invoices/payment-related views, usage, health, and subscribe flows.

### Folder Structure

`FlowEngine2.0/backend/`:

- `main.py`: FastAPI app factory and router registration. Initializes DB and seeds superadmin at startup.
- `common/`: shared exceptions, response helpers, logging, validators, and time utilities.
- `core/`: settings, database initialization, dependencies, password/JWT security helpers, and middleware.
- `core/middleware/auth.py`: bearer/tenant auth enforcement and module access behavior.
- `core/middleware/tenant.py`: tenant context behavior.
- `core/middleware/rate_limit.py`: rate limit middleware support.
- `modules/accounts/`: account registration, tenant account admin APIs, API key lookup, module list APIs, tenant upgrade/edit/delete flows.
- `modules/admins/`: admin auth/me/logout, admin CRUD, and startup superadmin seed logic.
- `modules/api_keys/`: tenant API key generate/list/me/delete.
- `modules/auth/`: tenant auth registration/token/logout/refresh/payment verification/billing token plus Keycloak callback router.
- `modules/credential_gateway/`: Vault-backed datasource and email inbox credential test/save/delete/metadata-confirmed flows.
- `modules/datasource_types/`: admin datasource driver definitions and aliases.
- `modules/datasources/`: datasource CRUD, datasource config CRUD, driver/protocol lookups, config test.
- `modules/email_inboxes/`: email inbox CRUD, test, and supported inbox types.
- `modules/intents/`: intent CRUD plus intent policy CRUD.
- `modules/module_groups/`: admin module group CRUD.
- `modules/plans/`: plan models/repository/service code used by billing/admin plan behavior.
- `modules/platforms_modules/`: platform module CRUD, tenant module assignment, my-modules, available-modules, add-module.
- `modules/rbac/`: roles endpoint.
- `modules/sidebar_items/`: admin sidebar item CRUD and tenant portal sidebar endpoint.
- `modules/tenant_purge/`: tenant cleanup endpoint/service.
- `modules/users/`: tenant user CRUD/invite behavior.
- `modules/validation_rules/`: validation rule CRUD and next order lookup.
- `notifications/`: email sending service and `metadata_confirmed.html` template.

`FlowEngine2.0/frontend/admin/`:

- Standalone Vite/React admin application.
- `App.jsx`: admin routes.
- `components/`: modal components for create/edit/delete operations, auth guard, sidebar, field modal, upgrade client modal.
- `pages/`: admin management pages.
- `pages/billing/`: billing admin dashboard/customer/subscription/payment/revenue/config/plan pages.
- `dashboard.html`: legacy/static admin HTML artifact still tracked; the active admin React app uses `index.html` and `src/App.jsx`.
- `Dockerfile.admin` and `nginx.conf`: production container serving built admin UI.

`FlowEngine2.0/frontend/tenant/`:

- Standalone Vite/React tenant application.
- `src/app/TenantRouter.jsx`: public and protected tenant routes.
- `src/components/layout/AppShell.jsx`: tenant shell, dynamic module tabs/sidebar, session card, billing shortcut, mobile/responsive layout.
- `src/components/primitives/`: reusable `AppButton`, `Tooltip`, and `TypeaheadSelect`.
- `src/components/datasources/DatasourceOptionRow.jsx`: datasource picker rows with product logo mappings and fallbacks.
- `src/components/feedback/`: banner, first-login popup, metadata popup.
- `src/lib/`: API clients for auth/billing/datasources/configs/credentials/inboxes/intents/rules/users/roles/playground/API keys.
- `src/pages/public/`: landing, registration, payment result.
- `src/pages/app/`: all protected tenant pages.
- `src/providers/`: auth, billing events, tenant workspace context.
- `src/theme/`: central design tokens, typography, button tokens, tooltip tokens, and theme provider.
- `src/styles/global.css`: global light SaaS styling.
- `Dockerfile` and `nginx.conf`: production tenant container.

`FlowEngine2.0/infra/`:

- `keycloak/realm-export.json`: realm import. The active client id is `agentryx-app`; the realm is still named `flowengine`.
- `keycloak/bootstrap-google-idp.py`: configures Google IdP from `.env`.
- `keycloak/themes/agentryx/`: custom login/logout FTL templates, messages, CSS, and theme properties.
- `killbill/bootstrap-catalog.sh`: waits for Kill Bill and uploads the catalog XML.
- `postgres/init-keycloak-db.sql`: initializes Keycloak DB/schema inside the FlowEngine Postgres container.
- `vault/vault.hcl`: Vault server configuration.
- `vault/adapter-tenant-jwt-policy.hcl`: Vault policy for adapter/tenant JWT use.

`FlowEngine2.0/migrations/`:

- Alembic environment and initial migration files. The active startup path also uses `init_schema.sql`.

`FlowEngine2.0/tests/`:

- Unit tests for accounts/auth/plans modules.
- Integration tests for datasource and login flows.

`FlowEngine2.0/tools/`:

- `create_api_key.py` helper.

### Backend API Surface

Health:

- `GET /`
- `GET /health`

Auth:

- `POST /auth/logout`
- `POST /auth/refresh`
- `POST /auth/register`
- `GET /auth/me`
- `POST /auth/payment/verify`
- `POST /auth/upgrade-to-production`
- `POST /auth/user-token`
- `POST /auth/token`
- `GET /auth/billing-token`
- `GET /auth/billing-verify`
- `GET /auth/keycloak/callback`

Accounts and public modules:

- `GET /api/modules`
- `POST /api/accounts`
- `GET /api/accounts`
- `GET /api/accounts/{email}`
- `DELETE /api/accounts/{email}`
- `PATCH /api/accounts/{email}/upgrade`
- `PATCH /api/accounts/{email}/edit`
- `GET /api/accounts/{email}/apikey`
- `GET /api/public/modules`

Admin:

- `POST /admin/auth/logout`
- `GET /admin/auth/me`
- `POST /admin/admins`
- `GET /admin/admins`
- `PATCH /admin/admins/{admin_id}`
- `DELETE /admin/admins/{admin_id}`

Modules, module groups, sidebar:

- `GET /admin/modules`
- `GET /admin/modules/default`
- `GET /admin/modules/public/list`
- `GET /admin/modules/public/list-all`
- `GET /admin/modules/{module_id}`
- `POST /admin/modules`
- `PATCH /admin/modules/{module_id}`
- `DELETE /admin/modules/{module_id}`
- `GET /admin/modules/tenant/{tenant_id}`
- `POST /admin/modules/tenant/{tenant_id}/assign`
- `DELETE /admin/modules/tenant/{tenant_id}/module/{module_id}`
- `GET /portal/my-modules`
- `GET /portal/available-modules`
- `POST /portal/add-module`
- `GET /admin/module-groups`
- `GET /admin/module-groups/{group_id}`
- `POST /admin/module-groups`
- `PATCH /admin/module-groups/{group_id}`
- `DELETE /admin/module-groups/{group_id}`
- `GET /admin/sidebar-items`
- `GET /admin/sidebar-items/{item_id}`
- `POST /admin/sidebar-items`
- `PATCH /admin/sidebar-items/{item_id}`
- `DELETE /admin/sidebar-items/{item_id}`
- `GET /portal/sidebar-items`

Datasources and configs:

- `GET /datasources`
- `GET /datasources/{datasource_id}`
- `POST /datasources`
- `PUT /datasources/{datasource_id}`
- `DELETE /datasources/{datasource_id}`
- `GET /datasource-configs`
- `GET /datasource-configs/by-name/{name}`
- `GET /datasource-configs/driver/{driver_family}`
- `GET /datasource-configs/protocol/{protocol}`
- `GET /datasource-configs/{config_id}`
- `POST /datasource-configs`
- `PUT /datasource-configs/{config_id}`
- `DELETE /datasource-configs/{config_id}`
- `POST /datasource-configs/{config_id}/test`

Datasource types:

- `GET /admin/datasource-types/public`
- `GET /admin/datasource-types`
- `GET /admin/datasource-types/{driver_id}`
- `POST /admin/datasource-types`
- `PATCH /admin/datasource-types/{driver_id}`
- `DELETE /admin/datasource-types/{driver_id}`
- `GET /admin/datasource-types/{driver_id}/aliases`
- `POST /admin/datasource-types/{driver_id}/aliases`
- `DELETE /admin/datasource-types/aliases/{alias_id}`

Credential gateway:

- `GET /flowengine/datasources`
- `POST /test-connection`
- `PUT /save-credentials`
- `DELETE /vault/delete`
- `POST /email-inbox/test-connection`
- `PUT /email-inbox/save-credentials`
- `POST /credentials/metadata-confirmed`

Email inboxes:

- `GET /api/email-inboxes`
- `GET /api/email-inboxes/{inbox_id}`
- `POST /api/email-inboxes`
- `PUT /api/email-inboxes/{inbox_id}`
- `DELETE /api/email-inboxes/{inbox_id}`
- `POST /api/email-inboxes/{inbox_id}/test`
- `GET /api/email-inbox-types`

Intents, policies, rules:

- `GET /intents`
- `GET /intents/{intent_id}`
- `POST /intents`
- `PUT /intents/{intent_id}`
- `DELETE /intents/{intent_id}`
- `GET /intents/policies/all`
- `GET /intents/policies`
- `GET /intents/{intent_id}/policies`
- `POST /intents/{intent_id}/policies`
- `GET /intents/{intent_id}/policies/{language_code}`
- `PUT /intents/{intent_id}/policies/{language_code}`
- `DELETE /intents/{intent_id}/policies/{language_code}`
- `GET /validation-rules`
- `GET /validation-rules/{rule_id}`
- `GET /validation-rules/intent/{intent_id}/language/{language_code}`
- `GET /validation-rules/next-order/{intent_id}`
- `POST /validation-rules`
- `PUT /validation-rules/{rule_id}`
- `DELETE /validation-rules/{rule_id}`

Users, RBAC, API keys:

- `POST /users`
- `GET /users`
- `GET /users/{user_id}`
- `PATCH /users/{user_id}`
- `DELETE /users/{user_id}`
- `GET /rbac/roles`
- `POST /portal/api-keys/generate`
- `GET /portal/api-keys`
- `GET /portal/api-keys/me`
- `DELETE /portal/api-keys`

Tenant purge:

- `DELETE /admin/tenants/...` route is declared in `backend/modules/tenant_purge/routes.py`; inspect that file for the exact parameterized path before calling manually.

### Database Schema

`init_schema.sql` creates:

- `auth` schema.
- `eivs` schema.
- `auth.tenant_milestones`.
- `auth.module_groups`.
- `auth.modules`.
- `auth.api_clients`.
- `auth.sidebar_items`.
- `eivs.datasources`.
- `eivs.datasource_configs`.
- `eivs.intents`.
- `eivs.intent_policies`.
- `eivs.validation_rules`.
- `eivs.email_inboxes`.
- `eivs.email_sync_logs`.
- `eivs.driver_definitions`.
- `eivs.driver_aliases`.

Seeded module data includes default modules such as `email_validate`, `data`, and `sql_query`. Seeded sidebar items include dashboard, datasources, datasource configs, intents, intent policies, validation rules, setup credentials, playground, users, roles/RBAC, API keys, and connected inboxes. Supported datasource driver definitions and aliases are seeded later in the file.

### Tech Stack

- Backend: Python, FastAPI, Uvicorn, SQLAlchemy, psycopg3, psycopg2, Alembic, Pydantic, pydantic-settings.
- Auth/security: Keycloak, JWT via python-jose, passlib/bcrypt, custom middleware.
- Secrets: HashiCorp Vault via `hvac`.
- Databases: PostgreSQL 15 for FlowEngine and Keycloak; MariaDB for Kill Bill.
- Billing: Kill Bill server, KillBill gateway Node/Express, Stripe SDK in frontend/gateway, Razorpay placeholder gateway support.
- Frontend tenant/admin: React 19, Vite, React Router 7, Recharts in admin, Socket.IO client in tenant.
- Connectors: Snowflake connector, ODBC/pyodbc, OracleDB, MSSQL ODBC driver support.
- Notifications: SMTP/Gmail-compatible email.
- Containers: Docker, Nginx frontend containers, Keycloak container, Vault container.
- Tests: pytest, pytest-asyncio, frontend build/lint scripts where present.

### Docker Startup

From `FlowEngine2.0`:

```powershell
Copy-Item .env.example .env
# edit .env with real local values
docker compose up --build -d
```

Required sibling dependency: `../KillBill/catalog.xml` and `../KillBill/gateway` must exist because FlowEngine Compose mounts/builds from the sibling `KillBill` folder.

Expected key services:

- `flowengine-postgres-2`
- `flowengine-vault-2`
- `killbill-mariadb`
- `killbill-server`
- `killbill-catalog-bootstrap`
- `killbill-gateway`
- `flowengine-keycloak`
- `keycloak-google-bootstrap`
- `flowengine-app-2`
- `tenant-ui`
- `admin-ui`

### Required Configuration

Committed template: `FlowEngine2.0/.env.example`.

Important variables include:

- `APP_NAME`, `APP_VERSION`, `DEBUG`, `ENVIRONMENT`.
- `DATABASE_URL`.
- `JWT_SECRET`, `JWT_ALGORITHM`, `JWT_TTL_HOURS`, `PASSWORD_TOKEN_TTL_HOURS`.
- `FRONTEND_BASE_URL`, `ADMIN_HUB_URL`, `ADMIN_UI_URL`, `PORTAL_URL`.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`.
- `VAULT_ADDR`, `VAULT_TOKEN`, `VAULT_KV_MOUNT`, `VAULT_ROLE_ID`, `VAULT_SECRET_ID`, `VAULT_AUTH_METHOD`.
- `MSSQL_ODBC_DRIVER`.
- `SUPER_ADMIN_USERNAME`, `SUPER_ADMIN_PASSWORD`.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.
- `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`, `KEYCLOAK_EXTERNAL_URL`, `KEYCLOAK_INTERNAL_EXTERNAL_URL`, `KEYCLOAK_ADMIN_USERNAME`, `KEYCLOAK_ADMIN_PASSWORD`, `KEYCLOAK_REDIRECT_URI`.
- `KILLBILL_GATEWAY_URL`, `KILLBILL_API_KEY`, `KILLBILL_API_SECRET`.

Vault must be initialized/unsealed on a fresh volume, and the `secret` KV v2 mount must be enabled. The resulting Vault token must be copied into FlowEngine `.env`.

### Known Issues And Risk Notes

- FlowEngine Compose expects a local Docker image named `killbill-fixed`. If missing, Kill Bill startup will fail until the provided image archive is loaded with `docker load -i C:\path\to\your\image.tar` or, from repo root, `docker load -i .\killbill-fixed.tar`.
- Keycloak takes time after container start. Login/Google flows can fail during warmup.
- Keycloak tenant emails require real SMTP values in FlowEngine `.env`; `keycloak-google-bootstrap` applies them to the imported Keycloak realm.
- Google login requires real Google OAuth client id/secret in FlowEngine `.env`; `keycloak-google-bootstrap` applies them to Keycloak.
- Vault is sealed after fresh starts unless unsealed; credential save/read flows fail while sealed or while `.env` has an invalid token.
- The tenant UI is now consolidated under `frontend/tenant`; legacy tenant folders are not part of the current source structure.
- `frontend/admin/dashboard.html` remains tracked as a legacy/static admin HTML artifact even though the active admin app is React.

## KillBill

### Purpose

`KillBill` contains the billing catalog, Node gateway, webhook/payment/reminder logic, and legacy PowerShell scripts used by FlowEngine's subscription billing flows.

FlowEngine uses this folder through `FlowEngine2.0/docker-compose.yml`:

- `../KillBill/catalog.xml` is mounted into `killbill-catalog-bootstrap`.
- `../KillBill/gateway` is built as `killbill-gateway`.
- `../KillBill/gateway/.env` is loaded by the gateway service.

There is no active standalone `KillBill/docker-compose.yml` in the current repository structure. The recommended billing startup path is FlowEngine Compose.

### Major Features

Catalog:

- `catalog.xml` defines Kill Bill products, plans, price lists, currencies, billing periods, and trial/paid plan structure used by FlowEngine.
- The gateway also has default in-memory/local JSON plan definitions for module plans such as email validation, data, and SQL query plan families.
- FlowEngine bootstrap uploads the catalog automatically after Kill Bill starts.

Gateway:

- Express server in `gateway/index.js`.
- CORS for local frontend/admin/gateway development ports.
- Socket.IO billing event broadcasting.
- Stripe SDK integration when `STRIPE_SECRET_KEY` is configured.
- Razorpay order placeholder endpoint using configured Razorpay credentials.
- Nodemailer/Gmail reminder/test email support when Gmail env vars are present.
- Better SQLite trial claim tracking in `trial-usage.db`.
- Local runtime JSON files for plans, usage, payments, billing config, and catalog debug output.
- Kill Bill proxy/client helpers using basic auth and tenant API key/secret headers.
- Product/module sync endpoints that can update/sync catalog-oriented plan/product data.

Scripts:

- `00-setup-tenant.ps1`: sets up a Kill Bill tenant.
- `01-upload-catalog.ps1`: uploads `catalog.xml`.
- `02-create-account.ps1`: creates a Kill Bill account.
- `03-create-subscriptions.ps1`: creates subscriptions.
- `04-record-usage.ps1`: records usage.
- `05-upgrade-to-paid.ps1`: upgrades to a paid plan.
- `06-fetch-invoices.ps1`: fetches invoices.
- `07-webhook-test.ps1`: tests webhooks.
- `08-run-all.ps1`: runs the script sequence.

### Folder Structure

- `catalog.xml`: authoritative local catalog file used by FlowEngine bootstrap and manual upload.
- `README.md`: KillBill module documentation.
- `RUNBOOK.md`: billing startup/setup/troubleshooting guide.
- `*.ps1`: manual proof-of-concept and fallback billing scripts.
- `server.js`: legacy/helper Node server file.
- `webhook-listener.js`: legacy/helper webhook listener file.
- `gateway/`: active gateway implementation.
- `gateway/index.js`: Express app and billing gateway logic.
- `gateway/catalog-sync.js`: helpers for syncing plan/product changes to catalog XML.
- `gateway/Dockerfile`: gateway container build.
- `gateway/.env.example`: committed env template.
- `gateway/package.json`: Node dependencies.
- `gateway/.dockerignore`: gateway build context exclusions.

### Gateway API Surface

Active routes in `gateway/index.js` include:

- `GET /api/plans`
- `GET /api/modules/active`
- `GET /api/plans/modules`
- `POST /api/plans`
- `PUT /api/plans/:id`
- `DELETE /api/plans/:id`
- `GET /api/config`
- `PUT /api/config`
- `POST /api/webhooks/killbill`
- `POST /api/webhooks/register`
- `POST /api/webhooks/test`
- `POST /api/reminders/send`
- `POST /api/reminders/test`
- `POST /api/usage`
- `GET /api/usage/summary`
- `GET /api/usage/series`
- `POST /api/payments/record`
- `GET /api/payments`
- `GET /api/payments/summary`
- `POST /api/razorpay/order`
- `POST /api/stripe/create-payment-intent`
- `POST /api/stripe/confirm-payment`
- `POST /api/cron/run-reminder-check`
- `POST /api/products/sync`
- `POST /api/products/update`
- `PUT /api/products/:name`
- `DELETE /api/products/:name`

### Tech Stack

- Node.js CommonJS.
- Express 5.
- Socket.IO and WebSocket dependencies.
- Better SQLite3 for trial-usage state.
- Nodemailer for Gmail/reminder email.
- Stripe SDK.
- HTTP proxy middleware.
- Node cron.
- Kill Bill server and MariaDB are started by FlowEngine Compose, not by this folder directly.

### Required Configuration

Committed template: `KillBill/gateway/.env.example`.

Important variables:

- `KB_HOST`, `KB_BASE`.
- `KB_API_KEY`, `KB_API_SECRET`.
- `KB_USERNAME`, `KB_PASSWORD`.
- `KB_WEBHOOK_CALLBACK_URL`.
- `FLOWENGINE_URL`.
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`.
- `STRIPE_SECRET_KEY`.
- `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MAIL_FROM_NAME`, `MAIL_FROM_EMAIL`, `TEST_EMAIL_TO`.
- `MAUTIC_URL`, `MAUTIC_USER`, `MAUTIC_PASS`.

### Startup

Recommended path:

```powershell
cd FlowEngine2.0
docker compose up --build -d
```

Manual catalog fallback if bootstrap fails:

```powershell
cd KillBill
.\01-upload-catalog.ps1
```

### Known Issues And Risk Notes

- The gateway writes runtime state into local JSON/SQLite files that are intentionally ignored by Git.
- Payment providers require real credentials before real payment calls work.
- Mautic env vars exist, but active completeness depends on the gateway paths and optional services. FlowEngine Compose has Mautic services commented out.
- Old POC scripts may assume ports/credentials that differ from current unified FlowEngine Compose.
- The gateway `package.json` has no real test command; `npm test` exits with an error message by design.

## Orchestration

### Purpose

`orchestration` is an independent orchestration platform for building, executing, monitoring, validating, and governing plans. It includes a FastAPI backend, React/Vite TypeScript frontend, Postgres database, seeded demo domain data, and mock adapter services.

It is not wired into FlowEngine at runtime by default, and it does not depend on FlowEngine code.

### Major Features

Plan administration:

- Create, list, read, update, delete, activate, deactivate, and clone orchestration plans.
- Plans contain ordered steps with kind-specific configuration.
- Plan versions can be listed, created, and restored.
- Plan DAG/canvas and canary UI pages exist on the frontend.

Execution:

- Run orchestration plans with entity context.
- Monitor execution status and step results.
- List execution history.
- View execution detail and execution steps.
- Delete executions.
- Runtime contract and OpenAPI-like contract endpoints for plans.

Step executors:

- REST executor and adapter.
- GraphQL executor and adapter.
- SQL executor and adapter.
- Webhook executor.
- Human review executor.
- AI transform executor and adapter.
- Document generation executor.
- Prompt run executor.
- Agent task executor.
- EIVS adapter analyze, intent classify, intent validate, and policy route executors.
- Registry-based executor dispatch.

Governance:

- Tenant policy CRUD.
- Tenant budget CRUD.
- Admin tenant list.
- Admin datasource CRUD and datasource test.
- Human review approvals.
- Agent approvals.
- Agent task traces.
- Audit narrative and counterfactual endpoints.
- Redaction policy endpoints.
- ZKP validation endpoint.

EIVS integration:

- Local `eivs` schema tables exist in orchestration DB.
- Intent classification and validation services exist under `services/eivs`.
- EIVS validation orchestration can route and validate intent requests.

AI copilot:

- `POST /v1/copilot/design`.
- `POST /v1/copilot/safety-lint`.
- `POST /v1/copilot/optimize`.
- Uses Groq when `GROQ_API_KEY` is configured. Local logs previously verified a real Groq call returning `200 OK`.

ITSM, evidence, knowledge, and domain packs:

- ITSM ticket create/list/read/resolve.
- Evidence bundle list/detail.
- Knowledge graph entity type/entity/synthesis endpoints.
- Domain pack list/install/uninstall.
- Seed SQL files exist for banking, finance, health, insurance, and manufacturing demo data.

Frontend:

- Dashboard.
- Plan list/new/import/detail/edit/history/canvas/canary.
- Execute and execution monitor.
- History and execution detail.
- Admin console.
- Datasource catalog.
- Domain packs.
- Evidence viewer.
- Approvals.
- Usage billing.
- AI Copilot.
- ITSM.
- Knowledge graph.
- Not found page.

### Folder Structure

- `docker-compose.yml`: starts Postgres, mock adapter, backend, and frontend.
- `.env.example`: contains `GROQ_API_KEY=`.
- `Dockerfile`: backend container.
- `requirements.txt`: backend Python dependencies.
- `README.md` and `RUNBOOK.md`: module docs and setup.
- `db-init/`: domain seed SQL files mounted into Postgres entrypoint.
- `docs/adr/`: architecture decision record for EIVS orchestration integration.
- `frontend/`: Vite React TypeScript app.
- `frontend/src/App.tsx`: route table.
- `frontend/src/components/`: agent inspector/trace, auth protected route, layout, skeleton UI.
- `frontend/src/context/AuthContext.tsx`: frontend auth context.
- `frontend/src/pages/`: routed UI pages.
- `frontend/src/services/`: API, auth, and history helpers.
- `frontend/src/types/`: frontend TypeScript types.
- `mock_services/`: adapter, evidence, and LLM mock FastAPI services plus Dockerfile.
- `services/main.py`: FastAPI API implementation.
- `services/config.py`: settings and environment validation.
- `services/db.py`: DB pool/helpers and schema execution.
- `services/schema.sql`: application schema and seed data.
- `services/orchestrator.py`: plan orchestration engine.
- `services/plan_repository.py`, `execution_steps_repository.py`, `intent_plan_mappings_repository.py`: DB repositories.
- `services/executors/`: executor implementations and registry.
- `services/agent/`: agent runtime, contract, approval, budget, tools, output validation, prompt contract client.
- `services/eivs/`: local EIVS models/services/config/runtime validation orchestration.
- `services/common/llm_client.py`: LLM client.
- `services/tests/`: backend tests.

### Backend API Surface

Health/auth:

- `GET /health`
- `GET /metrics`
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /auth/me`

Plans:

- `POST /admin/plans`
- `GET /admin/plans`
- `GET /admin/plans/{plan_id}`
- `PUT /admin/plans/{plan_id}`
- `DELETE /admin/plans/{plan_id}`
- `PATCH /admin/plans/{plan_id}/deactivate`
- `PATCH /admin/plans/{plan_id}/activate`
- `POST /admin/plans/{plan_id}/clone`
- `GET /admin/plans/{plan_id}/versions`
- `POST /admin/plans/{plan_id}/versions`
- `POST /admin/plans/{plan_id}/versions/{version}/restore`

Execution/runtime:

- `POST /v1/360`
- `GET /v1/executions`
- `GET /v1/executions/{execution_id}`
- `DELETE /v1/executions/{execution_id}`
- `POST /v1/orchestrations/run`
- `GET /v1/orchestrations/runs/{execution_id}`
- `GET /v1/orchestrations/runs`
- `GET /v1/orchestrations/runs/{execution_id}/steps`
- `GET /v1/runtime/contracts/{plan_name}`
- `GET /v1/runtime/contracts/{plan_name}/openapi`

Policies/datasources:

- `GET /admin/tenants/{tenant_id}/policy`
- `POST /admin/tenants/{tenant_id}/policy`
- `GET /admin/tenants`
- `GET /admin/tenants/{tenant_id}/budget`
- `POST /admin/tenants/{tenant_id}/budget`
- `GET /admin/datasources`
- `POST /admin/datasources`
- `GET /admin/datasources/{datasource_id}`
- `PUT /admin/datasources/{datasource_id}`
- `DELETE /admin/datasources/{datasource_id}`
- `POST /admin/datasources/{datasource_id}/test`

ITSM/copilot/knowledge/governance:

- `POST /v1/itsm/tickets`
- `GET /v1/itsm/tickets/{ticket_id}`
- `GET /v1/itsm/tickets`
- `POST /v1/itsm/tickets/{ticket_id}/resolve`
- `POST /v1/copilot/design`
- `POST /v1/copilot/safety-lint`
- `POST /v1/copilot/optimize`
- `GET /v1/evidence/bundles`
- `GET /v1/knowledge/entity-types`
- `GET /v1/knowledge/entities/{entity_type}/{entity_id}`
- `POST /v1/knowledge/synthesize`
- `GET /admin/domain-packs`
- `POST /admin/domain-packs/{pack_id}/install`
- `DELETE /admin/domain-packs/{pack_id}/uninstall`
- `POST /v1/zkp/validate`
- `POST /v1/redaction/policy`
- `GET /v1/redaction/policies`
- `POST /v1/audit/narrative`
- `POST /v1/audit/counterfactual`

Approvals and agent tasks:

- `GET /v1/human-review-approvals`
- `GET /v1/human-review-approvals/{approval_id}`
- `POST /v1/human-review-approvals/{approval_id}/approve`
- `POST /v1/human-review-approvals/{approval_id}/reject`
- `GET /admin/intent-plan-mappings`
- `GET /admin/intent-plan-mappings/...`
- `PUT /admin/intent-plan-mappings/...`
- `DELETE /admin/intent-plan-mappings/{mapping_id}`
- `GET /v1/intents/{intent_code}/plan`
- `GET /v1/agent-task-runs/{agent_run_id}`
- `GET /v1/agent-task-runs/{agent_run_id}/trace`
- `GET /v1/orchestrations/runs/{execution_id}/agent-tasks`
- `GET /v1/agent-approvals`
- `POST /v1/agent-approvals/{approval_id}/approve`
- `POST /v1/agent-approvals/{approval_id}/reject`

Some long parameterized route definitions are split across multiple lines in `services/main.py`; inspect that file for exact paths before scripting against less common mapping routes.

### Database Schema

`services/schema.sql` creates:

- `orchestration.plans`
- `orchestration.plan_steps`
- `orchestration.plan_versions`
- `orchestration.executions`
- `orchestration.tenant_policies`
- `orchestration.tenant_budgets`
- `orchestration.datasources`
- `orchestration.users`
- `orchestration.domain_pack_installations`
- `orchestration.knowledge_graph_config`
- `orchestration.execution_steps`
- `orchestration.intent_plan_mappings`
- `orchestration.agent_task_runs`
- `orchestration.agent_task_trace_events`
- `orchestration.agent_task_approvals`
- `orchestration.human_review_approvals`
- `orchestration.itsm_tickets`
- Local `eivs` tables for intents, intent policies, email intent runs, LLM prompts, datasources, datasource configs, validation rules, and validation runs.

### Tech Stack

- Backend: Python, FastAPI, Uvicorn, Pydantic, pydantic-settings, psycopg2, SQLAlchemy, httpx.
- Auth: local demo JWT auth with `admin/admin123` and `viewer/viewer123` users in code.
- Metrics: Prometheus client.
- Expression/evaluation: `asteval`, `jsonschema`.
- Frontend: React 19, TypeScript, Vite, React Router 7, lucide-react, Tailwind/PostCSS tooling, Vitest.
- Database: PostgreSQL 16 Alpine.
- AI: Groq OpenAI-compatible chat endpoint through `GROQ_API_KEY`.
- Containers: Docker Compose for backend, frontend, Postgres, and adapter.

### Startup

```powershell
cd orchestration
Copy-Item .env.example .env
# edit .env and set GROQ_API_KEY if testing AI copilot
docker compose up --build -d
```

URLs:

- Frontend: `http://localhost:3100`
- Backend: `http://localhost:8060`
- Adapter: `http://localhost:8101`

### Known Issues And Risk Notes

- Auth is demo/local JWT auth, not Keycloak.
- Demo users are hardcoded in `services/main.py`.
- Some frontend history/version snapshots use browser `localStorage`.
- AI copilot only uses real Groq when `GROQ_API_KEY` is set.
- Docker image pulls can fail due Docker Hub transient outages; retry/pull manually if needed.
- CORS is open in backend for local development.

## PromptBuilder

### Purpose

`PromptBuilder` is the AgentryX prompt lifecycle module. It lets users create, version, test, execute, evaluate, and audit reusable LLM prompts. It also includes datasource-context support and document-generation bridge code inherited from TemplateBuilder-style flows.

### Major Features

Prompt lifecycle:

- Prompt list.
- Prompt Studio editor.
- Prompt create/update/delete/duplicate.
- Prompt blocks with block types such as system, role, task, instruction, business rule, context, retrieval, tool call, output schema, example, fallback, and safety.
- Prompt inputs.
- Context bindings.
- Output schema/guardrails.
- Publish and rollback.
- Prompt versions.
- Test cases and test execution.
- Prompt evaluations.
- Prompt run history and run detail.

LLM execution:

- `/v1/prompts/run` compiles prompt content and calls configured LLM behavior.
- Cohere key is documented as required for some prompt execution flows.
- LLM webhook/env helpers exist for SQL/document bridge behavior.

Datasource context:

- Lists datasources from local EIVS/demo tables.
- Tests SQL against configured datasource connection keys.
- Uses a separate Kasetti demo datasource Postgres database with banking, finance, health, insurance, and manufacturing seed data.

Document bridge:

- Active document preview/generation/job/download endpoints are mounted.
- TemplateBuilder-era renderers exist for DOCX, HTML, Markdown, PDF, and XLSX.
- `TEMPLATE_BUILDER_URL` can point to a running TemplateBuilder API for bridging.

Audit:

- Audit event list endpoint exists.
- Prompt actions and document flows write audit events where implemented.

Frontend:

- My Prompts.
- Prompt Studio.
- Run Console.
- Test Cases.
- Run History.
- Audit log.

### Folder Structure

- `README.md` and `RUNBOOK.md`: module docs and setup.
- `backend/Dockerfile`: FastAPI backend image.
- `backend/docker-compose.yml`: starts frontend, backend, PromptBuilder DB, and Kasetti datasource DB.
- `backend/requirements.txt`: backend dependencies.
- `backend/db/migrations/0001_prompt_builder.sql`: app DB initialization.
- `backend/kasetti-db/`: demo domain datasource SQL.
- `backend/src/main.py`: FastAPI app and active router mounting.
- `backend/src/api/prompts.py`: active prompt CRUD/run/version/test/evaluation/runs API.
- `backend/src/api/ai.py`: active AI tools and SQL-generation endpoints.
- `backend/src/api/documents.py`: active document preview/generate/jobs/download endpoints.
- `backend/src/api/datasources.py`: active datasource list and SQL test endpoints.
- `backend/src/api/audit.py`: active audit endpoint.
- `backend/src/api/health.py`: active health endpoint.
- `backend/src/api/blocks.py`, `templates.py`, `placeholders.py`, `tests.py`, `marketplace.py`, `import_routes.py`, `import_template.py`, `render.py`, `ui.py`: present in source but not mounted by `main.py` today.
- `backend/src/core/`: prompt compiler/context/orchestrator/validation, resolver, audit, versioning, models, and renderers.
- `backend/src/adapter/datasource_adapter.py`: TemplateBuilder-style adapter/model references.
- `backend/src/worker.py`: worker code exists, but the committed PromptBuilder Compose file does not start a worker service.
- `frontend/`: Vite React TypeScript UI.
- `frontend/src/App.tsx`: route table.
- `frontend/src/api/`: API clients.
- `frontend/src/components/layout/`: app layout and sidebar.
- `frontend/src/components/prompts/`: prompt editor panels.
- `frontend/src/components/shared/`: empty/error/loading/status UI.
- `frontend/src/pages/`: routed pages.
- `frontend/src/styles/`: app shell styles.
- `frontend/src/types/`: shared API types.

### Active Backend API Surface

Health/debug:

- `GET /healthz`
- `GET /_debug/routes`

Prompts:

- `POST /v1/prompts`
- `GET /v1/prompts`
- `GET /v1/prompts/{prompt_id}`
- `PUT /v1/prompts/{prompt_id}`
- `DELETE /v1/prompts/{prompt_id}`
- `POST /v1/prompts/{prompt_id}/duplicate`
- `GET /v1/prompts/{prompt_id}/blocks`
- `PUT /v1/prompts/{prompt_id}/blocks`
- `GET /v1/prompts/{prompt_id}/inputs`
- `PUT /v1/prompts/{prompt_id}/inputs`
- `GET /v1/prompts/{prompt_id}/context-bindings`
- `PUT /v1/prompts/{prompt_id}/context-bindings`
- `GET /v1/prompts/{prompt_id}/schema`
- `PUT /v1/prompts/{prompt_id}/schema`
- `POST /v1/prompts/run`
- `GET /v1/prompts/{prompt_id}/versions`
- `POST /v1/prompts/{prompt_id}/versions`
- `POST /v1/prompts/{prompt_id}/publish`
- `POST /v1/prompts/{prompt_id}/rollback`
- `GET /v1/prompts/{prompt_id}/test-cases`
- `POST /v1/prompts/{prompt_id}/test-cases`
- `PUT /v1/prompts/{prompt_id}/test-cases/{test_id}`
- `DELETE /v1/prompts/{prompt_id}/test-cases/{test_id}`
- `POST /v1/prompts/{prompt_id}/test`
- `POST /v1/prompts/{prompt_id}/evaluate`
- `GET /v1/prompts/{prompt_id}/evaluations`
- `GET /v1/prompts/{prompt_id}/runs`
- `GET /v1/prompts/runs/{run_id}`

AI, datasources, documents, audit:

- `POST /v1/ai/tools`
- `POST /v1/ai/generate-sql`
- `GET /v1/datasources`
- `POST /v1/datasources/test-sql`
- `POST /v1/documents/preview`
- `POST /v1/documents/generate`
- `GET /v1/documents/jobs/{job_id}`
- `GET /v1/documents/jobs/{job_id}/download`
- `GET /v1/documents/jobs`
- `GET /v1/documents/{job_id}` hidden compatibility route.
- `GET /v1/documents/templates`
- `DELETE /v1/documents/jobs/{job_id}`
- `GET /v1/audit/events`

### Database Schema

`0001_prompt_builder.sql` creates `prompt_builder` schema tables:

- `prompts`
- `prompt_versions`
- `prompt_blocks`
- `prompt_inputs`
- `prompt_context_bindings`
- `prompt_test_cases`
- `prompt_runs`
- `prompt_run_traces`
- `prompt_evaluations`
- `prompt_approvals`
- `audit_events`

The separate `kasetti-db` container creates demo datasource schemas from `backend/kasetti-db`.

### Tech Stack

- Backend: Python, FastAPI, Uvicorn, SQLAlchemy async, asyncpg, psycopg2, Pydantic, python-dotenv.
- AI/LLM: Anthropic package, Cohere key documented for prompt runs, webhook/endpoint envs for LLM behavior.
- Documents: python-docx, pdfplumber, BeautifulSoup, ReportLab, OpenPyXL.
- Datasource: PostgreSQL demo DB with domain SQL.
- Frontend: React 19, TypeScript, Vite, React Router 7, Axios.
- Containers: Docker Compose with frontend/backend/app DB/demo datasource DB.

### Required Configuration

No committed `PromptBuilder/backend/.env.example` exists. The runbook documents the expected local `.env`.

Variables used by Compose/backend:

- `DB_URL`
- `KASETTI_DS_URL`
- `API_PORT`
- `COHERE_API_KEY`
- `GOOGLE_TRANSLATE_KEY`
- `LLM_ENDPOINT`
- `LLM_WEBHOOK_URL`
- `TEMPLATE_BUILDER_URL`

Frontend local development commonly uses `VITE_API_BASE`.

### Startup

```powershell
cd PromptBuilder/backend
# create local .env according to PromptBuilder/RUNBOOK.md
docker compose up --build -d
```

Expected URLs:

- Frontend container: `http://localhost:5174`
- Backend: `http://localhost:10002`

### Known Issues And Risk Notes

- Several TemplateBuilder-era API files are present but not mounted.
- The worker code is present but not started by the committed PromptBuilder Compose file.
- No real auth exists; frontend API client uses a hardcoded/local `dev_user` style user id.
- Compose comments contain mojibake/encoding artifacts in comments only.
- Document bridge behavior depends on TemplateBuilder if `TEMPLATE_BUILDER_URL` points to it.
- Clean DB starts with schema but no user-created prompts.

## TemplateBuilder

### Purpose

`TemplateBuilder` is the AgentryX document template creation and generation module. It contains a FastAPI backend, worker, template database, Redis, demo Kasetti datasource database, and a React/Vite template studio UI.

### Major Features

Template lifecycle:

- Template list.
- Prebuilt templates page.
- Template create/read/update/delete.
- Publish template versions.
- Revert to draft.
- Template version history.
- Template input contract discovery.
- Template placeholder binding.

Editor:

- Document Studio layout.
- Block canvas.
- Text, section, table, and image blocks.
- Inspector panel.
- Placeholder palette.
- AI tools panel.
- Preview pane/bar.
- Generate panel.
- Tests panel.
- Version history panel.
- Drag and drop placeholder insertion using `application/x-placeholder-token`.

Placeholder registry:

- Global placeholder list/search.
- Manual SQL placeholder create.
- AI prompt placeholder create.
- Placeholder read/update/delete APIs exist.
- Datasource SQL testing.
- Placeholder usage through document preview/generation.

Documents:

- Preview document output.
- Generate render jobs.
- Download generated jobs.
- List/delete jobs.
- Renderers for DOCX, HTML, Markdown, PDF, and XLSX.

Marketplace:

- Publish/import/rate/delete marketplace items.
- Supports item types `template`, `block`, and `placeholder`.

Import:

- Active import router supports template import from file and URL.
- Alternate import implementation exists but is not mounted.

AI:

- AI tools endpoint.
- AI SQL generation endpoint.
- Translation helper behavior protects `{{placeholder}}` tokens before translation.
- `LLM_WEBHOOK_URL` is used for prompt-to-SQL and AI placeholder resolution behavior.

Audit:

- Audit event endpoint.
- Audit rows are written by template, placeholder, document, marketplace, and worker paths where implemented.

### Folder Structure

- `README.md` and `RUNBOOK.md`: module docs and setup.
- `template-builder-engine/`: backend, worker, compose stack, migrations, demo SQL, and reference files.
- `template-builder-engine/Dockerfile`: backend/worker image.
- `template-builder-engine/docker-compose.yml`: starts API, worker replicas, app DB, Kasetti datasource DB, and Redis.
- `template-builder-engine/requirements.txt`: backend dependencies.
- `template-builder-engine/db/migrations/V1__init.sql`: main DB initialization.
- `template-builder-engine/sql/kasetti-db/`: demo datasource SQL.
- `template-builder-engine/backend/config.py`: config defaults.
- `template-builder-engine/backend/db.py`: DB helpers.
- `template-builder-engine/backend/schema.py`: Pydantic schemas.
- `template-builder-engine/backend/src/main.py`: active FastAPI app and router mounting.
- `template-builder-engine/backend/src/api/`: active and inactive route modules.
- `template-builder-engine/backend/src/core/`: models, resolver, versioning, audit, renderers.
- `template-builder-engine/backend/src/adapter/`: datasource adapter models/helpers.
- `template-builder-engine/backend/src/worker.py`: queued render worker.
- `template-builder-engine/frontend/`: older/skeletal frontend code present in engine folder, separate from active `template-builder-ui`.
- `template-builder-engine/docs/architecture.md`: architecture notes.
- `template-builder-engine/openapi.yaml`: API spec artifact.
- `template-builder-engine/phases/`: semantic model YAML, OpenAPI template engine spec, seed datasource SQL.
- `template-builder-engine/NOC_*.pdf`: sample generated PDFs.
- `template-builder-ui/`: active React/Vite TypeScript UI.
- `template-builder-ui/src/App.tsx`: route table.
- `template-builder-ui/src/api/`: API clients for audit/datasources/documents/marketplace/placeholders/templates.
- `template-builder-ui/src/components/editor/`: editor panels and block components.
- `template-builder-ui/src/components/layout/`: app shell/sidebar.
- `template-builder-ui/src/components/shared/`: empty/error/loading/status components.
- `template-builder-ui/src/pages/`: routed pages.
- `template-builder-ui/src/styles/`: page and shared UI CSS.
- `template-builder-ui/src/__tests__/`: Jest tests for API wrappers, pages, layout, shared components, and editor components.

### Active Backend API Surface

Health/debug:

- `GET /healthz`
- `GET /_debug/routes`

Templates:

- `POST /v1/templates`
- `GET /v1/templates`
- `GET /v1/templates/{template_id}`
- `PUT /v1/templates/{template_id}`
- `DELETE /v1/templates/{template_id}`
- `POST /v1/templates/{template_id}/publish`
- `POST /v1/templates/{template_id}/placeholders`
- `POST /v1/templates/{template_id}/revert-to-draft`
- `GET /v1/templates/{template_id}/versions`
- `GET /v1/templates/{template_id}/placeholders`
- `GET /v1/templates/{template_id}/inputs`

Placeholders:

- `GET /v1/registry/placeholders`
- `POST /v1/registry/placeholders`
- `GET /v1/registry/placeholders/{registry_id}`
- `PUT /v1/registry/placeholders/{registry_id}`
- `DELETE /v1/registry/placeholders/{registry_id}`

Blocks, datasources, documents:

- `GET /v1/blocks/`
- `POST /v1/blocks/`
- `GET /v1/blocks/{block_id}`
- `DELETE /v1/blocks/{block_id}`
- `GET /v1/datasources`
- `POST /v1/datasources/test-sql`
- `POST /v1/documents/preview`
- `POST /v1/documents/generate`
- `GET /v1/documents/jobs/{job_id}`
- `GET /v1/documents/jobs/{job_id}/download`
- `GET /v1/documents/jobs`
- `GET /v1/documents/{job_id}` hidden compatibility route.
- `GET /v1/documents/templates`
- `DELETE /v1/documents/jobs/{job_id}`

Marketplace, tests, AI, import, audit:

- `GET /v1/marketplace/`
- `POST /v1/marketplace/`
- `GET /v1/marketplace/{item_id}`
- `POST /v1/marketplace/{item_id}/rate`
- `POST /v1/marketplace/{item_id}/import`
- `DELETE /v1/marketplace/{item_id}`
- `GET /v1/templates/{template_id}/tests`
- `POST /v1/templates/{template_id}/tests`
- `PUT /v1/templates/{template_id}/tests/{test_id}`
- `DELETE /v1/templates/{template_id}/tests/{test_id}`
- `POST /v1/templates/{template_id}/tests/{test_id}/run`
- `POST /v1/templates/{template_id}/tests/run-all`
- `POST /v1/ai/tools`
- `POST /v1/ai/generate-sql`
- `POST /v1/templates/import/file`
- `POST /v1/templates/import/url`
- `GET /v1/audit/events`
- `POST /v1/generate` legacy compatibility render endpoint.

### Database Schema

`V1__init.sql` creates:

Local `eivs` demo tables:

- `eivs.intents`
- `eivs.datasources`
- `eivs.intent_templates`

TemplateBuilder tables:

- `template_builder.templates`
- `template_builder.template_versions`
- `template_builder.placeholders_registry`
- `template_builder.template_placeholders`
- `template_builder.render_jobs`
- `template_builder.uploaded_documents`
- `template_builder.ai_suggestions`
- `template_builder.audit_events`
- `template_builder.template_tests`
- `template_builder.blocks_library`
- `template_builder.marketplace_items`
- `template_builder.logical_models`
- `template_builder.template_usage_stats`
- `template_builder.placeholder_usage_stats`

The separate Kasetti DB loads banking, finance, health, insurance, and manufacturing demo schemas.

### Tech Stack

- Backend: Python, FastAPI, Uvicorn, SQLAlchemy async, asyncpg, psycopg2, Pydantic, python-dotenv.
- Queue/cache: Redis.
- Documents: python-docx, pdfplumber, BeautifulSoup, ReportLab, OpenPyXL.
- AI: Anthropic package, Cohere/Google Translate env support, webhook URL.
- Databases: PostgreSQL 15 for app DB and demo datasource DB.
- Frontend: React 19, TypeScript, Vite, React Router 7, Axios, dnd-kit, UUID.
- Tests: Jest, ts-jest, Testing Library.
- Containers: Docker Compose for API, worker, DBs, Redis.

### Required Configuration

No committed `TemplateBuilder/template-builder-engine/.env.example` exists. The runbook documents the expected local `.env`.

Variables used by Compose/backend:

- `DB_URL`
- `REDIS_URL`
- `API_PORT`
- `KASETTI_DS_URL`
- `COHERE_API_KEY`
- `GOOGLE_TRANSLATE_KEY`
- `LLM_ENDPOINT`
- `LLM_WEBHOOK_URL`

Frontend local development commonly uses:

- `VITE_API_BASE=http://localhost:10001/v1`

### Startup

Backend stack:

```powershell
cd TemplateBuilder/template-builder-engine
# create local .env according to TemplateBuilder/RUNBOOK.md
docker compose up --build -d
```

Frontend:

```powershell
cd TemplateBuilder/template-builder-ui
npm install
$env:VITE_API_BASE="http://localhost:10001/v1"
npm run dev
```

### Known Issues And Risk Notes

- Compose hardcodes a `webhook.site` URL for `LLM_WEBHOOK_URL` in API/worker services. That URL may not be valid for another developer.
- Frontend `src/api/placeholders.ts` hardcodes `datasource_id: 1` during placeholder creation, which may ignore the selected datasource.
- Backend placeholder single-read/update handlers are documented as risky because they appear to consume SQL result mappings twice and reference `req` without a defined request parameter in one path.
- `GET /v1/templates/{template_id}/placeholders` may select a `category` column that the active DDL does not create.
- `backend/src/api/ui.py` contains helper/stub functions but is not mounted.
- `backend/src/api/import_template.py` is not mounted; `import_routes.py` is the active import router.
- The engine folder contains an older/skeletal frontend separate from the active `template-builder-ui`.
- Worker/generated-file behavior should be tested carefully before production because generated artifacts live in container filesystems unless a shared volume is added.

## Docai

### Purpose

`Docai` is a document AI proof-of-concept module. It provides a FastAPI document parsing/training/compliance backend and a Create React App UI. It supports document type management, document upload, auto-detection, parsing, parse history, parsing rules, field mappings, corrections, audit trails, metrics, and optional external connectors.

The UI has been visually reskinned to match the FlowEngine design language, but the backend is intentionally independent and was not wired into FlowEngine.

### Major Features

Authentication:

- `JWT_SECRET_KEY` is mandatory at backend import time.
- Register endpoint creates the first user without admin auth; later user creation requires current admin.
- Login uses OAuth2 password form at `/auth/jwt/login`.
- JWT bearer auth protects UI-used APIs.
- Logout blocklists the current token in process memory.
- Roles include `admin`, `trainer`, `parser`, and `viewer` based on backend role checks.
- `AUTH_DISABLED=true` can allow optional backend auth bypass behavior, but the React UI still expects a token for protected routes.

Document type and schema:

- Seed scripts create document types such as invoice/claims/medical/passport/resume-style fixtures.
- `GET /doc-types/`, detail, and delete endpoints exist.
- Schema suggestion endpoint suggests schemas from uploaded/content data.

Upload, parse, auto-detect:

- Upload endpoint stores uploaded file to a temp path and routes it through parser selection.
- Auto-detect endpoint classifies document type from text/content.
- Parse endpoint parses a previously uploaded or referenced document id.
- Parsing uses router logic to choose parser based on extension/content.
- Parse results include confidence, extracted fields, PII redaction, status, and audit behavior.

Parsers:

- Docling parser.
- GROBID parser for scientific-paper style PDFs when configured.
- OCR parser using pytesseract/pdfminer/pypdf/easyocr/fitz fallback behavior.
- Unstructured parser for doc/docx/pptx/html and fallback parsing.

Parsing rules:

- Rule CRUD.
- Rule version list/create/activate.
- Regex/rule application helpers.

Field mappings and corrections:

- Field mapping list/create/delete.
- Parse correction list/create.
- Review queue.

Compliance:

- PII redaction using Presidio packages.
- Schema validation helper.
- PII redaction metrics.

Training/model registry:

- Training endpoint.
- Model registry integration with MLflow.
- `MOCK_TRAINING=true` is default behavior.
- LayoutLMv3-style registry fields exist.

Vector/RAG:

- VectorStore uses sentence-transformers when available and falls back when unavailable.
- Postgres/pgvector or fallback behavior depends on database setup and installed extension.
- RAG connector uses local index directory from `RAG_INDEX_DIR`.

External connectors:

- Salesforce connector when `ENABLE_SALESFORCE=true` and Salesforce env vars are provided.
- SAP connector when `ENABLE_SAP=true` and SAP env vars are provided.
- RAG connector when `ENABLE_RAG=true`.
- Dispatcher chooses enabled connectors from env flags.

Monitoring/deployment:

- Prometheus metrics endpoint.
- Docker Compose for Postgres, Weaviate, Grafana, and Prometheus.
- Kubernetes manifests for namespace, configmap, secrets, deployment, service, HPA, MLflow, and Postgres.
- Nested GitHub Actions workflow exists under `Docai/.github/workflows/ci-cd.yml`.

Frontend:

- Login page.
- Protected dashboard layout.
- Dashboard route.
- Document Types route.
- Parse Document route.
- Auto Detect route.
- Parse History route.
- Sidebar and shared table/badge components.
- Axios API client with bearer token injection and 401 logout/redirect behavior.

### Folder Structure

- `Docai/.gitignore`: DocAI-level ignore rules.
- `Docai/.github/workflows/ci-cd.yml`: CI/CD workflow file located inside the module. Because it is nested under `Docai/.github`, GitHub will not treat it as a repository workflow unless the folder is moved to root `.github/workflows` or DocAI is used as a standalone repo root.
- `docai-ui/`: Create React App frontend.
- `docai-ui/src/App.js`: route protection and routes.
- `docai-ui/src/api/client.js`: Axios client, default API URL, token handling, 401 behavior.
- `docai-ui/src/components/`: sidebar, field table, intent badge.
- `docai-ui/src/pages/`: login, dashboard, document types, parse document, auto-detect, parse history.
- `docai-ui/src/theme.js`, `index.css`, `App.css`: FlowEngine-style visual layer.
- `docai_service/`: FastAPI backend.
- `docai_service/app/main.py`: API implementation.
- `docai_service/app/auth.py`: JWT, role checks, registration/login helpers.
- `docai_service/app/db.py`: SQLAlchemy models and DB URL selection.
- `docai_service/app/audit.py`: audit helpers.
- `docai_service/app/compliance.py`: PII redaction and schema validation.
- `docai_service/app/router.py`: parser routing.
- `docai_service/app/schemas.py`: Pydantic schemas.
- `docai_service/app/vector_store.py`: vector storage/search helpers.
- `docai_service/app/intent_classifier.py`: intent classification logic.
- `docai_service/app/models/registry.py`: model registry and MLflow/mock training logic.
- `docai_service/app/parsers/`: parser implementations.
- `docai_service/app/connectors/`: base, dispatcher, Salesforce, SAP, and RAG connectors.
- `docai_service/scripts/`: setup, migration, fixture, MLflow, Docker image helper scripts.
- `docai_service/scripts/migrations/`: SQL migrations and doc type seed data.
- `docai_service/tests/`: API/auth/compliance/connector/deployment/e2e/intent/metrics/model/parser/rules/vector tests and fixtures.
- `docai_service/config/`: Grafana dashboard/datasource config and Prometheus config.
- `docai_service/k8s/`: Kubernetes manifests.

### Backend API Surface

Auth:

- `POST /auth/register`
- `POST /auth/jwt/login`
- `GET /auth/me`
- `POST /auth/logout`

Document processing:

- `POST /upload/`
- `POST /schema-suggest/`
- `POST /train/`
- `POST /auto-detect/`
- `POST /parse/`
- `POST /query-rag/`

Rules/mappings/history:

- `GET /parsing-rules/`
- `POST /parsing-rules/`
- `DELETE /parsing-rules/{rule_id}`
- `GET /parsing-rules/{rule_id}/versions`
- `POST /parsing-rules/{rule_id}/versions`
- `POST /parsing-rules/{rule_id}/versions/{version_id}/activate`
- `GET /field-mappings/`
- `POST /field-mappings/`
- `DELETE /field-mappings/{mapping_id}`
- `GET /parse-history/`
- `GET /review-queue/`
- `GET /parse-history/{parse_request_id}/corrections`
- `POST /parse-history/{parse_request_id}/corrections`
- `GET /parse-stats/`
- `GET /audit-trail/{parse_request_id}`

Document types and operations:

- `GET /doc-types/`
- `GET /doc-types/{doc_type_id}`
- `DELETE /doc-types/{doc_type_id}`
- `GET /health/`
- `GET /metrics`
- `GET /metrics/`

### Database Schema

SQL migration files create:

- `document_types`
- `templates`
- `model_registry_entries`
- `parse_requests`
- `audit_logs`
- `users`
- `field_mappings`
- `parse_corrections`

SQL migrations also:

- Enable `pgcrypto`.
- Attempt to enable `vector`.
- Add `document_types.is_active`.
- Seed document types.

Important limitation: SQL migration files currently do not create `parsing_rules` or `parsing_rule_versions`. The SQLAlchemy models define those tables, but `Base.metadata.create_all()` only runs automatically for SQLite mode in `db.py`. Therefore, on a normal Postgres setup, parsing-rule endpoints may fail unless the missing tables are created by another setup step. This needs verification before claiming full Postgres E2E support.

### Tech Stack

- Backend: Python, FastAPI, Uvicorn, SQLAlchemy, Pydantic, psycopg2.
- Auth: python-jose JWT, passlib/bcrypt.
- Parsing/AI: unstructured, docling, transformers, torch, torchvision, torchaudio, Tesseract/pytesseract, Pillow, pdf2image, python-docx.
- Compliance: presidio-analyzer, presidio-anonymizer.
- Model registry: MLflow.
- Vector/RAG: pgvector, sentence-transformers, langchain, llama-index, Weaviate client.
- Monitoring: Prometheus client, Prometheus container, Grafana container.
- Frontend: React 19, Create React App/react-scripts, Material UI, Emotion, React Router 7, Axios, Recharts, react-dropzone.
- Deployment artifacts: Dockerfile, Docker Compose for infra, Kubernetes manifests, nested GitHub Actions workflow.

### Startup

Infrastructure:

```powershell
cd Docai/docai_service
docker compose up -d
```

Backend local run:

```powershell
cd Docai/docai_service
$env:JWT_SECRET_KEY="replace-with-local-secret"
$env:POSTGRES_HOST="localhost"
$env:POSTGRES_USER="docai_user"
$env:POSTGRES_PASSWORD="docai_pass"
$env:POSTGRES_DB="docai_db"
$env:POSTGRES_PORT="5432"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

Frontend:

```powershell
cd Docai/docai-ui
npm install
$env:REACT_APP_API_URL="http://localhost:8001"
npm start
```

First user:

- The UI does not expose registration.
- Create the first admin through `POST /auth/register`.
- After the first user exists, subsequent registrations require an authenticated admin.

### Known Issues And Risk Notes

- Docker Compose starts only infrastructure, not the API or UI.
- Official `postgres:15` may not include the `vector` extension required by migration `001_initial_schema.sql`; use a pgvector-enabled image or adjust setup if the migration fails.
- `JWT_SECRET_KEY` must be set before importing/running the backend.
- Frontend defaults to `http://localhost:8001`; backend run port must match or `REACT_APP_API_URL` must be set.
- Grafana and the React UI both default to port `3000`.
- Weaviate and Kill Bill both default to port `8080`.
- Nested workflow paths are likely not active in this combined repo because GitHub only reads workflows from root `.github/workflows`.
- The workflow also uses `working-directory: docai_service`, which is correct only if DocAI is a standalone repo root, not if run from this repository root.

## Cross-Module Setup Guide

### Prerequisites

For the full repository, install:

- Git.
- Docker Desktop with Docker Compose v2.
- Node.js and npm for frontend local development.
- Python 3.10 or 3.11 depending on module. FlowEngine and most newer modules are safest with Python 3.11; DocAI workflow references Python 3.10.
- PowerShell for Windows script usage, especially KillBill scripts.
- Optional: PostgreSQL client tools for debugging DBs.
- Optional: Vault CLI for manual Vault initialization/unseal.

### Clone

```powershell
git clone https://github.com/kartik7022/AgentryX.git
cd AgentryX
```

### Secret Handling

Never commit real `.env` files. The root `.gitignore` excludes them.

Committed templates:

- `FlowEngine2.0/.env.example`
- `KillBill/gateway/.env.example`
- `orchestration/.env.example`

Modules that currently require manual local `.env` creation from runbook instructions:

- `PromptBuilder/backend/.env`
- `TemplateBuilder/template-builder-engine/.env`
- DocAI backend environment variables, usually set in shell or local env file if you create one privately.

### Recommended Module Startup Order For Testing

Do not start everything at once unless ports are changed. Recommended order:

1. Test FlowEngine and KillBill together from `FlowEngine2.0`.
2. Stop FlowEngine stack.
3. Test Orchestration from `orchestration`.
4. Stop Orchestration stack.
5. Test PromptBuilder from `PromptBuilder/backend`.
6. Stop PromptBuilder stack.
7. Test TemplateBuilder backend from `TemplateBuilder/template-builder-engine` and UI from `TemplateBuilder/template-builder-ui`.
8. Stop TemplateBuilder stack.
9. Test DocAI infrastructure/backend/UI from `Docai/docai_service` and `Docai/docai-ui`.

### Stop Commands

FlowEngine:

```powershell
cd FlowEngine2.0
docker compose down
```

FlowEngine full reset:

```powershell
cd FlowEngine2.0
docker compose down -v
```

Orchestration:

```powershell
cd orchestration
docker compose down
```

PromptBuilder:

```powershell
cd PromptBuilder/backend
docker compose down
```

TemplateBuilder:

```powershell
cd TemplateBuilder/template-builder-engine
docker compose down
```

DocAI infrastructure:

```powershell
cd Docai/docai_service
docker compose down
```

## Cross-Module Smoke Checks

These checks are intentionally basic. They prove that the module is reachable and that the main UI/API wiring is alive. They do not replace full CRUD and business-flow testing.

### FlowEngine And KillBill

After `docker compose up --build -d` from `FlowEngine2.0`:

```powershell
docker compose ps
Invoke-WebRequest http://localhost:8001/health -UseBasicParsing
Invoke-WebRequest http://localhost:3000 -UseBasicParsing
Invoke-WebRequest http://localhost:5000 -UseBasicParsing
Invoke-WebRequest http://localhost:3002/api/plans -UseBasicParsing
```

Manual UI checks:

- Open `http://localhost:3000`.
- Confirm Keycloak login is shown with AgentryX theme.
- Register a tenant.
- Confirm free/default subscription creation succeeds.
- Confirm tenant module navigation is visible.
- Create a datasource.
- Create datasource config.
- Save credentials only after config exists.
- Test playground credential detection.
- Subscribe/cancel module and confirm module visibility updates based on subscription/access rules.
- Open `http://localhost:5000` and confirm admin pages load after admin auth.

If `Failed to fetch` appears in the tenant UI, check backend logs, Keycloak readiness, Vault unseal/token, and `KILLBILL_GATEWAY_URL`.

### Orchestration

After `docker compose up --build -d` from `orchestration`:

```powershell
docker compose ps
Invoke-WebRequest http://localhost:8060/health -UseBasicParsing
Invoke-WebRequest http://localhost:3100 -UseBasicParsing
```

Manual UI checks:

- Open `http://localhost:3100`.
- Login with demo admin credentials documented in the module runbook.
- Open Plans, Dashboard, Execute, History, Datasources, ITSM, Copilot, Knowledge, and Approvals.
- Create or clone a plan.
- Run an orchestration.
- Confirm execution history and execution detail render.
- If `GROQ_API_KEY` is set, run AI Copilot design and confirm backend logs show a real Groq request.

### PromptBuilder

After `docker compose up --build -d` from `PromptBuilder/backend`:

```powershell
docker compose ps
Invoke-WebRequest http://localhost:10002/healthz -UseBasicParsing
Invoke-WebRequest http://localhost:5174 -UseBasicParsing
```

Manual UI checks:

- Open `http://localhost:5174`.
- Create a prompt.
- Add/edit prompt blocks.
- Define inputs and context bindings.
- Save and reopen the prompt.
- Publish a version.
- Add a test case.
- Run a prompt if the required LLM/Cohere configuration is present.
- Open Run History and Audit Log.

### TemplateBuilder

After `docker compose up --build -d` from `TemplateBuilder/template-builder-engine` and starting the UI from `TemplateBuilder/template-builder-ui`:

```powershell
docker compose ps
Invoke-WebRequest http://localhost:10001/healthz -UseBasicParsing
Invoke-WebRequest http://localhost:10001/v1/templates -UseBasicParsing
```

Manual UI checks:

- Open the Vite UI URL, usually `http://localhost:5173`.
- Create a template.
- Add text/section/table/image blocks.
- Create a placeholder.
- Insert placeholder tokens into blocks.
- Preview a template.
- Generate a document.
- Download generated output.
- Open Marketplace and Audit Log.

Pay special attention to placeholder create/read/update and template placeholder scan, because those paths have known implementation caveats documented above.

### DocAI

After starting DocAI infrastructure, backend, and UI:

```powershell
Invoke-WebRequest http://localhost:8001/health/ -UseBasicParsing
Invoke-WebRequest http://localhost:8001/metrics -UseBasicParsing
Invoke-WebRequest http://localhost:3000 -UseBasicParsing
```

Manual UI/API checks:

- Create the first admin through `POST /auth/register` because the UI does not expose registration.
- Login through the UI.
- Open Dashboard.
- Open Document Types.
- Upload/parse a sample document.
- Use Auto Detect.
- Open Parse History.
- Confirm corrections/history endpoints work for created parse records.
- If using Postgres, verify parsing rule tables exist before testing parsing rule flows.

## Global Known Limitations

- There is no root orchestrator that starts all modules together.
- Port conflicts are expected if multiple modules run simultaneously without local port edits.
- Several modules use local/demo auth rather than shared enterprise SSO.
- FlowEngine uses Keycloak; Orchestration uses hardcoded demo JWT users; PromptBuilder and TemplateBuilder use hardcoded/local dev user behavior; DocAI uses its own JWT auth.
- PromptBuilder and TemplateBuilder share some historical TemplateBuilder-style code patterns, but they are separate folders and not a shared library.
- The design system is visually aligned across UIs, but not packaged as a shared dependency.
- Some Compose files contain mojibake in comments. The comments are ugly but not functional runtime directives.
- DocAI's checked-in Compose is infrastructure-only and may need pgvector-aware Postgres for migration success.
- Optional integrations such as Stripe, Razorpay, Gmail, Google OAuth, Groq, Cohere, Google Translate, Mautic, Salesforce, SAP, RAG, MLflow, GROBID, and Vault require real credentials or service availability.

## Git And Release Notes

This repository currently tracks source and documentation for all product folders listed above. Local generated artifacts are intentionally ignored.

Before pushing:

```powershell
git status --short
```

Confirm no real secrets are staged:

```powershell
git diff --cached --name-only
```

Then commit/push normally:

```powershell
git add README.md
git commit -m "Add universal repository README"
git push origin main
```

## Where To Find Deeper Module-Specific Runbooks

The root README is intended to be complete, but the module runbooks remain useful for step-by-step local operation:

- `FlowEngine2.0/README.md`
- `FlowEngine2.0/RUNBOOK.md`
- `KillBill/README.md`
- `KillBill/RUNBOOK.md`
- `orchestration/README.md`
- `orchestration/RUNBOOK.md`
- `PromptBuilder/README.md`
- `PromptBuilder/RUNBOOK.md`
- `TemplateBuilder/README.md`
- `TemplateBuilder/RUNBOOK.md`
- `Docai/docai_service/README.md`
- `Docai/docai_service/RUNBOOK.md`
- `Docai/docai-ui/README.md`

## Deep Universal Flow Atlas

This section is the final source-derived pass intended to make this root README the practical source of truth for the repository. It expands the earlier module summaries with page routes, endpoint routes, setup surfaces, user actions, buttons, role boundaries, runtime relationships, and known gaps discovered from the checked-in source.

### Coverage Boundary

- Tracked source coverage: this pass covers every tracked top-level source folder in the Git repository: `FlowEngine2.0`, `KillBill`, `orchestration`, `PromptBuilder`, `TemplateBuilder`, and `Docai`, plus root-level `.gitattributes`, `.gitignore`, and `README.md`.
- Local tooling folders: `.git`, `.agents`, `.codex`, and `.codex-audit` exist locally but are not product modules. They are intentionally ignored or local-control folders, not runtime application code.
- Generated dependencies: `node_modules`, `build`, `dist`, `__pycache__`, `.pytest_cache`, virtual environments, runtime databases, logs, generated invoices, generated render outputs, and ignored `.env` files are not documented as source because they are generated or secret-bearing local state.
- Secrets: real `.env` values are intentionally not reproduced here. Only checked-in examples and variable names are documented.
- Honest limit: this README documents the architecture, routes, flows, UI actions, setup, integrations, gaps, and behavior represented by the code. It does not paste every source line verbatim. For exact implementation syntax, the source remains authoritative; for understanding the repository end to end, this README is the intended guide.

### Complete Top-Level Folder Map

| Folder or file    | Tracked count | Runtime role                                 | Notes                                                                                                                                                     |
| ----------------- | ------------: | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.gitattributes`  |             1 | Git behavior                                 | Root Git attributes file.                                                                                                                                 |
| `.gitignore`      |             1 | Secret/artifact protection                   | Globally ignores `.env`, nested `.env`, dependency folders, build outputs, local Docker overrides, runtime JSON/SQLite artifacts, and local tool folders. |
| `README.md`       |             1 | Universal documentation                      | This master document.                                                                                                                                     |
| `FlowEngine2.0`   |           265 | Tenant and platform admin application        | FastAPI backend, Keycloak auth, Vault, Postgres, tenant React UI, admin React UI, integrated Kill Bill stack.                                             |
| `KillBill`        |            22 | Billing gateway and Kill Bill support assets | Catalog, scripts, gateway service, legacy proof-of-concept scripts and standalone files.                                                                  |
| `orchestration`   |           137 | AI orchestration engine                      | FastAPI orchestration backend, Vite React UI, Postgres schema, mock adapter services, domain packs, approvals, evidence, ITSM, Groq copilot.              |
| `PromptBuilder`   |            84 | Prompt design and prompt execution tool      | FastAPI backend, Vite React UI, Postgres app DB, Kasetti demo datasource DB, prompt versioning/testing/runs/audit.                                        |
| `TemplateBuilder` |           170 | Document/template generation studio          | FastAPI backend, Vite React UI, Postgres, Redis, worker, Kasetti demo datasource DB, document jobs, templates, placeholders, marketplace.                 |
| `Docai`           |           107 | Document AI proof of concept                 | FastAPI OCR/parsing service, React Scripts/MUI UI, Postgres/Weaviate/Grafana/Prometheus infra, scripts, tests, Kubernetes manifests.                      |

### Cross-Project Runtime Relationship

- `FlowEngine2.0` is the central product shell for tenant-facing and platform/company-facing user management, module access, credentials, datasource setup, intent policy configuration, and subscription lifecycle.
- `KillBill` is not a separate UI in the current unified FlowEngine experience. Its gateway and catalog are integrated into `FlowEngine2.0/docker-compose.yml`; legacy Kill Bill UI/portal compose content is intentionally not the active user-facing UI.
- `orchestration`, `PromptBuilder`, `TemplateBuilder`, and `Docai` are standalone projects. They were visually reskinned to align with the FlowEngine light enterprise design system, but they do not import FlowEngine code and must be able to run independently.
- There is no single root Compose file that starts all modules. Each module keeps its own local run procedure and can conflict on ports if multiple stacks run together without edits.
- Authentication is not shared globally. FlowEngine uses Keycloak. Orchestration has backend JWT endpoints and demo/local frontend behavior. PromptBuilder and TemplateBuilder use `dev_user` style local identity for audit headers. DocAI has its own JWT login.

## FlowEngine2.0 Full Runtime Atlas

### FlowEngine Purpose

`FlowEngine2.0` is the main AgentryX tenant/platform system. It manages platform modules, tenant accounts, tenant module subscriptions, dynamic tenant left navigation, datasource definitions, datasource configurations, secure credential storage through Vault, intent and validation policy configuration, tenant users, API keys, connected inboxes, billing/subscription details, and tenant playground operations.

### FlowEngine Runtime URLs

| URL                              | Surface                               | Container/service       | Notes                                                                                   |
| -------------------------------- | ------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| `http://localhost:3000/`         | Tenant landing page                   | `tenant-ui`             | Public landing page.                                                                    |
| `http://localhost:3000/register` | Tenant self-registration              | `tenant-ui`             | Email/password signup and Google signup entry.                                          |
| `http://localhost:3000/payment`  | Tenant payment page                   | `tenant-ui`             | Public payment route retained by tenant router.                                         |
| `http://localhost:3000/app`      | Tenant app overview                   | `tenant-ui`             | Protected by tenant session.                                                            |
| `http://localhost:5000/`         | Platform admin UI                     | `admin-ui`              | Redirects to `/register` inside admin app after auth.                                   |
| `http://localhost:8001/`         | FlowEngine backend root               | `flowengine-app-2`      | FastAPI root endpoint.                                                                  |
| `http://localhost:8001/health`   | FlowEngine backend health             | `flowengine-app-2`      | Backend health check.                                                                   |
| `http://localhost:7000/`         | Keycloak                              | `flowengine-keycloak`   | Realm export imports realm `flowengine`; theme is `agentryx`; client is `agentryx-app`. |
| `http://localhost:8201/`         | Vault host port                       | `flowengine-vault-2`    | Container-internal Vault address is `http://vault:8200`.                                |
| `http://localhost:8080/`         | Kill Bill server                      | `killbill-server`       | Used behind gateway.                                                                    |
| `http://localhost:3002/`         | Kill Bill gateway HTTP                | `killbill-gateway`      | Gateway API used by FlowEngine backend/admin/tenant billing.                            |
| `http://localhost:3005/`         | Kill Bill gateway webhook/socket side | `killbill-gateway`      | Webhook callback and websocket-related gateway port.                                    |
| `localhost:5433`                 | FlowEngine Postgres host port         | `flowengine-postgres-2` | Container DB name is `AgentryX`.                                                        |
| `localhost:3306`                 | Kill Bill MariaDB host port           | `killbill-mariadb`      | Shared inside FlowEngine compose.                                                       |

### FlowEngine Seeded And Required Credentials

- Keycloak bootstrap admin is `admin` / `admin` from `docker-compose.yml`. This is the Keycloak management/admin-console bootstrap user, not necessarily an AgentryX platform superadmin.
- Keycloak realm is currently `flowengine` in `infra/keycloak/realm-export.json` and `.env.example`.
- Keycloak client is `agentryx-app`.
- Keycloak login theme is `agentryx`.
- FlowEngine platform superadmin is seeded from `.env` variables `SUPER_ADMIN_USERNAME` and `SUPER_ADMIN_PASSWORD`. The example uses placeholder values and requires the username to be an email.
- FlowEngine Postgres uses `postgres` / `postgres`, database `AgentryX`, in Docker.
- Kill Bill tenant credentials are `KILLBILL_API_KEY=company_a` and `KILLBILL_API_SECRET=company_a_secret` in examples/compose.
- Kill Bill admin credentials used by bootstrap/gateway are `admin` / `password`.
- Vault has no safe universal default token. First-time Vault initialization produces unseal keys and a root token locally. The runbook explains that the developer must initialize, unseal, enable `secret` KV v2, and place the local token into FlowEngine `.env`.
- SMTP credentials are required for Keycloak action emails. FlowEngine `.env.example` documents `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, and `SMTP_FROM_NAME`.
- Google login requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, Google redirect URI, and Keycloak Google IdP bootstrap. These values are not committed.

### FlowEngine Docker Services

- `app`: builds the FastAPI backend from `FlowEngine2.0`, publishes `8001:8000`, depends on Postgres, Vault, Keycloak Google bootstrap, and Kill Bill gateway.
- `db`: Postgres 15, database `AgentryX`, initializes Keycloak schema through `infra/postgres/init-keycloak-db.sql`.
- `vault`: HashiCorp Vault 1.14.0 with file storage and local policies mounted from `infra/vault`.
- `killbill-db`: MariaDB image for Kill Bill.
- `killbill`: `killbill-fixed` image, exposes 8080, configured with test mode and MariaDB DAO.
- `killbill-catalog-bootstrap`: curl-based one-shot container that uploads `KillBill/catalog.xml`.
- `killbill-gateway`: builds `../KillBill/gateway`, exposes 3002 and 3005, proxies/wraps Kill Bill and reports back to FlowEngine through `FLOWENGINE_URL=http://app:8000`.
- `keycloak`: Keycloak 26.2.4, imports `realm-export.json`, mounts custom theme, and healthchecks before bootstrap.
- `keycloak-google-bootstrap`: Python one-shot service that waits for Keycloak readiness, applies Google IdP settings, and applies SMTP settings from FlowEngine `.env`.
- `tenant-ui`: builds `frontend/tenant`, serves the React tenant app on port 3000.
- `admin-ui`: builds `frontend/admin`, serves the React platform admin app on port 5000.
- Commented optional services in Compose: KAUI, Metabase, Mautic DB, Mautic. These are intentionally not active by default.

### FlowEngine Folder Details

- `backend/main.py`: FastAPI app creation, CORS/middleware, router inclusion, health/root endpoints, and startup wiring.
- `backend/core`: settings, database engine/session wiring, auth middleware, Keycloak/session helpers, and shared security behavior.
- `backend/modules/accounts`: tenant account creation, listing, editing, deletion, Keycloak user operations, Kill Bill account/subscription sync, first-login milestone seeding, API key auto-generation, and tenant purge cascade.
- `backend/modules/admins`: platform admin login/session verification and admin user CRUD.
- `backend/modules/api_keys`: tenant API key generation, lookup, `me`, and revoke behavior under `/portal/api-keys`.
- `backend/modules/auth`: tenant auth endpoints, Keycloak callback handling, session refresh/logout, self-registration, billing token, and API-key JWT token issuance.
- `backend/modules/credential_gateway`: secure datasource credential test/save/delete behavior, metadata confirmation, email inbox credential flows, Vault interaction, and connector-specific validation.
- `backend/modules/datasource_types`: supported datasource type registry and alias management for admin/superadmin.
- `backend/modules/datasources`: tenant datasource and datasource config CRUD, config lookup by name/driver/protocol, and config testing.
- `backend/modules/email_inboxes`: connected email inbox CRUD and test behavior.
- `backend/modules/intents`: tenant intents and intent policy CRUD.
- `backend/modules/module_groups`: admin module grouping used by tenant top module tabs.
- `backend/modules/platforms_modules`: module CRUD, module default/public lists, module assignment, tenant module lookup, and portal module endpoints.
- `backend/modules/rbac`: tenant role listing.
- `backend/modules/sidebar_items`: platform-configured tenant left-nav items, including nav section and hidden-from-module-user flags.
- `backend/modules/tenant_purge`: tenant data purge service used by account deletion.
- `backend/modules/users`: tenant sub-user creation, listing, edit, delete, Keycloak invite/action-email behavior.
- `backend/modules/validation_rules`: validation rule CRUD and ordering helpers.
- `frontend/admin`: standalone Vite React platform/admin UI. It is not a shared library.
- `frontend/tenant`: standalone Vite React tenant UI. It replaces legacy tenant HTML/folders while legacy source can remain orphaned until manual deletion.
- `infra/keycloak`: realm export, custom login/logout theme, and Google/SMTP bootstrap script.
- `infra/killbill`: catalog bootstrap shell script.
- `infra/postgres`: Keycloak database schema initialization.
- `infra/vault`: Vault config and policy files.
- `migrations` and `alembic.ini`: Alembic migration setup.
- `init_schema.sql`: strict initial FlowEngine schema and seed definitions.
- `tests`: backend tests/scaffolds.
- `docs/REPOSITORY_REFERENCE.md`: older repository reference/audit note.
- `scripts` and `tools`: operational helpers.

### FlowEngine Tenant UI Routes And Actions

| Route                     | Page/component          | What user sees/does                                                                                                                                               | Primary backend calls/actions                                                                                                                                                                 |
| ------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                       | `LandingPage`           | Public AgentryX landing page using legacy landing content, module showcase, module selection modal, Sign In, Start/Explore buttons.                               | Loads modules from `/admin/modules/public/list` with fallback `/api/public/modules`; selected module sends existing users to Keycloak login state or new users to `/register?...&plan=basic`. |
| `/landing`                | Redirect                | Redirects to `/`.                                                                                                                                                 | No data call.                                                                                                                                                                                 |
| `/register`               | `RegisterPage`          | Email/password registration form, module selection, Google signup button, sign-in button.                                                                         | `GET /api/public/modules`; `POST /auth/register`; Google path uses Keycloak auth URL.                                                                                                         |
| `/payment`                | `PaymentPage`           | Payment verification/upgrade route retained from legacy flow.                                                                                                     | Uses auth/payment/upgrade calls where applicable.                                                                                                                                             |
| `/app`                    | `DashboardPage`         | Tenant overview, module/workspace status, quick navigation, subscription details action.                                                                          | Tenant auth/session, workspace modules/sidebar; subscription details navigates to `/app/billing`.                                                                                             |
| `/app/datasources`        | `DatasourcesPage`       | Datasource list, search/typeahead, datasource type picker with brand logos, create/edit/delete/details/setup credentials/config actions.                          | `GET/POST/PUT/DELETE /datasources`, public/admin datasource type lists, related config/credential links.                                                                                      |
| `/app/datasource-configs` | `DatasourceConfigsPage` | Config list, typeahead datasource selector, create/edit/delete/test configuration.                                                                                | `GET/POST/PUT/DELETE /datasource-configs`, `POST /datasource-configs/{id}/test`, datasource lookups.                                                                                          |
| `/app/credentials`        | `CredentialsPage`       | Typeahead datasource selector, credential test/save/fetch-metadata/delete-vault flow. Blocks setup when datasource config is missing.                             | `/flowengine/datasources`, `/test-connection`, `/save-credentials`, `/vault/delete`, `/credentials/metadata-confirmed`.                                                                       |
| `/app/intents`            | `IntentsPage`           | Intent list/detail cards, add/edit/delete, details drawer, actions to create policy or validation rule.                                                           | `GET/POST/PUT/DELETE /intents`, policy/rule navigation.                                                                                                                                       |
| `/app/intent-policies`    | `IntentPoliciesPage`    | Policy list grouped/filterable by intent, typeahead intent selection, add/edit/delete policies.                                                                   | `GET /intents`, `GET /intents/policies/all`, `POST/PUT/DELETE /intents/{id}/policies...`.                                                                                                     |
| `/app/rules`              | `RulesPage`             | Validation rule list, intent filter/typeahead, datasource selector, add/edit/delete rules.                                                                        | `GET/POST/PUT/DELETE /validation-rules`, `GET /validation-rules/next-order/{intent_id}`, datasource/intents lookups.                                                                          |
| `/app/users`              | `UsersPage`             | Tenant user list, add user, edit user, delete user, loading states and timeout-aware success handling.                                                            | `GET/POST/PATCH/DELETE /users`.                                                                                                                                                               |
| `/app/roles`              | `RolesPage`             | Role list and selected user/role details.                                                                                                                         | `GET /rbac/roles`, user lookups as rendered.                                                                                                                                                  |
| `/app/api-keys`           | `ApiKeysPage`           | Active key card, generate, copy, revoke, regenerate, confirm dialogs.                                                                                             | `GET /portal/api-keys`, `GET /portal/api-keys/me`, `POST /portal/api-keys/generate`, `DELETE /portal/api-keys`.                                                                               |
| `/app/connected-inboxes`  | `ConnectedInboxesPage`  | Email inbox list, add/edit/test/delete inboxes.                                                                                                                   | `/api/email-inboxes`, `/api/email-inbox-types`, `/api/email-inboxes/{id}/test`.                                                                                                               |
| `/app/playground`         | `PlaygroundPage`        | Datasource selector, Fetch Data vs Generate SQL mode, query box, Reset, Run, result panel.                                                                        | `POST /demo/execute` via `playgroundApi.execute`; no matching FastAPI route was found in current FlowEngine backend source, so this route is a known gap.                                     |
| `/app/billing`            | `BillingPage`           | Subscription Details workspace with tabs: overview, subscriptions, invoices, payment methods, usage, health, subscribe. Default subscription filter includes all. | Kill Bill gateway/account/subscription/invoice/payment/usage endpoints through frontend proxy and billing lib.                                                                                |
| `/app/checkout`           | `CheckoutPage`          | Subscribe flow: select module, select plan, direct/free/Razorpay/Stripe step, success returns to billing.                                                         | `/portal/available-modules`, `/admin/modules/public/list`, `/portal/add-module`, `/auth/refresh`, Kill Bill gateway subscription/payment routes.                                              |
| `*`                       | Router fallback         | Public fallback to landing.                                                                                                                                       | No data call.                                                                                                                                                                                 |

### FlowEngine Tenant Navigation And Role Rules

- Tenant sidebar is not hardcoded page-by-page. It is derived from `/portal/my-modules` and `/portal/sidebar-items`.
- The module tab row is built from active tenant modules. Modules with the same `group_id` appear under one top tab and expose sub-module tabs.
- Module access source of truth is Kill Bill active subscriptions as interpreted by the backend. Canceled/inactive Kill Bill subscriptions should remove module access.
- A tenant with zero selected/active modules can still have an account, but the sidebar must be empty because modules are the source of truth for sidebar visibility.
- Left-nav items use the platform-managed `sidebar_items` table.
- Items with `nav_section = primary` render directly without showing the word "Primary".
- Items with `nav_section = more` render under the visible `More` expander.
- Items flagged `hidden_from_module_user` are hidden from `tenant_module_user` in the UI.
- `tenant_module_user` does not see the tenant sidebar `Subscription Details` button.
- Every tenant `AppButton` wraps the custom tooltip behavior. Native browser tooltips are not the intended pattern.

### FlowEngine Tenant Button/Action Atlas

- Landing `Sign In`: redirects to the Keycloak login URL.
- Landing `Start with available modules` and `View available modules`: scroll to the modules area.
- Landing `Explore platform capabilities`: scrolls to the capabilities section.
- Landing module card choose action: opens an existing-user/new-registration choice modal.
- Landing existing-user module action: redirects to Keycloak login with module state.
- Landing new-registration module action: navigates to `/register` with module id/name and `plan=basic`.
- Register `Create Account`: validates email/password/module form and posts `/auth/register`.
- Register Google button: starts Keycloak/Google signup with registration state.
- Register sign-in button: redirects to Keycloak login.
- First login popup primary action: navigates to `/app/datasources`.
- App mobile hamburger: opens/closes tenant sidebar.
- Sidebar `More`: expands/collapses secondary nav items.
- Sidebar module tab: switches active module or embeds external module URL if configured.
- Sidebar `Subscription Details`: navigates to `/app/billing` for tenant admin/co-admin.
- Sidebar `Log Out`: calls tenant logout and clears session.
- Datasources `Add Datasource`: opens supported datasource picker inline; choosing a datasource type opens the creation form.
- Datasources picker rows: show datasource brand/logo where configured, smaller professional text, and selection action.
- Datasources create/update: submits datasource fields such as datasource type, name, connection key, description, mode, active flag.
- Datasources row/detail actions: edit datasource, delete datasource, move toward config/credential setup.
- Datasource Configs `Add Config`: opens configuration form.
- Datasource Configs `Test`: calls config test endpoint.
- Datasource Configs save/delete buttons: create/update/delete config records.
- Credentials datasource typeahead: searches existing datasources without dumping the whole list by default; selected datasource can be cleared/researched.
- Credentials `Test Connection`: sends in-memory credentials to the credential gateway.
- Credentials `Save`: saves data-mode credentials to Vault and writes vault path on datasource config.
- Credentials metadata popup button: confirms metadata fetched; the extra redundant inline metadata button was removed.
- Credentials delete/remove behavior: deletes Vault credential path where exposed by UI flow.
- Intents `+ Add Intent`: opens composer.
- Intents row click: expands/details the selected intent.
- Intents `Edit` and `Delete`: update or remove an intent.
- Intents detail `Add Policy`: navigates to intent policy creation for that intent.
- Intents detail `Add Validation Rule`: navigates to rule creation for that intent.
- Intent Policies `+ Add Policy`: opens policy composer.
- Intent Policies intent filter: typeahead/selects an intent or all policies.
- Intent Policies row click: expands policy details.
- Intent Policies `Edit` and `Delete`: update/delete policy.
- Validation Rules `+ Add Rule`: opens rule composer.
- Validation Rules intent filter and datasource selector: typeahead/select respective entities.
- Validation Rules row click: expands rule details.
- Validation Rules `Edit` and `Delete`: update/delete rule.
- Users `+ Add User`: creates tenant sub-user and sends Keycloak invite/action email.
- Users row click: expands details.
- Users `Edit`: updates role/status/module access fields.
- Users `Delete`: deletes tenant user.
- Roles user row click: shows role details.
- API Keys `Generate API Key`: creates first key.
- API Keys `Copy Key`: writes key to clipboard.
- API Keys `Revoke Key`: opens confirm and then revokes.
- API Keys `Regenerate Key`: opens confirm and then creates a replacement key.
- Connected Inboxes add/edit/test/delete buttons: manage email inbox configurations and credentials.
- Billing `Refresh`: reloads billing workspace.
- Billing tabs: switch between overview, subscriptions, invoices, payment methods, usage, health, and subscribe.
- Billing `Manage Subscriptions`, `View Invoices`, `Payment Methods`, `View Usage`: switch active tab.
- Billing subscription `Submit change`: submits selected plan change.
- Billing subscription `Cancel`: cancels subscription through gateway.
- Billing invoice `View`: opens invoice detail panel.
- Billing invoice `PDF`/`Download PDF`: downloads invoice PDF.
- Billing usage `Refresh`: reloads usage metrics.
- Billing usage `Add Alert`: adds a local usage alert threshold row.
- Billing health `Re-run checks`: re-runs billing health checks.
- Billing `Open Subscribe`: navigates to `/app/checkout`.
- Checkout module card: selects module.
- Checkout plan card: selects plan.
- Checkout `Continue`: advances step.
- Checkout payment submit: creates subscription/payment depending on selected provider.
- Checkout Stripe button: confirms Stripe payment intent.
- Checkout success `Go to Billing`: returns to `/app/billing`.
- Playground `Fetch Data` and `Generate SQL`: switch operation mode.
- Playground `Reset`: clears query/result state.
- Playground `Run`: posts to `/demo/execute` and shows result or error.

### FlowEngine Admin UI Routes And Actions

| Route                           | Visibility             | What user sees/does                                                                                                                                                                                                                       | Primary calls                                                                                                                   |
| ------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `/`                             | Admin session required | Redirects to `/register`.                                                                                                                                                                                                                 | Auth guard calls `/admin/auth/me`.                                                                                              |
| `/register`                     | Admin and superadmin   | Create tenant client account and send API key/password email.                                                                                                                                                                             | `GET /admin/modules`, `POST /api/accounts`.                                                                                     |
| `/clients`                      | Admin and superadmin   | Search/list tenants, edit, upgrade, delete.                                                                                                                                                                                               | `GET /api/accounts`, `PATCH /api/accounts/{email}/edit`, `PATCH /api/accounts/{email}/upgrade`, `DELETE /api/accounts/{email}`. |
| `/modules`                      | Admin and superadmin   | Create/edit/delete platform modules, set default/free/trial/API-call fields, optional external URL behavior, module group, and sidebar assignments. Modules do not have a `type` column; internal/external type belongs to sidebar items. | `/admin/modules`, `/admin/sidebar-items`.                                                                                       |
| `/sidebar-items`                | Admin and superadmin   | UI label is `Client Side Left Nav Setup`; create/edit/delete tenant left-nav items.                                                                                                                                                       | `/admin/sidebar-items`.                                                                                                         |
| `/admins`                       | Superadmin only        | Create/edit/delete company admin users.                                                                                                                                                                                                   | `/admin/admins`.                                                                                                                |
| `/datasource-types`             | Admin and superadmin   | Create/edit/delete datasource drivers/types and manage aliases.                                                                                                                                                                           | `/admin/datasource-types`, `/admin/datasource-types/{id}/aliases`.                                                              |
| `/module-groups`                | Admin and superadmin   | Create/edit/delete module groups and assign modules to groups.                                                                                                                                                                            | `/admin/module-groups`, `/admin/modules/{id}`.                                                                                  |
| `/billing/dashboard`            | Superadmin only        | Subscription Details dashboard.                                                                                                                                                                                                           | Kill Bill proxy/gateway account/invoice/bundle calls.                                                                           |
| `/billing/customers`            | Superadmin only        | Billing customer search/list.                                                                                                                                                                                                             | Kill Bill proxy account pagination.                                                                                             |
| `/billing/customers/:accountId` | Superadmin only        | Customer details with bundles/invoices/account tabs.                                                                                                                                                                                      | Kill Bill proxy account detail/bundles/invoices.                                                                                |
| `/billing/subscriptions`        | Superadmin only        | Subscription list, details, cancel flow.                                                                                                                                                                                                  | Kill Bill proxy subscriptions/accounts/bundles.                                                                                 |
| `/billing/payments`             | Superadmin only        | Payment table, filters, provider/status summaries.                                                                                                                                                                                        | `/killbill-api/payments`, `/killbill-api/payments/summary`.                                                                     |
| `/billing/revenue`              | Superadmin only        | Revenue reporting from invoices.                                                                                                                                                                                                          | Kill Bill account/invoice calls.                                                                                                |
| `/billing/config`               | Superadmin only        | Billing settings sections and toggles.                                                                                                                                                                                                    | `/killbill-api/config`.                                                                                                         |
| `/billing/plans`                | Superadmin only        | Plan CRUD, module filtering, active/usage toggles.                                                                                                                                                                                        | `/killbill-api/plans`, `/killbill-api/modules/active`.                                                                          |

### FlowEngine Admin Button/Action Atlas

- Admin AuthGuard loads `/admin/auth/me`; unauthenticated users redirect to Keycloak login.
- Admin sidebar logout posts `/admin/auth/logout` and redirects to Keycloak logout.
- Register Client module tiles toggle selected modules.
- Register Client `Create Account & Send API Key` calls tenant account creation and triggers Keycloak email action best-effort.
- Manage Clients search filters by email/tenant.
- Manage Clients `Edit`: opens edit modal with status/account/module assignment and syncs Kill Bill subscription changes.
- Manage Clients `Upgrade`: sets production account and updates API key expiry.
- Manage Clients `Delete`: deletes Keycloak tenant admin/sub-users, auth API key rows, FlowEngine tenant data, Vault paths, and attempts Kill Bill subscription cancellation.
- Modules `+ Add Module`: opens create modal.
- Module create/edit external behavior is controlled by module URL fields such as `external_url`; the database does not store a `modules.type` value. Internal/external item type is configured in Client Side Left Nav Setup for `auth.sidebar_items`.
- Module create/edit default toggle controls default module flag.
- Module sidebar item checkboxes assign tenant left-nav values to the module.
- Module row `Edit`/`Delete`: update/delete module.
- Client Side Left Nav Setup `+ Add Item`: creates tenant nav item with value, label, icon, URL, type, open mode, nav section, display order, and hidden-from-module-user flag.
- Client Side Left Nav Setup row `Edit`/`Delete`: update/delete nav item.
- Admins `+ Add Admin`: creates company admin credentials.
- Admins `Edit`: updates active state.
- Admins `Delete`: removes company admin.
- Datasource Types `+ Add Driver`: creates driver/canonical datasource type with fields, dialect, implementation, and active flag.
- Datasource Types `Aliases`: opens alias modal.
- Alias modal `Add Alias` and row `Delete`: manage alias rows.
- Datasource Types `Edit`/`Delete`: update/delete driver.
- Module Groups `+ Add Group`: creates group and patches selected modules to group id.
- Module Groups `Edit`/`Delete`: update group membership/details or delete group.
- Billing Config section buttons switch config sections; toggles update boolean settings; `Save` persists config.
- Billing Plans `+ Add Plan`: creates local/gateway plan definition.
- Billing Plans module tabs filter by module.
- Billing Plans active toggle and usage toggle update plan fields.
- Billing Plans edit panel save/cancel updates plan values.
- Billing Plans delete removes a plan from gateway local store.
- Billing Subscriptions detail/cancel actions call Kill Bill subscription cancellation.
- Billing Payments refresh/status/provider filters update displayed payment rows.
- Billing customer detail tabs switch between account, bundles, and invoices.

### FlowEngine Backend Endpoint Atlas

Core:

- `GET /`: backend root.
- `GET /health`: backend health.

Tenant/auth:

- `GET /auth/keycloak/callback`: completes Keycloak auth callback and sets cookies.
- `POST /auth/logout`: deletes tenant session cookie.
- `POST /auth/refresh`: uses `refresh_token` cookie to refresh session cookie.
- `POST /auth/register`: self-register tenant admin; creates Keycloak user, Kill Bill account, free subscriptions for selected modules when available, first-login milestone, API key, and best-effort email.
- `GET /auth/me`: returns tenant session attributes from Keycloak userinfo.
- `POST /auth/payment/verify`: boolean payment verify helper.
- `POST /auth/upgrade-to-production`: upgrades tenant account type.
- `POST /auth/user-token`: password grant for tenant sub-users, emits JWT for subuser.
- `POST /auth/token`: API-key to JWT token exchange.
- `GET /auth/billing-token`: short-lived billing portal token for tenant admin/co-admin.
- `GET /auth/billing-verify`: validates billing portal token.

Platform accounts/admin:

- `GET /api/modules`: active modules for admin account creation.
- `POST /api/accounts`: admin tenant creation.
- `GET /api/accounts`: list tenant admins from Keycloak, with active modules resolved from Kill Bill.
- `GET /api/accounts/{email}`: tenant account detail by email.
- `DELETE /api/accounts/{email}`: tenant deletion and cleanup.
- `PATCH /api/accounts/{email}/upgrade`: upgrade account to production.
- `PATCH /api/accounts/{email}/edit`: edit status/email/account/modules and sync Kill Bill module subscriptions.
- `GET /api/accounts/{email}/apikey`: API key metadata for tenant.
- `GET /api/public/modules`: public default modules for registration.
- `POST /admin/auth/logout`: admin logout.
- `GET /admin/auth/me`: admin session info and role.
- `POST /admin/admins`, `GET /admin/admins`, `PATCH /admin/admins/{admin_id}`, `DELETE /admin/admins/{admin_id}`: company admin CRUD.

Modules/navigation:

- `/admin/modules`: list/create/update/delete platform modules plus default/public/tenant assignment routes.
- `/portal/my-modules`, `/portal/available-modules`, `/portal/add-module`: portal module access/subscription helpers included by module router.
- `/admin/module-groups`: module group CRUD.
- `/admin/sidebar-items`: left-nav setup CRUD.
- `/portal/sidebar-items`: tenant-side sidebar item list.

Datasource/credential:

- `GET /admin/datasource-types/public`: public supported datasource types.
- `GET/POST/PATCH/DELETE /admin/datasource-types...`: admin/superadmin datasource type CRUD and aliases.
- `GET/POST/PUT/DELETE /datasources`: tenant datasource CRUD.
- `GET/POST/PUT/DELETE /datasource-configs`: tenant datasource config CRUD and lookups by name/driver/protocol.
- `POST /datasource-configs/{config_id}/test`: test datasource config.
- `GET /flowengine/datasources`: credential gateway datasource list.
- `POST /test-connection`: test supplied credentials.
- `PUT /save-credentials`: save data-mode credentials to Vault or flush query-mode credentials after metadata.
- `DELETE /vault/delete`: delete stored Vault secret.
- `POST /credentials/metadata-confirmed`: record metadata completion.

Email inboxes:

- `GET/POST/PUT/DELETE /api/email-inboxes`: inbox CRUD.
- `POST /api/email-inboxes/{inbox_id}/test`: test inbox.
- `GET /api/email-inbox-types`: supported inbox type list.
- `POST /email-inbox/test-connection`, `PUT /email-inbox/save-credentials`: credential-gateway inbox helpers.

Intent/policy/rule/user/access:

- `GET/POST/PUT/DELETE /intents`: tenant intent CRUD.
- `GET /intents/policies/all`, `GET /intents/policies`, `GET/POST/PUT/DELETE /intents/{intent_id}/policies...`: intent policy CRUD.
- `GET/POST/PUT/DELETE /validation-rules`: validation rule CRUD.
- `GET /validation-rules/intent/{intent_id}/language/{language_code}`: scoped rule lookup.
- `GET /validation-rules/next-order/{intent_id}`: ordering helper.
- `GET/POST/PATCH/DELETE /users`: tenant sub-user CRUD.
- `GET /rbac/roles`: role list.
- `POST/GET/DELETE /portal/api-keys`: tenant API key operations.
- `GET /portal/api-keys/me`: current tenant key info.
- `DELETE /admin/tenants/{tenant_id}/purge`: tenant purge endpoint.

### FlowEngine Account Creation And Subscription Flows

- Platform admin flow: admin signs into `http://localhost:5000`, opens Register Client, selects modules, submits email/account type/expiry. Backend `POST /api/accounts` calls shared `create_account`.
- Tenant self-registration flow: user opens `http://localhost:3000/register`, selects module, enters email/password, submits. Backend `POST /auth/register` resolves `module_id` into module name and calls shared `create_account`.
- Google signup flow: landing/register uses Keycloak Google provider. The Keycloak callback path attaches tenant metadata when registration state is present and then uses shared account creation behavior for tenant context.
- Shared account creation creates or updates Keycloak tenant admin, assigns `tenant_admin` role, creates a Kill Bill account using `externalKey=tenant_id`, creates free/basic module subscriptions for selected modules if a zero-price plan exists, stores first-login milestone, auto-generates a tenant API key, and sends a Keycloak email action best-effort.
- Email failure is intentionally non-rollback after account and billing resources are created. Logs warn, but tenant creation is preserved.
- If Kill Bill account/subscription creation fails during initial creation, the Keycloak user is rolled back to avoid an auth-only tenant.
- If no modules are selected, account creation is allowed; no module subscriptions are created, and tenant sidebar should be empty.
- Module access after creation is determined from active Kill Bill subscriptions, not only Keycloak module attributes.
- Admin edit of tenant modules compares requested modules with active Kill Bill modules, cancels removed module subscriptions, and creates free-plan subscriptions for added modules where possible.
- Admin deleting a tenant removes tenant admin and sub-users from Keycloak, deletes auth API client rows, purges FlowEngine tenant data, removes Vault paths collected by purge, and attempts Kill Bill subscription cancellation. The code cancels subscriptions but does not prove deletion of the Kill Bill account/customer record itself.

### FlowEngine Known Gaps And Limitations

- Realm name is still `flowengine`; branding/theme/client are AgentryX. Renaming the realm would require coordinated changes in `realm-export.json`, `.env`, frontend auth URLs, backend settings, and Keycloak data reset/migration.
- `POST /demo/execute` is called by the tenant Playground, but no matching FlowEngine FastAPI route was found in the current backend. This must be implemented or proxied for full playground execution.
- Vault must be manually initialized/unsealed after volume resets unless additional automation is added.
- Kill Bill catalog bootstrap is automatic in Compose, but depends on Kill Bill being truly ready; readiness delays can still affect first startup.
- Google OAuth and SMTP require real external credentials and provider-side redirect configuration.
- Optional commented services are not active by default.
- Legacy tenant folders may still exist as orphaned source, but the active tenant service is `frontend/tenant`.

## KillBill Full Runtime Atlas

### KillBill Purpose

`KillBill` contains billing support for AgentryX. In the current system, the active billing UI is inside FlowEngine tenant/admin apps. `KillBill` contributes catalog definitions, setup scripts, and a Node/Express gateway that wraps Kill Bill APIs, plan metadata, payment recording, reminders, webhooks, usage, product sync, and third-party payment provider calls.

### KillBill Folder Details

- `catalog.xml`: source billing catalog uploaded into Kill Bill by `killbill-catalog-bootstrap` and/or `01-upload-catalog.ps1`.
- `gateway/index.js`: active gateway runtime used by FlowEngine.
- `gateway/Dockerfile`: builds the gateway container.
- `gateway/package.json` and lock file: Node dependencies.
- `gateway/.env.example`: Kill Bill, payment, mail, and optional Mautic configuration placeholders.
- `00-setup-tenant.ps1` through `08-run-all.ps1`: local PowerShell scripts to setup tenant, upload catalog, create account, create subscriptions, record usage, upgrade to paid, fetch invoices, test webhooks, and run the whole script sequence manually.
- `server.js`: standalone legacy proof-of-concept UI/server, not the active FlowEngine billing UI.
- `webhook-listener.js`: standalone webhook listener proof-of-concept with placeholder notification behavior.
- `.gitignore`: local Kill Bill generated artifacts ignore rules.
- `README.md` and `RUNBOOK.md`: module-specific documentation.

### KillBill Gateway Endpoints

- `GET /api/plans`: returns local/gateway subscription plan list.
- `GET /api/modules/active`: returns active module information derived from plan/product data.
- `GET /api/plans/modules`: returns plans grouped by module for FlowEngine free-plan subscription selection.
- `POST /api/plans`: creates gateway plan metadata and updates catalog/product behavior where coded.
- `PUT /api/plans/:id`: updates plan metadata.
- `DELETE /api/plans/:id`: deletes plan metadata.
- `GET /api/config`: reads billing gateway config.
- `PUT /api/config`: writes billing gateway config.
- `POST /api/webhooks/killbill`: Kill Bill webhook receiver.
- `POST /api/webhooks/register`: registers webhooks with Kill Bill.
- `POST /api/webhooks/test`: local webhook test.
- `POST /api/reminders/send`: sends reminder email.
- `POST /api/reminders/test`: sends test reminder.
- `POST /api/usage`: records usage.
- `GET /api/usage/summary`: usage summary.
- `GET /api/usage/series`: usage time series.
- `POST /api/payments/record`: records local payment metadata.
- `GET /api/payments`: payment list.
- `GET /api/payments/summary`: payment summary.
- `POST /api/razorpay/order`: creates Razorpay-style order payload.
- `POST /api/stripe/create-payment-intent`: creates Stripe payment intent when Stripe secret is configured.
- `POST /api/stripe/confirm-payment`: confirms Stripe payment flow metadata.
- `POST /api/cron/run-reminder-check`: manually triggers reminder scan.
- `POST /api/products/sync`: syncs product/catalog data.
- `POST /api/products/update`: updates product/catalog state.
- `PUT /api/products/:name`: updates product by name.
- `DELETE /api/products/:name`: deletes product by name.
- The gateway also proxies or calls Kill Bill `/api/v1/...` routes used by FlowEngine billing pages.

### KillBill Flow Notes

- FlowEngine tenant creation calls Kill Bill account creation with `externalKey` equal to the FlowEngine `tenant_id`.
- FlowEngine module subscription creation sends `planName` to Kill Bill, not the unsupported `planId` field.
- The zero-price/basic plan per module is used for initial module assignment when a tenant selects a module during registration/account creation.
- When a module subscription is canceled or no longer active, FlowEngine should stop showing that module in tenant navigation because active Kill Bill subscription state is the source of truth.
- Gateway payments and usage are local/gateway-side support records. Real Stripe/Razorpay behavior requires credentials.
- Reminder and Mautic behavior is optional and credential-dependent.

### KillBill Known Gaps And Limitations

- `server.js` and `webhook-listener.js` are legacy/standalone proof-of-concept files, not the active UI path.
- Generated `write-gateway*.js` helper files may exist locally but are ignored by root `.gitignore`.
- Stripe, Razorpay, Gmail, and Mautic integrations require real credentials.
- The active FlowEngine compose expects a local Docker image named `killbill-fixed`; load the provided archive first with `docker load -i C:\path\to\your\image.tar` or, from repo root, `docker load -i .\killbill-fixed.tar`.
- Full volume reset requires catalog upload/bootstrap before subscriptions can be reliably created.

## Orchestration Full Runtime Atlas

### Orchestration Purpose

`orchestration` is a standalone AI orchestration service and UI. It manages orchestration plans, plan versions, executable DAG-like steps, runtime execution, evidence bundles, tenant policies and budgets, datasources, ITSM tickets, human/agent approvals, domain packs, knowledge graph helpers, audit narratives, redaction policy helpers, ZKP validation, and AI Copilot plan design using Groq when configured.

### Orchestration Runtime URLs

- Frontend: `http://localhost:3100`.
- Backend: `http://localhost:8060`.
- Backend health: `http://localhost:8060/health`.
- Backend metrics: `http://localhost:8060/metrics`.
- Postgres host port: `localhost:5434`, container database `orchestration`.
- Mock adapter: `http://localhost:8101`.

### Orchestration Folder Details

- `docker-compose.yml`: starts Postgres, mock adapter, backend, and frontend.
- `.env.example`: contains `GROQ_API_KEY=` placeholder.
- `db-init`: SQL schema/seed initialization.
- `services/main.py`: large FastAPI app containing auth, plans, versions, runtime execution, admin policy/budget, datasources, ITSM, copilot, evidence, knowledge, domain packs, governance, approvals, agent run routes.
- `services/config`, `services/db`, and related service modules: environment validation, DB connection pool, schema execution.
- `services/executors`: step executors for SQL/API/webhook/AI/EIVS/domain operations.
- `services/tests`: pytest coverage for executor, plan, approval, and e2e behavior.
- `mock_services`: Dockerized adapter, LLM, and evidence mock services with their own health and API routes.
- `frontend`: standalone Vite React/TypeScript app.
- `docs`: module docs.
- `README.md` and `RUNBOOK.md`: module-specific documentation.

### Orchestration Frontend Routes And Actions

| Route                | Page               | User actions                                                                                                                              |
| -------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                  | Dashboard          | Shows overview cards and recent operational health; error dismiss if load fails.                                                          |
| `/plans`             | Plans list         | Search/filter/reset plans, create new plan, import JSON, open plan, activate/deactivate.                                                  |
| `/plans/new`         | New plan           | Enter plan metadata, choose error policy, add steps, configure step kinds, move steps, enable/disable steps, delete steps, submit create. |
| `/plans/import`      | Import plan        | Drag/drop/select JSON, parse plan JSON, import/create plan, navigate to created plan.                                                     |
| `/plans/:id`         | Plan detail        | View plan, expand step details, deactivate/activate, clone, edit, delete with confirm, navigate history/canvas/canary.                    |
| `/plans/:id/edit`    | Edit plan          | Same step editor as new plan, saves updates.                                                                                              |
| `/plans/:id/history` | Version history    | Expand versions, add change note, restore version, show diff.                                                                             |
| `/plans/:id/canvas`  | DAG canvas         | Drag nodes, pan canvas, wheel zoom, zoom in/out, reset view, auto layout, inspect nodes.                                                  |
| `/plans/:id/canary`  | Canary             | Switch tabs, edit runtime params, add/remove params, run canary execution.                                                                |
| `/execute`           | Execute 360        | Enter plan name, entity type, tenant id, dynamic params, add/remove params, execute and navigate monitor.                                 |
| `/execute/monitor`   | Execution monitor  | Runs plan from route state, polls steps, switches tabs, shows result/error/trace details, back to execute.                                |
| `/history`           | Execution history  | Refresh, search/filter/reset, expand cards, switch readable/JSON views, open detail, delete with confirm.                                 |
| `/history/:id`       | Execution detail   | View execution detail, switch result tabs, copy JSON, expand nested JSON.                                                                 |
| `/admin`             | Admin console      | Switch admin tabs for tenant policy/budget and related admin controls.                                                                    |
| `/datasources`       | Datasource catalog | Add/edit/delete/test datasource, toggle active, add/remove tags, search/filter/reset, expand details.                                     |
| `/packs`             | Domain packs       | Refresh, category/status/search filters, expand pack, install, uninstall.                                                                 |
| `/evidence`          | Evidence viewer    | Refresh/search/filter, expand bundle, readable/JSON view, generate narrative, copy narrative.                                             |
| `/approvals`         | Approvals          | Pending/all filter, refresh, open decision detail, approve, reject, navigate history after approval.                                      |
| `/billing`           | Usage billing      | Switch tabs and filters for usage/cost/account views.                                                                                     |
| `/copilot`           | AI Copilot         | Use prompt chips, design plan, save generated plan, switch to lint tab, safety lint JSON, optimize.                                       |
| `/itsm`              | ITSM               | Type/status filters, refresh, open solve form, mark solved, cancel solve.                                                                 |
| `/knowledge`         | Knowledge graph    | Load entity types, enter type/id, fetch entity, show attributes/relationships, submit on Enter.                                           |
| `*`                  | Not found          | Renders not-found page.                                                                                                                   |

### Orchestration Sidebar

- Sidebar brand text is `Agentary` with subtitle `Orchestrator`.
- Core nav: Dashboard, Plans, Execute 360, History.
- AI Features nav: AI Copilot, ITSM, Knowledge Graph.
- Governance nav: Evidence, Approvals.
- Admin nav: Admin Console, Datasources, Domain Packs.
- Sidebar polls `GET /v1/itsm/tickets?status=OPEN` every 20 seconds and shows a badge on ITSM when open tickets exist.
- Footer shows backend-connected status. It does not implement a shared auth/logout UX like FlowEngine.

### Orchestration Backend Endpoint Atlas

- `GET /health`, `GET /metrics`: service health and Prometheus-style metrics.
- `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`: JWT auth helpers.
- `POST/GET/GET by id/PUT/DELETE /admin/plans`: plan CRUD.
- `PATCH /admin/plans/{plan_id}/deactivate`, `PATCH /admin/plans/{plan_id}/activate`, `POST /admin/plans/{plan_id}/clone`: plan lifecycle.
- `GET/POST /admin/plans/{plan_id}/versions`, `POST /admin/plans/{plan_id}/versions/{version}/restore`: plan versioning and restore.
- `POST /v1/360`: legacy entity 360 execution endpoint.
- `POST /v1/orchestrations/run`: primary orchestration runtime execution endpoint.
- `GET /v1/orchestrations/runs`, `GET /v1/orchestrations/runs/{execution_id}`, `GET /v1/orchestrations/runs/{execution_id}/steps`: execution and step inspection.
- `GET /v1/orchestrations/runs/{execution_id}/agent-tasks`: agent tasks for an execution.
- `GET /v1/executions`, `GET /v1/executions/{execution_id}`, `DELETE /v1/executions/{execution_id}`: execution history.
- `GET /v1/runtime/contracts/{plan_name}`, `GET /v1/runtime/contracts/{plan_name}/openapi`: runtime contract export.
- `GET/POST /admin/tenants/{tenant_id}/policy`, `GET /admin/tenants`: tenant policy management.
- `GET/POST /admin/tenants/{tenant_id}/budget`: tenant budget management.
- `GET/POST/GET by id/PUT/DELETE /admin/datasources`, `POST /admin/datasources/{datasource_id}/test`: datasource admin.
- `POST /v1/itsm/tickets`, `GET /v1/itsm/tickets`, `GET /v1/itsm/tickets/{ticket_id}`, `POST /v1/itsm/tickets/{ticket_id}/resolve`: ITSM.
- `POST /v1/copilot/design`, `POST /v1/copilot/safety-lint`, `POST /v1/copilot/optimize`: AI Copilot.
- `GET /v1/evidence/bundles`, `GET /v1/evidence/bundles/{id}`: evidence bundles.
- `GET /v1/knowledge/entity-types`, `GET /v1/knowledge/entities/{entity_type}/{entity_id}`, `POST /v1/knowledge/synthesize`: knowledge graph helpers.
- `GET /admin/domain-packs`, `POST /admin/domain-packs/{pack_id}/install`, `DELETE /admin/domain-packs/{pack_id}/uninstall`: domain packs.
- `POST /v1/zkp/validate`, `POST /v1/redaction/policy`, `GET /v1/redaction/policies`, `POST /v1/audit/narrative`, `POST /v1/audit/counterfactual`: governance helpers.
- `GET /v1/human-review-approvals`, `GET /v1/human-review-approvals/{approval_id}`, `POST /v1/human-review-approvals/{approval_id}/approve`, `POST /v1/human-review-approvals/{approval_id}/reject`: human review approvals.
- `GET /v1/agent-task-runs/{agent_run_id}`, `GET /v1/agent-task-runs/{agent_run_id}/trace`: agent run inspection.
- `GET /v1/agent-approvals`, `POST /v1/agent-approvals/{approval_id}/approve`, `POST /v1/agent-approvals/{approval_id}/reject`: agent approval handling.
- `GET/PUT/DELETE /admin/intent-plan-mappings...` and `GET /v1/intents/{intent_code}/plan`: intent to plan mappings.

### Orchestration External Integrations And Known Limits

- Groq is used by AI Copilot when `GROQ_API_KEY` is configured.
- Mock adapter service provides EIVS-style email validation/search endpoints for local testing.
- Some executor behavior is demo/mock-oriented and verified by tests with fake functions.
- Compose can conflict with FlowEngine/PromptBuilder/TemplateBuilder on Postgres host ports if run together without port edits.
- The frontend does not currently enforce FlowEngine-style role-based navigation.

## PromptBuilder Full Runtime Atlas

### PromptBuilder Purpose

`PromptBuilder` is a standalone prompt engineering and prompt execution workspace. It lets users create prompts, edit blocks/inputs/context bindings/schema/guardrails, publish and roll back versions, run prompts, view run traces/history, create regression test cases, execute tests/evaluations, and bridge prompt output toward document generation.

### PromptBuilder Runtime URLs

- Frontend: `http://localhost:5174`.
- Backend: `http://localhost:10002`, container port 8080.
- API base expected by frontend: `http://localhost:10002/v1`.
- Kasetti demo datasource host port: `localhost:5434`.
- PromptBuilder app Postgres is internal to Compose and not published by default.

### PromptBuilder Folder Details

- `backend/docker-compose.yml`: starts frontend, backend, PromptBuilder Postgres, and Kasetti demo datasource Postgres.
- `backend/src/main.py`: FastAPI app and mounted prompt/audit/document/AI routes that are active in current runtime.
- `backend/src/api/prompts.py`: active prompt CRUD, blocks, inputs, context bindings, schema, run, versions, publish, rollback, test cases, evaluations, document generation, and run lookup behavior.
- `backend/src/api/audit.py`: audit event route.
- `backend/src/api/ai.py`: AI tools and SQL generation.
- `backend/src/api/documents.py`: document preview/generate/job/download endpoints used by document integration.
- `backend/src/api/templates.py`, `placeholders.py`, `marketplace.py`, `tests.py`, `import_routes.py`, `import_template.py`, `render.py`: TemplateBuilder-style modules present in the folder; README notes they are not all mounted by PromptBuilder `main.py`.
- `backend/src/core`: DB models, renderers, resolver, datasource adapter, and shared helpers.
- `backend/db/migrations`: PromptBuilder schema migrations.
- `backend/kasetti-db`: demo datasource seed SQL.
- `frontend`: standalone Vite React/TypeScript UI.
- `README.md` and `RUNBOOK.md`: module docs.

### PromptBuilder UI Routes And Actions

| Route                  | Page                          | User actions                                                                                                                             |
| ---------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                    | Redirect                      | Redirects to `/prompts`.                                                                                                                 |
| `/prompts`             | My Prompts                    | Search/filter prompts, create prompt, open prompt, duplicate prompt, archive prompt.                                                     |
| `/prompts/studio`      | Prompt Studio empty/new state | If no prompt id, prompts user to go back to My Prompts or create/open prompt.                                                            |
| `/prompts/studio/:id`  | Prompt Studio editor          | Back, Save current tab, Test tab, Publish, switch tabs for Blocks/Inputs/Context/Output/Guardrails/Test/Versions, edit prompt structure. |
| `/prompts/run`         | Run Console                   | Select prompt, enter runtime inputs, run prompt, copy output, switch output tabs.                                                        |
| `/prompts/test-cases`  | Test Cases                    | Select prompt, add test case, edit, delete, run all regression tests, show sweep result.                                                 |
| `/prompts/run-history` | Run History                   | Refresh runs, select run, inspect detail tabs/trace/result.                                                                              |
| `/audit`               | Audit log                     | Refresh, search, filter by entity/action/actor, clear filters, expand event details.                                                     |

### PromptBuilder Sidebar

- Brand: `PromptBuilder`, eyebrow `AI Studio`, avatar/user `dev_user`.
- Nav items: My Prompts, Prompt Studio, Run Console, Test Cases, Run History, Audit log.
- Sidebar writes `tb_user_id=dev_user` into localStorage for backend audit headers.

### PromptBuilder Active API Client Surface

- `GET /v1/prompts`: list prompts with `status_filter`, industry, use case, search, limit, offset.
- `GET /v1/prompts/{prompt_id}`: prompt detail.
- `POST /v1/prompts`: create prompt.
- `PUT /v1/prompts/{prompt_id}`: update prompt.
- `DELETE /v1/prompts/{prompt_id}`: soft-delete/archive prompt.
- `POST /v1/prompts/{prompt_id}/duplicate`: duplicate prompt.
- `GET/PUT /v1/prompts/{prompt_id}/blocks`: read/replace prompt blocks.
- `GET/PUT /v1/prompts/{prompt_id}/inputs`: read/replace prompt inputs.
- `GET/PUT /v1/prompts/{prompt_id}/context-bindings`: read/replace context bindings.
- `GET/PUT /v1/prompts/{prompt_id}/schema`: read/save output schema and guardrails.
- `POST /v1/prompts/run`: run prompt through configured LLM path.
- `GET /v1/prompt-runs/{run_id}` and `GET /v1/prompt-runs/{run_id}/trace`: inspect run and trace.
- `GET/POST /v1/prompts/{prompt_id}/versions`: list/create version snapshots.
- `POST /v1/prompts/{prompt_id}/publish`: publish prompt version.
- `POST /v1/prompts/{prompt_id}/rollback`: roll back to version.
- `GET/POST/PUT/DELETE /v1/prompts/{prompt_id}/test-cases`: test case CRUD.
- `POST /v1/prompts/{prompt_id}/test`: run one saved or ad hoc test.
- `POST /v1/prompts/{prompt_id}/evaluate`: run all tests.
- `GET /v1/prompts/{prompt_id}/evaluations`: evaluation history.
- `POST /v1/prompts/{prompt_id}/generate-document`: document generation bridge.
- `GET /v1/audit/events`: audit events.
- `POST /v1/ai/tools` and `POST /v1/ai/generate-sql`: AI utilities.

### PromptBuilder Known Gaps And Limits

- `PromptBuilder/backend/.env` is ignored and must be created locally; no checked-in `.env.example` currently exists in that folder.
- Several TemplateBuilder-style backend files are present but not mounted by active `main.py`.
- Some document/template/datasource helper code references `template_builder` schemas; these may fail if the PromptBuilder database does not contain those optional schemas.
- Prompt execution depends on configured LLM credentials/endpoints such as Cohere or webhook configuration.
- The active UI has visual reskinning only; labels and behavior should remain original PromptBuilder behavior.

## TemplateBuilder Full Runtime Atlas

### TemplateBuilder Purpose

`TemplateBuilder` is a standalone document studio for creating templates, binding placeholders, using prebuilt templates, generating documents, managing render jobs, maintaining a placeholder registry, publishing/importing marketplace items, and auditing template/document operations.

### TemplateBuilder Runtime URLs

- Main UI: TemplateBuilder Vite UI, usually configured against `VITE_API_BASE=http://localhost:10001/v1`.
- Backend API: `http://localhost:10001`, container port 8080.
- Backend health: `http://localhost:10001/healthz`.
- Kasetti demo datasource host port: `localhost:5433`.
- Redis is internal by default.
- Postgres app DB is internal by default.

### TemplateBuilder Folder Details

- `template-builder-engine/docker-compose.yml`: starts API, worker replicas, app Postgres, Kasetti datasource Postgres, and Redis.
- `template-builder-engine/Dockerfile`: builds backend from `backend/src`, installs FreeSans fonts for PDF/Hindi/Indian script support, installs Python requirements.
- `template-builder-engine/requirements.txt`: FastAPI, SQLAlchemy, asyncpg, Redis, document parsing/rendering, AI/LLM, PDF/DOCX/XLSX support.
- `template-builder-engine/backend/src/main.py`: FastAPI app and route mounting.
- `template-builder-engine/backend/src/api`: templates, placeholders, blocks, marketplace, import, documents, tests, AI, audit, datasources, render, health.
- `template-builder-engine/backend/src/core`: models, DB, renderers, resolver, and utility logic.
- `template-builder-engine/db/migrations`: app DB schema.
- `template-builder-engine/sql/kasetti-db`: demo datasource SQL.
- `template-builder-engine/frontend`: older frontend artifact present in engine folder.
- `template-builder-ui`: active reskinned standalone Vite React/TypeScript UI.
- `README.md` and `RUNBOOK.md`: module docs.

### TemplateBuilder UI Routes And Actions

| Route                    | Page                 | User actions                                                                                                                                                                  |
| ------------------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                      | Redirect             | Redirects to `/templates`.                                                                                                                                                    |
| `/templates`             | Templates            | Search/filter templates, create template, import template, open editor, delete/archive where exposed.                                                                         |
| `/templates/prebuilt`    | Prebuilt Templates   | Search/filter/preview prebuilt templates, use template to create editable copy.                                                                                               |
| `/templates/:id`         | Editor               | Edit template name/target, save, publish, revert to draft, refresh preview, insert placeholders, drag/drop blocks, use AI tools, generate document, run tests, view versions. |
| `/registry/placeholders` | Placeholder Registry | Create/edit/delete placeholders, choose generation mode, fetch sample, generate SQL, bind datasource fields.                                                                  |
| `/marketplace`           | Marketplace          | List/search/filter marketplace items, publish item, import item, rate item, inspect blocks/placeholders.                                                                      |
| `/audit`                 | Audit Log            | Refresh and expand audit events.                                                                                                                                              |
| `/documents`             | Documents            | Load jobs, view generated document, download output, clear history, navigate back to templates.                                                                               |

### TemplateBuilder Sidebar

- Brand: `TemplateBuilder`, eyebrow `Document Studio`, logo `TB`, local user `dev_user`.
- Nav section: Document Studio.
- Nav items: Templates, Prebuilt Templates, Placeholder Registry, Documents, Marketplace, Audit Log.
- Sidebar writes `tb_user_id=dev_user` into localStorage for local audit identity.

### TemplateBuilder Editor Action Atlas

- Editor Save updates template metadata and `layout_json`.
- Publish creates a template version/change summary.
- Revert to draft calls backend draft reversion.
- Preview bar switches output format/device and can refresh preview.
- Placeholder palette switches between global/template placeholders and inserts `{{token}}` into focused block/cell/binding.
- Block canvas adds text/table/image/section blocks, drag-sorts blocks, selects blocks, deletes/moves block data, and saves blocks to the library.
- Text block edits rich text/contenteditable text.
- Table block edits headers/bindings, adds/removes columns/rows, accepts placeholder drops.
- Image block supports upload tab, URL tab, drag/drop image file, clear image.
- AI Tools panel supports generate, polish, translate, and SQL assistance through `/v1/ai/tools`; results can be applied to block or copied.
- Generate panel chooses output format, calls document generation, polls/loads job, downloads or views output.
- Tests panel creates/edits/deletes tests, runs one test, runs all tests, previews HTML result.
- Version history panel compares versions, expands details, restores selected version.
- Import modal supports file import, URL import, and raw/manual content flows; URL flow may use public CORS proxy fallback.

### TemplateBuilder Backend Endpoint Atlas

- `GET /_debug/routes`, `GET /healthz`, `GET /v1/healthz`: debug/health.
- `GET /v1/templates`, `POST /v1/templates`, `GET /v1/templates/{template_id}`, `PUT /v1/templates/{template_id}`, `DELETE /v1/templates/{template_id}`: template CRUD.
- `POST /v1/templates/{template_id}/publish`, `POST /v1/templates/{template_id}/revert-to-draft`, `GET /v1/templates/{template_id}/versions`: lifecycle/versioning.
- `POST /v1/templates/{template_id}/placeholders`, `GET /v1/templates/{template_id}/placeholders`, `GET /v1/templates/{template_id}/inputs`: placeholder binding/discovery.
- `GET/POST/GET/PUT/DELETE /v1/registry/placeholders...`: global placeholder registry.
- `GET/POST/GET/DELETE /v1/blocks...`: reusable block library.
- `GET /v1/datasources`, `POST /v1/datasources/test-sql`: datasource metadata/test SQL.
- `POST /v1/ai/tools`, `POST /v1/ai/generate-sql`: AI tools.
- `POST /v1/documents/preview`, `POST /v1/documents/generate`, `GET /v1/documents/jobs`, `GET /v1/documents/jobs/{job_id}`, `GET /v1/documents/jobs/{job_id}/download`, `DELETE /v1/documents/jobs/{job_id}`: document render lifecycle.
- `GET /v1/documents/templates`: document template listing helper.
- `GET /v1/audit/events`: audit events.
- `GET/POST/GET/rate/import/DELETE /v1/marketplace...`: marketplace.
- `POST /v1/templates/import/file`, `POST /v1/templates/import/url`: import endpoints.
- `POST /v1/generate`: legacy render endpoint.
- `GET/POST/PUT/DELETE/Run /v1/templates/{template_id}/tests...`: template tests.

### TemplateBuilder Known Gaps And Limits

- `template-builder-engine/.env` and `template-builder-ui/.env` are ignored local files; no checked-in `.env.example` currently exists for the engine.
- Compose currently hardcodes `LLM_WEBHOOK_URL` to a webhook.site URL for API and worker.
- `frontend/src/api/placeholders.ts` in the active UI has historically hardcoded datasource behavior for placeholder creation.
- Known implementation caveats exist around placeholder get/update and `category` column assumptions in template placeholder listing, as documented in module README.
- The UI was reskinned visually only; backend code was not intended to be changed during the reskin pass.

## DocAI Full Runtime Atlas

### DocAI Purpose

`Docai` is a document AI proof of concept for document type management, schema suggestion, model training, parsing, auto-detection, parse history, human correction, audit trails, RAG query, metrics, and observability. It has its own backend and UI and is not wired into FlowEngine authentication.

### DocAI Runtime URLs

- UI dev server: `http://localhost:3000` when run with React Scripts.
- Backend: often `http://localhost:8000` when run manually from runbook; UI defaults to `REACT_APP_API_URL` or `http://localhost:8001`.
- Backend health: `/health/`.
- Backend metrics: `/metrics` or `/metrics/`.
- Compose infrastructure ports: Postgres `5432`, Weaviate `8080`, Grafana `3000`, Prometheus `9090`.

### DocAI Folder Details

- `.github`: CI/workflow material.
- `.gitignore`: DocAI-specific ignore rules.
- `docai_service/app/main.py`: FastAPI app with auth, upload/schema/train/parse/history/review/metrics routes.
- `docai_service/app`: application package with models/services/utilities referenced by `main.py`.
- `docai_service/scripts`: setup scripts for base packages, Postgres pgvector, Python env, Docker image pulls, migrations, MLflow, and fixtures.
- `docai_service/tests`: pytest suite for e2e, metrics, deployment, model registry, and fixtures.
- `docai_service/k8s` or deployment manifests: Kubernetes/deployment resources where present.
- `docai_service/docker-compose.yml`: infrastructure-only Compose for Postgres, Weaviate, Grafana, Prometheus; it does not start the FastAPI backend or UI.
- `docai_service/Dockerfile`: builds FastAPI service with Python 3.10, Tesseract, Poppler library, and requirements.
- `docai_service/requirements.txt`: OCR, ML, NLP, vector, RAG, auth, metrics, tests, document/PDF dependencies.
- `docai-ui`: React Scripts + Material UI frontend.
- `docai-ui/src/App.js`: protected route shell.
- `docai-ui/src/components/Sidebar.jsx`: Dashboard, Doc Types, Parse Document, Auto Detect, Parse History, Logout.
- `docai-ui/src/api/client.js`: Axios client with Bearer token from `localStorage.docai_token`, 401 redirect to `/login`.

### DocAI UI Routes And Actions

| Route                      | Page           | User actions                                                                                                                                                                                                  |
| -------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`                   | Login          | Enter username/password, submit login, store JWT token, navigate dashboard.                                                                                                                                   |
| `/dashboard`               | Dashboard      | View document type count, parse history, parse stats, dashboard charts/cards.                                                                                                                                 |
| `/doc-types`               | Doc Types      | Train new document type, edit/open modal, delete doc type, create/delete field mappings, create/delete parsing rules, create/activate rule versions, upload sample for schema suggestion, close/submit modal. |
| `/parse-document`          | Parse Document | Upload/select file, enter doc id or auto-detect, parse document, download JSON, toggle raw JSON display.                                                                                                      |
| `/auto-detect`             | Auto Detect    | Upload file, run auto-detection, show detected type/confidence/result.                                                                                                                                        |
| `/parse-history`           | Parse History  | Load history and review queue, click row for details, load audit/corrections, save correction.                                                                                                                |
| `*` inside protected shell | Redirect       | Redirects to `/dashboard`.                                                                                                                                                                                    |

### DocAI Backend Endpoint Atlas

- `POST /auth/register`: create first/admin user through API; UI does not expose registration.
- `POST /auth/jwt/login`: login and issue JWT.
- `GET /auth/me`: current authenticated user.
- `POST /auth/logout`: logout endpoint.
- `POST /upload/`: upload document.
- `POST /schema-suggest/`: suggest schema from sample file/text.
- `POST /train/`: train/register document parser/model for doc type.
- `GET/POST/DELETE /parsing-rules/`, `/parsing-rules/{rule_id}`: parsing rule CRUD.
- `GET/POST/DELETE /field-mappings/`, `/field-mappings/{mapping_id}`: field mapping CRUD.
- `GET/POST /parsing-rules/{rule_id}/versions`: rule version list/create.
- `POST /parsing-rules/{rule_id}/versions/{version_id}/activate`: activate parsing rule version.
- `POST /auto-detect/`: detect document type.
- `POST /parse/`: parse document using doc id and uploaded file.
- `POST /query-rag/`: RAG query endpoint.
- `GET /doc-types/`, `GET /doc-types/{doc_type_id}`, `DELETE /doc-types/{doc_type_id}`: document type listing/detail/delete.
- `GET /parse-history/`: parse history.
- `GET /review-queue/`: review queue.
- `GET /parse-history/{parse_request_id}/corrections`, `POST /parse-history/{parse_request_id}/corrections`: corrections.
- `GET /parse-stats/`: parse statistics.
- `GET /audit-trail/{parse_request_id}`: audit trail.
- `GET /health/`: health.
- `GET /metrics`, `GET /metrics/`: metrics.

### DocAI Known Gaps And Limits

- `docai_service/docker-compose.yml` starts only infrastructure, not backend/UI.
- `docai_service` has no checked-in `.env.example`; runbook instructs exporting required environment variables manually.
- UI defaults to backend `http://localhost:8001` if `REACT_APP_API_URL` is not set, while runbook starts backend on 8000. This must be aligned locally through env or port choice.
- UI registration is not exposed; first user/admin must be created through API.
- Full backend requires OCR/ML/vector dependencies and may need pgvector-aware Postgres setup.
- Compose port 3000 conflicts with FlowEngine tenant UI and DocAI Grafana if run simultaneously without port edits.

## Universal Setup Matrix

### Root Git And Secret Rules

- Root `.gitignore` ignores `.env`, `.env.*`, `**/.env`, `**/.env.*`, dependency folders, build outputs, cache folders, runtime DB files, logs, generated Kill Bill state files, and local tool folders.
- `.env.example` files are allowed by ignore rules.
- Real credentials should never be committed. FlowEngine `.env`, KillBill gateway `.env`, Orchestration `.env`, PromptBuilder backend/frontend `.env`, and TemplateBuilder engine/UI `.env` are currently local ignored files.

### Minimum Local Tooling

- Docker Desktop with Compose.
- Node.js and npm for frontend local dev/builds.
- Python 3.10+ for DocAI and Python 3.11-compatible environments for FlowEngine/PromptBuilder/TemplateBuilder/Orchestration backends where run outside Docker.
- Git.
- Enough disk/RAM for multiple DB/service containers; DocAI explicitly recommends at least 8GB RAM and 20GB disk.

### Run Order By Module

- FlowEngine + KillBill integrated stack: configure `FlowEngine2.0/.env` and `KillBill/gateway/.env`, load the local Kill Bill image first with `docker load -i C:\path\to\your\image.tar` or from repo root with `docker load -i .\killbill-fixed.tar`, then run from `FlowEngine2.0` with `docker compose up --build -d`, initialize/unseal Vault after fresh volume reset, and test tenant/admin URLs.
- KillBill alone: use PowerShell scripts `00` through `08` only for standalone/manual billing checks; active integrated startup is through FlowEngine compose.
- Orchestration: set `GROQ_API_KEY` in `orchestration/.env` when testing AI Copilot with real Groq; run `docker compose up --build -d` from `orchestration`.
- PromptBuilder: create `PromptBuilder/backend/.env` and `PromptBuilder/frontend/.env` with DB/API/LLM values; run Compose from `PromptBuilder/backend`.
- TemplateBuilder: create `TemplateBuilder/template-builder-engine/.env` and `TemplateBuilder/template-builder-ui/.env`; run Compose from `TemplateBuilder/template-builder-engine` and UI as documented.
- DocAI: start infrastructure Compose from `Docai/docai_service`, run migrations/scripts, start FastAPI manually or via Dockerfile as configured, then run UI from `Docai/docai-ui` after `npm install`.
- ServiceNow NLP Explorer: import/recreate the widget and Script Include in a ServiceNow instance, configure REST Message `AgentaryxNlp` with `run_nlp`, `paginate`, and optional `tenant_jwt` methods, then test through the Service Portal widget.
- SAP Salesforce Integration: start `SAP-Salesforce-Integration/sap-middleware` with real SAP HANA/XSUAA `.env` values or deploy it to Cloud Foundry, deploy/configure the Salesforce Apex/LWC side under `salesforce/force-app`, and deploy or run the SAP UI5/Fiori app under `fiori-app` if testing that path.

### Port Conflict Rules

- FlowEngine tenant uses 3000. DocAI UI and Grafana also use 3000 by default, so do not run them together without port changes.
- FlowEngine backend uses 8001 host. DocAI UI defaults to API 8001 unless overridden.
- FlowEngine Postgres host is 5433. TemplateBuilder Kasetti datasource uses 5433 by default.
- Orchestration Postgres host is 5434. PromptBuilder Kasetti datasource also uses 5434 by default.
- Orchestration backend uses 8060 and frontend uses 3100.
- PromptBuilder backend uses 10002 and frontend uses 5174.
- TemplateBuilder backend uses 10001.
- Kill Bill uses 8080 and MariaDB uses 3306.
- Vault uses 8201 host.
- Keycloak uses 7000.
- SAP middleware defaults to 8080, which conflicts with Kill Bill if both are run locally on the same host port.
- SAP Fiori local dev port depends on the `fiori run` tooling configuration.
- ServiceNow NLP Explorer runs inside a ServiceNow instance; this folder does not start a local server.

## Universal Functional Smoke Checklist

### FlowEngine Smoke Test

- Load the custom Kill Bill image first with `docker load -i C:\path\to\your\image.tar` or, from repo root, `docker load -i .\killbill-fixed.tar`, then start `FlowEngine2.0` compose.
- Confirm Keycloak at `http://localhost:7000`.
- Confirm backend health at `http://localhost:8001/health`.
- Confirm tenant landing at `http://localhost:3000`.
- Confirm admin UI at `http://localhost:5000`.
- Login as platform superadmin using `.env` seeded credentials.
- Register a tenant from admin, selecting at least one module with a free plan.
- Verify tenant receives Keycloak action email if SMTP is configured.
- Login as tenant.
- Confirm module tabs and left nav match active module subscription and sidebar item assignments.
- Cancel a module subscription and confirm that module disappears from tenant navigation after refresh.
- Create datasource, datasource config, credentials, metadata confirmation, intent, intent policy, validation rule, sub-user, API key, inbox, and billing checkout flow.
- Verify Playground only after `/demo/execute` backend gap is resolved.

### KillBill Smoke Test

- Confirm Kill Bill server responds through gateway.
- Confirm catalog bootstrap completed.
- `GET /api/plans/modules` returns modules/plans.
- Create or inspect free/basic module plan.
- Create account/subscription through FlowEngine and confirm in Kill Bill bundles.
- Cancel subscription and confirm FlowEngine no longer grants module navigation.

### Orchestration Smoke Test

- Run `docker compose up --build -d` from `orchestration`.
- Confirm backend logs show DB pool initialized, schema executed, and Uvicorn on 8060.
- Confirm frontend loads at 3100.
- Open Plans, create plan, execute it, monitor run, inspect history and evidence.
- Configure `GROQ_API_KEY` and run AI Copilot design flow; logs should show Groq 200 for real AI flow.
- Test datasource CRUD/test, domain pack install/uninstall, ITSM resolve, approvals approve/reject, and knowledge fetch.

### PromptBuilder Smoke Test

- Create required backend/frontend `.env` files.
- Run Compose from `PromptBuilder/backend`.
- Open UI at 5174.
- Create prompt, open Prompt Studio, add blocks/inputs/context/schema/guardrails, save each tab, publish, run prompt, copy output, create test cases, run all tests, inspect run history and audit.
- If document-generation integration is tested, confirm TemplateBuilder URL/schema dependencies exist.

### TemplateBuilder Smoke Test

- Create required engine/UI `.env` files.
- Run TemplateBuilder engine stack.
- Open TemplateBuilder UI.
- Create template, add blocks, insert placeholders, save, publish, preview, generate document, download output, create placeholder, fetch sample/generate SQL, use marketplace import/rate, view audit, run template tests.
- Watch known placeholder/table caveats if placeholder endpoints fail.

### DocAI Smoke Test

- Start DocAI infra containers.
- Run migrations.
- Start backend with `JWT_SECRET_KEY`, Postgres connection vars, and `MOCK_TRAINING=true` for local tests if desired.
- Create first admin via `POST /auth/register`.
- Run UI after `npm install`.
- Login, open Dashboard, create/train doc type, use schema suggestion, parse document, auto-detect file, view parse history, save correction, check metrics.

### ServiceNow NLP Explorer Smoke Test

- Create/import the Service Portal widget pieces from `ServiceNow_NLP_Explorer_Reconstructed_Source/widget`.
- Create/import Script Include `NlpExplorerService` from `ServiceNow_NLP_Explorer_Reconstructed_Source/script-include/NlpExplorerService.js`.
- Configure ServiceNow REST Message `AgentaryxNlp` with methods `run_nlp`, `paginate`, and optional `tenant_jwt`.
- Point those REST Message methods to live middleware endpoints such as `/v1/analyze`, `/v1/paginate`, and `/v1/tenant/jwt`.
- Open the Service Portal widget, enter a prompt, run query, confirm generated query/results render, and test previous/next pagination.

### SAP Salesforce Integration Smoke Test

- Create `SAP-Salesforce-Integration/sap-middleware/.env` locally with HANA connection values and any XSUAA/service values needed for the target environment.
- Start the Node middleware and confirm `GET /` returns running status.
- Confirm middleware creates/seeds `EMPLOYEES` when HANA is reachable.
- Deploy Salesforce Apex/LWC from `SAP-Salesforce-Integration/salesforce/force-app` and configure `SAP_BTP_Config__mdt` plus Named Credential `SAP_BTP_NC`.
- Open the SAP LWC, choose SAP, test login, ask a question, confirm role-aware employee rows, and test Fiori launch URL behavior.
- If testing Fiori directly, run/deploy `SAP-Salesforce-Integration/fiori-app`, pass role/user/query URL parameters as needed, and confirm it posts to the configured middleware `/ask` endpoint.

## Universal Known Gaps And Verification Notes

- This repository is a monorepo-style collection of independent modules, not one fully unified runtime.
- UI design has been aligned visually across the updated UIs, but each project owns its own CSS/tokens; there is no shared design-system package.
- FlowEngine backend is the only module with Keycloak/Vault/Kill Bill tenant identity enforcement.
- FlowEngine Setup Credentials still needs production middleware-backed Test Connection and Save/Fetch Metadata behavior. The current metadata-confirmed/proxy yes-no path is a testing shortcut.
- FlowEngine Playground needs middleware/API wiring for the Run button. The intended behavior is prompt-to-query/query execution against live datasources; `/demo/execute` is currently unverified in the active backend route list.
- FlowEngine datasource sub-tab actions such as Full Refresh, Lite Refresh, Check Drift, Profile, and Principal Context Preview must be aligned with actual middleware capability and should not be treated as complete mandatory features until that middleware exists.
- DocAI requires manual backend/UI startup beyond its infra Compose.
- PromptBuilder and TemplateBuilder require local `.env` files that are ignored and not represented by checked-in examples in their backend roots.
- ServiceNow NLP Explorer is reconstructed source, not a direct instance export; widget registration, REST Message records, credentials, and ServiceNow instance setup must be recreated manually.
- SAP Salesforce Integration depends on real SAP HANA/XSUAA/custom metadata/Named Credential setup; its checked-in login behavior is demo-oriented and not full production authentication.
- Optional paid/external integrations cannot be fully verified from code alone without real provider credentials.
- If another AI receives only this README, it should understand architecture, setup, routes, flows, buttons, integrations, and known gaps. It should still inspect source before changing code because this document intentionally does not reproduce every line of implementation syntax.
