import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getExecution } from '../../services/history';
import type { ExecutionRecord } from '../../services/history';

const card: React.CSSProperties = {
  background: 'var(--color-bg-surface)', borderRadius: '16px',
  border: '1px solid var(--color-border-soft)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
};

const badge = (bg: string, color: string, border: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: '5px',
  padding: '3px 10px', borderRadius: '999px', fontSize: 'var(--font-size-xs)',
  fontWeight: 'var(--font-weight-semibold)', background: bg, color, border: `1px solid ${border}`,
});

const statusMap: Record<string, [string, string, string, string]> = {
  success: ['var(--color-status-success-bg)', 'var(--color-status-success-text)', 'var(--color-status-success-border)', '✓'],
  partial: ['var(--color-status-warning-bg)', 'var(--color-status-warning-text)', 'var(--color-status-warning-border)', '⚠'],
  failed:  ['var(--color-status-error-bg)', 'var(--color-status-error-text)', 'var(--color-status-error-border)', '✕'],
};

function JsonViewer({ data, depth = 0 }: { data: unknown; depth?: number }) {
  const [open, setOpen] = useState(depth <= 1);

  if (data === null)             return <span style={{ color:'var(--color-text-soft)' }}>null</span>;
  if (typeof data === 'boolean') return <span style={{ color:'var(--color-status-warning-text)' }}>{String(data)}</span>;
  if (typeof data === 'number')  return <span style={{ color:'var(--color-primary-800)' }}>{data}</span>;
  if (typeof data === 'string')  return <span style={{ color:'var(--color-status-success-text)' }}>"{data}"</span>;

  if (Array.isArray(data)) {
    if (!data.length) return <span style={{ color:'var(--color-text-soft)' }}>[]</span>;
    return (
      <span>
        <button onClick={() => setOpen(!open)}
          style={{ background:'none', border:'none', cursor:'pointer', color:'var(--color-text-muted)', fontFamily:'var(--font-family-mono)', fontSize:'var(--font-size-xs)', padding:0 }}>
          {open ? '▼ [' : `▶ [${data.length} items]`}
        </button>
        {open && (
          <div style={{ marginLeft:'16px' }}>
            {data.map((v, i) => <div key={i}><JsonViewer data={v} depth={depth+1}/></div>)}
            <div style={{ color:'var(--color-text-muted)', fontSize:'var(--font-size-xs)' }}>]</div>
          </div>
        )}
      </span>
    );
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    if (!entries.length) return <span style={{ color:'var(--color-text-soft)' }}>{'{}'}</span>;
    return (
      <span>
        <button onClick={() => setOpen(!open)}
          style={{ background:'none', border:'none', cursor:'pointer', color:'var(--color-text-muted)', fontFamily:'var(--font-family-mono)', fontSize:'var(--font-size-xs)', padding:0 }}>
          {open ? '▼ {' : `▶ {${entries.length} keys}`}
        </button>
        {open && (
          <div style={{ marginLeft:'16px' }}>
            {entries.map(([k, v]) => (
              <div key={k} style={{ display:'flex', gap:'8px', alignItems:'flex-start' }}>
                <span style={{ color:'var(--color-primary-800)', fontFamily:'var(--font-family-mono)', fontSize:'var(--font-size-xs)', flexShrink:0 }}>"{k}":</span>
                <JsonViewer data={v} depth={depth+1}/>
              </div>
            ))}
            <div style={{ color:'var(--color-text-muted)', fontSize:'var(--font-size-xs)' }}>{'}'}</div>
          </div>
        )}
      </span>
    );
  }

  return <span style={{ fontFamily:'var(--font-family-mono)', fontSize:'var(--font-size-xs)' }}>{String(data)}</span>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button onClick={handleCopy}
      style={{ display:'inline-flex', alignItems:'center', gap:'6px', padding:'6px 12px', borderRadius:'8px', border:'1px solid var(--color-border-base)', background:'var(--color-bg-surface)', color:'var(--color-text-base)', fontSize:'var(--font-size-xs)', fontWeight:'var(--font-weight-medium)', cursor:'pointer' }}>
      {copied ? '✓ Copied' : '⎘ Copy JSON'}
    </button>
  );
}

