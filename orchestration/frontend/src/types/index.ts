// src/types/index.ts

export type StepKind =
  | 'sql'
  | 'rest'
  | 'graphql'
  | 'ai_transform'
  | 'intent_classify'
  | 'policy_route'
  | 'intent_validate'
  | 'adapter_analyze'
  | 'prompt_run'
  | 'document_generate'
  | 'human_review'
  | 'webhook'
  | 'agent_task';

export type ErrorPolicy = 'fail_fast' | 'best_effort' | 'dependent_fail';
export type OutputMode = 'object' | 'list';

export interface RetryPolicy {
  max_retries?: number;
  backoff_ms?: number;
}

export interface PlanStepCreate {
  step_key: string;
  step_order: number;
  kind: StepKind;
  datasource_name: string;
  sql_template?: string;
  method?: string;
  path_template?: string;
  query_params_json?: Record<string, unknown>;
  body_json?: unknown;
  graphql_query_template?: string;
  graphql_vars_json?: Record<string, unknown>;
  ai_prompt_template?: string;
  ai_output_schema?: unknown;
  depends_on?: string[];
  condition_expr?: string;
  input_bindings_json?: Record<string, string>;
  timeout_ms?: number;
  retry_policy?: RetryPolicy;
  output_mode?: OutputMode;
  enabled?: boolean;
}

export interface PlanCreate {
  name: string;
  entity_type: string;
  description?: string;
  steps?: PlanStepCreate[];
  tenant_id?: string;
  error_policy?: ErrorPolicy;
  max_concurrency?: number;
}

export interface PlanResponse {
  plan_id: string;
  name: string;
  entity_type: string;
  description?: string;
  is_active: boolean;
  version: number;
  tenant_id?: string;
  error_policy: ErrorPolicy;
  max_concurrency: number;
  steps?: PlanStepCreate[];
  created_by?: string;
  created_at: string;
  updated_at: string;
  input_schema_json?: Record<string, unknown>;
  output_schema_json?: Record<string, unknown>;
  example_request_json?: Record<string, unknown>;
}

export interface Entity360Request {
  tenant_id: string;
  entity_type: string;
  plan_name: string;
  params: Record<string, string>;
}

export interface Entity360Result {
  entity_type: string;
  plan: string;
  params: Record<string, string>;
  results: Record<string, unknown>;
  errors: Record<string, string>;
}

export type ApiStatus = 'idle' | 'loading' | 'success' | 'error';

// ── ORCH-013: New runtime types ─────────────────────────────────────

export interface OrchestrationRunRequest {
  plan_name: string;
  entity_type: string;
  tenant_id: string;
  params: Record<string, unknown>;
}

export interface OrchestrationRunResponse {
  execution_id: string;
  status: 'success' | 'partial' | 'failed' | 'paused';
  plan_name: string;
  entity_type: string;
  results: Record<string, unknown>;
  errors: Record<string, string>;
  duration_ms: number;
  paused_at_step?: string | null;
}

export interface ExecutionStep {
  execution_step_id: string;
  execution_id: string;
  plan_step_id: string | null;
  step_key: string;
  kind: StepKind;
  status: 'queued' | 'running' | 'success' | 'skipped' | 'failed';
  request_json: Record<string, unknown>;
  response_json: Record<string, unknown>;
  error_json: Record<string, unknown>;
  evidence_json: Record<string, unknown>;
  retry_count: number;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number;
}

export interface OrchestrationRun {
  execution_id: string;
  plan_id: string | null;
  plan_name: string;
  entity_type: string;
  tenant_id: string;
  params: Record<string, unknown>;
  results: Record<string, unknown>;
  errors: Record<string, string>;
  status: 'success' | 'partial' | 'failed' | 'paused';
  duration_ms: number;
  executed_by: string | null;
  executed_at: string;
}

export interface RuntimeContract {
  plan_name: string;
  input_schema_json: Record<string, unknown>;
  output_schema_json: Record<string, unknown>;
  example_request_json: Record<string, unknown>;
}

export interface IntentPlanMapping {
  mapping_id: string;
  tenant_id: string;
  intent_code: string;
  entity_type: string;
  plan_name: string;
  channel: string | null;
  locale: string | null;
  rank: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface IntentPlanMappingCreate {
  tenant_id: string;
  intent_code: string;
  plan_name: string;
  entity_type?: string;
  channel?: string;
  locale?: string;
  rank?: number;
  is_active?: boolean;
}

export interface IntentPlanMappingUpdate {
  plan_name?: string;
  channel?: string;
  locale?: string;
  rank?: number;
  is_active?: boolean;
}
// ── AGENT-012/013/014: Agent types ─────────────────────────────────

export interface AgentTaskRun {
  agent_run_id:      string;
  execution_id:      string;
  execution_step_id: string | null;
  tenant_id:         string;
  plan_name:         string;
  step_key:          string;
  prompt_id:         string | null;
  prompt_version:    string | null;
  goal:              string;
  status: 'running' | 'success' | 'failed' | 'needs_approval' |
          'needs_human_review' | 'budget_exceeded' | 'output_invalid';
  input_json:    Record<string, unknown>;
  output_json:   Record<string, unknown>;
  error_json:    Record<string, unknown>;
  budgets_json:  Record<string, unknown>;
  usage_json:    Record<string, unknown>;
  approval_json: Record<string, unknown>;
  started_at:    string;
  completed_at:  string | null;
  duration_ms:   number;
}

export interface AgentTraceEvent {
  trace_event_id: string;
  agent_run_id:   string;
  execution_id:   string;
  step_key:       string;
  event_index:    number;
  event_type: 'thought' | 'tool_selected' | 'tool_request' | 'tool_response' |
              'model_request' | 'model_response' | 'guardrail_check' |
              'approval_requested' | 'approval_resolved' |
              'output_validation' | 'budget_check' | 'final_answer' | 'error';
  event_json: Record<string, unknown>;
  redacted:   boolean;
  created_at: string;
}

export interface AgentApproval {
  approval_id:           string;
  agent_run_id:          string;
  execution_id:          string;
  tenant_id:             string;
  step_key:              string;
  approval_type:         string;
  requested_action_json: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  requested_by:   string | null;
  reviewed_by:    string | null;
  requested_at:   string;
  reviewed_at:    string | null;
  expires_at:     string | null;
  decision_reason: string | null;
}

export interface AgentTaskConfig {
  prompt_ref:    { prompt_id?: string; prompt_name?: string; version?: string };
  goal:          string;
  allowed_tools: string[];
  budgets: {
    max_iterations:  number;
    max_model_calls: number;
    max_tool_calls:  number;
    max_cost_usd:    number;
    timeout_ms:      number;
  };
  approval_policy: { mode: string; require_approval_for: string[] };
  output_schema:   Record<string, unknown>;
  fallback_policy: {
    on_budget_exceeded:   string;
    on_output_invalid:    string;
    on_approval_rejected: string;
  };
}
export interface HumanReviewApproval {
  approval_id:     string;
  execution_id:    string;
  step_key:        string;
  tenant_id:       string;
  status:          'pending' | 'approved' | 'rejected';
  reason:          string | null;
  context_json:    Record<string, unknown>;
  requested_at:    string;
  reviewed_by:     string | null;
  reviewed_at:     string | null;
  decision_reason: string | null;
}