// src/components/AgentTracePanel.tsx
import { useEffect, useState } from 'react';
import {
  getAgentTaskRun, getAgentTaskTrace,
  listAgentApprovals, approveAgentAction, rejectAgentAction,
} from '../services/api';
import type { AgentTaskRun, AgentTraceEvent, AgentApproval } from '../types';

const EVENT_COLORS: Record<string, [string, string, string]> = {
  thought:            ['#EFF6FF', '#3B82F6', '#BFDBFE'],
  tool_selected:      ['#FFFBEB', '#92400E', '#FDE68A'],
  tool_request:       ['#FFFBEB', '#92400E', '#FDE68A'],
  tool_response:      ['#F0FDF4', '#166534', '#BBF7D0'],
  model_request:      ['#EFF6FF', '#3B82F6', '#BFDBFE'],
  model_response:     ['#EFF6FF', '#3B82F6', '#BFDBFE'],
  guardrail_check:    ['#FFFBEB', '#92400E', '#FDE68A'],
  approval_requested: ['#FEF2F2', '#991B1B', '#FECACA'],
  approval_resolved:  ['#F0FDF4', '#166534', '#BBF7D0'],
  output_validation:  ['#EFF6FF', '#3B82F6', '#BFDBFE'],
  budget_check:       ['#FFFBEB', '#92400E', '#FDE68A'],
  final_answer:       ['#F0FDF4', '#166534', '#BBF7D0'],
  error:              ['#FEF2F2', '#991B1B', '#FECACA'],
};

const STATUS_COLORS: Record<string, [string, string, string]> = {
  success:            ['#F0FDF4', '#166534', '#BBF7D0'],
  failed:             ['#FEF2F2', '#991B1B', '#FECACA'],
  running:            ['#EFF6FF', '#3B82F6', '#BFDBFE'],
  needs_approval:     ['#FFFBEB', '#92400E', '#FDE68A'],
  needs_human_review: ['#FFFBEB', '#92400E', '#FDE68A'],
  budget_exceeded:    ['#FEF2F2', '#991B1B', '#FECACA'],
  output_invalid:     ['#FEF2F2', '#991B1B', '#FECACA'],
};

function JsonViewer({ data }: { data: unknown }) {
  if (data == null)
    return <span style={{ color: 'var(--color-text-soft)', fontSize: 'var(--font-size-xs)' }}>— empty —</span>;
  return (
    <pre style={{
      fontFamily: 'var(--font-family-mono)', fontSize: '11px', color: 'var(--color-text-base)',
      overflow: 'auto', maxHeight: '200px', margin: 0,
      whiteSpace: 'pre-wrap', lineHeight: 1.5,
    }}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function TraceEventCard({ event }: { event: AgentTraceEvent }) {
  const [open, setOpen] = useState(false);
  const [bg, color, border] = EVENT_COLORS[event.event_type] ?? ['#F8FAFC', '#64748B', '#E2E8F0'];

  return (
    <div style={{ border: `1px solid ${border}`, borderRadius: '10px', overflow: 'hidden', marginBottom: '6px' }}>
      <div onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', gap: '10px',
          padding: '10px 14px', background: bg, cursor: 'pointer' }}>
        <span style={{ fontSize: '10px', color: 'var(--color-text-soft)', fontFamily: 'var(--font-family-mono)', minWidth: '24px' }}>
          #{event.event_index}
        </span>
        <span style={{
          fontSize: '11px', fontWeight: 'var(--font-weight-bold)', color,
          background: `${color}18`, padding: '2px 8px', borderRadius: '999px',
          textTransform: 'uppercase' as const, letterSpacing: '0.05em', flexShrink: 0,
        }}>
          {event.event_type.replace(/_/g, ' ')}
        </span>
        {event.redacted && (
          <span style={{ fontSize: '10px', color: 'var(--color-text-soft)', background: 'var(--color-bg-muted)',
            padding: '1px 6px', borderRadius: '999px', border: '1px solid var(--color-border-soft)' }}>
            REDACTED
          </span>
        )}
        <span style={{ fontSize: '11px', color: 'var(--color-text-soft)', fontFamily: 'var(--font-family-mono)',
          marginLeft: 'auto', flexShrink: 0 }}>
          {new Date(event.created_at).toLocaleTimeString()}
        </span>
        <span style={{ color: 'var(--color-text-soft)', fontSize: '11px',
          transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
      </div>
      {open && (
        <div style={{ padding: '12px 14px', background: 'var(--color-bg-surface)', borderTop: `1px solid ${border}` }}>
          {event.redacted
            ? <p style={{ color: 'var(--color-text-soft)', fontSize: 'var(--font-size-xs)' }}>Content redacted — admin role required to view</p>
            : <JsonViewer data={event.event_json} />
          }
        </div>
      )}
    </div>
  );
}

function BudgetBar({ label, used, max }: { label: string; used: number; max: number }) {
  const pct   = max > 0 ? Math.min((used / max) * 100, 100) : 0;
  const color = pct >= 90 ? '#991B1B' : pct >= 70 ? '#92400E' : '#3B82F6';
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontWeight: 'var(--font-weight-semibold)' }}>{label}</span>
        <span style={{ fontSize: '11px', color, fontFamily: 'var(--font-family-mono)', fontWeight: 'var(--font-weight-bold)' }}>
          {used}/{max}
        </span>
      </div>
      <div style={{ height: '5px', background: 'var(--color-bg-muted)', borderRadius: '999px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color,
          borderRadius: '999px', transition: 'width 0.4s' }} />
      </div>
    </div>
  );
}

