import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { listPlans } from '../../services/api';
import type { PlanResponse, PlanStepCreate } from '../../types';

const card: React.CSSProperties = {
  background: 'var(--color-bg-surface)', borderRadius: '16px',
  border: '1px solid var(--color-border-soft)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
};

const STORAGE_KEY = 'orch_plan_version_history';

interface PlanVersion {
  version:      number;
  snapshot:     PlanResponse;
  saved_at:     string;
  saved_by:     string;
  change_notes: string;
}

function loadVersionHistory(planId: string): PlanVersion[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${planId}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveVersionHistory(planId: string, versions: PlanVersion[]) {
  localStorage.setItem(`${STORAGE_KEY}_${planId}`, JSON.stringify(versions));
}

function addVersion(plan: PlanResponse, notes: string) {
  const existing = loadVersionHistory(plan.plan_id);
  const already  = existing.find(v => v.version === plan.version);
  if (already) return existing;
  const newVersion: PlanVersion = {
    version:      plan.version,
    snapshot:     plan,
    saved_at:     new Date().toISOString(),
    saved_by:     plan.created_by ?? 'system',
    change_notes: notes,
  };
  const updated = [newVersion, ...existing].sort((a, b) => b.version - a.version);
  saveVersionHistory(plan.plan_id, updated);
  return updated;
}

function StepDiff({ current, previous }: { current: PlanStepCreate[]; previous: PlanStepCreate[] }) {
  const currentKeys  = current.map(s => s.step_key);
  const previousKeys = previous.map(s => s.step_key);
  const added        = currentKeys.filter(k => !previousKeys.includes(k));
  const removed      = previousKeys.filter(k => !currentKeys.includes(k));
  const changed      = currentKeys.filter(k => {
    if (!previousKeys.includes(k)) return false;
    const c = current.find(s => s.step_key === k);
    const p = previous.find(s => s.step_key === k);
    return JSON.stringify(c) !== JSON.stringify(p);
  });
  const unchanged    = currentKeys.filter(k =>
    previousKeys.includes(k) && !changed.includes(k)
  );

  if (!added.length && !removed.length && !changed.length) {
    return <p style={{ fontSize: '13px', color: 'var(--color-text-soft)' }}>No step changes detected.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {added.map(k => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--color-status-success-bg)', border: '1px solid var(--color-status-success-border)', borderRadius: '8px', padding: '8px 14px' }}>
          <span style={{ color: 'var(--color-status-success-text)', fontWeight: 'var(--font-weight-bold)', fontSize: '13px' }}>+</span>
          <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: '13px', color: 'var(--color-status-success-text)', fontWeight: 'var(--font-weight-semibold)' }}>{k}</span>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-status-success-text)' }}>added</span>
        </div>
      ))}
      {removed.map(k => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--color-status-error-bg)', border: '1px solid var(--color-status-error-border)', borderRadius: '8px', padding: '8px 14px' }}>
          <span style={{ color: 'var(--color-status-error-text)', fontWeight: 'var(--font-weight-bold)', fontSize: '13px' }}>−</span>
          <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: '13px', color: 'var(--color-status-error-text)', fontWeight: 'var(--font-weight-semibold)' }}>{k}</span>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-status-error-border)' }}>removed</span>
        </div>
      ))}
      {changed.map(k => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--color-status-warning-bg)', border: '1px solid var(--color-status-warning-border)', borderRadius: '8px', padding: '8px 14px' }}>
          <span style={{ color: 'var(--color-status-warning-text)', fontWeight: 'var(--font-weight-bold)', fontSize: '13px' }}>~</span>
          <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: '13px', color: 'var(--color-status-warning-text)', fontWeight: 'var(--font-weight-semibold)' }}>{k}</span>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-status-warning-text)' }}>modified</span>
        </div>
      ))}
      {unchanged.map(k => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--color-bg-canvas)', border: '1px solid var(--color-border-soft)', borderRadius: '8px', padding: '8px 14px', opacity: 0.6 }}>
          <span style={{ color: 'var(--color-text-soft)', fontWeight: 'var(--font-weight-bold)', fontSize: '13px' }}>=</span>
          <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: '13px', color: 'var(--color-text-muted)' }}>{k}</span>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-soft)' }}>unchanged</span>
        </div>
      ))}
    </div>
  );
}

