import { test } from "node:test";
import assert from "node:assert/strict";
import { arrivalDeadlineFor, stayBookingSettings, stayPaymentOptions, parseStayBooking, presentPayout, takesStayBookings } from "../utils/hotelPayout.js";

const withPaystack = (fn) => {
  const saved = { mode: process.env.PAYSTACK_MODE, key: process.env.PAYSTACK_SECRET_KEY };
  process.env.PAYSTACK_MODE = "test"; process.env.PAYSTACK_SECRET_KEY = "sk_test_unit";
  try { return fn(); } finally {
    for (const [name, value] of [["PAYSTACK_MODE", saved.mode], ["PAYSTACK_SECRET_KEY", saved.key]]) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
};
const settings = { payments: { rentalsEnabled: true } };
const agentHotel = (stayBooking) => ({ propertyType: "Hotel", listingType: "Rent", pricePeriod: "night", ownerType: "agent", currency: "GHS", stayBooking });

const nightly = (stayBooking) => ({ propertyType: "Apartment", listingType: "Rent", pricePeriod: "night", ownerType: "agent", currency: "GHS", stayBooking });

test("listings saved before payment options existed: hotels pay at the hotel, per-night rentals offer both", () => {
  assert.deepEqual(stayBookingSettings({ propertyType: "Hotel" }), { payOnArrival: true, payOnline: false, arrivalDeadline: "18:00", cancellationPolicy: "" });
  assert.deepEqual(stayBookingSettings(nightly()), { payOnArrival: true, payOnline: true, arrivalDeadline: "18:00", cancellationPolicy: "" }, "per-night rentals already took online payments");
  assert.equal(takesStayBookings({ propertyType: "hotel" }), true);
  assert.equal(takesStayBookings(nightly()), true);
  assert.equal(takesStayBookings({ ...nightly(), pricePeriod: "month" }), false, "monthly rentals keep the online checkout");
  assert.equal(takesStayBookings({ ...nightly(), listingType: "Sale" }), false);
});

test("owners choose options; at least one stays on and the deadline is a real time", () => {
  const hotel = { propertyType: "Hotel" };
  assert.deepEqual(parseStayBooking({ payOnline: true, arrivalDeadline: "14:30", cancellationPolicy: "  Free until the day before.  " }, hotel), { payOnArrival: true, payOnline: true, arrivalDeadline: "14:30", cancellationPolicy: "Free until the day before." });
  assert.equal(parseStayBooking({ payOnArrival: false }, { ...hotel, stayBooking: { payOnArrival: true, payOnline: true } }).payOnline, true, "keeps what isn't sent");
  assert.deepEqual(parseStayBooking({ payOnArrival: false }, nightly()), { payOnArrival: false, payOnline: true, arrivalDeadline: "18:00", cancellationPolicy: "" }, "a per-night rental can go back to online only");
  for (const bad of [{ payOnArrival: false }, { payOnArrival: "yes" }, { arrivalDeadline: "24:00" }, { arrivalDeadline: "6pm" }, { cancellationPolicy: "x".repeat(801) }, null, []]) {
    assert.throws(() => parseStayBooking(bad, hotel), { status: 400 }, JSON.stringify(bad));
  }
  assert.throws(() => parseStayBooking({ payOnArrival: false, payOnline: false }, nightly()), { status: 400 });
});

test("per-night rentals: online payment needs no payout account (the existing rental checkout)", () => withPaystack(() => {
  assert.equal(stayPaymentOptions(nightly(), null, settings).online, true);
  assert.equal(stayPaymentOptions(nightly(), null, settings).onArrival, true);
  assert.match(stayPaymentOptions(nightly({ payOnline: false }), null, settings).onlineProblem, /This listing takes payment on arrival/);
}));

test("online payment needs the hotel's payout account (agent hotels) and working payments", () => withPaystack(() => {
  const online = agentHotel({ payOnArrival: true, payOnline: true });
  assert.equal(stayPaymentOptions(online, null, settings).online, false);
  assert.match(stayPaymentOptions(online, null, settings).onlineProblem, /setting up online payments/);
  assert.equal(stayPaymentOptions(online, { subaccountCode: "ACCT_x" }, settings).online, true);
  assert.equal(stayPaymentOptions({ ...online, ownerType: "admin" }, null, settings).online, true, "the platform's own hotels use the main account");
  assert.equal(stayPaymentOptions(online, { subaccountCode: "ACCT_x" }, { payments: { rentalsEnabled: false } }).online, false);
  assert.equal(stayPaymentOptions({ ...online, currency: "USD" }, { subaccountCode: "ACCT_x" }, settings).online, false);
  assert.equal(stayPaymentOptions(agentHotel({ payOnline: false }), { subaccountCode: "ACCT_x" }, settings).online, false, "the owner switched it off");
}));

test("arrival deadline is on the check-in day in Ghana time; payout summaries hide account details", () => {
  assert.equal(arrivalDeadlineFor(new Date("2030-01-01T00:00:00Z"), "14:00").toISOString(), "2030-01-01T14:00:00.000Z");
  const summary = presentPayout({ type: "bank", bankName: "Bank", accountName: "HOTEL", accountLast4: "8901", subaccountCode: "ACCT_secret", bankCode: "B1", environment: "test", connectedAt: new Date(0) });
  assert.equal(JSON.stringify(summary).includes("ACCT_secret"), false);
  assert.equal(summary.accountLast4, "8901");
  assert.deepEqual(presentPayout(null), { connected: false });
});
