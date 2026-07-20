# TemplateBuilder Runbook

This runbook explains how to start, verify, stop, and troubleshoot the TemplateBuilder module from a fresh checkout. It is intentionally operational and step-by-step. For architecture, code inventory, endpoint details, and known limitations, read `README.md` in this folder.

## 1. What This Module Starts

The backend Docker stack is defined in `TemplateBuilder/template-builder-engine/docker-compose.yml`.

| Service | Container name | Purpose | Host port |
| --- | --- | --- | --- |
| `api` | Compose-generated | FastAPI TemplateBuilder API | `10001` |
| `worker` | Compose-generated replicas | Queued render-job worker | none |
| `db` | Compose-generated | PostgreSQL app DB for `template_builder` and temporary/demo `eivs` schemas | internal only |
| `kasetti-db` | `kasetti-datasource-postgres` | PostgreSQL demo datasource DB | `5433` |
| `redis` | Compose-generated | Redis container for future/auxiliary backend use | internal only |

The active React frontend is separate and lives in `TemplateBuilder/template-builder-ui`. The Compose file does not start the active frontend today.

Current URLs when running with the default local setup:

- TemplateBuilder UI: `http://localhost:5173`
- Backend health: `http://localhost:10001/healthz`
- Versioned backend health: `http://localhost:10001/v1/healthz`
- Backend debug routes: `http://localhost:10001/_debug/routes`
- Backend Swagger docs: `http://localhost:10001/docs`
- Kasetti datasource PostgreSQL from host: `localhost:5433`

## 2. Required Folder Layout

Expected local layout:

```text
AgentryX/
  TemplateBuilder/
    README.md
    RUNBOOK.md
    template-builder-engine/
      .env
      docker-compose.yml
      Dockerfile
      requirements.txt
      db/migrations/V1__init.sql
      backend/src/main.py
      backend/src/api/
      backend/src/core/
      backend/src/worker.py
      sql/kasetti-db/
      phases/
    template-builder-ui/
      .env
      package.json
      package-lock.json
      vite.config.ts
      src/
```

Important layout notes:

- `template-builder-engine/frontend` is not the active UI. Its `package.json` is empty.
- `template-builder-ui` is the active Vite React UI.
- `template-builder-engine/.env` is required for the Docker backend stack.
- `template-builder-ui/.env` is required for local Vite UI API calls.
- Do not commit `.env` files with real credentials.

## 3. Prerequisites

Required:

- Docker Desktop with Docker Compose v2.
- Git, if pulling from GitHub.
- PowerShell, if using the Windows commands below.
- Internet access for first Docker image pulls and external AI calls.

Required for the active frontend:

- Node.js 20+.
- npm.

Required only for running backend without Docker:

- Python 3.11+.
- pip.
- A reachable PostgreSQL database initialized with `db/migrations/V1__init.sql`.

Optional but useful:

- PostgreSQL CLI tools such as `psql`.
- A REST client or PowerShell `Invoke-WebRequest`.

Required free ports:

- `10001` for the backend API.
- `5433` for the Kasetti datasource database.
- `5173` for the Vite frontend.

If FlowEngine, KillBill, Orchestration, PromptBuilder, DocAI, or another local stack is using any of those ports, stop that stack first or change ports.

## 4. Required Configuration

### Backend `.env`

Create this file:

```powershell
cd C:\Users\karik\Desktop\Project\AgentryX\TemplateBuilder\template-builder-engine
New-Item -ItemType File -Path .env -Force
```

Put this structure inside `TemplateBuilder/template-builder-engine/.env` and replace placeholders with real local values:

```env
DB_URL=postgresql+asyncpg://postgres:postgres@db:5432/template_builder
REDIS_URL=redis://redis:6379/0
API_HOST=0.0.0.0
API_PORT=8080
KASETTI_DS_URL=postgresql://eivsdemo:eivsdemo@kasetti-db:5432/kasetti_bank
COHERE_API_KEY=<your-cohere-api-key>
GOOGLE_TRANSLATE_KEY=<your-google-translate-api-key>
LLM_ENDPOINT=
LLM_WEBHOOK_URL=<your-llm-webhook-url>
```

What each variable does:

