ALTER TABLE document_types
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

UPDATE document_types
SET is_active = TRUE
WHERE is_active IS NULL;
