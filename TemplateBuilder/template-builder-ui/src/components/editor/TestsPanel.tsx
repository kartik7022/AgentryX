// src/components/editor/TestsPanel.tsx
// Full implementation — saves to DB via backend API, not localStorage.
// Features: create/edit/delete tests, run single or all, see pass/fail + rendered preview.

import { useState, useEffect } from 'react';
import apiClient from '../../api/client';

interface TestCase {
  test_id: string;
  template_id: string;
  name: string;
  description: string;
  runtime_params: Record<string, string>;
  expected_strings: string[];
  created_by: string;
  created_at: string | null;
}

interface TestResult {
  test_id: string;
  name: string;
  status: 'pass' | 'fail' | 'error';
  message: string;
  checks_passed: number;
  checks_total: number;
  rendered_html?: string;
}

interface Props {
  templateId: string;
  onClose: () => void;
}

const EMPTY_FORM = {
  name: '',
  description: '',
  runtime_params: '{}',
  expected_strings: '',
};

// ── API helpers ───────────────────────────────────────────────────────────────
async function fetchTests(templateId: string): Promise<TestCase[]> {
  const r = await apiClient.get(`/templates/${templateId}/tests`);
  return r.data;
}

async function createTest(templateId: string, data: object): Promise<TestCase> {
  const r = await apiClient.post(`/templates/${templateId}/tests`, data);
  return r.data;
}

async function updateTest(templateId: string, testId: string, data: object): Promise<TestCase> {
  const r = await apiClient.put(`/templates/${templateId}/tests/${testId}`, data);
  return r.data;
}

async function deleteTest(templateId: string, testId: string): Promise<void> {
  await apiClient.delete(`/templates/${templateId}/tests/${testId}`);
}

async function runOneTest(templateId: string, testId: string): Promise<TestResult> {
  const r = await apiClient.post(`/templates/${templateId}/tests/${testId}/run`);
  return r.data;
}

