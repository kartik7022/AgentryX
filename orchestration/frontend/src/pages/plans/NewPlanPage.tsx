import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createPlan } from '../../services/api';
import type { PlanCreate, PlanStepCreate, ErrorPolicy } from '../../types';

const inp: React.CSSProperties = { width:'100%', background:'var(--color-bg-surface)', border:'1px solid var(--color-border-base)', borderRadius:'10px', padding:'10px 14px', fontSize:'var(--font-size-sm)', color:'var(--color-text-strong)', fontFamily:'inherit', boxShadow:'0 1px 2px rgba(0,0,0,0.04)', boxSizing:'border-box' };
const lbl: React.CSSProperties = { display:'block', fontSize:'11px', fontWeight:'var(--font-weight-semibold)', textTransform:'uppercase' as const, letterSpacing:'0.07em', color:'var(--color-text-muted)', marginBottom:'6px' };
const card: React.CSSProperties = { background:'var(--color-bg-surface)', borderRadius:'16px', border:'1px solid var(--color-border-soft)', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', padding:'24px', marginBottom:'20px' };

const POLICIES: { value: ErrorPolicy; label: string; desc: string }[] = [
  { value:'fail_fast',       label:'Fail Fast',       desc:'Abort all steps on first failure' },
  { value:'best_effort',     label:'Best Effort',     desc:'Collect all results, record failures' },
  { value:'dependent_fail',  label:'Dependent Fail',  desc:'Skip downstream of failed steps' },
];

const KINDS: { value: string; label: string }[] = [
  { value: 'sql',               label: 'SQL' },
  { value: 'rest',              label: 'REST' },
  { value: 'graphql',           label: 'GraphQL' },
  { value: 'ai_transform',      label: 'AI Transform' },
  { value: 'intent_classify',   label: 'Intent Classify' },
  { value: 'policy_route',      label: 'Policy Route' },
  { value: 'intent_validate',   label: 'Intent Validate' },
  { value: 'human_review',      label: 'Human Review' },
  { value: 'webhook',           label: 'Webhook' },
];
function validate(form: PlanCreate) {
  const e: Record<string,string> = {};
  if (!form.name?.trim()) e.name = 'Plan name is required';
  else if (!/^[a-z0-9_]+$/.test(form.name)) e.name = 'Lowercase letters, numbers, underscores only';
  if (!form.entity_type?.trim()) e.entity_type = 'Entity type is required';
  const keys = (form.steps??[]).map(s=>s.step_key);
  const dupes = keys.filter((k,i)=>keys.indexOf(k)!==i);
  if (dupes.length) e.steps = `Duplicate step keys: ${dupes.join(', ')}`;
  if ((form.steps??[]).some(s=>!s.step_key)) e.steps = 'All steps must have a key';
  return e;
}

function StepCard({ step, index, allKeys, onUpdate, onDelete, onMoveUp, onMoveDown, isFirst, isLast }:{
  step: PlanStepCreate; index: number; allKeys: string[];
  onUpdate:(s:PlanStepCreate)=>void; onDelete:()=>void;
  onMoveUp:()=>void; onMoveDown:()=>void;
  isFirst:boolean; isLast:boolean;
}) {
  const [open, setOpen] = useState(index === 0);
  const up = (k: keyof PlanStepCreate, v: unknown) => onUpdate({ ...step, [k]: v });

  const kindColors: Record<string,string> = { sql:'var(--color-status-info-text)', rest:'var(--color-status-success-text)', graphql:'var(--color-primary-800)', ai_transform:'var(--color-primary-800)' };
  const kindBg:     Record<string,string> = { sql:'var(--color-status-info-bg)', rest:'var(--color-status-success-bg)', graphql:'var(--color-primary-50)', ai_transform:'var(--color-primary-50)' };

  return (
    <div style={{ border:'1px solid var(--color-border-soft)', borderRadius:'12px', overflow:'hidden', marginBottom:'8px', opacity: step.enabled ? 1 : 0.5 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'12px 16px', background:'var(--color-bg-canvas)', cursor:'pointer' }}
        onClick={()=>setOpen(!open)}>
        {/* Order buttons */}
        <div style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
          <button type="button" onClick={e=>{e.stopPropagation();onMoveUp();}} disabled={isFirst}
            style={{ background:'none', border:'none', cursor:isFirst?'not-allowed':'pointer', color:isFirst?'var(--color-border-soft)':'var(--color-text-soft)', padding:'1px', lineHeight:1, fontSize:'10px' }}>▲</button>
          <button type="button" onClick={e=>{e.stopPropagation();onMoveDown();}} disabled={isLast}
            style={{ background:'none', border:'none', cursor:isLast?'not-allowed':'pointer', color:isLast?'var(--color-border-soft)':'var(--color-text-soft)', padding:'1px', lineHeight:1, fontSize:'10px' }}>▼</button>
        </div>

        <span style={{ fontSize:'11px', color:'var(--color-text-soft)', fontFamily:'var(--font-family-mono)', width:'20px' }}>#{index+1}</span>

        <span style={{ background:kindBg[step.kind]??'var(--color-bg-muted)', color:kindColors[step.kind]??'var(--color-text-base)', border:`1px solid`, borderColor:'currentColor', padding:'2px 8px', borderRadius:'999px', fontSize:'11px', fontWeight:'var(--font-weight-semibold)' }}>
          {step.kind.toUpperCase().replace('_',' ')}
        </span>

        <span style={{ fontFamily:'var(--font-family-mono)', fontWeight:'var(--font-weight-semibold)', fontSize:'13px', color:'var(--color-text-strong)', flex:1 }}>
          {step.step_key || <span style={{ color:'var(--color-text-soft)', fontStyle:'italic' }}>untitled</span>}
        </span>

        <span style={{ fontSize:'var(--font-size-xs)', color:'var(--color-text-soft)' }}>{step.datasource_name}</span>

        {/* Toggle enable */}
        <button type="button" onClick={e=>{e.stopPropagation(); up('enabled',!step.enabled);}}
          style={{ background:'none', border:'none', cursor:'pointer', color: step.enabled?'var(--color-accent-500)':'var(--color-text-soft)', fontSize:'var(--font-size-xs)', padding:'4px' }}>
          {step.enabled ? '● ON' : '○ OFF'}
        </button>

        {/* Delete */}
        <button type="button" onClick={e=>{e.stopPropagation(); onDelete();}}
          style={{ background:'none', border:'none', cursor:'pointer', color:'var(--color-status-error-border)', fontSize:'var(--font-size-md)', padding:'4px', lineHeight:1 }}>✕</button>

        <span style={{ color:'var(--color-text-soft)', fontSize:'var(--font-size-xs)' }}>{open?'▲':'▼'}</span>
      </div>

      {/* Body */}
      {open && (
        <div style={{ padding:'20px', background:'var(--color-bg-surface)', borderTop:'1px solid var(--color-bg-muted)' }}>
          {/* Row 1 */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'16px', marginBottom:'16px' }}>
            <div>
              <label style={lbl}>Step Key *</label>
              <input style={{ ...inp, fontFamily:'var(--font-family-mono)' }} value={step.step_key}
                onChange={e=>up('step_key', e.target.value.replace(/\s/g,'_'))} placeholder="e.g. crm_data"/>
            </div>
            <div>
              <label style={lbl}>Kind *</label>
              <select style={inp} value={step.kind} onChange={e=>up('kind',e.target.value)}>
  {KINDS.map(k=><option key={k.value} value={k.value}>{k.label}</option>)}
</select>
            </div>
           <div>
              <label style={lbl}>Datasource *</label>
             <select style={{ ...inp, fontFamily:'var(--font-family-mono)' }}
                value={step.datasource_name}
                onChange={e => up('datasource_name', e.target.value)}>
                <option value="">— Select Datasource —</option>
                <option value="CRM_DB">CRM_DB</option>
                <option value="LOAN_CORE_DB">LOAN_CORE_DB</option>
                <option value="FIN_DB">FIN_DB</option>
                <option value="HEALTH_DB">HEALTH_DB</option>
                <option value="INSURANCE_DB">INSURANCE_DB</option>
                <option value="MFG_DB">MFG_DB</option>
                <option value="EIVS">EIVS</option>
  <option value="LLM_SERVICE">LLM_SERVICE</option>
  <option value="N8N_WEBHOOK">N8N_WEBHOOK</option>
               
            
              </select>
            </div>
          </div>

          {/* SQL */}
          {step.kind === 'sql' && (
            <div style={{ marginBottom:'16px' }}>
              <label style={lbl}>SQL Template</label>
              <textarea style={{ ...inp, fontFamily:'var(--font-family-mono)', fontSize:'var(--font-size-xs)', minHeight:'100px', resize:'vertical' }}
                value={step.sql_template??''} onChange={e=>up('sql_template',e.target.value)}
                placeholder="SELECT * FROM customers WHERE customer_id = :customer_id"/>
            </div>
          )}

          {/* REST */}
          {step.kind === 'rest' && (
            <div style={{ marginBottom:'16px' }}>
              <div style={{ display:'grid', gridTemplateColumns:'120px 1fr', gap:'12px', marginBottom:'12px' }}>
                <div>
                  <label style={lbl}>Method</label>
                  <select style={inp} value={step.method??'GET'} onChange={e=>up('method',e.target.value)}>
                    {['GET','POST','PUT','PATCH','DELETE'].map(m=><option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Path Template</label>
                  <input style={{ ...inp, fontFamily:'var(--font-family-mono)' }} value={step.path_template??''}
                    onChange={e=>up('path_template',e.target.value)} placeholder="/customers/{customer_id}"/>
                </div>
              </div>
            </div>
          )}

          {/* GraphQL */}
        {/* GraphQL */}
          {step.kind === 'graphql' && (
            <div style={{ marginBottom:'16px' }}>
              {/* GraphQL Endpoint URL */}
              <div style={{ marginBottom:'12px' }}>
                <label style={lbl}>GraphQL Endpoint URL *</label>
                <input style={{ ...inp, fontFamily:'var(--font-family-mono)' }}
                  value={step.path_template??''}
                  onChange={e=>up('path_template',e.target.value)}
                  placeholder="https://countries.trevorblades.com/graphql"/>
                <p style={{ color:'var(--color-text-soft)', fontSize:'11px', marginTop:'4px' }}>
                  Full GraphQL endpoint URL
                </p>
              </div>
              {/* GraphQL Query */}
              <label style={lbl}>GraphQL Query *</label>
              <textarea style={{ ...inp, fontFamily:'var(--font-family-mono)', fontSize:'var(--font-size-xs)', minHeight:'100px', resize:'vertical' }}
                value={step.graphql_query_template??''} onChange={e=>up('graphql_query_template',e.target.value)}
                placeholder={'{\n  countries {\n    name\n    capital\n    currency\n  }\n}'}/>
            </div>
          )}

          {/* AI */}
          {step.kind === 'ai_transform' && (
            <div style={{ marginBottom:'16px' }}>
              <label style={lbl}>AI Prompt Template</label>
              <textarea style={{ ...inp, fontFamily:'var(--font-family-mono)', fontSize:'var(--font-size-xs)', minHeight:'100px', resize:'vertical' }}
                value={step.ai_prompt_template??''} onChange={e=>up('ai_prompt_template',e.target.value)}
                placeholder="Analyze the customer data and return a risk score as JSON..."/>
            </div>
          )}

          {/* Dependencies */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'16px' }}>
            <div>
              <label style={lbl}>Depends On</label>
              <div style={{ border:'1px solid var(--color-border-soft)', borderRadius:'10px', padding:'10px', minHeight:'48px', background:'var(--color-bg-canvas)' }}>
                {allKeys.filter(k=>k!==step.step_key).length === 0
                  ? <p style={{ color:'var(--color-text-soft)', fontSize:'var(--font-size-xs)', margin:0 }}>No other steps yet</p>
                  : allKeys.filter(k=>k!==step.step_key).map(k=>(
                    <label key={k} style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'13px', color:'var(--color-text-base)', cursor:'pointer', marginBottom:'4px' }}>
                      <input type="checkbox"
                        checked={(step.depends_on??[]).includes(k)}
                        onChange={e=>{
                          const cur = step.depends_on??[];
                          up('depends_on', e.target.checked ? [...cur,k] : cur.filter(x=>x!==k));
                        }}/>
                      <span style={{ fontFamily:'var(--font-family-mono)', fontSize:'var(--font-size-xs)' }}>{k}</span>
                    </label>
                  ))
                }
              </div>
            </div>
            <div>
              <label style={lbl}>Condition Expression</label>
              <input style={{ ...inp, fontFamily:'var(--font-family-mono)', fontSize:'var(--font-size-xs)' }}
                value={step.condition_expr??''} onChange={e=>up('condition_expr',e.target.value)}
                placeholder='results.crm.status == "ACTIVE"'/>
            </div>
          </div>

         
         {/* Execution config */}
         <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:'16px' }}>
            <div>
              <label style={lbl}>Timeout (ms)</label>
              <input style={inp} type="number" min={100} value={step.timeout_ms??5000}
                onChange={e=>up('timeout_ms',parseInt(e.target.value))}/>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NewPlanPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string|null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string,string>>({});
  const [form, setForm] = useState<PlanCreate>({
    name:'', entity_type:'', description:'', tenant_id:'',
    error_policy:'best_effort', max_concurrency:8, steps:[],
  });

  function upForm<K extends keyof PlanCreate>(k:K, v:PlanCreate[K]) {
    setForm(f=>({...f,[k]:v}));
    setFieldErrors(e=>{ const n={...e}; delete n[k as string]; return n; });
  }

  function addStep() {
    const s: PlanStepCreate = {
      step_key:`step_${(form.steps??[]).length+1}`,
      step_order:(form.steps??[]).length+1,
      kind:'sql', datasource_name:'', enabled:true,
      timeout_ms:5000, depends_on:[],
    };
    upForm('steps',[...(form.steps??[]),s]);
  }

  function updateStep(i:number, s:PlanStepCreate) {
    const next=[...(form.steps??[])]; next[i]=s; upForm('steps',next);
  }

  function deleteStep(i:number) {
    upForm('steps',(form.steps??[]).filter((_,idx)=>idx!==i));
  }

  function moveUp(i:number) {
    const s=[...(form.steps??[])];
    if(i===0) return;
    [s[i-1],s[i]]=[s[i],s[i-1]];
    upForm('steps',s.map((x,idx)=>({...x,step_order:idx+1})));
  }

  function moveDown(i:number) {
    const s=[...(form.steps??[])];
    if(i===s.length-1) return;
    [s[i],s[i+1]]=[s[i+1],s[i]];
    upForm('steps',s.map((x,idx)=>({...x,step_order:idx+1})));
  }

  async function handleSubmit(e:React.FormEvent) {
    e.preventDefault();
    const errs=validate(form);
    if(Object.keys(errs).length){ setFieldErrors(errs); return; }
    setLoading(true); setError(null);
    try {
      const created = await createPlan(form);
      navigate(`/plans/${created.plan_id}`);
    } catch(err:unknown) {
     let msg = 'Failed to create plan';
if (err instanceof Error) {
  msg = err.message;
} else if (typeof err === 'object' && err !== null) {
  msg = JSON.stringify(err);
}
setError(msg);
    } finally { setLoading(false); }
  }

  const allKeys = (form.steps??[]).map(s=>s.step_key).filter(Boolean);

  return (
    <div style={{ padding:'32px', maxWidth:'900px' }}>
      <Link to="/plans" style={{ display:'inline-flex', alignItems:'center', gap:'6px', fontSize:'var(--font-size-sm)', color:'var(--color-text-muted)', textDecoration:'none', marginBottom:'24px' }}>
        ← Back to Plans
      </Link>

      <div style={{ marginBottom:'28px' }}>
        <h1 style={{ fontSize:'var(--font-size-xl)', fontWeight:'var(--font-weight-bold)', color:'var(--color-text-strong)' }}>Create Orchestration Plan</h1>
        <p style={{ color:'var(--color-text-muted)', fontSize:'var(--font-size-sm)', marginTop:'4px' }}>Define SQL, REST, GraphQL and AI steps in a governed DAG.</p>
      </div>

      {error && (
        <div style={{ background:'var(--color-status-error-bg)', border:'1px solid var(--color-status-error-border)', borderRadius:'12px', padding:'14px 16px', color:'var(--color-status-error-text)', fontSize:'var(--font-size-sm)', marginBottom:'20px', display:'flex', justifyContent:'space-between' }}>
          <span>⚠ {error}</span>
          <button onClick={()=>setError(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--color-status-error-text)' }}>✕</button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Plan Config Card */}
        <div style={card}>
          <h2 style={{ fontSize:'var(--font-size-md)', fontWeight:'var(--font-weight-bold)', color:'var(--color-text-strong)', marginBottom:'20px', paddingBottom:'12px', borderBottom:'1px solid var(--color-bg-muted)' }}>
            Plan Configuration
          </h2>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px', marginBottom:'16px' }}>
            <div>
              <label style={lbl}>Plan Name *</label>
              <input style={{ ...inp, ...(fieldErrors.name?{borderColor:'var(--color-status-error-border)'}:{}) }}
                value={form.name} onChange={e=>upForm('name',e.target.value.replace(/\s/g,'_').toLowerCase())}
                placeholder="customer_360_collections"/>
              {fieldErrors.name
                ? <p style={{ color:'var(--color-status-error-text)', fontSize:'var(--font-size-xs)', marginTop:'4px' }}>{fieldErrors.name}</p>
                : <p style={{ color:'var(--color-text-soft)', fontSize:'var(--font-size-xs)', marginTop:'4px' }}>lowercase_with_underscores only</p>}
            </div>
            <div>
              <label style={lbl}>Entity Type *</label>
              <input style={{ ...inp, ...(fieldErrors.entity_type?{borderColor:'var(--color-status-error-border)'}:{}) }}
                value={form.entity_type} onChange={e=>upForm('entity_type',e.target.value.trimStart())}
                placeholder="customer, policy"/>
              {fieldErrors.entity_type && <p style={{ color:'var(--color-status-error-text)', fontSize:'var(--font-size-xs)', marginTop:'4px' }}>{fieldErrors.entity_type}</p>}
            </div>
          </div>

          <div style={{ marginBottom:'16px' }}>
            <label style={lbl}>Description</label>
            <textarea style={{ ...inp, minHeight:'80px', resize:'vertical' }}
              value={form.description} onChange={e=>upForm('description',e.target.value)}
              placeholder="What does this plan do and when should it be used?"/>
          </div>

<div style={{ marginBottom:'20px' }}>
            <div>
              <label style={lbl}>Tenant ID</label>
              <input style={{ ...inp, fontFamily:'var(--font-family-mono)' }} value={form.tenant_id??''}
                onChange={e=>upForm('tenant_id',e.target.value||undefined)}
                placeholder="Leave blank for global plan"/>
            </div>
           
          </div>

          {/* Error Policy */}
          <div>
            <label style={lbl}>Error Policy</label>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px' }}>
              {POLICIES.map(p=>(
                <button key={p.value} type="button" onClick={()=>upForm('error_policy',p.value)}
                  style={{
                    textAlign:'left', padding:'14px 16px', borderRadius:'12px', cursor:'pointer',
                    border: form.error_policy===p.value ? '2px solid var(--color-primary-800)' : '2px solid var(--color-border-soft)',
                    background: form.error_policy===p.value ? 'var(--color-primary-50)' : 'var(--color-bg-surface)',
                    transition:'all 0.15s',
                  }}>
                  <div style={{ fontWeight:'var(--font-weight-semibold)', fontSize:'13px', color: form.error_policy===p.value?'var(--color-primary-800)':'var(--color-text-base)', marginBottom:'4px' }}>{p.label}</div>
                  <div style={{ fontSize:'var(--font-size-xs)', color:'var(--color-text-muted)' }}>{p.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Steps Card */}
        <div style={card}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
            <div>
              <h2 style={{ fontSize:'var(--font-size-md)', fontWeight:'var(--font-weight-bold)', color:'var(--color-text-strong)', margin:0 }}>Plan Steps</h2>
              <p style={{ fontSize:'var(--font-size-xs)', color:'var(--color-text-soft)', marginTop:'2px' }}>{(form.steps??[]).length} step(s) defined</p>
            </div>
            <button type="button" onClick={addStep}
              style={{ display:'flex', alignItems:'center', gap:'6px', background:'var(--color-bg-surface)', border:'1px solid var(--color-border-base)', borderRadius:'8px', padding:'8px 14px', fontSize:'13px', fontWeight:'var(--font-weight-medium)', color:'var(--color-text-base)', cursor:'pointer' }}>
              + Add Step
            </button>
          </div>

          {(form.steps??[]).length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px', border:'2px dashed var(--color-border-soft)', borderRadius:'12px' }}>
              <p style={{ color:'var(--color-text-soft)', fontSize:'var(--font-size-sm)', marginBottom:'12px' }}>No steps yet. Add your first step to define the workflow.</p>
              <button type="button" onClick={addStep}
                style={{ background:'var(--color-primary-800)', color:'var(--color-bg-surface)', border:'none', borderRadius:'8px', padding:'10px 20px', fontSize:'13px', fontWeight:'var(--font-weight-medium)', cursor:'pointer' }}>
                + Add First Step
              </button>
            </div>
          ) : (
            <>
              {(form.steps??[]).map((step,i)=>(
                <StepCard key={i} step={step} index={i} allKeys={allKeys}
                  onUpdate={s=>updateStep(i,s)} onDelete={()=>deleteStep(i)}
                  onMoveUp={()=>moveUp(i)} onMoveDown={()=>moveDown(i)}
                  isFirst={i===0} isLast={i===(form.steps??[]).length-1}/>
              ))}
              <button type="button" onClick={addStep}
                style={{ width:'100%', padding:'10px', border:'2px dashed var(--color-border-soft)', borderRadius:'10px', background:'none', cursor:'pointer', color:'var(--color-text-soft)', fontSize:'13px', marginTop:'8px', transition:'all 0.15s' }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--color-primary-800)'; e.currentTarget.style.color='var(--color-primary-800)';}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--color-border-soft)'; e.currentTarget.style.color='var(--color-text-soft)';}}>
                + Add Another Step
              </button>
            </>
          )}

          {fieldErrors.steps && <p style={{ color:'var(--color-status-error-text)', fontSize:'var(--font-size-xs)', marginTop:'8px' }}>{fieldErrors.steps}</p>}
        </div>

        {/* Actions */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Link to="/plans" style={{ padding:'10px 20px', borderRadius:'10px', border:'1px solid var(--color-border-base)', background:'var(--color-bg-surface)', color:'var(--color-text-base)', fontSize:'var(--font-size-sm)', fontWeight:'var(--font-weight-medium)', textDecoration:'none' }}>
            Cancel
          </Link>
          <button type="submit" disabled={loading}
            style={{ display:'flex', alignItems:'center', gap:'8px', background:'var(--color-primary-800)', color:'var(--color-bg-surface)', border:'none', borderRadius:'10px', padding:'12px 24px', fontSize:'var(--font-size-sm)', fontWeight:'var(--font-weight-semibold)', cursor: loading?'not-allowed':'pointer', opacity:loading?0.7:1 }}>
            {loading ? 'Creating…' : '💾  Create Plan'}
          </button>
        </div>
      </form>
    </div>
  );
}