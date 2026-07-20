// src/pages/AuditLogPage.tsx
import { Fragment, useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../api/client';
import '../styles/audit-log-page.css';

interface AuditEvent {
  event_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor: string;
  summary?: string;
  details_json?: Record<string, unknown>;
  created_at: string;
}

const ACTION_CONFIG: Record<string, { bg: string; color: string; label: string; dot: string; icon: string }> = {
  create:           { bg: '#dcfce7', color: '#166534', label: 'Created',     dot: '#22c55e', icon: '✦' },
  create_duplicate: { bg: '#fef9c3', color: '#854d0e', label: 'Duplicate',   dot: '#eab308', icon: '⊕' },
  update:           { bg: '#dbeafe', color: '#1d4ed8', label: 'Updated',     dot: '#3b82f6', icon: '✎' },
  render:           { bg: 'var(--color-primary-50)', color: 'var(--color-primary-800)', label: 'Rendered',    dot: 'var(--color-primary-700)', icon: '⚡' },
  generate:         { bg: 'var(--color-primary-50)', color: 'var(--color-primary-800)', label: 'Generated',   dot: 'var(--color-primary-700)', icon: '⚡' },
  publish:          { bg: '#dcfce7', color: '#166534', label: 'Published',   dot: '#22c55e', icon: '↑' },
  success:          { bg: '#dcfce7', color: '#166534', label: 'Success',     dot: '#22c55e', icon: '✓' },
  error:            { bg: '#fee2e2', color: '#991b1b', label: 'Error',       dot: '#ef4444', icon: '✕' },
  delete:           { bg: '#fee2e2', color: '#991b1b', label: 'Deleted',     dot: '#ef4444', icon: '🗑' },
  import:           { bg: '#e0f2fe', color: '#0369a1', label: 'Imported',    dot: '#0ea5e9', icon: '↓' },
  rate:             { bg: '#fef9c3', color: '#854d0e', label: 'Rated',       dot: '#eab308', icon: '★' },
  use_prebuilt:     { bg: '#fff7ed', color: '#c2410c', label: 'Prebuilt Used', dot: '#f97316', icon: '⚡' },
};

const ENTITY_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  template:              { icon: '📄', label: 'Template',    color: 'var(--color-primary-800)' },
  render_jobs:           { icon: '⚡', label: 'Document',    color: 'var(--color-primary-800)' },
  placeholders_registry: { icon: '◈',  label: 'Placeholder', color: '#0891b2' },
  marketplace:           { icon: '🛒', label: 'Marketplace', color: '#059669' },
  blocks_library:        { icon: '⊞',  label: 'Block',       color: '#d97706' },
  datasource:            { icon: '🗄',  label: 'Datasource',  color: '#dc2626' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function AuditLogPage() {
  const [events, setEvents]             = useState<AuditEvent[]>([]);
  const [isLoading, setIsLoading]       = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [search, setSearch]             = useState('');
  const [typeFilter, setTypeFilter]     = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [expandedId, setExpandedId]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true); setError(null);
    try {
const data = await apiRequest<AuditEvent[]>({ method: 'GET', url: '/audit/events', params: { limit: 500 } });      setEvents(data);
    } catch {
      setError('Could not load audit events.');
      setEvents([]);
    } finally { setIsLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = events.filter((e) => {
    const matchSearch = !search ||
      (e.summary ?? '').toLowerCase().includes(search.toLowerCase()) ||
      e.action.toLowerCase().includes(search.toLowerCase()) ||
      e.entity_type.toLowerCase().includes(search.toLowerCase()) ||
      e.actor.toLowerCase().includes(search.toLowerCase());
    const matchType   = !typeFilter   || e.entity_type === typeFilter;
    const matchAction = !actionFilter || e.action === actionFilter;
    return matchSearch && matchType && matchAction;
  });

  const entityTypes = [...new Set(events.map((e) => e.entity_type))];
  const actionTypes = [...new Set(events.map((e) => e.action))];
  const todayEvents = events.filter((e) => {
    const d = new Date(e.created_at); const now = new Date();
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth();
  }).length;
  const errorEvents  = events.filter((e) => e.action === 'error').length;
  const uniqueActors = new Set(events.map((e) => e.actor)).size;

  return (
    <div className="alp-page">

      {/* Hero Header */}
      <div className="alp-hero-header">
        <div className="alp-hero-left">
          <div className="alp-hero-icon">📋</div>
          <div>
            <h1 className="alp-title">Audit Log</h1>
            <p className="alp-subtitle">Complete activity trail across templates, placeholders and documents</p>
          </div>
        </div>
        <button className="alp-refresh-btn" onClick={load}>
          ↻ Refresh
        </button>
      </div>

      {/* Stats */}
      {!isLoading && !error && events.length > 0 && (
        <div className="alp-stats-row">
          {[
            { label: 'Total Events',  value: events.length, color: 'var(--color-primary-800)', border: 'var(--color-primary-700)', icon: '📊' },
            { label: 'Today',         value: todayEvents,   color: '#0891b2', border: '#0ea5e9', icon: '📅' },
            { label: 'Errors',        value: errorEvents,   color: '#dc2626', border: '#ef4444', icon: '⚠' },
            { label: 'Active Users',  value: uniqueActors,  color: '#059669', border: '#22c55e', icon: '👤' },
          ].map((s) => (
            <div
              key={s.label}
              className="alp-stat-card"
              style={{ borderTop: `3px solid ${s.border}` }}
            >
              <div className="alp-stat-header">
                <div className="alp-stat-num" style={{ color: s.color }}>{s.value}</div>
                <span className="alp-stat-icon">{s.icon}</span>
              </div>
              <div className="alp-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="alp-filters-row">
        <input
          type="text"
          placeholder="🔍  Search events..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="alp-search-input"
        />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="alp-select">
          <option value="">All entities</option>
          {entityTypes.map((t) => <option key={t} value={t}>{ENTITY_CONFIG[t]?.label ?? t}</option>)}
        </select>
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="alp-select">
          <option value="">All actions</option>
          {actionTypes.map((a) => <option key={a} value={a}>{ACTION_CONFIG[a]?.label ?? a}</option>)}
        </select>
        <span className="alp-count-badge">{filtered.length} event{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="alp-center-box">
          <div className="alp-spinner" />
          <span className="alp-loading-text">Loading audit events...</span>
        </div>
      )}

      {/* Error */}
      {!isLoading && error && (
        <div className="alp-error-banner">
          <span className="alp-error-icon">⚠</span>
          <div>
            <div className="alp-error-title">Could not load audit events</div>
            <div className="alp-error-desc">{error}</div>
          </div>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && events.length === 0 && (
        <div className="alp-empty-state">
          <div className="alp-empty-icon">📋</div>
          <p className="alp-empty-title">No audit events yet</p>
          <p className="alp-empty-desc">
            Events are recorded when you create templates, generate documents, and publish.
          </p>
        </div>
      )}

      {/* Table */}
      {!isLoading && !error && filtered.length > 0 && (
        <div className="alp-table-wrapper">
          <table className="alp-table">
            <thead>
              <tr>
                {['', 'Time', 'Entity', 'Action', 'Summary', 'Actor', ''].map((col, i) => (
                  <th key={i} className="alp-th">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const ac = ACTION_CONFIG[e.action] ?? { bg: '#f1f5f9', color: '#475569', label: e.action, dot: '#94a3b8', icon: '○' };
                const ec = ENTITY_CONFIG[e.entity_type] ?? { icon: '○', label: e.entity_type, color: '#64748b' };
                const isExpanded = expandedId === e.event_id;
                const hasDetails = e.details_json && Object.keys(e.details_json).length > 0;

                return (
                  <Fragment key={e.event_id}>
                    <tr
                      className={[
                        'alp-tr',
                        isExpanded ? 'alp-tr--expanded' : '',
                        hasDetails ? 'alp-tr--clickable' : '',
                      ].join(' ')}
                      onClick={() => hasDetails && setExpandedId(isExpanded ? null : e.event_id)}
                    >
                      {/* Dot */}
                      <td className="alp-td" style={{ width: 20, paddingRight: 0 }}>
                        <div
                          className="alp-dot"
                          style={{ backgroundColor: ac.dot, boxShadow: `0 0 6px ${ac.dot}60` }}
                        />
                      </td>

                      {/* Time */}
                      <td className="alp-td">
                        <div className="alp-time-primary">{timeAgo(e.created_at)}</div>
                        <div className="alp-time-secondary">{formatDate(e.created_at)}</div>
                      </td>

                      {/* Entity */}
                      <td className="alp-td">
                        <div className="alp-entity-cell">
                          <span
                            className="alp-entity-icon"
                            style={{ backgroundColor: `${ec.color}18`, color: ec.color }}
                          >
                            {ec.icon}
                          </span>
                          <div>
                            <div className="alp-entity-name">{ec.label}</div>
                            <div className="alp-entity-id">{e.entity_id.slice(0, 8)}...</div>
                          </div>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="alp-td">
                        <span
                          className="alp-action-badge"
                          style={{ backgroundColor: ac.bg, color: ac.color }}
                        >
                          {ac.icon} {ac.label}
                        </span>
                      </td>

                      {/* Summary */}
                      <td className="alp-td">
                        <span className="alp-summary">{e.summary ?? '—'}</span>
                      </td>

                      {/* Actor */}
                      <td className="alp-td">
                        <span className="alp-actor-badge">{e.actor}</span>
                      </td>

                      {/* Expand */}
                      <td className="alp-td alp-expand-toggle">
                        {hasDetails && (isExpanded ? '▲' : '▼')}
                      </td>
                    </tr>

                    {/* Expanded details */}
                    {isExpanded && hasDetails && (
                      <tr className="alp-details-row">
                        <td colSpan={7} className="alp-details-cell">
                          <div className="alp-details-box">
                            <div className="alp-details-label">Event Details</div>
                            <pre className="alp-details-pre">
                              {JSON.stringify(e.details_json, null, 2)}
                            </pre>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
