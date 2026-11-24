import { agentDestination, canAccessAgent } from "./sessionDomain.js";

// "List your property" and "Become an agent". On the public site everyone goes through /agent/start
// (pages/agent/AgentStart.jsx), which checks who they are: the workspace is never linked directly.
export const AGENT_START = "/agent/start";
export const listPropertyPath = (user) =>
  user?.role === "agent" ? (canAccessAgent(user) ? "/agent/properties/add" : agentDestination(user)) : AGENT_START;

/**
 * Where /agent/start sends a visitor (customer area):
 *  - signed out: agent registration, the first step of onboarding
 *  - a customer who isn't an agent: the agent application
 *  - an agent using the customer area: null, their agent session is opened first
 */
export const agentStartRedirect = (user) => (!user ? "/agent/register" : user.agentAccess ? null : "/agent/plans");

// Their own agent account is open: approved agents enter the workspace, everyone else continues onboarding
export const agentStartDestination = (agent, dashboard) =>
  canAccessAgent(agent) ? (dashboard ? "/agent/dashboard" : "/agent/properties/add") : agentDestination(agent);

// Someone in the customer area whose agent application was approved (shown as "Agent Dashboard" rather than "Agent application")
export const approvedAgentAccess = (user) => Boolean(user?.agentAccess) && user.agentApplication?.status === "approved";
