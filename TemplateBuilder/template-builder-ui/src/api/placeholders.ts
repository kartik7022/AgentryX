// src/api/placeholders.ts

import { apiRequest } from './client';
import type { Placeholder, PlaceholderCreate } from '../types/api';

export interface ListPlaceholdersParams {
  name?: string;
  category?: string;
}

// GET /v1/registry/placeholders
export async function listPlaceholders(
  _params?: ListPlaceholdersParams
): Promise<Placeholder[]> {
  try {
    return await apiRequest<Placeholder[]>({
      method: 'GET',
      url: '/registry/placeholders',
      params: _params,
    });
  } catch {
    return [];
  }
}

// POST /v1/registry/placeholders
export async function createPlaceholder(
  body: PlaceholderCreate
): Promise<Placeholder> {
  return apiRequest<Placeholder>({
    method: 'POST',
    url: '/registry/placeholders',
    data: {
      name: body.name,
      generation_mode: body.generation_mode,
      sql_text: body.sql_text,
      prompt: body.prompt,
      datasource_id: 1,          // ← integer, not string
      sample_value: body.sample_value,
      value_type: body.value_type ?? 'string',
      cardinality: body.cardinality ?? 'scalar',
      created_by: localStorage.getItem('tb_user_id') ?? 'dev_user', // ← required
    },
  });
}

// GET /v1/registry/placeholders/:id
export async function getPlaceholderById(id: string): Promise<Placeholder> {
  return apiRequest<Placeholder>({
    method: 'GET',
    url: `/registry/placeholders/${id}`,
  });
}
// PUT /v1/registry/placeholders/:id
export async function updatePlaceholder(
  id: string,
  body: Partial<PlaceholderCreate>
): Promise<Placeholder> {
  return apiRequest<Placeholder>({
    method: 'PUT',
    url: `/registry/placeholders/${id}`,
    data: body,
  });
}