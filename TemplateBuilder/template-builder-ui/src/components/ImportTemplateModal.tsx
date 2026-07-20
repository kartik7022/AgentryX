// src/components/ImportTemplateModal.tsx
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/client';

interface Props {
  onClose: () => void;
  onImported: () => void;
}

const INDUSTRIES = ['', 'Banking', 'Insurance', 'Healthcare', 'Finance', 'Manufacturing', 'Legal', 'Real Estate', 'Education', 'Other'];
const OUTPUT_TARGETS = [{ value: 'html', label: 'HTML' }, { value: 'docx', label: 'DOCX' }, { value: 'pdf', label: 'PDF' }, { value: 'xlsx', label: 'XLSX' }];
const FILE_META: Record<string, { icon: string; color: string }> = {
  pdf:  { icon: '📄', color: '#ef4444' },
  docx: { icon: '📝', color: '#3b82f6' },
  html: { icon: '🌐', color: '#f59e0b' },
  htm:  { icon: '🌐', color: '#f59e0b' },
  json: { icon: '📋', color: 'var(--color-primary-800)' },
};
const MAX_FILE_SIZE = 20 * 1024 * 1024;

// ─── Detect URLs that must be fetched server-side ────────────────────────────
// Google Drive/Docs block browser fetches via CORS — always route through backend
function mustUseBackend(url: string): boolean {
  return (
    url.includes('drive.google.com') ||
    url.includes('docs.google.com')
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ImportTemplateModal({ onClose, onImported }: Props) {
  const navigate     = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab]                   = useState<'file' | 'url'>('file');
  const [name, setName]                 = useState('');
  const [industry, setIndustry]         = useState('');
  const [outputTarget, setOutputTarget] = useState('html');
  const [file, setFile]                 = useState<File | null>(null);
  const [url, setUrl]                   = useState('');
  const [isDragging, setIsDragging]     = useState(false);
  const [isImporting, setIsImporting]   = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [progress, setProgress]         = useState('');
  const [isSuccess, setIsSuccess]       = useState(false);

  // ── File select / drag ─────────────────────────────────────────────────────

  function handleFileSelect(selectedFile: File) {
    setError(null);
    if (selectedFile.size > MAX_FILE_SIZE) { setError('File too large. Max 20MB.'); return; }
    setFile(selectedFile);
    if (!name) {
      const base = selectedFile.name.replace(/\.(pdf|docx|html|htm|json)$/i, '');
      setName(base.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelect(f);
  }

  // ── Validation ─────────────────────────────────────────────────────────────

  function validate(): boolean {
    if (!name.trim()) { setError('Template name is required.'); return false; }
    if (tab === 'file' && !file) { setError('Please select a file.'); return false; }
    if (tab === 'url' && !url.trim()) { setError('Please enter a URL.'); return false; }
    if (tab === 'url') {
      try { new URL(url.trim()); } catch {
        setError('Invalid URL. Please enter a valid URL starting with https://'); return false;
      }
    }
    return true;
  }

  async function handleImport() {
    setError(null);
    if (!validate()) return;
    if (tab === 'file') await importFile();
    else await importFromUrl();
  }

  // ── File upload → POST /templates/import/file ──────────────────────────────

  async function importFile() {
    if (!file) return;
    setIsImporting(true); setIsSuccess(false);
    setProgress('Uploading and parsing...');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', name.trim());
      formData.append('industry', industry);
      formData.append('output_target', outputTarget);
      const response = await apiClient.post('/templates/import/file', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
      const data = response.data;
      setIsSuccess(true);
      setProgress(`✓ Imported ${data.block_count} blocks!`);
      setTimeout(() => { onImported(); onClose(); navigate(`/templates/${data.template_id}`); }, 900);
    } catch (err) {
      setError(extractError(err)); setIsImporting(false); setProgress('');
    }
  }

  // ── URL import ─────────────────────────────────────────────────────────────
  // Strategy:
  //   1. Google Drive / Docs  → always POST to /templates/import/url (backend fetches it, no CORS)
  //   2. JSON template URLs   → fetch in browser, then POST to /templates
  //   3. All other public URLs → try browser fetch first; if CORS blocks it, fall back to /templates/import/url

  async function importFromUrl() {
    setIsImporting(true); setIsSuccess(false);
    const rawUrl = url.trim();

    try {
      // ── Path 1: Google Drive / Docs — always use backend ──────────────────
      if (mustUseBackend(rawUrl)) {
        await importViaBackend(rawUrl, 'Fetching Google Drive file via server...');
        return;
      }

      // ── Path 2: JSON URL — fetch in browser ───────────────────────────────
      if (rawUrl.toLowerCase().split('?')[0].endsWith('.json')) {
        setProgress('Fetching JSON template...');
        let jsonData: Record<string, unknown>;
        try {
          const res = await fetch(rawUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          jsonData = await res.json();
        } catch {
          setProgress('Retrying via proxy...');
          const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(rawUrl)}`;
          const res2 = await fetch(proxy);
          if (!res2.ok) throw new Error(`Proxy fetch failed: HTTP ${res2.status}`);
          jsonData = await res2.json();
        }

        setProgress('Creating template from JSON...');
        const createRes = await apiClient.post('/templates', {
          name:          (jsonData.name as string) || name.trim(),
          description:   (jsonData.description as string) || '',
          output_target: (jsonData.output_target as string) || outputTarget,
          layout_json:   { blocks: [] },
          created_by:    localStorage.getItem('tb_user_id') ?? 'dev_user',
          tags:          (jsonData.tags as string[]) || [],
          industry:      (jsonData.industry as string) || industry || null,
        });

        const templateId = createRes.data.template_id;
        const layoutJson = (jsonData.layout_json as { blocks: unknown[] }) || { blocks: [] };
        await apiClient.put(`/templates/${templateId}`, {
          name:          (jsonData.name as string) || name.trim(),
          output_target: (jsonData.output_target as string) || outputTarget,
          layout_json:   layoutJson,
          tags:          (jsonData.tags as string[]) || [],
        });

        setIsSuccess(true);
        setProgress(`✓ Imported ${(layoutJson.blocks || []).length} blocks from JSON!`);
        setTimeout(() => { onImported(); onClose(); navigate(`/templates/${templateId}`); }, 900);
        return;
      }

      // ── Path 3: Any other public URL — try browser, fall back to backend ──
      setProgress('Fetching file...');
      let usedBackend = false;
      try {
        const res = await fetch(rawUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (blob.size === 0) throw new Error('Empty file');
        if (blob.size > MAX_FILE_SIZE) throw new Error('File too large (max 20MB).');

        // Determine extension from URL
        const lower = rawUrl.toLowerCase().split('?')[0];
        const ext = lower.endsWith('.pdf')  ? 'pdf'
                  : lower.endsWith('.docx') ? 'docx'
                  : lower.endsWith('.htm')  ? 'html'
                  : lower.endsWith('.html') ? 'html'
                  : 'html';
        const mime = ext === 'pdf'  ? 'application/pdf'
                   : ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                   : 'text/html';

        const fileObj = new File([blob], `imported_${Date.now()}.${ext}`, { type: mime });
        setProgress('Parsing and importing...');
        const formData = new FormData();
        formData.append('file', fileObj);
        formData.append('name', name.trim());
        formData.append('industry', industry);
        formData.append('output_target', outputTarget);

        const response = await apiClient.post('/templates/import/file', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 60000,
        });
        const data = response.data;
        setIsSuccess(true);
        setProgress(`✓ Imported ${data.block_count} blocks!`);
        setTimeout(() => { onImported(); onClose(); navigate(`/templates/${data.template_id}`); }, 900);

      } catch (browserErr) {
        // Browser fetch failed (likely CORS) — let the backend fetch it
        if (!usedBackend) {
          usedBackend = true;
          await importViaBackend(rawUrl, 'Direct fetch blocked, retrying via server...');
        } else {
          throw browserErr;
        }
      }

    } catch (err) {
      setError(extractError(err));
      setIsImporting(false);
      setProgress('');
    }
  }

  // ── Shared helper: POST url as form data to /templates/import/url ──────────
  // The backend resolves Google Drive, Dropbox, OneDrive, etc. and downloads server-side.

  async function importViaBackend(rawUrl: string, progressMsg: string) {
    setProgress(progressMsg);
    const formData = new FormData();
    formData.append('url', rawUrl);
    formData.append('name', name.trim());
    formData.append('industry', industry);
    formData.append('output_target', outputTarget);

    const response = await apiClient.post('/templates/import/url', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 90000,
    });
    const data = response.data;
    setIsSuccess(true);
    setProgress(`✓ Imported ${data.block_count} blocks!`);
    setTimeout(() => { onImported(); onClose(); navigate(`/templates/${data.template_id}`); }, 900);
  }

  // ── Error helper ───────────────────────────────────────────────────────────

  function extractError(err: unknown): string {
    const e = err as Record<string, unknown>;
    const resp = e?.['response'] as Record<string, unknown> | undefined;
    if (resp) {
      const data = resp['data'] as Record<string, unknown> | undefined;
      if (data?.detail) return String(data.detail);
      const s = Number(resp['status']);
      if (s === 500) return 'Server error. Check Docker is running.';
      if (s === 413) return 'File too large (max 20MB).';
      if (s === 422) return 'Could not parse this file format.';
      if (s === 408) return 'Request timed out. Try a smaller file or URL.';
      if (s === 400) return String((resp['data'] as Record<string, string>)?.detail || 'Bad request');
    }
    if (err instanceof Error) return err.message;
    return 'Import failed. Please try again.';
  }

  const fileExt  = file?.name.split('.').pop()?.toLowerCase() ?? '';
  const fileMeta = FILE_META[fileExt] ?? { icon: '📂', color: '#475569' };
  const isGDrive = tab === 'url' && (url.includes('drive.google.com') || url.includes('docs.google.com'));

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`@keyframes tb-spin { to { transform: rotate(360deg); } }`}</style>
      <div style={S.overlay} onClick={onClose}>
        <div style={S.modal} onClick={e => e.stopPropagation()}>

          <div style={S.header}>
            <div>
              <h2 style={S.title}>↑ Import Template</h2>
              <p style={S.subtitle}>Import from PDF, DOCX, HTML file or any public URL</p>
            </div>
            <button style={S.closeBtn} onClick={onClose} disabled={isImporting}>✕</button>
          </div>

          <div style={S.body}>

            {error && <div style={S.errorBox}><span>⚠</span><span>{error}</span></div>}

            {progress && !error && (
              <div style={{
                ...S.progressBox,
                background:   isSuccess ? '#f0fdf4' : '#eff6ff',
                borderColor:  isSuccess ? '#86efac' : '#bfdbfe',
                color:        isSuccess ? '#166534' : '#1d4ed8',
              }}>
                {isImporting && !isSuccess && (
                  <span style={{
                    width: 14, height: 14,
                    border: '2px solid #bfdbfe', borderTopColor: '#3b82f6',
                    borderRadius: '50%', animation: 'tb-spin 0.7s linear infinite',
                    display: 'inline-block', flexShrink: 0,
                  }} />
                )}
                <span>{progress}</span>
              </div>
            )}

            <div style={S.grid}>
              <div style={S.field}>
                <label style={S.label}>Template Name <span style={{ color: '#ef4444' }}>*</span></label>
                <input style={S.input} value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. Loan Offer Letter" disabled={isImporting} />
              </div>
              <div style={S.field}>
                <label style={S.label}>Industry</label>
                <select style={S.select} value={industry} onChange={e => setIndustry(e.target.value)} disabled={isImporting}>
                  {INDUSTRIES.map(i => <option key={i} value={i}>{i || 'Select industry'}</option>)}
                </select>
              </div>
              <div style={S.field}>
                <label style={S.label}>Output Format</label>
                <select style={S.select} value={outputTarget} onChange={e => setOutputTarget(e.target.value)} disabled={isImporting}>
                  {OUTPUT_TARGETS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>

            <div style={S.tabs}>
              {(['file', 'url'] as const).map(t => (
                <button key={t} style={{ ...S.tab, ...(tab === t ? S.tabActive : {}) }}
                  onClick={() => { setTab(t); setError(null); }} disabled={isImporting}>
                  {t === 'file' ? '📁 Upload File' : '🔗 Import from URL'}
                </button>
              ))}
            </div>

            {tab === 'file' && (
              <div>
                <div
                  style={{
                    ...S.dropZone,
                    borderColor:     isDragging ? 'var(--color-primary-200)' : file ? '#22c55e' : 'var(--color-border-soft)',
                    backgroundColor: isDragging ? 'var(--color-primary-50)' : file ? 'var(--color-success-bg)' : 'var(--color-bg-canvas)',
                    cursor:          isImporting ? 'not-allowed' : 'pointer',
                  }}
                  onDrop={handleDrop}
                  onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onClick={() => !isImporting && fileInputRef.current?.click()}
                >
                  <input ref={fileInputRef} type="file" accept=".pdf,.docx,.html,.htm,.json"
                    style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }} />
                  {file ? (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>{fileMeta.icon}</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: fileMeta.color, marginBottom: 4 }}>{file.name}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>{(file.size / 1024).toFixed(1)} KB</div>
                      {!isImporting && (
                        <button style={S.changeBtn} onClick={e => { e.stopPropagation(); setFile(null); setError(null); }}>
                          Change file
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 40, marginBottom: 10 }}>📂</div>
                      <p style={{ fontSize: 14, fontWeight: 500, color: '#475569', margin: '0 0 4px' }}>
                        {isDragging ? 'Drop here' : 'Click to upload or drag & drop'}
                      </p>
                      <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>PDF, DOCX, HTML, JSON · Max 20MB</p>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'center' }}>
                  {[
                    { e: 'PDF',  c: '#ef4444', b: '#fee2e2' },
                    { e: 'DOCX', c: '#3b82f6', b: '#dbeafe' },
                    { e: 'HTML', c: '#f59e0b', b: '#fef3c7' },
                    { e: 'JSON', c: 'var(--color-primary-800)', b: 'var(--color-primary-50)' },
                  ].map(f => (
                    <span key={f.e} style={{ padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600, color: f.c, background: f.b }}>
                      {f.e}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {tab === 'url' && (
              <div style={S.field}>
                <label style={S.label}>Public URL</label>
                <input
                  style={{ ...S.input, fontFamily: 'var(--font-family-mono)', fontSize: 13 }}
                  value={url}
                  onChange={e => { setUrl(e.target.value); setError(null); }}
                  placeholder="https://drive.google.com/file/d/...  or any public PDF / DOCX / HTML URL"
                  disabled={isImporting}
                />

                {/* Supported URL hint chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                  {[
                    { label: '🔵 Supports any public URL',  color: '#4285f4', bg: '#e8f0fe' },

                  ].map(chip => (
                    <span key={chip.label} style={{
                      padding: '2px 8px', borderRadius: 8, fontSize: 11,
                      fontWeight: 600, color: chip.color, background: chip.bg,
                    }}>
                      {chip.label}
                    </span>
                  ))}
                </div>

                {/* Google Drive warning */}
                {isGDrive && (
                  <div style={{
                    marginTop: 6, padding: '8px 12px', borderRadius: 8,
                    background: '#eff6ff', border: '1px solid #bfdbfe',
                    fontSize: 12, color: '#1d4ed8', display: 'flex', gap: 6, alignItems: 'flex-start',
                  }}>
                    <span style={{ fontSize: 14 }}>ℹ️</span>
                    <span>
                      Google Drive detected — your backend will fetch this file directly (no CORS issue).<br />
                      Make sure the file is shared as <strong>"Anyone with the link can view"</strong>.
                    </span>
                  </div>
                )}
              </div>
            )}

          </div>

          <div style={S.footer}>
            <button style={S.cancelBtn} onClick={onClose} disabled={isImporting}>Cancel</button>
            <button
              style={{ ...S.importBtn, opacity: isImporting ? 0.7 : 1, cursor: isImporting ? 'not-allowed' : 'pointer' }}
              onClick={handleImport}
              disabled={isImporting}
            >
              {isImporting ? '⟳ Importing...' : '↑ Import Template'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

const S: Record<string, React.CSSProperties> = {
  overlay:     { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, backdropFilter: 'blur(4px)' },
  modal:       { background: '#fff', borderRadius: 16, width: 600, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 80px rgba(0,0,0,0.25)' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '22px 26px 16px', borderBottom: '1px solid var(--color-border-soft)', background: 'var(--color-bg-elevated)', borderRadius: '16px 16px 0 0' },
  title:       { fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 2 },
  subtitle:    { fontSize: 13, color: '#94a3b8' },
  closeBtn:    { background: '#f1f5f9', border: 'none', fontSize: 14, color: '#94a3b8', cursor: 'pointer', padding: '6px 8px', borderRadius: 8, lineHeight: 1 },
  body:        { flex: 1, overflowY: 'auto', padding: '20px 26px', display: 'flex', flexDirection: 'column', gap: 14 },
  errorBox:    { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b91c1c', display: 'flex', gap: 8 },
  progressBox: { border: '1px solid', borderRadius: 8, padding: '10px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 },
  grid:        { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 },
  field:       { display: 'flex', flexDirection: 'column', gap: 8 },
  label:       { fontSize: 13, fontWeight: 600, color: '#374151' },
  input:       { padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', color: '#1e293b', transition: 'border-color 0.15s' },
  select:      { padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer', color: '#1e293b' },
  tabs:        { display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 4 },
  tab:         { flex: 1, padding: 9, border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 500, color: '#64748b', background: 'transparent', cursor: 'pointer' },
  tabActive:   { background: '#fff', color: 'var(--color-primary-800)', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', fontWeight: 700 },
  dropZone:    { border: '2px dashed', borderRadius: 10, padding: '32px 20px', textAlign: 'center', transition: 'all 0.15s' },
  changeBtn:   { background: 'none', border: '1px solid #e2e8f0', borderRadius: 5, padding: '4px 12px', fontSize: 12, color: '#64748b', cursor: 'pointer' },
  footer:      { display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 26px', borderTop: '1px solid #f1f5f9' },
  cancelBtn:   { background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '10px 20px', fontSize: 14, color: '#64748b', cursor: 'pointer', fontWeight: 600 },
  importBtn:   { background: 'var(--color-primary-800)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 6px 18px rgba(96,165,250,0.24)' },
};
