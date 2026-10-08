import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { SESSION_ROLES, cookieName, clearAuthCookie } from "../utils/generateToken.js";
import { fail } from "../utils/response.js";
import { approvedAgent } from "../utils/agentApplication.js";

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
  // Current account role/status matter too: demotion and suspension take effect immediately.
  const user = await User.findById(payload.id);
  return user?.role === SESSION_ROLES[session] && (session === "agent" || user.isActive) ? user : null;
};

// On shared resources the header selects a domain; it never proves identity.
// Only that domain's cookie, signed claims and current account role do so.
const sessionGuard = (allowApplicant, ...allowed) => async (req, res, next) => {
  const session = req.sessionDomain || req.get("X-Session-Domain") || allowed[0];
  if (!allowed.includes(session)) return fail(res, 403, "This session cannot access this area.");
  try {
    const user = req.user && req.sessionDomain === session ? req.user : await userFromCookie(req, session);
    if (!user) {
      if (req.cookies?.[cookieName(session)]) clearAuthCookie(res, session);
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

export const optionalAuth = async (req, _res, next) => {
  const session = req.get("X-Session-Domain") || "customer";
  if (!Object.hasOwn(SESSION_ROLES, session)) return next();
  try {
    const user = await userFromCookie(req, session);
    if (user && (session !== "agent" || approvedAgent(user))) { req.user = user; req.sessionDomain = session; }
    next();
  } catch (error) { next(error); }
};
