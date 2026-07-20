// src/components/editor/blocks/SectionBlock.tsx

interface Props {
  content: string;
  onChange: (content: string) => void;
  isSelected: boolean;
  onSelect: () => void;
}

export default function SectionBlock({ content, onChange, isSelected, onSelect }: Props) {

  return (
    <div
      style={{
        ...styles.wrapper,
        outline: isSelected ? '2px solid var(--color-primary-200)' : '2px solid transparent',
        borderRadius: '6px',
        padding: '8px',
        backgroundColor: isSelected ? '#faf5ff' : 'transparent',
      }}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      {/* Section preview — how it looks in the document */}
      <div style={styles.sectionPreview}>
        <div style={styles.dividerLeft} />
        <input
          style={styles.titleInput}
          value={content}
          onChange={(e) => { e.stopPropagation(); onChange(e.target.value); }}
          onClick={(e) => e.stopPropagation()}
          placeholder="Section Title"
          spellCheck={false}
        />
        <div style={styles.dividerRight} />
      </div>

      {/* Hint */}
      <div style={styles.hint}>
        {isSelected
          ? '✎ Click to edit section title — acts as a heading divider in the document'
          : 'Section heading'}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper:        { display: 'flex', flexDirection: 'column', gap: '6px', cursor: 'pointer' },
  sectionPreview: { display: 'flex', alignItems: 'center', gap: '12px', padding: '4px 0' },
  dividerLeft:    { height: '2px', width: '24px', backgroundColor: 'var(--color-primary-700)', borderRadius: '2px', flexShrink: 0 },
  dividerRight:   { flex: 1, height: '2px', backgroundColor: '#e2e8f0', borderRadius: '2px' },
  titleInput:     { border: 'none', outline: 'none', fontSize: '14px', fontWeight: 700, color: '#4c1d95', backgroundColor: 'transparent', letterSpacing: '0.05em', textTransform: 'uppercase', minWidth: '100px', cursor: 'text' },
  hint:           { fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', textAlign: 'right' as const },
};
