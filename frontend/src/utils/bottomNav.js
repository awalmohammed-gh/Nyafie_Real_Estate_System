// Phone bottom navigation (layout/BottomNav.jsx): on every customer page. Only /agent/... (agent plans,
// joining an agency) belongs to the agent area. A page with its own bottom action bar (property pages)
// places that bar just above the tab bar (.page-action-bar in index.css).
export const bottomNavAllowedOn = (pathname) => !/^\/agent(\/|$)/.test(pathname);

// Which tab a page belongs to. paths: the configurable listing/property slugs (PlatformProvider).
export const bottomNavTab = (pathname, paths) => {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/account/saved") || pathname.startsWith("/account/searches")) return "saved";
  if (pathname.startsWith("/account/messages")) return "messages";
  const explore = [paths.listings, paths.properties, "/sale", "/rent", "/compare"].filter(Boolean);
  if (explore.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return "explore";
  return null;
};
