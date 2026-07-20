// src/components/editor/blocks/ImageBlock.tsx

import { useRef, useState } from 'react';

interface Props {
  src?: string;
  onChange: (src: string) => void;
}

export default function ImageBlock({ src, onChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<'url' | 'upload'>(
    src && !src.startsWith('{{') ? 'url' : 'upload'
  );
  const [urlInput, setUrlInput] = useState(src?.startsWith('{{') ? '' : src ?? '');

  // ── Handle file selection ─────────────────────────────────────────────────
  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (JPG, PNG, GIF, SVG, WebP)');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      onChange(result); // base64 data URL
    };
    reader.readAsDataURL(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  // ── Drag and drop ─────────────────────────────────────────────────────────
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  // ── URL input ─────────────────────────────────────────────────────────────
  function handleUrlChange(value: string) {
    setUrlInput(value);
    onChange(value);
  }

  // ── Clear image ───────────────────────────────────────────────────────────
  function handleClear() {
    onChange('');
    setUrlInput('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const isToken = src?.startsWith('{{') && src?.endsWith('}}');
  const hasImage = src && src.length > 0;

  return (
    <div style={styles.wrapper} onClick={(e) => e.stopPropagation()}>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button
          style={{ ...styles.tab, ...(activeTab === 'upload' ? styles.tabActive : {}) }}
          onClick={(e) => { e.stopPropagation(); setActiveTab('upload'); }}
        >
          ⬆ Upload Image
        </button>
        <button
          style={{ ...styles.tab, ...(activeTab === 'url' ? styles.tabActive : {}) }}
          onClick={(e) => { e.stopPropagation(); setActiveTab('url'); }}
        >
          🔗 Image URL
        </button>
      </div>

      {/* Upload tab */}
      {activeTab === 'upload' && (
        <div
          style={{
            ...styles.dropZone,
            borderColor: isDragging ? 'var(--color-primary-200)' : '#e2e8f0',
            backgroundColor: isDragging ? 'var(--color-primary-50)' : '#f8fafc',
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileInput}
          />
          <div style={styles.dropIcon}>🖼️</div>
          <p style={styles.dropText}>
            {isDragging ? 'Drop image here' : 'Click to upload or drag & drop'}
          </p>
          <p style={styles.dropHint}>JPG, PNG, GIF, SVG, WebP supported</p>
        </div>
      )}

      {/* URL tab */}
      {activeTab === 'url' && (
        <div style={styles.urlRow}>
          <input
            style={styles.urlInput}
            value={urlInput}
            onChange={(e) => handleUrlChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder="https://example.com/image.jpg or {{logo_url}}"
          />
          {urlInput && (
            <button
              style={styles.clearBtn}
              onClick={(e) => { e.stopPropagation(); handleUrlChange(''); }}
            >✕</button>
          )}
        </div>
      )}

      {/* Preview */}
      {hasImage && (
        <div style={styles.previewWrapper}>
          {isToken ? (
            // Token placeholder
            <div style={styles.tokenPreview}>
              <span style={styles.tokenText}>{src}</span>
              <p style={styles.tokenHint}>Image resolved from datasource at render time</p>
            </div>
          ) : src?.startsWith('data:') || src?.startsWith('http') || src?.startsWith('/') ? (
            // Real image
            <div style={styles.imageContainer}>
              <img
                src={src}
                alt="Block preview"
                style={styles.previewImg}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.opacity = '0.3';
                }}
              />
              <button
                style={styles.removeBtn}
                onClick={(e) => { e.stopPropagation(); handleClear(); }}
                title="Remove image"
              >
                ✕ Remove
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* Empty state */}
      {!hasImage && (
        <div style={styles.emptyState}>
          <span style={styles.emptyIcon}>⊡</span>
          <p style={styles.emptyText}>
            Upload an image or enter a URL above
          </p>
        </div>
      )}

      {/* Size hint */}
      {hasImage && !isToken && (
        <div style={styles.sizeRow}>
          <span style={styles.sizeHint}>
            {src?.startsWith('data:') ? '📎 Uploaded image (embedded as base64)' : '🔗 External image URL'}
          </span>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper:        { display: 'flex', flexDirection: 'column', gap: '10px' },
  tabs:           { display: 'flex', gap: '4px', backgroundColor: '#f1f5f9', borderRadius: '8px', padding: '3px' },
  tab:            { flex: 1, padding: '6px', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 500, color: '#64748b', backgroundColor: 'transparent', cursor: 'pointer' },
  tabActive:      { backgroundColor: '#fff', color: 'var(--color-primary-800)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  dropZone:       { border: '2px dashed #e2e8f0', borderRadius: '8px', padding: '24px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' },
  dropIcon:       { fontSize: '28px' },
  dropText:       { fontSize: '13px', fontWeight: 500, color: '#475569' },
  dropHint:       { fontSize: '11px', color: '#94a3b8' },
  urlRow:         { display: 'flex', gap: '6px', alignItems: 'center' },
  urlInput:       { flex: 1, padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', color: '#334155', outline: 'none', fontFamily: 'var(--font-family-mono)' },
  clearBtn:       { background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', color: '#94a3b8', cursor: 'pointer' },
  previewWrapper: { borderRadius: '8px', overflow: 'hidden' },
  imageContainer: { position: 'relative', display: 'inline-block', width: '100%' },
  previewImg:     { maxWidth: '100%', maxHeight: '200px', objectFit: 'contain', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'block' },
  removeBtn:      { marginTop: '6px', background: 'none', border: '1px solid #fecaca', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#ef4444', cursor: 'pointer' },
  tokenPreview:   { backgroundColor: 'var(--color-primary-50)', borderRadius: '6px', padding: '12px 16px', textAlign: 'center' },
  tokenText:      { fontFamily: 'var(--font-family-mono)', fontSize: '14px', color: 'var(--color-primary-800)', fontWeight: 500 },
  tokenHint:      { fontSize: '11px', color: 'var(--color-primary-800)', marginTop: '4px' },
  emptyState:     { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '2px dashed #e2e8f0', gap: '6px' },
  emptyIcon:      { fontSize: '28px', color: '#cbd5e1' },
  emptyText:      { fontSize: '12px', color: '#94a3b8', textAlign: 'center' },
  sizeRow:        { display: 'flex', justifyContent: 'flex-end' },
  sizeHint:       { fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' },
};
