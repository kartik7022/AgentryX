# PromptBuilder

PromptBuilder is the AgentryX module for creating, versioning, testing, running, and auditing reusable LLM prompts. It contains a standalone React frontend, a FastAPI backend, a PostgreSQL application database, and a separate demo datasource PostgreSQL database with Kasetti sample data. The module is intended to let users design prompt contracts, define runtime inputs, bind contextual data from datasources, run prompts through an LLM, validate outputs, keep run history, and bridge successful prompt output into document generation.

This README documents what the code in this folder does today. It does not describe planned behavior unless that planned behavior is present in comments or code. Secrets are intentionally not included.

## What This Module Does

PromptBuilder provides an AI prompt workspace with these core responsibilities:

- It stores prompt metadata, prompt blocks, inputs, context bindings, schemas, versions, test cases, run records, traces, evaluations, approvals, and audit events in the `prompt_builder` PostgreSQL schema.
- It exposes FastAPI endpoints under `/v1` for prompt CRUD, prompt execution, version publishing/rollback, regression-style test cases, audit logs, AI helper tools, datasources, and document generation bridge endpoints.
- It runs prompts through an orchestration layer that validates runtime input, resolves configured context, compiles prompt blocks into LLM-ready messages, calls the configured LLM path, parses and validates output, and persists run history.
- It serves a Vite/React frontend through Nginx in Docker. The frontend uses the same visual design system as the other updated AgentryX UIs but keeps PromptBuilder wording and behavior intact.
- It starts a separate Kasetti datasource PostgreSQL container with banking, finance, health, insurance, and manufacturing demo schemas for datasource-context examples.
- It contains several TemplateBuilder-era API files and renderer utilities. Some are still used by active document bridge endpoints, while others are present in the folder but are not mounted by the FastAPI application today.

## System Overview

### Modules/Features

Prompt catalog:

- Implemented in `frontend/src/pages/PromptsPage.tsx` and `backend/src/api/prompts.py`.
- Lets users list prompts, filter by status/industry/search text, create a new prompt, duplicate an existing prompt, archive a prompt, and open a prompt in Prompt Studio.
- Backend deletion is a soft archive: `DELETE /v1/prompts/{prompt_id}` sets `status = 'archived'`.
- Prompt list defaults to non-archived prompts unless a status filter is provided.
- Prompt creation stores prompt name, description, use case, industry, owner, default locale, supported locales, tags, and draft status.

Prompt Studio:

- Implemented in `frontend/src/pages/PromptStudioPage.tsx` and editor components under `frontend/src/components/prompts/`.
- Provides tabs for Overview, Inputs, Blocks, Context, Output, Guardrails, Run Console, and Versions.
- Loads prompt detail plus latest schema state.
- Tracks unsaved changes in each editable section and warns before navigating back if there are dirty changes.
- Saves blocks, inputs, context bindings, output schema, and guardrails through the prompt API.
- Allows publishing a version from the studio header.
- If the route `/prompts/studio` is opened without an ID, the UI shows a gateway/empty state asking the user to go to My Prompts.

Prompt blocks editor:

- Implemented in `frontend/src/components/prompts/PromptBlocksEditor.tsx`.
- Supports block types `system`, `role`, `task`, `instruction`, `business_rule`, `context`, `retrieval`, `tool_call`, `output_schema`, `example`, `fallback`, and `safety`.
- Lets users add blocks, edit block type/title/content, mark blocks required, reorder blocks, and delete blocks.
- Detects `{{variable}}` references in block content for UI hints.
- Backend saves blocks with replace-all semantics through `PUT /v1/prompts/{prompt_id}/blocks`: existing blocks are deleted and the submitted set is inserted in sequence order.

Prompt inputs editor:

- Implemented in `frontend/src/components/prompts/PromptInputsEditor.tsx`.
- Supports input types `string`, `number`, `boolean`, `date`, `datetime`, `json`, and `array`.
- Lets users configure input name, label, type, required flag, default value, description, validation JSON, sensitivity, and ordering.
- Client validates name format and duplicate names before save.
- Backend also validates duplicate names and stores the submitted input list with replace-all semantics.

Context bindings editor:

- Implemented in `frontend/src/components/prompts/PromptContextBindingsEditor.tsx`.
- The current UI focuses on datasource-backed bindings. It creates bindings with `source_type = 'datasource'` and fields for semantic entity, datasource ID, field list JSON, filter JSON, max records, required flag, and metadata.
- The backend schema also allows `runtime`, `static`, `semantic_model`, `document_template`, and `api`, but the current UI does not expose all of those as selectable source types.
- Backend saves context bindings with replace-all semantics through `PUT /v1/prompts/{prompt_id}/context-bindings`.

Output schema editor:

- Implemented in `frontend/src/components/prompts/PromptOutputSchemaEditor.tsx`.
- Lets users edit the output schema JSON, validate JSON syntax, and apply built-in schema templates.
- Saves schema data through `PUT /v1/prompts/{prompt_id}/schema`.
- Backend updates the latest draft version if one exists or creates a draft version when no version exists.

