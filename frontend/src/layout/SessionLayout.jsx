import { Outlet, useLocation } from "react-router-dom";
import { AuthProvider } from "../context/AuthProvider";
import { PlatformProvider } from "../context/PlatformProvider";
import { RealEstateProvider } from "../context/RealEstateProvider";
import { sessionDomainForPath } from "../utils/sessionDomain";
import SiteHead from "../components/brand/SiteHead";
import { PageSeoProvider } from "../context/PageSeoProvider";
import { lazy, Suspense, useEffect } from "react";
import { applyAppManifest } from "../utils/appManifest";
import PageLoader from "../components/ui/PageLoader";
import { useAuth } from "../context/useAuth";

const CreatePasswordDialog = lazy(() => import("../components/auth/CreatePasswordDialog"));
// Loaded only for someone who signed up with Google and has no NyaFie password
const PasswordPrompt = () => useAuth().user?.passwordMissing ? <Suspense fallback={null}><CreatePasswordDialog /></Suspense> : null;

// Changing areas mounts a fresh, role-bound context and drops the previous
// area's private data. Other browser tabs keep their own independent context.
const SessionLayout = () => {
  const { pathname, search } = useLocation();
  const domain = sessionDomainForPath(pathname, search);
  // The site, the agent workspace and the admin console each install as their own app (utils/appManifest.js)
  useEffect(() => { applyAppManifest(pathname); }, [pathname]);
  return (
    <PageSeoProvider><AuthProvider key={domain} domain={domain}>
      <PlatformProvider>
        <RealEstateProvider>
          <SiteHead />
          {domain === "customer" && <PasswordPrompt />}
          {/* Only before a layout has loaded; each layout has its own boundary around its content */}
          <Suspense fallback={<PageLoader fullScreen label="Loading NyaFie..." />}><Outlet /></Suspense>
        </RealEstateProvider>
      </PlatformProvider>
    </AuthProvider></PageSeoProvider>
  );
};
export default SessionLayout;
