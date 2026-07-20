-- =============================================================================
-- FlowEngine 2.0 — Full Schema (Raw SQL)
-- File: init_schema.sql (place in project root)
-- Run once on startup via database.py
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS eivs;

CREATE TABLE IF NOT EXISTS auth.tenant_milestones (
    tenant_id     TEXT        NOT NULL,
    milestone_key TEXT        NOT NULL,
    achieved_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, milestone_key)
);
CREATE INDEX IF NOT EXISTS idx_tenant_milestones_tenant ON auth.tenant_milestones (tenant_id);


-- ── 9. auth.modules ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth.module_groups (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(100) NOT NULL,
    description   TEXT,
    display_order INTEGER      NOT NULL DEFAULT 0,
    status        VARCHAR(20)  NOT NULL DEFAULT 'active',
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_module_groups_name   UNIQUE (name),
    CONSTRAINT chk_module_groups_status CHECK (status IN ('active', 'inactive'))
);
CREATE INDEX IF NOT EXISTS idx_module_groups_status        ON auth.module_groups (status);
CREATE INDEX IF NOT EXISTS idx_module_groups_display_order ON auth.module_groups (display_order);

CREATE TABLE IF NOT EXISTS auth.modules (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(100) NOT NULL,
    description         TEXT         NOT NULL,
    icon                VARCHAR(255),
    version             VARCHAR(20)  NOT NULL DEFAULT '1.0.0',
    display_order       INTEGER      NOT NULL DEFAULT 0,
    features            JSONB        NOT NULL DEFAULT '[]',
    default_permissions JSONB        NOT NULL DEFAULT '[]',
    is_default          BOOLEAN      NOT NULL DEFAULT FALSE,
    status              VARCHAR(20)  NOT NULL DEFAULT 'active',
    created_by          TEXT,
    sidebar_items       JSONB        NOT NULL DEFAULT '[]',
    external_url        TEXT,
    group_id            UUID         REFERENCES auth.module_groups(id) ON DELETE SET NULL,
    free_plan           BOOLEAN      NOT NULL DEFAULT FALSE,
    trial_weeks         INTEGER      NOT NULL DEFAULT 2,
    api_calls_allowed   INTEGER      NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_modules_name   UNIQUE (name),
    CONSTRAINT chk_modules_status CHECK (status IN ('active', 'inactive', 'archived'))
);
CREATE INDEX IF NOT EXISTS idx_modules_status        ON auth.modules (status);
CREATE INDEX IF NOT EXISTS idx_modules_is_default    ON auth.modules (is_default);
CREATE INDEX IF NOT EXISTS idx_modules_display_order ON auth.modules (display_order);
CREATE INDEX IF NOT EXISTS idx_modules_group_id      ON auth.modules (group_id);

