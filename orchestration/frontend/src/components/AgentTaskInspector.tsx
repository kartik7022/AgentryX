// src/components/AgentTaskInspector.tsx
import type { AgentTaskConfig } from '../types';

const inp: React.CSSProperties = {
  width: '100%', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-base)',
  borderRadius: '10px', padding: '10px 14px', fontSize: '13px',
  color: 'var(--color-text-strong)', fontFamily: 'inherit', boxSizing: 'border-box' as const,
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 'var(--font-weight-semibold)',
  textTransform: 'uppercase' as const, letterSpacing: '0.07em',
  color: 'var(--color-text-muted)', marginBottom: '5px',
};
const section: React.CSSProperties = {
  background: 'var(--color-bg-canvas)', borderRadius: '12px', border: '1px solid var(--color-border-soft)',
  padding: '16px', marginBottom: '12px',
};

const ALL_TOOLS = [
  { name: 'datasource_lookup', label: 'Data Fetch',   readOnly: true  },
  { name: 'human_review',      label: 'Human Review', readOnly: false },
];

const FALLBACK_OPTIONS = ['fail', 'human_review'];

interface Props {
  config:   Partial<AgentTaskConfig>;
  onChange: (updated: Partial<AgentTaskConfig>) => void;
  errors?:  Record<string, string>;
}

function SectionHeader({ title, icon }: { title: string; icon: string }) {
  return (
    <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-base)', marginBottom: '12px',
      display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span>{icon}</span>{title}
    </p>
  );
}

function defaultBudgets() {
  return { max_iterations: 5, max_model_calls: 10, max_tool_calls: 20, max_cost_usd: 1.0, timeout_ms: 120000 };
}
function defaultFallback() {
  return { on_budget_exceeded: 'fail', on_output_invalid: 'human_review', on_approval_rejected: 'fail' };
}

export default function AgentTaskInspector({ config, onChange, errors = {} }: Props) {
  const up = (key: keyof AgentTaskConfig, value: unknown) =>
    onChange({ ...config, [key]: value });

  const upGoal = (value: string) => {
    const slug = value.trim().slice(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'agent-task';
    onChange({
      ...config,
      goal: value,
      prompt_ref: { prompt_name: slug, version: 'published' },
      output_schema: config.output_schema ?? { type: 'object' },
    });
  };

  const upBudget = (key: string, value: unknown) =>
    onChange({ ...config, budgets: { ...(config.budgets ?? defaultBudgets()), [key]: value } as AgentTaskConfig['budgets'] });

  const upFallback = (key: string, value: unknown) =>
    onChange({ ...config, fallback_policy: { ...(config.fallback_policy ?? defaultFallback()), [key]: value } as AgentTaskConfig['fallback_policy'] });

  function toggleTool(toolName: string, checked: boolean) {
    const current = config.allowed_tools ?? [];
    const updated  = checked
      ? [...current, toolName]
      : current.filter(t => t !== toolName);
    up('allowed_tools', updated);
  }

  const budgets      = config.budgets        ?? defaultBudgets();
  const fallback     = config.fallback_policy ?? defaultFallback();
  const allowedTools = config.allowed_tools   ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>

      {/* ── Basic ──────────────────────────────────────────────── */}
      <div style={section}>
        <SectionHeader title="Basic" icon="⚙" />
        <div style={{ marginBottom: '10px' }}>
          <label style={lbl}>Goal *</label>
          <textarea
            style={{ ...inp, minHeight: '72px', resize: 'vertical' }}
            value={config.goal ?? ''}
            onChange={e => upGoal(e.target.value)}
            placeholder="Resolve the customer's loan NOC request by validating their identity and loan status."
          />
          {errors.goal && <p style={{ color: 'var(--color-status-error-text)', fontSize: '11px', marginTop: '3px' }}>{errors.goal}</p>}
        </div>
      </div>

      {/* ── Allowed Tools ──────────────────────────────────────── */}
      <div style={section}>
        <SectionHeader title="Allowed Tools" icon="🔧" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {ALL_TOOLS.map(tool => (
            <label key={tool.name}
              style={{ display: 'flex', alignItems: 'center', gap: '10px',
                cursor: 'pointer', fontSize: '13px', color: 'var(--color-text-base)' }}>
              <input type="checkbox"
                checked={allowedTools.includes(tool.name)}
                onChange={e => toggleTool(tool.name, e.target.checked)} />
              <span style={{ fontFamily: 'var(--font-family-mono)', fontWeight: 'var(--font-weight-semibold)', flex: 1 }}>{tool.name}</span>
              <span style={{
                fontSize: '10px', fontWeight: 'var(--font-weight-bold)', padding: '2px 8px',
                borderRadius: '999px', textTransform: 'uppercase' as const, letterSpacing: '0.05em',
                color:      tool.readOnly ? 'var(--color-status-success-text)' : 'var(--color-status-error-text)',
                background: tool.readOnly ? 'var(--color-status-success-bg)' : 'var(--color-status-error-bg)',
                border:     `1px solid ${tool.readOnly ? 'var(--color-status-success-border)' : 'var(--color-status-error-border)'}`,
              }}>
                {tool.readOnly ? 'read-only' : 'mutating'}
              </span>
            </label>
          ))}
        </div>
        {errors.allowed_tools && (
          <p style={{ color: 'var(--color-status-error-text)', fontSize: '11px', marginTop: '8px' }}>{errors.allowed_tools}</p>
        )}
      </div>

      {/* ── Budgets ────────────────────────────────────────────── */}
      <div style={section}>
        <SectionHeader title="Budgets" icon="💰" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
          {[
            { key: 'max_iterations',  label: 'Max Iterations',  min: 1,  max: 10 },
            { key: 'max_model_calls', label: 'Max Model Calls', min: 1,  max: 10 },
            { key: 'max_tool_calls',  label: 'Max Tool Calls',  min: 0,  max: 20 },
          ].map(f => (
            <div key={f.key}>
              <label style={lbl}>{f.label}</label>
              <input style={inp} type="number" min={f.min} max={f.max}
                value={(budgets as Record<string, number>)[f.key] ?? f.max}
                onChange={e => upBudget(f.key, parseInt(e.target.value))} />
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
          <div>
            <label style={lbl}>Timeout (ms)</label>
            <input style={inp} type="number" min={1000} step={1000}
              value={budgets.timeout_ms ?? 120000}
              onChange={e => upBudget('timeout_ms', parseInt(e.target.value))} />
          </div>
        </div>
      </div>

      {/* ── Fallback Policy ────────────────────────────────────── */}
      <div style={section}>
        <SectionHeader title="Fallback Policy" icon="🔄" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {[
            { key: 'on_budget_exceeded',   label: 'On Budget Exceeded'   },
            { key: 'on_output_invalid',    label: 'On Output Invalid'    },
          ].map(f => (
            <div key={f.key}>
              <label style={lbl}>{f.label}</label>
              <select style={inp}
                value={(fallback as Record<string, string>)[f.key] ?? 'fail'}
                onChange={e => upFallback(f.key, e.target.value)}>
                {FALLBACK_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
        </div>
        <p style={{ fontSize: '11px', color: 'var(--color-text-soft)', marginTop: '8px' }}>
          On Approval Rejected is fixed at "fail" — if a human rejects an action the agent tried to take, the whole execution is marked failed.
        </p>
      </div>

    </div>
  );
}