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
const SESSION_LIFETIME = Object.freeze({ customer: CUSTOMER_SESSION_SECONDS * 1000, agent: 7 * 24 * HOUR, admin: 12 * HOUR });

// Both the signed claims and cookie identify a single session domain.
export const setAuthCookie = (res, userId, session, sessionVersion = "", tabSecret) => {
  const name = cookieName(session);
  const lifetime = SESSION_LIFETIME[session];
  const tabHash = session === "customer" ? tabSecretHash(tabSecret) : null;
  if (session === "customer" && !tabHash) throw new Error("A valid customer tab session is required.");
  const token = jwt.sign({ id: String(userId), role: SESSION_ROLES[session], session, sessionVersion, ...(tabHash ? { tabHash } : {}) }, process.env.JWT_KEY, {
    algorithm: "HS256", expiresIn: Math.floor(lifetime / 1000),
  });
  res.cookie(name, token, { ...cookieOptions(), ...(session === "customer" ? {} : { maxAge: lifetime }) });
};
export const clearAuthCookie = (res, session) => res.clearCookie(cookieName(session), cookieOptions());
