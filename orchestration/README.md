# Orchestration

Orchestration is a standalone workflow orchestration service and UI. It lets an operator define multi-step plans, execute those plans against seeded/demo domain data, inspect execution history, manage datasources, install domain packs, route intent-driven work, run AI/agent-assisted steps, and handle human review approvals.

This README documents what the code does today. It does not describe an intended future state. Any mocked, incomplete, hardcoded, unclear, or partially wired behavior found in the current code is called out explicitly.

## System Overview

### Modules/Features

Orchestration is a standalone workflow orchestration project. It includes a FastAPI backend, a React/Vite operations UI, a Postgres database, seeded domain datasets, a development adapter service, orchestration runtimes, EIVS intent/validation logic, governance helpers, and an agent-task subsystem.

Core product features:

- Plan authoring: operators can create, edit, clone, import, deactivate, reactivate, inspect, and delete orchestration plans.
- Step-based workflow execution: plans contain ordered/dependency-aware steps with kind, datasource, action, input bindings, conditions, retries, timeout, dependencies, and enabled/disabled state.
- Runtime orchestration: the backend executes plans with dependency resolution, condition evaluation, max concurrency, error policy handling, step result aggregation, and step-level execution tracking.
- Legacy execution flow: `/v1/360` runs named entity-360 style plans and writes high-level execution history.
- New orchestration run flow: `/v1/orchestrations/run` creates execution rows, runs steps through `PlanOrchestrator`, records step rows, detects failed business statuses, and supports pause/resume around human review.
- Plan version endpoints: backend routes exist to save/list/restore plan versions, although the current frontend version UI stores snapshots in browser localStorage.
- Runtime contracts: the backend can return a plan runtime contract and an OpenAPI-style contract for a plan.
- Tenant policy and budget configuration: admin endpoints store tenant policy and budget records used by agent/runtime governance logic.
- Datasource catalog: admin UI/backend routes create, list, update, delete, and placeholder-test datasources used by SQL, REST, GraphQL, and agent lookup tools.
- Domain packs: built-in banking, insurance, healthcare, and ITSM domain packs create predefined plans and installation records.
- EIVS intent classification: executors and services classify email or generic requests, store intent runs, and apply intent policies.
- EIVS policy routing: routing logic chooses auto processing or manual review based on intent confidence, language policy, and multi-intent rules.
- EIVS validation: validation orchestrator and `intent_validate` executor run validation checks using adapter calls and agent tooling.
- Development adapter: mock adapter service supports email validation/search analysis against seeded banking demo data.
- Agent tasks: governed agent runtime executes model/tool loops with prompt contracts, tool allowlists, budgets, approvals, fallback policy, schema validation, and trace events.
- Agent tools: default tools include datasource lookup, adapter analyze, prompt run, document generate, human review, and webhook.
- Agent approvals: routes expose pending tool approvals and approve/reject state transitions.
- Human review: human review steps create approval rows, can pause an execution, and can resume or fail execution based on reviewer decision.
- ITSM tickets: backend creates/list/resolves local ITSM-style tickets and generates fake ServiceNow/Jira URLs for local workflows.
- Evidence: SQL/REST/AI executors can write evidence bundles and the UI can list evidence bundles from the evidence table.
- Audit narratives: backend can generate audit narratives through Groq when available or fallback text when unavailable.
- Governance utilities: redaction policy, ZKP validation, counterfactual audit, and knowledge synthesis routes exist, with mocked/in-memory/hardcoded behavior documented later.
- Knowledge graph lookup: entity lookup uses `orchestration.knowledge_graph_config` and seeded domain schemas to return entity data and relationships.
- Copilot design: AI Copilot can ask Groq for a plan JSON or fall back to keyword-generated plans.
- Copilot lint/optimize: safety lint and optimization routes provide heuristic analysis of plan JSON.
- Operations UI: React UI exposes dashboard, plans, plan designer/import/history/canvas/canary, execution, history, admin console, datasources, domain packs, evidence, approvals, billing, copilot, ITSM, and knowledge pages.
- Mock LLM/evidence services: optional FastAPI mock services exist in `mock_services`, but the Compose file only starts the adapter service by default.

### Folder Structure Details

Top-level folder:

- `.dockerignore`: excludes Python caches, virtual environments, Git metadata, logs, SQLite files, and root `node_modules` from the backend Docker build context.
- `.env.example`: sanitized local environment template for Groq.
- `Dockerfile`: backend image based on Python 3.11 slim; installs Python dependencies, copies the app, exposes `8060`, and runs Uvicorn.
- `docker-compose.yml`: local Orchestration stack for Postgres, mock adapter, FastAPI backend, and React/Nginx frontend.
- `package-lock.json`: root npm lockfile artifact, not used by the backend runtime.
- `requirements.txt`: backend Python dependencies.
- `README.md`: this documentation file.
- `RUNBOOK.md`: standalone local setup and troubleshooting guide.
- `__init__.py`: empty Python package marker at root.
- `db-init/`: Postgres first-volume seed scripts for demo business domains.
- `docs/`: architecture notes and ADRs.
- `frontend/`: React/Vite UI source and frontend Dockerfile.
- `mock_services/`: development adapter, evidence, and LLM mock FastAPI services.
- `services/`: main FastAPI backend, orchestration runtime, repositories, schema, EIVS services, executors, agent subsystem, and tests.

