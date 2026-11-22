import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Rental from "../models/Rental.js";
import Inquiry from "../models/Inquiry.js";
import Notification from "../models/Notification.js";
import Setting from "../models/Setting.js";
import Plan from "../models/Plan.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import { PUBLIC_AGENT_FIELDS, publicAgent, presentProperties, visibleAgentIds } from "../utils/marketplace.js";
import { subscriptionState } from "../utils/permissions.js";
import { createProperty, updateProperty, deleteProperty, buildPublicFilter } from "../controllers/propertyController.js";
import { createInquiry, myInquiries } from "../controllers/inquiryController.js";
import { quoteRental, rentalMonths } from "../controllers/rentalController.js";
import { checkPaystackTransaction, toSubunit } from "../utils/paystack.js";
import { fakeListedAgents } from "./support/listedAgents.js";

const query = (value) => ({
  then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  catch: (reject) => Promise.resolve(value).catch(reject),
  select: () => query(value), sort: () => query(value), populate: () => query(value), session: () => query(value), lean: () => Promise.resolve(value),
});
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const agent = new User({ emailVerifiedAt: new Date(), firstName: "Akua", lastName: "Mensah", phone: "+233241234567", email: "akua@example.test", role: "agent", password: "password123", agentApplication: { status: "approved", companyName: "Akua Homes", whatsapp: "+233209876543", approvedBy: new mongoose.Types.ObjectId(), rejectionReason: "Private note" }, savedProperties: [new mongoose.Types.ObjectId()] });
const customer = new User({ emailVerifiedAt: new Date(), firstName: "Customer", lastName: "Test", phone: "+233201234567", email: "customer@example.test", password: "password123" });
const listing = (extra = {}) => new Property({ title: "East Legon Apartment", description: "A comfortable home with parking and a garden in East Legon.", propertyType: "Apartment", listingType: "Rent", price: 2000, pricePeriod: "month", location: { city: "Accra", neighbourhood: "East Legon", region: "Greater Accra", address: "12 Palm Street" }, area: 90, images: ["/home.jpg"], owner: agent._id, ownerType: "agent", contact: { id: String(customer._id), name: "Stale Name", phone: "0000000", email: "stale@example.test" }, status: "published", ...extra });
const settings = (t, overrides = {}) => t.mock.method(Setting, "findOneAndUpdate", () => query({ agent: { requireSubscription: false }, ...overrides }));

test("public listings use live, allowlisted agent data rather than forged contact snapshots", async (t) => {
  t.mock.method(User, "find", () => query([agent]));
  t.mock.method(User, "aggregate", fakeListedAgents([agent]));
  settings(t);
  t.mock.method(Plan, "findOne", () => query(null)); // no default plan, so no NyaFie chat
  const [property] = await presentProperties([listing()]);
  assert.equal(property.agent.chat, false);
  assert.equal(property.agent.id, String(agent._id));
  assert.equal(property.agent.name, "Akua Mensah");
  assert.equal(property.contact.phone, agent.phone);
  assert.equal(property.agent.whatsapp, "+233209876543");
  assert.equal(property.agent.verified, true);
  for (const key of ["password", "savedProperties", "preferences", "subscription", "agentApplication", "approvedBy", "rejectionReason"]) assert.equal(Object.hasOwn(property.agent, key), false, key);
  assert.equal(PUBLIC_AGENT_FIELDS.includes("approvedBy"), false);
  assert.equal(publicAgent({ ...agent.toObject(), isActive: false }).verified, false);
  assert.equal(publicAgent({ ...agent.toObject(), agentApplication: { status: "pending" } }).verified, false);
});

test("property creation ignores counterfeit owner, contact, approval, and payment fields", async (t) => {
  let created;
  t.mock.method(Property, "create", async (data) => { created = data; return new Property(data); });
  const res = response();
  await createProperty({ user: agent, access: { imageLimit: 5, propertyLimit: 10, activeCount: 0, settings: { property: { propertyTypes: ["Apartment"], rentPeriods: ["month", "night"] } } }, body: { title: "Agent property", status: "draft", listingType: "Sale", pricePeriod: "month", owner: customer._id, agentId: customer._id, ownerType: "admin", contact: { id: customer._id, name: "Impostor", email: customer.email }, paymentStatus: "paid" } }, res);
  assert.equal(res.code, 201);
  assert.equal(String(created.owner), String(agent._id));
  assert.equal(created.ownerType, "agent");
  assert.equal(created.contact.name, "Akua Mensah");
  assert.equal(created.contact.email, agent.email);
  assert.equal(created.status, "draft");
  assert.equal(created.pricePeriod, "total");
  assert.equal(created.paymentStatus, undefined);
});

