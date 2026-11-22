import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import { usePageSeo } from "../../context/pageSeo";

/**
 * A page's own title, description and image. When the page was loaded directly, the server already
 * wrote search-optimised ones for this address (backend routes/seoRoutes.js, read by PageSeoProvider);
 * those are kept, so what search engines see after the app starts matches what the server sent.
 * Moving between pages inside the app uses the values given here.
 */
const PageMetadata = ({ title, description, image }) => {
  const { pathname } = useLocation();
  const { setMetadata } = usePageSeo();
  useLayoutEffect(() => {
    setMetadata((current) => (current?.fromServer && current.pathname === pathname ? current : { pathname, title, description, image }));
    return () => setMetadata((current) => current?.pathname === pathname ? null : current);
  }, [pathname, title, description, image, setMetadata]);
  return null;
};
export default PageMetadata;
