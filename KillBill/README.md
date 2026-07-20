# AgentryX KillBill Integration

This folder contains the Kill Bill billing catalog, the Node.js KillBill gateway used by the AgentryX FlowEngine stack, and older local POC scripts/utilities.

The active integration path today is:

```text
FlowEngine tenant/admin UI -> FlowEngine FastAPI -> KillBill gateway -> Kill Bill server
```

The unified Docker Compose file lives in the sibling `FlowEngine2.0` folder. This folder no longer has its own active Docker Compose file.

## What This Module Does

The KillBill folder provides:

- A Kill Bill XML catalog for the AgentryX modules `email_validate`, `data`, and `sql_query`.
- A Node/Express gateway that exposes friendly billing APIs to the React UIs and FlowEngine backend.
- A proxy from `/api/v1/...` to Kill Bill `/1.0/kb/...`.
- Plan storage and catalog sync helpers.
- FlowEngine module/product synchronization endpoints.
- Payment recording and payment provider integration points for Razorpay and Stripe.
- Billing configuration storage.
- Usage event recording and usage summary/series APIs.
- Billing reminder emails and Kill Bill webhook handling.
- A dedicated raw webhook listener on port `3005`.
- Legacy PowerShell POC scripts and old standalone demo utilities.

## System Overview

### Modules/Features

The KillBill folder is the billing support module for AgentryX. It does not own the tenant UI or the main backend. Instead, it supplies the Kill Bill catalog and the gateway layer that FlowEngine uses to create accounts, expose plans, manage subscriptions, receive billing events, and integrate payment/email functionality.

Core features:

- Kill Bill catalog: `catalog.xml` defines AgentryX billable products, plans, trial phases, evergreen phases, price lists, billing rules, cancellation policy, and product units.
- Catalog bootstrap support: the FlowEngine Compose stack mounts `catalog.xml` and uses `infra/killbill/bootstrap-catalog.sh` from FlowEngine to create the Kill Bill tenant and upload this catalog.
- Gateway API: `gateway/index.js` exposes a local Express API on port `3002` so FlowEngine and React UIs do not need to call raw Kill Bill endpoints directly.
- Raw webhook listener: the gateway starts a dedicated raw HTTP listener on port `3005` for Kill Bill webhooks to avoid Java/Kill Bill keep-alive response parsing issues.
- Kill Bill proxy: the gateway forwards `/api/v1/...` requests to Kill Bill `/1.0/kb/...`, adds Kill Bill auth headers, tenant headers, and created-by headers, and normalizes some response shapes.
- Module/plan listing: the gateway combines local plan state with FlowEngine module metadata so tenant/admin UIs can show active plans grouped by AgentryX module.
- Product/module sync: FlowEngine calls gateway product endpoints when modules are created, updated, renamed, deactivated, or deleted.
- Additive catalog sync: gateway catalog helpers merge new module plans into the existing Kill Bill catalog XML.
- Subscription creation guard: gateway tracks free-trial usage in local SQLite so an account cannot repeatedly claim the same free plan for the same module.
- Billing configuration: gateway stores editable local billing settings such as currency, grace period, retry days, invoice prefix, tax rate, dunning, trial reminder days, timezone, and invoice footer.
- Payment integrations: gateway supports Razorpay order creation and Stripe PaymentIntent creation/lookup when real keys are configured.
- Payment event storage: gateway records local payment events in `payments.json`, broadcasts Socket.IO events, and sends receipt emails for successful payments when customer email is known.
- Usage metering helper: gateway stores local usage events in `usage-data.json` and exposes usage summary and time-series APIs.
- Reminder emails: gateway can send test reminders, manual reminders, and scheduled daily payment/trial reminder checks.
- Kill Bill event emails: gateway handles subscription creation, trial ending, subscription phase transitions, payment failure, and cancellation webhooks with email templates.
- Realtime billing notifications: Socket.IO broadcasts plan/config/payment events to connected clients.
- Legacy POC automation: numbered PowerShell scripts demonstrate older manual Kill Bill tenant/catalog/account/subscription/usage flows.
- Legacy standalone demos: `server.js` and `webhook-listener.js` remain for historical/manual experimentation but are not the active FlowEngine integration path.

