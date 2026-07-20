# AgentryX FlowEngine Docker Runbook

This runbook explains how to start the current AgentryX FlowEngine stack with Docker on another machine.

Use this file when the goal is to run the full local product: tenant UI, admin UI, FastAPI backend, Postgres, Keycloak, Vault, Kill Bill, and the Kill Bill gateway.

## 1. What This Starts

The active Docker entrypoint is this file:

```text
FlowEngine2.0/docker-compose.yml
```

It starts these services:

| Service | Container | Local URL or Port | Purpose |
| --- | --- | --- | --- |
| `tenant-ui` | `tenant-ui` | `http://localhost:3000` | Tenant-facing React UI |
| `admin-ui` | `admin-ui` | `http://localhost:5000` | Platform/admin React UI |
| `app` | `flowengine-app-2` | `http://localhost:8001` | FastAPI backend |
| `db` | `flowengine-postgres-2` | `localhost:5433` | Postgres database for FlowEngine and Keycloak schema |
| `keycloak` | `flowengine-keycloak` | `http://localhost:7000` | Authentication and login/logout theme |
| `keycloak-google-bootstrap` | `keycloak-google-bootstrap` | one-shot job | Waits for healthy Keycloak and applies local SMTP plus Google OAuth credentials from `.env` |
| `vault` | `flowengine-vault-2` | `http://localhost:8201` | Credential secret storage |
| `killbill-db` | `killbill-mariadb` | `localhost:3306` | MariaDB for Kill Bill |
| `killbill` | `killbill-server` | `http://localhost:8080` | Kill Bill billing server |
| `killbill-catalog-bootstrap` | `killbill-catalog-bootstrap` | one-shot job | Creates Kill Bill tenant and uploads `KillBill/catalog.xml` |
| `killbill-gateway` | `killbill-gateway` | `http://localhost:3002`, `http://localhost:3005` | Billing gateway, webhook listener, plan/payment helpers |

The Compose file also contains commented optional services for KAUI, Metabase, Mautic DB, and Mautic. They do not start unless uncommented. The admin UI still shows a `Tools` sidebar group with shortcuts to Metabase at `http://localhost:3003` and Mautic at `http://localhost:3004`; those shortcuts are expected to fail until the optional services are enabled.

## 2. Required Folder Layout

Keep `FlowEngine2.0` and `KillBill` as sibling folders. The Compose file in `FlowEngine2.0` builds and mounts files from `../KillBill`.

Expected layout:

```text
AgentryX/
  FlowEngine2.0/
    docker-compose.yml
    .env
  KillBill/
    catalog.xml
    gateway/
      .env
```

Run the full stack from `FlowEngine2.0`, not from `KillBill`.

## 3. Prerequisites

Install these before starting:

| Tool | Required For |
| --- | --- |
| Docker Desktop | Running containers |
| Docker Compose V2 | `docker compose ...` commands |
| Git | Cloning/pulling the repository |
| PowerShell | Windows commands in this runbook |

Recommended local resources:

| Resource | Recommendation |
| --- | --- |
| RAM | 8 GB minimum, 12 GB or more preferred |
| Disk | At least 10 GB free for images, volumes, and builds |
| Network | Needed for first build because Docker downloads base images, apt packages, pip packages, and npm packages |

Check Docker:

```powershell
docker --version
docker compose version
docker info
```

Make sure these local ports are free:

```text
3000, 3002, 3005, 5000, 7000, 8001, 8080, 8201, 5433, 3306
```

## 4. One-Time Environment Setup

From the parent `AgentryX` folder:

```powershell
cd .\FlowEngine2.0
Copy-Item .env.example .env
Copy-Item ..\KillBill\gateway\.env.example ..\KillBill\gateway\.env
```

On macOS or Linux:

```bash
cd FlowEngine2.0
cp .env.example .env
cp ../KillBill/gateway/.env.example ../KillBill/gateway/.env
```

Do not commit either `.env` file.

## 5. Configure `FlowEngine2.0/.env`

Open `FlowEngine2.0/.env` and update the values below before expecting the full app to work.

