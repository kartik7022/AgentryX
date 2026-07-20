// src/components/prompts/PromptContextBindingsEditor.tsx
// Only Datasource source type — Runtime param and Static value removed

import { useMemo, useState } from 'react';
import type { PromptContextBinding } from '../../types/api';

function makeEmptyBinding(): PromptContextBinding {
  return { name: '', source_type: 'datasource', datasource_id: null, semantic_entity: '', field_list_json: [], filter_json: {}, retrieval_policy_json: {}, max_records: 1, metadata_json: {} };
}

const NAME_RE = /^[a-z_][a-z0-9_]*$/;

interface Props {
  bindings:  PromptContextBinding[];
  onChange:  (next: PromptContextBinding[]) => void;
  disabled?: boolean;
}

export default function PromptContextBindingsEditor({ bindings, onChange, disabled = false }: Props) {

  const validation = useMemo(() => {
    const nameCount = new Map<string, number>();
    bindings.forEach(b => { const n = b.name.trim(); if (n) nameCount.set(n, (nameCount.get(n) || 0) + 1); });
    const duplicates = new Set<string>();
    nameCount.forEach((c, n) => { if (c > 1) duplicates.add(n); });
    return { duplicates };
  }, [bindings]);

  function handleAdd()   { onChange([...bindings, makeEmptyBinding()]); }
  function handleUpdate(i: number, patch: Partial<PromptContextBinding>) { onChange(bindings.map((b, idx) => idx === i ? { ...b, ...patch } : b)); }
  function handleDelete(i: number) { if (!window.confirm('Delete this binding?')) return; onChange(bindings.filter((_, idx) => idx !== i)); }

  return (
    <div style={S.wrap}>

      {/* Header */}
      <div style={S.header}>
        <div>
          <h3 style={S.heading}>Context bindings</h3>
          <p style={S.subheading}>
            Auto-fetch data from your database at run time. The orchestrator runs a SQL query
            and injects the result into your prompt blocks as <code style={S.code}>{`{{binding_name}}`}</code> variables.
          </p>
        </div>
        <button type="button" style={{ ...S.addBtn, opacity: disabled ? 0.5 : 1 }} onClick={handleAdd} disabled={disabled}>
          + Add binding
        </button>
      </div>

      {/* How it works banner */}
      <div style={S.howItWorks}>
        <span style={{ fontSize: 20 }}>🗄</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-success-text)', marginBottom: 3 }}>How datasource binding works</div>
          <div style={{ fontSize: 12, color: 'var(--color-success-text)', lineHeight: 1.6 }}>
            You define a table and a filter. When the prompt runs, the orchestrator automatically queries your database
            and makes the result available as <code style={S.code}>{`{{binding_name.field}}`}</code> in your blocks.
            <br />
            Example: caller sends only <code style={S.code}>loan_number</code> → system fetches customer name, amount, status automatically.
          </div>
        </div>
      </div>

      {/* Duplicate warning */}
      {validation.duplicates.size > 0 && (
        <div style={S.warningBanner}>
          <span>⚠️</span>
          <span>
            Duplicate names:&nbsp;
            {Array.from(validation.duplicates).map(n => <code key={n} style={S.code}>{n}</code>)}
            . Each binding must have a unique name.
          </span>
        </div>
      )}

      {/* Empty state */}
      {bindings.length === 0 && (
        <div style={S.empty}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🗄</div>
          <div style={S.emptyTitle}>No datasource bindings yet</div>
          <div style={S.emptyHint}>
            Add a binding to auto-fetch data from your database using just one input like a loan number or customer ID.
          </div>
          <button type="button" style={{ ...S.addBtn, marginTop: 16 }} onClick={handleAdd} disabled={disabled}>
            + Add first binding
          </button>
        </div>
      )}

      {/* Binding cards */}
      {bindings.length > 0 && (
        <div style={S.list}>
          {bindings.map((b, i) => (
            <BindingCard
              key={b.binding_id || `new-${i}`}
              binding={b} index={i} disabled={disabled}
              isDuplicate={!!b.name && validation.duplicates.has(b.name.trim())}
              onUpdate={patch => handleUpdate(i, patch)}
              onDelete={() => handleDelete(i)}
            />
          ))}
        </div>
      )}

      {/* Footer */}
      {bindings.length > 0 && (
        <div style={S.footer}>
          <span style={S.footerStat}>
            <strong>{bindings.length}</strong> binding{bindings.length !== 1 ? 's' : ''}
          </span>
          <span style={{ ...S.footerBadge, background: 'var(--color-success-bg)', color: 'var(--color-success-text)', border: '1px solid var(--color-success-border)' }}>
            🗄 {bindings.length} datasource
          </span>
          {validation.duplicates.size > 0 && (
            <span style={{ ...S.footerBadge, background: 'var(--color-error-bg)', color: 'var(--color-error-text)', border: '1px solid var(--color-error-border)' }}>
              ⚠️ {validation.duplicates.size} duplicate
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Binding Card ──────────────────────────────────────────────────────────────

function BindingCard({ binding, index, disabled, isDuplicate, onUpdate, onDelete }: {
  binding: PromptContextBinding; index: number; disabled: boolean;
  isDuplicate: boolean;
  onUpdate: (p: Partial<PromptContextBinding>) => void;
  onDelete: () => void;
}) {
  const isInvalidName = !!binding.name && !NAME_RE.test(binding.name);
  const hasError      = isDuplicate || isInvalidName;

  return (
    <div style={{ ...S.card, ...(hasError ? S.cardError : {}) }}>

      {/* Top bar */}
      <div style={S.cardTop}>
        <div style={S.seqBadge}>#{index + 1}</div>

        <div style={S.field}>
          <label style={S.fieldLabel}>Binding name *</label>
          <input
            type="text"
            value={binding.name}
            onChange={e => onUpdate({ name: e.target.value.trim() })}
            placeholder="loan_record"
            disabled={disabled}
            style={{ ...S.input, fontFamily: 'var(--font-family-mono)', ...(hasError ? { borderColor: 'var(--color-error-border)', background: 'var(--color-error-bg)' } : {}) }}
          />
          {isDuplicate    && <div style={S.errorHint}>⚠ Duplicate — names must be unique</div>}
          {isInvalidName && !isDuplicate && <div style={S.errorHint}>⚠ Use lowercase letters, digits and _ only</div>}
        </div>

        {binding.name && (
          <div style={S.useAsChip}>
            use as: <code style={{ fontFamily: 'var(--font-family-mono)' }}>{`{{${binding.name}}}`}</code>
          </div>
        )}

        <button type="button" style={S.deleteBtn} onClick={onDelete} disabled={disabled} title="Delete">🗑</button>
      </div>

      {/* Fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Table */}
        <div style={S.field}>
          <label style={S.fieldLabel}>Table / entity *</label>
          <input type="text" value={binding.semantic_entity || ''}
            onChange={e => onUpdate({ semantic_entity: e.target.value })}
            placeholder="loan_core.loans" disabled={disabled}
            style={{ ...S.input, fontFamily: 'var(--font-family-mono)' }} />
          <div style={S.help}>Schema-qualified table name e.g. loan_core.loans or crm.customers</div>
        </div>

        {/* Filter */}
        <JsonField
          label="Filter (WHERE clause)"
          helpText={`Maps column → value. Use {{var}} for runtime params.\nExample: { "loan_account_number": "{{loan_number}}" }`}
          value={binding.filter_json || {}}
          onChange={v => onUpdate({ filter_json: v as Record<string, unknown> })}
          disabled={disabled} kind="object"
        />

        {/* Field list */}
        <JsonField
          label="Field list (SELECT)"
          helpText={`Empty [] = SELECT *. Or list specific columns.\nExample: ["full_name", "email", "phone"]`}
          value={binding.field_list_json || []}
          onChange={v => onUpdate({ field_list_json: v as unknown[] })}
          disabled={disabled} kind="array"
        />
      </div>
    </div>
  );
}

// ── JSON field ────────────────────────────────────────────────────────────────

function JsonField({ label, helpText, value, onChange, disabled, kind }: {
  label: string; helpText: string;
  value: Record<string, unknown> | unknown[];
  onChange: (v: Record<string, unknown> | unknown[]) => void;
  disabled: boolean; kind: 'object' | 'array';
}) {
  const str = (() => {
    try {
      const isEmpty = kind === 'array'
        ? (Array.isArray(value) && value.length === 0)
        : (typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 0);
      return isEmpty ? (kind === 'array' ? '[]' : '{}') : JSON.stringify(value, null, 2);
    } catch { return kind === 'array' ? '[]' : '{}'; }
  })();

  const [text, setText] = useState(str);
  const [err,  setErr]  = useState<string | null>(null);

  function handleChange(next: string) {
    setText(next);
    if (!next.trim()) { setErr(null); onChange(kind === 'array' ? [] : {}); return; }
    try {
      const parsed = JSON.parse(next);
      const ok = kind === 'array' ? Array.isArray(parsed) : (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed));
      if (!ok) { setErr(`Expected a JSON ${kind}`); return; }
      setErr(null); onChange(parsed);
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <div style={S.field}>
      <label style={S.fieldLabel}>{label}</label>
      <textarea value={text} rows={3} spellCheck={false} disabled={disabled}
        style={{ ...S.textarea, fontFamily: 'var(--font-family-mono)', ...(err ? { borderColor: 'var(--color-error-border)', background: 'var(--color-error-bg)' } : {}) }}
        onChange={e => handleChange(e.target.value)} />
      {err ? <div style={S.errorHint}>⚠ {err}</div> : <div style={S.help}>{helpText}</div>}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  wrap:       { display: 'flex', flexDirection: 'column', gap: 16 },
  header:     { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 },
  heading:    { margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--color-text-strong)' },
  subheading: { margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 600, lineHeight: 1.55 },
  code:       { fontFamily: 'var(--font-family-mono)', fontSize: 11, background: 'var(--color-success-bg)', color: 'var(--color-success-text)', padding: '1px 5px', borderRadius: 4 },

  addBtn: { background: 'var(--color-primary-700)', border: '1px solid var(--color-primary-700)', color: 'var(--color-text-strong)', fontWeight: 600, fontSize: 13, padding: '9px 16px', borderRadius: 9, cursor: 'pointer', boxShadow: 'var(--shadow-sm)', fontFamily: 'inherit', flexShrink: 0 },

  howItWorks: { display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', borderRadius: 12, padding: '14px 16px' },

  warningBanner: { display: 'flex', gap: 8, alignItems: 'flex-start', background: 'var(--color-warning-bg)', border: '1px solid var(--color-warning-border)', color: 'var(--color-warning-text)', borderRadius: 10, padding: '10px 14px', fontSize: 13 },

  list:      { display: 'flex', flexDirection: 'column', gap: 12 },
  card:      { background: 'var(--color-bg-surface)', border: '1.5px solid var(--color-border-soft)', borderLeft: '4px solid var(--color-accent-700)', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 4px rgba(15, 23, 42, 0.04)' },
  cardError: { borderColor: 'var(--color-error-border)', background: 'var(--color-error-bg)' },

  cardTop:   { display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 14 },
  seqBadge:  { fontSize: 11, fontWeight: 700, color: 'var(--color-success-text)', background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', padding: '4px 10px', borderRadius: 6, flexShrink: 0, marginBottom: 2 },
  useAsChip: { fontSize: 11.5, color: 'var(--color-success-text)', background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', padding: '5px 10px', borderRadius: 6, whiteSpace: 'nowrap', marginBottom: 2 },
  deleteBtn: { width: 32, height: 32, border: '1.5px solid var(--color-error-border)', background: 'var(--color-error-bg)', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: 'var(--color-error-text)', flexShrink: 0, marginBottom: 2, marginLeft: 'auto' },

  field:       { display: 'flex', flexDirection: 'column', gap: 5 },
  fieldLabel:  { fontSize: 10.5, fontWeight: 600, color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase' },
  input:       { padding: '8px 11px', border: '1.5px solid var(--color-border-soft)', borderRadius: 8, fontSize: 13, outline: 'none', background: 'var(--color-bg-surface)', fontFamily: 'inherit' },
  textarea:    { width: '100%', padding: '8px 11px', border: '1.5px solid var(--color-border-soft)', borderRadius: 8, fontSize: 12.5, outline: 'none', background: 'var(--color-bg-surface)', fontFamily: 'inherit', resize: 'vertical', minHeight: 70, lineHeight: 1.55, boxSizing: 'border-box' },
  help:        { fontSize: 11, color: '#94A3B8', lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  errorHint:   { fontSize: 11, color: 'var(--color-error-text)', marginTop: 2 },
  fieldsGrid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },

  empty:     { background: 'var(--color-bg-surface)', border: '1.5px dashed var(--color-border-soft)', borderRadius: 14, padding: '44px 24px', textAlign: 'center' },
  emptyTitle:{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-strong)' },
  emptyHint: { fontSize: 13, color: 'var(--color-text-muted)', marginTop: 6, maxWidth: 420, marginInline: 'auto' },

  footer:      { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--color-bg-elevated)', borderRadius: 10, fontSize: 12.5, color: 'var(--color-text-muted)' },
  footerStat:  { display: 'flex', alignItems: 'center', gap: 4 },
  footerBadge: { fontSize: 11.5, fontWeight: 600, padding: '3px 10px', borderRadius: 999 },
};