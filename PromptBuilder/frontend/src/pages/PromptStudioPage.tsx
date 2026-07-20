// src/pages/PromptStudioPage.tsx
//
// PB-016 — Studio shell (COMPLETE — all 8 tabs wired)
// PB-017 — Blocks editor
// PB-018 — Inputs editor
// PB-019 — Output schema editor
// PB-020 — Context bindings editor
// PB-021 — Run Console
// BONUS  — Guardrails editor
// BONUS  — Versions panel

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getPrompt,
  publishPrompt,
  savePromptBlocks,
  savePromptInputs,
  getPromptSchema,
  savePromptSchema,
  savePromptContextBindings,
} from '../api/prompts';
import type {
  PromptDetail,
  PromptBlock,
  PromptInput,
  PromptContextBinding,
} from '../types/api';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import ErrorAlert from '../components/shared/ErrorAlert';
import PromptBlocksEditor from '../components/prompts/PromptBlocksEditor';
import PromptInputsEditor from '../components/prompts/PromptInputsEditor';
import PromptOutputSchemaEditor from '../components/prompts/PromptOutputSchemaEditor';
import PromptContextBindingsEditor from '../components/prompts/PromptContextBindingsEditor';
import PromptRunConsole from '../components/prompts/PromptRunConsole';
import PromptGuardrailsEditor from '../components/prompts/PromptGuardrailsEditor';
import PromptVersionsPanel from '../components/prompts/PromptVersionsPanel';

// ============================================================================
// Constants
// ============================================================================

type TabKey =
  | 'overview' | 'inputs' | 'blocks' | 'context'
  | 'output'   | 'guardrails' | 'test' | 'versions';

interface TabDef { key: TabKey; label: string; icon: string; }

const TABS: TabDef[] = [
  { key: 'overview',   label: 'Overview',    icon: '📋' },
  { key: 'inputs',     label: 'Inputs',      icon: '🔡' },
  { key: 'blocks',     label: 'Blocks',      icon: '🧱' },
  { key: 'context',    label: 'Context',     icon: '🔌' },
  { key: 'output',     label: 'Output',      icon: '📤' },
  { key: 'guardrails', label: 'Guardrails',  icon: '🛡' },
  { key: 'test',       label: 'Run Console', icon: '▶️' },
  { key: 'versions',   label: 'Versions',    icon: '🕒' },
];

const STATUS_PILL: Record<string, { bg: string; color: string; label: string }> = {
  draft:      { bg: 'var(--color-warning-bg)', color: 'var(--color-warning-text)', label: 'draft' },
  testing:    { bg: 'var(--color-warning-bg)', color: 'var(--color-warning-text)', label: 'testing' },
  in_review:  { bg: '#fce7f3', color: '#9d174d', label: 'in review' },
  approved:   { bg: 'var(--color-info-bg)', color: 'var(--color-info-text)', label: 'approved' },
  published:  { bg: 'var(--color-success-bg)', color: 'var(--color-success-text)', label: 'published' },
  deprecated: { bg: 'var(--color-bg-muted)', color: 'var(--color-text-base)', label: 'deprecated' },
  archived:   { bg: 'var(--color-bg-muted)', color: '#6b7280', label: 'archived' },
};

// ============================================================================
// Component
// ============================================================================

