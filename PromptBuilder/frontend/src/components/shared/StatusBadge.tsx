// src/components/shared/StatusBadge.tsx

import type { TemplateStatus } from '../../types/api';

interface Props {
  status: TemplateStatus | string;
}

// Color map: each status gets its own background + text color
const STATUS_STYLES: Record<string, React.CSSProperties> = {
  draft: {
    backgroundColor: 'var(--color-warning-bg)',
    color: 'var(--color-warning-text)',
    border: '1px solid var(--color-warning-border)',
  },
  published: {
    backgroundColor: 'var(--color-success-bg)',
    color: 'var(--color-success-text)',
    border: '1px solid var(--color-success-border)',
  },
  archived: {
    backgroundColor: 'var(--color-bg-muted)',
    color: 'var(--color-text-base)',
    border: '1px solid var(--color-border-base)',
  },
};

export default function StatusBadge({ status }: Props) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.archived;

  return (
    <span
      style={{
        ...style,
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: '20px',
        fontSize: '12px',
        fontWeight: 500,
        textTransform: 'capitalize',
      }}
    >
      {status}
    </span>
  );
}
