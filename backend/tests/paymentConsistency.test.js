import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Payment from "../models/Payment.js";
import Rental from "../models/Rental.js";
import Property from "../models/Property.js";
import Notification from "../models/Notification.js";
import Setting from "../models/Setting.js";
import User from "../models/User.js";
import { initializeRentalPayment, verifyPayment } from "../controllers/paymentController.js";
import { recordFailedRentalPayment } from "../utils/confirmRentalPayment.js";

const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

// Stage model saves per session and publish them only when the transaction commits.
// All reads are detached documents, so a failed save cannot mutate stored fixtures.
const fixture = (t, paymentStatus = "pending") => {
  const customer = new mongoose.Types.ObjectId(), owner = new mongoose.Types.ObjectId(), property = new mongoose.Types.ObjectId();
  const rental = new Rental({ customer, owner, property, ownerType: "agent", amount: 100, status: "payment_pending", paymentStatus: "pending", paymentReference: "HBR-consistency", startDate: new Date("2030-01-01"), endDate: new Date("2030-02-01"), pricePeriod: "month", unitPrice: 100, units: 1, contactName: "Test Guest", contactEmail: "guest@example.test", contactPhone: "0241234567" });
  const payment = new Payment({ rental: rental._id, customer, owner, property, ownerType: "agent", kind: "rental", amount: 100, method: "Paystack", reference: rental.paymentReference, status: paymentStatus });
  const stored = { rental: rental.toObject(), payment: payment.toObject() };
  let failSave = null, providerChecks = 0, providerStatus = "success", providerResponseStatus = true, onProvider;
  const notices = [];
  const query = (kind, Model) => {
    let session, populateProperty = false;
    const self = {
      session(value) { session = value; return self; },
      sort() { return self; },
      populate(path) { if (path === "property") populateProperty = true; return self; },
      then(resolve, reject) {
        const doc = new Model(session?.staged[kind] || stored[kind]);
        if (populateProperty) doc.property = null;
        return Promise.resolve(doc).then(resolve, reject);
      },
    };
    return self;
  };
  t.mock.method(mongoose.connection, "transaction", async (work) => {
    const session = { staged: {} };
    const result = await work(session);
    Object.assign(stored, session.staged);
    return result;
  });
  t.mock.method(Payment, "findOne", () => query("payment", Payment));
  t.mock.method(Payment, "findById", () => query("payment", Payment));
  t.mock.method(Rental, "findById", () => query("rental", Rental));
  for (const [kind, Model] of [["rental", Rental], ["payment", Payment]]) {
    t.mock.method(Model, "updateOne", async (filter, update) => {
      const doc = stored[kind];
      if (filter.status?.$in && !filter.status.$in.includes(doc.status)) return { matchedCount: 0 };
      if (typeof filter.status === "string" && filter.status !== doc.status) return { matchedCount: 0 };
      if ((filter.paymentStatus && filter.paymentStatus.$ne === doc.paymentStatus) || (filter.paymentReference && filter.paymentReference !== doc.paymentReference)) return { matchedCount: 0 };
      Object.assign(doc, update.$set || update);
      if (update.$push?.history) doc.history.push(update.$push.history);
      return { matchedCount: 1 };
    });
  }
  t.mock.method(Property, "findById", async () => null);
  t.mock.method(Property, "findOneAndUpdate", async (_filter, _update, { session }) => {
    assert.ok(session?.staged, "inventory lock must use the payment transaction");
    return new Property({ _id: property, owner, ownerType: "agent", title: "Test rental", propertyType: "Apartment", listingType: "Rent", price: 100, pricePeriod: "month", status: "published", availability: "Available" });
  });
  t.mock.method(Rental, "exists", () => ({ session: async () => false }));
  t.mock.method(Notification, "create", async (notice) => { notices.push(notice); return {}; });
  t.mock.method(Setting, "findOneAndUpdate", () => ({ lean: async () => ({ notifications: {} }) }));
  for (const [kind, Model] of [["rental", Rental], ["payment", Payment]]) {
    t.mock.method(Model.prototype, "save", async function (options) {
      assert.ok(options?.session?.staged, `${kind} must save within the transaction`);
      if (failSave === kind) { failSave = null; throw new Error(`Simulated ${kind} save failure`); }
      options.session.staged[kind] = this.toObject();
      return this;
    });
  }
  t.mock.method(globalThis, "fetch", async () => {
    providerChecks += 1;
    onProvider?.();
    return { json: async () => ({ status: providerResponseStatus, data: { status: providerStatus, reference: payment.reference, amount: 10000, currency: "GHS" } }) };
  });
  const originalKey = process.env.PAYSTACK_SECRET_KEY;
  process.env.PAYSTACK_SECRET_KEY = "sk_test_consistency";
  t.after(() => { if (originalKey === undefined) delete process.env.PAYSTACK_SECRET_KEY; else process.env.PAYSTACK_SECRET_KEY = originalKey; });
  const verify = async () => {
    const res = response();
    await verifyPayment({ params: { reference: payment.reference }, user: { _id: customer } }, res);
    return res;
  };
  return { stored, verify, notices, query, failNextSave(kind) { failSave = kind; }, providerChecks: () => providerChecks, provider(status, callback, responseStatus = true) { providerStatus = status; onProvider = callback; providerResponseStatus = responseStatus; } };
};

