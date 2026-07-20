// src/pages/evidence/EvidenceViewerPage.tsx
import { useState, useEffect } from 'react';
import { listEvidenceBundles, auditNarrative, type EvidenceBundle } from '../../services/api';

const card: React.CSSProperties = {
  background: 'var(--color-bg-surface)', borderRadius: '16px',
  border: '1px solid var(--color-border-soft)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
};

function JsonViewer({ data, depth = 0 }: { data: unknown; depth?: number }) {
  const [open, setOpen] = useState(depth === 0);
  if (data === null)             return <span style={{ color: 'var(--color-text-soft)' }}>null</span>;
  if (typeof data === 'boolean') return <span style={{ color: 'var(--color-status-warning-text)' }}>{String(data)}</span>;
  if (typeof data === 'number')  return <span style={{ color: 'var(--color-primary-800)' }}>{data}</span>;
  if (typeof data === 'string')  return <span style={{ color: 'var(--color-status-success-text)' }}>"{data}"</span>;
  if (Array.isArray(data)) {
    if (!data.length) return <span style={{ color: 'var(--color-text-soft)' }}>[]</span>;
    return (
      <span>
        <button onClick={() => setOpen(!open)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', padding: 0 }}>
          {open ? '▼ [' : `▶ [${data.length} items]`}
        </button>
        {open && (
          <div style={{ marginLeft: '16px' }}>
            {data.map((v, i) => <div key={i}><JsonViewer data={v} depth={depth + 1}/></div>)}
            <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>]</div>
          </div>
        )}
      </span>
    );
  }
  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    if (!entries.length) return <span style={{ color: 'var(--color-text-soft)' }}>{'{}'}</span>;
    return (
      <span>
        <button onClick={() => setOpen(!open)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', padding: 0 }}>
          {open ? '▼ {' : `▶ {${entries.length} keys}`}
        </button>
        {open && (
          <div style={{ marginLeft: '16px' }}>
            {entries.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--color-primary-800)', fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', flexShrink: 0 }}>"{k}":</span>
                <JsonViewer data={v} depth={depth + 1}/>
              </div>
            ))}
            <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>{'}'}</div>
          </div>
        )}
      </span>
    );
  }
  return <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)' }}>{String(data)}</span>;
}

