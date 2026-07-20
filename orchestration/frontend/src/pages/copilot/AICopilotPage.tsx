// src/pages/copilot/AICopilotPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { copilotDesign, copilotLint, createPlan } from '../../services/api';
import type { ErrorPolicy, PlanStepCreate } from '../../types';

const card: React.CSSProperties = {
  background: 'var(--color-bg-surface)', borderRadius: '16px',
  border: '1px solid var(--color-border-soft)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
};
const inp: React.CSSProperties = {
  width: '100%', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-base)',
  borderRadius: '10px', padding: '10px 14px', fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-strong)', fontFamily: 'inherit', boxSizing: 'border-box' as const,
};

const KIND_DESCRIPTIONS = `
Available step kinds:
- sql             : Execute a parameterised SQL query against a registered datasource (CRM_DB, LOAN_CORE_DB, FIN_DB, HEALTH_DB, etc.)
- rest            : Call an external REST API endpoint with method + path template + optional body
- graphql         : Execute a GraphQL query against an endpoint
- ai_transform    : Call an LLM (Groq llama-3.3-70b) with a prompt template; returns structured JSON
- intent_classify : EIVS step — classify email intent using the EIVS classification engine; datasource_name must be "EIVS"
- policy_route    : EIVS step — apply routing policy to classification result (AUTO_PROCESS / MANUAL_REVIEW / REROUTE); datasource_name must be "EIVS"
- intent_validate : EIVS step — run all configured validation rules for the classified intent; datasource_name must be "EIVS"
- adapter_analyze : EIVS step — governed data access via the Adapter service; datasource_name must be "EIVS"
- prompt_run      : Run a structured prompt through the governed Prompt execution engine (Groq); returns validated JSON output
- document_generate: Generate a document from a registered template using placeholder values; datasource_name must be "LLM_SERVICE"
- human_review    : Pause execution and wait for human approval before continuing
- webhook         : Send an HTTP webhook to an external system (e.g. N8N_WEBHOOK, Slack, Teams)
`.trim();

const LINT_RULES = `
Safety lint rules — flag any of these as issues:
1. sql step with no depends_on and no condition_expr when other steps exist — risk of running on stale context
2. ai_transform or prompt_run with no output schema validation — governance gap
3. document_generate with no template_id in input_bindings_json — will fail at runtime
4. intent_validate step with no prior intent_classify step in depends_on — classify must run first
5. policy_route step with no prior intent_classify step in depends_on — classify must run first
6. adapter_analyze step with no datasource_name — required
7. human_review step with no depends_on — should depend on at least one prior step
8. webhook step with no path_template — will fail at runtime
9. rest step with no path_template — will fail at runtime
10. any step with timeout_ms > 60000 — unreasonable timeout, cap at 60000
11. any step with timeout_ms < 500 — dangerously low timeout
12. two steps with identical step_key — duplicate keys break execution
13. depends_on referencing a step_key that does not exist in the plan
14. error_policy "fail_fast" with a human_review step — human review will never resume after abort
15. max_concurrency > 16 — system limit is 16
`.trim();

void LINT_RULES;

const EXAMPLE_PROMPTS = [
  'Process a loan NOC email — classify intent, validate customer and loan, generate NOC letter and send via webhook',
  'Collect customer 360 data from CRM and billing, calculate AI risk score, route to human review if HIGH',
  'Process insurance claim — validate policy, run fraud detection via AI, generate claim decision letter',
  'Verify KYC identity with document validation, AI risk scoring, and compliance webhook notification',
  'Aggregate loan applicant data, run underwriting AI decision, generate approval letter if accepted',
];

const KIND_COLORS: Record<string, [string, string]> = {
  sql:               ['var(--color-status-info-bg)', 'var(--color-status-info-text)'],
  rest:              ['var(--color-status-success-bg)', 'var(--color-status-success-text)'],
  graphql:           ['var(--color-primary-50)', 'var(--color-primary-800)'],
  ai_transform:      ['var(--color-primary-50)', 'var(--color-primary-800)'],
  intent_classify:   ['var(--color-status-warning-bg)', 'var(--color-status-warning-text)'],
  policy_route:      ['var(--color-status-warning-bg)', 'var(--color-status-warning-text)'],
  intent_validate:   ['var(--color-status-success-bg)', 'var(--color-status-success-text)'],
  human_review:      ['var(--color-status-error-bg)', 'var(--color-status-error-text)'],
  webhook:           ['var(--color-status-info-bg)', 'var(--color-status-info-text)'],
  agent_task: ['var(--color-primary-50)', 'var(--color-primary-800)'],
};

