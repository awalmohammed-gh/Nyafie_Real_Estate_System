import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Rental from "../models/Rental.js";
import SaleRequest from "../models/SaleRequest.js";
import Viewing from "../models/Viewing.js";
import Review from "../models/Review.js";
import Property from "../models/Property.js";
import Setting from "../models/Setting.js";
import User from "../models/User.js";
import { canReview } from "../utils/reviewEligibility.js";
import { submitReview } from "../controllers/reviewController.js";

const id = () => new mongoose.Types.ObjectId();
const CUSTOMER = id();
const PROPERTY = id();
const query = (value) => {
  const chain = { then: (yes, no) => Promise.resolve(typeof value === "function" ? value() : value).then(yes, no) };
  for (const name of ["populate", "select", "lean", "session", "sort", "limit"]) chain[name] = () => chain;
  return chain;
};
const response = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

// What the customer has done with the property: each collection answers exists() from these records
const history = (t, { viewings = [], rentals = [], sales = [] } = {}) => {
  const match = (records) => (filter) => {
    const statuses = filter.status?.$in || [filter.status];
    return query(records.find((record) => String(filter.customer) === String(CUSTOMER) && String(filter.property) === String(PROPERTY) && statuses.includes(record.status)) ? { _id: id() } : null);
  };
  t.mock.method(Viewing, "exists", match(viewings));
  t.mock.method(Rental, "exists", match(rentals));
  t.mock.method(SaleRequest, "exists", match(sales));
};

test("only customers who viewed, stayed in or bought a property can review it", async (t) => {
  for (const [label, records, expected] of [
    ["nothing at all", {}, false],
    ["a viewing that was only requested", { viewings: [{ status: "requested" }] }, false],
    ["a viewing that was missed", { viewings: [{ status: "missed" }] }, false],
    ["a completed viewing", { viewings: [{ status: "completed" }] }, true],
    ["a rental still waiting for payment", { rentals: [{ status: "confirmed" }] }, false],
    ["a cancelled rental", { rentals: [{ status: "cancelled" }] }, false],
    ["a tenant who moved in", { rentals: [{ status: "active" }] }, true],
    ["a finished hotel stay", { rentals: [{ status: "completed" }] }, true],
    ["a purchase request without payment", { sales: [{ status: "payment_pending" }] }, false],
    ["a purchase paid at the office", { sales: [{ status: "paid_at_office" }] }, true],
    ["a completed purchase", { sales: [{ status: "completed" }] }, true],
  ]) {
    await t.test(label, async (st) => {
      history(st, records);
      assert.equal(await canReview(CUSTOMER, PROPERTY), expected);
    });
  }
  assert.equal(await canReview(null, PROPERTY), false);
});

test("a new review from someone who never dealt with the property is refused; existing reviews stay editable", async (t) => {
  t.mock.method(Setting, "findOneAndUpdate", () => query({ key: "platform", property: {}, agent: {} }));
  // Which agents' listings are public (utils/marketplace.js): none hidden here
  t.mock.method(User, "aggregate", async () => []);
  t.mock.method(User, "distinct", async () => []);
  t.mock.method(User, "find", () => query([]));
  t.mock.method(Property, "findOne", () => query({ _id: PROPERTY, title: "Sea View Flat", status: "published", owner: id(), ownerType: "agent" }));
  t.mock.method(Property, "findById", () => query({ _id: PROPERTY, title: "Sea View Flat", status: "published", owner: id(), ownerType: "agent" }));
  const created = [];
  t.mock.method(Review, "create", async (doc) => { created.push(doc); return { _id: id(), ...doc }; });
  history(t, {});
  t.mock.method(Review, "findOne", () => query(null));
  const req = { user: { _id: CUSTOMER, role: "user", firstName: "Kofi", lastName: "B" }, params: { id: String(PROPERTY) }, body: { rating: 1, title: "Bad", comment: "A rival's fake review of a place they never saw." } };
  const res = response();
  await submitReview(req, res);
  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /viewed it with the owner, stayed in it or bought it/);
  assert.equal(created.length, 0);
});

test("a review written before the rule can still be edited by its author", async (t) => {
  t.mock.method(Setting, "findOneAndUpdate", () => query({ key: "platform", property: {}, agent: {} }));
  t.mock.method(User, "aggregate", async () => []);
  t.mock.method(User, "distinct", async () => []);
  t.mock.method(User, "find", () => query([]));
  t.mock.method(Property, "findOne", () => query({ _id: PROPERTY, title: "Sea View Flat", status: "published", owner: id(), ownerType: "agent" }));
  t.mock.method(Property, "updateOne", async () => ({}));
  t.mock.method(Review, "aggregate", () => query([]));
  history(t, {});
  const existing = { _id: id(), user: CUSTOMER, property: PROPERTY, rating: 2, title: "Old", comment: "Written before reviews needed a visit.", save: async () => existing, populate: async () => existing, toJSON: () => ({ ...existing }) };
  t.mock.method(Review, "findOne", () => query(existing));
  const res = response();
  await submitReview({ user: { _id: CUSTOMER, role: "user", firstName: "Kofi", lastName: "B" }, params: { id: String(PROPERTY) }, body: { rating: 4, title: "Updated", comment: "Updated after the owner fixed the water supply." } }, res);
  assert.equal(res.statusCode, 200, res.body?.message);
  assert.equal(existing.rating, 4);
});
