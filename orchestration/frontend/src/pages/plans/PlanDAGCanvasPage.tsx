import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { listPlans } from '../../services/api';
import type { PlanResponse, PlanStepCreate } from '../../types';

// ── Types ──────────────────────────────────────────────────────────
interface NodePos { x: number; y: number; }
interface CanvasNode {
  key:      string;
  step:     PlanStepCreate;
  pos:      NodePos;
  selected: boolean;
}

// ── Constants ──────────────────────────────────────────────────────
const NODE_W   = 200;
const NODE_H   = 80;
const H_GAP    = 120;
const V_GAP    = 40;
const COLS     = 3;

const KIND_COLORS: Record<string, [string, string, string]> = {
  sql:               ['var(--color-status-info-bg)', 'var(--color-status-info-text)', 'var(--color-primary-200)'],
  rest:              ['var(--color-status-success-bg)', 'var(--color-status-success-text)', 'var(--color-status-success-border)'],
  graphql:           ['var(--color-primary-50)', 'var(--color-primary-800)', 'var(--color-primary-200)'],
  ai_transform:      ['var(--color-primary-50)', 'var(--color-primary-800)', 'var(--color-primary-100)'],
  intent_classify:   ['var(--color-status-warning-bg)', 'var(--color-status-warning-text)', 'var(--color-status-warning-border)'],
  policy_route:      ['var(--color-status-warning-bg)', 'var(--color-status-warning-text)', 'var(--color-status-warning-border)'],
  intent_validate:   ['var(--color-status-info-bg)', 'var(--color-accent-700)', 'var(--color-status-info-border)'],
  adapter_analyze:   ['var(--color-accent-50)', 'var(--color-accent-700)', 'var(--color-accent-100)'],
  prompt_run:        ['var(--color-primary-50)', 'var(--color-primary-800)', 'var(--color-primary-200)'],
  document_generate: ['var(--color-primary-50)', 'var(--color-primary-700)', 'var(--color-primary-200)'],
  human_review:      ['var(--color-status-error-bg)', 'var(--color-status-error-text)', 'var(--color-status-error-border)'],
  webhook:           ['var(--color-status-success-bg)', 'var(--color-status-success-text)', 'var(--color-status-success-border)'],
  agent_task:        ['var(--color-primary-50)', 'var(--color-primary-800)', 'var(--color-primary-200)'],
};

const KIND_ICONS: Record<string, string> = {
  sql:               '🗄',
  rest:              '🌐',
  graphql:           '◈',
  ai_transform:      '🤖',
  intent_classify:   '🎯',
  policy_route:      '🚦',
  intent_validate:   '✅',
  adapter_analyze:   '🔌',
  prompt_run:        '📝',
  document_generate: '📄',
  human_review:      '👤',
  webhook:           '🪝',
  agent_task:        '🧠',
};

// ── Auto layout ────────────────────────────────────────────────────
function autoLayout(steps: PlanStepCreate[]): CanvasNode[] {
  const PADDING_X = 60;
  const PADDING_Y = 60;

  // Build dependency levels (topological sort)
  const levels: Map<string, number> = new Map();
  const keys = steps.map(s => s.step_key);

  function getLevel(key: string, visited = new Set<string>()): number {
    if (levels.has(key)) return levels.get(key)!;
    if (visited.has(key)) return 0;
    visited.add(key);
    const step = steps.find(s => s.step_key === key);
    if (!step || !step.depends_on?.length) {
      levels.set(key, 0);
      return 0;
    }
    const maxDep = Math.max(...step.depends_on.map(d => getLevel(d, visited)));
    const level  = maxDep + 1;
    levels.set(key, level);
    return level;
  }

  keys.forEach(k => getLevel(k));

  // Group by level
  const byLevel: Map<number, string[]> = new Map();
  levels.forEach((level, key) => {
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level)!.push(key);
  });

  // Position nodes
  const positions: Map<string, NodePos> = new Map();
  const maxLevel = Math.max(...Array.from(levels.values()), 0);

  for (let level = 0; level <= maxLevel; level++) {
    const levelKeys = byLevel.get(level) ?? [];
    levelKeys.forEach((key, i) => {
      positions.set(key, {
        x: PADDING_X + level * (NODE_W + H_GAP),
        y: PADDING_Y + i * (NODE_H + V_GAP),
      });
    });
  }

  // Fallback grid layout for steps without clear levels
  steps.forEach((step, i) => {
    if (!positions.has(step.step_key)) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      positions.set(step.step_key, {
        x: PADDING_X + col * (NODE_W + H_GAP),
        y: PADDING_Y + row * (NODE_H + V_GAP),
      });
    }
  });

  return steps.map(step => ({
    key:      step.step_key,
    step,
    pos:      positions.get(step.step_key) ?? { x: 60, y: 60 },
    selected: false,
  }));
}

