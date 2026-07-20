// src/pages/RunHistoryPage.tsx
// Shows all prompt runs for a selected prompt — filterable by status and date

import { useState, useEffect, useCallback } from 'react';
import { listPrompts } from '../api/prompts';
import { apiRequest } from '../api/client';
import type { Prompt } from '../types/api';

interface PromptRun {
  run_id:              string;
  prompt_id:           string;
  version_id:          string | null;
  status:              string;
  runtime_params_json: Record<string, unknown>;
  output_json:         Record<string, unknown> | null;
  raw_output:          string | null;
  error_message:       string | null;
  latency_ms:          number | null;
  created_by:          string;
  created_at:          string;
}

interface RunDetail extends PromptRun {
  traces?: unknown[];
}

function relativeTime(iso: string): string {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ms(val: number | null): string {
  if (!val) return '—';
  return val >= 1000 ? `${(val / 1000).toFixed(2)}s` : `${val}ms`;
}

async function listPromptRuns(promptId: string, limit = 50, status?: string): Promise<PromptRun[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (status) params.set('status', status);
  return apiRequest<PromptRun[]>({ method: 'GET', url: `/prompts/${promptId}/runs?${params}` });
}

async function getPromptRunDetail(runId: string): Promise<RunDetail> {
  return apiRequest<RunDetail>({ method: 'GET', url: `/prompt-runs/${runId}` });
}

export default function RunHistoryPage() {
  const [prompts,          setPrompts]          = useState<Prompt[]>([]);
  const [selectedId,       setSelectedId]       = useState('');
  const [runs,             setRuns]             = useState<PromptRun[]>([]);
  const [isLoadingPrompts, setIsLoadingPrompts] = useState(true);
  const [isLoadingRuns,    setIsLoadingRuns]    = useState(false);
  const [statusFilter,     setStatusFilter]     = useState('');
  const [selectedRun,      setSelectedRun]      = useState<RunDetail | null>(null);
  const [isLoadingDetail,  setIsLoadingDetail]  = useState(false);
  const [error,            setError]            = useState<string | null>(null);
  const [detailTab,        setDetailTab]        = useState<'output' | 'params' | 'raw'>('output');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoadingPrompts(true);
    listPrompts()
      .then(data => setPrompts(data.filter(p => p.status !== 'archived')))
      .catch(err => setError((err as Error).message))
      .finally(() => setIsLoadingPrompts(false));
  }, []);

  const fetchRuns = useCallback(async () => {
    if (!selectedId) return;
    setIsLoadingRuns(true);
    setError(null);
    setSelectedRun(null);
    try {
      const data = await listPromptRuns(selectedId, 50, statusFilter || undefined);
      setRuns(data);
    } catch (err) {
      setError((err as Error).message || 'Failed to load runs');
    } finally {
      setIsLoadingRuns(false);
    }
  }, [selectedId, statusFilter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  async function handleSelectRun(run: PromptRun) {
    setSelectedRun(run as RunDetail);
    setDetailTab('output');
    setIsLoadingDetail(true);
    try {
      const detail = await getPromptRunDetail(run.run_id);
      setSelectedRun(detail);
    } catch {
      // keep basic run data if detail fetch fails
    } finally {
      setIsLoadingDetail(false);
    }
  }

  const selectedPrompt = prompts.find(p => p.prompt_id === selectedId);
  const successCount = runs.filter(r => r.status === 'success').length;
  const errorCount   = runs.filter(r => r.status === 'error').length;
  const avgLatency   = runs.filter(r => r.latency_ms).reduce((a, b) => a + (b.latency_ms || 0), 0) / (runs.filter(r => r.latency_ms).length || 1);

  return (
    <div style={S.page}>

      {/* Hero */}
      <div style={S.hero}>
        <div style={S.heroIcon}>📋</div>
        <div>
          <h1 style={S.title}>Run History</h1>
          <p style={S.subtitle}>View every prompt execution — inputs, outputs, latency and errors.</p>
        </div>
      </div>

      {/* Selector bar */}
      <div style={S.bar}>
        <span style={S.barLabel}>Prompt:</span>
        <select value={selectedId} onChange={e => { setSelectedId(e.target.value); setSelectedRun(null); }} style={S.select} disabled={isLoadingPrompts}>
          <option value="">{isLoadingPrompts ? 'Loading...' : '— select a prompt —'}</option>
          {prompts.map(p => (
            <option key={p.prompt_id} value={p.prompt_id}>{p.name} {p.status === 'published' ? '✅' : '(draft)'}</option>
          ))}
        </select>

        {selectedId && (
          <>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...S.select, minWidth: 160 }}>
              <option value="">All statuses</option>
              <option value="success">✅ Success</option>
              <option value="error">❌ Error</option>
              <option value="running">⟳ Running</option>
            </select>
            <button type="button" style={S.refreshBtn} onClick={fetchRuns} disabled={isLoadingRuns}>
              {isLoadingRuns ? '⟳' : '↻'} Refresh
            </button>
          </>
        )}
      </div>

      {/* Error */}
      {error && <div style={S.errorBanner}>⚠️ {error}</div>}

      {/* Empty state */}
      {!selectedId && !isLoadingPrompts && (
        <div style={S.empty}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          <div style={S.emptyTitle}>Select a prompt to see its run history</div>
          <div style={S.emptyHint}>Every time a prompt is executed — from Run Console or API — it's logged here.</div>
        </div>
      )}

      {/* Stats */}
      {selectedId && !isLoadingRuns && runs.length > 0 && (
        <div style={S.stats}>
          <div style={S.statCard}>
            <div style={{ ...S.statVal, color: 'var(--color-primary-700)' }}>{runs.length}</div>
            <div style={S.statLabel}>Total runs</div>
          </div>
          <div style={S.statCard}>
            <div style={{ ...S.statVal, color: 'var(--color-accent-700)' }}>{successCount}</div>
            <div style={S.statLabel}>Successful</div>
          </div>
          <div style={S.statCard}>
            <div style={{ ...S.statVal, color: 'var(--color-error-text)' }}>{errorCount}</div>
            <div style={S.statLabel}>Failed</div>
          </div>
          <div style={S.statCard}>
            <div style={{ ...S.statVal, color: 'var(--color-warning-text)' }}>{successCount > 0 ? `${((successCount / runs.length) * 100).toFixed(0)}%` : '—'}</div>
            <div style={S.statLabel}>Success rate</div>
          </div>
          <div style={S.statCard}>
            <div style={{ ...S.statVal, color: 'var(--color-accent-700)' }}>{ms(Math.round(avgLatency))}</div>
            <div style={S.statLabel}>Avg latency</div>
          </div>
        </div>
      )}

      {/* Main layout */}
      {selectedId && !isLoadingRuns && (
        <div style={S.cols}>

          {/* LEFT — run list */}
          <div style={S.left}>
            {runs.length === 0 ? (
              <div style={S.empty}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
                <div style={S.emptyTitle}>No runs yet for "{selectedPrompt?.name}"</div>
                <div style={S.emptyHint}>Go to Run Console and execute this prompt to see history here.</div>
              </div>
            ) : (
              <div style={S.list}>
                {runs.map(run => (
                  <div
                    key={run.run_id}
                    style={{ ...S.runCard, ...(selectedRun?.run_id === run.run_id ? S.runCardActive : {}) }}
                    onClick={() => handleSelectRun(run)}
                  >
                    <div style={{ ...S.statusDot, background: run.status === 'success' ? 'var(--color-accent-700)' : run.status === 'error' ? 'var(--color-error-text)' : 'var(--color-warning-text)' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={S.runTopRow}>
                        <span style={{ ...S.statusPill, ...(run.status === 'success' ? S.pillSuccess : run.status === 'error' ? S.pillError : S.pillRunning) }}>
                          {run.status === 'success' ? '✅' : run.status === 'error' ? '❌' : '⟳'} {run.status}
                        </span>
                        <span style={S.runTime}>{relativeTime(run.created_at)}</span>
                      </div>
                      <div style={S.runId}>
                        <code style={{ fontSize: 11, fontFamily: 'var(--font-family-mono)' }}>{run.run_id.slice(0, 8)}…</code>
                        {run.latency_ms && <span style={S.latencyChip}>⏱ {ms(run.latency_ms)}</span>}
                      </div>
                      {Object.keys(run.runtime_params_json || {}).length > 0 && (
                        <div style={S.paramsPreview}>
                          {Object.entries(run.runtime_params_json).slice(0, 2).map(([k, v]) => (
                            <span key={k} style={S.paramChip}>{k}: {String(v).slice(0, 20)}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT — run detail */}
          <div style={S.right}>
            {!selectedRun ? (
              <div style={S.detailEmpty}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>👈</div>
                <div style={{ fontWeight: 600, color: 'var(--color-text-strong)', marginBottom: 4 }}>Select a run to see details</div>
                <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Click any run on the left to inspect inputs, outputs and errors.</div>
              </div>
            ) : (
              <>
                {/* Run header */}
                <div style={S.detailHeader}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ ...S.statusPill, ...(selectedRun.status === 'success' ? S.pillSuccess : selectedRun.status === 'error' ? S.pillError : S.pillRunning) }}>
                        {selectedRun.status === 'success' ? '✅' : '❌'} {selectedRun.status}
                      </span>
                      <code style={{ fontSize: 12, color: 'var(--color-text-muted)', fontFamily: 'var(--font-family-mono)' }}>{selectedRun.run_id.slice(0, 16)}…</code>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-soft)', marginTop: 4 }}>
                      {new Date(selectedRun.created_at).toLocaleString('en-IN')} · by {selectedRun.created_by}
                      {selectedRun.latency_ms && ` · ${ms(selectedRun.latency_ms)}`}
                    </div>
                  </div>
                </div>

                {/* Error message */}
                {selectedRun.error_message && (
                  <div style={S.errorBanner}>⚠️ {selectedRun.error_message}</div>
                )}

                {/* Detail tabs */}
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['output', 'params', 'raw'] as const).map(t => (
                    <button key={t} type="button"
                      style={{ ...S.detailTab, ...(detailTab === t ? S.detailTabActive : {}) }}
                      onClick={() => setDetailTab(t)}>
                      {t === 'output' ? '📦 Output' : t === 'params' ? '🔡 Inputs' : '📝 Raw'}
                    </button>
                  ))}
                </div>

                {isLoadingDetail ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)' }}>⟳ Loading details...</div>
                ) : (
                  <div style={S.detailBox}>
                    <pre style={S.pre}>
                      {detailTab === 'output'
                        ? JSON.stringify(selectedRun.output_json ?? {}, null, 2)
                        : detailTab === 'params'
                          ? JSON.stringify(selectedRun.runtime_params_json ?? {}, null, 2)
                          : (selectedRun.raw_output || '(empty)')}
                    </pre>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page:     { padding: '20px 24px', maxWidth: 1280, margin: '0 auto', fontFamily: "var(--font-family-sans)" },
  hero:     { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18, background: 'linear-gradient(135deg, var(--color-primary-50) 0%, var(--color-primary-100) 50%, var(--color-primary-50) 100%)', borderRadius: 18, padding: '18px 22px', border: '1px solid rgba(191, 219, 254, 0.85)', boxShadow: '0 4px 20px rgba(15, 23, 42, 0.06)' },
  heroIcon: { width: 48, height: 48, background: 'var(--color-primary-700)', color: 'var(--color-text-strong)', fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, flexShrink: 0 },
  title:    { margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--color-text-strong)' },
  subtitle: { margin: '4px 0 0', fontSize: 13.5, color: 'var(--color-text-muted)' },

  bar:        { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)', borderRadius: 12, padding: '12px 16px', marginBottom: 16 },
  barLabel:   { fontSize: 13, fontWeight: 600, color: 'var(--color-text-base)', whiteSpace: 'nowrap' },
  select:     { padding: '8px 12px', border: '1px solid var(--color-border-soft)', borderRadius: 9, fontSize: 14, outline: 'none', minWidth: 280, cursor: 'pointer', fontFamily: 'inherit', background: 'var(--color-bg-surface)' },
  refreshBtn: { padding: '8px 14px', border: '1px solid var(--color-border-soft)', background: 'var(--color-bg-surface)', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--color-text-base)', fontFamily: 'inherit' },

  stats: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 },
  statCard:  { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)', borderRadius: 10, padding: '14px 16px', textAlign: 'center' },
  statVal:   { fontSize: 26, fontWeight: 700, lineHeight: 1, marginBottom: 4 },
  statLabel: { fontSize: 11, color: 'var(--color-text-soft)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 },

  cols:  { display: 'grid', gridTemplateColumns: '360px 1fr', gap: 16, alignItems: 'start' },
  left:  { background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-soft)', borderRadius: 12, padding: 12, maxHeight: 600, overflowY: 'auto' },
  right: { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 400 },

  list:    { display: 'flex', flexDirection: 'column', gap: 6 },
  runCard: { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start', transition: 'border-color 0.15s' },
  runCardActive: { borderColor: 'var(--color-primary-700)', background: 'var(--color-primary-50)' },
  statusDot: { width: 8, height: 8, borderRadius: 999, flexShrink: 0, marginTop: 5 },
  runTopRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  runId:     { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
  runTime:   { fontSize: 11, color: 'var(--color-text-soft)' },
  latencyChip: { fontSize: 11, color: 'var(--color-accent-700)', background: 'var(--color-accent-50)', padding: '1px 6px', borderRadius: 999, fontWeight: 600 },
  paramsPreview: { display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 },
  paramChip:     { fontSize: 10.5, background: 'var(--color-primary-50)', color: 'var(--color-primary-800)', padding: '1px 6px', borderRadius: 999, fontFamily: 'var(--font-family-mono)' },

  statusPill:  { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999 },
  pillSuccess: { background: 'var(--color-success-bg)', color: 'var(--color-success-text)' },
  pillError:   { background: 'var(--color-error-bg)', color: 'var(--color-error-text)' },
  pillRunning: { background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' },

  detailEmpty:  { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 24px' },
  detailHeader: { background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-soft)', borderRadius: 10, padding: '12px 14px' },
  detailTab:       { padding: '6px 12px', border: '1px solid var(--color-border-soft)', background: 'var(--color-bg-surface)', color: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' },
  detailTabActive: { background: 'var(--color-primary-50)', color: 'var(--color-primary-800)', borderColor: 'var(--color-primary-200)' },
  detailBox: { background: 'var(--color-bg-canvas)', border: '1px solid var(--color-border-soft)', borderRadius: 10, padding: 14, overflow: 'auto', flex: 1, maxHeight: 380 },
  pre:       { margin: 0, fontFamily: 'var(--font-family-mono)', fontSize: 12.5, lineHeight: 1.6, color: 'var(--color-text-base)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },

  empty:     { background: 'var(--color-bg-surface)', border: '1px dashed var(--color-border-soft)', borderRadius: 14, padding: '56px 32px', textAlign: 'center' },
  emptyTitle:{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-strong)', marginBottom: 8 },
  emptyHint: { fontSize: 13.5, color: 'var(--color-text-muted)', maxWidth: 460, marginInline: 'auto', lineHeight: 1.55 },
  errorBanner: { background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', color: 'var(--color-error-text)', borderRadius: 10, padding: '10px 14px', fontSize: 13 },
};