export default function PromptStudioPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [prompt,    setPrompt]    = useState<PromptDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [isPublishing, setIsPublishing] = useState(false);
  const [savedFlash,   setSavedFlash]   = useState(false);

  // PB-017: blocks
  const [draftBlocks,    setDraftBlocks]    = useState<PromptBlock[]>([]);
  const [blocksDirty,    setBlocksDirty]    = useState(false);
  const [isSavingBlocks, setIsSavingBlocks] = useState(false);

  // PB-018: inputs
  const [draftInputs,    setDraftInputs]    = useState<PromptInput[]>([]);
  const [inputsDirty,    setInputsDirty]    = useState(false);
  const [isSavingInputs, setIsSavingInputs] = useState(false);

  // PB-019: output schema + guardrails (both on version row)
  const [draftOutputSchema,  setDraftOutputSchema]  = useState<Record<string, unknown>>({});
  const [draftGuardrails,    setDraftGuardrails]    = useState<Record<string, unknown>>({});
  const [outputSchemaDirty,  setOutputSchemaDirty]  = useState(false);
  const [guardrailsDirty,    setGuardrailsDirty]    = useState(false);
  const [isSavingSchema,     setIsSavingSchema]     = useState(false);

  // PB-020: context bindings
  const [draftBindings,    setDraftBindings]    = useState<PromptContextBinding[]>([]);
  const [bindingsDirty,    setBindingsDirty]    = useState(false);
  const [isSavingBindings, setIsSavingBindings] = useState(false);

  // ─── Load prompt + schema ──────────────────────────────────────────────
  const fetchPrompt = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getPrompt(id);
      setPrompt(data);
      try {
        const schema = await getPromptSchema(id);
        setDraftOutputSchema(schema.output_schema_json || {});
        setDraftGuardrails(schema.guardrails_json || {});
        setOutputSchemaDirty(false);
        setGuardrailsDirty(false);
      } catch { /* schema missing — ok */ }
    } catch (err) {
      setError((err as Error).message || 'Failed to load prompt');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => { if (!id) return; fetchPrompt(); }, [id, fetchPrompt]);

  useEffect(() => {
    if (prompt) {
      setDraftBlocks(prompt.blocks || []);           setBlocksDirty(false);
      setDraftInputs(prompt.inputs || []);           setInputsDirty(false);
      setDraftBindings(prompt.context_bindings || []); setBindingsDirty(false);
    }
  }, [prompt]);

  // ─── Gateway when no id ────────────────────────────────────────────────
  if (!id) {
    return (
      <div style={S.gateway}>
        <div style={S.gatewayBox}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔧</div>
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--color-text-strong)' }}>Open a prompt to start editing</h2>
          <p style={{ margin: '8px 0 18px', fontSize: 13.5, color: 'var(--color-text-muted)' }}>
            Click any prompt card from the list to open it here.
          </p>
          <button style={S.primaryBtn} onClick={() => navigate('/prompts')}>Go to My Prompts</button>
        </div>
      </div>
    );
  }

  // ─── Helpers ───────────────────────────────────────────────────────────
  function flashSaved() { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1500); }
  const anyDirty = blocksDirty || inputsDirty || outputSchemaDirty || guardrailsDirty || bindingsDirty;

  function handleBack() {
    if (anyDirty && !window.confirm('You have unsaved changes. Leave without saving?')) return;
    navigate('/prompts');
  }

  // Blocks
  function handleBlocksChange(next: PromptBlock[]) { setDraftBlocks(next); setBlocksDirty(true); }
  async function handleSaveBlocks() {
    if (!prompt) return;
    setIsSavingBlocks(true); setError(null);
    try {
      const payload = draftBlocks.map(b =>
        (!b.block_id || String(b.block_id).startsWith('new-')) ? { ...b, block_id: undefined } : b
      );
      const saved = await savePromptBlocks(prompt.prompt_id, payload as PromptBlock[]);
      setDraftBlocks(saved); setBlocksDirty(false); flashSaved();
    } catch (err) { setError((err as Error).message || 'Failed to save blocks'); }
    finally { setIsSavingBlocks(false); }
  }

  // Inputs
  function handleInputsChange(next: PromptInput[]) { setDraftInputs(next); setInputsDirty(true); }
  async function handleSaveInputs() {
    if (!prompt) return;
    const names = draftInputs.map(i => i.name.trim()).filter(Boolean);
    if (names.length !== new Set(names).size) { setError('Duplicate input names — fix first.'); return; }
    if (draftInputs.some(i => !i.name.trim())) { setError('Every input needs a name.'); return; }
    setIsSavingInputs(true); setError(null);
    try {
      const payload = draftInputs.map(i =>
        (!i.input_id || String(i.input_id).startsWith('new-')) ? { ...i, input_id: undefined } : i
      );
      const saved = await savePromptInputs(prompt.prompt_id, payload as PromptInput[]);
      setDraftInputs(saved); setInputsDirty(false); flashSaved();
    } catch (err) { setError((err as Error).message || 'Failed to save inputs'); }
    finally { setIsSavingInputs(false); }
  }

  // Output schema
  function handleOutputSchemaChange(next: Record<string, unknown>) {
    setDraftOutputSchema(next); setOutputSchemaDirty(true);
  }

  // Guardrails — saved together with output schema on the version row
  function handleGuardrailsChange(next: Record<string, unknown>) {
    setDraftGuardrails(next); setGuardrailsDirty(true);
  }

  async function handleSaveSchema(which: 'output' | 'guardrails') {
    if (!prompt) return;
    setIsSavingSchema(true); setError(null);
    try {
      const saved = await savePromptSchema(prompt.prompt_id, {
        output_schema_json: draftOutputSchema,
        guardrails_json:    draftGuardrails,
        change_summary: `Updated ${which} from Studio`,
      });
      setDraftOutputSchema(saved.output_schema_json || {});
      setDraftGuardrails(saved.guardrails_json || {});
      setOutputSchemaDirty(false);
      setGuardrailsDirty(false);
      await fetchPrompt();
      flashSaved();
    } catch (err) { setError((err as Error).message || `Failed to save ${which}`); }
    finally { setIsSavingSchema(false); }
  }

  // Bindings
  function handleBindingsChange(next: PromptContextBinding[]) { setDraftBindings(next); setBindingsDirty(true); }
  async function handleSaveBindings() {
    if (!prompt) return;
    const names = draftBindings.map(b => b.name.trim()).filter(Boolean);
    if (names.length !== new Set(names).size) { setError('Duplicate binding names — fix first.'); return; }
    if (draftBindings.some(b => !b.name.trim())) { setError('Every binding needs a name.'); return; }
    setIsSavingBindings(true); setError(null);
    try {
      const payload = draftBindings.map(b =>
        (!b.binding_id || String(b.binding_id).startsWith('new-')) ? { ...b, binding_id: undefined } : b
      );
      const saved = await savePromptContextBindings(prompt.prompt_id, payload as PromptContextBinding[]);
      setDraftBindings(saved); setBindingsDirty(false); flashSaved();
    } catch (err) { setError((err as Error).message || 'Failed to save bindings'); }
    finally { setIsSavingBindings(false); }
  }

  // Top-bar save routes to the active dirty tab
  const isSavingAny = isSavingBlocks || isSavingInputs || isSavingSchema || isSavingBindings;
  function handleTopBarSave() {
    if (activeTab === 'blocks'     && blocksDirty)      { handleSaveBlocks();         return; }
    if (activeTab === 'inputs'     && inputsDirty)      { handleSaveInputs();         return; }
    if (activeTab === 'output'     && outputSchemaDirty){ handleSaveSchema('output'); return; }
    if (activeTab === 'guardrails' && guardrailsDirty)  { handleSaveSchema('guardrails'); return; }
    if (activeTab === 'context'    && bindingsDirty)    { handleSaveBindings();       return; }
    flashSaved();
  }

  async function handlePublish() {
    if (!prompt) return;
    if (!window.confirm(`Publish "${prompt.name}"?\n\nCurrently published version will be deprecated.`)) return;
    setIsPublishing(true); setError(null);
    try {
      await publishPrompt(prompt.prompt_id, 'Published from Studio');
      await fetchPrompt();
    } catch (err) { setError((err as Error).message || 'Failed to publish'); }
    finally { setIsPublishing(false); }
  }

  // ─── Loading / error ──────────────────────────────────────────────────
  if (isLoading) return <div style={S.page}><LoadingSpinner message="Loading prompt..." /></div>;
  if (error || !prompt) {
    return (
      <div style={S.page}>
        <ErrorAlert message={error || 'Prompt not found'} onRetry={fetchPrompt} />
        <button style={{ ...S.secondaryBtn, marginTop: 16 }} onClick={() => navigate('/prompts')}>← Back</button>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────
  const sp = STATUS_PILL[prompt.status] || STATUS_PILL.archived;
  const lv = prompt.latest_version;

  const hasUnsavedActive =
    (activeTab === 'blocks'     && blocksDirty)      ||
    (activeTab === 'inputs'     && inputsDirty)      ||
    (activeTab === 'output'     && outputSchemaDirty)||
    (activeTab === 'guardrails' && guardrailsDirty)  ||
    (activeTab === 'context'    && bindingsDirty);

  const saveLabel = isSavingAny ? '⟳ Saving...'
    : savedFlash ? '✓ Saved'
    : hasUnsavedActive ? '💾 Save *' : '💾 Save';

  return (
    <div style={S.page}>

      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <div style={S.topBar}>
        <div style={S.topBarLeft}>
          <button style={S.backBtn} onClick={handleBack}>←</button>
          <div style={{ minWidth: 0 }}>
            <div style={S.titleRow}>
              <h1 style={S.promptName}>{prompt.name}</h1>
              <span style={{ ...S.statusPillStyle, background: sp.bg, color: sp.color }}>{sp.label}</span>
            </div>
            <div style={S.metaRow}>
              {lv && <span>Latest: <strong>v{lv.version_number}</strong> <span style={{ opacity: 0.6 }}>({lv.status})</span></span>}
              {prompt.use_case && <><span style={S.dot}>•</span><span>{prompt.use_case}</span></>}
              {prompt.industry && <><span style={S.dot}>•</span><span>{prompt.industry.replace(/_/g, ' ')}</span></>}
            </div>
          </div>
        </div>
        <div style={S.topBarActions}>
          <button
            style={{ ...S.secondaryBtn, ...(savedFlash ? S.btnFlash : {}), opacity: isSavingAny ? 0.7 : 1 }}
            onClick={handleTopBarSave} disabled={isSavingAny}
          >{saveLabel}</button>
          <button style={S.secondaryBtn} onClick={() => setActiveTab('test')}>▶ Test</button>
          <button
            style={{ ...S.publishBtn, opacity: isPublishing ? 0.7 : 1 }}
            onClick={handlePublish} disabled={isPublishing}
          >{isPublishing ? '⟳ Publishing...' : '🚀 Publish'}</button>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <div style={S.tabsBar}>
        {TABS.map((tab) => {
          const dirty =
            (tab.key === 'blocks'     && blocksDirty)      ||
            (tab.key === 'inputs'     && inputsDirty)      ||
            (tab.key === 'output'     && outputSchemaDirty)||
            (tab.key === 'guardrails' && guardrailsDirty)  ||
            (tab.key === 'context'    && bindingsDirty);
          return (
            <button
              key={tab.key}
              style={{ ...S.tab, ...(activeTab === tab.key ? S.tabActive : {}) }}
              onClick={() => setActiveTab(tab.key)}
            >
              <span style={{ marginRight: 6 }}>{tab.icon}</span>{tab.label}
              {dirty && <span style={S.tabDot} />}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ──────────────────────────────────────────────── */}
      <div style={S.tabContent}>
        {activeTab === 'overview'   && <OverviewTab prompt={prompt} />}
        {activeTab === 'inputs'     && <PromptInputsEditor inputs={draftInputs} onChange={handleInputsChange} disabled={isSavingInputs} />}
        {activeTab === 'blocks'     && <PromptBlocksEditor blocks={draftBlocks} onChange={handleBlocksChange} disabled={isSavingBlocks} />}
        {activeTab === 'context'    && <PromptContextBindingsEditor bindings={draftBindings} onChange={handleBindingsChange} disabled={isSavingBindings} />}
        {activeTab === 'output'     && <PromptOutputSchemaEditor value={draftOutputSchema} onChange={handleOutputSchemaChange} disabled={isSavingSchema} />}
        {activeTab === 'guardrails' && <PromptGuardrailsEditor value={draftGuardrails} onChange={handleGuardrailsChange} disabled={isSavingSchema} />}
        {activeTab === 'test'       && <PromptRunConsole promptId={prompt.prompt_id} inputs={draftInputs} />}
        {activeTab === 'versions'   && <PromptVersionsPanel promptId={prompt.prompt_id} onPublish={fetchPrompt} />}
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function OverviewTab({ prompt }: { prompt: PromptDetail }) {
  return (
    <div style={S.overviewGrid}>
      <OCard label="Prompt ID"   value={prompt.prompt_id}   mono />
      <OCard label="Status"      value={prompt.status} />
      <OCard label="Use case"    value={prompt.use_case  || '—'} />
      <OCard label="Industry"    value={prompt.industry  || '—'} />
      <OCard label="Owner"       value={prompt.owner     || '—'} />
      <OCard label="Created"     value={new Date(prompt.created_at).toLocaleString('en-IN')} />
      <OCard label="Updated"     value={new Date(prompt.updated_at).toLocaleString('en-IN')} />
      <OCard label="Composition" value={`${prompt.blocks.length} block(s) · ${prompt.inputs.length} input(s) · ${prompt.context_bindings.length} binding(s)`} />
      {prompt.description && (
        <div style={{ ...S.oCard, gridColumn: '1 / -1' }}>
          <div style={S.oLabel}>Description</div>
          <div style={S.oValue}>{prompt.description}</div>
        </div>
      )}
    </div>
  );
}

function OCard({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={S.oCard}>
      <div style={S.oLabel}>{label}</div>
      <div style={{ ...S.oValue, fontFamily: mono ? 'var(--font-family-mono)' : 'inherit', fontSize: mono ? 12 : 13 }}>{value}</div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const S: Record<string, React.CSSProperties> = {
  page:    { padding: '20px 24px', maxWidth: 1280, margin: '0 auto', fontFamily: "var(--font-family-sans)" },
  gateway: { padding: '60px 24px', display: 'flex', justifyContent: 'center', fontFamily: "var(--font-family-sans)" },
  gatewayBox: { background: 'var(--color-bg-surface)', border: '1px dashed var(--color-border-soft)', borderRadius: 14, padding: '40px 32px', textAlign: 'center', maxWidth: 420 },

  topBar: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: 'linear-gradient(135deg, var(--color-primary-50) 0%, var(--color-primary-100) 50%, var(--color-primary-50) 100%)',
    border: '1px solid rgba(191, 219, 254, 0.85)', borderRadius: 16, padding: '14px 18px',
    marginBottom: 14, boxShadow: '0 4px 20px rgba(15, 23, 42, 0.06)',
  },
  topBarLeft:    { display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 },
  topBarActions: { display: 'flex', gap: 8, flexShrink: 0 },
  backBtn: {
    width: 38, height: 38, border: '1px solid rgba(191, 219, 254, 0.85)',
    background: 'rgba(255,255,255,0.85)', borderRadius: 10, cursor: 'pointer',
    fontSize: 16, color: 'var(--color-primary-800)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  titleRow:        { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  promptName:      { margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--color-text-strong)', lineHeight: 1.2 },
  metaRow:         { display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: 12, color: 'var(--color-text-muted)', flexWrap: 'wrap' },
  dot:             { color: 'var(--color-border-base)' },
  statusPillStyle: { fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 999, textTransform: 'lowercase' },

  primaryBtn: {
    background: 'var(--color-primary-700)',
    border: '1px solid var(--color-primary-700)', color: 'var(--color-text-strong)', fontWeight: 600, fontSize: 13,
    padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
    boxShadow: 'var(--shadow-sm)', fontFamily: 'inherit',
  },
  secondaryBtn: {
    background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(191, 219, 254, 0.85)',
    color: 'var(--color-primary-800)', fontWeight: 600, fontSize: 13, padding: '8px 14px',
    borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
  },
  publishBtn: {
    background: 'linear-gradient(135deg, var(--color-accent-500) 0%, var(--color-accent-700) 100%)',
    border: '1px solid var(--color-primary-700)', color: 'var(--color-text-strong)', fontWeight: 600, fontSize: 13,
    padding: '8px 16px', borderRadius: 9, cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(16,185,129,0.3)', fontFamily: 'inherit',
  },
  btnFlash: { background: 'var(--color-success-bg)', color: 'var(--color-success-text)', borderColor: 'var(--color-success-border)' },

  tabsBar: {
    display: 'flex', gap: 4, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)',
    borderRadius: 12, padding: 6, marginBottom: 14, overflowX: 'auto',
  },
  tab: {
    padding: '8px 14px', border: 'none', background: 'transparent',
    color: 'var(--color-text-muted)', fontSize: 13, fontWeight: 600, borderRadius: 8,
    cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', gap: 4,
  },
  tabActive: {
    background: 'var(--color-primary-50)',
    color: 'var(--color-primary-800)', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
  },
  tabDot: { width: 7, height: 7, borderRadius: 999, background: '#f59e0b', marginLeft: 4, display: 'inline-block' },
  tabContent: { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)', borderRadius: 14, padding: 24, minHeight: 380 },

  overviewGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 },
  oCard:  { background: 'var(--color-bg-elevated)', border: '1px solid var(--color-bg-muted)', borderRadius: 10, padding: 14 },
  oLabel: { fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-soft)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 },
  oValue: { fontSize: 13, color: 'var(--color-text-strong)', wordBreak: 'break-word', lineHeight: 1.5 },
};