import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import PageLoader from "../ui/PageLoader";

// Agent-only area. Normal users are sent to the plans page to subscribe first and
// admins to their own dashboard. Agents with an inactive subscription can still
// enter (to see their data and renew); the permission system restricts actions.
const RequireAgent = () => {
  const { ready, isAuthenticated, isAgent, isAdmin } = useAuth();
  const location = useLocation();

  if (!ready) return <PageLoader fullScreen label="Checking your session..." />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (isAdmin) return <Navigate to="/admin/dashboard" replace />;
  if (!isAgent) return <Navigate to="/agent/plans" replace state={{ notice: "agent-only" }} />;
  return <Outlet />;
};

export default RequireAgent;
