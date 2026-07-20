// src/pages/domainpacks/DomainPacksPage.tsx
import { useState, useEffect } from 'react';
import { listDomainPacks, installDomainPack, uninstallDomainPack, type DomainPack } from '../../services/api';

const card: React.CSSProperties = {
  background: 'var(--color-bg-surface)', borderRadius: '16px',
  border: '1px solid var(--color-border-soft)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
};

const CATEGORY_META: Record<string, { label: string; icon: string; bg: string; color: string; border: string }> = {
  Banking:    { label: 'Banking & BFSI', icon: '🏦', bg: 'var(--color-status-info-bg)', color: 'var(--color-status-info-text)', border: 'var(--color-primary-200)' },
  Insurance:  { label: 'Insurance',      icon: '🛡',  bg: 'var(--color-status-success-bg)', color: 'var(--color-status-success-text)', border: 'var(--color-status-success-border)' },
  Healthcare: { label: 'Healthcare',     icon: '🏥', bg: 'var(--color-status-error-bg)', color: 'var(--color-status-error-text)', border: 'var(--color-status-error-border)' },
  ITSM:       { label: 'ITSM',           icon: '⚙',  bg: 'var(--color-status-warning-bg)', color: 'var(--color-status-warning-text)', border: 'var(--color-status-warning-border)' },
};

