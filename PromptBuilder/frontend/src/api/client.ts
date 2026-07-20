// src/api/client.ts

import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';

// Read base URL from .env
const BASE_URL = import.meta.env?.VITE_API_BASE as string | undefined;

// Create axios instance with defaults
const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── Request interceptor ──────────────────────────────────────────────────────
// Automatically attach user identity to every request.
// The backend uses x-user-id for audit logging.
// In a real app this comes from auth context. For now it's a hardcoded dev user.
apiClient.interceptors.request.use((config) => {
  const userId = localStorage.getItem('tb_user_id') ?? 'dev_user';
  config.headers['x-user-id'] = userId;
  return config;
});

// ─── Response interceptor ────────────────────────────────────────────────────
// Parse error messages from backend into a clean Error object.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
  const detail = error.response?.data?.detail;
const message: string =
  Array.isArray(detail)
    ? detail.map((d: { msg?: string }) => d.msg ?? JSON.stringify(d)).join(', ')
    : typeof detail === 'string'
    ? detail
    : error.response?.data?.message ??
      error.message ??
      'An unexpected error occurred';
    return Promise.reject(new Error(message));
  }
);

// ─── Generic request helper ──────────────────────────────────────────────────
// All API modules use this instead of calling axios directly.
// T is the expected response type.
export async function apiRequest<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.request<T>(config);
  return response.data;
}

export default apiClient;
