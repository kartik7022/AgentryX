// src/pages/plans/EditPlanPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { listPlans, updatePlan } from '../../services/api';
import type { PlanCreate, PlanResponse, PlanStepCreate, ErrorPolicy } from '../../types';
import AgentTaskInspector from '../../components/AgentTaskInspector';

import type { AgentTaskConfig } from '../../types';

const inp: React.CSSProperties = { width:'100%', background:'var(--color-bg-surface)', border:'1px solid var(--color-border-base)', borderRadius:'10px', padding:'10px 14px', fontSize:'var(--font-size-sm)', color:'var(--color-text-strong)', fontFamily:'inherit', boxShadow:'0 1px 2px rgba(0,0,0,0.04)', boxSizing:'border-box' };
const lbl: React.CSSProperties = { display:'block', fontSize:'11px', fontWeight:'var(--font-weight-semibold)', textTransform:'uppercase' as const, letterSpacing:'0.07em', color:'var(--color-text-muted)', marginBottom:'6px' };
const card: React.CSSProperties = { background:'var(--color-bg-surface)', borderRadius:'16px', border:'1px solid var(--color-border-soft)', boxShadow:'0 1px 3px rgba(0,0,0,0.06)', padding:'24px', marginBottom:'20px' };

const POLICIES: { value: ErrorPolicy; label: string; desc: string }[] = [
  { value:'fail_fast',      label:'Fail Fast',      desc:'Abort all steps on first failure' },
  { value:'best_effort',    label:'Best Effort',    desc:'Collect all results, record failures' },
  { value:'dependent_fail', label:'Dependent Fail', desc:'Skip downstream of failed steps' },
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
  { value: 'agent_task',        label: 'Agent Task' },
];

const kindColors: Record<string, string> = {
  sql:'var(--color-status-info-text)', rest:'var(--color-status-success-text)', graphql:'var(--color-primary-800)', ai_transform:'var(--color-primary-800)',
  intent_classify:'var(--color-status-warning-text)', policy_route:'var(--color-status-warning-text)', intent_validate:'var(--color-status-success-text)',
  adapter_analyze:'var(--color-accent-700)', prompt_run:'var(--color-primary-800)', document_generate:'var(--color-text-base)',
  human_review:'var(--color-status-error-text)', webhook:'var(--color-status-info-text)', agent_task:'var(--color-primary-800)',
};
const kindBg: Record<string, string> = {
  sql:'var(--color-status-info-bg)', rest:'var(--color-status-success-bg)', graphql:'var(--color-primary-50)', ai_transform:'var(--color-primary-50)',
  intent_classify:'var(--color-status-warning-bg)', policy_route:'var(--color-status-warning-bg)', intent_validate:'var(--color-status-success-bg)',
  adapter_analyze:'var(--color-accent-50)', prompt_run:'var(--color-primary-50)', document_generate:'var(--color-bg-canvas)',
  human_review:'var(--color-status-error-bg)', webhook:'var(--color-status-info-bg)', agent_task:'var(--color-primary-50)',
};

