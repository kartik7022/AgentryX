// src/components/editor/BlockCanvas.tsx
// Added: 📚 Blocks Library panel — browse saved blocks and add to canvas
// Added: Real drag-and-drop tokens from palette onto text blocks

import { useState } from 'react';
import { v4 as uuid } from 'uuid';
import type { LayoutBlock, BlockType, Placeholder } from '../../types/api';
import BlockWrapper from './blocks/BlockWrapper';
import TextBlock from './blocks/TextBlock';
import TableBlock from './blocks/TableBlock';
import ImageBlock from './blocks/ImageBlock';
import SectionBlock from './blocks/SectionBlock';
import apiClient from '../../api/client';

import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ── Drag token key (must match PlaceholderPalette) ────────────────────────────
const DRAG_TOKEN_KEY = 'application/x-placeholder-token';

// ── Types ─────────────────────────────────────────────────────────────────────
interface LibraryBlock {
  block_id: string;
  name: string;
  type: string;
  block_json: Record<string, unknown>;
  tags: string[];
  industry?: string;
  created_at: string;
}

// ── Block factory ─────────────────────────────────────────────────────────────
function createBlock(type: BlockType): LayoutBlock {
  const id = uuid();
  switch (type) {
    case 'text':    return { block_id: id, type: 'text', content: '' };
    case 'table':   return {
      block_id: id, type: 'table',
      columns: [
        { header: 'Column 1', binding: '{{}}' },
        { header: 'Column 2', binding: '{{}}' },
      ],
      rows: [['', '']],
      repeat: '',
    };
    case 'image':   return { block_id: id, type: 'image', src: '' };
    case 'section': return { block_id: id, type: 'section', content: 'Section', children: [] };
  }
}

const TYPE_ICON: Record<string, string> = {
  text: '¶', table: '⊞', image: '🖼', section: '§',
};

// ── Token drop handler ────────────────────────────────────────────────────────
function handleTokenDrop(
  e: React.DragEvent,
  block: LayoutBlock,
  onUpdate: (changes: Partial<LayoutBlock>) => void,
  onSelectBlock: (id: string) => void,
) {
  e.preventDefault();
  e.stopPropagation();
  const tokenName = e.dataTransfer.getData(DRAG_TOKEN_KEY);
  if (!tokenName) return;
  // Insert token at end of existing content with proper spacing
  const existing  = block.content ?? '';
  const needsSpace = existing.length > 0 && !existing.endsWith(' ');
  const newContent = existing + (needsSpace ? ' ' : '') + `{{${tokenName}}}`;
  onUpdate({ content: newContent });
  onSelectBlock(block.block_id);
}

// ── SortableBlock ─────────────────────────────────────────────────────────────
interface SortableBlockProps {
  block: LayoutBlock;
  index: number;
  total: number;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpdate: (changes: Partial<LayoutBlock>) => void;
  onSelectBlock: (id: string) => void;
  onColumnFocus?: (blockId: string, colIndex: number) => void;
  onCellFocus?: (blockId: string, rowIndex: number, colIndex: number) => void;
  onSaveToLibrary?: () => void;
  knownTokens: Set<string>;
}

