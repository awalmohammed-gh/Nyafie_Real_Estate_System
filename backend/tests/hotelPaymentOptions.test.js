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

test("every stay can be booked without paying online: pay at the hotel or on arrival is always on", () => {
  assert.deepEqual(stayBookingSettings({ propertyType: "Hotel", ownerType: "agent" }), { payOnArrival: true, payOnline: true, arrivalDeadline: "18:00", cancellationPolicy: "" });
  assert.deepEqual(stayBookingSettings(nightly()), { payOnArrival: true, payOnline: false, arrivalDeadline: "18:00", cancellationPolicy: "" }, "short stays are paid on arrival");
  assert.equal(stayBookingSettings(agentHotel({ payOnArrival: false, payOnline: true })).payOnArrival, true, "an older online-only hotel takes pay-at-hotel bookings again");
  assert.equal(stayBookingSettings(nightly({ payOnline: true })).payOnline, false, "older per-night settings no longer take money online");
  assert.equal(stayBookingSettings({ ...agentHotel({ payOnline: true }), ownerType: "admin" }).payOnline, false, "NyaFie's own hotels never take money online");
  assert.equal(takesStayBookings({ propertyType: "hotel" }), true);
  assert.equal(takesStayBookings(nightly()), true);
  assert.equal(takesStayBookings({ ...nightly(), pricePeriod: "month" }), false, "monthly rent is paid at the office");
  assert.equal(takesStayBookings({ ...nightly(), listingType: "Sale" }), false);
});

test("only an agent hotel may add online payment; settings are corrected, never stored as online-only", () => {
  const hotel = { propertyType: "Hotel", ownerType: "agent" };
  assert.deepEqual(parseStayBooking({ payOnline: true, arrivalDeadline: "14:30", cancellationPolicy: "  Free until the day before.  " }, hotel), { payOnArrival: true, payOnline: true, arrivalDeadline: "14:30", cancellationPolicy: "Free until the day before." });
  assert.equal(parseStayBooking({ payOnArrival: false }, hotel).payOnArrival, true, "pay at the hotel can't be switched off");
  assert.equal(parseStayBooking({ payOnline: true }, nightly()).payOnline, false, "short stays: on arrival only");
  assert.equal(parseStayBooking({ payOnline: true }, { ...hotel, ownerType: "admin" }).payOnline, false, "NyaFie's own hotels: at the hotel only");
  for (const bad of [{ payOnArrival: "yes" }, { arrivalDeadline: "24:00" }, { arrivalDeadline: "6pm" }, { cancellationPolicy: "x".repeat(801) }, null, []]) {
    assert.throws(() => parseStayBooking(bad, hotel), { status: 400 }, JSON.stringify(bad));
  }
});

test("NyaFie's account never receives online payments: short stays and its own hotels can't be paid online", () => withPaystack(() => {
  assert.equal(stayPaymentOptions(nightly({ payOnline: true }), null, settings).online, false);
  assert.equal(stayPaymentOptions(nightly(), null, settings).onArrival, true);
  assert.match(stayPaymentOptions(nightly(), null, settings).onlineProblem, /takes payment on arrival/);
  assert.equal(stayPaymentOptions({ ...agentHotel({ payOnline: true }), ownerType: "admin" }, null, settings).online, false);
}));

test("a hotel offers both ways from the start: online payment opens once its payout account is connected", () => withPaystack(() => {
  const hotel = agentHotel(undefined);
  const before = stayPaymentOptions(hotel, null, settings);
  assert.deepEqual([before.onArrival, before.onlineOffered, before.online], [true, true, false]);
  assert.match(before.onlineProblem, /setting up online payments/);
  const ready = stayPaymentOptions(hotel, { subaccountCode: "ACCT_x" }, settings);
  assert.deepEqual([ready.onArrival, ready.onlineOffered, ready.online], [true, true, true]);
  assert.equal(stayPaymentOptions(agentHotel({ payOnline: false }), { subaccountCode: "ACCT_x" }, settings).onlineOffered, false, "a hotel that switched it off stays off");
  assert.equal(stayPaymentOptions({ ...hotel, ownerType: "admin" }, null, settings).onlineOffered, false);
  assert.equal(stayPaymentOptions(nightly(), null, settings).onlineOffered, false);
}));

test("online payment needs the hotel's payout account (agent hotels) and working payments", () => withPaystack(() => {
  const online = agentHotel({ payOnArrival: true, payOnline: true });
  assert.equal(stayPaymentOptions(online, null, settings).online, false);
  assert.match(stayPaymentOptions(online, null, settings).onlineProblem, /setting up online payments/);
  assert.equal(stayPaymentOptions(online, { subaccountCode: "ACCT_x" }, settings).online, true);
  assert.equal(stayPaymentOptions(online, { subaccountCode: "ACCT_x" }, settings).onArrival, true, "guests can still pay at the hotel");
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
