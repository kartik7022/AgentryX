# AgentryX KillBill Docker Runbook

This runbook explains how to run the current Kill Bill integration used by AgentryX.

For the full product, do not start this folder by itself. The normal Docker entrypoint is:

```text
../FlowEngine2.0/docker-compose.yml
```

That Compose file starts Kill Bill, MariaDB, catalog bootstrap, and the Kill Bill gateway together with the FlowEngine backend and UIs.

## 1. What This Folder Provides

| Path | Purpose |
| --- | --- |
| `catalog.xml` | Current AgentryX Kill Bill catalog |
| `gateway/` | Active Node/Express gateway used by FlowEngine billing screens and backend billing calls |
| `gateway/Dockerfile` | Docker image for the gateway only |
| `gateway/.env.example` | Safe template for gateway runtime config |
| `00-setup-tenant.ps1` | Legacy helper to create the `company_a` Kill Bill tenant |
| `01-upload-catalog.ps1` | Helper to upload `catalog.xml` to a local Kill Bill server |
| `02-create-account.ps1` to `08-run-all.ps1` | Older POC scripts; several still reference old ModuleA/ModuleB/ModuleC plan names |
| `server.js` | Standalone old POC server, not the active gateway |
| `webhook-listener.js` | Standalone old webhook listener, not the active gateway listener |

The active runtime path is:

```text
FlowEngine UI/backend -> KillBill/gateway/index.js -> Kill Bill server
```

## 2. Recommended Full-Stack Docker Startup

Use this when another developer wants to run the whole project.

From the parent `AgentryX` folder:

```powershell
cd .\FlowEngine2.0
Copy-Item .env.example .env
Copy-Item ..\KillBill\gateway\.env.example ..\KillBill\gateway\.env
docker compose up --build -d
```

On macOS or Linux:

```bash
cd FlowEngine2.0
cp .env.example .env
cp ../KillBill/gateway/.env.example ../KillBill/gateway/.env
docker compose up --build -d
```

Before starting, read and complete the environment setup in `../FlowEngine2.0/RUNBOOK.md`.

## 3. Services Started By The FlowEngine Compose File

The billing-related services are:

| Service | Container | Local URL or Port | Purpose |
| --- | --- | --- | --- |
| `killbill-db` | `killbill-mariadb` | `localhost:3306` | MariaDB for Kill Bill |
| `killbill` | `killbill-server` | `http://localhost:8080` | Kill Bill server |
| `killbill-catalog-bootstrap` | `killbill-catalog-bootstrap` | one-shot job | Creates tenant and uploads catalog |
| `killbill-gateway` | `killbill-gateway` | `http://localhost:3002`, `http://localhost:3005` | Billing gateway and webhook listener |

Startup order:

1. `killbill-db` starts.
2. `killbill` starts.
3. `killbill-catalog-bootstrap` waits for Kill Bill health.
4. `killbill-catalog-bootstrap` creates tenant `company_a` using secret `company_a_secret`.
5. `killbill-catalog-bootstrap` uploads `KillBill/catalog.xml`.
6. `killbill-catalog-bootstrap` verifies the required plans.
7. `killbill-gateway` starts only after the bootstrap job exits successfully.

## 4. Required Gateway Environment

Create this file:

```text
KillBill/gateway/.env
```

Start from:

```text
KillBill/gateway/.env.example
```

For the integrated Docker stack, keep these values:

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

Optional values:

| Variable | Needed For |
| --- | --- |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay payment order creation |
| `STRIPE_SECRET_KEY` | Stripe payment intent creation |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Billing/reminder emails |
| `MAUTIC_URL`, `MAUTIC_USER`, `MAUTIC_PASS` | Optional Mautic integration |

The gateway starts with placeholder payment/email values, but real external payment/email operations will not work until real credentials are provided.

Where each credential comes from:

| Variable | Source |
| --- | --- |
| `KB_API_KEY`, `KB_API_SECRET` | Created by the integrated FlowEngine Compose bootstrap job. Current local values are `company_a` and `company_a_secret` |
| `KB_USERNAME`, `KB_PASSWORD` | Kill Bill admin credentials. Current local Docker values are `admin` and `password` |
| `KB_WEBHOOK_CALLBACK_URL` | Internal Docker callback URL for gateway webhook listener. Keep `http://killbill-gateway:3005/api/webhooks/killbill` in the integrated Compose stack |
| `FLOWENGINE_URL` | Internal Docker URL for the FastAPI service. Keep `http://app:8000` in the integrated Compose stack |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay Dashboard -> Account and Settings -> API Keys |
| `STRIPE_SECRET_KEY` | Stripe Dashboard -> Developers -> API keys -> Secret key |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Gmail mailbox and Gmail app password, or equivalent SMTP mailbox credentials |
| `MAIL_FROM_EMAIL` | Sender email allowed by the mail provider |
| `MAUTIC_URL`, `MAUTIC_USER`, `MAUTIC_PASS` | Optional Mautic instance credentials, only if Mautic is enabled |

