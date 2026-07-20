// src/pages/PlaceholderRegistryPage.tsx

import { useState, useEffect } from 'react';
import { createPlaceholder, listPlaceholders } from '../api/placeholders';
import { apiRequest } from '../api/client';
import '../styles/placeholder-registry.css';

interface LocalPlaceholder {
  registry_id: string;
  name: string;
  generation_mode: string;
  sample_value?: string;
  value_type?: string;
  cardinality?: string;
  sql_text?: string;
  prompt?: string;
  datasource_id?: string | number;
}

interface Datasource {
  datasource_id: number;
  name: string;
  datasource_type: string;
  description?: string;
}

const EMPTY_FORM = {
  name: '',
  generation_mode: 'manual_sql' as 'manual_sql' | 'llm_prompt',
  sql_text: '',
  prompt: '',
  sample_value: '',
  value_type: 'string',
  cardinality: 'scalar',
  datasource_id: '1',
};

export default function PlaceholderRegistryPage() {
  const [placeholders, setPlaceholders]         = useState<LocalPlaceholder[]>([]);
  const [datasources, setDatasources]           = useState<Datasource[]>([]);
  const [isLoading, setIsLoading]               = useState(true);
  const [isSubmitting, setIsSubmitting]         = useState(false);
  const [isFetchingSample, setIsFetchingSample] = useState(false);
  const [submitError, setSubmitError]           = useState<string | null>(null);
  const [showModal, setShowModal]               = useState(false);
  const [editingId, setEditingId]               = useState<string | null>(null);
  const [form, setForm]                         = useState({ ...EMPTY_FORM });
  const [search, setSearch]                     = useState('');

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (showModal) {
      document.body.classList.add('ph-modal-open');
    } else {
      document.body.classList.remove('ph-modal-open');
    }
    return () => { document.body.classList.remove('ph-modal-open'); };
  }, [showModal]);

  async function loadData() {
    setIsLoading(true);
    try {
      const [phs, dss] = await Promise.all([
        listPlaceholders(),
        apiRequest<Datasource[]>({ method: 'GET', url: '/datasources' }).catch(() => []),
      ]);
      setPlaceholders(phs);
      setDatasources(dss);
    } catch { setPlaceholders([]);
    } finally { setIsLoading(false); }
  }

  function handleField(key: keyof typeof EMPTY_FORM, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // ── Run SQL — auto-replace {{param}} with default value 1 ──────────────────
  async function handleFetchSample() {
    if (!form.sql_text.trim()) { setSubmitError('Enter a SQL query first'); return; }
    setIsFetchingSample(true);
    setSubmitError(null);
    try {
      let testSql = form.sql_text.trim();

      // Auto-replace {{param}} tokens with smart defaults for testing
      // Uses param name to guess a sensible test value
      testSql = testSql.replace(/\{\{([^}]+)\}\}/g, (_match: string, paramName: string) => {
        const name = paramName.toLowerCase();
        if (name.includes('loan_number') || name === 'loan') return 'LN12345';
        if (name.includes('loan'))     return 'LN12345';
        if (name.includes('account'))  return 'LN12345';
        if (name.includes('id'))       return '1';
        if (name.includes('name'))     return 'John Valid';
        if (name.includes('email'))    return 'customer@example.com';
        if (name.includes('phone'))    return '+91-9000000001';
        if (name.includes('month'))    return 'March 2026';
        if (name.includes('date'))     return '2026-03-01';
        if (name.includes('amount'))   return '1000';
        return '1'; // fallback
      });

      const result = await apiRequest<{ value: string; error?: string }>({
        method: 'POST',
        url: '/datasources/test-sql',
        data: {
          datasource_id: parseInt(form.datasource_id),
          sql_text: testSql,
          cardinality: form.cardinality,
        },
      });

      if (result.error) {
        setSubmitError(`SQL Error: ${result.error}`);
      } else {
        const raw = result.value ?? '';
        let display = raw;
        if (form.cardinality === 'list') {
          try { const arr = JSON.parse(raw); display = Array.isArray(arr) ? arr.join(', ') : raw; } catch { display = raw; }
        } else if (form.cardinality === 'table') {
          try { const rows = JSON.parse(raw); display = JSON.stringify(rows, null, 2); } catch { display = raw; }
        }
        handleField('sample_value', display);
      }
    } catch (err) {
      setSubmitError(`Failed to fetch: ${(err as Error).message}`);
    } finally { setIsFetchingSample(false); }
  }

  async function handleGenerateSQL() {
    if (!form.prompt.trim()) { setSubmitError('Enter a prompt first'); return; }
    setIsFetchingSample(true); setSubmitError(null);
    try {
      const result = await apiRequest<{ sql: string; value: string; error: string }>({
        method: 'POST', url: '/ai/generate-sql',
        data: { prompt: form.prompt.trim(), datasource_id: parseInt(form.datasource_id), cardinality: form.cardinality },
      });
      if (result.error) setSubmitError(`AI Error: ${result.error}`);
      else { handleField('sql_text', result.sql ?? ''); handleField('sample_value', result.value ?? ''); }
    } catch (err) { setSubmitError(`Failed: ${(err as Error).message}`);
    } finally { setIsFetchingSample(false); }
  }

  function openCreateModal() {
    setEditingId(null); setForm({ ...EMPTY_FORM }); setSubmitError(null); setShowModal(true);
  }

  function openEditModal(p: LocalPlaceholder) {
    setEditingId(p.registry_id);
    setForm({
      name: p.name, generation_mode: p.generation_mode as 'manual_sql' | 'llm_prompt',
      sql_text: p.sql_text ?? '', prompt: p.prompt ?? '', sample_value: p.sample_value ?? '',
      value_type: p.value_type ?? 'string', cardinality: p.cardinality ?? 'scalar',
      datasource_id: String(p.datasource_id ?? '1'),
    });
    setSubmitError(null); setShowModal(true);
  }

  async function handleDelete(registryId: string) {
    if (!window.confirm('Delete this placeholder?')) return;
    try {
      await apiRequest({ method: 'DELETE', url: `/registry/placeholders/${registryId}` });
      setPlaceholders((prev) => prev.filter((p) => p.registry_id !== registryId));
    } catch { alert('Failed to delete placeholder.'); }
  }

  async function handleSubmit() {
    setSubmitError(null);
    if (!form.name.trim()) { setSubmitError('Name is required'); return; }
    const cleanName = form.name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!cleanName) { setSubmitError('Name must contain letters or numbers only'); return; }
    if (form.generation_mode === 'manual_sql' && !form.sql_text.trim()) { setSubmitError('SQL query is required'); return; }
    if (form.generation_mode === 'llm_prompt' && !form.prompt.trim()) { setSubmitError('Prompt is required'); return; }
    if (!form.sample_value.trim()) { setSubmitError('Sample value is required — click "▶ Run SQL" to fetch it automatically'); return; }

    setIsSubmitting(true);
    try {
      const body = {
        name: cleanName, generation_mode: form.generation_mode,
        sql_text: form.generation_mode === 'manual_sql' ? form.sql_text.trim() : undefined,
        prompt: form.generation_mode === 'llm_prompt' ? form.prompt.trim() : undefined,
        datasource_id: parseInt(form.datasource_id) || 1,
        sample_value: form.sample_value.trim(), value_type: form.value_type,
        cardinality: form.cardinality, created_by: 'dev_user',
      };
      if (editingId) {
        const updated = await apiRequest<LocalPlaceholder>({ method: 'PUT', url: `/registry/placeholders/${editingId}`, data: body });
        setPlaceholders((prev) => prev.map((p) => p.registry_id === editingId ? { ...p, ...updated } : p));
      } else {
        const created = await createPlaceholder(body as never);
        setPlaceholders((prev) => [{ ...created }, ...prev]);
      }
      setForm({ ...EMPTY_FORM }); setShowModal(false); setEditingId(null);
    } catch (err) { setSubmitError((err as Error).message);
    } finally { setIsSubmitting(false); }
  }

  const filtered = placeholders.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const selectedDs = datasources.find((d) => String(d.datasource_id) === form.datasource_id);

  return (
    <div className="ph-page">

      {/* Header */}
      <div className="ph-header-gradient">
        <div>
          <h1 className="ph-title">Placeholder Registry</h1>
          <p className="ph-subtitle">Manage reusable data placeholders connected to real datasources</p>
        </div>
        <button className="ph-btn-primary" onClick={openCreateModal}>+ New Placeholder</button>
      </div>

      {/* Datasource banner */}
      <div className="ph-ds-banner">
        <span className="ph-ds-banner-icon">🗄</span>
        <div>
          <strong>Connected Datasources: </strong>
          {datasources.length > 0
            ? datasources.map((d) => <span key={d.datasource_id} className="ph-ds-badge">{d.name}</span>)
            : <span style={{ color: '#94a3b8', fontSize: '13px', marginLeft: '6px' }}>Loading...</span>}
        </div>
      </div>

      {/* Search */}
      <div className="ph-search-row">
        <input type="text" placeholder="Search placeholders..." value={search}
          onChange={(e) => setSearch(e.target.value)} className="ph-search-input" />
        <span className="ph-count-badge">{filtered.length} placeholder{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="ph-skeleton-wrap">
          {[1, 2, 3].map((i) => <div key={i} className="ph-skeleton" style={{ animationDelay: `${i * 0.12}s` }} />)}
          <p className="ph-loading-text">Loading placeholders...</p>
        </div>
      )}

      {/* Empty */}
      {!isLoading && filtered.length === 0 && (
        <div className="ph-empty-state">
          <div className="ph-empty-icon-wrap"><div className="ph-empty-icon">◈</div></div>
          <p className="ph-empty-title">No placeholders yet</p>
          <p className="ph-empty-hint">Click "+ New Placeholder" to create your first one</p>
          <button className="ph-btn-primary" style={{ marginTop: '16px' }} onClick={openCreateModal}>+ New Placeholder</button>
        </div>
      )}

      {/* Table */}
      {!isLoading && filtered.length > 0 && (
        <div className="ph-table-wrapper">
          <table className="ph-table">
            <thead>
              <tr>{['Token', 'Datasource', 'SQL Query', 'Sample Value','Actions'].map((col) => <th key={col}>{col}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const ds = datasources.find((d) => String(d.datasource_id) === String(p.datasource_id));
                return (
                  <tr key={p.registry_id}>
                    <td><span className="ph-token-chip">{`{{${p.name}}}`}</span></td>
                    <td>{ds ? <span className="ph-ds-badge">{ds.name}</span> : <span style={{ color: '#94a3b8', fontSize: '12px' }}>—</span>}</td>
                    <td style={{ maxWidth: '200px' }}>
                      {p.sql_text
                        ? <code className="ph-sql-preview">{p.sql_text.slice(0, 50)}{p.sql_text.length > 50 ? '...' : ''}</code>
                        : <span style={{ color: '#94a3b8', fontSize: '12px' }}>No SQL</span>}
                    </td>
                    <td className="ph-sample-value">{p.sample_value ?? '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="ph-btn-edit" onClick={() => openEditModal(p)}>✎ Edit</button>
                        <button className="ph-btn-delete" onClick={() => handleDelete(p.registry_id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="ph-overlay" onClick={() => setShowModal(false)}>
          <div className="ph-modal" onClick={(e) => e.stopPropagation()}>

            <div className="ph-modal-header">
              <h2 className="ph-modal-title">{editingId ? '✎ Edit Placeholder' : '+ New Placeholder'}</h2>
              <button className="ph-btn-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <div className="ph-modal-body">
              {submitError && <div className="ph-form-error">{submitError}</div>}

              {/* Name */}
              <div className="ph-field">
                <label className="ph-label">Name <span className="ph-required">*</span></label>
                <input className="ph-input" style={{ backgroundColor: editingId ? '#f8fafc' : '#fff' }}
                  value={form.name} onChange={(e) => handleField('name', e.target.value)}
                  placeholder="e.g. customer_name" disabled={!!editingId} />
                <p className="ph-field-hint">
                  Used as <code className="ph-code">{`{{${form.name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || 'name'}}}`}</code>
                  {editingId && ' — name cannot be changed'}
                </p>
              </div>

              {/* Mode */}
              <div className="ph-field">
                <label className="ph-label">Generation Mode</label>
                <div className="ph-mode-toggle">
                  {(['manual_sql', 'llm_prompt'] as const).map((m) => (
                    <button key={m} className={`ph-mode-btn${form.generation_mode === m ? ' ph-mode-active' : ''}`}
                      onClick={() => handleField('generation_mode', m)}>
                      {m === 'manual_sql' ? '⌨ SQL Query' : '✦ AI Prompt'}
                    </button>
                  ))}
                </div>
              </div>

              {/* SQL mode */}
              {form.generation_mode === 'manual_sql' && (
                <>
                  <div className="ph-field">
                    <label className="ph-label">Datasource <span className="ph-required">*</span></label>
                    <select className="ph-select" value={form.datasource_id}
                      onChange={(e) => handleField('datasource_id', e.target.value)}>
                      {datasources.length === 0 && <option value="1">CRM_DB (default)</option>}
                      {datasources.map((d) => (
                        <option key={d.datasource_id} value={String(d.datasource_id)}>
                          {d.name} — {d.description ?? d.datasource_type}
                        </option>
                      ))}
                    </select>
                    {selectedDs && <p className="ph-field-hint">📊 Connected to <strong>kasetti_bank</strong> ({selectedDs.name})</p>}
                  </div>

                  <div className="ph-field">
                    <label className="ph-label">SQL Query <span className="ph-required">*</span></label>
                    <textarea className="ph-textarea" rows={3} value={form.sql_text}
                      onChange={(e) => handleField('sql_text', e.target.value)}
                      placeholder="SELECT full_name FROM crm.customers WHERE customer_id = {{customer_id}}" />
                    <p className="ph-field-hint">
                      Use <code className="ph-code">{'{{customer_id}}'}</code> for dynamic values — injected at generation time
                    </p>
                  </div>

                  <div className="ph-sample-box">
                    <div className="ph-sample-box-header">
                      <label className="ph-label-success">Sample Value <span className="ph-required">*</span></label>
                      <button className="ph-btn-run" onClick={handleFetchSample} disabled={isFetchingSample}>
                        {isFetchingSample ? '⏳ Running...' : '▶ Run SQL'}
                      </button>
                    </div>
                    {form.cardinality === 'scalar' ? (
                      <input className="ph-input" value={form.sample_value}
                        onChange={(e) => handleField('sample_value', e.target.value)}
                        placeholder="Click ▶ Run SQL to auto-fetch" />
                    ) : (
                      <textarea className="ph-textarea" rows={form.cardinality === 'table' ? 5 : 3}
                        value={form.sample_value} onChange={(e) => handleField('sample_value', e.target.value)}
                        placeholder={form.cardinality === 'list' ? 'e.g. John, Jane, Bob' : 'e.g. [{"id":1,"name":"John"},...]'} />
                    )}
                    <p className="ph-field-hint-success">
                      ⭐ If SQL has <code className="ph-code">{'{{params}}'}</code> — a popup will ask for test values when you click Run SQL
                    </p>
                  </div>
                </>
              )}

              {/* AI Prompt mode */}
              {form.generation_mode === 'llm_prompt' && (
                <>
                  <div className="ph-field">
                    <label className="ph-label">Datasource <span className="ph-required">*</span></label>
                    <select className="ph-select" value={form.datasource_id}
                      onChange={(e) => handleField('datasource_id', e.target.value)}>
                      {datasources.map((d) => (
                        <option key={d.datasource_id} value={String(d.datasource_id)}>
                          {d.name} — {d.description ?? d.datasource_type}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="ph-field">
                    <label className="ph-label">AI Prompt <span className="ph-required">*</span></label>
                    <textarea className="ph-textarea" rows={3} value={form.prompt}
                      onChange={(e) => handleField('prompt', e.target.value)}
                      placeholder="e.g. Get the customer full name" />
                    <p className="ph-field-hint">Write in plain English — AI will generate SQL automatically</p>
                  </div>
                  <div className="ph-sample-box">
                    <div className="ph-sample-box-header">
                      <label className="ph-label-success">Generated SQL & Sample Value <span className="ph-required">*</span></label>
                      <button className="ph-btn-gen" onClick={handleGenerateSQL} disabled={isFetchingSample}>
                        {isFetchingSample ? '⏳ Generating...' : '✦ Generate SQL'}
                      </button>
                    </div>
                    {form.sql_text && (
                      <div style={{ marginBottom: '8px' }}>
                        <label className="ph-label-success">Generated SQL:</label>
                        <code className="ph-generated-sql">{form.sql_text}</code>
                      </div>
                    )}
                    <input className="ph-input" value={form.sample_value}
                      onChange={(e) => handleField('sample_value', e.target.value)}
                      placeholder="Click ✦ Generate SQL to auto-generate from AI" />
                    <p className="ph-field-hint-success">
                      ⭐ AI generates SQL → runs against kasetti_bank → fills value automatically
                    </p>
                  </div>
                </>
              )}


            </div>

            <div className="ph-modal-footer">
              <button className="ph-btn-cancel" onClick={() => { setShowModal(false); setEditingId(null); }}>Cancel</button>
              <button className="ph-btn-primary" style={{ opacity: isSubmitting ? 0.7 : 1 }}
                onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? (editingId ? 'Saving...' : 'Creating...') : (editingId ? '✓ Save Changes' : 'Create Placeholder')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