for (const providerStatus of ["pending", "ongoing", "processing", "queued"]) {
  test(`${providerStatus} verification preserves the rental hold and the same payment can succeed later`, async (t) => {
    const f = fixture(t);
    f.stored.rental.paymentStartedAt = new Date();
    const before = JSON.stringify(f.stored);
    f.provider(providerStatus);
    const pending = await f.verify();
    assert.equal(pending.code, 409);
    assert.equal(pending.body.code, "PAYMENT_PENDING");
    assert.match(pending.body.message, /do not start another payment/i);
    assert.equal(JSON.stringify(f.stored), before, "processing must not change payment, hold or history");
    assert.equal(f.notices.length, 0);
    f.provider("success");
    assert.equal((await f.verify()).code, 200);
    assert.equal(f.stored.payment.status, "paid");
    assert.equal(f.stored.rental.paymentStatus, "paid");
    assert.equal(f.providerChecks(), 2);
  });
}

for (const kind of ["rental", "payment"]) {
  test(`failed ${kind} save rolls back both records and a retry completes the booking`, async (t) => {
    const f = fixture(t);
    f.failNextSave(kind);
    await assert.rejects(f.verify(), new RegExp(`Simulated ${kind} save failure`));
    assert.equal(f.stored.payment.status, "pending");
    assert.equal(f.stored.rental.paymentStatus, "pending");
    assert.equal(f.stored.rental.status, "payment_pending");
    assert.equal(f.stored.rental.history.length, 0);
    const result = await f.verify();
    assert.equal(result.code, 200);
    assert.equal(f.stored.payment.status, "paid");
    assert.equal(f.stored.rental.paymentStatus, "paid");
    assert.equal(f.stored.rental.history.length, 1);
    const repeated = await f.verify();
    assert.equal(repeated.body.message, "Rental already paid");
    assert.equal(f.stored.rental.history.length, 1);
    assert.equal(f.providerChecks(), 2, "refreshing a completed payment does not call the provider again");
  });
}

test("an earlier paid ledger entry repairs its unpaid booking without charging or checking Paystack again", async (t) => {
  const f = fixture(t, "paid");
  const result = await f.verify();
  assert.equal(result.code, 200);
  assert.equal(result.body.data.paymentStatus, "paid");
  assert.equal(f.stored.rental.status, "paid");
  assert.equal(f.stored.rental.paymentReference, f.stored.payment.reference);
  assert.equal(f.stored.rental.history.length, 1);
  assert.equal(f.providerChecks(), 0);
});

test("a verified charge below the booking total stays in review on every retry", async (t) => {
  const f = fixture(t);
  f.stored.rental.amount = 200;
  assert.equal((await f.verify()).code, 409);
  assert.equal(f.stored.payment.status, "refund_required");
  assert.equal(f.stored.rental.paymentStatus, "pending");
  assert.equal((await f.verify()).code, 409);
});

for (const status of ["pending", "failed", "paid"]) {
  test(`a late successful charge (${status} ledger entry) cannot reopen a cancelled rental`, async (t) => {
    const f = fixture(t, status);
    f.stored.rental.status = "cancelled";
    const before = JSON.stringify(f.stored.rental);
    const result = await f.verify();
    assert.equal(result.code, 409);
    assert.match(result.body.message, /refund/i);
    assert.equal(f.stored.payment.status, "refund_required");
    assert.ok(f.stored.payment.paidAt);
    assert.match(f.stored.payment.note, /cancelled/i);
    assert.equal(JSON.stringify(f.stored.rental), before, "the cancelled booking and its history stay intact");
    assert.ok(f.notices.some((notice) => notice.audience === "admins" && /cancelled/i.test(notice.message)));
    assert.equal((await f.verify()).code, 409);
    assert.equal(JSON.stringify(f.stored.rental), before);
  });
}

