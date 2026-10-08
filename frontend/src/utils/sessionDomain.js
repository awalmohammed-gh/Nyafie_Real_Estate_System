// Public browsing uses customer auth; selected agent auth and onboarding use agent auth.
export const sessionDomainForPath = (pathname, search = "") => {
  if (["/login", "/register"].includes(pathname) && new URLSearchParams(search).get("account") === "agent") return "agent";
  if (/^\/admin(?:\/|$)/.test(pathname)) return "admin";
  if (pathname === "/agent" || /^\/agent\/(?:login|register|onboarding|status|checkout|dashboard|properties|inquiries|offers|rentals|sale-requests|messages|subscription|profile|settings)(?:\/|$)/.test(pathname)) return "agent";
  return "customer";
};

export const sessionRole = { customer: "user", agent: "agent", admin: "admin" };
export const sessionHome = { customer: "/", agent: "/agent/dashboard", admin: "/admin/dashboard" };
export const sessionLogin = { customer: "/login", agent: "/agent/login", admin: "/admin/login" };
export const sessionDestination = (domain, from) => {
  if (typeof from !== "string" || !from.startsWith("/") || from.startsWith("//") || from.includes("\\")) return sessionHome[domain];
  const url = new URL(from, "https://homebase.invalid");
  if (["/login", "/register", "/agent/login", "/agent/register", "/admin/login"].includes(url.pathname)) return sessionHome[domain];
  return sessionDomainForPath(url.pathname, url.search) === domain ? url.pathname + url.search + url.hash : sessionHome[domain];
};

export const canAccessAgent = (user) => user?.role === "agent" && user.status === "active" && user.agentApplication?.status === "approved" && user.onboarding?.dashboardAccess !== false;
// The exact onboarding step to open: the server decides it (user.onboarding.nextPath)
export const agentDestination = (user, from) => {
  if (canAccessAgent(user)) return sessionDestination("agent", from);
  if (user?.onboarding?.nextPath) return user.onboarding.nextPath;
  const application = user?.agentApplication;
  const incomplete = !application?.status || application.status === "incomplete";
  if (user?.status !== "suspended" && incomplete && !application?.profileCompletedAt) return "/agent/onboarding/profile";
  return "/agent/status";
};

// An explicit account switch must show the form even if another tab has a session.
export const authRedirectDestination = ({ isAuthenticated, explicitSignIn, domain, user, from }) => {
  if (!isAuthenticated || explicitSignIn) return null;
  return domain === "agent" ? agentDestination(user, from) : sessionDestination(domain, from);
};
