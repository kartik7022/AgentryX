// src/components/editor/VersionHistoryPanel.tsx
// Fixed: backend endpoint now works with UUID cast.
// Added: Restore version button — loads that version's layout into the editor.
// Added: Diff view — compare any two versions side by side.

import { useState, useEffect } from 'react';
import { listTemplateVersions } from '../../api/templates';
import type { TemplateVersion, LayoutBlock } from '../../types/api';

interface Props {
  templateId: string;
  onClose: () => void;
  onRestore?: (blocks: LayoutBlock[]) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Extract blocks from version layout_json ──────────────────────
function getBlocks(v: TemplateVersion): LayoutBlock[] {
  try {
    const layout = typeof v.layout_json === 'string'
      ? JSON.parse(v.layout_json)
      : v.layout_json;
    return layout?.blocks ?? [];
  } catch {
    return [];
  }
}

// ── Extract all {{token}} names from blocks ───────────────────────
function extractTokens(blocks: LayoutBlock[]): Set<string> {
  const tokens = new Set<string>();
  const pattern = /\{\{([^}]+)\}\}/g;
  function scan(block: LayoutBlock) {
    [block.content ?? '', block.src ?? ''].forEach(text => {
      let m;
      while ((m = pattern.exec(text)) !== null) tokens.add(m[1].trim());
      pattern.lastIndex = 0;
    });
    (block.columns ?? []).forEach(col => {
      let m;
      while ((m = pattern.exec(col.binding ?? '')) !== null) tokens.add(m[1].trim());
      pattern.lastIndex = 0;
    });
    (block.children ?? []).forEach(scan);
  }
  blocks.forEach(scan);
  return tokens;
}

// ── Diff engine ───────────────────────────────────────────────────
interface DiffResult {
  added:   LayoutBlock[];
  removed: LayoutBlock[];
  changed: { before: LayoutBlock; after: LayoutBlock }[];
  tokensAdded:   string[];
  tokensRemoved: string[];
}

function computeDiff(vOld: TemplateVersion, vNew: TemplateVersion): DiffResult {
  const oldBlocks = getBlocks(vOld);
  const newBlocks = getBlocks(vNew);

  // Map by block_id
  const oldMap = new Map(oldBlocks.map(b => [b.block_id, b]));
  const newMap = new Map(newBlocks.map(b => [b.block_id, b]));

  const added:   LayoutBlock[] = [];
  const removed: LayoutBlock[] = [];
  const changed: { before: LayoutBlock; after: LayoutBlock }[] = [];

  // Find added and changed
  for (const [id, nb] of newMap) {
    if (!oldMap.has(id)) {
      added.push(nb);
    } else {
      const ob = oldMap.get(id)!;
      // Check if content changed
      const obStr = JSON.stringify({ content: ob.content, columns: ob.columns, src: ob.src });
      const nbStr = JSON.stringify({ content: nb.content, columns: nb.columns, src: nb.src });
      if (obStr !== nbStr) {
        changed.push({ before: ob, after: nb });
      }
    }
  }

  // Find removed
  for (const [id, ob] of oldMap) {
    if (!newMap.has(id)) removed.push(ob);
  }

  // Token diff
  const oldTokens = extractTokens(oldBlocks);
  const newTokens = extractTokens(newBlocks);
  const tokensAdded   = [...newTokens].filter(t => !oldTokens.has(t));
  const tokensRemoved = [...oldTokens].filter(t => !newTokens.has(t));

  return { added, removed, changed, tokensAdded, tokensRemoved };
}

// ── Block label helper ────────────────────────────────────────────
function blockLabel(b: LayoutBlock): string {
  const type = b.type.toUpperCase();
  const content = b.content
    ? b.content.slice(0, 40) + (b.content.length > 40 ? '...' : '')
    : b.src
    ? `[Image: ${b.src.slice(0, 30)}]`
    : `[${b.columns?.length ?? 0} columns]`;
  return `[${type}] ${content}`;
}

// ─────────────────────────────────────────────────────────────────

