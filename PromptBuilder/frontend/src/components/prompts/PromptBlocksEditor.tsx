// src/components/prompts/PromptBlocksEditor.tsx
import { useMemo, useRef, useEffect } from 'react';
import type { PromptBlock, PromptBlockType } from '../../types/api';

// ── Block type config ─────────────────────────────────────────────────────────

const BLOCK_TYPES: Array<{
  value:       PromptBlockType;
  label:       string;
  emoji:       string;
  bg:          string;
  color:       string;
  hint:        string;
  placeholder: string;
  showTitle:   boolean;
  titleHint:   string;
}> = [
  {
    value: 'system', label: 'System role', emoji: '🎭',
    bg: 'var(--color-primary-50)', color: 'var(--color-primary-800)',
    hint: 'Defines the AI\'s identity. Goes into the system message — highest priority.',
    placeholder: 'You are a senior banking compliance assistant. You generate accurate, legally sound loan NOC certificates based on provided loan data.',
    showTitle: false, titleHint: '',
  },
  {
    value: 'safety', label: 'Safety', emoji: '🛡',
    bg: 'var(--color-error-bg)', color: 'var(--color-error-text)',
    hint: 'Hard compliance rules the AI must never violate. Goes into system message.',
    placeholder: 'Never include Aadhaar or PAN numbers in plain text. Never fabricate loan details. If data is incomplete, flag it explicitly rather than guessing.',
    showTitle: false, titleHint: '',
  },
  {
    value: 'role', label: 'Role', emoji: '👤',
    bg: '#fce7f3', color: '#9d174d',
    hint: 'Sets the professional persona and domain expertise of the AI.',
    placeholder: 'You work at a regulated financial institution under RBI guidelines. You are thorough, precise and follow banking compliance standards strictly.',
    showTitle: false, titleHint: '',
  },
  {
    value: 'task', label: 'Task', emoji: '🎯',
    bg: 'var(--color-info-bg)', color: 'var(--color-info-text)',
    hint: 'The main instruction — what the AI must do. Use {{variable}} tokens here.',
    placeholder: 'Generate a Loan No Objection Certificate for the following:\n\n- Loan Number: {{loan_number}}\n- Customer Name: {{customer_name}}\n- Loan Amount: ₹{{loan_amount}}\n- Outstanding Amount: ₹{{outstanding_amount}}\n- Closure Date: {{closure_date}}\n- Bank: {{bank_name}}',
    showTitle: true, titleHint: 'e.g. Generate Loan NOC',
  },
  {
    value: 'instruction', label: 'Instruction', emoji: '📋',
    bg: 'var(--color-info-bg)', color: 'var(--color-info-text)',
    hint: 'Step-by-step guidance for complex multi-step tasks.',
    placeholder: 'Follow these steps:\n1. Verify the loan number format\n2. Check that outstanding amount is zero\n3. Generate the NOC with all required fields\n4. Add the disclaimer at the end',
    showTitle: true, titleHint: 'e.g. Processing steps',
  },
  {
    value: 'business_rule', label: 'Business rule', emoji: '⚖️',
    bg: 'var(--color-warning-bg)', color: 'var(--color-warning-text)',
    hint: 'Domain-specific rules and policies the AI must apply when making decisions.',
    placeholder: 'Apply these rules:\n1. NOC can only be issued if outstanding_amount is 0\n2. Closure date must not be in the future\n3. Loan amount must match bank records\n4. If any rule is violated, return status = "ineligible" with reason',
    showTitle: true, titleHint: 'e.g. NOC issuance rules',
  },
  {
    value: 'context', label: 'Context', emoji: '📦',
    bg: 'var(--color-primary-50)', color: 'var(--color-primary-800)',
    hint: 'Reference data or surrounding information injected from context bindings.',
    placeholder: 'The following customer data has been fetched from the banking system:\n{{customer_record}}\n\nUse this data to validate the inputs provided.',
    showTitle: true, titleHint: 'e.g. Customer record',
  },
  {
    value: 'retrieval', label: 'Retrieval', emoji: '🔍',
    bg: 'var(--color-accent-50)', color: 'var(--color-accent-700)',
    hint: 'Documents or policy chunks fetched from a knowledge base or vector store.',
    placeholder: 'Relevant policy sections retrieved:\n{{retrieved_chunks}}\n\nApply the above policy when generating the response.',
    showTitle: true, titleHint: 'e.g. Policy documents',
  },
  {
    value: 'tool_call', label: 'Tool call', emoji: '🛠',
    bg: 'var(--color-accent-100)', color: 'var(--color-accent-700)',
    hint: 'Defines a tool or API the AI may invoke during execution.',
    placeholder: 'You may call the following tool to verify loan status:\ntool: verify_loan_status\nparams: { loan_number: string }\nReturns: { status: "active" | "closed", outstanding: number }',
    showTitle: true, titleHint: 'e.g. Loan status verifier',
  },
  {
    value: 'output_schema', label: 'Output schema', emoji: '📤',
    bg: 'var(--color-success-bg)', color: 'var(--color-success-text)',
    hint: 'Tells the AI to respond only in this JSON format. Enforced by the orchestrator.',
    placeholder: 'Respond strictly with this JSON — no prose outside it:\n{\n  "eligible": "yes | no",\n  "noc_text": "Full NOC certificate text here",\n  "reason": "Why eligible or not",\n  "flags": ["any issues found"]\n}',
    showTitle: false, titleHint: '',
  },
  {
    value: 'example', label: 'Example', emoji: '💡',
    bg: 'var(--color-warning-bg)', color: 'var(--color-warning-text)',
    hint: 'A few-shot example showing the AI what a good input/output looks like.',
    placeholder: 'Example input:\n- loan_number: LN-99001\n- outstanding_amount: 0\n\nExpected output:\n{\n  "eligible": "yes",\n  "noc_text": "This is to certify that loan LN-99001 has been fully repaid..."\n}',
    showTitle: true, titleHint: 'e.g. Approved NOC example',
  },
  {
    value: 'fallback', label: 'Fallback', emoji: '🪂',
    bg: 'var(--color-bg-muted)', color: 'var(--color-text-base)',
    hint: 'What the AI should do when required data is missing or the task cannot be completed.',
    placeholder: 'If any required field is missing or the loan cannot be verified, return:\n{\n  "eligible": "no",\n  "noc_text": null,\n  "reason": "Cannot generate NOC — missing or invalid data",\n  "flags": ["list missing fields here"]\n}',
    showTitle: false, titleHint: '',
  },
];

