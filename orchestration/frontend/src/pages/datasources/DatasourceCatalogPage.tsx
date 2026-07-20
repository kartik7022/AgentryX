// src/pages/datasources/DatasourceCatalogPage.tsx
import { useState, useEffect } from 'react';
import {
  listDatasources, createDatasource,
  updateDatasource, deleteDatasource,
  testDatasource, type Datasource,
} from '../../services/api';

const card: React.CSSProperties = {
  background: 'var(--color-bg-surface)', borderRadius: '16px',
  border: '1px solid var(--color-border-soft)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
};

const inp: React.CSSProperties = {
  width: '100%', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-base)',
  borderRadius: '10px', padding: '10px 14px', fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-strong)', fontFamily: 'inherit', boxSizing: 'border-box' as const,
  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
};

const lbl: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 'var(--font-weight-semibold)',
  textTransform: 'uppercase' as const, letterSpacing: '0.07em',
  color: 'var(--color-text-muted)', marginBottom: '6px',
};

type DatasourceKind = 'sql' | 'rest' | 'graphql' | 'ai';

const KIND_COLORS: Record<string, [string, string, string]> = {
  sql:     ['var(--color-status-info-bg)', 'var(--color-status-info-text)', 'var(--color-primary-200)'],
  rest:    ['var(--color-status-success-bg)', 'var(--color-status-success-text)', 'var(--color-status-success-border)'],
  graphql: ['var(--color-primary-50)', 'var(--color-primary-800)', 'var(--color-primary-200)'],
  ai:      ['var(--color-primary-50)', 'var(--color-primary-800)', 'var(--color-primary-100)'],
};

const KIND_ICONS: Record<string, string> = {
  sql: '🗄', rest: '🌐', graphql: '◈', ai: '🤖',
};

const DEFAULT_FORM = {
  name: '', kind: 'sql' as DatasourceKind,
  host: '', port: '', database_name: '', username: '',
  description: '', is_active: true, tags: [] as string[], tenant_id: null as string | null,
};

const inputStyle: React.CSSProperties = {
  background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-base)', borderRadius: '10px',
  padding: '9px 14px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-strong)',
  boxShadow: '0 1px 2px rgba(0,0,0,0.04)', fontFamily: 'inherit',
};

