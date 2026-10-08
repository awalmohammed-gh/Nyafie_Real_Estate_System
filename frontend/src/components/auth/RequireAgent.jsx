import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import PageLoader from "../ui/PageLoader";
import { canAccessAgent, agentDestination } from "../../utils/sessionDomain";

// Agent-only area. Missing agent sessions go to the agent login.
// Agents with an inactive subscription can still
// enter (to see their data and renew); the permission system restricts actions.
const RequireAgent = () => {
  const { ready, isAgent, user } = useAuth();
  const location = useLocation();

  if (!ready) return <PageLoader fullScreen label="Checking your session..." />;
  if (!isAgent) return <Navigate to="/agent/login" replace state={{ from: location.pathname + location.search }} />;
  if (!canAccessAgent(user)) return <Navigate to={agentDestination(user)} replace />;
  return <Outlet />;
};

export default RequireAgent;