export default function DomainPacksPage() {
  const [packs, setPacks]               = useState<DomainPack[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [successMsg, setSuccessMsg]     = useState('');
  const [installing, setInstalling]     = useState<string | null>(null);
  const [uninstalling, setUninstalling] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus]     = useState('');
  const [search, setSearch]                 = useState('');
  const [expandedId, setExpandedId]         = useState<string | null>(null);

  useEffect(() => { loadPacks(); }, []);

  async function loadPacks() {
    setLoading(true);
    try {
      const data = await listDomainPacks();
      setPacks(data.domain_packs || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load domain packs');
    } finally {
      setLoading(false);
    }
  }

  function showSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  }

  async function handleInstall(pack: DomainPack) {
    setInstalling(pack.pack_id);
    try {
      await installDomainPack(pack.pack_id);
      await loadPacks();
      showSuccess(`"${pack.name}" installed successfully.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to install');
    } finally {
      setInstalling(null);
    }
  }

  async function handleUninstall(pack: DomainPack) {
    setUninstalling(pack.pack_id);
    try {
      await uninstallDomainPack(pack.pack_id);
      await loadPacks();
      showSuccess(`"${pack.name}" uninstalled.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to uninstall');
    } finally {
      setUninstalling(null);
    }
  }

  const categories = [...new Set(packs.map(p => p.category))].sort();

  const filtered = packs.filter(p => {
    const q           = search.toLowerCase();
    const matchSearch = !q
      || p.name.toLowerCase().includes(q)
      || p.description.toLowerCase().includes(q)
      || p.features.some(f => f.toLowerCase().includes(q));
    const matchCat    = !filterCategory || p.category === filterCategory;
    const matchStatus = !filterStatus
      || (filterStatus === 'installed' && p.is_installed)
      || (filterStatus === 'available' && !p.is_installed);
    return matchSearch && matchCat && matchStatus;
  });

  const installedCount = packs.filter(p => p.is_installed).length;

  const inputStyle: React.CSSProperties = {
    background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-base)', borderRadius: '10px',
    padding: '9px 14px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-strong)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)', fontFamily: 'inherit',
  };

  return (
    <div style={{ padding: '32px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)' }}>Domain Packs</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', marginTop: '4px' }}>
            Pre-built orchestration workflows for Banking, Insurance, Healthcare and ITSM.
          </p>
        </div>
        <button onClick={loadPacks}
          style={{ padding: '9px 18px', borderRadius: '10px', border: '1px solid var(--color-border-base)', background: 'var(--color-bg-surface)', color: 'var(--color-text-base)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' }}>
          ↺ Refresh
        </button>
      </div>

      {/* Success */}
      {successMsg && (
        <div style={{ background: 'var(--color-status-success-bg)', border: '1px solid var(--color-status-success-border)', borderRadius: '12px', padding: '12px 16px', color: 'var(--color-status-success-text)', fontSize: 'var(--font-size-sm)', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
          <span>✓ {successMsg}</span>
          <button onClick={() => setSuccessMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-status-success-text)' }}>✕</button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: 'var(--color-status-error-bg)', border: '1px solid var(--color-status-error-border)', borderRadius: '12px', padding: '12px 16px', color: 'var(--color-status-error-text)', fontSize: 'var(--font-size-sm)', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
          <span>⚠ {error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-status-error-text)' }}>✕</button>
        </div>
      )}

      {/* Stats */}
      {packs.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px', marginBottom: '28px' }}>
          {[
            { label: 'Total Packs', value: packs.length,            color: 'var(--color-primary-800)', bg: 'var(--color-primary-50)' },
            { label: 'Installed',   value: installedCount,          color: 'var(--color-status-success-text)', bg: 'var(--color-status-success-bg)' },
            { label: 'Available',   value: packs.length - installedCount, color: 'var(--color-text-muted)', bg: 'var(--color-bg-canvas)' },
            { label: 'Categories',  value: categories.length,       color: 'var(--color-status-warning-text)', bg: 'var(--color-status-warning-bg)' },
          ].map(s => (
            <div key={s.label} style={{ ...card, padding: '20px' }}>
              <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: s.color, marginBottom: '4px' }}>{s.value}</div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Category pills */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button onClick={() => setFilterCategory('')}
          style={{ padding: '6px 14px', borderRadius: '999px', border: `1px solid ${!filterCategory ? 'var(--color-primary-800)' : 'var(--color-border-soft)'}`, background: !filterCategory ? 'var(--color-primary-800)' : 'var(--color-bg-surface)', color: !filterCategory ? 'var(--color-bg-surface)' : 'var(--color-text-muted)', fontSize: '13px', fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer' }}>
          All
        </button>
        {categories.map(cat => {
          const meta     = CATEGORY_META[cat] || { label: cat, icon: '📦', bg: 'var(--color-bg-canvas)', color: 'var(--color-text-base)', border: 'var(--color-border-soft)' };
          const isActive = filterCategory === cat;
          return (
            <button key={cat} onClick={() => setFilterCategory(isActive ? '' : cat)}
              style={{ padding: '6px 14px', borderRadius: '999px', border: `1px solid ${isActive ? meta.color : meta.border}`, background: isActive ? meta.bg : 'var(--color-bg-surface)', color: isActive ? meta.color : 'var(--color-text-muted)', fontSize: '13px', fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              {meta.icon} {meta.label}
            </button>
          );
        })}
      </div>

      {/* Search and filter */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '320px' }}>
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-soft)' }}>🔍</span>
          <input style={{ ...inputStyle, width: '100%', paddingLeft: '36px', boxSizing: 'border-box' as const }}
            placeholder="Search packs…"
            value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <select style={{ ...inputStyle, minWidth: '150px' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="installed">Installed</option>
          <option value="available">Available</option>
        </select>
        {(search || filterStatus) && (
          <button onClick={() => { setSearch(''); setFilterStatus(''); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
            Clear
          </button>
        )}
      </div>

      {/* Loading */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid var(--color-border-soft)', borderTopColor: 'var(--color-primary-800)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}/>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : packs.length === 0 ? (
        <div style={{ ...card, padding: '60px', textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📦</div>
          <p style={{ color: 'var(--color-text-base)', fontWeight: 'var(--font-weight-semibold)' }}>No domain packs available</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...card, padding: '60px', textAlign: 'center' }}>
          <p style={{ color: 'var(--color-text-base)', fontWeight: 'var(--font-weight-semibold)', marginBottom: '8px' }}>No packs match your filters</p>
          <button onClick={() => { setSearch(''); setFilterCategory(''); setFilterStatus(''); }}
            style={{ background: 'none', border: '1px solid var(--color-border-base)', borderRadius: '8px', padding: '8px 16px', color: 'var(--color-text-base)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' }}>
            Clear all filters
          </button>
        </div>
      ) : (
        <>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-soft)', marginBottom: '16px' }}>
            Showing {filtered.length} of {packs.length} packs
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px,1fr))', gap: '16px' }}>
            {filtered.map(pack => {
              const meta          = CATEGORY_META[pack.category] || { label: pack.category, icon: '📦', bg: 'var(--color-bg-canvas)', color: 'var(--color-text-base)', border: 'var(--color-border-soft)' };
              const isInstalling  = installing === pack.pack_id;
              const isUninstalling = uninstalling === pack.pack_id;
              const isExpanded    = expandedId === pack.pack_id;

              return (
                <div key={pack.pack_id} style={{ ...card, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

                  {/* Header */}
                  <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--font-size-lg)', flexShrink: 0, border: `1px solid ${meta.border}` }}>
                      {meta.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                        <h3 style={{ fontSize: '15px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', margin: 0 }}>{pack.name}</h3>
                        <span style={{ fontSize: '11px', color: 'var(--color-text-soft)', fontFamily: 'var(--font-family-mono)' }}>v{pack.version}</span>
                        {pack.is_installed && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--color-status-success-bg)', color: 'var(--color-status-success-text)', border: '1px solid var(--color-status-success-border)', padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 'var(--font-weight-semibold)' }}>
                            ✓ Installed
                          </span>
                        )}
                      </div>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`, padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 'var(--font-weight-semibold)' }}>
                        {meta.icon} {meta.label}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  <div style={{ padding: '12px 20px' }}>
                    <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>{pack.description}</p>
                  </div>

                  {/* Stats */}
                  <div style={{ padding: '0 20px 12px', display: 'flex', gap: '16px' }}>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      <strong style={{ color: 'var(--color-text-strong)' }}>{pack.plan_count}</strong> plans
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      <strong style={{ color: 'var(--color-text-strong)' }}>{pack.templates?.length ?? 0}</strong> templates
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                      <strong style={{ color: 'var(--color-text-strong)' }}>{pack.features?.length ?? 0}</strong> features
                    </div>
                  </div>

                  {/* Expand */}
                  <button onClick={() => setExpandedId(isExpanded ? null : pack.pack_id)}
                    style={{ margin: '0 20px 12px', padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--color-border-soft)', background: 'var(--color-bg-canvas)', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>{isExpanded ? 'Hide features' : `View ${pack.features?.length ?? 0} features`}</span>
                    <span style={{ display: 'inline-block', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▼</span>
                  </button>

                  {/* Features */}
                  {isExpanded && (
                    <div style={{ margin: '0 20px 12px', background: 'var(--color-bg-canvas)', borderRadius: '10px', border: '1px solid var(--color-border-soft)', padding: '14px' }}>
                      <p style={{ fontSize: '11px', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-muted)', marginBottom: '10px' }}>Included Features</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {(pack.features || []).map(f => (
                          <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--color-text-base)' }}>
                            <span style={{ color: 'var(--color-accent-500)', fontSize: 'var(--font-size-sm)', flexShrink: 0 }}>✓</span>
                            {f}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action */}
                  <div style={{ padding: '12px 20px 20px', marginTop: 'auto' }}>
                    {pack.is_installed ? (
                      <button onClick={() => handleUninstall(pack)} disabled={!!isUninstalling}
                        style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid var(--color-status-error-border)', background: 'var(--color-status-error-bg)', color: 'var(--color-status-error-text)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', cursor: isUninstalling ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        {isUninstalling ? '...' : '🗑 Uninstall Pack'}
                      </button>
                    ) : (
                      <button onClick={() => handleInstall(pack)} disabled={!!isInstalling}
                        style={{ width: '100%', padding: '10px', borderRadius: '10px', border: 'none', background: isInstalling ? 'var(--color-primary-200)' : 'var(--color-primary-800)', color: 'var(--color-bg-surface)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', cursor: isInstalling ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        {isInstalling ? '...' : '⬇ Install Pack'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}   