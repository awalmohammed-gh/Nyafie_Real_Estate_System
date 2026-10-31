import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { SESSION_ROLES, cookieName, clearAuthCookie } from "../utils/generateToken.js";
import { fail } from "../utils/response.js";
import { approvedAgent, isRemoved } from "../utils/agentApplication.js";
import { CUSTOMER_TAB_HEADER, matchesCustomerTab, validTabSecret } from "../utils/customerTabSession.js";
import { matchesSessionRole } from "../utils/sessionAccess.js";

const userFromCookie = async (req, session) => {
  const token = req.cookies?.[cookieName(session)];
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_KEY, { algorithms: ["HS256"] });
  } catch {
    return null;
  }
  if (payload.session !== session || payload.role !== SESSION_ROLES[session] || !/^[a-f\d]{24}$/i.test(payload.id || "")) return null;
  if (session === "customer" && !validTabSecret(payload.tabHash)) return null;
  if (session === "customer" && !matchesCustomerTab(payload, req.get(CUSTOMER_TAB_HEADER))) {
    // A new tab must not erase the shared cookie used by an already signed-in tab.
    req.customerTabMismatch = true;
    return null;
  }
  // Current account role/status matter too: demotion, suspension and removal take effect immediately.
  // A removed provider's existing token stops working on its next request.
  const user = await User.findById(payload.id).select("+sessionVersion");
  const tokenVersion = payload.sessionVersion === undefined ? "" : payload.sessionVersion;
  if (!user || typeof tokenVersion !== "string" || tokenVersion !== (user.sessionVersion || "")) return null;
  if (!matchesSessionRole(user, session) || (session !== "agent" && !user.isActive) || isRemoved(user)) return null;
  // Request-only metadata keeps shared resources in the selected area, even for dual-access users.
  if (user.$locals) user.$locals.sessionDomain = session;
  return user;
};

// Property views: every verified session in this browser, whichever page sent the request, so an agent
// or admin opening a public listing page is recognised (their own and moderation views don't count)
export const viewerSessions = async (req, _res, next) => {
  try {
    const [customer, agent, admin] = await Promise.all(["customer", "agent", "admin"].map((session) => userFromCookie(req, session)));
    req.viewerSessions = { customer, agent, admin };
    next();
  } catch (error) { next(error); }
};

// On shared resources the header selects a domain; it never proves identity.
// Only that domain's cookie, signed claims and current account role do so.
const sessionGuard = (allowApplicant, ...allowed) => async (req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  const session = req.sessionDomain || req.get("X-Session-Domain") || allowed[0];
  if (!allowed.includes(session)) return fail(res, 403, "This session cannot access this area.");
  try {
    const user = req.user && req.sessionDomain === session ? req.user : await userFromCookie(req, session);
    if (!user) {
      if (req.cookies?.[cookieName(session)] && !(session === "customer" && req.customerTabMismatch)) clearAuthCookie(res, session);
      return fail(res, 401, "Please sign in to this area to continue.");
    }
    req.user = user;
    req.sessionDomain = session;
    if (session === "agent" && !allowApplicant && !approvedAgent(user)) return fail(res, 403, "Agent approval and an active account are required. Check your application status.");
    next();
  } catch (error) { next(error); }
};
export const protectSessions = (...allowed) => sessionGuard(false, ...allowed);
export const protectCustomer = protectSessions("customer");
export const protectAgent = protectSessions("agent");
// These identities can access only onboarding, status and subscription requirements.
export const protectAgentSession = sessionGuard(true, "agent");
// Applicants can upload their avatar/logo, but never gain workspace access from an upload.
export const protectUpload = sessionGuard(true, "agent", "admin");
export const protectAdmin = protectSessions("admin");
export const protect = protectSessions("customer", "agent", "admin");
export const protectOwner = protectSessions("agent", "admin");
export const protectSubscriber = sessionGuard(true, "customer", "agent");

export const optionalAuth = async (req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  const session = req.get("X-Session-Domain") || "customer";
  if (!Object.hasOwn(SESSION_ROLES, session)) return next();
  try {
    const user = await userFromCookie(req, session);
    if (user && (session !== "agent" || approvedAgent(user))) { req.user = user; req.sessionDomain = session; }
    next();
  } catch (error) { next(error); }
};
