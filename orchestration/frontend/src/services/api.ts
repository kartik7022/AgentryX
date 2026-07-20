// src/services/api.ts
import type {
  PlanCreate, PlanResponse,
  Entity360Request, Entity360Result,
  OrchestrationRunRequest, OrchestrationRunResponse,
  ExecutionStep, OrchestrationRun,
  RuntimeContract,
  HumanReviewApproval,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8060';

function headers(): HeadersInit {
  return {
    'Content-Type': 'application/json',
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) {
        if (typeof body.detail === 'string') {
          msg = body.detail;
        } else if (Array.isArray(body.detail)) {
          msg = body.detail
            .map((e: { msg?: string; loc?: string[] }) =>
              `${e.loc?.slice(-1)[0] ?? ''}: ${e.msg ?? ''}`
            ).join(', ');
        } else {
          msg = JSON.stringify(body.detail);
        }
      } else if (body?.message) {
        msg = body.message;
      }
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Plans ──────────────────────────────────────────────────────────
export async function listPlans(): Promise<PlanResponse[]> {
  const res = await fetch(`${BASE_URL}/admin/plans`, { headers: headers() });
  return handleResponse<PlanResponse[]>(res);
}

export async function getPlan(id: string): Promise<PlanResponse> {
  const res = await fetch(`${BASE_URL}/admin/plans/${id}`, { headers: headers() });
  return handleResponse<PlanResponse>(res);
}

export async function createPlan(payload: PlanCreate): Promise<PlanResponse> {
  const res = await fetch(`${BASE_URL}/admin/plans`, {
    method: 'POST', headers: headers(), body: JSON.stringify(payload),
  });
  return handleResponse<PlanResponse>(res);
}

export async function updatePlan(id: string, payload: PlanCreate): Promise<PlanResponse> {
  const res = await fetch(`${BASE_URL}/admin/plans/${id}`, {
    method: 'PUT', headers: headers(), body: JSON.stringify(payload),
  });
  return handleResponse<PlanResponse>(res);
}

export async function deletePlan(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/admin/plans/${id}`, {
    method: 'DELETE', headers: headers(),
  });
  return handleResponse<void>(res);
}

export async function deactivatePlan(id: string): Promise<PlanResponse> {
  const res = await fetch(`${BASE_URL}/admin/plans/${id}/deactivate`, {
    method: 'PATCH', headers: headers(),
  });
  return handleResponse<PlanResponse>(res);
}

export async function activatePlan(id: string): Promise<PlanResponse> {
  const res = await fetch(`${BASE_URL}/admin/plans/${id}/activate`, {
    method: 'PATCH', headers: headers(),
  });
  return handleResponse<PlanResponse>(res);
}

export async function clonePlan(id: string, newName: string): Promise<PlanResponse> {
  const res = await fetch(`${BASE_URL}/admin/plans/${id}/clone`, {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ new_name: newName }),
  });
  return handleResponse<PlanResponse>(res);
}

export function exportPlanAsJson(plan: PlanResponse): void {
  const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${plan.name}_v${plan.version}.json`; a.click();
  URL.revokeObjectURL(url);
}

export function parsePlanFromJson(file: File): Promise<PlanCreate> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const json = JSON.parse(e.target?.result as string);
        resolve({
          name:            `${json.name}_imported`,
          entity_type:     json.entity_type,
          description:     json.description,
          tenant_id:       json.tenant_id,
          error_policy:    json.error_policy ?? 'best_effort',
          max_concurrency: json.max_concurrency ?? 8,
          steps:           json.steps ?? [],
        });
      } catch {
        reject(new Error('Invalid JSON file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}

// ── Plan Versions ──────────────────────────────────────────────────
export async function listPlanVersions(planId: string): Promise<unknown[]> {
  const res = await fetch(`${BASE_URL}/admin/plans/${planId}/versions`, { headers: headers() });
  return handleResponse<unknown[]>(res);
}

export async function savePlanVersion(planId: string, notes: string): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/admin/plans/${planId}/versions`, {
    method: 'POST', headers: headers(),
    body: JSON.stringify({ change_notes: notes }),
  });
  return handleResponse<unknown>(res);
}

// ── Execute (legacy) ───────────────────────────────────────────────
export async function execute360(req: Entity360Request): Promise<Entity360Result> {
  const res = await fetch(`${BASE_URL}/v1/360`, {
    method: 'POST', headers: headers(), body: JSON.stringify(req),
  });
  return handleResponse<Entity360Result>(res);
}

// ── ORCH-013: New orchestration runtime API ─────────────────────────
export async function runPlan(
  req: OrchestrationRunRequest
): Promise<OrchestrationRunResponse> {
  const res = await fetch(`${BASE_URL}/v1/orchestrations/run`, {
    method: 'POST', headers: headers(), body: JSON.stringify(req),
  });
  return handleResponse<OrchestrationRunResponse>(res);
}

export async function getOrchestrationRun(
  executionId: string
): Promise<OrchestrationRun> {
  const res = await fetch(
    `${BASE_URL}/v1/orchestrations/runs/${executionId}`,
    { headers: headers() }
  );
  return handleResponse<OrchestrationRun>(res);
}

export async function listOrchestrationRuns(filters?: {
  tenant_id?: string;
  plan_name?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<OrchestrationRun[]> {
  const params = new URLSearchParams();
  if (filters?.tenant_id) params.set('tenant_id', filters.tenant_id);
  if (filters?.plan_name) params.set('plan_name', filters.plan_name);
  if (filters?.status)    params.set('status',    filters.status);
  if (filters?.limit)     params.set('limit',     String(filters.limit));
  if (filters?.offset)    params.set('offset',    String(filters.offset));
  const res = await fetch(
    `${BASE_URL}/v1/orchestrations/runs?${params}`,
    { headers: headers() }
  );
  return handleResponse<OrchestrationRun[]>(res);
}

export async function listExecutionSteps(
  executionId: string
): Promise<ExecutionStep[]> {
  const res = await fetch(
    `${BASE_URL}/v1/orchestrations/runs/${executionId}/steps`,
    { headers: headers() }
  );
  return handleResponse<ExecutionStep[]>(res);
}

export async function getRuntimeContract(
  planName: string
): Promise<RuntimeContract> {
  const res = await fetch(
    `${BASE_URL}/v1/runtime/contracts/${planName}`,
    { headers: headers() }
  );
  return handleResponse<RuntimeContract>(res);
}

export async function getRuntimeContractOpenApi(
  planName: string
): Promise<Record<string, unknown>> {
  const res = await fetch(
    `${BASE_URL}/v1/runtime/contracts/${planName}/openapi`,
    { headers: headers() }
  );
  return handleResponse<Record<string, unknown>>(res);
}



// ── Execution History ──────────────────────────────────────────────
export interface ExecutionRecord {
  execution_id: string;
  plan_id:      string | null;
  plan_name:    string;
  entity_type:  string;
  tenant_id:    string;
  params:       Record<string, string>;
  results:      Record<string, unknown>;
  errors:       Record<string, string>;
  status:       string;
  duration_ms:  number;
  executed_by:  string | null;
  executed_at:  string;
}

export async function listExecutions(filters?: {
  plan_name?: string;
  tenant_id?: string;
  status?: string;
  limit?: number;
}): Promise<ExecutionRecord[]> {
  const params = new URLSearchParams();
  if (filters?.plan_name) params.set('plan_name', filters.plan_name);
  if (filters?.tenant_id) params.set('tenant_id', filters.tenant_id);
  if (filters?.status)    params.set('status',    filters.status);
  if (filters?.limit)     params.set('limit',     String(filters.limit));
  const res = await fetch(`${BASE_URL}/v1/executions?${params}`, { headers: headers() });
  return handleResponse<ExecutionRecord[]>(res);
}

export async function getExecution(id: string): Promise<ExecutionRecord> {
  const res = await fetch(`${BASE_URL}/v1/executions/${id}`, { headers: headers() });
  return handleResponse<ExecutionRecord>(res);
}

export async function deleteExecution(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/v1/executions/${id}`, {
    method: 'DELETE', headers: headers(),
  });
  return handleResponse<void>(res);
}

// ── Tenant Policies ────────────────────────────────────────────────
export interface TenantPolicy {
  tenant_id:       string;
  max_concurrency: number;
  max_retries:     number;
  timeout_ms:      number;
  error_policy:    string;
  is_active:       boolean;
  notes:           string | null;
  created_at:      string;
  updated_at:      string;
}

export async function listTenants(): Promise<TenantPolicy[]> {
  const res = await fetch(`${BASE_URL}/admin/tenants`, { headers: headers() });
  return handleResponse<TenantPolicy[]>(res);
}

export async function getTenantPolicy(tenantId: string): Promise<TenantPolicy> {
  const res = await fetch(`${BASE_URL}/admin/tenants/${tenantId}/policy`, { headers: headers() });
  return handleResponse<TenantPolicy>(res);
}

export async function saveTenantPolicy(
  tenantId: string,
  payload: Omit<TenantPolicy, 'tenant_id' | 'created_at' | 'updated_at'>
): Promise<TenantPolicy> {
  const res = await fetch(`${BASE_URL}/admin/tenants/${tenantId}/policy`, {
    method: 'POST', headers: headers(), body: JSON.stringify(payload),
  });
  return handleResponse<TenantPolicy>(res);
}

// ── Tenant Budgets ─────────────────────────────────────────────────
export interface TenantBudget {
  tenant_id:    string;
  max_rows:     number;
  max_bytes_mb: number;
  max_cost_usd: number;
  alert_at_pct: number;
  created_at:   string;
  updated_at:   string;
}

export async function getTenantBudget(tenantId: string): Promise<TenantBudget> {
  const res = await fetch(`${BASE_URL}/admin/tenants/${tenantId}/budget`, { headers: headers() });
  return handleResponse<TenantBudget>(res);
}

export async function saveTenantBudget(
  tenantId: string,
  payload: Omit<TenantBudget, 'tenant_id' | 'created_at' | 'updated_at'>
): Promise<TenantBudget> {
  const res = await fetch(`${BASE_URL}/admin/tenants/${tenantId}/budget`, {
    method: 'POST', headers: headers(), body: JSON.stringify(payload),
  });
  return handleResponse<TenantBudget>(res);
}

// ── Datasources ────────────────────────────────────────────────────
export interface Datasource {
  datasource_id: string;
  name:          string;
  kind:          string;
  host:          string | null;
  port:          string | null;
  database_name: string | null;
  username:      string | null;
  description:   string | null;
  is_active:     boolean;
  tags:          string[];
  tenant_id:     string | null;
  created_at:    string;
  updated_at:    string;
}

export async function listDatasources(
  filters?: { kind?: string; is_active?: boolean }
): Promise<Datasource[]> {
  const params = new URLSearchParams();
  if (filters?.kind) params.set('kind', filters.kind);
  if (filters?.is_active !== undefined)
    params.set('is_active', String(filters.is_active));
  const res = await fetch(
    `${BASE_URL}/admin/datasources?${params}`,
    { headers: headers() }
  );
  return handleResponse<Datasource[]>(res);
}

export async function createDatasource(
  payload: Omit<Datasource, 'datasource_id' | 'created_at' | 'updated_at'>
): Promise<Datasource> {
  const res = await fetch(`${BASE_URL}/admin/datasources`, {
    method: 'POST', headers: headers(), body: JSON.stringify(payload),
  });
  return handleResponse<Datasource>(res);
}

export async function updateDatasource(
  id: string,
  payload: Partial<Datasource>
): Promise<Datasource> {
  const res = await fetch(`${BASE_URL}/admin/datasources/${id}`, {
    method: 'PUT', headers: headers(), body: JSON.stringify(payload),
  });
  return handleResponse<Datasource>(res);
}

export async function deleteDatasource(id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/admin/datasources/${id}`, {
    method: 'DELETE', headers: headers(),
  });
  return handleResponse<void>(res);
}

export async function testDatasource(
  id: string
): Promise<{ status: string; message: string }> {
  const res = await fetch(`${BASE_URL}/admin/datasources/${id}/test`, {
    method: 'POST', headers: headers(),
  });
  return handleResponse<{ status: string; message: string }>(res);
}

// ── Health ─────────────────────────────────────────────────────────
export async function healthCheck(): Promise<{ status: string; service: string }> {
  const res = await fetch(`${BASE_URL}/health`);
  return handleResponse(res);
}

// ── Evidence Bundles ───────────────────────────────────────────────
export interface EvidenceBundle {
  evidence_id:       string;
  execution_id:      string;
  tenant_id:         string;
  plan_name:         string;
  step_key:          string;
  safety_request_id: string | null;
  sanitized_sql:     string | null;
  prompt_hash:       string | null;
  model_version:     string | null;
  result_snapshot:   Record<string, unknown>;
  metadata:          Record<string, unknown>;
  hash:              string;
  signed:            boolean;
  created_at:        string;
}

export async function listEvidenceBundles(filters?: {
  tenant_id?: string;
  plan_name?: string;
}): Promise<EvidenceBundle[]> {
  const params = new URLSearchParams();
  if (filters?.tenant_id) params.set('tenant_id', filters.tenant_id);
  if (filters?.plan_name) params.set('plan_name',  filters.plan_name);
  const res = await fetch(
    `${BASE_URL}/v1/evidence/bundles?${params}`,
    { headers: headers() }
  );
  return handleResponse<EvidenceBundle[]>(res);
}

export async function getEvidenceBundle(id: string): Promise<EvidenceBundle> {
  const res = await fetch(
    `${BASE_URL}/v1/evidence/bundles/${id}`,
    { headers: headers() }
  );
  return handleResponse<EvidenceBundle>(res);
}


export async function validateIntent(payload: {
  intent: string;
  customer_context?: Record<string, unknown>;
  tenant_id?: string;
}): Promise<{
  intent: string;
  overall_validation_status: string;
  rule_results: { rule: string; status: string; reason: string }[];
  can_auto_process: boolean;
}> {
  const res = await fetch(`${BASE_URL}/v1/intent/validate`, {
    method: 'POST', headers: headers(), body: JSON.stringify(payload),
  });
  return handleResponse(res);
}


// ── ITSM ───────────────────────────────────────────────────────────
export interface ITSMTicket {
  ticket_id:   string;
  summary:     string;
  description: string;
  priority:    string;
  status:      string;
  ticket_type: string;
  itsm_system: string;
  evidence_id: string | null;
  created_at:  string;
  resolution:  string | null;
  url:         string;
}

export async function createITSMTicket(payload: {
  summary: string; description: string;
  priority?: string; evidence_id?: string;
  intent?: string; itsm_system?: string;
}): Promise<ITSMTicket> {
  const res = await fetch(`${BASE_URL}/v1/itsm/tickets`, {
    method: 'POST', headers: headers(), body: JSON.stringify(payload),
  });
  return handleResponse<ITSMTicket>(res);
}

export async function getITSMTicket(id: string): Promise<ITSMTicket> {
  const res = await fetch(
    `${BASE_URL}/v1/itsm/tickets/${id}`,
    { headers: headers() }
  );
  return handleResponse<ITSMTicket>(res);
}
export async function listITSMTickets(status?: string, ticketType?: string): Promise<{ tickets: ITSMTicket[]; total: number }> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (ticketType) params.set('ticket_type', ticketType);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${BASE_URL}/v1/itsm/tickets${qs}`, { headers: headers() });
  return handleResponse<{ tickets: ITSMTicket[]; total: number }>(res);
}

export async function resolveITSMTicket(
  ticketId: string,
  payload: { reviewed_by: string; decision_reason: string }
): Promise<ITSMTicket> {
  const res = await fetch(`${BASE_URL}/v1/itsm/tickets/${ticketId}/resolve`, {
    method: 'POST', headers: headers(), body: JSON.stringify(payload),
  });
  return handleResponse<ITSMTicket>(res);
}

// ── AI Copilot ─────────────────────────────────────────────────────
export async function copilotDesign(payload: {
  description: string; entity_type?: string; tenant_id?: string;
}): Promise<{
  plan: Record<string, unknown>;
  step_count: number;
  governance_notes: string[]
}> {
  const res = await fetch(`${BASE_URL}/v1/copilot/design`, {
    method: 'POST', headers: headers(), body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function copilotLint(payload: {
  plan: Record<string, unknown>;
}): Promise<{
  total_issues: number; errors: number; warnings: number;
  issues: { severity: string; step: string; issue: string; fix: string }[];
  safe_to_deploy: boolean
}> {
  const res = await fetch(`${BASE_URL}/v1/copilot/safety-lint`, {
    method: 'POST', headers: headers(), body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function copilotOptimize(payload: {
  plan: Record<string, unknown>; metering_data?: unknown[];
}): Promise<{
  suggestions: {
    type: string; step: string; issue: string;
    action: string; saving: string
  }[];
  estimated_savings: string
}> {
  const res = await fetch(`${BASE_URL}/v1/copilot/optimize`, {
    method: 'POST', headers: headers(), body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

// ── Knowledge Graph ────────────────────────────────────────────────
export async function getKnowledgeEntity(
  type: string, id: string
): Promise<{
  entity_id: string; entity_type: string;
  attributes: Record<string, unknown>;
  relationships: { type: string; target_id: string; target_type: string }[];
}> {
  const res = await fetch(
    `${BASE_URL}/v1/knowledge/entities/${type}/${id}`,
    { headers: headers() }
  );
  return handleResponse(res);
}

export async function synthesizeKnowledge(payload: {
  document_schema: Record<string, unknown>; entity_type?: string;
}): Promise<{
  field_mappings: {
    source_field: string; mapped_to: string; confidence: number
  }[];
  graph_coverage: number
}> {
  const res = await fetch(`${BASE_URL}/v1/knowledge/synthesize`, {
    method: 'POST', headers: headers(), body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

// ── Domain Packs ───────────────────────────────────────────────────
export interface DomainPack {
  pack_id:        string;
  name:           string;
  category:       string;
  version:        string;
  description:    string;
  features:       string[];
  templates:      string[];
  plan_count:     number;
  is_installed:   boolean;
  install_status: string;
}

export async function listDomainPacks(
  category?: string
): Promise<{ domain_packs: DomainPack[]; total: number; installed: number }> {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  const res = await fetch(
    `${BASE_URL}/admin/domain-packs?${params}`,
    { headers: headers() }
  );
  return handleResponse(res);
}

export async function installDomainPack(
  packId: string
): Promise<{ pack_id: string; status: string; message: string }> {
  const res = await fetch(`${BASE_URL}/admin/domain-packs/${packId}/install`, {
    method: 'POST', headers: headers(),
  });
  return handleResponse(res);
}

export async function uninstallDomainPack(
  packId: string
): Promise<{ pack_id: string; status: string; message: string }> {
  const res = await fetch(`${BASE_URL}/admin/domain-packs/${packId}/uninstall`, {
    method: 'DELETE', headers: headers(),
  });
  return handleResponse(res);
}

// ── Advanced Governance ────────────────────────────────────────────
export async function zkpValidate(payload: {
  attribute: string; claim: string; proof_token: string;
}): Promise<{
  proof_id: string; verified: boolean;
  explanation: string; privacy_preserved: boolean
}> {
  const res = await fetch(`${BASE_URL}/v1/zkp/validate`, {
    method: 'POST', headers: headers(), body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function createRedactionPolicy(payload: {
  role: string; fields: Record<string, string>;
}): Promise<{ policy_id: string; role: string; fields: Record<string, string> }> {
  const res = await fetch(`${BASE_URL}/v1/redaction/policy`, {
    method: 'POST', headers: headers(), body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function auditNarrative(payload: {
  evidence_id: string; format?: string; regulation?: string;
}): Promise<{ narrative_id: string; narrative: string; generated_at: string }> {
  const res = await fetch(`${BASE_URL}/v1/audit/narrative`, {
    method: 'POST', headers: headers(), body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function auditCounterfactual(payload: {
  evidence_id: string; decision: string;
}): Promise<{
  counterfactuals: {
    factor: string; change_needed: string; outcome_if_changed: string
  }[];
  explanation: string
}> {
  const res = await fetch(`${BASE_URL}/v1/audit/counterfactual`, {
    method: 'POST', headers: headers(), body: JSON.stringify(payload),
  });
  return handleResponse(res);
}


// ── AGENT-012: Agent Run API functions ─────────────────────────────
import type { AgentTaskRun, AgentTraceEvent, AgentApproval } from '../types';

export async function getAgentTaskRun(agentRunId: string): Promise<AgentTaskRun> {
  const res = await fetch(`${BASE_URL}/v1/agent-task-runs/${agentRunId}`, { headers: headers() });
  return handleResponse<AgentTaskRun>(res);
}

export async function getAgentTaskTrace(agentRunId: string): Promise<AgentTraceEvent[]> {
  const res = await fetch(`${BASE_URL}/v1/agent-task-runs/${agentRunId}/trace`, { headers: headers() });
  return handleResponse<AgentTraceEvent[]>(res);
}

export async function listAgentTasksForExecution(executionId: string): Promise<AgentTaskRun[]> {
  const res = await fetch(
     `${BASE_URL}/v1/orchestrations/runs/${executionId}/agent-tasks`,
    { headers: headers() }
  ); 
  return handleResponse<AgentTaskRun[]>(res);
}

export async function listAgentApprovals(filters?: {
  status?: string; tenant_id?: string; limit?: number;
}): Promise<AgentApproval[]> {
  const params = new URLSearchParams();
  if (filters?.status)    params.set('status',    filters.status);
  if (filters?.tenant_id) params.set('tenant_id', filters.tenant_id);
  if (filters?.limit)     params.set('limit',     String(filters.limit));
  const res = await fetch(`${BASE_URL}/v1/agent-approvals?${params}`, { headers: headers() });
  return handleResponse<AgentApproval[]>(res);
}

export async function approveAgentAction(
  approvalId: string,
  payload: { reviewed_by: string; decision_reason?: string }
): Promise<{ approval_id: string; status: string }> {
  const res = await fetch(`${BASE_URL}/v1/agent-approvals/${approvalId}/approve`, {
    method: 'POST', headers: headers(), body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function rejectAgentAction(
  approvalId: string,
  payload: { reviewed_by: string; decision_reason?: string }
): Promise<{ approval_id: string; status: string }> {
  const res = await fetch(`${BASE_URL}/v1/agent-approvals/${approvalId}/reject`, {
    method: 'POST', headers: headers(), body: JSON.stringify(payload),
  });
  return handleResponse(res);
}
// ── Human Review Approvals (NOC-D) ───────────────────────────────────
export async function listHumanReviewApprovals(
  status?: string
): Promise<HumanReviewApproval[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await fetch(`${BASE_URL}/v1/human-review-approvals${qs}`, { headers: headers() });
  return handleResponse<HumanReviewApproval[]>(res);
}

export async function approveHumanReview(
  approvalId: string,
  reviewedBy: string,
  decisionReason?: string
): Promise<{
  approval_id: string; status: string; execution_id: string;
  execution_status: string; paused_at_step: string | null;
  results: Record<string, unknown>; errors: Record<string, string>;
}> {
  const res = await fetch(`${BASE_URL}/v1/human-review-approvals/${approvalId}/approve`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ reviewed_by: reviewedBy, decision_reason: decisionReason }),
  });
  return handleResponse(res);
}

export async function rejectHumanReview(
  approvalId: string,
  reviewedBy: string,
  decisionReason?: string
): Promise<{ approval_id: string; status: string; execution_id: string; execution_status: string }> {
  const res = await fetch(`${BASE_URL}/v1/human-review-approvals/${approvalId}/reject`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ reviewed_by: reviewedBy, decision_reason: decisionReason }),
  });
  return handleResponse(res);
}