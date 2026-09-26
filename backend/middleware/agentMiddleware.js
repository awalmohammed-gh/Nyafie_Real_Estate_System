import { getAgentAccess, restrictionMessage } from "../utils/permissions.js";
import { fail } from "../utils/response.js";

// Use after `protect`: only agents may continue. Attaches req.access (plan, limits, usage).
export const agentOnly = async (req, res, next) => {
  try {
    if (req.user?.role !== "agent") return fail(res, 403, "Agent access only. Subscribe to a plan to become an agent.");
    req.access = await getAgentAccess(req.user);
    next();
  } catch (error) {
    next(error);
  }
};

// Use after `agentOnly`: the agent's subscription must be active
export const activeSubscription = (req, res, next) => {
  if (!req.access?.isActive) return fail(res, 403, restrictionMessage(req.access));
  next();
};
