// src/pages/admin/AdminConsolePage.tsx
import { useState, useEffect } from 'react';
import { listPlans } from '../../services/api';
import type { PlanResponse } from '../../types';

const card: React.CSSProperties = {
  background: 'var(--color-bg-surface)', borderRadius: '16px',
  border: '1px solid var(--color-border-soft)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
};

const TABS = ['Overview', 'Active Plans'] as const;
type Tab = typeof TABS[number];

export default function AdminConsolePage() {
  const [activeTab, setActiveTab] = useState<Tab>('Overview');
  const [plans, setPlans]         = useState<PlanResponse[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);

 useEffect(() => {
    setPlansLoading(true);
    listPlans()
      .then(p => setPlans(p))
      .catch(() => {/* ignore */})
      .finally(() => setPlansLoading(false));
  }, []);

 

  const activePlans   = plans.filter(p => p.is_active).length;
  const inactivePlans = plans.filter(p => !p.is_active).length;
  const entityTypes   = [...new Set(plans.map(p => p.entity_type))];

  return (
    <div style={{ padding: '32px' }}>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'var(--color-primary-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--font-size-lg)' }}>⚙️</div>
          <h1 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)' }}>Admin Console</h1>
        </div>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', marginTop: '4px' }}>
          Platform overview and plan management.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-soft)', marginBottom: '24px' }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ padding: '10px 20px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', whiteSpace: 'nowrap', color: activeTab === tab ? 'var(--color-primary-800)' : 'var(--color-text-muted)', borderBottom: activeTab === tab ? '2px solid var(--color-primary-800)' : '2px solid transparent', transition: 'color 0.15s' }}>
            {tab}
          </button>
        ))}
      </div>

      {/* ── Overview ── */}
      {activeTab === 'Overview' && (
        <div>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px', marginBottom: '24px' }}>
            {[
              { label: 'Total Plans',    value: plans.length,       bg: 'var(--color-primary-50)', color: 'var(--color-primary-800)' },
              { label: 'Active Plans',   value: activePlans,        bg: 'var(--color-status-success-bg)', color: 'var(--color-status-success-text)' },
              { label: 'Inactive Plans', value: inactivePlans,      bg: 'var(--color-status-error-bg)', color: 'var(--color-status-error-text)' },
              { label: 'Entity Types',   value: entityTypes.length, bg: 'var(--color-status-warning-bg)', color: 'var(--color-status-warning-text)' },
            ].map(s => (
              <div key={s.label} style={{ ...card, padding: '20px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: s.color }}>{s.value}</span>
                </div>
                <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', marginBottom: '4px' }}>{s.value}</div>
                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Entity breakdown */}
          <div style={{ ...card, padding: '24px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', marginBottom: '16px' }}>Entity Type Breakdown</h2>
            {plansLoading ? (
              <p style={{ color: 'var(--color-text-soft)', fontSize: 'var(--font-size-sm)' }}>Loading…</p>
            ) : entityTypes.length === 0 ? (
              <p style={{ color: 'var(--color-text-soft)', fontSize: 'var(--font-size-sm)' }}>No plans yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {entityTypes.map(et => {
                  const count = plans.filter(p => p.entity_type === et).length;
                  const pct   = Math.round((count / plans.length) * 100);
                  return (
                    <div key={et}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: '13px', color: 'var(--color-text-base)', fontWeight: 'var(--font-weight-semibold)' }}>{et}</span>
                        <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{count} plans ({pct}%)</span>
                      </div>
                      <div style={{ height: '8px', background: 'var(--color-bg-muted)', borderRadius: '999px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--color-primary-800)', borderRadius: '999px' }}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Admin Info */}
          <div style={{ ...card, padding: '24px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', marginBottom: '16px' }}>System Information</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {[
                { label: 'Platform',      value: 'Agentary Orchestrator' },
            
               
                { label: 'Environment',   value: import.meta.env.MODE ?? 'production' },
                { label: 'Total Plans',   value: String(plans.length) },
                { label: 'Entity Types',  value: entityTypes.join(', ') || '—' },
              ].map(item => (
                <div key={item.label} style={{ background: 'var(--color-bg-canvas)', borderRadius: '10px', border: '1px solid var(--color-border-soft)', padding: '14px' }}>
                  <p style={{ fontSize: '11px', color: 'var(--color-text-soft)', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{item.label}</p>
                  <p style={{ fontFamily: 'var(--font-family-mono)', fontSize: '13px', color: 'var(--color-text-base)', fontWeight: 'var(--font-weight-semibold)', wordBreak: 'break-all' }}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Active Plans ── */}
      {activeTab === 'Active Plans' && (
        <div>
          {plansLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
              <div style={{ width: '32px', height: '32px', border: '3px solid var(--color-border-soft)', borderTopColor: 'var(--color-primary-800)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}/>
            </div>
          ) : plans.length === 0 ? (
            <div style={{ ...card, padding: '60px', textAlign: 'center' }}>
              <p style={{ color: 'var(--color-text-soft)', fontSize: 'var(--font-size-sm)' }}>No plans found.</p>
            </div>
          ) : (
            <div style={card}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Plan Name', 'Entity Type', 'Error Policy', 'Concurrency', 'Steps', 'Status'].map((h, i) => (
                      <th key={i} style={{ textAlign: 'left', padding: '12px 18px', fontSize: '11px', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-muted)', background: 'var(--color-bg-canvas)', borderBottom: '1px solid var(--color-border-soft)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plans.map(plan => (
                    <tr key={plan.plan_id}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-canvas)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td style={{ padding: '13px 18px', borderBottom: '1px solid var(--color-bg-muted)' }}>
                        <p style={{ fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-strong)', fontSize: '13px', fontFamily: 'var(--font-family-mono)' }}>{plan.name}</p>
                        {plan.tenant_id && <p style={{ fontSize: '11px', color: 'var(--color-text-soft)', marginTop: '2px' }}>tenant: {plan.tenant_id}</p>}
                      </td>
                      <td style={{ padding: '13px 18px', borderBottom: '1px solid var(--color-bg-muted)' }}>
                        <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', background: 'var(--color-bg-muted)', color: 'var(--color-text-base)', padding: '2px 8px', borderRadius: '6px' }}>{plan.entity_type}</span>
                      </td>
                      <td style={{ padding: '13px 18px', borderBottom: '1px solid var(--color-bg-muted)', fontSize: '13px', color: 'var(--color-text-base)' }}>{plan.error_policy.replace(/_/g, ' ')}</td>
                      <td style={{ padding: '13px 18px', borderBottom: '1px solid var(--color-bg-muted)', fontSize: '13px', color: 'var(--color-text-base)' }}>{plan.max_concurrency}</td>
                      <td style={{ padding: '13px 18px', borderBottom: '1px solid var(--color-bg-muted)', fontSize: '13px', color: 'var(--color-text-base)' }}>{plan.steps?.length ?? '—'}</td>
                      <td style={{ padding: '13px 18px', borderBottom: '1px solid var(--color-bg-muted)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 10px', borderRadius: '999px', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', background: plan.is_active ? 'var(--color-status-success-bg)' : 'var(--color-bg-canvas)', color: plan.is_active ? 'var(--color-status-success-text)' : 'var(--color-text-muted)', border: `1px solid ${plan.is_active ? 'var(--color-status-success-border)' : 'var(--color-border-soft)'}` }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: plan.is_active ? 'var(--color-accent-500)' : 'var(--color-text-soft)', display: 'inline-block' }}/>
                          {plan.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}