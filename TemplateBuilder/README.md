# TemplateBuilder

TemplateBuilder is the AgentryX document-template creation and generation module. It contains a standalone React/Vite frontend, a FastAPI backend, a Template Builder PostgreSQL database, a separate Kasetti demo datasource PostgreSQL database, Redis, and Python worker code for queued render jobs.

This README documents what the code in this folder does today. It does not describe intended future behavior unless that behavior is present in the code or checked-in documentation. Secrets are intentionally not included.

## What This Module Does

TemplateBuilder provides a document studio for creating reusable templates, inserting data placeholders, testing placeholder-backed output, publishing versions, generating documents, and sharing reusable assets through a local marketplace.

- It stores templates, immutable template versions, placeholder registry entries, template-placeholder bindings, render jobs, uploaded documents, AI suggestions, audit events, template tests, block library items, marketplace items, logical models, and usage stats in the `template_builder` PostgreSQL schema.
- It also creates temporary/demo `eivs` tables for intents, datasources, and intent-template mappings. The schema comments explicitly say these are temporary tables for building TemplateBuilder and should be removed in a real production setup where EIVS owns those tables.
- It exposes FastAPI endpoints under `/v1` for template CRUD, publishing, placeholder registry CRUD, datasource SQL testing, document preview/generation/download, marketplace publish/import/rating, reusable blocks, audit events, AI helper tools, and template tests.
- It provides a React UI at `template-builder-ui` with routes for Templates, Prebuilt Templates, Template Editor, Placeholder Registry, Documents, Marketplace, and Audit Log.
- It can render `html`, `docx`, `pdf`, `xlsx`, and `md` outputs through Python renderer classes in `backend/src/core/renderers`.
- It includes worker code that polls for `queued` render jobs, although the active `/v1/documents/generate` API path currently renders synchronously inside the API and inserts jobs as `running`.
- It was visually reskinned to match the AgentryX/FlowEngine design language, but the module remains standalone and does not import shared runtime code from FlowEngine.

## System Overview

### Modules/Features

Template catalog:

- Implemented in `template-builder-ui/src/pages/TemplatesPage.tsx` and `template-builder-engine/backend/src/api/templates.py`.
- Lists templates from `GET /v1/templates`.
- Supports client-side search text, status filtering, output-format filtering, and industry filtering.
- Creates templates with name, output target, industry, empty layout JSON, `draft` status, and `created_by` from local `tb_user_id` or `dev_user`.
- Opens a template at `/templates/{template_id}`.
- Deletes templates through `DELETE /v1/templates/{template_id}`. Backend deletion is a soft archive: it sets `status = 'archived'`.
- Hides archived templates by default unless the UI is filtering for archived status.
- Shows total, draft, and published counts from the loaded template list.
- Opens the import modal for file/URL-based template import.

Prebuilt templates:

- Implemented in `template-builder-ui/src/pages/PrebuiltTemplatesPage.tsx`.
- Provides a hardcoded in-frontend gallery of prebuilt templates.
- Current prebuilt entries include banking, insurance, healthcare, legal, sales, education, and logistics templates such as Loan Closure Letter, Monthly Account Statement, KYC Verification Form, Loan Sanction Letter, Insurance Policy Schedule, Claim Settlement Letter, Patient Discharge Summary, Medical Fitness Certificate, Laboratory Test Report, Non-Disclosure Agreement, Employment Appointment Letter, Service Agreement, Experience / Relieving Letter, Sales Quotation, Tax Invoice (GST), Student Progress Report, Bonafide Certificate, Delivery Receipt / POD, and Consignment Waybill.
- When a prebuilt template is used, the UI creates a normal backend template and marks the create request with `is_prebuilt`.
- Backend records an audit action of `use_prebuilt` for prebuilt-created templates.

Template editor:

- Implemented in `template-builder-ui/src/pages/EditorPage.tsx` and components under `template-builder-ui/src/components/editor/`.
- Loads a template with `GET /v1/templates/{template_id}`.
- Loads global placeholders with `GET /v1/registry/placeholders`.
- Edits template name locally and persists it through `PUT /v1/templates/{template_id}`.
- Edits the template output target through local state and persists it through `PUT /v1/templates/{template_id}`.
- Edits block-based layout JSON with block types `text`, `table`, `image`, and `section`.
- Tracks unsaved changes with `isDirty`; Save Draft is disabled until a change is made.
- Saves the current block list as `layout_json: { blocks: [...] }`.
- Published templates cannot be edited directly by the backend. The UI shows an Edit Template path that calls `POST /v1/templates/{template_id}/revert-to-draft`.
- Publish calls `POST /v1/templates/{template_id}/publish`, which creates a snapshot row in `template_builder.template_versions` and changes template status to `published`.
- Version History lists versions, computes local diffs between selected versions, and can restore a version's blocks into editor state.
- Template Tests opens a modal for creating, editing, deleting, running one, or running all tests for the current template.
- AI Tools opens a modal for Generate, Polish, Translate, and Check actions.
- Generate opens a document-generation modal for choosing output format, triggering a render, polling status, downloading, and viewing supported browser-preview formats.

Block canvas and reusable blocks:

- Implemented in `BlockCanvas.tsx` and backend `api/blocks.py`.
- Supports adding text, table, image, and section blocks.
- Supports drag-and-drop reordering through `@dnd-kit/core` and `@dnd-kit/sortable`.
- Supports moving blocks up/down, deleting blocks, selecting a block, and saving a block to the block library.
- Saved blocks are stored in `template_builder.blocks_library`.
- Block type is not a separate DB column; backend stores type inside `block_json`.
- Backend supports listing, creating, reading, and deleting saved blocks. There is no update endpoint for saved blocks.

Placeholder palette:

- Implemented in `PlaceholderPalette.tsx`.
- Displays registry placeholders and can insert a token like `{{customer_name}}` into the selected block.
- For text blocks, insertion tries to preserve the `contentEditable` caret by snapshotting a DOM `Range` before the palette chip takes focus.
- For table blocks, insertion targets the currently focused binding field or data cell.
- When a token is inserted and the placeholder is found, the UI calls `POST /v1/templates/{template_id}/placeholders` to bind the placeholder to the template.
- The palette also supports drag data through the `application/x-placeholder-token` data key.

Inspector panel:

- Implemented in `InspectorPanel.tsx`.
- Edits selected block settings.
- For text blocks it can detect placeholder tokens inside content.
- For table/image/section blocks it exposes block-specific controls from the existing component logic.

Preview:

- Implemented in `PreviewBar.tsx` and `PreviewPane.tsx`.
- Users can choose preview device labels Desktop, Tablet, or Mobile.
- Users can choose preview formats HTML, PDF, DOCX, XLSX, or MD.
- The preview pane has a local fallback renderer for block preview.
- It can also call backend `POST /v1/documents/preview`.
- For PDF/backend generation flows it calls `POST /v1/documents/generate`, polls `GET /v1/documents/jobs/{job_id}`, and downloads from `GET /v1/documents/jobs/{job_id}/download`.

Placeholder Registry:

- Implemented in `PlaceholderRegistryPage.tsx`, frontend `api/placeholders.ts`, backend `api/placeholders.py`, and backend `api/datasources.py`.
- Lists placeholders with `GET /v1/registry/placeholders`.
- Loads active datasources with `GET /v1/datasources`.
- Lets users search placeholders by name in the UI.
- Lets users create manual SQL placeholders or AI prompt placeholders.
- Client validation requires a non-empty placeholder name, sanitized lowercase token name, SQL query for manual SQL mode, prompt for AI mode, and sample value.
- Manual SQL mode can run SQL through `POST /v1/datasources/test-sql` to populate sample values.
- SQL test helper replaces `{{param}}` tokens with guessed sample values such as `LN12345`, `1`, `John Valid`, `customer@example.com`, dates, and amounts before calling the backend.
- AI prompt mode can call `POST /v1/ai/generate-sql`, which sends a prompt to `LLM_WEBHOOK_URL`, then runs returned SQL against the selected datasource.
- Backend placeholder creation is idempotent on unique name: if insert hits duplicate name, it returns the existing placeholder and writes a `create_duplicate` audit event.
- Backend placeholder validation requires `sql_text` for `manual_sql` and `prompt` for `llm_prompt`.
- Current code has important gaps listed later: the frontend create wrapper hardcodes datasource ID `1`, and backend get/update handlers appear broken.

Datasources:

- Implemented in backend `api/datasources.py`.
- Datasources are read from `eivs.datasources`, not created from this UI.
- Initial active datasources seeded by `V1__init.sql` are `CRM_DB`, `LOAN_CORE_DB`, `FIN_DB`, `HEALTH_DB`, `INSURANCE_DB`, and `MFG_DB`.
- All seeded datasources point to the Kasetti datasource container through connection keys like `postgresql://eivsdemo:eivsdemo@kasetti-db:5432/kasetti_bank`.
- `POST /v1/datasources/test-sql` executes caller-provided SQL through `asyncpg` against the selected datasource connection.
- SQL test cardinality behavior is `scalar` for first column of first row, `list` for all rows joined as strings, and `table` for JSON array-of-objects.

Document generation:

- Implemented mainly in backend `api/documents.py`, frontend `GeneratePanel.tsx`, `PreviewPane.tsx`, and `DocumentsPage.tsx`.
- `POST /v1/documents/preview` renders HTML using sample placeholder values and optional sample overrides.
- `POST /v1/documents/generate` creates a render job row, resolves placeholder values, renders the output file into `RESULTS_DIR`, updates job status, and records audit events.
- Supported output targets are `html`, `docx`, `pdf`, `xlsx`, and `md`.
- Renderers live under `backend/src/core/renderers/`.
- Generated files are downloaded through `GET /v1/documents/jobs/{job_id}/download`.
- `GET /v1/documents/jobs` lists recent render jobs with template name, status, output target, runtime params, result location, and created time.
- `DELETE /v1/documents/jobs/{job_id}` deletes the generated file if present and removes the DB job row.
- The Documents UI lets users list generated jobs, search by template name, filter by format, view PDFs in a new browser tab, view HTML/Markdown in an iframe modal, show an informational modal for DOCX, download files, and clear history.
- The frontend also stores the last 50 generated jobs in `localStorage` under `tb_generated_jobs`, but the Documents page currently loads jobs from backend `/documents/jobs`.

Placeholder resolution:

- Implemented in `backend/src/core/resolver.py`, `api/documents.py`, and `worker.py`.
- Manual SQL placeholders use datasource connection keys and execute SQL with runtime parameter substitution.
- AI prompt placeholders use prompt text from this priority order in `api/documents.py`: runtime param keyed by placeholder name, generic runtime param `prompt`, saved prompt from the registry, then sample value fallback.
- AI prompt placeholders call `LLM_WEBHOOK_URL` and use the returned `value` directly.
- Runtime params that are not placeholder names and are not the generic `prompt` key are added directly into render context.
- Table blocks can use repeat SQL to resolve datasets.

AI tools:

- Implemented in backend `api/ai.py` and frontend `AIToolsPanel.tsx`.
- `POST /v1/ai/tools` supports tools `generate`, `polish`, `translate`, and `check`.
- Generate, Polish, and Check call `call_llm`.
- `call_llm` first calls a configured `LLM_ENDPOINT` if present. If `LLM_ENDPOINT` is empty, it calls Cohere `https://api.cohere.com/v2/chat` with model `command-r-plus-08-2024`.
- Translate calls Google Cloud Translation API v2 at `https://translation.googleapis.com/language/translate/v2`.
- Translate protects `{{placeholder}}` tokens by replacing them with sentinel tokens before translation and restoring them afterward.
- Supported language names in code include Hindi, Tamil, Telugu, Kannada, Marathi, Urdu, French, Spanish, Arabic, German, English, Bengali, Gujarati, Punjabi, and Malayalam.
- `POST /v1/ai/generate-sql` calls `LLM_WEBHOOK_URL`, expects SQL in the webhook response, executes it against the selected datasource, and returns SQL, value, or error.

Template tests:

- Implemented in backend `api/tests.py` and frontend `TestsPanel.tsx`.
- Test cases are stored in `template_builder.template_tests`.
- A test stores name, description, runtime params JSON, expected string checks, creator, and created timestamp.
- Users can list, create, update, delete, run a single test, and run all tests for a template.
- Test execution renders HTML inline without creating an async render job.
- A test passes if every expected string is present in the full rendered HTML output.
- Response includes pass/fail/error status, counts, message, and the first 5000 characters of rendered HTML for preview.

Marketplace:

- Implemented in backend `api/marketplace.py` and frontend `MarketplacePage.tsx`.
- Lists public marketplace items with optional type, tag, and search filters.
- Supports marketplace item types `template`, `block`, and `placeholder`.
- Publishing verifies that the source object exists, prevents duplicate publication for the same source ID/type, stores snapshot payload when possible, creates the marketplace row, and writes an audit event.
- Importing a template creates a new draft template named with `(from Marketplace)`.
- Importing a block creates a new block library entry named with `(from Marketplace)`.
- Importing a placeholder creates a placeholder unless a placeholder with the same name already exists, in which case it returns `already_exists`.
- Rating accepts values from 1.0 to 5.0 and recomputes an average using downloads as an approximate vote count.
- Downloads are incremented during import.
- Delete removes marketplace rows.

Audit Log:

- Implemented in backend `api/audit.py` and frontend `AuditLogPage.tsx`.
- Lists audit events newest first from `template_builder.audit_events`.
- Supports backend filters for entity type, action, actor, and limit.
- Current UI calls `GET /v1/audit/events?limit=500` and filters/expands details in the UI.
- Audit events are written by template create/update/delete/publish, placeholder create/update/delete, document generate/delete, marketplace publish/rate, and worker job completion/error paths where those code paths execute.

Import Template:

- Active mounted implementation is `backend/src/api/import_routes.py`.
- Frontend modal is `ImportTemplateModal.tsx`.
- File import calls `POST /v1/templates/import/file` with multipart form data.
- URL import calls `POST /v1/templates/import/url`.
- Supported parsing code exists for DOCX, HTML, simple HTML fallback, and PDF.
- Import creates a new draft template from parsed blocks.
- The modal supports file selection, drag/drop, URL import, industry selection, and output target selection.
- `backend/src/api/import_template.py` is a second import implementation with more parsing helpers, but it is not mounted by `main.py` today.

Backend worker:

- Implemented in `backend/src/worker.py`.
- Compose starts two worker replicas with `python -m src.worker`.
- Worker polls `template_builder.render_jobs` for rows with status `queued`, atomically claims one with `FOR UPDATE SKIP LOCKED`, changes it to `running`, renders through a plugin, and updates status to `success` or `error`.
- Worker supports concurrency configuration with `MAX_CONCURRENT_RENDERS`, `POLL_INTERVAL_SEC`, and `PDF_CONCURRENCY`.
- Worker renderer registry maps `html`, `pdf`, and `docx` to dedicated renderers.
- Worker currently maps `xlsx` and `md` to the HTML renderer with comments saying real renderers are coming next.
- Because the active API creates jobs as `running`, worker processing is not part of the normal UI generation path unless another caller inserts `queued` jobs.

Renderer implementations:

- `html.py` renders block layout into HTML.
- `docx.py` renders DOCX bytes using `python-docx`.
- `pdf.py` renders PDF bytes using ReportLab and installed FreeSans fonts for Hindi/Indian script support.
- `xlsx.py` renders XLSX bytes using OpenPyXL.
- `md.py` renders Markdown text.
- The Docker image installs `fonts-freefont-ttf` before installing Python requirements to support PDF text rendering.

Legacy and reference files:

- `backend/src/api/render.py` exposes legacy `POST /v1/generate`, which only validates that placeholder IDs were supplied and returns a message telling callers to use `/v1/documents/generate`.
- `backend/src/api/ui.py` contains simple helper stubs for datasource list, fields, and preview, but it is not mounted by `main.py`.
- `backend/src/core/audit.py`, `backend/src/core/versioning.py`, and `backend/src/adapter/datasource_adapter.py` contain SQLAlchemy ORM model definitions duplicated across files.
- `backend/src/core/models.py` contains ORM class definitions but appears incomplete because required imports such as `Base`, `Column`, and `UUID` are not present in that file.
- `docs/architecture.md`, `phases/openapi/template_engine.yaml`, and `openapi.yaml` are design/API reference documents. They may not perfectly match the active mounted source routes.
- `NOC_LN12345.pdf` and `NOC_LN99999.pdf` are checked-in generated/sample PDF artifacts.

### Folder Structure Details

Top-level folder:

- `README.md`: this module documentation.
- `RUNBOOK.md`: operational setup and troubleshooting guide.
- `template-builder-engine/`: FastAPI backend, Docker Compose stack, migrations, demo datasource SQL, worker, renderers, and reference docs.
- `template-builder-ui/`: active React/Vite frontend used for the TemplateBuilder UI.

`template-builder-engine/`:

- `.env`: local backend/compose environment file. It can contain real API keys and must stay local.
- `.gitignore`: ignores virtualenvs, Python caches, `node_modules`, `dist`, and build output.
- `Dockerfile`: Python 3.11 slim backend image; installs fonts, requirements, copies backend source to `/app/src`, sets `PYTHONPATH=/app/src`, exposes `8080`, and starts Uvicorn.
- `docker-compose.yml`: starts API, worker replicas, Template Builder Postgres, Kasetti datasource Postgres, and Redis.
- `requirements.txt`: FastAPI, Uvicorn, SQLAlchemy, asyncpg, psycopg2, Pydantic, dotenv, Redis client, PyYAML, httpx, loguru, Anthropic package, python-docx, pdfplumber, BeautifulSoup, multipart support, ReportLab, and OpenPyXL.
- `openapi.yaml`: OpenAPI reference file for Template Builder API. Treat as reference because the active source includes endpoints and behavior that may not be fully reflected.
- `docs/architecture.md`: architecture and roadmap notes for the template engine.
- `filelist.txt`: checked-in inventory of project files from an earlier point.
- `debug_test.sh`: shell helper for debug testing.
- `test_phase-1.sh`: shell helper for phase-one API flow testing.
- `NOC_LN12345.pdf` and `NOC_LN99999.pdf`: sample/generated PDF files.

`template-builder-engine/backend/`:

- `config.py`: reads `DATABASE_URL` with a Docker Postgres fallback.
- `db.py`: defines synchronous SQLAlchemy `engine`, `SessionLocal`, and `Base`; not the primary path for mounted async route handlers.
- `schema.py`: Pydantic schemas for templates, versions, placeholders, bindings, and document generation.
- `__init__.py`: package marker.
- `src/main.py`: FastAPI app, CORS, async database engine startup/shutdown, router mounting, root health, and debug route listing.
- `src/worker.py`: async queued render-job worker.

`template-builder-engine/backend/src/api/`:

- `health.py`: `GET /v1/healthz`.
- `templates.py`: template CRUD, publish, placeholder binding, revert to draft, versions, placeholder/token discovery, and runtime input discovery.
- `placeholders.py`: placeholder registry create/list/get/update/delete.
- `datasources.py`: active datasource list and SQL test execution.
- `documents.py`: preview, generate, job list/status/download/delete, run-console template list, and job status alias.
- `marketplace.py`: marketplace listing, publishing, item details, rating, import, and delete.
- `blocks.py`: reusable block library list/create/read/delete.
- `audit.py`: audit event listing.
- `ai.py`: AI text tools, translation, and SQL-generation webhook endpoint.
- `tests.py`: template test CRUD and execution.
- `import_routes.py`: active import-from-file/import-from-URL router.
- `import_template.py`: alternate import implementation not mounted in `main.py`.
- `render.py`: legacy `/v1/generate` compatibility response.
- `ui.py`: unmounted helper/stub functions.
- `__init__.py`: API package marker.

`template-builder-engine/backend/src/core/`:

- `resolver.py`: SQL and dataset resolver used by document generation.
- `renderers/html.py`: HTML renderer.
- `renderers/docx.py`: DOCX renderer.
- `renderers/pdf.py`: PDF renderer.
- `renderers/xlsx.py`: XLSX renderer.
- `renderers/md.py`: Markdown renderer.
- `audit.py`, `versioning.py`, `models.py`: ORM/model-related modules; active route code mostly uses raw SQL.
- `__init__.py`: package marker.

`template-builder-engine/backend/src/adapter/`:

- `datasource_adapter.py`: SQLAlchemy model definitions mirroring template/placeholder/render-job tables. It is not part of the mounted FastAPI route flow inspected here.

`template-builder-engine/db/migrations/`:

- `V1__init.sql`: primary database initialization script mounted into Postgres. It creates `eivs` and `template_builder` schemas, creates all main tables, indexes them, and inserts demo intents/datasources.

`template-builder-engine/sql/kasetti-db/`:

- `banking_domain.sql`: creates/seeds `crm` and `loan_core` schemas.
- `finance_domain.sql`: creates/seeds `fin` schemas and finance records.
- `health_domain.sql`: creates/seeds `emr` patient/encounter/diagnosis/medication/lab/billing records.
- `insurance_domain.sql`: creates/seeds `ins` customer/policy/coverage/claim records.
- `manufacturing_domain.sql`: creates/seeds `mfg` plant/work-center/material/BOM/production/quality records.

`template-builder-engine/phases/`:

- `config/semantic_model_yaml/loan.yaml`: example semantic model for customer and loan entities.
- `openapi/template_engine.yaml`: phase/reference OpenAPI file.
- `seed/seed_datasources.sql`: older seed script using column names such as `datasourcetype`, `connectionkey`, `semanticmodelyaml`, and `isactive`; this does not match the active `V1__init.sql` datasource columns.

`template-builder-engine/frontend/`:

- Contains an older React component scaffold under `frontend/src/components`.
- `frontend/package.json` is an empty zero-byte file, so this nested frontend is not runnable as-is.
- The active frontend is `template-builder-ui/`.

`template-builder-ui/`:

- `.env`: local frontend environment file. It contains `VITE_API_BASE` and other local values and should stay local.
- `.gitignore`: ignores logs, `node_modules`, `dist`, `dist-ssr`, `*.local`, and editor files.
- `package.json` and `package-lock.json`: npm package manifest/lockfile.
- `vite.config.ts`: Vite config using `@vitejs/plugin-react`.
- `eslint.config.js`: ESLint config.
- `jest.config.cjs`, `jest.setup.ts`, and `tsconfig.test.json`: Jest/ts-jest test setup.
- `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`: TypeScript project references and compiler settings.
- `index.html`: Vite HTML entry.
- `public/favicon.svg` and `public/icons.svg`: public static assets.
- `src/main.tsx`: React root render.
- `src/App.tsx`: BrowserRouter route table and shared layout.
- `src/App.css`: legacy/default app CSS file.
- `src/index.css`: global design tokens and base CSS.
- `src/assets/`: static image/SVG assets.
- `src/api/`: frontend API wrappers for audit, client, datasources, documents, marketplace, placeholders, and templates.
- `src/types/api.ts`: TypeScript API/domain types.
- `src/components/layout/`: app shell and sidebar.
- `src/components/shared/`: LoadingSpinner, StatusBadge, ErrorAlert, and EmptyState.
- `src/components/editor/`: editor top bar, canvas, placeholder palette, inspector, preview, generation modal, version history, tests panel, AI tools, and block implementations.
- `src/components/ImportTemplateModal.tsx`: import workflow modal.
- `src/pages/`: Templates, Prebuilt Templates, Editor, Placeholder Registry, Marketplace, Audit Log, and Documents pages.
- `src/styles/`: page and shell styling files.
- `src/__tests__/`: Jest tests for API wrappers, pages, layout, shared components, editor components, and blocks.
- `__mocks__/`: Jest mocks for API client and files.
- `node_modules/`, `dist/`, and `coverage/`: local generated/dependency artifacts if present after local install/build/test; these should not be treated as source.

### Tech Stack

Frontend:

- React 19.2.4.
- React DOM 19.2.4.
- React Router DOM 7.14.0 for client-side routing.
- Vite 8.0.4 for local dev/build.
- TypeScript 6.0.2.
- Axios 1.14.0 for API calls.
- `@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities` for editor drag/drop behavior.
- `uuid` for client-side IDs where needed.
- CSS files and inline React style objects for UI styling.
- Jest 29, ts-jest, Testing Library, and jsdom for frontend tests.
- ESLint 9 with TypeScript ESLint and React hooks/refresh plugins.

Backend:

- Python 3.11 slim Docker image.
- FastAPI 0.115.5.
- Uvicorn 0.32.0.
- SQLAlchemy 2.0.36 with async engine usage in active routes.
- asyncpg for async Postgres access and datasource SQL execution.
- psycopg2-binary is installed for sync DB support/legacy helpers.
- Pydantic 2.9.0.
- httpx for Cohere, Google Translate, webhook, and import URL calls.
- python-dotenv for local env support.
- ReportLab for PDF generation.
- python-docx for DOCX generation.
- OpenPyXL for XLSX generation.
- pdfplumber and BeautifulSoup for document import/parsing.
- PyYAML, loguru, redis client, python-multipart, and Anthropic package are installed dependencies.

Databases and infrastructure:

- PostgreSQL 15 for the Template Builder application database.
- PostgreSQL 15 for the Kasetti demo datasource database.
- Redis 7 is started by Compose, but no active route code inspected here uses Redis directly.
- Docker Compose v3.8 defines the local backend stack.

External services and integrations:

- Cohere Chat API for Generate, Polish, and Check tools when `LLM_ENDPOINT` is not configured.
- Google Cloud Translation API v2 for Translate.
- Optional custom `LLM_ENDPOINT` for a future/internal LLM microservice.
- `LLM_WEBHOOK_URL` for prompt-to-SQL and AI placeholder resolution.
- Postgres datasource URLs stored in `eivs.datasources.connection_key`.

## Runtime Topology

`template-builder-engine/docker-compose.yml` starts:

| Service | Purpose | Host port |
| --- | --- | --- |
| `api` | FastAPI Template Builder backend | `10001` mapped to container `8080` |
| `worker` | Python render-job worker replicas | no host port |
| `db` | Template Builder PostgreSQL database | internal only |
| `kasetti-db` | Demo datasource PostgreSQL database | `5433` mapped to container `5432` |
| `redis` | Redis container | internal only |

The active frontend is not started by this Compose file. Run it separately from `template-builder-ui` with Vite unless a future Compose service is added.

Current local URLs:

- UI: `http://localhost:5173` when Vite is running.
- API health: `http://localhost:10001/healthz`.
- Versioned API health: `http://localhost:10001/v1/healthz`.
- Debug route list: `http://localhost:10001/_debug/routes`.
- API docs: `http://localhost:10001/docs`.
- Kasetti datasource from host: `localhost:5433`.

## Database Schema

`template-builder-engine/db/migrations/V1__init.sql` is mounted into the app database container and runs on a fresh database volume.

EIVS/demo schema:

- `eivs.intents`: stores demo intent metadata. Seed includes `REQUEST_LOAN_NOC`.
- `eivs.datasources`: stores datasource name, type, connection key, description, optional semantic model YAML, and active flag. Seed includes CRM, loan core, finance, health, insurance, and manufacturing datasources.
- `eivs.intent_templates`: maps EIVS intents to templates.

Template Builder schema:

- `template_builder.templates`: main template metadata and layout JSON.
- `template_builder.template_versions`: immutable published snapshots.
- `template_builder.placeholders_registry`: global placeholders with SQL/prompt config, datasource ID, value type, cardinality, sample value, metadata, and active flag.
- `template_builder.template_placeholders`: bindings between templates and registry placeholders with optional overrides.
- `template_builder.render_jobs`: document-generation job status, params, result location, and logs.
- `template_builder.uploaded_documents`: uploaded document extraction metadata.
- `template_builder.ai_suggestions`: AI suggestion records.
- `template_builder.audit_events`: audit records across template, placeholder, marketplace, render-job, and worker flows.
- `template_builder.template_tests`: regression-style template test cases.
- `template_builder.blocks_library`: reusable saved blocks.
- `template_builder.marketplace_items`: locally published templates, blocks, and placeholders with optional payload snapshots.
- `template_builder.logical_models`: JSON logical model definitions.
- `template_builder.template_usage_stats`: render count/error stats per template.
- `template_builder.placeholder_usage_stats`: resolution count/error stats per placeholder.

Kasetti datasource database:

- The separate `kasetti-db` container creates demo schemas for banking, finance, healthcare, insurance, and manufacturing.
- These schemas are used by datasource SQL tests and placeholder resolution through datasource connection keys.

## Active Backend API Surface

### Health and Debug

- `GET /healthz`: root monitoring health response.
- `GET /v1/healthz`: versioned health response.
- `GET /_debug/routes`: lists mounted FastAPI routes.

### Templates

- `GET /v1/templates`: list templates with optional `status_filter`, `industry`, `tag`, and `search`.
- `POST /v1/templates`: create a draft template.
- `GET /v1/templates/{template_id}`: read template details.
- `PUT /v1/templates/{template_id}`: update template fields when the template is not published.
- `DELETE /v1/templates/{template_id}`: archive a template.
- `POST /v1/templates/{template_id}/publish`: create a version snapshot and mark template published.
- `POST /v1/templates/{template_id}/revert-to-draft`: mark a template draft again.
- `GET /v1/templates/{template_id}/versions`: list version snapshots.
- `POST /v1/templates/{template_id}/placeholders`: bind a placeholder to a template.
- `GET /v1/templates/{template_id}/placeholders`: scan layout tokens and match active registry placeholders.
- `GET /v1/templates/{template_id}/inputs`: return runtime input contract inferred from template tokens and placeholder SQL/prompt definitions.

### Placeholder Registry

- `GET /v1/registry/placeholders`: list placeholders, optionally filtered by name.
- `POST /v1/registry/placeholders`: create a placeholder; duplicate names return the existing record.
- `GET /v1/registry/placeholders/{registry_id}`: intended to read one placeholder, but current implementation appears broken.
- `PUT /v1/registry/placeholders/{registry_id}`: intended to update one placeholder, but current implementation appears broken.
- `DELETE /v1/registry/placeholders/{registry_id}`: delete one placeholder.

### Datasources

- `GET /v1/datasources`: list active datasource rows from `eivs.datasources`.
- `POST /v1/datasources/test-sql`: execute SQL against a datasource and return scalar/list/table output.

### Documents

- `POST /v1/documents/preview`: render HTML preview using sample values.
- `POST /v1/documents/generate`: render a document and create/update a render job.
- `GET /v1/documents/jobs`: list recent render jobs.
- `GET /v1/documents/jobs/{job_id}`: read render-job status.
- `GET /v1/documents/{job_id}`: hidden schema alias for job status.
- `GET /v1/documents/jobs/{job_id}/download`: download generated artifact.
- `GET /v1/documents/templates`: list non-archived templates for a run-console-style dropdown.
- `DELETE /v1/documents/jobs/{job_id}`: delete a generated job and file.

### Marketplace