function SortableBlock({
  block, index, total, isSelected, onSelect, onDelete,
  onMoveUp, onMoveDown, onUpdate, onSelectBlock, onColumnFocus, onCellFocus, onSaveToLibrary,
  knownTokens,
}: SortableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.block_id });

  // Drop state for text blocks
  const [isDragOver, setIsDragOver] = useState(false);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div {...attributes} {...listeners} style={S.dragHandle} title="Drag to reorder">⠿</div>
      <BlockWrapper
        blockId={block.block_id} type={block.type}
        isSelected={isSelected} isFirst={index === 0} isLast={index === total - 1}
        onSelect={onSelect} onDelete={onDelete} onMoveUp={onMoveUp} onMoveDown={onMoveDown}
        onSaveToLibrary={onSaveToLibrary}
      >
        {block.type === 'text' && (
          <div
            onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={e => {
              setIsDragOver(false);
              handleTokenDrop(e, block, onUpdate, onSelectBlock);
            }}
            style={{
              borderRadius: 6,
              outline: isDragOver ? '2px dashed var(--color-primary-200)' : '2px dashed transparent',
              backgroundColor: isDragOver ? 'rgba(191,219,254,0.18)' : 'transparent',
              transition: 'all 0.15s',
            }}
            title="Drop a placeholder token here"
          >
            {isDragOver && (
              <div style={S.dropOverlay}>Drop to insert token</div>
            )}
            <TextBlock
              content={block.content ?? ''}
              onChange={(content) => onUpdate({ content })}
              onSelect={() => onSelectBlock(block.block_id)}
              knownTokens={knownTokens}
            />
          </div>
        )}
        {block.type === 'table' && (
          <div onMouseDown={(e) => { e.stopPropagation(); onSelect(); }}>
            <TableBlock
              columns={block.columns ?? []}
              rows={block.rows && block.rows.length > 0 ? block.rows : [(block.columns ?? []).map(() => '')]}
              repeat={block.repeat}
              isSelected={isSelected}
              onChange={(columns, rows, repeat) => onUpdate({ columns, rows, repeat })}
              onColumnFocus={(colIndex) => onColumnFocus?.(block.block_id, colIndex)}
              onCellFocus={(rowIndex, colIndex) => onCellFocus?.(block.block_id, rowIndex, colIndex)}
            />
          </div>
        )}
        {block.type === 'image' && (
          <ImageBlock src={block.src} onChange={(src) => onUpdate({ src })} />
        )}
        {block.type === 'section' && (
          <SectionBlock
            content={block.content ?? 'Section Title'}
            onChange={(content: string) => onUpdate({ content })}
            isSelected={isSelected}
            onSelect={onSelect}
          />
        )}
      </BlockWrapper>
    </div>
  );
}

// ── BlocksLibraryPanel ────────────────────────────────────────────────────────
interface LibraryPanelProps {
  onAddBlock: (block: LayoutBlock) => void;
  onClose: () => void;
}

