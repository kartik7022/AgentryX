// src/api/prompts.ts
// =============================================================================
// PB-013: Prompt Builder API client
// =============================================================================
//
// Wraps every endpoint in /v1/prompts/* and /v1/prompt-runs/* into a typed
// async function. Components import these instead of touching axios directly.
//
// All requests go through `apiRequest` from ./client, which:
//   - prepends VITE_API_BASE
//   - adds the x-user-id header for audit logging
//   - parses error responses into clean Error objects
//
// Style mirrors src/api/documents.ts and src/api/templates.ts.
// =============================================================================

import { apiRequest } from './client';
import type {
  Prompt,
  PromptCreate,
  PromptUpdate,
  PromptDetail,
  PromptBlock,
  PromptInput,
  PromptContextBinding,
  PromptSchemaPayload,
  PromptSchemaResponse,
  PromptVersion,
  PromptVersionCreatePayload,
  PromptPublishPayload,
  PromptRollbackPayload,
  PromptRunRequest,
  PromptRunResponse,
  PromptTestCase,
  PromptTestCaseCreate,
  PromptTestCaseUpdate,
  PromptTestRunRequest,
  PromptTestRunResponse,
  PromptEvaluation,
  PromptEvaluationSweep,
  PromptGenerateDocumentRequest,
  PromptGenerateDocumentResponse,
} from '../types/api';


// ─── Filters used by listPrompts ─────────────────────────────────────────────

export interface ListPromptsFilters {
  status?: string;
  industry?: string;
  use_case?: string;
  search?: string;
  limit?: number;
  offset?: number;
}


// =============================================================================
// PROMPT CRUD
// =============================================================================

/** GET /v1/prompts */
export async function listPrompts(
  filters: ListPromptsFilters = {}
): Promise<Prompt[]> {
  const params: Record<string, unknown> = {};
  // Backend reads `status_filter` from query string (it shadows FastAPI's `status`)
  if (filters.status)   params.status_filter = filters.status;
  if (filters.industry) params.industry      = filters.industry;
  if (filters.use_case) params.use_case      = filters.use_case;
  if (filters.search)   params.search        = filters.search;
  if (filters.limit !== undefined)  params.limit  = filters.limit;
  if (filters.offset !== undefined) params.offset = filters.offset;

  return apiRequest<Prompt[]>({
    method: 'GET',
    url: '/prompts',
    params,
  });
}

/** GET /v1/prompts/{prompt_id} — full detail with blocks/inputs/bindings */
export async function getPrompt(promptId: string): Promise<PromptDetail> {
  return apiRequest<PromptDetail>({
    method: 'GET',
    url: `/prompts/${promptId}`,
  });
}

/** POST /v1/prompts */
export async function createPrompt(body: PromptCreate): Promise<Prompt> {
  return apiRequest<Prompt>({
    method: 'POST',
    url: '/prompts',
    data: body,
  });
}

/** PUT /v1/prompts/{prompt_id} */
export async function updatePrompt(
  promptId: string,
  body: PromptUpdate
): Promise<Prompt> {
  return apiRequest<Prompt>({
    method: 'PUT',
    url: `/prompts/${promptId}`,
    data: body,
  });
}

/** DELETE /v1/prompts/{prompt_id} — soft delete (sets status='archived') */
export async function deletePrompt(promptId: string): Promise<{
  status: string;
  prompt_id: string;
  message: string;
}> {
  return apiRequest<{ status: string; prompt_id: string; message: string }>({
    method: 'DELETE',
    url: `/prompts/${promptId}`,
  });
}

/** POST /v1/prompts/{prompt_id}/duplicate */
export async function duplicatePrompt(promptId: string): Promise<Prompt> {
  return apiRequest<Prompt>({
    method: 'POST',
    url: `/prompts/${promptId}/duplicate`,
  });
}


// =============================================================================
// PROMPT STRUCTURE  (blocks / inputs / bindings / schema)
// =============================================================================

// ─── Blocks ──────────────────────────────────────────────────────────────────

/** GET /v1/prompts/{prompt_id}/blocks */
export async function getPromptBlocks(promptId: string): Promise<PromptBlock[]> {
  return apiRequest<PromptBlock[]>({
    method: 'GET',
    url: `/prompts/${promptId}/blocks`,
  });
}

