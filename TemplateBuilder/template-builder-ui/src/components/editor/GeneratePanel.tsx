// src/components/editor/GeneratePanel.tsx
import { useState } from 'react';
import { generateDocument, getJobStatus, saveJobLocally } from '../../api/documents';
import type { JobStatus } from '../../api/documents';
import type { OutputTarget } from '../../types/api';

interface Props {
  templateId: string;
  templateName: string;
  outputTarget: OutputTarget;
  onClose: () => void;
}

const FORMAT_META: Record<string, { icon: string; color: string; bg: string }> = {
  pdf:  { icon: '📄', color: '#b91c1c', bg: '#fee2e2' },
  docx: { icon: '📝', color: '#1d4ed8', bg: '#dbeafe' },
  html: { icon: '🌐', color: '#854d0e', bg: '#fef9c3' },
  xlsx: { icon: '📊', color: '#166534', bg: '#dcfce7' },
  md:   { icon: '📋', color: 'var(--color-primary-800)', bg: 'var(--color-primary-50)' },
};

export default function GeneratePanel({ templateId, templateName, outputTarget, onClose }: Props) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [job, setJob]                   = useState<JobStatus | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const [format, setFormat]             = useState<string>(outputTarget);
  const [isDownloading, setIsDownloading] = useState(false);

  // ── Generate ──────────────────────────────────────────────────────
  async function handleGenerate() {
    setIsGenerating(true); setError(null); setJob(null);
    try {
      const res = await generateDocument({
        template_id: templateId, output_target: format,
        locale: 'en', runtime_params: {},
      });
      let jobData: JobStatus | null = null;
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1000));
        jobData = await getJobStatus(res.job_id);
        if (jobData.status === 'success' || jobData.status === 'error') break;
      }
      if (jobData) {
        setJob(jobData);
        if (jobData.status === 'success') {
          saveJobLocally({
            job_id: jobData.job_id, template_id: templateId, template_name: templateName,
            output_target: jobData.output_target, status: jobData.status,
            runtime_params: {},
            created_at: jobData.created_at ?? new Date().toISOString(),
            result_location: jobData.result_location,
          });
        }
      } else { setError('Job timed out — please try again'); }
    } catch (err) { setError((err as Error).message); }
    finally { setIsGenerating(false); }
  }

  // ── Download ──────────────────────────────────────────────────────
  async function handleDownload() {
    if (!job) return;
    setIsDownloading(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE}/documents/jobs/${job.job_id}/download`,
        { headers: { 'x-user-id': localStorage.getItem('tb_user_id') ?? 'dev_user' } }
      );
      if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${templateName.replace(/\s+/g, '_')}_${job.job_id.slice(0, 8)}.${format}`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) { setError((err as Error).message); }
    finally { setIsDownloading(false); }
  }

  // ── View ──────────────────────────────────────────────────────────
  async function handleView() {
    if (!job) return;
    if (format === 'docx') { alert('Word documents (.docx) cannot be previewed in the browser.\nClick "Download DOCX" to open it in Microsoft Word.'); return; }
    if (format === 'xlsx') { alert('Excel files (.xlsx) cannot be previewed in the browser.\nClick "Download XLSX" to open it in Microsoft Excel.'); return; }
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE}/documents/jobs/${job.job_id}/download`,
        { headers: { 'x-user-id': localStorage.getItem('tb_user_id') ?? 'dev_user' } }
      );
      const blob = await response.blob();
      const mimeType = format === 'pdf' ? 'application/pdf' : format === 'html' ? 'text/html' : 'text/markdown';
      const url = URL.createObjectURL(new Blob([blob], { type: mimeType }));
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch { setError('Could not open preview'); }
  }

  return (
    <>
      <style>{`
        @keyframes fadeInUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
        .gp-panel { animation: fadeInUp 0.25s ease; }
        .gp-fmt-btn { transition: all 0.15s ease; }
        .gp-fmt-btn:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .gp-gen-btn { transition: all 0.2s ease; }
        .gp-gen-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(96,165,250,0.28) !important; filter: brightness(1.08); }
        .gp-dl-btn { transition: all 0.15s ease; }
        .gp-dl-btn:hover { transform: translateY(-1px); filter: brightness(1.08); }
      `}</style>

      <div style={S.overlay} onClick={onClose}>
        <div className="gp-panel" style={S.panel} onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div style={S.header}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--color-primary-800)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>⚡</div>
              <div>
                <h2 style={S.title}>Generate Document</h2>
                <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{templateName}</p>
              </div>
            </div>
            <button style={S.closeBtn} onClick={onClose}>✕</button>
          </div>

          <div style={S.body}>

            {/* Format selector */}
            <div style={S.section}>
              <div style={S.sectionHeader}>
                <span style={S.sectionIcon}>🎯</span>
                <label style={S.sectionTitle}>Output Format</label>
              </div>
              <div style={S.formatGrid}>
                {(['pdf', 'docx', 'html', 'xlsx', 'md'] as const).map(f => {
                  const m = FORMAT_META[f];
                  const isActive = format === f;
                  return (
                    <button key={f} className="gp-fmt-btn"
                      style={{ ...S.formatBtn, ...(isActive ? { backgroundColor: m.bg, color: m.color, borderColor: m.color + '60', boxShadow: `0 2px 8px ${m.color}20` } : {}) }}
                      onClick={() => { setFormat(f); setJob(null); setError(null); }}>
                      <span style={{ fontSize: 14 }}>{m.icon}</span>
                      <span style={{ fontSize: 11, fontWeight: 700 }}>{f.toUpperCase()}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={S.errorBox}>
                <span style={{ fontSize: 16 }}>⚠</span>
                <span>{error}</span>
              </div>
            )}

            {/* Success result */}
            {job?.status === 'success' && (
              <div style={S.resultBox}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>✓</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#166534' }}>{format.toUpperCase()} Generated Successfully!</div>
                </div>
                <p style={{ fontSize: 12, color: '#475569', marginBottom: 14, lineHeight: 1.5 }}>
                  Your document is ready with sample values.
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="gp-dl-btn"
                    style={{ ...S.downloadBtn, opacity: isDownloading ? 0.7 : 1 }}
                    onClick={handleDownload} disabled={isDownloading}>
                    {isDownloading ? '⟳ Downloading...' : `⬇ Download ${format.toUpperCase()}`}
                  </button>
                  <button className="gp-dl-btn" style={S.viewBtn} onClick={handleView}>
                    {format === 'html' ? '👁 View' : format === 'pdf' ? '👁 View' : format === 'md' ? '👁 View' : 'ℹ Info'}
                  </button>
                </div>
                <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 10 }}>Also available in the Documents page</p>
              </div>
            )}

            {/* Error result */}
            {job?.status === 'error' && (
              <div style={{ ...S.resultBox, borderColor: '#fca5a5', backgroundColor: '#fef2f2' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#991b1b', marginBottom: 6 }}>✗ Generation Failed</div>
                <p style={{ fontSize: 12, color: '#b91c1c' }}>{job.logs ?? 'Unknown error'}</p>
              </div>
            )}

            {/* Generate button */}
            {!job && (
              <button className="gp-gen-btn"
                style={{ ...S.generateBtn, background: 'var(--color-primary-800)', opacity: isGenerating ? 0.8 : 1, cursor: isGenerating ? 'not-allowed' : 'pointer' }}
                onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <span style={{ animation: 'pulse 1s infinite' }}>⟳</span>
                    Generating {format.toUpperCase()}...
                  </span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <span>⚡</span>
                    Generate {format.toUpperCase()}
                  </span>
                )}
              </button>
            )}

            {/* Try again */}
            {job && (
              <button style={S.retryBtn} onClick={() => { setJob(null); setError(null); }}>
                ↺ Generate Another
              </button>
            )}

          </div>
        </div>
      </div>
    </>
  );
}

const S: Record<string, React.CSSProperties> = {
  overlay:       { position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, backdropFilter: 'blur(4px)', padding: 20 },
  panel:         { backgroundColor: '#fff', borderRadius: 16, width: 520, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 70px rgba(15,23,42,0.25)', display: 'flex', flexDirection: 'column', border: '1px solid #f0f2f8' },
  header:        { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 1, background: 'var(--color-bg-elevated)', borderRadius: '16px 16px 0 0' },
  title:         { fontSize: 15, fontWeight: 800, color: '#0f172a' },
  closeBtn:      { background: '#f1f5f9', border: 'none', fontSize: 12, color: '#64748b', cursor: 'pointer', padding: '6px 8px', borderRadius: 7 },
  body:          { padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 },
  section:       { backgroundColor: '#fafbff', border: '1px solid #e8edf5', borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 },
  sectionIcon:   { fontSize: 14 },
  sectionTitle:  { fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em' },
  formatGrid:    { display: 'flex', gap: 6 },
  formatBtn:     { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '10px 6px', border: '1.5px solid #e2e8f0', borderRadius: 10, backgroundColor: '#fff', cursor: 'pointer' },
  errorBox:      { display: 'flex', gap: 8, alignItems: 'center', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b91c1c' },
  resultBox:     { border: '1px solid #86efac', borderRadius: 10, padding: '14px 16px', backgroundColor: '#f0fdf4' },
  downloadBtn:   { flex: 1, background: 'var(--color-primary-800)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center' },
  viewBtn:       { flex: 1, backgroundColor: '#fff', color: 'var(--color-primary-800)', border: '1.5px solid var(--color-primary-200)', borderRadius: 8, padding: '10px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'center' },
  generateBtn:   { color: '#fff', border: 'none', borderRadius: 10, padding: '13px', fontSize: 14, fontWeight: 700, cursor: 'pointer', textAlign: 'center', boxShadow: '0 6px 18px rgba(96,165,250,0.24)' },
  retryBtn:      { backgroundColor: 'transparent', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '10px', fontSize: 13, color: '#64748b', cursor: 'pointer', textAlign: 'center', fontWeight: 600 },
};
