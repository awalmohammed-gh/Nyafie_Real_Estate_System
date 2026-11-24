import PayoutAccount from "../models/PayoutAccount.js";
import { HttpError } from "./response.js";
import { paymentEnvironment, paymentMode, paystack } from "./paystack.js";

/**
 * How guests pay for a stay (hotels, and rentals priced per night). NyaFie never holds customers'
 * money, so a stay can always be booked without paying online:
 *
 *  - Pay at the hotel / on arrival (always offered): the guest reserves (the rooms or dates are
 *    held), says when they're arriving, and shows their booking code when they arrive and pay.
 *  - Pay online (agent hotels only, if the hotel switches it on): Paystack checkout settled straight
 *    to the hotel's own bank account or mobile money wallet through a Paystack subaccount (the hotel
 *    bears Paystack's fee; NyaFie takes no share and never holds the money). Not offered for NyaFie's
 *    own hotels or for per-night rentals, whose online payments would go to NyaFie's account.
 */

// Every stay can be booked and paid on arrival; only an agent hotel may add online payment
export const STAY_BOOKING_DEFAULTS = Object.freeze({ payOnArrival: true, payOnline: false, arrivalDeadline: "18:00", cancellationPolicy: "" });
export const NIGHTLY_RENTAL_DEFAULTS = STAY_BOOKING_DEFAULTS;
// Online payment goes to the hotel's own account: only hotels listed by an agent can offer it
export const takesOnlinePayment = (property) => hotelListing(property) && property?.ownerType !== "admin";
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// (utils/hotel.js imports this file, so hotels are recognised here without importing it back)
const hotelListing = (property) => String(property?.propertyType || "").toLowerCase() === "hotel";
// Listings whose guests choose how to pay: hotels and rentals priced per night
export const takesStayBookings = (property) => hotelListing(property) || (property?.listingType === "Rent" && property?.pricePeriod === "night");

// The listing's saved options, with defaults for listings saved before the options existed
export const stayBookingSettings = (property) => {
  const saved = property?.stayBooking?.toObject?.() || property?.stayBooking || {};
  const defaults = hotelListing(property) ? STAY_BOOKING_DEFAULTS : NIGHTLY_RENTAL_DEFAULTS;
  return {
    payOnArrival: true, // always: booking never requires paying online (older "online only" settings included)
    payOnline: takesOnlinePayment(property) && (typeof saved.payOnline === "boolean" ? saved.payOnline : defaults.payOnline),
    arrivalDeadline: TIME.test(saved.arrivalDeadline || "") ? saved.arrivalDeadline : STAY_BOOKING_DEFAULTS.arrivalDeadline,
    cancellationPolicy: typeof saved.cancellationPolicy === "string" ? saved.cancellationPolicy : "",
  };
};

// Validates the editor's { payOnArrival, payOnline, arrivalDeadline, cancellationPolicy }.
// `property` gives the listing kind and its saved options ({ propertyType, listingType, pricePeriod, stayBooking }).
export const parseStayBooking = (input, property) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "Invalid payment options.");
  const next = { ...stayBookingSettings(property) };
  for (const key of ["payOnArrival", "payOnline"]) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== "boolean") throw new HttpError(400, "Payment options must be true or false.");
    next[key] = input[key];
  }
  // Booking never requires paying online, and only an agent hotel's own account may receive online
  // payments (never NyaFie's). Older saved settings are corrected rather than refused, so owners can
  // keep editing their listings.
  next.payOnArrival = true;
  if (!takesOnlinePayment(property)) next.payOnline = false;
  if (input.arrivalDeadline !== undefined) {
    if (typeof input.arrivalDeadline !== "string" || !TIME.test(input.arrivalDeadline)) throw new HttpError(400, "Enter the arrival deadline as a time, e.g. 18:00.");
    next.arrivalDeadline = input.arrivalDeadline;
  }
  if (input.cancellationPolicy !== undefined) {
    if (typeof input.cancellationPolicy !== "string" || input.cancellationPolicy.trim().length > 800) throw new HttpError(400, "Keep the cancellation and no-show policy under 800 characters.");
    next.cancellationPolicy = input.cancellationPolicy.trim();
  }
  if (!next.payOnArrival && !next.payOnline) throw new HttpError(400, "Choose at least one way for guests to pay.");
  return next;
};

// Ghana keeps GMT all year, so local time is UTC
export const arrivalDeadlineFor = (checkIn, time) => new Date(`${new Date(checkIn).toISOString().slice(0, 10)}T${time}:00Z`);