// ── Arrow path between nodes ───────────────────────────────────────
function getArrowPath(from: NodePos, to: NodePos): string {
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const cx  = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
}

// ── Mini detail panel ──────────────────────────────────────────────
function StepDetailPanel({ step, onClose }: { step: PlanStepCreate; onClose: () => void }) {
  const [bg, color] = KIND_COLORS[step.kind] ?? ['var(--color-bg-canvas)', 'var(--color-text-base)', 'var(--color-border-soft)'];

  return (
    <div style={{
      position: 'absolute', right: '16px', top: '16px', width: '300px',
      background: 'var(--color-bg-surface)', borderRadius: '16px', border: '2px solid var(--color-primary-800)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.12)', zIndex: 10, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 16px', background: 'var(--color-primary-800)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: 'var(--font-size-lg)' }}>{KIND_ICONS[step.kind] ?? '⚙'}</span>
          <span style={{ fontFamily: 'var(--font-family-mono)', fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-sm)', color: 'var(--color-bg-surface)' }}>{step.step_key}</span>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', fontSize: 'var(--font-size-lg)', lineHeight: 1 }}>✕</button>
      </div>

      <div style={{ padding: '16px', overflowY: 'auto', maxHeight: '70vh' }}>
        {/* Kind badge */}
        <div style={{ marginBottom: '14px' }}>
          <span style={{ background: bg, color, border: `1px solid ${KIND_COLORS[step.kind]?.[2] ?? 'var(--color-border-soft)'}`, padding: '3px 10px', borderRadius: '999px', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)' }}>
            {step.kind.toUpperCase().replace('_', ' ')}
          </span>
        </div>

        {/* Fields */}
        {[
          { label: 'Datasource',  value: step.datasource_name },
          { label: 'Step Order',  value: String(step.step_order) },
          { label: 'Timeout',     value: `${step.timeout_ms ?? 5000}ms` },
          { label: 'Output Mode', value: step.output_mode ?? 'object' },
          { label: 'Enabled',     value: step.enabled ? '✓ Yes' : '✕ No' },
        ].map(f => (
          <div key={f.label} style={{ marginBottom: '10px' }}>
            <p style={{ fontSize: '10px', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-soft)', marginBottom: '3px' }}>{f.label}</p>
            <p style={{ fontFamily: 'var(--font-family-mono)', fontSize: '13px', color: 'var(--color-text-strong)', fontWeight: 'var(--font-weight-semibold)' }}>{f.value}</p>
          </div>
        ))}

        {/* Dependencies */}
        {(step.depends_on ?? []).length > 0 && (
          <div style={{ marginBottom: '10px' }}>
            <p style={{ fontSize: '10px', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-soft)', marginBottom: '6px' }}>Depends On</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {step.depends_on!.map(d => (
                <span key={d} style={{ fontFamily: 'var(--font-family-mono)', fontSize: '11px', background: 'var(--color-primary-50)', color: 'var(--color-primary-800)', padding: '2px 8px', borderRadius: '6px', fontWeight: 'var(--font-weight-semibold)' }}>{d}</span>
              ))}
            </div>
          </div>
        )}

        {/* SQL */}
        {step.sql_template && (
          <div style={{ marginBottom: '10px' }}>
            <p style={{ fontSize: '10px', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-soft)', marginBottom: '6px' }}>SQL Template</p>
            <pre style={{ fontFamily: 'var(--font-family-mono)', fontSize: '11px', color: 'var(--color-text-base)', background: 'var(--color-bg-canvas)', border: '1px solid var(--color-border-soft)', borderRadius: '8px', padding: '10px', overflow: 'auto', maxHeight: '120px', whiteSpace: 'pre-wrap' }}>
              {step.sql_template}
            </pre>
          </div>
        )}

        {/* REST */}
        {step.path_template && (
          <div style={{ marginBottom: '10px' }}>
            <p style={{ fontSize: '10px', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-soft)', marginBottom: '6px' }}>Endpoint</p>
            <p style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--color-status-success-text)', background: 'var(--color-status-success-bg)', padding: '6px 10px', borderRadius: '6px' }}>
              {step.method ?? 'GET'} {step.path_template}
            </p>
          </div>
        )}

        {/* GraphQL */}
        {step.graphql_query_template && (
          <div style={{ marginBottom: '10px' }}>
            <p style={{ fontSize: '10px', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-soft)', marginBottom: '6px' }}>GraphQL Query</p>
            <pre style={{ fontFamily: 'var(--font-family-mono)', fontSize: '11px', color: 'var(--color-text-base)', background: 'var(--color-bg-canvas)', border: '1px solid var(--color-border-soft)', borderRadius: '8px', padding: '10px', overflow: 'auto', maxHeight: '120px', whiteSpace: 'pre-wrap' }}>
              {step.graphql_query_template}
            </pre>
          </div>
        )}

        {/* AI Prompt */}
        {step.ai_prompt_template && (
          <div style={{ marginBottom: '10px' }}>
            <p style={{ fontSize: '10px', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-soft)', marginBottom: '6px' }}>AI Prompt</p>
            <pre style={{ fontFamily: 'var(--font-family-mono)', fontSize: '11px', color: 'var(--color-text-base)', background: 'var(--color-bg-canvas)', border: '1px solid var(--color-border-soft)', borderRadius: '8px', padding: '10px', overflow: 'auto', maxHeight: '120px', whiteSpace: 'pre-wrap' }}>
              {step.ai_prompt_template}
            </pre>
          </div>
        )}

        {/* Condition */}
        {step.condition_expr && (
          <div>
            <p style={{ fontSize: '10px', fontWeight: 'var(--font-weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-soft)', marginBottom: '6px' }}>Condition</p>
            <code style={{ fontFamily: 'var(--font-family-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--color-status-warning-text)', background: 'var(--color-status-warning-bg)', border: '1px solid var(--color-status-warning-border)', padding: '6px 10px', borderRadius: '6px', display: 'block' }}>
              {step.condition_expr}
            </code>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Canvas ────────────────────────────────────────────────────
export default function PlanDAGCanvasPage() {
  const { id }      = useParams<{ id: string }>();
  const svgRef      = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [plan, setPlan]           = useState<PlanResponse | null>(null);
  const [nodes, setNodes]         = useState<CanvasNode[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [selectedNode, setSelectedNode] = useState<CanvasNode | null>(null);
  const [zoom, setZoom]           = useState(1);
  const [pan, setPan]             = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [dragNode, setDragNode]   = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const panOrigin = useRef({ x: 0, y: 0 });

  useEffect(() => {
    listPlans()
      .then(plans => {
        const found = plans.find(p => p.plan_id === id);
        if (!found) throw new Error('Plan not found');
        setPlan(found);
        setNodes(autoLayout(found.steps ?? []));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  // ── Canvas dimensions ──
  const canvasW = Math.max(
    900,
    nodes.reduce((m, n) => Math.max(m, n.pos.x + NODE_W + 80), 0)
  );
  const canvasH = Math.max(
    600,
    nodes.reduce((m, n) => Math.max(m, n.pos.y + NODE_H + 80), 0)
  );

  // ── Drag node ──
  function handleNodeMouseDown(e: React.MouseEvent, key: string) {
    e.stopPropagation();
    const node = nodes.find(n => n.key === key);
    if (!node) return;
    setDragNode(key);
    setDragOffset({ x: e.clientX - node.pos.x * zoom - pan.x, y: e.clientY - node.pos.y * zoom - pan.y });
    setSelectedNode(node);
    setNodes(prev => prev.map(n => ({ ...n, selected: n.key === key })));
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (dragNode) {
      const newX = (e.clientX - dragOffset.x - pan.x) / zoom;
      const newY = (e.clientY - dragOffset.y - pan.y) / zoom;
      setNodes(prev => prev.map(n => n.key === dragNode ? { ...n, pos: { x: Math.max(0, newX), y: Math.max(0, newY) } } : n));
    } else if (isPanning) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan({ x: panOrigin.current.x + dx, y: panOrigin.current.y + dy });
    }
  }, [dragNode, dragOffset, isPanning, pan, zoom]);

  const handleMouseUp = useCallback(() => {
    setDragNode(null);
    setIsPanning(false);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // ── Pan canvas ──
  function handleCanvasMouseDown(e: React.MouseEvent) {
    if (e.target === svgRef.current || (e.target as Element).tagName === 'svg') {
      setIsPanning(true);
      panStart.current  = { x: e.clientX, y: e.clientY };
      panOrigin.current = { ...pan };
      setSelectedNode(null);
      setNodes(prev => prev.map(n => ({ ...n, selected: false })));
    }
  }

  // ── Zoom ──
  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.min(Math.max(z * delta, 0.3), 2));
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '80px' }}>
      <div style={{ width: '32px', height: '32px', border: '3px solid var(--color-border-soft)', borderTopColor: 'var(--color-primary-800)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}/>
      <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
    </div>
  );

  if (error) return (
    <div style={{ padding: '32px' }}>
      <div style={{ background: 'var(--color-status-error-bg)', border: '1px solid var(--color-status-error-border)', borderRadius: '12px', padding: '16px', color: 'var(--color-status-error-text)' }}>⚠ {error}</div>
    </div>
  );

  const steps     = plan?.steps ?? [];
  const kindCount = Object.fromEntries(
    ['sql','rest','graphql','ai_transform'].map(k => [k, steps.filter(s => s.kind === k).length])
  );

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--color-bg-canvas)' }}>

      {/* ── Top bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', background: 'var(--color-bg-surface)', borderBottom: '1px solid var(--color-border-soft)', flexShrink: 0, zIndex: 20 }}>
        <Link to={`/plans/${id}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--color-text-muted)', textDecoration: 'none', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--color-border-soft)', background: 'var(--color-bg-surface)' }}>
          ← Plan Detail
        </Link>

        <div style={{ width: '1px', height: '24px', background: 'var(--color-border-soft)' }}/>

        <div style={{ fontFamily: 'var(--font-family-mono)', fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-strong)' }}>{plan?.name}</div>

        <div style={{ display: 'flex', gap: '6px' }}>
          {Object.entries(kindCount).filter(([, v]) => v > 0).map(([k, v]) => {
            const [bg, color] = KIND_COLORS[k] ?? ['var(--color-bg-canvas)', 'var(--color-text-base)'];
            return (
              <span key={k} style={{ background: bg, color, padding: '3px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 'var(--font-weight-bold)' }}>
                {KIND_ICONS[k]} {v} {k.replace('_',' ')}
              </span>
            );
          })}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Zoom controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--color-bg-canvas)', border: '1px solid var(--color-border-soft)', borderRadius: '8px', padding: '4px 8px' }}>
            <button onClick={() => setZoom(z => Math.max(z - 0.1, 0.3))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-base)', fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-md)', width: '24px', lineHeight: 1 }}>−</button>
            <span style={{ fontSize: '13px', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-base)', minWidth: '40px', textAlign: 'center' }}>
              {Math.round(zoom * 100)}%
            </span>
            <button onClick={() => setZoom(z => Math.min(z + 0.1, 2))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-base)', fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--font-size-md)', width: '24px', lineHeight: 1 }}>+</button>
          </div>

          <button onClick={resetView}
            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--color-border-soft)', background: 'var(--color-bg-surface)', color: 'var(--color-text-base)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer' }}>
            Reset View
          </button>

          <button onClick={() => setNodes(autoLayout(steps))}
            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--color-border-soft)', background: 'var(--color-bg-surface)', color: 'var(--color-text-base)', fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer' }}>
            Auto Layout
          </button>

          <Link to={`/execute?plan=${plan?.name}&entity=${plan?.entity_type}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--color-primary-800)', color: 'var(--color-bg-surface)', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 'var(--font-weight-semibold)', textDecoration: 'none' }}>
            ▶ Execute
          </Link>
        </div>
      </div>

      {/* ── Legend ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '8px 20px', background: 'var(--color-bg-canvas)', borderBottom: '1px solid var(--color-border-soft)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', flexShrink: 0 }}>
        <span style={{ fontWeight: 'var(--font-weight-semibold)' }}>Legend:</span>
        {Object.entries(KIND_COLORS).map(([k, [bg, color, border]]) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: bg, border: `1px solid ${border}`, display: 'inline-block' }}/>
            <span style={{ color }}>{KIND_ICONS[k]} {k.replace('_',' ')}</span>
          </span>
        ))}
        <span style={{ marginLeft: 'auto' }}>
          Scroll to zoom · Drag canvas to pan · Drag nodes to reposition · Click node to inspect
        </span>
      </div>

      {/* ── Canvas area ── */}
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', position: 'relative', cursor: isPanning ? 'grabbing' : dragNode ? 'grabbing' : 'grab' }}
        onMouseDown={handleCanvasMouseDown}
        onWheel={handleWheel}>

        {/* Empty state */}
        {steps.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
            <div style={{ fontSize: '48px' }}>📋</div>
            <p style={{ fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-base)', fontSize: 'var(--font-size-md)' }}>No steps defined</p>
            <p style={{ color: 'var(--color-text-soft)', fontSize: 'var(--font-size-sm)' }}>Add steps to this plan to see the DAG canvas.</p>
            <Link to={`/plans/${id}/edit`}
              style={{ background: 'var(--color-primary-800)', color: 'var(--color-bg-surface)', padding: '10px 20px', borderRadius: '10px', fontWeight: 'var(--font-weight-semibold)', fontSize: 'var(--font-size-sm)', textDecoration: 'none' }}>
              + Add Steps
            </Link>
          </div>
        )}

        {/* SVG canvas */}
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          style={{ position: 'absolute', inset: 0 }}
          onMouseDown={handleCanvasMouseDown}
        >
          {/* Grid background */}
          <defs>
            <pattern id="grid" width={20 * zoom} height={20 * zoom} patternUnits="userSpaceOnUse"
              patternTransform={`translate(${pan.x % (20 * zoom)},${pan.y % (20 * zoom)})`}>
              <circle cx={20 * zoom} cy={20 * zoom} r="1" fill="var(--color-border-soft)"/>
            </pattern>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="var(--color-text-soft)"/>
            </marker>
            <marker id="arrowhead-selected" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="var(--color-primary-800)"/>
            </marker>
          </defs>

          <rect width="100%" height="100%" fill="url(#grid)"/>

          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>

            {/* ── Edges (arrows) ── */}
            {nodes.map(node =>
              (node.step.depends_on ?? []).map(depKey => {
                const depNode = nodes.find(n => n.key === depKey);
                if (!depNode) return null;
                const isSelected = node.selected || depNode.selected;
                return (
                  <path
                    key={`${depKey}->${node.key}`}
                    d={getArrowPath(depNode.pos, node.pos)}
                    fill="none"
                    stroke={isSelected ? 'var(--color-primary-800)' : 'var(--color-text-soft)'}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    strokeDasharray={isSelected ? 'none' : '6,3'}
                    markerEnd={isSelected ? 'url(#arrowhead-selected)' : 'url(#arrowhead)'}
                    style={{ transition: 'stroke 0.2s' }}
                  />
                );
              })
            )}

            {/* ── Nodes ── */}
            {nodes.map(node => {
              const [bg, color, border] = KIND_COLORS[node.step.kind] ?? ['var(--color-bg-canvas)', 'var(--color-text-base)', 'var(--color-border-soft)'];
              const isSelected = node.selected;

              return (
                <g
                  key={node.key}
                  transform={`translate(${node.pos.x},${node.pos.y})`}
                  onMouseDown={e => handleNodeMouseDown(e, node.key)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Shadow */}
                  <rect
                    x="3" y="4"
                    width={NODE_W} height={NODE_H}
                    rx="12" ry="12"
                    fill="rgba(0,0,0,0.08)"
                  />

                  {/* Node body */}
                  <rect
                    width={NODE_W} height={NODE_H}
                    rx="12" ry="12"
                    fill={isSelected ? 'var(--color-primary-800)' : bg}
                    stroke={isSelected ? 'var(--color-primary-800)' : border}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    style={{ transition: 'all 0.15s' }}
                  />

                  {/* Left kind stripe */}
                  <rect
                    width="6" height={NODE_H}
                    rx="12" ry="0"
                    fill={isSelected ? 'rgba(255,255,255,0.3)' : color}
                  />
                  <rect
                    width="3" height={NODE_H}
                    fill={isSelected ? 'rgba(255,255,255,0.3)' : color}
                  />

                  {/* Kind icon */}
                  <text x="18" y={NODE_H / 2 + 1} dominantBaseline="middle" fontSize="18" style={{ userSelect: 'none' }}>
                    {KIND_ICONS[node.step.kind] ?? '⚙'}
                  </text>

                  {/* Step key */}
                  <text
                    x="44" y={NODE_H / 2 - 8}
                    fontSize="13"
                    fontWeight="700"
                    fontFamily="var(--font-family-mono)"
                    fill={isSelected ? 'var(--color-bg-surface)' : 'var(--color-text-strong)'}
                    dominantBaseline="middle"
                    style={{ userSelect: 'none' }}
                  >
                    {node.key.length > 16 ? node.key.slice(0, 14) + '…' : node.key}
                  </text>

                  {/* Kind label */}
                  <text
                    x="44" y={NODE_H / 2 + 10}
                    fontSize="10"
                    fontFamily="sans-serif"
                    fill={isSelected ? 'rgba(255,255,255,0.8)' : color}
                    dominantBaseline="middle"
                    style={{ userSelect: 'none' }}
                  >
                    {node.step.kind.toUpperCase().replace('_', ' ')}
                  </text>

                  {/* Datasource */}
                  <text
                    x="44" y={NODE_H / 2 + 24}
                    fontSize="9"
                    fontFamily="var(--font-family-mono)"
                    fill={isSelected ? 'rgba(255,255,255,0.6)' : 'var(--color-text-soft)'}
                    dominantBaseline="middle"
                    style={{ userSelect: 'none' }}
                  >
                    {(node.step.datasource_name ?? '').length > 20
                      ? (node.step.datasource_name ?? '').slice(0, 18) + '…'
                      : node.step.datasource_name}
                  </text>

                  {/* Disabled indicator */}
                  {!node.step.enabled && (
                    <rect
                      width={NODE_W} height={NODE_H}
                      rx="12" ry="12"
                      fill="rgba(255,255,255,0.5)"
                    />
                  )}

                  {/* Connection dots */}
                  {/* Input dot (left) */}
                  <circle cx="0" cy={NODE_H / 2} r="5" fill={isSelected ? 'var(--color-bg-surface)' : 'var(--color-border-soft)'} stroke={isSelected ? 'var(--color-primary-800)' : 'var(--color-text-soft)'} strokeWidth="1.5"/>
                  {/* Output dot (right) */}
                  <circle cx={NODE_W} cy={NODE_H / 2} r="5" fill={isSelected ? 'var(--color-bg-surface)' : 'var(--color-border-soft)'} stroke={isSelected ? 'var(--color-primary-800)' : 'var(--color-text-soft)'} strokeWidth="1.5"/>
                </g>
              );
            })}
          </g>
        </svg>

        {/* ── Step detail panel ── */}
        {selectedNode && (
          <StepDetailPanel
            step={selectedNode.step}
            onClose={() => {
              setSelectedNode(null);
              setNodes(prev => prev.map(n => ({ ...n, selected: false })));
            }}
          />
        )}

        {/* ── Mini map ── */}
        {nodes.length > 0 && (
          <div style={{ position: 'absolute', bottom: '20px', right: '20px', width: '160px', height: '100px', background: 'rgba(255,255,255,0.95)', borderRadius: '10px', border: '1px solid var(--color-border-soft)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', overflow: 'hidden', padding: '8px' }}>
            <p style={{ fontSize: '10px', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-soft)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Overview</p>
            <svg width="100%" height="76" viewBox={`0 0 ${canvasW} ${canvasH}`}>
              {nodes.map(node => {
                const [bg, , border] = KIND_COLORS[node.step.kind] ?? ['var(--color-bg-canvas)', 'var(--color-text-base)', 'var(--color-border-soft)'];
                return (
                  <rect key={node.key}
                    x={node.pos.x} y={node.pos.y}
                    width={NODE_W} height={NODE_H}
                    rx="6"
                    fill={node.selected ? 'var(--color-primary-800)' : bg}
                    stroke={border}
                    strokeWidth="2"
                  />
                );
              })}
              {nodes.map(node =>
                (node.step.depends_on ?? []).map(depKey => {
                  const dep = nodes.find(n => n.key === depKey);
                  if (!dep) return null;
                  return (
                    <line key={`${depKey}->${node.key}`}
                      x1={dep.pos.x + NODE_W} y1={dep.pos.y + NODE_H/2}
                      x2={node.pos.x} y2={node.pos.y + NODE_H/2}
                      stroke="var(--color-text-soft)" strokeWidth="3"
                    />
                  );
                })
              )}
            </svg>
          </div>
        )}

        {/* ── Step count badge ── */}
        <div style={{ position: 'absolute', bottom: '20px', left: '20px', background: 'rgba(255,255,255,0.95)', borderRadius: '10px', border: '1px solid var(--color-border-soft)', padding: '10px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', gap: '16px', fontSize: '13px' }}>
            <span><strong style={{ color: 'var(--color-primary-800)' }}>{steps.length}</strong> <span style={{ color: 'var(--color-text-muted)' }}>steps</span></span>
            <span><strong style={{ color: 'var(--color-status-success-text)' }}>{steps.filter(s => s.enabled).length}</strong> <span style={{ color: 'var(--color-text-muted)' }}>enabled</span></span>
            <span><strong style={{ color: 'var(--color-text-base)' }}>{steps.reduce((a,s) => a + (s.depends_on?.length ?? 0), 0)}</strong> <span style={{ color: 'var(--color-text-muted)' }}>connections</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}
