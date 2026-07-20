// src/components/editor/PreviewPane.tsx
// Updated: HTML preview now calls POST /preview backend endpoint
// to show real dataset rows in table blocks

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import type { LayoutBlock, Placeholder } from '../../types/api';
import apiClient from '../../api/client';

interface Props {
  blocks: LayoutBlock[];
  placeholders: Placeholder[];
  device: string;
  format: string;
  templateId: string;
}

// ── Replace {{tokens}} with sample values (client-side fallback) ──────────────
// REPLACE WITH:
function resolveTokens(text: string, placeholders: Placeholder[]): string {
  let result = text;
  for (const ph of placeholders) {
    const raw = ph.sample_value ?? `{{${ph.name}}}`;
    let formatted = raw;

    if (ph.cardinality === 'list') {
      // Try to parse JSON array and render as bullet list
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          formatted = arr
            .map((item) => `<li style="margin:2px 0;">${item}</li>`)
            .join('');
          formatted = `<ul style="margin:4px 0;padding-left:20px;">${formatted}</ul>`;
        }
      } catch {
        // Already a comma string like "John | email, Jane | email"
        formatted = raw
          .split(',')
          .map((item) => `<li style="margin:2px 0;">${item.trim()}</li>`)
          .join('');
        formatted = `<ul style="margin:4px 0;padding-left:20px;">${formatted}</ul>`;
      }
    } else if (ph.cardinality === 'table') {
      // Try to parse JSON array-of-objects and render as HTML table
      try {
        const rows = JSON.parse(raw);
        if (Array.isArray(rows) && rows.length > 0) {
          const headers = Object.keys(rows[0]);
          const headerRow = headers
            .map((h) => `<th style="padding:6px 12px;text-align:left;border-bottom:2px solid #e2e8f0;font-size:12px;color:#475569;font-weight:600;background:#f8fafc;">${h}</th>`)
            .join('');
          const dataRows = rows
            .map((row, ri) => {
              const cells = headers
                .map((h) => `<td style="padding:6px 12px;font-size:12px;color:#334155;border-bottom:1px solid #f1f5f9;background:${ri % 2 === 0 ? '#fff' : '#f8fafc'};">${row[h] ?? ''}</td>`)
                .join('');
              return `<tr>${cells}</tr>`;
            })
            .join('');
          formatted = `<table style="width:100%;border-collapse:collapse;margin:4px 0;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
            <thead><tr>${headerRow}</tr></thead>
            <tbody>${dataRows}</tbody>
          </table>`;
        }
      } catch {
        formatted = raw; // fallback to raw if parse fails
      }
    }

    result = result.split(`{{${ph.name}}}`).join(formatted);
  }
  return result;
}
// ── Client-side render (fallback when API not available) ──────────────────────
function renderBlock(block: LayoutBlock, placeholders: Placeholder[]): string {
  switch (block.type) {
    case 'text': {
      const resolved = resolveTokens(block.content ?? '', placeholders);
      const lines    = resolved.split('\n').filter(Boolean);
      const align    = block.align ?? 'left';
      const fontSize = block.fontSize ?? 14;
      return lines.map((line) =>
        `<p style="margin:0 0 8px;line-height:1.7;text-align:${align};font-size:${fontSize}px;">${line}</p>`
      ).join('');
    }
    case 'table': {
      const cols      = block.columns ?? [];
      const dataRows  = block.rows ?? [];
      const headers   = cols.map((c) =>
        `<th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0;font-size:13px;color:#475569;font-weight:600;">${c.header}</th>`
      ).join('');
      const bindingRow = cols.map((c) =>
        `<td style="padding:8px 12px;font-size:13px;color:#334155;border-bottom:1px solid #f1f5f9;">${resolveTokens(c.binding, placeholders)}</td>`
      ).join('');
      const extraRows = dataRows.map((row, ri) => {
        const cells = cols.map((c, ci) => {
          const cellVal = row[ci] && row[ci] !== '' ? row[ci] : c.binding;
          const resolved = resolveTokens(cellVal, placeholders);
          const bg = ri % 2 === 0 ? '#fff' : '#f8fafc';
          return `<td style="padding:8px 12px;font-size:13px;color:#334155;border-bottom:1px solid #f1f5f9;background:${bg};">${resolved}</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      return `<table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <thead><tr>${headers}</tr></thead>
        <tbody><tr>${bindingRow}</tr>${extraRows}</tbody>
      </table>`;
    }
    case 'image': {
      const src = block.src ?? '';
      if (!src) return `<div style="height:80px;background:#f1f5f9;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:13px;margin-bottom:12px;">Image placeholder</div>`;
      return `<img src="${src}" style="max-width:100%;border-radius:6px;margin-bottom:12px;" />`;
    }
    case 'section': {
      const label = resolveTokens(block.content ?? 'Section', placeholders);
      return `<div style="display:flex;align-items:center;gap:12px;margin:20px 0 12px;padding:0;">
        <div style="height:2px;width:24px;background:var(--color-primary-700);border-radius:2px;flex-shrink:0;"></div>
        <span style="font-size:13px;font-weight:700;color:#4c1d95;letter-spacing:0.05em;text-transform:uppercase;white-space:nowrap;">${label}</span>
        <div style="flex:1;height:2px;background:#e2e8f0;border-radius:2px;"></div>
      </div>`;
    }
    default: return '';
  }
}

function buildHtmlFallback(blocks: LayoutBlock[], placeholders: Placeholder[]): string {
  const body = blocks.map((b) => renderBlock(b, placeholders)).join('\n');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; color: #1e293b; padding: 32px; line-height: 1.6; background: #ffffff; }
</style></head><body>
${body || '<p style="color:#94a3b8;font-style:italic;">No blocks added yet</p>'}
</body></html>`;
}

const DEVICE_WIDTHS: Record<string, string> = {
  Desktop: '100%',
  Tablet:  '768px',
  Mobile:  '375px',
};

// ─────────────────────────────────────────────────────────────────────────────

export default function PreviewPane({ blocks, placeholders, device, format, templateId }: Props) {
  const width = DEVICE_WIDTHS[device] ?? '100%';

  // ── HTML preview state ────────────────────────────────────────────────────
  const [htmlSrc, setHtmlSrc]           = useState<string>('');
  const [htmlLoading, setHtmlLoading]   = useState(false);
  const [htmlError, setHtmlError]       = useState<string | null>(null);
  const [useBackend, setUseBackend]     = useState(true); // try backend first

  // Client-side fallback HTML
  const fallbackHtml = useMemo(
    () => buildHtmlFallback(blocks, placeholders),
    [blocks, placeholders]
  );

  // ── Fetch HTML preview from backend ──────────────────────────────────────
  const fetchHtmlPreview = useCallback(async () => {
    if (!templateId || !useBackend) {
      setHtmlSrc(fallbackHtml);
      return;
    }

    setHtmlLoading(true);
    setHtmlError(null);

    try {
      const res = await apiClient.post('/documents/preview', {
        template_id:      templateId,
        sample_overrides: {},
      });

      if (res.data?.html) {
        setHtmlSrc(res.data.html);
        setHtmlError(null);
      } else {
        throw new Error('No HTML in response');
      }
    } catch {
      // Fall back to client-side rendering
      setUseBackend(false);
      setHtmlSrc(fallbackHtml);
      setHtmlError('Using client-side preview (backend preview unavailable)');
    } finally {
      setHtmlLoading(false);
    }
  }, [templateId, useBackend, fallbackHtml]);

  // Fetch when format is HTML or when blocks change
  useEffect(() => {
    if (format === 'HTML') {
      fetchHtmlPreview();
    }
  }, [format, templateId, blocks, fetchHtmlPreview]);

  // ── PDF preview state ─────────────────────────────────────────────────────
  const [pdfUrl, setPdfUrl]         = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError]     = useState<string | null>(null);
  const prevUrlRef                  = useRef<string | null>(null);

  useEffect(() => {
    if (format !== 'PDF') {
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = null;
      }
      setPdfUrl(null);
      setPdfError(null);
      return;
    }
    if (!templateId) return;

    async function generatePdfPreview() {
      setPdfLoading(true);
      setPdfError(null);
      try {
        const genRes = await apiClient.post('/documents/generate', {
          template_id:    templateId,
          output_target:  'pdf',
          locale:         'en',
          runtime_params: {},
        });
        const jobId = genRes.data.job_id;

        let jobData: { status: string; logs?: string } | null = null;
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 1000));
          const statusRes = await apiClient.get(`/documents/jobs/${jobId}`);
          jobData = statusRes.data;
          if (jobData?.status === 'success' || jobData?.status === 'error') break;
        }

        if (jobData?.status !== 'success') {
          setPdfError(jobData?.logs || 'PDF generation failed');
          return;
        }

        const dlRes = await fetch(
          `${import.meta.env.VITE_API_BASE}/documents/jobs/${jobId}/download`,
          { headers: { 'x-user-id': localStorage.getItem('tb_user_id') ?? 'dev_user' } }
        );
        const blob    = await dlRes.blob();
        const pdfBlob = new Blob([blob], { type: 'application/pdf' });
        const url     = URL.createObjectURL(pdfBlob);

        if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = url;
        setPdfUrl(url);
      } catch (err) {
        setPdfError((err as Error).message);
      } finally {
        setPdfLoading(false);
      }
    }

    generatePdfPreview();
  }, [format, templateId]);

  return (
    <div style={styles.container}>

      {/* Toolbar */}
      <div style={styles.toolbar}>
        <span style={styles.toolbarLabel}>{format} Preview</span>
        <span style={styles.toolbarHint}>
          {format === 'HTML'
            ? htmlLoading
              ? '⟳ Loading preview...'
              : htmlError
              ? '⚠ ' + htmlError
              : useBackend
              ? '✓ Backend preview — shows real dataset rows'
              : 'Tokens replaced with sample values'
            : format === 'PDF'
            ? pdfLoading ? '⟳ Generating PDF preview...' : 'PDF rendered by backend'
            : format === 'DOCX'
            ? 'DOCX cannot be previewed — use ⚡ Generate to download'
            : format === 'XLSX'
            ? 'XLSX cannot be previewed — use ⚡ Generate to download'
            : format === 'MD'
            ? 'Markdown cannot be previewed — use ⚡ Generate to download'
            : 'Use ⚡ Generate to download'}
        </span>

        {/* Refresh button for HTML preview */}
        {format === 'HTML' && !htmlLoading && (
          <button
            style={styles.refreshBtn}
            onClick={() => { setUseBackend(true); fetchHtmlPreview(); }}
            title="Refresh preview from backend"
          >
            ↺ Refresh
          </button>
        )}
      </div>

      <div style={styles.frameWrapper}>
        <div style={{ width, margin: '0 auto', height: '100%' }}>

          {/* HTML */}
          {format === 'HTML' && (
            <>
              {htmlLoading && (
                <div style={styles.centerBox}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>⟳</div>
                  <p style={{ fontSize: 13, color: '#64748b' }}>Loading preview...</p>
                </div>
              )}
              {!htmlLoading && (
                <iframe
                  srcDoc={htmlSrc || fallbackHtml}
                  style={styles.frame}
                  title="Template Preview"
                  sandbox="allow-same-origin"
                />
              )}
            </>
          )}

          {/* PDF */}
          {format === 'PDF' && (
            <>
              {pdfLoading && (
                <div style={styles.centerBox}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>⟳</div>
                  <p style={{ fontSize: 14, color: '#64748b' }}>Generating PDF preview...</p>
                  <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>This may take a few seconds</p>
                </div>
              )}
              {pdfError && !pdfLoading && (
                <div style={{ ...styles.centerBox, backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#b91c1c', marginBottom: 6 }}>PDF preview failed</p>
                  <p style={{ fontSize: 12, color: '#94a3b8' }}>{pdfError}</p>
                </div>
              )}
              {pdfUrl && !pdfLoading && (
                <iframe src={pdfUrl} style={{ ...styles.frame, minHeight: '500px' }} title="PDF Preview" />
              )}
            </>
          )}

          {/* DOCX */}
          {format === 'DOCX' && (
            <div style={styles.centerBox}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>
                DOCX Preview not available
              </p>
              <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, maxWidth: 320 }}>
                Word documents cannot be previewed in the browser.<br />
                Use the <strong>⚡ Generate</strong> button to download the DOCX file.
              </p>
            </div>
          )}

          {/* XLSX */}
          {format === 'XLSX' && (
            <div style={styles.centerBox}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>
                XLSX Preview not available
              </p>
              <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, maxWidth: 320 }}>
                Excel files cannot be previewed in the browser.<br />
                Use the <strong>⚡ Generate</strong> button to download the XLSX file.
              </p>
            </div>
          )}

          {/* MD */}
          {format === 'MD' && (
            <div style={styles.centerBox}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>
                Markdown Preview
              </p>
              <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, maxWidth: 320 }}>
                Use the <strong>⚡ Generate</strong> button to download the Markdown file.<br />
                You can open it in any text editor or Markdown viewer.
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container:    { display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0' },
  toolbar:      { display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 16px', backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', flexShrink: 0 },
  toolbarLabel: { fontSize: '12px', fontWeight: 600, color: 'var(--color-primary-800)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  toolbarHint:  { fontSize: '12px', color: '#94a3b8', flex: 1 },
  refreshBtn:   { backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '3px 10px', fontSize: '12px', color: '#475569', cursor: 'pointer', fontWeight: 500 },
  frameWrapper: { flex: 1, overflow: 'auto', padding: '16px' },
  frame:        { width: '100%', height: '100%', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#ffffff', minHeight: '300px' },
  centerBox:    { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '400px', backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center', padding: 32 },
};
