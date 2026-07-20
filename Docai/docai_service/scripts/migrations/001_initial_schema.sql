CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS document_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_type_name VARCHAR(255) NOT NULL UNIQUE,
    schema_definition JSONB,
    confidence_threshold FLOAT DEFAULT 0.80,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id VARCHAR(255),
    doc_type_id UUID REFERENCES document_types(id),
    sample_text TEXT,
    embedding vector(384),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_embedding_ivfflat
    ON templates
    USING ivfflat (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS model_registry_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_type_id UUID REFERENCES document_types(id),
    doc_id VARCHAR(255) UNIQUE,
    mlflow_run_id VARCHAR(255),
    mlflow_model_uri TEXT,
    model_type VARCHAR(100) DEFAULT 'LayoutLMv3',
    status VARCHAR(50) DEFAULT 'registered',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parse_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id VARCHAR(255),
    file_name VARCHAR(500),
    parser_used VARCHAR(100),
    confidence_score FLOAT,
    extracted_fields JSONB,
    pii_redacted BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'pending',
    user_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100),
    doc_id VARCHAR(255),
    parse_request_id UUID REFERENCES parse_requests(id) NULL,
    user_id VARCHAR(255),
    status VARCHAR(100),
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    role VARCHAR(50) DEFAULT 'viewer',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
