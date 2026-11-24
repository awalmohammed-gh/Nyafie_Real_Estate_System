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
 * Records not processed by Paystack (owner-confirmed sales, admin plans) are always included.
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

// GHS -> pesewas: Paystack amounts are always whole subunits. Amounts are stored in GHS with at most
// two decimals; rounding the scaled value removes binary floating-point error (1.15 * 100 = 114.999...).
export const toSubunit = (amount) => {
  const subunits = Math.round(Number(amount) * 100);
  if (!Number.isSafeInteger(subunits) || subunits < 0) throw new Error("Invalid payment amount.");
  return subunits;
};

const STILL_PROCESSING = ["ongoing", "pending", "processing", "queued"];

// A transaction from the other environment (test vs live) can never pay for anything here
const sameDomain = (tx) => !tx.domain || tx.domain === paymentEnvironment();

/**
 * One transaction, as Paystack's Verify Transaction API reports it, checked against the stored
 * record's reference and amount (never against anything the browser or a webhook sent).
 *   status "paid"     success, same reference and environment, GHS, exactly the expected amount
 *   status "mismatch" success, but a different amount or currency: money arrived, nothing may be
 *                     granted, and an administrator must review and refund it
 *   status "pending"  still processing (e.g. a mobile money prompt): retry later
 *   status "failed"   failed or abandoned (re-checked later in case the customer still pays)
 * Plus audit details: transactionId, channel, paidAmount (GHS charged), currency.
 * Paystack's `requested_amount` is the amount the checkout was started with; `amount` can be
 * higher only when the customer bears Paystack's fee, so that case still counts as exact.
 */
export const checkPaystackTransaction = async (reference, amount) => {
  const result = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
  const tx = result.data;
  if (!result.status || !tx || typeof tx !== "object") return { status: "failed" };
  const details = {
    transactionId: tx.id != null && /^\d{1,20}$/.test(String(tx.id)) ? String(tx.id) : null,
    channel: typeof tx.channel === "string" ? tx.channel.slice(0, 40) : null,
    paidAmount: Number.isSafeInteger(tx.amount) ? tx.amount / 100 : null,
    currency: typeof tx.currency === "string" ? tx.currency.slice(0, 3) : null,
  };
  if (tx.status !== "success") return { status: STILL_PROCESSING.includes(tx.status) ? "pending" : "failed", ...details };
  // Another record's or another environment's transaction can never pay for this one
  if (tx.reference !== reference || !sameDomain(tx)) return { status: "failed", ...details };
  const expected = toSubunit(amount);
  const exact = tx.currency === "GHS" && (tx.amount === expected || (tx.requested_amount === expected && Number.isSafeInteger(tx.amount) && tx.amount > expected));
  if (exact) return { status: "paid", ...details };
  return { status: "mismatch", ...details, problem: `Paystack reported ${details.currency || "?"} ${details.paidAmount ?? "?"} for this payment; GHS ${expected / 100} was expected. Nothing was granted.` };
};

// "paid" | "mismatch" | "pending" | "failed" (see checkPaystackTransaction)
export const paystackPaymentStatus = async (reference, amount) => (await checkPaystackTransaction(reference, amount)).status;

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

const date = (value) => (typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value) : null);
const word = (value) => (typeof value === "string" ? value.trim().slice(0, 60) : "");

/** One Paystack dispute (webhook data or API answer) in a safe shape, or null if it doesn't identify one. */
export const readPaystackDispute = (data) => {
  const reference = data?.transaction?.reference ?? data?.transaction_reference;
  if (!/^\d{1,20}$/.test(String(data?.id)) || typeof reference !== "string" || !reference.trim() || reference.length > 100) return null;
  return {
    id: String(data.id),
    reference,
    domain: word(data.domain || data.transaction?.domain),
    status: word(data.status),
    resolution: word(data.resolution),
    category: word(data.category),
    // GHS at stake; null when missing or in another currency
    amount: Number.isSafeInteger(data.refund_amount) && data.refund_amount > 0 && data.currency === "GHS" ? data.refund_amount / 100 : null,
    dueAt: date(data.dueAt),
    resolvedAt: date(data.resolvedAt),
  };
};

/** The current state of a dispute, or null if Paystack doesn't confirm it. Throws when it can't be reached. */
export const fetchPaystackDispute = async (id) => {
  const result = await paystack(`/dispute/${encodeURIComponent(id)}`);
  const dispute = result.status ? readPaystackDispute(result.data) : null;
  return dispute?.id === String(id) ? dispute : null;
};
