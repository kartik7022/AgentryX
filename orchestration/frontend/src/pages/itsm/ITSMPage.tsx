import { useEffect, useState, useCallback } from 'react';
import { listITSMTickets, resolveITSMTicket, type ITSMTicket } from '../../services/api';

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string; label: string }> = {
  OPEN:     { bg: 'var(--color-status-error-bg)', color: 'var(--color-status-error-text)', border: 'var(--color-status-error-border)', label: 'PENDING' },
  RESOLVED: { bg: 'var(--color-status-success-bg)', color: 'var(--color-status-success-text)', border: 'var(--color-status-success-border)', label: 'SOLVED' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? { bg: 'var(--color-bg-canvas)', color: 'var(--color-text-muted)', border: 'var(--color-border-soft)', label: status };
  return (
    <span style={{
      fontSize: '11px', fontWeight: 'var(--font-weight-bold)', padding: '2px 10px', borderRadius: '999px',
      textTransform: 'uppercase', letterSpacing: '0.04em',
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>
      {s.label}
    </span>
  );
}

function TypeBadge({ ticketType }: { ticketType: string }) {
  const isManual = ticketType === 'manual_review';
  return (
    <span style={{
      fontSize: '11px', fontWeight: 'var(--font-weight-semibold)', padding: '2px 10px', borderRadius: '999px',
      background: isManual ? 'var(--color-status-warning-bg)' : 'var(--color-primary-50)', color: isManual ? 'var(--color-status-warning-text)' : 'var(--color-primary-700)',
      border: `1px solid ${isManual ? 'var(--color-status-warning-border)' : 'var(--color-primary-200)'}`,
    }}>
      {isManual ? 'Manual Review' : 'Human Review'}
    </span>
  );
}

export default function ITSMPage() {
  const [tickets, setTickets] = useState<ITSMTicket[]>([]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('ALL');
  const [typeFilter, setTypeFilter]     = useState<'ALL' | 'manual_review' | 'human_review'>('ALL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [solvingId, setSolvingId] = useState<string | null>(null);
  const [solverName, setSolverName] = useState('');
  const [solverReason, setSolverReason] = useState('');
  const [solveError, setSolveError] = useState('');

  const loadTickets = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { tickets } = await listITSMTickets(
        statusFilter === 'ALL' ? undefined : statusFilter,
        typeFilter === 'ALL' ? undefined : typeFilter,
      );
      setTickets(tickets);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    loadTickets();
    const interval = setInterval(loadTickets, 15000);
    return () => clearInterval(interval);
  }, [loadTickets]);

  async function handleMarkSolved(ticketId: string) {
    if (!solverName.trim()) { setSolveError('Your name is required.'); return; }
    if (!solverReason.trim()) { setSolveError('A reason is required.'); return; }
    setSolveError('');
    try {
      await resolveITSMTicket(ticketId, { reviewed_by: solverName.trim(), decision_reason: solverReason.trim() });
      setSolvingId(null);
      setSolverName('');
      setSolverReason('');
      loadTickets();
    } catch (e) {
      setSolveError(e instanceof Error ? e.message : 'Failed to mark ticket solved');
    }
  }

  const openCount = tickets.filter(t => t.status === 'OPEN').length;

  return (
    <div style={{ padding: '32px', maxWidth: '1000px', margin: '0 auto' }}>
      <h1 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', marginBottom: '4px' }}>ITSM Tickets</h1>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', marginBottom: '24px' }}>
        Manual Review tickets are standalone (low-confidence routing) — mark Solved directly here.
        Human Review tickets are tied to a paused plan — resolve those via Approvals.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-soft)', textTransform: 'uppercase' }}>Type:</span>
        {(['ALL', 'manual_review', 'human_review'] as const).map(f => (
          <button key={f} onClick={() => setTypeFilter(f)} style={{
            padding: '5px 14px', borderRadius: '999px', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer',
            border: `1px solid ${typeFilter === f ? 'var(--color-primary-800)' : 'var(--color-border-soft)'}`,
            background: typeFilter === f ? 'var(--color-primary-50)' : 'var(--color-bg-surface)',
            color: typeFilter === f ? 'var(--color-primary-800)' : 'var(--color-text-muted)',
          }}>
            {f === 'ALL' ? 'All' : f === 'manual_review' ? 'Manual Review' : 'Human Review'}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-soft)', textTransform: 'uppercase' }}>Status:</span>
        {(['ALL', 'OPEN', 'RESOLVED'] as const).map(f => (
          <button key={f} onClick={() => setStatusFilter(f)} style={{
            padding: '5px 14px', borderRadius: '999px', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer',
            border: `1px solid ${statusFilter === f ? 'var(--color-primary-800)' : 'var(--color-border-soft)'}`,
            background: statusFilter === f ? 'var(--color-primary-50)' : 'var(--color-bg-surface)',
            color: statusFilter === f ? 'var(--color-primary-800)' : 'var(--color-text-muted)',
          }}>
            {f === 'ALL' ? 'All' : f === 'OPEN' ? 'Pending' : 'Solved'}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-soft)' }}>
          {openCount > 0 ? `${openCount} pending` : 'All caught up'}
        </span>
        <button onClick={loadTickets} disabled={loading} style={{
          padding: '5px 12px', borderRadius: '8px', border: '1px solid var(--color-border-soft)', background: 'var(--color-bg-surface)',
          fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-base)', cursor: 'pointer',
        }}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px', background: 'var(--color-status-error-bg)', border: '1px solid var(--color-status-error-border)', borderRadius: '8px', color: 'var(--color-status-error-text)', fontSize: '13px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {tickets.length === 0 && !loading && !error && (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-soft)', fontSize: '13px', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)', borderRadius: '12px' }}>
          No tickets match these filters yet.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {tickets.map(t => (
          <div key={t.ticket_id} style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)', borderRadius: '12px', padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{t.ticket_id}</span>
              <StatusBadge status={t.status} />
              <TypeBadge ticketType={t.ticket_type} />
              <span style={{ fontSize: '11px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-status-warning-text)' }}>{t.priority}</span>
              <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--color-text-soft)' }}>{new Date(t.created_at).toLocaleString()}</span>
            </div>
            <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-strong)', marginBottom: '4px' }}>{t.summary}</div>
            <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{t.description}</div>
            {t.resolution && (
              <div style={{ marginTop: '8px', fontSize: 'var(--font-size-xs)', color: 'var(--color-status-success-text)', background: 'var(--color-status-success-bg)', border: '1px solid var(--color-status-success-border)', borderRadius: '6px', padding: '6px 10px' }}>
                ✓ {t.resolution}
              </div>
            )}

            {t.status === 'OPEN' && t.ticket_type === 'manual_review' && (
              solvingId === t.ticket_id ? (
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--color-bg-canvas)', border: '1px solid var(--color-border-soft)', borderRadius: '8px', padding: '12px' }}>
                  <input value={solverName} onChange={e => setSolverName(e.target.value)}
                    placeholder="Your name"
                    style={{ padding: '7px 10px', border: '1px solid var(--color-border-base)', borderRadius: '6px', fontSize: '13px' }} />
                  <input value={solverReason} onChange={e => setSolverReason(e.target.value)}
                    placeholder="Reason (e.g. confirmed via phone call)"
                    style={{ padding: '7px 10px', border: '1px solid var(--color-border-base)', borderRadius: '6px', fontSize: '13px' }} />
                  {solveError && <p style={{ color: 'var(--color-status-error-text)', fontSize: 'var(--font-size-xs)', margin: 0 }}>{solveError}</p>}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => handleMarkSolved(t.ticket_id)}
                      style={{ padding: '7px 14px', background: 'var(--color-status-success-text)', border: 'none', borderRadius: '6px', color: 'var(--color-bg-surface)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer' }}>
                      ✓ Confirm Solved
                    </button>
                    <button onClick={() => { setSolvingId(null); setSolveError(''); }}
                      style={{ padding: '7px 14px', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-base)', borderRadius: '6px', fontSize: 'var(--font-size-xs)', cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setSolvingId(t.ticket_id); setSolverName(''); setSolverReason(''); setSolveError(''); }}
                  style={{ marginTop: '10px', padding: '6px 14px', background: 'var(--color-primary-50)', border: '1px solid var(--color-primary-200)', borderRadius: '6px', color: 'var(--color-primary-700)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer' }}>
                  Mark Solved
                </button>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}