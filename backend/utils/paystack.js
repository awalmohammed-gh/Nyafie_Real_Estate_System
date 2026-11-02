import crypto from "crypto";

const PAYSTACK = "https://api.paystack.co";

// Server-only Paystack configuration (never sent to the browser):
//   PAYSTACK_MODE        "test" (default) or "live". Live must be chosen deliberately.
//   PAYSTACK_SECRET_KEY  sk_test_... for test mode, sk_live_... for live mode
//   PAYSTACK_PUBLIC_KEY  matching pk_ key, for the admin configuration summary
// The older Test_Secret_Key / Test_Public_Key variables still work, for test mode only.
const configuredMode = () => (process.env.PAYSTACK_MODE?.trim().toLowerCase() || "test");
const secretKey = () => process.env.PAYSTACK_SECRET_KEY?.trim() || process.env.Test_Secret_Key?.trim() || "";
const publicKey = () => process.env.PAYSTACK_PUBLIC_KEY?.trim() || process.env.Test_Public_Key?.trim() || "";

/**
 * Why live payments are not available yet; empty when live mode can take real money.
 * Real money needs a dedicated live key and the scheduled recovery job, so a missed
 * webhook or closed tab cannot leave a customer charged without the booking or plan.
 */
export const liveBlockers = () => {
  const blockers = [];
  if (!process.env.PAYSTACK_SECRET_KEY?.trim().startsWith("sk_live_")) blockers.push("PAYSTACK_SECRET_KEY must be a Paystack live secret key (sk_live_...).");
  if ((process.env.CRON_SECRET?.trim() || "").length < 32) blockers.push("CRON_SECRET (32+ characters) is required so scheduled payment and refund recovery can run.");
  return blockers;
};

/** "test" | "live" when Paystack can be used, otherwise null. A key never works in the other mode. */
export const paymentEnvironment = () => {
  const mode = configuredMode();
  if (mode === "test") return secretKey().startsWith("sk_test_") ? "test" : null;
  if (mode === "live") return liveBlockers().length ? null : "live";
  return null;
};

// "paystack" when the configured mode is usable, otherwise "disabled".
export const paymentMode = () => (paymentEnvironment() ? "paystack" : "disabled");

// Safe summary for the admin Payment settings: which keys are configured, never their values
export const paymentStatus = () => {
  const mode = configuredMode();
  const secret = secretKey();
  const environment = paymentEnvironment();
  const prefix = mode === "live" ? "live" : "test";
  return {
    provider: "Paystack",
    mode: ["test", "live"].includes(mode) ? mode : "invalid",
    environment: environment || "not configured",
    secretKeyConfigured: secret.startsWith(`sk_${prefix}_`),
    publicKeyConfigured: publicKey().startsWith(`pk_${prefix}_`),
    liveBlockers: mode === "live" ? liveBlockers() : [],
    currency: "GHS",
    active: Boolean(environment),
  };
};

export const checkPaystackConfig = () => {
  const mode = configuredMode();
  if (!["test", "live"].includes(mode)) return console.warn(`PAYSTACK_MODE must be "test" or "live" (got "${mode}"): online payments are disabled.`);
  if (mode === "live") {
    const blockers = liveBlockers();
    if (blockers.length) console.warn(`Paystack live mode is not ready, so online payments are disabled: ${blockers.join(" ")}`);
    else console.warn("Paystack LIVE mode is active: checkouts charge real money.");
    return;
  }
  const key = secretKey();
  if (!key) console.warn("PAYSTACK_SECRET_KEY is not set: online payments are disabled.");
  else if (!key.startsWith("sk_test_")) console.warn("PAYSTACK_MODE is test but the secret key is not a Paystack TEST key (sk_test_...): online payments are disabled.");
};

/**
 * MongoDB filter for records that belong to the current Paystack environment. Records made
 * before environments were stored are test-mode records: only test keys were accepted then.
 * Records not processed by Paystack (office sales, admin plans) are always included.
 */
export const providerScope = (methodField = "method") => {
  const environment = paymentEnvironment() || "test";
  return { $or: [{ [methodField]: { $ne: "Paystack" } }, { environment }, ...(environment === "test" ? [{ environment: null }] : [])] };
};

// Whether a Paystack record can be checked or refunded with the configured key
export const inCurrentEnvironment = (record) => (record.environment || "test") === paymentEnvironment();

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

// A transaction from the other environment (test vs live) can never pay for anything here
const sameDomain = (tx) => !tx.domain || tx.domain === paymentEnvironment();

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
  if (tx.status === "success") return tx.reference === reference && tx.amount >= toSubunit(amount) && tx.currency === "GHS" && sameDomain(tx) ? "paid" : "failed";
  return STILL_PROCESSING.includes(tx.status) ? "pending" : "failed";
};

// Asks Paystack whether this exact transaction succeeded for at least the expected amount (GHS)
export const isPaystackPaid = async (reference, amount) => {
  const result = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
  const tx = result.data;
  return Boolean(result.status && tx?.status === "success" && tx.reference === reference && tx.amount >= toSubunit(amount) && tx.currency === "GHS" && sameDomain(tx));
};

// Paystack refund statuses (docs: pending, processing, processed, failed; needs-attention when
// Paystack needs the customer's account details). Anything unrecognised is treated as unknown.
export const REFUND_STATUSES = ["pending", "processing", "needs-attention", "processed", "failed"];

/**
 * Queues a refund of `amount` GHS for one transaction. Returns { accepted, id, status, message }.
 * Throws on network errors and timeouts: the refund may or may not have been queued, so the
 * caller must never send it again blindly.
 */
export const createPaystackRefund = async (reference, amount, merchantNote) => {
  const result = await paystack("/refund", {
    method: "POST",
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ transaction: reference, amount: toSubunit(amount), currency: "GHS", merchant_note: merchantNote?.slice(0, 200) || undefined }),
  });
  const data = result.data;
  if (!result.status || !data) return { accepted: false, message: result.message || "Paystack did not accept the refund." };
  const sameTransaction = typeof data.transaction !== "object" || !data.transaction || data.transaction.reference === reference;
  if (!sameTransaction || data.amount !== toSubunit(amount) || (data.currency && data.currency !== "GHS")) {
    // Accepted, but not for what we asked: keep it for an admin to check instead of trusting it
    return { accepted: true, id: data.id != null ? String(data.id) : null, status: null, message: "Paystack's refund response did not match this payment. Check it in the Paystack dashboard." };
  }
  return { accepted: true, id: data.id != null ? String(data.id) : null, status: REFUND_STATUSES.includes(data.status) ? data.status : null };
};

/** The current status of a refund Paystack accepted, or null if it cannot be confirmed. */
export const fetchPaystackRefund = async (id, amount) => {
  const result = await paystack(`/refund/${encodeURIComponent(id)}`);
  const data = result.data;
  if (!result.status || !data || String(data.id) !== String(id) || data.amount !== toSubunit(amount)) return null;
  return REFUND_STATUSES.includes(data.status) ? data.status : null;
};