export default function DatasourceCatalogPage() {
  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [successMsg, setSuccessMsg]   = useState('');
  const [search, setSearch]           = useState('');
  const [filterKind, setFilterKind]   = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showForm, setShowForm]         = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [form, setForm]                 = useState(DEFAULT_FORM);
  const [tagInput, setTagInput]         = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [testingId, setTestingId]       = useState<string | null>(null);
  const [testResult, setTestResult]     = useState<Record<string, string>>({});

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const data = await listDatasources();
      setDatasources(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load datasources');
    } finally {
      setLoading(false);
    }
  }

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  }

  function openAddForm() {
    setForm(DEFAULT_FORM);
    setTagInput('');
    setEditingId(null);
    setShowForm(true);
  }

  function openEditForm(ds: Datasource) {
    setForm({
      name:          ds.name,
      kind:          ds.kind as DatasourceKind,
      host:          ds.host          ?? '',
      port:          ds.port          ?? '',
      database_name: ds.database_name ?? '',
      username:      ds.username      ?? '',
      description:   ds.description   ?? '',
      is_active:     ds.is_active,
      tags:          ds.tags,
      tenant_id:     ds.tenant_id,
    });
    setTagInput('');
    setEditingId(ds.datasource_id);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      if (editingId) {
        await updateDatasource(editingId, form);
        showSuccess(`"${form.name}" updated successfully.`);
      } else {
        await createDatasource(form);
        showSuccess(`"${form.name}" added to catalog.`);
      }
      await loadData();
      setShowForm(false);
      setEditingId(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save datasource');
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteDatasource(id);
      await loadData();
      setDeleteConfirmId(null);
      showSuccess('Datasource deleted.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  async function handleToggleActive(ds: Datasource) {
    try {
      await updateDatasource(ds.datasource_id, { is_active: !ds.is_active });
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    }
  }

  async function handleTest(id: string) {
    setTestingId(id);
    try {
      const res = await testDatasource(id);
      setTestResult(prev => ({ ...prev, [id]: `✓ ${res.message}` }));
    } catch (err: unknown) {
      setTestResult(prev => ({
        ...prev,
        [id]: `✕ ${err instanceof Error ? err.message : 'Test failed'}`,
      }));
    } finally {
      setTestingId(null);
    }
  }

  function addTag() {
    const tag = tagInput.trim().toLowerCase().replace(/\s/g, '_');
    if (!tag || form.tags.includes(tag)) return;
    setForm(f => ({ ...f, tags: [...f.tags, tag] }));
    setTagInput('');
  }

  function removeTag(tag: string) {
    setForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }));
  }

  const filtered = datasources.filter(ds => {
    const q           = search.toLowerCase();
    const matchSearch = !q
      || ds.name.toLowerCase().includes(q)
      || (ds.host ?? '').toLowerCase().includes(q)
      || (ds.description ?? '').toLowerCase().includes(q)
      || ds.tags.some(t => t.includes(q));
    const matchKind   = !filterKind   || ds.kind === filterKind;
    const matchStatus = !filterStatus
      || (filterStatus === 'active' ? ds.is_active : !ds.is_active);
    return matchSearch && matchKind && matchStatus;
  });

  return (
    <div style={{ padding: '32px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)' }}>Datasource Catalog</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', marginTop: '4px' }}>
            Manage all SQL, REST, GraphQL and AI datasources used in plan steps.
          </p>
        </div>
        <button onClick={openAddForm}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--color-primary-800)', color: 'var(--color-bg-surface)', padding: '10px 18px', borderRadius: '10px', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-sm)', border: 'none', cursor: 'pointer' }}>
          + Add Datasource
        </button>
      </div>

      {/* Success */}
      {successMsg && (
        <div style={{ background: 'var(--color-status-success-bg)', border: '1px solid var(--color-status-success-border)', borderRadius: '12px', padding: '12px 16px', color: 'var(--color-status-success-text)', fontSize: 'var(--font-size-sm)', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
          <span>✓ {successMsg}</span>
          <button onClick={() => setSuccessMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-status-success-text)' }}>✕</button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: 'var(--color-status-error-bg)', border: '1px solid var(--color-status-error-border)', borderRadius: '12px', padding: '12px 16px', color: 'var(--color-status-error-text)', fontSize: 'var(--font-size-sm)', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
          <span>⚠ {error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-status-error-text)' }}>✕</button>
        </div>
      )}

      {/* Stats */}
      {datasources.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '12px', marginBottom: '24px' }}>
          {[
            { label: 'Total',   value: datasources.length,                                color: 'var(--color-primary-800)' },
            { label: 'SQL',     value: datasources.filter(d => d.kind === 'sql').length,   color: 'var(--color-status-info-text)' },
            { label: 'REST',    value: datasources.filter(d => d.kind === 'rest').length,  color: 'var(--color-status-success-text)' },
            { label: 'GraphQL', value: datasources.filter(d => d.kind === 'graphql').length, color: 'var(--color-primary-800)' },
            { label: 'AI',      value: datasources.filter(d => d.kind === 'ai').length,   color: 'var(--color-primary-800)' },
          ].map(s => (
            <div key={s.label} style={{ ...card, padding: '16px' }}>
              <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: s.color, marginBottom: '2px' }}>{s.value}</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Form */}
      {showForm && (
        <div style={{ ...card, padding: '24px', marginBottom: '24px', border: '2px solid var(--color-primary-800)' }}>
          <h2 style={{ fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', marginBottom: '20px' }}>
            {editingId ? 'Edit Datasource' : 'Add New Datasource'}
          </h2>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={lbl}>Datasource Name *</label>
                <input style={{ ...inp, fontFamily: 'var(--font-family-mono)' }}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value.replace(/\s/g, '_').toUpperCase() }))}
                  placeholder="CRM_SNOWFLAKE"/>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-soft)', marginTop: '4px' }}>Used in plan step datasource_name field</p>
              </div>
              <div>
                <label style={lbl}>Type *</label>
                <select style={inp} value={form.kind}
                  onChange={e => setForm(f => ({ ...f, kind: e.target.value as DatasourceKind }))}>
                  <option value="sql">SQL Database</option>
                  <option value="rest">REST API</option>
                  <option value="graphql">GraphQL API</option>
                  <option value="ai">AI / LLM Service</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Host / Base URL</label>
                <input style={{ ...inp, fontFamily: 'var(--font-family-mono)' }}
                  value={form.host}
                  onChange={e => setForm(f => ({ ...f, host: e.target.value }))}
                  placeholder={form.kind === 'sql' ? 'db.example.com' : 'https://api.example.com'}/>
              </div>
              {form.kind === 'sql' && (
                <>
                  <div>
                    <label style={lbl}>Port</label>
                    <input style={{ ...inp, fontFamily: 'var(--font-family-mono)' }}
                      value={form.port}
                      onChange={e => setForm(f => ({ ...f, port: e.target.value }))}
                      placeholder="5432"/>
                  </div>
                  <div>
                    <label style={lbl}>Database</label>
                    <input style={{ ...inp, fontFamily: 'var(--font-family-mono)' }}
                      value={form.database_name}
                      onChange={e => setForm(f => ({ ...f, database_name: e.target.value }))}
                      placeholder="my_database"/>
                  </div>
                  <div>
                    <label style={lbl}>Username</label>
                    <input style={{ ...inp, fontFamily: 'var(--font-family-mono)' }}
                      value={form.username}
                      onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                      placeholder="db_user"/>
                  </div>
                </>
              )}
            </div>

            {/* Description */}
            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>Description</label>
              <textarea style={{ ...inp, minHeight: '64px', resize: 'vertical' }}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="What data does this source provide?"/>
            </div>

            {/* Tags */}
            <div style={{ marginBottom: '20px' }}>
              <label style={lbl}>Tags</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                {form.tags.map(tag => (
                  <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--color-primary-50)', color: 'var(--color-primary-800)', padding: '3px 10px', borderRadius: '999px', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)' }}>
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary-800)', fontSize: 'var(--font-size-sm)', lineHeight: 1, padding: '0 2px' }}>✕</button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input style={{ ...inp, flex: 1 }}
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  placeholder="Type a tag and press Enter"/>
                <button type="button" onClick={addTag}
                  style={{ padding: '10px 16px', borderRadius: '10px', border: '1px solid var(--color-border-base)', background: 'var(--color-bg-surface)', color: 'var(--color-text-base)', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  + Add Tag
                </button>
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-base)', fontWeight: 'var(--font-weight-medium)' }}>
                <input type="checkbox" checked={form.is_active}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary-800)' }}/>
                Active
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }}
                  style={{ padding: '9px 18px', borderRadius: '10px', border: '1px solid var(--color-border-base)', background: 'var(--color-bg-surface)', color: 'var(--color-text-base)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit"
                  style={{ padding: '9px 18px', borderRadius: '10px', border: 'none', background: 'var(--color-primary-800)', color: 'var(--color-bg-surface)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer' }}>
                  {editingId ? 'Save Changes' : 'Add Datasource'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      {datasources.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '300px' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-soft)' }}>🔍</span>
            <input style={{ ...inputStyle, width: '100%', paddingLeft: '36px', boxSizing: 'border-box' as const }}
              placeholder="Search datasources…"
              value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <select style={{ ...inputStyle, minWidth: '140px' }} value={filterKind} onChange={e => setFilterKind(e.target.value)}>
            <option value="">All types</option>
            <option value="sql">SQL</option>
            <option value="rest">REST</option>
            <option value="graphql">GraphQL</option>
            <option value="ai">AI</option>
          </select>
          <select style={{ ...inputStyle, minWidth: '140px' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          {(search || filterKind || filterStatus) && (
            <button onClick={() => { setSearch(''); setFilterKind(''); setFilterStatus(''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
              Clear
            </button>
          )}
        </div>
      )}

      {/* Count */}
      {datasources.length > 0 && (
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-soft)', marginBottom: '12px' }}>
          Showing {filtered.length} of {datasources.length} datasources
        </p>
      )}

      {/* Loading */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid var(--color-border-soft)', borderTopColor: 'var(--color-primary-800)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}/>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>

      ) : datasources.length === 0 ? (
        <div style={{ ...card, padding: '80px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🗄</div>
          <p style={{ color: 'var(--color-text-base)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-md)', marginBottom: '8px' }}>No datasources yet</p>
          <p style={{ color: 'var(--color-text-soft)', fontSize: 'var(--font-size-sm)', marginBottom: '24px', maxWidth: '320px', margin: '0 auto 24px' }}>
            Add your SQL databases, REST APIs, GraphQL endpoints and AI services here.
          </p>
          <button onClick={openAddForm}
            style={{ background: 'var(--color-primary-800)', color: 'var(--color-bg-surface)', padding: '10px 20px', borderRadius: '10px', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-sm)', border: 'none', cursor: 'pointer' }}>
            + Add First Datasource
          </button>
        </div>

      ) : filtered.length === 0 ? (
        <div style={{ ...card, padding: '60px', textAlign: 'center' }}>
          <p style={{ color: 'var(--color-text-base)', fontWeight: 'var(--font-weight-semibold)', marginBottom: '8px' }}>No results match your filters</p>
          <button onClick={() => { setSearch(''); setFilterKind(''); setFilterStatus(''); }}
            style={{ background: 'none', border: '1px solid var(--color-border-base)', borderRadius: '8px', padding: '8px 16px', color: 'var(--color-text-base)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' }}>
            Clear filters
          </button>
        </div>

      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(ds => {
            const [kb, kc, kb3] = KIND_COLORS[ds.kind] ?? ['var(--color-bg-canvas)', 'var(--color-text-base)', 'var(--color-border-soft)'];
            const isExpanded    = expandedId === ds.datasource_id;
            const isDeleting    = deleteConfirmId === ds.datasource_id;

            return (
              <div key={ds.datasource_id} style={{ ...card, overflow: 'hidden' }}>

                {/* Row */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px', cursor: 'pointer' }}
                  onClick={() => setExpandedId(isExpanded ? null : ds.datasource_id)}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-canvas)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>

                  {/* Icon */}
                  <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: kb, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--font-size-lg)', flexShrink: 0 }}>
                    {KIND_ICONS[ds.kind]}
                  </div>

                  {/* Kind badge */}
                  <span style={{ background: kb, color: kc, border: `1px solid ${kb3}`, padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 'var(--font-weight-bold)', flexShrink: 0 }}>
                    {ds.kind.toUpperCase()}
                  </span>

                  {/* Name */}
                  <span style={{ fontFamily: 'var(--font-family-mono)', fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-strong)', flex: 1 }}>
                    {ds.name}
                  </span>

                  {/* Host */}
                  {ds.host && (
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-soft)', fontFamily: 'var(--font-family-mono)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ds.host}
                    </span>
                  )}

                  {/* Tags */}
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {ds.tags.slice(0, 3).map(tag => (
                      <span key={tag} style={{ background: 'var(--color-bg-muted)', color: 'var(--color-text-base)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 'var(--font-weight-medium)' }}>
                        {tag}
                      </span>
                    ))}
                    {ds.tags.length > 3 && (
                      <span style={{ color: 'var(--color-text-soft)', fontSize: '11px' }}>+{ds.tags.length - 3}</span>
                    )}
                  </div>

                  {/* Test result */}
                  {testResult[ds.datasource_id] && (
                    <span style={{ fontSize: '11px', color: testResult[ds.datasource_id].startsWith('✓') ? 'var(--color-status-success-text)' : 'var(--color-status-error-text)', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {testResult[ds.datasource_id]}
                    </span>
                  )}

                  {/* Status toggle */}
                  <button
                    onClick={e => { e.stopPropagation(); handleToggleActive(ds); }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '999px', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', border: `1px solid ${ds.is_active ? 'var(--color-status-success-border)' : 'var(--color-border-soft)'}`, background: ds.is_active ? 'var(--color-status-success-bg)' : 'var(--color-bg-canvas)', color: ds.is_active ? 'var(--color-status-success-text)' : 'var(--color-text-muted)', cursor: 'pointer', flexShrink: 0 }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: ds.is_active ? 'var(--color-accent-500)' : 'var(--color-text-soft)', display: 'inline-block' }}/>
                    {ds.is_active ? 'Active' : 'Inactive'}
                  </button>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => handleTest(ds.datasource_id)}
                      disabled={testingId === ds.datasource_id}
                      style={{ padding: '5px 10px', borderRadius: '7px', border: '1px solid var(--color-border-base)', background: 'var(--color-bg-surface)', color: 'var(--color-text-base)', fontSize: 'var(--font-size-xs)', cursor: 'pointer' }}>
                      {testingId === ds.datasource_id ? '...' : 'Test'}
                    </button>
                    <button onClick={() => openEditForm(ds)}
                      style={{ padding: '5px 10px', borderRadius: '7px', border: '1px solid var(--color-border-base)', background: 'var(--color-bg-surface)', color: 'var(--color-text-base)', fontSize: 'var(--font-size-xs)', cursor: 'pointer' }}>
                      Edit
                    </button>
                    <button onClick={() => setDeleteConfirmId(ds.datasource_id)}
                      style={{ padding: '5px 10px', borderRadius: '7px', border: '1px solid var(--color-status-error-border)', background: 'var(--color-status-error-bg)', color: 'var(--color-status-error-text)', fontSize: 'var(--font-size-xs)', cursor: 'pointer' }}>
                      Delete
                    </button>
                  </div>

                  {/* Chevron */}
                  <span style={{ color: 'var(--color-text-soft)', fontSize: 'var(--font-size-xs)', display: 'inline-block', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s', flexShrink: 0 }}>▼</span>
                </div>

                {/* Delete confirm */}
                {isDeleting && (
                  <div style={{ background: 'var(--color-status-error-bg)', borderTop: '1px solid var(--color-status-error-border)', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', color: 'var(--color-status-error-text)' }}>Delete <strong>{ds.name}</strong>? This cannot be undone.</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => setDeleteConfirmId(null)}
                        style={{ padding: '5px 12px', borderRadius: '8px', border: '1px solid var(--color-border-base)', background: 'var(--color-bg-surface)', color: 'var(--color-text-base)', fontSize: 'var(--font-size-xs)', cursor: 'pointer' }}>
                        Cancel
                      </button>
                      <button onClick={() => handleDelete(ds.datasource_id)}
                        style={{ padding: '5px 12px', borderRadius: '8px', border: 'none', background: 'var(--color-status-error-text)', color: 'var(--color-bg-surface)', fontSize: 'var(--font-size-xs)', cursor: 'pointer' }}>
                        Delete
                      </button>
                    </div>
                  </div>
                )}

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--color-bg-muted)', padding: '20px', background: 'var(--color-bg-canvas)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))', gap: '12px' }}>
                      {[
                        { label: 'Type',     value: ds.kind.toUpperCase() },
                        { label: 'Host',     value: ds.host          || '—' },
                        { label: 'Port',     value: ds.port          || '—' },
                        { label: 'Database', value: ds.database_name || '—' },
                        { label: 'Username', value: ds.username      || '—' },
                        { label: 'Created',  value: new Date(ds.created_at).toLocaleDateString() },
                      ].map(m => (
                        <div key={m.label} style={{ background: 'var(--color-bg-surface)', borderRadius: '10px', border: '1px solid var(--color-border-soft)', padding: '12px' }}>
                          <p style={{ fontSize: '11px', color: 'var(--color-text-soft)', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{m.label}</p>
                          <p style={{ fontFamily: 'var(--font-family-mono)', fontSize: '13px', color: 'var(--color-text-strong)', fontWeight: 'var(--font-weight-semibold)' }}>{m.value}</p>
                        </div>
                      ))}
                    </div>

                    {ds.description && (
                      <div style={{ marginTop: '12px', background: 'var(--color-bg-surface)', borderRadius: '10px', border: '1px solid var(--color-border-soft)', padding: '14px' }}>
                        <p style={{ fontSize: '11px', color: 'var(--color-text-soft)', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Description</p>
                        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-base)', lineHeight: 1.6 }}>{ds.description}</p>
                      </div>
                    )}

                    {ds.tags.length > 0 && (
                      <div style={{ marginTop: '12px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {ds.tags.map(tag => (
                          <span key={tag} style={{ background: 'var(--color-primary-50)', color: 'var(--color-primary-800)', padding: '4px 10px', borderRadius: '999px', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)' }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Usage hint */}
                    <div style={{ marginTop: '16px', background: 'var(--color-status-warning-bg)', border: '1px solid var(--color-status-warning-border)', borderRadius: '10px', padding: '12px 16px' }}>
                      <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-status-warning-text)', fontWeight: 'var(--font-weight-semibold)', marginBottom: '4px' }}>💡 Usage in Plan Steps</p>
                      <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-status-warning-text)' }}>
                        Set <code style={{ fontFamily: 'var(--font-family-mono)', background: 'var(--color-status-warning-border)', padding: '1px 4px', borderRadius: '3px' }}>datasource_name</code> to{' '}
                        <code style={{ fontFamily: 'var(--font-family-mono)', background: 'var(--color-status-warning-border)', padding: '1px 4px', borderRadius: '3px' }}>{ds.name}</code> in your plan step.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}