Database seed structure:

- `db-init/banking_domain.sql`: creates and seeds `crm` and `loan_core` domain schemas.
- `db-init/finance_domain.sql`: creates and seeds `fin` client, GL, invoice, payment, and FX demo data.
- `db-init/health_domain.sql`: creates and seeds `emr` patient, encounter, diagnosis, medication, lab, and billing demo data.
- `db-init/insurance_domain.sql`: creates and seeds `ins` customer, policy, coverage, claim, event, and payment demo data.
- `db-init/manufacturing_domain.sql`: creates and seeds `mfg` plant, work center, material, BOM, production, operation, and quality inspection demo data.

Backend structure:

- `services/main.py`: FastAPI app, CORS, schema startup, demo auth routes, plan/admin routes, execution routes, governance routes, domain pack routes, approvals, runtime contracts, mappings, and agent endpoints.
- `services/config.py`: backend settings, environment validation, JWT/Groq/service metadata config.
- `services/db.py`: psycopg2 connection pool, schema execution, transaction dependency, and helper query functions.
- `services/schema.sql`: main schema creation, indexes, migrations, default datasource seeds, knowledge graph config, EIVS tables, agent tables, human review tables, and ITSM tables.
- `services/schemas.py`: Pydantic request/response schemas for plans, execution, datasources, tenants, auth, approvals, mappings, and runtime models.
- `services/security.py`: current default admin auth context; auth enforcement is effectively disabled.
- `services/logging_middleware.py`: request logging middleware.
- `services/orchestrator.py`: `PlanOrchestrator` runtime and step scheduling.
- `services/expression.py`: binding and condition expression evaluation helpers.
- `services/plan_repository.py`: plan CRUD, versioning-related helpers, activation/deactivation, clone, and plan lookup.
- `services/execution_steps_repository.py`: execution-step row creation/update/list helpers.
- `services/intent_plan_mappings_repository.py`: CRUD helpers for intent-to-plan mappings.
- `services/domain_pack_plans.py`: code-defined domain pack plan templates.
- `services/notifications.py`: Slack/ITSM notification helpers and local ticket persistence.
- `services/models/runtime_context.py`: runtime context models.

Executors structure:

- `services/executors/registry.py`: default step-kind registry.
- `services/executors/step_executor.py`: base execution result abstractions.
- `services/executors/base.py`: shared executor base.
- `services/executors/sql_executor.py`: direct SQL datasource executor and evidence writer.
- `services/executors/rest_executor.py`: REST datasource/full-URL executor and evidence writer.
- `services/executors/graphql_executor.py`: GraphQL executor with full-URL path and currently fragile mock fallback path.
- `services/executors/ai_transform_executor.py`: Groq-backed JSON transform executor.
- `services/executors/prompt_run_executor.py`: prompt template rendering and Groq execution.
- `services/executors/document_generate_executor.py`: in-code template rendering to inline content preview.
- `services/executors/human_review_executor.py`: human review approval and notification executor.
- `services/executors/webhook_executor.py`: outbound webhook executor.
- `services/executors/agent_task_executor.py`: governed agent runtime step executor.
- `services/executors/eivs_intent_classify.py`: EIVS classification executor.
- `services/executors/eivs_policy_route.py`: EIVS policy route executor.
- `services/executors/eivs_intent_validate.py`: EIVS validation executor using agent runtime.
- `services/executors/eivs_adapter_analyze.py`: EIVS adapter analysis executor.
- `services/executors/*_adapter.py`: wrappers that adapt older executor behavior to the step-executor interface.

EIVS structure:

- `services/eivs/config.py`: EIVS settings with `EIVS_` environment prefix.
- `services/eivs/db.py`: SQLAlchemy database/session setup for EIVS models.
- `services/eivs/models.py`: SQLAlchemy models for intents, policies, runs, prompts, datasources, configs, rules, and validation runs.
- `services/eivs/models_runtime/intent_request.py`: runtime request models for intent classification.
- `services/eivs/intent_service.py`: classification, routing, confidence handling, policy matching, and run persistence.
- `services/eivs/validation_orchestrator.py`: validation rule loading, adapter calls, LLM verdict handling, and validation-run persistence.
- `services/eivs/adapter_client.py`: HTTP client for adapter analysis routes.
- `services/eivs/chart_llm_client.py`: LLM client that logs prompts and token metadata.

Agent structure:

- `services/agent/agent_contract.py`: Pydantic contract models and validation rules for agent tasks.
- `services/agent/agent_budget.py`: runtime budget counters and enforcement.
- `services/agent/agent_approval.py`: approval policy decisions and approval row helpers.
- `services/agent/agent_runtime.py`: model/tool loop, prompt resolution, Groq calls, trace logging, fallback behavior, and final validation.
- `services/agent/agent_tools.py`: default agent tools and tool input/output behavior.
- `services/agent/agent_output_validation.py`: output schema and evaluation-suite validation.
- `services/agent/prompt_contract_client.py`: internal template and optional Prompt Builder contract resolution.

