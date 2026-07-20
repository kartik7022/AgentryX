# Orchestration Runbook

This runbook explains how to start the Orchestration module locally in Docker and how to troubleshoot the setup. It is written for a developer who has only this folder and wants to reproduce the current local behavior.

## What This Module Starts

`docker compose up --build -d` starts:

- Postgres database on `localhost:5432`
- Mock adapter API on `localhost:8001`
- FastAPI backend on `localhost:8060`
- React/Nginx frontend on `localhost:3000`

The current stack does not require a login to use the UI because backend auth checks are disabled in code.

## Prerequisites

Install these before starting:

- Docker Desktop with Docker Compose v2
- Git, if cloning from GitHub
- PowerShell, for the commands below
- Node.js 20, only if running the frontend without Docker
- Python 3.11, only if running the backend without Docker

Required free ports:

- `3000`
- `8060`
- `8001`
- `5432`

If any of these ports are already used by FlowEngine, KillBill, DocAI, another Postgres, or another frontend, stop those services first or change the Compose ports.

## Required Configuration

Docker Compose already supplies the minimum configuration needed to boot:

- `DATABASE_URL`
- `POSTGRES_DSN`
- `JWT_SECRET`
- `JWT_ALG`
- `ADMIN_REQUIRED_ROLE`
- `SERVICE_NAME`
- `SERVICE_VERSION`
- `GROQ_MODEL`
- `EIVS_ADAPTER_BASE_URL`
- `SLACK_WEBHOOK_URL`
- `FRONTEND_URL`
- frontend build arg `VITE_API_URL`

Important secret handling:

- `docker-compose.yml` reads `GROQ_API_KEY` from the local environment with `${GROQ_API_KEY:-}`.
- Do not publish a real key in GitHub history.
- Keep real keys in an untracked local `.env`, shell environment, or secret manager.
- If `GROQ_API_KEY` is empty, the app still starts, but AI-backed routes and steps may fail or fall back depending on the route.

Optional integrations:

- `SLACK_WEBHOOK_URL`: enables Slack notification attempts for review flows.
- Prompt Builder service: the agent runtime can call a prompt service if configured through code/env, but it falls back when unavailable.
- External REST/GraphQL/webhook endpoints: only used when plans are configured to call them.

## First-Time Docker Start

Open PowerShell in the `orchestration` folder:

```powershell
cd C:\Users\karik\Desktop\Project\AgentryX\orchestration
docker compose up --build -d
```

Check containers:

```powershell
docker compose ps
```

Expected services:

- `orch_postgres`
- `orch_adapter`
- `orch_backend`
- `orch_frontend`

Open the app:

- UI: `http://localhost:3000`
- Backend health: `http://localhost:8060/health`
- Backend API docs: `http://localhost:8060/docs`
- Adapter health: `http://localhost:8001/health`

## Clean Start with Fresh Database Data

Use this when you want to wipe all local Orchestration database data and recreate the seeded demo domains:

```powershell
docker compose down -v
docker compose up --build -d
```

What happens on a clean start:

- The Postgres volume is deleted.
- `db-init/*.sql` runs again and recreates seeded demo schemas.
- The backend starts and runs `services/schema.sql`.
- Default orchestration datasources are recreated.

Use `down -v` carefully because it deletes local database state.

## Normal Restart Without Deleting Data

Use this when you only want to restart containers:

```powershell
docker compose down
docker compose up --build -d
```

This keeps the Postgres volume. The `db-init` scripts will not rerun, but backend schema migration/creation logic still runs on startup.

## Logs and Health Checks

Backend logs:

```powershell
docker compose logs -f backend
```

Frontend logs:

```powershell
docker compose logs -f frontend
```

Adapter logs:

```powershell
docker compose logs -f adapter
```

Postgres logs:

```powershell
docker compose logs -f db
```

Health check with PowerShell:

```powershell
Invoke-WebRequest -Uri http://localhost:8060/health -UseBasicParsing
Invoke-WebRequest -Uri http://localhost:8001/health -UseBasicParsing
```

## Basic Smoke Test

After the stack starts:

1. Open `http://localhost:3000`.
2. Open `Datasources` and confirm seeded datasources such as `CRM_DB`, `LOAN_CORE_DB`, `FIN_DB`, `HEALTH_DB`, `INSURANCE_DB`, and `MFG_DB` appear.
3. Open `Domain Packs` and confirm packs such as banking, insurance, healthcare, and ITSM appear.
4. Install a domain pack if no plans exist.
5. Open `Plans` and confirm plan rows are listed.
6. Open `Execute`, select a plan, and run it with the required parameters for that plan.
7. Open `History`, `Approvals`, `Evidence`, or `ITSM` depending on what the run produced.

Note: Plans that use AI steps need a valid Groq key. Plans that use mock adapter validation rely on the adapter service and seeded demo banking data.

