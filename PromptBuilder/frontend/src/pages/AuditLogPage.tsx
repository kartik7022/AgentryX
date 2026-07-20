// src/pages/AuditLogPage.tsx
// Shows all audit events — who did what, when, on which prompt

import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../api/client';

interface AuditEvent {
  event_id:     string;
  entity_type:  string;
  entity_id:    string;
  action:       string;
  actor:        string;
  summary:      string;
  details_json: Record<string, unknown>;
  created_at:   string;
}

const ACTION_COLORS: Record<string, { bg: string; color: string; label: string }> = {
  create:    { bg: 'var(--color-success-bg)', color: 'var(--color-success-text)', label: 'created' },
  update:    { bg: 'var(--color-info-bg)', color: 'var(--color-info-text)', label: 'updated' },
  delete:    { bg: 'var(--color-error-bg)', color: 'var(--color-error-text)', label: 'deleted' },
  publish:   { bg: 'var(--color-primary-50)', color: 'var(--color-primary-800)', label: 'published' },
  rollback:  { bg: 'var(--color-warning-bg)', color: 'var(--color-warning-text)', label: 'rolled back' },
  archive:   { bg: 'var(--color-bg-muted)', color: 'var(--color-text-base)', label: 'archived' },
  duplicate: { bg: 'var(--color-accent-50)', color: 'var(--color-accent-700)', label: 'duplicated' },
  run:       { bg: 'var(--color-success-bg)', color: 'var(--color-success-text)', label: 'ran' },
  evaluate:  { bg: '#fdf4ff', color: '#7e22ce', label: 'evaluated' },
};

const ENTITY_ICONS: Record<string, string> = {
  prompt:        '💬',
  prompt_version:'📌',
  prompt_block:  '🧱',
  prompt_input:  '🔡',
  prompt_run:    '▶️',
  test_case:     '🧪',
  context_binding:'🔌',
  default:       '📋',
};