const TYPE_META = Object.fromEntries(BLOCK_TYPES.map(t => [t.value, t]));
const VAR_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

function detectVariables(content: string): string[] {
  if (!content) return [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(VAR_RE.source, 'g');
  while ((m = re.exec(content)) !== null) seen.add(m[1]);
  return Array.from(seen);
}

function makeEmptyBlock(sequence_no: number): PromptBlock {
  return { block_type: 'task', sequence_no, title: '', content: '', is_required: false, variables_json: {}, metadata_json: {} };
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  blocks:    PromptBlock[];
  onChange:  (next: PromptBlock[]) => void;
  disabled?: boolean;
}

export default function PromptBlocksEditor({ blocks, onChange, disabled = false }: Props) {

  function withFreshSequence(arr: PromptBlock[]): PromptBlock[] {
    return arr.map((b, i) => ({ ...b, sequence_no: i }));
  }

  function handleAdd() {
    onChange(withFreshSequence([...blocks, makeEmptyBlock(blocks.length)]));
  }
  function handleUpdate(index: number, patch: Partial<PromptBlock>) {
    onChange(blocks.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }
  function handleDelete(index: number) {
    if (!window.confirm('Delete this block?')) return;
    onChange(withFreshSequence(blocks.filter((_, i) => i !== index)));
  }
  function handleMove(index: number, dir: -1 | 1) {
    const t = index + dir;
    if (t < 0 || t >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[t]] = [next[t], next[index]];
    onChange(withFreshSequence(next));
  }

  const stats = useMemo(() => {
    const allVars = new Set<string>();
    blocks.forEach(b => detectVariables(b.content || '').forEach(v => allVars.add(v)));
    return { count: blocks.length, variables: Array.from(allVars) };
  }, [blocks]);

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <div>
          <h3 style={S.heading}>Prompt blocks</h3>
          <p style={S.subheading}>Compose the prompt from typed blocks. Order matters — blocks are sent to the AI in the order shown.</p>
        </div>
        <button type="button" style={{ ...S.addBtn, opacity: disabled ? 0.5 : 1 }} onClick={handleAdd} disabled={disabled}>
          + Add block
        </button>
      </div>

      {blocks.length === 0 && (
        <div style={S.empty}>
          <div style={{ fontSize: 30, marginBottom: 10 }}>🧱</div>
          <div style={S.emptyTitle}>No blocks yet</div>
          <div style={S.emptyHint}>Start with a System role block, then add a Task block.</div>
          <button type="button" style={{ ...S.addBtn, marginTop: 16 }} onClick={handleAdd} disabled={disabled}>
            + Add first block
          </button>
        </div>
      )}

      {blocks.length > 0 && (
        <div style={S.list}>
          {blocks.map((b, i) => (
            <BlockCard
              key={b.block_id || `new-${i}`}
              block={b} index={i} total={blocks.length} disabled={disabled}
              onUpdate={(patch) => handleUpdate(i, patch)}
              onDelete={() => handleDelete(i)}
              onMoveUp={() => handleMove(i, -1)}
              onMoveDown={() => handleMove(i, 1)}
            />
          ))}
        </div>
      )}

      {blocks.length > 0 && (
        <div style={S.footer}>
          <span style={S.footerStat}><strong>{stats.count}</strong> block{stats.count === 1 ? '' : 's'}</span>
          {stats.variables.length > 0 && (
            <span style={S.footerStat}>
              Variables:&nbsp;
              {stats.variables.map(v => <span key={v} style={S.varChip}>{`{{${v}}}`}</span>)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Block card ────────────────────────────────────────────────────────────────

function BlockCard({ block, index, total, disabled, onUpdate, onDelete, onMoveUp, onMoveDown }: {
  block: PromptBlock; index: number; total: number; disabled: boolean;
  onUpdate: (p: Partial<PromptBlock>) => void;
  onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void;
}) {
  const meta = TYPE_META[block.block_type] || TYPE_META['task'];
  const variables = useMemo(() => detectVariables(block.content || ''), [block.content]);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 500)}px`;
  }, [block.content]);

  return (
    <div style={{ ...S.card, borderLeftColor: meta.color }}>

      {/* ── Top bar ── */}
      <div style={S.cardTop}>
        <div style={S.cardTopLeft}>
          <span style={S.seqBadge}>#{index + 1}</span>
          <select
            value={block.block_type}
            onChange={(e) => onUpdate({ block_type: e.target.value as PromptBlockType })}
            disabled={disabled}
            style={{ ...S.typeSelect, color: meta.color, background: meta.bg }}
          >
            {BLOCK_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>
            ))}
          </select>
        </div>

        <div style={S.cardTopRight}>
          <button type="button" style={{ ...S.iconBtn, opacity: index === 0 ? 0.3 : 1 }}
            disabled={disabled || index === 0} onClick={onMoveUp} title="Move up">↑</button>
          <button type="button" style={{ ...S.iconBtn, opacity: index === total - 1 ? 0.3 : 1 }}
            disabled={disabled || index === total - 1} onClick={onMoveDown} title="Move down">↓</button>
          <button type="button" style={{ ...S.iconBtn, color: 'var(--color-error-text)', borderColor: 'var(--color-error-border)' }}
            disabled={disabled} onClick={onDelete} title="Delete">🗑</button>
        </div>
      </div>

      {/* ── Hint bar — changes per block type ── */}
      <div style={{ ...S.hintBar, background: meta.bg, color: meta.color }}>
        <span style={{ fontSize: 14 }}>{meta.emoji}</span>
        <span>{meta.hint}</span>
      </div>

      {/* ── Title — only for blocks that need it ── */}
      {meta.showTitle && (
        <div style={S.field}>
          <label style={S.fieldLabel}>Title</label>
          <input
            type="text"
            value={block.title || ''}
            onChange={(e) => onUpdate({ title: e.target.value })}
            placeholder={meta.titleHint}
            disabled={disabled}
            style={S.titleInput}
          />
        </div>
      )}

      {/* ── Content ── */}
      <div style={S.field}>
        <label style={S.fieldLabel}>Content</label>
        <textarea
          ref={textareaRef}
          value={block.content || ''}
          onChange={(e) => onUpdate({ content: e.target.value })}
          placeholder={meta.placeholder}
          disabled={disabled}
          rows={5}
          style={S.contentTextarea}
        />
      </div>

      {/* ── Variables detected ── */}
      {variables.length > 0 && (
        <div style={S.varStrip}>
          <span style={S.varStripLabel}>Variables in this block:</span>
          {variables.map(v => <span key={v} style={S.varChip}>{`{{${v}}}`}</span>)}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 16 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 },
  heading:    { margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--color-text-strong)' },
  subheading: { margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 560 },
  addBtn: {
    background: 'var(--color-primary-700)',
    border: '1px solid var(--color-primary-700)', color: 'var(--color-text-strong)', fontWeight: 600, fontSize: 13,
    padding: '9px 16px', borderRadius: 9, cursor: 'pointer',
    boxShadow: 'var(--shadow-sm)', fontFamily: 'inherit', flexShrink: 0,
  },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  card: {
    background: 'var(--color-bg-surface)', border: '1.5px solid var(--color-border-soft)',
    borderLeft: '4px solid var(--color-primary-700)',
    borderRadius: 12, overflow: 'hidden',
    boxShadow: '0 1px 4px rgba(15, 23, 42, 0.04)',
  },
  cardTop: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 14px', borderBottom: '1px solid var(--color-bg-muted)',
  },
  cardTopLeft:  { display: 'flex', alignItems: 'center', gap: 10 },
  cardTopRight: { display: 'flex', alignItems: 'center', gap: 4 },
  seqBadge: {
    fontSize: 11, fontWeight: 700, color: 'var(--color-primary-700)',
    background: 'var(--color-primary-50)', padding: '3px 9px', borderRadius: 6, flexShrink: 0,
  },
  typeSelect: {
    border: '1.5px solid transparent', borderRadius: 8,
    padding: '6px 10px', fontSize: 12.5, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit', outline: 'none',
  },
  iconBtn: {
    width: 30, height: 30, border: '1.5px solid var(--color-border-soft)',
    background: 'var(--color-bg-surface)', borderRadius: 7, fontSize: 12,
    cursor: 'pointer', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  hintBar: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 14px', fontSize: 12, fontWeight: 500,
    borderBottom: '1px solid rgba(0,0,0,0.05)',
  },
  field: { display: 'flex', flexDirection: 'column', gap: 5, padding: '10px 14px 0' },
  fieldLabel: {
    fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-soft)',
    letterSpacing: '0.08em', textTransform: 'uppercase',
  },
  titleInput: {
    padding: '8px 11px', border: '1.5px solid var(--color-border-soft)',
    borderRadius: 8, fontSize: 13.5, outline: 'none',
    background: 'var(--color-bg-surface)', fontFamily: 'inherit',
  },
  contentTextarea: {
    padding: '10px 12px', border: '1.5px solid var(--color-border-soft)',
    borderRadius: 8, fontSize: 13, outline: 'none',
    background: 'var(--color-bg-surface)', fontFamily: 'var(--font-family-mono)',
    lineHeight: 1.6, resize: 'vertical', minHeight: 100, maxHeight: 500,
  },
  varStrip: {
    display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
    margin: '10px 14px 12px', padding: '8px 10px',
    background: 'var(--color-bg-canvas)', borderRadius: 8, border: '1px dashed var(--color-border-soft)',
  },
  varStripLabel: { fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)' },
  varChip: {
    fontSize: 11, fontFamily: 'var(--font-family-mono)',
    background: 'var(--color-primary-50)', color: 'var(--color-primary-800)',
    padding: '2px 8px', borderRadius: 999, fontWeight: 600,
  },
  empty: {
    background: 'var(--color-bg-surface)', border: '1.5px dashed var(--color-border-soft)',
    borderRadius: 14, padding: '44px 24px', textAlign: 'center',
  },
  emptyTitle: { fontSize: 15, fontWeight: 600, color: 'var(--color-text-strong)' },
  emptyHint:  { fontSize: 13, color: 'var(--color-text-muted)', marginTop: 6 },
  footer: {
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16,
    padding: '10px 14px', background: 'var(--color-bg-elevated)', borderRadius: 10,
    fontSize: 12.5, color: 'var(--color-text-muted)',
  },
  footerStat: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
};