Required for local Docker:

```env
APP_NAME=AgentryX
DATABASE_URL=postgresql+psycopg://postgres:postgres@db:5432/AgentryX
FRONTEND_BASE_URL=http://localhost:3000
ADMIN_HUB_URL=http://localhost:3000
ADMIN_UI_URL=http://localhost:5000
PORTAL_URL=http://localhost:3000
KEYCLOAK_URL=http://keycloak:8080
KEYCLOAK_EXTERNAL_URL=http://localhost:7000
KEYCLOAK_INTERNAL_EXTERNAL_URL=http://host.docker.internal:7000
KEYCLOAK_REALM=flowengine
KEYCLOAK_CLIENT_ID=agentryx-app
KEYCLOAK_ADMIN_USERNAME=admin
KEYCLOAK_ADMIN_PASSWORD=admin
KILLBILL_GATEWAY_URL=http://killbill-gateway:3002
KILLBILL_API_KEY=company_a
KILLBILL_API_SECRET=company_a_secret
```

Values that must be real, not placeholders:

| Variable | What To Put |
| --- | --- |
| `JWT_SECRET` | A long random string |
| `SUPER_ADMIN_USERNAME` | Initial superadmin email |
| `SUPER_ADMIN_PASSWORD` | Initial superadmin password |
| `KEYCLOAK_CLIENT_SECRET` | The `agentryx-app` client secret from `infra/keycloak/realm-export.json` or the Keycloak admin UI |
| `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL` | Required if invite/verification emails should send |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Required only if Google login is being tested |
| `VAULT_TOKEN` | Required for real Vault credential storage after Vault is initialized |

For local testing, `KEYCLOAK_ADMIN_PASSWORD` must match the Compose value for `KC_BOOTSTRAP_ADMIN_PASSWORD`. The current Compose file uses `admin`.

Where each credential comes from:

| Variable | Source |
| --- | --- |
| `JWT_SECRET` | Generate locally. Example PowerShell: `[guid]::NewGuid().ToString() + [guid]::NewGuid().ToString()` |
| `SUPER_ADMIN_USERNAME` | Chosen by the developer or team for the first platform admin account |
| `SUPER_ADMIN_PASSWORD` | Chosen by the developer or team for the first platform admin account |
| `KEYCLOAK_CLIENT_SECRET` | The `secret` field for client `agentryx-app` in `infra/keycloak/realm-export.json`, or Keycloak Admin UI after startup: realm `flowengine` -> Clients -> `agentryx-app` -> Credentials |
| `KEYCLOAK_ADMIN_PASSWORD` | The Compose bootstrap password for Keycloak. Current local Docker value is `admin` |
| `SMTP_USER` | SMTP provider username, for example a Gmail account or company SMTP account |
| `SMTP_PASSWORD` | SMTP provider password or app password. For Gmail, create an app password in the Google account security settings |
| `SMTP_FROM_EMAIL` | Sender email allowed by the SMTP provider |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud Console -> APIs and Services -> Credentials -> OAuth client. For Keycloak Google login, add `http://localhost:7000/realms/flowengine/broker/google/endpoint` as an authorized redirect URI in Google Cloud Console |
| `VAULT_TOKEN` | Generated by `vault operator init` on a fresh Vault volume. Use the initial root token or a valid token with KV-v2 permissions |
| `KILLBILL_API_KEY`, `KILLBILL_API_SECRET` | Local Docker Kill Bill tenant bootstrap values. Current local values are `company_a` and `company_a_secret` |

## 6. Configure `KillBill/gateway/.env`

Open `KillBill/gateway/.env`.

For the normal Docker Compose stack, these values should stay aligned with Compose:

```env
KB_HOST=killbill
KB_BASE=http://killbill:8080
KB_API_KEY=company_a
KB_API_SECRET=company_a_secret
KB_USERNAME=admin
KB_PASSWORD=password
KB_WEBHOOK_CALLBACK_URL=http://killbill-gateway:3005/api/webhooks/killbill
FLOWENGINE_URL=http://app:8000
```

