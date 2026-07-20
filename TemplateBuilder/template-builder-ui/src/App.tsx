// src/App.tsx

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import TemplatesPage from './pages/TemplatesPage';
import PrebuiltTemplatesPage from './pages/PrebuiltTemplatesPage';
import EditorPage from './pages/EditorPage';
import PlaceholderRegistryPage from './pages/PlaceholderRegistryPage';
import MarketplacePage from './pages/MarketplacePage';
import AuditLogPage from './pages/AuditLogPage';
import DocumentsPage from './pages/DocumentsPage';


export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/*
          All routes share the AppLayout (sidebar + main area).
          The matching page renders inside <Outlet /> in AppLayout.
        */}
        <Route element={<AppLayout />}>

          {/* Redirect root to /templates */}
          <Route path="/" element={<Navigate to="/templates" replace />} />

          {/* ─── Document Studio ─────────────────────────────────────── */}

          <Route path="/templates"               element={<TemplatesPage />} />
          <Route path="/templates/prebuilt"      element={<PrebuiltTemplatesPage />} />
          <Route path="/templates/:id"           element={<EditorPage />} />
          <Route path="/registry/placeholders"   element={<PlaceholderRegistryPage />} />
          <Route path="/marketplace"             element={<MarketplacePage />} />
          <Route path="/audit"                   element={<AuditLogPage />} />
          <Route path="/documents"               element={<DocumentsPage />} />

        </Route>
      </Routes>
    </BrowserRouter>
  );
}