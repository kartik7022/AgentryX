// src/components/layout/AppLayout.tsx
import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { listITSMTickets } from '../../services/api';

const NAV = [
  {
    group: 'CORE',
    items: [
      {
        href: '/', label: 'Dashboard',
        icon: (<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>),
      },
      {
        href: '/plans', label: 'Plans',
        icon: (<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="12" y2="16"/></svg>),
      },
      {
        href: '/execute', label: 'Execute 360',
        icon: (<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><polygon points="5 3 19 12 5 21 5 3"/></svg>),
      },
      {
        href: '/history', label: 'History',
        icon: (<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 1 0 .5-4.5"/><polyline points="3 3 3 7 7 7"/></svg>),
      },
    ],
  },
  {
    group: 'AI FEATURES',
    items: [
      {
        href: '/copilot', label: 'AI Copilot',
        icon: (<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>),
      },
     
     

      {
        href: '/itsm', label: 'ITSM',
        icon: (<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>),
      },
      {
        href: '/knowledge', label: 'Knowledge Graph',
        icon: (<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><line x1="12" y1="7" x2="5" y2="17"/><line x1="12" y1="7" x2="19" y2="17"/><line x1="5" y1="19" x2="19" y2="19"/></svg>),
      },
    ],
  },
  {
    group: 'GOVERNANCE',
    items: [
      {
        href: '/evidence', label: 'Evidence',
        icon: (<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>),
      },
      {
        href: '/approvals', label: 'Approvals',
        icon: (<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="4" y="4" width="16" height="18" rx="2"/><path d="M9 3h6v3H9z"/><path d="M9 12l2 2 4-4"/></svg>),
      },
    ],
  },
  {
    group: 'ADMIN',
    items: [
      {
        href: '/admin', label: 'Admin Console',
        icon: (<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>),
      },
      {
        href: '/datasources', label: 'Datasources',
        icon: (<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>),
      },
      {
        href: '/packs', label: 'Domain Packs',
        icon: (<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>),
      },
     
    ],
  },
];

export default function AppLayout() {
  const [openTicketCount, setOpenTicketCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const { total } = await listITSMTickets('OPEN');
        if (!cancelled) setOpenTicketCount(total);
      } catch {
        // Silent — a failed background poll shouldn't surface an error to
        // the user, it'll just try again on the next interval.
      }
    }
    poll();
    const interval = setInterval(poll, 20000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <div className="app-shell">

      {/* ── Sidebar ── */}
      <aside className="sidebar" style={{ width: '220px' }}>

        {/* Logo */}
        <div className="sidebar-logo" style={{ padding: '0 16px', height: '60px', flexShrink: 0 }}>
          <div className="sidebar-logo-icon" style={{ width: '30px', height: '30px', borderRadius: '9px' }}>
            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <div className="sidebar-logo-title" style={{ fontSize: '13px' }}>Agentary</div>
            <div className="sidebar-logo-sub" style={{ fontSize: '10px' }}>Orchestrator</div>
          </div>
        </div>

        {/* Nav links */}
        <nav className="sidebar-nav" style={{ padding: '12px 8px' }}>
          {NAV.map(group => (
            <div key={group.group} style={{ marginBottom: '16px' }}>
              <div className="sidebar-nav-label" style={{ fontSize: '9px', padding: '0 10px', marginBottom: '4px' }}>
                {group.group}
              </div>
              {group.items.map(item => (
                <NavLink
                  key={item.href}
                  to={item.href}
                  end={item.href === '/'}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                  style={{
                    gap: '9px',
                    padding: '7px 10px',
                    fontSize: 'var(--font-size-xs)',
                    marginBottom: '1px',
                  }}
                >
                  {({ isActive }) => (
                    <>
                      {item.icon}
                      {item.label}
                      {item.href === '/itsm' && openTicketCount > 0 && (
                        <span style={{
                          marginLeft: 'auto',
                          background: isActive ? 'var(--color-primary-100)' : 'var(--color-status-error-bg)',
                          color: isActive ? 'var(--color-primary-800)' : 'var(--color-status-error-text)',
                          border: `1px solid ${isActive ? 'var(--color-primary-200)' : 'var(--color-status-error-border)'}`,
                          fontSize: '10px', fontWeight: 'var(--font-weight-bold)',
                          borderRadius: '999px', padding: '1px 6px', minWidth: '16px',
                          textAlign: 'center', lineHeight: '14px',
                        }}>
                          {openTicketCount}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer — backend status only */}
        <div className="sidebar-footer" style={{ padding: '10px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 10px', borderRadius: 'var(--radius-xs)', background: 'var(--color-bg-canvas)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-accent-500)', display: 'inline-block' }}/>
            <span style={{ fontSize: '10px', color: 'var(--color-text-soft)' }}>Backend connected</span>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
