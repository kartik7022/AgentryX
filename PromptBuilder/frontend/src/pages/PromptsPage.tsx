// src/pages/PromptsPage.tsx
//
// PB-015 — Prompts list page
//
// Visual design follows the senior's mockup:
//   - Hero header with title + subtitle + Import / + New Prompt buttons
//   - Three stat tiles: Total / Drafts / Published
//   - Search + status filter + industry filter row
//   - Card-based list (not a table) with icon, name, description, status pill,
//     industry tag and "updated X ago"
//   - Hover actions: Open / Duplicate / Archive
//   - Create modal (name + description + use_case + industry)
//   - Empty state when no prompts match
//
// Style mirrors TemplatesPage so the two coexist naturally.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listPrompts,
  createPrompt,
  duplicatePrompt,
  deletePrompt,
} from '../api/prompts';
import type { Prompt } from '../types/api';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import ErrorAlert from '../components/shared/ErrorAlert';

// ============================================================================
// Constants
// ============================================================================

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '',           label: 'All statuses' },
  { value: 'draft',      label: 'Draft' },
  { value: 'testing',    label: 'Testing' },
  { value: 'in_review',  label: 'In review' },
  { value: 'approved',   label: 'Approved' },
  { value: 'published',  label: 'Published' },
  { value: 'deprecated', label: 'Deprecated' },
];

const INDUSTRY_OPTIONS = [
  { value: '',            label: 'All domains' },
  { value: 'banking',     label: '🏦 Banking' },
  { value: 'insurance',   label: '🛡 Insurance' },
  { value: 'healthcare',  label: '🏥 Healthcare' },
  { value: 'sales',       label: '💼 Sales' },
  { value: 'legal',       label: '⚖ Legal' },
  { value: 'education',   label: '🎓 Education' },
  { value: 'logistics',   label: '🚚 Logistics' },
  { value: 'real_estate', label: '🏠 Real Estate' },
];

/** Color palette per status — matches mockup pills */
const STATUS_PILL: Record<string, { bg: string; color: string; label: string }> = {
  draft:      { bg: 'var(--color-warning-bg)', color: 'var(--color-warning-text)', label: 'draft' },
  testing:    { bg: 'var(--color-warning-bg)', color: 'var(--color-warning-text)', label: 'testing' },
  in_review:  { bg: '#fce7f3', color: '#9d174d', label: 'in review' },
  approved:   { bg: 'var(--color-info-bg)', color: 'var(--color-info-text)', label: 'approved' },
  published:  { bg: 'var(--color-success-bg)', color: 'var(--color-success-text)', label: 'published' },
  deprecated: { bg: 'var(--color-bg-muted)', color: 'var(--color-text-base)', label: 'deprecated' },
  archived:   { bg: 'var(--color-bg-muted)', color: '#6b7280', label: 'archived' },
};

