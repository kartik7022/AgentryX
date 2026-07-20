import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider";

export function ProtectedRoute({ children }) {
  const { loading, authenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return null;
  }

  if (!authenticated) {
    return <Navigate to={`/?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  return children;
}
