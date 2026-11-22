// Phone bottom navigation (layout/BottomNav.jsx): the pages it stays off.
//  - property pages, checkout, payment and making an offer have their own action bar at the bottom
//  - /agent/... belongs to the agent area (plans, joining an agency)
export const bottomNavAllowedOn = (pathname) => !/^\/(house|checkout|payment|make-offer|agent)(\/|$)/.test(pathname);

// Which tab a page belongs to. paths: the configurable listing/property slugs (PlatformProvider).
export const bottomNavTab = (pathname, paths) => {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/account/saved") || pathname.startsWith("/account/searches")) return "saved";
  if (pathname.startsWith("/account/messages")) return "messages";
  const explore = [paths.listings, paths.properties, "/sale", "/rent", "/compare"].filter(Boolean);
  if (explore.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return "explore";
  return null;
};
