// src/api/documents.ts

import { apiRequest } from './client';

export interface GenerateRequest {
  template_id: string;
  output_target: string;
  locale?: string;
  runtime_params?: Record<string, string>;
}

export interface GenerateResponse {
  status: string;
  job_id: string;
}

export interface JobStatus {
  job_id: string;
  status: string;
  output_target: string;
  result_location?: string;
  logs?: string;
  created_at: string;
  updated_at: string;
}

// POST /v1/documents/generate
export async function generateDocument(
  body: GenerateRequest
): Promise<GenerateResponse> {
  return apiRequest<GenerateResponse>({
    method: 'POST',
    url: '/documents/generate',
    data: body,
  });
}

// GET /v1/documents/jobs/:job_id
export async function getJobStatus(jobId: string): Promise<JobStatus> {
  return apiRequest<JobStatus>({
    method: 'GET',
    url: `/documents/jobs/${jobId}`,
  });
}
// ── Local job storage ─────────────────────────────────────────────────────────
const JOBS_KEY = 'tb_generated_jobs';

export interface LocalJob {
  job_id: string;
  template_id: string;
  template_name: string;
  output_target: string;
  status: string;
  runtime_params: Record<string, string>;
  created_at: string;
  result_location?: string;
}

export function saveJobLocally(job: LocalJob) {
  const jobs: LocalJob[] = JSON.parse(localStorage.getItem(JOBS_KEY) ?? '[]');
  jobs.unshift(job); // newest first
  localStorage.setItem(JOBS_KEY, JSON.stringify(jobs.slice(0, 50))); // keep last 50
}

export function listLocalJobs(): LocalJob[] {
  return JSON.parse(localStorage.getItem(JOBS_KEY) ?? '[]');
}

export function clearLocalJobs() {
  localStorage.removeItem(JOBS_KEY);
}