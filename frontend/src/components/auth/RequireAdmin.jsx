import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import PageLoader from "../ui/PageLoader";
import { adminPath } from "../../utils/adminEntry";

// Restore only the admin session, then return to the requested page after login.
// (Frontend protection only: the backend authorizes every admin request.)
const RequireAdmin = () => {
  const { ready, isAdmin } = useAuth();
  const location = useLocation();
  if (!ready) return <PageLoader fullScreen dark label="Checking your session..." />;
  if (!isAdmin) return <Navigate to={adminPath("/login")} replace state={{ from: location.pathname + location.search }} />;
  return <Outlet />;
};

export default RequireAdmin;