test("public visibility requires verified subscription payment when subscription is required", async (t) => {
  settings(t, { agent: { requireSubscription: true } });
  const valid = { status: "active", paymentStatus: "paid", expiresAt: new Date("2035-01-01"), plan: {} };
  let subscription = valid;
  t.mock.method(User, "find", () => query([{ _id: agent._id, subscription }]));
  t.mock.method(User, "aggregate", fakeListedAgents(() => [{ _id: agent._id, subscription }]));
  assert.equal((await visibleAgentIds()).length, 1);
  for (const invalid of [{ paymentStatus: "pending" }, { paymentStatus: "failed" }, { status: "pending" }, { status: "cancelled" }, { expiresAt: new Date("2000-01-01") }, { expiresAt: "invalid" }]) {
    subscription = { ...valid, ...invalid };
    assert.equal(subscriptionState(subscription).isActive, false);
    assert.equal((await visibleAgentIds()).length, 0);
  }
});

test("changing a property ID cannot edit or delete another agent's listing", async (t) => {
  const property = listing();
  t.mock.method(Property, "findById", () => query(property));
  const req = { user: { _id: customer._id, role: "agent" }, params: { id: String(property._id) }, body: { price: 1 } };
  for (const action of [updateProperty, deleteProperty]) {
    const res = response();
    await action(req, res);
    assert.equal(res.code, 403);
    assert.equal(property.price, 2000);
  }
});

test("editing a live listing validates publication requirements again", async (t) => {
  const property = listing();
  t.mock.method(Property, "findById", () => query(property));
  const res = response();
  await updateProperty({ user: agent, params: { id: String(property._id) }, body: { price: 0 }, access: { settings: { property: { propertyTypes: ["Apartment"], rentPeriods: ["month", "night"] } } } }, res);
  assert.equal(res.code, 400);
  assert.match(res.body.message, /price greater than 0/);
});

test("location and purpose URL filters are case insensitive and escape regex operators", () => {
  const filter = buildPublicFilter({ purpose: "rent", city: "accra", region: "Greater Accra", area: "East (Legon)", search: ".*" }, { status: "published" });
  assert.ok(filter.$and.some((clause) => clause.listingType === "Rent"));
  // Places match by their key, so every spelling counts ("East (Legon)", "East-Legon" -> east-legon)
  const place = (keyField) => filter.$and.find((clause) => clause.$or?.some((option) => keyField in option)).$or;
  const [cityKey, cityLegacy] = place("location.cityKey");
  assert.equal(cityKey["location.cityKey"], "accra");
  assert.ok(cityLegacy["location.city"].$in[0].test("Accra"), "listings saved before keys existed still match by name");
  const [areaKey, areaLegacy] = place("location.areaKey");
  assert.equal(areaKey["location.areaKey"], "east-legon");
  // Listings without a key yet match any spelling of the same words, and nothing else
  const legacy = areaLegacy["location.neighbourhood"].$in[0];
  for (const spelling of ["East (Legon)", "East Legon", "east-legon", " EAST  LEGON "]) assert.ok(legacy.test(spelling), spelling);
  for (const other of ["East Legon Hills", "Legon", "Eastlegon"]) assert.equal(legacy.test(other), false, other);
  // Typed pattern characters never become a pattern
  const sneaky = buildPublicFilter({ area: ".*" }, { status: "published" }).$and.find((clause) => clause.$or?.some((option) => "location.areaKey" in option)).$or[1]["location.neighbourhood"].$in[0];
  assert.equal(sneaky.test("East Legon"), false);
  assert.equal(filter.$and.find((clause) => clause.$or?.[0]?.title).$or[0].title.test("anything"), false);
});

test("inquiries route to the property's agent and customer inboxes never match an untrusted email", async (t) => {
  settings(t);
  t.mock.method(User, "find", () => query([agent]));
  t.mock.method(User, "aggregate", fakeListedAgents([agent]));
  t.mock.method(Property, "findOne", () => query(listing()));
  let created, notice, inboxFilter;
  const conversationId = new mongoose.Types.ObjectId();
  t.mock.method(Conversation, "findOne", () => query(null));
  t.mock.method(Conversation, "create", async ([data]) => [{ ...data, _id: conversationId, ownerUnread: 0, customerUnread: 0, save: async () => {} }]);
  t.mock.method(Message, "create", async ([data]) => [{ ...data, createdAt: new Date() }]);
  t.mock.method(mongoose.connection, "transaction", async (work) => work(null)); // no database here
  t.mock.method(Inquiry, "create", async ([data]) => { created = data; return [data]; });
  t.mock.method(Notification, "create", async (data) => { notice = data; });
  t.mock.method(Inquiry, "find", (filter) => { inboxFilter = filter; return query([]); });
  const res = response();
  await createInquiry({ user: customer, body: { propertyId: String(listing()._id), agentId: customer._id, name: "Customer", email: customer.email, message: "Can we arrange a viewing?" } }, res);
  assert.equal(res.code, 201);
  assert.equal(String(created.agent), String(agent._id));
  assert.equal(String(created.customer), String(customer._id));
  assert.equal(String(created.conversation), String(conversationId));
  assert.equal(String(notice.recipient), String(agent._id));
  assert.equal(notice.link, "/agent/inquiries");
  await myInquiries({ user: customer }, response());
  assert.deepEqual(inboxFilter, { customer: customer._id });
});

