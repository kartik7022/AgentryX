// src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import DashboardPage from './pages/dashboard/DashboardPage';
import PlansListPage from './pages/plans/PlansListPage';
import NewPlanPage from './pages/plans/NewPlanPage';
import EditPlanPage from './pages/plans/EditPlanPage';
import PlanDetailPage from './pages/plans/PlanDetailPage';
import ImportPlanPage from './pages/plans/ImportPlanPage';
import PlanVersionHistoryPage from './pages/plans/PlanVersionHistoryPage';
import PlanDAGCanvasPage from './pages/plans/PlanDAGCanvasPage';
import PlanCanaryPage from './pages/plans/PlanCanaryPage';
import ExecutePage from './pages/execute/ExecutePage';
import ExecutionMonitorPage from './pages/execute/ExecutionMonitorPage';
import HistoryPage from './pages/history/HistoryPage';
import ExecutionDetailPage from './pages/history/ExecutionDetailPage';
import AdminConsolePage from './pages/admin/AdminConsolePage';
import DatasourceCatalogPage from './pages/datasources/DatasourceCatalogPage';
import DomainPacksPage from './pages/domainpacks/DomainPacksPage';
import EvidenceViewerPage from './pages/evidence/EvidenceViewerPage';
import UsageBillingPage from './pages/billing/UsageBillingPage';
import AICopilotPage from './pages/copilot/AICopilotPage';
import ITSMPage from './pages/itsm/ITSMPage';
import KnowledgeGraphPage from './pages/knowledge/KnowledgeGraphPage';
import ApprovalsPage from './pages/approvals/ApprovalsPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/"                       element={<DashboardPage />} />
          <Route path="/plans"                  element={<PlansListPage />} />
          <Route path="/plans/new"              element={<NewPlanPage />} />
          <Route path="/plans/import"           element={<ImportPlanPage />} />
          <Route path="/plans/:id"              element={<PlanDetailPage />} />
          <Route path="/plans/:id/edit"         element={<EditPlanPage />} />
          <Route path="/plans/:id/history"      element={<PlanVersionHistoryPage />} />
          <Route path="/plans/:id/canvas"       element={<PlanDAGCanvasPage />} />
          <Route path="/plans/:id/canary"       element={<PlanCanaryPage />} />
          <Route path="/execute"                element={<ExecutePage />} />
          <Route path="/execute/monitor"        element={<ExecutionMonitorPage />} />
          <Route path="/history"                element={<HistoryPage />} />
          <Route path="/history/:id"            element={<ExecutionDetailPage />} />
          <Route path="/admin"                  element={<AdminConsolePage />} />
          <Route path="/datasources"            element={<DatasourceCatalogPage />} />
          <Route path="/packs"                  element={<DomainPacksPage />} />
          <Route path="/evidence"               element={<EvidenceViewerPage />} />
          <Route path="/approvals"              element={<ApprovalsPage />} />
          <Route path="/billing"                element={<UsageBillingPage />} />
          <Route path="/copilot"                element={<AICopilotPage />} />
          <Route path="/itsm"                   element={<ITSMPage />} />
          <Route path="/knowledge"              element={<KnowledgeGraphPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}