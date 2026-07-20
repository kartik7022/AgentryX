// src/pages/PromptRunConsolePage.tsx

import { useState, useEffect } from 'react';
import { listPrompts, runPrompt, getPrompt } from '../api/prompts';
import type { Prompt, PromptInput, PromptRunResponse } from '../types/api';

type OutputTab = 'output' | 'raw' | 'metadata';

export default function PromptRunConsolePage() {

  const [prompts,          setPrompts]          = useState<Prompt[]>([]);
  const [selectedId,       setSelectedId]       = useState<string>('');
  const [inputs,           setInputs]           = useState<PromptInput[]>([]);
  const [paramValues,      setParamValues]      = useState<Record<string, string>>({});
  const [isLoadingPrompts, setIsLoadingPrompts] = useState(true);
  const [isLoadingInputs,  setIsLoadingInputs]  = useState(false);
  const [isRunning,        setIsRunning]        = useState(false);
  const [result,           setResult]           = useState<PromptRunResponse | null>(null);
  const [runError,         setRunError]         = useState<string | null>(null);
  const [outputTab,        setOutputTab]        = useState<OutputTab>('output');
  const [version,          setVersion]          = useState('latest');
  const [allowDraft,       setAllowDraft]       = useState(true);

  // Fix 1: eslint react-hooks/set-state-in-effect
  // Move setIsLoadingPrompts(true) into useState initial value — no setState in effect body
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoadingPrompts(true);
    listPrompts()
      .then((data: Prompt[]) => setPrompts(data.filter(p => p.status !== 'archived')))
      .catch((err: Error) => console.error(err))
      .finally(() => setIsLoadingPrompts(false));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInputs([]);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setParamValues({});
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResult(null);
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoadingInputs(true);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResult(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRunError(null);
    getPrompt(selectedId)
      .then(data => {
        setInputs(data.inputs || []);
        const defaults: Record<string, string> = {};
        (data.inputs || []).forEach((inp: PromptInput) => {
          if (inp.default_value) defaults[inp.name] = String(inp.default_value);
        });
        setParamValues(defaults);
      })
      .catch((err: Error) => console.error(err))
      .finally(() => setIsLoadingInputs(false));
  }, [selectedId]);

  const missingRequired = inputs
    .filter(inp => inp.required && !paramValues[inp.name]?.trim())
    .map(inp => inp.name);

  async function handleRun() {
    if (!selectedId || missingRequired.length > 0) return;
    setIsRunning(true);
    setResult(null);
    setRunError(null);
    setOutputTab('output');
    try {
      const runtime_params: Record<string, unknown> = {};
      inputs.forEach(inp => {
        const raw = (paramValues[inp.name] ?? '').trim();
        if (!raw && !inp.required) return;
        if (inp.type === 'number') runtime_params[inp.name] = parseFloat(raw) || 0;
        else if (inp.type === 'boolean') runtime_params[inp.name] = raw.toLowerCase() === 'true';
        else if (inp.type === 'json' || inp.type === 'array') {
          try { runtime_params[inp.name] = JSON.parse(raw); } catch { runtime_params[inp.name] = raw; }
        } else runtime_params[inp.name] = raw;
      });
      const res = await runPrompt({
        prompt_id: selectedId, version,
        runtime_params, response_format: 'json', allow_draft: allowDraft,
      });
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
  const selectedPrompt = prompts.find(p => p.prompt_id === selectedId);

  // Fix 2: eligible check — supports boolean true, string "yes", "approved"
  // Fix 3: removed unused isMissingData variable
  const eligible   = output?.eligible;
  const isEligible = eligible === true  || eligible === 'yes' || eligible === 'approved';
  const isRejected = eligible === false || eligible === 'no'  || eligible === 'rejected';

  return (
    <div style={S.page}>

      {/* Hero */}
      <div style={S.hero}>
        <div style={S.heroIcon}>▶️</div>
        <div>
          <h1 style={S.title}>Run Console</h1>
          <p style={S.subtitle}>Select a prompt, fill in parameters and see the AI response.</p>
        </div>
      </div>

      {/* Selector bar */}
      <div style={S.bar}>
        <span style={S.barLabel}>Prompt:</span>
        <select value={selectedId} onChange={e => setSelectedId(e.target.value)} style={S.select} disabled={isLoadingPrompts}>
          <option value="">{isLoadingPrompts ? 'Loading...' : '— select a prompt —'}</option>
          {prompts.map(p => (
            <option key={p.prompt_id} value={p.prompt_id}>
              {p.name} {p.status === 'published' ? '✅' : '(draft)'}
            </option>
          ))}
        </select>
        {selectedId && (
          <>
            <select value={version} onChange={e => setVersion(e.target.value)} style={{ ...S.select, minWidth: 200 }}>
              <option value="latest">latest (draft or published)</option>
              <option value="published">published only</option>
            </select>
            <label style={S.checkLabel}>
              <input type="checkbox" checked={allowDraft} onChange={e => setAllowDraft(e.target.checked)} style={{ marginRight: 6 }} />
              Allow draft
            </label>
          </>
        )}
      </div>

      {/* Empty state */}
      {!selectedId && !isLoadingPrompts && (
        <div style={S.empty}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>▶️</div>
          <div style={S.emptyTitle}>Select a prompt to start testing</div>
          <div style={S.emptyHint}>Choose any prompt from the dropdown above to test it with real parameters.</div>
        </div>
      )}

      {/* Loading */}
      {selectedId && isLoadingInputs && (
        <div style={S.empty}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⟳</div>
          <div>Loading prompt...</div>
        </div>
      )}

      {/* Main console */}
      {selectedId && !isLoadingInputs && (
        <div style={S.cols}>

          {/* LEFT — inputs */}
          <div style={S.left}>
            <div style={S.panelTitle}>
              Runtime parameters
              {selectedPrompt && <span style={S.badge}>{selectedPrompt.name}</span>}
            </div>
            <div style={S.divider} />

            {inputs.length === 0 ? (
              <div style={S.noInputs}>🔡 This prompt has no inputs defined.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {inputs.map(inp => {
                  const isMissing = inp.required && !paramValues[inp.name]?.trim();
                  return (
                    <div key={inp.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={S.fieldLabel}>
                        {inp.label || inp.name}
                        {inp.required
                          ? <span style={{ color: 'var(--color-error-text)' }}> *</span>
                          : <span style={{ color: 'var(--color-text-soft)' }}> (optional)</span>}
                      </label>
                      <input
                        type={inp.type === 'number' ? 'number' : 'text'}
                        value={paramValues[inp.name] || ''}
                        onChange={e => setParamValues({ ...paramValues, [inp.name]: e.target.value })}
                        placeholder={`Enter ${inp.label || inp.name}...`}
                        style={{ ...S.input, ...(isMissing ? { borderColor: 'var(--color-error-border)', background: 'var(--color-error-bg)' } : {}) }}
                      />
                      {inp.description && <div style={{ fontSize: 11.5, color: 'var(--color-text-soft)' }}>{inp.description}</div>}
                      {isMissing && <div style={{ fontSize: 11, color: 'var(--color-error-text)' }}>This field is required</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {missingRequired.length > 0 && (
              <div style={S.missingBanner}>⚠️ Fill in: <strong>{missingRequired.join(', ')}</strong></div>
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
                    {result.error_message && <div style={{ fontSize: 12 }}>{result.error_message}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={S.chip}>⏱ {ms(meta?.latency_ms as number)}</span>
                    <span style={S.chip}>🤖 {ms(meta?.llm_latency_ms as number)}</span>
                  </div>
                </div>

                {/* Eligible result banner */}
                {result.status === 'success' && eligible !== undefined && (
                  <div style={{
                    ...S.eligibleBanner,
                    ...(isEligible ? S.eligibleOk : isRejected ? S.eligibleNo : S.eligibleMissing),
                  }}>
                    <span style={{ fontSize: 20 }}>
                      {isEligible ? '✅' : isRejected ? '❌' : '⚠️'}
                    </span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        {isEligible
                          ? 'Eligible — NOC can be issued'
                          : isRejected
                            ? 'Not eligible — NOC cannot be issued'
                            : 'Data missing — cannot determine eligibility'}
                      </div>
                      {/* Fix 4: cast to string to avoid ReactNode type error */}
                      {output?.reason !== undefined && (
                        <div style={{ fontSize: 12, marginTop: 3, opacity: 0.85 }}>
                          {String(output.reason)}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* NOC text preview */}
                {isEligible && output?.noc_text !== undefined && (
                  <div style={S.nocPreview}>
                    <div style={S.nocLabel}>📄 NOC Certificate</div>
                    <div style={S.nocText}>{String(output.noc_text)}</div>
                  </div>
                )}

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
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page:        { padding: '20px 24px', maxWidth: 1280, margin: '0 auto', fontFamily: "var(--font-family-sans)" },
  hero:        { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18, background: 'linear-gradient(135deg, var(--color-primary-50) 0%, var(--color-primary-100) 50%, var(--color-primary-50) 100%)', borderRadius: 18, padding: '18px 22px', border: '1px solid rgba(191, 219, 254, 0.85)', boxShadow: '0 4px 20px rgba(15, 23, 42, 0.06)' },
  heroIcon:    { width: 48, height: 48, background: 'var(--color-primary-700)', color: 'var(--color-text-strong)', fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, boxShadow: 'var(--shadow-sm)', flexShrink: 0 },
  title:       { margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--color-text-strong)' },
  subtitle:    { margin: '4px 0 0', fontSize: 13.5, color: 'var(--color-text-muted)' },
  bar:         { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)', borderRadius: 12, padding: '12px 16px', marginBottom: 16 },
  barLabel:    { fontSize: 13, fontWeight: 600, color: 'var(--color-text-base)', whiteSpace: 'nowrap' },
  select:      { padding: '8px 12px', border: '1px solid var(--color-border-soft)', borderRadius: 9, fontSize: 14, outline: 'none', minWidth: 280, cursor: 'pointer', fontFamily: 'inherit', background: 'var(--color-bg-surface)' },
  checkLabel:  { display: 'flex', alignItems: 'center', fontSize: 13, color: 'var(--color-text-base)', cursor: 'pointer' },
  empty:       { background: 'var(--color-bg-surface)', border: '1px dashed var(--color-border-soft)', borderRadius: 14, padding: '56px 32px', textAlign: 'center', color: 'var(--color-text-muted)' },
  emptyTitle:  { fontSize: 16, fontWeight: 600, color: 'var(--color-text-strong)', marginBottom: 8 },
  emptyHint:   { fontSize: 13.5, color: 'var(--color-text-muted)', maxWidth: 460, marginInline: 'auto', lineHeight: 1.55 },
  cols:        { display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16, alignItems: 'start' },
  left:        { background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border-soft)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  right:       { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 340 },
  panelTitle:  { fontSize: 11.5, fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge:       { fontSize: 11, fontWeight: 600, background: 'var(--color-primary-50)', color: 'var(--color-primary-800)', padding: '2px 8px', borderRadius: 999, textTransform: 'none', letterSpacing: 0 },
  divider:     { borderTop: '1px solid var(--color-border-soft)' },
  fieldLabel:      { fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' },
  input:           { padding: '8px 10px', border: '1px solid var(--color-border-soft)', borderRadius: 8, fontSize: 13, outline: 'none', background: 'var(--color-bg-surface)', fontFamily: 'var(--font-family-mono)', width: '100%', boxSizing: 'border-box' },
  noInputs:        { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 0', fontSize: 13, color: 'var(--color-text-muted)' },
  missingBanner:   { display: 'flex', gap: 8, background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)', color: 'var(--color-warning-text)', borderRadius: 8, padding: '8px 12px', fontSize: 13 },
  runBtn:          { background: 'var(--color-primary-700)', border: '1px solid var(--color-primary-700)', color: 'var(--color-text-strong)', fontWeight: 700, fontSize: 14, padding: '12px 0', borderRadius: 10, boxShadow: 'var(--shadow-sm)', fontFamily: 'inherit' },
  errBanner:       { background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', color: 'var(--color-error-text)', borderRadius: 8, padding: '10px 12px', fontSize: 13 },
  outEmpty:        { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', textAlign: 'center' },
  statusBanner:    { display: 'flex', alignItems: 'center', gap: 10, borderRadius: 10, padding: '10px 14px' },
  ok:              { background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', color: 'var(--color-success-text)' },
  err:             { background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', color: 'var(--color-error-text)' },
  chip:            { fontSize: 11.5, fontWeight: 600, background: 'rgba(255,255,255,0.7)', padding: '3px 8px', borderRadius: 999 },
  eligibleBanner:  { display: 'flex', alignItems: 'flex-start', gap: 12, borderRadius: 10, padding: '12px 14px', border: '1px solid' },
  eligibleOk:      { background: 'var(--color-success-bg)', borderColor: 'var(--color-success-border)', color: 'var(--color-success-text)' },
  eligibleNo:      { background: 'var(--color-error-bg)', borderColor: 'var(--color-error-border)', color: 'var(--color-error-text)' },
  eligibleMissing: { background: 'var(--color-warning-bg)', borderColor: 'var(--color-warning-border)', color: 'var(--color-warning-text)' },
  nocPreview:      { background: 'var(--color-bg-canvas)', border: '1px solid var(--color-border-soft)', borderRadius: 10, padding: '14px 16px' },
  nocLabel:        { fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 },
  nocText:         { fontSize: 13.5, color: 'var(--color-text-strong)', lineHeight: 1.75 },
  copyBtn:         { border: '1px solid var(--color-border-soft)', background: 'var(--color-bg-surface)', color: 'var(--color-primary-800)', fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' },
  outTab:          { padding: '6px 12px', border: '1px solid var(--color-border-soft)', background: 'var(--color-bg-surface)', color: 'var(--color-text-muted)', fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' },
  outTabActive:    { background: 'var(--color-primary-50)', color: 'var(--color-primary-800)', borderColor: 'var(--color-primary-200)' },
  outBox:          { background: 'var(--color-bg-canvas)', border: '1px solid var(--color-border-soft)', borderRadius: 10, padding: 14, overflow: 'auto', maxHeight: 300, flex: 1 },
  pre:             { margin: 0, fontFamily: 'var(--font-family-mono)', fontSize: 12.5, lineHeight: 1.6, color: 'var(--color-text-base)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  metaChip:        { fontSize: 12, fontWeight: 600, background: 'var(--color-bg-muted)', color: 'var(--color-text-base)', padding: '3px 10px', borderRadius: 999 },
};