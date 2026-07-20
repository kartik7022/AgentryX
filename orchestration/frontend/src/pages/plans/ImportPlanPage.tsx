import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { parsePlanFromJson, createPlan } from '../../services/api';
import type { PlanCreate } from '../../types';

const card: React.CSSProperties = {
  background: 'var(--color-bg-surface)', borderRadius: '16px',
  border: '1px solid var(--color-border-soft)', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
};

const inp: React.CSSProperties = {
  width: '100%', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-base)',
  borderRadius: '10px', padding: '10px 14px', fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-strong)', fontFamily: 'inherit', boxSizing: 'border-box' as const,
};

const lbl: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 'var(--font-weight-semibold)',
  textTransform: 'uppercase' as const, letterSpacing: '0.07em',
  color: 'var(--color-text-muted)', marginBottom: '6px',
};

export default function ImportPlanPage() {
  const navigate  = useNavigate();
  const fileRef   = useRef<HTMLInputElement>(null);
  const [dragging, setDragging]   = useState(false);
  const [parsed, setParsed]       = useState<PlanCreate | null>(null);
  const [fileName, setFileName]   = useState('');
  const [parseError, setParseError] = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [nameOverride, setNameOverride] = useState('');

  async function handleFile(file: File) {
    if (!file.name.endsWith('.json')) {
      setParseError('Only .json files are supported.');
      return;
    }
    setParseError('');
    setParsed(null);
    try {
      const plan = await parsePlanFromJson(file);
      setParsed(plan);
      setFileName(file.name);
      setNameOverride(plan.name);
    } catch (err: unknown) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse file.');
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  async function handleImport() {
    if (!parsed) return;
    setLoading(true);
    setError('');
    try {
      const payload: PlanCreate = { ...parsed, name: nameOverride.trim() || parsed.name };
      const created = await createPlan(payload);
      navigate(`/plans/${created.plan_id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to import plan.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: '32px', maxWidth: '720px' }}>

      {/* Back */}
      <Link to="/plans"
        style={{ display:'inline-flex', alignItems:'center', gap:'6px', fontSize:'var(--font-size-sm)', color:'var(--color-text-muted)', textDecoration:'none', marginBottom:'24px' }}>
        ← Back to Plans
      </Link>

      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)' }}>Import Plan</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)', marginTop: '4px' }}>
          Upload a previously exported plan JSON file to create a new plan.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background:'var(--color-status-error-bg)', border:'1px solid var(--color-status-error-border)', borderRadius:'12px', padding:'14px 16px', color:'var(--color-status-error-text)', fontSize:'var(--font-size-sm)', marginBottom:'20px', display:'flex', justifyContent:'space-between' }}>
          <span>⚠ {error}</span>
          <button onClick={() => setError('')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--color-status-error-text)' }}>✕</button>
        </div>
      )}

      {/* Drop Zone */}
      <div style={{ ...card, padding: '32px', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', marginBottom: '16px' }}>Upload Plan File</h2>

        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? 'var(--color-primary-800)' : 'var(--color-border-soft)'}`,
            borderRadius: '12px',
            padding: '48px 24px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragging ? 'var(--color-primary-50)' : 'var(--color-bg-canvas)',
            transition: 'all 0.15s',
          }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📂</div>
          <p style={{ fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-base)', marginBottom: '6px' }}>
            {fileName ? `✓ ${fileName}` : 'Drop your plan JSON file here'}
          </p>
          <p style={{ fontSize: '13px', color: 'var(--color-text-soft)' }}>
            or click to browse — only .json files supported
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleFileInput}
          />
        </div>

        {parseError && (
          <p style={{ color: 'var(--color-status-error-text)', fontSize: '13px', marginTop: '8px' }}>⚠ {parseError}</p>
        )}
      </div>

      {/* Preview */}
      {parsed && (
        <div style={{ ...card, padding: '24px', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-strong)', marginBottom: '16px' }}>Plan Preview</h2>

          {/* Name override */}
          <div style={{ marginBottom: '16px' }}>
            <label style={lbl}>Plan Name</label>
            <input
              style={inp}
              value={nameOverride}
              onChange={e => setNameOverride(e.target.value.replace(/\s/g,'_').toLowerCase())}
              placeholder="plan_name"
            />
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-soft)', marginTop: '4px' }}>
              Name was auto-suffixed with _imported. Change if needed.
            </p>
          </div>

          {/* Parsed fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Entity Type',     value: parsed.entity_type },
              { label: 'Error Policy',    value: parsed.error_policy ?? 'best_effort' },
              { label: 'Max Concurrency', value: String(parsed.max_concurrency ?? 8) },
              { label: 'Steps',           value: String((parsed.steps ?? []).length) },
              { label: 'Tenant ID',       value: parsed.tenant_id ?? 'Global' },
              { label: 'Description',     value: parsed.description ?? '—' },
            ].map(m => (
              <div key={m.label} style={{ background: 'var(--color-bg-canvas)', borderRadius: '10px', border: '1px solid var(--color-border-soft)', padding: '12px' }}>
                <p style={{ fontSize: '11px', color: 'var(--color-text-soft)', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{m.label}</p>
                <p style={{ fontSize: '13px', color: 'var(--color-text-strong)', fontWeight: 'var(--font-weight-semibold)', fontFamily: 'var(--font-family-mono)' }}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* Steps preview */}
          {(parsed.steps ?? []).length > 0 && (
            <div>
              <p style={{ fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                Steps to import ({(parsed.steps ?? []).length})
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {(parsed.steps ?? []).map((step, i) => {
                  const kindColors: Record<string, [string,string]> = {
                    sql:          ['var(--color-status-info-bg)','var(--color-status-info-text)'],
                    rest:         ['var(--color-status-success-bg)','var(--color-status-success-text)'],
                    graphql:      ['var(--color-primary-50)','var(--color-primary-800)'],
                    ai_transform: ['var(--color-primary-50)','var(--color-primary-800)'],
                  };
                  const [bg, color] = kindColors[step.kind] ?? ['var(--color-bg-canvas)','var(--color-text-base)'];
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--color-bg-canvas)', borderRadius: '8px', padding: '10px 14px', border: '1px solid var(--color-border-soft)' }}>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-soft)', fontFamily: 'var(--font-family-mono)', width: '20px' }}>#{i+1}</span>
                      <span style={{ background: bg, color, padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 'var(--font-weight-bold)' }}>
                        {(step.kind ?? 'sql').toUpperCase().replace('_',' ')}
                      </span>
                      <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: '13px', color: 'var(--color-text-strong)', fontWeight: 'var(--font-weight-semibold)' }}>{step.step_key}</span>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-soft)', marginLeft: 'auto' }}>{step.datasource_name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Raw JSON preview */}
      {parsed && (
        <details style={{ ...card, marginBottom: '20px' }}>
          <summary style={{ padding: '14px 20px', cursor: 'pointer', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-base)', fontSize: 'var(--font-size-sm)' }}>
            {'{ }'} Raw JSON Preview
          </summary>
          <div style={{ borderTop: '1px solid var(--color-bg-muted)', padding: '16px 20px' }}>
            <pre style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-base)', overflow: 'auto', maxHeight: '300px', background: 'var(--color-bg-canvas)', padding: '14px', borderRadius: '10px', border: '1px solid var(--color-border-soft)' }}>
              {JSON.stringify(parsed, null, 2)}
            </pre>
          </div>
        </details>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link to="/plans"
          style={{ padding:'10px 20px', borderRadius:'10px', border:'1px solid var(--color-border-base)', background:'var(--color-bg-surface)', color:'var(--color-text-base)', fontSize:'var(--font-size-sm)', fontWeight:'var(--font-weight-medium)', textDecoration:'none' }}>
          Cancel
        </Link>
        {parsed && (
          <button
            onClick={handleImport}
            disabled={loading || !nameOverride.trim()}
            style={{ display:'inline-flex', alignItems:'center', gap:'8px', background: loading ? 'var(--color-primary-200)':'var(--color-primary-800)', color:'var(--color-bg-surface)', border:'none', borderRadius:'10px', padding:'12px 24px', fontSize:'var(--font-size-sm)', fontWeight:'var(--font-weight-semibold)', cursor: loading ? 'not-allowed':'pointer' }}>
            {loading ? (
              <>
                <span style={{ width:'14px', height:'14px', border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'var(--color-bg-surface)', borderRadius:'50%', display:'inline-block', animation:'spin 0.7s linear infinite' }}/>
                Importing…
              </>
            ) : '⬆ Import Plan'}
          </button>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}