function StepCard({ step, index, allKeys, allSteps, onUpdate, onDelete, onMoveUp, onMoveDown, isFirst, isLast }: {
  step: PlanStepCreate; index: number; allKeys: string[]; allSteps: PlanStepCreate[];
  onUpdate: (s: PlanStepCreate) => void; onDelete: () => void;
  onMoveUp: () => void; onMoveDown: () => void;
  isFirst: boolean; isLast: boolean;
}) {
  const [open, setOpen] = useState(false);
  const up = (k: keyof PlanStepCreate, v: unknown) => onUpdate({ ...step, [k]: v });

  const bindings = (step.input_bindings_json as Record<string, unknown>) ?? {};
  const setBinding = (key: string, value: string) =>
    up('input_bindings_json', { ...bindings, [key]: value });

  const classifyStepOptions = allSteps
    .filter(s => s.kind === 'intent_classify' && s.step_key && s.step_key !== step.step_key)
    .map(s => s.step_key);

  return (
    <div style={{ border:'1px solid var(--color-border-soft)', borderRadius:'12px', overflow:'hidden', marginBottom:'8px', opacity: step.enabled ? 1 : 0.6 }}>
      <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'12px 16px', background:'var(--color-bg-canvas)', cursor:'pointer' }}
        onClick={() => setOpen(!open)}>
        <div style={{ display:'flex', flexDirection:'column', gap:'1px' }}>
          <button type="button" onClick={e => { e.stopPropagation(); onMoveUp(); }} disabled={isFirst}
            style={{ background:'none', border:'none', cursor: isFirst ? 'not-allowed':'pointer', color: isFirst ? 'var(--color-border-soft)':'var(--color-text-soft)', fontSize:'10px', padding:'1px', lineHeight:1 }}>▲</button>
          <button type="button" onClick={e => { e.stopPropagation(); onMoveDown(); }} disabled={isLast}
            style={{ background:'none', border:'none', cursor: isLast ? 'not-allowed':'pointer', color: isLast ? 'var(--color-border-soft)':'var(--color-text-soft)', fontSize:'10px', padding:'1px', lineHeight:1 }}>▼</button>
        </div>
        <span style={{ fontSize:'11px', color:'var(--color-text-soft)', fontFamily:'var(--font-family-mono)', width:'20px' }}>#{index+1}</span>
        <span style={{ background: kindBg[step.kind]??'var(--color-bg-muted)', color: kindColors[step.kind]??'var(--color-text-base)', padding:'2px 8px', borderRadius:'999px', fontSize:'11px', fontWeight:'var(--font-weight-semibold)' }}>
          {KINDS.find(k => k.value === step.kind)?.label ?? step.kind}
        </span>
        <span style={{ fontFamily:'var(--font-family-mono)', fontWeight:'var(--font-weight-semibold)', fontSize:'13px', color:'var(--color-text-strong)', flex:1 }}>
          {step.step_key || <span style={{ color:'var(--color-text-soft)', fontStyle:'italic' }}>untitled</span>}
        </span>
        <span style={{ fontSize:'var(--font-size-xs)', color:'var(--color-text-soft)' }}>{step.datasource_name}</span>
        <button type="button" onClick={e => { e.stopPropagation(); up('enabled', !step.enabled); }}
          style={{ background:'none', border:'none', cursor:'pointer', color: step.enabled ? 'var(--color-accent-500)':'var(--color-text-soft)', fontSize:'var(--font-size-xs)', padding:'4px' }}>
          {step.enabled ? '● ON' : '○ OFF'}
        </button>
        <button type="button" onClick={e => { e.stopPropagation(); onDelete(); }}
          style={{ background:'none', border:'none', cursor:'pointer', color:'var(--color-status-error-border)', fontSize:'var(--font-size-md)', padding:'4px', lineHeight:1 }}>✕</button>
        <span style={{ color:'var(--color-text-soft)', fontSize:'var(--font-size-xs)' }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div style={{ padding:'20px', background:'var(--color-bg-surface)', borderTop:'1px solid var(--color-bg-muted)' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'16px', marginBottom:'16px' }}>
            <div>
              <label style={lbl}>Step Key *</label>
              <input style={{ ...inp, fontFamily:'var(--font-family-mono)' }} value={step.step_key}
                onChange={e => up('step_key', e.target.value.replace(/\s/g,'_'))} placeholder="e.g. crm_data"/>
            </div>
            <div>
              <label style={lbl}>Kind *</label>
              <select style={inp} value={step.kind} onChange={e => up('kind', e.target.value)}>
                {KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Datasource</label>
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
                value={step.sql_template ?? ''} onChange={e => up('sql_template', e.target.value)}
                placeholder="SELECT * FROM customers WHERE customer_id = :customer_id"/>
            </div>
          )}

          {/* REST */}
          {step.kind === 'rest' && (
            <div style={{ marginBottom:'16px' }}>
              <div style={{ display:'grid', gridTemplateColumns:'120px 1fr', gap:'12px', marginBottom:'12px' }}>
                <div>
                  <label style={lbl}>Method</label>
                  <select style={inp} value={step.method ?? 'GET'} onChange={e => up('method', e.target.value)}>
                    {['GET','POST','PUT','PATCH','DELETE'].map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Path Template</label>
                  <input style={{ ...inp, fontFamily:'var(--font-family-mono)' }} value={step.path_template ?? ''}
                    onChange={e => up('path_template', e.target.value)} placeholder="/customers/{customer_id}"/>
                </div>
              </div>
            </div>
          )}

          {/* GraphQL */}
          {step.kind === 'graphql' && (
            <div style={{ marginBottom:'16px' }}>
              <div style={{ marginBottom:'12px' }}>
                <label style={lbl}>GraphQL Endpoint URL *</label>
                <input style={{ ...inp, fontFamily:'var(--font-family-mono)' }}
                  value={step.path_template ?? ''}
                  onChange={e => up('path_template', e.target.value)}
                  placeholder="https://countries.trevorblades.com/graphql"/>
              </div>
              <label style={lbl}>GraphQL Query *</label>
              <textarea style={{ ...inp, fontFamily:'var(--font-family-mono)', fontSize:'var(--font-size-xs)', minHeight:'100px', resize:'vertical' }}
                value={step.graphql_query_template ?? ''} onChange={e => up('graphql_query_template', e.target.value)}
                placeholder={'{\n  countries {\n    name\n  }\n}'}/>
            </div>
          )}

          {/* AI Transform */}
          {step.kind === 'ai_transform' && (
            <div style={{ marginBottom:'16px' }}>
              <label style={lbl}>AI Prompt Template</label>
              <textarea style={{ ...inp, fontFamily:'var(--font-family-mono)', fontSize:'var(--font-size-xs)', minHeight:'100px', resize:'vertical' }}
                value={step.ai_prompt_template ?? ''} onChange={e => up('ai_prompt_template', e.target.value)}
                placeholder="Analyze the customer data and return a risk score as JSON..."/>
            </div>
          )}

          {/* Prompt Run */}
          {step.kind === 'prompt_run' && (
            <div style={{ marginBottom:'16px' }}>
              <label style={lbl}>Prompt Template</label>
              <textarea style={{ ...inp, fontFamily:'var(--font-family-mono)', fontSize:'var(--font-size-xs)', minHeight:'100px', resize:'vertical' }}
                value={step.ai_prompt_template ?? ''} onChange={e => up('ai_prompt_template', e.target.value)}
                placeholder="Summarize the validation results and decide next action..."/>
            </div>
          )}

          {/* Document Generate */}
          {step.kind === 'document_generate' && (
            <div style={{ marginBottom:'16px' }}>
              <label style={lbl}>Template ID</label>
              <input style={{ ...inp, fontFamily:'var(--font-family-mono)' }}
                value={(step.input_bindings_json as Record<string,string>)?.template_id ?? ''}
                onChange={e => up('input_bindings_json', { ...(step.input_bindings_json ?? {}), template_id: e.target.value })}
                placeholder="loan_noc"/>
            </div>
          )}

          {/* Webhook */}
          {step.kind === 'webhook' && (
            <div style={{ marginBottom:'16px' }}>
              <div style={{ display:'grid', gridTemplateColumns:'120px 1fr', gap:'12px' }}>
                <div>
                  <label style={lbl}>Method</label>
                  <select style={inp} value={step.method ?? 'POST'} onChange={e => up('method', e.target.value)}>
                    {['POST','PUT','PATCH'].map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Webhook URL</label>
                  <input style={{ ...inp, fontFamily:'var(--font-family-mono)' }} value={step.path_template ?? ''}
                    onChange={e => up('path_template', e.target.value)} placeholder="https://hook.example.com/..."/>
                </div>
              </div>
            </div>
          )}

          {/* EIVS info cards */}
          {step.kind === 'intent_classify' && (
            <div style={{ background:'var(--color-status-warning-bg)', border:'1px solid var(--color-status-warning-border)', borderRadius:'10px', padding:'12px 14px', marginBottom:'16px' }}>
              <p style={{ fontSize:'var(--font-size-xs)', fontWeight:'var(--font-weight-bold)', color:'var(--color-status-warning-text)', marginBottom:'2px' }}>Intent Classification</p>
              <p style={{ fontSize:'var(--font-size-xs)', color:'var(--color-status-warning-text)' }}>Calls EIVS classify_email. Set source_type in Input Bindings below.</p>
            </div>
          )}
          {step.kind === 'policy_route' && (
            <div style={{ background:'var(--color-status-warning-bg)', border:'1px solid var(--color-status-warning-border)', borderRadius:'10px', padding:'12px 14px', marginBottom:'16px' }}>
              <p style={{ fontSize:'var(--font-size-xs)', fontWeight:'var(--font-weight-bold)', color:'var(--color-status-warning-text)', marginBottom:'8px' }}>Policy Route</p>
              <p style={{ fontSize:'var(--font-size-xs)', color:'var(--color-status-warning-text)', marginBottom:'10px' }}>
                Reads the classification result from an earlier Intent Classify step and decides
                AUTO_PROCESS / MANUAL_REVIEW / REROUTE based on confidence.
              </p>
              <label style={{ ...lbl, color:'var(--color-status-warning-text)' }}>Classify Step *</label>
              {classifyStepOptions.length === 0 ? (
                <p style={{ fontSize:'var(--font-size-xs)', color:'var(--color-status-warning-text)', margin:0 }}>
                  No Intent Classify step exists yet in this plan — add one first, and make sure this step Depends On it.
                </p>
              ) : (
                <select style={{ ...inp, fontFamily:'var(--font-family-mono)' }}
                  value={(bindings.classify_step_key as string) ?? ''}
                  onChange={e => setBinding('classify_step_key', e.target.value)}>
                  <option value="">— Select the Intent Classify step —</option>
                  {classifyStepOptions.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              )}
            </div>
          )}
          {step.kind === 'intent_validate' && (
            <div style={{ background:'var(--color-status-success-bg)', border:'1px solid var(--color-status-success-border)', borderRadius:'10px', padding:'12px 14px', marginBottom:'16px' }}>
              <p style={{ fontSize:'var(--font-size-xs)', fontWeight:'var(--font-weight-bold)', color:'var(--color-status-success-text)', marginBottom:'8px' }}>Intent Validation</p>
              <p style={{ fontSize:'var(--font-size-xs)', color:'var(--color-status-success-text)', marginBottom:'10px' }}>
                Runs the EIVS validation rules configured for the classified intent.
              </p>
              <label style={{ ...lbl, color:'var(--color-status-success-text)' }}>Classify Step *</label>
              {classifyStepOptions.length === 0 ? (
                <p style={{ fontSize:'var(--font-size-xs)', color:'var(--color-status-success-text)', margin:0 }}>
                  No Intent Classify step exists yet in this plan — add one first, and make sure this step Depends On it.
                </p>
              ) : (
                <select style={{ ...inp, fontFamily:'var(--font-family-mono)' }}
                  value={(bindings.classify_step_key as string) ?? ''}
                  onChange={e => setBinding('classify_step_key', e.target.value)}>
                  <option value="">— Select the Intent Classify step —</option>
                  {classifyStepOptions.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              )}
            </div>
          )}
          {step.kind === 'adapter_analyze' && (
            <div style={{ background:'var(--color-accent-50)', border:'1px solid var(--color-accent-100)', borderRadius:'10px', padding:'12px 14px', marginBottom:'16px' }}>
              <p style={{ fontSize:'var(--font-size-xs)', fontWeight:'var(--font-weight-bold)', color:'var(--color-accent-700)', marginBottom:'2px' }}>Adapter Analyze</p>
              <p style={{ fontSize:'var(--font-size-xs)', color:'var(--color-accent-700)' }}>Set operation (email_validation_analyze or email_search_analyze) in Input Bindings.</p>
            </div>
          )}
          {step.kind === 'human_review' && (
            <div style={{ background:'var(--color-status-error-bg)', border:'1px solid var(--color-status-error-border)', borderRadius:'10px', padding:'12px 14px', marginBottom:'16px' }}>
              <p style={{ fontSize:'var(--font-size-xs)', fontWeight:'var(--font-weight-bold)', color:'var(--color-status-error-text)', marginBottom:'2px' }}>Human Review</p>
              <p style={{ fontSize:'var(--font-size-xs)', color:'var(--color-status-error-text)' }}>Pauses execution and waits for human approval via the Execution Monitor.</p>
            </div>
          )}

          {/* Agent Task — full inspector */}
          {step.kind === 'agent_task' && (
            <div style={{ marginBottom:'16px' }}>
              <AgentTaskInspector
                config={(step.input_bindings_json as Partial<AgentTaskConfig>) ?? {}}
                onChange={bindings => up('input_bindings_json', bindings)}
                errors={{}}
              />
            </div>
          )}

          {/* Input Bindings — shared by kinds without a dedicated UI for their bindings */}
          {step.kind !== 'agent_task' && step.kind !== 'policy_route' && step.kind !== 'intent_validate' && (
            <div style={{ marginBottom:'16px' }}>
              <label style={lbl}>Input Bindings (JSON)</label>
              <textarea style={{ ...inp, fontFamily:'var(--font-family-mono)', fontSize:'var(--font-size-xs)', minHeight:'70px', resize:'vertical' }}
                value={step.input_bindings_json ? JSON.stringify(step.input_bindings_json, null, 2) : ''}
                onChange={e => {
                  try { up('input_bindings_json', JSON.parse(e.target.value)); } catch { /* ignore while typing */ }
                }}
                placeholder={'{\n  "source_type": "email"\n}'}/>
            </div>
          )}

          {/* Dependencies */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'16px' }}>
            <div>
              <label style={lbl}>Depends On</label>
              <div style={{ border:'1px solid var(--color-border-soft)', borderRadius:'10px', padding:'10px', minHeight:'48px', background:'var(--color-bg-canvas)' }}>
                {allKeys.filter(k => k !== step.step_key).length === 0
                  ? <p style={{ color:'var(--color-text-soft)', fontSize:'var(--font-size-xs)', margin:0 }}>No other steps</p>
                  : allKeys.filter(k => k !== step.step_key).map(k => (
                    <label key={k} style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'13px', color:'var(--color-text-base)', cursor:'pointer', marginBottom:'4px' }}>
                      <input type="checkbox"
                        checked={(step.depends_on ?? []).includes(k)}
                        onChange={e => {
                          const cur = step.depends_on ?? [];
                          up('depends_on', e.target.checked ? [...cur, k] : cur.filter(x => x !== k));
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
                value={step.condition_expr ?? ''} onChange={e => up('condition_expr', e.target.value)}
                placeholder="results.route_policy.routing_decision == 'AUTO_PROCESS'"/>
            </div>
          </div>

          {/* Timeout */}
          <div>
            <label style={lbl}>Timeout (ms)</label>
            <input style={{ ...inp, maxWidth:'200px' }} type="number" min={100} value={step.timeout_ms ?? 5000}
              onChange={e => up('timeout_ms', parseInt(e.target.value))}/>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EditPlanPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading]     = useState(false);
  const [fetching, setFetching]   = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [originalPlan, setOriginalPlan] = useState<PlanResponse | null>(null);
  const [form, setForm] = useState<PlanCreate>({
    name:'', entity_type:'', description:'', tenant_id:'',
    error_policy:'best_effort', max_concurrency:8, steps:[],
  });

  useEffect(() => {
    listPlans()
      .then(plans => {
        const found = plans.find(p => p.plan_id === id);
        if (!found) throw new Error('Plan not found');
        setOriginalPlan(found);
        setForm({
          name:            found.name,
          entity_type:     found.entity_type,
          description:     found.description ?? '',
          tenant_id:       found.tenant_id ?? '',
          error_policy:    found.error_policy,
          max_concurrency: found.max_concurrency,
          steps:           found.steps ?? [],
        });
      })
      .catch(e => setError(e.message))
      .finally(() => setFetching(false));
  }, [id]);

  function upForm<K extends keyof PlanCreate>(k: K, v: PlanCreate[K]) {
    setForm(f => ({ ...f, [k]: v }));
    setFieldErrors(e => { const n = { ...e }; delete n[k as string]; return n; });
  }

  function addStep() {
    const s: PlanStepCreate = {
      step_key: `step_${(form.steps ?? []).length + 1}`,
      step_order: (form.steps ?? []).length + 1,
      kind: 'sql', datasource_name: '', enabled: true,
      timeout_ms: 5000, depends_on: [],
    };
    upForm('steps', [...(form.steps ?? []), s]);
  }

  function updateStep(i: number, s: PlanStepCreate) {
    const next = [...(form.steps ?? [])]; next[i] = s; upForm('steps', next);
  }

  function deleteStep(i: number) {
    upForm('steps', (form.steps ?? []).filter((_, idx) => idx !== i));
  }

  function moveUp(i: number) {
    const s = [...(form.steps ?? [])];
    if (i === 0) return;
    [s[i-1], s[i]] = [s[i], s[i-1]];
    upForm('steps', s.map((x, idx) => ({ ...x, step_order: idx + 1 })));
  }

  function moveDown(i: number) {
    const s = [...(form.steps ?? [])];
    if (i === s.length - 1) return;
    [s[i], s[i+1]] = [s[i+1], s[i]];
    upForm('steps', s.map((x, idx) => ({ ...x, step_order: idx + 1 })));
  }

  function validate() {
    const e: Record<string,string> = {};
    if (!form.name?.trim()) e.name = 'Plan name is required';
    else if (!/^[a-z0-9_]+$/.test(form.name)) e.name = 'Lowercase letters, numbers, underscores only';
    if (!form.entity_type?.trim()) e.entity_type = 'Entity type is required';
    const keys = (form.steps ?? []).map(s => s.step_key);
    if (keys.some(k => !k)) e.steps = 'All steps must have a key';
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dupes.length) e.steps = `Duplicate step keys: ${dupes.join(', ')}`;
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      setError(`Cannot save — please fix: ${Object.values(errs).join('; ')}`);
      return;
    }
    setLoading(true); setError(null);
    try {
      await updatePlan(id!, form);
      navigate(`/plans/${id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update plan');
    } finally { setLoading(false); }
  }

  const allKeys = (form.steps ?? []).map(s => s.step_key).filter(Boolean);

  if (fetching) return (
    <div style={{ display:'flex', justifyContent:'center', padding:'80px' }}>
      <div style={{ width:'32px', height:'32px', border:'3px solid var(--color-border-soft)', borderTopColor:'var(--color-primary-800)', borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
      <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
    </div>
  );

  if (error && !originalPlan) return (
    <div style={{ padding:'32px' }}>
      <div style={{ background:'var(--color-status-error-bg)', border:'1px solid var(--color-status-error-border)', borderRadius:'12px', padding:'16px', color:'var(--color-status-error-text)' }}>⚠ {error}</div>
    </div>
  );

  return (
    <div style={{ padding:'32px', maxWidth:'900px' }}>
      <Link to={`/plans/${id}`} style={{ display:'inline-flex', alignItems:'center', gap:'6px', fontSize:'var(--font-size-sm)', color:'var(--color-text-muted)', textDecoration:'none', marginBottom:'24px' }}>
        ← Back to Plan
      </Link>

      <div style={{ marginBottom:'20px' }}>
        <h1 style={{ fontSize:'var(--font-size-xl)', fontWeight:'var(--font-weight-bold)', color:'var(--color-text-strong)' }}>Edit Plan</h1>
        <p style={{ color:'var(--color-text-muted)', fontSize:'var(--font-size-sm)', marginTop:'4px', fontFamily:'var(--font-family-mono)' }}>{originalPlan?.name}</p>
      </div>

      {error && (
        <div style={{ background:'var(--color-status-error-bg)', border:'1px solid var(--color-status-error-border)', borderRadius:'12px', padding:'14px 16px', color:'var(--color-status-error-text)', fontSize:'var(--font-size-sm)', marginBottom:'20px', display:'flex', justifyContent:'space-between' }}>
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--color-status-error-text)' }}>✕</button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={card}>
          <h2 style={{ fontSize:'var(--font-size-md)', fontWeight:'var(--font-weight-bold)', color:'var(--color-text-strong)', marginBottom:'20px', paddingBottom:'12px', borderBottom:'1px solid var(--color-bg-muted)' }}>
            Plan Configuration
          </h2>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px', marginBottom:'16px' }}>
            <div>
              <label style={lbl}>Plan Name *</label>
              <input style={{ ...inp, ...(fieldErrors.name ? { borderColor:'var(--color-status-error-border)' } : {}) }}
                value={form.name} onChange={e => upForm('name', e.target.value.replace(/\s/g,'_').toLowerCase())}
                placeholder="customer_360_collections"/>
              {fieldErrors.name
                ? <p style={{ color:'var(--color-status-error-text)', fontSize:'var(--font-size-xs)', marginTop:'4px' }}>{fieldErrors.name}</p>
                : <p style={{ color:'var(--color-text-soft)', fontSize:'var(--font-size-xs)', marginTop:'4px' }}>lowercase_with_underscores only</p>}
            </div>
            <div>
              <label style={lbl}>Entity Type *</label>
              <input style={{ ...inp, ...(fieldErrors.entity_type ? { borderColor:'var(--color-status-error-border)' } : {}) }}
                value={form.entity_type} onChange={e => upForm('entity_type', e.target.value)}
                placeholder="customer" list="entity-list"/>
              <datalist id="entity-list">
                {['customer','account','loan','merchant','policy','claim','email'].map(e => <option key={e} value={e}/>)}
              </datalist>
              {fieldErrors.entity_type && <p style={{ color:'var(--color-status-error-text)', fontSize:'var(--font-size-xs)', marginTop:'4px' }}>{fieldErrors.entity_type}</p>}
            </div>
          </div>
          <div style={{ marginBottom:'16px' }}>
            <label style={lbl}>Description</label>
            <textarea style={{ ...inp, minHeight:'80px', resize:'vertical' }}
              value={form.description} onChange={e => upForm('description', e.target.value)}
              placeholder="What does this plan do?"/>
          </div>
          <div style={{ marginBottom:'20px' }}>
            <label style={lbl}>Tenant ID</label>
            <input style={{ ...inp, fontFamily:'var(--font-family-mono)' }} value={form.tenant_id ?? ''}
              onChange={e => upForm('tenant_id', e.target.value || undefined)}
              placeholder="Leave blank for global plan"/>
          </div>
          <div>
            <label style={lbl}>Error Policy</label>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px' }}>
              {POLICIES.map(p => (
                <button key={p.value} type="button" onClick={() => upForm('error_policy', p.value)}
                  style={{ textAlign:'left', padding:'14px 16px', borderRadius:'12px', cursor:'pointer',
                    border: form.error_policy === p.value ? '2px solid var(--color-primary-800)' : '2px solid var(--color-border-soft)',
                    background: form.error_policy === p.value ? 'var(--color-primary-50)' : 'var(--color-bg-surface)', transition:'all 0.15s' }}>
                  <div style={{ fontWeight:'var(--font-weight-semibold)', fontSize:'13px', color: form.error_policy === p.value ? 'var(--color-primary-800)':'var(--color-text-base)', marginBottom:'4px' }}>{p.label}</div>
                  <div style={{ fontSize:'var(--font-size-xs)', color:'var(--color-text-muted)' }}>{p.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={card}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
            <div>
              <h2 style={{ fontSize:'var(--font-size-md)', fontWeight:'var(--font-weight-bold)', color:'var(--color-text-strong)', margin:0 }}>Plan Steps</h2>
              <p style={{ fontSize:'var(--font-size-xs)', color:'var(--color-text-soft)', marginTop:'2px' }}>{(form.steps ?? []).length} step(s)</p>
            </div>
            <button type="button" onClick={addStep}
              style={{ display:'flex', alignItems:'center', gap:'6px', background:'var(--color-bg-surface)', border:'1px solid var(--color-border-base)', borderRadius:'8px', padding:'8px 14px', fontSize:'13px', fontWeight:'var(--font-weight-medium)', color:'var(--color-text-base)', cursor:'pointer' }}>
              + Add Step
            </button>
          </div>
          {(form.steps ?? []).length === 0 ? (
            <div style={{ textAlign:'center', padding:'40px', border:'2px dashed var(--color-border-soft)', borderRadius:'12px' }}>
              <p style={{ color:'var(--color-text-soft)', fontSize:'var(--font-size-sm)', marginBottom:'12px' }}>No steps. Add your first step.</p>
              <button type="button" onClick={addStep}
                style={{ background:'var(--color-primary-800)', color:'var(--color-bg-surface)', border:'none', borderRadius:'8px', padding:'10px 20px', fontSize:'13px', fontWeight:'var(--font-weight-medium)', cursor:'pointer' }}>
                + Add First Step
              </button>
            </div>
          ) : (
            <>
              {(form.steps ?? []).map((step, i) => (
                <StepCard key={i} step={step} index={i} allKeys={allKeys} allSteps={form.steps ?? []}
                  onUpdate={s => updateStep(i, s)} onDelete={() => deleteStep(i)}
                  onMoveUp={() => moveUp(i)} onMoveDown={() => moveDown(i)}
                  isFirst={i === 0} isLast={i === (form.steps ?? []).length - 1}/>
              ))}
              <button type="button" onClick={addStep}
                style={{ width:'100%', padding:'10px', border:'2px dashed var(--color-border-soft)', borderRadius:'10px', background:'none', cursor:'pointer', color:'var(--color-text-soft)', fontSize:'13px', marginTop:'8px' }}>
                + Add Another Step
              </button>
            </>
          )}
          {fieldErrors.steps && <p style={{ color:'var(--color-status-error-text)', fontSize:'var(--font-size-xs)', marginTop:'8px' }}>{fieldErrors.steps}</p>}
        </div>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Link to={`/plans/${id}`}
            style={{ padding:'10px 20px', borderRadius:'10px', border:'1px solid var(--color-border-base)', background:'var(--color-bg-surface)', color:'var(--color-text-base)', fontSize:'var(--font-size-sm)', fontWeight:'var(--font-weight-medium)', textDecoration:'none' }}>
            Cancel
          </Link>
          <button type="submit" disabled={loading}
            style={{ display:'flex', alignItems:'center', gap:'8px', background:'var(--color-primary-800)', color:'var(--color-bg-surface)', border:'none', borderRadius:'10px', padding:'12px 24px', fontSize:'var(--font-size-sm)', fontWeight:'var(--font-weight-semibold)', cursor: loading ? 'not-allowed':'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Saving…' : '💾  Save Changes'}
          </button>
        </div>
      </form>
      <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}