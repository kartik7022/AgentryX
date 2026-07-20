// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import PromptsPage from './pages/PromptsPage';
import PromptStudioPage from './pages/PromptStudioPage';
import PromptRunConsolePage from './pages/PromptRunConsolePage';
import PromptTestCasesPage from './pages/PromptTestCasesPage';
import RunHistoryPage from './pages/RunHistoryPage';
import AuditLogPage from './pages/AuditLogPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>

          {/* Redirect root to /prompts */}
          <Route path="/" element={<Navigate to="/prompts" replace />} />

          {/* ─── Prompt Builder ─────────────────────────────────── */}
          <Route path="/prompts"                  element={<PromptsPage />} />
          <Route path="/prompts/studio"           element={<PromptStudioPage />} />
          <Route path="/prompts/studio/:id"       element={<PromptStudioPage />} />
          <Route path="/prompts/run"              element={<PromptRunConsolePage />} />
          <Route path="/prompts/test-cases"       element={<PromptTestCasesPage />} />
          <Route path="/prompts/run-history"      element={<RunHistoryPage />} />
          <Route path="/audit"                      element={<AuditLogPage />} />

        </Route>
      </Routes>
    </BrowserRouter>
  );
}