Active integration flow:

- Tenant/admin UI calls FlowEngine.
- FlowEngine calls KillBill gateway for billing-oriented operations.
- KillBill gateway calls Kill Bill server with tenant/admin headers.
- Kill Bill stores billing state in its MariaDB database.
- Kill Bill webhooks call the gateway webhook listener.
- Gateway may call FlowEngine for module metadata and tenant information.

### Folder Structure Details

Top-level folder:

- `.gitignore`: excludes gateway runtime files, generated JSON/SQLite data, local env files, dependency folders, and scratch artifacts.
- `README.md`: this documentation file.
- `catalog.xml`: active Kill Bill XML catalog used by the unified FlowEngine Compose stack.
- `00-setup-tenant.ps1`: legacy script that creates the Kill Bill tenant and shared headers.
- `01-upload-catalog.ps1`: legacy script that uploads `catalog.xml` and verifies plan availability.
- `02-create-account.ps1`: legacy script that creates or fetches a demo account and writes an account id file.
- `03-create-subscriptions.ps1`: legacy script for old ModuleA/ModuleB/ModuleC subscription creation.
- `04-record-usage.ps1`: legacy script for old usage recording flows.
- `05-upgrade-to-paid.ps1`: legacy script that advances the Kill Bill test clock.
- `06-fetch-invoices.ps1`: legacy script for invoice fetching and preview.
- `07-webhook-test.ps1`: legacy script for registering a webhook.site callback.
- `08-run-all.ps1`: legacy wrapper that runs the old POC script sequence.
- `server.js`: standalone BillFlow demo server, separate from the active gateway/FlowEngine stack.
- `webhook-listener.js`: standalone webhook listener on port `4000`, separate from the active gateway raw listener.
- `gateway/`: active AgentryX gateway source.

Gateway folder:

- `gateway/index.js`: main Express server, Socket.IO server, Kill Bill proxy, billing config API, plan API, usage API, payment API, webhook handlers, reminder logic, product sync endpoints, local persistence helpers, and raw webhook listener.
- `gateway/catalog-sync.js`: additive catalog merge helper that fetches current Kill Bill XML, appends missing products/plans/default-price-list entries, writes debug XML best-effort, and uploads merged XML.
- `gateway/package.json`: Node package metadata and gateway runtime dependencies.
- `gateway/package-lock.json`: locked Node dependency tree.
- `gateway/Dockerfile`: Node 20 Alpine image for the gateway service.
- `gateway/.env.example`: sanitized template for Kill Bill, FlowEngine, webhook, payment, email, and optional Mautic settings.

Runtime/generated gateway files:

- `gateway/plans.json`: local plan state initialized from built-in defaults when absent.
- `gateway/billing-config.json`: local billing configuration initialized from defaults when absent.
- `gateway/usage-data.json`: local usage event log.
- `gateway/payments.json`: local payment event log.
- `gateway/trial-usage.db`: SQLite database used for one-free-trial-per-account/module enforcement.
- `gateway/debug-merged-catalog.xml`: best-effort catalog sync debug output.

These runtime files are ignored by Git and may be reset when containers/filesystems are recreated unless mounted or persisted.

Legacy/demo structure:

- The numbered PowerShell scripts are useful references for manual Kill Bill API experiments, but several reference old plan names that are no longer in the active catalog.
- `server.js` stores its own demo state in `app-db.json` and is not part of the AgentryX local Compose stack.
- `webhook-listener.js` logs webhook payloads and has TODO comments for real notification behavior. It is not the active gateway webhook receiver.

### Tech Stack

Gateway/runtime:

- Node.js 20 Alpine in Docker.
- Express 5 for HTTP APIs.
- Socket.IO 4 for realtime billing event broadcasts.
- Native Node `http`/`https` modules for selected Kill Bill/Razorpay/proxy flows.
- `http-proxy-middleware` for Kill Bill proxy support.
- `cors` for local CORS handling.
- `dotenv` for local environment loading.
- `node-cron` for scheduled reminder checks.
- `nodemailer` for Gmail/SMTP email notifications.
- `better-sqlite3` for local trial-usage enforcement.
- `stripe` SDK for Stripe PaymentIntent creation/lookup.
- `ws` dependency is present for websocket support.

Billing platform:

- Kill Bill server, started by the sibling FlowEngine Compose file through image `killbill-fixed`.
- MariaDB through `killbill/mariadb:0.24` for Kill Bill persistence.
- Kill Bill XML catalog format for product, plan, trial, evergreen, and price-list definitions.

Data and local persistence:

- JSON file storage for gateway plans, billing config, usage events, and payment logs.
- SQLite file storage for one-free-trial-per-module tracking.
- Kill Bill/MariaDB for actual billing accounts, subscriptions, invoices, bundles, and catalog state.

External integrations:

- FlowEngine backend for active module metadata and product/module synchronization.
- Razorpay Orders API when `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are configured.
- Stripe API when `STRIPE_SECRET_KEY` is configured.
- Gmail/SMTP through Nodemailer when Gmail app-password settings are configured.
- Mautic optional/best-effort sync when Mautic settings are configured.
- Webhook callback URLs for Kill Bill event delivery.

Build and operations:

- Dockerfile for the gateway image.
- Docker Compose in the sibling `FlowEngine2.0` folder for the active unified stack.
- npm and package-lock for dependency management.
- PowerShell scripts for legacy/manual local POC flows.

## Source Inventory

Project-owned source/config reviewed in this folder:

- `catalog.xml`: active XML catalog consumed by FlowEngine Compose bootstrap.
- `gateway/index.js`: active Express/Socket.IO gateway.
- `gateway/catalog-sync.js`: additive catalog merge/sync helper used by gateway plan/product endpoints.
- `gateway/package.json` and `gateway/package-lock.json`: Node dependencies.
- `gateway/Dockerfile`: gateway container image.
- `gateway/.env.example`: sanitized gateway environment template.
- `00-setup-tenant.ps1` through `08-run-all.ps1`: legacy/local POC automation scripts.
- `server.js`: standalone BillFlow demo server, not part of the active AgentryX Compose stack.
- `webhook-listener.js`: standalone test webhook listener on port `4000`, not the active gateway webhook listener.
- `.gitignore`.
- `README.md`.

Generated/vendor/local files intentionally excluded from documentation detail:

- `node_modules`.
- `gateway/node_modules`.
- Local `.env`.
- Runtime JSON files such as `plans.json`, `billing-config.json`, `usage-data.json`, `payments.json`.
- Runtime SQLite file `trial-usage.db`.
- Old generated account/subscription scratch files.

## Active Docker Usage

The active local stack is started from:

```text
../FlowEngine2.0/docker-compose.yml
```

That Compose file:

- Starts Kill Bill using image `killbill-fixed`.
- Starts MariaDB for Kill Bill.
- Runs `killbill-catalog-bootstrap` to create tenant `company_a/company_a_secret` and upload `KillBill/catalog.xml`.
- Builds and starts `gateway/Dockerfile`.
- Exposes the gateway on `http://localhost:3002`.
- Exposes the dedicated raw webhook listener on `http://localhost:3005`.
- Wires FlowEngine to the gateway through `KILLBILL_GATEWAY_URL=http://killbill-gateway:3002`.

Important setup note:

- This folder does not build the `killbill-fixed` image. A fresh machine must have that image available locally, or the Compose file in `FlowEngine2.0` must be changed to use/build an available Kill Bill image.

## Catalog

`catalog.xml` is the bootstrap catalog currently uploaded to Kill Bill.

Catalog details:

- Catalog name: `MyPOCCatalog`.
- Effective date: `2026-06-24T00:00:00+00:00`.
- Billing mode: `IN_ADVANCE`.
- Currency: `INR`.
- Units: `calls`, `emails`.
- Products: `email_validate`, `data`, `sql_query`.
- Change policy: `IMMEDIATE`.
- Cancel policy: `IMMEDIATE`.

Plans:

- `email-validate-basic`: product `email_validate`, 14-day trial, INR 0 monthly evergreen.
- `email-validate-standard`: product `email_validate`, 10-day trial, INR 300 monthly evergreen.
- `email-validate-pro`: product `email_validate`, 7-day trial, INR 500 monthly evergreen.
- `data-basic`: product `data`, 14-day trial, INR 0 monthly evergreen.
- `data-standard`: product `data`, 10-day trial, INR 300 monthly evergreen.
- `data-pro`: product `data`, 7-day trial, INR 500 monthly evergreen.
- `sql-query-basic`: product `sql_query`, 14-day trial, INR 0 monthly evergreen.
- `sql-query-standard`: product `sql_query`, 10-day trial, INR 300 monthly evergreen.
- `sql-query-pro`: product `sql_query`, 7-day trial, INR 500 monthly evergreen.

All plans are listed in the default price list.

## Gateway Runtime

Location: `gateway/index.js`.

Runtime:

- Node.js 20 Alpine in Docker.
- Express 5.
- Socket.IO for realtime billing events.
- Local JSON file persistence for plans, config, usage, and payment logs.
- Better SQLite for one-free-trial-per-module tracking.
- Nodemailer for Gmail SMTP.
- Stripe SDK.
- Native HTTPS call to Razorpay orders API.
- Native HTTP proxy calls to Kill Bill.
- Node-cron daily reminder check.

Ports:

- `3002`: main gateway API and Socket.IO server.
- `3005`: dedicated raw Kill Bill webhook receiver.

CORS origins:

- `http://localhost:3000`.
- `http://localhost:3001`.
- `http://localhost:3002`.
- `http://localhost:3003`.
- `http://localhost:4000`.

Runtime files created by gateway:

- `gateway/plans.json`: plan list initialized from `DEFAULT_PLANS` when missing.
- `gateway/billing-config.json`: billing settings initialized from defaults when missing.
- `gateway/usage-data.json`: usage events.
- `gateway/payments.json`: gateway-recorded payment events.
- `gateway/trial-usage.db`: SQLite table that blocks repeated free-trial subscription for the same account/module.
- `gateway/debug-merged-catalog.xml`: best-effort debug output from additive catalog sync.

These runtime files are ignored by Git.

## Gateway API Surface

### Plans

- `GET /api/plans`: list gateway plans. Supports `module` and `active=true` query filters.
- `GET /api/modules/active`: calls FlowEngine `/admin/modules/public/list-all` and returns module rows.
- `GET /api/plans/modules`: calls FlowEngine `/admin/modules/public/list`, filters active gateway plans to active FlowEngine modules, and returns plans grouped by module name.
- `POST /api/plans`: creates a local plan, broadcasts `plan.created`, and uses additive catalog sync.
- `PUT /api/plans/:id`: updates a local plan, broadcasts `plan.updated`, and regenerates/syncs catalog XML.
- `DELETE /api/plans/:id`: removes a local plan, broadcasts `plan.deleted`, and regenerates/syncs catalog XML.

### Billing Config

- `GET /api/config`: returns persisted billing config merged with defaults.
- `PUT /api/config`: updates persisted billing config and broadcasts `config.updated`.

Default config fields:

- `currency`.
- `gracePeriodDays`.
- `paymentRetryDays`.
- `invoicePrefix`.
- `taxRate`.
- `autoPayEnabled`.
- `trialReminderDays`.
- `dunningEnabled`.
- `dunningMaxRetries`.
- `timezone`.
- `invoiceFooter`.

### Webhooks And Emails

