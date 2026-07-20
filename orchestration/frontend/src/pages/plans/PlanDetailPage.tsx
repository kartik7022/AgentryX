// src/pages/plans/PlanDetailPage.tsx
import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { listPlans, deletePlan, deactivatePlan, clonePlan } from '../../services/api';
import type { PlanResponse, PlanStepCreate, StepKind } from '../../types';
import { PlanDetailSkeleton } from '../../components/ui/Skeletons';

const card: React.CSSProperties = {
  background: 'var(--color-bg-surface)', borderRadius: '16px',
  border: '1px solid var(--color-border-soft)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
};
const badge = (bg: string, color: string, border: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: '5px',
  padding: '3px 10px', borderRadius: '999px', fontSize: 'var(--font-size-xs)',
  fontWeight: 'var(--font-weight-semibold)', background: bg, color, border: `1px solid ${border}`,
});

const kindMeta: Record<StepKind, { bg: string; color: string; border: string; label: string }> = {
  sql:               { bg: 'var(--color-status-info-bg)', color: 'var(--color-status-info-text)', border: 'var(--color-primary-200)', label: 'SQL' },
  rest:              { bg: 'var(--color-status-success-bg)', color: 'var(--color-status-success-text)', border: 'var(--color-status-success-border)', label: 'REST' },
  graphql:           { bg: 'var(--color-primary-50)', color: 'var(--color-primary-800)', border: 'var(--color-primary-200)', label: 'GraphQL' },
  ai_transform:      { bg: 'var(--color-primary-50)', color: 'var(--color-primary-800)', border: 'var(--color-primary-100)', label: 'AI Transform' },
  intent_classify:   { bg: 'var(--color-status-warning-bg)', color: 'var(--color-status-warning-text)', border: 'var(--color-status-warning-border)', label: 'Intent Classify' },
  policy_route:      { bg: 'var(--color-status-warning-bg)', color: 'var(--color-status-warning-text)', border: 'var(--color-status-warning-border)', label: 'Policy Route' },
  intent_validate:   { bg: 'var(--color-status-success-bg)', color: 'var(--color-status-success-text)', border: 'var(--color-status-success-border)', label: 'Intent Validate' },
  adapter_analyze:   { bg: 'var(--color-accent-50)', color: 'var(--color-accent-700)', border: 'var(--color-accent-100)', label: 'Adapter Analyze' },
  prompt_run:        { bg: 'var(--color-primary-50)', color: 'var(--color-primary-800)', border: 'var(--color-primary-200)', label: 'Prompt Run' },
  document_generate: { bg: 'var(--color-bg-canvas)', color: 'var(--color-text-base)', border: 'var(--color-border-base)', label: 'Doc Generate' },
  human_review:      { bg: 'var(--color-status-error-bg)', color: 'var(--color-status-error-text)', border: 'var(--color-status-error-border)', label: 'Human Review' },
  webhook:           { bg: 'var(--color-status-info-bg)', color: 'var(--color-status-info-text)', border: 'var(--color-status-info-border)', label: 'Webhook' },
  agent_task: { label: 'Agent Task', bg: 'var(--color-primary-50)', color: 'var(--color-primary-800)', border: 'var(--color-primary-200)' },
};

const policyColors: Record<string, [string, string, string]> = {
  best_effort:    ['var(--color-status-info-bg)', 'var(--color-status-info-text)', 'var(--color-status-info-border)'],
  fail_fast:      ['var(--color-status-error-bg)', 'var(--color-status-error-text)', 'var(--color-status-error-border)'],
  dependent_fail: ['var(--color-status-warning-bg)', 'var(--color-status-warning-text)', 'var(--color-status-warning-border)'],
};

