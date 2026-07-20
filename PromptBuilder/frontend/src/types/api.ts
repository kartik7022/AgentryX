// src/types/api.ts

export type TemplateStatus = 'draft' | 'published' | 'archived';
export type OutputTarget = 'html' | 'docx' | 'pdf' | 'xlsx' | 'md';
export type GenerationMode = 'manual_sql' | 'llm_prompt';
export type ValueType = 'string' | 'number' | 'date' | 'json';
export type Cardinality = 'scalar' | 'list' | 'table';
export type JobStatus = 'queued' | 'running' | 'success' | 'error';

// ─── Template ────────────────────────────────────────────────────────────────

export interface Template {
  template_id: string;
  name: string;
  description?: string;
  status: TemplateStatus;
  output_target: OutputTarget;
  root_layout_json: LayoutBlock[];
  default_locale?: string;
  supported_locales?: string[];
  industry?: string;
  tags?: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TemplateCreate {
  name: string;
  description?: string;
  output_target: OutputTarget;
  industry?: string;
  tags?: string[];
}

export interface TemplateUpdate {
  name?: string;
  description?: string;
  output_target?: OutputTarget;
  root_layout_json?: LayoutBlock[];
  tags?: string[];
}

export interface TemplateVersion {
  version_id: string;
  template_id: string;
  version_number: number;
  layout_json: LayoutBlock[];
  output_target: OutputTarget;
  change_summary?: string;
  created_at: string;
}

// ─── Layout / Blocks ─────────────────────────────────────────────────────────

export type BlockType = 'text' | 'table' | 'image' | 'section';

export interface TableColumn {
  header: string;
  binding: string; // e.g. "{{loan_number}}"
}

export interface LayoutBlock {
  block_id: string;
  type: BlockType;
  content?: string;
  columns?: TableColumn[];
  rows?: string[][];
  repeat?: string;
  src?: string;
  children?: LayoutBlock[];
  align?: 'left' | 'center' | 'right';  // text alignment
  fontSize?: number;                      // font size in px
}

// ─── Placeholder ─────────────────────────────────────────────────────────────

export interface Placeholder {
  registry_id: string;
  name: string;
  category?: string;
  generation_mode: GenerationMode;
  prompt?: string;
  sql_text?: string;
  datasource_id?: string;
  format_json?: Record<string, unknown>;
  sample_value?: string;
  value_type?: ValueType;
  cardinality?: Cardinality;
  classification?: string;
  is_active: boolean;
  created_at: string;
}

export interface PlaceholderCreate {
  name: string;
  category?: string;
  generation_mode: GenerationMode;
  prompt?: string;
  sql_text?: string;
  datasource_id?: string;
  sample_value?: string;
  value_type?: ValueType;
  cardinality?: Cardinality;
  classification?: string;
}

// ─── Datasource ──────────────────────────────────────────────────────────────

export interface Datasource {
  datasource_id: string;
  name: string;
  type: string;
  is_active: boolean;
}

export interface SchemaField {
  name: string;
  type: string;
  label: string;
}

export interface SchemaEntity {
  name: string;
  table: string;
  fields: SchemaField[];
}

export interface DatasourceSchema {
  datasource_id: string;
  entities: SchemaEntity[];
}

// ─── Render Job ──────────────────────────────────────────────────────────────

export interface GenerateDocRequest {
  template_id: string;
  output_target: OutputTarget;
  runtime_params?: Record<string, string>;
  locale?: string;
}

export interface RenderJob {
  job_id: string;
  template_id: string;
  status: JobStatus;
  output_target: OutputTarget;
  result_location?: string;
  logs?: string;
  created_at: string;
  updated_at: string;
}

// ─── Audit ───────────────────────────────────────────────────────────────────

export interface AuditEvent {
  audit_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor: string;
  summary?: string;
  details_json?: Record<string, unknown>;
  ts: string;
}

// ─── API list response wrapper ────────────────────────────────────────────────

export interface ListResponse<T> {
  items: T[];
  total: number;
}

// =============================================================================
// PB-012: PROMPT BUILDER TYPESCRIPT TYPES
// =============================================================================
//
// APPEND THIS TO THE BOTTOM OF: src/types/api.ts
//
// Adds all TypeScript interfaces & enums needed by the frontend to talk to
// the new /v1/prompts/* API.
//
// Style follows the existing api.ts:
//   - snake_case fields (matches Python backend wire format)
//   - section comments with horizontal rules
//   - explicit Status / Type unions for safety
//   - "?" optional fields where the backend allows null
// =============================================================================


// ─── Prompt Builder: enums ───────────────────────────────────────────────────

export type PromptStatus =
  | 'draft'
  | 'testing'
  | 'in_review'
  | 'approved'
  | 'published'
  | 'deprecated'
  | 'archived';

export type PromptVersionStatus =
  | 'draft'
  | 'testing'
  | 'approved'
  | 'published'
  | 'deprecated';

export type PromptBlockType =
  | 'system'
  | 'role'
  | 'task'
  | 'instruction'
  | 'business_rule'
  | 'context'
  | 'retrieval'
  | 'tool_call'
  | 'output_schema'
  | 'example'
  | 'fallback'
  | 'safety';

export type PromptInputType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'json'
  | 'array';

export type PromptSourceType =
  | 'runtime'
  | 'static'
  | 'datasource'
  | 'semantic_model'
  | 'document_template'
  | 'api';

export type PromptRunStatus = 'queued' | 'running' | 'success' | 'error';


// ─── Prompt Builder: top-level prompt ────────────────────────────────────────

export interface Prompt {
  prompt_id: string;
  name: string;
  description?: string;
  use_case?: string;
  industry?: string;
  status: PromptStatus;
  owner?: string;
  default_locale: string;
  supported_locales: string[];
  tags: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PromptCreate {
  name: string;
  description?: string;
  use_case?: string;
  industry?: string;
  owner?: string;
  default_locale?: string;
  supported_locales?: string[];
  tags?: string[];
}

export interface PromptUpdate {
  name?: string;
  description?: string;
  use_case?: string;
  industry?: string;
  owner?: string;
  status?: PromptStatus;
  default_locale?: string;
  supported_locales?: string[];
  tags?: string[];
}

/**
 * Returned by GET /v1/prompts/{id}.
 * Includes nested children (blocks, inputs, bindings) and the latest version.
 */
export interface PromptDetail extends Prompt {
  blocks: PromptBlock[];
  inputs: PromptInput[];
  context_bindings: PromptContextBinding[];
  latest_version?: PromptVersionSummary | null;
}


// ─── Prompt Builder: blocks ──────────────────────────────────────────────────

export interface PromptBlock {
  block_id?: string;
  prompt_id?: string;
  block_type: PromptBlockType;
  sequence_no: number;
  title?: string;
  content: string;
  variables_json?: Record<string, unknown>;
  is_required?: boolean;
  metadata_json?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}


// ─── Prompt Builder: inputs ──────────────────────────────────────────────────

export interface PromptInput {
  input_id?: string;
  prompt_id?: string;
  name: string;
  label?: string;
  type: PromptInputType;
  required: boolean;
  default_value?: string;
  validation_json?: Record<string, unknown>;
  description?: string;
  sensitive_classification?: string;
  created_at?: string;
}


// ─── Prompt Builder: context bindings ────────────────────────────────────────

export interface PromptContextBinding {
  binding_id?: string;
  prompt_id?: string;
  name: string;
  source_type: PromptSourceType;
  datasource_id?: number | null;
  semantic_entity?: string;
  field_list_json?: unknown[];
  filter_json?: Record<string, unknown>;
  retrieval_policy_json?: Record<string, unknown>;
  max_records?: number;
  metadata_json?: Record<string, unknown>;
  created_at?: string;
}


// ─── Prompt Builder: schema (input/output/guardrails on a draft version) ─────

export interface PromptSchemaPayload {
  input_schema_json?: Record<string, unknown>;
  output_schema_json?: Record<string, unknown>;
  guardrails_json?: Record<string, unknown>;
  change_summary?: string;
}

export interface PromptSchemaResponse {
  version_id: string;
  version_number: number;
  status: PromptVersionStatus | 'none';
  input_schema_json: Record<string, unknown>;
  output_schema_json: Record<string, unknown>;
  guardrails_json: Record<string, unknown>;
  change_summary?: string;
  updated_at: string;
}


// ─── Prompt Builder: versions ────────────────────────────────────────────────

/** Lightweight version reference shown inside PromptDetail. */
export interface PromptVersionSummary {
  version_id: string;
  version_number: number;
  status: PromptVersionStatus;
  change_summary?: string;
  created_by: string;
  created_at: string;
  approved_by?: string | null;
  approved_at?: string | null;
}

/** Full row returned by GET /v1/prompts/{id}/versions. */
export interface PromptVersion {
  version_id: string;
  prompt_id: string;
  version_number: number;
  status: PromptVersionStatus;
  model_policy_json: Record<string, unknown>;
  compiled_prompt_json: Record<string, unknown>;
  input_schema_json: Record<string, unknown>;
  output_schema_json: Record<string, unknown>;
  guardrails_json: Record<string, unknown>;
  change_summary?: string;
  created_by: string;
  created_at: string;
  approved_by?: string | null;
  approved_at?: string | null;
}

export interface PromptVersionCreatePayload {
  change_summary?: string;
  model_policy_json?: Record<string, unknown>;
}

export interface PromptPublishPayload {
  version_number?: number;
  change_summary?: string;
}

export interface PromptRollbackPayload {
  version_number: number;
  change_summary?: string;
}


// ─── Prompt Builder: runs ────────────────────────────────────────────────────

export interface PromptRunRequest {
  prompt_id: string;
  version?: string;
  locale?: string;
  runtime_params: Record<string, unknown>;
  response_format?: 'json' | 'text';
  allow_draft?: boolean;
}

export interface PromptRunResponse {
  status: 'success' | 'error';
  prompt_run_id: string;
  output?: unknown;
  raw_output?: string;
  metadata?: Record<string, unknown>;
  error_message?: string | null;
}


// ─── Prompt Builder: test cases & evaluations ────────────────────────────────

export interface PromptTestCheck {
  type: 'json_equals' | 'json_path_exists' | 'contains' | 'regex' | string;
  path?: string;
  value?: unknown;
}

export interface PromptTestCase {
  test_id: string;
  prompt_id: string;
  name: string;
  description?: string;
  runtime_params_json: Record<string, unknown>;
  expected_output_json: Record<string, unknown>;
  expected_checks_json: PromptTestCheck[];
  created_by: string;
  created_at: string;
}

export interface PromptTestCaseCreate {
  name: string;
  description?: string;
  runtime_params_json?: Record<string, unknown>;
  expected_output_json?: Record<string, unknown>;
  expected_checks_json?: PromptTestCheck[];
}

export interface PromptTestCaseUpdate {
  name?: string;
  description?: string;
  runtime_params_json?: Record<string, unknown>;
  expected_output_json?: Record<string, unknown>;
  expected_checks_json?: PromptTestCheck[];
}

export interface PromptTestRunRequest {
  test_id?: string;
  runtime_params?: Record<string, unknown>;
  expected_checks_json?: PromptTestCheck[];
  version?: string;
  allow_draft?: boolean;
}

export interface PromptTestRunResponse {
  evaluation_id: string;
  test_id?: string | null;
  prompt_id: string;
  run_id?: string | null;
  passed: boolean;
  score_json: PromptTestScore;
  output?: unknown;
  error_message?: string | null;
}

export interface PromptTestScore {
  passed: boolean;
  total_checks: number;
  passed_count: number;
  summary: string;
  checks: PromptTestCheckResult[];
}

export interface PromptTestCheckResult {
  type: string;
  passed: boolean;
  details: string;
  path?: string;
  expected?: unknown;
  actual?: unknown;
  needle?: string;
  pattern?: string;
}

export interface PromptEvaluation {
  evaluation_id: string;
  prompt_id: string;
  run_id?: string | null;
  test_id?: string | null;
  test_name?: string | null;
  score_json: PromptTestScore | Record<string, unknown>;
  passed: boolean;
  created_at: string;
}

/** Aggregate result returned by POST /prompts/{id}/evaluate (regression sweep). */
export interface PromptEvaluationSweep {
  prompt_id: string;
  total_tests: number;
  passed_count: number;
  failed_count: number;
  summary: string;
  results: PromptEvaluationSweepItem[];
}

export interface PromptEvaluationSweepItem {
  test_id: string;
  name: string;
  passed: boolean;
  summary?: string;
  evaluation_id?: string | null;
  error_message?: string | null;
}


// ─── Prompt Builder: prompt → document integration (PB-011) ──────────────────

export interface PromptGenerateDocumentRequest {
  version?: string;
  locale?: string;
  runtime_params: Record<string, unknown>;
  allow_draft?: boolean;
  override_document_template_id?: string;
  override_document_params?: Record<string, unknown>;
  override_output_target?: 'html' | 'docx' | 'pdf' | 'xlsx' | 'md';
}

export interface PromptGenerateDocumentResponse {
  status: string;
  prompt_run_id: string;
  prompt_output?: unknown;
  document_template_id?: string;
  document_job_id?: string | null;
  document_status?: string | null;
  error_message?: string | null;
  metadata?: Record<string, unknown>;
}