| Variable | Needed for startup? | Used by |
| --- | --- | --- |
| `DB_URL` | Yes | Compose maps it to container `DATABASE_URL`; FastAPI and worker connect to Postgres. |
| `REDIS_URL` | Not required by active routes | Passed to API; Redis service exists. |
| `API_HOST` | No direct Docker effect found | Local config convention. |
| `API_PORT` | Passed to API | Docker CMD still listens on container `8080`; host maps `10001:8080`. |
| `KASETTI_DS_URL` | Needed for datasource fallback behavior | Resolver/datasource logic. |
| `COHERE_API_KEY` | Needed for full AI Generate/Polish/Check behavior | Backend `api/ai.py`. |
| `GOOGLE_TRANSLATE_KEY` | Needed for Translate behavior | Backend `api/ai.py`. |
| `LLM_ENDPOINT` | Optional | If set, Generate/Polish/Check route to this instead of Cohere. |
| `LLM_WEBHOOK_URL` | Needed for AI SQL and AI placeholder generation | Backend `api/ai.py` and `api/documents.py`; Compose also hardcodes a webhook.site URL. |

Secret handling:

- Do not commit real Cohere, Google, or webhook credentials.
- If keys are missing, the backend can still start, but AI-backed actions will return errors.

### Frontend `.env`

Create this file:

```powershell
cd C:\Users\karik\Desktop\Project\AgentryX\TemplateBuilder\template-builder-ui
New-Item -ItemType File -Path .env -Force
```

Put this inside `TemplateBuilder/template-builder-ui/.env`:

```env
VITE_API_BASE=http://localhost:10001/v1
```

The frontend may contain extra local env lines, but `VITE_API_BASE` is the important value used by the current code.

## 5. First-Time Backend Start

Open PowerShell in the backend stack folder:

```powershell
cd C:\Users\karik\Desktop\Project\AgentryX\TemplateBuilder\template-builder-engine
docker compose up --build -d
```

Check containers:

```powershell
docker compose ps
```

Expected:

- `api` should be running.
- `db` should be healthy.
- `kasetti-db` should be healthy.
- `redis` should be running.
- `worker` replicas should be running or restarting only if configuration is wrong.

Check backend health:

```powershell
Invoke-WebRequest -Uri http://localhost:10001/healthz -UseBasicParsing
Invoke-WebRequest -Uri http://localhost:10001/v1/healthz -UseBasicParsing
```

Expected health output:

```json
{"status":"ok","service":"template-builder-api"}
```

The exact versioned `/v1/healthz` body is defined in `backend/src/api/health.py`.

## 6. First-Time Frontend Start

Open a second PowerShell terminal:

```powershell
cd C:\Users\karik\Desktop\Project\AgentryX\TemplateBuilder\template-builder-ui
npm install
npm.cmd run dev
```

Open:

```text
http://localhost:5173
```

PowerShell note:

- Use `npm.cmd` if normal `npm` is blocked by PowerShell script execution policy.

## 7. Verify The Running Stack

Backend route check:

```powershell
Invoke-WebRequest -Uri http://localhost:10001/_debug/routes -UseBasicParsing
```

Template list check:

```powershell
Invoke-WebRequest -Uri http://localhost:10001/v1/templates -UseBasicParsing
```

Datasource list check:

```powershell
Invoke-WebRequest -Uri http://localhost:10001/v1/datasources -UseBasicParsing
```

Audit list check:

```powershell
Invoke-WebRequest -Uri "http://localhost:10001/v1/audit/events?limit=10" -UseBasicParsing
```

Frontend check:

- Open `http://localhost:5173`.
- Confirm `/templates` loads.
- Confirm the sidebar shows Templates, Prebuilt Templates, Placeholder Registry, Documents, Marketplace, and Audit Log.

## 8. Basic UI Smoke Test

Run this manual test after backend and frontend are both running:

1. Open `http://localhost:5173/templates`.
2. Click `+ New Template`.
3. Create a simple PDF template.
4. Confirm the app navigates to `/templates/{template_id}`.
5. Add a text block.
6. Save draft.
7. Refresh the browser and confirm the text block persists.
8. Open Placeholder Registry.
9. Create a manual SQL placeholder against a seeded datasource.
10. Click Run SQL and confirm a sample value is returned.
11. Return to the template editor.
12. Insert the placeholder token into a text block.
13. Save draft.
14. Publish the template.
15. Open Version History and confirm at least one version is listed.
16. Open Generate.
17. Generate HTML or PDF.
18. Download the generated file.
19. Open Documents and confirm the job appears.
20. Open Audit Log and confirm recent template/render events appear.

## 9. Clean Restart

Use this when you want to delete all local TemplateBuilder database data and generated container volumes:

```powershell
cd C:\Users\karik\Desktop\Project\AgentryX\TemplateBuilder\template-builder-engine
docker compose down -v
docker compose up --build -d
```

Important:

- `docker compose down -v` deletes Postgres volumes for the app database and Kasetti datasource database.
- On next startup, `V1__init.sql` and all `sql/kasetti-db/*.sql` files rerun.
- Any templates, placeholders, generated jobs, marketplace rows, and audit events created locally are deleted.

The frontend Vite server can stay running, but refresh it after backend restart.

## 10. Normal Restart

