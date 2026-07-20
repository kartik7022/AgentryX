// src/api/audit.ts

import { apiRequest } from './client';

export interface AuditEvent {
  entity_type: string;
  entity_id: string;
  action: string;
  actor: string;
  summary?: string;
  created_at: string;
}

export interface RenderJob {
  job_id: string;
  template_id: string;
  status: string;
  output_target: string;
  result_location?: string;
  logs?: string;
  created_at: string;
  updated_at: string;
}

// GET /v1/documents/jobs/:id
export async function getJobStatus(jobId: string): Promise<RenderJob> {
  return apiRequest<RenderJob>({
    method: 'GET',
    url: `/documents/jobs/${jobId}`,
  });
}