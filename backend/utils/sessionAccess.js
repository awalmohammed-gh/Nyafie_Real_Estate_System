import { SESSION_ROLES } from "./generateToken.js";

// Every agent is a customer too: one account for both areas (never admins). The agent area still needs an
// agent session, and the dashboard an approved application.
export const matchesSessionRole = (user, session) => Boolean(user) && (
  user.role === SESSION_ROLES[session] ||
  (session === "customer" && user.role === "agent")
);