## Running Backend Locally Without Docker

Use Docker or another local Postgres instance for the database first.

From `orchestration`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Set required environment variables:

```powershell
$env:DATABASE_URL="postgresql://orchestration:orchestration@localhost:5432/orchestration"
$env:POSTGRES_DSN=$env:DATABASE_URL
$env:EIVS_ADAPTER_BASE_URL="http://localhost:8001"
$env:JWT_SECRET="dev-orchestration-jwt-secret-change-in-production"
$env:JWT_ALG="HS256"
$env:ADMIN_REQUIRED_ROLE="orchestration_admin"
$env:GROQ_MODEL="llama-3.3-70b-versatile"
```

Optional:

```powershell
$env:GROQ_API_KEY="your-groq-key"
$env:SLACK_WEBHOOK_URL="your-slack-webhook"
```

Run the backend:

```powershell
uvicorn services.main:app --host 0.0.0.0 --port 8060 --reload
```

Backend startup runs `services/schema.sql`. If `DATABASE_URL` is missing, startup exits.

## Running the Mock Adapter Locally Without Docker

From `orchestration/mock_services`:

```powershell
pip install -r requirements.txt
$env:DATABASE_URL="postgresql://orchestration:orchestration@localhost:5432/orchestration"
uvicorn adapter_service:app --host 0.0.0.0 --port 8001 --reload
```

The Compose adapter runs inside Docker on port `8000` and maps it to host port `8001`. When running locally, using port `8001` keeps the same host URL.

## Running Frontend Locally Without Docker

From `orchestration/frontend`:

```powershell
npm install
$env:VITE_API_URL="http://localhost:8060"
npm run dev
```

Vite usually serves the UI at `http://localhost:5173`.

For a production-style frontend build:

```powershell
npm run build
npm run preview
```

## Test Commands

Backend tests:

```powershell
pytest services/tests
```

Frontend tests:

```powershell
cd frontend
npm test
```

Frontend build check:

```powershell
cd frontend
npm run build
```

Frontend lint:

```powershell
cd frontend
npm run lint
```

## Troubleshooting

### Docker cannot pull `postgres:16-alpine`

This can happen when Docker Hub returns a temporary `502 Bad Gateway` or auth token error.

Try:

```powershell
docker pull postgres:16-alpine
docker compose up --build -d
```

If it still fails, wait and retry because the error is usually remote registry availability.

### Port already in use

Check running containers:

```powershell
docker ps
```

Stop conflicting projects:

```powershell
docker compose down
```

Run that command from the folder of the project currently using the port.

### Backend exits immediately

Check logs:

```powershell
docker compose logs backend
```

Most likely causes:

- `DATABASE_URL` is missing when running outside Docker.
- Postgres is not healthy yet.
- Python dependency installation failed during image build.

### UI loads but data fails to fetch

Check:

- Backend is running at `http://localhost:8060/health`.
- Frontend was built with `VITE_API_URL=http://localhost:8060`.
- Browser dev tools network requests are going to port `8060`.
- No other backend is already occupying port `8060`.

### AI features fail

Check:

- `GROQ_API_KEY` is set and valid.
- The model in `GROQ_MODEL` is available for that key.
- Backend logs for Groq error messages.

Some routes fall back when Groq is unavailable. Some executor steps return failed results instead.

### Adapter validation returns empty results

The default adapter is a dev mock. It only handles narrow demo banking validation/search cases. Unknown rule codes return empty valid results.

Check seeded data exists by using a fresh volume:

```powershell
docker compose down -v
docker compose up --build -d
```

### Database seed data did not reset

`db-init/*.sql` only runs when the Postgres volume is created. To rerun it:

```powershell
docker compose down -v
docker compose up --build -d
```

### Frontend Docker build is slow

The root `.dockerignore` does not apply to the `frontend` Docker build context. Because there is no `frontend/.dockerignore`, local `frontend/node_modules` or `frontend/dist` may be sent to Docker during build.

This is current project behavior. A future cleanup can add `frontend/.dockerignore`.

### Execution detail says not found

The history list page reads backend executions, but the detail page currently reads browser localStorage history. If an execution exists only in the backend, the detail page can show missing data.

This is current frontend behavior.

### Plan version history looks local only

The frontend version-history page stores snapshots in browser localStorage. Backend version endpoints exist, but that page does not currently use them.

This is current frontend behavior.

## Stop Commands

Stop containers but keep data:

```powershell
docker compose down
```

Stop containers and delete local Orchestration data:

```powershell
docker compose down -v
```

## Current URLs

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8060`
- Backend docs: `http://localhost:8060/docs`
- Backend health: `http://localhost:8060/health`
- Adapter health: `http://localhost:8001/health`
- Postgres: `localhost:5432`