- `POST /api/webhooks/killbill`: Express webhook receiver for Kill Bill events.
- `POST /api/webhooks/register`: registers the configured callback URL with Kill Bill.
- `POST /api/webhooks/test`: sends one of the billing email templates to a supplied email.
- Dedicated raw listener: `http://localhost:3005/api/webhooks/killbill`.

Handled event cases include:

- `SUBSCRIPTION_CREATION`: trial welcome email.
- `SUBSCRIPTION_PHASE_TRIAL_ENDING` or `TRIAL_ENDING`: trial-ending email.
- `SUBSCRIPTION_PHASE`: logs trial-to-evergreen transition.
- `PAYMENT_FAILED` or `INVOICE_PAYMENT_FAILED`: payment overdue email when the invoice amount/balance indicates a real owed amount.
- `SUBSCRIPTION_CANCEL` or `SUBSCRIPTION_CANCELLATION`: cancellation email.

The raw webhook listener intentionally bypasses Express response handling to avoid Java/Kill Bill keep-alive response parsing issues.

### Reminders

- `POST /api/reminders/send`: sends a reminder email for overdue, due-soon, or generated invoice messages.
- `POST /api/reminders/test`: sends a simple test email to request `to` or `TEST_EMAIL_TO`.
- `POST /api/cron/run-reminder-check`: manually triggers the daily reminder scan.

Scheduled job:

- `cron.schedule("30 3 * * *", runPaymentReminderCheck)`.
- Console text says it runs daily at 9am IST.
- The job scans Kill Bill accounts, active subscriptions, trial charged-through dates, and overdue charged-through dates.
- Free plans are skipped for overdue reminders.

### Usage

- `POST /api/usage`: appends a usage event with `accountId`, `metricName`, `value`, and optional `eventDate`.
- `GET /api/usage/summary?accountId=...&days=...`: returns metric totals and event count.
- `GET /api/usage/series?accountId=...&metric=...&days=...`: returns per-day series for a metric.

Usage is stored in `gateway/usage-data.json`, not in Kill Bill usage APIs.

### Payments

- `POST /api/payments/record`: records a payment in `payments.json`, broadcasts `payment.recorded`, and sends a receipt email on successful status when customer email exists.
- `GET /api/payments`: lists recorded payments. Supports `provider`, `status`, and `limit`.
- `GET /api/payments/summary`: returns total payments, total succeeded amount, succeeded/failed counts, and provider breakdown.
- `POST /api/razorpay/order`: creates a Razorpay order through `api.razorpay.com`; returns 503 when Razorpay keys are missing.
- `POST /api/stripe/create-payment-intent`: creates Stripe PaymentIntent; returns 503 when `STRIPE_SECRET_KEY` is missing.
- `POST /api/stripe/confirm-payment`: retrieves a Stripe PaymentIntent status; returns 503 when Stripe is not configured.

Payment records in the gateway are local operational logs. They are not the same as Kill Bill payment records unless an upstream flow also records them in Kill Bill.

### Kill Bill Proxy

- `app.use("/api/v1", ...)` proxies requests to Kill Bill `/1.0/kb`.

Proxy behavior:

- Adds Basic auth from `KB_USERNAME/KB_PASSWORD`.
- Adds tenant headers `X-Killbill-ApiKey` and `X-Killbill-ApiSecret`.
- Adds `X-Killbill-CreatedBy: portal`.
- Maps `POST /api/v1/paymentMethods` style token bodies into a Kill Bill payment plugin payload.
- On Kill Bill `201`, returns status `200` with `{ "id": "<uuid-from-location-header>" }`.
- On `204`, returns empty response.
- Otherwise returns Kill Bill response body/status.

Free trial guard:

- For `POST /api/v1/subscriptions`, if the selected local plan has `price === 0`, the gateway inserts `(accountId, module)` into `trial_usage`.
- If the same account has already used the free plan for that module, the gateway returns `409` with `trial_already_used`.
- If Kill Bill subscription creation fails, the trial claim is released.

### FlowEngine Product/Module Sync