function VersionCard({
  version,
  isLatest,
  previousVersion,
  onRestore,
  isRestoring,
}: {
  version:         PlanVersion;
  isLatest:        boolean;
  previousVersion?: PlanVersion;
  onRestore:       (v: PlanVersion) => void;
  isRestoring:     boolean;
}) {
  const [expanded, setExpanded]   = useState(isLatest);
  const [showDiff, setShowDiff]   = useState(false);

  const policyColors: Record<string, [string, string]> = {
    best_effort:    ['var(--color-status-info-bg)', 'var(--color-status-info-text)'],
    fail_fast:      ['var(--color-status-error-bg)', 'var(--color-status-error-text)'],
    dependent_fail: ['var(--color-status-warning-bg)', 'var(--color-status-warning-text)'],
  };
  const [pb, pc] = policyColors[version.snapshot.error_policy] ?? ['var(--color-bg-canvas)', 'var(--color-text-muted)'];

  return (
    <div style={{ ...card, overflow: 'hidden', marginBottom: '12px', border: isLatest ? '2px solid var(--color-primary-800)' : '1px solid var(--color-border-soft)' }}>

      {/* Version header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px', cursor: 'pointer', background: isLatest ? 'var(--color-primary-50)' : 'var(--color-bg-surface)' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg-canvas)')}
        onMouseLeave={e => (e.currentTarget.style.background = isLatest ? 'var(--color-primary-50)' : 'var(--color-bg-surface)')}
      >
        {/* Version badge */}
        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: isLatest ? 'var(--color-primary-800)' : 'var(--color-bg-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: '10px', color: isLatest ? 'rgba(255,255,255,0.7)' : 'var(--color-text-soft)', fontWeight: 'var(--font-weight-semibold)' }}>v</span>
          <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-extrabold)', color: isLatest ? 'var(--color-bg-surface)' : 'var(--color-text-base)', lineHeight: 1 }}>{version.version}</span>
        </div>

        {/* Meta */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', fontSize: 'var(--font-size-sm)' }}>
              Version {version.version}
            </span>
            {isLatest && (
              <span style={{ background: 'var(--color-primary-800)', color: 'var(--color-bg-surface)', padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 'var(--font-weight-bold)' }}>
                CURRENT
              </span>
            )}
          </div>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '2px' }}>
            {version.change_notes || 'No change notes provided'}
          </p>
          <div style={{ display: 'flex', gap: '12px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-soft)' }}>
            <span>by {version.saved_by}</span>
            <span>·</span>
            <span>{new Date(version.saved_at).toLocaleString()}</span>
            <span>·</span>
            <span>{(version.snapshot.steps ?? []).length} steps</span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {!isLatest && (
            <button
              onClick={() => onRestore(version)}
              disabled={isRestoring}
              style={{ padding: '7px 14px', borderRadius: '8px', border: 'none', background: 'var(--color-primary-800)', color: 'var(--color-bg-surface)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', cursor: isRestoring ? 'not-allowed' : 'pointer', opacity: isRestoring ? 0.7 : 1 }}>
              {isRestoring ? 'Restoring…' : '↩ Restore'}
            </button>
          )}
          {previousVersion && (
            <button
              onClick={() => setShowDiff(!showDiff)}
              style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--color-border-soft)', background: 'var(--color-bg-surface)', color: 'var(--color-text-base)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer' }}>
              {showDiff ? 'Hide Diff' : 'Show Diff'}
            </button>
          )}
        </div>

        <span style={{ color: 'var(--color-text-soft)', fontSize: 'var(--font-size-xs)', display: 'inline-block', transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s', flexShrink: 0 }}>▼</span>
      </div>

      {/* Diff view */}
      {showDiff && previousVersion && (
        <div style={{ padding: '16px 20px', background: 'var(--color-bg-canvas)', borderTop: '1px solid var(--color-bg-muted)' }}>
          <p style={{ fontSize: '11px', fontWeight: 'var(--font-weight-bold)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', marginBottom: '10px' }}>
            Changes vs v{previousVersion.version}
          </p>
          <StepDiff
            current={version.snapshot.steps ?? []}
            previous={previousVersion.snapshot.steps ?? []}
          />
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--color-bg-muted)', padding: '20px' }}>

          {/* Config */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Entity Type',     value: version.snapshot.entity_type },
              { label: 'Error Policy',    value: version.snapshot.error_policy.replace(/_/g,' '), bg: pb, color: pc },
              { label: 'Concurrency',     value: String(version.snapshot.max_concurrency) },
              { label: 'Active',          value: version.snapshot.is_active ? 'Yes' : 'No' },
            ].map(m => (
              <div key={m.label} style={{ background: m.bg ?? 'var(--color-bg-canvas)', borderRadius: '10px', border: '1px solid var(--color-border-soft)', padding: '12px' }}>
                <p style={{ fontSize: '11px', color: 'var(--color-text-soft)', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{m.label}</p>
                <p style={{ fontSize: '13px', color: m.color ?? 'var(--color-text-strong)', fontWeight: 'var(--font-weight-semibold)' }}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* Steps */}
          {(version.snapshot.steps ?? []).length > 0 && (
            <div>
              <p style={{ fontSize: '11px', fontWeight: 'var(--font-weight-bold)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-muted)', marginBottom: '10px' }}>
                Steps ({(version.snapshot.steps ?? []).length})
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {(version.snapshot.steps ?? []).map((step, i) => {
                  const kindColors: Record<string, [string,string]> = {
                    sql:          ['var(--color-status-info-bg)','var(--color-status-info-text)'],
                    rest:         ['var(--color-status-success-bg)','var(--color-status-success-text)'],
                    graphql:      ['var(--color-primary-50)','var(--color-primary-800)'],
                    ai_transform: ['var(--color-primary-50)','var(--color-primary-800)'],
                  };
                  const [bg, color] = kindColors[step.kind] ?? ['var(--color-bg-canvas)','var(--color-text-base)'];
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--color-bg-canvas)', borderRadius: '8px', padding: '10px 14px', border: '1px solid var(--color-border-soft)' }}>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-soft)', fontFamily: 'var(--font-family-mono)', width: '20px' }}>#{i+1}</span>
                      <span style={{ background: bg, color, padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 'var(--font-weight-bold)' }}>
                        {(step.kind ?? 'sql').toUpperCase().replace('_',' ')}
                      </span>
                      <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: '13px', color: 'var(--color-text-strong)', fontWeight: 'var(--font-weight-semibold)' }}>{step.step_key}</span>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-soft)', marginLeft: 'auto' }}>{step.datasource_name}</span>
                      <span style={{ fontSize: '11px', color: step.enabled ? 'var(--color-status-success-text)' : 'var(--color-text-soft)' }}>
                        {step.enabled ? '● on' : '○ off'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PlanVersionHistoryPage() {
  const { id }        = useParams<{ id: string }>();
  const [plan, setPlan]       = useState<PlanResponse | null>(null);
  const [versions, setVersions] = useState<PlanVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState('');
  const [showAddNote, setShowAddNote] = useState(false);
  const [noteText, setNoteText]       = useState('');

  useEffect(() => {
    listPlans()
      .then(plans => {
        const found = plans.find(p => p.plan_id === id);
        if (!found) throw new Error('Plan not found');
        setPlan(found);

        // Auto-snapshot current version
        const updated = addVersion(found, found.version === 1 ? 'Initial version' : `Version ${found.version}`);
        setVersions(updated);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  function handleSaveNote() {
    if (!plan || !noteText.trim()) return;
    const updated = addVersion(plan, noteText.trim());
    setVersions(updated);
    setNoteText('');
    setShowAddNote(false);
  }

  async function handleRestore(version: PlanVersion) {
    setRestoring(true);
    // Simulate restore — in production this would call PUT /admin/plans/:id
    await new Promise(r => setTimeout(r, 800));
    setRestoring(false);
    setRestoreMsg(`Restored to v${version.version}. Note: Requires backend PUT /admin/plans/:id to persist.`);
    setTimeout(() => setRestoreMsg(''), 5000);
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
      <div style={{ width: '32px', height: '32px', border: '3px solid var(--color-border-soft)', borderTopColor: 'var(--color-primary-800)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}/>
      <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
    </div>
  );

  if (error) return (
    <div style={{ padding: '32px' }}>
      <div style={{ background: 'var(--color-status-error-bg)', border: '1px solid var(--color-status-error-border)', borderRadius: '12px', padding: '16px', color: 'var(--color-status-error-text)' }}>⚠ {error}</div>
    </div>
  );

  return (
    <div style={{ padding: '32px', maxWidth: '900px' }}>

      {/* Back */}
      <Link to={`/plans/${id}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', textDecoration: 'none', marginBottom: '24px' }}>
        ← Back to Plan
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)' }}>Version History</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', marginTop: '4px', fontFamily: 'var(--font-family-mono)' }}>{plan?.name}</p>
        </div>
        <button
          onClick={() => setShowAddNote(!showAddNote)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--color-primary-800)', color: 'var(--color-bg-surface)', padding: '10px 18px', borderRadius: '10px', fontWeight: 'var(--font-weight-semibold)', fontSize: '13px', border: 'none', cursor: 'pointer' }}>
          + Save Snapshot
        </button>
      </div>

      {/* Restore notice */}
      {restoreMsg && (
        <div style={{ background: 'var(--color-status-warning-bg)', border: '1px solid var(--color-status-warning-border)', borderRadius: '12px', padding: '14px 16px', marginBottom: '20px', fontSize: '13px', color: 'var(--color-status-warning-text)' }}>
          ⚠ {restoreMsg}
        </div>
      )}

      {/* Add note form */}
      {showAddNote && (
        <div style={{ ...card, padding: '20px', marginBottom: '20px', border: '2px solid var(--color-primary-800)' }}>
          <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', marginBottom: '10px' }}>Save Current Snapshot</p>
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Describe what changed in this version…"
            style={{ width: '100%', border: '1px solid var(--color-border-base)', borderRadius: '10px', padding: '10px 14px', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-strong)', fontFamily: 'inherit', minHeight: '80px', resize: 'vertical', boxSizing: 'border-box' as const }}
          />
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button onClick={() => setShowAddNote(false)}
              style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--color-border-base)', background: 'var(--color-bg-surface)', color: 'var(--color-text-base)', fontSize: '13px', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleSaveNote}
              style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'var(--color-primary-800)', color: 'var(--color-bg-surface)', fontSize: '13px', fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer' }}>
              Save Snapshot
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total Versions',  value: versions.length,                                      color: 'var(--color-primary-800)', bg: 'var(--color-primary-50)' },
          { label: 'Current Version', value: `v${plan?.version ?? 1}`,                             color: 'var(--color-status-success-text)', bg: 'var(--color-status-success-bg)' },
          { label: 'First Created',   value: versions.length ? new Date(versions[versions.length-1]?.saved_at).toLocaleDateString() : '—', color: 'var(--color-status-warning-text)', bg: 'var(--color-status-warning-bg)' },
        ].map(s => (
          <div key={s.label} style={{ ...card, padding: '18px' }}>
            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: s.color, marginBottom: '4px' }}>{s.value}</div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Backend notice */}
      <div style={{ background: 'var(--color-status-warning-bg)', border: '1px solid var(--color-status-warning-border)', borderRadius: '12px', padding: '14px 18px', marginBottom: '24px', display: 'flex', gap: '10px' }}>
        <span style={{ fontSize: 'var(--font-size-md)', flexShrink: 0 }}>ℹ</span>
        <div>
          <p style={{ fontSize: '13px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-status-warning-text)', marginBottom: '2px' }}>Local snapshots only</p>
          <p style={{ fontSize: '13px', color: 'var(--color-status-warning-text)' }}>
            Version snapshots are currently stored in browser localStorage. Full version history with restore requires
            <code style={{ fontFamily: 'var(--font-family-mono)', background: 'var(--color-status-warning-border)', padding: '1px 5px', borderRadius: '3px', margin: '0 3px' }}>PUT /admin/plans/:id</code>
            backend support.
          </p>
        </div>
      </div>

      {/* Version list */}
      {versions.length === 0 ? (
        <div style={{ ...card, padding: '60px', textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>📋</div>
          <p style={{ color: 'var(--color-text-base)', fontWeight: 'var(--font-weight-semibold)', marginBottom: '8px' }}>No version history yet</p>
          <p style={{ color: 'var(--color-text-soft)', fontSize: 'var(--font-size-sm)' }}>Click "Save Snapshot" to capture the current state of this plan.</p>
        </div>
      ) : (
        <div>
          {versions.map((version, i) => (
            <VersionCard
              key={version.version}
              version={version}
              isLatest={i === 0}
              previousVersion={versions[i + 1]}
              onRestore={handleRestore}
              isRestoring={restoring}
            />
          ))}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}