Guardrails editor:

- Implemented in `frontend/src/components/prompts/PromptGuardrailsEditor.tsx`.
- Lets users configure LLM behavior limits and safety rules stored inside `guardrails_json`.
- The UI exposes fields such as maximum tokens, temperature, retry count, safe mode, and topic restrictions.
- Code comments state that stop sequences were removed from the UI because they are not passed to the LLM.
- The orchestrator enforces safe mode and topic restrictions after the LLM response is returned.

Prompt versioning:

- Implemented in `backend/src/api/prompts.py` and `frontend/src/components/prompts/PromptVersionsPanel.tsx`.
- Users can create a version snapshot through the API, publish the latest draft or a selected version, and roll back to a previous version.
- Publishing deprecates any currently published version for the same prompt.
- If publish is requested without a version number and no draft version exists, the backend creates a snapshot from the current prompt configuration and publishes it.
- Rollback publishes an older version and deprecates the current published version. It errors if the requested version is already published.

Run console:

- Implemented twice in the UI: standalone page `frontend/src/pages/PromptRunConsolePage.tsx` and embedded studio component `frontend/src/components/prompts/PromptRunConsole.tsx`.
- Lets users select a prompt, choose latest or published version behavior, enter runtime inputs, and execute the prompt.
- Converts runtime values based on input type before sending them to the backend. Number, boolean, JSON, and array values are parsed client-side.
- Displays output, raw output, metadata, and special NOC/eligibility fields if the LLM response contains keys like `eligible`, `reason`, or `noc_text`.
- Uses `POST /v1/prompts/run`.

Prompt orchestration:

- Implemented in `backend/src/core/prompt_orchestrator.py`, `prompt_validation.py`, `prompt_context.py`, and `prompt_compiler.py`.
- Loads prompt metadata, selected version, inputs, blocks, context bindings, schema, and guardrails.
- Validates required runtime inputs and supported declared types.
- Resolves context bindings before prompt execution.
- Compiles prompt blocks, runtime inputs, resolved context, guardrails, and output schema into messages for the LLM.
- Calls the configured LLM path through `call_llm` from `backend/src/api/ai.py`.
- Parses JSON output unless the expected response format is text.
- Checks required output schema fields for JSON responses.
- Applies safe mode and topic restriction checks to raw LLM output.
- Persists run status, output, error details, metadata, latency, and trace steps.

Prompt test cases:

- Implemented in `frontend/src/pages/PromptTestCasesPage.tsx` and `backend/src/api/prompts.py`.
- Users can create, edit, delete, run one, and evaluate all test cases for a prompt.
- A test case stores runtime input JSON and expected checks JSON.
- Supported backend check types are `json_equals`, `json_path_exists`, `contains`, and `regex`.
- Unsupported check types fail the evaluation with an explicit unsupported-check reason.
- Evaluations are persisted to `prompt_builder.prompt_evaluations`.

Run history:

- Implemented in `frontend/src/pages/RunHistoryPage.tsx` and `backend/src/api/prompts.py`.
- Users can select a prompt, filter by run status, refresh, and inspect recent runs.
- Backend exposes `GET /v1/prompts/{prompt_id}/runs` and `GET /v1/prompts/runs/{run_id}`.
- The frontend run-detail helper currently calls `/v1/prompt-runs/{run_id}`, which does not match the mounted backend route. The page catches that failure and keeps the basic selected run data, so the list still works but the intended richer detail endpoint is mismatched.
- `frontend/src/api/prompts.ts` also defines `getPromptRunTrace` for `/v1/prompt-runs/{run_id}/trace`, but no matching mounted backend trace endpoint exists.

Audit log:

- Implemented in `frontend/src/pages/AuditLogPage.tsx` and `backend/src/api/audit.py`.
- Backend reads from `prompt_builder.audit_events`.
- Supports optional filters for entity type, action, actor, and limit.
- Frontend also applies a local search filter over event fields.
- Prompt APIs write audit events for create, update, archive, duplicate, block/input/binding/schema updates, version changes, tests, evaluations, prompt-to-document, and other operations.
- Several older TemplateBuilder-era files also contain audit writes to `template_builder.audit_events`; those files are not all mounted by the current FastAPI app.

AI helper tools:

- Implemented in `backend/src/api/ai.py`.
- `POST /v1/ai/tools` supports tool values `generate`, `polish`, `translate`, and `check`.
- Generate, polish, and check call an LLM.
- Translate calls Google Cloud Translation API v2 and protects `{{placeholder}}` tokens before translation.
- If `LLM_ENDPOINT` is set, LLM calls are routed to that custom microservice.
- If `LLM_ENDPOINT` is not set, the backend requires `COHERE_API_KEY` and calls Cohere chat completions using model `command-r-plus-08-2024`.

