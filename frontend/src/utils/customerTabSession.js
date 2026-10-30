const STORAGE_KEY = "nyafie:customer-tab";
export const CUSTOMER_SESSION_ENDED = "nyafie:customer-session-ended";
const valid = (secret) => typeof secret === "string" && /^[a-f0-9]{64}$/.test(secret);

export const readCustomerTabSecret = () => {
  try {
    const secret = window.sessionStorage.getItem(STORAGE_KEY);
    return valid(secret) ? secret : "";
  } catch { return ""; }
};

export const prepareCustomerTab = () => {
  const existing = readCustomerTabSecret();
  if (existing) return existing;
  try {
    const bytes = window.crypto.getRandomValues(new Uint8Array(32));
    const secret = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    window.sessionStorage.setItem(STORAGE_KEY, secret);
    if (readCustomerTabSecret() !== secret) throw new Error("Storage unavailable");
    return secret;
  } catch {
    throw new Error("Allow session storage in this browser to sign in securely, then try again.");
  }
};

export const clearCustomerTab = () => {
  try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* Already inaccessible. */ }
};