Use this when you want to restart containers without deleting data:

```powershell
cd C:\Users\karik\Desktop\Project\AgentryX\TemplateBuilder\template-builder-engine
docker compose down
docker compose up -d
```

Use this after code changes that require rebuilding the backend image:

```powershell
docker compose up --build -d
```

Restart frontend dev server if Vite is not picking up changes:

```powershell
cd C:\Users\karik\Desktop\Project\AgentryX\TemplateBuilder\template-builder-ui
npm.cmd run dev
```

## 11. Logs And Diagnostics

Show all backend-stack logs:

```powershell
cd C:\Users\karik\Desktop\Project\AgentryX\TemplateBuilder\template-builder-engine
docker compose logs --tail=200
```

API logs:

```powershell
docker compose logs api --tail=200
```

Worker logs:

```powershell
docker compose logs worker --tail=200
```

Database logs:

```powershell
docker compose logs db --tail=100
docker compose logs kasetti-db --tail=100
```

Follow logs live:

```powershell
docker compose logs -f api
```

Inspect running services:

```powershell
docker compose ps
```

Open a shell in the API container:

```powershell
docker compose exec api sh
```

Open psql in the app database:

```powershell
docker compose exec db psql -U postgres -d template_builder
```

Open psql in the Kasetti datasource database:

```powershell
docker compose exec kasetti-db psql -U eivsdemo -d kasetti_bank
```

Useful SQL checks:

```sql
SELECT COUNT(*) FROM template_builder.templates;
SELECT COUNT(*) FROM template_builder.placeholders_registry;
SELECT COUNT(*) FROM template_builder.render_jobs;
SELECT datasource_id, name, datasource_type, is_active FROM eivs.datasources ORDER BY datasource_id;
```

## 12. Running Backend Outside Docker

This is optional. Docker is the recommended backend path.

Prerequisites:

- Python 3.11+.
- A reachable Postgres database initialized with the TemplateBuilder schema.
- Environment variables equivalent to the backend `.env`.

Example:

```powershell
cd C:\Users\karik\Desktop\Project\AgentryX\TemplateBuilder\template-builder-engine
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:5432/template_builder"
$env:KASETTI_DS_URL="postgresql://eivsdemo:eivsdemo@localhost:5433/kasetti_bank"
$env:PYTHONPATH="$PWD\backend"
python -m uvicorn src.main:app --host 0.0.0.0 --port 8080
```

If using the default frontend `.env`, either keep Docker API on `10001` or update `VITE_API_BASE` to match the local backend port.

## 13. Running Frontend Outside Docker

The active frontend is already intended to run outside Docker during local development.

```powershell
cd C:\Users\karik\Desktop\Project\AgentryX\TemplateBuilder\template-builder-ui
npm install
npm.cmd run dev
```

Open:

```text
http://localhost:5173
```

Build options:

```powershell
npm.cmd exec vite build
```

Known build note:

- `npm.cmd exec vite build` runs the Vite production bundle step.
- Full `npm.cmd run build` runs `tsc -b` first. Current tests include calls to `PlaceholderPalette` without the required `onBeforeInsert` prop, so the full TypeScript build can fail until those tests are updated.

Run frontend tests:

```powershell
npm.cmd test
```

The test suite may require updates for the same `PlaceholderPalette` prop mismatch.

## 14. Data And Schema Caveats

- `template-builder-engine/db/migrations/V1__init.sql` is the active init script.
- `template-builder-engine/phases/seed/seed_datasources.sql` is stale/reference and uses older datasource column names that do not match the active schema.
- The active schema creates temporary/demo `eivs` tables locally. In a production AgentryX deployment, these may need to come from the central EIVS/FlowEngine layer instead.
- Marketplace payload storage is attempted defensively; code comments indicate payload column may not exist in older schemas, but current `V1__init.sql` does create it.
- Generated files are written to `RESULTS_DIR`, default `/app/results` inside the API/worker container.
- A clean volume reset deletes generated job rows and app database records.

## 15. Troubleshooting

### Docker pull fails

If Docker fails to pull `postgres:15`, `redis:7`, or `python:3.11-slim`, retry the pull:

```powershell
docker pull postgres:15
docker pull redis:7
docker pull python:3.11-slim
```

Then rerun:

```powershell
docker compose up --build -d
```

### Port already in use

Default ports are `10001`, `5433`, and `5173`.

Check running containers:

```powershell
docker ps
```

Stop the conflicting stack or change the port mapping in the relevant Compose/Vite config.

### UI loads but API calls fail

Check frontend `.env`:

```env
VITE_API_BASE=http://localhost:10001/v1
```

Check backend health:

```powershell
Invoke-WebRequest -Uri http://localhost:10001/v1/healthz -UseBasicParsing
```

