import crypto from "crypto";

const PAYSTACK = "https://api.paystack.co";

// Paystack TEST secret key from backend/.env (server only; never sent to the browser)
const secretKey = () => process.env.Test_Secret_Key?.trim() || "";

// "paystack" when a test secret key is configured, otherwise "disabled".
// Only sk_test_ keys are accepted, so the integration can't accidentally take live payments.
export const paymentMode = () => (secretKey().startsWith("sk_test_") ? "paystack" : "disabled");

// Safe summary for the admin Payment settings: which keys are configured, never their values
export const paymentStatus = () => {
  const secret = secretKey();
  const publicKey = process.env.Test_Public_Key?.trim() || "";
  return {
    provider: "Paystack",
    environment: secret.startsWith("sk_test_") ? "test" : secret.startsWith("sk_live_") ? "live" : "not configured",
    secretKeyConfigured: Boolean(secret),
    publicKeyConfigured: publicKey.startsWith("pk_test_") || publicKey.startsWith("pk_live_"),
    currency: "GHS",
    active: paymentMode() === "paystack",
  };
};

export const checkPaystackConfig = () => {
  const key = secretKey();
  if (!key) console.warn("Test_Secret_Key is not set in backend/.env: online payments are disabled.");
  else if (!key.startsWith("sk_test_")) console.warn("Test_Secret_Key is not a Paystack TEST key (sk_test_...): online payments are disabled.");
};

export const paystack = async (path, options = {}) => {
  const response = await fetch(`${PAYSTACK}${path}`, {
    ...options,
    signal: options.signal || AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${secretKey()}`, "Content-Type": "application/json" },
  });
  return response.json();
};

// Signatures cover the exact bytes Paystack sent, before JSON parsing.
export const validPaystackSignature = (body, signature) => {
  if (!Buffer.isBuffer(body) || typeof signature !== "string" || !/^[a-f\d]{128}$/i.test(signature) || !secretKey()) return false;
  const expected = crypto.createHmac("sha512", secretKey()).update(body).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, "hex"));
};

// Unique payment reference, e.g. HB-LX2K9A-3F9A1C (prefix tells subscriptions and rentals apart)
export const newReference = (prefix = "HB") =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

// GHS -> pesewas: Paystack amounts are always in the currency's subunit
export const toSubunit = (amount) => Math.round(amount * 100);

const STILL_PROCESSING = ["ongoing", "pending", "processing", "queued"];

/**
 * "paid" | "pending" | "failed" for one transaction, as Paystack itself reports it.
 * "paid" also requires the exact reference and at least the expected amount in GHS.
 * Abandoned checkouts count as failed (retryable); they are re-checked later in case
 * the customer still completes them.
 */
export const paystackPaymentStatus = async (reference, amount) => {
  const result = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
  const tx = result.data;
  if (!result.status || !tx) return "failed";
  if (tx.status === "success") return tx.reference === reference && tx.amount >= toSubunit(amount) && tx.currency === "GHS" ? "paid" : "failed";
  return STILL_PROCESSING.includes(tx.status) ? "pending" : "failed";
};

// Asks Paystack whether this exact transaction succeeded for at least the expected amount (GHS)
export const isPaystackPaid = async (reference, amount) => {
  const result = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
  const tx = result.data;
  return Boolean(result.status && tx?.status === "success" && tx.reference === reference && tx.amount >= toSubunit(amount) && tx.currency === "GHS");
};
