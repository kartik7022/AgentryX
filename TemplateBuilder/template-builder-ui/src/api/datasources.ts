// src/api/datasources.ts

import { apiRequest } from './client';
import type { Datasource } from '../types/api';

// GET /v1/datasources/
export async function listDatasources(): Promise<Datasource[]> {
  try {
    return await apiRequest<Datasource[]>({
      method: 'GET',
      url: '/datasources/',
    });
  } catch {
    return [];
  }
}