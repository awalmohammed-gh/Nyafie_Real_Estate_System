import { createHash, timingSafeEqual } from "node:crypto";

export const CUSTOMER_TAB_HEADER = "X-Customer-Tab";
export const CUSTOMER_SESSION_SECONDS = 2 * 60 * 60;
export const validTabSecret = (secret) => typeof secret === "string" && /^[a-f0-9]{64}$/.test(secret);
export const tabSecretHash = (secret) => validTabSecret(secret) ? createHash("sha256").update(secret).digest("hex") : null;
export const matchesCustomerTab = (payload, secret) => {
  const hash = tabSecretHash(secret);
  return Boolean(hash && validTabSecret(payload.tabHash) && timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(payload.tabHash, "hex")));
};
