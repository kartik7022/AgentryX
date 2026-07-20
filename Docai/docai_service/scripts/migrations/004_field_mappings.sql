CREATE TABLE IF NOT EXISTS field_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_type_id UUID NOT NULL REFERENCES document_types(id),
    source_field VARCHAR(255) NOT NULL,
    target_field VARCHAR(255) NOT NULL,
    transform VARCHAR(50) DEFAULT 'copy',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_mappings_doc_type_id
    ON field_mappings(doc_type_id);