const INDUSTRY_PILL: Record<string, { bg: string; color: string }> = {
  banking:     { bg: 'var(--color-info-bg)', color: 'var(--color-info-text)' },
  insurance:   { bg: 'var(--color-primary-100)', color: '#6b21a8' },
  healthcare:  { bg: 'var(--color-error-bg)', color: 'var(--color-error-text)' },
  sales:       { bg: 'var(--color-success-bg)', color: 'var(--color-success-text)' },
  legal:       { bg: 'var(--color-primary-50)', color: 'var(--color-primary-800)' },
  education:   { bg: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' },
  logistics:   { bg: 'var(--color-accent-100)', color: 'var(--color-accent-700)' },
  real_estate: { bg: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' },
};

const EMPTY_FORM = {
  name:        '',
  description: '',
  use_case:    '',
  industry:    '',
};


// ============================================================================
// Helpers
// ============================================================================

function relativeTime(iso: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const now  = Date.now();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60)        return 'just now';
  if (diffSec < 3600)      return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400)     return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function initialsFromName(name: string): string {
  if (!name) return '🤖';
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '🤖';
  if (words.length === 1) return words[0][0].toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}


// ============================================================================
// Component
// ============================================================================

export default function PromptsPage() {
  const navigate = useNavigate();

  const [prompts,    setPrompts]    = useState<Prompt[]>([]);
  const [isLoading,  setIsLoading]  = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  const [search,         setSearch]         = useState('');
  const [statusFilter,   setStatusFilter]   = useState('');
  const [industryFilter, setIndustryFilter] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating,      setIsCreating]      = useState(false);
  const [form,            setForm]            = useState({ ...EMPTY_FORM });

  // ─── Load prompts (re-runs whenever filters change) ────────────────────
  const fetchPrompts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listPrompts({
        search:    search    || undefined,
        status:    statusFilter || undefined,
        industry:  industryFilter || undefined,
      });
      // Hide archived unless caller explicitly filtered to them
      setPrompts(
        statusFilter === 'archived'
          ? data
          : data.filter((p) => p.status !== 'archived')
      );
    } catch (err) {
      setError((err as Error).message || 'Failed to load prompts');
    } finally {
      setIsLoading(false);
    }
  }, [search, statusFilter, industryFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPrompts();
  }, [fetchPrompts]);

  // ─── Stats (computed from current loaded list) ─────────────────────────
  const stats = useMemo(() => {
    const total     = prompts.length;
    const drafts    = prompts.filter((p) => p.status === 'draft').length;
    const published = prompts.filter((p) => p.status === 'published').length;
    return { total, drafts, published };
  }, [prompts]);

  // ─── Actions ───────────────────────────────────────────────────────────

  async function handleCreatePrompt() {
    if (!form.name.trim()) {
      setError('Prompt name is required');
      return;
    }
    setIsCreating(true);
    setError(null);
    try {
      const created = await createPrompt({
        name:        form.name.trim(),
        description: form.description.trim() || undefined,
        use_case:    form.use_case.trim()    || undefined,
        industry:    form.industry           || undefined,
      });
      setShowCreateModal(false);
      setForm({ ...EMPTY_FORM });
      navigate(`/prompts/studio/${created.prompt_id}`);
    } catch (err) {
      setError((err as Error).message || 'Failed to create prompt');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDuplicate(e: React.MouseEvent, promptId: string) {
    e.stopPropagation();
    try {
      const dup = await duplicatePrompt(promptId);
      await fetchPrompts();
      navigate(`/prompts/studio/${dup.prompt_id}`);
    } catch (err) {
      setError((err as Error).message || 'Failed to duplicate prompt');
    }
  }

  async function handleArchive(e: React.MouseEvent, promptId: string, name: string) {
    e.stopPropagation();
    if (!window.confirm(`Archive "${name}"? It will be hidden from the list.`)) return;
    try {
      await deletePrompt(promptId);
      setPrompts((prev) => prev.filter((p) => p.prompt_id !== promptId));
    } catch (err) {
      setError((err as Error).message || 'Failed to archive prompt');
    }
  }

  function handleOpenPrompt(promptId: string) {
    navigate(`/prompts/studio/${promptId}`);
  }

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div style={S.page}>

      {/* ── Hero header ─────────────────────────────────────────────────── */}
      <div style={S.heroHeader}>
        <div style={S.heroLeft}>
          <div style={S.heroIcon}>💬</div>
          <div>
            <h1 style={S.pageTitle}>Prompts</h1>
            <p style={S.pageSubtitle}>
              Build, version and run AI prompts connected to your data sources
            </p>
          </div>
        </div>

        <div style={S.heroActions}>
          {/* <button
            type="button"
            style={S.importBtn}
            onClick={() => alert('Import flow — coming in a later ticket')}
          >
            <span style={{ marginRight: 6 }}>📥</span> Import
          </button> */}
          <button
            type="button"
            style={S.primaryBtn}
            onClick={() => setShowCreateModal(true)}
          >
            <span style={{ marginRight: 4, fontSize: 17 }}>+</span> New Prompt
          </button>
        </div>
      </div>

      {/* ── Stat tiles ──────────────────────────────────────────────────── */}
      <div style={S.statsRow}>
        <StatTile color="var(--color-primary-700)" lightBg="var(--color-primary-50)" label="TOTAL"     value={stats.total} />
        <StatTile color="var(--color-warning-text)" lightBg="var(--color-warning-bg)" label="DRAFTS"    value={stats.drafts} />
        <StatTile color="var(--color-accent-700)" lightBg="var(--color-success-bg)" label="PUBLISHED" value={stats.published} />
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────────── */}
      <div style={S.filterBar}>
        <div style={S.searchWrap}>
          <span style={S.searchIcon}>🔍</span>
          <input
            type="text"
            placeholder="Search prompts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={S.searchInput}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={S.filterSelect}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          value={industryFilter}
          onChange={(e) => setIndustryFilter(e.target.value)}
          style={S.filterSelect}
        >
          {INDUSTRY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && <div style={{ marginBottom: 16 }}><ErrorAlert message={error} onRetry={fetchPrompts} /></div>}

      {/* ── Loading / Empty / List ──────────────────────────────────────── */}
      {isLoading ? (
        <LoadingSpinner message="Loading prompts..." />
      ) : prompts.length === 0 ? (
        <EmptyState
          isFiltered={!!(search || statusFilter || industryFilter)}
          onCreate={() => setShowCreateModal(true)}
        />
      ) : (
        <div style={S.cardList}>
          {prompts.map((p) => (
            <PromptCard
              key={p.prompt_id}
              prompt={p}
              onOpen={handleOpenPrompt}
              onDuplicate={handleDuplicate}
              onArchive={handleArchive}
            />
          ))}
        </div>
      )}

      {/* ── Create modal ────────────────────────────────────────────────── */}
      {showCreateModal && (
        <CreateModal
          form={form}
          isCreating={isCreating}
          onChange={setForm}
          onCancel={() => { setShowCreateModal(false); setForm({ ...EMPTY_FORM }); }}
          onCreate={handleCreatePrompt}
        />
      )}
    </div>
  );
}


