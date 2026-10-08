import jwt from "jsonwebtoken";

export const SESSION_ROLES = Object.freeze({ customer: "user", agent: "agent", admin: "admin" });
export const cookieName = (session) => {
  if (!Object.hasOwn(SESSION_ROLES, session)) throw new Error("Unknown session domain");
  return session + "_token";
};
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  path: "/",
});

// Admin sessions are short-lived: the console holds the most power. Customers and agents stay signed in for a week.
const HOUR = 60 * 60 * 1000;
const SESSION_LIFETIME = Object.freeze({ customer: 7 * 24 * HOUR, agent: 7 * 24 * HOUR, admin: 12 * HOUR });

// Both the signed claims and cookie identify a single session domain.
export const setAuthCookie = (res, userId, session) => {
  const name = cookieName(session);
  const lifetime = SESSION_LIFETIME[session];
  const token = jwt.sign({ id: String(userId), role: SESSION_ROLES[session], session }, process.env.JWT_KEY, {
    algorithm: "HS256", expiresIn: Math.floor(lifetime / 1000),
  });
  res.cookie(name, token, { ...cookieOptions(), maxAge: lifetime });
};
export const clearAuthCookie = (res, session) => res.clearCookie(cookieName(session), cookieOptions());