- `GET /v1/marketplace/`: list marketplace items.
- `POST /v1/marketplace/`: publish a template, block, or placeholder.
- `GET /v1/marketplace/{item_id}`: read one marketplace item.
- `POST /v1/marketplace/{item_id}/rate`: rate an item.
- `POST /v1/marketplace/{item_id}/import`: import an item into local templates, block library, or placeholder registry.
- `DELETE /v1/marketplace/{item_id}`: delete an item.

### Blocks

- `GET /v1/blocks/`: list reusable blocks with optional industry/tag/search filters.
- `POST /v1/blocks/`: save a block to the reusable block library.
- `GET /v1/blocks/{block_id}`: read one reusable block.
- `DELETE /v1/blocks/{block_id}`: delete one reusable block.

### Tests

- `GET /v1/templates/{template_id}/tests`: list tests for a template.
- `POST /v1/templates/{template_id}/tests`: create a test.
- `PUT /v1/templates/{template_id}/tests/{test_id}`: update a test.
- `DELETE /v1/templates/{template_id}/tests/{test_id}`: delete a test.
- `POST /v1/templates/{template_id}/tests/{test_id}/run`: run one test.
- `POST /v1/templates/{template_id}/tests/run-all`: run every test for a template.

### AI

- `POST /v1/ai/tools`: run Generate, Polish, Translate, or Check.
- `POST /v1/ai/generate-sql`: call the SQL-generation webhook and execute returned SQL.

### Import

- `POST /v1/templates/import/file`: import a template from an uploaded file.
- `POST /v1/templates/import/url`: import a template from URL content.

### Audit

- `GET /v1/audit/events`: list audit events with optional entity/action/actor filters.

### Legacy Compatibility

- `POST /v1/generate`: legacy endpoint that returns a message telling callers to use `/v1/documents/generate`.

## Frontend Routes

- `/`: redirects to `/templates`.
- `/templates`: template catalog.
- `/templates/prebuilt`: prebuilt template gallery.
- `/templates/:id`: template editor.
- `/registry/placeholders`: placeholder registry.
- `/documents`: generated documents page.
- `/marketplace`: local marketplace.
- `/audit`: audit log.

The shared shell is `AppLayout.tsx`; navigation is `Sidebar.tsx`.

## Authentication And Authorization

There is no real authentication layer in this folder today.

- The React sidebar always runs `localStorage.setItem('tb_user_id', 'dev_user')`.
- The Axios interceptor sends `x-user-id` from `localStorage.tb_user_id` or `dev_user`.
- Several backend paths default actors to `dev_user`, `system`, or `worker`.
- No Keycloak, JWT validation, sessions, roles, or tenant RBAC enforcement were found in the active TemplateBuilder route flow.
- Some model files include `tenant_id` comments/defaults, but the active SQL schema and route logic do not implement a complete tenant isolation model.

## Environment Variables

Backend/Compose variables used by `template-builder-engine`:

| Variable | Required for startup? | Used by |
| --- | --- | --- |
| `DB_URL` | Yes in Compose | Mapped to container `DATABASE_URL`; app DB connection. |
| `DATABASE_URL` | Yes inside container | FastAPI lifespan and worker DB engine. |
| `REDIS_URL` | No active route usage found | Passed to API; Redis container exists. |
| `API_HOST` | No direct active Docker effect found | Present in local `.env`. |
| `API_PORT` | Passed to API | Compose maps host `10001` to container `8080`; Docker CMD listens on `8080`. |
| `KASETTI_DS_URL` | Used by resolver/datasource helpers | Demo datasource connection fallback. |
| `COHERE_API_KEY` | Required for Cohere-backed AI tools | Generate, Polish, Check when `LLM_ENDPOINT` is empty. |
| `GOOGLE_TRANSLATE_KEY` | Required for Translate | Google Cloud Translation API. |
| `LLM_ENDPOINT` | Optional | Custom LLM microservice for `call_llm`. |
| `LLM_WEBHOOK_URL` | Required for AI SQL/prompt webhook behavior | AI SQL generation and AI placeholder resolution. Compose currently hardcodes a webhook.site URL for API/worker. |
| `RESULTS_DIR` | Optional | Output file directory, default `/app/results`. |
| `MAX_CONCURRENT_RENDERS` | Worker only | Worker concurrency, default in compose `3`. |
| `POLL_INTERVAL_SEC` | Worker only | Worker polling interval, default in compose `1`. |
| `PDF_CONCURRENCY` | Worker only | Worker PDF concurrency, default in compose `2`. |

Frontend variables used by `template-builder-ui`:

| Variable | Required? | Used by |
| --- | --- | --- |
| `VITE_API_BASE` | Yes for normal API calls | Axios base URL and direct fetch download/view calls. Expected local value is `http://localhost:10001/v1`. |

Secret handling:

- Do not commit real `.env` values.
- The docs intentionally do not include the local Cohere or Google keys.
- Developers should create their own local `.env` files from the variable list above.

## External Integrations

- Cohere API: `https://api.cohere.com/v2/chat`, model `command-r-plus-08-2024`.
- Google Cloud Translation API v2: `https://translation.googleapis.com/language/translate/v2`.
- LLM webhook: configured by `LLM_WEBHOOK_URL`; active Compose currently uses a hardcoded `webhook.site` URL.
- Optional LLM microservice: configured by `LLM_ENDPOINT`; expected to return a JSON body with `text`, `response`, or `output`.
- Kasetti demo datasource PostgreSQL: used by SQL placeholders and datasource SQL tests.

