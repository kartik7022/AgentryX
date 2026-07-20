// src/components/prompts/PromptVersionsPanel.tsx
//
// Versions Panel — lists all versions of the prompt with publish/rollback actions.
// Uses PB-009 backend endpoints (already built and tested).

import { useState, useEffect, useCallback } from 'react';
import {
  listPromptVersions,
//   createPromptVersion,
  publishPrompt,
  rollbackPrompt,
} from '../../api/prompts';
import type { PromptVersion } from '../../types/api';

interface Props {
  promptId: string;
  onPublish?: () => void;   // callback so parent can refresh its status pill
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  draft:      { bg: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' },
  testing:    { bg: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' },
  approved:   { bg: 'var(--color-info-bg)', color: 'var(--color-info-text)' },
  published:  { bg: 'var(--color-success-bg)', color: 'var(--color-success-text)' },
  deprecated: { bg: 'var(--color-bg-muted)', color: '#6b7280' },
};

function relativeTime(iso: string): string {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function PromptVersionsPanel({ promptId, onPublish }: Props) {
  const [versions,    setVersions]    = useState<PromptVersion[]>([]);
  const [isLoading,   setIsLoading]   = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
//   const [isCreating,  setIsCreating]  = useState(false);

  const fetchVersions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listPromptVersions(promptId);
      setVersions(data);
    } catch (err) {
      setError((err as Error).message || 'Failed to load versions');
    } finally {
      setIsLoading(false);
    }
  }, [promptId]);

  useEffect(() => { fetchVersions(); }, [fetchVersions]);

  // ─── Create new snapshot ──────────────────────────────────────────────
//   async function handleCreateSnapshot() {
//     setIsCreating(true);
//     setError(null);
//     try {
//       await createPromptVersion(promptId, {
//         change_summary: `Snapshot created on ${new Date().toLocaleString('en-IN')}`,
//       });
//       await fetchVersions();
//     } catch (err) {
//       setError((err as Error).message || 'Failed to create snapshot');
//     } finally {
//       setIsCreating(false);
//     }
//   }

  // ─── Publish a version ────────────────────────────────────────────────
  async function handlePublish(versionNumber: number) {
    if (!window.confirm(
      `Publish v${versionNumber}?\n\nThe currently published version will be deprecated.`
    )) return;
    setActioningId(String(versionNumber));
    setError(null);
    try {
      await publishPrompt(promptId, { version_number: versionNumber });
      await fetchVersions();
      onPublish?.();
    } catch (err) {
      setError((err as Error).message || 'Failed to publish');
    } finally {
      setActioningId(null);
    }
  }

  // ─── Rollback ─────────────────────────────────────────────────────────
  async function handleRollback(versionNumber: number) {
    if (!window.confirm(
      `Roll back to v${versionNumber}?\n\nThe current published version will be deprecated.`
    )) return;
    setActioningId(String(versionNumber));
    setError(null);
    try {
      await rollbackPrompt(promptId, {
        version_number: versionNumber,
        change_summary: `Rolled back to v${versionNumber}`,
      });
      await fetchVersions();
      onPublish?.();
    } catch (err) {
      setError((err as Error).message || 'Failed to roll back');
    } finally {
      setActioningId(null);
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div style={S.wrap}>
        <div style={S.empty}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>⟳</div>
          <div>Loading versions...</div>
        </div>
      </div>
    );
  }

  const publishedVersion = versions.find(v => v.status === 'published');