for (const providerStatus of ["success", "failed"]) {
  test(`cancellation during provider verification is preserved when payment is ${providerStatus}`, async (t) => {
    const f = fixture(t);
    f.provider(providerStatus, () => { f.stored.rental.status = "cancelled"; });
    const result = await f.verify();
    assert.equal(result.code, providerStatus === "success" ? 409 : 402);
    assert.equal(f.stored.rental.status, "cancelled");
    assert.equal(f.stored.rental.history.length, 0);
    assert.equal(f.stored.payment.status, providerStatus === "success" ? "refund_required" : "failed");
  });
}

test("refreshing a genuinely paid rental that was later cancelled preserves its paid history", async (t) => {
  const f = fixture(t, "paid");
  Object.assign(f.stored.rental, { status: "cancelled", paymentStatus: "paid" });
  const result = await f.verify();
  assert.equal(result.code, 200);
  assert.equal(result.body.data.status, "cancelled");
  assert.equal(f.stored.payment.status, "paid");
  assert.equal(f.providerChecks(), 0);
});

test("failed verification still resets an open unpaid checkout for another attempt", async (t) => {
  const f = fixture(t);
  f.provider("failed");
  assert.equal((await f.verify()).code, 402);
  assert.equal(f.stored.rental.status, "pending");
  assert.equal(f.stored.rental.paymentStatus, "failed");
  assert.equal(f.stored.rental.history.length, 1);
  assert.equal(f.stored.rental.history[0].note, "Payment not completed");
});

test("a failed checkout-start response cannot reopen a rental cancelled while Paystack was responding", async (t) => {
  const f = fixture(t);
  const property = new Property({
    _id: f.stored.rental.property, owner: f.stored.rental.owner, ownerType: "agent",
    title: "Test rental", propertyType: "Apartment", listingType: "Rent",
    status: "published", availability: "Available", currency: "GHS", price: 100, pricePeriod: "month",
  });
  t.mock.method(Setting, "findOneAndUpdate", () => ({ lean: async () => ({ payments: { rentalsEnabled: true }, agent: { requireSubscription: false } }) }));
  t.mock.method(User, "find", () => ({ select: () => ({ populate: async () => [] }) }));
  t.mock.method(Property, "findOne", () => ({ session: async () => property }));
  t.mock.method(Rental, "findOne", () => f.query("rental", Rental));
  f.provider("failed", () => { f.stored.rental.status = "cancelled"; }, false);
  t.mock.method(console, "error", () => {});
  const res = response();
  await initializeRentalPayment({
    body: { rentalId: String(f.stored.rental._id) },
    user: { _id: f.stored.rental.customer, role: "user", email: "guest@example.test" },
    get: () => undefined,
  }, res);
  assert.equal(res.code, 502);
  assert.equal(f.stored.rental.status, "cancelled");
  assert.equal(f.stored.payment.status, "failed");
  assert.equal(f.stored.payment.note, "Paystack could not start the checkout");
  assert.equal(f.stored.rental.history.length, 1, "only the checkout-start entry is added before cancellation");
});

test("a stale failure cannot overwrite a newer checkout reference", async (t) => {
  const f = fixture(t);
  f.stored.rental.paymentReference = "HBR-newer-checkout";
  const before = JSON.stringify(f.stored.rental);
  await recordFailedRentalPayment(new Payment(f.stored.payment), { _id: f.stored.rental.customer });
  assert.equal(JSON.stringify(f.stored.rental), before);
});

test("a failure arriving after successful confirmation leaves both paid records intact", async (t) => {
  const f = fixture(t, "paid");
  Object.assign(f.stored.rental, { status: "confirmed", paymentStatus: "paid" });
  await recordFailedRentalPayment(new Payment(f.stored.payment), { _id: f.stored.rental.customer });
  assert.equal(f.stored.payment.status, "paid");
  assert.equal(f.stored.rental.status, "confirmed");
  assert.equal(f.stored.rental.paymentStatus, "paid");
  assert.equal(f.stored.rental.history.length, 0);
});

test("a second successful charge is flagged as duplicate without changing the paid rental", async (t) => {
  const f = fixture(t);
  Object.assign(f.stored.rental, { status: "confirmed", paymentStatus: "paid", paymentReference: "HBR-first-payment" });
  const before = JSON.stringify(f.stored.rental);
  const res = await f.verify();
  assert.equal(res.code, 409);
  assert.match(res.body.message, /duplicate/i);
  assert.equal(f.stored.payment.status, "duplicate");
  assert.equal(JSON.stringify(f.stored.rental), before);
  assert.equal((await f.verify()).code, 409);
});
