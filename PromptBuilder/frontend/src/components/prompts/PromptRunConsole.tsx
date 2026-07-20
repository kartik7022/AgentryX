// src/components/prompts/PromptRunConsole.tsx
// Generic Run Console — works for ANY prompt, any output format

import { useState } from 'react';
import { runPrompt } from '../../api/prompts';
import type { PromptInput, PromptRunResponse } from '../../types/api';

type OutputTab = 'output' | 'raw' | 'metadata';

interface Props {
  promptId: string;
  inputs:   PromptInput[];
}

export default function PromptRunConsole({ promptId, inputs }: Props) {

  const [paramValues, setParamValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    inputs.forEach(inp => { if (inp.default_value) initial[inp.name] = String(inp.default_value); });
    return initial;
  });

  const [version,    setVersion]    = useState('latest');
  const [allowDraft, setAllowDraft] = useState(true);
  const [isRunning,  setIsRunning]  = useState(false);
  const [result,     setResult]     = useState<PromptRunResponse | null>(null);
  const [runError,   setRunError]   = useState<string | null>(null);
  const [outputTab,  setOutputTab]  = useState<OutputTab>('output');

  const missingRequired = inputs
    .filter(inp => inp.required && !paramValues[inp.name]?.trim())
    .map(inp => inp.name);

  async function handleRun() {
    if (missingRequired.length > 0) return;
    setIsRunning(true);
    setResult(null);
    setRunError(null);
    setOutputTab('output');
    try {
      const runtime_params: Record<string, unknown> = {};
      inputs.forEach(inp => {
        const raw = paramValues[inp.name] ?? '';
        if (!raw && !inp.required) return;
        if (inp.type === 'number')                            runtime_params[inp.name] = parseFloat(raw) || 0;
        else if (inp.type === 'boolean')                      runtime_params[inp.name] = raw.toLowerCase() === 'true';
        else if (inp.type === 'json' || inp.type === 'array') {
          try { runtime_params[inp.name] = JSON.parse(raw); } catch { runtime_params[inp.name] = raw; }
        } else runtime_params[inp.name] = raw;
      });
      const res = await runPrompt({ prompt_id: promptId, version, runtime_params, response_format: 'json', allow_draft: allowDraft });
      setResult(res);
    } catch (err) {
      setRunError((err as Error).message || 'Run failed');
    } finally {
      setIsRunning(false);
    }
  }

  function handleCopy() {
    if (!result) return;
    const text = outputTab === 'raw'
      ? (result.raw_output || '')
      : outputTab === 'metadata'
        ? JSON.stringify(result.metadata || {}, null, 2)
        : JSON.stringify(result.output ?? {}, null, 2);
    navigator.clipboard.writeText(text).catch(() => null);
  }

  function ms(val: number | undefined): string {
    if (!val) return '—';
    return val >= 1000 ? `${(val / 1000).toFixed(2)}s` : `${val}ms`;
  }

  const meta   = result?.metadata as Record<string, unknown> | undefined;
  const output = result?.output   as Record<string, unknown> | undefined;

  // Generic output field renderer — works for any JSON output
  function renderOutputFields() {
    if (!output || typeof output !== 'object') return null;
    const entries = Object.entries(output);
    if (entries.length === 0) return null;

    return (
      <div style={S.outputFields}>
        <div style={S.outputFieldsTitle}>📋 Parsed output fields</div>
        {entries.map(([key, val]) => {
          const isArray  = Array.isArray(val);
          const isNull   = val === null;
          const isObj    = typeof val === 'object' && !isArray && !isNull;
          const isLong   = typeof val === 'string' && val.length > 80;

          return (
            <div key={key} style={S.outputField}>
              <div style={S.outputFieldKey}>{key}</div>
              <div style={S.outputFieldVal}>
                {isNull
                  ? <span style={{ color: 'var(--color-text-soft)', fontStyle: 'italic' }}>null</span>
                  : isArray
                    ? (val as unknown[]).length === 0
                      ? <span style={{ color: 'var(--color-text-soft)', fontStyle: 'italic' }}>[ ]</span>
                      : <ul style={S.outputList}>{(val as unknown[]).map((item, i) => <li key={i} style={S.outputListItem}>{String(item)}</li>)}</ul>
                    : isObj
                      ? <pre style={S.outputPre}>{JSON.stringify(val, null, 2)}</pre>
                      : isLong
                        ? <div style={S.outputLongText}>{String(val)}</div>
                        : <span style={getValueStyle(val)}>{String(val)}</span>
                }
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function getValueStyle(val: unknown): React.CSSProperties {
    if (typeof val === 'boolean' || val === 'true' || val === 'false')
      return { color: 'var(--color-accent-700)', fontWeight: 600 };
    if (typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val))))
      return { color: 'var(--color-warning-text)', fontWeight: 600 };
    if (typeof val === 'string') {
      const v = val.toLowerCase();
      if (['approved', 'yes', 'success', 'eligible', 'passed', 'active', 'closed'].some(k => v.includes(k)))
        return { color: 'var(--color-accent-700)', fontWeight: 600 };
      if (['rejected', 'no', 'failed', 'ineligible', 'error', 'open', 'denied'].some(k => v.includes(k)))
        return { color: 'var(--color-error-text)', fontWeight: 600 };
    }
    return { color: 'var(--color-text-strong)' };
  }

  return (
    <div style={S.wrap}>

      <div>
        <h3 style={S.heading}>Run Console</h3>
        <p style={S.subheading}>
          Test this prompt with real runtime parameters. The orchestrator
          validates inputs, resolves context, calls the LLM, and validates output.
        </p>
      </div>

      <div style={S.cols}>

        {/* LEFT — inputs */}
        <div style={S.left}>
          <div style={S.panelTitle}>Runtime parameters</div>

          <div style={S.field}>
            <label style={S.fieldLabel}>Version</label>
            <select value={version} onChange={e => setVersion(e.target.value)} style={S.select}>
              <option value="latest">latest (most recent draft or published)</option>
              <option value="published">published only</option>
            </select>
          </div>

          <label style={S.checkLabel}>
            <input type="checkbox" checked={allowDraft} onChange={e => setAllowDraft(e.target.checked)} style={{ marginRight: 8 }} />
            Allow draft version
          </label>

          <div style={S.divider} />

          {inputs.length === 0 ? (
            <div style={S.noInputs}>
              <span style={{ fontSize: 20, marginBottom: 6 }}>🔡</span>
              <div>No inputs defined for this prompt.</div>
            </div>
          ) : (
            <div style={S.inputsList}>
              {inputs.map(inp => {
                const isMissing = inp.required && !paramValues[inp.name]?.trim();
                return (
                  <div key={inp.name} style={S.field}>
                    <label style={S.fieldLabel}>
                      {inp.label || inp.name}
                      {inp.required
                        ? <span style={{ color: 'var(--color-error-text)' }}> *</span>
                        : <span style={{ color: 'var(--color-text-soft)', fontWeight: 400 }}> (optional)</span>}
                    </label>
                    {inp.type === 'boolean' ? (
                      <select
                        value={paramValues[inp.name] || ''}
                        onChange={e => setParamValues({ ...paramValues, [inp.name]: e.target.value })}
                        style={{ ...S.select, ...(isMissing ? S.inputErr : {}) }}
                      >
                        <option value="">— select —</option>
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : (
                      <input
                        type={inp.type === 'number' ? 'number' : 'text'}
                        value={paramValues[inp.name] || ''}
                        onChange={e => setParamValues({ ...paramValues, [inp.name]: e.target.value })}
                        placeholder={inp.default_value ? `default: ${inp.default_value}` : `Enter ${inp.label || inp.name}...`}
                        style={{ ...S.input, fontFamily: 'var(--font-family-mono)', ...(isMissing ? S.inputErr : {}) }}
                      />
                    )}
                    {inp.description && <div style={S.inputHelp}>{inp.description}</div>}
                    {isMissing && <div style={{ fontSize: 11, color: 'var(--color-error-text)' }}>This field is required</div>}
                  </div>
                );
              })}
            </div>
          )}

          {missingRequired.length > 0 && (
            <div style={S.missingBanner}>
              <span>⚠️</span>
              <span>Fill in: <strong>{missingRequired.join(', ')}</strong></span>
            </div>
          )}

          <button
            type="button"
            style={{ ...S.runBtn, opacity: (isRunning || missingRequired.length > 0) ? 0.65 : 1, cursor: (isRunning || missingRequired.length > 0) ? 'not-allowed' : 'pointer' }}
            onClick={handleRun}
            disabled={isRunning || missingRequired.length > 0}
          >
            {isRunning ? '⟳ Running...' : '▶ Run Prompt'}
          </button>

          {runError && <div style={S.errBanner}>⚠ {runError}</div>}
        </div>

        {/* RIGHT — output */}
        <div style={S.right}>
          <div style={S.panelTitle}>Output</div>

          {!result && !isRunning && (
            <div style={S.outEmpty}>
              <div style={{ fontSize: 30, marginBottom: 10 }}>▶️</div>
              <div style={{ fontWeight: 600, color: 'var(--color-text-strong)', marginBottom: 4 }}>No output yet</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Fill in the parameters and click Run Prompt</div>
            </div>
          )}

          {isRunning && (
            <div style={S.outEmpty}>
              <div style={{ fontSize: 24, marginBottom: 10 }}>⟳</div>
              <div style={{ fontWeight: 600, color: 'var(--color-text-strong)' }}>Running prompt...</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>Validating → fetching data → calling AI → parsing output</div>
            </div>
          )}

          {result && (
            <>
              {/* Status banner */}
              <div style={{ ...S.statusBanner, ...(result.status === 'success' ? S.ok : S.err) }}>
                <span style={{ fontSize: 14 }}>{result.status === 'success' ? '✅' : '❌'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, textTransform: 'capitalize' }}>{result.status}</div>
                  {result.error_message && <div style={{ fontSize: 12, marginTop: 2 }}>{result.error_message}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={S.chip}>⏱ {ms(meta?.latency_ms as number)}</span>
                  <span style={S.chip}>🤖 {ms(meta?.llm_latency_ms as number)}</span>
                </div>
              </div>

              {/* Generic output fields — works for ANY prompt */}
              {result.status === 'success' && renderOutputFields()}

              {/* Run ID + Copy */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-soft)' }}>Run: <code>{result.prompt_run_id?.slice(0, 8)}…</code></span>
                <button type="button" style={S.copyBtn} onClick={handleCopy}>📋 Copy</button>
              </div>

              {/* Output tabs */}
              <div style={{ display: 'flex', gap: 4 }}>
                {(['output', 'raw', 'metadata'] as OutputTab[]).map(t => (
                  <button key={t} type="button"
                    style={{ ...S.outTab, ...(outputTab === t ? S.outTabActive : {}) }}
                    onClick={() => setOutputTab(t)}>
                    {t === 'output' ? '📦 Output' : t === 'raw' ? '📝 Raw' : '📊 Metadata'}
                  </button>
                ))}
              </div>

              {/* Output content */}
              <div style={S.outBox}>
                <pre style={S.pre}>
                  {outputTab === 'output'
                    ? JSON.stringify(result.output ?? {}, null, 2)
                    : outputTab === 'raw'
                      ? (result.raw_output || '(empty)')
                      : JSON.stringify(result.metadata || {}, null, 2)}
                </pre>
              </div>

              {/* Meta chips */}
              {meta && (() => {
                const c       = (meta.compile || {}) as Record<string, unknown>;
                const blocks  = c.block_count as number | undefined;
                const vars    = Array.isArray(c.variables_used) ? c.variables_used as string[] : null;
                const missing = Array.isArray(c.missing_vars)   ? c.missing_vars   as string[] : null;
                const vs      = meta.version_status as string | undefined;
                return (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {blocks !== undefined && <span style={S.metaChip}>🧱 {blocks} blocks</span>}
                    {vars    && <span style={S.metaChip}>🔡 {vars.length} var(s)</span>}
                    {missing && missing.length > 0 && (
                      <span style={{ ...S.metaChip, background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' }}>⚠️ {missing.join(', ')} missing</span>
                    )}
                    {vs && <span style={S.metaChip}>📝 {vs}</span>}
                  </div>
                );
              })()}
            </>
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
  cols:       { display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16, alignItems: 'start' },
  left:       { background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-soft)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  right:      { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 340 },
  panelTitle: { fontSize: 11.5, fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 },
  divider:    { borderTop: '1px solid var(--color-border-soft)' },
  field:      { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldLabel: { fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' },
  input:      { padding: '8px 10px', border: '1px solid var(--color-border-soft)', borderRadius: 8, fontSize: 13, outline: 'none', background: 'var(--color-bg-surface)', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
  inputErr:   { borderColor: 'var(--color-error-border)', background: 'var(--color-error-bg)' },
  inputHelp:  { fontSize: 11.5, color: 'var(--color-text-soft)' },
  select:     { padding: '8px 10px', border: '1px solid var(--color-border-soft)', borderRadius: 8, fontSize: 13, outline: 'none', background: 'var(--color-bg-surface)', cursor: 'pointer', fontFamily: 'inherit' },
  checkLabel: { display: 'flex', alignItems: 'center', fontSize: 13, color: 'var(--color-text-base)', cursor: 'pointer', userSelect: 'none' },
  inputsList: { display: 'flex', flexDirection: 'column', gap: 10 },
  noInputs:   { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0', fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' },
  missingBanner: { display: 'flex', gap: 8, background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)', color: 'var(--color-warning-text)', borderRadius: 8, padding: '8px 12px', fontSize: 13 },
  runBtn:     { background: 'var(--color-primary-700)', border: '1px solid var(--color-primary-700)', color: 'var(--color-text-strong)', fontWeight: 700, fontSize: 14, padding: '12px 0', borderRadius: 10, boxShadow: 'var(--shadow-sm)', fontFamily: 'inherit' },
  errBanner:  { background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', color: 'var(--color-error-text)', borderRadius: 8, padding: '10px 12px', fontSize: 13 },
  outEmpty:   { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' },
  statusBanner: { display: 'flex', alignItems: 'center', gap: 10, borderRadius: 10, padding: '10px 14px' },
  ok:         { background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', color: 'var(--color-success-text)' },
  err:        { background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', color: 'var(--color-error-text)' },
  chip:       { fontSize: 11.5, fontWeight: 600, background: 'rgba(255,255,255,0.7)', padding: '3px 8px', borderRadius: 999 },

  // Generic output fields
  outputFields:      { background: 'var(--color-bg-canvas)', border: '1px solid var(--color-border-soft)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 },
  outputFieldsTitle: { fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 },
  outputField:       { display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, alignItems: 'flex-start', paddingBottom: 8, borderBottom: '1px solid var(--color-bg-muted)' },
  outputFieldKey:    { fontSize: 11.5, fontWeight: 600, color: 'var(--color-primary-800)', fontFamily: 'var(--font-family-mono)', paddingTop: 2 },
  outputFieldVal:    { fontSize: 13, color: 'var(--color-text-strong)', lineHeight: 1.6 },
  outputList:        { margin: '2px 0 0 16px', padding: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  outputListItem:    { fontSize: 12.5, color: 'var(--color-text-base)', lineHeight: 1.5 },
  outputPre:         { margin: 0, fontSize: 11.5, fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-base)', whiteSpace: 'pre-wrap' },
  outputLongText:    { fontSize: 13, color: 'var(--color-text-strong)', lineHeight: 1.7, background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', borderRadius: 8, padding: '8px 10px' },

  copyBtn:      { border: '1px solid var(--color-border-soft)', background: 'var(--color-bg-surface)', color: 'var(--color-primary-800)', fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' },
  outTab:       { padding: '6px 12px', border: '1px solid var(--color-border-soft)', background: 'var(--color-bg-surface)', color: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' },
  outTabActive: { background: 'var(--color-primary-50)', color: 'var(--color-primary-800)', borderColor: 'var(--color-primary-200)' },
  outBox:       { background: 'var(--color-bg-canvas)', border: '1px solid var(--color-border-soft)', borderRadius: 10, padding: 14, overflow: 'auto', maxHeight: 280, flex: 1 },
  pre:          { margin: 0, fontFamily: 'var(--font-family-mono)', fontSize: 12.5, lineHeight: 1.6, color: 'var(--color-text-base)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  metaChip:     { fontSize: 12, fontWeight: 600, background: 'var(--color-bg-muted)', color: 'var(--color-text-base)', padding: '3px 10px', borderRadius: 999 },
};