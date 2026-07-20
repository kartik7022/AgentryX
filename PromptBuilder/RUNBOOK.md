# PromptBuilder Runbook

This runbook explains how to start, verify, stop, and troubleshoot the PromptBuilder module from a fresh checkout. It is intentionally operational and step-by-step. For architecture, code inventory, endpoint details, and known limitations, read `README.md` in this folder.

## 1. What This Module Starts

The PromptBuilder Docker stack starts four services from `PromptBuilder/backend/docker-compose.yml`:

| Service | Container name | Purpose | Host port |
| --- | --- | --- | --- |
| `frontend` | `frontend` | Nginx-served React PromptBuilder UI | `5174` |
| `backend` | `backend` | FastAPI PromptBuilder API | `10002` |
| `db` | `database` | PostgreSQL app DB for `prompt_builder` schema | internal only |
| `kasetti-db` | `kasetti-datasource-postgres-pb` | PostgreSQL demo datasource DB | `5434` |

Current URLs after Docker startup:

- PromptBuilder UI: `http://localhost:5174`
- Backend health: `http://localhost:10002/healthz`
- Versioned backend health: `http://localhost:10002/v1/healthz`
- Debug route list: `http://localhost:10002/_debug/routes`
- Kasetti datasource PostgreSQL from host: `localhost:5434`

## 2. Required Folder Layout

The expected local layout is:

```text
AgentryX/
  PromptBuilder/
    README.md
    RUNBOOK.md
    backend/
      .env
      docker-compose.yml
      Dockerfile
      db/migrations/0001_prompt_builder.sql
      kasetti-db/*.sql
      requirements.txt
      src/
    frontend/
      .env
      Dockerfile
      package.json
      package-lock.json
      vite.config.ts
      src/
```

Only `backend/.env` is required for Docker startup. `frontend/.env` is only needed when running the Vite frontend directly with `npm run dev`.

Do not commit `.env` files.

## 3. Prerequisites

Required:

- Docker Desktop or Docker Engine with Docker Compose v2.
- Git, if pulling from GitHub.
- Internet access for first Docker image pulls and for external AI calls.

Required only for non-Docker frontend development:

- Node.js 20+.
- npm.

Required only for non-Docker backend development:

- Python 3.11+.
- pip.
- A reachable PostgreSQL database.

Optional but useful:

- PostgreSQL CLI tools such as `psql`.
- A REST client or PowerShell `Invoke-WebRequest` for endpoint checks.

External credentials needed for full AI behavior:

- Cohere API key for normal LLM-backed prompt execution when `LLM_ENDPOINT` is not used.
- Google Cloud Translation API key for the translate helper.
- Optional custom LLM endpoint URL if bypassing Cohere.
- Optional SQL generation webhook URL.
- Optional TemplateBuilder API URL for prompt-to-document flow.

## 4. Required Configuration

### Backend `.env`

Create this file:

```powershell
cd PromptBuilder\backend
New-Item -ItemType File -Path .env -Force
```

Put this structure inside `PromptBuilder/backend/.env` and replace placeholders with real local values:

```env
DB_URL=postgresql+asyncpg://postgres:postgres@db:5432/prompt_builder
REDIS_URL=
API_HOST=0.0.0.0
API_PORT=8080
KASETTI_DS_URL=postgresql://eivsdemo:eivsdemo@kasetti-db:5432/kasetti_bank
COHERE_API_KEY=<your-cohere-api-key>
GOOGLE_TRANSLATE_KEY=<your-google-translate-key>
LLM_ENDPOINT=
LLM_WEBHOOK_URL=<optional-sql-or-llm-webhook-url>
TEMPLATE_BUILDER_URL=http://host.docker.internal:10001/v1
```

What each variable does:

| Variable | Needed for startup? | Used by |
| --- | --- | --- |
| `DB_URL` | Yes | Docker Compose maps it to backend `DATABASE_URL`. |
| `REDIS_URL` | No known active use | Present in local config expectations; no Redis service is started. |
| `API_HOST` | No direct Docker effect | Compose passes it, but Docker CMD starts Uvicorn on `0.0.0.0`. |
| `API_PORT` | No direct Docker effect | Compose passes it, but Docker CMD listens on `8080`. |
| `KASETTI_DS_URL` | Required for datasource fallback behavior | Context resolver and datasource helpers. |
| `COHERE_API_KEY` | Required for Cohere LLM calls | Prompt execution and AI helper tools unless `LLM_ENDPOINT` is set. |
| `GOOGLE_TRANSLATE_KEY` | Required for translation | AI translate helper. |
| `LLM_ENDPOINT` | Optional | Custom LLM microservice instead of Cohere. |
| `LLM_WEBHOOK_URL` | Optional for startup, required for SQL-generation webhook flow | `/v1/ai/generate-sql` and document AI placeholder resolution. |
| `TEMPLATE_BUILDER_URL` | Optional for startup, required for prompt-to-document bridge | `/v1/prompts/{prompt_id}/generate-document`. |

