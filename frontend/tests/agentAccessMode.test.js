import { test } from "node:test";
import assert from "node:assert/strict";
import { getAgentPermissions, lockCopy } from "../src/utils/permissions.js";

const plans = [
  { id: "individual", name: "Individual", active: true, accountType: "individual", price: 100, propertyLimit: 5, imageLimit: 8, featuredLimit: 1, sortOrder: 1 },
  { id: "agency", name: "Agency", active: true, accountType: "agency", price: 500, propertyLimit: 20, imageLimit: 12, sortOrder: 1 },
  { id: "pro", name: "Pro", active: true, accountType: "individual", price: 250, propertyLimit: 15, imageLimit: 15, sortOrder: 2 },
];
const user = { id: "agent", role: "agent", status: "active", agentApplication: { status: "approved", agentType: "individual" } };
const settings = { general: { siteName: "NyaFie" }, agent: { requireSubscription: false, defaultPlan: "" }, property: { maxImages: 15, allowAgentPublishing: true } };
const permissions = (overrides = {}) => getAgentPermissions({ user, plans, settings, listings: [], ...overrides });

test("free mode permits approved agents to work without selecting or buying a plan", () => {
  const access = permissions();
  assert.equal(access.canAddProperty, true);
  assert.equal(access.plan.id, "individual");
  assert.equal(access.propertyLimit, 5);
  assert.equal(access.subscriptionsEnabled, false);
  assert.equal(access.canUpgrade, false);
  assert.equal(lockCopy(access, "propertyLimit").cta, null);
});

test("free mode respects the configured limits and the account type fallback", () => {
  assert.equal(permissions({ settings: { ...settings, agent: { ...settings.agent, defaultPlan: "pro" } } }).propertyLimit, 15);
  const agency = { ...user, agentApplication: { ...user.agentApplication, agentType: "agency" } };
  assert.equal(permissions({ user: agency }).plan.id, "agency");
  assert.equal(permissions({ plans: plans.map(plan => plan.id === "pro" ? { ...plan, active: false } : plan), settings: { ...settings, agent: { ...settings.agent, defaultPlan: "pro" } } }).plan.id, "individual");
});

test("free access never bypasses admin approval or suspension", () => {
  assert.equal(permissions({ user: { ...user, agentApplication: { ...user.agentApplication, status: "pending" } } }).canAddProperty, false);
  assert.equal(permissions({ user: { ...user, status: "suspended" } }).canAddProperty, false);
});

test("switching paid requirements on locks unpaid publishing, and switching off restores it", () => {
  const paid = { ...settings, agent: { ...settings.agent, requireSubscription: true } };
  assert.equal(permissions({ settings: paid }).canEditProperty, false);
  assert.equal(permissions({ settings: paid }).restriction, "none");
  assert.equal(permissions().canEditProperty, true);
});

test("an expired subscription falls back to free limits without changing its stored dates", () => {
  const subscription = { planId: "pro", status: "expired", paymentStatus: "paid", expiryDate: "2020-01-01" };
  const expired = { ...user, subscription };
  const access = permissions({ user: expired });
  assert.equal(access.canEditProperty, true);
  assert.equal(access.plan.id, "individual");
  assert.deepEqual(expired.subscription, subscription);
});