Optional integrations:

| Variable | Needed For |
| --- | --- |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay payment order creation |
| `STRIPE_SECRET_KEY` | Stripe payment intent creation |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Billing/reminder emails from the gateway |
| `MAUTIC_URL`, `MAUTIC_USER`, `MAUTIC_PASS` | Optional Mautic calls if Mautic is enabled |

Payment and email features can start with placeholders, but real payment/email flows will not work until real values are provided.

Where each gateway credential comes from:

| Variable | Source |
| --- | --- |
| `KB_API_KEY`, `KB_API_SECRET` | Local Kill Bill tenant created by `killbill-catalog-bootstrap`. Keep `company_a` and `company_a_secret` unless Compose/bootstrap values are changed |
| `KB_USERNAME`, `KB_PASSWORD` | Kill Bill admin credentials. Current local Docker values are `admin` and `password` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay Dashboard -> Account and Settings -> API Keys |
| `STRIPE_SECRET_KEY` | Stripe Dashboard -> Developers -> API keys -> Secret key |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Gmail account and Gmail app password, or equivalent SMTP mailbox credentials |
| `MAIL_FROM_EMAIL` | Sender email allowed by the email provider |
| `MAUTIC_URL`, `MAUTIC_USER`, `MAUTIC_PASS` | Mautic instance details, only if optional Mautic service/integration is enabled |

For real local gateway testing, replace these defaults in `KillBill/gateway/.env`:

```env
GMAIL_USER=<real-mailbox-email>
GMAIL_APP_PASSWORD=<real-mailbox-app-password>
MAIL_FROM_EMAIL=<real-mailbox-email-or-approved-sender>
TEST_EMAIL_TO=<developer-test-recipient-email>
```

If an older local environment file uses `MAUTIC_BASE`, copy that same URL into `MAUTIC_URL`. The current gateway code reads `MAUTIC_URL`, not `MAUTIC_BASE`.

Example:

```env
MAUTIC_URL=http://localhost:3004
MAUTIC_USER=<mautic-user>
MAUTIC_PASS=<mautic-password>
```

## 7. Check The Kill Bill Image

The current Compose file uses this image:

```yaml
image: killbill-fixed
```

This repository does not contain a Dockerfile that builds `killbill-fixed`.

Before starting on a new machine, check whether the image exists:

```powershell
docker image ls killbill-fixed
```

If it is missing, the stack will not start correctly. Use the same `killbill-fixed` image artifact used on the working machine, or update `docker-compose.yml` to a team-approved Kill Bill image before running the stack.

## 8. Start The Full Stack

From `FlowEngine2.0`:

```powershell
docker compose up --build -d
```

First startup can take several minutes because Docker may need to download images and install Python, Node, npm, pip, apt, and ODBC dependencies. A fresh Keycloak volume can also take several minutes before it is actually ready because Keycloak initializes its database schema, starts embedded caches, imports `infra/keycloak/realm-export.json`, and only then begins listening on port `8080` inside Docker.

Watch startup status:

```powershell
docker compose ps
```

Useful logs:

```powershell
docker compose logs -f db
docker compose logs -f keycloak
docker compose logs -f killbill
docker compose logs -f killbill-catalog-bootstrap
docker compose logs -f killbill-gateway
docker compose logs -f app
docker compose logs -f tenant-ui
docker compose logs -f admin-ui
```

Expected startup order:

1. `db` becomes healthy.
2. `killbill-db` starts.
3. `killbill` starts, then takes extra time internally before it is ready.
4. `killbill-catalog-bootstrap` waits for Kill Bill, creates tenant `company_a`, uploads `KillBill/catalog.xml`, verifies required plans, and exits with code `0`.
5. `killbill-gateway` starts after catalog bootstrap succeeds.
6. `keycloak` imports the `flowengine` realm on a fresh Keycloak volume and becomes Docker-healthy only after it is accepting connections on port `8080`.
7. `keycloak-google-bootstrap` starts after Keycloak is healthy, then updates Keycloak SMTP from `SMTP_*` values and the `google` identity provider from `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`. If those values are placeholders, it skips safely.
8. `app` starts, runs `init_schema.sql`, seeds configured database records, and attempts to seed the configured superadmin in Keycloak.
9. Tenant UI and admin UI start through Nginx.

