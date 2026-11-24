import mongoose from "mongoose";
import Property from "../models/Property.js";
import PayoutAccount from "../models/PayoutAccount.js";
import User from "../models/User.js";
import { isHotel } from "../utils/hotel.js";
import { payoutAccountFor, payoutActive, payoutHoldEnds, presentPayout, settlementBanks } from "../utils/hotelPayout.js";
import { paymentEnvironment, paystack } from "../utils/paystack.js";
import { notifyAdmins, notifyUser } from "../utils/notify.js";
import { payoutAlertMailer } from "../utils/email.js";
import { reportError } from "../utils/monitoring.js";

const WHEN = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" });

/**
 * Every payout change reaches the account owner in the app and by email (a hijacked session can't
 * hide it there), and the admins as a critical alert. Email is best effort: the change is saved either way.
 */
const alertPayoutChange = async (property, { title, message }) => {
  const link = `/agent/properties/${property._id}/edit`;
  await Promise.all([
    notifyUser(property.owner, { type: "payment", title, message, link }),
    notifyAdmins({ critical: true, type: "payment", title: `Hotel payout: ${title.toLowerCase()}`, message: `"${property.title}": ${message}`, link: "/admin/properties" }),
  ]);
  try {
    const owner = await User.findById(property.owner).select("email").lean();
    if (owner?.email) await payoutAlertMailer.send(owner.email, { title, message, hotel: property.title });
  } catch (error) {
    console.error("Payout alert email failed:", error.message);
    await reportError(error, { tags: { area: "payout-alert-email" } });
  }
};
import { same } from "../utils/ownership.js";
import { HttpError, ok, fail } from "../utils/response.js";

/**
 * A hotel's payout account: where its online payments are settled.
 * Only the account owner (the agent, or the agency's owner) may see or change it: staff can
 * manage bookings but never redirect the money. Changing it needs the owner's password.
 */
const loadOwnHotel = async (req) => {
  const property = mongoose.isValidObjectId(req.params.id) ? await Property.findById(req.params.id).select("title propertyType ownerType owner") : null;
  if (!property || !isHotel(property)) throw new HttpError(404, "Hotel not found.");
  if (property.ownerType !== "agent" || !same(property.owner, req.user)) throw new HttpError(403, "Only the account owner can manage where this hotel's payments go.");
  return property;
};

const needsPaystack = () => {
  if (!paymentEnvironment()) throw new HttpError(503, "Online payments are not set up on the platform yet, so payout accounts can't be connected.");
};

// GET /api/properties/payout-banks?type=bank|mobile_money
export const payoutBanks = async (req, res) => {
  needsPaystack();
  ok(res, await settlementBanks(String(req.query.type || "")));
};

// GET /api/properties/:id/payout
export const getHotelPayout = async (req, res) => {
  const property = await loadOwnHotel(req);
  ok(res, { ...presentPayout(await payoutAccountFor(property)), available: Boolean(paymentEnvironment()) });
};

