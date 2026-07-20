// src/pages/approvals/ApprovalsPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listHumanReviewApprovals, approveHumanReview, rejectHumanReview,
} from '../../services/api';
import type { HumanReviewApproval } from '../../types';

const page: React.CSSProperties = { padding: '32px 40px', maxWidth: 1100 };
const card: React.CSSProperties = {
  background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)', borderRadius: 12,
  padding: 20, marginBottom: 16,
};
const btn: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
  fontWeight: 'var(--font-weight-semibold)', fontSize: 13,
};
const badge = (bg: string, fg: string): React.CSSProperties => ({
  display: 'inline-block', padding: '3px 10px', borderRadius: 999,
  fontSize: 12, fontWeight: 'var(--font-weight-bold)', background: bg, color: fg,
});

function statusBadge(status: string) {
  if (status === 'pending')  return <span style={badge('var(--color-status-warning-bg)', 'var(--color-status-warning-text)')}>PENDING</span>;
  if (status === 'approved') return <span style={badge('var(--color-status-success-bg)', 'var(--color-status-success-text)')}>APPROVED</span>;
  return <span style={badge('var(--color-status-error-bg)', 'var(--color-status-error-text)')}>REJECTED</span>;
}

export default function ApprovalsPage() {
  const navigate = useNavigate();
  const [approvals, setApprovals] = useState<HumanReviewApproval[]>([]);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewerName, setReviewerName] = useState('');
  const [decisionReason, setDecisionReason] = useState('');
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await listHumanReviewApprovals(filter === 'pending' ? 'pending' : undefined);
      setApprovals(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load approvals');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter]);

  function openDecision(approvalId: string) {
    setExpandedId(expandedId === approvalId ? null : approvalId);
    setDecisionReason('');
    setActionError('');
  }

  async function handleApprove(approvalId: string) {
    if (!reviewerName.trim()) {
      setActionError('Enter your name before approving.');
      return;
    }
    setActingOn(approvalId);
    setActionError('');
    try {
      const result = await approveHumanReview(approvalId, reviewerName.trim(), decisionReason.trim() || undefined);
      setExpandedId(null);
      await load();
      // Step 6 of the design: approved -> engine resumes -> take the
      // reviewer straight to the (now-continuing) Execution Monitor.
      navigate(`/history/${result.execution_id}`);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setActingOn(null);
    }
  }

  async function handleReject(approvalId: string) {
    if (!reviewerName.trim()) {
      setActionError('Enter your name before rejecting.');
      return;
    }
    if (!decisionReason.trim()) {
      setActionError('A reason is required to reject.');
      return;
    }
    setActingOn(approvalId);
    setActionError('');
    try {
      await rejectHumanReview(approvalId, reviewerName.trim(), decisionReason.trim());
      setExpandedId(null);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Reject failed');
    } finally {
      setActingOn(null);
    }
  }

  return (
    <div style={page}>
      <h1 style={{ fontSize: 28, fontWeight: 'var(--font-weight-extrabold)', marginBottom: 4 }}>Human Review Approvals</h1>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: 24 }}>
        Plans paused waiting on a decision — approve to resume, reject to close the case.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          style={{ ...btn, background: filter === 'pending' ? 'var(--color-primary-800)' : 'var(--color-bg-muted)', color: filter === 'pending' ? 'var(--color-bg-surface)' : 'var(--color-text-base)' }}
          onClick={() => setFilter('pending')}
        >
          Pending
        </button>
        <button
          style={{ ...btn, background: filter === 'all' ? 'var(--color-primary-800)' : 'var(--color-bg-muted)', color: filter === 'all' ? 'var(--color-bg-surface)' : 'var(--color-text-base)' }}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        <button style={{ ...btn, background: 'var(--color-bg-muted)', color: 'var(--color-text-base)' }} onClick={load}>
          ↻ Refresh
        </button>
      </div>

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: 'var(--color-status-error-text)' }}>{error}</p>}
      {!loading && approvals.length === 0 && (
        <div style={card}>
          <p style={{ color: 'var(--color-text-muted)', margin: 0 }}>
            {filter === 'pending' ? 'Nothing waiting on review right now.' : 'No approvals found.'}
          </p>
        </div>
      )}

      {approvals.map((a) => (
        <div key={a.approval_id} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 'var(--font-weight-bold)', fontSize: 15 }}>
                {a.step_key} {statusBadge(a.status)}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
                execution_id: <code>{a.execution_id}</code> &nbsp;·&nbsp; tenant: {a.tenant_id}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
                requested {new Date(a.requested_at).toLocaleString()}
              </div>
              {a.reason && (
                <div style={{ marginTop: 8, fontSize: 14 }}>
                  <strong>Reason:</strong> {a.reason}
                </div>
              )}
              {a.status !== 'pending' && (
                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--color-text-muted)' }}>
                  {a.status === 'approved' ? 'Approved' : 'Rejected'} by <strong>{a.reviewed_by}</strong>
                  {a.reviewed_at && ` on ${new Date(a.reviewed_at).toLocaleString()}`}
                  {a.decision_reason && <> — “{a.decision_reason}”</>}
                </div>
              )}
            </div>
            {a.status === 'pending' && (
              <button
                style={{ ...btn, background: 'var(--color-bg-muted)', color: 'var(--color-text-base)', whiteSpace: 'nowrap' }}
                onClick={() => openDecision(a.approval_id)}
              >
                {expandedId === a.approval_id ? 'Close' : 'Review'}
              </button>
            )}
          </div>

          {expandedId === a.approval_id && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-border-soft)' }}>
              <details style={{ marginBottom: 12 }}>
                <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-primary-800)' }}>
                  Full context (params + prior step results)
                </summary>
                <pre style={{
                  background: 'var(--color-text-strong)', color: 'var(--color-border-soft)', padding: 12, borderRadius: 8,
                  fontSize: 12, overflowX: 'auto', marginTop: 8,
                }}>
                  {JSON.stringify(a.context_json, null, 2)}
                </pre>
              </details>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-base)' }}>Your name *</label>
                  <input
                    value={reviewerName}
                    onChange={(e) => setReviewerName(e.target.value)}
                    placeholder="e.g. jane.reviewer@bank.example"
                    style={{ width: '100%', padding: 8, border: '1px solid var(--color-border-base)', borderRadius: 6, marginTop: 4 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-base)' }}>
                    Reason {`(required to reject)`}
                  </label>
                  <input
                    value={decisionReason}
                    onChange={(e) => setDecisionReason(e.target.value)}
                    placeholder="e.g. Confirmed via phone call"
                    style={{ width: '100%', padding: 8, border: '1px solid var(--color-border-base)', borderRadius: 6, marginTop: 4 }}
                  />
                </div>
              </div>

              {actionError && <p style={{ color: 'var(--color-status-error-text)', fontSize: 13 }}>{actionError}</p>}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={{ ...btn, background: 'var(--color-status-success-text)', color: 'var(--color-bg-surface)' }}
                  disabled={actingOn === a.approval_id}
                  onClick={() => handleApprove(a.approval_id)}
                >
                  {actingOn === a.approval_id ? 'Working…' : '✓ Approve & Resume'}
                </button>
                <button
                  style={{ ...btn, background: 'var(--color-status-error-text)', color: 'var(--color-bg-surface)' }}
                  disabled={actingOn === a.approval_id}
                  onClick={() => handleReject(a.approval_id)}
                >
                  {actingOn === a.approval_id ? 'Working…' : '✕ Reject'}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}