Do not use real secrets in documentation, commits, screenshots, or issue reports.

### Frontend `.env`

For Docker startup, this file is not required because the frontend Dockerfile builds with `VITE_API_BASE=/api/v1`.

For local Vite development, create `PromptBuilder/frontend/.env`:

```env
VITE_API_BASE=http://localhost:10002/v1
```

## 5. First-Time Docker Start

From the repository root:

```powershell
cd PromptBuilder\backend
docker compose up --build -d
```

Expected result:

- Docker builds the backend image.
- Docker builds the frontend image.
- PostgreSQL app DB starts and runs `db/migrations/0001_prompt_builder.sql`.
- Kasetti datasource PostgreSQL starts and runs all SQL files under `kasetti-db/`.
- Backend starts after both DB services are healthy.
- Frontend starts after backend service creation.

Check service state:

```powershell
docker compose ps
```

Expected healthy/running state:

- `database` should be healthy.
- `kasetti-datasource-postgres-pb` should be healthy.
- `backend` should be running.
- `frontend` should be running.

Check backend logs:

```powershell
docker compose logs backend --tail=100
```

Expected successful backend signs:

- Uvicorn starts on `http://0.0.0.0:8080`.
- No database connection failure appears.
- Health endpoints respond.

## 6. Verify The Running Stack

Backend root health:

```powershell
Invoke-WebRequest http://localhost:10002/healthz -UseBasicParsing
```

Expected:

- HTTP 200.
- JSON status should include `ok`.

Versioned health:

```powershell
Invoke-WebRequest http://localhost:10002/v1/healthz -UseBasicParsing
```

Expected:

- HTTP 200.
- Current code returns service name `template-builder-api`; this is a known naming inconsistency, not a startup failure.

Frontend:

```powershell
Invoke-WebRequest http://localhost:5174 -UseBasicParsing
```

Expected:

- HTTP 200.
- Browser can open `http://localhost:5174`.

Prompt API:

```powershell
Invoke-WebRequest http://localhost:10002/v1/prompts -UseBasicParsing
```

Expected:

- HTTP 200.
- Empty list on a fresh DB, or existing prompt data if the volume already has data.

Debug routes:

```powershell
Invoke-WebRequest http://localhost:10002/_debug/routes -UseBasicParsing
```

Expected:

- HTTP 200.
- Response lists active mounted routes.

## 7. Basic UI Smoke Test

Open `http://localhost:5174`.

Run this manual smoke test:

1. Open My Prompts.
2. Create a prompt with a name and basic metadata.
3. Confirm the app navigates to Prompt Studio for the created prompt.
4. Add at least one input.
5. Add at least one block.
6. Save the edited tab.
7. Open Versions and publish a version.
8. Open Run Console.
9. Enter required runtime inputs.
10. Run the prompt.
11. Open Run History and confirm the run appears.
12. Open Audit log and confirm prompt operations were recorded.

Notes:

- LLM-backed run steps require either `COHERE_API_KEY` or `LLM_ENDPOINT`.
- If LLM credentials are missing, prompt execution should fail with an API error explaining the missing key.
- If the run output cannot be parsed as JSON while JSON output is expected, the backend records the run as an error and returns the raw output/error details.

## 8. Clean Restart

Use this when you want to rebuild containers while keeping database volumes:

```powershell
cd PromptBuilder\backend
docker compose down
docker compose up --build -d
```

Use this when you want a fully fresh database:

```powershell
cd PromptBuilder\backend
docker compose down -v
docker compose up --build -d
```

Important:

- `docker compose down -v` deletes PromptBuilder app DB data and Kasetti demo datasource DB data.
- On the next startup, Docker entrypoint scripts recreate the prompt schema and demo datasource schemas from SQL files.
- Any prompt records, run history, and test cases stored in the Docker volume will be lost.

