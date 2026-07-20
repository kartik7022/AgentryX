// src/pages/execute/ExecutionMonitorPage.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { runPlan, listExecutionSteps } from '../../services/api';
import type { ExecutionStep } from '../../types';

import AgentTracePanel from '../../components/AgentTracePanel';

const card: React.CSSProperties = {
  background: 'var(--color-bg-surface)', borderRadius: '16px',
  border: '1px solid var(--color-border-soft)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
};

type StepStatus = 'queued' | 'waiting' | 'running' | 'success' | 'error' | 'skipped';

interface MonitorStep {
  key:          string;
  kind:         string;
  status:       StepStatus;
  duration_ms?: number;
  result?:      unknown;
  error?:       unknown;
  evidence?:    unknown;
  request?:     unknown;
  started_at?:  string | null;
  completed_at?: string | null;
}

// ── JSON Viewer ────────────────────────────────────────────────────
function JsonViewer({ data, depth = 0 }: { data: unknown; depth?: number }) {
  const [open, setOpen] = useState(depth === 0);
  if (data === null)             return <span style={{ color: 'var(--color-text-soft)' }}>null</span>;
  if (typeof data === 'boolean') return <span style={{ color: 'var(--color-status-warning-text)' }}>{String(data)}</span>;
  if (typeof data === 'number')  return <span style={{ color: 'var(--color-primary-800)' }}>{data}</span>;
  if (typeof data === 'string')  return <span style={{ color: 'var(--color-status-success-text)' }}>"{data}"</span>;
  if (Array.isArray(data)) {
    if (!data.length) return <span style={{ color: 'var(--color-text-soft)' }}>[]</span>;
    return (
      <span>
        <button onClick={() => setOpen(!open)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', padding: 0 }}>
          {open ? '▼ [' : `▶ [${data.length} items]`}
        </button>
        {open && (
          <div style={{ marginLeft: '16px' }}>
            {data.map((v, i) => <div key={i}><JsonViewer data={v} depth={depth + 1} /></div>)}
            <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>]</div>
          </div>
        )}
      </span>
    );
  }
  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    if (!entries.length) return <span style={{ color: 'var(--color-text-soft)' }}>{'{}'}</span>;
    return (
      <span>
        <button onClick={() => setOpen(!open)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', padding: 0 }}>
          {open ? '▼ {' : `▶ {${entries.length} keys}`}
        </button>
        {open && (
          <div style={{ marginLeft: '16px' }}>
            {entries.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--color-primary-800)', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', flexShrink: 0 }}>"{k}":</span>
                <JsonViewer data={v} depth={depth + 1} />
              </div>
            ))}
            <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>{'}'}</div>
          </div>
        )}
      </span>
    );
  }
  return <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)' }}>{String(data)}</span>;
}

