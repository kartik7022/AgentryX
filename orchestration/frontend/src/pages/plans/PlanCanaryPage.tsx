import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { listPlans, execute360 } from '../../services/api';
import { saveExecution } from '../../services/history';
import type { PlanResponse, Entity360Result } from '../../types';

const card: React.CSSProperties = {
  background: 'var(--color-bg-surface)', borderRadius: '16px',
  border: '1px solid var(--color-border-soft)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
};

const inp: React.CSSProperties = {
  width: '100%', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-base)',
  borderRadius: '10px', padding: '10px 14px', fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-strong)', fontFamily: 'inherit', boxSizing: 'border-box' as const,
};

const lbl: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 'var(--font-weight-semibold)',
  textTransform: 'uppercase' as const, letterSpacing: '0.07em',
  color: 'var(--color-text-muted)', marginBottom: '6px',
};

interface CanaryResult {
  plan_name:   string;
  result:      Entity360Result | null;
  error:       string | null;
  duration_ms: number;
  status:      'idle' | 'running' | 'done' | 'error';
  started_at:  number;
}

interface ComparisonRow {
  key:     string;
  valueA:  unknown;
  valueB:  unknown;
  match:   boolean;
}

function JsonPreview({ data }: { data: unknown }) {
  if (data === null || data === undefined) return <span style={{ color: 'var(--color-text-soft)', fontSize: 'var(--font-size-xs)' }}>null</span>;
  if (typeof data !== 'object') return <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-base)' }}>{String(data)}</span>;
  return (
    <pre style={{ fontFamily: 'var(--font-family-mono)', fontSize: '11px', color: 'var(--color-text-base)', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '120px', overflowY: 'auto' }}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function buildComparison(a: Entity360Result, b: Entity360Result): ComparisonRow[] {
  const allKeys = [...new Set([...Object.keys(a.results), ...Object.keys(b.results)])];
  return allKeys.map(key => ({
    key,
    valueA: a.results[key] ?? null,
    valueB: b.results[key] ?? null,
    match:  JSON.stringify(a.results[key]) === JSON.stringify(b.results[key]),
  }));
}

function ResultPanel({
  label,
  color,
  bg,
  border,
  canary,
}: {
  label:  string;
  color:  string;
  bg:     string;
  border: string;
  canary: CanaryResult;
}) {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const resultKeys = canary.result ? Object.keys(canary.result.results) : [];
  const selectedTab = activeTab && resultKeys.includes(activeTab) ? activeTab : resultKeys[0] ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Header */}
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: '12px', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }}/>
          <span style={{ fontWeight: 'var(--font-weight-bold)', color, fontSize: '15px' }}>{label}</span>
          <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', color, opacity: 0.8 }}>{canary.plan_name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {canary.status === 'running' && (
            <div style={{ width: '16px', height: '16px', border: `2px solid ${border}`, borderTopColor: color, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}/>
          )}
          {canary.status === 'done' && canary.duration_ms > 0 && (
            <span style={{ fontSize: 'var(--font-size-xs)', fontFamily: 'var(--font-family-mono)', color }}>{canary.duration_ms}ms</span>
          )}
          <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color,
            padding: '3px 10px', borderRadius: '999px', background: 'rgba(255,255,255,0.5)',
          }}>
            {canary.status === 'idle'    ? '○ Idle'
            : canary.status === 'running' ? '◌ Running…'
            : canary.status === 'done'    ? '✓ Done'
            : '✕ Error'}
          </span>
        </div>
      </div>

      {/* Error */}
      {canary.status === 'error' && canary.error && (
        <div style={{ background: 'var(--color-status-error-bg)', border: '1px solid var(--color-status-error-border)', borderRadius: '12px', padding: '14px 18px' }}>
          <p style={{ fontSize: '13px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-status-error-text)', marginBottom: '4px' }}>Execution Failed</p>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-status-error-border)', fontFamily: 'var(--font-family-mono)' }}>{canary.error}</p>
        </div>
      )}

      {/* Results */}
      {canary.status === 'done' && canary.result && (
        <>
          {/* Summary */}
          <div style={{ ...card, padding: '14px 18px', display: 'flex', gap: '16px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-status-success-text)' }}>{Object.keys(canary.result.results).length}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Results</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: Object.keys(canary.result.errors).length > 0 ? 'var(--color-status-error-text)' : 'var(--color-text-soft)' }}>
                {Object.keys(canary.result.errors).length}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Errors</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary-800)' }}>{canary.duration_ms}ms</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Duration</div>
            </div>
          </div>

          {/* Step errors */}
          {Object.entries(canary.result.errors).map(([step, msg]) => (
            <div key={step} style={{ background: 'var(--color-status-error-bg)', border: '1px solid var(--color-status-error-border)', borderRadius: '10px', padding: '10px 14px', fontSize: '13px' }}>
              <span style={{ fontFamily: 'var(--font-family-mono)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-status-error-text)' }}>{step}: </span>
              <span style={{ color: 'var(--color-status-error-border)' }}>{msg}</span>
            </div>
          ))}

          {/* Result tabs */}
          {resultKeys.length > 0 && (
            <div style={{ ...card, overflow: 'hidden' }}>
              <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-soft)', background: 'var(--color-bg-canvas)', overflowX: 'auto' }}>
                {resultKeys.map(key => (
                  <button key={key} onClick={() => setActiveTab(key)}
                    style={{ padding: '8px 14px', border: 'none', borderBottom: selectedTab === key ? `2px solid ${color}` : '2px solid transparent',
                      background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-family-mono)', fontSize: '11px', fontWeight: 'var(--font-weight-semibold)',
                      color: selectedTab === key ? color : 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                    {key}
                  </button>
                ))}
              </div>
              <div style={{ padding: '14px', maxHeight: '200px', overflowY: 'auto' }}>
                {selectedTab && <JsonPreview data={canary.result.results[selectedTab]} />}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function PlanCanaryPage() {
  const { id } = useParams<{ id: string }>();
  const [plans, setPlans]       = useState<PlanResponse[]>([]);
  const [loading, setLoading]   = useState(true);
  const [running, setRunning]   = useState(false);
  const [error, setError]       = useState('');
  const [tenantId, setTenantId] = useState('tenant_default');
  const [params, setParams]     = useState<Record<string, string>>({});
  const [planAName, setPlanAName] = useState('');
  const [planBName, setPlanBName] = useState('');
  const [trafficSplit, setTrafficSplit] = useState(50);
  const [runs, setRuns]         = useState(1);
  const [history, setHistory]   = useState<Array<{ canaryA: CanaryResult; canaryB: CanaryResult; ran_at: string }>>([]);

  const [canaryA, setCanaryA] = useState<CanaryResult>({
    plan_name: '', result: null, error: null, duration_ms: 0, status: 'idle', started_at: 0,
  });
  const [canaryB, setCanaryB] = useState<CanaryResult>({
    plan_name: '', result: null, error: null, duration_ms: 0, status: 'idle', started_at: 0,
  });

  useEffect(() => {
    listPlans()
      .then(p => {
        setPlans(p);
        // Pre-select current plan as A
        const current = p.find(x => x.plan_id === id);
        if (current) {
          setPlanAName(current.name);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  async function runCanary() {
    if (!planAName || !planBName) {
      setError('Please select both Plan A and Plan B.');
      return;
    }
    if (planAName === planBName) {
      setError('Plan A and Plan B must be different plans.');
      return;
    }

    setError('');
    setRunning(true);

    const planA = plans.find(p => p.name === planAName)!;
    const planB = plans.find(p => p.name === planBName)!;

    // Reset state
    setCanaryA(prev => ({ ...prev, plan_name: planAName, status: 'running', result: null, error: null, started_at: Date.now() }));
    setCanaryB(prev => ({ ...prev, plan_name: planBName, status: 'running', result: null, error: null, started_at: Date.now() }));

    // Run both plans in parallel
    const [resA, resB] = await Promise.allSettled([
      execute360({ plan_name: planAName, entity_type: planA.entity_type, tenant_id: tenantId, params }),
      execute360({ plan_name: planBName, entity_type: planB.entity_type, tenant_id: tenantId, params }),
    ]);

    const durA = Date.now() - canaryA.started_at;
    const durB = Date.now() - canaryB.started_at;

    const newA: CanaryResult = resA.status === 'fulfilled'
      ? { plan_name: planAName, result: resA.value, error: null, duration_ms: durA, status: 'done', started_at: canaryA.started_at }
      : { plan_name: planAName, result: null, error: (resA.reason as Error).message, duration_ms: durA, status: 'error', started_at: canaryA.started_at };

    const newB: CanaryResult = resB.status === 'fulfilled'
      ? { plan_name: planBName, result: resB.value, error: null, duration_ms: durB, status: 'done', started_at: canaryB.started_at }
      : { plan_name: planBName, result: null, error: (resB.reason as Error).message, duration_ms: durB, status: 'error', started_at: canaryB.started_at };

    setCanaryA(newA);
    setCanaryB(newB);

    // Save to history
    if (newA.result) saveExecution({ plan_name: planAName, entity_type: planA.entity_type, tenant_id: tenantId, params, result: newA.result, executed_at: new Date().toISOString(), duration_ms: durA, status: newA.result ? 'success' : 'failed' });
    if (newB.result) saveExecution({ plan_name: planBName, entity_type: planB.entity_type, tenant_id: tenantId, params, result: newB.result, executed_at: new Date().toISOString(), duration_ms: durB, status: newB.result ? 'success' : 'failed' });

    // Add to local history
    setHistory(prev => [{ canaryA: newA, canaryB: newB, ran_at: new Date().toISOString() }, ...prev.slice(0, 9)]);
    setRunning(false);
  }

  const comparison = canaryA.result && canaryB.result
    ? buildComparison(canaryA.result, canaryB.result)
    : [];

  const matchCount    = comparison.filter(r => r.match).length;
  const mismatchCount = comparison.filter(r => !r.match).length;
  const fasterPlan    = canaryA.duration_ms && canaryB.duration_ms
    ? canaryA.duration_ms < canaryB.duration_ms ? 'A' : 'B'
    : null;

  const paramEntries = Object.entries(params);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
      <div style={{ width: '32px', height: '32px', border: '3px solid var(--color-border-soft)', borderTopColor: 'var(--color-primary-800)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}/>
      <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{ padding: '32px' }}>

      {/* Back */}
      <Link to={`/plans/${id}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', textDecoration: 'none', marginBottom: '24px' }}>
        ← Back to Plan
      </Link>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)' }}>Canary / A-B Testing</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', marginTop: '4px' }}>
          Run two plans simultaneously with the same inputs and compare results side by side.
        </p>
      </div>

      {/* Config card */}
      <div style={{ ...card, padding: '24px', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', marginBottom: '20px' }}>Test Configuration</h2>

        {error && (
          <div style={{ background: 'var(--color-status-error-bg)', border: '1px solid var(--color-status-error-border)', borderRadius: '10px', padding: '12px 16px', color: 'var(--color-status-error-text)', fontSize: '13px', marginBottom: '16px' }}>
            ⚠ {error}
          </div>
        )}

        {/* Plan selectors */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 40px 1fr', gap: '12px', alignItems: 'flex-end', marginBottom: '20px' }}>
          <div>
            <label style={{ ...lbl, color: 'var(--color-status-info-text)' }}>🔵 Plan A (Control)</label>
            <select style={{ ...inp, borderColor: 'var(--color-primary-200)' }} value={planAName} onChange={e => setPlanAName(e.target.value)}>
              <option value="">Select Plan A…</option>
              {plans.map(p => <option key={p.plan_id} value={p.name}>{p.name}</option>)}
            </select>
          </div>
          <div style={{ textAlign: 'center', paddingBottom: '10px', fontSize: 'var(--font-size-lg)', color: 'var(--color-text-soft)', fontWeight: 'var(--font-weight-bold)' }}>vs</div>
          <div>
            <label style={{ ...lbl, color: 'var(--color-status-success-text)' }}>🟢 Plan B (Canary)</label>
            <select style={{ ...inp, borderColor: 'var(--color-status-success-border)' }} value={planBName} onChange={e => setPlanBName(e.target.value)}>
              <option value="">Select Plan B…</option>
              {plans.map(p => <option key={p.plan_id} value={p.name}>{p.name}</option>)}
            </select>
          </div>
        </div>

        {/* Traffic split */}
        <div style={{ marginBottom: '20px' }}>
          <label style={lbl}>Traffic Split</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-status-info-text)', minWidth: '40px' }}>A: {trafficSplit}%</span>
            <input type="range" min={10} max={90} step={10} value={trafficSplit}
              onChange={e => setTrafficSplit(parseInt(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--color-primary-800)' }}/>
            <span style={{ fontSize: '13px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-status-success-text)', minWidth: '40px', textAlign: 'right' }}>B: {100 - trafficSplit}%</span>
          </div>
          <div style={{ display: 'flex', height: '8px', borderRadius: '999px', overflow: 'hidden', marginTop: '8px' }}>
            <div style={{ width: `${trafficSplit}%`, background: 'var(--color-primary-800)', transition: 'width 0.2s' }}/>
            <div style={{ flex: 1, background: 'var(--color-accent-500)', transition: 'width 0.2s' }}/>
          </div>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-soft)', marginTop: '6px' }}>
            In production this controls what % of traffic goes to each plan. For testing, both plans always run.
          </p>
        </div>

        {/* Shared config */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
          <div>
            <label style={lbl}>Tenant ID</label>
            <input style={inp} value={tenantId} onChange={e => setTenantId(e.target.value)} placeholder="tenant_default"/>
          </div>
          <div>
            <label style={lbl}>Runs</label>
            <input style={inp} type="number" min={1} max={10} value={runs}
              onChange={e => setRuns(Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))}/>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-soft)', marginTop: '4px' }}>Number of test runs (max 10)</p>
          </div>
        </div>

        {/* Params */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <label style={{ ...lbl, marginBottom: 0 }}>Shared Request Params</label>
            <button type="button"
              onClick={() => setParams(p => ({ ...p, [`param_${paramEntries.length + 1}`]: '' }))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary-800)', fontSize: '13px', fontWeight: 'var(--font-weight-semibold)' }}>
              + Add param
            </button>
          </div>
          {paramEntries.length === 0 ? (
            <p style={{ color: 'var(--color-text-soft)', fontSize: '13px' }}>No params. Both plans will run with empty params.</p>
          ) : (
            paramEntries.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                <input style={{ ...inp, flex: 1, fontSize: 'var(--font-size-xs)' }} value={k}
                  onChange={e => {
                    const n: Record<string, string> = {};
                    for (const [ok, ov] of Object.entries(params)) n[ok === k ? e.target.value : ok] = ov;
                    setParams(n);
                  }}/>
                <span style={{ color: 'var(--color-text-soft)' }}>→</span>
                <input style={{ ...inp, flex: 1, fontSize: 'var(--font-size-xs)' }} value={v}
                  onChange={e => setParams(p => ({ ...p, [k]: e.target.value }))}/>
                <button type="button"
                  onClick={() => { const n = { ...params }; delete n[k]; setParams(n); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-soft)', fontSize: 'var(--font-size-md)' }}>✕</button>
              </div>
            ))
          )}
        </div>

        {/* Run button */}
        <button
          onClick={runCanary}
          disabled={running || !planAName || !planBName}
          style={{ width: '100%', background: running ? 'var(--color-primary-200)' : 'var(--color-primary-800)', color: 'var(--color-bg-surface)', border: 'none', borderRadius: '12px', padding: '14px', fontSize: '15px', fontWeight: 'var(--font-weight-semibold)', cursor: running ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          {running ? (
            <>
              <div style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'var(--color-bg-surface)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}/>
              Running A and B simultaneously…
            </>
          ) : (
            <>⚡ Run A/B Test</>
          )}
        </button>
      </div>

      {/* Results side by side */}
      {(canaryA.status !== 'idle' || canaryB.status !== 'idle') && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
            <ResultPanel
              label="Plan A — Control"
              color="var(--color-status-info-text)"
              bg="var(--color-status-info-bg)"
              border="var(--color-primary-200)"
              canary={canaryA}
            />
            <ResultPanel
              label="Plan B — Canary"
              color="var(--color-status-success-text)"
              bg="var(--color-status-success-bg)"
              border="var(--color-status-success-border)"
              canary={canaryB}
            />
          </div>

          {/* Comparison */}
          {comparison.length > 0 && (
            <div style={{ ...card, padding: '24px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)' }}>Result Comparison</h2>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <span style={{ background: 'var(--color-status-success-bg)', color: 'var(--color-status-success-text)', border: '1px solid var(--color-status-success-border)', padding: '4px 12px', borderRadius: '999px', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)' }}>
                    ✓ {matchCount} matching
                  </span>
                  {mismatchCount > 0 && (
                    <span style={{ background: 'var(--color-status-error-bg)', color: 'var(--color-status-error-text)', border: '1px solid var(--color-status-error-border)', padding: '4px 12px', borderRadius: '999px', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)' }}>
                      ≠ {mismatchCount} different
                    </span>
                  )}
                  {fasterPlan && (
                    <span style={{ background: 'var(--color-status-warning-bg)', color: 'var(--color-status-warning-text)', border: '1px solid var(--color-status-warning-border)', padding: '4px 12px', borderRadius: '999px', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)' }}>
                      ⚡ Plan {fasterPlan} faster
                      ({fasterPlan === 'A'
                        ? canaryB.duration_ms - canaryA.duration_ms
                        : canaryA.duration_ms - canaryB.duration_ms}ms)
                    </span>
                  )}
                </div>
              </div>

              {/* Comparison table */}
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Step Key', 'Plan A Result', 'Plan B Result', 'Match'].map((h, i) => (
                      <th key={i} style={{ textAlign: 'left', padding: '10px 16px', fontSize: '11px', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-muted)', background: 'var(--color-bg-canvas)', borderBottom: '1px solid var(--color-border-soft)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparison.map(row => (
                    <tr key={row.key} style={{ background: row.match ? 'var(--color-bg-surface)' : 'var(--color-status-error-bg)' }}>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-bg-muted)', fontFamily: 'var(--font-family-mono)', fontWeight: 'var(--font-weight-bold)', fontSize: '13px', color: 'var(--color-text-strong)' }}>
                        {row.key}
                      </td>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-bg-muted)', maxWidth: '280px' }}>
                        <JsonPreview data={row.valueA} />
                      </td>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-bg-muted)', maxWidth: '280px' }}>
                        <JsonPreview data={row.valueB} />
                      </td>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-bg-muted)', textAlign: 'center' }}>
                        {row.match
                          ? <span style={{ color: 'var(--color-status-success-text)', fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-md)' }}>✓</span>
                          : <span style={{ color: 'var(--color-status-error-text)', fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-md)' }}>≠</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Recommendation */}
              {canaryA.status === 'done' && canaryB.status === 'done' && (
                <div style={{ marginTop: '20px', padding: '16px 20px', borderRadius: '12px', background: mismatchCount === 0 ? 'var(--color-status-success-bg)' : 'var(--color-status-warning-bg)', border: `1px solid ${mismatchCount === 0 ? 'var(--color-status-success-border)' : 'var(--color-status-warning-border)'}` }}>
                  <p style={{ fontSize: '13px', fontWeight: 'var(--font-weight-bold)', color: mismatchCount === 0 ? 'var(--color-status-success-text)' : 'var(--color-status-warning-text)', marginBottom: '4px' }}>
                    {mismatchCount === 0
                      ? '✓ Plans produce identical results — safe to promote Plan B'
                      : `⚠ ${mismatchCount} result(s) differ — review before promoting Plan B`}
                  </p>
                  <p style={{ fontSize: '13px', color: mismatchCount === 0 ? 'var(--color-status-success-text)' : 'var(--color-status-warning-text)' }}>
                    {fasterPlan === 'B'
                      ? `Plan B is ${canaryA.duration_ms - canaryB.duration_ms}ms faster. Consider promoting it as the new control.`
                      : fasterPlan === 'A'
                        ? `Plan A is ${canaryB.duration_ms - canaryA.duration_ms}ms faster. Plan B may need optimization before promotion.`
                        : 'Both plans have similar performance.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Run history */}
      {history.length > 0 && (
        <div style={{ ...card, padding: '24px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', marginBottom: '16px' }}>Test Run History</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Run At', 'Plan A', 'Plan B', 'A Duration', 'B Duration', 'Matches', 'Diffs'].map((h, i) => (
                  <th key={i} style={{ textAlign: 'left', padding: '10px 16px', fontSize: '11px', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-muted)', background: 'var(--color-bg-canvas)', borderBottom: '1px solid var(--color-border-soft)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((run, i) => {
                const cmp = run.canaryA.result && run.canaryB.result
                  ? buildComparison(run.canaryA.result, run.canaryB.result)
                  : [];
                return (
                  <tr key={i} onMouseEnter={e=>(e.currentTarget.style.background='var(--color-bg-canvas)')} onMouseLeave={e=>(e.currentTarget.style.background='')}>
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-bg-muted)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontFamily: 'var(--font-family-mono)' }}>{new Date(run.ran_at).toLocaleTimeString()}</td>
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-bg-muted)', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--color-status-info-text)', fontWeight: 'var(--font-weight-semibold)' }}>{run.canaryA.plan_name}</td>
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-bg-muted)', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--color-status-success-text)', fontWeight: 'var(--font-weight-semibold)' }}>{run.canaryB.plan_name}</td>
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-bg-muted)', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-base)' }}>{run.canaryA.duration_ms}ms</td>
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-bg-muted)', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-base)' }}>{run.canaryB.duration_ms}ms</td>
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-bg-muted)' }}>
                      <span style={{ color: 'var(--color-status-success-text)', fontWeight: 'var(--font-weight-bold)' }}>{cmp.filter(r => r.match).length}</span>
                    </td>
                    <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-bg-muted)' }}>
                      <span style={{ color: cmp.filter(r => !r.match).length > 0 ? 'var(--color-status-error-text)' : 'var(--color-text-soft)', fontWeight: 'var(--font-weight-bold)' }}>
                        {cmp.filter(r => !r.match).length}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
