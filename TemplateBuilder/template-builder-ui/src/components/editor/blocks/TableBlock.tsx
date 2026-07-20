// src/components/editor/blocks/TableBlock.tsx
// Added: Drag-and-drop tokens from palette onto column binding cells

import { useState } from 'react';
import type { TableColumn } from '../../../types/api';

// Must match PlaceholderPalette.tsx
const DRAG_TOKEN_KEY = 'application/x-placeholder-token';

interface Props {
  columns: TableColumn[];
  rows: string[][];
  repeat?: string;
  onChange: (columns: TableColumn[], rows: string[][], repeat?: string) => void;
  isSelected: boolean;
  onColumnFocus?: (index: number) => void;
  onCellFocus?: (rowIndex: number, colIndex: number) => void;
}

export default function TableBlock({
  columns, rows, repeat, onChange, isSelected, onColumnFocus, onCellFocus,
}: Props) {

  const [activeCell, setActiveCell] = useState<{ ri: number; ci: number } | null>(null);
  const [dragOverCol, setDragOverCol] = useState<number | null>(null); // which binding is being hovered
  const [dragOverCell, setDragOverCell] = useState<{ ri: number; ci: number } | null>(null); // which data cell

  function handleHeaderChange(i: number, value: string) {
    onChange(columns.map((col, ci) => ci === i ? { ...col, header: value } : col), rows, repeat);
  }

  function handleBindingChange(i: number, value: string) {
    onChange(columns.map((col, ci) => ci === i ? { ...col, binding: value } : col), rows, repeat);
  }

  function handleAddColumn() {
    const newCols = [...columns, { header: `Column ${columns.length + 1}`, binding: '{{}}' }];
    const newRows = rows.map((row) => [...row, '']);
    onChange(newCols, newRows, repeat);
  }

  function handleRemoveColumn(i: number) {
    if (columns.length <= 1) return;
    onChange(
      columns.filter((_, ci) => ci !== i),
      rows.map((row) => row.filter((_, ci) => ci !== i)),
      repeat
    );
  }

  function handleAddRow() {
    onChange(columns, [...rows, columns.map(() => '')], repeat);
  }

  function handleRemoveRow(ri: number) {
    if (rows.length <= 1) return;
    onChange(columns, rows.filter((_, i) => i !== ri), repeat);
  }

  function handleCellClick(ri: number, ci: number, e: React.MouseEvent) {
    e.stopPropagation();
    setActiveCell({ ri, ci });
    onCellFocus?.(ri, ci);
  }

  function handleBindingFocus(i: number) {
    setActiveCell(null);
    onColumnFocus?.(i);
  }

  // ── Drop handlers for data cells ─────────────────────────────────
  function handleCellDragOver(e: React.DragEvent, ri: number, ci: number) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setDragOverCell({ ri, ci });
  }

  function handleCellDragLeave() {
    setDragOverCell(null);
  }

  function handleCellDrop(e: React.DragEvent, ri: number, ci: number) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverCell(null);
    const tokenName = e.dataTransfer.getData(DRAG_TOKEN_KEY);
    if (!tokenName) return;
    const newRows = rows.map((row, rowIdx) =>
      rowIdx === ri
        ? row.map((cell, colIdx) => colIdx === ci ? `{{${tokenName}}}` : cell)
        : row
    );
    onChange(columns, newRows, repeat);
    onCellFocus?.(ri, ci);
  }

  // ── Drop handlers for binding cells ──────────────────────────────
  function handleBindingDragOver(e: React.DragEvent, colIndex: number) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setDragOverCol(colIndex);
  }

  function handleBindingDragLeave() {
    setDragOverCol(null);
  }

  function handleBindingDrop(e: React.DragEvent, colIndex: number) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverCol(null);
    const tokenName = e.dataTransfer.getData(DRAG_TOKEN_KEY);
    if (!tokenName) return;
    // Insert {{token}} into the binding cell
    handleBindingChange(colIndex, `{{${tokenName}}}`);
    onColumnFocus?.(colIndex);
  }

  return (
    <div style={{
      ...styles.wrapper,
      outline: isSelected ? '2px solid var(--color-primary-200)' : '2px solid transparent',
      borderRadius: '8px',
      padding: '10px',
      backgroundColor: isSelected ? '#fafbff' : '#fff',
    }}>

      {/* Dataset row */}
      <div style={styles.repeatRow}>
        <label style={styles.repeatLabel}>Dataset (repeat over):</label>
        <input
          style={styles.repeatInput}
          value={repeat ?? ''}
          onChange={(e) => onChange(columns, rows, e.target.value || undefined)}
          placeholder="e.g. loan_core.loans"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      <div style={styles.tableScroll}>
        <table style={styles.table}>
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th key={i} style={styles.th}>
                  {/* Column header */}
                  <div style={styles.thTop}>
                    <input
                      style={styles.headerInput}
                      value={col.header}
                      onChange={(e) => handleHeaderChange(i, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="Column header"
                    />
                    {isSelected && columns.length > 1 && (
                      <button
                        style={styles.removeBtn}
                        onClick={(e) => { e.stopPropagation(); handleRemoveColumn(i); }}
                      >✕</button>
                    )}
                  </div>

                  {/* Binding input — droppable */}
                  <input
                    style={{
                      ...styles.bindingCell,
                      outline: dragOverCol === i ? '2px solid var(--color-primary-200)' : 'none',
                      backgroundColor: dragOverCol === i ? 'var(--color-primary-50)' : 'var(--color-bg-muted)',
                      boxShadow: dragOverCol === i ? '0 0 0 3px rgba(191,219,254,0.35)' : 'none',
                    }}
                    value={col.binding}
                    onChange={(e) => { e.stopPropagation(); handleBindingChange(i, e.target.value); }}
                    onClick={(e) => { e.stopPropagation(); handleBindingFocus(i); setActiveCell(null); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onFocus={() => { handleBindingFocus(i); setActiveCell(null); }}
                    onDragOver={(e) => handleBindingDragOver(e, i)}
                    onDragLeave={handleBindingDragLeave}
                    onDrop={(e) => handleBindingDrop(e, i)}
                    placeholder="{{token}} or drag here"
                  />
                  {/* Drop hint */}
                  {dragOverCol === i && (
                    <div style={styles.dropHint}>Drop to insert token</div>
                  )}
                </th>
              ))}

              {isSelected && (
                <th style={styles.addColTh}>
                  <button style={styles.addColBtn} onClick={(e) => { e.stopPropagation(); handleAddColumn(); }}>
                    + Col
                  </button>
                </th>
              )}
              {isSelected && <th style={styles.actionTh} />}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} style={{ backgroundColor: ri % 2 === 0 ? '#fff' : '#f8fafc' }}>
                {columns.map((col, ci) => {
                  const cellValue = row[ci] ?? '';
                  const isThisActive = activeCell?.ri === ri && activeCell?.ci === ci;
                  const displayValue = cellValue || col.binding;
                  const isToken = displayValue?.startsWith('{{') && displayValue?.endsWith('}}');

                  return (
                    <td key={ci} style={styles.td}>
                      <div
                        style={{
                          ...styles.dataCell,
                          backgroundColor: (dragOverCell?.ri === ri && dragOverCell?.ci === ci) ? 'var(--color-primary-50)' : isThisActive ? 'var(--color-primary-50)' : isToken ? 'var(--color-bg-muted)' : '#fff',
                          border: (dragOverCell?.ri === ri && dragOverCell?.ci === ci) ? '2px dashed var(--color-primary-200)' : isThisActive ? '2px solid var(--color-primary-200)' : isToken ? '1px dashed var(--color-primary-200)' : '1px solid #e2e8f0',
                          color: isToken ? 'var(--color-primary-800)' : '#334155',
                          fontFamily: isToken ? 'var(--font-family-mono)' : 'inherit',
                          cursor: 'pointer',
                        }}
                        onClick={(e) => handleCellClick(ri, ci, e)}
                        onMouseDown={(e) => e.stopPropagation()}
                        onDragOver={(e) => handleCellDragOver(e, ri, ci)}
                        onDragLeave={handleCellDragLeave}
                        onDrop={(e) => handleCellDrop(e, ri, ci)}
                        title={dragOverCell?.ri === ri && dragOverCell?.ci === ci ? 'Drop to insert token' : isThisActive ? 'Now click a placeholder from the left panel' : 'Click to select, then click a placeholder'}
                      >
                        {displayValue || <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>click then pick placeholder</span>}
                      </div>
                    </td>
                  );
                })}

                {isSelected && <td style={styles.td} />}
                {isSelected && (
                  <td style={{ ...styles.td, width: 32, textAlign: 'center' as const }}>
                    {rows.length > 1 && (
                      <button
                        style={styles.removeBtn}
                        onClick={(e) => { e.stopPropagation(); handleRemoveRow(ri); }}
                      >✕</button>
                    )}
                  </td>
                )}
              </tr>
            ))}

            {isSelected && (
              <tr>
                <td colSpan={columns.length + 2} style={styles.addRowTd}>
                  <button
                    style={styles.addRowBtn}
                    onClick={(e) => { e.stopPropagation(); handleAddRow(); }}
                  >+ Add Row</button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={styles.hint}>
        {isSelected
          ? dragOverCol !== null
            ? `⬇ Drop to set binding for Column ${dragOverCol + 1}`
            : activeCell
            ? `✎ Row ${activeCell.ri + 1}, Col ${activeCell.ci + 1} selected — now click a placeholder from the left panel`
            : '✎ Click any cell to select it, then click a placeholder — or drag a placeholder onto a binding cell'
          : 'Click to edit table'}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper:      { display: 'flex', flexDirection: 'column', gap: '10px' },
  repeatRow:    { display: 'flex', alignItems: 'center', gap: '10px' },
  repeatLabel:  { fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap', fontWeight: 500 },
  repeatInput:  { flex: 1, padding: '5px 9px', border: '1px solid #e2e8f0', borderRadius: '5px', fontSize: '12px', fontFamily: 'var(--font-family-mono)', color: '#334155', outline: 'none', backgroundColor: '#f8fafc' },
  tableScroll:  { overflowX: 'auto' },
  table:        { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th:           { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '6px 8px', minWidth: '140px', verticalAlign: 'top' },
  thTop:        { display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' },
  headerInput:  { flex: 1, border: 'none', backgroundColor: 'transparent', fontSize: '13px', fontWeight: 700, color: '#0f172a', outline: 'none', width: '100%' },
  bindingCell:  { width: '100%', border: '1px dashed var(--color-primary-200)', borderRadius: '4px', backgroundColor: 'var(--color-bg-muted)', padding: '3px 6px', fontSize: '11px', fontFamily: 'var(--font-family-mono)', color: 'var(--color-primary-800)', outline: 'none', boxSizing: 'border-box' as const, cursor: 'text', transition: 'all 0.15s' },
  dropHint:     { fontSize: '10px', color: 'var(--color-primary-800)', fontWeight: 600, textAlign: 'center' as const, marginTop: 2, backgroundColor: 'var(--color-primary-50)', borderRadius: 3, padding: '1px 4px' },
  dataCell:     { padding: '5px 8px', borderRadius: '4px', fontSize: '12px', minHeight: '28px', display: 'flex', alignItems: 'center', userSelect: 'none' as const, transition: 'all 0.1s' },
  removeBtn:    { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '11px', padding: '0 2px', lineHeight: 1 },
  addColTh:     { backgroundColor: '#f8fafc', border: '1px dashed var(--color-primary-200)', padding: '6px 8px', width: '70px', verticalAlign: 'middle', textAlign: 'center' as const },
  addColBtn:    { background: 'none', border: 'none', color: 'var(--color-primary-800)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  actionTh:     { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', width: '32px' },
  td:           { border: '1px solid #e2e8f0', padding: '4px 6px' },
  addRowTd:     { border: '1px dashed #e2e8f0', padding: '6px', textAlign: 'center' as const },
  addRowBtn:    { background: 'none', border: 'none', color: 'var(--color-primary-800)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', width: '100%' },
  hint:         { fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', textAlign: 'right' as const },
};
