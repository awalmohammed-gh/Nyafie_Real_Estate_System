import { Outlet, useLocation } from "react-router-dom";
import { AuthProvider } from "../context/AuthProvider";
import { PlatformProvider } from "../context/PlatformProvider";
import { RealEstateProvider } from "../context/RealEstateProvider";
import { sessionDomainForPath } from "../utils/sessionDomain";
import SiteHead from "../components/brand/SiteHead";

// Changing areas mounts a fresh, role-bound context and drops the previous
// area's private data. Other browser tabs keep their own independent context.
const SessionLayout = () => {
  const { pathname, search } = useLocation();
  const domain = sessionDomainForPath(pathname, search);
  return (
    <AuthProvider key={domain} domain={domain}>
      <PlatformProvider>
        <RealEstateProvider>
          <SiteHead />
          <Outlet />
        </RealEstateProvider>
      </PlatformProvider>
    </AuthProvider>
  );
};
export default SessionLayout;
