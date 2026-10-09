import client from "./client";
import { mapPlan, mapSubscription, mapUser } from "./mappers";

export const getCurrentSubscription = async () => {
  const data = (await client.get("/subscriptions/current")).data;
  return { ...data, subscription: mapSubscription(data.subscription) };
};

// What a plan costs right now, worked out by the server: { kind, price, credit, amount, startsAt, expiresAt, ... }
export const quotePlan = async (planId) => (await client.post("/subscriptions/quote", { planId })).data;

// The higher plans of the provider's own account type, each with today's price from the server:
// { status, currentPlan, highest, upgrades: [{ plan, quote }] }
export const getUpgrades = async () => {
  const data = (await client.get("/subscriptions/upgrades")).data;
  return { ...data, upgrades: data.upgrades.map(({ plan, quote }) => ({ plan: mapPlan(plan), quote })) };
};

// Subscribe and renew start a payment for the chosen plan; upgrades use their own endpoint,
// which only accepts a higher plan. Both return { mode: "paystack", authorizationUrl, reference },
// or { mode: "credit", user } when the unused value of the current plan covers it all.
const startPayment = async (path, planId) => {
  const data = (await client.post(path, { planId })).data;
  return data.mode === "credit" ? { ...data, user: mapUser(data.user) } : data;
};
export const initializePayment = (planId) => startPayment("/subscriptions/initialize", planId);
export const upgradePlan = (planId) => startPayment("/subscriptions/upgrade", planId);
export const subscribeToPlan = initializePayment;
export const renewSubscription = initializePayment;

// The backend verifies the payment itself and returns the updated user,
// or { pending: true } while Paystack is still processing it
export const verifyPayment = async (reference) => {
  const data = (await client.post("/subscriptions/verify", { reference })).data;
  return data?.paymentPending ? { pending: true, reference: data.reference } : mapUser(data);
};
export const cancelSubscription = async () => mapUser((await client.post("/subscriptions/cancel")).data);
