// src/components/editor/AIToolsPanel.tsx
// Calls backend /v1/ai/tools — single endpoint for all 4 AI tools.
// Backend uses Cohere now; when senior's LLM microservice is ready,
// just set LLM_ENDPOINT in backend .env — frontend doesn't change at all.

import { useState } from 'react';
import type { LayoutBlock } from '../../types/api';
import apiClient from '../../api/client';

interface Props {
  blocks: LayoutBlock[];
  selectedBlockId: string | null;
  onBlocksChange: (blocks: LayoutBlock[]) => void;
  onClose: () => void;
}

type AITool = 'generate' | 'polish' | 'translate' | 'check';

const TONES     = ['Formal', 'Legal', 'Simple', 'Marketing', 'Friendly'];
const LANGUAGES = ['Hindi', 'Tamil', 'Telugu', 'Kannada', 'Marathi', 'Urdu', 'French', 'Spanish', 'Arabic', 'German'];

// ── Single API call — all tools go through one backend endpoint ───────────────
async function callAITool(params: Record<string, string>): Promise<string> {
  const response = await apiClient.post('/ai/tools', params);
  const { result, error } = response.data as { result: string; error: string };
  if (error) throw new Error(error);
  if (!result) throw new Error('AI returned an empty response');
  return result;
}