SQL generation helper:

- Implemented in `backend/src/api/ai.py`.
- `POST /v1/ai/generate-sql` looks up a datasource connection from `eivs.datasources`, sends prompt metadata to `LLM_WEBHOOK_URL`, expects SQL back, executes that SQL against the datasource, and returns SQL plus value or error.
- The request currently sends an empty datasource schema string to the webhook.
- SQL execution supports scalar, list, and table cardinality behavior through helper code.

Datasource integration:

- Implemented in `backend/src/api/datasources.py` and `backend/src/core/prompt_context.py`.
- `GET /v1/datasources` lists active datasource rows from `eivs.datasources`.
- `POST /v1/datasources/test-sql` executes caller-provided SQL against a datasource connection from `eivs.datasources`.
- Prompt context datasource bindings look up datasource URLs from `template_builder.datasources`, then `eivs.datasources`, then fall back to `KASETTI_DS_URL`.
- The PromptBuilder migration does not create the `eivs` schema or datasource registry. Those tables must already exist or be created by another module/setup step.

Document generation bridge:

- Implemented in `backend/src/api/documents.py` and `backend/src/api/prompts.py`.
- `POST /v1/prompts/{prompt_id}/generate-document` runs a prompt first, extracts or receives document template settings, then calls `TEMPLATE_BUILDER_URL/documents/generate`.
- `backend/src/api/documents.py` also mounts local document preview, generation, job status, download, jobs list, template list, and job delete endpoints under `/v1/documents`.
- These document endpoints read and write `template_builder.templates`, `template_builder.placeholders_registry`, `template_builder.render_jobs`, and `template_builder.audit_events`.
- The PromptBuilder migration does not create those `template_builder` tables. These routes require TemplateBuilder schema/data to exist in the configured database.

Renderer utilities:

- Implemented under `backend/src/core/renderers/`.
- HTML rendering builds styled HTML output from layout blocks and context.
- DOCX rendering uses `python-docx`.
- PDF rendering uses ReportLab and font setup installed in the Docker image.
- Markdown rendering emits Markdown text.
- XLSX rendering uses `openpyxl`.
- These renderers are used by document-related code paths, not by normal prompt CRUD.

Background worker:

- Implemented in `backend/src/worker.py`.
- Polls `template_builder.render_jobs`, marks queued jobs as running, resolves placeholders, renders outputs, writes success/error status, and records audit events.
- Uses environment settings such as `DATABASE_URL`, `RESULTS_DIR`, `MAX_CONCURRENT_RENDERS`, `POLL_INTERVAL_SEC`, and `PDF_CONCURRENCY`.
- The current Docker Compose file does not start this worker as a service. It is dormant unless manually run.
- Comments in the worker mention future/placeholder renderer behavior for some formats.

Kasetti demo datasource:

- Implemented through SQL files in `backend/kasetti-db/`.
- Docker Compose starts a second PostgreSQL service named `kasetti-db`.
- Seed scripts create demo schemas for banking, finance, health, insurance, and manufacturing scenarios.
- These schemas are useful for datasource-bound prompt context examples.
- The seed scripts drop and recreate their own demo schemas/tables when the datasource database volume is initialized.

Visual design system:

- Implemented in `frontend/src/index.css` and `frontend/src/styles/app-shell.css`.
- Uses a light theme with centralized CSS variables for backgrounds, surfaces, text, borders, primary/accent/status colors, radius, spacing, shadows, and font scales.
- Imports `DM Sans` and `IBM Plex Mono` from Google Fonts.
- The styling was aligned to the FlowEngine visual system, but PromptBuilder remains a standalone project with no shared code dependency on FlowEngine.

### Folder Structure Details

`PromptBuilder/backend/`:

- Contains the FastAPI backend, Docker Compose stack, backend Dockerfile, application database migration, and Kasetti datasource seed SQL.
- `Dockerfile` builds the backend image on Python 3.11 slim, installs system fonts, installs Python dependencies, copies `src/`, exposes port `8080`, and starts Uvicorn with `src.main:app`.
- `docker-compose.yml` starts frontend, backend, app PostgreSQL, and Kasetti datasource PostgreSQL.
- `requirements.txt` lists Python dependencies for API, async database access, HTTP calls, document rendering, parsing, and multipart uploads.
- `.env` is expected locally but is intentionally ignored by Git.

`PromptBuilder/backend/db/migrations/`:

- Contains `0001_prompt_builder.sql`.
- Creates the `prompt_builder` schema and app tables for prompts, versions, blocks, inputs, context bindings, test cases, runs, traces, evaluations, approvals, and audit events.
- Creates indexes for common status, use case, prompt, run status, and audit lookups.
- Does not create `eivs` or `template_builder` schemas.

`PromptBuilder/backend/kasetti-db/`:

- Contains SQL seed files mounted into the Kasetti datasource PostgreSQL container.
- `banking_domain.sql` creates `crm` and `loan_core` schemas with customer, address, loan product, loan, collateral, and payment data.
- `finance_domain.sql` creates `fin` schema with clients, GL accounts, FX rates, invoices, invoice lines, and payments.
- `health_domain.sql` creates `emr` schema with patients, encounters, diagnoses, medications, lab results, and billing.
- `insurance_domain.sql` creates `ins` schema with customers, policies, coverages, insured items, claims, claim events, and claim payments.
- `manufacturing_domain.sql` creates `mfg` schema with plants, work centers, materials, BOM headers/components, production orders/operations, and quality inspections.

`PromptBuilder/backend/src/`:

- Python source package for the backend.
- `main.py` creates the FastAPI app, configures CORS, creates the async SQLAlchemy engine, attaches it to `app.state.engine`, mounts active routers, and exposes root debug/health endpoints.
- `worker.py` contains the dormant asynchronous render job worker for `template_builder.render_jobs`.
- `__init__.py` marks the source package.

`PromptBuilder/backend/src/api/`:

- FastAPI route modules.
- Active routers mounted by `main.py`: `health.py`, `ai.py`, `documents.py`, `datasources.py`, `prompts.py`, and `audit.py`.
- Present but not mounted by `main.py`: `blocks.py`, `templates.py`, `placeholders.py`, `tests.py`, `marketplace.py`, `import_routes.py`, `import_template.py`, `render.py`, and `ui.py`.
- `ui.py` currently contains only `router = APIRouter()` and does not import `APIRouter`, so it is not a usable mounted route as-is.

`PromptBuilder/backend/src/core/`:

- Core business logic and helpers.
- `prompt_orchestrator.py` runs prompts end to end.
- `prompt_validation.py` validates runtime inputs.
- `prompt_context.py` resolves runtime/static/datasource context and returns deferred markers for unsupported source types.
- `prompt_compiler.py` compiles blocks/context/schema into LLM messages.
- `resolver.py` contains TemplateBuilder-style placeholder datasource resolution helpers.
- `models.py`, `audit.py`, and `versioning.py` contain SQLAlchemy model/helper code that still references TemplateBuilder-style schemas/tables in places.
- `renderers/` contains document output renderers.

`PromptBuilder/backend/src/adapter/`:

- Contains `datasource_adapter.py`, an adapter/model file that still references the `template_builder` schema and placeholder tables.

`PromptBuilder/frontend/`:

- Contains the standalone Vite React UI.
- `Dockerfile` builds the Vite app with Node 20 Alpine, then serves static files with Nginx and proxies `/api/` to the backend service.
- `package.json` defines scripts `dev`, `build`, `lint`, and `preview`.
- `vite.config.ts` sets the dev server port to `5174`.
- `index.html` is the Vite HTML entrypoint.
- `.env` is expected for local frontend API base configuration and is intentionally ignored by Git.

`PromptBuilder/frontend/src/`:

- `main.tsx` mounts React into the page.
- `App.tsx` defines routes and wraps pages with the application layout.
- `index.css` defines global design tokens and base styles.
- `styles/app-shell.css` defines shell/sidebar/page responsive styles.
- `api/` contains Axios client helpers and typed prompt/template API wrappers.
- `types/api.ts` defines TypeScript API types used across the frontend.
- `components/layout/` contains the application shell and sidebar.
- `components/prompts/` contains prompt editing and execution widgets.
- `components/shared/` contains reusable empty, error, loading, and status UI elements.
- `pages/` contains route-level screens for prompts, studio, run console, test cases, run history, and audit log.

### Tech Stack

Frontend:

- React `19.2.4` for UI rendering.
- React DOM `19.2.4` for browser mounting.
- React Router DOM `7.14.0` for client-side routing.
- Axios `1.14.0` for API requests.
- TypeScript `6.0.2` for static typing.
- Vite `8.0.4` for development server and production build.
- ESLint `9.39.4` with React hooks/refresh plugins for linting.
- Nginx Alpine for production static serving and API proxying inside Docker.
- CSS variables for centralized visual tokens.
- Google Fonts imports for `DM Sans` and `IBM Plex Mono`.

Backend:

- Python 3.11 slim base image.
- FastAPI `0.115.5` for HTTP APIs.
- Uvicorn `0.32.0` for ASGI serving.
- SQLAlchemy `2.0.36` async engine for application database access.
- asyncpg for async PostgreSQL connections.
- psycopg2-binary is installed but most active code uses asyncpg/SQLAlchemy async paths.
- Pydantic `2.9.0` for request/response models.
- python-dotenv for local environment loading.
- httpx for outbound HTTP calls to LLM, translation, webhook, and TemplateBuilder endpoints.
- loguru and Python logging for logs.
- redis is listed in requirements but no active Redis service is started by Compose, and no active Redis usage was found in the mounted API path.
- PyYAML, pdfplumber, BeautifulSoup, python-multipart, python-docx, ReportLab, and openpyxl support parsing/import/render/document-related code paths.
- anthropic is listed in requirements, but the active LLM code path currently uses custom `LLM_ENDPOINT` or Cohere.