// ── Readable Snapshot ──────────────────────────────────────────────
function ReadableSnapshot({ data }: { data: Record<string, unknown> }) {
  const renderValue = (value: unknown): string => {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'boolean') return value ? 'Yes ✅' : 'No ❌';
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const formatKey = (key: string): string => {
    return key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  };

  const getRiskColor = (key: string, value: unknown): string => {
    const v = String(value).toUpperCase();
    if (key.includes('risk') || key.includes('level')) {
      if (v === 'HIGH' || v === 'CRITICAL') return 'var(--color-status-error-text)';
      if (v === 'MEDIUM') return 'var(--color-status-warning-text)';
      if (v === 'LOW') return 'var(--color-status-success-text)';
    }
    if (key.includes('decision') || key.includes('status') || key.includes('result')) {
      if (v.includes('APPROVE')) return 'var(--color-status-success-text)';
      if (v.includes('REJECT')) return 'var(--color-status-error-text)';
      if (v.includes('CONDITION')) return 'var(--color-status-warning-text)';
      if (v === 'VERIFIED') return 'var(--color-status-success-text)';
      if (v === 'PENDING') return 'var(--color-status-warning-text)';
      if (v === 'FAILED') return 'var(--color-status-error-text)';
      if (v === 'SUCCESS') return 'var(--color-status-success-text)';
      if (v === 'PASS') return 'var(--color-status-success-text)';
      if (v === 'FAIL') return 'var(--color-status-error-text)';
    }
    return 'var(--color-text-strong)';
  };

  const renderField = (key: string, value: unknown, depth = 0): React.ReactNode => {
    // Nested object
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return (
        <div key={key} style={{ marginBottom: '12px' }}>
          <p style={{ fontSize: '11px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary-800)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
            {formatKey(key)}
          </p>
          <div style={{ background: depth === 0 ? 'var(--color-bg-canvas)' : 'var(--color-bg-surface)', borderRadius: '8px', border: '1px solid var(--color-border-soft)', padding: '10px 14px' }}>
            {Object.entries(value as Record<string, unknown>).map(([k, v]) =>
              renderField(k, v, depth + 1)
            )}
          </div>
        </div>
      );
    }

    // Array
    if (Array.isArray(value)) {
      return (
        <div key={key} style={{ marginBottom: '10px' }}>
          <p style={{ fontSize: '11px', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
            {formatKey(key)}
          </p>
          {value.length === 0 ? (
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-soft)' }}>None</span>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {value.map((item, i) => (
                <span key={i} style={{
                  background: 'var(--color-primary-50)', color: 'var(--color-primary-800)',
                  padding: '3px 10px', borderRadius: '999px',
                  fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-medium)'
                }}>
                  {typeof item === 'object' ? JSON.stringify(item) : String(item)}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    }

    // Primitive
    return (
      <div key={key} style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', padding: '8px 0',
        borderBottom: '1px solid var(--color-bg-muted)'
      }}>
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 'var(--font-weight-medium)' }}>
          {formatKey(key)}
        </span>
        <span style={{ fontSize: '13px', fontWeight: 'var(--font-weight-bold)', color: getRiskColor(key, value), textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>
          {renderValue(value)}
        </span>
      </div>
    );
  };

  return (
    <div>
      {Object.entries(data).map(([key, value]) => renderField(key, value))}
    </div>
  );
}

// ── Snapshot Viewer with Toggle ────────────────────────────────────
function SnapshotViewer({ snapshot }: { snapshot: Record<string, unknown> }) {
  const [view, setView] = useState<'readable' | 'json'>('readable');

  return (
    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-bg-muted)' }}>
      {/* Header with toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <p style={{ fontSize: '11px', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)' }}>
          Result Snapshot
        </p>
        <div style={{ display: 'flex', background: 'var(--color-bg-muted)', borderRadius: '8px', padding: '3px', gap: '2px' }}>
          <button
            onClick={() => setView('readable')}
            style={{
              padding: '4px 12px', borderRadius: '6px', border: 'none',
              fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer',
              background: view === 'readable' ? 'var(--color-primary-800)' : 'transparent',
              color: view === 'readable' ? 'var(--color-bg-surface)' : 'var(--color-text-muted)',
              transition: 'all 0.15s',
            }}>
            📋 Readable
          </button>
          <button
            onClick={() => setView('json')}
            style={{
              padding: '4px 12px', borderRadius: '6px', border: 'none',
              fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer',
              background: view === 'json' ? 'var(--color-primary-800)' : 'transparent',
              color: view === 'json' ? 'var(--color-bg-surface)' : 'var(--color-text-muted)',
              transition: 'all 0.15s',
            }}>
            {'{ } JSON'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ background: 'var(--color-bg-canvas)', borderRadius: '8px', border: '1px solid var(--color-border-soft)', padding: '14px', maxHeight: '300px', overflowY: 'auto' }}>
        {view === 'readable' ? (
          <ReadableSnapshot data={snapshot} />
        ) : (
          <div style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', lineHeight: 1.6 }}>
            <JsonViewer data={snapshot} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Bundle Card ────────────────────────────────────────────────────
function BundleCard({ bundle }: { bundle: EvidenceBundle }) {
  const [expanded, setExpanded]     = useState(false);
  const [narrative, setNarrative]   = useState('');
  const [loadingNarrative, setLoadingNarrative] = useState(false);
  const [copied, setCopied]         = useState(false);

  async function handleNarrative() {
    setLoadingNarrative(true);
    try {
      const result = await auditNarrative({
        evidence_id: bundle.evidence_id,
        format:      'SUMMARY',
        regulation:  'BFSI',
      });
      setNarrative(result.narrative);
    } catch {
      setNarrative('Failed to generate narrative.');
    } finally {
      setLoadingNarrative(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(JSON.stringify(bundle, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{ ...card, marginBottom: '10px', overflow: 'hidden' }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px', cursor: 'pointer' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-canvas)')}
        onMouseLeave={e => (e.currentTarget.style.background = '')}>

        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--color-status-success-bg)', color: 'var(--color-status-success-text)', border: '1px solid var(--color-status-success-border)', padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 'var(--font-weight-semibold)', flexShrink: 0 }}>
          🔒 Certified
        </span>

        <span style={{ fontFamily: 'var(--font-family-mono)', fontWeight: 'var(--font-weight-bold)', fontSize: '13px', color: 'var(--color-text-strong)', flex: 1 }}>
          {bundle.plan_name}
        </span>

        <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: '11px', color: 'var(--color-text-soft)', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {bundle.step_key}
        </span>

        <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: '11px', background: 'var(--color-bg-muted)', color: 'var(--color-text-base)', padding: '2px 8px', borderRadius: '6px' }}>
          {bundle.tenant_id}
        </span>

        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-soft)', minWidth: '140px', textAlign: 'right' }}>
          {new Date(bundle.created_at).toLocaleString()}
        </span>

        <span style={{ color: 'var(--color-text-soft)', fontSize: 'var(--font-size-xs)', display: 'inline-block', transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s', flexShrink: 0 }}>▼</span>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--color-bg-muted)' }}>
          {/* Metadata */}
          <div style={{ padding: '16px 20px', background: 'var(--color-bg-canvas)', borderBottom: '1px solid var(--color-bg-muted)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: '10px' }}>
              {[
                { label: 'Evidence ID',    value: bundle.evidence_id },
                { label: 'Execution ID',   value: bundle.execution_id },
                { label: 'Step Key',       value: bundle.step_key },
                { label: 'Tenant ID',      value: bundle.tenant_id },
                { label: 'Hash (SHA-256)', value: bundle.hash.substring(0, 16) + '...' },
                { label: 'Audit Status',   value: bundle.signed ? 'Certified — Tamper Proof' : 'Not Certified' },
              ].map(m => (
                <div key={m.label} style={{ background: 'var(--color-bg-surface)', borderRadius: '10px', border: '1px solid var(--color-border-soft)', padding: '10px 12px' }}>
                  <p style={{ fontSize: '10px', color: 'var(--color-text-soft)', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>{m.label}</p>
                  <p style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-strong)', fontWeight: 'var(--font-weight-semibold)', wordBreak: 'break-all' }}>{m.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* SQL Evidence */}
          {bundle.sanitized_sql && (
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-bg-muted)' }}>
              <p style={{ fontSize: '11px', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', marginBottom: '8px' }}>Sanitized SQL</p>
              <pre style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-base)', background: 'var(--color-bg-canvas)', borderRadius: '8px', border: '1px solid var(--color-border-soft)', padding: '12px', overflowX: 'auto', margin: 0 }}>
                {bundle.sanitized_sql}
              </pre>
            </div>
          )}

          {/* Result Snapshot with toggle */}
          {bundle.result_snapshot && Object.keys(bundle.result_snapshot).length > 0 && (
            <SnapshotViewer snapshot={bundle.result_snapshot} />
          )}

          {/* AI Narrative */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-bg-muted)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <p style={{ fontSize: '11px', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)' }}>AI Audit Narrative</p>
              <button onClick={handleNarrative} disabled={loadingNarrative}
                style={{ padding: '5px 12px', borderRadius: '8px', border: '1px solid var(--color-border-base)', background: 'var(--color-bg-surface)', color: 'var(--color-text-base)', fontSize: 'var(--font-size-xs)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                {loadingNarrative ? '...' : '✨ Generate Narrative'}
              </button>
            </div>
            {narrative && (
              <pre style={{ fontFamily: 'inherit', fontSize: '13px', color: 'var(--color-text-base)', background: 'var(--color-bg-canvas)', borderRadius: '8px', border: '1px solid var(--color-border-soft)', padding: '14px', whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0 }}>
                {narrative}
              </pre>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: '12px 20px', background: 'var(--color-bg-canvas)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              <span>🔒</span>
              <span>SHA-256:</span>
              <code style={{ fontFamily: 'var(--font-family-mono)', background: 'var(--color-border-soft)', padding: '2px 8px', borderRadius: '4px', color: 'var(--color-text-base)', fontSize: '11px' }}>
                {bundle.hash.substring(0, 32)}...
              </code>
            </div>
            <button onClick={handleCopy}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '8px', border: '1px solid var(--color-border-base)', background: 'var(--color-bg-surface)', color: 'var(--color-text-base)', fontSize: 'var(--font-size-xs)', cursor: 'pointer' }}>
              {copied ? '✓ Copied' : '⎘ Copy Bundle'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────
export default function EvidenceViewerPage() {
  const [bundles, setBundles]       = useState<EvidenceBundle[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');
  const [filterPlan, setFilterPlan] = useState('');

  useEffect(() => { loadBundles(); }, []);

  async function loadBundles() {
    setLoading(true);
    try {
      const data = await listEvidenceBundles();
      setBundles(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load evidence bundles');
    } finally {
      setLoading(false);
    }
  }

  const planNames = [...new Set(bundles.map(b => b.plan_name))].sort();

  const filtered = bundles.filter(b => {
    const q           = search.toLowerCase();
    const matchSearch = !q
      || b.plan_name.toLowerCase().includes(q)
      || b.step_key.toLowerCase().includes(q)
      || b.tenant_id.toLowerCase().includes(q)
      || b.hash.toLowerCase().includes(q);
    const matchPlan = !filterPlan || b.plan_name === filterPlan;
    return matchSearch && matchPlan;
  });

  const inputStyle: React.CSSProperties = {
    background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-base)', borderRadius: '10px',
    padding: '9px 14px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-strong)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)', fontFamily: 'inherit',
  };

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)' }}>Evidence Viewer</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', marginTop: '4px' }}>
          Immutable audit records stored in PostgreSQL with SHA-256 cryptographic signatures. Tamper-proof and certified.
        </p>
      </div>

      {/* Stats */}
      {bundles.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px', marginBottom: '24px' }}>
          {[
            { label: 'Total Bundles',  value: bundles.length,                                  color: 'var(--color-primary-800)', bg: 'var(--color-primary-50)' },
            { label: 'Plans Covered',  value: new Set(bundles.map(b => b.plan_name)).size,     color: 'var(--color-status-success-text)', bg: 'var(--color-status-success-bg)' },
            { label: 'Certified',      value: bundles.filter(b => b.signed).length,            color: 'var(--color-status-warning-text)', bg: 'var(--color-status-warning-bg)' },
          ].map(s => (
            <div key={s.label} style={{ ...card, padding: '20px' }}>
              <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: s.color, marginBottom: '4px' }}>{s.value}</div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* WORM notice */}
      <div style={{ background: 'var(--color-status-success-bg)', border: '1px solid var(--color-status-success-border)', borderRadius: '12px', padding: '14px 18px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: 'var(--font-size-lg)' }}>🔒</span>
        <div>
          <p style={{ fontSize: '13px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-status-success-text)', marginBottom: '2px' }}>Tamper-Proof Audit Storage</p>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-status-success-text)' }}>
            All audit records are stored with SHA-256 cryptographic signatures. Once saved, records cannot be modified or deleted.
          </p>
        </div>
        <button onClick={loadBundles}
          style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--color-status-success-border)', background: 'var(--color-bg-surface)', color: 'var(--color-status-success-text)', fontSize: 'var(--font-size-xs)', cursor: 'pointer', flexShrink: 0 }}>
          ↺ Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: 'var(--color-status-error-bg)', border: '1px solid var(--color-status-error-border)', borderRadius: '12px', padding: '12px 16px', color: 'var(--color-status-error-text)', fontSize: 'var(--font-size-sm)', marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
          <span>⚠ {error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-status-error-text)' }}>✕</button>
        </div>
      )}

      {/* Filters */}
      {bundles.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '300px' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-soft)' }}>🔍</span>
            <input style={{ ...inputStyle, width: '100%', paddingLeft: '36px', boxSizing: 'border-box' as const }}
              placeholder="Search by plan, step, hash…"
              value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <select style={{ ...inputStyle, minWidth: '180px' }} value={filterPlan} onChange={e => setFilterPlan(e.target.value)}>
            <option value="">All plans</option>
            {planNames.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {(search || filterPlan) && (
            <button onClick={() => { setSearch(''); setFilterPlan(''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
              Clear
            </button>
          )}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid var(--color-border-soft)', borderTopColor: 'var(--color-primary-800)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}/>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : bundles.length === 0 ? (
        <div style={{ ...card, padding: '80px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
          <p style={{ color: 'var(--color-text-base)', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-md)', marginBottom: '8px' }}>No audit records yet</p>
          <p style={{ color: 'var(--color-text-soft)', fontSize: 'var(--font-size-sm)' }}>
            Execute a plan to generate audit records automatically.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...card, padding: '60px', textAlign: 'center' }}>
          <p style={{ color: 'var(--color-text-base)', fontWeight: 'var(--font-weight-semibold)', marginBottom: '8px' }}>No records match your filters</p>
          <button onClick={() => { setSearch(''); setFilterPlan(''); }}
            style={{ background: 'none', border: '1px solid var(--color-border-base)', borderRadius: '8px', padding: '8px 16px', color: 'var(--color-text-base)', fontSize: 'var(--font-size-sm)', cursor: 'pointer' }}>
            Clear filters
          </button>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-soft)', marginBottom: '12px' }}>
            Showing {filtered.length} of {bundles.length} records
          </p>
          {filtered.map(bundle => (
            <BundleCard key={bundle.evidence_id} bundle={bundle} />
          ))}
        </div>
      )}
    </div>
  );
}