// PUT /api/properties/:id/payout { type, bankCode, accountNumber, password }
export const connectHotelPayout = async (req, res) => {
  const property = await loadOwnHotel(req);
  needsPaystack();
  const { type, bankCode, password } = req.body || {};
  const accountNumber = String(req.body?.accountNumber ?? "").replace(/[\s-]/g, "");
  const owner = await User.findById(req.user._id).select("+password");
  if (!owner?.password || typeof password !== "string" || !(await owner.matchPassword(password))) return fail(res, 400, "Your password is incorrect.");
  if (type === "mobile_money" ? !/^0\d{9}$/.test(accountNumber) : !/^\d{6,20}$/.test(accountNumber)) {
    return fail(res, 400, type === "mobile_money" ? "Enter the 10-digit mobile money number, e.g. 0241234567." : "Enter the account number using digits only.");
  }
  const bank = (await settlementBanks(type)).find((item) => item.code === bankCode);
  if (!bank) return fail(res, 400, type === "mobile_money" ? "Choose the mobile money network." : "Choose the bank.");

  const environment = paymentEnvironment();
  const existing = await payoutAccountFor(property);
  // Always a new Paystack subaccount: the current one keeps receiving payments while a change waits
  // out its hold (editing the current subaccount would move the money at once)
  const body = { business_name: property.title.slice(0, 100), settlement_bank: bank.code, account_number: accountNumber, percentage_charge: 0, description: `NyaFie hotel ${property._id}` };
  let result;
  try {
    result = await paystack("/subaccount", { method: "POST", body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  } catch {
    return fail(res, 502, "Couldn't reach Paystack to check this account. Please try again.");
  }
  const code = result?.data?.subaccount_code;
  if (!result?.status || !code) {
    // Paystack's reason (e.g. the account could not be resolved) helps the owner fix it
    const reason = typeof result?.message === "string" ? result.message.slice(0, 160) : "";
    return fail(res, 400, `Paystack couldn't verify this account.${reason ? ` ${reason}` : ""}`);
  }
  const now = new Date();
  const activeFrom = payoutHoldEnds(now);
  const account = {
    type, bankCode: bank.code, bankName: bank.name,
    accountName: String(result.data?.account_name || result.data?.business_name || "").slice(0, 160),
    accountLast4: accountNumber.slice(-4), subaccountCode: code, connectedBy: req.user._id,
  };
  // An account already receiving payments: the change waits as "pending". Otherwise (no account, or
  // one still on hold that has never received anything) the new account replaces it, on a fresh hold.
  const change = payoutActive(existing, now);
  const payout = change
    ? await PayoutAccount.findOneAndUpdate({ _id: existing._id }, { $set: { pending: { ...account, requestedAt: now, activeFrom } } }, { returnDocument: "after" })
    : await PayoutAccount.findOneAndUpdate(
      { property: property._id, environment },
      { $set: { owner: property.owner, ...account, connectedAt: now, activeFrom }, $unset: { pending: 1 } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );
  const target = `${bank.name} ending ${account.accountLast4}`;
  await alertPayoutChange(property, change
    ? { title: "Payout account change requested", message: `Online payments for "${property.title}" will go to ${target} from ${WHEN.format(activeFrom)} (Ghana time). Until then they keep going to ${existing.bankName} ending ${existing.accountLast4}. If you didn't ask for this, cancel the change, change your password and contact support now.` }
    : { title: "Payout account connected", message: `Online payments for "${property.title}" will go to ${target} from ${WHEN.format(activeFrom)} (Ghana time). Until then guests can pay at the hotel. If you didn't do this, remove it, change your password and contact support now.` });
  ok(res, { ...presentPayout(payout), available: true }, change ? "Change requested: it takes effect after the security hold" : "Payout account connected: online payments start after the security hold");
};

// DELETE /api/properties/:id/payout/pending -> the owner cancels a change before its hold ends
export const cancelPayoutChange = async (req, res) => {
  const property = await loadOwnHotel(req);
  const environment = paymentEnvironment();
  const payout = environment ? await PayoutAccount.findOneAndUpdate({ property: property._id, environment, pending: { $exists: true } }, { $unset: { pending: 1 } }, { returnDocument: "after" }) : null;
  if (!payout) return fail(res, 404, "There's no payout change waiting to be cancelled.");
  await alertPayoutChange(property, { title: "Payout account change cancelled", message: `Online payments for "${property.title}" keep going to ${payout.bankName} ending ${payout.accountLast4}.` });
  ok(res, { ...presentPayout(payout), available: true }, "Change cancelled");
};

// DELETE /api/properties/:id/payout -> online payment stops until an account is connected again
export const disconnectHotelPayout = async (req, res) => {
  const property = await loadOwnHotel(req);
  const environment = paymentEnvironment();
  if (environment) await PayoutAccount.deleteOne({ property: property._id, environment });
  await alertPayoutChange(property, { title: "Payout account removed", message: `Guests can no longer pay online for "${property.title}" until a payout account is connected again (after a 48-hour security hold). If you didn't do this, change your password and contact support now.` });
  ok(res, { connected: false, available: Boolean(environment) }, "Payout account removed");
};