Keycloak and Kill Bill can show as `Started` before they are fully ready. Keycloak has an explicit Docker healthcheck in this Compose file, but the first cold startup can still be slow. Give the stack extra time before testing login, registration, billing, or subscriptions.

## 9. Initialize And Unseal Vault

Vault uses file storage, not dev mode. On a fresh volume, it must be initialized and unsealed before real credential storage works.

Check Vault:

```powershell
docker compose exec vault vault status
```

If `Initialized` is `false`, initialize it:

```powershell
docker compose exec vault vault operator init
```

Save all unseal keys and the initial root token securely. They are secrets. Do not commit them or paste them into docs.

By default, `vault operator init` creates 5 unseal keys with a threshold of 3. That means any 3 of the 5 keys can unseal Vault.

If `Sealed` is `true`, unseal Vault:

```powershell
docker compose exec vault vault operator unseal <unseal-key-1>
docker compose exec vault vault operator unseal <unseal-key-2>
docker compose exec vault vault operator unseal <unseal-key-3>
```

Enable the KV-v2 secrets engine at the `secret` mount:

```powershell
docker compose exec vault sh
export VAULT_TOKEN=<root-token-from-vault-init>
vault secrets enable -path=secret kv-v2
exit
```

Then update `FlowEngine2.0/.env`:

```env
VAULT_ADDR=http://vault:8200
VAULT_TOKEN=<root-token-from-vault-init>
VAULT_KV_MOUNT=secret
VAULT_AUTH_METHOD=token
```

Restart the backend so it reads the updated token:

```powershell
docker compose restart app
```

If Vault was already initialized on an existing volume, do not run `operator init` again. Just unseal it with the saved unseal key.

Vault may need to be unsealed again after container restarts because auto-unseal is not configured.

For normal later restarts, use:

```powershell
docker compose exec vault vault status
docker compose exec vault vault operator unseal <any-unseal-key-1>
docker compose exec vault vault operator unseal <any-unseal-key-2>
docker compose exec vault vault operator unseal <any-unseal-key-3>
```

Do not run `vault operator init` again unless the Vault volume was deleted, for example after `docker compose down -v`.

## 10. Verify The Stack

Open these URLs:

| URL | Expected Result |
| --- | --- |
| `http://localhost:3000` | Tenant UI |
| `http://localhost:5000` | Admin UI |
| `http://localhost:8001/health` | `{"status":"healthy"}` |
| `http://localhost:7000` | Keycloak |
| `http://localhost:8201` | Vault UI |
| `http://localhost:3002/api/plans` | Gateway plan JSON |

PowerShell checks:

```powershell
Invoke-WebRequest -Uri http://localhost:8001/health -UseBasicParsing
Invoke-WebRequest -Uri http://localhost:3002/api/plans -UseBasicParsing
Invoke-WebRequest -Uri http://localhost:7000/realms/flowengine/.well-known/openid-configuration -UseBasicParsing
```

Kill Bill health check:

```powershell
$basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:password"))
Invoke-WebRequest -Uri http://localhost:8080/1.0/healthcheck -Headers @{Authorization="Basic $basic"} -UseBasicParsing
```

Check the catalog plans through the gateway proxy:

```powershell
$basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:password"))
Invoke-WebRequest -Uri http://localhost:3002/api/v1/catalog/availableBasePlans -Headers @{Authorization="Basic $basic"; "X-Killbill-ApiKey"="company_a"; "X-Killbill-ApiSecret"="company_a_secret"} -UseBasicParsing
```

The catalog should include these current plan names:

```text
email-validate-basic
email-validate-standard
email-validate-pro
data-basic
data-standard
data-pro
sql-query-basic
sql-query-standard
sql-query-pro
```

## 11. First Functional Smoke Test

After all services are up:

1. Open `http://localhost:3000`.
2. Register a tenant through the tenant UI.
3. Verify email if SMTP/email verification is configured.
4. Log in through Keycloak.
5. Confirm the tenant app opens at `/app`.
6. Check the sidebar modules and billing page.
7. Create a datasource.
8. Create a datasource config for that datasource.
9. Initialize/unseal Vault if not already done.
10. Save credentials for a configured datasource.
11. Create an intent, intent policy, and validation rule.
12. In admin UI at `http://localhost:5000`, log in as the configured superadmin and verify modules/sidebar records if needed.

Tenant registration and module subscription depend on Keycloak, FlowEngine, Kill Bill, and the gateway all being ready.

## 12. Daily Start, Stop, Rebuild, And Reset

Start without rebuilding:

```powershell
docker compose up -d
```

Stop without deleting data:

```powershell
docker compose stop
```

Restart one service:

```powershell
docker compose restart app
docker compose restart tenant-ui
docker compose restart killbill-gateway
```

Rebuild after code changes:

```powershell
docker compose up --build -d
```

Full reset with all local Docker data deleted:

```powershell
docker compose down -v
docker compose up --build -d
```

After `docker compose down -v`, these are wiped:

| Data | Effect |
| --- | --- |
| Postgres volume | FlowEngine records and Keycloak database are deleted |
| Keycloak volume | Realm import runs again on next start |
| Vault volume | Vault must be initialized/unsealed again and a new token must be placed in `.env` |
| Kill Bill MariaDB volume | Kill Bill accounts, subscriptions, invoices, and catalog data are deleted |

The `killbill-catalog-bootstrap` container should run again after a full reset and upload `KillBill/catalog.xml`.

## 13. Troubleshooting

### `killbill-fixed` image is missing

Symptom:

```text
pull access denied for killbill-fixed
```

Fix:

```powershell
docker image ls killbill-fixed
```

If no image exists, import or rebuild the same team-approved `killbill-fixed` image used on the working machine. This repository currently does not build it.

### `killbill-catalog-bootstrap` exits with code 1

Check logs:

```powershell
docker compose logs killbill
docker compose logs killbill-catalog-bootstrap
```

Common causes:

| Cause | Fix |
| --- | --- |
| Kill Bill was not fully ready | Wait, then run `docker compose up -d` again |
| `killbill-fixed` image is wrong or missing | Use the correct image |
| Catalog upload failed | Check the bootstrap logs for the HTTP response body |
| Existing broken Kill Bill volume | Run `docker compose down -v`, then start again |

### Tenant UI shows `Failed to fetch`

Check backend health:

```powershell
Invoke-WebRequest -Uri http://localhost:8001/health -UseBasicParsing
docker compose logs app
```

Check that `tenant-ui` can proxy to the backend container. `frontend/tenant/nginx.conf` currently points to:

```text
http://flowengine-app-2:8000
```

If the backend container name changes, update the Nginx proxy target or keep the container name unchanged.

### Login redirects forever or returns to Keycloak repeatedly

Check:

| Item | Expected |
| --- | --- |
| Keycloak URL | `http://localhost:7000` works |
| Realm | `flowengine` exists |
| Client | `agentryx-app` exists |
| Redirect URI | `http://localhost:3000/auth/keycloak/callback` is allowed |
| Backend env | `KEYCLOAK_CLIENT_SECRET` matches the imported Keycloak client |
| Backend env | `KEYCLOAK_ADMIN_PASSWORD=admin` unless Compose was changed |

If the Keycloak volume already existed before a realm/theme change, run a full reset or update the realm manually in Keycloak.

### `keycloak-google-bootstrap` exits with code 1 on first startup

Check logs:

```powershell
docker compose logs keycloak
docker compose logs keycloak-google-bootstrap
```

The bootstrap job depends on Keycloak being Docker-healthy. Keycloak is considered healthy only after it accepts connections on port `8080` inside the Docker network. On a fresh volume, Keycloak can take several minutes to initialize its Postgres schema, import `infra/keycloak/realm-export.json`, and start listening. After Keycloak is ready, this job applies SMTP settings and Google OAuth settings from `.env` to the imported realm.