Frontend structure:

- `frontend/package.json`: React/Vite/TypeScript package metadata and scripts.
- `frontend/Dockerfile`: multi-stage frontend build and Nginx SPA serving config.
- `frontend/vite.config.ts`: Vite and Vitest configuration.
- `frontend/index.html`: Vite HTML entry point.
- `frontend/src/main.tsx`: React root bootstrap.
- `frontend/src/App.tsx`: route definitions.
- `frontend/src/index.css`: global design system, layout, cards, tables, forms, buttons, skeletons, responsive behavior, and FlowEngine-aligned tokens.
- `frontend/src/App.css`: additional legacy/default app CSS artifact.
- `frontend/src/assets/`: static image/SVG assets.
- `frontend/src/components/layout/`: application shell/sidebar/navigation layout.
- `frontend/src/components/auth/`: pass-through protected route component.
- `frontend/src/components/ui/`: shared UI primitives, states, modals, badges, cards, code blocks, and skeletons.
- `frontend/src/components/AgentTracePanel.tsx`: agent trace and approval inspection panel.
- `frontend/src/components/AgentTaskInspector.tsx`: agent task configuration/inspection component.
- `frontend/src/context/AuthContext.tsx`: inert auth provider matching current open-auth behavior.
- `frontend/src/services/api.ts`: main browser API client for backend routes.
- `frontend/src/services/auth.ts`: localStorage auth helper, not wired into route protection.
- `frontend/src/services/history.ts`: browser localStorage execution history helper used by some pages.
- `frontend/src/pages/`: dashboard, plans, execution, history, admin, datasources, packs, evidence, approvals, billing, copilot, ITSM, knowledge, and not-found pages.
- `frontend/src/setupTests.ts`: frontend test setup.
- `frontend/src/types/`: shared TypeScript API/runtime types.

Mock service structure:

- `mock_services/Dockerfile`: image capable of running mock service modules; Compose overrides command to run adapter.
- `mock_services/adapter_service.py`: development mock adapter for email validation/search.
- `mock_services/evidence_service.py`: optional evidence service with DB or in-memory fallback, not started by default Compose.
- `mock_services/llm_service.py`: optional Groq/mock LLM service, not started by default Compose.
- `mock_services/requirements.txt`: mock service Python dependencies.

Test structure:

- `services/tests/`: backend unit/integration tests for agent contracts, budgets, approvals, executor registry, agent task integration, EIVS classify executor, and loan NOC E2E behavior.
- `frontend/src/pages/**/__tests__/`: frontend page tests for edit-plan and execution-monitor behavior.

### Tech Stack

Frontend:

- React 19.
- React DOM 19.
- React Router 7.
- TypeScript 6.
- Vite 8.
- Vitest with jsdom.
- Lucide React icons.
- CSS variables and global CSS tokens.
- Nginx for serving the built SPA in Docker.

Backend:

- Python 3.11.
- FastAPI.
- Uvicorn with standard extras.
- Pydantic 2.
- Pydantic Settings.
- psycopg2-binary and raw SQL helpers.
- SQLAlchemy for EIVS models/sessions.
- python-jose for demo JWT auth endpoints.
- httpx for HTTP calls.
- prometheus-client for runtime metrics.
- asteval for condition expression evaluation.
- jsonschema for schema/output validation.
- python-multipart for request/form support.

Databases, queues, and local storage:

- PostgreSQL 16 Alpine in Docker.
- Postgres schemas: `orchestration`, `eivs`, seeded domain schemas, and evidence schema created by executors when needed.
- Redis is not part of the current Orchestration Compose stack.
- Browser localStorage is used by the frontend for some history/version/auth helper behavior.

AI, integrations, and external services:

- Groq OpenAI-compatible chat completions API for Copilot, audit narrative, agent runtime, prompt run, AI transform, and EIVS LLM paths where configured.
- Mock adapter service for EIVS email validation/search.
- Optional Slack webhook for notifications.
- Fake/local ITSM ticket URLs for ServiceNow/Jira-style flows.
- Optional Prompt Builder service lookup from the agent runtime.
- External REST, GraphQL, and webhook endpoints can be called by plan steps when configured.

Build and operations:

- Docker and Docker Compose v2.
- npm/package-lock for frontend dependencies.
- pip/requirements.txt for backend dependencies.
- pytest for backend tests.
- ESLint for frontend linting.
- Tailwind config file exists, though styling is primarily CSS-variable/global-CSS based.

## Analysis Scope

The Orchestration folder was reviewed as a standalone module. The reviewed project-owned areas are:

- `docker-compose.yml`, `Dockerfile`, `.dockerignore`, root Python and npm metadata.
- `services/`: FastAPI backend, orchestration runtime, executors, EIVS integration, agent runtime, database schema, repositories, tests, and settings.
- `frontend/`: React/Vite UI source, routes, API client, shared components, local browser storage helpers, tests, and Dockerfile.
- `mock_services/`: development adapter, evidence, and LLM mock services.
- `db-init/`: Postgres domain seed SQL scripts.
- `docs/adr/`: existing architectural decision record.

