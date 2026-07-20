-- ============================================================================
-- PB-001: Prompt Builder Database Migration
-- ============================================================================
-- 
-- Goal: Add all Prompt Builder tables WITHOUT disturbing existing
--       template_builder tables.
-- 
-- Schema:  prompt_builder
-- Tables:  10 (prompts, prompt_versions, prompt_blocks, prompt_inputs,
--          prompt_context_bindings, prompt_test_cases, prompt_runs,
--          prompt_run_traces, prompt_evaluations, prompt_approvals)
-- 
-- Safety:  Every statement uses IF NOT EXISTS — re-running this script
--          is safe and idempotent. Will not modify existing template_builder.
-- ============================================================================

-- ─── 1. Required extension ──────────────────────────────────────────────────
-- uuid-ossp provides uuid_generate_v4(). Already used by template_builder
-- schema, so this is almost certainly already installed. Safe either way.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── 2. Create the prompt_builder schema ────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS prompt_builder;

-- ─── 3. Table: prompts (the parent entity) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS prompt_builder.prompts (
  prompt_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name               TEXT NOT NULL,
  description        TEXT,
  use_case           TEXT,
  industry           TEXT,
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','testing','in_review','approved','published','deprecated','archived')),
  owner              TEXT,
  default_locale     TEXT NOT NULL DEFAULT 'en',
  supported_locales  TEXT[] NOT NULL DEFAULT ARRAY['en'],
  tags               TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_by         TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prompts_status   ON prompt_builder.prompts(status);
CREATE INDEX IF NOT EXISTS idx_prompts_use_case ON prompt_builder.prompts(use_case);

-- ─── 4. Table: prompt_versions (immutable snapshots) ────────────────────────
CREATE TABLE IF NOT EXISTS prompt_builder.prompt_versions (
  version_id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prompt_id             UUID NOT NULL REFERENCES prompt_builder.prompts(prompt_id) ON DELETE CASCADE,
  version_number        INT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','testing','approved','published','deprecated')),
  model_policy_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  compiled_prompt_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  input_schema_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_schema_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  guardrails_json       JSONB NOT NULL DEFAULT '{}'::jsonb,
  change_summary        TEXT,
  created_by            TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by           TEXT,
  approved_at           TIMESTAMPTZ,
  UNIQUE(prompt_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_prompt_versions_prompt ON prompt_builder.prompt_versions(prompt_id);

-- ─── 5. Table: prompt_blocks (typed structured pieces) ──────────────────────
CREATE TABLE IF NOT EXISTS prompt_builder.prompt_blocks (
  block_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prompt_id       UUID NOT NULL REFERENCES prompt_builder.prompts(prompt_id) ON DELETE CASCADE,
  version_id      UUID REFERENCES prompt_builder.prompt_versions(version_id) ON DELETE CASCADE,
  block_type      TEXT NOT NULL CHECK (
                  block_type IN ('system','role','task','instruction','business_rule','context','retrieval','tool_call','output_schema','example','fallback','safety')
                  ),
  sequence_no     INT NOT NULL,
  title           TEXT,
  content         TEXT NOT NULL DEFAULT '',
  variables_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_required     BOOLEAN NOT NULL DEFAULT false,
  metadata_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prompt_blocks_prompt ON prompt_builder.prompt_blocks(prompt_id);

-- ─── 6. Table: prompt_inputs (typed runtime parameters) ─────────────────────
CREATE TABLE IF NOT EXISTS prompt_builder.prompt_inputs (
  input_id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prompt_id                 UUID NOT NULL REFERENCES prompt_builder.prompts(prompt_id) ON DELETE CASCADE,
  name                      TEXT NOT NULL,
  label                     TEXT,
  type                      TEXT NOT NULL DEFAULT 'string'
                            CHECK (type IN ('string','number','boolean','date','datetime','json','array')),
  required                  BOOLEAN NOT NULL DEFAULT true,
  default_value             TEXT,
  validation_json           JSONB NOT NULL DEFAULT '{}'::jsonb,
  description               TEXT,
  sensitive_classification  TEXT DEFAULT 'internal',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(prompt_id, name)
);

-- ─── 7. Table: prompt_context_bindings (where data comes from) ──────────────
CREATE TABLE IF NOT EXISTS prompt_builder.prompt_context_bindings (
  binding_id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prompt_id               UUID NOT NULL REFERENCES prompt_builder.prompts(prompt_id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  source_type             TEXT NOT NULL CHECK (source_type IN ('runtime','static','datasource','semantic_model','document_template','api')),
  datasource_id           INT,
  semantic_entity         TEXT,
  field_list_json         JSONB NOT NULL DEFAULT '[]'::jsonb,
  filter_json             JSONB NOT NULL DEFAULT '{}'::jsonb,
  retrieval_policy_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  max_records             INT DEFAULT 1,
  metadata_json           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 8. Table: prompt_test_cases (golden test examples) ─────────────────────
CREATE TABLE IF NOT EXISTS prompt_builder.prompt_test_cases (
  test_id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prompt_id              UUID NOT NULL REFERENCES prompt_builder.prompts(prompt_id) ON DELETE CASCADE,
  name                   TEXT NOT NULL,
  description            TEXT,
  runtime_params_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  expected_output_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  expected_checks_json   JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by             TEXT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 9. Table: prompt_runs (execution history) ──────────────────────────────
CREATE TABLE IF NOT EXISTS prompt_builder.prompt_runs (
  run_id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prompt_id              UUID NOT NULL REFERENCES prompt_builder.prompts(prompt_id),
  version_id             UUID REFERENCES prompt_builder.prompt_versions(version_id),
  status                 TEXT NOT NULL CHECK (status IN ('queued','running','success','error')),
  runtime_params_json    JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_context_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_json            JSONB,
  raw_output             TEXT,
  model_used             TEXT,
  tokens_input           INT DEFAULT 0,
  tokens_output          INT DEFAULT 0,
  latency_ms             INT DEFAULT 0,
  cost_estimate          NUMERIC(12,6) DEFAULT 0,
  error_message          TEXT,
  created_by             TEXT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prompt_runs_prompt ON prompt_builder.prompt_runs(prompt_id);
CREATE INDEX IF NOT EXISTS idx_prompt_runs_status ON prompt_builder.prompt_runs(status);

-- ─── 10. Table: prompt_run_traces (step-by-step trace) ──────────────────────
CREATE TABLE IF NOT EXISTS prompt_builder.prompt_run_traces (
  trace_id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id          UUID NOT NULL REFERENCES prompt_builder.prompt_runs(run_id) ON DELETE CASCADE,
  step_name       TEXT NOT NULL,
  step_type       TEXT NOT NULL,
  input_json      JSONB,
  output_json     JSONB,
  latency_ms      INT DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'success',
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 11. Table: prompt_evaluations (test results) ───────────────────────────
CREATE TABLE IF NOT EXISTS prompt_builder.prompt_evaluations (
  evaluation_id  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prompt_id      UUID NOT NULL REFERENCES prompt_builder.prompts(prompt_id) ON DELETE CASCADE,
  run_id         UUID REFERENCES prompt_builder.prompt_runs(run_id) ON DELETE CASCADE,
  test_id        UUID REFERENCES prompt_builder.prompt_test_cases(test_id) ON DELETE SET NULL,
  score_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  passed         BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 12. Table: prompt_approvals (review workflow) ──────────────────────────
CREATE TABLE IF NOT EXISTS prompt_builder.prompt_approvals (
  approval_id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prompt_id     UUID NOT NULL REFERENCES prompt_builder.prompts(prompt_id) ON DELETE CASCADE,
  version_id    UUID REFERENCES prompt_builder.prompt_versions(version_id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('requested','approved','rejected')),
  requested_by  TEXT NOT NULL,
  reviewed_by   TEXT,
  comments      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at   TIMESTAMPTZ
);
-- ─── 13. Table: audit_events ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prompt_builder.audit_events (
  event_id     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type  TEXT NOT NULL,
  entity_id    TEXT NOT NULL,
  action       TEXT NOT NULL,
  actor        TEXT NOT NULL,
  summary      TEXT,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON prompt_builder.audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor  ON prompt_builder.audit_events(actor);
-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
-- Verify by running:
--   SELECT table_name FROM information_schema.tables 
--   WHERE table_schema = 'prompt_builder' ORDER BY table_name;
-- 
-- Expected output: 10 rows
--   prompt_approvals
--   prompt_blocks
--   prompt_context_bindings
--   prompt_evaluations
--   prompt_inputs
--   prompt_run_traces
--   prompt_runs
--   prompt_test_cases
--   prompt_versions
--   prompts
-- ============================================================================