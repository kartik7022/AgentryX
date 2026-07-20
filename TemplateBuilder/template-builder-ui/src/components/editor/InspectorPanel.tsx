// src/components/editor/InspectorPanel.tsx
// Added: {{ autocomplete dropdown, alignment control, font size control

import { useState, useRef, useEffect } from 'react';
import type { LayoutBlock, Placeholder } from '../../types/api';

interface Props {
  blocks: LayoutBlock[];
  selectedBlockId: string | null;
  placeholders: Placeholder[];
  onBlockChange: (id: string, changes: Partial<LayoutBlock>) => void;
}

function extractTokens(text: string): string[] {
  const matches = text.match(/\{\{([^}]+)\}\}/g) ?? [];
  return matches.map((m) => m.replace(/\{\{|\}\}/g, '').trim());
}

const FONT_SIZES = [10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32];
const ALIGN_OPTIONS: { value: 'left' | 'center' | 'right'; icon: string }[] = [
  { value: 'left',   icon: '⬛◻◻' },
  { value: 'center', icon: '◻⬛◻' },
  { value: 'right',  icon: '◻◻⬛' },
];

export default function InspectorPanel({ blocks, selectedBlockId, placeholders, onBlockChange }: Props) {
  const block = blocks.find((b) => b.block_id === selectedBlockId) ?? null;
  const knownNames = new Set(placeholders.map((p) => p.name));

  const unknownTokens: string[] = [];
  if (block?.type === 'text' && block.content) {
    extractTokens(block.content).forEach((token) => {
      if (!knownNames.has(token)) unknownTokens.push(token);
    });
  }

  // ── Autocomplete state ─────────────────────────────────────────────────────
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownFilter, setDropdownFilter] = useState('');
  const [dropdownIndex, setDropdownIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const triggerPosRef = useRef<number>(-1);

  const filteredPlaceholders = placeholders.filter((p) =>
    p.name.toLowerCase().includes(dropdownFilter.toLowerCase())
  );

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    const cursor = e.target.selectionStart ?? 0;
    onBlockChange(block!.block_id, { content: value });

    const before = value.slice(0, cursor);
    const lastTwo = before.slice(-2);

    if (lastTwo === '{{') {
      triggerPosRef.current = cursor;
      setDropdownFilter('');
      setDropdownIndex(0);
      setShowDropdown(true);
    } else if (showDropdown) {
      const afterTrigger = before.slice(triggerPosRef.current);
      if (afterTrigger.includes('}}') || cursor < triggerPosRef.current) {
        setShowDropdown(false);
      } else {
        setDropdownFilter(afterTrigger);
        setDropdownIndex(0);
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setDropdownIndex(i => Math.min(i + 1, filteredPlaceholders.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setDropdownIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (filteredPlaceholders[dropdownIndex]) {
        insertPlaceholder(filteredPlaceholders[dropdownIndex].name);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  }

  function insertPlaceholder(name: string) {
    if (!block || !textareaRef.current) return;
    const content = block.content ?? '';
    const cursor = textareaRef.current.selectionStart ?? 0;
    const before = content.slice(0, triggerPosRef.current - 2);
    const after = content.slice(cursor);
    const newContent = before + `{{${name}}}` + after;
    onBlockChange(block.block_id, { content: newContent });
    setShowDropdown(false);
    const newCursor = before.length + `{{${name}}}`.length;
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = newCursor;
        textareaRef.current.selectionEnd = newCursor;
        textareaRef.current.focus();
      }
    }, 0);
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (textareaRef.current && !textareaRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div style={styles.panel}>

      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>Inspector</span>
        {block && (
          <span style={{ ...styles.typePill, color: TYPE_COLORS[block.type] }}>
            {block.type.toUpperCase()}
          </span>
        )}
      </div>

      {/* No selection */}
      {!block && (
        <div style={styles.noSelection}>
          <div style={styles.noSelectionIcon}>⊡</div>
          <p style={styles.noSelectionText}>Click a block on the canvas to inspect and edit its properties</p>
        </div>
      )}

      {/* TEXT block */}
      {block?.type === 'text' && (
        <>
          {/* ── Block Properties ───────────────────────────────────────── */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Block Properties</div>

            {/* Alignment */}
            <div style={styles.fieldRow}>
              <label style={styles.fieldLabel}>Alignment</label>
            </div>
            <div style={styles.alignRow}>
              {ALIGN_OPTIONS.map(({ value }) => (
                <button
                  key={value}
                  title={value.charAt(0).toUpperCase() + value.slice(1)}
                  style={{
                    ...styles.alignBtn,
                    ...(( block.align ?? 'left') === value ? styles.alignBtnActive : {}),
                  }}
                  onClick={() => onBlockChange(block.block_id, { align: value })}
                >
                  {value === 'left' ? '⬅' : value === 'center' ? '↔' : '➡'}
                  <span style={{ fontSize: '10px', marginLeft: 4 }}>{value}</span>
                </button>
              ))}
            </div>

            {/* Font Size */}
            <div style={{ ...styles.fieldRow, marginTop: '10px' }}>
              <label style={styles.fieldLabel}>Font Size</label>
              <span style={styles.fieldValue}>{block.fontSize ?? 14}px</span>
            </div>
            <div style={styles.fontSizeRow}>
              <button
                style={styles.fontSizeBtn}
                onClick={() => onBlockChange(block.block_id, { fontSize: Math.max(10, (block.fontSize ?? 14) - 1) })}
              >−</button>
              <select
                style={styles.fontSizeSelect}
                value={block.fontSize ?? 14}
                onChange={(e) => onBlockChange(block.block_id, { fontSize: Number(e.target.value) })}
              >
                {FONT_SIZES.map(size => (
                  <option key={size} value={size}>{size}px</option>
                ))}
              </select>
              <button
                style={styles.fontSizeBtn}
                onClick={() => onBlockChange(block.block_id, { fontSize: Math.min(32, (block.fontSize ?? 14) + 1) })}
              >+</button>
            </div>
            <p style={styles.fieldHint}>Changes apply in generated document</p>
          </div>

          {/* ── Content ────────────────────────────────────────────────── */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Content</div>
            <div style={{ position: 'relative' }}>
              <textarea
                ref={textareaRef}
                style={styles.textarea}
                value={block.content ?? ''}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                rows={6}
                placeholder="Type text here. Use {{ to insert placeholders."
              />

              {/* Autocomplete dropdown */}
              {showDropdown && filteredPlaceholders.length > 0 && (
                <div style={styles.dropdown}>
                  <div style={styles.dropdownHeader}>Placeholders</div>
                  {filteredPlaceholders.slice(0, 8).map((p, i) => (
                    <div
                      key={p.registry_id}
                      style={{
                        ...styles.dropdownItem,
                        ...(i === dropdownIndex ? styles.dropdownItemActive : {}),
                      }}
                      onMouseDown={(e) => { e.preventDefault(); insertPlaceholder(p.name); }}
                      onMouseEnter={() => setDropdownIndex(i)}
                    >
                      <span style={styles.dropdownToken}>{`{{${p.name}}}`}</span>
                      {p.sample_value && (
                        <span style={styles.dropdownSample}>{p.sample_value}</span>
                      )}
                    </div>
                  ))}
                  {filteredPlaceholders.length === 0 && (
                    <div style={styles.dropdownEmpty}>No matching placeholders</div>
                  )}
                  <div style={styles.dropdownFooter}>↑↓ navigate · Enter to insert · Esc to close</div>
                </div>
              )}

              {showDropdown && placeholders.length === 0 && (
                <div style={styles.dropdown}>
                  <div style={styles.dropdownEmpty}>No placeholders in registry yet</div>
                </div>
              )}
            </div>
            <p style={styles.fieldHint}>Type {'{{'}  to see placeholder suggestions</p>
          </div>
        </>
      )}

      {/* TABLE block */}
      {block?.type === 'table' && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Table Config</div>
          <div style={styles.fieldRow}>
            <label style={styles.fieldLabel}>Columns</label>
            <span style={styles.fieldValue}>{block.columns?.length ?? 0} column(s)</span>
          </div>
          <div style={styles.fieldRow}>
            <label style={styles.fieldLabel}>Dataset (repeat)</label>
          </div>
          <input
            style={styles.input}
            value={block.repeat ?? ''}
            onChange={(e) => onBlockChange(block.block_id, { repeat: e.target.value })}
            placeholder="e.g. loan_core.loans"
          />
          <p style={styles.fieldHint}>Edit column headers and bindings directly on the canvas</p>
        </div>
      )}

      {/* IMAGE block */}
      {block?.type === 'image' && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Image Source</div>
          <input
            style={styles.input}
            value={block.src ?? ''}
            onChange={(e) => onBlockChange(block.block_id, { src: e.target.value })}
            placeholder="https://... or {{logo_url}}"
          />
        </div>
      )}

      {/* SECTION block */}
      {block?.type === 'section' && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Section Label</div>
          <input
            style={styles.input}
            value={block.content ?? ''}
            onChange={(e) => onBlockChange(block.block_id, { content: e.target.value })}
            placeholder="Section name"
          />
        </div>
      )}

      {/* Token validation */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Token Validation</div>
        {!block && <div style={styles.fieldHint}>Select a block to validate tokens</div>}
        {block?.type === 'text' && unknownTokens.length === 0 && (
          <div style={styles.validRow}><span style={styles.validIcon}>✓</span> No unknown tokens</div>
        )}
        {block?.type === 'text' && unknownTokens.length > 0 && (
          <div>
            <div style={styles.warnRow}><span style={styles.warnIcon}>⚠</span> {unknownTokens.length} unknown token(s)</div>
            {unknownTokens.map((t) => (
              <div key={t} style={styles.unknownToken}>{`{{${t}}}`}</div>
            ))}
            <p style={styles.fieldHint}>These tokens are not in the registry. Add them in Placeholder Registry.</p>
          </div>
        )}
        {block && block.type !== 'text' && (
          <div style={styles.fieldHint}>Token validation applies to text blocks only</div>
        )}
      </div>

      {/* Block ID */}
      {block && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Block ID</div>
          <div style={styles.blockIdText}>{block.block_id}</div>
        </div>
      )}
    </div>
  );
}

const TYPE_COLORS: Record<string, string> = {
  text: 'var(--color-primary-800)', table: '#34d399', image: '#fb923c', section: 'var(--color-primary-700)',
};

const styles: Record<string, React.CSSProperties> = {
  panel:              { width: '240px', flexShrink: 0, backgroundColor: '#ffffff', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' },
  header:             { padding: '14px 14px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
  title:              { fontSize: '13px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' },
  typePill:           { fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: '10px' },
  noSelection:        { padding: '28px 16px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' },
  noSelectionIcon:    { fontSize: '32px', color: '#cbd5e1', marginBottom: '10px' },
  noSelectionText:    { fontSize: '12px', color: '#94a3b8', lineHeight: 1.6 },
  section:            { padding: '14px', borderBottom: '1px solid #f1f5f9' },
  sectionTitle:       { fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' },
  textarea:           { width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', color: '#334155', resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box' },
  input:              { width: '100%', padding: '7px 9px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', color: '#334155', outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-family-mono)' },
  fieldRow:           { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' },
  fieldLabel:         { fontSize: '12px', color: '#64748b', fontWeight: 500 },
  fieldValue:         { fontSize: '12px', color: '#0f172a', fontWeight: 600 },
  fieldHint:          { fontSize: '11px', color: '#94a3b8', marginTop: '6px', lineHeight: 1.5 },
  validRow:           { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#16a34a' },
  validIcon:          { fontSize: '14px', color: '#22c55e' },
  warnRow:            { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#b45309', marginBottom: '6px' },
  warnIcon:           { fontSize: '14px', color: '#f59e0b' },
  unknownToken:       { backgroundColor: '#fef3c7', color: '#92400e', fontFamily: 'var(--font-family-mono)', fontSize: '12px', padding: '3px 8px', borderRadius: '4px', marginBottom: '4px' },
  blockIdText:        { fontFamily: 'var(--font-family-mono)', fontSize: '11px', color: '#cbd5e1', wordBreak: 'break-all' },
  // Alignment
  alignRow:           { display: 'flex', gap: '4px' },
  alignBtn:           { flex: 1, padding: '5px 4px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '11px', color: '#64748b', backgroundColor: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  alignBtnActive:     { backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-800)', borderColor: 'var(--color-primary-200)', fontWeight: 600 },
  // Font size
  fontSizeRow:        { display: 'flex', gap: '4px', alignItems: 'center' },
  fontSizeBtn:        { width: '28px', height: '28px', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: '#f8fafc', color: '#475569', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 },
  fontSizeSelect:     { flex: 1, padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', color: '#334155', backgroundColor: '#fff', outline: 'none', cursor: 'pointer' },
  // Dropdown
  dropdown:           { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid var(--color-primary-200)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 500, overflow: 'hidden', marginTop: '2px' },
  dropdownHeader:     { padding: '6px 10px', fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9', backgroundColor: '#f8fafc' },
  dropdownItem:       { padding: '8px 10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' },
  dropdownItemActive: { backgroundColor: 'var(--color-primary-50)' },
  dropdownToken:      { fontFamily: 'var(--font-family-mono)', fontSize: '12px', color: 'var(--color-primary-800)', fontWeight: 600 },
  dropdownSample:     { fontSize: '11px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px' },
  dropdownEmpty:      { padding: '10px', fontSize: '12px', color: '#94a3b8', textAlign: 'center' },
  dropdownFooter:     { padding: '5px 10px', fontSize: '10px', color: '#cbd5e1', borderTop: '1px solid #f1f5f9', backgroundColor: '#f8fafc' },
};
