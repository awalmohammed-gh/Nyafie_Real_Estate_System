import { createContext } from "react";

// true inside the public site's layout (layout/SystemLayout.jsx): a page that is still loading shows
// only the loader, covering the navbar, footer and any half-loaded page (components/ui/PageLoader.jsx).
// Dashboards leave it false, so their sidebars stay around a loading page.
export const PageLoaderCoverContext = createContext(false);
