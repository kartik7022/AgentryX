import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { listExecutions, deleteExecution, type ExecutionRecord } from '../../services/api';

const card: React.CSSProperties = {
  background: 'var(--color-bg-surface)', borderRadius: '16px',
  border: '1px solid var(--color-border-soft)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
};

const statusStyle = (s: string): React.CSSProperties => {
  const map: Record<string,[string,string,string]> = {
    success: ['var(--color-status-success-bg)','var(--color-status-success-text)','var(--color-status-success-border)'],
    partial: ['var(--color-status-warning-bg)','var(--color-status-warning-text)','var(--color-status-warning-border)'],
    failed:  ['var(--color-status-error-bg)','var(--color-status-error-text)','var(--color-status-error-border)'],
  };
  const [bg,color,border] = map[s] ?? ['var(--color-bg-canvas)','var(--color-text-muted)','var(--color-border-soft)'];
  return { display:'inline-flex', alignItems:'center', gap:'5px', padding:'3px 10px', borderRadius:'999px', fontSize:'var(--font-size-xs)', fontWeight:'var(--font-weight-semibold)', background:bg, color, border:`1px solid ${border}` };
};

const statusIcon: Record<string,string> = { success:'✓', partial:'⚠', failed:'✕' };

// ── Readable View ──────────────────────────────────────────────────
function ReadableView({ data }: { data: unknown }) {
  if (!data || typeof data !== 'object') return <p style={{ color:'var(--color-text-soft)', fontSize:'13px' }}>No data</p>;
  const d = data as Record<string,unknown>;

  if ('risk_level' in d || 'score' in d) {
    const level = String(d.risk_level ?? '');
    const score = Number(d.score ?? 0);
    const levelColor  = level==='HIGH' ? 'var(--color-status-error-text)' : level==='MEDIUM' ? 'var(--color-status-warning-text)' : 'var(--color-status-success-text)';
    const levelBg     = level==='HIGH' ? 'var(--color-status-error-bg)' : level==='MEDIUM' ? 'var(--color-status-warning-bg)' : 'var(--color-status-success-bg)';
    const levelBorder = level==='HIGH' ? 'var(--color-status-error-border)' : level==='MEDIUM' ? 'var(--color-status-warning-border)' : 'var(--color-status-success-border)';
    return (
      <div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px', marginBottom:'16px' }}>
          <div style={{ background:levelBg, border:`1px solid ${levelBorder}`, borderRadius:'12px', padding:'16px', textAlign:'center' }}>
            <div style={{ fontSize:'11px', fontWeight:'var(--font-weight-bold)', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'8px' }}>Risk Level</div>
            <div style={{ fontSize:'var(--font-size-xl)', fontWeight:'var(--font-weight-bold)', color:levelColor }}>{level||'N/A'}</div>
          </div>
          <div style={{ background:'var(--color-primary-50)', border:'1px solid var(--color-primary-200)', borderRadius:'12px', padding:'16px', textAlign:'center' }}>
            <div style={{ fontSize:'11px', fontWeight:'var(--font-weight-bold)', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'8px' }}>Score</div>
            <div style={{ fontSize:'var(--font-size-xl)', fontWeight:'var(--font-weight-bold)', color:'var(--color-primary-800)' }}>{score}/100</div>
          </div>
          <div style={{ background:'var(--color-bg-canvas)', border:'1px solid var(--color-border-soft)', borderRadius:'12px', padding:'16px', textAlign:'center' }}>
            <div style={{ fontSize:'11px', fontWeight:'var(--font-weight-bold)', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'8px' }}>Confidence</div>
            <div style={{ fontSize:'var(--font-size-xl)', fontWeight:'var(--font-weight-bold)', color:'var(--color-text-base)' }}>
              {d.confidence ? `${Math.round(Number(d.confidence)*100)}%` : 'N/A'}
            </div>
          </div>
        </div>
        <div style={{ marginBottom:'16px' }}>
          <div style={{ height:'10px', background:'var(--color-bg-muted)', borderRadius:'999px', overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${score}%`, background: level==='HIGH'?'var(--color-status-error-text)':level==='MEDIUM'?'var(--color-status-warning-text)':'var(--color-accent-500)', borderRadius:'999px' }}/>
          </div>
        </div>
        {Boolean(d.reason) && (
          <div style={{ background:'var(--color-bg-canvas)', border:'1px solid var(--color-border-soft)', borderRadius:'10px', padding:'14px', marginBottom:'12px' }}>
            <p style={{ fontSize:'11px', fontWeight:'var(--font-weight-bold)', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'6px' }}>Reason</p>
            <p style={{ fontSize:'13px', color:'var(--color-text-base)', lineHeight:1.6 }}>{String(d.reason)}</p>
          </div>
        )}
        {Boolean(d.recommended_action) && (
          <div style={{ background:levelBg, border:`1px solid ${levelBorder}`, borderRadius:'10px', padding:'14px' }}>
            <p style={{ fontSize:'11px', fontWeight:'var(--font-weight-bold)', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'6px' }}>Recommended Action</p>
            <p style={{ fontSize:'var(--font-size-sm)', fontWeight:'var(--font-weight-bold)', color:levelColor }}>{String(d.recommended_action)}</p>
          </div>
        )}
      </div>
    );
  }

  if ('outstanding' in d || 'payment_status' in d) {
    const status      = String(d.payment_status ?? '');
    const statusColor = status==='OVERDUE' ? 'var(--color-status-error-text)':'var(--color-status-success-text)';
    const statusBg    = status==='OVERDUE' ? 'var(--color-status-error-bg)':'var(--color-status-success-bg)';
    return (
      <div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px', marginBottom:'16px' }}>
          <div style={{ background:'var(--color-status-success-bg)', border:'1px solid var(--color-status-success-border)', borderRadius:'12px', padding:'16px', textAlign:'center' }}>
            <div style={{ fontSize:'11px', fontWeight:'var(--font-weight-bold)', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'8px' }}>Outstanding</div>
            <div style={{ fontSize:'var(--font-size-lg)', fontWeight:'var(--font-weight-bold)', color:'var(--color-status-success-text)' }}>₹{Number(d.outstanding??0).toLocaleString()}</div>
          </div>
          <div style={{ background:statusBg, border:'1px solid var(--color-status-error-border)', borderRadius:'12px', padding:'16px', textAlign:'center' }}>
            <div style={{ fontSize:'11px', fontWeight:'var(--font-weight-bold)', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'8px' }}>Status</div>
            <div style={{ fontSize:'var(--font-size-md)', fontWeight:'var(--font-weight-bold)', color:statusColor }}>{status}</div>
          </div>
          <div style={{ background:'var(--color-status-error-bg)', border:'1px solid var(--color-status-error-border)', borderRadius:'12px', padding:'16px', textAlign:'center' }}>
            <div style={{ fontSize:'11px', fontWeight:'var(--font-weight-bold)', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'8px' }}>Overdue Days</div>
            <div style={{ fontSize:'var(--font-size-lg)', fontWeight:'var(--font-weight-bold)', color:'var(--color-status-error-text)' }}>{String(d.overdue_days??0)} days</div>
          </div>
        </div>
        {Array.isArray(d.invoices) && (
          <div>
            <p style={{ fontSize:'11px', fontWeight:'var(--font-weight-bold)', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'8px' }}>Invoices</p>
            {(d.invoices as Record<string,unknown>[]).map((inv,i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--color-bg-canvas)', border:'1px solid var(--color-border-soft)', borderRadius:'8px', padding:'10px 14px', marginBottom:'6px' }}>
                <span style={{ fontFamily:'var(--font-family-mono)', fontSize:'var(--font-size-xs)', color:'var(--color-text-base)', fontWeight:'var(--font-weight-semibold)' }}>{String(inv.id)}</span>
                <span style={{ fontSize:'13px', color:'var(--color-text-base)' }}>₹{Number(inv.amount).toLocaleString()}</span>
                <span style={{ fontSize:'var(--font-size-xs)', fontWeight:'var(--font-weight-semibold)', color: inv.status==='UNPAID'?'var(--color-status-error-text)':'var(--color-status-success-text)' }}>{String(inv.status)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if ('kyc_status' in d) {
    const verified = d.kyc_status === 'VERIFIED';
    const hasFlags = Array.isArray(d.risk_flags) && (d.risk_flags as unknown[]).length > 0;
    return (
      <div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'16px' }}>
          <div style={{ background: verified?'var(--color-status-success-bg)':'var(--color-status-error-bg)', border:`1px solid ${verified?'var(--color-status-success-border)':'var(--color-status-error-border)'}`, borderRadius:'12px', padding:'16px', textAlign:'center' }}>
            <div style={{ fontSize:'11px', fontWeight:'var(--font-weight-bold)', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'8px' }}>KYC Status</div>
            <div style={{ fontSize:'var(--font-size-lg)', fontWeight:'var(--font-weight-bold)', color: verified?'var(--color-status-success-text)':'var(--color-status-error-text)' }}>{String(d.kyc_status)}</div>
          </div>
          <div style={{ background: hasFlags?'var(--color-status-error-bg)':'var(--color-status-success-bg)', border:`1px solid ${hasFlags?'var(--color-status-error-border)':'var(--color-status-success-border)'}`, borderRadius:'12px', padding:'16px', textAlign:'center' }}>
            <div style={{ fontSize:'11px', fontWeight:'var(--font-weight-bold)', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'8px' }}>Risk Flags</div>
            <div style={{ fontSize:'var(--font-size-lg)', fontWeight:'var(--font-weight-bold)', color: hasFlags?'var(--color-status-error-text)':'var(--color-status-success-text)' }}>{hasFlags?'⚠ Found':'✓ None'}</div>
          </div>
        </div>
        {Array.isArray(d.documents) && (
          <div style={{ marginBottom:'12px' }}>
            <p style={{ fontSize:'11px', fontWeight:'var(--font-weight-bold)', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'8px' }}>Documents</p>
            {(d.documents as Record<string,unknown>[]).map((doc,i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'var(--color-bg-canvas)', border:'1px solid var(--color-border-soft)', borderRadius:'8px', padding:'10px 14px', marginBottom:'6px' }}>
                <span style={{ fontFamily:'var(--font-family-mono)', fontSize:'13px', color:'var(--color-text-base)', fontWeight:'var(--font-weight-semibold)' }}>{String(doc.type)}</span>
                <span style={{ fontSize:'var(--font-size-xs)', fontWeight:'var(--font-weight-semibold)', color: doc.status==='VERIFIED'?'var(--color-status-success-text)':'var(--color-status-error-text)' }}>
                  {doc.status==='VERIFIED'?'✓':'✕'} {String(doc.status)}
                </span>
              </div>
            ))}
          </div>
        )}
        {hasFlags && (
          <div style={{ background:'var(--color-status-error-bg)', border:'1px solid var(--color-status-error-border)', borderRadius:'10px', padding:'14px' }}>
            <p style={{ fontSize:'11px', fontWeight:'var(--font-weight-bold)', color:'var(--color-status-error-text)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'8px' }}>⚠ Risk Flags</p>
           {(d.risk_flags as string[]).map((f: string, i: number) => (
  <div key={i} style={{ fontSize:'13px', color:'var(--color-status-error-text)', fontWeight:'var(--font-weight-semibold)', marginBottom:'4px' }}>
    <span>• {f}</span>
  </div>
))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
      {Object.entries(d).map(([k,v]) => (
        <div key={k} style={{ display:'flex', gap:'16px', alignItems:'flex-start', background:'var(--color-bg-canvas)', border:'1px solid var(--color-border-soft)', borderRadius:'8px', padding:'10px 14px' }}>
          <span style={{ fontSize:'var(--font-size-xs)', fontWeight:'var(--font-weight-bold)', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:'0.05em', minWidth:'140px', flexShrink:0 }}>{k.replace(/_/g,' ')}</span>
          <span style={{ fontSize:'13px', color:'var(--color-text-base)', fontWeight:'var(--font-weight-medium)' }}>{typeof v==='object' ? JSON.stringify(v) : String(v??'N/A')}</span>
        </div>
      ))}
    </div>
  );
}

// ── JSON Viewer ────────────────────────────────────────────────────
function JsonViewer({ data, depth = 0 }: { data: unknown; depth?: number }) {
  const [open, setOpen] = useState(depth <= 0);
  if (data === null)             return <span style={{ color:'var(--color-text-soft)' }}>null</span>;
  if (typeof data === 'boolean') return <span style={{ color:'var(--color-status-warning-text)' }}>{String(data)}</span>;
  if (typeof data === 'number')  return <span style={{ color:'var(--color-primary-800)' }}>{data}</span>;
  if (typeof data === 'string')  return <span style={{ color:'var(--color-status-success-text)' }}>"{data}"</span>;
  if (Array.isArray(data)) {
    if (!data.length) return <span style={{ color:'var(--color-text-soft)' }}>[]</span>;
    return (
      <span>
        <button onClick={() => setOpen(!open)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--color-text-muted)', fontFamily:'var(--font-family-mono)', fontSize:'var(--font-size-xs)', padding:0 }}>
          {open ? '▼ [' : `▶ [${data.length} items]`}
        </button>
        {open && (
          <div style={{ marginLeft:'16px' }}>
            {data.map((v,i) => <div key={i}><JsonViewer data={v} depth={depth+1}/></div>)}
            <div style={{ color:'var(--color-text-muted)', fontSize:'var(--font-size-xs)' }}>]</div>
          </div>
        )}
      </span>
    );
  }
  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string,unknown>);
    if (!entries.length) return <span style={{ color:'var(--color-text-soft)' }}>{'{}'}</span>;
    return (
      <span>
        <button onClick={() => setOpen(!open)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--color-text-muted)', fontFamily:'var(--font-family-mono)', fontSize:'var(--font-size-xs)', padding:0 }}>
          {open ? '▼ {' : `▶ {${entries.length} keys}`}
        </button>
        {open && (
          <div style={{ marginLeft:'16px' }}>
            {entries.map(([k,v]) => (
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

// ── Execution Card ─────────────────────────────────────────────────
function ExecutionCard({ record, onDelete }: { record: ExecutionRecord; onDelete: () => void }) {
  const [expanded, setExpanded]   = useState(false);
  const [activeTab, setActiveTab] = useState<string|null>(Object.keys(record.results)[0] ?? null);
  const [viewMode, setViewMode]   = useState<'readable'|'json'>('readable');
  const [showConfirm, setShowConfirm] = useState(false);

  const resultKeys = Object.keys(record.results);
  const errorKeys  = Object.keys(record.errors);

  const getActualData = (data: unknown) => {
    if (data && typeof data === 'object' && 'data' in (data as Record<string,unknown>)) {
      return (data as Record<string,unknown>).data;
    }
    return data;
  };

  return (
    <div style={{ ...card, marginBottom:'12px', overflow:'hidden' }}>
      {/* Row */}
      <div style={{ display:'flex', alignItems:'center', gap:'12px', padding:'16px 20px', cursor:'pointer' }}
        onClick={() => setExpanded(!expanded)}
        onMouseEnter={e => (e.currentTarget.style.background='var(--color-bg-canvas)')}
        onMouseLeave={e => (e.currentTarget.style.background='')}>
        <span style={statusStyle(record.status)}>
          {statusIcon[record.status]} {record.status}
        </span>
        <Link to={`/history/${record.execution_id}`} onClick={e => e.stopPropagation()}
          style={{ fontFamily:'var(--font-family-mono)', fontWeight:'var(--font-weight-bold)', fontSize:'13px', color:'var(--color-text-strong)', flex:1, textDecoration:'none' }}
          onMouseEnter={e => (e.currentTarget.style.color='var(--color-primary-800)')}
          onMouseLeave={e => (e.currentTarget.style.color='var(--color-text-strong)')}>
          {record.plan_name}
        </Link>
        <span style={{ fontFamily:'var(--font-family-mono)', fontSize:'var(--font-size-xs)', background:'var(--color-bg-muted)', color:'var(--color-text-base)', padding:'2px 8px', borderRadius:'6px' }}>
          {record.entity_type}
        </span>
        <div style={{ display:'flex', gap:'8px' }}>
          <span style={{ fontSize:'var(--font-size-xs)', color:'var(--color-status-success-text)', background:'var(--color-status-success-bg)', padding:'2px 8px', borderRadius:'6px', border:'1px solid var(--color-status-success-border)' }}>
            {resultKeys.length} results
          </span>
          {errorKeys.length > 0 && (
            <span style={{ fontSize:'var(--font-size-xs)', color:'var(--color-status-error-text)', background:'var(--color-status-error-bg)', padding:'2px 8px', borderRadius:'6px', border:'1px solid var(--color-status-error-border)' }}>
              {errorKeys.length} errors
            </span>
          )}
        </div>
        <span style={{ fontSize:'var(--font-size-xs)', color:'var(--color-text-soft)' }}>{record.duration_ms}ms</span>
        <span style={{ fontSize:'var(--font-size-xs)', color:'var(--color-text-soft)', minWidth:'140px', textAlign:'right' }}>
          {new Date(record.executed_at).toLocaleString()}
        </span>
        <button onClick={e => { e.stopPropagation(); setShowConfirm(true); }}
          style={{ background:'none', border:'none', cursor:'pointer', color:'var(--color-text-soft)', fontSize:'var(--font-size-md)', padding:'4px', flexShrink:0 }}>
          🗑
        </button>
        <span style={{ color:'var(--color-text-soft)', fontSize:'var(--font-size-xs)', display:'inline-block', transform: expanded?'rotate(180deg)':'rotate(0)', transition:'transform 0.2s', flexShrink:0 }}>▼</span>
      </div>

      {/* Delete confirm */}
      {showConfirm && (
        <div style={{ background:'var(--color-status-error-bg)', borderTop:'1px solid var(--color-status-error-border)', padding:'12px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:'13px', color:'var(--color-status-error-text)' }}>Delete this execution record?</span>
          <div style={{ display:'flex', gap:'8px' }}>
            <button onClick={() => setShowConfirm(false)}
              style={{ padding:'5px 12px', borderRadius:'8px', border:'1px solid var(--color-border-base)', background:'var(--color-bg-surface)', color:'var(--color-text-base)', fontSize:'var(--font-size-xs)', cursor:'pointer' }}>
              Cancel
            </button>
            <button onClick={() => { onDelete(); setShowConfirm(false); }}
              style={{ padding:'5px 12px', borderRadius:'8px', border:'none', background:'var(--color-status-error-text)', color:'var(--color-bg-surface)', fontSize:'var(--font-size-xs)', cursor:'pointer' }}>
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop:'1px solid var(--color-bg-muted)' }}>
          {/* Params */}
          {Object.keys(record.params).length > 0 && (
            <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--color-bg-muted)', background:'var(--color-bg-canvas)' }}>
              <p style={{ fontSize:'11px', fontWeight:'var(--font-weight-semibold)', textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--color-text-muted)', marginBottom:'8px' }}>Request Params</p>
              <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
               {Object.entries(record.params).map(([k,v]) => (
                  <span key={k} style={{ fontFamily:'var(--font-family-mono)', fontSize:'var(--font-size-xs)', background:'var(--color-border-soft)', color:'var(--color-text-base)', padding:'3px 10px', borderRadius:'6px' }}>
                    {k}: <strong>{typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? 'N/A')}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Errors */}
          {errorKeys.length > 0 && (
            <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--color-bg-muted)' }}>
              <p style={{ fontSize:'11px', fontWeight:'var(--font-weight-semibold)', textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--color-status-error-text)', marginBottom:'8px' }}>Errors</p>
              {Object.entries(record.errors).map(([step,msg]) => (
                <div key={step} style={{ background:'var(--color-status-error-bg)', border:'1px solid var(--color-status-error-border)', borderRadius:'8px', padding:'10px 14px', marginBottom:'6px', display:'flex', gap:'12px', fontSize:'13px' }}>
                  <span style={{ fontFamily:'var(--font-family-mono)', fontWeight:'var(--font-weight-bold)', color:'var(--color-status-error-text)', flexShrink:0 }}>{step}</span>
                  <span style={{ color:'var(--color-status-error-border)' }}>{msg}</span>
                </div>
              ))}
            </div>
          )}

          {/* Results tabs with Readable/JSON toggle */}
          {resultKeys.length > 0 && (
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid var(--color-border-soft)', background:'var(--color-bg-canvas)', padding:'0 12px' }}>
                <div style={{ display:'flex', overflowX:'auto' }}>
                  {resultKeys.map(key => (
                    <button key={key} onClick={() => setActiveTab(key)}
                      style={{ padding:'10px 16px', border:'none', borderBottom: activeTab===key ? '2px solid var(--color-primary-800)':'2px solid transparent', background:'transparent', cursor:'pointer', fontFamily:'var(--font-family-mono)', fontSize:'var(--font-size-xs)', fontWeight:'var(--font-weight-semibold)', color: activeTab===key ? 'var(--color-primary-800)':'var(--color-text-muted)', whiteSpace:'nowrap' }}>
                      {key}
                    </button>
                  ))}
                </div>
                {/* View toggle */}
                <div style={{ display:'flex', gap:'4px', flexShrink:0, padding:'8px 0' }}>
                  <button onClick={() => setViewMode('readable')}
                    style={{ padding:'4px 10px', borderRadius:'6px', border:`1px solid ${viewMode==='readable'?'var(--color-primary-800)':'var(--color-border-soft)'}`, background: viewMode==='readable'?'var(--color-primary-800)':'var(--color-bg-surface)', color: viewMode==='readable'?'var(--color-bg-surface)':'var(--color-text-muted)', fontSize:'11px', fontWeight:'var(--font-weight-semibold)', cursor:'pointer' }}>
                    📊 Readable
                  </button>
                  <button onClick={() => setViewMode('json')}
                    style={{ padding:'4px 10px', borderRadius:'6px', border:`1px solid ${viewMode==='json'?'var(--color-primary-800)':'var(--color-border-soft)'}`, background: viewMode==='json'?'var(--color-primary-800)':'var(--color-bg-surface)', color: viewMode==='json'?'var(--color-bg-surface)':'var(--color-text-muted)', fontSize:'11px', fontWeight:'var(--font-weight-semibold)', cursor:'pointer' }}>
                    {'{ }'} JSON
                  </button>
                </div>
              </div>
              <div style={{ padding:'16px 20px', maxHeight:'400px', overflowY:'auto' }}>
                {activeTab && (
                  viewMode === 'readable'
                    ? <ReadableView data={getActualData(record.results[activeTab])}/>
                    : <div style={{ fontFamily:'var(--font-family-mono)', fontSize:'var(--font-size-xs)', lineHeight:1.6 }}>
                        <JsonViewer data={record.results[activeTab]}/>
                      </div>
                )}
              </div>
            </div>
          )}

          {/* Re-run */}
          <div style={{ padding:'12px 20px', borderTop:'1px solid var(--color-bg-muted)', background:'var(--color-bg-canvas)', display:'flex', justifyContent:'flex-end' }}>
            <Link to={`/execute?plan=${record.plan_name}&entity=${record.entity_type}`}
              style={{ display:'inline-flex', alignItems:'center', gap:'6px', background:'var(--color-primary-800)', color:'var(--color-bg-surface)', padding:'8px 16px', borderRadius:'8px', fontSize:'13px', fontWeight:'var(--font-weight-semibold)', textDecoration:'none' }}>
              ▶ Re-run this Plan
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────
export default function HistoryPage() {
  const [records, setRecords]           = useState<ExecutionRecord[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [search, setSearch]             = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => { loadRecords(); }, []);

  async function loadRecords() {
    setLoading(true);
    try {
      const data = await listExecutions({ limit:100 });
      setRecords(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteExecution(id);
      setRecords(prev => prev.filter(r => r.execution_id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  const filtered = records.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.plan_name.toLowerCase().includes(q) || r.entity_type.toLowerCase().includes(q) || r.tenant_id.toLowerCase().includes(q);
    const matchStatus = !filterStatus || r.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const stats = {
    total:   records.length,
    success: records.filter(r => r.status==='success').length,
    partial: records.filter(r => r.status==='partial').length,
    failed:  records.filter(r => r.status==='failed').length,
  };

  const inputStyle: React.CSSProperties = {
    background:'var(--color-bg-surface)', border:'1px solid var(--color-border-base)', borderRadius:'10px',
    padding:'9px 14px', fontSize:'var(--font-size-sm)', color:'var(--color-text-strong)',
    boxShadow:'0 1px 2px rgba(0,0,0,0.04)', fontFamily:'inherit',
  };

  return (
    <div style={{ padding:'32px' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'28px' }}>
        <div>
          <h1 style={{ fontSize:'var(--font-size-lg)', fontWeight:'var(--font-weight-bold)', color:'var(--color-text-strong)' }}>Execution History</h1>
          <p style={{ color:'var(--color-text-muted)', fontSize:'var(--font-size-sm)', marginTop:'4px' }}>
            All past plan executions from the database. Last 100 records shown.
          </p>
        </div>
        <div style={{ display:'flex', gap:'10px' }}>
          <button onClick={loadRecords}
            style={{ display:'inline-flex', alignItems:'center', gap:'8px', background:'var(--color-bg-surface)', color:'var(--color-text-base)', padding:'10px 18px', borderRadius:'10px', fontWeight:'var(--font-weight-medium)', fontSize:'var(--font-size-sm)', border:'1px solid var(--color-border-base)', cursor:'pointer' }}>
            ↺ Refresh
          </button>
          <Link to="/execute"
            style={{ display:'inline-flex', alignItems:'center', gap:'8px', background:'var(--color-primary-800)', color:'var(--color-bg-surface)', padding:'10px 18px', borderRadius:'10px', fontWeight:'var(--font-weight-medium)', fontSize:'var(--font-size-sm)', textDecoration:'none' }}>
            ▶ New Execution
          </Link>
        </div>
      </div>

      {error && (
        <div style={{ background:'var(--color-status-error-bg)', border:'1px solid var(--color-status-error-border)', borderRadius:'12px', padding:'12px 16px', color:'var(--color-status-error-text)', fontSize:'var(--font-size-sm)', marginBottom:'16px', display:'flex', justifyContent:'space-between' }}>
          <span>⚠ {error}</span>
          <button onClick={() => setError('')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--color-status-error-text)' }}>✕</button>
        </div>
      )}

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:'80px' }}>
          <div style={{ width:'32px', height:'32px', border:'3px solid var(--color-border-soft)', borderTopColor:'var(--color-primary-800)', borderRadius:'50%', animation:'spin 0.7s linear infinite' }}/>
          <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
        </div>
      ) : (
        <>
          {/* Stats */}
          {records.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'16px', marginBottom:'24px' }}>
              {[
                { label:'Total Runs', value:stats.total,   bg:'var(--color-primary-50)', color:'var(--color-primary-800)' },
                { label:'Successful', value:stats.success, bg:'var(--color-status-success-bg)', color:'var(--color-status-success-text)' },
                { label:'Partial',    value:stats.partial, bg:'var(--color-status-warning-bg)', color:'var(--color-status-warning-text)' },
                { label:'Failed',     value:stats.failed,  bg:'var(--color-status-error-bg)', color:'var(--color-status-error-text)' },
              ].map(s => (
                <div key={s.label} style={{ background:'var(--color-bg-surface)', borderRadius:'16px', border:'1px solid var(--color-border-soft)', padding:'20px', boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize:'var(--font-size-xl)', fontWeight:'var(--font-weight-bold)', color:s.color, marginBottom:'4px' }}>{s.value}</div>
                  <div style={{ fontSize:'13px', color:'var(--color-text-muted)' }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Filters */}
          {records.length > 0 && (
            <div style={{ display:'flex', gap:'12px', marginBottom:'16px', flexWrap:'wrap' }}>
              <div style={{ position:'relative', flex:1, minWidth:'200px', maxWidth:'300px' }}>
                <span style={{ position:'absolute', left:'12px', top:'50%', transform:'translateY(-50%)', color:'var(--color-text-soft)' }}>🔍</span>
                <input style={{ ...inputStyle, width:'100%', paddingLeft:'36px', boxSizing:'border-box' as const }}
                  placeholder="Search by plan, entity, tenant…"
                  value={search} onChange={e => setSearch(e.target.value)}/>
              </div>
              <select style={{ ...inputStyle, minWidth:'150px' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">All statuses</option>
                <option value="success">Success</option>
                <option value="partial">Partial</option>
                <option value="failed">Failed</option>
              </select>
              {(search || filterStatus) && (
                <button onClick={() => { setSearch(''); setFilterStatus(''); }}
                  style={{ background:'none', border:'none', cursor:'pointer', color:'var(--color-text-muted)', fontSize:'var(--font-size-sm)' }}>
                  Clear
                </button>
              )}
            </div>
          )}

          {records.length > 0 && (
            <p style={{ fontSize:'var(--font-size-xs)', color:'var(--color-text-soft)', marginBottom:'12px' }}>
              Showing {filtered.length} of {records.length} executions
            </p>
          )}

          {records.length === 0 ? (
            <div style={{ ...card, padding:'80px', textAlign:'center' }}>
              <div style={{ fontSize:'40px', marginBottom:'16px' }}>📜</div>
              <p style={{ color:'var(--color-text-base)', fontWeight:'var(--font-weight-semibold)', fontSize:'var(--font-size-md)', marginBottom:'8px' }}>No executions yet</p>
              <p style={{ color:'var(--color-text-soft)', fontSize:'var(--font-size-sm)', marginBottom:'24px' }}>Run a plan from the Execute page and results will appear here.</p>
              <Link to="/execute" style={{ background:'var(--color-primary-800)', color:'var(--color-bg-surface)', padding:'10px 20px', borderRadius:'10px', fontWeight:'var(--font-weight-medium)', fontSize:'var(--font-size-sm)', textDecoration:'none' }}>
                ▶ Execute a Plan
              </Link>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ ...card, padding:'60px', textAlign:'center' }}>
              <p style={{ color:'var(--color-text-base)', fontWeight:'var(--font-weight-semibold)', fontSize:'15px', marginBottom:'8px' }}>No results match your filters</p>
              <button onClick={() => { setSearch(''); setFilterStatus(''); }}
                style={{ background:'none', border:'1px solid var(--color-border-base)', borderRadius:'8px', padding:'8px 16px', color:'var(--color-text-base)', fontSize:'var(--font-size-sm)', cursor:'pointer' }}>
                Clear filters
              </button>
            </div>
          ) : (
            <div>
              {filtered.map(record => (
                <ExecutionCard key={record.execution_id} record={record} onDelete={() => handleDelete(record.execution_id)}/>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
