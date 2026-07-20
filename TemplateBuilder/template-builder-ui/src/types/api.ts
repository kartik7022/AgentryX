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