// src/components/editor/blocks/BlockWrapper.tsx
// Added: ☆ Save to Library button when block is selected
// Fixed: Table block selection — uses onMouseDown to bypass inner stopPropagation

import type { BlockType } from '../../../types/api';

interface Props {
  blockId: string;
  type: BlockType;
  isSelected: boolean;
  isFirst: boolean;
  isLast: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSaveToLibrary?: () => void;
  children: React.ReactNode;
}

const BLOCK_LABELS: Record<BlockType, string> = {
  text: '¶ TEXT', table: '⊞ TABLE', image: '⊡ IMAGE', section: '⊟ SECTION',
};

const BLOCK_COLORS: Record<BlockType, string> = {
  text: 'var(--color-primary-800)', table: '#34d399', image: '#fb923c', section: 'var(--color-primary-700)',
};

export default function BlockWrapper({
  blockId, type, isSelected, isFirst, isLast,
  onSelect, onDelete, onMoveUp, onMoveDown, onSaveToLibrary, children,
}: Props) {
  return (
    <div
      data-block-id={blockId}
      style={{
        ...styles.wrapper,
        outline: isSelected ? '2px solid var(--color-primary-200)' : '2px solid transparent',
        borderLeft: isSelected
          ? `4px solid ${BLOCK_COLORS[type]}`
          : `4px solid ${BLOCK_COLORS[type]}40`,
      }}
      onClick={onSelect}
      onMouseDown={onSelect}
    >
      {/* Header */}
      <div style={styles.header}>
        <span style={{ ...styles.typeLabel, color: BLOCK_COLORS[type] }}>
          {BLOCK_LABELS[type]}
        </span>
        <span style={styles.blockId}>{blockId.slice(0, 8)}</span>
        <div style={{ flex: 1 }} />

        {isSelected && (
          <div style={styles.actions}>
            <button style={styles.actionBtn}
              onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
              disabled={isFirst} title="Move up">↑</button>
            <button style={styles.actionBtn}
              onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
              disabled={isLast} title="Move down">↓</button>

            {onSaveToLibrary && (
              <button
                style={{ ...styles.actionBtn, ...styles.saveBtn }}
                onClick={(e) => { e.stopPropagation(); onSaveToLibrary(); }}
                title="Save to Library"
              >☆</button>
            )}

            <button
              style={{ ...styles.actionBtn, ...styles.deleteBtn }}
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="Delete block">✕</button>
          </div>
        )}
      </div>

      {/* Content */}
      <div style={styles.content}>{children}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper:   { backgroundColor: '#ffffff', borderRadius: '8px', cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  header:    { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderBottom: '1px solid #f1f5f9' },
  typeLabel: { fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' },
  blockId:   { fontSize: '10px', color: '#e2e8f0', fontFamily: 'var(--font-family-mono)' },
  actions:   { display: 'flex', gap: '3px' },
  actionBtn: { background: 'none', border: '1px solid #e2e8f0', borderRadius: '4px', width: '24px', height: '24px', fontSize: '12px', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  saveBtn:   { color: 'var(--color-primary-800)', borderColor: 'var(--color-primary-200)', fontSize: '14px' },
  deleteBtn: { color: '#ef4444', borderColor: '#fecaca' },
  content:   { padding: '12px 14px' },
};
