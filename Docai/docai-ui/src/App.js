import { Box, Toolbar } from '@mui/material';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import DocTypes from './pages/DocTypes';
import AutoDetect from './pages/AutoDetect';
import Login from './pages/Login';
import ParseDocument from './pages/ParseDocument';
import ParseHistory from './pages/ParseHistory';
import './App.css';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('docai_token');
  const location = useLocation();

  if (!token || token === 'docai-demo-admin-token') {
    if (token === 'docai-demo-admin-token') {
      localStorage.removeItem('docai_token');
      localStorage.removeItem('docai_demo_mode');
    }
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

function AppLayout() {
  return (
    <Box className="app-shell">
      <Sidebar />
      <Box component="main" className="app-content">
        <Toolbar />
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/doc-types" element={<DocTypes />} />
          <Route path="/parse-document" element={<ParseDocument />} />
          <Route path="/auto-detect" element={<AutoDetect />} />
          <Route path="/parse-history" element={<ParseHistory />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Box>
    </Box>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;
