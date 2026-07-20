// src/components/editor/PlaceholderPalette.tsx
// Added: Real drag-and-drop tokens from palette to canvas
// Fix:   onMouseDown + e.preventDefault() keeps caret alive before click steals focus

import { useState, useMemo } from 'react';
import type { Placeholder, LayoutBlock } from '../../types/api';

interface Props {
  placeholders: Placeholder[];
  selectedBlockId: string | null;
  onInsertToken: (tokenName: string) => void;
  onBeforeInsert: () => void;          // NEW: called on mousedown to save caret
  blocks: LayoutBlock[];
}

// Drag data key used to pass token name between drag source and drop target
export const DRAG_TOKEN_KEY = 'application/x-placeholder-token';

function extractUsedTokens(blocks: LayoutBlock[]): Set<string> {
  const tokens = new Set<string>();
  const pattern = /\{\{([^}]+)\}\}/g;

  function scanBlock(block: LayoutBlock) {
    if (block.content) {
      let m;
      while ((m = pattern.exec(block.content)) !== null) tokens.add(m[1].trim());
      pattern.lastIndex = 0;
    }
    if (block.type === 'table') {
      (block.columns ?? []).forEach(col => {
        let m;
        while ((m = pattern.exec(col.binding ?? '')) !== null) tokens.add(m[1].trim());
        pattern.lastIndex = 0;
      });
      (block.rows ?? []).forEach(row =>
        row.forEach(cell => {
          let m;
          while ((m = pattern.exec(cell ?? '')) !== null) tokens.add(m[1].trim());
          pattern.lastIndex = 0;
        })
      );
    }
    if (block.src) {
      let m;
      while ((m = pattern.exec(block.src)) !== null) tokens.add(m[1].trim());
      pattern.lastIndex = 0;
    }
    (block.children ?? []).forEach(scanBlock);
  }

  blocks.forEach(scanBlock);
  return tokens;
}

