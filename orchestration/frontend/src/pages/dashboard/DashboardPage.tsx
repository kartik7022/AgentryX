import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listPlans, healthCheck } from '../../services/api';
import type { PlanResponse } from '../../types';
import { DashboardSkeleton } from '../../components/ui/Skeletons';

const S = {
  page:  { padding: '32px' } as React.CSSProperties,
  card:  { background:'var(--color-bg-surface)', borderRadius:'16px', border:'1px solid var(--color-border-soft)', boxShadow:'0 1px 3px rgba(0,0,0,0.06)' } as React.CSSProperties,
  badge: (bg:string, color:string, border:string) => ({ display:'inline-flex', alignItems:'center', gap:'5px', padding:'3px 10px', borderRadius:'999px', fontSize:'var(--font-size-xs)', fontWeight:'var(--font-weight-semibold)', background:bg, color, border:`1px solid ${border}` } as React.CSSProperties),
  th:    { textAlign:'left' as const, padding:'12px 20px', fontSize:'11px', fontWeight:'var(--font-weight-semibold)', textTransform:'uppercase' as const, letterSpacing:'0.07em', color:'var(--color-text-muted)', background:'var(--color-bg-canvas)', borderBottom:'1px solid var(--color-border-soft)' },
  td:    { padding:'14px 20px', borderBottom:'1px solid var(--color-bg-muted)', color:'var(--color-text-base)', fontSize:'var(--font-size-sm)' },
};

