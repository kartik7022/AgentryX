// src/pages/MarketplacePage.tsx
// Complete marketplace — list, search, import, publish, rate items
// Supports: templates, blocks, placeholders

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listMarketplaceItems,
  importMarketplaceItem,
  publishToMarketplace,
  type MarketplaceItem,
} from '../api/marketplace';
import { listTemplates } from '../api/templates';
import apiClient from '../api/client';
import type { Template } from '../types/api';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import '../styles/marketplace-page.css';

// ── Type colors ───────────────────────────────────────────────────────────────
const TYPE_STYLES: Record<string, { bg: string; color: string; label: string; icon: string }> = {
  template:    { bg: 'var(--color-primary-50)', color: 'var(--color-primary-800)', label: 'Template',    icon: '📄' },
  block:       { bg: '#dbeafe', color: '#1d4ed8', label: 'Block',       icon: '⊞' },
  placeholder: { bg: '#dcfce7', color: '#15803d', label: 'Placeholder', icon: '{{ }}' },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// ── Star rating component ─────────────────────────────────────────────────────
function StarRating({ rating, onRate }: { rating: number | null; onRate: (r: number) => void }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const display = hovered ?? rating ?? 0;

  return (
    <div className="mp-stars">
      {[1, 2, 3, 4, 5].map(star => (
        <span
          key={star}
          className="mp-star"
          style={{ color: star <= display ? '#f59e0b' : '#dde4ef' }}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(null)}
          onClick={() => onRate(star)}
          title={`Rate ${star} star${star > 1 ? 's' : ''}`}
        >
          ★
        </span>
      ))}
      <span className="mp-star-label">
        {rating ? rating.toFixed(1) : 'Rate'}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function MarketplacePage() {
  const navigate = useNavigate();

  const [items, setItems]             = useState<MarketplaceItem[]>([]);
  const [templates, setTemplates]     = useState<Template[]>([]);
  const [isLoading, setIsLoading]     = useState(true);
  const [typeFilter, setTypeFilter]   = useState('');
  const [tagFilter, setTagFilter]     = useState('');
  const [search, setSearch]           = useState('');
  const [importing, setImporting]     = useState<string | null>(null);
  const [imported, setImported]       = useState<Set<string>>(new Set());
  const [importMsg, setImportMsg]     = useState<{ id: string; msg: string } | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [publishType, setPublishType] = useState<'template' | 'block' | 'placeholder'>('template');
  const [publishForm, setPublishForm] = useState({
    source_id: '', name: '', description: '', tags: '', license: 'Community',
  });
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);

  // ── Load items ────────────────────────────────────────────────────────────
  const loadItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const [marketItems, tmplList] = await Promise.all([
        listMarketplaceItems({ item_type: typeFilter || undefined }),
        listTemplates(),
      ]);
      setItems(marketItems);
      setTemplates(tmplList.filter((t) => t.status === 'published'));
    } finally {
      setIsLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = items.filter((item) => {
    const matchSearch = !search ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.description ?? '').toLowerCase().includes(search.toLowerCase());
    const matchTag = !tagFilter ||
      item.tags.some((t) => t.toLowerCase().includes(tagFilter.toLowerCase()));
    return matchSearch && matchTag;
  });

  // ── Import ────────────────────────────────────────────────────────────────
  async function handleImport(item: MarketplaceItem) {
    setImporting(item.item_id);
    setImportMsg(null);
    try {
      const result = await importMarketplaceItem(item.item_id);
      setImported((prev) => new Set([...prev, item.item_id]));
      setItems((prev) =>
        prev.map((i) => i.item_id === item.item_id ? { ...i, downloads: i.downloads + 1 } : i)
      );

      if (item.type === 'template') {
        setImportMsg({ id: item.item_id, msg: '✓ Template imported as draft' });
        if (window.confirm(`"${item.name}" imported! Go to Templates to use it?`)) {
          navigate('/templates');
        }
      } else if (item.type === 'block') {
        setImportMsg({ id: item.item_id, msg: '✓ Block added to your library' });
      } else if (item.type === 'placeholder') {
        const alreadyExists = (result as { already_exists?: boolean })?.already_exists;
        setImportMsg({
          id: item.item_id,
          msg: alreadyExists
            ? '✓ Already in your registry'
            : '✓ Placeholder added to registry'
        });
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        alert(`Cannot import: ${msg || 'Source item no longer exists. It may have been deleted after publishing.'}`);
      } else {
        alert(msg || 'Import failed. Please try again.');
      }
    } finally {
      setImporting(null);
    }
  }

  // ── Rate ──────────────────────────────────────────────────────────────────
  async function handleRate(item: MarketplaceItem, stars: number) {
    try {
      const res = await apiClient.post(`/marketplace/${item.item_id}/rate`, { rating: stars });
      setItems(prev =>
        prev.map(i => i.item_id === item.item_id ? { ...i, rating: res.data.rating } : i)
      );
    } catch {
      alert('Rating failed. Please try again.');
    }
  }

  // ── Publish ───────────────────────────────────────────────────────────────
  async function handlePublish() {
    setPublishError(null);
    setPublishSuccess(null);
    if (!publishForm.source_id) { setPublishError('Please select an item to publish'); return; }
    if (!publishForm.name.trim()) { setPublishError('Name is required'); return; }

    setIsPublishing(true);
    try {
      const newItem = await publishToMarketplace({
        type:        publishType,
        source_id:   publishForm.source_id,
        name:        publishForm.name.trim(),
        description: publishForm.description.trim() || undefined,
        owner:       localStorage.getItem('tb_user_id') ?? 'dev_user',
        license:     publishForm.license,
        tags:        publishForm.tags.split(',').map((t) => t.trim()).filter(Boolean),
        is_public:   true,
      });
      setItems((prev) => [newItem, ...prev]);
      setPublishSuccess(`"${newItem.name}" published successfully!`);
      setPublishForm({ source_id: '', name: '', description: '', tags: '', license: 'Community' });
      setTimeout(() => { setShowPublish(false); setPublishSuccess(null); }, 1500);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setPublishError(msg || 'Publish failed. Please try again.');
    } finally {
      setIsPublishing(false);
    }
  }

  // ── Source options for publish modal ──────────────────────────────────────
  const [blocks, setBlocks]             = useState<{ block_id: string; name: string }[]>([]);
  const [placeholders, setPlaceholders] = useState<{ registry_id: string; name: string }[]>([]);

  useEffect(() => {
    if (!showPublish) return;
    if (publishType === 'block') {
      apiClient.get('/blocks/').then(r => setBlocks(r.data)).catch(() => setBlocks([]));
    }
    if (publishType === 'placeholder') {
      apiClient.get('/registry/placeholders').then(r => setPlaceholders(r.data)).catch(() => setPlaceholders([]));
    }
  }, [showPublish, publishType]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mp-page" style={{ padding: '28px 32px', maxWidth: '1140px' }}>

      {/* Header */}
      <div className="mp-header">
        <div className="mp-header-text">
          <h1 className="mp-title">
            <span className="mp-title-icon">🛒</span>
            Marketplace
          </h1>
          <p className="mp-subtitle">Browse, import and share templates, blocks and placeholders</p>
        </div>
        <button
          className="mp-publish-btn"
          onClick={() => { setShowPublish(true); setPublishError(null); setPublishSuccess(null); }}
        >
          ↑ Publish to Marketplace
        </button>
      </div>

      {/* Filters */}
      <div className="mp-filters">
        <input
          type="text"
          placeholder="Search marketplace..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mp-search-input"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="mp-select"
        >
          <option value="">All types</option>
          <option value="template">Templates</option>
          <option value="block">Blocks</option>
          <option value="placeholder">Placeholders</option>
        </select>
        <input
          type="text"
          placeholder="Filter by tag..."
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="mp-search-input mp-tag-input"
        />
        <span className="mp-count-badge">
          {filtered.length} item{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Loading */}
      {isLoading && <LoadingSpinner message="Loading marketplace..." />}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <div className="mp-empty">
          <span className="mp-empty-icon">🛒</span>
          <p className="mp-empty-title">
            {items.length === 0 ? 'Marketplace is empty' : 'No items match your filters'}
          </p>
          <p className="mp-empty-desc">
            {items.length === 0
              ? 'Publish your templates, blocks or placeholders to share them with others'
              : 'Try adjusting your search terms or clearing your filters'}
          </p>
        </div>
      )}

      {/* Items grid */}
      {!isLoading && filtered.length > 0 && (
        <div className="mp-grid">
          {filtered.map((item) => {
            const typeStyle   = TYPE_STYLES[item.type] ?? TYPE_STYLES.template;
            const isImporting = importing === item.item_id;
            const isImported  = imported.has(item.item_id);
            const msg         = importMsg?.id === item.item_id ? importMsg.msg : null;

            return (
              <div key={item.item_id} className="mp-card">

                {/* Card header */}
                <div className="mp-card-header">
                  <span
                    className="mp-type-badge"
                    style={{ backgroundColor: typeStyle.bg, color: typeStyle.color }}
                  >
                    {typeStyle.icon} {typeStyle.label}
                  </span>
                  <span className="mp-license">{item.license}</span>
                </div>

                {/* Name */}
                <div className="mp-card-name">{item.name}</div>

                {/* Description */}
                {item.description && (
                  <div className="mp-card-desc">{item.description}</div>
                )}

                {/* Tags */}
                {item.tags.length > 0 && (
                  <div className="mp-tags-row">
                    {item.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="mp-tag">{tag}</span>
                    ))}
                  </div>
                )}

                {/* Star rating */}
                <StarRating
                  rating={item.rating ?? null}
                  onRate={(stars) => handleRate(item, stars)}
                />

                {/* Stats */}
                <div className="mp-stats">
                  <span className="mp-stat">↓ {item.downloads} downloads</span>
                  <span className="mp-stat">by {item.owner}</span>
                </div>

                {/* Import success message */}
                {msg && (
                  <div className="mp-import-success">{msg}</div>
                )}

                {/* Footer */}
                <div className="mp-card-footer">
                  <span className="mp-card-date">{formatDate(item.created_at)}</span>
                  <button
                    className={`mp-import-btn${isImported ? ' imported' : ''}${isImporting ? ' importing' : ''}`}
                    onClick={() => !isImported && !isImporting && handleImport(item)}
                    disabled={isImporting || isImported}
                  >
                    {isImporting ? '⟳ Importing...' : isImported ? '✓ Imported' : '↓ Import'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Publish Modal */}
      {showPublish && (
        <div className="mp-overlay" onClick={() => setShowPublish(false)}>
          <div className="mp-modal" onClick={(e) => e.stopPropagation()}>

            <div className="mp-modal-header">
              <h2 className="mp-modal-title">↑ Publish to Marketplace</h2>
              <button className="mp-close-btn" onClick={() => setShowPublish(false)}>✕</button>
            </div>

            <div className="mp-modal-body">

              {publishError && <div className="mp-form-error">⚠ {publishError}</div>}
              {publishSuccess && <div className="mp-form-success">✓ {publishSuccess}</div>}

              {/* Type selector */}
              <div className="mp-field">
                <label className="mp-label">What do you want to publish?</label>
                <div className="mp-type-btns">
                  {(['template', 'block', 'placeholder'] as const).map(t => (
                    <button
                      key={t}
                      className={`mp-type-btn${publishType === t ? ' active' : ''}`}
                      onClick={() => { setPublishType(t); setPublishForm(p => ({ ...p, source_id: '' })); }}
                    >
                      {TYPE_STYLES[t].icon} {TYPE_STYLES[t].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Source selector */}
              <div className="mp-field">
                <label className="mp-label">
                  Select {TYPE_STYLES[publishType].label}{' '}
                  <span style={{ color: '#ef4444' }}>*</span>
                </label>
                {publishType === 'template' && (
                  templates.length === 0 ? (
                    <div className="mp-no-items">⚠ No published templates found. Publish a template first.</div>
                  ) : (
                    <select
                      className="mp-input"
                      value={publishForm.source_id}
                      onChange={(e) => setPublishForm(p => ({ ...p, source_id: e.target.value }))}
                    >
                      <option value="">Select a published template...</option>
                      {templates.map(t => (
                        <option key={t.template_id} value={t.template_id}>{t.name}</option>
                      ))}
                    </select>
                  )
                )}
                {publishType === 'block' && (
                  blocks.length === 0 ? (
                    <div className="mp-no-items">⚠ No blocks in library. Save blocks from the editor first.</div>
                  ) : (
                    <select
                      className="mp-input"
                      value={publishForm.source_id}
                      onChange={(e) => setPublishForm(p => ({ ...p, source_id: e.target.value }))}
                    >
                      <option value="">Select a block...</option>
                      {blocks.map((b: { block_id: string; name: string }) => (
                        <option key={b.block_id} value={b.block_id}>{b.name}</option>
                      ))}
                    </select>
                  )
                )}
                {publishType === 'placeholder' && (
                  placeholders.length === 0 ? (
                    <div className="mp-no-items">⚠ No placeholders in registry.</div>
                  ) : (
                    <select
                      className="mp-input"
                      value={publishForm.source_id}
                      onChange={(e) => setPublishForm(p => ({ ...p, source_id: e.target.value }))}
                    >
                      <option value="">Select a placeholder...</option>
                      {placeholders.map((p: { registry_id: string; name: string }) => (
                        <option key={p.registry_id} value={p.registry_id}>{`{{${p.name}}}`}</option>
                      ))}
                    </select>
                  )
                )}
              </div>

              {/* Name */}
              <div className="mp-field">
                <label className="mp-label">
                  Marketplace Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  className="mp-input"
                  value={publishForm.name}
                  onChange={(e) => setPublishForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Loan Closure Letter Template"
                />
              </div>

              {/* Description */}
              <div className="mp-field">
                <label className="mp-label">Description</label>
                <textarea
                  className="mp-textarea"
                  rows={3}
                  value={publishForm.description}
                  onChange={(e) => setPublishForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="What does this do? Who is it for?"
                />
              </div>

              {/* Tags */}
              <div className="mp-field">
                <label className="mp-label">Tags (comma separated)</label>
                <input
                  className="mp-input"
                  value={publishForm.tags}
                  onChange={(e) => setPublishForm(p => ({ ...p, tags: e.target.value }))}
                  placeholder="banking, loan, letter"
                />
              </div>

              {/* License */}
              <div className="mp-field">
                <label className="mp-label">License</label>
                <select
                  className="mp-input"
                  value={publishForm.license}
                  onChange={(e) => setPublishForm(p => ({ ...p, license: e.target.value }))}
                >
                  {['Community', 'MIT', 'Apache 2.0', 'Commercial'].map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>

            </div>

            <div className="mp-modal-footer">
              <button className="mp-cancel-btn" onClick={() => setShowPublish(false)}>
                Cancel
              </button>
              <button
                className="mp-submit-btn"
                onClick={handlePublish}
                disabled={isPublishing}
              >
                {isPublishing ? '⟳ Publishing...' : '↑ Publish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
