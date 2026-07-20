# orchestration/orchestration/services/domain_pack_plans.py
"""
Domain Pack Plan Templates
Each pack defines ready-made plans that get created when pack is installed.
"""

DOMAIN_PACK_PLANS = {

    # ── Banking Collections ─────────────────────────────────────
    "banking_collections": [
        {
            "name":         "banking_customer_360",
            "entity_type":  "customer",
            "description":  "Complete customer 360 view from CRM and loan systems",
            "error_policy": "best_effort",
            "steps": [
                {
                    "step_key":        "fetch_customer",
                    "step_order":      1,
                    "kind":            "sql",
                    "datasource_name": "CRM_DB",
                    "sql_template":    "SELECT customer_id, full_name, email, phone, customer_type FROM crm.customers LIMIT 10",
                    "depends_on":      [],
                    "timeout_ms":      5000,
                    "enabled":         True,
                },
                {
                    "step_key":        "fetch_loan",
                    "step_order":      2,
                    "kind":            "sql",
                    "datasource_name": "LOAN_CORE_DB",
                    "sql_template":    "SELECT loan_id, loan_account_number, status, principal_amount, currency, risk_bucket FROM loan_core.loans LIMIT 10",
                    "depends_on":      ["fetch_customer"],
                    "timeout_ms":      5000,
                    "enabled":         True,
                },
                {
                    "step_key":           "ai_assessment",
                    "step_order":         3,
                    "kind":               "ai_transform",
                    "datasource_name":    "LLM_SERVICE",
                    "ai_prompt_template": "You are a banking analyst. Analyse customer profile: {{fetch_customer}} and loan details: {{fetch_loan}}. Return JSON with: decision, risk_level, risk_score, summary.",
                    "depends_on":         ["fetch_customer", "fetch_loan"],
                    "timeout_ms":         15000,
                    "enabled":            True,
                },
            ]
        },
        {
            "name":         "banking_risk_scoring",
            "entity_type":  "customer",
            "description":  "Risk scoring for banking customers",
            "error_policy": "best_effort",
            "steps": [
                {
                    "step_key":        "fetch_customer_data",
                    "step_order":      1,
                    "kind":            "sql",
                    "datasource_name": "CRM_DB",
                    "sql_template":    "SELECT customer_id, full_name, customer_type FROM crm.customers LIMIT 10",
                    "depends_on":      [],
                    "timeout_ms":      5000,
                    "enabled":         True,
                },
                {
                    "step_key":           "risk_decision",
                    "step_order":         2,
                    "kind":               "ai_transform",
                    "datasource_name":    "LLM_SERVICE",
                    "ai_prompt_template": "Analyse customer data: {{fetch_customer_data}}. Return JSON with: risk_score (0-100), risk_level (LOW/MEDIUM/HIGH), risk_factors, recommendation.",
                    "depends_on":         ["fetch_customer_data"],
                    "timeout_ms":         15000,
                    "enabled":            True,
                },
            ]
        },
    ],

    # ── Insurance Claims ────────────────────────────────────────
    "insurance_claims": [
        {
            "name":         "insurance_claim_assessment",
            "entity_type":  "claim",
            "description":  "Insurance claim FNOL processing and assessment",
            "error_policy": "best_effort",
            "steps": [
                {
                    "step_key":        "fetch_policy",
                    "step_order":      1,
                    "kind":            "sql",
                    "datasource_name": "INSURANCE_DB",
                    "sql_template":    "SELECT policy_id, policy_number, policy_status, gross_premium, net_premium FROM ins.policies LIMIT 10",
                    "depends_on":      [],
                    "timeout_ms":      5000,
                    "enabled":         True,
                },
                {
                    "step_key":           "claim_decision",
                    "step_order":         2,
                    "kind":               "ai_transform",
                    "datasource_name":    "LLM_SERVICE",
                    "ai_prompt_template": "You are an insurance claims analyst. Analyse policy: {{fetch_policy}}. Return JSON with: claim_decision (APPROVE/REJECT/INVESTIGATE), fraud_score, reason, next_steps.",
                    "depends_on":         ["fetch_policy"],
                    "timeout_ms":         15000,
                    "enabled":            True,
                },
            ]
        },
        {
            "name":         "insurance_fraud_detection",
            "entity_type":  "claim",
            "description":  "Fraud detection for insurance claims",
            "error_policy": "fail_fast",
            "steps": [
                {
                    "step_key":        "fetch_claim_data",
                    "step_order":      1,
                    "kind":            "sql",
                    "datasource_name": "INSURANCE_DB",
                    "sql_template":    "SELECT policy_id, policy_number, policy_status, gross_premium FROM ins.policies LIMIT 10",
                    "depends_on":      [],
                    "timeout_ms":      5000,
                    "enabled":         True,
                },
                {
                    "step_key":           "fraud_analysis",
                    "step_order":         2,
                    "kind":               "ai_transform",
                    "datasource_name":    "LLM_SERVICE",
                    "ai_prompt_template": "Analyse for fraud indicators in: {{fetch_claim_data}}. Return JSON with: fraud_detected (true/false), fraud_score (0-100), indicators, recommendation.",
                    "depends_on":         ["fetch_claim_data"],
                    "timeout_ms":         15000,
                    "enabled":            True,
                },
            ]
        },
    ],

    # ── Healthcare Lab ──────────────────────────────────────────
    "healthcare_lab": [
        {
            "name":         "healthcare_patient_360",
            "entity_type":  "patient",
            "description":  "Complete patient 360 view with lab results",
            "error_policy": "best_effort",
            "steps": [
                {
                    "step_key":        "fetch_patient",
                    "step_order":      1,
                    "kind":            "sql",
                    "datasource_name": "HEALTH_DB",
                    "sql_template":    "SELECT patient_id, mrn, full_name, date_of_birth, gender FROM emr.patients LIMIT 10",
                    "depends_on":      [],
                    "timeout_ms":      5000,
                    "enabled":         True,
                },
                {
                    "step_key":           "health_assessment",
                    "step_order":         2,
                    "kind":               "ai_transform",
                    "datasource_name":    "LLM_SERVICE",
                    "ai_prompt_template": "You are a medical analyst. Analyse patient data: {{fetch_patient}}. Return JSON with: health_summary, risk_level, recommendations, follow_up_required.",
                    "depends_on":         ["fetch_patient"],
                    "timeout_ms":         15000,
                    "enabled":            True,
                },
            ]
        },
        {
            "name":         "healthcare_lab_results",
            "entity_type":  "patient",
            "description":  "Lab results processing and notification",
            "error_policy": "best_effort",
            "steps": [
                {
                    "step_key":        "fetch_patient_data",
                    "step_order":      1,
                    "kind":            "sql",
                    "datasource_name": "HEALTH_DB",
                    "sql_template":    "SELECT patient_id, mrn, full_name, date_of_birth FROM emr.patients LIMIT 10",
                    "depends_on":      [],
                    "timeout_ms":      5000,
                    "enabled":         True,
                },
                {
                    "step_key":           "lab_analysis",
                    "step_order":         2,
                    "kind":               "ai_transform",
                    "datasource_name":    "LLM_SERVICE",
                    "ai_prompt_template": "Analyse patient lab results: {{fetch_patient_data}}. Return JSON with: result_summary, critical_flags, doctor_notification_required, patient_message.",
                    "depends_on":         ["fetch_patient_data"],
                    "timeout_ms":         15000,
                    "enabled":            True,
                },
            ]
        },
    ],

    # ── ITSM Incident ───────────────────────────────────────────
    "itsm_incident": [
        {
            "name":         "itsm_incident_response",
            "entity_type":  "incident",
            "description":  "Automated incident detection and routing",
            "error_policy": "fail_fast",
            "steps": [
                {
                    "step_key":        "fetch_client_data",
                    "step_order":      1,
                    "kind":            "sql",
                    "datasource_name": "FIN_DB",
                    "sql_template":    "SELECT client_id, name, country, risk_level FROM fin.clients LIMIT 10",
                    "depends_on":      [],
                    "timeout_ms":      5000,
                    "enabled":         True,
                },
                {
                    "step_key":           "incident_assessment",
                    "step_order":         2,
                    "kind":               "ai_transform",
                    "datasource_name":    "LLM_SERVICE",
                    "ai_prompt_template": "Analyse incident data: {{fetch_client_data}}. Return JSON with: severity (LOW/MEDIUM/HIGH/CRITICAL), routing_decision, sla_hours, escalation_required, resolution_steps.",
                    "depends_on":         ["fetch_client_data"],
                    "timeout_ms":         15000,
                    "enabled":            True,
                },
            ]
        },
        {
            "name":         "itsm_service_request",
            "entity_type":  "incident",
            "description":  "Service request processing and auto-routing",
            "error_policy": "best_effort",
            "steps": [
                {
                    "step_key":        "fetch_request_data",
                    "step_order":      1,
                    "kind":            "sql",
                    "datasource_name": "FIN_DB",
                    "sql_template":    "SELECT client_id, name, risk_level, is_active FROM fin.clients LIMIT 10",
                    "depends_on":      [],
                    "timeout_ms":      5000,
                    "enabled":         True,
                },
                {
                    "step_key":           "request_decision",
                    "step_order":         2,
                    "kind":               "ai_transform",
                    "datasource_name":    "LLM_SERVICE",
                    "ai_prompt_template": "Process service request: {{fetch_request_data}}. Return JSON with: request_type, priority, auto_approve (true/false), assigned_team, estimated_resolution_hours.",
                    "depends_on":         ["fetch_request_data"],
                    "timeout_ms":         15000,
                    "enabled":            True,
                },
            ]
        },
    ],
}