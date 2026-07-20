// src/pages/TemplatesPage.tsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  listTemplates,
  createTemplate,
  deleteTemplate,
  type ListTemplatesParams,
} from '../api/templates';
import type { Template, OutputTarget } from '../types/api';
import StatusBadge from '../components/shared/StatusBadge';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import ErrorAlert from '../components/shared/ErrorAlert';
import ImportTemplateModal from '../components/ImportTemplateModal';
import '../styles/templates-page.css';

const STATUS_OPTIONS = ['', 'draft', 'published', 'archived'];
const TARGET_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All formats' },
  { value: 'pdf', label: 'PDF' },
  { value: 'docx', label: 'DOCX' },
  { value: 'xlsx', label: 'XLSX' },
  { value: 'html', label: 'HTML' },
  { value: 'md', label: 'Markdown' },
];
const INDUSTRY_OPTIONS = [
  { value: '', label: 'Select industry...' },
  { value: 'banking', label: '🏦 Banking' },
  { value: 'insurance', label: '🛡 Insurance' },
  { value: 'healthcare', label: '🏥 Healthcare' },
  { value: 'sales', label: '💼 Sales' },
  { value: 'legal', label: '⚖ Legal' },
  { value: 'education', label: '🎓 Education' },
  { value: 'logistics', label: '🚚 Logistics' },
  { value: 'real_estate', label: '🏠 Real Estate' },
];
const TARGET_META: Record<string, { bg: string; color: string; icon: string }> = {
  pdf:  { bg: '#fee2e2', color: '#b91c1c', icon: '📄' },
  docx: { bg: '#dbeafe', color: '#1d4ed8', icon: '📝' },
  xlsx: { bg: '#dcfce7', color: '#166534', icon: '📊' },
  html: { bg: '#fef9c3', color: '#854d0e', icon: '🌐' },
  md:   { bg: 'var(--color-primary-50)', color: 'var(--color-primary-800)', icon: '📋' },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatIndustry(industry?: string): string {
  if (!industry) return '';
  return industry.split('_').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}
const EMPTY_FORM = { name: '', output_target: 'pdf' as OutputTarget, industry: '' };

export default function TemplatesPage() {
  const navigate = useNavigate();
  const [templates, setTemplates]             = useState<Template[]>([]);
  const [isLoading, setIsLoading]             = useState(true);
  const [error, setError]                     = useState<string | null>(null);
  const [isCreating, setIsCreating]           = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm]                       = useState({ ...EMPTY_FORM });
  const [search, setSearch]                   = useState('');
  const [statusFilter, setStatusFilter]       = useState('');
  const [targetFilter, setTargetFilter]       = useState('');
  const [industryFilter, setIndustryFilter]   = useState('');
  const [showImport, setShowImport]           = useState(false);
  const [, setHoveredRow]                     = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    setIsLoading(true); setError(null);
    const params: ListTemplatesParams = {};
    if (search) params.search = search;
    if (statusFilter) params.status_filter = statusFilter;
    if (targetFilter) params.output_target = targetFilter;
    if (industryFilter) params.industry = industryFilter;
    try {
      const data = await listTemplates(params);
const filtered = statusFilter === 'archived'
  ? data
  : data.filter((t) => t.status !== 'archived');
setTemplates(filtered.filter((t) => !targetFilter || t.output_target === targetFilter));    } catch (err) { setError((err as Error).message); }
    finally { setIsLoading(false); }
  }, [search, statusFilter, targetFilter, industryFilter]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  async function handleCreateTemplate() {
    setIsCreating(true);
    try {
      const created = await createTemplate({
        name: form.name.trim() || 'Untitled Template',
        output_target: form.output_target,
        industry: form.industry.trim() || undefined,
      });
      setShowCreateModal(false); setForm({ ...EMPTY_FORM });
      navigate(`/templates/${created.template_id}`);
    } catch (err) { setError((err as Error).message); }
    finally { setIsCreating(false); }
  }

  async function handleDeleteTemplate(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!window.confirm('Delete this template.')) return;
    try {
      await deleteTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.template_id !== id));
    } catch (err) { setError((err as Error).message); }
  }

  const drafts    = templates.filter(t => t.status === 'draft').length;
  const published = templates.filter(t => t.status === 'published').length;

  return (
    <div className="tb-page" style={S.page}>

      {/* Hero Header */}
      <div className="tb-hero-header" style={S.heroHeader}>
        <div style={S.heroLeft}>
          <div className="tb-hero-icon" style={S.heroIcon}>📄</div>
          <div>
            <h1 style={S.pageTitle}>Templates</h1>
            <p style={S.pageSubtitle}>Build, manage and publish document templates</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link
            to="/templates/prebuilt"
            style={{
              background: 'linear-gradient(135deg, #fff8e1, #fef3c7)',
              color: '#92400e', border: '1.5px solid rgba(245,158,11,0.35)',
              borderRadius: 10, padding: '8px 14px', fontSize: 13,
              fontWeight: 700, cursor: 'pointer', textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 5,
              boxShadow: '0 2px 8px rgba(245,158,11,0.18)',
            }}
          >
            ⚡ Prebuilt Templates
          </Link>
          <button className="tb-btn-import" style={S.importBtn} onClick={() => setShowImport(true)}>
            ↑ Import
          </button>
          <button
            className="tb-btn-primary"
            style={{ ...S.primaryBtn, opacity: isCreating ? 0.7 : 1 }}
            onClick={() => setShowCreateModal(true)}
            disabled={isCreating}
          >
            + New Template
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="tb-stats-row" style={S.statsRow}>
        {[
          { label: 'Total',     value: templates.length, color: '#3b6ef8', border: '#6b93ff', icon: '📄', grad: 'linear-gradient(135deg, #eff4ff 0%, #e8efff 100%)' },
          { label: 'Drafts',    value: drafts,           color: '#d97706', border: '#fbbf24', icon: '✏️', grad: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)' },
          { label: 'Published', value: published,        color: '#059669', border: '#34d399', icon: '✅', grad: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)' },
        ].map((s) => (
          <div
            key={s.label}
            className="tb-stat-card"
            style={{ ...S.statCard, borderTop: `3px solid ${s.border}`, background: s.grad }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="tb-stat-num" style={{ ...S.statNum, color: s.color }}>{s.value}</div>
              <span style={{ fontSize: 20, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.12))' }}>{s.icon}</span>
            </div>
            <div style={S.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="tb-filters-bar" style={S.filtersBar}>
        <input
          type="text"
          className="tb-search"
          placeholder="🔍  Search templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={S.searchInput}
        />
        <select className="tb-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={S.select}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.filter(Boolean).map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <select className="tb-select" value={targetFilter} onChange={(e) => setTargetFilter(e.target.value)} style={S.select}>
          {TARGET_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
        <select className="tb-select" value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)} style={S.select}>
          <option value="">All industries</option>
          {INDUSTRY_OPTIONS.filter((opt) => opt.value).map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {!isLoading && (
          <span style={S.countText}>
            {templates.length} template{templates.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {error && <ErrorAlert message={error} onRetry={fetchTemplates} />}
      {isLoading && <LoadingSpinner message="Loading templates..." />}

      {/* Empty State */}
      {!isLoading && !error && templates.length === 0 && (
        <div style={S.emptyState}>
          <div className="tb-empty-icon" style={{ fontSize: 48, marginBottom: 14 }}>📄</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8, letterSpacing: '-0.3px' }}>
            No templates found
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
            {search || statusFilter || targetFilter || industryFilter
              ? 'Try adjusting your filters to see more results.'
              : 'Create your first template to get started.'}
          </div>
          {!search && !statusFilter && !targetFilter && !industryFilter && (
            <button className="tb-btn-primary" style={S.primaryBtn} onClick={() => setShowCreateModal(true)}>
              + New Template
            </button>
          )}
        </div>
      )}

      {/* Table */}
      {!isLoading && !error && templates.length > 0 && (
        <div className="tb-table-wrapper" style={S.tableWrapper}>
          <table style={S.table}>
            <thead>
              <tr>
                {['Name', 'Status', 'Format', 'Industry', 'Created', ''].map((col) => (
                  <th key={col} style={S.th}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {templates.map((t, idx) => {
                const tc = TARGET_META[t.output_target] ?? { bg: '#f1f5f9', color: '#475569', icon: '📄' };
                return (
                  <tr
                    key={t.template_id}
                    className="tb-row"
                    style={{ ...S.tr, backgroundColor: idx % 2 === 0 ? '#ffffff' : 'var(--surface-2)' }}
                    onClick={() => navigate(`/templates/${t.template_id}`)}
                    onMouseEnter={() => setHoveredRow(t.template_id)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    <td style={S.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div
                          className="tb-template-icon"
                          style={{
                            width: 34, height: 34, borderRadius: 10,
                            background: tc.bg,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 15, flexShrink: 0,
                            boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                            border: `1px solid ${tc.color}22`,
                          }}
                        >
                          {tc.icon}
                        </div>
                        <div>
                          <div style={S.templateName}>{t.name}</div>
                          {t.description && <div style={S.templateDesc}>{t.description}</div>}
                          {t.tags && t.tags.length > 0 && (
                            <div style={S.tagRow}>
                              {t.tags.slice(0, 3).map((tag) => (
                                <span key={tag} className="tb-tag" style={S.tag}>{tag}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={S.td}><StatusBadge status={t.status} /></td>
                    <td style={S.td}>
                      <span style={{ ...S.targetBadge, backgroundColor: tc.bg, color: tc.color, border: `1px solid ${tc.color}30` }}>
                        {tc.icon} {t.output_target.toUpperCase()}
                      </span>
                    </td>
                    <td style={S.td}>
                      {t.industry
                        ? <span style={S.industryBadge}>{formatIndustry(t.industry)}</span>
                        : <span style={{ color: 'var(--text-faint)', fontSize: 13 }}>—</span>}
                    </td>
                    <td style={{ ...S.td, color: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-family-mono)', letterSpacing: '0.02em' }}>
                      {formatDate(t.created_at)}
                    </td>
                    <td style={S.td}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="tb-btn-open"
                          style={S.openBtn}
                          onClick={(e) => { e.stopPropagation(); navigate(`/templates/${t.template_id}`); }}
                        >
                          Open →
                        </button>
                        <button
                          className="tb-btn-delete"
                          style={S.deleteBtn}
                          onClick={(e) => handleDeleteTemplate(e, t.template_id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div
          className="tb-modal-overlay"
          style={M.overlay}
          onClick={() => { setShowCreateModal(false); setForm({ ...EMPTY_FORM }); }}
        >
          <div className="tb-modal-box" style={M.box} onClick={(e) => e.stopPropagation()}>
            <div style={M.header}>
              <div>
                <h2 style={M.title}>✦ New Template</h2>
                <p style={M.subtitle}>Set up your template details before editing</p>
              </div>
              <button style={M.closeBtn} onClick={() => { setShowCreateModal(false); setForm({ ...EMPTY_FORM }); }}>✕</button>
            </div>
            <div style={M.body}>
              <div style={M.field}>
                <label style={M.label}>Template Name</label>
                <input
                  className="tb-modal-input"
                  style={M.input}
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Loan Closure Letter"
                  autoFocus
                />
              </div>
              <div style={M.field}>
                <label style={M.label}>Output Format</label>
                <div style={M.formatGrid}>
                  {(['pdf', 'docx', 'xlsx', 'html', 'md'] as OutputTarget[]).map((fmt) => {
                    const m = TARGET_META[fmt] ?? { bg: '#f1f5f9', color: '#475569', icon: '📄' };
                    return (
                      <button
                        key={fmt}
                        className="tb-format-btn"
                        style={{
                          ...M.formatBtn,
                          ...(form.output_target === fmt
                            ? { backgroundColor: m.bg, color: m.color, borderColor: m.color + '60', transform: 'scale(1.05)', boxShadow: `0 4px 12px ${m.color}22` }
                            : {}),
                        }}
                        onClick={() => setForm((p) => ({ ...p, output_target: fmt }))}
                      >
                        {m.icon} {fmt.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={M.field}>
                <label style={M.label}>
                  Industry{' '}
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 11, textTransform: 'none', letterSpacing: 0 }}>
                    (optional)
                  </span>
                </label>
                <select
                  className="tb-modal-input tb-select"
                  style={M.select}
                  value={form.industry}
                  onChange={(e) => setForm((p) => ({ ...p, industry: e.target.value }))}
                >
                  {INDUSTRY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
            </div>
            <div style={M.footer}>
              <button
                className="tb-cancel-btn"
                style={M.cancelBtn}
                onClick={() => { setShowCreateModal(false); setForm({ ...EMPTY_FORM }); }}
              >
                Cancel
              </button>
              <button
                className="tb-create-btn"
                style={{ ...M.createBtn, opacity: isCreating ? 0.7 : 1, cursor: isCreating ? 'not-allowed' : 'pointer' }}
                onClick={handleCreateTemplate}
                disabled={isCreating}
              >
                {isCreating ? '⟳ Creating...' : '+ Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <ImportTemplateModal
          onClose={() => setShowImport(false)}
          onImported={() => { fetchTemplates(); setShowImport(false); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// Inline styles (layout/structural values)
// ─────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  page:         { padding: '20px 24px', maxWidth: '1160px', fontFamily: 'var(--font-family-sans)' },

  heroHeader:   {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16,
    background: 'var(--color-bg-surface)',
    borderRadius: 18, padding: '16px 22px',
    border: '1px solid var(--color-border-soft)',
    boxShadow: 'var(--shadow-md)',
    position: 'relative',
  },
  heroLeft:     { display: 'flex', alignItems: 'center', gap: 16 },
  heroIcon:     {
    fontSize: 24,
    background: 'var(--color-primary-50)',
    borderRadius: 12, padding: '8px 10px',
    boxShadow: 'var(--shadow-sm)',
    lineHeight: 1, border: '1px solid var(--color-primary-200)',
  },
  pageTitle:    { fontSize: 19, fontWeight: 800, color: 'var(--color-text-strong)', letterSpacing: '-0.6px', lineHeight: 1.1 },
  pageSubtitle: { fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3, fontWeight: 500 },
  primaryBtn:   {
    color: '#fff', border: 'none', borderRadius: 10,
    padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(59,110,248,0.35)', letterSpacing: '-0.1px',
  },
  importBtn:    {
    background: 'rgba(255,255,255,0.85)', color: '#3b6ef8',
    border: '1.5px solid rgba(59,110,248,0.3)', borderRadius: 10,
    padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    backdropFilter: 'blur(4px)',
  },

  statsRow:     { display: 'flex', gap: 12, marginBottom: 16 },
  statCard:     {
    flex: 1,
    border: '1px solid var(--border)',
    borderRadius: 14, padding: '14px 18px',
    boxShadow: 'var(--shadow-sm)',
    position: 'relative', overflow: 'hidden',
  },
  statNum:      { fontSize: 26, fontWeight: 800, lineHeight: 1, letterSpacing: '-1.5px' },
  statLabel:    { fontSize: 11, color: '#8898b8', marginTop: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' },

  filtersBar:   { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' },
  searchInput:  {
    flex: 1, minWidth: 220, padding: '8px 12px',
    border: '1.5px solid var(--border)', borderRadius: 9,
    fontSize: 13, color: 'var(--text-primary)',
    backgroundColor: '#fff', boxShadow: 'var(--shadow-xs)',
  },
  select:       {
    padding: '8px 30px 8px 11px', border: '1.5px solid var(--border)',
    borderRadius: 9, fontSize: 13, color: 'var(--text-secondary)',
    backgroundColor: '#fff', cursor: 'pointer',
    boxShadow: 'var(--shadow-xs)',
    fontFamily: 'var(--font-family-sans)',
  },
  countText:    { fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto', whiteSpace: 'nowrap', fontWeight: 600, letterSpacing: '0.02em' },

  emptyState:   {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '90px 20px',
    background: 'linear-gradient(135deg, #ffffff 0%, var(--surface-2) 100%)',
    border: '1.5px dashed var(--border-strong)', borderRadius: 20,
    boxShadow: 'var(--shadow-sm)', textAlign: 'center',
  },

  tableWrapper: {
    backgroundColor: '#fff',
    border: '1px solid var(--border)',
    borderRadius: 18, overflow: 'hidden',
    boxShadow: 'var(--shadow-md)',
  },
  table:        { width: '100%', borderCollapse: 'collapse' },
  th:           {
    textAlign: 'left', padding: '12px 18px',
    fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.09em',
    background: 'linear-gradient(180deg, var(--navy-50) 0%, #edf0f8 100%)',
    borderBottom: '1.5px solid var(--border)',
  },
  tr:           { borderBottom: '1px solid var(--border)', cursor: 'pointer' },
  td:           { padding: '13px 18px', verticalAlign: 'middle' },

  templateName: { fontWeight: 700, color: 'var(--text-primary)', fontSize: 13.5, marginBottom: 2, letterSpacing: '-0.2px' },
  templateDesc: { fontSize: 12, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.4 },
  tagRow:       { display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' },
  tag:          {
    background: 'var(--color-primary-50)',
    color: 'var(--color-primary-800)', fontSize: 10.5, padding: '2px 9px',
    borderRadius: 999, fontWeight: 700,
    border: '1px solid var(--color-primary-200)', letterSpacing: '0.02em',
  },
  targetBadge:  {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '3px 10px', borderRadius: 999,
    fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  industryBadge: {
    background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)',
    color: '#065f46', fontSize: 11, padding: '3px 10px',
    borderRadius: 999, fontWeight: 700, border: '1px solid #a7f3d0',
    letterSpacing: '0.02em',
  },
  openBtn:      {
    backgroundColor: 'var(--accent-subtle)',
    border: '1.5px solid rgba(59,110,248,0.22)', borderRadius: 8,
    padding: '6px 14px', fontSize: 12, color: 'var(--accent)',
    fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', letterSpacing: '-0.1px',
  },
  deleteBtn:    {
    backgroundColor: 'var(--danger-bg)',
    border: '1.5px solid rgba(239,68,68,0.2)', borderRadius: 8,
    padding: '6px 14px', fontSize: 12, color: 'var(--danger)',
    fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  },
};

const M: Record<string, React.CSSProperties> = {
  overlay:    {
    position: 'fixed', inset: 0,
    backgroundColor: 'rgba(5,13,26,0.65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100, backdropFilter: 'blur(8px) saturate(180%)',
    padding: '20px',
  },
  box:        {
    backgroundColor: '#fff', borderRadius: 22, width: 490,
    maxHeight: '88vh', overflowY: 'auto',
    boxShadow: '0 32px 72px rgba(5,13,26,0.28), 0 8px 24px rgba(5,13,26,0.12)',
    display: 'flex', flexDirection: 'column',
    border: '1px solid rgba(59,110,248,0.12)',
  },
  header:     {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '20px 24px 16px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--color-bg-elevated)',
    borderRadius: '22px 22px 0 0',
    position: 'relative',
  },
  title:      { fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.4px' },
  subtitle:   { fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3 },
  closeBtn:   {
    background: 'rgba(148,163,184,0.12)', border: '1px solid var(--border)',
    fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer',
    lineHeight: 1, padding: '7px 9px', borderRadius: 8,
    fontFamily: 'var(--font-family-mono)',
  },
  body:       { padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 22 },
  field:      { display: 'flex', flexDirection: 'column', gap: 8 },
  label:      {
    fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)',
    textTransform: 'uppercase', letterSpacing: '0.09em',
  },
  input:      {
    padding: '9px 13px', border: '1.5px solid var(--border)',
    borderRadius: 9, fontSize: 13.5, color: 'var(--text-primary)',
    fontFamily: 'var(--font-family-sans)',
    boxShadow: 'var(--shadow-xs)',
  },
  select:     {
    padding: '9px 30px 9px 13px', border: '1.5px solid var(--border)',
    borderRadius: 9, fontSize: 13.5, color: 'var(--text-primary)',
    backgroundColor: '#fff', cursor: 'pointer',
    fontFamily: 'var(--font-family-sans)',
    appearance: 'none',
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%238898b8' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")",
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    boxShadow: 'var(--shadow-xs)',
  },
  formatGrid: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  formatBtn:  {
    padding: '9px 16px', border: '1.5px solid var(--border)',
    borderRadius: 10, fontSize: 12, fontWeight: 700,
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--surface-2)', cursor: 'pointer',
    letterSpacing: '0.04em',
    fontFamily: 'var(--font-family-sans)',
    boxShadow: 'var(--shadow-xs)',
  },
  footer:     {
    display: 'flex', justifyContent: 'flex-end', gap: 10,
    padding: '16px 24px',
    borderTop: '1px solid var(--border)',
    background: 'var(--surface-2)',
    borderRadius: '0 0 22px 22px',
  },
  cancelBtn:  {
    background: '#fff', border: '1.5px solid var(--border)',
    borderRadius: 10, padding: '9px 18px', fontSize: 13,
    color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600,
    fontFamily: 'var(--font-family-sans)',
    boxShadow: 'var(--shadow-xs)',
  },
  createBtn:  {
    color: '#fff', border: 'none', borderRadius: 10,
    padding: '9px 20px', fontSize: 13, fontWeight: 700,
    boxShadow: 'var(--shadow-accent)',
    fontFamily: 'var(--font-family-sans)',
    letterSpacing: '-0.1px',
  },
};