## 9. Normal Restart

Stop:

```powershell
cd PromptBuilder\backend
docker compose stop
```

Start:

```powershell
cd PromptBuilder\backend
docker compose start
```

Restart a single service:

```powershell
docker compose restart backend
docker compose restart frontend
```

Rebuild only backend:

```powershell
docker compose up --build -d backend
```

Rebuild only frontend:

```powershell
docker compose up --build -d frontend
```

## 10. Logs And Diagnostics

All logs:

```powershell
cd PromptBuilder\backend
docker compose logs --tail=200
```

Backend logs:

```powershell
docker compose logs backend --tail=200
```

Frontend logs:

```powershell
docker compose logs frontend --tail=200
```

Database logs:

```powershell
docker compose logs db --tail=200
docker compose logs kasetti-db --tail=200
```

Open shell in backend:

```powershell
docker exec -it backend sh
```

Open app DB shell:

```powershell
docker exec -it database psql -U postgres -d prompt_builder
```

Open Kasetti datasource DB shell:

```powershell
docker exec -it kasetti-datasource-postgres-pb psql -U eivsdemo -d kasetti_bank
```

List PromptBuilder tables:

```sql
\dt prompt_builder.*
```

List Kasetti schemas:

```sql
\dn
```

## 11. Running Frontend Outside Docker

Use this only for frontend development:

```powershell
cd PromptBuilder\frontend
npm install
npm run dev
```

Make sure `PromptBuilder/frontend/.env` contains:

```env
VITE_API_BASE=http://localhost:10002/v1
```

The Vite dev server uses port `5174` from `vite.config.ts`.

Build check:

```powershell
npm run build
```

Lint check:

```powershell
npm run lint
```

There is no frontend test script defined in `package.json`.

## 12. Running Backend Outside Docker

Docker is the recommended path because it starts the required databases. If you must run the backend directly:

```powershell
cd PromptBuilder\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:5432/prompt_builder"
$env:KASETTI_DS_URL="postgresql://eivsdemo:eivsdemo@localhost:5434/kasetti_bank"
uvicorn src.main:app --host 0.0.0.0 --port 8080
```

Requirements for this mode:

- A local PostgreSQL database must already exist.
- The `prompt_builder` migration must already be applied.
- Kasetti datasource DB must be reachable if datasource context is used.
- `COHERE_API_KEY` or `LLM_ENDPOINT` must be set if prompt execution should call an LLM.

## 13. Data And Schema Caveats

The PromptBuilder migration creates only:

- `prompt_builder.*` app tables.

It does not create:

- `eivs.datasources`.
- `template_builder.templates`.
- `template_builder.placeholders_registry`.
- `template_builder.render_jobs`.
- `template_builder.audit_events`.
- Other TemplateBuilder-era tables used by present-but-unmounted routers.

Impact:

- Prompt CRUD, inputs, blocks, versions, tests, run history, and audit can work with only the `prompt_builder` schema.
- `GET /v1/datasources` requires `eivs.datasources`.
- `POST /v1/datasources/test-sql` requires `eivs.datasources`.
- Datasource context bindings work best when datasource registry rows exist; otherwise some paths can fall back to `KASETTI_DS_URL`.
- `/v1/documents/*` routes require `template_builder` tables.
- Prompt-to-document flow requires a reachable TemplateBuilder API and valid document template information.

If you see `relation "eivs.datasources" does not exist` or `relation "template_builder.*" does not exist`, the stack is running, but that optional dependency/schema is missing.

## 14. Troubleshooting

### Docker pull fails

Symptom:

- Docker reports a Docker Hub authorization, 502, timeout, or image resolution issue.

Fix:

```powershell
docker pull postgres:15
docker compose up --build -d
```

If the issue is Docker Hub availability, wait and retry.

### Port already in use

Ports used by PromptBuilder:

- `5174` for frontend.
- `10002` for backend.
- `5434` for Kasetti datasource DB.

Fix:

- Stop the conflicting project.
- Or edit `PromptBuilder/backend/docker-compose.yml` port mappings before starting.

Container name conflicts can also happen because this Compose file uses generic names: `frontend`, `backend`, and `database`.

### Frontend opens but API calls fail

Check backend health:

```powershell
Invoke-WebRequest http://localhost:10002/healthz -UseBasicParsing
```