Generated or dependency artifacts are present and were not treated as source-of-truth behavior:

- `frontend/node_modules/`
- `frontend/dist/`
- `__pycache__/` and `.pyc` files
- `.git/`
- `.agents/`

A local `archestration.txt` artifact may exist in some workspaces as a large concatenated dump of project content. It is not imported or executed by the application, is ignored by Git, and should not be used as source-of-truth behavior.

## Runtime Topology

The Docker Compose stack starts four services:

| Service | Container | Purpose | Ports |
| --- | --- | --- | --- |
| `db` | `orch_postgres` | Postgres 16 database for orchestration, EIVS tables, evidence data, and seeded demo domains. | `5434:5432` |
| `adapter` | `orch_adapter` | Development mock adapter used by EIVS validation/search executors. | `8101:8000` |
| `backend` | `orch_backend` | FastAPI orchestration API and runtime. | `8060:8060` |
| `frontend` | `orch_frontend` | React UI served by Nginx. | `3100:80` |

The backend runs `uvicorn services.main:app --host 0.0.0.0 --port 8060`.

The frontend is built with Vite and served by Nginx. Its Docker build receives `VITE_API_URL=http://localhost:8060`, so browser API calls go directly to the backend on port `8060`. Nginx also includes an `/api/` proxy to `http://backend:8060/`, but the current frontend API client does not use `/api`.

## Configuration

Backend settings are defined in `services/config.py`.

| Variable | Required | Current/default behavior |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Required by backend startup. Compose sets `postgresql://orchestration:orchestration@db:5432/orchestration`. |
| `POSTGRES_DSN` | No | Used by EIVS when present. Compose sets the same database as `DATABASE_URL`. |
| `GROQ_API_KEY` | Required for real AI calls | Empty by default in code. Compose reads it from the local environment with `${GROQ_API_KEY:-}`. Keep real keys in an ignored local `.env` or shell environment. |
| `GROQ_MODEL` | No | Defaults to `llama-3.3-70b-versatile`. |
| `JWT_SECRET` / `TENANT_JWT_SECRET` | No for current runtime | Used only by demo auth endpoints. Defaults to a development secret if absent. Current API authorization does not enforce it. |
| `JWT_ALG` / `TENANT_JWT_ALG` | No | Defaults to `HS256`. |
| `ADMIN_REQUIRED_ROLE` | No | Defaults to `orchestration_admin`. Current authorization checks return a default admin context, so this is not enforced. |
| `SERVICE_NAME` | No | Defaults to `orchestration-service`. |
| `SERVICE_VERSION` | No | Defaults to `1.0.0`. |
| `SLACK_WEBHOOK_URL` | No | Empty in Compose. Slack notifications are skipped when empty. |
| `FRONTEND_URL` | No | Compose sets `http://localhost:3100`. |

EIVS settings are defined in `services/eivs/config.py` and use the `EIVS_` environment prefix.

| Variable | Required | Current/default behavior |
| --- | --- | --- |
| `EIVS_ADAPTER_BASE_URL` | No | Compose sets `http://adapter:8000`. Defaults to `http://adapter:8000`. |
| `EIVS_LLM_PRIMARY_BACKEND_TYPE` | No | Defaults to `openai-compatible`. |
| `EIVS_LLM_PRIMARY_BASE_URL` | No | Optional. |
| `EIVS_LLM_PRIMARY_API_KEY` | No | Optional. |
| `EIVS_LLM_PRIMARY_MODEL` | No | Optional. |
| `EIVS_LLM_PRIMARY_TIMEOUT_SECONDS` | No | Defaults to `60`. |
| `EIVS_LLM_SECONDARY_*` | No | Optional secondary LLM settings. |

Frontend settings:

| Variable | Required | Current/default behavior |
| --- | --- | --- |
| `VITE_API_URL` | No | Defaults in code to `http://localhost:8060`. Compose build passes the same value. |

## Authentication and Authorization

The current backend API is effectively open.

`services/security.py` explicitly returns a default admin `AuthContext` and states that auth is removed. `get_auth_context()` and `require_admin()` both return the same default context:

- subject: `system`
- role: `orchestration_admin`
- roles: `["orchestration_admin"]`
- tenant_id: `global`

`services/main.py` still exposes demo auth endpoints:

- `POST /auth/login`
- `POST /auth/refresh`
- `GET /auth/me`

Those endpoints use in-code demo users:

- `admin` / `admin123`
- `viewer` / `viewer123`

However, the frontend does not require login, does not attach JWTs to API calls, and `ProtectedRoute` simply renders children. `frontend/src/context/AuthContext.tsx` is also inert and returns no logged-in user. Therefore, role-based protection is not active in the current application.

## Database and Seed Data

The backend initializes its own schema at startup by running `services/schema.sql` through `services/db.py`.

Primary schemas:

- `orchestration`
- `eivs`

Primary orchestration tables:

- `orchestration.plans`
- `orchestration.plan_steps`
- `orchestration.plan_versions`
- `orchestration.executions`
- `orchestration.execution_steps`
- `orchestration.tenant_policies`
- `orchestration.tenant_budgets`
- `orchestration.datasources`
- `orchestration.users`
- `orchestration.domain_pack_installations`
- `orchestration.knowledge_graph_config`
- `orchestration.intent_plan_mappings`
- `orchestration.agent_task_runs`
- `orchestration.agent_task_trace_events`
- `orchestration.agent_task_approvals`
- `orchestration.human_review_approvals`
- `orchestration.itsm_tickets`

Primary EIVS tables:

- `eivs.intents`
- `eivs.intent_policies`
- `eivs.email_intent_runs`
- `eivs.llm_prompts`
- `eivs.datasources`
- `eivs.datasource_configs`
- `eivs.validation_rules`
- `eivs.validation_runs`

`services/schema.sql` seeds default orchestration datasources:

- `CRM_DB`
- `LOAN_CORE_DB`
- `FIN_DB`
- `HEALTH_DB`
- `INSURANCE_DB`
- `MFG_DB`

These point at the Compose Postgres database with username/password `orchestration`.

`db-init/` contains first-volume Postgres initialization scripts:

- `banking_domain.sql`
- `finance_domain.sql`
- `health_domain.sql`
- `insurance_domain.sql`
- `manufacturing_domain.sql`

Those scripts create demo domain schemas and tables such as `crm`, `loan_core`, `fin`, `emr`, `ins`, and `mfg`. They only run when the Postgres data volume is created for the first time. If the database volume already exists, Docker will not rerun `db-init`; use `docker compose down -v` when a full reseed is needed.

## Backend API Surface

### Health, Metrics, and Auth

