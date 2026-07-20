import { useState } from 'react';
import { loadHistory } from '../../services/history';
import type { ExecutionRecord } from '../../services/history';

const card: React.CSSProperties = {
  background: 'var(--color-bg-surface)', borderRadius: '16px',
  border: '1px solid var(--color-border-soft)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
};

interface UsageEvent {
  id:          string;
  plan_name:   string;
  entity_type: string;
  tenant_id:   string;
  executed_at: string;
  duration_ms: number;
  steps_run:   number;
  status:      string;
  cost_usd:    number;
  result_count: number;
  error_count:  number;
}

interface TenantSummary {
  tenant_id:    string;
  total_runs:   number;
  success_runs: number;
  failed_runs:  number;
  total_cost:   number;
  total_steps:  number;
  avg_duration: number;
  plans_used:   string[];
}

interface DailyStat {
  date:      string;
  runs:      number;
  cost:      number;
  successes: number;
  failures:  number;
}

// Cost model — $0.001 per step per execution
const COST_PER_STEP = 0.001;

function buildUsageFromHistory(records: ExecutionRecord[]): UsageEvent[] {
  return records.map(r => {
    const steps_run    = Object.keys(r.result.results).length + Object.keys(r.result.errors).length;
    const cost_usd     = parseFloat((steps_run * COST_PER_STEP).toFixed(4));
    return {
      id:           r.id,
      plan_name:    r.plan_name,
      entity_type:  r.entity_type,
      tenant_id:    r.tenant_id,
      executed_at:  r.executed_at,
      duration_ms:  r.duration_ms,
      steps_run,
      status:       r.status,
      cost_usd,
      result_count: Object.keys(r.result.results).length,
      error_count:  Object.keys(r.result.errors).length,
    };
  });
}

function buildTenantSummaries(events: UsageEvent[]): TenantSummary[] {
  const map: Record<string, TenantSummary> = {};
  for (const ev of events) {
    if (!map[ev.tenant_id]) {
      map[ev.tenant_id] = {
        tenant_id:    ev.tenant_id,
        total_runs:   0,
        success_runs: 0,
        failed_runs:  0,
        total_cost:   0,
        total_steps:  0,
        avg_duration: 0,
        plans_used:   [],
      };
    }
    const t = map[ev.tenant_id];
    t.total_runs++;
    if (ev.status === 'success') t.success_runs++;
    if (ev.status === 'failed')  t.failed_runs++;
    t.total_cost   += ev.cost_usd;
    t.total_steps  += ev.steps_run;
    t.avg_duration  = Math.round(
      (t.avg_duration * (t.total_runs - 1) + ev.duration_ms) / t.total_runs
    );
    if (!t.plans_used.includes(ev.plan_name)) {
      t.plans_used.push(ev.plan_name);
    }
  }
  return Object.values(map).sort((a, b) => b.total_cost - a.total_cost);
}

function buildDailyStats(events: UsageEvent[]): DailyStat[] {
  const map: Record<string, DailyStat> = {};
  for (const ev of events) {
    const date = ev.executed_at.split('T')[0];
    if (!map[date]) {
      map[date] = { date, runs: 0, cost: 0, successes: 0, failures: 0 };
    }
    map[date].runs++;
    map[date].cost      += ev.cost_usd;
    if (ev.status === 'success') map[date].successes++;
    if (ev.status === 'failed')  map[date].failures++;
  }
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
}

function MiniBarChart({ data, maxVal, color }: { data: number[]; maxVal: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '48px' }}>
      {data.map((v, i) => (
        <div key={i} style={{
          flex: 1, background: color, borderRadius: '3px 3px 0 0', opacity: 0.7 + (i / data.length) * 0.3,
          height: maxVal > 0 ? `${Math.max(4, (v / maxVal) * 100)}%` : '4px',
          minWidth: '4px', transition: 'height 0.3s',
        }}/>
      ))}
    </div>
  );
}

const TABS = ['Overview', 'By Tenant', 'Daily Stats', 'Event Log'] as const;
type Tab = typeof TABS[number];

