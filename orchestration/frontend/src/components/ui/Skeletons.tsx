const shimmer: React.CSSProperties = {
  background: 'linear-gradient(90deg, var(--color-bg-muted) 25%, var(--color-border-soft) 50%, var(--color-bg-muted) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s infinite',
  borderRadius: '8px',
};

function Box({ w, h, radius = 8 }: { w: string | number; h: string | number; radius?: number }) {
  return (
    <div style={{ ...shimmer, width: w, height: h, borderRadius: radius, flexShrink: 0 }}/>
  );
}

// ── Stat Card Skeleton ─────────────────────────────────────────────
export function StatCardSkeleton() {
  return (
    <div style={{ background: 'var(--color-bg-surface)', borderRadius: '16px', border: '1px solid var(--color-border-soft)', padding: '24px' }}>
      <Box w={40} h={40} radius={10}/>
      <div style={{ height: '12px' }}/>
      <Box w={60} h={28}/>
      <div style={{ height: '8px' }}/>
      <Box w={100} h={14}/>
    </div>
  );
}

// ── Table Row Skeleton ─────────────────────────────────────────────
export function TableRowSkeleton({ cols = 6 }: { cols?: number }) {
  const widths = ['40%', '15%', '15%', '10%', '10%', '10%', '10%', '10%'];
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-bg-muted)' }}>
          <Box w={widths[i] ?? '60%'} h={14}/>
          {i === 0 && (
            <div style={{ marginTop: '6px' }}>
              <Box w="60%" h={11}/>
            </div>
          )}
        </td>
      ))}
    </tr>
  );
}

// ── Card Skeleton ──────────────────────────────────────────────────
export function CardSkeleton({ rows = 3}: { rows?: number; height?: string }) {
  return (
    <div style={{ background: 'var(--color-bg-surface)', borderRadius: '16px', border: '1px solid var(--color-border-soft)', padding: '24px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <Box w={40} h={40} radius={10}/>
        <div style={{ flex: 1 }}>
          <Box w="50%" h={16}/>
          <div style={{ height: '6px' }}/>
          <Box w="30%" h={12}/>
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ marginBottom: '10px' }}>
          <Box w={`${90 - i * 15}%`} h={12}/>
        </div>
      ))}
    </div>
  );
}

