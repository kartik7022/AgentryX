import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import AuthGuard, { useAdminAuth } from './components/AuthGuard';
import RegisterClient from './pages/RegisterClient';
import ManageClients from './pages/ManageClients';
import Modules from './pages/Modules';
import SidebarItems from './pages/SidebarItems';
import Admins from './pages/Admins';
import DatasourceTypes from './pages/DatasourceTypes';
import ModuleGroups from './pages/ModuleGroups';
import BillingDashboard from './pages/billing/BillingDashboard';
import BillingCustomers from './pages/billing/BillingCustomers';
import BillingCustomerDetail from './pages/billing/BillingCustomerDetail';
import BillingSubscriptions from './pages/billing/BillingSubscriptions';
import BillingPayments from './pages/billing/BillingPayments';
import BillingRevenue from './pages/billing/BillingRevenue';
import BillingConfig from './pages/billing/BillingConfig';
import BillingPlans from './pages/billing/BillingPlans';
import './App.css';

const PAGE_META = {
  '/register': { title: 'Register Client', sub: 'Create a new client account and issue an API key' },
  '/clients': { title: 'Manage Clients', sub: 'View, search and manage all client accounts' },
  '/modules': { title: 'Modules Management', sub: 'Configure and manage platform modules' },
  '/sidebar-items': { title: 'Client Side Left Nav Setup', sub: 'Create client-side left navigation items and assign them to modules' },
  '/admins': { title: 'Manage Admins', sub: 'Superadmin — add, edit and remove admin users' },
  '/datasource-types': { title: 'Datasource Types', sub: 'Manage supported datasource types and their connection fields' },
  '/module-groups': { title: 'Module Groups', sub: 'Group modules together to appear under a single tab in the portal' },
  '/billing/dashboard': { title: 'Billing Dashboard', sub: 'Overview of accounts, invoices and activity' },
  '/billing/customers': { title: 'Customers', sub: 'Search and manage billing customer accounts' },
  '/billing/subscriptions': { title: 'Subscriptions', sub: 'All active and past subscriptions' },
  '/billing/payments': { title: 'Payments', sub: 'Payment records and summary' },
  '/billing/revenue': { title: 'Revenue', sub: 'Revenue trends and breakdown' },
  '/billing/config': { title: 'Billing Config', sub: 'Manage billing settings and policies' },
  '/billing/plans': { title: 'Plans', sub: 'Manage subscription plans and modules' },
};

function PageHeader() {
  const { pathname } = useLocation();
  const { isSuperadmin } = useAdminAuth();
  if ((pathname.startsWith('/billing') || pathname === '/admins') && !isSuperadmin) return null;

  const meta = PAGE_META[pathname];
  if (!meta) return null;
  return (
    <div className="page-header">
      <h1>{meta.title}</h1>
      <p>{meta.sub}</p>
    </div>
  );
}

function SuperadminRoute({ children }) {
  const { isSuperadmin } = useAdminAuth();
  return isSuperadmin ? children : <Navigate to="/register" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthGuard>
        <div className="app-shell">
          <Sidebar />
          <main className="content">
            <PageHeader />
            <Routes>
            <Route path="/" element={<Navigate to="/register" replace />} />
            <Route path="/register" element={<RegisterClient />} />
            <Route path="/clients" element={<ManageClients />} />
            <Route path="/modules" element={<Modules />} />
            <Route path="/sidebar-items" element={<SidebarItems />} />
            <Route path="/admins" element={<SuperadminRoute><Admins /></SuperadminRoute>} />
            <Route path="/datasource-types" element={<DatasourceTypes />} />
            <Route path="/module-groups" element={<ModuleGroups />} />
            <Route path="/billing/dashboard" element={<SuperadminRoute><BillingDashboard /></SuperadminRoute>} />
            <Route path="/billing/customers" element={<SuperadminRoute><BillingCustomers /></SuperadminRoute>} />
            <Route path="/billing/customers/:accountId" element={<SuperadminRoute><BillingCustomerDetail /></SuperadminRoute>} />
            <Route path="/billing/subscriptions" element={<SuperadminRoute><BillingSubscriptions /></SuperadminRoute>} />
            <Route path="/billing/payments" element={<SuperadminRoute><BillingPayments /></SuperadminRoute>} />
            <Route path="/billing/revenue" element={<SuperadminRoute><BillingRevenue /></SuperadminRoute>} />
            <Route path="/billing/config" element={<SuperadminRoute><BillingConfig /></SuperadminRoute>} />
            <Route path="/billing/plans" element={<SuperadminRoute><BillingPlans /></SuperadminRoute>} />
          </Routes>
          </main>
        </div>
      </AuthGuard>
    </BrowserRouter>
  );
}
