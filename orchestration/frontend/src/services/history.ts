import type { Entity360Result } from '../types';

export interface ExecutionRecord {
  id:         string;
  plan_name:  string;
  entity_type:string;
  tenant_id:  string;
  params:     Record<string, string>;
  result:     Entity360Result;
  executed_at:string;
  duration_ms:number;
  status:     'success' | 'partial' | 'failed';
}

const KEY = 'orch_execution_history';
const MAX = 100;

export function saveExecution(record: Omit<ExecutionRecord, 'id'>): ExecutionRecord {
  const id = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const full: ExecutionRecord = { id, ...record };
  const existing = loadHistory();
  const updated  = [full, ...existing].slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(updated));
  return full;
}

export function loadHistory(): ExecutionRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ExecutionRecord[];
  } catch {
    return [];
  }
}

export function deleteExecution(id: string): void {
  const updated = loadHistory().filter(r => r.id !== id);
  localStorage.setItem(KEY, JSON.stringify(updated));
}

export function clearHistory(): void {
  localStorage.removeItem(KEY);
}
export function getExecution(id: string): ExecutionRecord | null {
  return loadHistory().find(r => r.id === id) ?? null;
}