Databases:

- PostgreSQL 15 for the PromptBuilder application database.
- PostgreSQL 15 for the Kasetti demo datasource database.
- App schema is `prompt_builder`.
- Demo datasource schemas include `crm`, `loan_core`, `fin`, `emr`, `ins`, and `mfg`.
- Some active routes expect `eivs` and `template_builder` schemas to exist, but those are not created by this folder's migration.

External services and integrations:

- Cohere chat API at `https://api.cohere.com/v2/chat` when `COHERE_API_KEY` is configured and `LLM_ENDPOINT` is empty.
- Google Cloud Translation API v2 at `https://translation.googleapis.com/language/translate/v2` when `GOOGLE_TRANSLATE_KEY` is configured.
- Optional custom LLM microservice through `LLM_ENDPOINT`.
- Optional SQL-generation webhook through `LLM_WEBHOOK_URL`.
- Optional TemplateBuilder service through `TEMPLATE_BUILDER_URL`.
- Optional datasource registry/data access through `eivs.datasources` and datasource connection strings.

Build and deployment tools:

- Docker Compose for local multi-container startup.
- Docker for backend/frontend/database containers.
- npm for frontend package install/build.
- pip for backend dependency install inside the backend image.
- PostgreSQL Docker entrypoint migrations for initializing the app and demo databases.

## Runtime Topology

The Docker Compose file lives in `PromptBuilder/backend/docker-compose.yml` and starts these services:

| Service | Container name | Purpose | Host port |
| --- | --- | --- | --- |
| `frontend` | `frontend` | Nginx-served React UI, proxies `/api/` to backend | `5174 -> 80` |
| `backend` | `backend` | FastAPI API service | `10002 -> 8080` |
| `db` | `database` | PromptBuilder app PostgreSQL database | internal only |
| `kasetti-db` | `kasetti-datasource-postgres-pb` | Demo datasource PostgreSQL database | `5434 -> 5432` |

The frontend Docker image builds with `VITE_API_BASE=/api/v1`, so browser requests go to the same origin as the UI and Nginx proxies `/api/` to `http://backend:8080/`.

When running frontend locally with `npm run dev`, `VITE_API_BASE` should usually point to `http://localhost:10002/v1`.

## Database Schema

`backend/db/migrations/0001_prompt_builder.sql` creates these app tables:

- `prompt_builder.prompts`: prompt metadata, status, owner, locale, tags, and timestamps.
- `prompt_builder.prompt_versions`: immutable-ish version snapshots, schema/guardrails, compiled prompt text, changelog, status, and published metadata.
- `prompt_builder.prompt_blocks`: ordered prompt building blocks.
- `prompt_builder.prompt_inputs`: runtime input definitions and validation metadata.
- `prompt_builder.prompt_context_bindings`: context binding definitions.
- `prompt_builder.prompt_test_cases`: saved test cases with input JSON and expected check JSON.
- `prompt_builder.prompt_runs`: prompt execution records.
- `prompt_builder.prompt_run_traces`: trace steps for runs.
- `prompt_builder.prompt_evaluations`: persisted test/evaluation results.
- `prompt_builder.prompt_approvals`: approval request records.
- `prompt_builder.audit_events`: audit trail events.

Known schema note:

- The SQL closing comment says the expected output is 10 rows, but the migration creates 11 tables because `audit_events` is included.

## Active Backend API Surface

The active mounted API surface is defined by routers included in `backend/src/main.py`.

### Health and Debug

| Method | Path | What it does |
| --- | --- | --- |
| `GET` | `/healthz` | Root service health. Returns service name `prompt-builder-api`. |
| `GET` | `/v1/healthz` | Versioned health endpoint. Returns service name `template-builder-api` in current code. |
| `GET` | `/_debug/routes` | Lists registered FastAPI routes. |

### Prompts