function BlocksLibraryPanel({ onAddBlock, onClose }: LibraryPanelProps) {
  const [libraryBlocks, setLibraryBlocks] = useState<LibraryBlock[]>([]);
  const [isLoading, setIsLoading]         = useState(true);
  const [search, setSearch]               = useState('');
  const [typeFilter, setTypeFilter]       = useState('');
  const [added, setAdded]                 = useState<Set<string>>(new Set());

  useState(() => {
    apiClient.get('/blocks/')
      .then(res => setLibraryBlocks(res.data))
      .catch(() => setLibraryBlocks([]))
      .finally(() => setIsLoading(false));
  });

  const filtered = libraryBlocks.filter(b => {
    const matchSearch = !search ||
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.tags.some(t => t.toLowerCase().includes(search.toLowerCase()));
    const matchType = !typeFilter || b.type === typeFilter;
    return matchSearch && matchType;
  });

  function handleUseBlock(lb: LibraryBlock) {
    const newBlock: LayoutBlock = {
      ...(lb.block_json as unknown as LayoutBlock),
      block_id: uuid(),
    };
    onAddBlock(newBlock);
    setAdded(prev => new Set([...prev, lb.block_id]));
  }

  return (
    <div style={S.libraryOverlay} onClick={onClose}>
      <div style={S.libraryPanel} onClick={e => e.stopPropagation()}>
        <div style={S.libHeader}>
          <div>
            <h3 style={S.libTitle}>📚 Blocks Library</h3>
            <p style={S.libSubtitle}>Browse and reuse saved blocks</p>
          </div>
          <button style={S.libCloseBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.libFilters}>
          <input
            style={S.libSearch}
            placeholder="Search blocks..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          <select style={S.libSelect} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            <option value="text">Text</option>
            <option value="table">Table</option>
            <option value="image">Image</option>
            <option value="section">Section</option>
          </select>
        </div>
        <div style={S.libBody}>
          {isLoading && <div style={S.libCentered}>Loading library...</div>}
          {!isLoading && filtered.length === 0 && (
            <div style={S.libEmpty}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                {libraryBlocks.length === 0 ? 'Library is empty' : 'No blocks match your search'}
              </p>
              <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
                {libraryBlocks.length === 0
                  ? 'Save blocks from the canvas using the ☆ Save to Library button on each block.'
                  : 'Try adjusting your search or filter.'}
              </p>
            </div>
          )}
          {!isLoading && filtered.map(lb => (
            <div key={lb.block_id} style={S.libCard}>
              <div style={S.libCardHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ ...S.libTypeBadge, ...TYPE_BADGE_COLORS[lb.type] }}>
                    {TYPE_ICON[lb.type]} {lb.type}
                  </span>
                  <span style={S.libCardName}>{lb.name}</span>
                </div>
                <button
                  style={{ ...S.libUseBtn, ...(added.has(lb.block_id) ? S.libUsedBtn : {}) }}
                  onClick={() => handleUseBlock(lb)}
                  disabled={added.has(lb.block_id)}
                >
                  {added.has(lb.block_id) ? '✓ Added' : '+ Use'}
                </button>
              </div>
              {lb.tags.length > 0 && (
                <div style={S.libTags}>
                  {lb.tags.map(t => <span key={t} style={S.libTag}>{t}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={S.libFooter}>
          {filtered.length} block{filtered.length !== 1 ? 's' : ''} in library
        </div>
      </div>
    </div>
  );
}

const TYPE_BADGE_COLORS: Record<string, React.CSSProperties> = {
  text:    { backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-800)' },
  table:   { backgroundColor: '#dcfce7', color: '#166534' },
  image:   { backgroundColor: '#fff7ed', color: '#c2410c' },
  section: { backgroundColor: '#f3e8ff', color: '#7e22ce' },
};

// ── BlockCanvas ───────────────────────────────────────────────────────────────
interface Props {
  selectedBlockId: string | null;
  onSelectBlock: (id: string | null) => void;
  blocks: LayoutBlock[];
  onBlocksChange: (blocks: LayoutBlock[]) => void;
  onColumnFocus?: (blockId: string, colIndex: number) => void;
  onCellFocus?: (blockId: string, rowIndex: number, colIndex: number) => void;
  placeholders?: Placeholder[];
}

export default function BlockCanvas({
  selectedBlockId, onSelectBlock, blocks, onBlocksChange, onColumnFocus, onCellFocus,
  placeholders = [],
}: Props) {

  const [showLibrary, setShowLibrary]     = useState(false);
  const [saveModal, setSaveModal]         = useState<{ block: LayoutBlock } | null>(null);
  const [saveName, setSaveName]           = useState('');
  const [saveTags, setSaveTags]           = useState('');
  const [saving, setSaving]               = useState(false);
  const [saveError, setSaveError]         = useState<string | null>(null);
  const [savedBlockId, setSavedBlockId]   = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex((b) => b.block_id === active.id);
    const newIndex = blocks.findIndex((b) => b.block_id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onBlocksChange(arrayMove(blocks, oldIndex, newIndex));
  }

  function addBlock(type: BlockType) { onBlocksChange([...blocks, createBlock(type)]); }
  function addLibraryBlock(block: LayoutBlock) { onBlocksChange([...blocks, block]); }

  async function handleSaveToLibrary(block: LayoutBlock) {
    setSaveName(''); setSaveTags(''); setSaveError(null); setSavedBlockId(null);
    setSaveModal({ block });
  }

  async function confirmSaveToLibrary() {
    if (!saveModal) return;
    if (!saveName.trim()) { setSaveError('Name is required'); return; }
    setSaving(true); setSaveError(null);
    try {
      await apiClient.post('/blocks/', {
        name: saveName.trim(),
        type: saveModal.block.type,
        block_json: saveModal.block,
        tags: saveTags.split(',').map(t => t.trim()).filter(Boolean),
        industry: null,
      });
      setSavedBlockId(saveModal.block.block_id);
      setTimeout(() => setSaveModal(null), 1000);
    } catch (err) {
      setSaveError((err as Error).message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  // Compute known token names from registry
  const knownTokens = new Set(placeholders.map(p => p.name));

  function deleteBlock(id: string) {
    onBlocksChange(blocks.filter((b) => b.block_id !== id));
    if (selectedBlockId === id) onSelectBlock(null);
  }

  function moveBlock(id: string, direction: 'up' | 'down') {
    const index = blocks.findIndex((b) => b.block_id === id);
    if (index === -1) return;
    const newBlocks = [...blocks];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newBlocks[index], newBlocks[targetIndex]] = [newBlocks[targetIndex], newBlocks[index]];
    onBlocksChange(newBlocks);
  }

  function updateBlock(id: string, changes: Partial<LayoutBlock>) {
    onBlocksChange(blocks.map((b) => (b.block_id === id ? { ...b, ...changes } : b)));
  }

  return (
    <div style={S.canvas}>

      {/* Toolbar */}
      <div style={S.toolbar}>
        <span style={S.toolbarLabel}>Add block</span>
        {(['text', 'table', 'image', 'section'] as BlockType[]).map((type) => (
          <button key={type} style={S.addBlockBtn} onClick={() => addBlock(type)}>
            + {type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
        <button style={S.libraryBtn} onClick={() => setShowLibrary(true)} title="Browse saved blocks">
          📚 Library
        </button>
        <span style={S.dragHint}>⠿ Drag to reorder</span>
      </div>

      {/* Canvas */}
      <div style={S.canvasArea} onClick={() => onSelectBlock(null)}>
        <div style={S.document}>

          {blocks.length === 0 && (
            <div style={S.emptyCanvas}>
              <div style={S.emptyIcon}>◈</div>
              <p style={S.emptyTitle}>Canvas is empty</p>
              <p style={S.emptyHint}>Use the toolbar above to add blocks, or browse the 📚 Library</p>
              <div style={S.quickAdd}>
                {(['text', 'table', 'image'] as BlockType[]).map((type) => (
                  <button key={type} style={S.quickAddBtn} onClick={() => addBlock(type)}>+ {type}</button>
                ))}
                <button style={{ ...S.quickAddBtn, backgroundColor: '#f3e8ff', color: '#7e22ce' }}
                  onClick={() => setShowLibrary(true)}>
                  📚 Library
                </button>
              </div>
            </div>
          )}

          {blocks.length > 0 && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={blocks.map((b) => b.block_id)} strategy={verticalListSortingStrategy}>
                {blocks.map((block, index) => (
                  <SortableBlock
                    key={block.block_id}
                    block={block} index={index} total={blocks.length}
                    isSelected={selectedBlockId === block.block_id}
                    onSelect={() => onSelectBlock(block.block_id)}
                    onDelete={() => deleteBlock(block.block_id)}
                    onMoveUp={() => moveBlock(block.block_id, 'up')}
                    onMoveDown={() => moveBlock(block.block_id, 'down')}
                    onUpdate={(changes) => updateBlock(block.block_id, changes)}
                    onSelectBlock={onSelectBlock}
                    onColumnFocus={onColumnFocus}
                    onCellFocus={onCellFocus}
                    onSaveToLibrary={() => handleSaveToLibrary(block)}
                    knownTokens={knownTokens}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}

          {blocks.length > 0 && (
            <div style={S.dropZone}>+ Use toolbar above to add more blocks</div>
          )}
        </div>
      </div>

      {/* Blocks Library Panel */}
      {showLibrary && (
        <BlocksLibraryPanel onAddBlock={addLibraryBlock} onClose={() => setShowLibrary(false)} />
      )}

      {/* Save to Library Modal */}
      {saveModal && (
        <div style={S.libraryOverlay} onClick={() => setSaveModal(null)}>
          <div style={{ ...S.libraryPanel, maxHeight: 'unset', width: '420px' }} onClick={e => e.stopPropagation()}>
            <div style={S.libHeader}>
              <div>
                <h3 style={S.libTitle}>☆ Save to Library</h3>
                <p style={S.libSubtitle}>Save this {saveModal.block.type} block for reuse</p>
              </div>
              <button style={S.libCloseBtn} onClick={() => setSaveModal(null)}>✕</button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {saveError && (
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', color: '#b91c1c' }}>
                  {saveError}
                </div>
              )}
              {savedBlockId && (
                <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', color: '#166534' }}>
                  ✓ Saved to library!
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>
                  Block Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }}
                  value={saveName} onChange={e => setSaveName(e.target.value)}
                  placeholder="e.g. Loan Offer Header" autoFocus
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>Tags (comma separated)</label>
                <input
                  style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', outline: 'none' }}
                  value={saveTags} onChange={e => setSaveTags(e.target.value)}
                  placeholder="banking, loan, header"
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '0 24px 20px' }}>
              <button
                style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 16px', fontSize: '13px', color: '#64748b', cursor: 'pointer' }}
                onClick={() => setSaveModal(null)}>Cancel</button>
              <button
                style={{ backgroundColor: '#7e22ce', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 18px', fontSize: '13px', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
                onClick={confirmSaveToLibrary} disabled={saving}>
                {saving ? 'Saving...' : '☆ Save to Library'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  canvas:         { flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#f1f5f9', overflow: 'hidden', minWidth: 0 },
  toolbar:        { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', flexShrink: 0, flexWrap: 'wrap' },
  toolbarLabel:   { fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '4px' },
  addBlockBtn:    { background: 'var(--color-primary-50)', border: '1px dashed var(--color-primary-200)', borderRadius: '6px', padding: '5px 13px', fontSize: '13px', color: 'var(--color-primary-800)', fontWeight: 500, cursor: 'pointer' },
  libraryBtn:     { background: 'var(--color-primary-50)', border: '1px solid var(--color-primary-200)', borderRadius: '6px', padding: '5px 13px', fontSize: '13px', color: 'var(--color-primary-800)', fontWeight: 600, cursor: 'pointer' },
  dragHint:       { marginLeft: 'auto', fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' },
  canvasArea:     { flex: 1, overflowY: 'auto', padding: '32px', display: 'flex', justifyContent: 'center' },
  document:       { width: '100%', maxWidth: '680px', display: 'flex', flexDirection: 'column', gap: '12px' },
  emptyCanvas:    { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', textAlign: 'center', backgroundColor: '#ffffff', borderRadius: '12px', border: '2px dashed #e2e8f0' },
  emptyIcon:      { fontSize: '40px', color: 'var(--color-primary-200)', marginBottom: '16px' },
  emptyTitle:     { fontSize: '16px', fontWeight: 600, color: '#475569', marginBottom: '8px' },
  emptyHint:      { fontSize: '13px', color: '#94a3b8', maxWidth: '300px', lineHeight: 1.6, marginBottom: '20px' },
  quickAdd:       { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' },
  quickAddBtn:    { backgroundColor: 'var(--color-primary-50)', border: 'none', borderRadius: '6px', padding: '7px 16px', fontSize: '13px', color: 'var(--color-primary-800)', fontWeight: 500, cursor: 'pointer' },
  dropZone:       { border: '2px dashed #e2e8f0', borderRadius: '8px', padding: '16px', textAlign: 'center', color: '#cbd5e1', fontSize: '13px' },
  dragHandle:     { position: 'absolute', left: '-24px', top: '50%', transform: 'translateY(-50%)', cursor: 'grab', fontSize: '18px', color: '#cbd5e1', padding: '4px', userSelect: 'none', zIndex: 10, lineHeight: 1 },
  dropOverlay:    { position: 'absolute', top: 0, left: 0, right: 0, textAlign: 'center', padding: '4px', fontSize: '11px', color: 'var(--color-primary-800)', fontWeight: 600, backgroundColor: 'rgba(239,246,255,0.9)', borderRadius: '6px 6px 0 0', zIndex: 5 },
  // Library panel
  libraryOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 },
  libraryPanel:   { backgroundColor: '#fff', borderRadius: '12px', width: '520px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  libHeader:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px 24px 14px', borderBottom: '1px solid #f1f5f9' },
  libTitle:       { fontSize: '17px', fontWeight: 700, color: '#0f172a' },
  libSubtitle:    { fontSize: '13px', color: '#94a3b8', marginTop: 4 },
  libCloseBtn:    { background: 'none', border: 'none', fontSize: '16px', color: '#94a3b8', cursor: 'pointer' },
  libFilters:     { display: 'flex', gap: '8px', padding: '12px 24px', borderBottom: '1px solid #f1f5f9' },
  libSearch:      { flex: 1, padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', outline: 'none' },
  libSelect:      { padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', color: '#475569', backgroundColor: '#fff', cursor: 'pointer', outline: 'none' },
  libBody:        { flex: 1, overflowY: 'auto', padding: '12px 24px', display: 'flex', flexDirection: 'column', gap: '8px' },
  libCentered:    { textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '13px' },
  libEmpty:       { textAlign: 'center', padding: '48px 20px' },
  libCard:        { border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' },
  libCardHeader:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  libTypeBadge:   { fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px' },
  libCardName:    { fontSize: '14px', fontWeight: 600, color: '#0f172a' },
  libUseBtn:      { backgroundColor: 'var(--color-primary-800)', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' },
  libUsedBtn:     { backgroundColor: '#dcfce7', color: '#166534', cursor: 'default' },
  libTags:        { display: 'flex', gap: '4px', flexWrap: 'wrap' },
  libTag:         { backgroundColor: '#f1f5f9', color: '#475569', fontSize: '11px', padding: '2px 8px', borderRadius: '10px' },
  libFooter:      { padding: '12px 24px', borderTop: '1px solid #f1f5f9', fontSize: '12px', color: '#94a3b8', textAlign: 'center' },
};
