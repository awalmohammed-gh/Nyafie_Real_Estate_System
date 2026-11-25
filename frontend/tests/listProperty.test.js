import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENT_START, agentStartDestination, agentStartRedirect, approvedAgentAccess, listPropertyPath } from "../src/utils/listProperty.js";
import { sessionDomainForPath } from "../src/utils/sessionDomain.js";

const approved = { role: "agent", status: "active", agentApplication: { status: "approved" }, onboarding: { dashboardAccess: true } };
const applying = { role: "agent", status: "active", agentApplication: { status: "incomplete" }, onboarding: { dashboardAccess: false, nextPath: "/agent/onboarding/profile" } };

test("the public site never links non-agents into the workspace", () => {
  for (const user of [null, { role: "user" }, { role: "user", agentAccess: true }, { role: "admin" }]) assert.equal(listPropertyPath(user), AGENT_START);
  assert.equal(sessionDomainForPath(AGENT_START), "customer", "it checks the customer, not whichever agent is signed in on the browser");
});

test("visitors register, customers apply, and only a customer's own agent account is opened", () => {
  assert.equal(agentStartRedirect(null), "/agent/register");
  assert.equal(agentStartRedirect({ role: "user" }), "/agent/plans");
  assert.equal(agentStartRedirect({ role: "user", agentAccess: true }), null);
});

test("the workspace opens only for approved agents; everyone else continues onboarding", () => {
  assert.equal(agentStartDestination(approved, false), "/agent/properties/add");
  assert.equal(agentStartDestination(approved, true), "/agent/dashboard");
  assert.equal(agentStartDestination(applying, true), "/agent/onboarding/profile");
  assert.equal(agentStartDestination({ ...applying, agentApplication: { status: "pending" }, onboarding: { nextPath: "/agent/status" } }, true), "/agent/status");
  assert.equal(agentStartDestination({ ...approved, status: "suspended", onboarding: { nextPath: "/agent/status" } }, true), "/agent/status");
  assert.equal(listPropertyPath(approved), "/agent/properties/add");
  assert.equal(listPropertyPath(applying), "/agent/onboarding/profile");
});

test("'Agent Dashboard' is offered only once the application is approved", () => {
  assert.equal(approvedAgentAccess({ agentAccess: true, agentApplication: { status: "approved" } }), true);
  for (const user of [null, { agentApplication: { status: "approved" } }, { agentAccess: true, agentApplication: { status: "pending" } }]) assert.equal(approvedAgentAccess(user), false);
});
