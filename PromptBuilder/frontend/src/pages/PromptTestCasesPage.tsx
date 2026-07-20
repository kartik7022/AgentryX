// src/pages/PromptTestCasesPage.tsx
// Added: Edit test case functionality

import { useState, useEffect, useCallback } from 'react';
import {
  listPrompts,
  listPromptTestCases,
  createPromptTestCase,
  deletePromptTestCase,
  evaluatePromptTestCases,
} from '../api/prompts';
import { apiRequest } from '../api/client';
import type { Prompt, PromptTestCase, PromptEvaluationSweep } from '../types/api';

function relativeTime(iso: string): string {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

const EMPTY_FORM = {
  name: '',
  description: '',
  runtime_params: '{}',
  expected_checks: '[\n  {"type":"json_equals","path":"eligible","value":"yes"}\n]',
};

async function updatePromptTestCase(
  promptId: string,
  testId: string,
  payload: {
    name?: string;
    description?: string;
    runtime_params_json?: Record<string, unknown>;
    expected_checks_json?: unknown[];
  }
) {
  return apiRequest({ method: 'PUT', url: `/prompts/${promptId}/test-cases/${testId}`, data: payload });
}

export default function PromptTestCasesPage() {
  const [prompts,          setPrompts]          = useState<Prompt[]>([]);
  const [selectedId,       setSelectedId]       = useState('');
  const [testCases,        setTestCases]        = useState<PromptTestCase[]>([]);
  const [isLoadingPrompts, setIsLoadingPrompts] = useState(true);
  const [isLoadingCases,   setIsLoadingCases]   = useState(false);
  const [isRunning,        setIsRunning]        = useState(false);
  const [sweepResult,      setSweepResult]      = useState<PromptEvaluationSweep | null>(null);
  const [error,            setError]            = useState<string | null>(null);

  // Add form state
  const [showAddForm,  setShowAddForm]  = useState(false);
  const [form,         setForm]         = useState({ ...EMPTY_FORM });
  const [isCreating,   setIsCreating]   = useState(false);

  // Edit form state
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [editForm,     setEditForm]     = useState({ ...EMPTY_FORM });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoadingPrompts(true);
    listPrompts()
      .then(data => setPrompts(data.filter(p => p.status !== 'archived')))
      .catch(err => setError((err as Error).message))
      .finally(() => setIsLoadingPrompts(false));
  }, []);

  const fetchTestCases = useCallback(async () => {
    if (!selectedId) return;
    setIsLoadingCases(true);
    setError(null);
    setSweepResult(null);
    try {
      const data = await listPromptTestCases(selectedId);
      setTestCases(data);
    } catch (err) {
      setError((err as Error).message || 'Failed to load test cases');
    } finally {
      setIsLoadingCases(false);
    }
  }, [selectedId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchTestCases(); }, [fetchTestCases]);

  async function handleRunAll() {
    if (!selectedId) return;
    setIsRunning(true);
    setError(null);
    setSweepResult(null);
    try {
      const result = await evaluatePromptTestCases(selectedId);
      setSweepResult(result);
    } catch (err) {
      setError((err as Error).message || 'Failed to run tests');
    } finally {
      setIsRunning(false);
    }
  }

  async function handleDelete(testId: string, name: string) {
    if (!window.confirm(`Delete "${name}"?`)) return;
    try {
      await deletePromptTestCase(selectedId, testId);
      setTestCases(prev => prev.filter(t => t.test_id !== testId));
      setSweepResult(null);
    } catch (err) {
      setError((err as Error).message || 'Failed to delete');
    }
  }

  async function handleCreate() {
    if (!form.name.trim()) { setError('Name is required'); return; }
    let params: Record<string, unknown> = {};
    let checks: unknown[] = [];
    try { params = JSON.parse(form.runtime_params || '{}'); } catch { setError('Runtime params must be valid JSON'); return; }
    try { checks = JSON.parse(form.expected_checks || '[]'); } catch { setError('Expected checks must be valid JSON array'); return; }
    setIsCreating(true);
    setError(null);
    try {
      const created = await createPromptTestCase(selectedId, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        runtime_params_json: params,
        expected_checks_json: checks as Array<{ type: string; path?: string; value?: unknown }>,
      });
      setTestCases(prev => [created, ...prev]);
      setShowAddForm(false);
      setForm({ ...EMPTY_FORM });
      setSweepResult(null);
    } catch (err) {
      setError((err as Error).message || 'Failed to create');
    } finally {
      setIsCreating(false);
    }
  }

  function startEdit(tc: PromptTestCase) {
    setEditingId(tc.test_id);
    setEditForm({
      name: tc.name,
      description: tc.description || '',
      runtime_params: JSON.stringify(tc.runtime_params_json || {}, null, 2),
      expected_checks: JSON.stringify(tc.expected_checks_json || [], null, 2),
    });
    setSweepResult(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm({ ...EMPTY_FORM });
  }

  async function handleSaveEdit(testId: string) {
    if (!editForm.name.trim()) { setError('Name is required'); return; }
    let params: Record<string, unknown> = {};
    let checks: unknown[] = [];
    try { params = JSON.parse(editForm.runtime_params || '{}'); } catch { setError('Runtime params must be valid JSON'); return; }
    try { checks = JSON.parse(editForm.expected_checks || '[]'); } catch { setError('Expected checks must be valid JSON array'); return; }
    setIsSavingEdit(true);
    setError(null);
    try {
      await updatePromptTestCase(selectedId, testId, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || undefined,
        runtime_params_json: params,
        expected_checks_json: checks,
      });
      await fetchTestCases();
      setEditingId(null);
    } catch (err) {
      setError((err as Error).message || 'Failed to save');
    } finally {
      setIsSavingEdit(false);
    }
  }

  const sweepMap = sweepResult
    ? Object.fromEntries(sweepResult.results.map(r => [r.test_id, r]))
    : null;
  const selectedPrompt = prompts.find(p => p.prompt_id === selectedId);

  return (
    <div style={S.page}>

      {/* Hero */}
      <div style={S.hero}>
        <div style={S.heroIcon}>🧪</div>
        <div>
          <h1 style={S.title}>Test Cases</h1>
          <p style={S.subtitle}>Save golden examples, run regression sweeps, track pass/fail history before publishing.</p>
        </div>
      </div>

      {/* Selector bar */}
      <div style={S.selectorBar}>
        <div style={S.selectorLeft}>
          <span style={S.selectorLabel}>Prompt:</span>
          <select value={selectedId} onChange={e => { setSelectedId(e.target.value); setSweepResult(null); }} style={S.select} disabled={isLoadingPrompts}>
            <option value="">{isLoadingPrompts ? 'Loading...' : '— select a prompt —'}</option>
            {prompts.map(p => (
              <option key={p.prompt_id} value={p.prompt_id}>{p.name}{p.status === 'published' ? ' ✅' : ' (draft)'}</option>
            ))}
          </select>
        </div>
        {selectedId && (
          <div style={S.selectorRight}>
            <button type="button" style={S.addBtn} onClick={() => setShowAddForm(true)} disabled={isLoadingCases}>+ Add test case</button>
            <button type="button" style={{ ...S.runBtn, opacity: (isRunning || testCases.length === 0) ? 0.6 : 1 }}
              onClick={handleRunAll} disabled={isRunning || testCases.length === 0}>
              {isRunning ? '⟳ Running...' : `▶ Run All (${testCases.length})`}
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={S.errorBanner}>
          ⚠️ {error}
          <button type="button" style={S.dismissBtn} onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Sweep result */}
      {sweepResult && (
        <div style={{ ...S.sweepBanner, ...(sweepResult.failed_count === 0 ? S.sweepOk : S.sweepErr) }}>
          <span style={{ fontSize: 18 }}>{sweepResult.failed_count === 0 ? '✅' : '❌'}</span>
          <strong style={{ flex: 1 }}>{sweepResult.summary}</strong>
          <button type="button" style={S.dismissBtn} onClick={() => setSweepResult(null)}>×</button>
        </div>
      )}

      {/* No prompt selected */}
      {!selectedId && !isLoadingPrompts && (
        <div style={S.empty}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🧪</div>
          <div style={S.emptyTitle}>Select a prompt to see its test cases</div>
          <div style={S.emptyHint}>Test cases let you save golden examples and run regression sweeps before publishing.</div>
        </div>
      )}

      {/* Add form */}
      {showAddForm && (
        <div style={S.formCard}>
          <div style={S.formHeader}>
            <div style={S.formTitle}>+ New Test Case — {selectedPrompt?.name}</div>
            <button type="button" style={S.closeBtn} onClick={() => { setShowAddForm(false); setForm({ ...EMPTY_FORM }); }}>×</button>
          </div>
          <div style={S.formBody}>
            <div style={S.field}>
              <label style={S.fieldLabel}>Name *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Closed loan — should be eligible" style={S.input} autoFocus />
            </div>
            <div style={S.field}>
              <label style={S.fieldLabel}>Description</label>
              <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description" style={S.input} />
            </div>
            <div style={S.twoCol}>
              <div style={S.field}>
                <label style={S.fieldLabel}>Runtime params (JSON object)</label>
                <textarea value={form.runtime_params} onChange={e => setForm({ ...form, runtime_params: e.target.value })}
                  rows={5} style={{ ...S.input, ...S.mono, resize: 'vertical' }} />
              </div>
              <div style={S.field}>
                <label style={S.fieldLabel}>Expected checks (JSON array)</label>
                <textarea value={form.expected_checks} onChange={e => setForm({ ...form, expected_checks: e.target.value })}
                  rows={5} style={{ ...S.input, ...S.mono, resize: 'vertical' }} />
              </div>
            </div>
            <div style={S.formFooter}>
              <div style={S.chipRow}>
                {['json_equals', 'json_path_exists', 'contains', 'regex'].map(t => <span key={t} style={S.chip}>{t}</span>)}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" style={S.cancelBtn} onClick={() => { setShowAddForm(false); setForm({ ...EMPTY_FORM }); }}>Cancel</button>
                <button type="button" style={{ ...S.runBtn, opacity: isCreating ? 0.7 : 1 }} onClick={handleCreate} disabled={isCreating || !form.name.trim()}>
                  {isCreating ? '⟳ Saving...' : '+ Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty test cases */}
      {selectedId && !isLoadingCases && testCases.length === 0 && !showAddForm && (
        <div style={S.empty}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
          <div style={S.emptyTitle}>No test cases yet for "{selectedPrompt?.name}"</div>
          <div style={S.emptyHint}>Add test cases to verify this prompt returns the correct output for known inputs.</div>
          <button type="button" style={{ ...S.runBtn, marginTop: 16 }} onClick={() => setShowAddForm(true)}>+ Add first test case</button>
        </div>
      )}

      {/* Test case list */}
      {selectedId && !isLoadingCases && testCases.length > 0 && (
        <div style={S.list}>
          {testCases.map(tc => {
            const sweep  = sweepMap?.[tc.test_id];
            const passed = sweep?.passed;
            const isEditing = editingId === tc.test_id;

            return (
              <div key={tc.test_id} style={{ ...S.card, ...(sweep ? (passed ? S.cardPass : S.cardFail) : {}) }}>

                {isEditing ? (
                  /* ── EDIT MODE ── */
                  <div style={{ flex: 1 }}>
                    <div style={{ ...S.formHeader, padding: '0 0 12px' }}>
                      <div style={S.formTitle}>✏️ Edit Test Case</div>
                      <button type="button" style={S.closeBtn} onClick={cancelEdit}>×</button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={S.field}>
                        <label style={S.fieldLabel}>Name *</label>
                        <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                          style={S.input} autoFocus />
                      </div>
                      <div style={S.field}>
                        <label style={S.fieldLabel}>Description</label>
                        <input type="text" value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                          placeholder="Optional" style={S.input} />
                      </div>
                      <div style={S.twoCol}>
                        <div style={S.field}>
                          <label style={S.fieldLabel}>Runtime params</label>
                          <textarea value={editForm.runtime_params} onChange={e => setEditForm({ ...editForm, runtime_params: e.target.value })}
                            rows={4} style={{ ...S.input, ...S.mono, resize: 'vertical' }} />
                        </div>
                        <div style={S.field}>
                          <label style={S.fieldLabel}>Expected checks</label>
                          <textarea value={editForm.expected_checks} onChange={e => setEditForm({ ...editForm, expected_checks: e.target.value })}
                            rows={4} style={{ ...S.input, ...S.mono, resize: 'vertical' }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button type="button" style={S.cancelBtn} onClick={cancelEdit}>Cancel</button>
                        <button type="button" style={{ ...S.runBtn, opacity: isSavingEdit ? 0.7 : 1 }}
                          onClick={() => handleSaveEdit(tc.test_id)} disabled={isSavingEdit || !editForm.name.trim()}>
                          {isSavingEdit ? '⟳ Saving...' : '💾 Save changes'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── VIEW MODE ── */
                  <>
                    <div style={{ ...S.icon, background: sweep ? (passed ? 'var(--color-success-bg)' : 'var(--color-error-bg)') : 'var(--color-bg-muted)', color: sweep ? (passed ? 'var(--color-success-text)' : 'var(--color-error-text)') : 'var(--color-text-muted)' }}>
                      {sweep ? (passed ? '✅' : '❌') : '🧪'}
                    </div>
                    <div style={S.cardBody}>
                      <div style={S.cardName}>{tc.name}</div>
                      {tc.description && <div style={S.cardDesc}>{tc.description}</div>}
                      <div style={S.metaSection}>
                        {Object.keys(tc.runtime_params_json || {}).length > 0 && (
                          <div style={S.metaRow}>
                            <span style={S.metaLabel}>Params:</span>
                            {Object.entries(tc.runtime_params_json).map(([k, v]) => (
                              <span key={k} style={S.blueChip}>{k}: <strong>{String(v)}</strong></span>
                            ))}
                          </div>
                        )}
                        {(tc.expected_checks_json || []).length > 0 && (
                          <div style={S.metaRow}>
                            <span style={S.metaLabel}>Checks ({tc.expected_checks_json.length}):</span>
                            {tc.expected_checks_json.map((ch, i) => (
                              <span key={i} style={S.purpleChip}>
                                {ch.type}{ch.path ? `:${ch.path}` : ''}{ch.value !== undefined ? `=${JSON.stringify(ch.value)}` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                        {sweep && (
                          <div style={S.metaRow}>
                            <span style={{ ...S.resultChip, background: passed ? 'var(--color-success-bg)' : 'var(--color-error-bg)', color: passed ? 'var(--color-success-text)' : 'var(--color-error-text)' }}>
                              {sweep.summary}
                            </span>
                            {sweep.error_message && <span style={{ fontSize: 12, color: 'var(--color-error-text)' }}>{sweep.error_message}</span>}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--color-text-soft)', marginTop: 8 }}>Added {relativeTime(tc.created_at)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button type="button" style={S.editBtn} onClick={() => startEdit(tc)} title="Edit">✏️</button>
                      <button type="button" style={S.delBtn} onClick={() => handleDelete(tc.test_id, tc.name)} title="Delete">🗑</button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      {selectedId && testCases.length > 0 && (
        <div style={S.footer}>
          <span><strong>{testCases.length}</strong> test case{testCases.length === 1 ? '' : 's'}</span>
          {sweepResult && (
            <>
              <span style={{ color: 'var(--color-border-base)' }}>·</span>
              <span style={{ color: 'var(--color-success-text)', fontWeight: 600 }}>✅ {sweepResult.passed_count} passed</span>
              {sweepResult.failed_count > 0 && (
                <><span style={{ color: 'var(--color-border-base)' }}>·</span>
                <span style={{ color: 'var(--color-error-text)', fontWeight: 600 }}>❌ {sweepResult.failed_count} failed</span></>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: { padding: '20px 24px', maxWidth: 1160, margin: '0 auto', fontFamily: "var(--font-family-sans)" },
  hero: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18, background: 'linear-gradient(135deg, var(--color-success-bg) 0%, var(--color-success-bg) 50%, var(--color-success-bg) 100%)', borderRadius: 18, padding: '18px 22px', border: '1px solid rgba(16,185,129,0.18)', boxShadow: '0 4px 20px rgba(16,185,129,0.08)' },
  heroIcon: { width: 48, height: 48, background: 'linear-gradient(135deg, var(--color-accent-500) 0%, var(--color-accent-700) 100%)', color: 'var(--color-text-strong)', fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, flexShrink: 0 },
  title:    { margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--color-text-strong)' },
  subtitle: { margin: '4px 0 0', fontSize: 13.5, color: 'var(--color-text-muted)' },
  selectorBar:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 16, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)', borderRadius: 12, padding: '12px 16px' },
  selectorLeft:  { display: 'flex', alignItems: 'center', gap: 12 },
  selectorRight: { display: 'flex', gap: 8 },
  selectorLabel: { fontSize: 13, fontWeight: 600, color: 'var(--color-text-base)', whiteSpace: 'nowrap' },
  select:    { padding: '8px 12px', border: '1px solid var(--color-border-soft)', borderRadius: 9, fontSize: 14, outline: 'none', minWidth: 300, cursor: 'pointer', fontFamily: 'inherit', background: 'var(--color-bg-surface)' },
  addBtn:    { background: 'var(--color-bg-surface)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--color-accent-700)', fontWeight: 600, fontSize: 13, padding: '9px 16px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' },
  runBtn:    { background: 'linear-gradient(135deg, var(--color-accent-500) 0%, var(--color-accent-700) 100%)', border: '1px solid var(--color-primary-700)', color: 'var(--color-text-strong)', fontWeight: 600, fontSize: 13, padding: '9px 18px', borderRadius: 9, cursor: 'pointer', boxShadow: '0 4px 12px rgba(16,185,129,0.3)', fontFamily: 'inherit' },
  cancelBtn: { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)', color: 'var(--color-text-base)', fontWeight: 600, fontSize: 13, padding: '9px 16px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' },
  errorBanner:  { display: 'flex', alignItems: 'center', gap: 10, background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', color: 'var(--color-error-text)', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14 },
  sweepBanner:  { display: 'flex', alignItems: 'center', gap: 12, borderRadius: 12, padding: '12px 16px', marginBottom: 14, fontSize: 14 },
  sweepOk:      { background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', color: 'var(--color-success-text)' },
  sweepErr:     { background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', color: 'var(--color-error-text)' },
  dismissBtn:   { marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: 'inherit', padding: '0 4px' },
  formCard:     { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)', borderRadius: 14, marginBottom: 16, boxShadow: '0 4px 20px rgba(15, 23, 42, 0.08)' },
  formHeader:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--color-bg-muted)' },
  formTitle:    { fontSize: 15, fontWeight: 700, color: 'var(--color-text-strong)' },
  closeBtn:     { background: 'transparent', border: 'none', fontSize: 22, color: 'var(--color-text-soft)', cursor: 'pointer', padding: '0 4px' },
  formBody:     { padding: 20, display: 'flex', flexDirection: 'column', gap: 14 },
  formFooter:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  chipRow:      { display: 'flex', gap: 6, flexWrap: 'wrap' },
  chip:         { fontSize: 11.5, fontWeight: 600, background: 'var(--color-bg-muted)', color: 'var(--color-text-base)', padding: '3px 10px', borderRadius: 999 },
  field:        { display: 'flex', flexDirection: 'column', gap: 5 },
  twoCol:       { display: 'flex', gap: 14 },
  fieldLabel:   { fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' },
  input:        { padding: '9px 12px', border: '1px solid var(--color-border-soft)', borderRadius: 8, fontSize: 13, outline: 'none', background: 'var(--color-bg-surface)', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
  mono:         { fontFamily: 'var(--font-family-mono)' },
  list:         { display: 'flex', flexDirection: 'column', gap: 10 },
  card:         { display: 'flex', alignItems: 'flex-start', gap: 14, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)', borderRadius: 14, padding: '16px 18px' },
  cardPass:     { borderColor: 'var(--color-success-border)', background: 'var(--color-success-bg)' },
  cardFail:     { borderColor: 'var(--color-error-border)', background: 'var(--color-error-bg)' },
  icon:         { width: 40, height: 40, flexShrink: 0, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  cardBody:     { flex: 1, minWidth: 0 },
  cardName:     { fontSize: 14, fontWeight: 600, color: 'var(--color-text-strong)', marginBottom: 3 },
  cardDesc:     { fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 6 },
  metaSection:  { display: 'flex', flexDirection: 'column', gap: 5 },
  metaRow:      { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  metaLabel:    { fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-soft)' },
  blueChip:     { fontSize: 11.5, background: 'var(--color-info-bg)', color: 'var(--color-info-text)', padding: '2px 9px', borderRadius: 999, fontFamily: 'var(--font-family-mono)' },
  purpleChip:   { fontSize: 11.5, background: 'var(--color-primary-50)', color: 'var(--color-primary-800)', padding: '2px 9px', borderRadius: 999, fontFamily: 'var(--font-family-mono)' },
  resultChip:   { fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999 },
  editBtn:      { width: 32, height: 32, flexShrink: 0, border: '1px solid var(--color-border-soft)', background: 'var(--color-bg-surface)', borderRadius: 8, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  delBtn:       { width: 32, height: 32, flexShrink: 0, border: '1px solid var(--color-error-border)', background: 'var(--color-error-bg)', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: 'var(--color-error-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  empty:        { background: 'var(--color-bg-surface)', border: '1px dashed var(--color-border-soft)', borderRadius: 14, padding: '56px 32px', textAlign: 'center', color: 'var(--color-text-muted)' },
  emptyTitle:   { fontSize: 16, fontWeight: 600, color: 'var(--color-text-strong)', marginBottom: 8 },
  emptyHint:    { fontSize: 13.5, color: 'var(--color-text-muted)', maxWidth: 460, marginInline: 'auto', lineHeight: 1.55 },
  footer:       { display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, color: 'var(--color-text-muted)', padding: '12px 16px', marginTop: 8, background: 'var(--color-bg-elevated)', borderRadius: 10 },
};