export default function VersionHistoryPanel({ templateId, onClose, onRestore }: Props) {
  const [versions, setVersions]   = useState<TemplateVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [restored, setRestored]   = useState<string | null>(null);

  // Diff state
  const [diffMode, setDiffMode]       = useState(false);
  const [diffBase, setDiffBase]       = useState<string | null>(null);   // version_id
  const [diffTarget, setDiffTarget]   = useState<string | null>(null);   // version_id
  const [diffResult, setDiffResult]   = useState<DiffResult | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    listTemplateVersions(templateId)
      .then(setVersions)
      .catch(err => setError((err as Error).message || 'Failed to load versions'))
      .finally(() => setIsLoading(false));
  }, [templateId]);

  function handleRestore(version: TemplateVersion) {
    if (!onRestore) return;
    if (!window.confirm(
      `Restore v${version.version_number}?\n\nThis will replace the current canvas with this version's content. Your current unsaved changes will be lost.`
    )) return;
    setRestoring(version.version_id);
    try {
      const blocks = getBlocks(version);
      onRestore(blocks);
      setRestored(version.version_id);
      setTimeout(() => onClose(), 800);
    } catch {
      alert('Failed to restore version. Layout data may be corrupted.');
    } finally {
      setRestoring(null);
    }
  }

  function handleCompare(versionId: string) {
    if (!diffMode) {
      // Enter diff mode — select base version
      setDiffMode(true);
      setDiffBase(versionId);
      setDiffTarget(null);
      setDiffResult(null);
    } else if (!diffBase) {
      setDiffBase(versionId);
    } else if (versionId === diffBase) {
      // Deselect
      setDiffBase(null);
      setDiffMode(false);
    } else {
      // Second version selected — compute diff
      setDiffTarget(versionId);
      const vOld = versions.find(v => v.version_id === diffBase)!;
      const vNew = versions.find(v => v.version_id === versionId)!;
      // Always compare older → newer
      const [older, newer] = vOld.version_number < vNew.version_number
        ? [vOld, vNew] : [vNew, vOld];
      setDiffResult(computeDiff(older, newer));
    }
  }

  function exitDiff() {
    setDiffMode(false);
    setDiffBase(null);
    setDiffTarget(null);
    setDiffResult(null);
  }

  const totalBlocks = (v: TemplateVersion) => getBlocks(v).length;

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.panel, width: diffResult ? '780px' : '580px' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={S.header}>
          <div>
            <h2 style={S.title}>📋 Version History</h2>
            <p style={S.subtitle}>
              {diffMode && !diffResult
                ? '👆 Now select a second version to compare'
                : diffResult
                ? '↔ Diff view — showing changes between versions'
                : 'All published versions of this template'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {versions.length > 0 && (
              <span style={S.countBadge}>{versions.length} version{versions.length !== 1 ? 's' : ''}</span>
            )}
            {diffMode && (
              <button style={S.exitDiffBtn} onClick={exitDiff}>✕ Exit Compare</button>
            )}
            {!diffMode && versions.length >= 2 && (
              <button style={S.compareModeBtn} onClick={() => setDiffMode(true)}>
                ↔ Compare Versions
              </button>
            )}
            <button style={S.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Diff mode hint */}
        {diffMode && !diffResult && (
          <div style={S.diffHint}>
            ✅ v{versions.find(v => v.version_id === diffBase)?.version_number} selected as base.
            Now click <strong>↔ Compare</strong> on another version to see the diff.
          </div>
        )}

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Version list */}
          <div style={{ ...S.body, flex: diffResult ? '0 0 280px' : '1', borderRight: diffResult ? '1px solid #e2e8f0' : 'none' }}>

            {isLoading && <div style={S.centered}>Loading versions...</div>}
            {error && !isLoading && <div style={S.errorBox}>Failed to load versions: {error}</div>}

            {!isLoading && !error && versions.length === 0 && (
              <div style={S.empty}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#475569', marginBottom: 8 }}>No versions published yet</p>
                <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, maxWidth: 320, margin: '0 auto' }}>
                  Versions are saved when you click <strong>Publish ↑</strong>.
                </p>
              </div>
            )}

            {!isLoading && versions.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {versions.map((v, i) => {
                  const isBase   = diffBase === v.version_id;
                  const isTarget = diffTarget === v.version_id;
                  return (
                    <div key={v.version_id} style={{
                      ...S.card,
                      borderColor: restored === v.version_id ? '#86efac'
                        : isBase   ? 'var(--color-primary-800)'
                        : isTarget ? '#f59e0b'
                        : '#e2e8f0',
                      backgroundColor: restored === v.version_id ? '#f0fdf4'
                        : isBase   ? 'var(--color-primary-50)'
                        : isTarget ? '#fffbeb'
                        : '#fff',
                    }}>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={S.vBadge}>v{v.version_number}</span>
                          {i === 0 && <span style={S.latestBadge}>Latest</span>}
                          {isBase   && <span style={{ ...S.latestBadge, backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-800)' }}>Base</span>}
                          {isTarget && <span style={{ ...S.latestBadge, backgroundColor: '#fef3c7', color: '#92400e' }}>Target</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {/* Compare button */}
                          {versions.length >= 2 && (
                            <button
                              style={{
                                ...S.compareBtn,
                                backgroundColor: isBase ? 'var(--color-primary-800)' : '#f8fafc',
                                color: isBase ? '#fff' : 'var(--color-primary-800)',
                              }}
                              onClick={() => handleCompare(v.version_id)}
                            >
                              {isBase ? '✓ Base' : '↔'}
                            </button>
                          )}
                          {onRestore && (
                            <button
                              style={{ ...S.restoreBtn, opacity: restoring === v.version_id ? 0.6 : 1 }}
                              onClick={() => handleRestore(v)}
                              disabled={!!restoring}
                            >
                              {restored === v.version_id ? '✓' : restoring === v.version_id ? '⟳' : '↩'}
                            </button>
                          )}
                          <button
                            style={S.expandBtn}
                            onClick={() => setExpanded(expanded === v.version_id ? null : v.version_id)}
                          >
                            {expanded === v.version_id ? '▲' : '▼'}
                          </button>
                        </div>
                      </div>

                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                        {formatDate(v.created_at)} · {timeAgo(v.created_at)}
                      </div>

                      {v.change_summary && (
                        <div style={S.summary}>"{v.change_summary}"</div>
                      )}

                      {expanded === v.version_id && (
                        <div style={S.details}>
                          <div style={S.detailRow}>
                            <span style={S.dKey}>Version ID</span>
                            <span style={S.dVal}>{v.version_id.slice(0, 8)}...</span>
                          </div>
                          <div style={S.detailRow}>
                            <span style={S.dKey}>Blocks</span>
                            <span style={S.dVal}>{totalBlocks(v)} block(s)</span>
                          </div>
                          <div style={S.detailRow}>
                            <span style={S.dKey}>Format</span>
                            <span style={S.dVal}>{v.output_target.toUpperCase()}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={S.infoNote}>
              ℹ Each published version is an immutable snapshot.
              {onRestore ? ' Click ↩ to restore.' : ''}
            </div>
          </div>

          {/* Diff panel */}
          {diffResult && (
            <div style={S.diffPanel}>
              <div style={S.diffHeader}>
                ↔ v{versions.find(v => v.version_id === diffBase)?.version_number} →
                v{versions.find(v => v.version_id === diffTarget)?.version_number} Changes
              </div>

              {/* Summary */}
              <div style={S.diffSummary}>
                <span style={S.diffStat}>
                  <span style={{ color: '#16a34a' }}>+{diffResult.added.length}</span> added
                </span>
                <span style={S.diffStat}>
                  <span style={{ color: '#dc2626' }}>-{diffResult.removed.length}</span> removed
                </span>
                <span style={S.diffStat}>
                  <span style={{ color: '#d97706' }}>~{diffResult.changed.length}</span> changed
                </span>
              </div>

              <div style={S.diffBody}>

                {/* No changes */}
                {diffResult.added.length === 0 &&
                 diffResult.removed.length === 0 &&
                 diffResult.changed.length === 0 &&
                 diffResult.tokensAdded.length === 0 &&
                 diffResult.tokensRemoved.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8', fontSize: 13 }}>
                    ✓ No changes between these versions
                  </div>
                )}

                {/* Added blocks */}
                {diffResult.added.length > 0 && (
                  <div style={S.diffSection}>
                    <div style={S.diffSectionTitle}>BLOCKS ADDED</div>
                    {diffResult.added.map(b => (
                      <div key={b.block_id} style={S.diffAdded}>
                        + {blockLabel(b)}
                      </div>
                    ))}
                  </div>
                )}

                {/* Removed blocks */}
                {diffResult.removed.length > 0 && (
                  <div style={S.diffSection}>
                    <div style={S.diffSectionTitle}>BLOCKS REMOVED</div>
                    {diffResult.removed.map(b => (
                      <div key={b.block_id} style={S.diffRemoved}>
                        - {blockLabel(b)}
                      </div>
                    ))}
                  </div>
                )}

                {/* Changed blocks */}
                {diffResult.changed.length > 0 && (
                  <div style={S.diffSection}>
                    <div style={S.diffSectionTitle}>BLOCKS CHANGED</div>
                    {diffResult.changed.map(({ before, after }) => (
                      <div key={before.block_id} style={S.diffChanged}>
                        <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 11, color: '#92400e' }}>
                          ~ [{before.type.toUpperCase()}]
                        </div>
                        <div style={S.diffBefore}>
                          Before: {before.content?.slice(0, 60) ?? '[no content]'}
                        </div>
                        <div style={S.diffAfter}>
                          After:  {after.content?.slice(0, 60) ?? '[no content]'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Token changes */}
                {(diffResult.tokensAdded.length > 0 || diffResult.tokensRemoved.length > 0) && (
                  <div style={S.diffSection}>
                    <div style={S.diffSectionTitle}>TOKEN CHANGES</div>
                    {diffResult.tokensAdded.map(t => (
                      <div key={t} style={S.diffAdded}>+ {`{{${t}}}`} added</div>
                    ))}
                    {diffResult.tokensRemoved.map(t => (
                      <div key={t} style={S.diffRemoved}>- {`{{${t}}}`} removed</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  overlay:         { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  panel:           { backgroundColor: '#fff', borderRadius: '12px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', transition: 'width 0.2s' },
  header:          { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9' },
  title:           { fontSize: '17px', fontWeight: 700, color: '#0f172a' },
  subtitle:        { fontSize: '13px', color: '#94a3b8', marginTop: 4 },
  countBadge:      { fontSize: '12px', backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-800)', padding: '2px 10px', borderRadius: '10px', fontWeight: 600 },
  closeBtn:        { background: 'none', border: 'none', fontSize: '16px', color: '#94a3b8', cursor: 'pointer' },
  compareModeBtn:  { backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-800)', border: '1px solid var(--color-primary-200)', borderRadius: '6px', padding: '4px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' },
  exitDiffBtn:     { backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', padding: '4px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' },
  diffHint:        { padding: '10px 24px', backgroundColor: '#eff6ff', borderBottom: '1px solid #bfdbfe', fontSize: '13px', color: '#1e40af' },
  body:            { overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 },
  centered:        { textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '14px' },
  errorBox:        { backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px', fontSize: '13px', color: '#b91c1c' },
  empty:           { textAlign: 'center', padding: '48px 20px' },
  card:            { border: '1px solid', borderRadius: '8px', padding: '12px 14px', transition: 'all 0.2s' },
  vBadge:          { backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-800)', fontSize: '12px', fontWeight: 700, padding: '2px 10px', borderRadius: '10px' },
  latestBadge:     { backgroundColor: '#dcfce7', color: '#166534', fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px' },
  fmtBadge:        { backgroundColor: '#f1f5f9', color: '#475569', fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '6px' },
  restoreBtn:      { backgroundColor: 'var(--color-primary-800)', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' },
  compareBtn:      { border: '1px solid var(--color-primary-200)', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' },
  expandBtn:       { background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '3px 8px', fontSize: '12px', color: 'var(--color-primary-800)', cursor: 'pointer' },
  summary:         { fontSize: '12px', color: '#64748b', fontStyle: 'italic', marginTop: 6, paddingTop: 6, borderTop: '1px solid #f1f5f9' },
  details:         { marginTop: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 4 },
  detailRow:       { display: 'flex', justifyContent: 'space-between', fontSize: '12px' },
  dKey:            { color: '#94a3b8', fontWeight: 500 },
  dVal:            { color: '#0f172a', fontFamily: 'var(--font-family-mono)', fontSize: '11px' },
  infoNote:        { fontSize: '11px', color: '#94a3b8', padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: '8px', lineHeight: 1.5, marginTop: 4 },
  // Diff panel styles
  diffPanel:       { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  diffHeader:      { padding: '14px 16px', fontWeight: 700, fontSize: '14px', color: '#0f172a', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' },
  diffSummary:     { display: 'flex', gap: 16, padding: '10px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '13px', color: '#64748b' },
  diffStat:        { display: 'flex', gap: 4, alignItems: 'center', fontWeight: 600 },
  diffBody:        { flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 },
  diffSection:     { display: 'flex', flexDirection: 'column', gap: 6 },
  diffSectionTitle:{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', marginBottom: 4 },
  diffAdded:       { backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', color: '#166534', fontFamily: 'var(--font-family-mono)' },
  diffRemoved:     { backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', color: '#991b1b', fontFamily: 'var(--font-family-mono)' },
  diffChanged:     { backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '8px 10px', fontSize: '12px' },
  diffBefore:      { color: '#991b1b', fontFamily: 'var(--font-family-mono)', fontSize: '11px', marginBottom: 4 },
  diffAfter:       { color: '#166534', fontFamily: 'var(--font-family-mono)', fontSize: '11px' },
};