Do not put real payment, email, or Mautic secrets in Git. Put them only in `KillBill/gateway/.env`.

For real local testing, replace these placeholder/default values:

```env
GMAIL_USER=<real-mailbox-email>
GMAIL_APP_PASSWORD=<real-mailbox-app-password>
MAIL_FROM_EMAIL=<real-mailbox-email-or-approved-sender>
TEST_EMAIL_TO=<developer-test-recipient-email>
```

`TEST_EMAIL_TO` is used by gateway email test/reminder flows. Do not leave it as `qa@example.com` when testing real email delivery.

If you are migrating values from an older local `.env` that has `MAUTIC_BASE`, copy that URL into `MAUTIC_URL`. The current gateway code reads `MAUTIC_URL`.

Example:

```env
MAUTIC_URL=http://localhost:3004
MAUTIC_USER=<mautic-user>
MAUTIC_PASS=<mautic-password>
```

## 5. Kill Bill Image Requirement

The unified Compose file uses:

```yaml
image: killbill-fixed
```

This `KillBill` folder does not build that image.

On a new machine, check:

```powershell
docker image ls killbill-fixed
```

If no image is listed, the full stack cannot start as-is. Import the same `killbill-fixed` image artifact used on the working machine, or update `FlowEngine2.0/docker-compose.yml` to a team-approved Kill Bill image before running.

## 6. Verify Billing Startup

From `FlowEngine2.0`:

```powershell
docker compose ps
docker compose logs killbill
docker compose logs killbill-catalog-bootstrap
docker compose logs killbill-gateway
```

Expected result:

| Check | Expected |
| --- | --- |
| `killbill-db` | Running |
| `killbill` | Running |
| `killbill-catalog-bootstrap` | Exited with code `0` |
| `killbill-gateway` | Running |

Check gateway plans:

```powershell
Invoke-WebRequest -Uri http://localhost:3002/api/plans -UseBasicParsing
```

Check Kill Bill health:

```powershell
$basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:password"))
Invoke-WebRequest -Uri http://localhost:8080/1.0/healthcheck -Headers @{Authorization="Basic $basic"} -UseBasicParsing
```

Check catalog plans through the gateway proxy:

```powershell
$basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:password"))
Invoke-WebRequest -Uri http://localhost:3002/api/v1/catalog/availableBasePlans -Headers @{Authorization="Basic $basic"; "X-Killbill-ApiKey"="company_a"; "X-Killbill-ApiSecret"="company_a_secret"} -UseBasicParsing
```

## 7. Current Catalog Plans

`catalog.xml` currently defines three AgentryX products:

| Product | Plans |
| --- | --- |
| `email_validate` | `email-validate-basic`, `email-validate-standard`, `email-validate-pro` |
| `data` | `data-basic`, `data-standard`, `data-pro` |
| `sql_query` | `sql-query-basic`, `sql-query-standard`, `sql-query-pro` |

Subscription calls must use the plan names above. Display labels such as `Data Basic` are not Kill Bill plan names.

## 8. Manual Catalog Upload Fallback

The normal path is the Docker one-shot service:

```text
killbill-catalog-bootstrap
```

If you need to manually upload the catalog to a local Kill Bill server at `http://localhost:8080`, run:

```powershell
cd .\KillBill
.\01-upload-catalog.ps1
```

That script sources `00-setup-tenant.ps1`, creates or reuses tenant `company_a`, uploads `catalog.xml`, and prints the plans returned by Kill Bill.

Use this only as a fallback or debugging helper. The integrated Docker startup should handle catalog setup automatically.

## 9. Gateway-Only Docker Mode

Use this only when debugging the gateway separately.

You need a reachable Kill Bill server first. That can be:

| Scenario | Gateway Env |
| --- | --- |
| Kill Bill running in the unified Compose network | `KB_HOST=killbill`, `KB_BASE=http://killbill:8080` |
| Kill Bill running on the Docker host | `KB_HOST=host.docker.internal`, `KB_BASE=http://host.docker.internal:8080` |
| Kill Bill running elsewhere | Set `KB_HOST` and `KB_BASE` to that host |

Build the gateway image:

```powershell
cd .\KillBill
docker build -t agentryx-killbill-gateway .\gateway
```

Run the gateway against a host-accessible Kill Bill server:

```powershell
docker run --rm --name killbill-gateway --env-file .\gateway\.env -p 3002:3002 -p 3005:3005 agentryx-killbill-gateway
```