Check backend logs:

```powershell
cd PromptBuilder\backend
docker compose logs backend --tail=100
```

Common causes:

- Backend container is not running.
- Backend cannot connect to PostgreSQL.
- Frontend was run locally without `VITE_API_BASE=http://localhost:10002/v1`.
- Browser is hitting the Docker frontend but Nginx proxy cannot reach backend.

### Prompt execution fails with missing Cohere key

Symptom:

- Error mentions `COHERE_API_KEY is not set`.

Fix:

- Add a valid `COHERE_API_KEY` to `PromptBuilder/backend/.env`.
- Restart backend:

```powershell
cd PromptBuilder\backend
docker compose up -d --force-recreate backend
```

Alternative:

- Configure `LLM_ENDPOINT` to use a custom LLM microservice.

### Translate helper fails

Symptom:

- Error mentions `GOOGLE_TRANSLATE_KEY is not set` or Google API failure.

Fix:

- Add a valid `GOOGLE_TRANSLATE_KEY` to `PromptBuilder/backend/.env`.
- Make sure the Google Cloud project/API key has Translation API access enabled.
- Restart backend.

### Datasource list or SQL test fails

Symptom:

- Error mentions `eivs.datasources`.

Reason:

- The active datasource API reads from `eivs.datasources`, but this folder's migration does not create that schema/table.

Fix options:

- Run the module that owns `eivs.datasources` and point PromptBuilder to that database if that is the intended deployment.
- Create/import the datasource registry schema expected by the code.
- For context resolver fallback-only experiments, set `KASETTI_DS_URL`, but remember the UI datasource list still expects `eivs.datasources`.

### Document generation fails

Symptom:

- Error mentions `template_builder.templates`, `template_builder.render_jobs`, or TemplateBuilder connection failures.

Reason:

- Document endpoints depend on TemplateBuilder schema/API.

Fix options:

- Start TemplateBuilder and set `TEMPLATE_BUILDER_URL` correctly.
- Ensure the configured database contains the required `template_builder` tables and template records.
- On Linux Docker, replace `host.docker.internal` with a reachable host address or configure Docker host gateway support.

### Run History details do not fully load

Symptom:

- Run list appears, but detail fetch does not enrich data or traces are unavailable.

Reason:

- Frontend helper calls `/v1/prompt-runs/{run_id}` and `/v1/prompt-runs/{run_id}/trace`.
- Backend currently exposes `/v1/prompts/runs/{run_id}` and does not expose a mounted trace endpoint.

This is a known code mismatch documented in `README.md`.

### Clean DB has no prompts

This is expected after:

```powershell
docker compose down -v
```

The app migration recreates tables, not application prompt seed data.

### Compose comments look corrupted

The comments in `docker-compose.yml` contain corrupted line-drawing characters. Service definitions are still valid YAML and Docker Compose can run them. This is a source-file encoding/comment issue, not a runtime requirement.

## 15. Stop Commands

Stop containers but keep volumes:

```powershell
cd PromptBuilder\backend
docker compose down
```

Stop containers and remove volumes:

```powershell
cd PromptBuilder\backend
docker compose down -v
```

Remove only stopped containers/networks from this Compose project:

```powershell
docker compose down --remove-orphans
```

## 16. Git Safety Checklist

Before committing:

```powershell
git status --short
```

Make sure these are not staged:

- `PromptBuilder/backend/.env`
- `PromptBuilder/frontend/.env`
- `PromptBuilder/frontend/node_modules/`
- `PromptBuilder/frontend/dist/`
- Any database volume files
- Any generated result files containing user data

Expected committed documentation files for this runbook task:

- `PromptBuilder/README.md`
- `PromptBuilder/RUNBOOK.md`

## 17. Current Functional Confidence Checklist

Use this checklist after startup:

- Backend health responds on `http://localhost:10002/healthz`.
- Frontend loads on `http://localhost:5174`.
- Prompt list endpoint returns HTTP 200.
- A prompt can be created from the UI.
- Prompt Studio opens for the created prompt.
- Inputs can be saved.
- Blocks can be saved.
- Schema/guardrails can be saved.
- A prompt version can be published.
- Prompt run works when LLM credentials are valid.
- Run History lists prompt runs.
- Audit log lists prompt-related audit events.
- Datasource list works only if `eivs.datasources` exists.
- Document generation works only if TemplateBuilder dependencies exist.