/** PUT /v1/prompts/{prompt_id}/blocks — replace ALL blocks transactionally */
export async function savePromptBlocks(
  promptId: string,
  blocks: PromptBlock[]
): Promise<PromptBlock[]> {
  return apiRequest<PromptBlock[]>({
    method: 'PUT',
    url: `/prompts/${promptId}/blocks`,
    data: blocks,
  });
}

// ─── Inputs ──────────────────────────────────────────────────────────────────

/** GET /v1/prompts/{prompt_id}/inputs */
export async function getPromptInputs(promptId: string): Promise<PromptInput[]> {
  return apiRequest<PromptInput[]>({
    method: 'GET',
    url: `/prompts/${promptId}/inputs`,
  });
}

/** PUT /v1/prompts/{prompt_id}/inputs — replace ALL inputs */
export async function savePromptInputs(
  promptId: string,
  inputs: PromptInput[]
): Promise<PromptInput[]> {
  return apiRequest<PromptInput[]>({
    method: 'PUT',
    url: `/prompts/${promptId}/inputs`,
    data: inputs,
  });
}

// ─── Context bindings ────────────────────────────────────────────────────────

/** GET /v1/prompts/{prompt_id}/context-bindings */
export async function getPromptContextBindings(
  promptId: string
): Promise<PromptContextBinding[]> {
  return apiRequest<PromptContextBinding[]>({
    method: 'GET',
    url: `/prompts/${promptId}/context-bindings`,
  });
}

/** PUT /v1/prompts/{prompt_id}/context-bindings — replace ALL bindings */
export async function savePromptContextBindings(
  promptId: string,
  bindings: PromptContextBinding[]
): Promise<PromptContextBinding[]> {
  return apiRequest<PromptContextBinding[]>({
    method: 'PUT',
    url: `/prompts/${promptId}/context-bindings`,
    data: bindings,
  });
}

// ─── Schema (input/output/guardrails on latest draft version) ────────────────

/** GET /v1/prompts/{prompt_id}/schema */
export async function getPromptSchema(promptId: string): Promise<PromptSchemaResponse> {
  return apiRequest<PromptSchemaResponse>({
    method: 'GET',
    url: `/prompts/${promptId}/schema`,
  });
}

/** PUT /v1/prompts/{prompt_id}/schema — auto-creates draft v1 if missing */
export async function savePromptSchema(
  promptId: string,
  body: PromptSchemaPayload
): Promise<PromptSchemaResponse> {
  return apiRequest<PromptSchemaResponse>({
    method: 'PUT',
    url: `/prompts/${promptId}/schema`,
    data: body,
  });
}


// =============================================================================
// PROMPT EXECUTION  (runs + traces)
// =============================================================================

/** POST /v1/prompts/run — the orchestrator entry point */
export async function runPrompt(body: PromptRunRequest): Promise<PromptRunResponse> {
  return apiRequest<PromptRunResponse>({
    method: 'POST',
    url: '/prompts/run',
    data: body,
  });
}

/** GET /v1/prompt-runs/{run_id} — fetch a single run row (PB-007 stores these) */
export async function getPromptRun(runId: string): Promise<Record<string, unknown>> {
  return apiRequest<Record<string, unknown>>({
    method: 'GET',
    url: `/prompt-runs/${runId}`,
  });
}

/** GET /v1/prompt-runs/{run_id}/trace — step-by-step trace of one run */
export async function getPromptRunTrace(
  runId: string
): Promise<Record<string, unknown>[]> {
  return apiRequest<Record<string, unknown>[]>({
    method: 'GET',
    url: `/prompt-runs/${runId}/trace`,
  });
}


// =============================================================================
// PROMPT VERSIONS  (PB-009)
// =============================================================================

/** GET /v1/prompts/{prompt_id}/versions */
export async function listPromptVersions(promptId: string): Promise<PromptVersion[]> {
  return apiRequest<PromptVersion[]>({
    method: 'GET',
    url: `/prompts/${promptId}/versions`,
  });
}

/** POST /v1/prompts/{prompt_id}/versions — snapshot current state as new version */
export async function createPromptVersion(
  promptId: string,
  body: PromptVersionCreatePayload = {}
): Promise<PromptVersion> {
  return apiRequest<PromptVersion>({
    method: 'POST',
    url: `/prompts/${promptId}/versions`,
    data: body,
  });
}