| Method | Path | What it does |
| --- | --- | --- |
| `POST` | `/v1/prompts` | Create a prompt as draft. |
| `GET` | `/v1/prompts` | List prompts with optional status, industry, use-case, search, limit, and offset filtering. |
| `GET` | `/v1/prompts/{prompt_id}` | Return prompt detail, including blocks, inputs, context bindings, and latest version. |
| `PUT` | `/v1/prompts/{prompt_id}` | Update prompt metadata. |
| `DELETE` | `/v1/prompts/{prompt_id}` | Archive a prompt by setting status to `archived`. |
| `POST` | `/v1/prompts/{prompt_id}/duplicate` | Clone prompt metadata, blocks, inputs, and context bindings into a new draft prompt. |
| `GET` | `/v1/prompts/{prompt_id}/blocks` | List blocks for a prompt. |
| `PUT` | `/v1/prompts/{prompt_id}/blocks` | Replace all blocks for a prompt. |
| `GET` | `/v1/prompts/{prompt_id}/inputs` | List input definitions. |
| `PUT` | `/v1/prompts/{prompt_id}/inputs` | Replace all input definitions. |
| `GET` | `/v1/prompts/{prompt_id}/context-bindings` | List context bindings. |
| `PUT` | `/v1/prompts/{prompt_id}/context-bindings` | Replace all context bindings. |
| `GET` | `/v1/prompts/{prompt_id}/schema` | Get current schema/guardrails state from latest draft or latest version. |
| `PUT` | `/v1/prompts/{prompt_id}/schema` | Save schema/guardrails to latest draft or create a draft version. |
| `POST` | `/v1/prompts/run` | Execute a prompt through the orchestrator. |
| `GET` | `/v1/prompts/{prompt_id}/versions` | List prompt versions. |
| `POST` | `/v1/prompts/{prompt_id}/versions` | Create a version snapshot. |
| `POST` | `/v1/prompts/{prompt_id}/publish` | Publish a draft or selected version. |
| `POST` | `/v1/prompts/{prompt_id}/rollback` | Publish a previous version and deprecate the current published version. |
| `GET` | `/v1/prompts/{prompt_id}/test-cases` | List saved test cases. |
| `POST` | `/v1/prompts/{prompt_id}/test-cases` | Create a test case. |
| `PUT` | `/v1/prompts/{prompt_id}/test-cases/{test_id}` | Update a test case. |
| `DELETE` | `/v1/prompts/{prompt_id}/test-cases/{test_id}` | Delete a test case. |
| `POST` | `/v1/prompts/{prompt_id}/test` | Run a saved or ad hoc prompt test case. |
| `POST` | `/v1/prompts/{prompt_id}/evaluate` | Run all saved test cases for a prompt. |
| `GET` | `/v1/prompts/{prompt_id}/evaluations` | List recent evaluation records. |
| `POST` | `/v1/prompts/{prompt_id}/generate-document` | Run prompt and call TemplateBuilder document generation. |
| `GET` | `/v1/prompts/{prompt_id}/runs` | List run history for a prompt. |
| `GET` | `/v1/prompts/runs/{run_id}` | Get one run by ID. |

### AI

| Method | Path | What it does |
| --- | --- | --- |
| `POST` | `/v1/ai/tools` | Run generate, polish, translate, or check helper tool. |
| `POST` | `/v1/ai/generate-sql` | Generate SQL through webhook and execute it against a datasource. |

### Datasources

| Method | Path | What it does |
| --- | --- | --- |
| `GET` | `/v1/datasources` | List active datasources from `eivs.datasources`. |
| `POST` | `/v1/datasources/test-sql` | Execute supplied SQL against a configured datasource and return scalar/list/table result. |

### Documents

| Method | Path | What it does |
| --- | --- | --- |
| `POST` | `/v1/documents/preview` | Render an HTML preview for a TemplateBuilder template. |
| `POST` | `/v1/documents/generate` | Create a render job, render a document output, and update job status. |
| `GET` | `/v1/documents/jobs/{job_id}` | Read render job status. |
| `GET` | `/v1/documents/jobs/{job_id}/download` | Download a generated output file. |
| `GET` | `/v1/documents/jobs` | List render jobs. |
| `GET` | `/v1/documents/{job_id}` | Alias for job status, excluded from generated schema. |
| `GET` | `/v1/documents/templates` | List document templates for the run console dropdown. |
| `DELETE` | `/v1/documents/jobs/{job_id}` | Delete a render job and its generated file if present. |

### Audit

| Method | Path | What it does |
| --- | --- | --- |
| `GET` | `/v1/audit/events` | List audit events with optional entity type, action, actor, and limit filters. |

## Present But Not Mounted Backend APIs

These route files exist but are not included in `backend/src/main.py` today:

- `api/blocks.py`: CRUD for `template_builder.blocks_library`.
- `api/templates.py`: Template CRUD, publish, revert, versions, placeholder binding, and template input discovery for `template_builder` tables.
- `api/placeholders.py`: Global placeholder registry CRUD for `template_builder.placeholders_registry`.
- `api/tests.py`: Template test cases for `template_builder.template_tests`.
- `api/marketplace.py`: Marketplace list/create/read/rate/import/delete functionality for templates, blocks, and placeholders.
- `api/import_routes.py` and `api/import_template.py`: Template import from file and URL.
- `api/render.py`: A simple `/generate` render endpoint.
- `api/ui.py`: Declares a router but does not import `APIRouter`, so it is incomplete as a standalone route module.

Because these routers are not mounted, their endpoints are not reachable in the running app unless `main.py` is changed.

## Frontend Routes

The React router in `frontend/src/App.tsx` defines:

| Path | Page |
| --- | --- |
| `/` | Redirects to `/prompts`. |
| `/prompts` | Prompt catalog. |
| `/prompts/studio` | Studio empty/gateway state. |
| `/prompts/studio/:id` | Prompt Studio for a selected prompt. |
| `/prompts/run` | Standalone Run Console. |
| `/prompts/test-cases` | Prompt Test Cases page. |
| `/prompts/run-history` | Run History page. |
| `/audit` | Audit Log page. |

The sidebar navigation includes My Prompts, Prompt Studio, Run Console, Test Cases, Run History, and Audit log.

## Authentication And Authorization

There is no real authentication or authorization layer in this module today.

- The frontend API client reads `tb_user_id` from `localStorage`.
- If no value exists, it sends `x-user-id: dev_user`.
- `frontend/src/components/layout/Sidebar.tsx` sets `tb_user_id` to `dev_user`.
- Backend audit logic uses the `x-user-id` request header or falls back to `dev_user`.
- No login, JWT validation, RBAC, tenant isolation, or permission checks were found in the mounted PromptBuilder API path.

## Environment Variables

Backend variables:

| Variable | Required for | Notes |
| --- | --- | --- |
| `DB_URL` | Docker Compose backend database connection | Compose maps this to `DATABASE_URL`. |
| `DATABASE_URL` | Backend runtime database connection | Read by `main.py` and `worker.py`; `postgresql://` is normalized to async driver form by `main.py`. |
| `API_HOST` | Compose environment | Set in Compose, but Docker CMD starts Uvicorn on `0.0.0.0`. |
| `API_PORT` | Compose environment | Set in Compose, but Docker CMD exposes/listens on `8080`; `main.py` only reads `PORT` when run directly as Python. |
| `PORT` | Direct Python execution | Used by `if __name__ == "__main__"` path in `main.py`, not by Docker CMD. |
| `KASETTI_DS_URL` | Datasource fallback | Used by context resolution and resolver helpers when datasource registry lookup is unavailable. |
| `COHERE_API_KEY` | LLM calls through Cohere | Required if `LLM_ENDPOINT` is not configured and LLM-backed actions are used. |
| `GOOGLE_TRANSLATE_KEY` | Translation helper | Required for `POST /v1/ai/tools` with `tool = translate`. |
| `LLM_ENDPOINT` | Optional custom LLM service | If set, `call_llm` sends prompts to this endpoint instead of Cohere. |
| `LLM_WEBHOOK_URL` | SQL generation and document AI placeholder resolution | Used by `/v1/ai/generate-sql` and document placeholder resolution. |
| `TEMPLATE_BUILDER_URL` | Prompt-to-document bridge | Defaults in Compose to `http://host.docker.internal:10001/v1`. |
| `RESULTS_DIR` | Document output files | Defaults to `/app/results`. |
| `MAX_CONCURRENT_RENDERS` | Worker only | Defaults to `3`; worker is not started by Compose. |
| `POLL_INTERVAL_SEC` | Worker only | Defaults to `5.0`; worker is not started by Compose. |
| `PDF_CONCURRENCY` | Worker only | Defaults to `2`; worker is not started by Compose. |
| `REDIS_URL` | Unclear/currently unused | Present in local env expectations, but no Redis Compose service or mounted-route usage was found. |

Frontend variables:

| Variable | Required for | Notes |
| --- | --- | --- |
| `VITE_API_BASE` | Frontend API base URL | Docker build defaults to `/api/v1`; local Vite dev should use `http://localhost:10002/v1`. |

## External Integrations

Cohere:

- Used by `backend/src/api/ai.py` when `LLM_ENDPOINT` is empty.
- Model hardcoded in active code as `command-r-plus-08-2024`.
- Requires `COHERE_API_KEY`.

Google Translate:

- Used by `backend/src/api/ai.py` for the translate helper.
- Requires `GOOGLE_TRANSLATE_KEY`.
- Protects `{{placeholder}}` tokens before sending text to Google.

Custom LLM service:

- Optional `LLM_ENDPOINT`.
- Receives JSON containing `prompt` and `system`.
- The code accepts response fields named `text`, `response`, or `output`.

SQL-generation webhook:

- Optional/defaulted `LLM_WEBHOOK_URL`.
- Receives a prompt and expected cardinality.
- Expected to return SQL.

TemplateBuilder:

- Optional/defaulted `TEMPLATE_BUILDER_URL`.
- Used by prompt-to-document flow.
- Local document endpoints also expect TemplateBuilder database tables to exist.

Datasource registry:

- Several active paths expect an `eivs.datasources` table with connection information.
- This table is not created by this folder's app migration.

## Known Incomplete, Stubbed, Hardcoded, Or Risky Behavior

