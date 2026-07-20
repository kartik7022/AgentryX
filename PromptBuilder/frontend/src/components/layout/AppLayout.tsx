// src/components/layout/AppLayout.tsx

import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import '../../styles/app-shell.css';

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.75 13.88 8.1 19.25 10 13.88 11.9 12 17.25 10.1 11.9 4.75 10 10.1 8.1 12 2.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 1080) setSidebarOpen(false);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="app-shell__content">
        <header className="app-shell__topbar">
          <div className="app-shell__topbar-brand">
            <button
              type="button"
              className="app-shell__menu-btn"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <span />
              <span />
              <span />
            </button>
            <div>
              <div className="app-shell__eyebrow">Document Studio</div>
              <div className="app-shell__title">TemplateBuilder</div>
            </div>
          </div>
          <div className="app-shell__topbar-meta">
            <span className="app-shell__meta-pill">
              <SparkIcon />
              Production Workspace
            </span>
          </div>
        </header>

        <main className="app-shell__main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}