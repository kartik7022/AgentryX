INSERT INTO document_types (doc_type_name, schema_definition, confidence_threshold)
VALUES
    ('invoice', '{"invoice_number": "string", "invoice_date": "date", "vendor_name": "string", "total_amount": "number", "currency": "string", "due_date": "date"}'::jsonb, 0.80),
    ('resume', '{"candidate_name": "string", "email": "string", "phone": "string", "skills": "array", "experience": "array", "education": "array"}'::jsonb, 0.78),
    ('insurance_claim', '{"claim_id": "string", "policy_number": "string", "claimant_name": "string", "incident_date": "date", "amount_claimed": "number", "status": "string"}'::jsonb, 0.82),
    ('shipping_note', '{"shipment_id": "string", "carrier": "string", "origin": "string", "destination": "string", "dispatch_date": "date", "tracking_number": "string"}'::jsonb, 0.79),
    ('contract', '{"contract_id": "string", "parties": "array", "effective_date": "date", "end_date": "date", "governing_law": "string", "signature_blocks": "array"}'::jsonb, 0.83),
    ('bank_statement', '{"account_holder": "string", "account_number": "string", "statement_period": "string", "opening_balance": "number", "closing_balance": "number", "transactions": "array"}'::jsonb, 0.81),
    ('medical_record', '{"patient_name": "string", "dob": "date", "mrn": "string", "diagnoses": "array", "medications": "array", "provider": "string"}'::jsonb, 0.85),
    ('purchase_order', '{"po_number": "string", "supplier_name": "string", "order_date": "date", "expected_delivery": "date", "line_items": "array", "total_amount": "number"}'::jsonb, 0.80),
    ('scientific_paper', '{"title": "string", "authors": "array", "abstract": "string", "keywords": "array", "references": "array", "doi": "string"}'::jsonb, 0.77),
    ('passport_scan', '{"passport_number": "string", "full_name": "string", "nationality": "string", "date_of_birth": "date", "issue_date": "date", "expiry_date": "date"}'::jsonb, 0.86),
    ('email', '{"from": "string", "to": "array", "subject": "string", "sent_at": "timestamp", "body": "string", "attachments": "array"}'::jsonb, 0.70),
    ('chat', '{"participants": "array", "channel": "string", "sent_at": "timestamp", "messages": "array", "topic": "string"}'::jsonb, 0.68),
    ('api_event', '{"event_id": "string", "source": "string", "event_type": "string", "payload": "object", "occurred_at": "timestamp"}'::jsonb, 0.72),
    ('support_ticket', '{"ticket_id": "string", "customer_id": "string", "priority": "string", "subject": "string", "description": "string", "status": "string"}'::jsonb, 0.74),
    ('policy_document', '{"policy_id": "string", "policy_name": "string", "effective_date": "date", "version": "string", "sections": "array"}'::jsonb, 0.84),
    ('patient_record', '{"patient_id": "string", "patient_name": "string", "dob": "date", "encounters": "array", "labs": "array", "allergies": "array"}'::jsonb, 0.87)
ON CONFLICT (doc_type_name) DO UPDATE
SET schema_definition = EXCLUDED.schema_definition,
    confidence_threshold = EXCLUDED.confidence_threshold,
    updated_at = NOW();
