import { SESSION_ROLES } from "./generateToken.js";

// Only customers who explicitly started agent onboarding retain both areas on one identity.
// This flag is server-owned; ordinary agent registrations keep their existing session rules.
export const matchesSessionRole = (user, session) => Boolean(user) && (
  user.role === SESSION_ROLES[session] ||
  (session === "customer" && user.role === "agent" && user.customerAccess === true)
);