-- ── 10. auth.api_clients ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth.api_clients (
    id                 UUID    PRIMARY KEY,
    tenant_id          TEXT    NOT NULL,
    key_id             TEXT    NOT NULL,
    key_secret_hash    TEXT    NOT NULL,
    api_key            TEXT    NOT NULL,
    status             TEXT    NOT NULL DEFAULT 'active',
    scopes             JSONB   NOT NULL DEFAULT '[]',
    roles              JSONB   NOT NULL DEFAULT '[]',
    rate_limit_per_min INTEGER NOT NULL DEFAULT 60,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at         TIMESTAMPTZ,
    last_used_at       TIMESTAMPTZ,
    CONSTRAINT uq_api_clients_key_id UNIQUE (key_id)
);
CREATE INDEX IF NOT EXISTS idx_api_clients_tenant_status ON auth.api_clients (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_api_clients_key_id        ON auth.api_clients (key_id);




-- =============================================================================
-- EIVS SCHEMA
-- =============================================================================

-- ── 13. eivs.datasources ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS eivs.datasources (
    datasource_id    SERIAL  PRIMARY KEY,
    tenant_id        TEXT    NOT NULL DEFAULT 'global',
    name             TEXT    NOT NULL,
    datasource_type  TEXT    NOT NULL,
    connection_key   TEXT    NOT NULL,
    description      TEXT,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    datasource_mode  TEXT    NOT NULL DEFAULT 'data',
    CONSTRAINT uq_eivs_datasources_tenant_name UNIQUE (tenant_id, name),
    CONSTRAINT uq_eivs_datasources_tenant_id   UNIQUE (tenant_id, datasource_id),
    CONSTRAINT chk_eivs_datasources_mode CHECK (datasource_mode IN ('query', 'data'))
);
CREATE INDEX IF NOT EXISTS idx_eivs_datasources_tenant ON eivs.datasources (tenant_id);

-- ── 14. eivs.datasource_configs ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS eivs.datasource_configs (
    config_id                INTEGER     PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    name                     TEXT        NOT NULL,
    tenant_id                TEXT        NOT NULL DEFAULT 'global',
    protocol                 TEXT        NOT NULL,
    driver_family            TEXT        NOT NULL,
    base_url                 TEXT,
    auth_type                TEXT,
    auth_config              JSON,
    connection_json          JSON,
    metadata_ref             TEXT,
    is_active                BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    router_base_url          TEXT,
    vault_secret_path        TEXT,
    pool_size                INTEGER     DEFAULT 20,
    max_overflow             INTEGER     DEFAULT 10,
    pool_timeout_seconds     INTEGER     DEFAULT 30,
    pool_recycle_seconds     INTEGER     DEFAULT 180,
    sgate_enabled            BOOLEAN     DEFAULT TRUE,
    profiling_enabled        BOOLEAN     DEFAULT FALSE,
    profiling_sample_limit   INTEGER     DEFAULT 50,
    default_execute          BOOLEAN     DEFAULT TRUE,
    default_result_format    TEXT        DEFAULT 'TABULAR_JSON',
    driver_service_url       TEXT,
    CONSTRAINT datasource_configs_tenant_name_key UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_eivs_datasource_configs_tenant ON eivs.datasource_configs (tenant_id);

-- ── 15. eivs.intents ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS eivs.intents (
    intent_id    SERIAL  PRIMARY KEY,
    intent_code  TEXT    NOT NULL,
    tenant_id    TEXT    NOT NULL DEFAULT 'global',
    display_name TEXT    NOT NULL,
    description  TEXT,
    category     TEXT,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_eivs_intent_tenant_name UNIQUE (tenant_id, intent_code),
    CONSTRAINT uq_eivs_intents_tenant_id  UNIQUE (tenant_id, intent_id)
);
CREATE INDEX IF NOT EXISTS idx_eivs_intents_tenant ON eivs.intents (tenant_id);

-- ── 16. eivs.intent_policies ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS eivs.intent_policies (
    tenant_id              TEXT        NOT NULL DEFAULT 'global',
    intent_id              INTEGER     NOT NULL,
    language_code          VARCHAR(10) NOT NULL DEFAULT 'multi',
    n8n_orchestration_url  TEXT,
    auto_process_min_conf  NUMERIC(5,2) NOT NULL,
    manual_review_min_conf NUMERIC(5,2) NOT NULL,
    reroute_email          TEXT,
    multi_intent_mode      TEXT        NOT NULL DEFAULT 'STRICT_SINGLE',
    allow_multi_auto       BOOLEAN     NOT NULL DEFAULT FALSE,
    allow_subset_auto      BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at             TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMP   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, intent_id, language_code),
    FOREIGN KEY (tenant_id, intent_id) REFERENCES eivs.intents(tenant_id, intent_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_eivs_intent_policies_tenant ON eivs.intent_policies (tenant_id);

-- ── 17. eivs.validation_rules ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS eivs.validation_rules (
    rule_id         SERIAL      PRIMARY KEY,
    intent_id       INTEGER     NOT NULL,
    language_code   VARCHAR(10) NOT NULL DEFAULT 'multi',
    tenant_id       TEXT        NOT NULL DEFAULT 'global',
    rule_code       TEXT        NOT NULL,
    rule_name       TEXT        NOT NULL,
    rule_description TEXT       NOT NULL,
    datasource_id   INTEGER     NOT NULL,
    execution_order INTEGER     NOT NULL,
    severity        TEXT        NOT NULL DEFAULT 'CRITICAL',
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_validation_rules_tenant_intent_code UNIQUE (tenant_id, intent_id, rule_code),
    FOREIGN KEY (tenant_id, intent_id)       REFERENCES eivs.intents(tenant_id, intent_id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, datasource_id)   REFERENCES eivs.datasources(tenant_id, datasource_id)
);
CREATE INDEX IF NOT EXISTS idx_validation_rules_intent_lang  ON eivs.validation_rules (intent_id, language_code, execution_order);
CREATE INDEX IF NOT EXISTS idx_eivs_validation_rules_tenant  ON eivs.validation_rules (tenant_id);

-- =============================================================================
-- SEED DATA
-- =============================================================================

-- Default modules
INSERT INTO auth.modules (name, description, icon, version, display_order, features, is_default, status, sidebar_items, default_permissions)
VALUES
    ('email_validate', 'Validate, verify and enrich email addresses in real-time with enterprise-grade accuracy and deliverability scoring.', 'mail-check', '1.0.0', 1,
     '["Real-time email syntax and format validation", "MX record and DNS lookup verification", "Disposable and role-based address detection", "Deliverability scoring and risk classification", "Bulk validation via API with rate control", "Connected inbox monitoring and sync"]',
     TRUE, 'active',
     '["dashboard", "datasources", "datasource-configs", "intents", "intent-policies", "validation-rules", "vault", "playground", "users", "rbac", "api-keys", "connected-inboxes"]', '[]'),
    ('data', 'Unified data access layer connecting your enterprise datasources with secure vault-backed credential management and full user governance.', 'database', '1.0.0', 2,
     '["Multi-datasource connectivity across SQL and REST", "Vault-backed secure credential storage", "Role-based access control for data assets", "API key management with scoped permissions", "Real-time query playground for data exploration", "User and team management with RBAC"]',
     TRUE, 'active',
     '["dashboard", "datasources", "datasource-configs", "playground", "api-keys", "users", "rbac", "vault"]', '[]'),
    ('sql_query', 'Execute, optimize and govern SQL queries across heterogeneous datasources with intent-driven orchestration and audit-ready access controls.', 'terminal-square', '1.0.0', 3,
     '["Cross-datasource SQL execution engine", "Intent-driven query orchestration", "Datasource configuration and connection management", "Scoped API key access per query context", "Interactive SQL playground with result export", "User and role management for query governance"]',
     TRUE, 'active',
     '["dashboard", "datasources", "datasource-configs", "playground", "api-keys", "users", "rbac"]', '[]')
ON CONFLICT (name) DO NOTHING;



-- ── auth.sidebar_items ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth.sidebar_items (
    id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    value                   VARCHAR(100) NOT NULL,
    label                   VARCHAR(100) NOT NULL,
    icon                    VARCHAR(100) NOT NULL,
    href                    TEXT         NOT NULL,
    type                    VARCHAR(20)  NOT NULL DEFAULT 'internal',
    nav_section             VARCHAR(20)  NOT NULL DEFAULT 'primary',
    open_mode               VARCHAR(20),
    hidden_from_module_user BOOLEAN      NOT NULL DEFAULT FALSE,
    display_order           INTEGER      NOT NULL DEFAULT 0,
    status                  VARCHAR(20)  NOT NULL DEFAULT 'active',
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sidebar_items_value UNIQUE (value),
    CONSTRAINT chk_sidebar_items_type CHECK (type IN ('internal', 'external')),
    CONSTRAINT chk_sidebar_items_nav_section CHECK (nav_section IN ('primary', 'more')),
    CONSTRAINT chk_sidebar_items_open_mode CHECK (open_mode IS NULL OR open_mode IN ('iframe', 'new_tab')),
    CONSTRAINT chk_sidebar_items_status CHECK (status IN ('active', 'inactive'))
);
CREATE INDEX IF NOT EXISTS idx_sidebar_items_status        ON auth.sidebar_items (status);
CREATE INDEX IF NOT EXISTS idx_sidebar_items_nav_section   ON auth.sidebar_items (nav_section);
CREATE INDEX IF NOT EXISTS idx_sidebar_items_display_order ON auth.sidebar_items (display_order);

-- Seed: existing sidebar items, migrated from hardcoded lists
-- (constants.js SIDEBAR_ITEMS + App.jsx PRIMARY_NAV_ITEMS/MORE_NAV_ITEMS + dashboard.html SIDEBAR_DEFINITIONS)
INSERT INTO auth.sidebar_items (value, label, icon, href, type, nav_section, hidden_from_module_user, display_order)
VALUES
    ('dashboard',           'Dashboard',            'DashboardIcon',    '/app',                        'internal', 'primary', FALSE, 1),
    ('datasources',         'Datasources',          'StorageIcon',      '/app/datasources',            'internal', 'primary', FALSE, 2),
    ('datasource-configs',  'Datasource Configs',   'SettingsIcon',     '/app/datasource-configs',     'internal', 'primary', FALSE, 3),
    ('intents',             'Intents',              'TrackChangesIcon', '/app/intents',                'internal', 'primary', FALSE, 4),
    ('intent-policies',     'Intent Policies',      'TuneIcon',         '/app/intent-policies',        'internal', 'primary', FALSE, 5),
    ('validation-rules',    'Validation Rules',     'RuleIcon',         '/app/rules',                  'internal', 'primary', FALSE, 6),
    ('vault',               'Setup Credentials',    'VpnKeyIcon',       '/app/credentials',            'internal', 'primary', FALSE, 7),
    ('playground',          'Playground',           'TerminalIcon',     '/app/playground',             'internal', 'more',    FALSE, 8),
    ('users',               'Users',                'PeopleIcon',       '/app/users',                  'internal', 'more',    TRUE,  9),
    ('rbac',                'Roles & Permissions',  'SecurityIcon',     '/app/roles',                  'internal', 'more',    TRUE,  10),
    ('api-keys',            'API Keys',             'ApiIcon',          '/app/api-keys',               'internal', 'more',    TRUE,  11),
    ('connected-inboxes',   'Connected Inboxes',    'MailIcon',         '/app/connected-inboxes',      'internal', 'more',    FALSE, 12)
ON CONFLICT (value) DO NOTHING;








-- =============================================================================
-- EMAIL INBOXES SCHEMA — append to init_schema.sql
-- Tables: eivs.email_inboxes, eivs.email_sync_logs
-- =============================================================================

-- ── eivs.email_inboxes ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS eivs.email_inboxes (
    inbox_id         SERIAL       PRIMARY KEY,
    tenant_id        TEXT         NOT NULL DEFAULT 'global',
    inbox_name       VARCHAR(100) NOT NULL,
    provider_type    TEXT         NOT NULL,
    email_address    VARCHAR(255),
    vault_path       VARCHAR(255),
    server_host      VARCHAR(255),
    server_port      INTEGER,
    protocol         TEXT,
    use_ssl          BOOLEAN      NOT NULL DEFAULT TRUE,
    polling_interval INTEGER      NOT NULL DEFAULT 5,
    status           TEXT         NOT NULL DEFAULT 'active',
    last_sync_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_email_inboxes_tenant_name  UNIQUE (tenant_id, inbox_name),
    CONSTRAINT chk_email_inboxes_provider    CHECK (provider_type IN ('google', 'microsoft365', 'imap', 'exchange')),
    CONSTRAINT chk_email_inboxes_protocol    CHECK (protocol IS NULL OR protocol IN ('imap', 'pop3', 'smtp')),
    CONSTRAINT chk_email_inboxes_status      CHECK (status IN ('active', 'inactive')),
    CONSTRAINT chk_email_inboxes_polling     CHECK (polling_interval >= 1 AND polling_interval <= 1440)
);
CREATE INDEX IF NOT EXISTS idx_email_inboxes_tenant   ON eivs.email_inboxes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_inboxes_status   ON eivs.email_inboxes (status);
CREATE INDEX IF NOT EXISTS idx_email_inboxes_provider ON eivs.email_inboxes (provider_type);

-- ── eivs.email_sync_logs ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS eivs.email_sync_logs (
    log_id      SERIAL      PRIMARY KEY,
    tenant_id   TEXT        NOT NULL,
    inbox_id    INTEGER     NOT NULL,
    sync_time   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status      TEXT        NOT NULL,
    message     TEXT,
    duration_ms INTEGER,
    CONSTRAINT chk_email_sync_logs_status CHECK (status IN ('success', 'failure', 'running')),
    CONSTRAINT fk_email_sync_logs_inbox   FOREIGN KEY (inbox_id) REFERENCES eivs.email_inboxes(inbox_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_email_sync_logs_inbox     ON eivs.email_sync_logs (inbox_id);
CREATE INDEX IF NOT EXISTS idx_email_sync_logs_tenant    ON eivs.email_sync_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_sync_logs_sync_time ON eivs.email_sync_logs (sync_time DESC);







BEGIN;

CREATE TABLE IF NOT EXISTS eivs.driver_definitions (
    driver_id            BIGSERIAL PRIMARY KEY,
    canonical_name       TEXT NOT NULL,
    display_name         TEXT NOT NULL,
    runtime_owner        TEXT NOT NULL DEFAULT 'shared'
        CHECK (runtime_owner IN ('drivers_service', 'semantic_engine', 'shared')),
    protocol             TEXT NOT NULL
        CHECK (protocol IN ('sql', 'soql', 'rest', 'graphql')),
    dialect_token        TEXT NOT NULL,
    implementation_key   TEXT NOT NULL,
    auth_style           TEXT NOT NULL DEFAULT 'broker',
    capabilities         JSONB NOT NULL DEFAULT '{}'::jsonb,
    config_schema        JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_eivs_driver_definitions_canonical UNIQUE (canonical_name),
    CONSTRAINT uq_eivs_driver_definitions_impl UNIQUE (implementation_key)
);

CREATE TABLE IF NOT EXISTS eivs.driver_aliases (
    alias_id             BIGSERIAL PRIMARY KEY,
    driver_id            BIGINT NOT NULL
        REFERENCES eivs.driver_definitions(driver_id)
        ON DELETE CASCADE,
    alias_name           TEXT NOT NULL,
    alias_type           TEXT NOT NULL
        CHECK (alias_type IN ('canonical', 'driver_family', 'datasource_type', 'legacy', 'ui')),
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_eivs_driver_aliases_lower
    ON eivs.driver_aliases (LOWER(alias_name));

ALTER TABLE eivs.datasource_configs
    ADD COLUMN IF NOT EXISTS driver_id BIGINT;

DO $$
BEGIN
    ALTER TABLE eivs.datasource_configs
        ADD CONSTRAINT fk_eivs_datasource_configs_driver_id
        FOREIGN KEY (driver_id)
        REFERENCES eivs.driver_definitions(driver_id);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_eivs_datasource_configs_driver_id
    ON eivs.datasource_configs (driver_id);

COMMIT;

BEGIN;

INSERT INTO eivs.driver_definitions (
    canonical_name,
    display_name,
    runtime_owner,
    protocol,
    dialect_token,
    implementation_key,
    auth_style,
    capabilities,
    config_schema,
    is_active
)
VALUES
(
    'salesforce_tooling',
    'Salesforce Tooling API',
    'shared',
    'soql',
    'soql',
    'salesforce_tooling',
    'vault_oauth2_refresh_token',
    jsonb_build_object(
        'supports_metadata', true,
        'supports_query', true,
        'supports_health_check', true,
        'supports_security', true,
        'metadata_mode', 'canonical',
        'constructor_mode', 'config'
    ),
    jsonb_build_object(
        'required', jsonb_build_array('login_url', 'client_id', 'client_secret', 'refresh_token'),
        'optional', jsonb_build_array('instance_url', 'access_token', 'api_version', 'timeout_seconds', 'max_workers')
    ),
    TRUE
),
(
    'servicenow_rest',
    'ServiceNow REST',
    'shared',
    'rest',
    'rest',
    'servicenow_rest',
    'basic',
    jsonb_build_object(
        'supports_metadata', true,
        'supports_query', true,
        'supports_health_check', true,
        'supports_security', true,
        'metadata_mode', 'canonical',
        'constructor_mode', 'named_args'
    ),
    jsonb_build_object(
        'required', jsonb_build_array('instance_url', 'username', 'password'),
        'optional', jsonb_build_array('timeout_seconds', 'max_workers')
    ),
    TRUE
),
(
    'postgres',
    'PostgreSQL',
    'shared',
    'sql',
    'postgres',
    'postgres',
    'broker',
    jsonb_build_object(
        'supports_metadata', true,
        'supports_query', true,
        'supports_health_check', true,
        'metadata_mode', 'dbapi',
        'constructor_mode', 'dsn'
    ),
    jsonb_build_object(
        'required', jsonb_build_array('host', 'port', 'database', 'username', 'password'),
        'optional', jsonb_build_array('max_workers')
    ),
    TRUE
),
(
    'hana',
    'SAP HANA',
    'shared',
    'sql',
    'hana',
    'hana',
    'broker',
    jsonb_build_object(
        'supports_metadata', true,
        'supports_query', true,
        'supports_health_check', true,
        'metadata_mode', 'dbapi',
        'constructor_mode', 'dsn'
    ),
    jsonb_build_object(
        'required', jsonb_build_array('dsn'),
        'optional', jsonb_build_array('max_workers')
    ),
    TRUE
),
(
    'oracle',
    'Oracle',
    'shared',
    'sql',
    'oracle',
    'oracle',
    'broker',
    jsonb_build_object(
        'supports_metadata', true,
        'supports_query', true,
        'supports_health_check', true,
        'metadata_mode', 'dbapi',
        'constructor_mode', 'dsn'
    ),
    jsonb_build_object(
        'required', jsonb_build_array('dsn'),
        'optional', jsonb_build_array('max_workers')
    ),
    TRUE
),
(
    'sqlserver',
    'Microsoft SQL Server',
    'shared',
    'sql',
    'sqlserver',
    'sqlserver',
    'broker',
    jsonb_build_object(
        'supports_metadata', true,
        'supports_query', true,
        'supports_health_check', true,
        'metadata_mode', 'dbapi',
        'constructor_mode', 'dsn'
    ),
    jsonb_build_object(
        'required', jsonb_build_array('dsn'),
        'optional', jsonb_build_array('max_workers')
    ),
    TRUE
),
(
    'datadirect',
    'Progress DataDirect',
    'shared',
    'sql',
    'ansi',
    'datadirect',
    'broker',
    jsonb_build_object(
        'supports_metadata', true,
        'supports_query', true,
        'supports_health_check', true,
        'metadata_mode', 'dbapi',
        'constructor_mode', 'dsn'
    ),
    jsonb_build_object(
        'required', jsonb_build_array('dsn'),
        'optional', jsonb_build_array('max_workers')
    ),
    TRUE
),
(
    'cdata',
    'CData Generic',
    'shared',
    'sql',
    'ansi',
    'cdata',
    'broker',
    jsonb_build_object(
        'supports_metadata', true,
        'supports_query', true,
        'supports_health_check', true,
        'metadata_mode', 'dbapi',
        'constructor_mode', 'dsn'
    ),
    jsonb_build_object(
        'required', jsonb_build_array('dsn'),
        'optional', jsonb_build_array('max_workers')
    ),
    TRUE
),
(
    'dataverse',
    'Microsoft Dataverse',
    'shared',
    'sql',
    'ansi',
    'dataverse',
    'broker',
    jsonb_build_object(
        'supports_metadata', true,
        'supports_query', true,
        'supports_health_check', true,
        'metadata_mode', 'dbapi',
        'constructor_mode', 'dsn'
    ),
    jsonb_build_object(
        'required', jsonb_build_array('dsn'),
        'optional', jsonb_build_array('max_workers')
    ),
    TRUE
),
(
    'netsuite_suiteanalytics',
    'NetSuite SuiteAnalytics',
    'shared',
    'sql',
    'oracle',
    'netsuite_suiteanalytics',
    'broker',
    jsonb_build_object(
        'supports_metadata', true,
        'supports_query', true,
        'supports_health_check', true,
        'metadata_mode', 'dbapi',
        'constructor_mode', 'dsn'
    ),
    jsonb_build_object(
        'required', jsonb_build_array('dsn'),
        'optional', jsonb_build_array('max_workers')
    ),
    TRUE
),
(
    'epicor_sqlserver',
    'Epicor SQL Server',
    'shared',
    'sql',
    'sqlserver',
    'epicor_sqlserver',
    'broker',
    jsonb_build_object(
        'supports_metadata', true,
        'supports_query', true,
        'supports_health_check', true,
        'metadata_mode', 'dbapi',
        'constructor_mode', 'dsn'
    ),
    jsonb_build_object(
        'required', jsonb_build_array('dsn'),
        'optional', jsonb_build_array('max_workers')
    ),
    TRUE
),
(
    'jde_oracle',
    'JDE Oracle',
    'shared',
    'sql',
    'oracle',
    'jde_oracle',
    'broker',
    jsonb_build_object(
        'supports_metadata', true,
        'supports_query', true,
        'supports_health_check', true,
        'metadata_mode', 'dbapi',
        'constructor_mode', 'dsn'
    ),
    jsonb_build_object(
        'required', jsonb_build_array('dsn'),
        'optional', jsonb_build_array('max_workers')
    ),
    TRUE
)
ON CONFLICT (canonical_name) DO UPDATE
SET
    display_name       = EXCLUDED.display_name,
    runtime_owner      = EXCLUDED.runtime_owner,
    protocol           = EXCLUDED.protocol,
    dialect_token      = EXCLUDED.dialect_token,
    implementation_key = EXCLUDED.implementation_key,
    auth_style         = EXCLUDED.auth_style,
    capabilities       = EXCLUDED.capabilities,
    config_schema      = EXCLUDED.config_schema,
    is_active          = EXCLUDED.is_active,
    updated_at         = NOW();

WITH defs AS (
    SELECT driver_id, canonical_name
    FROM eivs.driver_definitions
),
alias_seed AS (
    SELECT *
    FROM (
        VALUES
            -- salesforce_tooling
            ('salesforce_tooling', 'salesforce_tooling', 'canonical'),
            ('salesforce_tooling', 'salesforce', 'datasource_type'),
            ('salesforce_tooling', 'soql', 'legacy'),

            -- servicenow_rest
            ('servicenow_rest', 'servicenow_rest', 'canonical'),
            ('servicenow_rest', 'servicenow', 'datasource_type'),

            -- postgres
            ('postgres', 'postgres', 'canonical'),
            ('postgres', 'postgresql', 'legacy'),

            -- hana
            ('hana', 'hana', 'canonical'),
            ('hana', 'sap_hana', 'legacy'),
            ('hana', 'hana_client', 'legacy'),
            ('hana', 'sap_hana_client', 'legacy'),

            -- oracle
            ('oracle', 'oracle', 'canonical'),
            ('oracle', 'oracle_jdbc', 'legacy'),
            ('oracle', 'oracle_odbc', 'legacy'),
            ('oracle', 'cerner_oracle', 'legacy'),

            -- sqlserver
            ('sqlserver', 'sqlserver', 'canonical'),
            ('sqlserver', 'mssql', 'legacy'),
            ('sqlserver', 'epicor_sql', 'legacy'),
            ('sqlserver', 'epic_sql', 'legacy'),

            -- datadirect
            ('datadirect', 'datadirect', 'canonical'),
            ('datadirect', 'progress_datadirect', 'legacy'),

            -- cdata
            ('cdata', 'cdata', 'canonical'),
            ('cdata', 'workday_cdata', 'legacy'),
            ('cdata', 'epicor_cdata', 'legacy'),
            ('cdata', 'cdata_generic_jdbc', 'legacy'),
            ('cdata', 'cdata_generic_odbc', 'legacy'),

            -- dataverse
            ('dataverse', 'dataverse', 'canonical'),
            ('dataverse', 'dataverse_odbc', 'legacy'),

            -- netsuite_suiteanalytics
            ('netsuite_suiteanalytics', 'netsuite_suiteanalytics', 'canonical'),
            ('netsuite_suiteanalytics', 'suiteanalytics_connect', 'legacy'),

            -- epicor_sqlserver
            ('epicor_sqlserver', 'epicor_sqlserver', 'canonical'),
            ('epicor_sqlserver', 'epicor_sqlserver_odbc', 'legacy'),
            ('epicor_sqlserver', 'epicor_sqlserver_jdbc', 'legacy'),

            -- jde_oracle
            ('jde_oracle', 'jde_oracle', 'canonical')
    ) AS t(canonical_name, alias_name, alias_type)
)
INSERT INTO eivs.driver_aliases (
    driver_id,
    alias_name,
    alias_type,
    is_active
)
SELECT
    d.driver_id,
    a.alias_name,
    a.alias_type,
    TRUE
FROM defs d
JOIN alias_seed a
  ON a.canonical_name = d.canonical_name
ON CONFLICT DO NOTHING;

COMMIT;


