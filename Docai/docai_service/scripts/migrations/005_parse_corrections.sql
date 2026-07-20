CREATE TABLE IF NOT EXISTS parse_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parse_request_id UUID NOT NULL REFERENCES parse_requests(id),
    doc_id VARCHAR(255),
    original_fields JSONB,
    corrected_fields JSONB,
    reviewer_id VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parse_corrections_parse_request_id
    ON parse_corrections(parse_request_id);