const SEVERITY_COLORS: Record<string, [string, string, string]> = {
  error:   ['var(--color-status-error-bg)', 'var(--color-status-error-text)', 'var(--color-status-error-border)'],
  warning: ['var(--color-status-warning-bg)', 'var(--color-status-warning-text)', 'var(--color-status-warning-border)'],
  info:    ['var(--color-status-info-bg)', 'var(--color-status-info-text)', 'var(--color-primary-200)'],
};

type Tab = 'design' | 'lint';

export default function AICopilotPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('design');

  // ── Design tab state ─────────────────────────────────────────────
  const [description, setDescription]     = useState('');
  const [entityType, setEntityType]       = useState('email');
  const [designResult, setDesignResult]   = useState<Record<string, unknown> | null>(null);
  const [designLoading, setDesignLoading] = useState(false);
  const [designError, setDesignError]     = useState('');
  const [savingPlan, setSavingPlan]       = useState(false);
  const [saveSuccess, setSaveSuccess]     = useState('');

  // ── Lint tab state ───────────────────────────────────────────────
  const [lintJson, setLintJson]           = useState('');
  const [lintResult, setLintResult]       = useState<Record<string, unknown> | null>(null);
  const [lintLoading, setLintLoading]     = useState(false);
  const [lintError, setLintError]         = useState('');
  const [lintJsonError, setLintJsonError] = useState('');

  // ── Design handler ───────────────────────────────────────────────
  async function handleDesign() {
    if (!description.trim()) return;
    setDesignLoading(true);
    setDesignError('');
    setDesignResult(null);
    setSaveSuccess('');
    try {
      const result = await copilotDesign({
        description: `${description}\n\n${KIND_DESCRIPTIONS}`,
        entity_type: entityType,
      });
      setDesignResult(result as Record<string, unknown>);
      setLintJson(JSON.stringify((result as Record<string, unknown>).plan, null, 2));
    } catch (err: unknown) {
      setDesignError(err instanceof Error ? err.message : 'Failed to design plan');
    } finally {
      setDesignLoading(false);
    }
  }

  async function handleSavePlan() {
    if (!designResult?.plan) return;
    setSavingPlan(true);
    try {
      const plan = designResult.plan as Record<string, unknown>;
      const created = await createPlan({
        name:            String(plan.name),
        entity_type:     String(plan.entity_type),
        description:     String(plan.description || ''),
        error_policy:    String(plan.error_policy || 'best_effort') as ErrorPolicy,
        max_concurrency: Number(plan.max_concurrency || 8),
        steps:           ((plan.steps as unknown[]) || []) as PlanStepCreate[],
      });
      setSaveSuccess(`Plan "${created.name}" created!`);
      setTimeout(() => navigate(`/plans/${created.plan_id}`), 1500);
    } catch (err: unknown) {
      setDesignError(err instanceof Error ? err.message : 'Failed to save plan');
    } finally {
      setSavingPlan(false);
    }
  }

  // ── Lint handler ─────────────────────────────────────────────────
  async function handleLint() {
    setLintJsonError('');
    setLintError('');
    setLintResult(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(lintJson);
    } catch {
      setLintJsonError('Invalid JSON — fix the syntax and try again');
      return;
    }
    setLintLoading(true);
    try {
      const result = await copilotLint({ plan: parsed as Record<string, unknown> });
      setLintResult(result as unknown as Record<string, unknown>);
    } catch (err: unknown) {
      setLintError(err instanceof Error ? err.message : 'Lint check failed');
    } finally {
      setLintLoading(false);
    }
  }

  function handleLintJsonChange(val: string) {
    setLintJson(val);
    setLintJsonError('');
    setLintResult(null);
  }

  return (
    <div style={{ padding: '32px' }}>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'var(--color-primary-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--font-size-lg)' }}>✨</div>
          <h1 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)' }}>AI Copilot</h1>
        </div>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
          Design orchestration plans from natural language. Safety-lint any plan before deploying.
        </p>
      </div>

     
      {/* ── DESIGN TAB ── */}
      {tab === 'design' && (
        <div>
          <div style={{ ...card, padding: '24px', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', marginBottom: '16px' }}>Describe Your Workflow</h2>

            <div style={{ marginBottom: '14px' }}>
              <p style={{ fontSize: '11px', color: 'var(--color-text-soft)', marginBottom: '8px', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Example Prompts</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {EXAMPLE_PROMPTS.map(p => (
                  <button key={p} onClick={() => setDescription(p)}
                    style={{ padding: '5px 12px', borderRadius: '999px', border: '1px solid var(--color-border-soft)', background: description === p ? 'var(--color-primary-50)' : 'var(--color-bg-canvas)', color: description === p ? 'var(--color-primary-800)' : 'var(--color-text-base)', fontSize: 'var(--font-size-xs)', cursor: 'pointer' }}>
                    {p.length > 60 ? p.slice(0, 60) + '…' : p}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              style={{ ...inp, minHeight: '100px', resize: 'vertical', marginBottom: '14px' }}
              placeholder="Describe what your orchestration plan should do. Be specific about the data sources, AI steps, and any EIVS email classification or validation steps needed."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />

            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 'var(--font-weight-semibold)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Entity Type</label>
                <select style={{ ...inp, width: 'auto' }} value={entityType} onChange={e => setEntityType(e.target.value)}>
                  {['email', 'customer', 'applicant', 'claim', 'patient', 'employee', 'loan', 'policy'].map(e => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleDesign}
                disabled={designLoading || !description.trim()}
                style={{ padding: '10px 24px', borderRadius: '10px', border: 'none', background: designLoading || !description.trim() ? 'var(--color-primary-200)' : 'var(--color-primary-800)', color: 'var(--color-bg-surface)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', cursor: designLoading || !description.trim() ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', opacity: !description.trim() ? 0.6 : 1 }}>
                {designLoading
                  ? <><span style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'var(--color-bg-surface)', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} /> Designing…</>
                  : '✨ Generate Plan'}
              </button>
            </div>

            {designError && (
              <div style={{ background: 'var(--color-status-error-bg)', border: '1px solid var(--color-status-error-border)', borderRadius: '10px', padding: '12px', color: 'var(--color-status-error-text)', fontSize: '13px', marginTop: '14px' }}>
                ⚠ {designError}
              </div>
            )}
          </div>

          {/* Step kinds reference */}
          <div style={{ ...card, padding: '20px', marginBottom: '20px', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-primary-200)' }}>
            <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary-800)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Available Step Kinds — the Copilot knows all 12
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {Object.entries(KIND_COLORS).map(([kind, [bg, color]]) => (
                <div key={kind} style={{ background: bg, border: `1px solid ${color}22`, borderRadius: '8px', padding: '8px 10px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 'var(--font-weight-bold)', color, fontFamily: 'var(--font-family-mono)' }}>{kind}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Generated result */}
          {designResult && (
            <div style={{ ...card, padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ fontSize: '15px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', marginBottom: '4px' }}>Generated Plan</h2>
                  <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{designResult.step_count as number} steps · ready to save or lint</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setTab('lint')}
                    style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--color-border-base)', background: 'var(--color-bg-canvas)', color: 'var(--color-text-base)', fontSize: '13px', fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer' }}>
                    🛡 Lint this plan
                  </button>
                  <button onClick={handleSavePlan} disabled={savingPlan}
                    style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'var(--color-primary-800)', color: 'var(--color-bg-surface)', fontSize: '13px', fontWeight: 'var(--font-weight-semibold)', cursor: savingPlan ? 'not-allowed' : 'pointer', opacity: savingPlan ? 0.7 : 1 }}>
                    {savingPlan ? '…' : '💾 Save as Plan'}
                  </button>
                </div>
              </div>

              {saveSuccess && (
                <div style={{ background: 'var(--color-status-success-bg)', border: '1px solid var(--color-status-success-border)', borderRadius: '10px', padding: '12px', color: 'var(--color-status-success-text)', fontSize: '13px', marginBottom: '16px' }}>
                  ✓ {saveSuccess}
                </div>
              )}

              {(() => {
                const plan = designResult.plan as Record<string, unknown>;
                return (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                      {[
                        { label: 'Plan Name',    value: String(plan.name) },
                        { label: 'Entity Type',  value: String(plan.entity_type) },
                        { label: 'Error Policy', value: String(plan.error_policy) },
                      ].map(m => (
                        <div key={m.label} style={{ background: 'var(--color-bg-canvas)', borderRadius: '10px', border: '1px solid var(--color-border-soft)', padding: '12px' }}>
                          <p style={{ fontSize: '11px', color: 'var(--color-text-soft)', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{m.label}</p>
                          <p style={{ fontFamily: 'var(--font-family-mono)', fontSize: '13px', color: 'var(--color-text-strong)', fontWeight: 'var(--font-weight-semibold)' }}>{m.value}</p>
                        </div>
                      ))}
                    </div>

                    <h3 style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Generated Steps</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                      {(plan.steps as Record<string, unknown>[]).map((step, i) => {
                        const kind = String(step.kind);
                        const [kbg, kc] = KIND_COLORS[kind] ?? ['var(--color-bg-muted)', 'var(--color-text-base)'];
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--color-bg-canvas)', borderRadius: '10px', border: '1px solid var(--color-border-soft)', padding: '12px 16px' }}>
                            <span style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'var(--color-primary-800)', color: 'var(--color-bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'var(--font-weight-bold)', flexShrink: 0 }}>{i + 1}</span>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontFamily: 'var(--font-family-mono)', fontWeight: 'var(--font-weight-bold)', fontSize: '13px', color: 'var(--color-text-strong)', marginBottom: '2px' }}>{String(step.step_key)}</p>
                              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                                {String(step.datasource_name)}
                                {Array.isArray(step.depends_on) && (step.depends_on as string[]).length > 0 && ` · deps: ${(step.depends_on as string[]).join(', ')}`}
                                {step.condition_expr ? ` · if: ${String(step.condition_expr).slice(0, 40)}…` : ''}
                              </p>
                            </div>
                            <span style={{ background: kbg, color: kc, padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 'var(--font-weight-bold)', fontFamily: 'var(--font-family-mono)', flexShrink: 0 }}>
                              {kind}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {Array.isArray(designResult.governance_notes) && (designResult.governance_notes as string[]).length > 0 && (
                      <div style={{ background: 'var(--color-status-warning-bg)', border: '1px solid var(--color-status-warning-border)', borderRadius: '10px', padding: '14px' }}>
                        <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-status-warning-text)', marginBottom: '8px' }}>💡 Governance Notes</p>
                        {(designResult.governance_notes as string[]).map((note, i) => (
                          <p key={i} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-status-warning-text)', marginBottom: '4px' }}>• {note}</p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* ── LINT TAB ── */}
      {tab === 'lint' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

          {/* Left — JSON input */}
          <div>
            <div style={{ ...card, padding: '24px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', marginBottom: '6px' }}>Plan JSON</h2>
              <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
                Paste a plan JSON or generate one in the Design tab — it auto-fills here.
              </p>
              <textarea
                style={{ ...inp, fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', minHeight: '420px', resize: 'vertical', lineHeight: 1.6, borderColor: lintJsonError ? 'var(--color-status-error-border)' : 'var(--color-border-base)' }}
                value={lintJson}
                onChange={e => handleLintJsonChange(e.target.value)}
                placeholder={'{\n  "name": "my_plan",\n  "entity_type": "email",\n  "error_policy": "dependent_fail",\n  "max_concurrency": 4,\n  "steps": [...]\n}'}
              />
              {lintJsonError && (
                <p style={{ color: 'var(--color-status-error-text)', fontSize: 'var(--font-size-xs)', marginTop: '6px' }}>{lintJsonError}</p>
              )}
              <button
                onClick={handleLint}
                disabled={lintLoading || !lintJson.trim()}
                style={{ width: '100%', marginTop: '14px', padding: '12px', borderRadius: '10px', border: 'none', background: lintLoading || !lintJson.trim() ? 'var(--color-border-soft)' : 'var(--color-primary-800)', color: lintLoading || !lintJson.trim() ? 'var(--color-text-soft)' : 'var(--color-bg-surface)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', cursor: lintLoading || !lintJson.trim() ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                {lintLoading
                  ? <><span style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'var(--color-bg-surface)', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} /> Linting…</>
                  : '🛡 Run Safety Lint'}
              </button>
              {lintError && (
                <div style={{ background: 'var(--color-status-error-bg)', border: '1px solid var(--color-status-error-border)', borderRadius: '10px', padding: '12px', color: 'var(--color-status-error-text)', fontSize: '13px', marginTop: '12px' }}>
                  ⚠ {lintError}
                </div>
              )}
            </div>

            {/* Rules reference */}
            <div style={{ ...card, padding: '20px', marginTop: '16px', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-primary-200)' }}>
              <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary-800)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                What gets checked (15 rules)
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {[
                  'Missing output schema on AI steps',
                  'EIVS step dependency ordering',
                  'Missing template_id on document_generate',
                  'Missing path_template on rest / webhook',
                  'Duplicate step keys',
                  'depends_on referencing non-existent steps',
                  'Unreasonable timeout values',
                  'human_review + fail_fast conflict',
                  'max_concurrency limit (16)',
                ].map(r => (
                  <div key={r} style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: 'var(--font-size-xs)', color: 'var(--color-primary-700)' }}>
                    <span style={{ color: 'var(--color-primary-800)', fontWeight: 'var(--font-weight-bold)', flexShrink: 0 }}>✓</span>
                    {r}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right — Lint results */}
          <div>
            {!lintResult && !lintLoading && (
              <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
                <div style={{ fontSize: '40px', marginBottom: '16px' }}>🛡</div>
                <p style={{ fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-base)', fontSize: '15px', marginBottom: '6px' }}>Ready to lint</p>
                <p style={{ color: 'var(--color-text-soft)', fontSize: '13px', textAlign: 'center', maxWidth: '260px' }}>
                  Paste a plan JSON on the left and click Run Safety Lint.
                </p>
              </div>
            )}

            {lintLoading && (
              <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
                <div style={{ width: '40px', height: '40px', border: '3px solid var(--color-primary-50)', borderTopColor: 'var(--color-primary-800)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', marginBottom: '16px' }} />
                <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>Running safety lint…</p>
              </div>
            )}

            {lintResult && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Summary */}
                <div style={{ ...card, padding: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h2 style={{ fontSize: '15px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', margin: 0 }}>Lint Result</h2>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '5px 14px', borderRadius: '999px', fontSize: '13px', fontWeight: 'var(--font-weight-bold)',
                      background: lintResult.safe_to_deploy ? 'var(--color-status-success-bg)' : 'var(--color-status-error-bg)',
                      color: lintResult.safe_to_deploy ? 'var(--color-status-success-text)' : 'var(--color-status-error-text)',
                      border: `1px solid ${lintResult.safe_to_deploy ? 'var(--color-status-success-border)' : 'var(--color-status-error-border)'}`,
                    }}>
                      {lintResult.safe_to_deploy ? '✓ Safe to Deploy' : '✕ Not Safe to Deploy'}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                    {[
                      { label: 'Total Issues', value: Number(lintResult.total_issues ?? 0), color: 'var(--color-text-base)', bg: 'var(--color-bg-canvas)' },
                      { label: 'Errors',       value: Number(lintResult.errors ?? 0),       color: 'var(--color-status-error-text)', bg: 'var(--color-status-error-bg)' },
                      { label: 'Warnings',     value: Number(lintResult.warnings ?? 0),     color: 'var(--color-status-warning-text)', bg: 'var(--color-status-warning-bg)' },
                    ].map(s => (
                      <div key={s.label} style={{ background: s.bg, borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                        <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Issues list */}
                {Array.isArray(lintResult.issues) && (lintResult.issues as Record<string, unknown>[]).length > 0 ? (
                  <div style={card}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-bg-muted)' }}>
                      <h3 style={{ fontSize: '13px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', margin: 0 }}>Issues Found</h3>
                    </div>
                    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {(lintResult.issues as { severity: string; step: string; issue: string; fix: string }[]).map((issue, i) => {
                        const [ibg, ic, ibr] = SEVERITY_COLORS[issue.severity] ?? SEVERITY_COLORS['info'];
                        return (
                          <div key={i} style={{ background: ibg, border: `1px solid ${ibr}`, borderRadius: '10px', padding: '14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                              <span style={{ fontSize: '11px', fontWeight: 'var(--font-weight-bold)', color: ic, textTransform: 'uppercase', letterSpacing: '0.06em', background: `${ic}18`, padding: '2px 8px', borderRadius: '999px' }}>
                                {issue.severity}
                              </span>
                              {issue.step && (
                                <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-base)' }}>
                                  {issue.step}
                                </span>
                              )}
                            </div>
                            <p style={{ fontSize: '13px', color: ic, fontWeight: 'var(--font-weight-semibold)', marginBottom: '4px' }}>{issue.issue}</p>
                            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>💡 {issue.fix}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  Boolean(lintResult.safe_to_deploy) && (
                    <div style={{ ...card, padding: '32px', textAlign: 'center' }}>
                      <div style={{ fontSize: '40px', marginBottom: '12px' }}>✅</div>
                      <p style={{ fontWeight: 'var(--font-weight-bold)', color: 'var(--color-status-success-text)', fontSize: 'var(--font-size-md)', marginBottom: '4px' }}>No issues found</p>
                      <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>This plan passed all safety lint checks.</p>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