Check CORS/API logs:

```powershell
cd C:\Users\karik\Desktop\Project\AgentryX\TemplateBuilder\template-builder-engine
docker compose logs api --tail=200
```

### Placeholder create uses the wrong datasource

Current frontend `template-builder-ui/src/api/placeholders.ts` hardcodes `datasource_id: 1` in `createPlaceholder`.

Impact:

- Creating a placeholder through the API wrapper may ignore the selected datasource.
- Editing uses a direct request from `PlaceholderRegistryPage.tsx`, but the backend update route also has current issues.

This is documented behavior only; it is not fixed by this runbook.

### Placeholder edit or single-read fails

Current backend `template-builder-engine/backend/src/api/placeholders.py` appears to read the same SQL result twice in get/update handlers, and the GET handler references `req` without defining it.

Impact:

- `GET /v1/registry/placeholders/{registry_id}` can return not found or error unexpectedly.
- `PUT /v1/registry/placeholders/{registry_id}` can return not found even after a DB update.

This is a current code issue and needs a separate approved fix.

### Template placeholder scan fails

`GET /v1/templates/{template_id}/placeholders` selects a `category` column from `template_builder.placeholders_registry`, but the active DDL does not create a `category` column.

Impact:

- That endpoint can fail if called directly or by future UI code.

### AI tools fail

For Generate, Polish, and Check:

- Set `LLM_ENDPOINT`, or
- Set `COHERE_API_KEY`.

For Translate:

- Set `GOOGLE_TRANSLATE_KEY`.

Check API logs:

```powershell
docker compose logs api --tail=200
```

### AI SQL generation fails

`POST /v1/ai/generate-sql` depends on `LLM_WEBHOOK_URL`.

If the webhook is missing, unreachable, or returns no SQL, the endpoint returns an error in the response body.

Also confirm that the selected datasource exists:

```powershell
Invoke-WebRequest -Uri http://localhost:10001/v1/datasources -UseBasicParsing
```

### Document generation returns success but file is missing

The generate endpoint always returns `status: "success"` with a job id, even when rendering later marks the job `error`.

Check the real job status:

```powershell
Invoke-WebRequest -Uri http://localhost:10001/v1/documents/jobs/<job_id> -UseBasicParsing
```

Then check API logs:

```powershell
docker compose logs api --tail=200
```

### Worker seems idle

This can be normal.

- The worker polls for jobs with status `queued`.
- The active UI/API generation path inserts jobs as `running` and renders inside the API process.
- Workers will only process jobs inserted as `queued` by another producer or future code path.

### Frontend build fails

Try Vite-only build first:

```powershell
cd C:\Users\karik\Desktop\Project\AgentryX\TemplateBuilder\template-builder-ui
npm.cmd exec vite build
```

If `npm.cmd run build` fails with a `PlaceholderPalette` prop error, the current tests need to be updated to pass `onBeforeInsert`.

### Compose comments look corrupted

Some comments in `docker-compose.yml` and source files display as mojibake in PowerShell output. This affects readability, not YAML execution.

## 16. Stop Commands

Stop backend stack without deleting data:

```powershell
cd C:\Users\karik\Desktop\Project\AgentryX\TemplateBuilder\template-builder-engine
docker compose down
```

Stop backend stack and delete volumes:

```powershell
docker compose down -v
```

Stop frontend dev server:

```text
Press Ctrl+C in the terminal running npm.cmd run dev.
```

## 17. Git Safety Checklist

Before pushing this folder:

- Confirm real `.env` files are not staged.
- Confirm `node_modules`, `dist`, and `coverage` are not staged.
- Confirm generated PDFs are intentional if staged.
- Review `git status --short TemplateBuilder`.
- Do not commit real Cohere, Google, webhook, database, or other secrets.

Suggested checks:

```powershell
git status --short TemplateBuilder
git diff -- TemplateBuilder\README.md TemplateBuilder\RUNBOOK.md
```

## 18. Current Functional Confidence Checklist

Use this checklist before saying the module is working locally:

- Backend `GET /healthz` returns OK.
- Backend `GET /v1/healthz` returns OK.
- Frontend opens at `http://localhost:5173`.
- Template list loads.
- Template create opens the editor.
- Editor saves a draft.
- Editor publishes a version.
- Placeholder Registry loads datasources.
- Manual SQL sample fetch works against Kasetti demo data.
- AI Generate/Polish/Check works if Cohere or `LLM_ENDPOINT` is configured.
- Translate works if Google Translate key is configured.
- Generate Document creates a job.
- Job status becomes success.
- Download works.
- Documents page lists the generated job.
- Marketplace can publish/import at least one supported item.
- Audit Log shows recent activity.