// ── Step Detail Tabs ───────────────────────────────────────────────
function StepDetailPanel({ step }: { step: MonitorStep }) {
  const [tab, setTab] = useState<'response' | 'request' | 'error' | 'evidence' | 'agent'>('response');

  const isAgentStep = step.kind === 'agent_task';
  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'response', label: 'Response' },
    { key: 'request',  label: 'Request'  },
    { key: 'error',    label: 'Error'    },
    { key: 'evidence', label: 'Evidence' },
    ...(isAgentStep ? [{ key: 'agent' as typeof tab, label: '🤖 Agent' }] : []),
  ];

  const content = {
    response: step.result,
    request:  step.request,
    error:    step.error,
    evidence: step.evidence,
    agent:    null,
  }[tab];

  const agentRunId = isAgentStep
    ? String((step.result as Record<string, unknown>)?.agent_run_id ?? '')
    : '';

  return (
    <div style={{ borderTop: '1px solid var(--color-bg-muted)', background: 'var(--color-bg-canvas)' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-soft)', background: 'var(--color-bg-surface)' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: '8px 16px', border: 'none',
              borderBottom: tab === t.key ? '2px solid var(--color-primary-800)' : '2px solid transparent',
              background: 'transparent', cursor: 'pointer', fontSize: 'var(--font-size-xs)',
              fontWeight: 'var(--font-weight-semibold)', color: tab === t.key ? 'var(--color-primary-800)' : 'var(--color-text-muted)' }}>
            {t.label}
          </button>
        ))}
        {step.duration_ms != null && (
          <span style={{ marginLeft: 'auto', padding: '8px 14px', fontSize: '11px',
            color: 'var(--color-text-soft)', fontFamily: 'var(--font-family-mono)' }}>
            {step.duration_ms}ms
          </span>
        )}
      </div>

      {/* Tab content */}
      <div style={{ padding: '16px', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)',
        lineHeight: 1.7, maxHeight: '400px', overflowY: 'auto' }}>
        {tab === 'agent' && agentRunId ? (
          <AgentTracePanel agentRunId={agentRunId} />
        ) : tab === 'agent' && !agentRunId ? (
          <p style={{ color: 'var(--color-text-soft)', fontSize: 'var(--font-size-xs)' }}>No agent_run_id found in step result.</p>
        ) : content != null ? (
          <JsonViewer data={content} />
        ) : (
          <p style={{ color: 'var(--color-text-soft)', fontSize: 'var(--font-size-xs)' }}>No data</p>
        )}
      </div>
    </div>
  );
}
// ── Step Indicator ─────────────────────────────────────────────────
function StepIndicator({ step, index, expanded, onToggle }: {
  step: MonitorStep; index: number; expanded: boolean; onToggle: () => void;
}) {
  const colors: Record<StepStatus, { bg: string; color: string; border: string; icon: string }> = {
    queued:  { bg: 'var(--color-bg-canvas)', color: 'var(--color-text-soft)', border: 'var(--color-border-soft)', icon: '○' },
    waiting: { bg: 'var(--color-bg-canvas)', color: 'var(--color-text-soft)', border: 'var(--color-border-soft)', icon: '○' },
    running: { bg: 'var(--color-primary-50)', color: 'var(--color-primary-800)', border: 'var(--color-primary-200)', icon: '◌' },
    success: { bg: 'var(--color-status-success-bg)', color: 'var(--color-status-success-text)', border: 'var(--color-status-success-border)', icon: '✓' },
    error:   { bg: 'var(--color-status-error-bg)', color: 'var(--color-status-error-text)', border: 'var(--color-status-error-border)', icon: '✕' },
    skipped: { bg: 'var(--color-bg-canvas)', color: 'var(--color-text-muted)', border: 'var(--color-border-soft)', icon: '–' },
  };
  const c = colors[step.status];
  const hasDetail = step.status === 'success' || step.status === 'error';

  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: '12px', overflow: 'hidden', marginBottom: '8px', transition: 'all 0.3s' }}>
      <div
        onClick={hasDetail ? onToggle : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: c.bg, cursor: hasDetail ? 'pointer' : 'default' }}
      >
        <span style={{ width: '26px', height: '26px', borderRadius: '50%', background: c.color, color: 'var(--color-bg-surface)', fontSize: '11px', fontWeight: 'var(--font-weight-bold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {index + 1}
        </span>
        <span style={{ fontSize: 'var(--font-size-md)', color: c.color, flexShrink: 0 }}>{c.icon}</span>
        <span style={{ fontFamily: 'var(--font-family-mono)', fontWeight: 'var(--font-weight-bold)', fontSize: '13px', color: 'var(--color-text-strong)', flex: 1 }}>{step.key}</span>
        {step.kind && (
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', background: 'var(--color-bg-muted)', padding: '2px 8px', borderRadius: '6px', fontFamily: 'var(--font-family-mono)' }}>
            {step.kind}
          </span>
        )}
        <span style={{ fontSize: '11px', fontWeight: 'var(--font-weight-bold)', color: c.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {step.status}
        </span>
        {step.duration_ms != null && (
          <span style={{ fontSize: '11px', color: 'var(--color-text-soft)', fontFamily: 'var(--font-family-mono)', minWidth: '50px', textAlign: 'right' }}>
            {step.duration_ms}ms
          </span>
        )}
        {step.status === 'running' && (
          <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
            {[0, 1, 2].map(i => (
              <span key={i} style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--color-primary-800)', animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`, display: 'inline-block' }} />
            ))}
          </div>
        )}
        {hasDetail && (
          <span style={{ color: 'var(--color-text-soft)', fontSize: 'var(--font-size-xs)', transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▼</span>
        )}
      </div>
      {expanded && hasDetail && <StepDetailPanel step={step} />}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────
export default function ExecutionMonitorPage() {
  const location = useLocation();
  const navigate  = useNavigate();
  const state = location.state as {
    plan_name: string; entity_type: string; tenant_id: string;
    params: Record<string, string>; steps: string[];
  } | null;

  const [phase, setPhase]               = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [steps, setSteps]               = useState<MonitorStep[]>(() =>
    (state?.steps ?? ['Initializing...']).map(key => ({ key, kind: '', status: 'waiting' as StepStatus }))
  );
  const [executionId, setExecutionId]   = useState<string | null>(null);
  const [results, setResults]           = useState<Record<string, unknown>>({});
  const [errors, setErrors]             = useState<Record<string, string>>({});
  const [elapsed, setElapsed]           = useState(0);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [globalError, setGlobalError]   = useState('');
  const [activeResultTab, setActiveResultTab] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number>(0);
  const pollRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollSteps = useCallback(async (execId: string) => {
    try {
      const stepRows: ExecutionStep[] = await listExecutionSteps(execId);
      if (!stepRows.length) return;
      setSteps(stepRows.map(row => ({
        key:          row.step_key,
        kind:         row.kind,
        status:       row.status === 'failed' ? 'error' : (row.status as StepStatus),
        duration_ms:  row.duration_ms,
        result:       row.response_json,
        error:        row.error_json,
        evidence:     row.evidence_json,
        request:      row.request_json,
        started_at:   row.started_at,
        completed_at: row.completed_at,
      })));
    } catch { /* non-fatal */ }
  }, []);

  const startExecution = useCallback(async () => {
    if (!state) return;
    setPhase('running');
    startRef.current = Date.now();
    try {
      const res = await runPlan({
        plan_name:   state.plan_name,
        entity_type: state.entity_type,
        tenant_id:   state.tenant_id,
        params:      state.params,
      });
      setExecutionId(res.execution_id);
      setResults(res.results);
      setErrors(res.errors);
      setActiveResultTab(Object.keys(res.results)[0] ?? null);
      await pollSteps(res.execution_id);
      setPhase('done');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Execution failed';
      setGlobalError(msg);
      setPhase('error');
      setSteps(prev => prev.map(s =>
        s.status === 'running' ? { ...s, status: 'error', error: { message: msg } } : s
      ));
    }
  }, [state, pollSteps]);

  useEffect(() => {
    if (!state) { navigate('/execute'); return; }
    void startExecution();
  }, [navigate, startExecution, state]);

  useEffect(() => {
    if (phase === 'running') {
      timerRef.current = setInterval(() => setElapsed(Date.now() - startRef.current), 100);
      if (executionId) {
        pollRef.current = setInterval(() => { void pollSteps(executionId); }, 1500);
      }
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current)  clearInterval(pollRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current)  clearInterval(pollRef.current);
    };
  }, [phase, executionId, pollSteps]);

  if (!state) return null;

  const successCount = steps.filter(s => s.status === 'success').length;
  const errorCount   = steps.filter(s => s.status === 'error').length;
  const totalCount   = steps.length;
  const progress     = totalCount > 0 ? Math.round(((successCount + errorCount) / totalCount) * 100) : 0;

  return (
    <div style={{ padding: '32px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <h1 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)' }}>Execution Monitor</h1>
            {phase === 'running' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--color-primary-50)', color: 'var(--color-primary-800)', border: '1px solid var(--color-primary-200)', padding: '4px 12px', borderRadius: '999px', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-primary-800)', animation: 'pulse 1s ease-in-out infinite', display: 'inline-block' }} />
                Running
              </span>
            )}
            {phase === 'done' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--color-status-success-bg)', color: 'var(--color-status-success-text)', border: '1px solid var(--color-status-success-border)', padding: '4px 12px', borderRadius: '999px', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)' }}>
                ✓ Completed
              </span>
            )}
            {phase === 'error' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--color-status-error-bg)', color: 'var(--color-status-error-text)', border: '1px solid var(--color-status-error-border)', padding: '4px 12px', borderRadius: '999px', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)' }}>
                ✕ Failed
              </span>
            )}
          </div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
            <span style={{ fontFamily: 'var(--font-family-mono)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-strong)' }}>{state.plan_name}</span>
            {' · '}{state.entity_type}{' · '}{state.tenant_id}
          </p>
          {executionId && (
            <p style={{ fontFamily: 'var(--font-family-mono)', fontSize: '11px', color: 'var(--color-text-soft)', marginTop: '4px' }}>
              execution_id: {executionId}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {phase === 'done' && (
            <button onClick={() => navigate('/execute', { state })}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--color-bg-surface)', color: 'var(--color-text-base)', padding: '10px 16px', borderRadius: '10px', fontWeight: 'var(--font-weight-semibold)', fontSize: '13px', border: '1px solid var(--color-border-base)', cursor: 'pointer' }}>
              ▶ Run Again
            </button>
          )}
          <Link to="/history"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--color-primary-800)', color: 'var(--color-bg-surface)', padding: '10px 16px', borderRadius: '10px', fontWeight: 'var(--font-weight-semibold)', fontSize: '13px', textDecoration: 'none' }}>
            View History
          </Link>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: '24px' }}>

        {/* Left — Step timeline */}
        <div>
          <div style={{ ...card, padding: '20px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-base)' }}>
                {phase === 'running' ? 'Executing…' : phase === 'done' ? 'All steps complete' : 'Execution failed'}
              </span>
              <span style={{ fontSize: '13px', fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-muted)' }}>{(elapsed / 1000).toFixed(1)}s</span>
            </div>
            <div style={{ height: '8px', background: 'var(--color-bg-muted)', borderRadius: '999px', overflow: 'hidden', marginBottom: '12px' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: errorCount > 0 ? 'linear-gradient(90deg,var(--color-primary-800),var(--color-status-error-text))' : 'var(--color-primary-800)', borderRadius: '999px', transition: 'width 0.3s' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              {[
                { label: 'Success', value: successCount, color: 'var(--color-status-success-text)', bg: 'var(--color-status-success-bg)' },
                { label: 'Failed',  value: errorCount,   color: 'var(--color-status-error-text)', bg: 'var(--color-status-error-bg)' },
                { label: 'Total',   value: totalCount,   color: 'var(--color-primary-800)', bg: 'var(--color-primary-50)' },
              ].map(s => (
                <div key={s.label} style={{ background: s.bg, borderRadius: '10px', padding: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            {steps.map((step, i) => (
              <StepIndicator
                key={step.key}
                step={step}
                index={i}
                expanded={expandedStep === step.key}
                onToggle={() => setExpandedStep(expandedStep === step.key ? null : step.key)}
              />
            ))}
          </div>

          {Object.keys(state.params).length > 0 && (
            <div style={{ ...card, padding: '16px', marginTop: '16px' }}>
              <p style={{ fontSize: '11px', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', marginBottom: '10px' }}>Request Params</p>
              {Object.entries(state.params).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: '8px', fontSize: '13px', marginBottom: '4px' }}>
                  <span style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--color-primary-800)', fontWeight: 'var(--font-weight-semibold)' }}>{k}:</span>
                  <span style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-base)' }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right — Results */}
        <div>
          {globalError && (
            <div style={{ background: 'var(--color-status-error-bg)', border: '1px solid var(--color-status-error-border)', borderRadius: '12px', padding: '16px 20px', marginBottom: '16px' }}>
              <p style={{ fontWeight: 'var(--font-weight-bold)', color: 'var(--color-status-error-text)', marginBottom: '4px' }}>Execution Failed</p>
              <p style={{ fontSize: '13px', color: 'var(--color-status-error-border)' }}>{globalError}</p>
            </div>
          )}

          {phase === 'running' && (
            <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
              <div style={{ position: 'relative', width: '80px', height: '80px', marginBottom: '24px' }}>
                <div style={{ position: 'absolute', inset: 0, border: '3px solid var(--color-primary-50)', borderRadius: '50%' }} />
                <div style={{ position: 'absolute', inset: 0, border: '3px solid var(--color-primary-800)', borderRadius: '50%', borderRightColor: 'transparent', borderBottomColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                <div style={{ position: 'absolute', inset: '12px', background: 'var(--color-primary-800)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-bg-surface)', fontSize: 'var(--font-size-lg)' }}>▶</div>
              </div>
              <p style={{ fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', fontSize: 'var(--font-size-md)', marginBottom: '6px' }}>Executing plan…</p>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Step traces update in real time on the left</p>
              <p style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-soft)', marginTop: '4px' }}>{(elapsed / 1000).toFixed(1)}s elapsed</p>
            </div>
          )}

          {phase === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              <div style={{ ...card, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: errorCount === 0 ? 'var(--color-accent-500)' : 'var(--color-status-warning-text)', display: 'inline-block' }} />
                  <span style={{ fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)' }}>
                    {errorCount === 0 ? 'All steps succeeded' : `${errorCount} step(s) had errors`}
                  </span>
                </div>
                <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-soft)' }}>{(elapsed / 1000).toFixed(2)}s total</span>
              </div>

              {steps.filter(s => s.status === 'error').map(step => (
                <div key={step.key} style={{ background: 'var(--color-status-error-bg)', border: '1px solid var(--color-status-error-border)', borderRadius: '12px', padding: '14px 18px' }}>
                  <p style={{ fontFamily: 'var(--font-family-mono)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-status-error-text)', marginBottom: '4px' }}>{step.key}</p>
                  <p style={{ fontSize: '13px', color: 'var(--color-status-error-border)' }}>
                    {typeof step.error === 'object' && step.error != null && 'message' in (step.error as Record<string, unknown>)
                      ? String((step.error as Record<string, unknown>).message)
                      : JSON.stringify(step.error)}
                  </p>
                </div>
              ))}

              {Object.keys(results).length > 0 && (
                <div style={{ ...card, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-soft)', background: 'var(--color-bg-canvas)', overflowX: 'auto' }}>
                    {Object.keys(results).map(key => (
                      <button key={key} onClick={() => setActiveResultTab(key)}
                        style={{ padding: '11px 18px', border: 'none', borderBottom: activeResultTab === key ? '2px solid var(--color-primary-800)' : '2px solid transparent', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: activeResultTab === key ? 'var(--color-primary-800)' : 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                        {key}
                      </button>
                    ))}
                  </div>
                  <div style={{ padding: '20px', overflowY: 'auto', maxHeight: '500px', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', lineHeight: 1.7 }}>
                    {activeResultTab && <JsonViewer data={results[activeResultTab]} />}
                  </div>
                </div>
              )}

              {Object.keys(errors).length > 0 && (
                <details style={card}>
                  <summary style={{ padding: '14px 20px', cursor: 'pointer', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-status-error-text)', fontSize: 'var(--font-size-sm)' }}>
                    ✕ Step Errors ({Object.keys(errors).length})
                  </summary>
                  <div style={{ borderTop: '1px solid var(--color-bg-muted)', padding: '16px 20px' }}>
                    {Object.entries(errors).map(([step, msg]) => (
                      <div key={step} style={{ background: 'var(--color-status-error-bg)', border: '1px solid var(--color-status-error-border)', borderRadius: '8px', padding: '10px 14px', marginBottom: '6px' }}>
                        <p style={{ fontFamily: 'var(--font-family-mono)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-status-error-text)', fontSize: '13px', marginBottom: '4px' }}>{step}</p>
                        <p style={{ color: 'var(--color-status-error-border)', fontSize: '13px' }}>{msg}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              <details style={card}>
                <summary style={{ padding: '14px 20px', cursor: 'pointer', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-base)', fontSize: 'var(--font-size-sm)' }}>
                  {'{ }'} Raw JSON Response
                </summary>
                <div style={{ borderTop: '1px solid var(--color-bg-muted)', padding: '16px 20px' }}>
                  <pre style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-base)', overflow: 'auto', maxHeight: '300px' }}>
                    {JSON.stringify({ execution_id: executionId, results, errors }, null, 2)}
                  </pre>
                </div>
              </details>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.5;transform:scale(0.8);} }
      `}</style>
    </div>
  );
}