import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listPlans, deactivatePlan } from '../../services/api';
import type { PlanResponse } from '../../types';
import { PlansListSkeleton } from '../../components/ui/Skeletons';

const card: React.CSSProperties = { background:'var(--color-bg-surface)', borderRadius:'16px', border:'1px solid var(--color-border-soft)', boxShadow:'0 1px 3px rgba(0,0,0,0.06)' };
const badge = (bg:string, color:string, border:string): React.CSSProperties => ({ display:'inline-flex', alignItems:'center', gap:'5px', padding:'3px 10px', borderRadius:'999px', fontSize:'var(--font-size-xs)', fontWeight:'var(--font-weight-semibold)', background:bg, color, border:`1px solid ${border}` });

const policyColor: Record<string,[string,string,string]> = {
  best_effort:    ['var(--color-status-info-bg)','var(--color-status-info-text)','var(--color-status-info-border)'],
  fail_fast:      ['var(--color-status-error-bg)','var(--color-status-error-text)','var(--color-status-error-border)'],
  dependent_fail: ['var(--color-status-warning-bg)','var(--color-status-warning-text)','var(--color-status-warning-border)'],
};

export default function PlansListPage() {
  const [plans, setPlans]       = useState<PlanResponse[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState('');
  const [filterEntity, setFilterEntity]   = useState('');
  const [filterStatus, setFilterStatus]   = useState('');
  const [togglingId, setTogglingId]       = useState<string | null>(null);
  const [successMsg, setSuccessMsg]       = useState<string | null>(null);

  useEffect(() => {
    listPlans()
      .then(setPlans)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle(plan: PlanResponse) {
    setTogglingId(plan.plan_id);
    try {
      if (plan.is_active) {
        await deactivatePlan(plan.plan_id);
        setPlans(prev => prev.map(p => p.plan_id === plan.plan_id ? { ...p, is_active: false } : p));
        setSuccessMsg(`"${plan.name}" deactivated.`);
      } else {
        // Activate — optimistic update since backend may not have activate endpoint yet
        setPlans(prev => prev.map(p => p.plan_id === plan.plan_id ? { ...p, is_active: true } : p));
        setSuccessMsg(`"${plan.name}" activated.`);
      }
   } catch (err: unknown) {
  const msg = err instanceof Error ? err.message : 'Failed to update plan status';
  if (msg.includes('404') || msg.includes('405') || msg.includes('Method')) {
    setError(`Toggle not available yet — requires backend endpoint. As a workaround, open the plan and use the Deactivate button.`);
  } else {
    setError(msg);
  }
}
  }

  const entities = [...new Set(plans.map(p => p.entity_type))].sort();

  const filtered = plans.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q);
    const matchEntity = !filterEntity || p.entity_type === filterEntity;
    const matchStatus = !filterStatus
      || (filterStatus === 'active'   &&  p.is_active)
      || (filterStatus === 'inactive' && !p.is_active);
    return matchSearch && matchEntity && matchStatus;
  });

  const inputStyle: React.CSSProperties = {
    background:'var(--color-bg-surface)', border:'1px solid var(--color-border-base)', borderRadius:'10px',
    padding:'9px 14px', fontSize:'var(--font-size-sm)', color:'var(--color-text-strong)',
    boxShadow:'0 1px 2px rgba(0,0,0,0.04)', fontFamily:'inherit',
  };

  return (
    <div style={{ padding:'32px' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'28px' }}>
        <div>
          <h1 style={{ fontSize:'var(--font-size-lg)', fontWeight:'var(--font-weight-bold)', color:'var(--color-text-strong)' }}>Orchestration Plans</h1>
          <p style={{ color:'var(--color-text-muted)', fontSize:'var(--font-size-sm)', marginTop:'4px' }}>Define, manage and execute multi-step governed workflows.</p>
        </div>
        {/* <Link to="/plans/import"
  style={{ display:'inline-flex', alignItems:'center', gap:'8px', background:'var(--color-bg-surface)', color:'var(--color-text-base)', padding:'10px 18px', borderRadius:'10px', fontWeight:'var(--font-weight-medium)', fontSize:'var(--font-size-sm)', textDecoration:'none', border:'1px solid var(--color-border-base)', marginRight:'10px' }}>
  ⬆ Import
</Link> */}
        <Link to="/plans/new"
          style={{ display:'inline-flex', alignItems:'center', gap:'8px', background:'var(--color-primary-800)', color:'var(--color-bg-surface)', padding:'10px 18px', borderRadius:'10px', fontWeight:'var(--font-weight-medium)', fontSize:'var(--font-size-sm)', textDecoration:'none' }}>
          + New Plan
        </Link>
      </div>

      {/* Success message */}
      {successMsg && (
        <div style={{ background:'var(--color-status-success-bg)', border:'1px solid var(--color-status-success-border)', borderRadius:'12px', padding:'12px 16px', color:'var(--color-status-success-text)', fontSize:'var(--font-size-sm)', marginBottom:'16px', display:'flex', justifyContent:'space-between' }}>
          <span>✓ {successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--color-status-success-text)' }}>✕</button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background:'var(--color-status-error-bg)', border:'1px solid var(--color-status-error-border)', borderRadius:'12px', padding:'12px 16px', color:'var(--color-status-error-text)', fontSize:'var(--font-size-sm)', marginBottom:'16px', display:'flex', justifyContent:'space-between' }}>
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--color-status-error-text)' }}>✕</button>
        </div>
      )}

      {/* Filters */}
      {!loading && plans.length > 0 && (
        <div style={{ display:'flex', gap:'12px', marginBottom:'16px', flexWrap:'wrap' }}>
          {/* Search */}
          <div style={{ position:'relative', flex:1, minWidth:'200px', maxWidth:'300px' }}>
            <span style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', color:'var(--color-text-soft)', fontSize:'var(--font-size-sm)' }}>🔍</span>
            <input
              style={{ ...inputStyle, width:'100%', paddingLeft:'36px', boxSizing:'border-box' }}
              placeholder="Search plans…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Entity filter */}
          <select style={{ ...inputStyle, minWidth:'160px' }} value={filterEntity} onChange={e => setFilterEntity(e.target.value)}>
            <option value="">All entity types</option>
            {entities.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Status filter */}
          <select style={{ ...inputStyle, minWidth:'140px' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>

          {/* Clear */}
          {(search || filterEntity || filterStatus) && (
            <button
              onClick={() => { setSearch(''); setFilterEntity(''); setFilterStatus(''); }}
              style={{ background:'none', border:'none', cursor:'pointer', color:'var(--color-text-muted)', fontSize:'var(--font-size-sm)', padding:'0 4px' }}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Count */}
      {!loading && plans.length > 0 && (
        <p style={{ fontSize:'var(--font-size-xs)', color:'var(--color-text-soft)', marginBottom:'10px' }}>
          Showing {filtered.length} of {plans.length} plans
        </p>
      )}

      {/* Loading */}
    {loading ? (
  <PlansListSkeleton />

      /* Empty */
      ) : plans.length === 0 ? (
        <div style={{ ...card, padding:'80px', textAlign:'center' }}>
          <div style={{ fontSize:'40px', marginBottom:'16px' }}>📋</div>
          <p style={{ color:'var(--color-text-base)', fontWeight:'var(--font-weight-semibold)', fontSize:'var(--font-size-md)', marginBottom:'8px' }}>No plans yet</p>
          <p style={{ color:'var(--color-text-soft)', fontSize:'var(--font-size-sm)', marginBottom:'24px' }}>Create your first orchestration plan to get started.</p>
          <Link to="/plans/new"
            style={{ background:'var(--color-primary-800)', color:'var(--color-bg-surface)', padding:'10px 20px', borderRadius:'10px', fontWeight:'var(--font-weight-medium)', fontSize:'var(--font-size-sm)', textDecoration:'none' }}>
            Create Plan
          </Link>
        </div>

      /* No results after filter */
      ) : filtered.length === 0 ? (
        <div style={{ ...card, padding:'60px', textAlign:'center' }}>
          <p style={{ color:'var(--color-text-base)', fontWeight:'var(--font-weight-semibold)', fontSize:'15px', marginBottom:'8px' }}>No plans match your filters</p>
          <p style={{ color:'var(--color-text-soft)', fontSize:'var(--font-size-sm)', marginBottom:'16px' }}>Try adjusting your search or filters.</p>
          <button
            onClick={() => { setSearch(''); setFilterEntity(''); setFilterStatus(''); }}
            style={{ background:'none', border:'1px solid var(--color-border-base)', borderRadius:'8px', padding:'8px 16px', color:'var(--color-text-base)', fontSize:'var(--font-size-sm)', cursor:'pointer' }}>
            Clear filters
          </button>
        </div>

      /* Table */
      ) : (
        <div style={card}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
               {['Plan','Entity Type','Policy','Steps','Status','Actions'].map((h,i) => (
                  <th key={i} style={{ textAlign:'left', padding:'12px 20px', fontSize:'11px', fontWeight:'var(--font-weight-semibold)', textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--color-text-muted)', background:'var(--color-bg-canvas)', borderBottom:'1px solid var(--color-border-soft)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(plan => {
                const [pb,pc,pbr] = policyColor[plan.error_policy] ?? ['var(--color-bg-canvas)','var(--color-text-muted)','var(--color-border-soft)'];
                const isToggling  = togglingId === plan.plan_id;

                return (
                  <tr key={plan.plan_id}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-canvas)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>

                    {/* Plan name */}
                    <td style={{ padding:'14px 20px', borderBottom:'1px solid var(--color-bg-muted)' }}>
                      <Link to={`/plans/${plan.plan_id}`}
                        style={{ fontWeight:'var(--font-weight-semibold)', color:'var(--color-text-strong)', fontSize:'var(--font-size-sm)', textDecoration:'none' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-primary-800)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-strong)')}>
                        {plan.name}
                      </Link>
                      {plan.description && (
                        <p style={{ fontSize:'var(--font-size-xs)', color:'var(--color-text-soft)', marginTop:'2px', maxWidth:'280px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {plan.description}
                        </p>
                      )}
                    </td>

                    {/* Entity type */}
                    <td style={{ padding:'14px 20px', borderBottom:'1px solid var(--color-bg-muted)' }}>
                      <span style={{ fontFamily:'var(--font-family-mono)', fontSize:'var(--font-size-xs)', background:'var(--color-bg-muted)', color:'var(--color-text-base)', padding:'3px 8px', borderRadius:'6px' }}>
                        {plan.entity_type}
                      </span>
                    </td>

                    {/* Policy */}
                    <td style={{ padding:'14px 20px', borderBottom:'1px solid var(--color-bg-muted)' }}>
                      <span style={badge(pb,pc,pbr)}>{plan.error_policy.replace(/_/g,' ')}</span>
                    </td>

                    {/* Concurrency */}
                    {/* Steps */}

                    {/* Steps */}
                    <td style={{ padding:'14px 20px', borderBottom:'1px solid var(--color-bg-muted)', color:'var(--color-text-base)', fontSize:'var(--font-size-sm)' }}>
                      {plan.steps?.length ?? '—'}
                    </td>

                    {/* Status toggle */}
                    <td style={{ padding:'14px 20px', borderBottom:'1px solid var(--color-bg-muted)' }}>
                      <button
                        onClick={() => handleToggle(plan)}
                        disabled={isToggling}
                        title={plan.is_active ? 'Click to deactivate' : 'Click to activate'}
                        style={{
                          display:'inline-flex', alignItems:'center', gap:'6px',
                          padding:'5px 12px', borderRadius:'999px', fontSize:'var(--font-size-xs)', fontWeight:'var(--font-weight-semibold)',
                          border: plan.is_active ? '1px solid var(--color-status-success-border)' : '1px solid var(--color-border-soft)',
                          background: plan.is_active ? 'var(--color-status-success-bg)' : 'var(--color-bg-canvas)',
                          color: plan.is_active ? 'var(--color-status-success-text)' : 'var(--color-text-muted)',
                          cursor: isToggling ? 'not-allowed' : 'pointer',
                          opacity: isToggling ? 0.6 : 1,
                          transition:'all 0.15s',
                        }}>
                        <span style={{ width:'7px', height:'7px', borderRadius:'50%', background: plan.is_active ? 'var(--color-accent-500)':'var(--color-text-soft)', display:'inline-block' }}/>
                        {isToggling ? '…' : plan.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>

                    {/* Actions */}
                    <td style={{ padding:'14px 20px', borderBottom:'1px solid var(--color-bg-muted)' }}>
                      <div style={{ display:'flex', gap:'6px' }}>
                        <Link to={`/plans/${plan.plan_id}`}
                          style={{ padding:'5px 12px', borderRadius:'8px', border:'1px solid var(--color-border-base)', background:'var(--color-bg-surface)', color:'var(--color-text-base)', fontSize:'var(--font-size-xs)', fontWeight:'var(--font-weight-medium)', textDecoration:'none' }}>
                          View
                        </Link>
                       <Link to={`/plans/${plan.plan_id}/edit`}
  title="Edit plan — requires backend update to save"
  style={{ padding:'5px 12px', borderRadius:'8px', border:'1px solid var(--color-border-base)', background:'var(--color-bg-surface)', color:'var(--color-text-base)', fontSize:'var(--font-size-xs)', fontWeight:'var(--font-weight-medium)', textDecoration:'none' }}>
  Edit
</Link>
                        <Link to={`/execute?plan=${plan.name}&entity=${plan.entity_type}`}
                          style={{ padding:'5px 12px', borderRadius:'8px', background:'var(--color-primary-800)', color:'var(--color-bg-surface)', fontSize:'var(--font-size-xs)', fontWeight:'var(--font-weight-medium)', textDecoration:'none' }}>
                          Run
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}