- `POST /api/products/sync`: called by FlowEngine when a module is created. If `free_plan === true`, it creates a basic free plan and syncs the catalog. If no free plan is needed, it saves local state only.
- `POST /api/products/update`: called by FlowEngine when module billing-relevant fields change. It renames modules/plans, creates or reactivates free plans, or marks module plans inactive.
- `PUT /api/products/:name`: renames a product/module in local plans and syncs catalog.
- `DELETE /api/products/:name`: scans Kill Bill accounts/bundles for active subscribers. If subscribers exist, returns `409`; otherwise marks local plans inactive.

## Catalog Sync Implementation

There are two catalog sync strategies:

- `generateCatalogXML()` in `gateway/index.js`: regenerates a full catalog XML from all active local plans.
- `syncPlanToCatalog()` in `gateway/catalog-sync.js`: fetches current Kill Bill catalog XML and additively appends missing active plans/products.

`catalog-sync.js` behavior:

- Fetches current catalog from `/1.0/kb/catalog/xml`.
- Parses existing product and plan names using string/regex operations.
- Appends missing products before `</products>`.
- Appends missing plans before the top-level `</plans>` before `<priceLists>`.
- Appends missing plan ids into the default price list.
- Updates the effective date to current timestamp.
- Writes `debug-merged-catalog.xml` best-effort.
- POSTs merged XML back to `/1.0/kb/catalog/xml`.

Known limitation:

- Catalog merging is string/regex based, not XML-DOM based. It expects the current catalog to keep a compatible structure.

## Environment Variables

Gateway `.env.example` documents:

- `KB_HOST`.
- `KB_BASE`.
- `KB_API_KEY`.
- `KB_API_SECRET`.
- `KB_USERNAME`.
- `KB_PASSWORD`.
- `KB_WEBHOOK_CALLBACK_URL`.
- `FLOWENGINE_URL`.
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

Additional defaults used in code:

- If `KB_HOST` is missing, some calls fall back to `127.0.0.1`.
- If `KB_API_KEY/KB_API_SECRET` are missing, some paths fall back to `admin/password` and other proxy paths fall back to `company_a/company_a_secret`.
- If `MAIL_FROM_EMAIL` is missing, it falls back to `GMAIL_USER` or `no-reply@example.com`.
- If `MAUTIC_PASS` is missing, Mautic sync still attempts auth with an empty password.

For production, set all gateway values explicitly and avoid relying on local fallbacks.

## Legacy POC Scripts

PowerShell scripts:

- `00-setup-tenant.ps1`: creates Kill Bill tenant `company_a/company_a_secret` and defines shared `KbHeaders`.
- `01-upload-catalog.ps1`: uploads `catalog.xml` and verifies available base plans.
- `02-create-account.ps1`: creates/fetches a demo customer account and writes `account-id.txt`.
- `03-create-subscriptions.ps1`: attempts to create subscriptions for old `ModuleA`, `ModuleB`, `ModuleC` trial plans and writes `subscription-ids.json`.
- `04-record-usage.ps1`: records old ModuleA/ModuleC usage against subscription ids.
- `05-upgrade-to-paid.ps1`: advances Kill Bill test clock by 15 days.
- `06-fetch-invoices.ps1`: fetches invoices and previews invoice generation.
- `07-webhook-test.ps1`: registers a webhook.site callback URL.
- `08-run-all.ps1`: runs the POC sequence.

Important limitation:

- The current `catalog.xml` contains `email_validate`, `data`, and `sql_query` plans. Several POC scripts still reference old `ModuleA`, `ModuleB`, `ModuleC` plan names such as `module-a-trial`, which are not present in the current catalog. Those scripts are historical helpers and are not reliable for the current AgentryX catalog without updates.

Other legacy utilities:

- `server.js`: standalone BillFlow demo. It serves its own HTML page, stores users in `app-db.json`, creates Kill Bill tenants directly, and optionally registers in KAUI. It is not used by the unified FlowEngine Compose stack.
- `webhook-listener.js`: standalone webhook listener on port `4000` that logs events and contains TODO comments for email/notification handling. The active gateway webhook listener is in `gateway/index.js`.

