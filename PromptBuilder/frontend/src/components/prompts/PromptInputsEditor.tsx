// src/components/prompts/PromptInputsEditor.tsx
import { useMemo } from 'react';
import type { PromptInput, PromptInputType } from '../../types/api';

const INPUT_TYPES: Array<{ value: PromptInputType; label: string; emoji: string }> = [
  { value: 'string',   label: 'String',    emoji: '📝' },
  { value: 'number',   label: 'Number',    emoji: '🔢' },
  { value: 'boolean',  label: 'Boolean',   emoji: '✅' },
  { value: 'date',     label: 'Date',      emoji: '📅' },
  { value: 'datetime', label: 'Date+Time', emoji: '🕐' },
  { value: 'json',     label: 'JSON',      emoji: '📋' },
  { value: 'array',    label: 'Array',     emoji: '📚' },
];

const NAME_RE = /^[a-z_][a-z0-9_]*$/;

function makeEmptyInput(): PromptInput {
  return {
    name: '',
    label: '',
    type: 'string',
    required: true,
    validation_json: {},
    description: '',
    sensitive_classification: 'internal',
  };
}

interface Props {
  inputs:    PromptInput[];
  onChange:  (next: PromptInput[]) => void;
  disabled?: boolean;
}

export default function PromptInputsEditor({ inputs, onChange, disabled = false }: Props) {

  const validation = useMemo(() => {
    const nameCount = new Map<string, number>();
    inputs.forEach((i) => {
      const n = i.name.trim();
      if (n) nameCount.set(n, (nameCount.get(n) || 0) + 1);
    });
    const duplicates = new Set<string>();
    nameCount.forEach((count, name) => { if (count > 1) duplicates.add(name); });
    return { duplicates };
  }, [inputs]);

  function handleAdd() { onChange([...inputs, makeEmptyInput()]); }
  function handleUpdate(index: number, patch: Partial<PromptInput>) {
    onChange(inputs.map((inp, i) => (i === index ? { ...inp, ...patch } : inp)));
  }
  function handleDelete(index: number) {
    if (!window.confirm('Delete this input?')) return;
    onChange(inputs.filter((_, i) => i !== index));
  }

  return (
    <div style={S.wrap}>

      {/* Header */}
      <div style={S.header}>
        <div>
          <h3 style={S.heading}>Runtime inputs</h3>
          <p style={S.subheading}>
            Define the parameters callers must supply when running this prompt.
            Use these names as <code style={S.inlineCode}>{`{{variable}}`}</code> tokens inside your blocks.
          </p>
        </div>
        <button type="button" style={{ ...S.addBtn, opacity: disabled ? 0.5 : 1 }} onClick={handleAdd} disabled={disabled}>
          + Add input
        </button>
      </div>

      {/* Duplicate warning */}
      {validation.duplicates.size > 0 && (
        <div style={S.warningBanner}>
          ⚠️ Duplicate input names:{' '}
          {Array.from(validation.duplicates).map((n) => (
            <code key={n} style={S.inlineCode}>{n}</code>
          ))}
          . Each input must have a unique name.
        </div>
      )}

      {/* Empty state */}
      {inputs.length === 0 && (
        <div style={S.empty}>
          <div style={{ fontSize: 30, marginBottom: 10 }}>🔡</div>
          <div style={S.emptyTitle}>No inputs defined yet</div>
          <div style={S.emptyHint}>Add inputs so callers know what runtime parameters to supply.</div>
          <button type="button" style={{ ...S.addBtn, marginTop: 16 }} onClick={handleAdd} disabled={disabled}>
            + Add first input
          </button>
        </div>
      )}

      {/* Input cards */}
      {inputs.length > 0 && (
        <div style={S.list}>
          {inputs.map((inp, i) => (
            <InputCard
              key={inp.input_id || `new-${i}`}
              input={inp}
              index={i}
              disabled={disabled}
              isDuplicate={!!inp.name && validation.duplicates.has(inp.name.trim())}
              isInvalidName={!!inp.name && !NAME_RE.test(inp.name)}
              onUpdate={(patch) => handleUpdate(i, patch)}
              onDelete={() => handleDelete(i)}
            />
          ))}
        </div>
      )}

      {/* Footer */}
      {inputs.length > 0 && (
        <div style={S.footer}>
          <span style={S.footerStat}><strong>{inputs.length}</strong> input{inputs.length === 1 ? '' : 's'}</span>
          <span style={S.footerStat}><strong>{inputs.filter(i => i.required).length}</strong> required</span>
          <span style={S.footerStat}><strong>{inputs.filter(i => !i.required).length}</strong> optional</span>
        </div>
      )}
    </div>
  );
}

