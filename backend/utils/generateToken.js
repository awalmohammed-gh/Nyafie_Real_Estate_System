import jwt from "jsonwebtoken";
import { CUSTOMER_SESSION_SECONDS, tabSecretHash } from "./customerTabSession.js";

export const SESSION_ROLES = Object.freeze({ customer: "user", agent: "agent", admin: "admin" });
export const cookieName = (session) => {
  if (!Object.hasOwn(SESSION_ROLES, session)) throw new Error("Unknown session domain");
  return session + "_token";
};
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.COOKIE_SAME_SITE || "lax",
  path: "/",
});

// Customer cookies are session-only and additionally require a tab-specific proof.
const HOUR = 60 * 60 * 1000;
export const SESSION_LIFETIME = Object.freeze({ customer: CUSTOMER_SESSION_SECONDS * 1000, agent: 7 * 24 * HOUR, admin: 12 * HOUR });

const SESSION_ID = /^[a-f\d]{24}$/i;

// Both the signed claims and cookie identify a single session domain. `sid` is the stored session
// (utils/sessions.js startSession): a token without one is never accepted.
// `google`: this session started with Google, so for a short time it proves who the person is.
export const setAuthCookie = (res, userId, session, sessionVersion = "", tabSecret, { google = false, sid } = {}) => {
  const name = cookieName(session);
  const lifetime = SESSION_LIFETIME[session];
  const tabHash = session === "customer" ? tabSecretHash(tabSecret) : null;
  if (session === "customer" && !tabHash) throw new Error("A valid customer tab session is required.");
  const token = jwt.sign({ id: String(userId), ...(sid ? { sid } : {}), role: SESSION_ROLES[session], session, sessionVersion, ...(tabHash ? { tabHash } : {}), ...(google ? { google: true } : {}) }, process.env.JWT_KEY, {
    algorithm: "HS256", expiresIn: Math.floor(lifetime / 1000),
  });
  res.cookie(name, token, { ...cookieOptions(), ...(session === "customer" ? {} : { maxAge: lifetime }) });
};
// The session a cookie carries, { sid, id, sessionVersion }, with its signature checked, or null
export const cookieSession = (req, session, { ignoreExpiration = false } = {}) => {
  const token = req.cookies?.[cookieName(session)];
  if (typeof token !== "string" || token.length > 4096) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_KEY, { algorithms: ["HS256"], ignoreExpiration });
    if (payload.session !== session || !SESSION_ID.test(payload.sid || "") || !SESSION_ID.test(payload.id || "")) return null;
    return { sid: payload.sid, id: payload.id, sessionVersion: payload.sessionVersion || "" };
  } catch { return null; }
};
export const clearAuthCookie = (res, session) => res.clearCookie(cookieName(session), cookieOptions());