interface Props {
  agentRunId: string;
}

export default function AgentTracePanel({ agentRunId }: Props) {
  const [run, setRun]               = useState<AgentTaskRun | null>(null);
  const [events, setEvents]         = useState<AgentTraceEvent[]>([]);
  const [approvals, setApprovals]   = useState<AgentApproval[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [actionMsg, setActionMsg]   = useState('');

  useEffect(() => {
    if (!agentRunId) return;
    Promise.all([
      getAgentTaskRun(agentRunId),
      getAgentTaskTrace(agentRunId),
      listAgentApprovals({ status: 'pending' }),
    ])
      .then(([r, e, a]) => {
        setRun(r);
        setEvents(e);
        setApprovals(a.filter(ap => ap.agent_run_id === agentRunId));
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [agentRunId]);

  async function handleApprove(approvalId: string) {
    try {
      await approveAgentAction(approvalId, { reviewed_by: 'admin', decision_reason: 'Approved via UI' });
      setActionMsg('Action approved successfully');
      setApprovals(prev => prev.filter(a => a.approval_id !== approvalId));
    } catch (e: unknown) {
      setActionMsg(e instanceof Error ? e.message : 'Failed to approve');
    }
  }

  async function handleReject(approvalId: string) {
    try {
      await rejectAgentAction(approvalId, { reviewed_by: 'admin', decision_reason: 'Rejected via UI' });
      setActionMsg('Action rejected');
      setApprovals(prev => prev.filter(a => a.approval_id !== approvalId));
    } catch (e: unknown) {
      setActionMsg(e instanceof Error ? e.message : 'Failed to reject');
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px', gap: '12px', color: 'var(--color-text-muted)', fontSize: '13px' }}>
      <div style={{ width: '20px', height: '20px', border: '2px solid var(--color-border-soft)',
        borderTopColor: 'var(--color-primary-500)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      Loading agent trace…
    </div>
  );

  if (error) return (
    <div style={{ background: 'var(--color-status-error-bg)', border: '1px solid var(--color-status-error-border)', borderRadius: '10px',
      padding: '14px', color: 'var(--color-status-error-text)', fontSize: '13px' }}>
      ⚠ {error}
    </div>
  );

  if (!run) return null;

  const usage  = (run.usage_json  as Record<string, unknown>) ?? {};
  const limits = ((usage.limits   as Record<string, number>) ?? {});
  const [sbg, sc, sbr] = STATUS_COLORS[run.status] ?? ['#F8FAFC', '#64748B', '#E2E8F0'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Agent run header */}
      <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)', borderRadius: '12px', padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ flex: 1, marginRight: '16px' }}>
            <p style={{ fontSize: '11px', color: 'var(--color-text-soft)', fontWeight: 'var(--font-weight-semibold)',
              textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>GOAL</p>
            <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-strong)', lineHeight: 1.5 }}>{run.goal}</p>
          </div>
          <span style={{
            display: 'inline-flex', alignItems: 'center', padding: '4px 12px',
            borderRadius: '999px', fontSize: '11px', fontWeight: 'var(--font-weight-bold)', flexShrink: 0,
            background: sbg, color: sc, border: `1px solid ${sbr}`,
            textTransform: 'uppercase' as const, letterSpacing: '0.05em',
          }}>
            {run.status.replace(/_/g, ' ')}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }}>
          {[
            { label: 'Agent Run ID', value: run.agent_run_id.slice(0, 8) + '…' },
            { label: 'Prompt',       value: run.prompt_id ?? run.prompt_version ?? '—' },
            { label: 'Started',      value: new Date(run.started_at).toLocaleTimeString() },
            { label: 'Duration',     value: `${run.duration_ms}ms` },
          ].map(m => (
            <div key={m.label} style={{ background: 'var(--color-bg-canvas)', borderRadius: '8px', padding: '10px',
              border: '1px solid var(--color-border-soft)' }}>
              <p style={{ fontSize: '10px', color: 'var(--color-text-soft)', fontWeight: 'var(--font-weight-bold)',
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>{m.label}</p>
              <p style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-strong)', fontWeight: 'var(--font-weight-semibold)' }}>{m.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Budget usage */}
      <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)', borderRadius: '12px', padding: '18px 20px' }}>
        <p style={{ fontSize: '13px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', marginBottom: '14px' }}>Budget Usage</p>
        <BudgetBar label="Iterations"  used={Number(usage.iterations_used  ?? 0)} max={limits.max_iterations  ?? 10} />
        <BudgetBar label="Model Calls" used={Number(usage.model_calls_used ?? 0)} max={limits.max_model_calls ?? 10} />
        <BudgetBar label="Tool Calls"  used={Number(usage.tool_calls_used  ?? 0)} max={limits.max_tool_calls  ?? 20} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)',
          marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--color-bg-muted)' }}>
          <span>Cost: <strong style={{ color: 'var(--color-text-strong)' }}>
            ${Number(usage.cost_used_usd ?? 0).toFixed(4)}
          </strong> of ${limits.max_cost_usd ?? '—'}</span>
          <span>Elapsed: <strong style={{ color: 'var(--color-text-strong)' }}>{Number(usage.elapsed_ms ?? 0)}ms</strong></span>
        </div>
      </div>

      {/* Pending approvals */}
      {approvals.length > 0 && (
        <div style={{ background: 'var(--color-status-warning-bg)', border: '1px solid var(--color-status-warning-border)', borderRadius: '12px', padding: '18px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-status-warning-text)', marginBottom: '14px' }}>
            ✋ Pending Approvals ({approvals.length})
          </p>
          {actionMsg && (
            <div style={{ background: 'var(--color-status-success-bg)', border: '1px solid var(--color-status-success-border)', borderRadius: '8px',
              padding: '8px 12px', marginBottom: '12px', fontSize: 'var(--font-size-xs)', color: 'var(--color-status-success-text)' }}>
              ✓ {actionMsg}
            </div>
          )}
          {approvals.map(ap => (
            <div key={ap.approval_id} style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-status-warning-border)',
              borderRadius: '10px', padding: '14px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontFamily: 'var(--font-family-mono)', fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-xs)', color: 'var(--color-status-warning-text)' }}>
                  {ap.approval_type}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--color-text-soft)', fontFamily: 'var(--font-family-mono)' }}>
                  {ap.approval_id.slice(0, 8)}…
                </span>
              </div>
              <div style={{ fontFamily: 'var(--font-family-mono)', fontSize: '11px', color: 'var(--color-text-base)',
                background: 'var(--color-status-warning-bg)', borderRadius: '6px', padding: '8px', marginBottom: '10px',
                overflow: 'auto', maxHeight: '120px' }}>
                {JSON.stringify(ap.requested_action_json, null, 2)}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => handleApprove(ap.approval_id)}
                  style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none',
                    background: 'var(--color-status-success-text)', color: 'var(--color-text-inverse)', fontSize: 'var(--font-size-xs)',
                    fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer' }}>
                  ✓ Approve
                </button>
                <button onClick={() => handleReject(ap.approval_id)}
                  style={{ flex: 1, padding: '8px', borderRadius: '8px',
                    border: '1px solid var(--color-status-error-border)', background: 'var(--color-status-error-bg)',
                    color: 'var(--color-status-error-text)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer' }}>
                  ✕ Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Trace timeline */}
      <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-soft)', borderRadius: '12px', padding: '18px 20px' }}>
        <p style={{ fontSize: '13px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', marginBottom: '14px' }}>
          Trace Timeline ({events.length} events)
        </p>
        {events.length === 0
          ? <p style={{ color: 'var(--color-text-soft)', fontSize: '13px' }}>No trace events recorded yet.</p>
          : events.map(ev => <TraceEventCard key={ev.trace_event_id} event={ev} />)
        }
      </div>

      {/* Final output */}
      {run.status === 'success' && Object.keys(run.output_json).length > 0 && (
        <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-status-success-border)', borderRadius: '12px', padding: '18px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-status-success-text)', marginBottom: '14px' }}>
            ✓ Final Output
          </p>
          <div style={{ background: 'var(--color-status-success-bg)', border: '1px solid var(--color-status-success-border)', borderRadius: '10px', padding: '14px' }}>
            <JsonViewer data={run.output_json} />
          </div>
        </div>
      )}

      {/* Error */}
      {['failed', 'budget_exceeded', 'output_invalid'].includes(run.status) && (
        <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-status-error-border)', borderRadius: '12px', padding: '18px 20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-status-error-text)', marginBottom: '10px' }}>
            ✕ {run.status.replace(/_/g, ' ').toUpperCase()}
          </p>
          <div style={{ background: 'var(--color-status-error-bg)', border: '1px solid var(--color-status-error-border)', borderRadius: '10px', padding: '14px' }}>
            <JsonViewer data={run.error_json} />
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
