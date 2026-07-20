// src/components/editor/PreviewBar.tsx

interface Props {
  onRefresh: () => void;
  isRefreshing: boolean;
  format: string;
  onFormatChange: (f: string) => void;
  device: string;
  onDeviceChange: (d: string) => void;
}

const DEVICES = ['Desktop', 'Tablet', 'Mobile'];
const FORMATS = ['HTML', 'PDF', 'DOCX', 'XLSX', 'MD'];

export default function PreviewBar({
  onRefresh, isRefreshing,
  format, onFormatChange,
  device, onDeviceChange,
}: Props) {
  return (
    <div style={styles.bar}>

      <span style={styles.label}>Preview</span>

      {/* Format selector */}
      <div style={styles.group}>
        {FORMATS.map((f) => (
          <button key={f}
            style={{ ...styles.toggleBtn, ...(format === f ? styles.toggleActive : {}) }}
            onClick={() => onFormatChange(f)}
          >
            {f}
          </button>
        ))}
      </div>

      <div style={styles.sep} />

      {/* Device breakpoint */}
      <div style={styles.group}>
        {DEVICES.map((d) => (
          <button key={d}
            style={{ ...styles.toggleBtn, ...(device === d ? styles.toggleActive : {}) }}
            onClick={() => onDeviceChange(d)}
          >
            {d}
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      <button
        style={{ ...styles.refreshBtn, opacity: isRefreshing ? 0.6 : 1 }}
        onClick={onRefresh}
        disabled={isRefreshing}
      >
        {isRefreshing ? '↻ Refreshing...' : '↻ Refresh Preview'}
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar:          { height: '44px', backgroundColor: '#ffffff', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', padding: '0 16px', gap: '10px', flexShrink: 0 },
  label:        { fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '4px' },
  group:        { display: 'flex', gap: '2px', backgroundColor: '#f1f5f9', padding: '2px', borderRadius: '6px' },
  toggleBtn:    { background: 'none', border: 'none', borderRadius: '4px', padding: '3px 10px', fontSize: '12px', color: '#64748b', cursor: 'pointer', fontWeight: 500 },
  toggleActive: { backgroundColor: '#ffffff', color: 'var(--color-primary-800)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' },
  sep:          { width: '1px', height: '18px', backgroundColor: '#e2e8f0' },
  refreshBtn:   { background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', color: 'var(--color-primary-800)', fontWeight: 500, cursor: 'pointer' },
};
