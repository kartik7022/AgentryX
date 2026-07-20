// src/components/ui/index.tsx
import React from 'react';
import { clsx } from 'clsx';
import type { StepKind, ErrorPolicy } from '../../types';

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' }[size];
  return <div className={clsx('animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600', s)} />;
}

const kindMeta: Record<StepKind, { label: string; bg: string; color: string; border: string }> = {
  sql:               { label: 'SQL',              bg: 'var(--color-status-info-bg)', color: 'var(--color-status-info-text)', border: 'var(--color-status-info-border)' },
  rest:              { label: 'REST',             bg: 'var(--color-status-success-bg)', color: 'var(--color-status-success-text)', border: 'var(--color-status-success-border)' },
  graphql:           { label: 'GraphQL',          bg: 'var(--color-primary-50)', color: 'var(--color-primary-800)', border: 'var(--color-primary-200)' },
  ai_transform:      { label: 'AI Transform',     bg: 'var(--color-primary-50)', color: 'var(--color-primary-800)', border: 'var(--color-primary-200)' },
  intent_classify:   { label: 'Intent Classify',  bg: 'var(--color-status-warning-bg)', color: 'var(--color-status-warning-text)', border: 'var(--color-status-warning-border)' },
  policy_route:      { label: 'Policy Route',     bg: 'var(--color-status-warning-bg)', color: 'var(--color-status-warning-text)', border: 'var(--color-status-warning-border)' },
  intent_validate:   { label: 'Intent Validate',  bg: 'var(--color-status-success-bg)', color: 'var(--color-status-success-text)', border: 'var(--color-status-success-border)' },
  adapter_analyze:   { label: 'Adapter Analyze',  bg: 'var(--color-accent-50)', color: 'var(--color-accent-700)', border: 'var(--color-accent-100)' },
  prompt_run:        { label: 'Prompt Run',        bg: 'var(--color-primary-50)', color: 'var(--color-primary-800)', border: 'var(--color-primary-200)' },
  document_generate: { label: 'Doc Generate',     bg: 'var(--color-bg-muted)', color: 'var(--color-text-base)', border: 'var(--color-border-base)' },
  human_review:      { label: 'Human Review',     bg: 'var(--color-status-error-bg)', color: 'var(--color-status-error-text)', border: 'var(--color-status-error-border)' },
  webhook:           { label: 'Webhook',           bg: 'var(--color-status-info-bg)', color: 'var(--color-status-info-text)', border: 'var(--color-status-info-border)' },
  agent_task:        { label: 'Agent Task',        bg: 'var(--color-primary-50)', color: 'var(--color-primary-800)', border: 'var(--color-primary-200)' },
};

export function KindBadge({ kind }: { kind: StepKind }) {
  const meta = kindMeta[kind] ?? { label: kind, bg: 'var(--color-bg-muted)', color: 'var(--color-text-muted)', border: 'var(--color-border-soft)' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 10px', borderRadius: 'var(--radius-pill)',
      fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)',
      background: meta.bg, color: meta.color,
      border: `1px solid ${meta.border}`,
    }}>
      {meta.label}
    </span>
  );
}

const policyMap: Record<ErrorPolicy, string> = {
  fail_fast: 'tag-fail-fast', best_effort: 'tag-best-effort', dependent_fail: 'tag-dependent-fail',
};
const policyLabel: Record<ErrorPolicy, string> = {
  fail_fast: 'Fail Fast', best_effort: 'Best Effort', dependent_fail: 'Dependent Fail',
};
export function PolicyBadge({ policy }: { policy: ErrorPolicy }) {
  return <span className={policyMap[policy]}>{policyLabel[policy]}</span>;
}

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span className={active ? 'tag-active' : 'tag-inactive'}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', active ? 'bg-emerald-500' : 'bg-slate-400')} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

export function EmptyState({ icon, title, description, action }: {
  icon: React.ReactNode; title: string; description: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-slate-300 mb-4">{icon}</div>
      <h3 className="text-slate-700 font-semibold text-lg mb-2">{title}</h3>
      <p className="text-slate-400 text-sm max-w-sm mb-6">{description}</p>
      {action}
    </div>
  );
}

export function ErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm mb-5">
      <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="text-red-400 hover:text-red-600">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      )}
    </div>
  );
}

export function SectionHeader({ title, description, action }: {
  title: string; description?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-7">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {description && <p className="text-slate-500 text-sm mt-1">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function CodeBlock({ code, language = 'sql' }: { code: string; language?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{language}</span>
      </div>
      <pre className="p-4 text-xs font-mono text-slate-700 overflow-x-auto whitespace-pre-wrap leading-relaxed bg-white">
        {code}
      </pre>
    </div>
  );
}

export function StatCard({ label, value, icon, accent }: {
  label: string; value: string | number; icon: React.ReactNode;
  accent?: 'brand' | 'emerald' | 'amber' | 'red';
}) {
  const colors = {
    brand:   'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber:   'bg-amber-50 text-amber-600',
    red:     'bg-red-50 text-red-600',
  };
  return (
    <div className="card p-6">
      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center mb-4',
        accent ? colors[accent] : 'bg-slate-100 text-slate-500')}>
        {icon}
      </div>
      <div className="text-3xl font-bold text-slate-900 mb-1">{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, size = 'md' }: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  if (!open) return null;
  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className={clsx('relative w-full card shadow-2xl', sizes[size])}>
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 text-lg">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