export default function AIToolsPanel({ blocks, selectedBlockId, onBlocksChange, onClose }: Props) {
  const [activeTool, setActiveTool] = useState<AITool>('generate');
  const [isLoading, setIsLoading]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [result, setResult]         = useState<string | null>(null);

  const [description, setDescription] = useState('');
  const [tone, setTone]               = useState('Formal');
  const [language, setLanguage]       = useState('Hindi');

  const selectedBlock   = blocks.find((b) => b.block_id === selectedBlockId);
  const selectedContent = selectedBlock?.type === 'text' ? (selectedBlock.content ?? '') : '';

  function applyToBlock(text: string) {
    if (!selectedBlockId) return;
    onBlocksChange(blocks.map((b) =>
      b.block_id === selectedBlockId ? { ...b, content: text } : b
    ));
    setResult(null);
  }

  async function run(params: Record<string, string>) {
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const text = await callAITool(params);
      setResult(text);
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg.includes('COHERE_API_KEY')
        ? 'AI not configured. Add COHERE_API_KEY to backend .env file.'
        : msg
      );
    } finally {
      setIsLoading(false);
    }
  }

  const tabConfig = [
    { id: 'generate'  as const, label: '✦ Generate',  desc: 'Describe → AI creates content' },
    { id: 'polish'    as const, label: '✎ Polish',    desc: 'Rewrite in different tone'      },
    { id: 'translate' as const, label: '⌘ Translate', desc: 'Translate to another language'  },
    { id: 'check'     as const, label: '⚠ Check',     desc: 'Find issues in template'        },
  ];

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.panel} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={S.header}>
          <div>
            <h2 style={S.title}>✦ AI Tools</h2>
            <p style={S.subtitle}>Powered by Cohere</p>
          </div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div style={S.tabs}>
          {tabConfig.map((t) => (
            <button key={t.id}
              style={{ ...S.tab, ...(activeTool === t.id ? S.tabActive : {}) }}
              onClick={() => { setActiveTool(t.id); setResult(null); setError(null); }}
            >
              <span style={S.tabLabel}>{t.label}</span>
              <span style={S.tabDesc}>{t.desc}</span>
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={S.body}>

          {error && <div style={S.errorBox}>{error}</div>}

          {/* ── Generate ─────────────────────────────────────────── */}
          {activeTool === 'generate' && (
            <div style={S.section}>
              <p style={S.hint}>Describe what you want and AI will generate template content with placeholders.</p>
              <textarea
                style={S.textarea} rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. A loan closure letter for a bank customer confirming that their home loan has been fully paid off"
              />
              <button
                style={{ ...S.runBtn, opacity: isLoading || !description.trim() ? 0.6 : 1 }}
                onClick={() => run({ tool: 'generate', description })}
                disabled={isLoading || !description.trim()}
              >
                {isLoading ? '⟳ Generating...' : '✦ Generate Content'}
              </button>
            </div>
          )}

          {/* ── Polish ───────────────────────────────────────────── */}
          {activeTool === 'polish' && (
            <div style={S.section}>
              <p style={S.hint}>Select a text block on the canvas, then choose a tone to rewrite it.</p>
              {selectedContent
                ? <div style={S.preview}><div style={S.previewLabel}>Selected block:</div><div style={S.previewText}>{selectedContent.slice(0, 120)}{selectedContent.length > 120 ? '...' : ''}</div></div>
                : <div style={S.noSel}>← Select a text block on the canvas first</div>
              }
              <div style={S.field}>
                <label style={S.fieldLabel}>Tone</label>
                <div style={S.chipRow}>
                  {TONES.map((t) => (
                    <button key={t} style={{ ...S.chip, ...(tone === t ? S.chipActive : {}) }} onClick={() => setTone(t)}>{t}</button>
                  ))}
                </div>
              </div>
              <button
                style={{ ...S.runBtn, opacity: isLoading || !selectedContent ? 0.6 : 1 }}
                onClick={() => run({ tool: 'polish', content: selectedContent, tone })}
                disabled={isLoading || !selectedContent}
              >
                {isLoading ? '⟳ Polishing...' : '✎ Polish Text'}
              </button>
            </div>
          )}

          {/* ── Translate ────────────────────────────────────────── */}
          {activeTool === 'translate' && (
            <div style={S.section}>
              <p style={S.hint}>Select a text block, then choose a language. Tokens like {'{{customer_name}}'} are preserved.</p>
              {selectedContent
                ? <div style={S.preview}><div style={S.previewLabel}>Selected block:</div><div style={S.previewText}>{selectedContent.slice(0, 120)}{selectedContent.length > 120 ? '...' : ''}</div></div>
                : <div style={S.noSel}>← Select a text block on the canvas first</div>
              }
              <div style={S.field}>
                <label style={S.fieldLabel}>Target Language</label>
                <div style={S.chipRow}>
                  {LANGUAGES.map((l) => (
                    <button key={l} style={{ ...S.chip, ...(language === l ? S.chipActive : {}) }} onClick={() => setLanguage(l)}>{l}</button>
                  ))}
                </div>
              </div>
              <button
                style={{ ...S.runBtn, opacity: isLoading || !selectedContent ? 0.6 : 1 }}
                onClick={() => run({ tool: 'translate', content: selectedContent, language })}
                disabled={isLoading || !selectedContent}
              >
                {isLoading ? '⟳ Translating...' : '⌘ Translate'}
              </button>
            </div>
          )}

          {/* ── Check ────────────────────────────────────────────── */}
          {activeTool === 'check' && (
            <div style={S.section}>
              <p style={S.hint}>AI will scan all text blocks and flag broken tokens, grammar errors, or missing fields.</p>
              <div style={S.countBox}>
                {blocks.filter((b) => b.type === 'text').length} text block(s) will be checked
              </div>
              <button
                style={{ ...S.runBtn, opacity: isLoading ? 0.6 : 1 }}
                onClick={() => run({
                  tool: 'check',
                  all_blocks: blocks
                    .filter((b) => b.type === 'text' && b.content)
                    .map((b, i) => `Block ${i + 1}: ${b.content}`)
                    .join('\n\n') || 'No text blocks found',
                })}
                disabled={isLoading}
              >
                {isLoading ? '⟳ Checking...' : '⚠ Check for Anomalies'}
              </button>
            </div>
          )}

          {/* ── Result ───────────────────────────────────────────── */}
          {result && (
            <div style={S.resultBox}>
              <div style={S.resultHeader}>
                <span style={S.resultLabel}>✦ AI Result</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {activeTool !== 'check' && selectedBlockId && (
                    <button style={S.applyBtn} onClick={() => applyToBlock(result)}>← Apply to block</button>
                  )}
                  {activeTool === 'generate' && !selectedBlockId && (
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>Select a text block to apply</span>
                  )}
                  <button style={S.copyBtn} onClick={() => navigator.clipboard.writeText(result)}>Copy</button>
                </div>
              </div>
              <div style={S.resultText}>{result}</div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  overlay:      { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  panel:        { backgroundColor: '#fff', borderRadius: '12px', width: '560px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  header:       { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9', background: 'var(--color-bg-elevated)', borderRadius: '12px 12px 0 0' },
  title:        { fontSize: '18px', fontWeight: 700, color: 'var(--color-text-strong)' },
  subtitle:     { fontSize: '12px', color: 'var(--color-text-muted)', marginTop: 2 },
  closeBtn:     { background: 'var(--color-bg-muted)', border: '1px solid var(--color-border-soft)', borderRadius: '6px', width: 28, height: 28, fontSize: '14px', color: 'var(--color-text-muted)', cursor: 'pointer' },
  tabs:         { display: 'flex', borderBottom: '1px solid #f1f5f9', padding: '0 8px' },
  tab:          { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 4px', border: 'none', background: 'none', cursor: 'pointer', borderBottom: '2px solid transparent', gap: 2 },
  tabActive:    { borderBottom: '2px solid var(--color-primary-800)' },
  tabLabel:     { fontSize: '12px', fontWeight: 600, color: 'var(--color-primary-800)' },
  tabDesc:      { fontSize: '10px', color: '#94a3b8', textAlign: 'center' },
  body:         { flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 14 },
  section:      { display: 'flex', flexDirection: 'column', gap: 12 },
  hint:         { fontSize: '13px', color: '#64748b', lineHeight: 1.6, backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' },
  textarea:     { padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', color: '#1e293b', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 },
  runBtn:       { backgroundColor: 'var(--color-primary-800)', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', textAlign: 'center' },
  field:        { display: 'flex', flexDirection: 'column', gap: 8 },
  fieldLabel:   { fontSize: '13px', fontWeight: 500, color: '#374151' },
  chipRow:      { display: 'flex', gap: 6, flexWrap: 'wrap' },
  chip:         { padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: '20px', fontSize: '12px', fontWeight: 500, color: '#64748b', backgroundColor: '#f8fafc', cursor: 'pointer' },
  chipActive:   { backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-800)', borderColor: 'var(--color-primary-200)' },
  preview:      { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' },
  previewLabel: { fontSize: '11px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 },
  previewText:  { fontSize: '13px', color: '#334155', lineHeight: 1.6, fontFamily: 'var(--font-family-mono)' },
  noSel:        { backgroundColor: '#fef9c3', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px', fontSize: '13px', color: '#854d0e', textAlign: 'center' },
  countBox:     { backgroundColor: 'var(--color-primary-50)', border: '1px solid var(--color-primary-200)', borderRadius: '8px', padding: '12px', fontSize: '13px', color: 'var(--color-primary-800)', textAlign: 'center', fontWeight: 500 },
  errorBox:     { backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#b91c1c' },
  resultBox:    { backgroundColor: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '14px' },
  resultHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  resultLabel:  { fontSize: '12px', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em' },
  applyBtn:     { backgroundColor: 'var(--color-primary-800)', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' },
  copyBtn:      { background: 'none', border: '1px solid #86efac', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', color: '#166534', cursor: 'pointer' },
  resultText:   { fontSize: '13px', color: '#166534', lineHeight: 1.7, whiteSpace: 'pre-wrap' },
};