  return (
    <div style={S.wrap}>

      {/* Header */}
      <div style={S.header}>
        <div>
          <h3 style={S.heading}>Versions</h3>
          <p style={S.subheading}>
            Each version is an immutable snapshot of the prompt's blocks, inputs,
            and context bindings at a point in time.
          </p>
        </div>
      {/* New snapshot button hidden — versions created automatically on Publish */}
      </div>

      {/* Error */}
      {error && (
        <div style={S.errorBanner}>⚠️ {error}</div>
      )}

      {/* Published badge */}
      {publishedVersion && (
        <div style={S.publishedBanner}>
          <span style={{ fontSize: 14 }}>🚀</span>
          <div>
            <strong>v{publishedVersion.version_number}</strong> is the live production version
            {publishedVersion.approved_by && ` · approved by ${publishedVersion.approved_by}`}
            {publishedVersion.approved_at && ` · ${relativeTime(publishedVersion.approved_at)}`}
          </div>
        </div>
      )}

      {/* Empty state */}
      {versions.length === 0 && (
        <div style={S.empty}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🕒</div>
          <div style={S.emptyTitle}>No versions yet</div>
          <div style={S.emptyHint}>
            Click "New snapshot" to capture the current state as v1.
            You can then publish it to make it the live version.
          </div>
        </div>
      )}

      {/* Version list */}
      {versions.length > 0 && (
        <div style={S.list}>
          {versions.map((v) => {
            const pill = STATUS_STYLE[v.status] || STATUS_STYLE.deprecated;
            const isActioning = actioningId === String(v.version_number);

            return (
              <div key={v.version_id} style={S.card}>
                {/* Left: version number + status + meta */}
                <div style={S.cardLeft}>
                  <div style={S.versionBadge}>v{v.version_number}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={S.versionTopRow}>
                      <span style={{ ...S.statusPill, background: pill.bg, color: pill.color }}>
                        {v.status}
                      </span>
                      {v.change_summary && (
                        <span style={S.changeSummary}>{v.change_summary}</span>
                      )}
                    </div>
                    <div style={S.versionMeta}>
                      <span>by {v.created_by}</span>
                      <span style={{ color: 'var(--color-border-base)' }}>·</span>
                      <span>{relativeTime(v.created_at)}</span>
                      {v.approved_by && (
                        <>
                          <span style={{ color: 'var(--color-border-base)' }}>·</span>
                          <span>approved by {v.approved_by}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: action buttons */}
                <div style={S.cardActions}>
                  {v.status === 'draft' && (
                    <button
                      type="button"
                      style={{ ...S.actionBtn, ...S.publishActionBtn }}
                      onClick={() => handlePublish(v.version_number)}
                      disabled={isActioning}
                    >
                      {isActioning ? '⟳' : '🚀 Publish'}
                    </button>
                  )}
                  {v.status === 'deprecated' && (
                    <button
                      type="button"
                      style={{ ...S.actionBtn, ...S.rollbackActionBtn }}
                      onClick={() => handleRollback(v.version_number)}
                      disabled={isActioning}
                    >
                      {isActioning ? '⟳' : '↩ Roll back'}
                    </button>
                  )}
                  {v.status === 'published' && (
                    <span style={S.liveLabel}>🟢 Live</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer info */}
      {versions.length > 0 && (
        <div style={S.footer}>
          <span>{versions.length} version{versions.length === 1 ? '' : 's'} total</span>
          <span style={{ color: 'var(--color-border-base)' }}>·</span>
          <span>{versions.filter(v => v.status === 'deprecated').length} deprecated</span>
          {publishedVersion && (
            <>
              <span style={{ color: 'var(--color-border-base)' }}>·</span>
              <span>v{publishedVersion.version_number} is live</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const S: Record<string, React.CSSProperties> = {
  wrap:       { display: 'flex', flexDirection: 'column', gap: 14 },
  heading:    { margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--color-text-strong)' },
  subheading: { margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.55 },

  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 },

  addBtn: {
    background: 'var(--color-primary-700)',
    border: '1px solid var(--color-primary-700)', color: 'var(--color-text-strong)',
    fontWeight: 600, fontSize: 13,
    padding: '9px 16px', borderRadius: 9,
    cursor: 'pointer',
    boxShadow: 'var(--shadow-sm)',
    fontFamily: 'inherit', flexShrink: 0,
  },

  errorBanner: {
    background: 'var(--color-error-bg)', border: '1px solid var(--color-error-border)',
    color: 'var(--color-error-text)', borderRadius: 10, padding: '10px 14px', fontSize: 13,
  },

  publishedBanner: {
    display: 'flex', gap: 10, alignItems: 'center',
    background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)',
    color: 'var(--color-success-text)', borderRadius: 10, padding: '10px 14px', fontSize: 13,
  },

  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  card: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)',
    borderRadius: 12, padding: '14px 16px', gap: 12,
  },
  cardLeft:     { display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  cardActions:  { display: 'flex', gap: 8, flexShrink: 0 },

  versionBadge: {
    width: 44, height: 44, flexShrink: 0,
    background: 'var(--color-primary-50)',
    color: 'var(--color-primary-800)', fontSize: 13, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 10,
  },
  versionTopRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
  statusPill: {
    fontSize: 11, fontWeight: 600,
    padding: '2px 9px', borderRadius: 999,
  },
  changeSummary: {
    fontSize: 13, color: 'var(--color-text-strong)',
    fontWeight: 500,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    maxWidth: 380,
  },
  versionMeta: {
    display: 'flex', gap: 6, fontSize: 12, color: 'var(--color-text-muted)', flexWrap: 'wrap',
  },

  actionBtn: {
    fontSize: 12, fontWeight: 600,
    padding: '7px 12px', borderRadius: 8,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  publishActionBtn: {
    background: 'linear-gradient(135deg, var(--color-accent-500) 0%, var(--color-accent-700) 100%)',
    border: '1px solid var(--color-primary-700)', color: 'var(--color-text-strong)',
    boxShadow: '0 2px 8px rgba(16,185,129,0.3)',
  },
  rollbackActionBtn: {
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-soft)',
    color: 'var(--color-text-base)',
  },
  liveLabel: {
    fontSize: 12, fontWeight: 600,
    color: 'var(--color-success-text)',
    padding: '7px 12px',
  },

  empty: {
    background: 'var(--color-bg-surface)', border: '1px dashed var(--color-border-soft)',
    borderRadius: 12, padding: '40px 24px',
    textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 14,
  },
  emptyTitle: { fontSize: 15, fontWeight: 600, color: 'var(--color-text-strong)', marginBottom: 6 },
  emptyHint:  { fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 420, marginInline: 'auto', lineHeight: 1.55 },

  footer: {
    display: 'flex', gap: 10, alignItems: 'center',
    fontSize: 12.5, color: 'var(--color-text-muted)',
    padding: '10px 14px',
    background: 'var(--color-bg-elevated)', borderRadius: 10,
  },
};