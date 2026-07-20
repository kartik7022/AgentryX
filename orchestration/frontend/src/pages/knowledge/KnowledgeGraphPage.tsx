// src/pages/knowledge/KnowledgeGraphPage.tsx
import { useState, useEffect } from 'react';
import { getKnowledgeEntity } from '../../services/api';

const card: React.CSSProperties = {
  background: 'var(--color-bg-surface)', borderRadius: '16px',
  border: '1px solid var(--color-border-soft)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
};

const inp: React.CSSProperties = {
  background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-base)',
  borderRadius: '10px', padding: '10px 14px', fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-strong)', fontFamily: 'inherit', boxSizing: 'border-box' as const,
};

const REL_COLORS: Record<string, [string, string]> = {
  HAS_LOAN:            ['var(--color-status-info-bg)', 'var(--color-status-info-text)'],
  HAS_ACCOUNT:         ['var(--color-status-success-bg)', 'var(--color-status-success-text)'],
  HAS_POLICY:          ['var(--color-primary-50)', 'var(--color-primary-800)'],
  HAS_TICKET:          ['var(--color-status-error-bg)', 'var(--color-status-error-text)'],
  HAS_FINANCE_PROFILE: ['var(--color-status-success-bg)', 'var(--color-status-success-text)'],
  HAS_HEALTH_RECORD:   ['var(--color-status-error-bg)', 'var(--color-status-error-text)'],
  OWNED_BY:            ['var(--color-status-warning-bg)', 'var(--color-status-warning-text)'],
  SECURED_BY:          ['var(--color-primary-50)', 'var(--color-primary-800)'],
  DEFAULT:             ['var(--color-bg-canvas)', 'var(--color-text-base)'],
};

export default function KnowledgeGraphPage() {
  const [entityType, setEntityType]   = useState('customer');
  const [entityTypes, setEntityTypes] = useState<string[]>(['customer', 'loan', 'policy', 'patient', 'client']);
  const [entityId, setEntityId]       = useState('1');
  const [loading, setLoading]         = useState(false);
  const [entity, setEntity]           = useState<Record<string, unknown> | null>(null);
  const [error, setError]             = useState('');

  // Load entity types from DB config
  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${import.meta.env.VITE_API_URL}/v1/knowledge/entity-types`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.entity_types?.length > 0) {
          setEntityTypes(data.entity_types);
          setEntityType(data.entity_types[0]);
        }
      })
      .catch(() => {});
  }, []);

  async function handleFetch() {
    if (!entityId.trim()) return;
    setLoading(true);
    setError('');
    setEntity(null);
    try {
      const result = await getKnowledgeEntity(entityType, entityId);
      setEntity(result as unknown as Record<string, unknown>);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch entity');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: '32px' }}>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'var(--color-status-success-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--font-size-lg)' }}>🕸</div>
          <h1 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)' }}>Knowledge Graph</h1>
        </div>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
          Explore entity relationships and connections across all your data sources.
        </p>
      </div>

      {/* Tab */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-soft)', marginBottom: '24px' }}>
        <button style={{ padding: '10px 20px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-primary-800)', borderBottom: '2px solid var(--color-primary-800)' }}>
          🔍 Entity Explorer
        </button>
      </div>

      {/* Entity Explorer */}
      <div>
        <div style={{ ...card, padding: '24px', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', marginBottom: '16px' }}>Search Entity</h2>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-muted)', display: 'block', marginBottom: '4px' }}>Entity Type</label>
              <select style={{ ...inp, width: 'auto' }} value={entityType} onChange={e => setEntityType(e.target.value)}>
                {entityTypes.map(et => (
                  <option key={et} value={et}>{et}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-muted)', display: 'block', marginBottom: '4px' }}>Entity ID</label>
              <input style={{ ...inp, width: '100%' }} placeholder="e.g. 1"
                value={entityId} onChange={e => setEntityId(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleFetch(); }}/>
            </div>
            <button onClick={handleFetch} disabled={loading}
              style={{ padding: '10px 24px', borderRadius: '10px', border: 'none', background: loading ? 'var(--color-primary-200)' : 'var(--color-primary-800)', color: 'var(--color-bg-surface)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', cursor: loading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
              {loading ? '...' : '🔍 Fetch Entity'}
            </button>
          </div>
          {error && (
            <div style={{ background: 'var(--color-status-error-bg)', border: '1px solid var(--color-status-error-border)', borderRadius: '10px', padding: '12px', color: 'var(--color-status-error-text)', fontSize: '13px', marginTop: '14px' }}>
              ⚠ {error}
            </div>
          )}
        </div>

        {entity && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Attributes */}
            <div style={{ ...card, padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)' }}>Entity Attributes</h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', background: 'var(--color-primary-50)', color: 'var(--color-primary-800)', padding: '2px 8px', borderRadius: '6px', fontWeight: 'var(--font-weight-semibold)' }}>
                    {String(entity.entity_type)}
                  </span>
                  <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', background: 'var(--color-bg-muted)', color: 'var(--color-text-base)', padding: '2px 8px', borderRadius: '6px' }}>
                    {String(entity.entity_id)}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Object.entries(entity.attributes as Record<string, unknown>).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px', background: 'var(--color-bg-canvas)', border: '1px solid var(--color-bg-muted)' }}>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.replace(/_/g, ' ')}</span>
                    <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: '13px', color: 'var(--color-text-strong)', fontWeight: 'var(--font-weight-semibold)' }}>{String(v)}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                <span>Graph confidence:</span>
                <span style={{ fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary-800)' }}>{Math.round(Number(entity.graph_confidence) * 100)}%</span>
              </div>
            </div>

            {/* Relationships */}
            <div style={{ ...card, padding: '24px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', marginBottom: '16px' }}>
                Relationships ({(entity.relationships as unknown[]).length})
              </h2>
              {(entity.relationships as Record<string, unknown>[]).length === 0 ? (
                <p style={{ color: 'var(--color-text-soft)', fontSize: 'var(--font-size-sm)' }}>No relationships found.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(entity.relationships as Record<string, unknown>[]).map((rel, i) => {
                    const relType    = String(rel.type);
                    const [rb, rc]   = REL_COLORS[relType] ?? REL_COLORS.DEFAULT;
                    const attributes = rel.attributes as Record<string, unknown>;
                    return (
                      <div key={i} style={{ background: rb, borderRadius: '10px', padding: '14px', border: `1px solid ${rc}20` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                          <span style={{ background: 'var(--color-bg-surface)', color: rc, border: `1px solid ${rc}40`, padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 'var(--font-weight-bold)' }}>
                            {relType.replace(/_/g, ' ')}
                          </span>
                          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-base)' }}>→</span>
                          <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-base)', fontWeight: 'var(--font-weight-semibold)' }}>
                            {String(rel.target_type)}: {String(rel.target_id)}
                          </span>
                        </div>
                        {Object.keys(attributes).length > 0 && (
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {Object.entries(attributes).map(([k, v]) => (
                              <span key={k} style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                                {k}: <strong style={{ color: 'var(--color-text-base)' }}>{String(v)}</strong>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}