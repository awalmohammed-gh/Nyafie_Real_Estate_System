import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import PageLoader from "../ui/PageLoader";

// Signed-out visitors are sent to the login page and returned here afterwards
const RequireAuth = ({ children }) => {
  const { ready, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!ready) return <PageLoader label="Checking your session..." />;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return children || <Outlet />;
};

export default RequireAuth;