## Known Incomplete, Mocked, Or Risky Behavior

- `gateway/usage-data.json` usage APIs are local gateway storage, not Kill Bill native usage records.
- `gateway/payments.json` is a local payment log, not a guaranteed Kill Bill payment ledger.
- Razorpay order creation and Stripe intent creation are real external calls only when real keys are configured.
- Gateway email sending is skipped when Gmail credentials or recipient are missing.
- Some email templates still use names like `Kill Bill Portal` or `BillingPortal`.
- Mautic sync is optional and best-effort. It logs errors but does not fail webhook processing.
- Catalog sync can fail if Kill Bill catalog XML structure differs from what the string-based merger expects.
- Free-trial usage tracking is stored in local SQLite. If `trial-usage.db` is deleted, the one-free-trial-per-module guard resets.
- Runtime JSON and SQLite files are inside the gateway container filesystem unless mounted externally. Rebuilding/removing containers can reset this local gateway state.
- The gateway has no explicit auth layer on its own APIs. It is currently intended for trusted local/internal use behind the FlowEngine stack.
- The old PowerShell POC scripts mention KAUI, but KAUI is commented out in the current unified Compose file.
- The gateway code uses several local fallbacks (`localhost`, `127.0.0.1`, `company_a`, `admin/password`) for development. Set explicit environment variables for reliable deployment.

## Local Setup

### Recommended: Run Through FlowEngine Compose

From the sibling `FlowEngine2.0` folder:

```powershell
Copy-Item .env.example .env
Copy-Item ..\KillBill\gateway\.env.example ..\KillBill\gateway\.env
docker compose up --build -d
```

Then check:

```powershell
docker ps
docker logs killbill-catalog-bootstrap
docker logs killbill-gateway
```

Useful URLs:

- Kill Bill: `http://localhost:8080`.
- KillBill gateway plans: `http://localhost:3002/api/plans`.
- KillBill gateway grouped plans: `http://localhost:3002/api/plans/modules`.
- Raw webhook listener: `http://localhost:3005/api/webhooks/killbill`.
- Tenant UI: `http://localhost:3000`.
- Admin UI: `http://localhost:5000`.

### Full Reset

From `FlowEngine2.0`:

```powershell
docker compose down -v
docker compose up --build -d
```

Expected behavior after reset:

- MariaDB and Kill Bill volumes are recreated.
- `killbill-catalog-bootstrap` waits for Kill Bill readiness.
- Tenant `company_a/company_a_secret` is created or treated as already existing.
- `catalog.xml` is uploaded.
- Required plans are verified.
- Gateway starts only after catalog bootstrap succeeds.

### Standalone Gateway Development

Use this only when Kill Bill and FlowEngine are already running:

```powershell
cd KillBill\gateway
Copy-Item .env.example .env
npm install
node index.js
```

Required services for standalone gateway:

- Kill Bill reachable through `KB_HOST`/`KB_BASE`.
- FlowEngine reachable through `FLOWENGINE_URL` for active-module filtering.
- Optional Gmail, Razorpay, Stripe, and Mautic credentials for their respective features.

### Troubleshooting

- If `/api/plans/modules` returns a FlowEngine error, verify `FLOWENGINE_URL` and that FlowEngine backend is healthy.
- If subscriptions fail with unknown plan names, verify `catalog.xml` was uploaded and `availableBasePlans` includes the selected `*-basic`, `*-standard`, or `*-pro` plan.
- If `killbill-catalog-bootstrap` exits with error, inspect Kill Bill logs and confirm the `killbill-fixed` image is available.
- If payment endpoints return 503, configure Razorpay or Stripe keys.
- If emails do not send, configure Gmail app password variables.
- If old POC scripts fail on plan names, update them to current catalog plan ids or use the React UI/gateway APIs instead.
