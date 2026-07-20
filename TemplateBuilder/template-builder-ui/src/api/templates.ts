// src/api/templates.ts

import { apiRequest } from './client';
import type {
  Template,
  TemplateCreate,
  TemplateUpdate,
  TemplateVersion,
  LayoutBlock,
} from '../types/api';

export interface ListTemplatesParams {
  status_filter?: string;
  output_target?: string;
  industry?: string;
  search?: string;
}

// ── Helper: convert our blocks array → backend layout_json format ─────────────
function blocksToLayoutJson(blocks: LayoutBlock[]): Record<string, unknown> {
  return { blocks };  // backend expects { "blocks": [...] }
}

// GET /v1/templates
export async function listTemplates(
  params?: ListTemplatesParams
): Promise<Template[]> {
  return apiRequest<Template[]>({
    method: 'GET',
    url: '/templates',
    params,
  });
}

// GET /v1/templates/:id
export async function getTemplate(id: string): Promise<Template> {
  return apiRequest<Template>({
    method: 'GET',
    url: `/templates/${id}`,
  });
}

// POST /v1/templates
export async function createTemplate(
  body: TemplateCreate & { is_prebuilt?: boolean }
): Promise<Template> {
  return apiRequest<Template>({
    method: 'POST',
    url: '/templates',
    data: {
      name: body.name,
      description: body.description ?? '',
      output_target: body.output_target,
      layout_json: { blocks: [] },   // ← backend needs object not array
      created_by: localStorage.getItem('tb_user_id') ?? 'dev_user',
      tags: body.tags ?? [],
      industry: body.industry ?? null,
      is_prebuilt: body.is_prebuilt ?? false,
    },
  });
}

// PUT /v1/templates/:id
export async function updateTemplate(
  id: string,
  body: TemplateUpdate & { skip_audit?: boolean }
): Promise<Template> {
  return apiRequest<Template>({
    method: 'PUT',
    url: `/templates/${id}`,
    params: body.skip_audit ? { skip_audit: true } : undefined,
    data: {
      name: body.name,
      output_target: body.output_target,
      layout_json: blocksToLayoutJson(body.root_layout_json ?? []), // ← fix here
      tags: body.tags ?? [],
    },
  });
}

// POST /v1/templates/:id/publish
export async function publishTemplate(
  id: string,
  changeSummary?: string
): Promise<TemplateVersion> {
  return apiRequest<TemplateVersion>({
    method: 'POST',
    url: `/templates/${id}/publish`,
    data: { change_summary: changeSummary },
  });
}

// DELETE /v1/templates/:id
export async function deleteTemplate(id: string): Promise<void> {
  return apiRequest<void>({
    method: 'DELETE',
    url: `/templates/${id}`,
  });
}
// POST /v1/templates/:id/placeholders — bind placeholder to template
export async function bindPlaceholder(
  templateId: string,
  registryId: string,
  sampleValue?: string
): Promise<void> {
  return apiRequest<void>({
    method: 'POST',
    url: `/templates/${templateId}/placeholders`,
    data: {
      registry_id: registryId,
      override_sample_value: sampleValue ?? null,
    },
  });
}
// GET /v1/templates/:id/versions — not yet in backend
// We'll gracefully handle the 404 and return empty array
export async function listTemplateVersions(
  templateId: string
): Promise<TemplateVersion[]> {
  try {
    return await apiRequest<TemplateVersion[]>({
      method: 'GET',
      url: `/templates/${templateId}/versions`,
    });
  } catch {
    return [];
  }
}