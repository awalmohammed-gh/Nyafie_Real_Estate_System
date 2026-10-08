import { Outlet, useLocation } from "react-router-dom";
import { AuthProvider } from "../context/AuthProvider";
import { PlatformProvider } from "../context/PlatformProvider";
import { RealEstateProvider } from "../context/RealEstateProvider";
import { sessionDomainForPath } from "../utils/sessionDomain";
import SiteHead from "../components/brand/SiteHead";
import { PageSeoProvider } from "../context/PageSeoProvider";
import { Suspense } from "react";
import PageLoader from "../components/ui/PageLoader";

// Changing areas mounts a fresh, role-bound context and drops the previous
// area's private data. Other browser tabs keep their own independent context.
const SessionLayout = () => {
  const { pathname, search } = useLocation();
  const domain = sessionDomainForPath(pathname, search);
  return (
    <PageSeoProvider><AuthProvider key={domain} domain={domain}>
      <PlatformProvider>
        <RealEstateProvider>
          <SiteHead />
          {/* Only before a layout has loaded; each layout has its own boundary around its content */}
          <Suspense fallback={<PageLoader fullScreen label="Loading HomeBase..." />}><Outlet /></Suspense>
        </RealEstateProvider>
      </PlatformProvider>
    </AuthProvider></PageSeoProvider>
  );
};
export default SessionLayout;
