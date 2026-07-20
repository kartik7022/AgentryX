// src/components/shared/EmptyState.tsx

interface Props {
  title: string;
  description?: string;
  action?: React.ReactNode; // optional button passed in from parent
}

export default function EmptyState({ title, description, action }: Props) {
  return (
    <div style={styles.wrapper}>
      {/* Simple illustration — just a big icon */}
      <div style={styles.icon}>◇</div>
      <h3 style={styles.title}>{title}</h3>
      {description && <p style={styles.description}>{description}</p>}
      {action && <div style={{ marginTop: '20px' }}>{action}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '80px 20px',
    textAlign: 'center',
  },
  icon: {
    fontSize: '48px',
    color: 'var(--color-primary-200)',
    marginBottom: '16px',
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--color-text-base)',
    marginBottom: '8px',
  },
  description: {
    fontSize: '14px',
    color: 'var(--color-text-muted)',
    maxWidth: '340px',
    lineHeight: 1.6,
  },
};
