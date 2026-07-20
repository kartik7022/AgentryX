// src/api/templates.ts
// Only listTemplates is needed — used by PromptRunConsolePage and
// PromptRunConsole for the "Generate Document" template dropdown.

import { apiRequest } from './client';
import type { Template } from '../types/api';

export async function listTemplates(
  params: { status_filter?: string } = {}
): Promise<Template[]> {
  return apiRequest<Template[]>({
    method: 'GET',
    url: '/templates',
    params,
  });
}