- `GET /health`
- `GET /metrics`
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /auth/me`

### Plan Administration

- `POST /admin/plans`
- `GET /admin/plans`
- `GET /admin/plans/{plan_id}`
- `PUT /admin/plans/{plan_id}`
- `DELETE /admin/plans/{plan_id}`
- `PATCH /admin/plans/{plan_id}/deactivate`
- `PATCH /admin/plans/{plan_id}/activate`
- `POST /admin/plans/{plan_id}/clone`

Plan data is stored in `orchestration.plans` and `orchestration.plan_steps`. Updates replace step rows when step data is supplied and increment the plan version.

### Plan Version API

- `GET /admin/plans/{plan_id}/versions`
- `POST /admin/plans/{plan_id}/versions`
- `POST /admin/plans/{plan_id}/versions/{version}/restore`

The backend has version endpoints. The current frontend plan-version page stores snapshots in browser `localStorage` instead of using these backend endpoints.

### Execution and Runtime

- `POST /v1/360`
- `GET /v1/executions`
- `GET /v1/executions/{execution_id}`
- `DELETE /v1/executions/{execution_id}`
- `POST /v1/orchestrations/run`
- `GET /v1/orchestrations/runs`
- `GET /v1/orchestrations/runs/{execution_id}`
- `GET /v1/orchestrations/runs/{execution_id}/steps`
- `GET /v1/runtime/contracts/{plan_name}`
- `GET /v1/runtime/contracts/{plan_name}/openapi`

`POST /v1/360` is the legacy execution endpoint. It runs a named plan and writes a high-level execution record.

`POST /v1/orchestrations/run` is the newer runtime endpoint. It writes execution rows, runs through `PlanOrchestrator`, tracks step-level rows, detects business-level failed statuses returned by steps, and can pause for human review.

### Tenant Policy and Budget

- `GET /admin/tenants`
- `GET /admin/tenants/{tenant_id}/policy`
- `POST /admin/tenants/{tenant_id}/policy`
- `GET /admin/tenants/{tenant_id}/budget`
- `POST /admin/tenants/{tenant_id}/budget`

Tenant policy and budget data is stored in `orchestration.tenant_policies` and `orchestration.tenant_budgets`.

### Datasources

- `GET /admin/datasources`
- `POST /admin/datasources`
- `GET /admin/datasources/{datasource_id}`
- `PUT /admin/datasources/{datasource_id}`
- `DELETE /admin/datasources/{datasource_id}`
- `POST /admin/datasources/{datasource_id}/test`

The datasource test endpoint is a placeholder. It returns a success-shaped response saying real connection testing is available in a later phase; it does not actually validate a database/network connection.

### ITSM

- `POST /v1/itsm/tickets`
- `GET /v1/itsm/tickets`
- `GET /v1/itsm/tickets/{ticket_id}`
- `POST /v1/itsm/tickets/{ticket_id}/resolve`

ITSM tickets are persisted in `orchestration.itsm_tickets`. ServiceNow/Jira URLs are generated as fake example URLs. `GET /v1/itsm/tickets/{ticket_id}` can auto-resolve older open tickets after a short timeout window, which is current code behavior and should be treated carefully in real approval workflows.

### Copilot

- `POST /v1/copilot/design`
- `POST /v1/copilot/safety-lint`
- `POST /v1/copilot/optimize`

Copilot design uses Groq when a key is available. If Groq is unavailable or fails, the route falls back to rule-based keyword matching. Safety lint and optimize are heuristic/rule-based checks.

### Evidence, Audit, Redaction, and Governance

- `GET /v1/evidence/bundles`
- `POST /v1/audit/narrative`
- `POST /v1/audit/counterfactual`
- `POST /v1/zkp/validate`
- `POST /v1/redaction/policy`
- `GET /v1/redaction/policies`

Evidence bundles are read from `evidence.bundles` if available. Direct evidence writes in some executors create the `evidence` schema/table themselves if needed.

Redaction policies are stored in an in-memory dictionary, so they are lost on process restart.

ZKP validation is mock logic. Counterfactual generation is mostly rule-based/sample logic.

### Knowledge Graph

- `GET /v1/knowledge/entity-types`
- `GET /v1/knowledge/entities/{entity_type}/{entity_id}`
- `POST /v1/knowledge/synthesize`

Entity lookup is driven by `orchestration.knowledge_graph_config` and dynamic SQL. Knowledge synthesis uses a hardcoded mapping dictionary and does not call a real schema-matching service.

### Domain Packs

- `GET /admin/domain-packs`
- `POST /admin/domain-packs/{pack_id}/install`
- `DELETE /admin/domain-packs/{pack_id}/uninstall`

Domain packs are code-defined in `services/main.py` and plan templates are in `services/domain_pack_plans.py`.

Available packs:

- `banking_collections`
- `insurance_claims`
- `healthcare_lab`
- `itsm_incident`

Installing a domain pack inserts an installation row and creates predefined plans, skipping plan names that already exist. Uninstalling removes the installation row. Current code does not delete or deactivate the plans created during install.

### Human Review

- `GET /v1/human-review-approvals`
- `GET /v1/human-review-approvals/{approval_id}`
- `POST /v1/human-review-approvals/{approval_id}/approve`
- `POST /v1/human-review-approvals/{approval_id}/reject`

Human review approvals can pause an orchestration run. Approval patches the paused step result and resumes the plan with prior completed step results. Rejection marks the execution as failed and resolves the related ITSM ticket when present.

### Intent to Plan Mapping

- `POST /admin/intent-plan-mappings`
- `GET /admin/intent-plan-mappings`
- `GET /admin/intent-plan-mappings/{mapping_id}`
- `PUT /admin/intent-plan-mappings/{mapping_id}`
- `DELETE /admin/intent-plan-mappings/{mapping_id}`
- `GET /v1/intents/{intent_code}/plan`

Mappings choose a plan for an intent based on tenant, channel, locale, rank, and active status.

### Agent Tasks and Agent Approvals

- `GET /v1/agent-task-runs/{agent_run_id}`
- `GET /v1/agent-task-runs/{agent_run_id}/trace`
- `GET /v1/orchestrations/runs/{execution_id}/agent-tasks`
- `GET /v1/agent-approvals`
- `POST /v1/agent-approvals/{approval_id}/approve`
- `POST /v1/agent-approvals/{approval_id}/reject`

Agent trace redaction is coded for non-admin users, but because auth currently always returns admin, trace responses are effectively unredacted in normal current usage.

Approving an agent action updates the approval row. The current code does not visibly resume a pending agent tool execution from that approval route; this should be verified before treating agent approvals as a complete production loop.

## Orchestration Runtime

`services/orchestrator.py` contains `PlanOrchestrator`.

Current runtime behavior:

- Loads plan steps from the plan repository.
- Skips disabled steps.
- Resolves dependencies by `depends_on`.
- Evaluates optional conditions with `services/expression.py`.
- Runs eligible steps with a `ThreadPoolExecutor`.
- Supports `max_concurrency`.
- Supports error policies such as `best_effort`, `fail_fast`, and dependent failure behavior.
- Records Prometheus counters/histograms.
- Creates and updates `orchestration.execution_steps` when a database connection and execution id are supplied.
- Pauses when a `human_review` step returns `pending_human_review`.
- Supports resume by seeding prior completed results.

Expression evaluation supports dotted paths, simple fallbacks, and condition evaluation through `asteval`. Condition errors return false.

## Step Executors

The executor registry supports these step kinds:

- `sql`
- `rest`
- `graphql`
- `ai_transform`
- `intent_classify`
- `policy_route`
- `intent_validate`
- `adapter_analyze`
- `prompt_run`
- `document_generate`
- `human_review`
- `webhook`
- `agent_task`

Executor behavior:

- `sql`: Reads datasource settings from `orchestration.datasources`, connects with psycopg2, executes SQL with named parameters, fetches rows, and writes evidence. It requires a datasource with a host. It defaults an empty datasource password to `orchestration`.
- `rest`: Calls a REST endpoint built from datasource host/port or a full URL path template. It supports query/body/header templates and writes evidence.
- `graphql`: Posts GraphQL queries to a full URL when supplied. The no-URL mock path references settings that are not declared in `services/config.py`, so that fallback path is likely broken unless code/config is changed.
- `ai_transform`: Calls Groq directly and expects JSON output. If no key exists or the call fails, the step returns a failed result. Optional output schema validation logs warnings but does not enforce failure in all cases.
- `intent_classify`: Calls EIVS classification services for email or generic requests and persists intent run data.
- `policy_route`: Re-runs EIVS routing logic from classified intent output. `MANUAL_REVIEW` creates best-effort notifications/tickets but does not pause the plan unless a human review step is present.
- `intent_validate`: Runs AI-assisted validation through the agent runtime using datasource lookup and review tools. It creates/updates agent task trace rows.
- `adapter_analyze`: Calls the EIVS adapter for email validation or email search analysis.
- `prompt_run`: Renders a prompt and calls Groq. It requires a prompt template and Groq key.
- `document_generate`: Renders an in-code template and returns inline preview content. It does not create or store a file.
- `human_review`: Creates a human review approval row, optionally raises Slack/ITSM notifications, and can pause execution.
- `webhook`: Sends an external HTTP request. HTTP status 400 or higher is treated as failure.
- `agent_task`: Runs a governed agent loop with prompt contracts, budgets, tools, trace events, schema validation, approval policies, and fallback policies.

## EIVS Integration

The EIVS code lives under `services/eivs/`.

Implemented behavior:

- Intent classification for email and generic requests.
- Intent policies with routing modes such as strict single intent, auto all, and auto subset.
- Persistence of intent runs and LLM prompts.
- Validation orchestration that loads validation rules for an intent and calls the adapter.
- Adapter client for email validation/search.

Important current behavior:

- If no configured intents exist, the LLM can return freeform intent codes.
- If LLM classification fails, the code creates a provisional manual-review result.
- If no validation rules exist for an intent, the validation orchestrator creates a successful empty validation run.
- The mock adapter only handles a narrow set of demo banking lookups.

## Agent Runtime

The agent code lives under `services/agent/`.

Implemented behavior:

- `AgentTaskConfig` requires a prompt reference, tool allowlist, output schema, budget, approval policy, and fallback policy.
- Wildcard tool allowlists are rejected.
- Budgets enforce model calls, tool calls, iterations, cost, rows, bytes, and timeout.
- Agent trace events are written to `orchestration.agent_task_trace_events`.
- Agent run state is written to `orchestration.agent_task_runs`.
- Tool approvals are written to `orchestration.agent_task_approvals`.
- Prompt contracts are resolved from internal templates first and then from an optional Prompt Builder service.
- If Prompt Builder is unavailable, runtime can fall back to inline prompt behavior.

Default agent tools:

- `datasource_lookup`
- `adapter_analyze`
- `prompt_run`
- `document_generate`
- `human_review`
- `webhook`

`datasource_lookup` blocks mutating SQL keywords such as `DROP`, `DELETE`, `TRUNCATE`, `INSERT`, `UPDATE`, `ALTER`, and `GRANT`.

## Mock Services

The `mock_services` image contains three FastAPI apps, but Compose only runs `adapter_service.py`.

### Adapter Service

Started by Compose on container port `8000`, host port `8101`.

Endpoints:

- `GET /health`
- `POST /v1/email-validation/analyze`
- `POST /v1/email-search/analyze`

This is a development mock. It performs narrow hardcoded lookups against the seeded banking tables and returns empty valid results for unknown rules.

### Evidence Service

Not started by the current Compose file.

Endpoints if run manually:

- `GET /health`
- `POST /v1/evidence/assemble`
- `GET /v1/evidence/bundles`
- `GET /v1/evidence/bundles/{evidence_id}`

It uses the database when available and an in-memory fallback otherwise.

### LLM Service

Not started by the current Compose file.

Endpoints if run manually:

- `GET /health`
- `POST /v1/ai-transform`

It calls Groq when configured and otherwise falls back to mock output.

## Frontend Application

The frontend is a standalone React/Vite app in `frontend/`.

Main libraries:

- React 19
- React Router 7
- Vite 8
- TypeScript 6
- Lucide React
- Vitest

Routes:

- `/`: Dashboard
- `/plans`: Plan list
- `/plans/new`: Create plan
- `/plans/import`: Import plan JSON
- `/plans/:id`: Plan detail
- `/plans/:id/edit`: Edit plan
- `/plans/:id/history`: Plan version history
- `/plans/:id/canvas`: Plan DAG canvas
- `/plans/:id/canary`: Canary comparison
- `/execute`: Execute plan
- `/execute/monitor`: Execution monitor
- `/history`: Execution history
- `/history/:id`: Execution detail
- `/admin`: Admin console
- `/datasources`: Datasource catalog
- `/packs`: Domain packs
- `/evidence`: Evidence viewer and audit narrative
- `/approvals`: Human review approvals
- `/billing`: Usage/billing view
- `/copilot`: AI copilot
- `/itsm`: ITSM tickets
- `/knowledge`: Knowledge graph lookup
- `*`: Not found page

Shared UI components include layout, empty/error/loading states, badges, code blocks, modals, stat cards, skeletons, agent trace panel, and agent task inspector.

Current frontend behavior and limitations:

- No login route is used.
- `ProtectedRoute` does not protect anything.
- The API client does not attach auth tokens.
- The layout polls open ITSM tickets every 20 seconds for a badge.
- The footer says the backend is connected, but that text is static and not a real health check.
- `UsageBillingPage` builds usage data from browser localStorage execution history, not backend billing data.
- `PlanVersionHistoryPage` stores snapshots in browser localStorage even though backend version endpoints exist.
- `HistoryPage` lists backend executions, but `ExecutionDetailPage` reads localStorage history. This can cause a backend execution row to open as missing in the detail page.
- `ExecutionMonitorPage` calls the backend run endpoint synchronously. Step polling begins only after an execution id exists, so it is not fully real-time during long-running execution.
- `frontend/src/services/api.ts` contains API helpers for `/v1/evidence/bundles/{id}` and `/v1/intent/validate`, but the main backend does not currently expose those routes.

## Existing Tests

Backend tests:

- `services/tests/test_agent_contract.py`
- `services/tests/test_agent_budget.py`
- `services/tests/test_agent_approval.py`
- `services/tests/test_executor_registry.py`
- `services/tests/test_agent_task_integration.py`
- `services/tests/test_intent_classify_executor.py`
- `services/tests/test_loan_noc_email_processing_e2e.py`

Frontend tests:

- `frontend/src/pages/plans/__tests__/EditPlanPage.test.tsx`
- `frontend/src/pages/execute/__tests__/ExecutionMonitorPage.test.tsx`

## Known Incomplete, Mocked, Hardcoded, or Risky Behavior

- Backend auth and admin enforcement are disabled in `services/security.py`.
- Demo auth endpoints exist but are not used by the frontend.
- Compose reads `GROQ_API_KEY` from the local environment. Do not hardcode real keys in tracked files.
- Slack is disabled by default because `SLACK_WEBHOOK_URL` is empty.
- Datasource connection testing is a placeholder and does not test actual connectivity.
- The default Compose adapter is a mock service, not a full production adapter.
- `mock_services/evidence_service.py` and `mock_services/llm_service.py` are not started by Compose.
- GraphQL fallback logic references settings that are not defined in `services/config.py`.
- Some evidence writes use synthetic execution ids based on step key instead of the actual execution id.
- Redaction policies are in-memory only.
- ZKP validation is mock logic.
- Counterfactual audit output is mostly hardcoded/rule-based.
- Knowledge synthesis uses a hardcoded field mapping.
- ITSM external links are fake example URLs.
- Domain pack uninstall does not remove or deactivate plans created during install.
- Agent approval approval updates approval state but does not clearly resume the pending agent action.
- Plan version UI uses localStorage instead of backend version endpoints.
- Execution detail UI uses localStorage while execution list uses backend data.
- Billing/usage UI uses localStorage history, not backend billing data.
- The root `.dockerignore` does not apply to the frontend Docker build context. Because there is no `frontend/.dockerignore`, frontend Docker builds may include `node_modules` and `dist`, which can slow builds.
- A local `archestration.txt` artifact, if present, appears to be an unused generated project dump and is ignored by Git.
- The `docs/adr/ADR-001-eivs-orchestration-integration.md` is useful historical context but contains some statements that are stale compared with current code, especially around mocked components and current wiring.
- CORS allows all origins with credentials enabled, which is not production-safe.

## Setup

For a complete step-by-step setup guide, see `RUNBOOK.md`.

### Prerequisites

- Docker Desktop with Docker Compose v2
- Node.js 20 if running the frontend outside Docker
- Python 3.11 if running the backend outside Docker
- Network access to Docker Hub for base images
- Optional Groq API key for AI-backed features

Required local ports:

- `3100` for frontend
- `8060` for backend
- `8101` for adapter
- `5434` for Postgres

### Docker Start

From the `orchestration` folder:

```powershell
docker compose up --build -d
```

Open:

- Frontend: `http://localhost:3100`
- Backend health: `http://localhost:8060/health`
- Backend OpenAPI docs: `http://localhost:8060/docs`
- Adapter health: `http://localhost:8101/health`

### Clean Restart with Fresh Demo Data

Use this only when you want to delete the local Postgres volume and recreate seeded demo data:

```powershell
docker compose down -v
docker compose up --build -d
```

### Local Backend Development

Use a running Postgres database and set at least:

```powershell
$env:DATABASE_URL="postgresql://orchestration:orchestration@localhost:5434/orchestration"
$env:POSTGRES_DSN=$env:DATABASE_URL
$env:EIVS_ADAPTER_BASE_URL="http://localhost:8101"
```

Then install and run:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn services.main:app --host 0.0.0.0 --port 8060 --reload
```

### Local Frontend Development

From `orchestration/frontend`:

```powershell
npm install
$env:VITE_API_URL="http://localhost:8060"
npm run dev
```

The Vite dev server will print the local UI URL, typically `http://localhost:5173`.

### Test Commands

Backend:

```powershell
pytest services/tests
```

Frontend:

```powershell
cd frontend
npm test
npm run build
```