async function runAllTests(templateId: string): Promise<{ results: TestResult[]; summary: Record<string, number> }> {
  const r = await apiClient.post(`/templates/${templateId}/tests/run-all`);
  return r.data;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function TestsPanel({ templateId, onClose }: Props) {
  const [tests, setTests]           = useState<TestCase[]>([]);
  const [results, setResults]       = useState<Record<string, TestResult>>({});
  const [isLoading, setIsLoading]   = useState(true);
  const [isRunning, setIsRunning]   = useState<string | null>(null); // test_id or 'all'
  const [showForm, setShowForm]     = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [form, setForm]             = useState({ ...EMPTY_FORM });
  const [formError, setFormError]   = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewTestName, setPreviewTestName] = useState('');

  // Load tests from backend on mount
  useEffect(() => {
    fetchTests(templateId)
      .then(setTests)
      .catch(() => setTests([]))
      .finally(() => setIsLoading(false));
  }, [templateId]);

  function handleField(key: keyof typeof EMPTY_FORM, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function openNewForm() {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(test: TestCase) {
    setForm({
      name: test.name,
      description: test.description,
      runtime_params: JSON.stringify(test.runtime_params, null, 2),
      expected_strings: test.expected_strings.join('\n'),
    });
    setEditingId(test.test_id);
    setFormError(null);
    setShowForm(true);
  }

  async function handleSave() {
    setFormError(null);
    if (!form.name.trim()) { setFormError('Test name is required'); return; }

    let params: Record<string, string>;
    try {
      params = JSON.parse(form.runtime_params || '{}');
    } catch {
      setFormError('Runtime params must be valid JSON  e.g. {"customer_name": "John"}');
      return;
    }

    const expectedStrings = form.expected_strings
      .split('\n').map(s => s.trim()).filter(Boolean);

    const body = {
      name: form.name.trim(),
      description: form.description.trim(),
      runtime_params: params,
      expected_strings: expectedStrings,
      created_by: localStorage.getItem('tb_user_id') ?? 'dev_user',
    };

    setSaveLoading(true);
    try {
      if (editingId) {
        const updated = await updateTest(templateId, editingId, body);
        setTests(prev => prev.map(t => t.test_id === editingId ? updated : t));
      } else {
        const created = await createTest(templateId, body);
        setTests(prev => [...prev, created]);
      }
      setShowForm(false);
      setEditingId(null);
    } catch (err) {
      setFormError((err as Error).message || 'Save failed');
    } finally {
      setSaveLoading(false);
    }
  }

  async function handleDelete(testId: string) {
    if (!window.confirm('Delete this test?')) return;
    try {
      await deleteTest(templateId, testId);
      setTests(prev => prev.filter(t => t.test_id !== testId));
      setResults(prev => { const c = { ...prev }; delete c[testId]; return c; });
    } catch {
      alert('Delete failed. Please try again.');
    }
  }

  async function handleRunOne(test: TestCase) {
    setIsRunning(test.test_id);
    setPreviewHtml(null);
    try {
      const result = await runOneTest(templateId, test.test_id);
      setResults(prev => ({ ...prev, [test.test_id]: result }));
    } catch (err) {
      setResults(prev => ({
        ...prev,
        [test.test_id]: {
          test_id: test.test_id,
          name: test.name,
          status: 'error',
          message: (err as Error).message,
          checks_passed: 0,
          checks_total: test.expected_strings.length,
        }
      }));
    } finally {
      setIsRunning(null);
    }
  }

  async function handleRunAll() {
    if (tests.length === 0) return;
    setIsRunning('all');
    setPreviewHtml(null);
    try {
      const { results: allResults } = await runAllTests(templateId);
      const map: Record<string, TestResult> = {};
      allResults.forEach(r => { map[r.test_id] = r; });
      setResults(map);
    } catch (err) {
      alert('Run all failed: ' + (err as Error).message);
    } finally {
      setIsRunning(null);
    }
  }

  function showPreview(result: TestResult, testName: string) {
    if (result.rendered_html) {
      setPreviewHtml(result.rendered_html);
      setPreviewTestName(testName);
    }
  }

  const resultList = Object.values(results);
  const passCount  = resultList.filter(r => r.status === 'pass').length;
  const failCount  = resultList.filter(r => r.status !== 'pass').length;

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.panel} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={S.header}>
          <div>
            <h2 style={S.title}>🧪 Template Tests</h2>
            <p style={S.subtitle}>Define and run tests before publishing</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {resultList.length > 0 && (
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ ...S.badge, background: '#dcfce7', color: '#166534' }}>✓ {passCount} passed</span>
                {failCount > 0 && <span style={{ ...S.badge, background: '#fee2e2', color: '#991b1b' }}>✗ {failCount} failed</span>}
              </div>
            )}
            <button style={S.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={S.body}>

          {/* Action bar */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={S.newBtn} onClick={openNewForm}>+ New Test</button>
            {tests.length > 0 && (
              <button
                style={{ ...S.runAllBtn, opacity: isRunning ? 0.7 : 1 }}
                onClick={handleRunAll}
                disabled={!!isRunning}
              >
                {isRunning === 'all' ? '⟳ Running...' : '▶ Run All'}
              </button>
            )}
          </div>

          {/* Form */}
          {showForm && (
            <div style={S.form}>
              <div style={S.formTitle}>{editingId ? 'Edit Test' : 'New Test'}</div>

              {formError && <div style={S.formError}>{formError}</div>}

              <div style={S.field}>
                <label style={S.label}>Test Name <span style={{ color: '#ef4444' }}>*</span></label>
                <input style={S.input} value={form.name}
                  onChange={e => handleField('name', e.target.value)}
                  placeholder="e.g. Loan letter — John Valid" />
              </div>

              <div style={S.field}>
                <label style={S.label}>Description</label>
                <input style={S.input} value={form.description}
                  onChange={e => handleField('description', e.target.value)}
                  placeholder="What does this test verify?" />
              </div>

              <div style={S.field}>
                <label style={S.label}>Runtime Params (JSON)</label>
                <textarea style={S.textarea} rows={3}
                  value={form.runtime_params}
                  onChange={e => handleField('runtime_params', e.target.value)}
                  placeholder={'{\n  "customer_name": "John Valid",\n  "loan_amount": "5,00,000"\n}'}
                />
                <p style={S.hint}>Values to substitute for {'{{placeholder}}'}</p>
              </div>

              <div style={S.field}>
                <label style={S.label}>Expected Strings (one per line)</label>
                <textarea style={S.textarea} rows={3}
                  value={form.expected_strings}
                  onChange={e => handleField('expected_strings', e.target.value)}
                  placeholder={"John Valid\n5,00,000\nLN12345"}
                />
                <p style={S.hint}>These strings must appear in the rendered output to pass</p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button style={S.cancelBtn}
                  onClick={() => { setShowForm(false); setEditingId(null); setFormError(null); }}>
                  Cancel
                </button>
                <button style={{ ...S.saveBtn, opacity: saveLoading ? 0.7 : 1 }}
                  onClick={handleSave} disabled={saveLoading}>
                  {saveLoading ? 'Saving...' : editingId ? 'Update Test' : 'Save Test'}
                </button>
              </div>
            </div>
          )}

          {/* Loading */}
          {isLoading && <div style={S.centered}>Loading tests...</div>}

          {/* Empty state */}
          {!isLoading && tests.length === 0 && !showForm && (
            <div style={S.empty}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🧪</div>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#475569', marginBottom: 8 }}>No tests yet</p>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>
                Create tests to verify your template generates correctly before publishing.
              </p>
            </div>
          )}

          {/* Test list */}
          {tests.map(test => {
            const result = results[test.test_id];
            const running = isRunning === test.test_id;

            return (
              <div key={test.test_id} style={{
                ...S.card,
                borderColor: result?.status === 'pass' ? '#86efac'
                  : result?.status === 'fail' ? '#fca5a5'
                  : result?.status === 'error' ? '#fde68a'
                  : '#e2e8f0',
              }}>
                {/* Card header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 18, marginTop: 1 }}>
                      {!result ? '○'
                        : result.status === 'pass' ? '✅'
                        : result.status === 'fail' ? '❌'
                        : '⚠️'}
                    </span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{test.name}</div>
                      {test.description && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{test.description}</div>}
                      {test.expected_strings.length > 0 && (
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                          {test.expected_strings.length} check{test.expected_strings.length !== 1 ? 's' : ''}: {test.expected_strings.slice(0, 3).map(s => `"${s}"`).join(', ')}{test.expected_strings.length > 3 ? '...' : ''}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button style={S.runBtn}
                      onClick={() => handleRunOne(test)}
                      disabled={!!isRunning}>
                      {running ? '⟳' : '▶ Run'}
                    </button>
                    <button style={S.editBtn} onClick={() => openEditForm(test)}>Edit</button>
                    <button style={S.delBtn} onClick={() => handleDelete(test.test_id)}>✕</button>
                  </div>
                </div>

                {/* Params preview */}
                {Object.keys(test.runtime_params).length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>
                    params: <code style={S.code}>{JSON.stringify(test.runtime_params)}</code>
                  </div>
                )}

                {/* Result */}
                {result && (
                  <div style={{
                    ...S.resultMsg,
                    background: result.status === 'pass' ? '#f0fdf4' : result.status === 'fail' ? '#fef2f2' : '#fef9c3',
                    color: result.status === 'pass' ? '#166534' : result.status === 'fail' ? '#991b1b' : '#854d0e',
                    borderColor: result.status === 'pass' ? '#86efac' : result.status === 'fail' ? '#fca5a5' : '#fde68a',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{result.message}</span>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, marginLeft: 10 }}>
                        {result.checks_total > 0 && (
                          <span style={{ fontSize: 11, fontWeight: 600 }}>
                            {result.checks_passed}/{result.checks_total} checks
                          </span>
                        )}
                        {result.rendered_html && (
                          <button style={S.previewBtn}
                            onClick={() => showPreview(result, test.name)}>
                            Preview
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Rendered HTML preview modal */}
        {previewHtml && (
          <div style={S.previewOverlay} onClick={() => setPreviewHtml(null)}>
            <div style={S.previewModal} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                  Preview — {previewTestName}
                </span>
                <button style={S.closeBtn} onClick={() => setPreviewHtml(null)}>✕</button>
              </div>
              <div
                style={{ fontSize: 13, lineHeight: 1.7, color: '#334155', maxHeight: 300, overflowY: 'auto' }}
                dangerouslySetInnerHTML={{ __html: previewHtml + (previewHtml.length >= 5000 ? '<p style="color:#94a3b8;font-size:11px;margin-top:8px;">... (first 5000 chars shown)</p>' : '') }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  overlay:       { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  panel:         { backgroundColor: '#fff', borderRadius: '12px', width: '640px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  header:        { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9' },
  title:         { fontSize: '17px', fontWeight: 700, color: '#0f172a' },
  subtitle:      { fontSize: '13px', color: '#94a3b8', marginTop: 4 },
  badge:         { fontSize: '12px', fontWeight: 600, padding: '2px 10px', borderRadius: '10px' },
  closeBtn:      { background: 'none', border: 'none', fontSize: '16px', color: '#94a3b8', cursor: 'pointer' },
  body:          { flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 14 },
  newBtn:        { backgroundColor: 'var(--color-primary-800)', color: '#fff', border: 'none', borderRadius: '7px', padding: '8px 16px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' },
  runAllBtn:     { backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '7px', padding: '8px 16px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' },
  form:          { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px' },
  formTitle:     { fontSize: '14px', fontWeight: 600, color: '#0f172a', marginBottom: 12 },
  formError:     { backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', color: '#b91c1c', marginBottom: 10 },
  field:         { display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 },
  label:         { fontSize: '13px', fontWeight: 500, color: '#374151' },
  input:         { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', color: '#1e293b', outline: 'none' },
  textarea:      { padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', color: '#1e293b', outline: 'none', fontFamily: 'var(--font-family-mono)', resize: 'vertical' },
  hint:          { fontSize: '11px', color: '#94a3b8' },
  cancelBtn:     { background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '7px 14px', fontSize: '13px', color: '#64748b', cursor: 'pointer' },
  saveBtn:       { backgroundColor: 'var(--color-primary-800)', color: '#fff', border: 'none', borderRadius: '6px', padding: '7px 16px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' },
  centered:      { textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '13px' },
  empty:         { textAlign: 'center', padding: '48px 20px' },
  card:          { border: '1px solid', borderRadius: '8px', padding: '14px 16px', transition: 'border-color 0.15s' },
  runBtn:        { background: 'none', border: '1px solid #86efac', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#16a34a', cursor: 'pointer', fontWeight: 500 },
  editBtn:       { background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#64748b', cursor: 'pointer' },
  delBtn:        { background: 'none', border: '1px solid #fecaca', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', color: '#ef4444', cursor: 'pointer' },
  resultMsg:     { marginTop: 10, padding: '8px 12px', borderRadius: '6px', fontSize: '13px', border: '1px solid', lineHeight: 1.5 },
  previewBtn:    { background: 'none', border: '1px solid currentColor', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', cursor: 'pointer', opacity: 0.8 },
  code:          { backgroundColor: '#f1f5f9', padding: '1px 6px', borderRadius: '4px', fontFamily: 'var(--font-family-mono)', fontSize: '11px' },
  previewOverlay:{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '12px' },
  previewModal:  { backgroundColor: '#fff', borderRadius: '8px', padding: '16px', width: '90%', maxWidth: 560 },
};