// ============================================================================
// Sub-components
// ============================================================================

function StatTile({
  color, lightBg, label, value,
}: { color: string; lightBg: string; label: string; value: number }) {
  return (
    <div style={{ ...S.statTile, background: lightBg }}>
      <div style={{ ...S.statValue, color }}>{value}</div>
      <div style={S.statLabel}>{label}</div>
    </div>
  );
}

function PromptCard({
  prompt, onOpen, onDuplicate, onArchive,
}: {
  prompt: Prompt;
  onOpen: (id: string) => void;
  onDuplicate: (e: React.MouseEvent, id: string) => void;
  onArchive: (e: React.MouseEvent, id: string, name: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const statusPill   = STATUS_PILL[prompt.status]   || STATUS_PILL.archived;
  const industryPill = prompt.industry ? INDUSTRY_PILL[prompt.industry] : null;

  return (
    <div
      style={{ ...S.card, ...(hovered ? S.cardHover : {}) }}
      onClick={() => onOpen(prompt.prompt_id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={S.cardIcon}>{initialsFromName(prompt.name)}</div>

      <div style={S.cardBody}>
        <div style={S.cardTopRow}>
          <h3 style={S.cardTitle}>{prompt.name}</h3>
          <div style={S.cardTopRight}>
            <span style={S.cardUpdated}>Updated {relativeTime(prompt.updated_at)}</span>
          </div>
        </div>

        {prompt.description && (
          <p style={S.cardDescription}>{prompt.description}</p>
        )}

        <div style={S.cardTagRow}>
          <span style={{ ...S.statusPill, background: statusPill.bg, color: statusPill.color }}>
            {statusPill.label}
          </span>
          {prompt.industry && industryPill && (
            <span style={{ ...S.industryPill, background: industryPill.bg, color: industryPill.color }}>
              {prompt.industry.replace(/_/g, ' ')}
            </span>
          )}
          {prompt.use_case && (
            <span style={S.useCasePill}>{prompt.use_case}</span>
          )}
        </div>
      </div>

      <div style={{ ...S.cardActions, opacity: hovered ? 1 : 0 }}>
        <button
          style={S.actionBtn}
          onClick={(e) => onDuplicate(e, prompt.prompt_id)}
          title="Duplicate prompt"
        >
          📋
        </button>
        <button
          style={S.actionBtn}
          onClick={(e) => onArchive(e, prompt.prompt_id, prompt.name)}
          title="Archive prompt"
        >
          🗑
        </button>
      </div>
    </div>
  );
}

function EmptyState({
  isFiltered, onCreate,
}: { isFiltered: boolean; onCreate: () => void }) {
  return (
    <div style={S.empty}>
      <div style={S.emptyIcon}>💬</div>
      <h3 style={S.emptyTitle}>
        {isFiltered ? 'No prompts match your filters' : 'No prompts yet'}
      </h3>
      <p style={S.emptyHint}>
        {isFiltered
          ? 'Try clearing filters or searching with different keywords.'
          : 'Create your first AI prompt — connect it to your data sources, version it, and run it from anywhere.'}
      </p>
      {!isFiltered && (
        <button style={{ ...S.primaryBtn, marginTop: 18 }} onClick={onCreate}>
          <span style={{ marginRight: 4, fontSize: 17 }}>+</span> Create your first prompt
        </button>
      )}
    </div>
  );
}

function CreateModal({
  form, isCreating, onChange, onCancel, onCreate,
}: {
  form: typeof EMPTY_FORM;
  isCreating: boolean;
  onChange: (next: typeof EMPTY_FORM) => void;
  onCancel: () => void;
  onCreate: () => void;
}) {
  return (
    <div style={M.overlay} onClick={onCancel}>
      <div style={M.modal} onClick={(e) => e.stopPropagation()}>
        <div style={M.header}>
          <h2 style={M.title}>+ New Prompt</h2>
          <button style={M.closeBtn} onClick={onCancel} aria-label="Close">×</button>
        </div>

        <div style={M.body}>
          <div style={M.field}>
            <label style={M.label}>Name *</label>
            <input
              type="text"
              autoFocus
              placeholder="e.g. Loan NOC Eligibility"
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
              style={M.input}
            />
          </div>

          <div style={M.field}>
            <label style={M.label}>Description</label>
            <textarea
              placeholder="Briefly describe what this prompt does..."
              value={form.description}
              onChange={(e) => onChange({ ...form, description: e.target.value })}
              rows={3}
              style={{ ...M.input, ...M.textarea }}
            />
          </div>

          <div style={M.fieldRow}>
            <div style={{ ...M.field, flex: 1 }}>
              <label style={M.label}>Use case</label>
              <input
                type="text"
                placeholder="e.g. loan_noc"
                value={form.use_case}
                onChange={(e) => onChange({ ...form, use_case: e.target.value })}
                style={M.input}
              />
            </div>

            <div style={{ ...M.field, flex: 1 }}>
              <label style={M.label}>Industry</label>
              <select
                value={form.industry}
                onChange={(e) => onChange({ ...form, industry: e.target.value })}
                style={M.input}
              >
                <option value="">Select industry...</option>
                {INDUSTRY_OPTIONS.filter((o) => o.value).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div style={M.footer}>
          <button style={M.cancelBtn} onClick={onCancel} disabled={isCreating}>
            Cancel
          </button>
          <button
            style={{
              ...M.createBtn,
              opacity:  isCreating ? 0.7 : 1,
              cursor:   isCreating ? 'not-allowed' : 'pointer',
            }}
            onClick={onCreate}
            disabled={isCreating || !form.name.trim()}
          >
            {isCreating ? '⟳ Creating...' : '+ Create Prompt'}
          </button>
        </div>
      </div>
    </div>
  );
}


// ============================================================================
// Inline styles
// ============================================================================

const S: Record<string, React.CSSProperties> = {
  page: {
    padding: '20px 24px',
    maxWidth: 1160,
    margin: '0 auto',
    fontFamily: "var(--font-family-sans)",
  },

  // Hero header
  heroHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
    background: 'linear-gradient(135deg, var(--color-primary-50) 0%, var(--color-primary-100) 50%, var(--color-primary-50) 100%)',
    borderRadius: 18,
    padding: '18px 22px',
    border: '1px solid rgba(191, 219, 254, 0.85)',
    boxShadow: '0 4px 20px rgba(15, 23, 42, 0.08), 0 1px 4px rgba(15, 23, 42, 0.04)',
  },
  heroLeft: { display: 'flex', alignItems: 'center', gap: 16 },
  heroIcon: {
    width: 48,
    height: 48,
    background: 'var(--color-primary-700)',
    color: 'var(--color-text-strong)',
    fontSize: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    boxShadow: 'var(--shadow-sm)',
  },
  pageTitle:    { margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--color-text-strong)' },
  pageSubtitle: { margin: '4px 0 0', fontSize: 13.5, color: 'var(--color-text-muted)' },
  heroActions:  { display: 'flex', gap: 10 },
  importBtn: {
    background: 'rgba(255,255,255,0.85)',
    border: '1px solid rgba(191, 219, 254, 0.85)',
    color: 'var(--color-primary-800)',
    fontWeight: 600,
    fontSize: 13,
    padding: '10px 16px',
    borderRadius: 10,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
  },
  primaryBtn: {
    background: 'var(--color-primary-700)',
    border: 'none',
    color: 'var(--color-text-strong)',
    fontWeight: 600,
    fontSize: 13,
    padding: '10px 18px',
    borderRadius: 10,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    boxShadow: 'var(--shadow-sm)',
  },

  // Stat tiles
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 14,
    marginBottom: 18,
  },
  statTile: {
    padding: '20px 22px',
    borderRadius: 14,
    border: '1px solid rgba(0,0,0,0.04)',
  },
  statValue: { fontSize: 36, fontWeight: 700, lineHeight: 1, marginBottom: 4 },
  statLabel: { fontSize: 11.5, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--color-text-muted)' },

  // Filter bar
  filterBar: {
    display: 'flex',
    gap: 10,
    marginBottom: 18,
    alignItems: 'center',
  },
  searchWrap: {
    flex: 1,
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: 14,
    fontSize: 14,
    color: 'var(--color-text-soft)',
    pointerEvents: 'none',
  },
  searchInput: {
    width: '100%',
    padding: '11px 14px 11px 38px',
    borderRadius: 10,
    border: '1px solid var(--color-border-soft)',
    fontSize: 14,
    outline: 'none',
    fontFamily: 'inherit',
    background: 'var(--color-bg-surface)',
  },
  filterSelect: {
    padding: '11px 14px',
    borderRadius: 10,
    border: '1px solid var(--color-border-soft)',
    fontSize: 13.5,
    outline: 'none',
    minWidth: 160,
    fontFamily: 'inherit',
    background: 'var(--color-bg-surface)',
    cursor: 'pointer',
  },

  // Card list
  cardList: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 16,
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-soft)',
    borderRadius: 14,
    padding: '16px 18px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    position: 'relative',
  },
  cardHover: {
    borderColor: 'var(--color-primary-200)',
    boxShadow: '0 4px 18px rgba(15, 23, 42, 0.08)',
    transform: 'translateY(-1px)',
  },
  cardIcon: {
    width: 42,
    height: 42,
    background: 'var(--color-primary-50)',
    color: 'var(--color-primary-800)',
    fontSize: 16,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    flexShrink: 0,
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  cardTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--color-text-strong)',
    lineHeight: 1.3,
  },
  cardTopRight: { fontSize: 12, color: 'var(--color-text-soft)', whiteSpace: 'nowrap' },
  cardUpdated:  {},
  cardDescription: {
    margin: '6px 0 10px',
    fontSize: 13,
    color: 'var(--color-text-muted)',
    lineHeight: 1.5,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  cardTagRow: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  statusPill: {
    fontSize: 11,
    fontWeight: 600,
    padding: '3px 10px',
    borderRadius: 999,
    textTransform: 'lowercase',
  },
  industryPill: {
    fontSize: 11,
    fontWeight: 600,
    padding: '3px 10px',
    borderRadius: 999,
    textTransform: 'capitalize',
  },
  useCasePill: {
    fontSize: 11,
    fontWeight: 500,
    padding: '3px 10px',
    borderRadius: 999,
    background: 'var(--color-bg-muted)',
    color: 'var(--color-text-base)',
  },
  cardActions: {
    position: 'absolute',
    right: 14,
    top: 14,
    display: 'flex',
    gap: 4,
    transition: 'opacity 0.15s ease',
  },
  actionBtn: {
    width: 32,
    height: 32,
    border: '1px solid var(--color-border-soft)',
    background: 'var(--color-bg-surface)',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty state
  empty: {
    background: 'var(--color-bg-surface)',
    border: '1px dashed var(--color-border-soft)',
    borderRadius: 14,
    padding: '60px 32px',
    textAlign: 'center',
  },
  emptyIcon:  { fontSize: 38, marginBottom: 12 },
  emptyTitle: { margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--color-text-strong)', marginBottom: 6 },
  emptyHint:  { margin: 0, fontSize: 13.5, color: 'var(--color-text-muted)', maxWidth: 460, marginInline: 'auto' },
};

const M: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(15, 23, 42, 0.4)',
    backdropFilter: 'blur(4px)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 540,
    background: 'var(--color-bg-surface)',
    borderRadius: 16,
    boxShadow: '0 25px 60px rgba(15, 23, 42, 0.12)',
    overflow: 'hidden',
    fontFamily: "var(--font-family-sans)",
  },
  header: {
    padding: '20px 24px',
    borderBottom: '1px solid var(--color-bg-muted)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--color-text-strong)' },
  closeBtn: {
    border: 'none', background: 'transparent', cursor: 'pointer',
    fontSize: 22, color: 'var(--color-text-soft)', lineHeight: 1, padding: 0,
  },
  body:    { padding: 24, display: 'flex', flexDirection: 'column', gap: 16 },
  field:   { display: 'flex', flexDirection: 'column', gap: 6 },
  fieldRow:{ display: 'flex', gap: 14 },
  label: {
    fontSize: 11.5, fontWeight: 600, color: 'var(--color-text-muted)',
    letterSpacing: '0.04em', textTransform: 'uppercase',
  },
  input: {
    padding: '10px 12px',
    border: '1px solid var(--color-border-soft)',
    borderRadius: 8,
    fontSize: 14,
    outline: 'none',
    background: 'var(--color-bg-surface)',
    fontFamily: 'inherit',
  },
  textarea: { resize: 'vertical', minHeight: 70, fontFamily: 'inherit' },
  footer: {
    padding: '16px 24px',
    borderTop: '1px solid var(--color-bg-muted)',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelBtn: {
    padding: '10px 16px',
    border: '1px solid var(--color-border-soft)',
    background: 'var(--color-bg-surface)',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    color: 'var(--color-text-base)',
    fontFamily: 'inherit',
  },
  createBtn: {
    padding: '10px 18px',
    border: 'none',
    background: 'var(--color-primary-700)',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-text-strong)',
    boxShadow: 'var(--shadow-sm)',
    fontFamily: 'inherit',
  },
};