## Known Incomplete, Stubbed, Hardcoded, Or Risky Behavior

- No real auth exists; `dev_user` is hardcoded in frontend localStorage and many backend audit paths.
- `template-builder-engine/docker-compose.yml` starts backend services only; the active frontend must be started separately from `template-builder-ui`.
- `LLM_WEBHOOK_URL` is hardcoded in Compose to a webhook.site URL for API and worker. That URL may not be valid for another developer or environment.
- `POST /v1/documents/generate` catches render exceptions, marks the DB job as `error`, but still returns `{"status": "success", "job_id": ...}`. Callers must poll/read job status to know if rendering actually failed.
- The worker polls for `queued` jobs, but the active generate API inserts jobs as `running`. The worker is therefore not used by the normal UI generation path.
- Worker renderer registry maps `xlsx` and `md` to the HTML renderer, despite dedicated core renderers existing for API-side generation.
- `frontend/src/api/placeholders.ts` hardcodes `datasource_id: 1` in `createPlaceholder`, ignoring the datasource selected by the Placeholder Registry UI during create.
- `backend/src/api/placeholders.py` appears to call `result.mappings().first()` twice in get/update flows; the second read can make rows look missing. The GET handler also references `req` even though no `req` parameter exists. These routes likely do not behave as intended.
- Placeholder update SQL does not update `datasource_id`, `format_json`, `metadata`, `is_active`, or `created_by`.
- `GET /v1/templates/{template_id}/placeholders` selects a `category` column from `template_builder.placeholders_registry`, but the active DDL does not create a `category` column. This endpoint may error if called.
- `frontend/src/api/templates.ts` comment says versions are not yet in backend, but backend now implements `GET /templates/{template_id}/versions`; the comment is stale.
- `frontend/src/api/datasources.ts` calls `/datasources/` with a trailing slash while the backend route is `/datasources`. FastAPI may redirect, but direct clients should prefer `/datasources`.
- `phases/seed/seed_datasources.sql` uses older datasource column names and a UUID datasource id even though active `eivs.datasources.datasource_id` is `SERIAL`. Treat it as stale/reference.
- `template-builder-engine/frontend/package.json` is empty; the nested frontend scaffold is not runnable as-is.
- `backend/src/core/models.py` appears incomplete if imported directly because it references ORM symbols without imports.
- `backend/src/api/ui.py` contains unmounted helper/stub functions.
- `backend/src/api/import_template.py` is not mounted; `import_routes.py` is the active import router.
- Several comments in files display mojibake/corrupted characters in PowerShell output. The code still runs, but comments and UI emoji strings may display incorrectly depending on encoding.
- Current `template-builder-ui/README.md` is the default Vite template README, not project-specific module documentation.
- The frontend contains many inline style objects in addition to CSS files, so styling is not as centralized as FlowEngine's tenant app.
- A full `npm run build` can fail because TypeScript checks tests and `PlaceholderPalette.test.tsx` does not pass the now-required `onBeforeInsert` prop. `npm.cmd exec vite build` has been used successfully for Vite-only production bundling.
- Vite can warn about chunks larger than 500 KB after build; this is a bundle-size warning, not a failed build.
- `node_modules`, `dist`, and `coverage` may exist locally in `template-builder-ui`; they are generated artifacts and should not be treated as source.

## Setup

### Prerequisites

- Docker Desktop or Docker Engine with Docker Compose v2.
- Git, if cloning from GitHub.
- PowerShell on Windows for the commands in `RUNBOOK.md`.
- Internet access for Docker image pulls and external AI calls.
- Node.js 20+ and npm for running the active frontend locally.
- Python 3.11+ only if running the backend outside Docker.

Required free ports for the default local setup:

- `10001` for the FastAPI API.
- `5433` for the Kasetti datasource database.
- `5173` for the Vite frontend.

### Required Local Environment Files

Create or update `TemplateBuilder/template-builder-engine/.env` with local values:

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

Create or update `TemplateBuilder/template-builder-ui/.env`:

```env
VITE_API_BASE=http://localhost:10001/v1
```

### Start Backend Stack With Docker

```powershell
cd C:\Users\karik\Desktop\Project\AgentryX\TemplateBuilder\template-builder-engine
docker compose up --build -d
```

Verify:

```powershell
docker compose ps
Invoke-WebRequest -Uri http://localhost:10001/healthz -UseBasicParsing
Invoke-WebRequest -Uri http://localhost:10001/v1/healthz -UseBasicParsing
```

### Start Frontend Locally

```powershell
cd C:\Users\karik\Desktop\Project\AgentryX\TemplateBuilder\template-builder-ui
npm install
npm.cmd run dev
```

Open:

```text
http://localhost:5173
```

### Useful Smoke Checks

- Open `/templates`; confirm it loads without API errors.
- Create a template and confirm it opens in `/templates/{id}`.
- Add a text block, save draft, refresh, and confirm the block persists.
- Create or list placeholders in Placeholder Registry.
- Run SQL sample fetch against a seeded datasource.
- Publish a template, then verify Version History has a version.
- Generate a PDF or HTML document and confirm it appears in Documents.
- Download the generated file.
- Open Marketplace, publish a template or block, then import it.
- Open Audit Log and confirm recent actions appear.

For operational details, clean reset commands, diagnostics, and troubleshooting, read `RUNBOOK.md`.
