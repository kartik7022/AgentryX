// src/components/prompts/PromptOutputSchemaEditor.tsx
//
// PB-019 — Prompt Output Schema Editor
//
// Defines the JSON Schema the AI's response must match. The orchestrator
// validates output against this schema after every prompt run, so external
// systems can trust the shape and types of returned data.
//
// UI:
//   - Big JSON textarea with monospace font + line numbers
//   - Format JSON button (pretty-prints)
//   - Validate JSON button (parses + shows error or success)
//   - Live parse-error indicator while typing
//   - Quick templates dropdown for common shapes (object, decision, list)
//   - Schema preview chips showing detected required fields + types

import { useState, useEffect, useMemo, useRef } from 'react';

// ============================================================================
// Quick templates
// ============================================================================

const TEMPLATES: Array<{ key: string; label: string; emoji: string; schema: object }> = [
  {
    key: 'empty',
    label: 'Empty schema',
    emoji: '⚪',
    schema: {},
  },
  {
    key: 'decision',
    label: 'Yes/No decision',
    emoji: '⚖️',
    schema: {
      type: 'object',
      required: ['eligible', 'reason'],
      properties: {
        eligible: { type: 'boolean', description: 'True if criteria met' },
        reason:   { type: 'string',  description: 'Plain-English explanation' },
      },
    },
  },
  {
    key: 'classification',
    label: 'Classification',
    emoji: '🏷',
    schema: {
      type: 'object',
      required: ['category', 'confidence'],
      properties: {
        category:   { type: 'string', enum: ['low', 'medium', 'high'] },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        reasoning:  { type: 'string' },
      },
    },
  },
  {
    key: 'extraction',
    label: 'Field extraction',
    emoji: '📋',
    schema: {
      type: 'object',
      required: ['fields'],
      properties: {
        fields: {
          type: 'object',
          properties: {
            name:    { type: 'string' },
            email:   { type: 'string' },
            amount:  { type: 'number' },
            date:    { type: 'string', format: 'date' },
          },
        },
        confidence: { type: 'number' },
      },
    },
  },
  {
    key: 'list',
    label: 'List of items',
    emoji: '📚',
    schema: {
      type: 'object',
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['title'],
            properties: {
              title:       { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
      },
    },
  },
];


// ============================================================================
// Component
// ============================================================================

interface Props {
  value:    Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
}

export default function PromptOutputSchemaEditor({ value, onChange, disabled = false }: Props) {

  // Local "draft" state for the textarea — only push valid JSON to parent
  const [text, setText] = useState<string>(() =>
    Object.keys(value || {}).length === 0
      ? ''
      : JSON.stringify(value, null, 2)
  );
  const [parseError,   setParseError]   = useState<string | null>(null);
  const [validateMsg,  setValidateMsg]  = useState<{ type: 'ok' | 'error'; message: string } | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // ─── Sync from parent ──────────────────────────────────────────────────
  // Only re-sync from parent when the parent value REALLY changes (e.g. fresh
  // load), not when the user is typing.
  useEffect(() => {
    const fromParent = Object.keys(value || {}).length === 0
      ? ''
      : JSON.stringify(value, null, 2);
    // Don't clobber the user's typing if the displayed text already matches
    // the canonical form of the parent value.
    if (fromParent !== text) {
      try {
        const parsed = text.trim() === '' ? {} : JSON.parse(text);
        if (JSON.stringify(parsed) !== JSON.stringify(value)) {
          setText(fromParent);
        }
      } catch {
        // text is invalid JSON, but the parent has a different value — accept the parent's
        setText(fromParent);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // ─── Live-parse the textarea content ───────────────────────────────────
  function handleTextChange(next: string) {
    setText(next);
    setValidateMsg(null);

    if (next.trim() === '') {
      setParseError(null);
      onChange({});
      return;
    }

    try {
      const parsed = JSON.parse(next);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setParseError('Top-level value must be a JSON object (e.g. {"type": "object", ...})');
        return;
      }
      setParseError(null);
      onChange(parsed as Record<string, unknown>);
    } catch (err) {
      setParseError((err as Error).message);
    }
  }

  // ─── Action: format ────────────────────────────────────────────────────
  function handleFormat() {
    if (text.trim() === '') {
      setValidateMsg({ type: 'ok', message: 'Schema is empty — nothing to format.' });
      return;
    }
    try {
      const parsed = JSON.parse(text);
      const pretty = JSON.stringify(parsed, null, 2);
      setText(pretty);
      onChange(parsed);
      setParseError(null);
      setValidateMsg({ type: 'ok', message: 'Formatted ✓' });
    } catch (err) {
      setValidateMsg({ type: 'error', message: `Cannot format — ${(err as Error).message}` });
    }
  }

  // ─── Action: validate ──────────────────────────────────────────────────
  function handleValidate() {
    if (text.trim() === '') {
      setValidateMsg({ type: 'ok', message: 'Schema is empty (this is OK — no output validation will run).' });
      return;
    }
    try {
      const parsed = JSON.parse(text);
      // Light structural validation (we don't pull a full JSON-schema validator)
      const issues: string[] = [];
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        issues.push('Top-level must be a JSON object');
      } else {
        const obj = parsed as Record<string, unknown>;
        if (!('type' in obj)) {
          issues.push('No "type" field — recommended for clarity');
        }
        if (obj.type === 'object' && !('properties' in obj)) {
          issues.push('Type is "object" but no "properties" defined');
        }
        if ('required' in obj && !Array.isArray(obj.required)) {
          issues.push('"required" must be an array of property names');
        }
      }
      if (issues.length === 0) {
        setValidateMsg({ type: 'ok', message: '✓ Valid JSON Schema' });
      } else {
        setValidateMsg({
          type: 'ok',
          message: `Valid JSON, but: ${issues.join(' · ')}`,
        });
      }
      setParseError(null);
    } catch (err) {
      setValidateMsg({ type: 'error', message: `Invalid JSON — ${(err as Error).message}` });
    }
  }

  // ─── Action: apply template ────────────────────────────────────────────
  function handleApplyTemplate(template: typeof TEMPLATES[0]) {
    const pretty = Object.keys(template.schema).length === 0
      ? ''
      : JSON.stringify(template.schema, null, 2);
    setText(pretty);
    onChange(template.schema as Record<string, unknown>);
    setShowTemplates(false);
    setParseError(null);
    setValidateMsg({ type: 'ok', message: `Loaded "${template.label}" template` });
  }

  // ─── Schema summary chips (read from current value) ───────────────────
  const summary = useMemo(() => {
    try {
      const parsed = text.trim() === '' ? {} : JSON.parse(text);
      const result: { type: string; required: string[]; props: Array<{ name: string; type: string }> } = {
        type:     '',
        required: [],
        props:    [],
      };
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        result.type = (obj.type as string) || '';
        if (Array.isArray(obj.required)) {
          result.required = obj.required.filter((x): x is string => typeof x === 'string');
        }
        if (obj.properties && typeof obj.properties === 'object') {
          result.props = Object.entries(obj.properties as Record<string, unknown>).map(
            ([name, def]) => ({
              name,
              type: (def && typeof def === 'object' && (def as Record<string, unknown>).type) as string || 'any',
            })
          );
        }
      }
      return result;
    } catch {
      return null;
    }
  }, [text]);

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div style={S.wrap}>

      {/* Header */}
      <div style={S.header}>
        <div>
          <h3 style={S.heading}>Output schema</h3>
          <p style={S.subheading}>
            Define the JSON shape the AI must return. The orchestrator validates
            every response against this schema before delivering it.
          </p>
        </div>

        <div style={S.headerActions}>
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              style={S.secondaryBtn}
              onClick={() => setShowTemplates((v) => !v)}
              disabled={disabled}
            >
              Templates ▾
            </button>
            {showTemplates && (
              <>
                <div
                  style={S.dropdownBackdrop}
                  onClick={() => setShowTemplates(false)}
                />
                <div style={S.dropdown}>
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      style={S.dropdownItem}
                      onClick={() => handleApplyTemplate(t)}
                    >
                      <span style={{ marginRight: 8 }}>{t.emoji}</span>
                      {t.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            style={S.secondaryBtn}
            onClick={handleFormat}
            disabled={disabled}
          >
            ✨ Format
          </button>
          <button
            type="button"
            style={S.secondaryBtn}
            onClick={handleValidate}
            disabled={disabled}
          >
            ✓ Validate
          </button>
        </div>
      </div>

      {/* Live status */}
      {parseError && (
        <div style={S.errorBanner}>
          <span style={{ fontSize: 14 }}>⚠️</span>
          <span style={{ flex: 1, fontFamily: 'var(--font-family-mono)', fontSize: 12.5 }}>
            {parseError}
          </span>
        </div>
      )}
      {validateMsg && !parseError && (
        <div style={validateMsg.type === 'ok' ? S.successBanner : S.errorBanner}>
          <span style={{ fontSize: 14 }}>{validateMsg.type === 'ok' ? '✓' : '⚠️'}</span>
          <span style={{ flex: 1, fontSize: 12.5 }}>{validateMsg.message}</span>
        </div>
      )}

      {/* JSON textarea */}
      <div style={S.editorBox}>
        <div style={S.editorHeader}>
          <span style={S.editorLabel}>JSON Schema</span>
          <span style={S.editorHint}>
            Edit directly, or pick a template above
          </span>
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder={`{\n  "type": "object",\n  "required": ["eligible", "reason"],\n  "properties": {\n    "eligible": { "type": "boolean" },\n    "reason":   { "type": "string" }\n  }\n}`}
          spellCheck={false}
          disabled={disabled}
          rows={16}
          style={{
            ...S.textarea,
            ...(parseError ? { borderColor: 'var(--color-error-border)', background: 'var(--color-error-bg)' } : {}),
          }}
        />
      </div>

      {/* Schema summary */}
      {summary && (summary.type || summary.props.length > 0) && (
        <div style={S.summary}>
          <div style={S.summaryHeader}>Schema summary</div>
          <div style={S.summaryRow}>
            {summary.type && (
              <div style={S.summaryItem}>
                <span style={S.summaryItemLabel}>Top-level type:</span>
                <span style={S.summaryChipMono}>{summary.type}</span>
              </div>
            )}
            {summary.required.length > 0 && (
              <div style={S.summaryItem}>
                <span style={S.summaryItemLabel}>Required:</span>
                {summary.required.map((r) => (
                  <span key={r} style={{ ...S.summaryChip, background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' }}>
                    {r}
                  </span>
                ))}
              </div>
            )}
          </div>
          {summary.props.length > 0 && (
            <div style={S.summaryRow}>
              <span style={S.summaryItemLabel}>Properties:</span>
              {summary.props.map((p) => (
                <span key={p.name} style={S.summaryChipMono}>
                  {p.name}: <em style={{ opacity: 0.6, fontStyle: 'normal' }}>{p.type}</em>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ============================================================================
// Inline styles
// ============================================================================

const S: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 14 },

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  heading:    { margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--color-text-strong)' },
  subheading: { margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 600, lineHeight: 1.55 },

  headerActions: { display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center', position: 'relative' },

  secondaryBtn: {
    background: 'rgba(255,255,255,0.85)',
    border: '1px solid rgba(191, 219, 254, 0.85)',
    color: 'var(--color-primary-800)',
    fontWeight: 600, fontSize: 12.5,
    padding: '8px 14px', borderRadius: 9,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s ease',
  },

  dropdownBackdrop: {
    position: 'fixed', inset: 0,
    zIndex: 90,
  },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    right: 0,
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-soft)',
    borderRadius: 10,
    boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)',
    minWidth: 220,
    padding: 6,
    zIndex: 100,
  },
  dropdownItem: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    border: 'none',
    background: 'transparent',
    color: 'var(--color-text-strong)',
    fontSize: 13,
    padding: '8px 12px',
    borderRadius: 7,
    textAlign: 'left',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },

  errorBanner: {
    display: 'flex',
    gap: 10,
    background: 'var(--color-error-bg)',
    border: '1px solid var(--color-error-border)',
    color: 'var(--color-error-text)',
    borderRadius: 10,
    padding: '10px 14px',
    lineHeight: 1.5,
  },
  successBanner: {
    display: 'flex',
    gap: 10,
    background: 'var(--color-success-bg)',
    border: '1px solid var(--color-success-border)',
    color: 'var(--color-success-text)',
    borderRadius: 10,
    padding: '10px 14px',
    lineHeight: 1.5,
  },

  editorBox: {
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-soft)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  editorHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 14px',
    borderBottom: '1px solid var(--color-bg-muted)',
    background: 'var(--color-bg-elevated)',
  },
  editorLabel: { fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' },
  editorHint:  { fontSize: 11.5, color: 'var(--color-text-soft)' },
  textarea: {
    width: '100%',
    border: 'none',
    outline: 'none',
    padding: 14,
    fontSize: 13,
    lineHeight: 1.55,
    fontFamily: 'var(--font-family-mono)',
    resize: 'vertical',
    minHeight: 240,
    maxHeight: 600,
    background: 'var(--color-bg-surface)',
    color: 'var(--color-text-strong)',
    boxSizing: 'border-box',
  },

  summary: {
    background: 'var(--color-bg-canvas)',
    border: '1px dashed var(--color-border-base)',
    borderRadius: 10,
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  summaryHeader: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--color-text-muted)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  summaryRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  summaryItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  summaryItemLabel: {
    fontSize: 12,
    color: 'var(--color-text-muted)',
    fontWeight: 500,
  },
  summaryChip: {
    fontSize: 11.5,
    fontWeight: 600,
    padding: '2px 9px',
    borderRadius: 999,
  },
  summaryChipMono: {
    fontFamily: 'var(--font-family-mono)',
    fontSize: 11.5,
    background: 'var(--color-primary-50)',
    color: 'var(--color-primary-800)',
    padding: '2px 9px',
    borderRadius: 999,
    fontWeight: 600,
  },
};