import client from "./client";
import { mapSubscription, mapUser } from "./mappers";

export const getCurrentSubscription = async () => {
  const data = (await client.get("/subscriptions/current")).data;
  return { ...data, subscription: mapSubscription(data.subscription) };
};

// Subscribe, renew and upgrade all start a payment for the chosen plan.
// Returns { mode: "paystack", authorizationUrl, reference }; the browser then pays on Paystack.
export const initializePayment = async (planId, method) => (await client.post("/subscriptions/initialize", { planId, method })).data;
export const subscribeToPlan = initializePayment;
export const renewSubscription = initializePayment;
export const changePlan = initializePayment;

// The backend verifies the payment itself and returns the updated user
export const verifyPayment = async (reference) => mapUser((await client.post("/subscriptions/verify", { reference })).data);
export const cancelSubscription = async () => mapUser((await client.post("/subscriptions/cancel")).data);