export default function DashboardPage() {
  const [plans, setPlans]     = useState<PlanResponse[]>([]);
  const [health, setHealth]   = useState<{ status:string; service:string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([listPlans(), healthCheck()]).then(([p, h]) => {
      if (p.status === 'fulfilled') setPlans(p.value);
      if (h.status === 'fulfilled') setHealth(h.value);
      if (p.status === 'rejected')  setError(p.reason?.message ?? 'Failed to load');
    }).finally(() => setLoading(false));
  }, []);

  const policyColors: Record<string, [string,string,string]> = {
    best_effort:    ['var(--color-status-info-bg)','var(--color-status-info-text)','var(--color-status-info-border)'],
    fail_fast:      ['var(--color-status-error-bg)','var(--color-status-error-text)','var(--color-status-error-border)'],
    dependent_fail: ['var(--color-status-warning-bg)','var(--color-status-warning-text)','var(--color-status-warning-border)'],
  };

  const stats = [
    { label:'Total Plans',  value: plans.length,                                     color:'var(--color-primary-800)', bg:'var(--color-primary-50)' },
    { label:'Active Plans', value: plans.filter(p => p.is_active).length,            color:'var(--color-accent-700)', bg:'var(--color-accent-50)' },
    { label:'Entity Types', value: [...new Set(plans.map(p => p.entity_type))].length, color:'var(--color-status-warning-text)', bg:'var(--color-status-warning-bg)' },
    { label:'Total Steps',  value: plans.reduce((a, p) => a + (p.steps?.length ?? 0), 0), color:'var(--color-primary-800)', bg:'var(--color-primary-50)' },
  ];

  // ── Loading skeleton ──
  if (loading) return <DashboardSkeleton />;

  return (
    <div style={S.page}>

      {/* Header */}
      <div style={{ marginBottom:'28px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'4px' }}>
          <h1 style={{ fontSize:'var(--font-size-lg)', fontWeight:'var(--font-weight-bold)', color:'var(--color-text-strong)' }}>Orchestration Dashboard</h1>
          {health && (
            <span style={S.badge('var(--color-status-success-bg)','var(--color-status-success-text)','var(--color-status-success-border)')}>
              <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:'var(--color-accent-500)', display:'inline-block' }}/>
              {health.service} · {health.status}
            </span>
          )}
        </div>
        <p style={{ color:'var(--color-text-muted)', fontSize:'var(--font-size-sm)' }}>Multi-step governed plan execution across SQL, REST, GraphQL and AI.</p>
      </div>

      {/* Error */}
      {error && (
        <div style={{ display:'flex', gap:'10px', background:'var(--color-status-error-bg)', border:'1px solid var(--color-status-error-border)', borderRadius:'12px', padding:'14px 16px', color:'var(--color-status-error-text)', fontSize:'var(--font-size-sm)', marginBottom:'20px' }}>
          ⚠ {error}
          <button onClick={() => setError(null)} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', color:'var(--color-status-error-text)' }}>✕</button>
        </div>
      )}

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'20px', marginBottom:'28px' }}>
        {stats.map(s => (
          <div key={s.label} style={S.card}>
            <div style={{ padding:'24px' }}>
              <div style={{ width:'40px', height:'40px', borderRadius:'10px', background:s.bg, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'16px' }}>
                <div style={{ width:'20px', height:'20px', background:s.color, borderRadius:'4px' }}/>
              </div>
              <div style={{ fontSize:'var(--font-size-xl)', fontWeight:'var(--font-weight-bold)', color:'var(--color-text-strong)', marginBottom:'4px' }}>{s.value}</div>
              <div style={{ fontSize:'13px', color:'var(--color-text-muted)' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Plans */}
      <div style={{ ...S.card, marginBottom:'24px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:'1px solid var(--color-bg-muted)' }}>
          <span style={{ fontWeight:'var(--font-weight-bold)', color:'var(--color-text-strong)' }}>Recent Plans</span>
          <Link to="/plans" style={{ fontSize:'var(--font-size-sm)', color:'var(--color-primary-800)', fontWeight:'var(--font-weight-medium)' }}>View all →</Link>
        </div>
        {plans.length === 0 ? (
          <div style={{ padding:'60px', textAlign:'center' }}>
            <p style={{ color:'var(--color-text-soft)', marginBottom:'16px' }}>No plans yet.</p>
            <Link to="/plans/new" style={{ background:'var(--color-primary-800)', color:'var(--color-bg-surface)', padding:'10px 20px', borderRadius:'10px', fontWeight:'var(--font-weight-medium)', fontSize:'var(--font-size-sm)' }}>
              Create your first plan
            </Link>
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {['Plan Name','Entity Type','Error Policy','Status','Version'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans.slice(0, 8).map(plan => {
                const [pb, pc, pbr] = policyColors[plan.error_policy] ?? ['var(--color-bg-canvas)','var(--color-text-muted)','var(--color-border-soft)'];
                return (
                  <tr key={plan.plan_id}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-canvas)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td style={S.td}>
                      <Link to={`/plans/${plan.plan_id}`} style={{ fontWeight:'var(--font-weight-semibold)', color:'var(--color-text-strong)', fontSize:'var(--font-size-sm)' }}>{plan.name}</Link>
                      {plan.description && <div style={{ fontSize:'var(--font-size-xs)', color:'var(--color-text-soft)', marginTop:'2px' }}>{plan.description}</div>}
                    </td>
                    <td style={S.td}>
                      <span style={{ fontFamily:'var(--font-family-mono)', fontSize:'var(--font-size-xs)', background:'var(--color-bg-muted)', color:'var(--color-text-base)', padding:'3px 8px', borderRadius:'6px' }}>
                        {plan.entity_type}
                      </span>
                    </td>
                    <td style={S.td}>
                      <span style={S.badge(pb, pc, pbr)}>{plan.error_policy.replace(/_/g,' ')}</span>
                    </td>
                    <td style={S.td}>
                      <span style={S.badge(
                        plan.is_active ? 'var(--color-status-success-bg)' : 'var(--color-bg-canvas)',
                        plan.is_active ? 'var(--color-status-success-text)' : 'var(--color-text-muted)',
                        plan.is_active ? 'var(--color-status-success-border)' : 'var(--color-border-soft)',
                      )}>
                        <span style={{ width:'6px', height:'6px', borderRadius:'50%', background: plan.is_active ? 'var(--color-accent-500)':'var(--color-text-soft)', display:'inline-block' }}/>
                        {plan.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={S.td}>v{plan.version}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Quick Actions */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px' }}>
        {[
          { to:'/plans/new', icon:'➕', label:'Create New Plan',  sub:'Define a new orchestration workflow', color:'var(--color-primary-800)', bg:'var(--color-primary-50)' },
          { to:'/execute',   icon:'▶',  label:'Execute 360 Plan', sub:'Run a plan and inspect live results',  color:'var(--color-accent-700)', bg:'var(--color-accent-50)' },
        ].map(a => (
          <Link key={a.to} to={a.to}
            style={{ ...S.card, padding:'24px', display:'flex', alignItems:'center', gap:'16px', textDecoration:'none' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
            <div style={{ width:'48px', height:'48px', borderRadius:'14px', background:a.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'var(--font-size-lg)', flexShrink:0 }}>
              {a.icon}
            </div>
            <div>
              <div style={{ fontWeight:'var(--font-weight-bold)', color:'var(--color-text-strong)', marginBottom:'4px' }}>{a.label}</div>
              <div style={{ fontSize:'13px', color:'var(--color-text-muted)' }}>{a.sub}</div>
            </div>
          </Link>
        ))}
      </div>

    </div>
  );
}