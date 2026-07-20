// src/components/shared/LoadingSpinner.tsx

interface Props {
  message?: string;
}

export default function LoadingSpinner({ message = 'Loading...' }: Props) {
  return (
    <div style={styles.wrapper}>
      <div style={styles.spinner} />
      <p style={styles.message}>{message}</p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    gap: '14px',
  },
  spinner: {
    width: '36px',
    height: '36px',
    border: '3px solid var(--color-border-soft)',
    borderTopColor: 'var(--color-primary-800)',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  message: {
    fontSize: '14px',
    color: 'var(--color-text-muted)',
  },
};

// Inject the keyframe once into the document head
// (avoids needing a separate CSS file just for this)
const styleTag = document.createElement('style');
styleTag.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(styleTag);
