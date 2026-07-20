import { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { listPlans } from '../../services/api';
import type { PlanResponse } from '../../types';

const card: React.CSSProperties = { background:'var(--color-bg-surface)', borderRadius:'16px', border:'1px solid var(--color-border-soft)', boxShadow:'0 1px 3px rgba(0,0,0,0.06)' };
const inp:  React.CSSProperties = { width:'100%', background:'var(--color-bg-surface)', border:'1px solid var(--color-border-base)', borderRadius:'10px', padding:'10px 14px', fontSize:'var(--font-size-sm)', color:'var(--color-text-strong)', fontFamily:'inherit', boxShadow:'0 1px 2px rgba(0,0,0,0.04)' };
const lbl:  React.CSSProperties = { display:'block', fontSize:'11px', fontWeight:'var(--font-weight-semibold)', textTransform:'uppercase' as const, letterSpacing:'0.07em', color:'var(--color-text-muted)', marginBottom:'6px' };

export default function ExecutePage() {
  const [searchParams]  = useSearchParams();
  const navigate        = useNavigate();
  const [plans, setPlans]           = useState<PlanResponse[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [req, setReq] = useState({
   tenant_id:   'global',
    plan_name:   searchParams.get('plan')    ?? '',
    entity_type: searchParams.get('entity')  ?? '',
    params:      {} as Record<string, string>,
  });

  useEffect(() => {
    listPlans()
      .then(setPlans)
      .catch(() => {})
      .finally(() => setPlansLoading(false));
  }, []);

  const up = (k: string, v: unknown) => setReq(r => ({ ...r, [k]: v }));
  const params = Object.entries(req.params);
  const selectedPlan = plans.find(p => p.name === req.plan_name);
  const canExecute   = !!req.plan_name && !!req.entity_type && !!req.tenant_id;

  function handleExecute(e: React.FormEvent) {
    e.preventDefault();
    if (!canExecute) return;

    const stepKeys = (selectedPlan?.steps ?? []).map(s => s.step_key);

    navigate('/execute/monitor', {
      state: {
        plan_name:   req.plan_name,
        entity_type: req.entity_type,
        tenant_id:   req.tenant_id,
        params:      req.params,
        steps:       stepKeys,
      },
    });
  }

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)' }}>Execute 360 Plan</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', marginTop: '4px' }}>
          Configure and run a governed orchestration plan with live step monitoring.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '24px' }}>

        {/* ── Form ── */}
        <form onSubmit={handleExecute} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Plan Selection */}
          <div style={{ ...card, padding: '20px' }}>
            <div style={{ fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', marginBottom: '16px', fontSize: '15px' }}>
              Plan Selection
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={lbl}>Plan Name *</label>
              {plansLoading ? (
                <div style={{ ...inp, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-soft)' }}>
                  <div style={{ width: '14px', height: '14px', border: '2px solid var(--color-border-soft)', borderTopColor: 'var(--color-primary-800)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }}/>
                  Loading plans…
                </div>
              ) : plans.length > 0 ? (
                <select style={inp} value={req.plan_name}
                  onChange={e => {
                    const p = plans.find(x => x.name === e.target.value);
                    up('plan_name', e.target.value);
                    if (p) up('entity_type', p.entity_type);
                  }}>
                  <option value="">Select a plan…</option>
                  {plans.map(p => (
                    <option key={p.plan_id} value={p.name}>{p.name}</option>
                  ))}
                </select>
              ) : (
                <input style={inp} value={req.plan_name}
                  onChange={e => up('plan_name', e.target.value)}
                  placeholder="plan_name"/>
              )}
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={lbl}>Entity Type *</label>
              <input style={inp} value={req.entity_type}
                onChange={e => up('entity_type', e.target.value)}
                placeholder="customer"/>
            </div>

            <div>
              <label style={lbl}>Tenant ID *</label>
              <input style={inp} value={req.tenant_id}
                onChange={e => up('tenant_id', e.target.value)}
                placeholder="tenant_001"/>
            </div>
          </div>

          {/* Params */}
          <div style={{ ...card, padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <label style={{ ...lbl, marginBottom: 0 }}>Request Params</label>
              <button type="button"
                onClick={() => up('params', { ...req.params, [`param_${params.length + 1}`]: '' })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary-800)', fontSize: '13px', fontWeight: 'var(--font-weight-semibold)' }}>
                + Add param
              </button>
            </div>
            {params.length === 0 ? (
              <p style={{ color: 'var(--color-text-soft)', fontSize: '13px' }}>No params. Click + Add param to add.</p>
            ) : (
              params.map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                  <input style={{ ...inp, flex: 1, fontSize: 'var(--font-size-xs)' }} value={k}
                    onChange={e => {
                      const n: Record<string, string> = {};
                      for (const [ok, ov] of Object.entries(req.params)) n[ok === k ? e.target.value : ok] = ov;
                      up('params', n);
                    }}/>
                  <span style={{ color: 'var(--color-text-soft)' }}>→</span>
                  <input style={{ ...inp, flex: 1, fontSize: 'var(--font-size-xs)' }} value={v}
                    onChange={e => up('params', { ...req.params, [k]: e.target.value })}/>
                  <button type="button"
                    onClick={() => { const n = { ...req.params }; delete n[k]; up('params', n); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-soft)', fontSize: 'var(--font-size-md)' }}>
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Selected plan info */}
          {selectedPlan && (
            <div style={{ ...card, padding: '16px', background: 'var(--color-status-info-bg)', border: '1px solid var(--color-status-info-border)' }}>
              <p style={{ fontSize: '11px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-status-info-text)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                Selected Plan
              </p>
              <p style={{ fontSize: '13px', color: 'var(--color-status-info-text)', marginBottom: '6px' }}>
                {selectedPlan.description || 'No description'}
              </p>
              <div style={{ display: 'flex', gap: '12px', fontSize: 'var(--font-size-xs)', color: 'var(--color-status-info-text)' }}>
                <span>⚡ {(selectedPlan.steps ?? []).length} steps</span>
                <span>· {selectedPlan.error_policy}</span>
                <span>· {selectedPlan.max_concurrency} concurrent</span>
              </div>
              {(selectedPlan.steps ?? []).length > 0 && (
                <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {(selectedPlan.steps ?? []).map(s => (
                    <span key={s.step_key} style={{ fontFamily: 'var(--font-family-mono)', fontSize: '11px', background: 'var(--color-status-info-bg)', color: 'var(--color-status-info-text)', padding: '2px 8px', borderRadius: '6px' }}>
                      {s.step_key}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Execute button */}
          <button type="submit" disabled={!canExecute}
            style={{
              background: canExecute ? 'var(--color-primary-800)' : 'var(--color-border-soft)',
              color: canExecute ? 'var(--color-bg-surface)' : 'var(--color-text-soft)',
              border: 'none', borderRadius: '12px', padding: '14px',
              fontSize: '15px', fontWeight: 'var(--font-weight-semibold)',
              cursor: canExecute ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              transition: 'all 0.15s',
            }}>
            <span>▶</span> Execute Plan with Live Monitor
          </button>

          {!plans.length && !plansLoading && (
            <p style={{ textAlign: 'center', fontSize: '13px', color: 'var(--color-text-soft)' }}>
              No plans yet.{' '}
              <Link to="/plans/new" style={{ color: 'var(--color-primary-800)' }}>Create one →</Link>
            </p>
          )}
        </form>

        {/* ── Info Panel ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* How it works */}
          <div style={{ ...card, padding: '24px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', marginBottom: '16px' }}>
              How it works
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[
                { step:'1', title:'Select a Plan',      desc:'Choose the orchestration plan, entity type and tenant you want to execute.' },
                { step:'2', title:'Add Params',         desc:'Provide any runtime parameters the plan steps need — like customer_id, account_id etc.' },
                { step:'3', title:'Execute with Monitor', desc:'Click Execute to open the Live Monitor — watch each step run in real time with status indicators.' },
                { step:'4', title:'Inspect Results',    desc:'View per-step results as an interactive JSON tree. Results are auto-saved to History.' },
              ].map(item => (
                <div key={item.step} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--color-primary-800)', color: 'var(--color-bg-surface)', fontSize: '13px', fontWeight: 'var(--font-weight-bold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {item.step}
                  </div>
                  <div>
                    <p style={{ fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-strong)', marginBottom: '2px', fontSize: 'var(--font-size-sm)' }}>{item.title}</p>
                    <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick links */}
          <div style={{ ...card, padding: '20px' }}>
            <h2 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', marginBottom: '14px' }}>Quick Links</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { to: '/plans/new',  icon: '➕', label: 'Create New Plan'     },
                { to: '/plans',      icon: '📋', label: 'Browse All Plans'    },
                { to: '/history',    icon: '📜', label: 'View Execution History' },
                { to: '/datasources',icon: '🗄',  label: 'Manage Datasources'  },
              ].map(link => (
                <Link key={link.to} to={link.to}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', background: 'var(--color-bg-canvas)', border: '1px solid var(--color-border-soft)', textDecoration: 'none', fontSize: '13px', color: 'var(--color-text-base)', fontWeight: 'var(--font-weight-medium)', transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-primary-50)'; e.currentTarget.style.color = 'var(--color-primary-800)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-canvas)'; e.currentTarget.style.color = 'var(--color-text-base)'; }}>
                  <span>{link.icon}</span>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Recent executions count */}
          <div style={{ ...card, padding: '20px', background: 'var(--color-status-success-bg)', border: '1px solid var(--color-status-success-border)' }}>
            <p style={{ fontSize: '13px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-status-success-text)', marginBottom: '4px' }}>
              ✓ Results auto-saved
            </p>
            <p style={{ fontSize: '13px', color: 'var(--color-status-success-text)' }}>
              Every execution is automatically saved to History and Evidence Viewer for full audit traceability.
            </p>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}