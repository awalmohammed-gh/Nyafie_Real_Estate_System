import mongoose from "mongoose";
import Property from "../models/Property.js";
import PayoutAccount from "../models/PayoutAccount.js";
import User from "../models/User.js";
import { isHotel } from "../utils/hotel.js";
import { payoutAccountFor, presentPayout, settlementBanks } from "../utils/hotelPayout.js";
import { paymentEnvironment, paystack } from "../utils/paystack.js";
import { notifyUser } from "../utils/notify.js";
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
  const existing = await PayoutAccount.findOne({ property: property._id, environment });
  // Percentage 0: NyaFie keeps nothing. Checkout makes the hotel bear Paystack's fee.
  const body = { business_name: property.title.slice(0, 100), settlement_bank: bank.code, account_number: accountNumber, percentage_charge: 0, description: `NyaFie hotel ${property._id}` };
  let result;
  try {
    result = await paystack(existing ? `/subaccount/${encodeURIComponent(existing.subaccountCode)}` : "/subaccount", { method: existing ? "PUT" : "POST", body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  } catch {
    return fail(res, 502, "Couldn't reach Paystack to check this account. Please try again.");
  }
  const code = result?.data?.subaccount_code || existing?.subaccountCode;
  if (!result?.status || !code) {
    // Paystack's reason (e.g. the account could not be resolved) helps the owner fix it
    const reason = typeof result?.message === "string" ? result.message.slice(0, 160) : "";
    return fail(res, 400, `Paystack couldn't verify this account.${reason ? ` ${reason}` : ""}`);
  }
  const payout = await PayoutAccount.findOneAndUpdate(
    { property: property._id, environment },
    {
      $set: {
        owner: property.owner, type, bankCode: bank.code, bankName: bank.name,
        accountName: String(result.data?.account_name || result.data?.business_name || "").slice(0, 160),
        accountLast4: accountNumber.slice(-4), subaccountCode: code, connectedBy: req.user._id, connectedAt: new Date(),
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
  // A changed payout account is the first thing to check if money goes astray: always say so
  await notifyUser(req.user._id, { type: "payment", title: "Hotel payout account updated", message: `Online payments for "${property.title}" now go to ${bank.name} ending ${payout.accountLast4}. If you didn't make this change, change your password and contact support.`, link: `/agent/properties/${property._id}/edit` });
  ok(res, { ...presentPayout(payout), available: true }, "Payout account connected");
};

// DELETE /api/properties/:id/payout -> online payment stops until an account is connected again
export const disconnectHotelPayout = async (req, res) => {
  const property = await loadOwnHotel(req);
  const environment = paymentEnvironment();
  if (environment) await PayoutAccount.deleteOne({ property: property._id, environment });
  await notifyUser(req.user._id, { type: "payment", title: "Hotel payout account removed", message: `Guests can no longer pay online for "${property.title}" until you connect a payout account.`, link: `/agent/properties/${property._id}/edit` });
  ok(res, { connected: false, available: Boolean(environment) }, "Payout account removed");
};