// ── Input Card ────────────────────────────────────────────────────────────────

function InputCard({
  input, index, disabled, isDuplicate, isInvalidName, onUpdate, onDelete,
}: {
  input:         PromptInput;
  index:         number;
  disabled:      boolean;
  isDuplicate:   boolean;
  isInvalidName: boolean;
  onUpdate:      (patch: Partial<PromptInput>) => void;
  onDelete:      () => void;
}) {
  const hasError = isDuplicate || isInvalidName;

  return (
    <div style={{ ...S.card, ...(hasError ? S.cardError : {}) }}>

      {/* Top row: seq + name + label + type + delete */}
      <div style={S.cardHeader}>
        <div style={S.seqBadge}>#{index + 1}</div>

        <div style={S.fieldsRow}>
          {/* Name */}
          <div style={S.field}>
            <label style={S.fieldLabel}>Name *</label>
            <input
              type="text"
              value={input.name}
              onChange={(e) => onUpdate({ name: e.target.value.trim() })}
              placeholder="loan_number"
              disabled={disabled}
              style={{
                ...S.input,
                fontFamily: 'var(--font-family-mono)',
                ...(hasError ? { borderColor: 'var(--color-error-border)', background: 'var(--color-error-bg)' } : {}),
              }}
            />
            {isDuplicate   && <div style={S.errorHint}>Duplicate name — must be unique</div>}
            {isInvalidName && !isDuplicate && <div style={S.errorHint}>Lowercase letters, digits and _ only</div>}
          </div>

          {/* Label */}
          <div style={S.field}>
            <label style={S.fieldLabel}>Label</label>
            <input
              type="text"
              value={input.label || ''}
              onChange={(e) => onUpdate({ label: e.target.value })}
              placeholder="Loan number"
              disabled={disabled}
              style={S.input}
            />
          </div>

          {/* Type */}
          <div style={S.field}>
            <label style={S.fieldLabel}>Type</label>
            <select
              value={input.type}
              onChange={(e) => onUpdate({ type: e.target.value as PromptInputType })}
              disabled={disabled}
              style={S.select}
            >
              {INPUT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Delete */}
        <button
          type="button"
          style={S.deleteBtn}
          onClick={onDelete}
          disabled={disabled}
          title="Delete input"
        >
          🗑
        </button>
      </div>

      {/* Bottom row: required toggle + description */}
      <div style={S.bottomRow}>
        <label style={S.requiredLabel}>
          <input
            type="checkbox"
            checked={!!input.required}
            onChange={(e) => onUpdate({ required: e.target.checked })}
            disabled={disabled}
            style={{ marginRight: 6, accentColor: 'var(--color-primary-700)' }}
          />
          Required
        </label>

        <div style={{ flex: 1 }}>
          <label style={S.fieldLabel}>Description</label>
          <input
            type="text"
            value={input.description || ''}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder="Brief helper text for callers..."
            disabled={disabled}
            style={{ ...S.input, width: '100%' }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 16 },

  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 },
  heading:    { margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--color-text-strong)' },
  subheading: { margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.55 },
  inlineCode: {
    fontFamily: 'var(--font-family-mono)',
    fontSize: 11.5, background: 'var(--color-bg-muted)', color: 'var(--color-primary-800)',
    padding: '1px 6px', borderRadius: 4,
  },

  addBtn: {
    background: 'var(--color-primary-700)',
    border: '1px solid var(--color-primary-700)', color: 'var(--color-text-strong)', fontWeight: 600, fontSize: 13,
    padding: '9px 16px', borderRadius: 9, cursor: 'pointer',
    boxShadow: 'var(--shadow-sm)', fontFamily: 'inherit', flexShrink: 0,
  },

  warningBanner: {
    display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
    background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)',
    color: 'var(--color-warning-text)', borderRadius: 10, padding: '10px 14px', fontSize: 13,
  },

  list: { display: 'flex', flexDirection: 'column', gap: 10 },

  card: {
    background: 'var(--color-bg-surface)', border: '1.5px solid var(--color-border-soft)',
    borderRadius: 14, padding: '14px 16px',
    boxShadow: '0 1px 4px rgba(15, 23, 42, 0.04)',
    transition: 'border-color 0.15s',
  },
  cardError: { borderColor: 'var(--color-error-border)', background: 'var(--color-error-bg)' },

  cardHeader: { display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 12 },

  seqBadge: {
    fontSize: 11, fontWeight: 700, color: 'var(--color-primary-700)',
    background: 'var(--color-primary-50)', padding: '4px 10px', borderRadius: 6,
    flexShrink: 0, marginBottom: 2,
  },

  fieldsRow: {
    flex: 1, display: 'grid',
    gridTemplateColumns: '1.2fr 1.2fr 0.8fr',
    gap: 10,
  },

  field:      { display: 'flex', flexDirection: 'column', gap: 5 },
  fieldLabel: {
    fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-soft)',
    letterSpacing: '0.08em', textTransform: 'uppercase',
  },
  input: {
    padding: '8px 11px', border: '1.5px solid var(--color-border-soft)',
    borderRadius: 8, fontSize: 13, outline: 'none',
    background: 'var(--color-bg-surface)', fontFamily: 'inherit',
    transition: 'border-color 0.15s',
  },
  select: {
    padding: '8px 11px', border: '1.5px solid var(--color-border-soft)',
    borderRadius: 8, fontSize: 13, outline: 'none',
    background: 'var(--color-bg-surface)', cursor: 'pointer', fontFamily: 'inherit',
  },
  errorHint: { fontSize: 11, color: 'var(--color-error-text)', marginTop: 2 },

  deleteBtn: {
    width: 32, height: 32, border: '1.5px solid var(--color-error-border)',
    background: 'var(--color-bg-surface)', borderRadius: 8, fontSize: 13,
    cursor: 'pointer', color: 'var(--color-error-text)', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },

  bottomRow: {
    display: 'flex', alignItems: 'flex-end', gap: 16,
    paddingTop: 10, borderTop: '1px solid var(--color-bg-muted)',
  },
  requiredLabel: {
    display: 'inline-flex', alignItems: 'center',
    fontSize: 13, fontWeight: 500, color: 'var(--color-text-base)',
    cursor: 'pointer', userSelect: 'none', flexShrink: 0, paddingBottom: 8,
  },

  empty: {
    background: 'var(--color-bg-surface)', border: '1.5px dashed var(--color-border-soft)',
    borderRadius: 14, padding: '44px 24px', textAlign: 'center',
  },
  emptyTitle: { fontSize: 15, fontWeight: 600, color: 'var(--color-text-strong)' },
  emptyHint:  { fontSize: 13, color: 'var(--color-text-muted)', marginTop: 6 },

  footer: {
    display: 'flex', gap: 20, padding: '10px 14px',
    background: 'var(--color-bg-elevated)', borderRadius: 10,
    fontSize: 12.5, color: 'var(--color-text-muted)',
  },
  footerStat: { display: 'flex', alignItems: 'center', gap: 4 },
};