/**
 * POST /v1/prompts/{prompt_id}/publish
 * Convenience overload: pass either a full payload or just a change_summary string.
 */
export async function publishPrompt(
  promptId: string,
  payloadOrSummary: PromptPublishPayload | string = {}
): Promise<PromptVersion> {
  const body: PromptPublishPayload =
    typeof payloadOrSummary === 'string'
      ? { change_summary: payloadOrSummary }
      : payloadOrSummary;
  return apiRequest<PromptVersion>({
    method: 'POST',
    url: `/prompts/${promptId}/publish`,
    data: body,
  });
}

/** POST /v1/prompts/{prompt_id}/rollback */
export async function rollbackPrompt(
  promptId: string,
  body: PromptRollbackPayload
): Promise<PromptVersion> {
  return apiRequest<PromptVersion>({
    method: 'POST',
    url: `/prompts/${promptId}/rollback`,
    data: body,
  });
}


// =============================================================================
// PROMPT TESTING LAB  (PB-010)
// =============================================================================

// ─── Test Cases CRUD ─────────────────────────────────────────────────────────

/** GET /v1/prompts/{prompt_id}/test-cases */
export async function listPromptTestCases(promptId: string): Promise<PromptTestCase[]> {
  return apiRequest<PromptTestCase[]>({
    method: 'GET',
    url: `/prompts/${promptId}/test-cases`,
  });
}

/** POST /v1/prompts/{prompt_id}/test-cases */
export async function createPromptTestCase(
  promptId: string,
  body: PromptTestCaseCreate
): Promise<PromptTestCase> {
  return apiRequest<PromptTestCase>({
    method: 'POST',
    url: `/prompts/${promptId}/test-cases`,
    data: body,
  });
}

/** PUT /v1/prompts/{prompt_id}/test-cases/{test_id} */
export async function updatePromptTestCase(
  promptId: string,
  testId: string,
  body: PromptTestCaseUpdate
): Promise<PromptTestCase> {
  return apiRequest<PromptTestCase>({
    method: 'PUT',
    url: `/prompts/${promptId}/test-cases/${testId}`,
    data: body,
  });
}

/** DELETE /v1/prompts/{prompt_id}/test-cases/{test_id} */
export async function deletePromptTestCase(
  promptId: string,
  testId: string
): Promise<{ status: string; test_id: string; message: string }> {
  return apiRequest<{ status: string; test_id: string; message: string }>({
    method: 'DELETE',
    url: `/prompts/${promptId}/test-cases/${testId}`,
  });
}

// ─── Test Execution ──────────────────────────────────────────────────────────

/** POST /v1/prompts/{prompt_id}/test — run one test (saved or ad hoc) */
export async function runPromptTest(
  promptId: string,
  body: PromptTestRunRequest
): Promise<PromptTestRunResponse> {
  return apiRequest<PromptTestRunResponse>({
    method: 'POST',
    url: `/prompts/${promptId}/test`,
    data: body,
  });
}

/** POST /v1/prompts/{prompt_id}/evaluate — run ALL test cases (regression sweep) */
export async function evaluatePromptTestCases(
  promptId: string
): Promise<PromptEvaluationSweep> {
  return apiRequest<PromptEvaluationSweep>({
    method: 'POST',
    url: `/prompts/${promptId}/evaluate`,
  });
}

/** GET /v1/prompts/{prompt_id}/evaluations — recent evaluation history */
export async function listPromptEvaluations(
  promptId: string,
  limit = 50
): Promise<PromptEvaluation[]> {
  return apiRequest<PromptEvaluation[]>({
    method: 'GET',
    url: `/prompts/${promptId}/evaluations`,
    params: { limit },
  });
}


// =============================================================================
// PROMPT → DOCUMENT INTEGRATION  (PB-011)
// =============================================================================

/** POST /v1/prompts/{prompt_id}/generate-document */
export async function generateDocumentFromPrompt(
  promptId: string,
  body: PromptGenerateDocumentRequest
): Promise<PromptGenerateDocumentResponse> {
  return apiRequest<PromptGenerateDocumentResponse>({
    method: 'POST',
    url: `/prompts/${promptId}/generate-document`,
    data: body,
  });
}