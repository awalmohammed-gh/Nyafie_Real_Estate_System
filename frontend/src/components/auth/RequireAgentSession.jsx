import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import PageLoader from "../ui/PageLoader";

// Onboarding and application status require an agent identity, not approval.
const RequireAgentSession = () => {
  const { ready, isAgent } = useAuth();
  const { pathname, search } = useLocation();
  if (!ready) return <PageLoader label="Checking your session..." />;
  if (!isAgent) return <Navigate to="/login?account=agent" replace state={{ from: pathname + search }} />;
  return <Outlet />;
};
export default RequireAgentSession;