The bootstrap script also has its own wait loop. These values are configured in `docker-compose.yml`:

| Variable | Current Value | Purpose |
| --- | --- | --- |
| `KEYCLOAK_BOOTSTRAP_READY_ATTEMPTS` | `420` | Maximum readiness attempts inside the bootstrap script |
| `KEYCLOAK_BOOTSTRAP_READY_DELAY_SECONDS` | `2` | Delay between readiness attempts |
| `KEYCLOAK_BOOTSTRAP_REQUEST_TIMEOUT_SECONDS` | `5` | Timeout for each readiness HTTP request |

With the current values, the bootstrap script can wait up to about 14 minutes after it starts. If this job still fails, confirm that `flowengine-keycloak` is running, attached to the same Docker network, and eventually logs `Listening on: http://0.0.0.0:8080`. After Keycloak is healthy, rerun:

```powershell
docker compose up -d
```

### Continue with Google fails

Check:

```powershell
docker compose logs keycloak-google-bootstrap
docker compose logs keycloak
```

Google login requires real `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` values in `FlowEngine2.0/.env`. Do not put real Google secrets in `infra/keycloak/realm-export.json`; the `keycloak-google-bootstrap` service applies them to Keycloak after startup.

For local Keycloak broker login, the Google OAuth client must allow this redirect URI:

```text
http://localhost:7000/realms/flowengine/broker/google/endpoint
```

If Keycloak logs `invalid_client`, either the Google secret in `.env` is wrong for the configured Google OAuth client, or the OAuth app in Google Cloud Console does not allow the Keycloak callback URL used by this local setup.

### Registration succeeds partly but subscription fails

Check:

```powershell
Invoke-WebRequest -Uri http://localhost:3002/api/plans -UseBasicParsing
docker compose logs killbill-gateway
docker compose logs killbill-catalog-bootstrap
```

Subscription creation requires the plan names from `KillBill/catalog.xml`. The active plan names use lower-case hyphenated names such as `data-basic`, not display labels such as `Data Basic`.

### Credentials do not save or read

Check Vault:

```powershell
docker compose exec vault vault status
docker compose logs app
```

Required state:

| Item | Expected |
| --- | --- |
| Vault initialized | `true` |
| Vault sealed | `false` |
| KV mount | `secret` enabled as KV-v2 |
| Backend `.env` | `VAULT_TOKEN` is a valid token |
| Backend restarted | `docker compose restart app` after changing `.env` |

### Invite or verification email does not send

Check:

| Variable | Required |
| --- | --- |
| `SMTP_HOST` | SMTP hostname |
| `SMTP_PORT` | SMTP port |
| `SMTP_USER` | SMTP username |
| `SMTP_PASSWORD` | SMTP password or app password |
| `SMTP_FROM_EMAIL` | Sender email |

Then check:

```powershell
docker compose logs app
docker compose logs killbill-gateway
```

### Build is slow

First build is expected to be slow because Docker downloads:

| Build Part | Downloads |
| --- | --- |
| Backend | Python image, apt packages, Microsoft ODBC packages, pip packages |
| Tenant UI | Node image, npm packages |
| Admin UI | Node image, npm packages |
| Gateway | Node image, production npm packages |

Subsequent builds should be faster if Docker cache is preserved.

### Port is already allocated

Find the process using a port:

```powershell
netstat -ano | findstr :3000
netstat -ano | findstr :8001
netstat -ano | findstr :7000
```

Stop the conflicting process or change the Compose port mapping.

## 14. Files That Must Stay Local

Do not commit:

```text
FlowEngine2.0/.env
KillBill/gateway/.env
Vault unseal keys
Vault root token
Real SMTP credentials
Real Google OAuth credentials
Real payment provider credentials
```

The safe files to commit are:

```text
FlowEngine2.0/.env.example
KillBill/gateway/.env.example
FlowEngine2.0/docker-compose.yml
FlowEngine2.0/RUNBOOK.md
KillBill/RUNBOOK.md
```