If you need the standalone gateway container to join the FlowEngine Compose network, find the network name:

```powershell
docker network ls
```

Then run with that network:

```powershell
docker run --rm --name killbill-gateway --network <compose-network-name> --env-file .\gateway\.env -p 3002:3002 -p 3005:3005 agentryx-killbill-gateway
```

Do not run this standalone container at the same time as the Compose-managed `killbill-gateway` container unless you change the host ports.

## 10. Stop, Rebuild, And Reset

For the integrated stack, run these from `FlowEngine2.0`.

Stop without deleting data:

```powershell
docker compose stop killbill-gateway killbill killbill-db
```

Start billing services again:

```powershell
docker compose up -d killbill-db killbill killbill-catalog-bootstrap killbill-gateway
```

Rebuild the gateway after code changes:

```powershell
docker compose up --build -d killbill-gateway
```

Full reset of the whole project:

```powershell
docker compose down -v
docker compose up --build -d
```

A full reset deletes Kill Bill MariaDB data. The catalog bootstrap job should recreate tenant `company_a` and upload `catalog.xml` on the next start.

## 11. Runtime Files

The gateway may create local runtime files such as:

```text
gateway/plans.json
gateway/billing-config.json
gateway/usage-data.json
gateway/payments.json
gateway/trial-usage.db
gateway/debug-merged-catalog.xml
```

These files are runtime state, not source files. They are ignored by `.gitignore`.

Deleting them resets the gateway's local plan/config/payment/usage/trial tracking state, but it does not delete Kill Bill server data stored in MariaDB.

## 12. Troubleshooting

### `killbill-catalog-bootstrap` failed

Check:

```powershell
cd .\FlowEngine2.0
docker compose logs killbill
docker compose logs killbill-catalog-bootstrap
```

Common causes:

| Cause | Fix |
| --- | --- |
| Kill Bill not ready yet | Wait, then run `docker compose up -d` again |
| `killbill-fixed` image missing or wrong | Use the correct image |
| Catalog upload rejected | Inspect the HTTP body in bootstrap logs |
| MariaDB volume contains bad old state | Run `docker compose down -v`, then start again |

### Gateway is running but plans look wrong

Check:

```powershell
Invoke-WebRequest -Uri http://localhost:3002/api/plans -UseBasicParsing
docker compose logs killbill-gateway
```

Also verify Kill Bill catalog plans:

```powershell
$basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:password"))
Invoke-WebRequest -Uri http://localhost:3002/api/v1/catalog/availableBasePlans -Headers @{Authorization="Basic $basic"; "X-Killbill-ApiKey"="company_a"; "X-Killbill-ApiSecret"="company_a_secret"} -UseBasicParsing
```

### Subscription fails with missing plan

Use the actual Kill Bill plan names from `catalog.xml`.

Correct examples:

```text
data-basic
email-validate-basic
sql-query-basic
```

Incorrect examples:

```text
Data Basic
Email Validate Basic
SQL Query Basic
```

### Webhooks do not arrive

Check the callback URL:

```env
KB_WEBHOOK_CALLBACK_URL=http://killbill-gateway:3005/api/webhooks/killbill
```

In the integrated Compose stack, Kill Bill should call the gateway by container name on the same Docker network.

Check logs:

```powershell
docker compose logs killbill-gateway
docker compose logs killbill
```

### Payment calls fail

Payment providers are optional. If Stripe or Razorpay credentials are placeholders, payment creation endpoints can fail or return provider errors.

Set the required values in:

```text
KillBill/gateway/.env
```

Then restart:

```powershell
cd .\FlowEngine2.0
docker compose restart killbill-gateway
```

### Reminder emails do not send

Set:

```env
GMAIL_USER=<real-gmail-or-smtp-user>
GMAIL_APP_PASSWORD=<real-app-password>
MAIL_FROM_NAME=AgentryX
MAIL_FROM_EMAIL=<sender-email>
```

Then restart:

```powershell
cd .\FlowEngine2.0
docker compose restart killbill-gateway
```

### Old POC scripts fail

Several old scripts reference `ModuleA`, `ModuleB`, `ModuleC` and plan names like `module-a-trial`.

The current catalog uses:

```text
email_validate
data
sql_query
```

Treat scripts after `01-upload-catalog.ps1` as historical POC helpers unless they are updated to the current AgentryX catalog.

## 13. Files That Must Stay Local

Do not commit:

```text
KillBill/gateway/.env
gateway/*.db
gateway/*.json runtime state
gateway/debug-merged-catalog.xml
payment provider secrets
SMTP app passwords
```

Safe files to commit:

```text
KillBill/catalog.xml
KillBill/gateway/.env.example
KillBill/gateway/Dockerfile
KillBill/RUNBOOK.md
```
