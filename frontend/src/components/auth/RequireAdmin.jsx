import { Outlet } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import PageLoader from "../ui/PageLoader";
import AdminLogin from "../../pages/auth/AdminLogin";

// Admin-only area. Anyone without an admin session sees the admin login in place,
// and the requested admin page opens right after signing in.
// (Frontend protection only: the backend authorizes every admin request.)
const RequireAdmin = () => {
  const { ready, isAdmin } = useAuth();
  if (!ready) return <PageLoader fullScreen dark label="Checking your session..." />;
  if (!isAdmin) return <AdminLogin />;
  return <Outlet />;
};

export default RequireAdmin;
