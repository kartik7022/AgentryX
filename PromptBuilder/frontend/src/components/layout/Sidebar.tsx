// src/components/layout/Sidebar.tsx
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

interface SidebarProps { open?: boolean; onClose?: () => void; }

function ChatIcon()    { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.5 7.2L4 21l1.8-5.5A8 8 0 1 1 21 12Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function WrenchIcon()  { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 1 5 5l-9 9-4-4 9-9-1-1Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function PlayIcon()    { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5v15l13-7.5L6 4.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function FlaskIcon()   { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4A1.5 1.5 0 0 0 19.5 19L14 9V3M7.5 14h9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function AuditIcon()   { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 0 2-2h2a2 2 0 0 0 2 2m-6 9 2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function HistoryIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v4l3 3m6-3a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function CloseIcon()   { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>; }

interface NavItem { label: string; path: string; icon: ReactNode; }

const NAV_ITEMS: NavItem[] = [
  { label: 'My Prompts',    path: '/prompts',               icon: <ChatIcon /> },
  { label: 'Prompt Studio', path: '/prompts/studio',        icon: <WrenchIcon /> },
  { label: 'Run Console',   path: '/prompts/run',           icon: <PlayIcon /> },
  { label: 'Test Cases',    path: '/prompts/test-cases',    icon: <FlaskIcon /> },
  { label: 'Run History',   path: '/prompts/run-history',   icon: <HistoryIcon /> },
  { label: 'Audit log',     path: '/audit',                  icon: <AuditIcon /> },
];

export default function Sidebar({ open = false, onClose }: SidebarProps) {
  localStorage.setItem('tb_user_id', 'dev_user');

  return (
    <>
      <div className={`app-sidebar__backdrop ${open ? 'is-open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`app-sidebar ${open ? 'is-open' : ''}`}>
        <div className="app-sidebar__brand">
          <div className="app-sidebar__logo">PB</div>
          <div>
            <div className="app-sidebar__eyebrow">AI Studio</div>
            <div className="app-sidebar__name">PromptBuilder</div>
          </div>
          <button type="button" className="app-sidebar__close" onClick={onClose} aria-label="Close navigation">
            <CloseIcon />
          </button>
        </div>

        <nav className="app-sidebar__nav">
          <div className="app-sidebar__section">
            <div className="app-sidebar__section-heading">Prompt Builder</div>
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/prompts'}
                onClick={onClose}
                className={({ isActive }) => `app-sidebar__link ${isActive ? 'is-active' : ''}`}
              >
                <span className="app-sidebar__link-icon">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="app-sidebar__footer">
          <div className="app-sidebar__user">
            <div className="app-sidebar__user-avatar">DU</div>
            <div className="app-sidebar__user-info">
              <div className="app-sidebar__user-title">dev_user</div>
              <div className="app-sidebar__user-caption">Local workspace</div>
            </div>
            <div className="app-sidebar__user-badge" title="Online" />
          </div>
        </div>
      </aside>
    </>
  );
}