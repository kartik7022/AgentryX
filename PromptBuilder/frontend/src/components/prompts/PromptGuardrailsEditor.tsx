// src/components/prompts/PromptGuardrailsEditor.tsx
// Stop sequences REMOVED — not passed to LLM so removed from UI
// Safe mode — now shows "hard post-processing filter" label (backend enforces it)
// Topic restrictions — now shows "hard filter" label (backend enforces it)

import { useState, useEffect } from 'react';

interface Guardrails {
  max_output_tokens?:  number;
  temperature?:        number;
  topic_restrictions?: string[];
  safe_mode?:          boolean;
  max_retries?:        number;
}

interface Props {
  value:     Record<string, unknown>;
  onChange:  (next: Record<string, unknown>) => void;
  disabled?: boolean;
}

function parse(raw: Record<string, unknown>): Guardrails {
  return {
    max_output_tokens:  (raw.max_output_tokens  as number)   ?? 500,
    temperature:        (raw.temperature        as number)   ?? 0.3,
    topic_restrictions: (raw.topic_restrictions as string[]) ?? [],
    safe_mode:          (raw.safe_mode          as boolean)  ?? false,
    max_retries:        (raw.max_retries        as number)   ?? 1,
  };
}

export default function PromptGuardrailsEditor({ value, onChange, disabled = false }: Props) {
  const [g, setG] = useState<Guardrails>(() => parse(value));

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setG(parse(value)); }, [value]);

  function update(patch: Partial<Guardrails>) {
    const next = { ...g, ...patch };
    setG(next);
    const out: Record<string, unknown> = {};
    if (next.max_output_tokens !== undefined)  out.max_output_tokens  = next.max_output_tokens;
    if (next.temperature       !== undefined)  out.temperature        = next.temperature;
    if (next.topic_restrictions?.length)       out.topic_restrictions = next.topic_restrictions;
    if (next.safe_mode)                        out.safe_mode          = next.safe_mode;
    if ((next.max_retries ?? 0) > 0)           out.max_retries        = next.max_retries;
    onChange(out);
  }

  return (
    <div style={S.wrap}>

      <div>
        <h3 style={S.heading}>Guardrails</h3>
        <p style={S.subheading}>
          Control LLM behaviour limits and safety rules. These values are enforced
          by the orchestrator on every prompt run.
        </p>
      </div>

      <div style={S.grid}>

        {/* Max output tokens */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <div>
              <div style={S.cardTitle}>Max output tokens</div>
              <div style={S.cardHint}>Limit the LLM response length</div>
            </div>
            <div style={S.valueBadge}>{g.max_output_tokens ?? 500}</div>
          </div>
          <input
            type="range" min={50} max={8000} step={50}
            value={g.max_output_tokens ?? 500}
            onChange={(e) => update({ max_output_tokens: parseInt(e.target.value) })}
            disabled={disabled}
            style={S.slider}
          />
          <div style={S.sliderLabels}>
            <span>50</span><span>2000</span><span>4000</span><span>8000</span>
          </div>
          <div style={S.realBadge}>✅ Hard limit — passed directly to LLM</div>
        </div>

        {/* Temperature */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <div>
              <div style={S.cardTitle}>Temperature</div>
              <div style={S.cardHint}>0 = deterministic · 1 = creative</div>
            </div>
            <div style={S.valueBadge}>{(g.temperature ?? 0.3).toFixed(2)}</div>
          </div>
          <input
            type="range" min={0} max={1} step={0.01}
            value={g.temperature ?? 0.3}
            onChange={(e) => update({ temperature: parseFloat(e.target.value) })}
            disabled={disabled}
            style={S.slider}
          />
          <div style={S.sliderLabels}>
            <span>0.0 (precise)</span><span>0.5</span><span>1.0 (creative)</span>
          </div>
          <div style={S.realBadge}>✅ Hard limit — passed directly to LLM</div>
        </div>

        {/* Max retries */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <div>
              <div style={S.cardTitle}>Max retries</div>
              <div style={S.cardHint}>Retry on JSON parse failure</div>
            </div>
          </div>
          <div style={S.inlineRow}>
            {[0, 1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                style={{ ...S.retryBtn, ...(g.max_retries === n ? S.retryBtnActive : {}) }}
                onClick={() => update({ max_retries: n })}
                disabled={disabled}
              >
                {n}×
              </button>
            ))}
          </div>
          <div style={S.fieldHelp}>When JSON output is invalid, retry up to N times.</div>
          <div style={S.realBadge}>✅ Hard — orchestrator retries the LLM call</div>
        </div>

        {/* Safe mode */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <div>
              <div style={S.cardTitle}>Safe mode</div>
              <div style={S.cardHint}>Block harmful, offensive or dangerous outputs</div>
            </div>
            <div
              style={{ ...S.toggle, ...(g.safe_mode ? S.toggleOn : S.toggleOff), cursor: disabled ? 'not-allowed' : 'pointer' }}
              onClick={() => !disabled && update({ safe_mode: !g.safe_mode })}
            >
              <div style={{ ...S.toggleKnob, transform: g.safe_mode ? 'translateX(22px)' : 'translateX(2px)' }} />
            </div>
          </div>
          <div style={S.fieldHelp}>
            {g.safe_mode
              ? '🛡 ON — orchestrator scans output and rejects harmful content before returning it.'
              : '⚪ OFF — outputs returned as-is from the LLM.'}
          </div>
          <div style={g.safe_mode ? S.realBadge : S.offBadge}>
            {g.safe_mode ? '✅ Hard — post-processing filter runs on every response' : '⚪ Disabled'}
          </div>
        </div>

        {/* Topic restrictions */}
        <div style={{ ...S.card, gridColumn: '1 / -1' }}>
          <div style={S.cardTitle}>Topic restrictions</div>
          <div style={S.cardHint}>
            One restriction per line — the orchestrator will reject any AI response that violates these rules
          </div>
          <textarea
            value={(g.topic_restrictions || []).join('\n')}
            onChange={(e) => update({
              topic_restrictions: e.target.value
                .split('\n')
                .map(s => s.trim())
                .filter(Boolean),
            })}
            placeholder={`Do not mention competitor bank names\nDo not provide legal advice\nDo not share customer personal data not provided\nDo not generate NOC for loans that are still open`}
            disabled={disabled}
            rows={4}
            style={{ ...S.input, marginTop: 8, resize: 'vertical', minHeight: 80 }}
          />
          <div style={S.realBadge}>
            ✅ Hard — orchestrator checks every AI response against these rules and rejects violations
          </div>
        </div>

      </div>

      {/* Summary */}
      <div style={S.summary}>
        <div style={S.summaryTitle}>Active guardrails</div>
        <div style={S.summaryRow}>
          <span style={S.chip}>🔢 max tokens: {g.max_output_tokens ?? 500}</span>
          <span style={S.chip}>🌡 temp: {(g.temperature ?? 0.3).toFixed(2)}</span>
          <span style={S.chip}>🔄 retries: {g.max_retries ?? 1}</span>
          {g.safe_mode && <span style={{ ...S.chip, background: 'var(--color-success-bg)', color: 'var(--color-success-text)' }}>🛡 safe mode ON</span>}
          {(g.topic_restrictions?.length ?? 0) > 0 && (
            <span style={{ ...S.chip, background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' }}>🚫 {g.topic_restrictions!.length} topic restriction(s)</span>
          )}
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap:       { display: 'flex', flexDirection: 'column', gap: 16 },
  heading:    { margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--color-text-strong)' },
  subheading: { margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.55 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  card: {
    background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-soft)',
    borderRadius: 12, padding: 16,
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTitle:  { fontSize: 14, fontWeight: 600, color: 'var(--color-text-strong)' },
  cardHint:   { fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 },
  valueBadge: {
    background: 'var(--color-primary-700)',
    color: 'var(--color-text-strong)', fontSize: 13, fontWeight: 700,
    padding: '4px 12px', borderRadius: 999, minWidth: 52, textAlign: 'center',
  },
  realBadge: {
    fontSize: 11, fontWeight: 600, color: 'var(--color-success-text)',
    background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)',
    borderRadius: 6, padding: '4px 8px', marginTop: 2,
  },
  offBadge: {
    fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)',
    background: 'var(--color-bg-muted)', border: '1px solid var(--color-border-soft)',
    borderRadius: 6, padding: '4px 8px', marginTop: 2,
  },
  slider: { width: '100%', accentColor: 'var(--color-primary-700)', cursor: 'pointer' },
  sliderLabels: { display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--color-text-soft)' },
  inlineRow: { display: 'flex', gap: 8 },
  retryBtn: {
    flex: 1, padding: '8px 0', border: '1px solid var(--color-border-soft)',
    background: 'var(--color-bg-surface)', color: 'var(--color-text-muted)', fontWeight: 600,
    fontSize: 13, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
  },
  retryBtnActive: { background: 'var(--color-primary-50)', color: 'var(--color-primary-800)', borderColor: 'var(--color-primary-200)' },
  toggle: { width: 48, height: 26, borderRadius: 999, display: 'flex', alignItems: 'center', transition: 'background 0.2s ease', flexShrink: 0 },
  toggleOn:  { background: 'var(--color-primary-700)' },
  toggleOff: { background: '#d1d5db' },
  toggleKnob: { width: 22, height: 22, background: 'var(--color-bg-surface)', borderRadius: 999, boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'transform 0.2s ease' },
  fieldHelp: { fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 },
  input: { padding: '9px 12px', border: '1px solid var(--color-border-soft)', borderRadius: 8, fontSize: 13, outline: 'none', background: 'var(--color-bg-surface)', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
  summary: { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 },
  summaryTitle: { fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' },
  summaryRow:   { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: { fontSize: 12, fontWeight: 600, background: 'var(--color-bg-muted)', color: 'var(--color-text-base)', padding: '4px 10px', borderRadius: 999 },
};