export default function ExecutionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const record = useMemo<ExecutionRecord | null>(() => id ? getExecution(id) : null, [id]);
  const notFound = !record;
  const [activeTab, setActiveTab] = useState<string | null>(null);

  if (notFound) return (
    <div style={{ padding:'32px' }}>
      <Link to="/history"
        style={{ display:'inline-flex', alignItems:'center', gap:'6px', fontSize:'var(--font-size-sm)', color:'var(--color-text-muted)', textDecoration:'none', marginBottom:'24px' }}>
        ← Back to History
      </Link>
      <div style={{ ...card, padding:'60px', textAlign:'center' }}>
        <div style={{ fontSize:'40px', marginBottom:'16px' }}>🔍</div>
        <p style={{ color:'var(--color-text-base)', fontWeight:'var(--font-weight-semibold)', fontSize:'var(--font-size-md)', marginBottom:'8px' }}>Execution not found</p>
        <p style={{ color:'var(--color-text-soft)', fontSize:'var(--font-size-sm)', marginBottom:'24px' }}>
          This execution record may have been deleted or cleared.
        </p>
        <Link to="/history"
          style={{ background:'var(--color-primary-800)', color:'var(--color-bg-surface)', padding:'10px 20px', borderRadius:'10px', fontWeight:'var(--font-weight-medium)', fontSize:'var(--font-size-sm)', textDecoration:'none' }}>
          View History
        </Link>
      </div>
    </div>
  );

  if (!record) return (
    <div style={{ display:'flex', justifyContent:'center', padding:'80px' }}>
      <div style={{ width:'32px', height:'32px', border:'3px solid var(--color-border-soft)', borderTopColor:'var(--color-primary-800)', borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
      <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
    </div>
  );

  const [sb, sc, sbr, icon] = statusMap[record.status] ?? ['var(--color-bg-canvas)','var(--color-text-muted)','var(--color-border-soft)','?'];
  const resultKeys = Object.keys(record.result.results);
  const errorKeys  = Object.keys(record.result.errors);
  const selectedTab = activeTab && resultKeys.includes(activeTab) ? activeTab : resultKeys[0] ?? null;

  return (
    <div style={{ padding:'32px' }}>

      {/* Back */}
      <Link to="/history"
        style={{ display:'inline-flex', alignItems:'center', gap:'6px', fontSize:'var(--font-size-sm)', color:'var(--color-text-muted)', textDecoration:'none', marginBottom:'24px' }}>
        ← Back to History
      </Link>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'28px' }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:'12px', marginBottom:'6px', flexWrap:'wrap' }}>
            <h1 style={{ fontSize:'var(--font-size-lg)', fontWeight:'var(--font-weight-bold)', color:'var(--color-text-strong)', fontFamily:'var(--font-family-mono)' }}>
              {record.plan_name}
            </h1>
            <span style={badge(sb, sc, sbr)}>
              {icon} {record.status}
            </span>
          </div>
          <p style={{ color:'var(--color-text-muted)', fontSize:'13px', fontFamily:'var(--font-family-mono)' }}>
            {record.id}
          </p>
        </div>

        {/* Actions */}
        <div style={{ display:'flex', gap:'10px' }}>
          <CopyButton text={JSON.stringify(record.result, null, 2)} />
          <Link
            to={`/execute?plan=${record.plan_name}&entity=${record.entity_type}`}
            style={{ display:'inline-flex', alignItems:'center', gap:'8px', background:'var(--color-primary-800)', color:'var(--color-bg-surface)', padding:'10px 18px', borderRadius:'10px', fontWeight:'var(--font-weight-semibold)', fontSize:'var(--font-size-sm)', textDecoration:'none' }}>
            ▶ Re-run Plan
          </Link>
        </div>
      </div>

      {/* Meta grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'16px', marginBottom:'24px' }}>
        {[
          { label:'Plan',        value: record.plan_name,                            mono:true  },
          { label:'Entity Type', value: record.entity_type,                          mono:true  },
          { label:'Tenant ID',   value: record.tenant_id,                            mono:true  },
          { label:'Duration',    value: `${record.duration_ms}ms`,                   mono:true  },
        ].map(m => (
          <div key={m.label} style={{ ...card, padding:'16px' }}>
            <p style={{ fontSize:'11px', color:'var(--color-text-soft)', fontWeight:'var(--font-weight-semibold)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'6px' }}>{m.label}</p>
            <p style={{ fontSize:'var(--font-size-sm)', fontWeight:'var(--font-weight-semibold)', color:'var(--color-text-strong)', fontFamily: m.mono ? 'var(--font-family-mono)':'inherit' }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Executed at */}
      <div style={{ ...card, padding:'16px 20px', marginBottom:'24px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          <span style={{ fontSize:'var(--font-size-lg)' }}>🕐</span>
          <div>
            <p style={{ fontSize:'11px', color:'var(--color-text-soft)', fontWeight:'var(--font-weight-semibold)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'2px' }}>Executed At</p>
            <p style={{ fontSize:'var(--font-size-sm)', fontWeight:'var(--font-weight-semibold)', color:'var(--color-text-strong)' }}>{new Date(record.executed_at).toLocaleString()}</p>
          </div>
        </div>
        <div style={{ display:'flex', gap:'24px', textAlign:'center' }}>
          <div>
            <p style={{ fontSize:'var(--font-size-lg)', fontWeight:'var(--font-weight-bold)', color:'var(--color-status-success-text)' }}>{resultKeys.length}</p>
            <p style={{ fontSize:'var(--font-size-xs)', color:'var(--color-text-muted)' }}>Results</p>
          </div>
          <div>
            <p style={{ fontSize:'var(--font-size-lg)', fontWeight:'var(--font-weight-bold)', color: errorKeys.length > 0 ? 'var(--color-status-error-text)':'var(--color-text-soft)' }}>{errorKeys.length}</p>
            <p style={{ fontSize:'var(--font-size-xs)', color:'var(--color-text-muted)' }}>Errors</p>
          </div>
        </div>
      </div>

      {/* Request Params */}
      {Object.keys(record.params).length > 0 && (
        <div style={{ ...card, padding:'20px', marginBottom:'20px' }}>
          <h2 style={{ fontSize:'15px', fontWeight:'var(--font-weight-bold)', color:'var(--color-text-strong)', marginBottom:'14px' }}>Request Params</h2>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:'10px' }}>
            {Object.entries(record.params).map(([k, v]) => (
              <div key={k} style={{ background:'var(--color-bg-canvas)', border:'1px solid var(--color-border-soft)', borderRadius:'10px', padding:'12px' }}>
                <p style={{ fontSize:'11px', color:'var(--color-text-soft)', fontWeight:'var(--font-weight-semibold)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'4px' }}>{k}</p>
                <p style={{ fontFamily:'var(--font-family-mono)', fontSize:'13px', color:'var(--color-text-strong)', fontWeight:'var(--font-weight-semibold)', wordBreak:'break-all' }}>{v}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Errors */}
      {errorKeys.length > 0 && (
        <div style={{ ...card, padding:'20px', marginBottom:'20px' }}>
          <h2 style={{ fontSize:'15px', fontWeight:'var(--font-weight-bold)', color:'var(--color-status-error-text)', marginBottom:'14px' }}>
            ✕ Errors ({errorKeys.length})
          </h2>
          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
            {Object.entries(record.result.errors).map(([step, msg]) => (
              <div key={step} style={{ background:'var(--color-status-error-bg)', border:'1px solid var(--color-status-error-border)', borderRadius:'10px', padding:'14px 16px' }}>
                <p style={{ fontFamily:'var(--font-family-mono)', fontWeight:'var(--font-weight-bold)', color:'var(--color-status-error-text)', fontSize:'13px', marginBottom:'4px' }}>{step}</p>
                <p style={{ color:'var(--color-status-error-border)', fontSize:'13px' }}>{msg}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {resultKeys.length > 0 && (
        <div style={{ ...card, overflow:'hidden', marginBottom:'20px' }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--color-bg-muted)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <h2 style={{ fontSize:'15px', fontWeight:'var(--font-weight-bold)', color:'var(--color-text-strong)', margin:0 }}>
              ✓ Results ({resultKeys.length} steps)
            </h2>
            {selectedTab && (
              <CopyButton text={JSON.stringify(record.result.results[selectedTab], null, 2)} />
            )}
          </div>

          {/* Tabs */}
          <div style={{ display:'flex', borderBottom:'1px solid var(--color-border-soft)', background:'var(--color-bg-canvas)', overflowX:'auto' }}>
            {resultKeys.map(key => (
              <button key={key} onClick={() => setActiveTab(key)}
                style={{ padding:'11px 18px', border:'none', borderBottom: selectedTab===key ? '2px solid var(--color-primary-800)':'2px solid transparent',
                  background:'transparent', cursor:'pointer', fontFamily:'var(--font-family-mono)', fontSize:'var(--font-size-xs)', fontWeight:'var(--font-weight-semibold)',
                  color: selectedTab===key ? 'var(--color-primary-800)':'var(--color-text-muted)', whiteSpace:'nowrap', transition:'color 0.15s' }}>
                {key}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ padding:'20px', overflowY:'auto', maxHeight:'500px', fontFamily:'var(--font-family-mono)', fontSize:'var(--font-size-xs)', lineHeight:1.8 }}>
            {selectedTab && <JsonViewer data={record.result.results[selectedTab]} />}
          </div>
        </div>
      )}

      {/* Raw JSON */}
      <details style={card}>
        <summary style={{ padding:'16px 20px', cursor:'pointer', fontWeight:'var(--font-weight-semibold)', color:'var(--color-text-base)', fontSize:'var(--font-size-sm)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span>{'{ }'} Raw JSON Response</span>
        </summary>
        <div style={{ borderTop:'1px solid var(--color-bg-muted)', padding:'20px' }}>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:'10px' }}>
            <CopyButton text={JSON.stringify(record.result, null, 2)} />
          </div>
          <pre style={{ fontFamily:'var(--font-family-mono)', fontSize:'var(--font-size-xs)', color:'var(--color-text-base)', overflow:'auto', maxHeight:'400px', background:'var(--color-bg-canvas)', padding:'16px', borderRadius:'10px', border:'1px solid var(--color-border-soft)', lineHeight:1.6 }}>
            {JSON.stringify(record.result, null, 2)}
          </pre>
        </div>
      </details>

      <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}