// ── Dashboard Skeleton ─────────────────────────────────────────────
export function DashboardSkeleton() {
  return (
    <div style={{ padding: '32px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <Box w={280} h={28}/>
        <div style={{ height: '8px' }}/>
        <Box w={420} h={16}/>
      </div>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '20px', marginBottom: '28px' }}>
        {[0,1,2,3].map(i => <StatCardSkeleton key={i}/>)}
      </div>
      {/* Table card */}
      <div style={{ background: 'var(--color-bg-surface)', borderRadius: '16px', border: '1px solid var(--color-border-soft)', overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-bg-muted)', display: 'flex', justifyContent: 'space-between' }}>
          <Box w={140} h={20}/>
          <Box w={80} h={16}/>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--color-bg-canvas)' }}>
              {['40%','15%','15%','10%','10%','10%'].map((w, i) => (
                <th key={i} style={{ padding: '12px 20px' }}>
                  <Box w={w} h={11}/>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[0,1,2,3,4,5].map(i => <TableRowSkeleton key={i} cols={6}/>)}
          </tbody>
        </table>
      </div>
      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {[0,1].map(i => (
          <div key={i} style={{ background: 'var(--color-bg-surface)', borderRadius: '16px', border: '1px solid var(--color-border-soft)', padding: '24px', display: 'flex', gap: '16px', alignItems: 'center' }}>
            <Box w={48} h={48} radius={14}/>
            <div>
              <Box w={120} h={16}/>
              <div style={{ height: '6px' }}/>
              <Box w={180} h={13}/>
            </div>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
      `}</style>
    </div>
  );
}

// ── Plans List Skeleton ────────────────────────────────────────────
export function PlansListSkeleton() {
  return (
    <div style={{ padding: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <Box w={220} h={28}/>
          <div style={{ height: '8px' }}/>
          <Box w={360} h={16}/>
        </div>
        <Box w={110} h={40} radius={10}/>
      </div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <Box w={300} h={40} radius={10}/>
        <Box w={180} h={40} radius={10}/>
      </div>
      <div style={{ background: 'var(--color-bg-surface)', borderRadius: '16px', border: '1px solid var(--color-border-soft)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--color-bg-canvas)' }}>
              {['30%','12%','14%','10%','8%','10%','12%'].map((w, i) => (
                <th key={i} style={{ padding: '12px 20px' }}><Box w={w} h={11}/></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[0,1,2,3,4,5,6].map(i => <TableRowSkeleton key={i} cols={7}/>)}
          </tbody>
        </table>
      </div>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
      `}</style>
    </div>
  );
}

// ── Plan Detail Skeleton ───────────────────────────────────────────
export function PlanDetailSkeleton() {
  return (
    <div style={{ padding: '32px' }}>
      <Box w={120} h={16} radius={6}/>
      <div style={{ height: '24px' }}/>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
            <Box w={240} h={28}/>
            <Box w={70} h={24} radius={999}/>
            <Box w={40} h={24} radius={999}/>
          </div>
          <Box w={300} h={16}/>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Box w={90} h={40} radius={10}/>
          <Box w={90} h={40} radius={10}/>
          <Box w={110} h={40} radius={10}/>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px', marginBottom: '28px' }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ background: 'var(--color-bg-surface)', borderRadius: '16px', border: '1px solid var(--color-border-soft)', padding: '16px' }}>
            <Box w="50%" h={11}/>
            <div style={{ height: '6px' }}/>
            <Box w="70%" h={18}/>
          </div>
        ))}
      </div>
      <div style={{ background: 'var(--color-bg-surface)', borderRadius: '16px', border: '1px solid var(--color-border-soft)', padding: '24px' }}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '18px' }}>
          <Box w={140} h={22}/>
          <Box w={60} h={22} radius={999}/>
        </div>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ border: '1px solid var(--color-border-soft)', borderRadius: '12px', padding: '14px 18px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Box w={26} h={26} radius={999}/>
            <Box w={60} h={20} radius={999}/>
            <Box w={140} h={16}/>
            <div style={{ flex: 1 }}/>
            <Box w={80} h={14}/>
            <Box w={60} h={20} radius={999}/>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
      `}</style>
    </div>
  );
}

// ── Execute Page Skeleton ──────────────────────────────────────────
export function ExecuteSkeleton() {
  return (
    <div style={{ padding: '32px' }}>
      <Box w={200} h={28}/>
      <div style={{ height: '8px' }}/>
      <Box w={380} h={16}/>
      <div style={{ height: '28px' }}/>
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: 'var(--color-bg-surface)', borderRadius: '16px', border: '1px solid var(--color-border-soft)', padding: '20px' }}>
            <Box w={140} h={20}/>
            <div style={{ height: '16px' }}/>
            {[0,1,2].map(i => (
              <div key={i} style={{ marginBottom: '14px' }}>
                <Box w={80} h={11}/>
                <div style={{ height: '6px' }}/>
                <Box w="100%" h={40} radius={10}/>
              </div>
            ))}
          </div>
          <div style={{ background: 'var(--color-bg-surface)', borderRadius: '16px', border: '1px solid var(--color-border-soft)', padding: '20px' }}>
            <Box w={120} h={18}/>
            <div style={{ height: '12px' }}/>
            <Box w="100%" h={14}/>
          </div>
          <Box w="100%" h={48} radius={12}/>
        </div>
        <div style={{ background: 'var(--color-bg-surface)', borderRadius: '16px', border: '1px solid var(--color-border-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px', flexDirection: 'column', gap: '16px' }}>
          <Box w={64} h={64} radius={16}/>
          <Box w={160} h={18}/>
          <Box w={240} h={14}/>
        </div>
      </div>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
      `}</style>
    </div>
  );
}

// ── History Page Skeleton ──────────────────────────────────────────
export function HistorySkeleton() {
  return (
    <div style={{ padding: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <Box w={200} h={28}/>
          <div style={{ height: '8px' }}/>
          <Box w={340} h={16}/>
        </div>
        <Box w={130} h={40} radius={10}/>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px', marginBottom: '24px' }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ background: 'var(--color-bg-surface)', borderRadius: '16px', border: '1px solid var(--color-border-soft)', padding: '20px' }}>
            <Box w={36} h={36} radius={10}/>
            <div style={{ height: '10px' }}/>
            <Box w={60} h={26}/>
            <div style={{ height: '6px' }}/>
            <Box w={100} h={14}/>
          </div>
        ))}
      </div>
      {[0,1,2,3,4].map(i => (
        <div key={i} style={{ background: 'var(--color-bg-surface)', borderRadius: '16px', border: '1px solid var(--color-border-soft)', padding: '16px 20px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Box w={70} h={24} radius={999}/>
          <Box w={180} h={16}/>
          <div style={{ flex: 1 }}/>
          <Box w={80} h={20} radius={6}/>
          <Box w={60} h={14}/>
          <Box w={60} h={14}/>
          <Box w={140} h={14}/>
          <Box w={24} h={24} radius={6}/>
        </div>
      ))}
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
      `}</style>
    </div>
  );
}

// ── Generic Page Skeleton ──────────────────────────────────────────
export function GenericPageSkeleton({ title = true, cards = 3 }: { title?: boolean; cards?: number }) {
  return (
    <div style={{ padding: '32px' }}>
      {title && (
        <div style={{ marginBottom: '28px' }}>
          <Box w={240} h={28}/>
          <div style={{ height: '8px' }}/>
          <Box w={380} h={16}/>
        </div>
      )}
      {Array.from({ length: cards }).map((_, i) => (
        <CardSkeleton key={i} rows={2}/>
      ))}
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
      `}</style>
    </div>
  );
}