export default function UsageBillingPage() {
  const [events]                    = useState<UsageEvent[]>(() => buildUsageFromHistory(loadHistory()));
  const [activeTab, setActiveTab]   = useState<Tab>('Overview');
  const [filterTenant, setFilterTenant] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch]         = useState('');

  const tenantSummaries = buildTenantSummaries(events);
  const dailyStats      = buildDailyStats(events);
  const tenantIds       = [...new Set(events.map(e => e.tenant_id))].sort();

  const totalCost     = events.reduce((a, e) => a + e.cost_usd, 0);
  const totalSteps    = events.reduce((a, e) => a + e.steps_run, 0);
  const totalRuns     = events.length;
  const successRate   = totalRuns > 0
    ? Math.round((events.filter(e => e.status === 'success').length / totalRuns) * 100)
    : 0;
  const avgDuration   = totalRuns > 0
    ? Math.round(events.reduce((a, e) => a + e.duration_ms, 0) / totalRuns)
    : 0;

  const last7Days = dailyStats.slice(-7);
  const maxRuns   = Math.max(...last7Days.map(d => d.runs), 1);
  const maxCost   = Math.max(...last7Days.map(d => d.cost), 0.001);

  const filteredEvents = events.filter(ev => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || ev.plan_name.toLowerCase().includes(q)
      || ev.tenant_id.toLowerCase().includes(q)
      || ev.entity_type.toLowerCase().includes(q);
    const matchTenant = !filterTenant || ev.tenant_id === filterTenant;
    const matchStatus = !filterStatus || ev.status === filterStatus;
    return matchSearch && matchTenant && matchStatus;
  });

  const inputStyle: React.CSSProperties = {
    background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-base)', borderRadius: '10px',
    padding: '9px 14px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-strong)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)', fontFamily: 'inherit',
  };

  const statusBadge = (s: string) => {
    const map: Record<string, [string,string,string]> = {
      success: ['var(--color-status-success-bg)','var(--color-status-success-text)','var(--color-status-success-border)'],
      partial: ['var(--color-status-warning-bg)','var(--color-status-warning-text)','var(--color-status-warning-border)'],
      failed:  ['var(--color-status-error-bg)','var(--color-status-error-text)','var(--color-status-error-border)'],
    };
    const [bg, color, border] = map[s] ?? ['var(--color-bg-canvas)','var(--color-text-muted)','var(--color-border-soft)'];
    return { display:'inline-flex', alignItems:'center', gap:'5px', padding:'3px 10px', borderRadius:'999px', fontSize:'var(--font-size-xs)', fontWeight:'var(--font-weight-semibold)', background:bg, color, border:`1px solid ${border}` } as React.CSSProperties;
  };

  return (
    <div style={{ padding: '32px' }}>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)' }}>Usage & Billing</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', marginTop: '4px' }}>
          Metering events, cost tracking, and reconciliation across all tenants and plans.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-soft)', marginBottom: '24px' }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{ padding: '10px 20px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: activeTab === tab ? 'var(--color-primary-800)' : 'var(--color-text-muted)', borderBottom: activeTab === tab ? '2px solid var(--color-primary-800)' : '2px solid transparent', transition: 'color 0.15s', whiteSpace: 'nowrap' }}>
            {tab}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {events.length === 0 ? (
        <div style={{ ...card, padding: '80px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
          <p style={{ color: 'var(--color-text-base)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-md)', marginBottom: '8px' }}>No usage data yet</p>
          <p style={{ color: 'var(--color-text-soft)', fontSize: 'var(--font-size-sm)' }}>
            Usage events are generated automatically when you execute plans.
          </p>
        </div>
      ) : (
        <>

          {/* ── Overview Tab ── */}
          {activeTab === 'Overview' && (
            <div>
              {/* KPI cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '16px', marginBottom: '24px' }}>
                {[
                  { label: 'Total Cost',     value: `$${totalCost.toFixed(4)}`,  bg: 'var(--color-primary-50)', color: 'var(--color-primary-800)' },
                  { label: 'Total Runs',     value: totalRuns,                   bg: 'var(--color-status-success-bg)', color: 'var(--color-status-success-text)' },
                  { label: 'Total Steps',    value: totalSteps,                  bg: 'var(--color-status-warning-bg)', color: 'var(--color-status-warning-text)' },
                  { label: 'Success Rate',   value: `${successRate}%`,           bg: 'var(--color-status-success-bg)', color: 'var(--color-status-success-text)' },
                  { label: 'Avg Duration',   value: `${avgDuration}ms`,          bg: 'var(--color-primary-50)', color: 'var(--color-primary-800)' },
                ].map(s => (
                  <div key={s.label} style={{ ...card, padding: '20px' }}>
                    <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: s.color, marginBottom: '4px' }}>{s.value}</div>
                    <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Mini charts row */}
              {last7Days.length > 1 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                  <div style={{ ...card, padding: '20px' }}>
                    <p style={{ fontSize: '13px', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Executions — Last 7 Days</p>
                    <MiniBarChart data={last7Days.map(d => d.runs)} maxVal={maxRuns} color="var(--color-primary-800)"/>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-soft)' }}>{last7Days[0]?.date}</span>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-soft)' }}>{last7Days[last7Days.length-1]?.date}</span>
                    </div>
                  </div>
                  <div style={{ ...card, padding: '20px' }}>
                    <p style={{ fontSize: '13px', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cost (USD) — Last 7 Days</p>
                    <MiniBarChart data={last7Days.map(d => d.cost)} maxVal={maxCost} color="var(--color-accent-700)"/>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-soft)' }}>{last7Days[0]?.date}</span>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-soft)' }}>{last7Days[last7Days.length-1]?.date}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Top plans by cost */}
              <div style={{ ...card, padding: '24px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', marginBottom: '16px' }}>Top Plans by Cost</h2>
                {(() => {
                  const byPlan: Record<string, { runs: number; cost: number; steps: number }> = {};
                  for (const ev of events) {
                    if (!byPlan[ev.plan_name]) byPlan[ev.plan_name] = { runs: 0, cost: 0, steps: 0 };
                    byPlan[ev.plan_name].runs++;
                    byPlan[ev.plan_name].cost  += ev.cost_usd;
                    byPlan[ev.plan_name].steps += ev.steps_run;
                  }
                  const sorted = Object.entries(byPlan).sort((a, b) => b[1].cost - a[1].cost).slice(0, 8);
                  const maxCostPlan = sorted[0]?.[1].cost ?? 1;
                  return sorted.map(([name, data]) => (
                    <div key={name} style={{ marginBottom: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: '13px', color: 'var(--color-text-base)', fontWeight: 'var(--font-weight-semibold)' }}>{name}</span>
                        <div style={{ display: 'flex', gap: '16px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                          <span>{data.runs} runs</span>
                          <span>{data.steps} steps</span>
                          <span style={{ fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary-800)' }}>${data.cost.toFixed(4)}</span>
                        </div>
                      </div>
                      <div style={{ height: '6px', background: 'var(--color-bg-muted)', borderRadius: '999px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(data.cost / maxCostPlan) * 100}%`, background: 'var(--color-primary-800)', borderRadius: '999px' }}/>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}

          {/* ── By Tenant Tab ── */}
          {activeTab === 'By Tenant' && (
            <div>
              {tenantSummaries.length === 0 ? (
                <div style={{ ...card, padding: '60px', textAlign: 'center' }}>
                  <p style={{ color: 'var(--color-text-soft)' }}>No tenant data available.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {tenantSummaries.map(t => (
                    <div key={t.tenant_id} style={{ ...card, padding: '20px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <div>
                          <p style={{ fontFamily: 'var(--font-family-mono)', fontWeight: 'var(--font-weight-bold)', fontSize: '15px', color: 'var(--color-text-strong)', marginBottom: '4px' }}>{t.tenant_id}</p>
                          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-soft)' }}>
                            {t.plans_used.length} plan{t.plans_used.length !== 1 ? 's' : ''} used
                          </p>
                        </div>
                        <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary-800)' }}>
                          ${t.total_cost.toFixed(4)}
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '14px' }}>
                        {[
                          { label: 'Total Runs',    value: t.total_runs },
                          { label: 'Successful',    value: t.success_runs },
                          { label: 'Failed',        value: t.failed_runs },
                          { label: 'Avg Duration',  value: `${t.avg_duration}ms` },
                        ].map(m => (
                          <div key={m.label} style={{ background: 'var(--color-bg-canvas)', borderRadius: '10px', border: '1px solid var(--color-border-soft)', padding: '12px' }}>
                            <p style={{ fontSize: '11px', color: 'var(--color-text-soft)', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{m.label}</p>
                            <p style={{ fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)' }}>{m.value}</p>
                          </div>
                        ))}
                      </div>
                      {/* Plans used */}
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {t.plans_used.map(p => (
                          <span key={p} style={{ fontFamily: 'var(--font-family-mono)', fontSize: '11px', background: 'var(--color-primary-50)', color: 'var(--color-primary-800)', padding: '3px 8px', borderRadius: '6px', fontWeight: 'var(--font-weight-semibold)' }}>
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Daily Stats Tab ── */}
          {activeTab === 'Daily Stats' && (
            <div style={card}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Date','Runs','Successful','Failed','Cost (USD)','Success Rate'].map((h, i) => (
                      <th key={i} style={{ textAlign: 'left', padding: '12px 20px', fontSize: '11px', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-muted)', background: 'var(--color-bg-canvas)', borderBottom: '1px solid var(--color-border-soft)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...dailyStats].reverse().map(day => {
                    const rate = day.runs > 0 ? Math.round((day.successes / day.runs) * 100) : 0;
                    return (
                      <tr key={day.date}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-canvas)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <td style={{ padding: '13px 20px', borderBottom: '1px solid var(--color-bg-muted)', fontFamily: 'var(--font-family-mono)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-strong)', fontSize: '13px' }}>{day.date}</td>
                        <td style={{ padding: '13px 20px', borderBottom: '1px solid var(--color-bg-muted)', color: 'var(--color-text-base)', fontSize: 'var(--font-size-sm)' }}>{day.runs}</td>
                        <td style={{ padding: '13px 20px', borderBottom: '1px solid var(--color-bg-muted)', color: 'var(--color-status-success-text)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)' }}>{day.successes}</td>
                        <td style={{ padding: '13px 20px', borderBottom: '1px solid var(--color-bg-muted)', color: day.failures > 0 ? 'var(--color-status-error-text)':'var(--color-text-soft)', fontWeight: day.failures > 0 ? 600:400, fontSize: 'var(--font-size-sm)' }}>{day.failures}</td>
                        <td style={{ padding: '13px 20px', borderBottom: '1px solid var(--color-bg-muted)', fontFamily: 'var(--font-family-mono)', color: 'var(--color-primary-800)', fontWeight: 'var(--font-weight-semibold)', fontSize: '13px' }}>${day.cost.toFixed(4)}</td>
                        <td style={{ padding: '13px 20px', borderBottom: '1px solid var(--color-bg-muted)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1, height: '6px', background: 'var(--color-bg-muted)', borderRadius: '999px', overflow: 'hidden', maxWidth: '80px' }}>
                              <div style={{ height: '100%', width: `${rate}%`, background: rate === 100 ? 'var(--color-accent-500)' : rate >= 70 ? 'var(--color-status-warning-text)' : 'var(--color-status-error-text)', borderRadius: '999px' }}/>
                            </div>
                            <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: rate === 100 ? 'var(--color-status-success-text)' : rate >= 70 ? 'var(--color-status-warning-text)' : 'var(--color-status-error-text)' }}>{rate}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--color-bg-canvas)' }}>
                    <td style={{ padding: '13px 20px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', fontSize: '13px', borderTop: '2px solid var(--color-border-soft)' }}>Total</td>
                    <td style={{ padding: '13px 20px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', borderTop: '2px solid var(--color-border-soft)' }}>{totalRuns}</td>
                    <td style={{ padding: '13px 20px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-status-success-text)', borderTop: '2px solid var(--color-border-soft)' }}>{events.filter(e => e.status === 'success').length}</td>
                    <td style={{ padding: '13px 20px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-status-error-text)', borderTop: '2px solid var(--color-border-soft)' }}>{events.filter(e => e.status === 'failed').length}</td>
                    <td style={{ padding: '13px 20px', fontFamily: 'var(--font-family-mono)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary-800)', borderTop: '2px solid var(--color-border-soft)' }}>${totalCost.toFixed(4)}</td>
                    <td style={{ padding: '13px 20px', fontWeight: 'var(--font-weight-bold)', color: successRate >= 70 ? 'var(--color-status-success-text)':'var(--color-status-error-text)', borderTop: '2px solid var(--color-border-soft)' }}>{successRate}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* ── Event Log Tab ── */}
          {activeTab === 'Event Log' && (
            <div>
              {/* Filters */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '300px' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-soft)' }}>🔍</span>
                  <input style={{ ...inputStyle, width: '100%', paddingLeft: '36px', boxSizing: 'border-box' as const }}
                    placeholder="Search events…"
                    value={search} onChange={e => setSearch(e.target.value)}/>
                </div>
                <select style={{ ...inputStyle, minWidth: '160px' }} value={filterTenant} onChange={e => setFilterTenant(e.target.value)}>
                  <option value="">All tenants</option>
                  {tenantIds.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select style={{ ...inputStyle, minWidth: '140px' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="">All statuses</option>
                  <option value="success">Success</option>
                  <option value="partial">Partial</option>
                  <option value="failed">Failed</option>
                </select>
                {(search || filterTenant || filterStatus) && (
                  <button onClick={() => { setSearch(''); setFilterTenant(''); setFilterStatus(''); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
                    Clear
                  </button>
                )}
              </div>

              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-soft)', marginBottom: '12px' }}>
                {filteredEvents.length} of {events.length} events
              </p>

              <div style={card}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['Plan','Tenant','Entity','Steps','Results','Errors','Duration','Cost','Status','Time'].map((h, i) => (
                        <th key={i} style={{ textAlign: 'left', padding: '12px 16px', fontSize: '11px', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-muted)', background: 'var(--color-bg-canvas)', borderBottom: '1px solid var(--color-border-soft)', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEvents.map(ev => (
                      <tr key={ev.id}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-canvas)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-bg-muted)', fontFamily: 'var(--font-family-mono)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-strong)', fontSize: 'var(--font-size-xs)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.plan_name}</td>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-bg-muted)', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-base)' }}>{ev.tenant_id}</td>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-bg-muted)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-base)' }}>{ev.entity_type}</td>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-bg-muted)', fontSize: '13px', color: 'var(--color-text-base)', textAlign: 'center' }}>{ev.steps_run}</td>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-bg-muted)', fontSize: '13px', color: 'var(--color-status-success-text)', fontWeight: 'var(--font-weight-semibold)', textAlign: 'center' }}>{ev.result_count}</td>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-bg-muted)', fontSize: '13px', color: ev.error_count > 0 ? 'var(--color-status-error-text)':'var(--color-text-soft)', fontWeight: ev.error_count > 0 ? 600:400, textAlign: 'center' }}>{ev.error_count}</td>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-bg-muted)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontFamily: 'var(--font-family-mono)' }}>{ev.duration_ms}ms</td>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-bg-muted)', fontSize: 'var(--font-size-xs)', color: 'var(--color-primary-800)', fontFamily: 'var(--font-family-mono)', fontWeight: 'var(--font-weight-semibold)' }}>${ev.cost_usd.toFixed(4)}</td>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-bg-muted)' }}>
                          <span style={statusBadge(ev.status)}>{ev.status}</span>
                        </td>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-bg-muted)', fontSize: '11px', color: 'var(--color-text-soft)', whiteSpace: 'nowrap' }}>
                          {new Date(ev.executed_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
