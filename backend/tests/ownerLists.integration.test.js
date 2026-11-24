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
import Conversation from "../models/Conversation.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import Setting from "../models/Setting.js";
import { clearVisibleAgentsCache } from "../utils/marketplace.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

const DAY = 86400000;
const ago = (days) => new Date(Date.now() - days * DAY);

test("owner boards, chats and the admin's agents, inquiries, plans and reports are paged and scoped by the server", { skip: process.env.RUN_OWNER_LISTS_INTEGRATION !== "1", timeout: 150000 }, async (t) => {
  const previous = process.env.JWT_KEY;
  process.env.JWT_KEY = "isolated-owner-lists-signing-key-at-least-32-characters";
  t.after(() => { if (previous === undefined) delete process.env.JWT_KEY; else process.env.JWT_KEY = previous; });
  await isolatedMongo(t);
  await Setting.create({ key: "platform", agent: { requireSubscription: true } });
  const person = (firstName, role, extra = {}) => User.create({ emailVerifiedAt: new Date(), firstName, lastName: "Test", email: `${firstName.toLowerCase()}@owner.test`, phone: "0241234567", password: "test-password-long-enough", role, ...extra });
  const application = (agentType, status = "approved", companyName = "") => ({ agentApplication: { status, agentType, companyName } });
  const admin = await person("Admin", "admin");
  const ama = await person("Ama", "agent", application("agency", "approved", "Golden Keys"));
  const staff = await person("Staff", "agent", { ...application("agency"), agency: { owner: ama._id, role: "agent" } });
  const kwesi = await person("Kwesi", "agent", application("individual"));
  const guest = await person("Guest", "user"), efua = await person("Efua", "user", { lastName: "Boateng" });
  const property = (title, owner, extra = {}) => Property.create({ title, propertyType: "House", listingType: "Sale", price: 500, pricePeriod: "total", owner: owner._id, ownerType: owner.role, status: "published", ...extra });
  const villa = await property("Villa", ama), flat = await property("Flat", ama), office = await property("Office block", admin), cottage = await property("Cottage", kwesi);
  const base = (listing, extra = {}) => ({ property: listing._id, owner: listing.owner, ownerType: listing.ownerType, customer: guest._id, ...extra });
  const contact = { contactName: "Guest Test", contactEmail: "guest@owner.test", contactPhone: "0241234567" };

  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const call = async (path, user, session) => {
    const token = jwt.sign({ id: user.id, role: { customer: "user", agent: "agent", admin: "admin" }[session], session, ...customerTabClaims(session) }, process.env.JWT_KEY, { expiresIn: "1h" });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${path}`, { headers: { "X-Session-Domain": session, ...customerTabHeaders(session), ...(session === "admin" ? adminEntryHeaders() : {}), Cookie: `${session}_token=${token}` } });
    return { ...(await response.json()), code: response.status };
  };
  const get = async (path, user = admin, session = user.role === "user" ? "customer" : user.role) => {
    const response = await call(path, user, session);
    assert.equal(response.code, 200, `${path}: ${JSON.stringify(response).slice(0, 400)}`);
    return response.data;
  };

  await t.test("offers: pages, tabs, filters, search and who sees what", async () => {
    for (let i = 1; i <= 23; i++) await Offer.create(base(i % 2 ? villa : flat, { amount: i, askingPrice: 500, status: i <= 3 ? "accepted" : "pending", createdAt: ago(i * 4), assignedTo: i === 5 ? staff._id : null }));
    await Offer.create(base(office, { amount: 900, askingPrice: 900, customer: efua._id, message: "Cash (today)", createdAt: ago(1) }));
    await Offer.create(base(cottage, { amount: 800, askingPrice: 900 }));

    const all = await get("/admin/offers");
    assert.deepEqual([all.total, all.items.length, all.pages], [25, 20, 2]);
    assert.deepEqual(all.counts, { All: 25, pending: 22, countered: 0, accepted: 3, rejected: 0, withdrawn: 0 });
    assert.deepEqual(all.options.owners.map((owner) => owner.name), ["NyaFie", "Ama Test", "Kwesi Test"]);
    assert.deepEqual(all.options.properties.map((p) => p.title), ["Cottage", "Flat", "Office block", "Villa"]);
    assert.equal((await get(`/admin/offers?owner=${ama.id}`)).total, 23);
    assert.deepEqual((await get("/admin/offers?owner=admin")).items.map((offer) => offer.amount), [900]);
    assert.equal((await get("/admin/offers?search=efua%20boateng")).total, 1);
    assert.equal((await get("/admin/offers?search=office%20b")).total, 1);
    assert.equal((await get(`/admin/offers?search=${encodeURIComponent("cash (today)")}`)).total, 1);
    assert.equal((await get("/admin/offers?search=.*")).total, 0);

    const amas = await get("/agents/offers?page=1", ama);
    assert.deepEqual([amas.total, amas.stats], [23, { all: 23, respond: 20, accepted: 3, closed: 0 }]);
    assert.deepEqual(amas.options.owners, [], "agents don't choose an owner");
    assert.equal((await get("/agents/offers?page=2", ama)).items.length, 3);
    assert.equal((await get(`/agents/offers?property=${flat.id}&tab=accepted`, ama)).total, 1);
    assert.deepEqual((await get(`/agents/offers?property=${flat.id}`, ama)).counts.All, 11, "tabs count the listing chosen");
    assert.equal((await get("/agents/offers?range=7", ama)).total, 1);
    assert.equal((await get(`/agents/offers?owner=${kwesi.id}`, ama)).total, 23, "the owner filter is for admins only");
    assert.equal((await get(`/agents/offers?property=${cottage.id}`, ama)).total, 0, "another agent's listing shows nothing");
    assert.deepEqual((await get("/agents/offers", staff)).items.map((offer) => offer.amount), [5], "staff: only what is assigned to them");
    assert.equal((await get("/agents/offers", kwesi)).total, 1);
    assert.equal((await get("/agents/offers?limit=3", ama)).items.length, 3);
    assert.equal((await get("/agents/property-activity", ama))[flat.id].offers, 11);
    assert.equal((await get("/agents/property-activity", ama))[cottage.id], undefined);
  });

  await t.test("rentals: tabs, rooms, stats", async () => {
    const hotel = (await Property.collection.insertOne({ title: "Grand hotel", propertyType: "Hotel", listingType: "Rent", price: 0, pricePeriod: "night", owner: ama._id, ownerType: "agent", status: "published", images: [], roomTypes: [] })).insertedId;
    const room = new mongoose.Types.ObjectId();
    const rental = (status, extra = {}) => Rental.create({ ...base(flat), ...contact, startDate: ago(-10), endDate: ago(-20), pricePeriod: "month", unitPrice: 100, units: 1, amount: 100, status, ...extra });
    await rental("pending"); await rental("paid"); await rental("active", { customer: efua._id }); await rental("completed"); await rental("cancelled");
    await rental("confirmed", { property: hotel, hotelId: hotel, roomTypeId: room, roomName: "Deluxe", numberOfRooms: 1, pricePeriod: "night", bookingCode: "NFB-123" });
    await rental("confirmed", { pricePeriod: "night", startDate: ago(5), endDate: ago(1) });
    const data = await get("/agents/rentals", ama);
    assert.deepEqual(data.counts, { All: 7, Action: 3, Payment: 1, Active: 1, CheckIns: 1, Closed: 2 });
    assert.deepEqual(data.stats, { action: 3, payment: 1, active: 1, completed: 1 });
    assert.deepEqual(data.rooms, [{ id: String(room), name: "Deluxe", hotel: "Grand hotel" }]);
    assert.equal((await get(`/agents/rentals?room=${room}`, ama)).total, 1);
    assert.equal((await get("/agents/rentals?search=nfb-123", ama)).items[0].roomName, "Deluxe");
    assert.equal((await get("/agents/rentals?tab=CheckIns", ama)).total, 1, "past check-ins aren't upcoming");
    assert.equal((await get("/admin/rentals")).total, 7);
    assert.equal((await get("/agents/rentals", kwesi)).total, 0);
    assert.equal((await get("/agents/rentals", kwesi)).empty, true);
  });

  await t.test("sale requests: open by default", async () => {
    const sale = (status, extra = {}) => SaleRequest.create({ ...base(villa), ...contact, askingPrice: 500, status, ...extra });
    await sale("pending"); await sale("payment_pending", { customer: efua._id }); await sale("completed"); await sale("rejected");
    await sale("paid_at_office", { paymentStatus: "confirmed" });
    const data = await get("/agents/sale-requests", ama);
    assert.equal(data.tab, "open");
    assert.deepEqual([data.total, data.counts], [3, { open: 3, payment: 1, completed: 1, closed: 1, all: 5 }]);
    assert.deepEqual(data.stats, { open: 3, payment: 1, received: 1, completed: 1 });
    assert.equal((await get("/admin/sale-requests?tab=all")).total, 5);
    assert.equal((await get("/admin/sale-requests?tab=all&search=0241234567")).total, 5);
  });

  await t.test("viewings: what needs an answer first, soonest first", async () => {
    let key = 0;
    const viewing = (status, days, proposedBy = "customer") => Viewing.create({ ...base(villa), contactName: "Guest Test", contactPhone: "024", scheduledAt: ago(-days), proposedBy, status, openKey: `k${++key}` });
    await viewing("requested", 5); await viewing("requested", 2); await viewing("confirmed", -1); // to answer, and one to mark
    await viewing("confirmed", 3); await viewing("requested", 9, "owner"); await viewing("completed", -4); await viewing("cancelled", 4);
    const data = await get("/agents/viewings", ama);
    assert.equal(data.tab, "action");
    assert.deepEqual(data.counts, { action: 3, upcoming: 2, past: 2 });
    assert.deepEqual(data.stats, { action: 3, upcoming: 2, week: 1, completed: 1 });
    const times = data.items.map((item) => new Date(item.scheduledAt).getTime());
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
    const past = (await get("/agents/viewings?tab=past", ama)).items.map((item) => item.status);
    assert.deepEqual(past, ["cancelled", "completed"], "latest first");
    assert.equal((await get("/agents/viewings", kwesi)).tab, "upcoming", "nothing to answer");
  });

  await t.test("chats: pages, tabs and search for each side", async () => {
    const chat = (listing, extra = {}) => Conversation.collection.insertOne({ ...base(listing), status: "open", customerUnread: 0, ownerUnread: 0, lastMessage: "Hello", lastMessageAt: new Date(), ...extra });
    for (let i = 0; i < 22; i++) await chat(villa, { customer: i ? new mongoose.Types.ObjectId() : guest._id, ownerUnread: i === 1 ? 2 : 0, lastMessageAt: ago(i) });
    await chat(flat, { customer: efua._id, lastMessage: "Is it near school?", status: "closed" });
    await chat(office, { customer: efua._id, customerUnread: 1 });
    const amas = await get("/agents/messages", ama);
    assert.deepEqual([amas.total, amas.items.length, amas.counts], [22, 20, { all: 22, unread: 1, closed: 1 }]);
    assert.equal((await get("/agents/messages?page=2", ama)).items.length, 2);
    assert.equal((await get("/agents/messages?tab=unread", ama)).total, 1);
    assert.equal((await get("/agents/messages?tab=closed&search=near%20school", ama)).total, 1);
    assert.equal((await get("/agents/messages?tab=closed&search=efua", ama)).total, 1);
    assert.deepEqual((await get("/admin/messages")).items.map((item) => item.property.title), ["Office block"], "admins: only the platform's own listings");
    const efuas = await get("/messages", efua);
    assert.deepEqual([efuas.total, efuas.counts], [1, { all: 1, unread: 1, closed: 1 }]);
    assert.equal((await get("/messages?search=nyafie", efua)).total, 1);
    assert.equal((await get("/messages", guest)).total, 1);
  });

  await t.test("agents and subscriptions", async () => {
    const plan = await Plan.create({ name: "Gold", price: 100, duration: 30, propertyLimit: 5, imageLimit: 5 });
    const other = await Plan.create({ name: "Silver", price: 50, duration: 30, propertyLimit: 5, imageLimit: 5 });
    const subscribe = async (user, fields) => {
      const created = await Subscription.create({ user: user._id, plan: plan._id, planName: plan.name, amount: 100, paymentReference: `S-${Math.random()}`, paymentStatus: "paid", status: "active", startDate: ago(1), expiresAt: ago(-20), paidAt: new Date(), ...fields });
      await User.updateOne({ _id: user._id }, { subscription: created._id });
      return created;
    };
    await subscribe(ama, {});
    await subscribe(kwesi, { expiresAt: ago(-3), plan: other._id, planName: "Silver", disputeLost: 40 });
    const late = await person("Late", "agent", application("individual")), unpaid = await person("Unpaid", "agent", application("company"));
    const removed = await person("Removed", "agent", application("individual", "removed"));
    await subscribe(late, { expiresAt: ago(2), paidAt: ago(400) });
    await subscribe(unpaid, { status: "pending", paymentStatus: "pending" });
    await subscribe(removed, { status: "cancelled" });
    await User.updateOne({ _id: late._id }, { isActive: false });
    await Inquiry.create([{ property: villa._id, agent: ama._id, ownerType: "agent", name: "Guest", email: "a@b.test", message: "One" }, { property: flat._id, agent: ama._id, ownerType: "agent", name: "Guest", email: "a@b.test", message: "Two", status: "closed" }, { property: office._id, ownerType: "admin", name: "Efua", email: "e@b.test", message: "Office?", status: "inProgress", createdAt: ago(40) }]);
    clearVisibleAgentsCache();

    const all = await get("/admin/providers");
    assert.deepEqual(all.counts, { all: 5, active: 2, expiring: 1, expired: 1, pending: 1, cancelled: 0, suspended: 1, unverified: 0, new: 5, removed: 1 });
    assert.equal(all.total, 5);
    const row = all.items.find((item) => item.firstName === "Ama");
    assert.deepEqual(row.stats, { properties: 3, live: 3, featured: 0, inquiries: 2, newInquiries: 1, team: 1 });
    assert.equal(row.activeProperties, 3);
    assert.equal(row.subscription.planName, "Gold");
    assert.equal(row.password, undefined);
    const names = async (query) => (await get(`/admin/providers?${query}`)).items.map((item) => item.firstName).sort();
    assert.deepEqual(await names("status=active"), ["Ama", "Kwesi"]);
    assert.deepEqual(await names("status=removed"), ["Removed"]);
    assert.deepEqual(await names(`plan=${other.id}`), ["Kwesi"]);
    assert.deepEqual(await names("accountType=company"), ["Unpaid"]);
    assert.deepEqual(await names("search=golden%20keys"), ["Ama"]);
    assert.deepEqual(await names("search=silver"), ["Kwesi"]);
    const subscribed = await get("/admin/providers?subscribed=1&sort=expiry");
    assert.equal(subscribed.total, 4, "staff have no subscription of their own");
    assert.deepEqual(subscribed.items.map((item) => item.firstName), ["Late", "Kwesi", "Ama", "Unpaid"].sort((a, b) => subscribed.items.findIndex((i) => i.firstName === a) - subscribed.items.findIndex((i) => i.firstName === b)));
    assert.equal(subscribed.items[0].firstName, "Late", "soonest to expire first");
    const one = await get(`/admin/providers/${ama.id}`);
    assert.deepEqual([one.listings.length, one.payments.length, one.listings.every((listing) => listing.isPublic)], [3, 1, true]);
    assert.equal((await call(`/admin/providers/${guest.id}`, admin, "admin")).code, 404);

    const plans = await get("/admin/plan-summary");
    assert.deepEqual([plans.providers, plans.activeSubscribers], [5, 2]);
    assert.deepEqual(plans.byPlan[plan.id], { total: 3, active: 1 });
    assert.equal(plans.revenue.length, 8);
    assert.equal(plans.revenue.at(-1).total, 100 + 60 + 100, "this month, less what a lost dispute took back");
  });

  await t.test("inquiries and reports", async () => {
    const all = await get("/admin/inquiries?page=1");
    assert.deepEqual([all.total, all.counts], [3, { all: 3, new: 1, contacted: 0, inProgress: 1, closed: 1 }]);
    assert.deepEqual(all.items.map((item) => item.ownerName).sort(), ["Ama Test", "Ama Test", "NyaFie"]);
    assert.equal((await get("/admin/inquiries?page=1&agent=admin")).total, 1);
    assert.deepEqual((await get(`/admin/inquiries?page=1&agent=${ama.id}`)).options.properties.map((p) => p.title), ["Flat", "Villa"]);
    assert.equal((await get("/admin/inquiries?page=1&range=30")).total, 2);
    assert.equal((await get("/admin/inquiries?page=1&search=office")).total, 1);
    assert.equal((await get("/admin/inquiries?page=1&status=closed")).items[0].message, "Two");

    const report = await get("/admin/report-data");
    assert.equal(report.users.length, 8);
    const text = JSON.stringify(report);
    for (const secret of ["@owner.test", "Boateng", "024", "password", "Villa"]) assert.ok(!text.includes(secret), `${secret} isn't in the report data`);
    assert.equal(report.payments.reduce((sum, payment) => sum + payment.received, 0), 100 + 60 + 100 + 100);
  });

  await t.test("only admins reach the admin lists", async () => {
    for (const path of ["/admin/providers", `/admin/providers/${ama.id}`, "/admin/plan-summary", "/admin/report-data", "/admin/inquiries?page=1", "/admin/offers", "/admin/messages"]) {
      assert.ok([401, 403, 404].includes((await call(path, ama, "agent")).code), path);
      assert.ok([401, 403, 404].includes((await call(path, guest, "customer")).code), path);
    }
    for (const path of ["/agents/offers", "/agents/rentals", "/agents/sale-requests", "/agents/viewings", "/agents/property-activity", "/agents/messages"]) assert.ok([401, 403].includes((await call(path, guest, "customer")).code), path);
  });
});