test("hidden listings cannot start rentals or receive new inquiries", async (t) => {
  settings(t);
  t.mock.method(User, "find", () => query([]));
  t.mock.method(User, "aggregate", fakeListedAgents([]));
  let filter;
  t.mock.method(Property, "findOne", (value) => { filter = value; return query(null); });
  const quote = await quoteRental({ propertyId: String(listing()._id), startDate: "2030-01-01", endDate: "2031-01-01" }, customer);
  assert.equal(quote.status, 404);
  assert.equal(filter.status, "published");
  assert.deepEqual(filter.$or[1].owner.$in, []);
  const res = response();
  await createInquiry({ user: customer, body: { propertyId: String(listing()._id), name: "Customer", email: customer.email, message: "Viewing?" } }, res);
  assert.equal(res.code, 404);
});

test("rental quotes use database prices and calendar months; terminal availability blocks checkout", async (t) => {
  settings(t);
  t.mock.method(User, "find", () => query([agent]));
  t.mock.method(User, "aggregate", fakeListedAgents([agent]));
  let property = listing();
  t.mock.method(Property, "findOne", () => query(property));
  t.mock.method(Rental, "exists", async () => false);
  const body = { propertyId: String(property._id), startDate: "2030-01-01", endDate: "2031-01-01", price: 1, amount: 1, fees: 999, paymentStatus: "paid" };
  const quote = await quoteRental(body, customer);
  assert.equal(quote.units, 12);
  assert.equal(quote.amount, 24000);
  assert.equal(quote.fees, 0);
  assert.equal(rentalMonths(new Date("2030-01-31Z"), new Date("2030-02-28Z")), 1);
  assert.equal(rentalMonths(new Date("2030-01-31Z"), new Date("2030-03-01Z")), 2);
  assert.equal((await quoteRental({ ...body, startDate: "2030-02-31" }, customer)).status, 400);
  for (const availability of ["Sold", "Rented", "Under Offer"]) {
    property = listing({ availability });
    assert.equal((await quoteRental(body, customer)).status, 400);
  }
});

test("payment success requires the provider's reference, GHS currency, and exactly the expected amount", async (t) => {
  let transaction = { id: 4099260516, status: "success", reference: "HB-test", amount: 200000, currency: "GHS", channel: "mobile_money" };
  t.mock.method(globalThis, "fetch", async () => ({ json: async () => ({ status: true, data: transaction }) }));
  assert.deepEqual(await checkPaystackTransaction("HB-test", 2000), { status: "paid", transactionId: "4099260516", channel: "mobile_money", paidAmount: 2000, currency: "GHS" });
  const statusFor = async (change, amount = 2000) => { transaction = { status: "success", reference: "HB-test", amount: 200000, currency: "GHS", ...change }; return (await checkPaystackTransaction("HB-test", amount)).status; };
  assert.equal(await statusFor({ status: "ongoing" }), "pending", "mobile money prompt not answered yet");
  assert.equal(await statusFor({ status: "abandoned" }), "failed");
  assert.equal(await statusFor({ reference: "forged" }), "failed", "another transaction never pays for this one");
  assert.equal(await statusFor({ domain: "live" }), "failed", "the other Paystack environment never pays for this one");
  // Money arrived but not what was expected: held for review, never granted
  assert.equal(await statusFor({ amount: 100 }), "mismatch", "underpaid");
  assert.equal(await statusFor({ amount: 250000 }), "mismatch", "overpaid");
  assert.equal(await statusFor({ currency: "USD" }), "mismatch");
  assert.match((await checkPaystackTransaction("HB-test", 2000)).problem, /GHS 2000 was expected/);
  // The customer bore Paystack's fee: the requested amount is exact
  assert.equal(await statusFor({ amount: 203900, requested_amount: 200000 }), "paid");
  assert.equal(await statusFor({ amount: 203900, requested_amount: 1 }), "mismatch");
  // Pesewas are exact for two-decimal amounts despite floating point (1.15 * 100 = 114.999...)
  assert.equal(await statusFor({ amount: 115 }, 1.15), "paid");
  assert.equal(toSubunit(250), 25000);
  assert.equal(toSubunit(0.1 + 0.2), 30);
  for (const bad of [NaN, -1, Infinity, "abc"]) assert.throws(() => toSubunit(bad), /Invalid payment amount/);
});