// The hotel's payout account for the current Paystack environment, or null
// How long a new or changed payout account waits before it receives online payments. If someone
// takes over an owner's account and redirects the hotel's money, the owner (alerted by email and in
// the app) and the admins have this long to stop it; meanwhile payments keep going to the old account.
export const PAYOUT_HOLD_MS = 48 * 60 * 60 * 1000;
export const payoutHoldEnds = (now = new Date()) => new Date(now.getTime() + PAYOUT_HOLD_MS);

/**
 * The hotel's payout account (or null). A pending change whose hold is over replaces the current account
 * here, the first time anyone reads it afterwards (atomically, so two readers can't both do it).
 */
export const payoutAccountFor = async (property, { session, now = new Date() } = {}) => {
  const environment = paymentEnvironment();
  if (!environment || property.ownerType !== "agent" || !hotelListing(property)) return null;
  const payout = await PayoutAccount.findOne({ property: property._id, environment }).session(session || null);
  if (!payout?.pending || payout.pending.activeFrom > now) return payout;
  const { requestedAt, activeFrom, ...next } = payout.pending.toObject ? payout.pending.toObject() : payout.pending;
  const promoted = await PayoutAccount.findOneAndUpdate(
    { _id: payout._id, "pending.subaccountCode": next.subaccountCode },
    { $set: { ...next, connectedAt: requestedAt, activeFrom }, $unset: { pending: 1 } },
    { returnDocument: "after", session: session || null },
  );
  return promoted || PayoutAccount.findOne({ property: property._id, environment }).session(session || null);
};

// Whether the account can receive online payments yet (accounts from before the hold have no activeFrom)
export const payoutActive = (payout, now = new Date()) => Boolean(payout) && !(payout.activeFrom > now);

/**
 * What a guest can choose for this listing right now, with the reason online payment is missing.
 * `payout` is the hotel's PayoutAccount (or null); `settings` the platform settings.
 */
export const stayPaymentOptions = (property, payout, settings) => {
  const options = stayBookingSettings(property);
  const hotel = hotelListing(property);
  let onlineProblem = "";
  if (!options.payOnline) onlineProblem = `This ${hotel ? "hotel" : "listing"} takes payment ${hotel ? "at the hotel" : "on arrival"}.`;
  else if (paymentMode() === "disabled" || settings?.payments?.rentalsEnabled === false || property.currency !== "GHS") onlineProblem = "Online payments are unavailable right now.";
  else if (hotel && property.ownerType === "agent" && !payout) onlineProblem = "This hotel hasn't finished setting up online payments.";
  else if (hotel && property.ownerType === "agent" && !payoutActive(payout)) onlineProblem = "This hotel's online payments are being set up and start soon.";
  return {
    onArrival: options.payOnArrival,
    online: !onlineProblem,
    onlineProblem: onlineProblem || null,
    arrivalDeadline: options.arrivalDeadline,
    cancellationPolicy: options.cancellationPolicy,
  };
};

// Public summary of a payout account: never the full account number or the subaccount code
export const presentPayout = (payout) => payout ? {
  connected: true,
  type: payout.type,
  bankName: payout.bankName,
  accountName: payout.accountName,
  accountLast4: payout.accountLast4,
  environment: payout.environment,
  connectedAt: payout.connectedAt,
  activeFrom: payout.activeFrom || null, // a new account: online payments start then
  pending: payout.pending ? { type: payout.pending.type, bankName: payout.pending.bankName, accountName: payout.pending.accountName, accountLast4: payout.pending.accountLast4, requestedAt: payout.pending.requestedAt, activeFrom: payout.pending.activeFrom } : null,
} : { connected: false };

// Paystack's Ghana settlement banks ("ghipss") and mobile money networks, cached for 6 hours
const BANK_TYPES = { bank: "ghipss", mobile_money: "mobile_money" };
const BANKS_TTL = 6 * 60 * 60 * 1000;
const bankCache = new Map();
export const clearBankCache = () => bankCache.clear();
export const settlementBanks = async (type) => {
  if (!BANK_TYPES[type]) throw new HttpError(400, "Choose a bank account or a mobile money wallet.");
  const cached = bankCache.get(type);
  if (cached && cached.until > Date.now()) return cached.banks;
  let result;
  try { result = await paystack(`/bank?country=ghana&currency=GHS&type=${BANK_TYPES[type]}`); }
  catch { throw new HttpError(502, "Couldn't load the list of banks. Please try again."); }
  if (!result?.status || !Array.isArray(result.data)) throw new HttpError(502, "Couldn't load the list of banks. Please try again.");
  const banks = result.data
    .filter((bank) => bank && bank.active !== false && bank.code && bank.name)
    .map((bank) => ({ code: String(bank.code).slice(0, 40), name: String(bank.name).slice(0, 120) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  bankCache.set(type, { banks, until: Date.now() + BANKS_TTL });
  return banks;
};
