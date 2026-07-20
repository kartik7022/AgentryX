// src/components/shared/ErrorAlert.tsx

interface Props {
  message: string;
  onRetry?: () => void; // optional retry button
}

export default function ErrorAlert({ message, onRetry }: Props) {
  return (
    <div style={styles.wrapper}>
      <span style={styles.icon}>⚠</span>
      <div style={styles.content}>
        <p style={styles.message}>{message}</p>
        {onRetry && (
          <button onClick={onRetry} style={styles.retryBtn}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    backgroundColor: 'var(--color-error-bg)',
    border: '1px solid var(--color-error-border)',
    borderRadius: '8px',
    padding: '14px 16px',
    margin: '24px 0',
  },
  icon: {
    fontSize: '18px',
    color: 'var(--color-error-text)',
    flexShrink: 0,
    marginTop: '1px',
  },
  content: {
    flex: 1,
  },
  message: {
    fontSize: '14px',
    color: 'var(--color-error-text)',
    lineHeight: 1.5,
  },
  retryBtn: {
    marginTop: '8px',
    background: 'none',
    border: '1px solid var(--color-error-border)',
    borderRadius: '5px',
    color: 'var(--color-error-text)',
    fontSize: '13px',
    padding: '4px 12px',
    cursor: 'pointer',
  },
};
