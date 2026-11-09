import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { customerTabClaims, customerTabHeaders } from "./support/customerTab.js";
import { createApp } from "../app.js";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Offer from "../models/Offer.js";
import Rental from "../models/Rental.js";
import SaleRequest from "../models/SaleRequest.js";
import Inquiry from "../models/Inquiry.js";
import Notification from "../models/Notification.js";
import TeamInvite from "../models/TeamInvite.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Setting from "../models/Setting.js";
import { cleanUpOldRecords } from "../utils/housekeeping.js";
import { OPEN_REQUEST_LIMITS } from "../utils/openRequestLimits.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

const DAY = 24 * 60 * 60 * 1000;

test("database limits: caps on what one account can store, cleanup of old records", { skip: process.env.RUN_DATABASE_LIMITS_INTEGRATION !== "1", timeout: 120000 }, async (t) => {
  await isolatedMongo(t);
  process.env.JWT_KEY = "isolated-database-limits-signing-key-32-chars";
  await Setting.create({ key: "platform", payments: { rentalsEnabled: true } });
  const admin = await User.create({ emailVerifiedAt: new Date(), firstName: "Site", lastName: "Admin", email: "admin@limits.test", password: "test-password-long-enough", role: "admin" });
  const customer = await User.create({ emailVerifiedAt: new Date(), firstName: "Busy", lastName: "Customer", email: "busy@limits.test", phone: "0241234567", password: "test-password-long-enough" });

  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (user, path, { method = "GET", body } = {}) => {
    const session = user.role === "admin" ? "admin" : "customer";
    const headers = { "Content-Type": "application/json", "X-Session-Domain": session, ...customerTabHeaders(session), Cookie: `${session}_token=${jwt.sign({ id: user.id, role: user.role, session, ...customerTabClaims(session) }, process.env.JWT_KEY, { expiresIn: "1h" })}` };
    const response = await fetch(`${base}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { code: response.status, ...(await response.json()) };
  };
  let n = 0;
  const listing = (fields = {}) => Property.create({ title: `Listing ${++n}`, description: "A listing used to check the database limits here.", propertyType: "Apartment", listingType: "Rent", price: 1000, pricePeriod: "month", owner: admin._id, ownerType: "admin", status: "published", availability: "Available", ...fields });
  const contact = { contactName: "Busy Customer", contactEmail: customer.email, contactPhone: "0241234567" };

  await t.test("an account can save up to 500 homes; unsaving always works", async () => {
    const first = await listing();
    await User.updateOne({ _id: customer._id }, { $set: { savedProperties: Array.from({ length: 500 }, (_, i) => (i === 0 ? first._id : Property.createFromHexString?.() || new Property()._id)) } });
    const another = await listing();
    const refused = await call(customer, `/users/saved/${another.id}`, { method: "POST" });
    assert.equal(refused.code, 400);
    assert.match(refused.message, /up to 500 homes/);
    assert.equal((await call(customer, `/users/saved/${first.id}`, { method: "POST" })).code, 200, "removing one still works");
    assert.equal((await call(customer, `/users/saved/${another.id}`, { method: "POST" })).code, 200, "and then there is room again");
    await User.updateOne({ _id: customer._id }, { $set: { savedProperties: [] } });
  });

  await t.test("open offers, rental requests and purchase requests are capped per account (not per listing)", async () => {
    // Offers: the maximum open on other listings blocks a new one
    for (let i = 0; i < OPEN_REQUEST_LIMITS.offers; i++) await Offer.create({ customer: customer._id, property: (await listing({ listingType: "Sale", pricePeriod: "total" }))._id, owner: admin._id, ownerType: "admin", amount: 500, askingPrice: 1000, status: i % 2 ? "pending" : "countered" });
    const offerTarget = await listing({ listingType: "Sale", pricePeriod: "total" });
    const offer = await call(customer, "/offers", { method: "POST", body: { propertyId: offerTarget.id, amount: 900 } });
    assert.equal(offer.code, 429, JSON.stringify(offer));
    assert.match(offer.message, /20 open offers/);
    await Offer.updateMany({ customer: customer._id }, { status: "withdrawn" });
    assert.equal((await call(customer, "/offers", { method: "POST", body: { propertyId: offerTarget.id, amount: 900 } })).code, 201, "closed offers don't count");

    // Rental requests
    for (let i = 0; i < OPEN_REQUEST_LIMITS.rentals; i++) await Rental.create({ customer: customer._id, property: (await listing())._id, owner: admin._id, ownerType: "admin", startDate: new Date("2031-01-01"), endDate: new Date("2031-02-01"), pricePeriod: "month", unitPrice: 1000, units: 1, amount: 1000, ...contact });
    const rentTarget = await listing();
    const rentBody = { propertyId: rentTarget.id, startDate: "2031-03-01", endDate: "2031-04-01", fullName: "Busy Customer", phone: "0241234567", currentAddress: "12 Test Road" };
    const rental = await call(customer, "/rentals", { method: "POST", body: rentBody });
    assert.equal(rental.code, 429, JSON.stringify(rental));
    const sameListing = (await Rental.findOne({ customer: customer._id })).property;
    assert.equal((await call(customer, "/rentals", { method: "POST", body: { ...rentBody, propertyId: String(sameListing) } })).code, 201, "updating a request for a listing you already asked about is never blocked");

    // Purchase requests
    for (let i = 0; i < OPEN_REQUEST_LIMITS.sales; i++) await SaleRequest.create({ customer: customer._id, property: (await listing({ listingType: "Sale", pricePeriod: "total" }))._id, owner: admin._id, ownerType: "admin", askingPrice: 1000, ...contact });
    const saleTarget = await listing({ listingType: "Sale", pricePeriod: "total" });
    const sale = await call(customer, "/sale-requests", { method: "POST", body: { propertyId: saleTarget.id, fullName: "Busy Customer", phone: "0241234567" } });
    assert.equal(sale.code, 429, JSON.stringify(sale));
    assert.match(sale.message, /10 open purchase requests/);
  });

  await t.test("chat messages have their own rate limit", async () => {
    const home = await listing();
    const conversation = await Conversation.create({ customer: customer._id, property: home._id, owner: admin._id, ownerType: "admin" });
    let limited = 0;
    for (let i = 0; i < 125; i++) {
      const sent = await call(customer, `/conversations/${conversation.id}/messages`, { method: "POST", body: { message: `Hello ${i}` } });
      if (sent.code === 429) limited++;
    }
    assert.ok(limited >= 5, `the last messages are refused (${limited})`);
    assert.ok(await Message.countDocuments({ conversation: conversation._id }) <= 120);
  });

  await t.test("text fields that had no length limit now have one (the database refuses oversized values)", async () => {
    await assert.rejects(listing({ location: { address: "x".repeat(201), city: "Accra" } }), /maxlength|longer than/i);
    await assert.rejects(listing({ currency: "X".repeat(11) }), /maxlength|longer than/i);
    await assert.rejects(User.create({ firstName: "x".repeat(81), lastName: "Long", email: "long@limits.test", password: "test-password-long-enough" }), /maxlength|longer than/i);
    assert.ok(await listing({ location: { address: "12 Very Ordinary Street, East Legon", city: "Accra" } }), "normal values are unaffected");
  });

  await t.test("the daily cleanup removes old notifications and long-expired invites, nothing else", async () => {
    const now = new Date();
    const ago = (days) => new Date(now.getTime() - days * DAY);
    const make = (read, days) => Notification.create({ recipient: customer._id, audience: "user", type: "status", title: `${read ? "read" : "unread"} ${days}d`, read }).then((doc) => Notification.collection.updateOne({ _id: doc._id }, { $set: { createdAt: ago(days) } }));
    await Notification.deleteMany({});
    await Promise.all([make(true, 10), make(true, 200), make(false, 200), make(false, 400)]);
    await TeamInvite.create([{ agency: admin._id, role: "agent", tokenHash: "old", expiresAt: ago(40) }, { agency: admin._id, role: "agent", tokenHash: "recent", expiresAt: ago(5) }]);
    assert.deepEqual(await cleanUpOldRecords(now), { notifications: 2, invites: 1 });
    assert.deepEqual((await Notification.find().lean()).map((n) => n.title).sort(), ["read 10d", "unread 200d"]);
    assert.deepEqual((await TeamInvite.find().lean()).map((i) => i.tokenHash), ["recent"]);
  });

  await t.test("the admin user list still shows each account's inquiry and listing counts", async () => {
    await Inquiry.create([{ property: (await listing())._id, customer: customer._id, agent: admin._id, ownerType: "admin", name: "Busy", email: customer.email, message: "Is it available?" }, { property: (await listing())._id, customer: customer._id, agent: admin._id, ownerType: "admin", name: "Busy", email: customer.email, message: "Can I view it?" }]);
    const users = await call(admin, "/admin/users");
    assert.equal(users.code, 200, JSON.stringify(users).slice(0, 200));
    assert.equal(users.data.find((u) => u.email === customer.email).inquiriesCount, 2);
  });
});
