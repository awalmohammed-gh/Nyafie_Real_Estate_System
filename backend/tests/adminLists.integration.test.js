import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { adminEntryHeaders, customerTabClaims, customerTabHeaders } from "./support/customerTab.js";
import { createApp } from "../app.js";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Inquiry from "../models/Inquiry.js";
import Offer from "../models/Offer.js";
import Rental from "../models/Rental.js";
import SaleRequest from "../models/SaleRequest.js";
import Viewing from "../models/Viewing.js";
import Payment from "../models/Payment.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import Dispute from "../models/Dispute.js";
import Setting from "../models/Setting.js";
import { clearVisibleAgentsCache } from "../utils/marketplace.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

const DAY = 86400000;

test("admin lists are paged, searched, sorted and counted by the server", { skip: process.env.RUN_ADMIN_LISTS_INTEGRATION !== "1", timeout: 120000 }, async (t) => {
  const previous = process.env.JWT_KEY;
  process.env.JWT_KEY = "isolated-admin-lists-signing-key-at-least-32-characters";
  t.after(() => { if (previous === undefined) delete process.env.JWT_KEY; else process.env.JWT_KEY = previous; });
  await isolatedMongo(t);
  await Setting.create({ key: "platform", agent: { requireSubscription: false } });
  const person = (firstName, role, extra = {}) => User.create({ emailVerifiedAt: new Date(), firstName, lastName: "Test", email: `${firstName.toLowerCase()}@lists.test`, phone: "0241234567", password: "test-password-long-enough", role, ...extra });
  const admin = await person("Admin", "admin");
  const agent = await person("Kofi", "agent", { lastName: "Mensah", agentApplication: { status: "approved", agentType: "individual" } });
  const hidden = await person("Yaw", "agent", { agentApplication: { status: "suspended", agentType: "individual" }, isActive: false });
  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const call = async (path, user = admin, session = "admin") => {
    const role = { customer: "user", agent: "agent", admin: "admin" }[session];
    const token = jwt.sign({ id: user.id, role, session, ...customerTabClaims(session) }, process.env.JWT_KEY, { expiresIn: "1h" });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { headers: { "X-Session-Domain": session, ...customerTabHeaders(session), ...(session === "admin" ? adminEntryHeaders() : {}), Cookie: `${session}_token=${token}` } });
    return { ...(await response.json()), code: response.status };
  };
  const get = async (path) => {
    const response = await call(path);
    assert.equal(response.code, 200, `${path}: ${JSON.stringify(response).slice(0, 300)}`);
    return response.data;
  };

  const customers = [];
  for (let i = 1; i <= 23; i++) customers.push(await person(`Guest${String(i).padStart(2, "0")}`, "user", { createdAt: new Date(Date.now() - i * 2 * DAY), isActive: i % 5 !== 0 }));
  const [first, second] = customers;
  await User.updateOne({ _id: first.id }, { lastName: "O'Neil (VIP)", phone: "0209998887" });
  const home = await Property.create({ title: "Beach home", propertyType: "House", listingType: "Sale", price: 500, pricePeriod: "total", owner: admin._id, ownerType: "admin", status: "published", location: { neighbourhood: "Labadi", city: "Accra" } });
  const contact = { contactName: "Guest", contactEmail: "guest@lists.test", contactPhone: "0241234567" };
  await Inquiry.create([
    { customer: first._id, property: home._id, ownerType: "admin", name: "Guest", email: first.email, message: "Signed in" },
    { customer: null, property: home._id, ownerType: "admin", name: "Guest", email: first.email.toUpperCase(), message: "As a guest" },
    { customer: second._id, property: home._id, ownerType: "admin", name: "Guest", email: second.email, message: "Other", status: "closed" },
  ]);
  const offer = await Offer.create({ customer: first._id, property: home._id, owner: admin._id, ownerType: "admin", amount: 450, askingPrice: 500 });
  const rental = (fields) => Rental.create({ property: home._id, customer: second._id, owner: admin._id, ownerType: "admin", startDate: "2030-01-01", endDate: "2030-02-01", pricePeriod: "month", unitPrice: 100, units: 1, amount: 100, ...contact, ...fields });
  await rental({ status: "paid", paymentStatus: "paid" });
  await SaleRequest.create({ customer: first._id, property: home._id, owner: agent._id, ownerType: "agent", askingPrice: 500, ...contact });

  await t.test("only admins", async () => {
    for (const path of ["/admin/customers", "/admin/properties?page=1", "/admin/payments?page=1", `/admin/customers/${first.id}`]) {
      assert.ok([401, 403, 404].includes((await call(path, agent, "agent")).code), path);
      assert.ok([401, 403, 404].includes((await call(path, first, "customer")).code), path);
    }
  });

  await t.test("customers: pages, counts and filters", async () => {
    const one = await get("/admin/customers?page=1"), two = await get("/admin/customers?page=2");
    assert.deepEqual([one.total, one.pages, one.items.length, two.items.length], [23, 2, 20, 3]);
    assert.equal(new Set([...one.items, ...two.items].map((user) => user.id)).size, 23, "no customer twice, none missing");
    assert.equal(one.items[0].email, first.email, "newest first");
    assert.ok(one.items.every((user) => user.role === "user" && user.password === undefined));
    assert.deepEqual(one.counts, { all: 23, active: 19, suspended: 4, unverified: 0, recent: 14 });
    assert.equal((await get("/admin/customers?filter=suspended")).total, 4);
    assert.equal((await get("/admin/customers?filter=recent&page=1")).total, 14);
    assert.equal((await get("/admin/customers?filter=unknown")).total, 23);
    assert.equal((await get("/admin/customers?page=99")).items.length, 0);
    assert.equal((await get("/admin/customers?limit=5000")).limit, 50, "a page is never huge");
    assert.equal((await get("/admin/customers?page=-3&limit=abc")).items.length, 20);
  });

  await t.test("customers: search is text, never a pattern", async () => {
    const found = async (text) => (await get(`/admin/customers?search=${encodeURIComponent(text)}`)).items.map((user) => user.email);
    assert.deepEqual(await found("guest01 o'neil (vip)"), [first.email], "first and last name together");
    assert.deepEqual(await found("guest02@LISTS"), [second.email]);
    assert.deepEqual(await found("0209998887"), [first.email]);
    assert.deepEqual(await found(".*"), []);
    assert.equal((await call(`/admin/customers?search=${"x".repeat(101)}`)).code, 400);
    assert.equal((await call("/admin/customers?search=a&search=b")).code, 400);
  });

  await t.test("customers: activity of the page, and of one customer", async () => {
    const { items } = await get("/admin/customers?page=1");
    assert.deepEqual(items.find((user) => user.id === first.id).activity, { inquiries: 2, offers: 1, rentals: 0, purchases: 1 });
    assert.deepEqual(items.find((user) => user.id === second.id).activity, { inquiries: 1, offers: 0, rentals: 1, purchases: 0 });
    const one = await get(`/admin/customers/${first.id}`);
    assert.equal(one.recent.length, 4);
    assert.ok(one.recent.every((entry) => entry.subject === "Beach home"));
    assert.equal(one.recent.find((entry) => entry.kind === "offer").amount, 450);
    assert.equal((await call(`/admin/customers/${agent.id}`)).code, 404, "agents aren't customers");
    assert.equal((await call("/admin/customers/not-an-id")).code, 404);
  });

  await t.test("properties: scope, counts, search, sorting and visibility", async () => {
    const listing = (title, fields) => Property.create({ title, propertyType: "Apartment", listingType: "Rent", price: 100, pricePeriod: "month", owner: agent._id, ownerType: "agent", status: "published", ...fields });
    const cheap = await listing("Cheap flat", { price: 50, views: 5 });
    const pending = await listing("Waiting flat", { status: "pending", price: 300, createdAt: new Date(Date.now() - 90 * DAY) });
    const suspendedOwner = await listing("Hidden owner flat", { owner: hidden._id, price: 200 });
    const empty = await Property.collection.insertOne({ title: "Roomless hotel", propertyType: "Hotel", listingType: "Rent", price: 0, pricePeriod: "night", owner: agent._id, ownerType: "agent", status: "draft", images: [], roomTypes: [{ active: false, pricePerNight: 5 }], createdAt: new Date() });
    const hotel = await Property.collection.insertOne({ title: "Grand hotel", propertyType: "Hotel", listingType: "Rent", price: 0, pricePeriod: "night", owner: agent._id, ownerType: "agent", status: "draft", images: [], roomTypes: [{ active: true, pricePerNight: 120 }, { active: true, pricePerNight: 90 }], createdAt: new Date() });
    await Property.updateOne({ _id: home._id }, { staleSince: new Date(), views: 9 });
    clearVisibleAgentsCache();
    const titles = async (query) => (await get(`/admin/properties?page=1&${query}`)).items.map((property) => property.title);

    const all = await get("/admin/properties?page=1");
    assert.equal(all.total, 6);
    assert.deepEqual(all.counts, { all: 6, published: 3, pending: 1, rejected: 0, suspended: 0, draft: 2 });
    assert.deepEqual(all.purposes, { Rent: 5, Sale: 1 });
    assert.equal(all.items[0].title, "Waiting flat", "review queue first, however old");
    const of = (title) => all.items.find((property) => property.title === title);
    assert.equal(of("Cheap flat").ownerName, "Kofi Mensah");
    assert.equal(of("Beach home").ownerName, "NyaFie");
    assert.deepEqual(["Beach home", "Cheap flat", "Hidden owner flat", "Waiting flat"].map((title) => of(title).isPublic), [true, true, false, false]);
    assert.deepEqual(all.stale.map((property) => property.title), ["Beach home"]);
    assert.equal(all.empty, false);

    assert.deepEqual(await titles("sort=priceAsc"), ["Cheap flat", "Grand hotel", "Hidden owner flat", "Waiting flat", "Beach home", "Roomless hotel"], "hotels by their cheapest open room; no price last");
    assert.deepEqual(await titles("sort=priceDesc"), ["Beach home", "Waiting flat", "Hidden owner flat", "Grand hotel", "Cheap flat", "Roomless hotel"]);
    assert.deepEqual((await titles("sort=views")).slice(0, 2), ["Beach home", "Cheap flat"]);
    assert.deepEqual(await titles("status=pending"), ["Waiting flat"]);
    assert.deepEqual(await titles("purpose=Sale"), ["Beach home"]);
    assert.deepEqual(await titles("ownerType=admin"), ["Beach home"]);
    assert.deepEqual(await titles("search=labadi"), ["Beach home"]);
    assert.deepEqual(await titles("search=nyafie"), ["Beach home"]);
    assert.equal((await titles("search=kofi%20mensah")).length, 4, "by owner");
    assert.deepEqual(await titles("search=kofi&status=pending"), ["Waiting flat"]);
    const owned = await get(`/admin/properties?page=1&owner=${agent.id}&status=pending`);
    assert.deepEqual([owned.total, owned.counts.all, owned.ownerName], [1, 4, "Kofi Mensah"], "tabs count the whole collection");
    assert.equal((await call("/admin/properties?page=1&owner=nope")).code, 400);
    assert.deepEqual((await get("/admin/properties?page=2&limit=4")).items.length, 2);

    assert.equal((await get(`/admin/properties/${pending.id}`)).title, "Waiting flat");
    assert.equal((await call(`/admin/properties/${new mongoose.Types.ObjectId()}`)).code, 404);
    assert.equal((await get("/admin/properties")).length, 6, "without ?page the whole list, as before");
    assert.ok(cheap && suspendedOwner && empty && hotel);
  });

  await t.test("payments: one ledger of rentals, sales and subscriptions", async () => {
    const payment = (n, fields) => Payment.create({ kind: "rental", customer: first._id, property: home._id, owner: admin._id, ownerType: "admin", amount: 100, method: "Paystack", reference: `PAY-${n}`, status: "paid", environment: "test", paidAt: new Date(Date.now() - n * DAY), ...fields });
    for (let n = 1; n <= 20; n++) await payment(n, n === 1 ? { customer: second._id } : {});
    await payment(21, { kind: "sale", method: "Office", status: "paid", amount: 1000 });
    const lost = await payment(22, { disputeStatus: "lost", disputeLost: 40 });
    const waiting = await payment(23, { status: "refund_required" });
    const later = await payment(24, { status: "failed" });
    const plan = await Plan.create({ name: "List plan", price: 80, duration: 30, propertyLimit: 5, imageLimit: 5 });
    await Subscription.create({ user: agent._id, plan: plan._id, planName: plan.name, amount: 80, paymentReference: "SUB-1", paymentStatus: "paid", status: "active", paidAt: new Date(), environment: "test" });
    const dispute = async (record, fields) => {
      const created = await Dispute.create({ disputeId: String(Math.floor(Math.random() * 1e9)), environment: "test", source: "payment", payment: record._id, reference: record.reference, customer: first._id, amount: 100, disputedAmount: 100, ...fields });
      await Payment.updateOne({ _id: record._id }, { dispute: created._id });
    };
    await dispute(lost, { outcome: "lost", lostAmount: 40 });
    await dispute(later, { outcome: "open", providerStatus: "awaiting-bank-feedback", dueAt: new Date(Date.now() + DAY) });
    await dispute(waiting, { outcome: "open", providerStatus: "awaiting-merchant-feedback", dueAt: new Date(Date.now() + 5 * DAY) });

    const one = await get("/admin/payments?page=1"), two = await get("/admin/payments?page=2");
    assert.deepEqual([one.total, one.pages, one.items.length, two.items.length], [25, 2, 20, 5]);
    assert.deepEqual(one.counts, { all: 25, rental: 23, sale: 1, subscription: 1, disputed: 3 });
    assert.equal(one.paidTotal, 20 * 100 + 1000 + 60 + 80, "what a lost dispute took back comes off");
    assert.equal(one.items[0].source, "subscription");
    assert.equal(one.items[0].record.user.firstName, "Kofi");
    assert.equal(one.items[1].record.customer.firstName, "Guest02");
    const references = [...one.items, ...two.items].map(({ record }) => record.reference || record.paymentReference);
    assert.equal(new Set(references).size, 25);
    assert.deepEqual(references, ["SUB-1", ...Array.from({ length: 24 }, (_, i) => `PAY-${i + 1}`)], "newest first");
    assert.equal(one.openDisputes.total, 2);
    assert.deepEqual(one.openDisputes.items.map((item) => item.reference), ["PAY-23", "PAY-24"], "ours to answer first, then the deadline");

    const only = async (query) => get(`/admin/payments?page=1&${query}`);
    assert.deepEqual([(await only("type=sale")).total, (await only("type=sale")).paidTotal], [1, 1000]);
    assert.equal((await only("type=subscription")).total, 1);
    assert.equal((await only("type=disputed")).total, 3);
    assert.equal((await only("search=pay-21")).items[0].record.reference, "PAY-21");
    assert.equal((await only("search=guest02%20test")).total, 1);
    assert.equal((await only("search=beach")).total, 24);
    assert.equal((await only("search=agent%20subscription")).total, 1);
    assert.equal((await only("search=.*")).total, 0);
    assert.equal((await get("/admin/payments")).length, 24, "without ?page the whole list, as before");
  });

  await t.test("badges: one request counts what waits for an answer, for admins and for each agent", async () => {
    await Viewing.collection.insertMany([
      { owner: agent._id, ownerType: "agent", customer: first._id, property: home._id, status: "requested", proposedBy: "customer", scheduledAt: new Date(), openKey: "a" },
      { owner: agent._id, ownerType: "agent", customer: second._id, property: home._id, status: "requested", proposedBy: "owner", scheduledAt: new Date(), openKey: "b" },
    ]);
    const counts = await get("/admin/counts");
    assert.deepEqual(counts.work, { offers: 1, rentals: 1, sales: 1, officePayments: 0, viewings: 1 });
    assert.equal(counts.pendingListings, 1);
    assert.equal(counts.newInquiries, 2);
    const mine = await call("/agents/counts", agent, "agent");
    assert.equal(mine.code, 200, JSON.stringify(mine));
    assert.deepEqual(mine.data.work, { offers: 0, rentals: 0, sales: 1, officePayments: 0, viewings: 1 });
    await Offer.updateOne({ _id: offer._id }, { status: "rejected" });
    assert.equal((await get("/admin/counts")).work.offers, 0);
  });
});