- No real authentication or authorization exists. The current actor is effectively `dev_user`.
- CORS allows all origins, methods, and headers while also allowing credentials.
- `GET /v1/healthz` returns service name `template-builder-api`, while root `GET /healthz` returns `prompt-builder-api`.
- The active migration creates only `prompt_builder`; it does not create `eivs` or `template_builder` schemas required by some active routes.
- Document endpoints under `/v1/documents` depend on `template_builder.*` tables and may fail on a clean PromptBuilder-only database.
- Datasource endpoints depend on `eivs.datasources` and may fail on a clean PromptBuilder-only database.
- Prompt context datasource lookup can fall back to `KASETTI_DS_URL`, but UI datasource listing still depends on `eivs.datasources`.
- `prompt_context.py` logs context datasource debug information; depending on URL contents, connection details could appear in logs.
- `POST /v1/datasources/test-sql` executes caller-provided SQL against configured datasource connections. This should be treated as trusted/admin functionality unless additional controls are added.
- `POST /v1/ai/generate-sql` sends an empty datasource schema string to the webhook in current code.
- The frontend run-detail helper points to `/v1/prompt-runs/{run_id}`, but the backend route is `/v1/prompts/runs/{run_id}`.
- The frontend trace helper points to `/v1/prompt-runs/{run_id}/trace`, but no mounted backend trace endpoint exists.
- `backend/src/worker.py` is not started by Docker Compose.
- Several TemplateBuilder-era routers exist but are not mounted.
- `backend/src/api/ui.py` is incomplete because it uses `APIRouter` without importing it.
- `backend/src/core/models.py` contains a table name `placeholdersregistry` without the underscore used by other placeholder registry references.
- `backend/src/api/documents.py` can return a response with status `success` from `POST /v1/documents/generate` even when an internal render exception updated the database job status to `error`.
- `API_PORT` is set in Compose, but the backend Docker CMD runs Uvicorn on fixed port `8080`.
- `REDIS_URL` appears in local configuration but Redis is not part of Compose and no active Redis-backed mounted behavior was found.
- Docker Compose uses generic container names `frontend`, `backend`, and `database`, which can conflict with other local projects.
- Compose comments contain corrupted line-drawing characters. This appears to be a file-encoding/comment artifact, not a runtime behavior issue.
- Some source comments and UI strings contain Unicode/emoji or mojibake artifacts. They are part of the current code state.
- `host.docker.internal` in `TEMPLATE_BUILDER_URL` works on Docker Desktop but may require extra host-gateway configuration on some Linux setups.
- There is no backend automated test suite or test command in this folder. The frontend has build and lint scripts but no test script.

## Setup

### Prerequisites

- Docker Desktop or Docker Engine with Docker Compose v2.
- Node.js 20+ and npm if running the frontend outside Docker.
- Python 3.11+ if running the backend outside Docker.
- PostgreSQL client tools are optional but useful for debugging.
- Valid Cohere and Google Translate credentials are needed for the AI helper flows that call those services.
- Network access to external APIs is required for Cohere, Google Translate, custom LLM endpoints, and webhooks.

### Required Local Environment Files

Create `PromptBuilder/backend/.env` locally. Do not commit it.

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

Create `PromptBuilder/frontend/.env` only when running Vite locally.

```env
VITE_API_BASE=http://localhost:10002/v1
```

Docker frontend builds do not require `frontend/.env` because the frontend Dockerfile defaults `VITE_API_BASE` to `/api/v1`.

### Start With Docker

From the repository root:

```powershell
cd PromptBuilder\backend
docker compose up --build -d
```

Check services:

```powershell
docker compose ps
docker compose logs backend --tail=100
```

Open:

- Frontend UI: `http://localhost:5174`
- Backend health: `http://localhost:10002/healthz`
- Versioned health: `http://localhost:10002/v1/healthz`
- Debug routes: `http://localhost:10002/_debug/routes`

### Run Frontend Locally

```powershell
cd PromptBuilder\frontend
npm install
npm run dev
```

Use `VITE_API_BASE=http://localhost:10002/v1` in `frontend/.env` when the backend is running through Docker.

### Run Backend Locally

The Docker Compose path is the most reliable path because it starts PostgreSQL and Kasetti datasource containers. If running the backend directly, provide a reachable `DATABASE_URL` or `DB_URL`, install Python dependencies, and start Uvicorn:

```powershell
cd PromptBuilder\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:5432/prompt_builder"
uvicorn src.main:app --host 0.0.0.0 --port 8080
```

When running locally outside Docker, adjust `KASETTI_DS_URL` and any TemplateBuilder URLs so they point to reachable host/port values.

### Basic Smoke Checks

Health:

```powershell
Invoke-WebRequest http://localhost:10002/healthz -UseBasicParsing
```

Frontend:

```powershell
Invoke-WebRequest http://localhost:5174 -UseBasicParsing
```

Prompt list:

```powershell
Invoke-WebRequest http://localhost:10002/v1/prompts -UseBasicParsing
```

If prompt CRUD works but datasource/document features fail with missing relation errors, check whether the required `eivs` and/or `template_builder` schemas exist in the configured database. This folder's migration does not create them.