function CodeBlock({ label, code, lang }: { label: string; code: string; lang: string }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{label}</p>
      <div style={{ border: '1px solid var(--color-border-soft)', borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ background: 'var(--color-bg-muted)', borderBottom: '1px solid var(--color-border-soft)', padding: '6px 14px', fontSize: '11px', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{lang}</div>
        <pre style={{ padding: '14px', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-base)', overflow: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0 }}>{code}</pre>
      </div>
    </div>
  );
}

function JsonBlock({ label, data }: { label: string; data: unknown }) {
  return <CodeBlock label={label} code={JSON.stringify(data, null, 2)} lang="JSON" />;
}

function StepRow({ step, index }: { step: PlanStepCreate; index: number }) {
  const [open, setOpen] = useState(false);
  const meta = kindMeta[step.kind] ?? { bg: 'var(--color-bg-muted)', color: 'var(--color-text-base)', border: 'var(--color-border-soft)', label: step.kind };

  return (
    <div style={{ border: '1px solid var(--color-border-soft)', borderRadius: '12px', overflow: 'hidden', marginBottom: '8px' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px', background: 'var(--color-bg-canvas)', cursor: 'pointer' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-muted)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-bg-canvas)')}
      >
        <span style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'var(--color-border-soft)', color: 'var(--color-text-muted)', fontSize: '11px', fontWeight: 'var(--font-weight-bold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {index + 1}
        </span>
        <span style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`, padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 'var(--font-weight-bold)', flexShrink: 0 }}>
          {meta.label}
        </span>
        <span style={{ fontFamily: 'var(--font-family-mono)', fontWeight: 'var(--font-weight-bold)', fontSize: '13px', color: 'var(--color-text-strong)', flex: 1 }}>
          {step.step_key}
        </span>
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-soft)', fontFamily: 'var(--font-family-mono)' }}>{step.datasource_name}</span>
        {(step.depends_on?.length ?? 0) > 0 && (
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', background: 'var(--color-bg-muted)', padding: '2px 8px', borderRadius: '6px' }}>
            deps: {step.depends_on?.join(', ')}
          </span>
        )}
        <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: step.enabled ? 'var(--color-status-success-text)' : 'var(--color-text-soft)' }}>
          {step.enabled ? '● Enabled' : '○ Disabled'}
        </span>
        <span style={{ color: 'var(--color-text-soft)', fontSize: 'var(--font-size-xs)', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
      </div>

      {open && (
        <div style={{ padding: '20px', background: 'var(--color-bg-surface)', borderTop: '1px solid var(--color-bg-muted)' }}>

          {/* Meta row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            {[
              ['Timeout', `${step.timeout_ms ?? 5000}ms`],
              ['Step Order', String(step.step_order)],
              ['Datasource', step.datasource_name],
            ].map(([l, v]) => (
              <div key={l} style={{ background: 'var(--color-bg-canvas)', borderRadius: '10px', border: '1px solid var(--color-border-soft)', padding: '12px' }}>
                <p style={{ fontSize: '11px', color: 'var(--color-text-soft)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 'var(--font-weight-semibold)' }}>{l}</p>
                <p style={{ fontFamily: 'var(--font-family-mono)', fontSize: '13px', color: 'var(--color-text-strong)', fontWeight: 'var(--font-weight-semibold)' }}>{v}</p>
              </div>
            ))}
          </div>

          {/* SQL */}
          {step.kind === 'sql' && step.sql_template && (
            <CodeBlock label="SQL Template" code={step.sql_template} lang="SQL" />
          )}

          {/* REST */}
          {step.kind === 'rest' && step.path_template && (
            <div style={{ marginBottom: '12px' }}>
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Endpoint</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--color-bg-canvas)', border: '1px solid var(--color-border-soft)', borderRadius: '10px', padding: '12px 14px' }}>
                <span style={{ background: 'var(--color-status-success-bg)', color: 'var(--color-status-success-text)', border: '1px solid var(--color-status-success-border)', padding: '2px 10px', borderRadius: '6px', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)' }}>{step.method ?? 'GET'}</span>
                <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: '13px', color: 'var(--color-text-base)' }}>{step.path_template}</span>
              </div>
{step.body_json != null && <JsonBlock label="Request Body" data={step.body_json} />}            </div>
          )}

          {/* GraphQL */}
          {step.kind === 'graphql' && step.graphql_query_template && (
            <CodeBlock label="GraphQL Query" code={step.graphql_query_template} lang="GraphQL" />
          )}

          {/* AI Transform */}
          {step.kind === 'ai_transform' && step.ai_prompt_template && (
            <CodeBlock label="AI Prompt" code={step.ai_prompt_template} lang="Prompt" />
          )}

          {/* Intent Classify */}
          {step.kind === 'intent_classify' && (
            <div style={{ background: 'var(--color-status-warning-bg)', border: '1px solid var(--color-status-warning-border)', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
              <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-status-warning-text)', marginBottom: '4px' }}>Intent Classification Step</p>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-status-warning-text)' }}>Calls EIVS classify_email — classifies email intent and determines routing decision (AUTO_PROCESS / MANUAL_REVIEW / REROUTE).</p>
            </div>
          )}

          {/* Policy Route */}
          {step.kind === 'policy_route' && (
            <div style={{ background: 'var(--color-status-warning-bg)', border: '1px solid var(--color-status-warning-border)', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
              <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-status-warning-text)', marginBottom: '4px' }}>Policy Routing Step</p>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-status-warning-text)' }}>Reads routing_decision from the prior intent_classify step. Gates downstream steps via condition_expr.</p>
            </div>
          )}

          {/* Intent Validate */}
          {step.kind === 'intent_validate' && (
            <div style={{ background: 'var(--color-status-success-bg)', border: '1px solid var(--color-status-success-border)', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
              <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-status-success-text)', marginBottom: '4px' }}>Intent Validation Step</p>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-status-success-text)' }}>Runs EIVS ValidationOrchestrator — executes all validation rules (email match, loan account, loan status) and returns overall_status (SUCCESS / FAILED / PARTIAL).</p>
            </div>
          )}

          {/* Adapter Analyze */}
          {step.kind === 'adapter_analyze' && (
            <div style={{ background: 'var(--color-accent-50)', border: '1px solid var(--color-accent-100)', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
              <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-accent-700)', marginBottom: '4px' }}>Adapter Analyze Step</p>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-accent-700)' }}>Calls the Adapter service for safe, governed data access — queries the datasource and returns datasource_result, sql_executed, sgate_decision.</p>
            </div>
          )}

          {/* Prompt Run */}
          {step.kind === 'prompt_run' && (
            <>
              {step.ai_prompt_template && (
                <CodeBlock label="Prompt Template" code={step.ai_prompt_template} lang="Prompt" />
              )}
              {step.ai_output_schema && (
                <JsonBlock label="Output Schema" data={step.ai_output_schema} />
              )}
            </>
          )}

          {/* Document Generate */}
          {step.kind === 'document_generate' && (
            <div style={{ background: 'var(--color-bg-canvas)', border: '1px solid var(--color-border-soft)', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
              <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-base)', marginBottom: '4px' }}>Document Generation Step</p>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>Renders a document template using placeholder values resolved from prior step results and runtime params.</p>
              {step.input_bindings_json?.template_id && (
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-strong)', fontFamily: 'var(--font-family-mono)', marginTop: '8px' }}>
                  Template: <strong>{step.input_bindings_json.template_id}</strong>
                </p>
              )}
            </div>
          )}

          {/* Human Review */}
          {step.kind === 'human_review' && (
            <div style={{ background: 'var(--color-status-error-bg)', border: '1px solid var(--color-status-error-border)', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
              <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-status-error-text)', marginBottom: '4px' }}>Human Review Step</p>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-status-error-text)' }}>Pauses execution and waits for a human to approve or reject via the Execution Monitor UI or the approval API.</p>
            </div>
          )}

          {/* Webhook */}
          {step.kind === 'webhook' && step.path_template && (
            <div style={{ marginBottom: '12px' }}>
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Webhook URL</p>
              <code style={{ display: 'block', background: 'var(--color-status-info-bg)', border: '1px solid var(--color-status-info-border)', borderRadius: '8px', padding: '10px 14px', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--color-status-info-text)' }}>
                {step.method ?? 'POST'} {step.path_template}
              </code>
            </div>
          )}

          {/* Condition */}
          {step.condition_expr && (
            <div style={{ marginBottom: '12px' }}>
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Condition</p>
              <code style={{ display: 'block', background: 'var(--color-status-warning-bg)', border: '1px solid var(--color-status-warning-border)', borderRadius: '8px', padding: '10px 14px', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--color-status-warning-text)' }}>
                {step.condition_expr}
              </code>
            </div>
          )}

          {/* Input Bindings */}
          {step.input_bindings_json && Object.keys(step.input_bindings_json).length > 0 && (
            <JsonBlock label="Input Bindings" data={step.input_bindings_json} />
          )}
        </div>
      )}
    </div>
  );
}

export default function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [plan, setPlan]                 = useState<PlanResponse | null>(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [successMsg, setSuccessMsg]     = useState<string | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [cloning, setCloning]           = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCloneModal, setShowCloneModal]       = useState(false);
  const [cloneName, setCloneName]       = useState('');
  const [cloneError, setCloneError]     = useState('');

  useEffect(() => {
    listPlans()
      .then(plans => {
        const found = plans.find(p => p.plan_id === id);
        if (!found) throw new Error('Plan not found');
        setPlan(found);
        setCloneName(`${found.name}_copy`);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDeactivate() {
    if (!plan) return;
    setDeactivating(true);
    try {
      await deactivatePlan(plan.plan_id);
      setPlan(p => p ? { ...p, is_active: false } : p);
      setSuccessMsg('Plan deactivated successfully.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate');
    } finally { setDeactivating(false); }
  }

  async function handleDelete() {
    if (!plan) return;
    setDeleting(true);
    try {
      await deletePlan(plan.plan_id);
      navigate('/plans');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  async function handleClone() {
    if (!plan) return;
    if (!cloneName.trim()) { setCloneError('Name is required'); return; }
    if (!/^[a-z0-9_]+$/.test(cloneName)) { setCloneError('Lowercase letters, numbers, underscores only'); return; }
    setCloning(true);
    setCloneError('');
    try {
      const cloned = await clonePlan(plan.plan_id, cloneName);
      setShowCloneModal(false);
      navigate(`/plans/${cloned.plan_id}`);
    } catch (err: unknown) {
      setCloneError(err instanceof Error ? err.message : 'Failed to clone');
    } finally { setCloning(false); }
  }

  if (loading) return <PlanDetailSkeleton />;
  if (error && !plan) return (
    <div style={{ padding: '32px' }}>
      <div style={{ background: 'var(--color-status-error-bg)', border: '1px solid var(--color-status-error-border)', borderRadius: '12px', padding: '16px', color: 'var(--color-status-error-text)' }}>⚠ {error}</div>
    </div>
  );
  if (!plan) return null;

  const steps = plan.steps ?? [];
  const [pb, pc, pbr] = policyColors[plan.error_policy] ?? ['var(--color-bg-canvas)', 'var(--color-text-muted)', 'var(--color-border-soft)'];

  return (
    <div style={{ padding: '32px' }}>

      {/* Delete Confirm Modal */}
      {showDeleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)' }} onClick={() => setShowDeleteConfirm(false)} />
          <div style={{ position: 'relative', background: 'var(--color-bg-surface)', borderRadius: '16px', border: '1px solid var(--color-border-soft)', boxShadow: '0 20px 60px rgba(0,0,0,0.15)', padding: '28px', maxWidth: '420px', width: '100%' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--color-status-error-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--font-size-lg)', marginBottom: '16px' }}>🗑</div>
            <h3 style={{ fontSize: '17px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', marginBottom: '8px' }}>Delete this plan?</h3>
            <p style={{ fontFamily: 'var(--font-family-mono)', fontSize: '13px', color: 'var(--color-status-error-text)', background: 'var(--color-status-error-bg)', padding: '8px 12px', borderRadius: '8px', marginBottom: '20px' }}>{plan.name}</p>
            <p style={{ fontSize: '13px', color: 'var(--color-text-soft)', marginBottom: '24px' }}>This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowDeleteConfirm(false)} style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid var(--color-border-base)', background: 'var(--color-bg-surface)', color: 'var(--color-text-base)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting} style={{ padding: '10px 18px', borderRadius: '10px', border: 'none', background: 'var(--color-status-error-text)', color: 'var(--color-bg-surface)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1 }}>
                {deleting ? 'Deleting…' : 'Yes, Delete Plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clone Modal */}
      {showCloneModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)' }} onClick={() => setShowCloneModal(false)} />
          <div style={{ position: 'relative', background: 'var(--color-bg-surface)', borderRadius: '16px', border: '1px solid var(--color-border-soft)', boxShadow: '0 20px 60px rgba(0,0,0,0.15)', padding: '28px', maxWidth: '420px', width: '100%' }}>
            <h3 style={{ fontSize: '17px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', marginBottom: '20px' }}>Clone Plan</h3>
            <input
              value={cloneName}
              onChange={e => { setCloneName(e.target.value.replace(/\s/g, '_').toLowerCase()); setCloneError(''); }}
              style={{ width: '100%', border: `1px solid ${cloneError ? 'var(--color-status-error-border)' : 'var(--color-border-base)'}`, borderRadius: '10px', padding: '10px 14px', fontSize: 'var(--font-size-sm)', fontFamily: 'var(--font-family-mono)', boxSizing: 'border-box' }}
              placeholder="my_plan_copy"
              autoFocus
            />
            {cloneError && <p style={{ color: 'var(--color-status-error-text)', fontSize: 'var(--font-size-xs)', marginTop: '4px' }}>{cloneError}</p>}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setShowCloneModal(false)} style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid var(--color-border-base)', background: 'var(--color-bg-surface)', color: 'var(--color-text-base)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleClone} disabled={cloning} style={{ padding: '10px 18px', borderRadius: '10px', border: 'none', background: 'var(--color-primary-800)', color: 'var(--color-bg-surface)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', cursor: cloning ? 'not-allowed' : 'pointer', opacity: cloning ? 0.7 : 1 }}>
                {cloning ? 'Cloning…' : '⎘ Clone Plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Link to="/plans" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', textDecoration: 'none', marginBottom: '24px' }}>← Back to Plans</Link>

      {successMsg && (
        <div style={{ background: 'var(--color-status-success-bg)', border: '1px solid var(--color-status-success-border)', borderRadius: '12px', padding: '14px 16px', color: 'var(--color-status-success-text)', fontSize: 'var(--font-size-sm)', marginBottom: '20px', display: 'flex', justifyContent: 'space-between' }}>
          <span>✓ {successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-status-success-text)' }}>✕</button>
        </div>
      )}

      {error && (
        <div style={{ background: 'var(--color-status-error-bg)', border: '1px solid var(--color-status-error-border)', borderRadius: '12px', padding: '14px 16px', color: 'var(--color-status-error-text)', fontSize: 'var(--font-size-sm)', marginBottom: '20px', display: 'flex', justifyContent: 'space-between' }}>
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-status-error-text)' }}>✕</button>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', fontFamily: 'var(--font-family-mono)' }}>{plan.name}</h1>
            <span style={badge(plan.is_active ? 'var(--color-status-success-bg)' : 'var(--color-bg-canvas)', plan.is_active ? 'var(--color-status-success-text)' : 'var(--color-text-muted)', plan.is_active ? 'var(--color-status-success-border)' : 'var(--color-border-soft)')}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: plan.is_active ? 'var(--color-accent-500)' : 'var(--color-text-soft)', display: 'inline-block' }} />
              {plan.is_active ? 'Active' : 'Inactive'}
            </span>
            <span style={badge('var(--color-bg-muted)', 'var(--color-text-muted)', 'var(--color-border-soft)')}>v{plan.version}</span>
          </div>
          {plan.description && <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>{plan.description}</p>}
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {plan.is_active ? (
            <button onClick={handleDeactivate} disabled={deactivating}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--color-status-warning-bg)', color: 'var(--color-status-warning-text)', padding: '9px 14px', borderRadius: '10px', fontWeight: 'var(--font-weight-semibold)', fontSize: '13px', border: '1px solid var(--color-status-warning-border)', cursor: deactivating ? 'not-allowed' : 'pointer', opacity: deactivating ? 0.7 : 1 }}>
              {deactivating ? 'Deactivating…' : '⏸ Deactivate'}
            </button>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--color-bg-canvas)', color: 'var(--color-text-soft)', padding: '9px 14px', borderRadius: '10px', fontSize: '13px', border: '1px solid var(--color-border-soft)' }}>○ Inactive</span>
          )}
          <button onClick={() => setShowCloneModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--color-primary-50)', color: 'var(--color-primary-800)', padding: '9px 14px', borderRadius: '10px', fontWeight: 'var(--font-weight-semibold)', fontSize: '13px', border: '1px solid var(--color-primary-100)', cursor: 'pointer' }}>
            ⎘ Clone
          </button>
          <Link to={`/plans/${plan.plan_id}/edit`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--color-bg-surface)', color: 'var(--color-text-base)', padding: '9px 14px', borderRadius: '10px', fontWeight: 'var(--font-weight-semibold)', fontSize: '13px', textDecoration: 'none', border: '1px solid var(--color-border-base)' }}>
            ✏ Edit
          </Link>
          <Link to={`/plans/${plan.plan_id}/history`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--color-primary-50)', color: 'var(--color-primary-800)', padding: '9px 14px', borderRadius: '10px', fontWeight: 'var(--font-weight-semibold)', fontSize: '13px', textDecoration: 'none', border: '1px solid var(--color-primary-100)' }}>
            📋 History
          </Link>
          <Link to={`/plans/${plan.plan_id}/canvas`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--color-status-success-bg)', color: 'var(--color-status-success-text)', padding: '9px 14px', borderRadius: '10px', fontWeight: 'var(--font-weight-semibold)', fontSize: '13px', textDecoration: 'none', border: '1px solid var(--color-status-success-border)' }}>
            ◈ DAG Canvas
          </Link>
          <Link to={`/execute?plan=${plan.name}&entity=${plan.entity_type}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--color-primary-800)', color: 'var(--color-bg-surface)', padding: '9px 14px', borderRadius: '10px', fontWeight: 'var(--font-weight-semibold)', fontSize: '13px', textDecoration: 'none' }}>
            ▶ Execute
          </Link>
          <button onClick={() => setShowDeleteConfirm(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--color-status-error-bg)', color: 'var(--color-status-error-text)', padding: '9px 14px', borderRadius: '10px', fontWeight: 'var(--font-weight-semibold)', fontSize: '13px', border: '1px solid var(--color-status-error-border)', cursor: 'pointer' }}>
            🗑 Delete
          </button>
        </div>
      </div>

      {/* Meta cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px', marginBottom: '28px' }}>
        {[
          { label: 'Entity Type', value: plan.entity_type, mono: true },
          { label: 'Error Policy', value: plan.error_policy.replace(/_/g, ' '), bg: pb, color: pc, border: pbr },
          { label: 'Max Concurrency', value: String(plan.max_concurrency), mono: false },
          { label: 'Tenant', value: plan.tenant_id ?? 'Global', mono: false },
        ].map(m => (
          <div key={m.label} style={{ ...card, padding: '16px' }}>
            <p style={{ fontSize: '11px', color: 'var(--color-text-soft)', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{m.label}</p>
            {'bg' in m
              ? <span style={badge(m.bg!, m.color!, m.border!)}>{m.value}</span>
              : <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-strong)', fontFamily: m.mono ? 'var(--font-family-mono)' : 'inherit' }}>{m.value}</p>
            }
          </div>
        ))}
      </div>

      {/* Steps */}
      <div style={{ ...card, padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
          <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', margin: 0 }}>Execution Steps</h2>
          <span style={badge('var(--color-primary-50)', 'var(--color-primary-800)', 'var(--color-primary-200)')}>{steps.length} step{steps.length !== 1 ? 's' : ''}</span>
        </div>
        {steps.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', border: '2px dashed var(--color-border-soft)', borderRadius: '12px', color: 'var(--color-text-soft)', fontSize: 'var(--font-size-sm)' }}>
            No steps defined for this plan.
          </div>
        ) : (
          steps.map((step, i) => <StepRow key={step.step_key} step={step} index={i} />)
        )}
      </div>

      {/* Footer */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', paddingTop: '20px', borderTop: '1px solid var(--color-bg-muted)' }}>
        {[
          { label: 'Plan ID', value: plan.plan_id },
          { label: 'Created By', value: plan.created_by ?? '—' },
          { label: 'Created At', value: new Date(plan.created_at).toLocaleString() },
        ].map(m => (
          <div key={m.label}>
            <p style={{ fontSize: '11px', color: 'var(--color-text-soft)', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{m.label}</p>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontFamily: 'var(--font-family-mono)' }}>{m.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}