function relativeTime(iso: string): string {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fullTime(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

async function fetchAuditEvents(params: {
  entity_type?: string;
  action?: string;
  actor?: string;
  limit?: number;
}): Promise<AuditEvent[]> {
  const qs = new URLSearchParams();
  if (params.entity_type) qs.set('entity_type', params.entity_type);
  if (params.action)      qs.set('action', params.action);
  if (params.actor)       qs.set('actor', params.actor);
  qs.set('limit', String(params.limit || 200));
  return apiRequest<AuditEvent[]>({ method: 'GET', url: `/audit/events?${qs}` });
}

export default function AuditLogPage() {
  const [events,        setEvents]        = useState<AuditEvent[]>([]);
  const [isLoading,     setIsLoading]     = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [entityFilter,  setEntityFilter]  = useState('');
  const [actionFilter,  setActionFilter]  = useState('');
  const [actorFilter,   setActorFilter]   = useState('');
  const [search,        setSearch]        = useState('');
  const [expandedId,    setExpandedId]    = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    try {
      const data = await fetchAuditEvents({
        entity_type: entityFilter || undefined,
        action:      actionFilter || undefined,
        actor:       actorFilter  || undefined,
      });
      setEvents(data);
    } catch (err) {
      setError((err as Error).message || 'Failed to load audit events');
    } finally {
      setIsLoading(false);
    }
  }, [entityFilter, actionFilter, actorFilter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadEvents(); }, [loadEvents]);

  // Client-side search filter
  const filtered = events.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.summary?.toLowerCase().includes(q) ||
      e.actor?.toLowerCase().includes(q) ||
      e.entity_type?.toLowerCase().includes(q) ||
      e.action?.toLowerCase().includes(q)
    );
  });

  // Unique actors for filter dropdown
  const actors = Array.from(new Set(events.map(e => e.actor).filter(Boolean)));

  // Group events by date
  const grouped = filtered.reduce((acc, event) => {
    const date = new Date(event.created_at).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    if (!acc[date]) acc[date] = [];
    acc[date].push(event);
    return acc;
  }, {} as Record<string, AuditEvent[]>);

  return (
    <div style={S.page}>

      {/* Hero */}
      <div style={S.hero}>
        <div style={S.heroIcon}>📋</div>
        <div>
          <h1 style={S.title}>Audit log</h1>
          <p style={S.subtitle}>Complete record of every action taken — who changed what, when, on which prompt.</p>
        </div>
        <button type="button" style={S.refreshBtn} onClick={loadEvents} disabled={isLoading}>
          {isLoading ? '⟳' : '↻'} Refresh
        </button>
      </div>

      {/* Stats bar */}
      {!isLoading && events.length > 0 && (
        <div style={S.statsBar}>
          <div style={S.statItem}>
            <strong>{events.length}</strong> total events
          </div>
          <div style={S.statDivider} />
          <div style={S.statItem}>
            <strong>{events.filter(e => e.action === 'publish').length}</strong> publishes
          </div>
          <div style={S.statDivider} />
          <div style={S.statItem}>
            <strong>{events.filter(e => e.action === 'create').length}</strong> creations
          </div>
          <div style={S.statDivider} />
          <div style={S.statItem}>
            <strong>{events.filter(e => e.action === 'delete').length}</strong> deletions
          </div>
          <div style={S.statDivider} />
          <div style={S.statItem}>
            <strong>{actors.length}</strong> actor{actors.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div style={S.filterBar}>
        <div style={S.searchWrap}>
          <span style={S.searchIcon}>🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search events, actors, actions..."
            style={S.searchInput}
          />
          {search && (
            <button type="button" style={S.clearBtn} onClick={() => setSearch('')}>×</button>
          )}
        </div>

        <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)} style={S.select}>
          <option value="">All entity types</option>
          <option value="prompt">Prompt</option>
          <option value="prompt_version">Version</option>
          <option value="prompt_block">Block</option>
          <option value="prompt_input">Input</option>
          <option value="prompt_run">Run</option>
          <option value="test_case">Test case</option>
          <option value="context_binding">Context binding</option>
        </select>

        <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} style={S.select}>
          <option value="">All actions</option>
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
          <option value="publish">Publish</option>
          <option value="rollback">Rollback</option>
          <option value="archive">Archive</option>
          <option value="duplicate">Duplicate</option>
          <option value="run">Run</option>
          <option value="evaluate">Evaluate</option>
        </select>

        <select value={actorFilter} onChange={e => setActorFilter(e.target.value)} style={S.select}>
          <option value="">All actors</option>
          {actors.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        {(entityFilter || actionFilter || actorFilter || search) && (
          <button type="button" style={S.clearAllBtn} onClick={() => { setEntityFilter(''); setActionFilter(''); setActorFilter(''); setSearch(''); }}>
            Clear filters
          </button>
        )}
      </div>

      {/* Error */}
      {error && <div style={S.errorBanner}>⚠️ {error}</div>}

      {/* Loading */}
      {isLoading && (
        <div style={S.loadingWrap}>
          <div style={{ fontSize: 24, marginBottom: 10 }}>⟳</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Loading audit events...</div>
        </div>
      )}

      {/* Empty */}
      {!isLoading && filtered.length === 0 && (
        <div style={S.empty}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
          <div style={S.emptyTitle}>{events.length === 0 ? 'No audit events yet' : 'No events match your filters'}</div>
          <div style={S.emptyHint}>
            {events.length === 0
              ? 'Audit events are recorded when prompts are created, edited, published or deleted.'
              : 'Try clearing your filters to see all events.'}
          </div>
        </div>
      )}

      {/* Event list grouped by date */}
      {!isLoading && filtered.length > 0 && (
        <div style={S.timeline}>
          {Object.entries(grouped).map(([date, dayEvents]) => (
            <div key={date} style={S.dayGroup}>
              <div style={S.dayLabel}>{date}</div>
              <div style={S.dayEvents}>
                {dayEvents.map(event => {
                  const actionMeta = ACTION_COLORS[event.action] || { bg: 'var(--color-bg-muted)', color: 'var(--color-text-base)', label: event.action };
                  const entityIcon = ENTITY_ICONS[event.entity_type] || ENTITY_ICONS.default;
                  const isExpanded = expandedId === event.event_id;
                  const hasDetails = event.details_json && Object.keys(event.details_json).length > 0;

                  return (
                    <div key={event.event_id} style={{ ...S.eventCard, ...(isExpanded ? S.eventCardExpanded : {}) }}>
                      <div style={S.eventMain}>

                        {/* Icon */}
                        <div style={S.entityIcon}>{entityIcon}</div>

                        {/* Content */}
                        <div style={S.eventContent}>
                          <div style={S.eventTop}>
                            <span style={{ ...S.actionBadge, background: actionMeta.bg, color: actionMeta.color }}>
                              {actionMeta.label}
                            </span>
                            <span style={S.entityType}>{event.entity_type?.replace(/_/g, ' ')}</span>
                            {event.summary && <span style={S.summary}>— {event.summary}</span>}
                          </div>
                          <div style={S.eventMeta}>
                            <span style={S.actor}>👤 {event.actor || 'system'}</span>
                            <span style={S.metaDot}>·</span>
                            <span style={S.eventTime} title={fullTime(event.created_at)}>
                              🕐 {relativeTime(event.created_at)}
                            </span>
                            {event.entity_id && (
                              <>
                                <span style={S.metaDot}>·</span>
                                <span style={S.entityId}>
                                  ID: <code style={S.code}>{event.entity_id.slice(0, 8)}…</code>
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Expand button */}
                        {hasDetails && (
                          <button
                            type="button"
                            style={S.expandBtn}
                            onClick={() => setExpandedId(isExpanded ? null : event.event_id)}
                            title={isExpanded ? 'Hide details' : 'Show details'}
                          >
                            {isExpanded ? '▲' : '▼'}
                          </button>
                        )}
                      </div>

                      {/* Expanded details */}
                      {isExpanded && hasDetails && (
                        <div style={S.detailsBox}>
                          <div style={S.detailsLabel}>Details</div>
                          <pre style={S.detailsPre}>
                            {JSON.stringify(event.details_json, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Footer */}
          <div style={S.footer}>
            Showing {filtered.length} of {events.length} events
            {filtered.length < events.length && ` (${events.length - filtered.length} hidden by filters)`}
          </div>
        </div>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page:     { padding: '20px 24px', maxWidth: 1100, margin: '0 auto', fontFamily: "var(--font-family-sans)" },

  hero:     { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, background: 'linear-gradient(135deg, var(--color-bg-canvas) 0%, var(--color-bg-muted) 100%)', borderRadius: 18, padding: '18px 22px', border: '1px solid var(--color-border-soft)' },
  heroIcon: { width: 48, height: 48, background: 'var(--color-primary-700)', color: 'var(--color-text-strong)', fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, flexShrink: 0 },
  title:    { margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--color-text-strong)' },
  subtitle: { margin: '4px 0 0', fontSize: 13.5, color: 'var(--color-text-muted)' },
  refreshBtn: { marginLeft: 'auto', padding: '8px 16px', border: '1px solid var(--color-border-soft)', background: 'var(--color-bg-surface)', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--color-text-base)', fontFamily: 'inherit', flexShrink: 0 },

  statsBar:    { display: 'flex', alignItems: 'center', gap: 16, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)', borderRadius: 10, padding: '10px 18px', marginBottom: 12, fontSize: 13, color: 'var(--color-text-muted)', flexWrap: 'wrap' },
  statItem:    { display: 'flex', gap: 4, alignItems: 'center' },
  statDivider: { width: 1, height: 16, background: 'var(--color-border-soft)' },

  filterBar:   { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 },
  searchWrap:  { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)', borderRadius: 9, padding: '0 12px', flex: 1, minWidth: 200 },
  searchIcon:  { fontSize: 14, color: 'var(--color-text-soft)', flexShrink: 0 },
  searchInput: { border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--color-text-strong)', padding: '9px 0', flex: 1, fontFamily: 'inherit' },
  clearBtn:    { border: 'none', background: 'transparent', fontSize: 18, color: 'var(--color-text-soft)', cursor: 'pointer', padding: '0 2px' },
  select:      { padding: '8px 12px', border: '1px solid var(--color-border-soft)', borderRadius: 9, fontSize: 13, outline: 'none', cursor: 'pointer', fontFamily: 'inherit', background: 'var(--color-bg-surface)', color: 'var(--color-text-strong)' },
  clearAllBtn: { padding: '8px 14px', border: '1px solid var(--color-error-border)', background: 'var(--color-error-bg)', borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--color-error-text)', fontFamily: 'inherit', whiteSpace: 'nowrap' },

  errorBanner: { background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)', color: 'var(--color-error-text)', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14 },
  loadingWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', textAlign: 'center' },
  empty:       { background: 'var(--color-bg-surface)', border: '1px dashed var(--color-border-soft)', borderRadius: 14, padding: '56px 32px', textAlign: 'center' },
  emptyTitle:  { fontSize: 16, fontWeight: 600, color: 'var(--color-text-strong)', marginBottom: 8 },
  emptyHint:   { fontSize: 13.5, color: 'var(--color-text-muted)', maxWidth: 440, marginInline: 'auto', lineHeight: 1.55 },

  timeline:    { display: 'flex', flexDirection: 'column', gap: 20 },
  dayGroup:    { display: 'flex', flexDirection: 'column', gap: 6 },
  dayLabel:    { fontSize: 11.5, fontWeight: 700, color: 'var(--color-text-soft)', textTransform: 'uppercase', letterSpacing: '0.07em', paddingBottom: 6, borderBottom: '1px solid var(--color-bg-muted)' },
  dayEvents:   { display: 'flex', flexDirection: 'column', gap: 4 },

  eventCard:         { background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)', borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.15s' },
  eventCardExpanded: { borderColor: 'var(--color-primary-700)' },
  eventMain:    { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 14px' },
  entityIcon:   { fontSize: 18, flexShrink: 0, marginTop: 1 },
  eventContent: { flex: 1, minWidth: 0 },
  eventTop:     { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 },
  actionBadge:  { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999 },
  entityType:   { fontSize: 12.5, fontWeight: 500, color: 'var(--color-text-base)' },
  summary:      { fontSize: 12.5, color: 'var(--color-text-muted)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  eventMeta:    { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  actor:        { fontSize: 12, color: 'var(--color-text-muted)' },
  metaDot:      { fontSize: 12, color: 'var(--color-border-base)' },
  eventTime:    { fontSize: 12, color: 'var(--color-text-soft)', cursor: 'help' },
  entityId:     { fontSize: 12, color: 'var(--color-text-soft)' },
  code:         { fontFamily: 'var(--font-family-mono)', fontSize: 11, background: 'var(--color-bg-muted)', padding: '1px 4px', borderRadius: 4 },
  expandBtn:    { border: '1px solid var(--color-border-soft)', background: 'var(--color-bg-elevated)', borderRadius: 6, fontSize: 10, cursor: 'pointer', color: 'var(--color-text-soft)', padding: '3px 8px', flexShrink: 0, marginTop: 1 },
  detailsBox:   { borderTop: '1px solid var(--color-bg-muted)', padding: '10px 14px', background: 'var(--color-bg-canvas)' },
  detailsLabel: { fontSize: 10.5, fontWeight: 700, color: 'var(--color-text-soft)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 },
  detailsPre:   { margin: 0, fontSize: 12, fontFamily: 'var(--font-family-mono)', color: 'var(--color-text-base)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 },

  footer:       { textAlign: 'center', fontSize: 12, color: 'var(--color-text-soft)', padding: '12px 0' },
};