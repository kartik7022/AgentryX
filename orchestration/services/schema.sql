-- ============================================================================
-- schema.sql — Agentary Orchestrator Database Schema
-- ============================================================================


-- ─── 1. Required extension ──────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── 2. Create schema ───────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS orchestration;

-- ============================================================================
-- TABLE: plans
-- ============================================================================
CREATE TABLE IF NOT EXISTS orchestration.plans (
    plan_id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT        NOT NULL UNIQUE,
    entity_type     TEXT        NOT NULL,
    description     TEXT,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    version         INT         NOT NULL DEFAULT 1,
    tenant_id       TEXT,
    error_policy    TEXT        NOT NULL DEFAULT 'best_effort'
                    CHECK (error_policy IN ('best_effort','fail_fast','dependent_fail')),
    max_concurrency INT         NOT NULL DEFAULT 8,
    created_by      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plans_name
    ON orchestration.plans (name);

CREATE INDEX IF NOT EXISTS idx_plans_entity_type
    ON orchestration.plans (entity_type);

CREATE INDEX IF NOT EXISTS idx_plans_tenant_id
    ON orchestration.plans (tenant_id);

CREATE INDEX IF NOT EXISTS idx_plans_is_active
    ON orchestration.plans (is_active);

-- ============================================================================
-- TABLE: plan_steps
-- ============================================================================
CREATE TABLE IF NOT EXISTS orchestration.plan_steps (
    plan_step_id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id                UUID        NOT NULL REFERENCES orchestration.plans(plan_id) ON DELETE CASCADE,
    step_key               TEXT        NOT NULL,
    step_order             INT         NOT NULL DEFAULT 1,
    kind                   TEXT        NOT NULL
                           CHECK (kind IN (
                               'sql','rest','graphql','ai_transform',
                               'intent_classify','policy_route','intent_validate',
                               'adapter_analyze','prompt_run','document_generate',
                               'human_review','webhook','agent_task'
                           )),
    datasource_name        TEXT        NOT NULL,
    sql_template           TEXT,
    method                 TEXT,
    path_template          TEXT,
    query_params_json      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    body_json              JSONB,
    graphql_query_template TEXT,
    graphql_vars_json      JSONB,
    ai_prompt_template     TEXT,
    ai_output_schema       JSONB,
    depends_on             TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
    condition_expr         TEXT,
    input_bindings_json    JSONB       NOT NULL DEFAULT '{}'::jsonb,
    timeout_ms             INT         NOT NULL DEFAULT 5000,
    enabled                BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (plan_id, step_key)
);

CREATE INDEX IF NOT EXISTS idx_plan_steps_plan_id
    ON orchestration.plan_steps (plan_id);

CREATE INDEX IF NOT EXISTS idx_plan_steps_kind
    ON orchestration.plan_steps (kind);

CREATE INDEX IF NOT EXISTS idx_plan_steps_order
    ON orchestration.plan_steps (plan_id, step_order);

-- ============================================================================
-- TABLE: plan_versions
-- ============================================================================
CREATE TABLE IF NOT EXISTS orchestration.plan_versions (
    version_id   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id      UUID        NOT NULL REFERENCES orchestration.plans(plan_id) ON DELETE CASCADE,
    version      INT         NOT NULL,
    snapshot     JSONB       NOT NULL DEFAULT '{}'::jsonb,
    change_notes TEXT,
    created_by   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (plan_id, version)
);

CREATE INDEX IF NOT EXISTS idx_plan_versions_plan_id
    ON orchestration.plan_versions (plan_id);

-- ============================================================================
-- TABLE: executions
-- ============================================================================
CREATE TABLE IF NOT EXISTS orchestration.executions (
    execution_id UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id      UUID,
    plan_name    TEXT        NOT NULL,
    entity_type  TEXT        NOT NULL,
    tenant_id    TEXT        NOT NULL DEFAULT 'global',
    params       JSONB       NOT NULL DEFAULT '{}'::jsonb,
    results      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    errors       JSONB       NOT NULL DEFAULT '{}'::jsonb,
    status       TEXT        NOT NULL
                 CHECK (status IN ('success','partial','failed')),
    duration_ms  INT         NOT NULL DEFAULT 0,
    executed_by  TEXT,
    executed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_executions_plan_name
    ON orchestration.executions (plan_name);

CREATE INDEX IF NOT EXISTS idx_executions_tenant_id
    ON orchestration.executions (tenant_id);

CREATE INDEX IF NOT EXISTS idx_executions_status
    ON orchestration.executions (status);

CREATE INDEX IF NOT EXISTS idx_executions_executed_at
    ON orchestration.executions (executed_at DESC);

-- ============================================================================
-- TABLE: tenant_policies
-- ============================================================================
CREATE TABLE IF NOT EXISTS orchestration.tenant_policies (
    tenant_id       TEXT        PRIMARY KEY,
    max_concurrency INT         NOT NULL DEFAULT 8,
    max_retries     INT         NOT NULL DEFAULT 3,
    timeout_ms      INT         NOT NULL DEFAULT 5000,
    error_policy    TEXT        NOT NULL DEFAULT 'best_effort'
                    CHECK (error_policy IN ('best_effort','fail_fast','dependent_fail')),
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- TABLE: tenant_budgets
-- ============================================================================
CREATE TABLE IF NOT EXISTS orchestration.tenant_budgets (
    tenant_id    TEXT           PRIMARY KEY,
    max_rows     INT            NOT NULL DEFAULT 100000,
    max_bytes_mb INT            NOT NULL DEFAULT 512,
    max_cost_usd NUMERIC(10,4)  NOT NULL DEFAULT 50.0,
    alert_at_pct INT            NOT NULL DEFAULT 80,
    created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- TABLE: datasources
-- ============================================================================
CREATE TABLE IF NOT EXISTS orchestration.datasources (
    datasource_id UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          TEXT        NOT NULL UNIQUE,
    kind          TEXT        NOT NULL,
    host          TEXT,
    port          TEXT,
    database_name TEXT,
    username      TEXT,
    password      TEXT        DEFAULT '',
    description   TEXT,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    tags          JSONB       NOT NULL DEFAULT '[]'::jsonb,
    tenant_id     TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_datasources_kind
    ON orchestration.datasources (kind);

CREATE INDEX IF NOT EXISTS idx_datasources_is_active
    ON orchestration.datasources (is_active);

-- ============================================================================
-- TABLE: users
-- ============================================================================
CREATE TABLE IF NOT EXISTS orchestration.users (
    user_id       UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    username      TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    role          TEXT        NOT NULL DEFAULT 'orchestration_viewer',
    tenant_id     TEXT,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username
    ON orchestration.users (username);

-- ============================================================================
-- TABLE: domain_pack_installations
-- ============================================================================
CREATE TABLE IF NOT EXISTS orchestration.domain_pack_installations (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    pack_id      TEXT        NOT NULL,
    tenant_id    TEXT        NOT NULL DEFAULT 'global',
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (pack_id, tenant_id)
);

-- ============================================================================
-- TABLE: knowledge_graph_config
-- ============================================================================
CREATE TABLE IF NOT EXISTS orchestration.knowledge_graph_config (
    id                SERIAL      PRIMARY KEY,
    entity_type       TEXT        NOT NULL,
    table_schema      TEXT        NOT NULL,
    table_name        TEXT        NOT NULL,
    id_column         TEXT        NOT NULL,
    display_fields    TEXT[]      NOT NULL,
    relationship_type TEXT,
    parent_entity     TEXT,
    parent_fk_column  TEXT
);

-- ============================================================================
-- ADD MISSING COLUMNS SAFELY (for existing databases)
-- ============================================================================
ALTER TABLE orchestration.datasources
    ADD COLUMN IF NOT EXISTS password TEXT DEFAULT '';

-- ============================================================================
-- SEED: Default Datasources
-- ============================================================================
INSERT INTO orchestration.datasources
    (name, kind, host, port, database_name, username, password, description, is_active, tags)
VALUES
('CRM_DB',       'sql', 'db', '5432', 'orchestration', 'orchestration', 'orchestration', 'Banking CRM — customer profiles',        TRUE, '[]'),
('LOAN_CORE_DB', 'sql', 'db', '5432', 'orchestration', 'orchestration', 'orchestration', 'Banking Loan Core — loans and payments', TRUE, '[]'),
('FIN_DB',       'sql', 'db', '5432', 'orchestration', 'orchestration', 'orchestration', 'Finance — invoices and GL accounts',     TRUE, '[]'),
('HEALTH_DB',    'sql', 'db', '5432', 'orchestration', 'orchestration', 'orchestration', 'Healthcare EMR — patients and labs',     TRUE, '[]'),
('INSURANCE_DB', 'sql', 'db', '5432', 'orchestration', 'orchestration', 'orchestration', 'Insurance — policies and claims',        TRUE, '[]'),
('MFG_DB',       'sql', 'db', '5432', 'orchestration', 'orchestration', 'orchestration', 'Manufacturing — products and orders',    TRUE, '[]')
ON CONFLICT (name) DO UPDATE SET
    host          = EXCLUDED.host,
    port          = EXCLUDED.port,
    database_name = EXCLUDED.database_name,
    username      = EXCLUDED.username,
    password      = EXCLUDED.password,
    description   = EXCLUDED.description,
    is_active     = EXCLUDED.is_active;


DELETE FROM orchestration.knowledge_graph_config;

INSERT INTO orchestration.knowledge_graph_config
(entity_type, table_schema, table_name, id_column, display_fields, relationship_type, parent_entity, parent_fk_column)
VALUES
('customer', 'crm',       'customers', 'customer_id', ARRAY['full_name','email','phone','customer_type'],                 NULL,         NULL,       NULL),
('loan',     'loan_core', 'loans',     'loan_id',     ARRAY['loan_account_number','status','principal_amount','currency'], 'HAS_LOAN',   'customer', 'customer_id'),
('loan',   'loan_core', 'loans',    'loan_id',   ARRAY['loan_account_number','status','principal_amount','currency','risk_bucket','customer_id'], NULL, NULL, NULL),
('policy',   'ins',       'policies',  'policy_id',   ARRAY['policy_number','policy_status','gross_premium'],              'HAS_POLICY', 'customer', 'customer_id'),
('policy', 'ins',       'policies', 'policy_id', ARRAY['policy_number','policy_status','gross_premium','net_premium','customer_id'],               NULL, NULL, NULL),
('patient',  'emr',       'patients',  'patient_id',  ARRAY['mrn','full_name','date_of_birth','gender'],                  NULL,         NULL,       NULL),
('client',   'fin',       'clients',   'client_id',   ARRAY['name','country','risk_level'],                               NULL,         NULL,       NULL);

-- ============================================================================
-- ORCH-003: Extend plan_steps.kind to allow new EIVS and integration kinds
-- (self-healing — also applies to databases created before this change)
-- ============================================================================
ALTER TABLE orchestration.plan_steps
DROP CONSTRAINT IF EXISTS plan_steps_kind_check;

ALTER TABLE orchestration.plan_steps
ADD CONSTRAINT plan_steps_kind_check CHECK (
    kind IN (
        'sql','rest','graphql','ai_transform',
        'intent_classify','policy_route','intent_validate',
        'adapter_analyze','prompt_run','document_generate',
        'human_review','webhook','agent_task'
    )
);

-- ============================================================================
-- ORCH-004: execution_steps, eivs.* schema, intent_plan_mappings
-- ============================================================================

-- ── 1. orchestration.execution_steps — per-step trace for every execution ──
CREATE TABLE IF NOT EXISTS orchestration.execution_steps (
    execution_step_id UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    execution_id      UUID        NOT NULL REFERENCES orchestration.executions(execution_id) ON DELETE CASCADE,
    plan_step_id      UUID,
    step_key          TEXT        NOT NULL,
    kind              TEXT        NOT NULL,
    status            TEXT        NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','running','success','skipped','failed')),
    request_json      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    response_json     JSONB       NOT NULL DEFAULT '{}'::jsonb,
    error_json        JSONB       NOT NULL DEFAULT '{}'::jsonb,
    evidence_json     JSONB       NOT NULL DEFAULT '{}'::jsonb,
    retry_count       INT         NOT NULL DEFAULT 0,
    started_at        TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    duration_ms       INT         NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_execution_steps_execution_id
    ON orchestration.execution_steps (execution_id);

CREATE INDEX IF NOT EXISTS idx_execution_steps_status
    ON orchestration.execution_steps (status);

CREATE INDEX IF NOT EXISTS idx_execution_steps_step_key
    ON orchestration.execution_steps (step_key);

CREATE INDEX IF NOT EXISTS idx_execution_steps_kind
    ON orchestration.execution_steps (kind);


-- ── 2. orchestration.intent_plan_mappings — intent code → plan to run ──────
CREATE TABLE IF NOT EXISTS orchestration.intent_plan_mappings (
    mapping_id   UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id    TEXT        NOT NULL,
    intent_code  TEXT        NOT NULL,
    entity_type  TEXT        NOT NULL DEFAULT 'email',
    plan_name    TEXT        NOT NULL,
    channel      TEXT        DEFAULT 'email',
    locale       TEXT        DEFAULT 'multi',
    rank         INT         NOT NULL DEFAULT 1,
    is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
    created_by   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, intent_code, entity_type, channel, locale, rank)
);

CREATE INDEX IF NOT EXISTS idx_intent_plan_mappings_lookup
    ON orchestration.intent_plan_mappings (tenant_id, intent_code, entity_type, is_active);


-- ── 3. eivs.* schema — real schema from EIVS source, reproduced as-is ──────
-- (see docs/adr/ADR-001-eivs-orchestration-integration.md — EIVS data access
--  always goes through EIVS's own service-layer functions, never raw SQL
--  against these tables from orchestration code)

CREATE SCHEMA IF NOT EXISTS eivs;

CREATE TABLE IF NOT EXISTS eivs.intents (
    intent_id      SERIAL PRIMARY KEY,
    intent_code    TEXT UNIQUE NOT NULL,
    display_name   TEXT NOT NULL,
    description    TEXT,
    category       TEXT,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    tenant_id      TEXT NOT NULL,
    CONSTRAINT uq_eivs_intent_tenant_name UNIQUE (tenant_id, intent_code)
);

CREATE TABLE IF NOT EXISTS eivs.intent_policies (
    intent_id               INTEGER NOT NULL REFERENCES eivs.intents(intent_id) ON DELETE CASCADE,
    language_code           VARCHAR(10) NOT NULL DEFAULT 'multi',
    n8n_orchestration_url   TEXT,
    auto_process_min_conf   NUMERIC(5,2) NOT NULL,
    manual_review_min_conf  NUMERIC(5,2) NOT NULL,
    reroute_email           TEXT,
    multi_intent_mode       TEXT NOT NULL DEFAULT 'STRICT_SINGLE',
    allow_multi_auto        BOOLEAN NOT NULL DEFAULT FALSE,
    allow_subset_auto       BOOLEAN NOT NULL DEFAULT FALSE,
    tenant_id                TEXT NOT NULL,
    PRIMARY KEY (intent_id, language_code)
);

CREATE TABLE IF NOT EXISTS eivs.email_intent_runs (
    intent_run_id       UUID PRIMARY KEY,
    tenant_id           TEXT NOT NULL,
    email_id            TEXT NOT NULL,
    sender_email        TEXT NOT NULL,
    correlation_id      VARCHAR(255) NOT NULL,
    language_detected   VARCHAR(10),
    intents_json        JSONB NOT NULL,
    primary_intent_code TEXT,
    primary_intent_conf NUMERIC(5,2),
    coverage_status     TEXT,
    routing_decision    TEXT NOT NULL,
    reroute_email       TEXT,
    routing_reasons_json JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_intent_runs_email
    ON eivs.email_intent_runs (tenant_id, email_id);

CREATE TABLE IF NOT EXISTS eivs.llm_prompts (
    prompt_id         UUID PRIMARY KEY,
    tenant_id         TEXT NOT NULL,
    intent_run_id     UUID NULL REFERENCES eivs.email_intent_runs(intent_run_id) ON DELETE CASCADE,
    validation_run_id UUID NULL,
    prompt_type       TEXT NOT NULL,
    model_name        TEXT NOT NULL,
    backend           TEXT NOT NULL,
    request_messages  JSONB NULL,
    request_payload   JSONB NOT NULL,
    response_payload  JSONB NOT NULL,
    tokens_prompt     INTEGER,
    tokens_completion INTEGER,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eivs.datasources (
    datasource_id SERIAL PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    datasource_type TEXT NOT NULL,
    connection_key TEXT NOT NULL,
    description   TEXT,
    tenant_id TEXT NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_eivs_datasources_tenant_name UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS eivs.datasource_configs (
    config_id            SERIAL PRIMARY KEY,
    name                 TEXT NOT NULL UNIQUE,
    protocol             TEXT NOT NULL,
    driver_family        TEXT NOT NULL,
    base_url             TEXT,
    auth_type            TEXT,
    auth_config          JSONB,
    connection_json      JSONB,
    metadata_ref         TEXT,
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    router_base_url      TEXT,
    vault_secret_path    TEXT,
    pool_size            INTEGER DEFAULT 20,
    max_overflow         INTEGER DEFAULT 10,
    pool_timeout_seconds INTEGER DEFAULT 30,
    pool_recycle_seconds INTEGER DEFAULT 180,
    tenant_id            TEXT NOT NULL,
    sgate_enabled BOOLEAN DEFAULT TRUE,
    profiling_enabled BOOLEAN DEFAULT FALSE,
    profiling_sample_limit INTEGER DEFAULT 50,
    default_execute BOOLEAN DEFAULT TRUE,
    default_result_format TEXT DEFAULT 'TABULAR_JSON',
    driver_service_url TEXT,
    CONSTRAINT datasource_configs_tenant_name_key UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_eivs_datasource_configs_tenant
    ON eivs.datasource_configs (tenant_id);

CREATE TABLE IF NOT EXISTS eivs.validation_rules (
    rule_id        SERIAL PRIMARY KEY,
    intent_id      INTEGER NOT NULL REFERENCES eivs.intents(intent_id) ON DELETE CASCADE,
    language_code  VARCHAR(10) NOT NULL DEFAULT 'multi',
    tenant_id      TEXT NOT NULL,
    rule_code      TEXT NOT NULL,
    rule_name      TEXT NOT NULL,
    rule_description TEXT NOT NULL,
    datasource_id  INTEGER NOT NULL REFERENCES eivs.datasources(datasource_id),
    execution_order INTEGER NOT NULL,
    severity       TEXT NOT NULL DEFAULT 'CRITICAL',
    is_active      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_validation_rules_intent_lang
    ON eivs.validation_rules (intent_id, language_code, execution_order);

CREATE INDEX IF NOT EXISTS idx_eivs_validation_rules_tenant
    ON eivs.validation_rules (tenant_id);

CREATE TABLE IF NOT EXISTS eivs.validation_runs (
    validation_run_id     UUID PRIMARY KEY,
    intent_run_id         UUID NOT NULL REFERENCES eivs.email_intent_runs(intent_run_id) ON DELETE CASCADE,
    intent_code           TEXT NOT NULL,
    overall_status        TEXT NOT NULL,
    validation_success_json JSONB NOT NULL,
    validation_failure_json JSONB NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_validation_runs_intent_run
    ON eivs.validation_runs (intent_run_id);

DROP VIEW IF EXISTS eivs.email_search_view;

CREATE VIEW eivs.email_search_view AS
SELECT
    eir.intent_run_id,
    eir.tenant_id,
    eir.email_id,
    eir.sender_email,
    eir.created_at,
    eir.primary_intent_code,
    eir.routing_decision,
    vr.overall_status AS validation_overall_status
FROM eivs.email_intent_runs eir
LEFT JOIN eivs.validation_runs vr
  ON vr.intent_run_id = eir.intent_run_id;


-- ── 4. Link EIVS rows back to the orchestration execution that triggered them ──
ALTER TABLE eivs.email_intent_runs
    ADD COLUMN IF NOT EXISTS execution_id UUID;

ALTER TABLE eivs.validation_runs
    ADD COLUMN IF NOT EXISTS execution_id UUID;

CREATE INDEX IF NOT EXISTS idx_email_intent_runs_execution
    ON eivs.email_intent_runs (execution_id);

CREATE INDEX IF NOT EXISTS idx_validation_runs_execution
    ON eivs.validation_runs (execution_id);

-- ============================================================================
-- ORCH-010: plan contract columns — input/output schema, example request
-- ============================================================================
ALTER TABLE orchestration.plans
    ADD COLUMN IF NOT EXISTS input_schema_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE orchestration.plans
    ADD COLUMN IF NOT EXISTS output_schema_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE orchestration.plans
    ADD COLUMN IF NOT EXISTS example_request_json JSONB NOT NULL DEFAULT '{}'::jsonb;


    -- ============================================================================
-- AGENT-001: Add agent_task to plan_steps.kind CHECK constraint
-- ============================================================================
ALTER TABLE orchestration.plan_steps
    DROP CONSTRAINT IF EXISTS plan_steps_kind_check;

ALTER TABLE orchestration.plan_steps
    ADD CONSTRAINT plan_steps_kind_check CHECK (kind IN (
        'sql','rest','graphql','ai_transform',
        'intent_classify','policy_route','intent_validate','adapter_analyze',
        'prompt_run','document_generate','human_review','webhook',
        'agent_task'
    ));

    -- ============================================================================
-- AGENT-001: Add agent_task to plan_steps.kind CHECK constraint
-- ============================================================================
ALTER TABLE orchestration.plan_steps
    DROP CONSTRAINT IF EXISTS plan_steps_kind_check;

ALTER TABLE orchestration.plan_steps
    ADD CONSTRAINT plan_steps_kind_check CHECK (kind IN (
        'sql','rest','graphql','ai_transform',
        'intent_classify','policy_route','intent_validate','adapter_analyze',
        'prompt_run','document_generate','human_review','webhook',
        'agent_task'
    ));

-- ============================================================================
-- AGENT-002: Agent runtime DB tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS orchestration.agent_task_runs (
    agent_run_id        UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id        UUID          NOT NULL REFERENCES orchestration.executions(execution_id) ON DELETE CASCADE,
    execution_step_id   UUID,
    tenant_id           TEXT          NOT NULL DEFAULT 'global',
    plan_name           TEXT          NOT NULL,
    step_key            TEXT          NOT NULL,
    prompt_id           TEXT,
    prompt_version      TEXT,
    goal                TEXT          NOT NULL,
    status              TEXT          NOT NULL DEFAULT 'running'
                            CHECK (status IN (
                                'running','success','failed',
                                'needs_approval','needs_human_review',
                                'budget_exceeded','output_invalid'
                            )),
    input_json          JSONB         NOT NULL DEFAULT '{}'::jsonb,
    output_json         JSONB         NOT NULL DEFAULT '{}'::jsonb,
    error_json          JSONB         NOT NULL DEFAULT '{}'::jsonb,
    budgets_json        JSONB         NOT NULL DEFAULT '{}'::jsonb,
    usage_json          JSONB         NOT NULL DEFAULT '{}'::jsonb,
    approval_json       JSONB         NOT NULL DEFAULT '{}'::jsonb,
    started_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    completed_at        TIMESTAMPTZ,
    duration_ms         INT           NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_agent_task_runs_execution
    ON orchestration.agent_task_runs (execution_id);

CREATE INDEX IF NOT EXISTS idx_agent_task_runs_tenant
    ON orchestration.agent_task_runs (tenant_id);

CREATE INDEX IF NOT EXISTS idx_agent_task_runs_status
    ON orchestration.agent_task_runs (status);

CREATE TABLE IF NOT EXISTS orchestration.agent_task_trace_events (
    trace_event_id  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_run_id    UUID        NOT NULL REFERENCES orchestration.agent_task_runs(agent_run_id) ON DELETE CASCADE,
    execution_id    UUID        NOT NULL,
    step_key        TEXT        NOT NULL,
    event_index     INT         NOT NULL,
    event_type      TEXT        NOT NULL
                        CHECK (event_type IN (
                            'thought','tool_selected','tool_request','tool_response',
                            'model_request','model_response','guardrail_check',
                            'approval_requested','approval_resolved',
                            'output_validation','budget_check',
                            'final_answer','error'
                        )),
    event_json      JSONB       NOT NULL DEFAULT '{}'::jsonb,
    redacted        BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (agent_run_id, event_index)
);

CREATE INDEX IF NOT EXISTS idx_agent_trace_events_run
    ON orchestration.agent_task_trace_events (agent_run_id);

CREATE INDEX IF NOT EXISTS idx_agent_trace_events_execution
    ON orchestration.agent_task_trace_events (execution_id);

CREATE TABLE IF NOT EXISTS orchestration.agent_task_approvals (
    approval_id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_run_id            UUID        NOT NULL REFERENCES orchestration.agent_task_runs(agent_run_id) ON DELETE CASCADE,
    execution_id            UUID        NOT NULL,
    tenant_id               TEXT        NOT NULL DEFAULT 'global',
    step_key                TEXT        NOT NULL,
    approval_type           TEXT        NOT NULL,
    requested_action_json   JSONB       NOT NULL DEFAULT '{}'::jsonb,
    status                  TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','approved','rejected','expired')),
    requested_by            TEXT,
    reviewed_by             TEXT,
    requested_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at             TIMESTAMPTZ,
    expires_at              TIMESTAMPTZ,
    decision_reason         TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_approvals_run
    ON orchestration.agent_task_approvals (agent_run_id);

CREATE INDEX IF NOT EXISTS idx_agent_approvals_status
    ON orchestration.agent_task_approvals (status);

CREATE INDEX IF NOT EXISTS idx_agent_approvals_tenant
    ON orchestration.agent_task_approvals (tenant_id);

-- ============================================================================
-- END OF SCHEMA


-- ============================================================================
-- NOC-A/B/C/D: real 3-way routing, agent_task fallback, and pause/resume
-- for human_review — per Surya's exact design (July 2026)
-- ============================================================================

-- ── NOC-C: executions can now be 'paused' (waiting on human review) ────────
ALTER TABLE orchestration.executions
    DROP CONSTRAINT IF EXISTS executions_status_check;
ALTER TABLE orchestration.executions
    ADD CONSTRAINT executions_status_check CHECK (
        status IN ('success','partial','failed','paused')
    );

-- ── NOC-D: real approval records for standalone human_review steps ─────────
-- (agent_task already had orchestration.agent_task_approvals — this is the
--  same idea for plan-level human_review steps, which had nothing before.)
CREATE TABLE IF NOT EXISTS orchestration.human_review_approvals (
    approval_id     UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    execution_id    UUID        NOT NULL REFERENCES orchestration.executions(execution_id) ON DELETE CASCADE,
    step_key        TEXT        NOT NULL,
    tenant_id       TEXT        NOT NULL DEFAULT 'global',
    status          TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected')),
    reason          TEXT,
    context_json    JSONB       NOT NULL DEFAULT '{}'::jsonb,
    requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_by     TEXT,
    reviewed_at     TIMESTAMPTZ,
    decision_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_human_review_approvals_execution
    ON orchestration.human_review_approvals (execution_id);

CREATE INDEX IF NOT EXISTS idx_human_review_approvals_status
    ON orchestration.human_review_approvals (status);
-- ITSM tickets used to live only in an in-memory dict (services/main.py's
-- _itsm_tickets), which meant every backend restart silently wiped them —
-- confirmed as the real cause of tickets "disappearing" during heavy dev
-- testing. Persisted here so they survive restarts like everything else.
CREATE TABLE IF NOT EXISTS orchestration.itsm_tickets (
    ticket_id     TEXT        PRIMARY KEY,
    summary       TEXT        NOT NULL,
    description   TEXT,
    priority      TEXT        NOT NULL DEFAULT 'MEDIUM',
    status        TEXT        NOT NULL DEFAULT 'OPEN',
    itsm_system   TEXT        NOT NULL DEFAULT 'SERVICENOW',
    evidence_id   TEXT,
    intent        TEXT,
    tenant_id     TEXT        NOT NULL DEFAULT 'global',
    created_by    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolution    TEXT,
    url           TEXT,
    execution_id  TEXT,
    step_key      TEXT,
    review_id     TEXT
);

CREATE INDEX IF NOT EXISTS idx_itsm_tickets_status
    ON orchestration.itsm_tickets (status);

CREATE INDEX IF NOT EXISTS idx_itsm_tickets_review_id
    ON orchestration.itsm_tickets (review_id);
ALTER TABLE orchestration.itsm_tickets
    ADD COLUMN IF NOT EXISTS ticket_type TEXT NOT NULL DEFAULT 'human_review';

CREATE INDEX IF NOT EXISTS idx_human_review_approvals_tenant
    ON orchestration.human_review_approvals (tenant_id);

-- ============================================================================
-- NOC-A follow-up + NOC-B: wire the agent_task identity-mismatch fallback
-- into loan_noc_email_processing, exactly as designed:
--   "if the email did not match but everything else looks correct" ->
--   agent tries to resolve it with alternate evidence -> only escalates to
--   human_review if it can't.
-- For that scenario to actually be reachable, sender_email_match can no
-- longer be CRITICAL (a CRITICAL failure always yields overall_status =
-- 'FAILED', never 'PARTIAL' — see eivs/validation_orchestrator.py
-- _compute_overall_status). loan_account_exists and loan_status_closed
-- stay CRITICAL: no amount of alternate evidence should override the loan
-- itself not existing or not being closed.
-- ============================================================================
UPDATE eivs.validation_rules
SET severity = 'WARNING'
WHERE tenant_id = 'demo' AND rule_code = 'sender_email_match';

DO $$
DECLARE
    v_plan_id UUID;
BEGIN
    SELECT plan_id INTO v_plan_id
    FROM orchestration.plans
    WHERE name = 'loan_noc_email_processing';

    IF v_plan_id IS NULL THEN
        RAISE NOTICE 'loan_noc_email_processing plan not found — skipping NOC-B seed (run the ORCH-032 seed block first)';
        RETURN;
    END IF;

    -- New step: agent_task fallback for a sender-email mismatch alone.
    -- allowed_tools includes human_review so the agent can escalate itself
    -- ("if it cannot resolve it, only then it goes to human review")
    -- instead of a separate plan step handling that branch.
    INSERT INTO orchestration.plan_steps (
        plan_id, step_key, step_order, kind, datasource_name,
        depends_on, condition_expr, input_bindings_json, timeout_ms, enabled
    ) VALUES (
        v_plan_id, 'resolve_identity_mismatch', 4, 'agent_task', '',
        ARRAY['validate_customer_and_loan']::TEXT[],
        'results.validate_customer_and_loan.overall_status == ''PARTIAL''',
        '{
            "prompt_ref": {"prompt_id": "noc-identity-mismatch-resolver"},
            "goal": "The sender email on an NOC request did not match CRM records, but the loan account and its CLOSED status both checked out. Use datasource_lookup to check the CRM customer record''s phone number, full name, and any address on file against what is known from this request. If at least 2 independent signals (e.g. phone + name) support that the sender is genuinely the customer on this loan, return final_output with resolved=true and list the matching evidence. If you cannot find enough matching evidence, call the human_review tool with a clear reason instead of guessing — do not return resolved=true unless you are confident.",
            "allowed_tools": ["datasource_lookup", "human_review"],
            "budgets": {"max_iterations": 5, "max_model_calls": 8, "max_tool_calls": 10, "max_cost_usd": 0.50, "timeout_ms": 60000},
            "output_schema": {
                "type": "object",
                "required": ["resolved", "evidence"],
                "properties": {
                    "resolved": {"type": "boolean"},
                    "evidence": {"type": "array", "items": {"type": "string"}}
                }
            },
            "approval_policy": {"mode": "auto_for_read_only", "require_approval_for": ["human_review"]},
            "fallback_policy": {"on_output_invalid": "human_review", "on_budget_exceeded": "human_review"}
        }'::jsonb,
        60000, TRUE
    )
    ON CONFLICT (plan_id, step_key) DO UPDATE SET
        kind = EXCLUDED.kind,
        enabled = TRUE,
        condition_expr = EXCLUDED.condition_expr,
        depends_on = EXCLUDED.depends_on,
        input_bindings_json = EXCLUDED.input_bindings_json,
        timeout_ms = EXCLUDED.timeout_ms;

    -- generate_customer_response now runs either on a clean SUCCESS, or
    -- after resolve_identity_mismatch resolved a PARTIAL mismatch. It still
    -- only depends_on validate_customer_and_loan (NOT resolve_identity_
    -- mismatch) — asteval short-circuits "or"/"and" like real Python, so
    -- when overall_status == 'SUCCESS' the right-hand side referencing
    -- resolve_identity_mismatch is never evaluated and can't KeyError on a
    -- step that never ran. When overall_status == 'FAILED' (loan itself
    -- didn't check out), neither side is true and this step correctly
    -- never runs.
    UPDATE orchestration.plan_steps
    SET condition_expr = 'results.validate_customer_and_loan.overall_status == ''SUCCESS'' or (results.validate_customer_and_loan.overall_status == ''PARTIAL'' and results.resolve_identity_mismatch.output.resolved == True)'
    WHERE plan_id = v_plan_id AND step_key = 'generate_customer_response';


END $$;