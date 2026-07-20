// src/components/editor/EditorTopBar.tsx
// Added: "Edit Template" button when template is published
// Calls onMakeDraft() which resets status to draft so editing is possible again

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Template } from '../../types/api';

interface Props {
  template: Template | null;
  isSaving: boolean;
  isDirty: boolean;
  onSave: () => void;
  onPublish: () => void;
  onMakeDraft: () => void;
  onNameChange: (name: string) => void;
  onTargetChange: (target: import('../../types/api').OutputTarget) => void; // ✅ add this
  onGenerate: () => void;
  onViewVersions: () => void;
  onViewTests: () => void;
  onAITools: () => void;
}

export default function EditorTopBar({
  template,
  isSaving,
  isDirty,
  onSave,
  onPublish,
  onMakeDraft,
  onNameChange,
  onGenerate,
  onViewVersions,
  onViewTests,
  onAITools,
}: Props) {
  const navigate = useNavigate();
  const [editingName, setEditingName] = useState(false);

  const isPublished = template?.status === 'published';

  return (
    <div style={styles.wrapper}>

      {/* ── Row 1 ─────────────────────────────────────────────────── */}
      <div style={styles.row1}>

        {/* Left — Back + Name */}
        <div style={styles.left}>
          <button style={styles.backBtn} onClick={() => navigate('/templates')}>
            ← Back
          </button>
          <div style={styles.divider} />
          {editingName ? (
            <input
              autoFocus
              style={styles.nameInput}
              value={template?.name ?? ''}
              onChange={(e) => onNameChange(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => { if (e.key === 'Enter') setEditingName(false); }}
            />
          ) : (
            <span
              style={styles.nameDisplay}
              onClick={() => template && !isPublished && setEditingName(true)}
              title={isPublished ? 'Revert to draft to rename' : 'Click to rename'}
            >
              {template?.name ?? 'Loading...'}
              {template && !isPublished && <span style={styles.editHint}>✎</span>}
            </span>
          )}
          {isDirty && <span style={styles.dirtyDot}>●</span>}
        </div>

        {/* Right — all action buttons */}
        <div style={styles.right}>

          {/* Status pill */}
          {template && (
            <span style={{
              ...styles.statusPill,
              backgroundColor: isPublished ? '#dcfce7' : '#fef9c3',
              color: isPublished ? '#166534' : '#854d0e',
            }}>
              {template.status}
            </span>
          )}

          {/* If PUBLISHED: show "Edit Template" button instead of Save */}
          {isPublished ? (
            <button
              style={styles.editDraftBtn}
              onClick={onMakeDraft}
              title="Revert to draft so you can make changes"
            >
              ✎ Edit Template
            </button>
          ) : (
            /* If DRAFT: show Save button */
            <button
              style={{
                ...styles.saveBtn,
                opacity: isSaving || !isDirty ? 0.5 : 1,
                cursor: isSaving || !isDirty ? 'not-allowed' : 'pointer',
              }}
              onClick={onSave}
              disabled={isSaving || !isDirty}
            >
              {isSaving ? 'Saving...' : 'Save draft'}
            </button>
          )}

          {/* AI Tools */}
          <button style={styles.aiBtn} onClick={onAITools} title="AI Tools">
            ✦ AI
          </button>

          {/* Tests */}
          <button style={styles.toolBtn} onClick={onViewTests} title="Template Tests">
            🧪 Tests
          </button>

          {/* Versions */}
          <button style={styles.toolBtn} onClick={onViewVersions} title="Version History">
            🕒 Versions
          </button>

          {/* Generate */}
          <button style={styles.generateBtn} onClick={onGenerate}>
            ⚡ Generate
          </button>

          {/* Publish */}
          <button
            style={{
              ...styles.publishBtn,
              opacity: isPublished ? 0.5 : 1,
              cursor: isPublished ? 'not-allowed' : 'pointer',
            }}
            onClick={onPublish}
            disabled={isSaving || isPublished}
            title={isPublished ? 'Click "Edit Template" first to make changes, then publish again' : 'Publish this template'}
          >
            Publish ↑
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper:      { backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', flexShrink: 0, position: 'sticky', top: 0, zIndex: 10 },
  row1:         { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', height: '50px', gap: '8px' },
  left:         { display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, overflow: 'hidden' },
  right:        { display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 },
  backBtn:      { background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#64748b', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 },
  divider:      { width: '1px', height: '18px', backgroundColor: '#e2e8f0', flexShrink: 0 },
  nameDisplay:  { fontSize: '14px', fontWeight: 600, color: '#0f172a', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '3px 6px', borderRadius: '5px' },
  editHint:     { fontSize: '12px', color: '#94a3b8', flexShrink: 0 },
  nameInput:    { fontSize: '14px', fontWeight: 600, color: '#0f172a', border: '1.5px solid var(--color-primary-200)', borderRadius: '6px', padding: '3px 9px', outline: 'none', minWidth: '160px', maxWidth: '260px', backgroundColor: 'var(--color-primary-50)' },
  dirtyDot:     { color: '#f59e0b', fontSize: '8px', flexShrink: 0 },
  statusPill:   { fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '20px', textTransform: 'capitalize', whiteSpace: 'nowrap', flexShrink: 0 },
  editDraftBtn: { backgroundColor: '#f59e0b', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  saveBtn:      { background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '5px 11px', fontSize: '12px', fontWeight: 500, color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' },
  aiBtn:        { background: 'var(--color-primary-800)', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 11px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  toolBtn:      { background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', fontWeight: 500, color: '#64748b', cursor: 'pointer', whiteSpace: 'nowrap' },
  generateBtn:  { backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 13px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  publishBtn:   { background: 'var(--color-primary-800)', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 13px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
};