export default function PlaceholderPalette({
  placeholders,
  selectedBlockId,
  onInsertToken,
  onBeforeInsert,
  blocks,
}: Props) {
  const [search, setSearch]             = useState('');
  const [activeTab, setActiveTab]       = useState<'global' | 'template'>('global');
  const [draggingName, setDraggingName] = useState<string | null>(null);

  const usedTokens    = useMemo(() => extractUsedTokens(blocks), [blocks]);
  const tabFiltered   = activeTab === 'template'
    ? placeholders.filter(p => usedTokens.has(p.name))
    : placeholders;
  const filtered      = tabFiltered.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.category ?? '').toLowerCase().includes(search.toLowerCase())
  );
  const canInsert     = !!selectedBlockId;
  const templateCount = placeholders.filter(p => usedTokens.has(p.name)).length;

  function handleDragStart(e: React.DragEvent, tokenName: string) {
    e.dataTransfer.setData(DRAG_TOKEN_KEY, tokenName);
    e.dataTransfer.setData('text/plain', `{{${tokenName}}}`);
    e.dataTransfer.effectAllowed = 'copy';
    setDraggingName(tokenName);
  }

  function handleDragEnd() { setDraggingName(null); }

  return (
    <div style={styles.panel}>

      <div style={styles.header}>
        <span style={styles.title}>Placeholders</span>
        <span style={styles.count}>{filtered.length}</span>
      </div>

      <div style={styles.searchWrapper}>
        <input
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={styles.searchInput}
        />
      </div>

      <div style={styles.tabs}>
        <button
          style={{ ...styles.tab, ...(activeTab === 'global' ? styles.tabActive : {}) }}
          onClick={() => setActiveTab('global')}
        >
          Global
          <span style={{
            ...styles.tabBadge,
            backgroundColor: activeTab === 'global' ? 'var(--color-primary-100)' : '#e2e8f0',
            color: activeTab === 'global' ? 'var(--color-primary-800)' : '#94a3b8',
          }}>{placeholders.length}</span>
        </button>
        <button
          style={{ ...styles.tab, ...(activeTab === 'template' ? styles.tabActive : {}) }}
          onClick={() => setActiveTab('template')}
        >
          Template
          <span style={{
            ...styles.tabBadge,
            backgroundColor: activeTab === 'template' ? 'var(--color-primary-100)' : '#e2e8f0',
            color: activeTab === 'template' ? 'var(--color-primary-800)' : '#94a3b8',
          }}>{templateCount}</span>
        </button>
      </div>

      {activeTab === 'template' && usedTokens.size === 0 && (
        <div style={styles.templateHint}>
          No placeholders used in this template yet. Add <code style={styles.code}>{'{{token}}'}</code> to any text block to see them here.
        </div>
      )}

      <div style={styles.dragHintBox}>
        🖱 <strong>Drag</strong> onto a text block — or <strong>click</strong> after selecting a block
      </div>

      <div style={styles.chipList}>
        {filtered.length === 0 && (activeTab === 'global' || usedTokens.size > 0) && (
          <div style={styles.empty}>
            {search ? 'No matches' : 'No placeholders yet'}
          </div>
        )}

        {filtered.map(ph => {
          const isUsed        = usedTokens.has(ph.name);
          const isDragging    = draggingName === ph.name;
          const missingSample = !ph.sample_value || ph.sample_value.trim() === '';
          return (
            <div
              key={ph.registry_id}
              draggable
              onDragStart={e => handleDragStart(e, ph.name)}
              onDragEnd={handleDragEnd}
              onMouseDown={(e) => {
                // KEY FIX: prevent this click from stealing focus away from the
                // contentEditable text block — this keeps the caret position alive.
                // We call onBeforeInsert() here so EditorPage can snapshot the Range
                // before any focus change can happen.
                e.preventDefault();
                onBeforeInsert();
              }}
              onClick={() => canInsert && onInsertToken(ph.name)}
              style={{
                ...styles.chip,
                opacity:         isDragging ? 0.4 : 1,
                cursor:          'pointer',
                border:          `1px solid ${
                  missingSample ? '#fde68a'
                    : isUsed && activeTab === 'global' ? 'var(--color-primary-200)'
                    : '#e2e8f0'
                }`,
                backgroundColor: missingSample ? '#fffbeb'
                               : isUsed && activeTab === 'global' ? 'var(--color-primary-50)'
                               : '#f8fafc',
                transform:       isDragging ? 'scale(0.97)' : 'scale(1)',
              }}
              title={missingSample
                ? `⚠ No sample value set for {{${ph.name}}} — preview will show empty`
                : `Click to insert {{${ph.name}}} at cursor position`}
            >
              <div style={styles.chipTop}>
                <div style={styles.chipName}>{`{{${ph.name}}}`}</div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={styles.dragIcon} title="Drag to insert">⠿</span>
                  {missingSample && (
                    <span style={styles.missingSampleBadge} title="No sample value">⚠</span>
                  )}
                  {isUsed && activeTab === 'global' && !missingSample && (
                    <span style={styles.inUseBadge}>in use</span>
                  )}
                </div>
              </div>
              <div style={styles.chipMeta}>
                {ph.category && (
                  <span style={styles.categoryBadge}>{ph.category}</span>
                )}
                {missingSample ? (
                  <span style={styles.missingSampleText}>⚠ no sample value</span>
                ) : (
                  <span style={styles.sampleValue}>
                    {ph.cardinality === 'list'
                      ? (() => {
                          try {
                            const arr = JSON.parse(ph.sample_value ?? '');
                            if (Array.isArray(arr)) {
                              return arr.slice(0, 2).join(', ') + (arr.length > 2 ? '...' : '');
                            }
                          } catch {
                            const parts = (ph.sample_value ?? '').split(',');
                            return parts.slice(0, 2).map(s => s.trim()).join(', ')
                              + (parts.length > 2 ? '...' : '');
                          }
                          return ph.sample_value;
                        })()
                      : ph.cardinality === 'table'
                      ? (() => {
                          try {
                            const rows = JSON.parse(ph.sample_value ?? '');
                            return Array.isArray(rows)
                              ? `${rows.length} rows × ${Object.keys(rows[0] ?? {}).length} cols`
                              : ph.sample_value;
                          } catch {
                            return ph.sample_value;
                          }
                        })()
                      : ph.sample_value}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={styles.hint}>
        {activeTab === 'template'
          ? `${usedTokens.size} placeholder${usedTokens.size !== 1 ? 's' : ''} used in this template`
          : canInsert
            ? 'Click or drag a placeholder to insert it at cursor'
            : 'Drag to any text block on the canvas'}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel:               { width: '230px', flexShrink: 0, backgroundColor: '#ffffff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  header:              { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 14px 10px', borderBottom: '1px solid #f1f5f9' },
  title:               { fontSize: '13px', fontWeight: 600, color: '#475569', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
  count:               { fontSize: '12px', backgroundColor: '#f1f5f9', color: '#64748b', borderRadius: '10px', padding: '1px 8px', fontWeight: 500 },
  searchWrapper:       { padding: '10px 12px', borderBottom: '1px solid #f1f5f9' },
  searchInput:         { width: '100%', padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', outline: 'none', backgroundColor: '#f8fafc', boxSizing: 'border-box' as const },
  tabs:                { display: 'flex', padding: '8px 12px', gap: '4px', borderBottom: '1px solid #f1f5f9' },
  tab:                 { flex: 1, padding: '5px 4px', border: '1px solid #e2e8f0', borderRadius: '5px', fontSize: '12px', fontWeight: 500, color: '#64748b', backgroundColor: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' },
  tabActive:           { backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-800)', border: '1px solid var(--color-primary-200)' },
  tabBadge:            { fontSize: '10px', fontWeight: 600, padding: '0px 5px', borderRadius: '8px', lineHeight: '16px' },
  templateHint:        { margin: '8px 12px', padding: '10px 12px', backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', fontSize: '11px', color: '#166534', lineHeight: 1.6 },
  code:                { fontFamily: 'var(--font-family-mono)', backgroundColor: '#dcfce7', padding: '1px 4px', borderRadius: '3px', fontSize: '11px' },
  dragHintBox:         { margin: '6px 12px', padding: '6px 10px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '11px', color: '#1e40af', lineHeight: 1.5 },
  chipList:            { flex: 1, overflowY: 'auto' as const, padding: '8px 10px', display: 'flex', flexDirection: 'column' as const, gap: '6px' },
  empty:               { fontSize: '13px', color: '#cbd5e1', textAlign: 'center' as const, padding: '20px 0', fontStyle: 'italic' },
  chip:                { border: '1px solid #e2e8f0', borderRadius: '7px', padding: '8px 10px', transition: 'all 0.15s', userSelect: 'none' as const },
  chipTop:             { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' },
  chipName:            { fontSize: '13px', fontWeight: 500, color: 'var(--color-primary-800)', fontFamily: 'var(--font-family-mono)' },
  dragIcon:            { fontSize: '14px', color: 'var(--color-primary-200)', cursor: 'grab' },
  inUseBadge:          { fontSize: '10px', backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-800)', padding: '1px 6px', borderRadius: '8px', fontWeight: 600, flexShrink: 0 },
  chipMeta:            { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  categoryBadge:       { fontSize: '11px', backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-800)', padding: '1px 6px', borderRadius: '10px', fontWeight: 500 },
  sampleValue:         { fontSize: '11px', color: '#94a3b8', fontFamily: 'var(--font-family-mono)' },
  missingSampleBadge:  { fontSize: '12px', color: '#d97706', fontWeight: 700 },
  missingSampleText:   { fontSize: '11px', color: '#d97706', fontStyle: 'italic', fontWeight: 500 },
  hint:                { padding: '10px 12px', fontSize: '11px', color: '#94a3b8', textAlign: 'center' as const, borderTop: '1px solid #f1f5f9', lineHeight: 1.5 },
};
