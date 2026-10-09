import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Plan from "../models/Plan.js";
import Property from "../models/Property.js";
import Inquiry from "../models/Inquiry.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Offer from "../models/Offer.js";
import Rental from "../models/Rental.js";
import SaleRequest from "../models/SaleRequest.js";
import Payment from "../models/Payment.js";
import Review from "../models/Review.js";
import Subscription from "../models/Subscription.js";
import TeamInvite from "../models/TeamInvite.js";
import Notification from "../models/Notification.js";
import Setting from "../models/Setting.js";
import authRoutes from "../routes/authRoutes.js";
import adminRoutes from "../routes/adminRoutes.js";
import agentRoutes from "../routes/agentRoutes.js";
import propertyRoutes from "../routes/propertyRoutes.js";
import teamRoutes from "../routes/teamRoutes.js";
import { activateSubscription } from "../controllers/subscriptionController.js";
import { memoryModel, q } from "./support/memoryModels.js";

const DAY = 24 * 60 * 60 * 1000;
const PASSWORD = "correct-horse-1";
const HASH = bcrypt.hashSync(PASSWORD, 4);

test("removing a provider ends access and public presence, keeps history; permanent delete is separate", async (t) => {
  process.env.JWT_KEY = "provider-removal-test-key";
  const person = (first, last, fields = {}) => new User({ firstName: first, lastName: last, email: `${first.toLowerCase()}.${crypto.randomUUID()}@example.test`, phone: "+233241234567", password: HASH, role: "agent", isActive: true, ...fields });
  const approved = (agentType, companyName = "") => ({ status: "approved", agentType, companyName, profileCompletedAt: new Date(), approvedAt: new Date() });

  const admin = person("Platform", "Admin", { role: "admin" });
  const customer = person("Ama", "Owusu", { role: "user" });
  const company = person("Kofi", "Mensah", { agentApplication: approved("company", "Prime Properties Ltd") });
  const manager = person("Efua", "Asante", { agentApplication: approved("company", "Prime Properties Ltd"), agency: { owner: company._id, role: "manager", joinedAt: new Date() } });
  const staffAgent = person("Yaw", "Boateng", { agentApplication: approved("company", "Prime Properties Ltd"), agency: { owner: company._id, role: "agent", joinedAt: new Date() } });
  const individual = person("Kwame", "Darko", { agentApplication: approved("individual") });
  const agency = person("Akosua", "Frimpong", { agentApplication: approved("agency", "Coastline Homes") });
  const agencyStaff = person("Esi", "Quaye", { agentApplication: approved("agency", "Coastline Homes"), agency: { owner: agency._id, role: "agent", joinedAt: new Date() } });

  const plan = new Plan({ name: "Company Starter", accountType: "company", price: 2000, duration: 30, propertyLimit: 50, imageLimit: 10, teamMemberLimit: 5, sortOrder: 1 });
  const paidSub = new Subscription({ user: company._id, plan: plan._id, planName: plan.name, accountType: "company", status: "active", paymentStatus: "paid", amount: 2000, paymentReference: "HB-PAID", startDate: new Date(Date.now() - 5 * DAY), expiresAt: new Date(Date.now() + 25 * DAY) });
  company.subscription = paidSub._id;
  const lateSub = new Subscription({ user: company._id, plan: plan._id, planName: plan.name, accountType: "company", status: "pending", paymentStatus: "pending", amount: 2000, paymentReference: "HB-LATE" });
  const failedSub = new Subscription({ user: individual._id, plan: plan._id, planName: plan.name, status: "pending", paymentStatus: "failed", amount: 150, paymentReference: "HB-FAILED" });

  const listing = (owner, title, status, fields = {}) => new Property({ title, owner: owner._id, ownerType: "agent", status, listingType: "Rent", price: 2000, contact: { id: String(owner._id), name: "Office", phone: "+233200000000", email: "office@example.test" }, ...fields });
  const withHistory = listing(company, "Airport Residences", "published");
  const inReview = listing(company, "East Legon Villa", "pending", { assignedTo: manager._id });
  const draft = listing(company, "Unfinished draft", "draft");
  const untouched = listing(company, "Quiet Listing", "published");
  const soloDraft = listing(individual, "Solo draft", "draft");
  const agencyListing = listing(agency, "Coastline Flat", "published", { assignedTo: agencyStaff._id });
  customer.savedProperties = [untouched._id, withHistory._id];

  const users = memoryModel(t, User, [admin, customer, company, manager, staffAgent, individual, agency, agencyStaff]);
  memoryModel(t, Plan, [plan]);
  const properties = memoryModel(t, Property, [withHistory, inReview, draft, untouched, soloDraft, agencyListing]);
  const inquiries = memoryModel(t, Inquiry, [new Inquiry({ property: withHistory._id, customer: customer._id, agent: company._id, name: "Ama", email: "ama@example.test", message: "Is it available?" })]);
  const conversation = new Conversation({ property: withHistory._id, customer: customer._id, owner: company._id, ownerType: "agent", status: "open" });
  const conversations = memoryModel(t, Conversation, [conversation]);
  const messages = memoryModel(t, Message, [new Message({ conversation: conversation._id, sender: company._id, message: "Yes, it is." })]);
  memoryModel(t, Offer, []);
  memoryModel(t, Rental, []);
  memoryModel(t, SaleRequest, []);
  memoryModel(t, Review, []);
  const payments = memoryModel(t, Payment, [new Payment({ kind: "rental", customer: customer._id, property: withHistory._id, owner: company._id, ownerType: "agent", amount: 2000, method: "Paystack", reference: "PAY-1", status: "paid" })]);
  const subscriptions = memoryModel(t, Subscription, [paidSub, lateSub, failedSub]);
  const inviteToken = crypto.randomBytes(24).toString("hex");
  const invites = memoryModel(t, TeamInvite, [new TeamInvite({ agency: company._id, role: "agent", tokenHash: crypto.createHash("sha256").update(inviteToken).digest("hex"), expiresAt: new Date(Date.now() + 5 * DAY) })]);
  const notifications = memoryModel(t, Notification, [new Notification({ recipient: company._id, audience: "user", type: "status", title: "Welcome" }), new Notification({ recipient: individual._id, audience: "user", type: "status", title: "Welcome" })]);
  t.mock.method(Setting, "findOneAndUpdate", () => q({ key: "platform", general: { siteName: "HomeBase" }, agent: { requireSubscription: true }, property: { maxImages: 20, allowAgentPublishing: true, requireApproval: false }, payments: { subscriptionsEnabled: true } }));

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", authRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/agents", agentRoutes);
  app.use("/api/properties", propertyRoutes);
  app.use("/api/team", teamRoutes);
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ success: false, message: err.message })); // eslint-disable-line no-unused-vars
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (session, user, method, path, body) => {
    const headers = { "Content-Type": "application/json", "X-Session-Domain": session };
    if (user) headers.Cookie = `${session}_token=${jwt.sign({ id: String(user._id), role: session === "customer" ? "user" : session, session }, process.env.JWT_KEY, { expiresIn: "1h" })}`;
    const response = await fetch(`${base}${path}`, { method, headers, body: body && JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const asAdmin = (method, path, body) => call("admin", admin, method, path, body);
  const asAgent = (user, method, path, body) => call("agent", user, method, path, body);
  const login = (user) => call("agent", null, "POST", "/auth/agent/login", { email: user.email, password: PASSWORD });

  await t.test("only HomeBase admins can remove providers", async () => {
    assert.equal((await asAgent(manager, "POST", `/admin/agents/${company._id}/remove`, { reason: "fraud" })).status, 403, "an agent session is refused");
    assert.equal((await call("admin", null, "POST", `/admin/agents/${company._id}/remove`, { reason: "fraud" })).status, 401, "no admin sign-in");
    assert.equal((await asAdmin("POST", `/admin/agents/${company._id}/remove`, {})).status, 400, "a reason is required");
    assert.equal(company.isActive, true);
  });

  await t.test("the confirmation shows what removing a company will change", async () => {
    const { status, body } = await asAdmin("GET", `/admin/agents/${company._id}/removal`);
    assert.equal(status, 200);
    assert.deepEqual({ kind: body.data.kind, listings: body.data.listings, staff: body.data.staff, invites: body.data.invites, conversations: body.data.conversations, plan: body.data.subscription?.planName }, { kind: "organisation", listings: 3, staff: 2, invites: 1, conversations: 1, plan: "Company Starter" });
  });

  await t.test("removing a company: account, listings, team, invites, plan and chats", async () => {
    const before = { inquiries: inquiries.docs.length, payments: payments.docs.length, messages: messages.docs.length, properties: properties.docs.length, users: users.docs.length };
    const { status, body } = await asAdmin("POST", `/admin/agents/${company._id}/remove`, { reason: "fraud", note: "Chargebacks from three customers" });
    assert.equal(status, 200);
    assert.equal(body.data.listingsHidden, 3);
    assert.equal(company.isActive, false);
    assert.equal(company.agentApplication.status, "removed");
    assert.equal(company.removal.reason, "fraud");
    assert.equal(String(company.removal.removedBy), String(admin._id));
    for (const [listing, was] of [[withHistory, "published"], [inReview, "pending"], [untouched, "published"]]) {
      assert.equal(listing.status, "suspended", `${listing.title} is off the marketplace`);
      assert.equal(listing.providerRemoval.statusBefore, was);
    }
    assert.equal(draft.status, "draft", "drafts were never public");
    assert.equal(String(inReview.assignedTo), String(manager._id), "who handled a listing stays on record");
    assert.ok(invites.docs[0].revokedAt, "pending invites are revoked");
    assert.equal(conversation.status, "closed");
    assert.equal(paidSub.status, "cancelled");
    assert.equal(paidSub.paymentStatus, "paid", "the payment record itself is unchanged");
    for (const member of [manager, staffAgent]) {
      assert.equal(member.agency, undefined, "membership ended");
      assert.equal(member.pastMemberships.at(-1).reason, "organisation-removed");
      assert.equal(String(member.pastMemberships.at(-1).owner), String(company._id), "team history kept");
      assert.equal(member.isActive, true, "their own account stays usable");
      assert.equal(member.agentApplication.status, "incomplete");
    }
    assert.ok(notifications.docs.some((n) => String(n.recipient) === String(manager._id) && /no longer have access/.test(n.title)));
    assert.deepEqual({ inquiries: inquiries.docs.length, payments: payments.docs.length, messages: messages.docs.length, properties: properties.docs.length, users: users.docs.length }, before, "nothing was deleted");
    assert.equal((await asAdmin("POST", `/admin/agents/${company._id}/remove`, { reason: "fraud" })).status, 409, "can't be removed twice");
  });

  await t.test("the removed owner can't sign in, and their old token stops working", async () => {
    const attempt = await login(company);
    assert.equal(attempt.status, 403);
    assert.match(attempt.body.message, /no longer active/);
    assert.doesNotMatch(attempt.body.message, /fraud|chargeback/i, "internal reasons are never shown");
    assert.equal((await asAgent(company, "GET", "/auth/agent/me")).status, 401);
    assert.equal((await asAgent(company, "POST", "/properties", { title: "New listing", status: "draft" })).status, 401);
    assert.equal((await asAgent(company, "PUT", `/properties/${withHistory._id}`, { title: "Edited" })).status, 401);
    assert.equal((await asAgent(company, "POST", "/agents/team/invites", { role: "agent" })).status, 401);
  });

  await t.test("former staff keep their own account but lose the organisation", async () => {
    assert.equal((await login(manager)).status, 200, "their HomeBase account still signs in");
    assert.equal((await asAgent(manager, "PUT", `/properties/${inReview._id}`, { title: "Edited" })).status, 403, "can't edit the company's listing they handled");
    assert.equal((await asAgent(staffAgent, "GET", "/agents/inquiries")).status, 403);
    assert.equal((await asAgent(manager, "POST", "/properties", { title: "x", status: "draft", owner: String(company._id), organizationId: String(company._id) })).status, 403, "sending the company's id doesn't help");
  });

  await t.test("the removed company's invite links no longer work", async () => {
    assert.equal((await call("customer", null, "GET", `/team/invites/${inviteToken}`)).status, 404);
  });

  await t.test("a removed provider's plan can't be revived by an admin or a late payment", async () => {
    assert.equal((await asAdmin("PATCH", `/admin/agents/${company._id}/subscription`, { action: "extend", days: 30 })).status, 409);
    await activateSubscription(lateSub);
    assert.equal(lateSub.paymentStatus, "paid", "the money is recorded");
    assert.notEqual(lateSub.status, "active", "but no plan starts");
    assert.equal(String(company.subscription), String(paidSub._id));
  });

  await t.test("restore brings back the account only, unless listings are asked for", async () => {
    let result = await asAdmin("POST", `/admin/agents/${company._id}/restore`, {});
    assert.equal(result.status, 200);
    assert.equal(company.agentApplication.status, "approved");
    assert.equal(company.isActive, true);
    assert.equal(withHistory.status, "suspended", "listings stay hidden by default");
    assert.equal(paidSub.status, "cancelled", "the plan isn't reactivated");
    assert.equal(manager.agency, undefined, "staff aren't added back");
    assert.equal((await login(company)).status, 200);

    await asAdmin("POST", `/admin/agents/${company._id}/remove`, { reason: "policy" });
    result = await asAdmin("POST", `/admin/agents/${company._id}/restore`, { republish: true });
    assert.equal(result.body.data.republished, 3);
    assert.deepEqual([withHistory.status, inReview.status, untouched.status, draft.status], ["published", "pending", "published", "draft"]);
    assert.equal(withHistory.providerRemoval, undefined);
  });

  await t.test("removing one staff member leaves the organisation running", async () => {
    const { status } = await asAdmin("POST", `/admin/agents/${agencyStaff._id}/remove`, { reason: "policy" });
    assert.equal(status, 200);
    assert.equal(agencyStaff.agentApplication.status, "removed");
    assert.equal(agencyStaff.agency, undefined);
    assert.equal(agencyStaff.pastMemberships.at(-1).reason, "member-removed");
    assert.equal(agencyListing.status, "published", "the agency's listing stays live");
    assert.equal(agencyListing.assignedTo, null, "their assigned work goes back to the owner");
    assert.equal(agency.isActive, true);
  });

  await t.test("permanent delete is only for removed providers, with a typed confirmation", async () => {
    assert.equal((await asAdmin("GET", `/admin/agents/${individual._id}/deletion`)).status, 409, "remove first");
    assert.equal((await asAdmin("DELETE", `/admin/agents/${individual._id}`, { confirm: "DELETE KWAME DARKO" })).status, 409);
    await asAdmin("POST", `/admin/agents/${company._id}/remove`, { reason: "closed" });
    const { body } = await asAdmin("GET", `/admin/agents/${company._id}/deletion`);
    assert.equal(body.data.mode, "anonymize", "payments, customers and team history depend on it");
    assert.equal(body.data.confirmText, "DELETE PRIME PROPERTIES LTD");
    assert.equal(body.data.rows.find((row) => row.key === "payments").action, "preserve");
    assert.equal(body.data.references, undefined, "internal ids aren't sent to the browser");
    assert.equal((await asAdmin("DELETE", `/admin/agents/${company._id}`, { confirm: "DELETE PRIME" })).status, 400);
    assert.equal(company.firstName, "Kofi", "nothing happens without the exact confirmation");
  });

  await t.test("a provider with history is anonymised; money, customer and team records stay intact", async () => {
    const { status } = await asAdmin("DELETE", `/admin/agents/${company._id}`, { confirm: "delete  prime properties ltd" });
    assert.equal(status, 200);
    assert.ok(users.docs.includes(company), "kept as a record so nothing points at a missing account");
    assert.equal(`${company.firstName} ${company.lastName}`, "Deleted agent");
    assert.match(company.email, /^deleted-.*@deleted\.homebase\.invalid$/);
    assert.equal(company.phone, "");
    assert.equal(company.agentApplication.companyName, "");
    assert.ok(company.removal.deletedAt);
    assert.equal((await login({ email: "kofi@example.test" })).status, 401);
    assert.equal(payments.docs.length, 1, "payment kept");
    assert.equal(inquiries.docs.length, 1, "customer inquiry kept");
    assert.equal(messages.docs.length, 1, "conversation history kept");
    assert.ok(subscriptions.docs.includes(paidSub) && subscriptions.docs.includes(lateSub), "billing history kept");
    assert.ok(properties.docs.includes(withHistory), "a listing customers used is kept");
    assert.equal(withHistory.contact.name, "Deleted agent");
    assert.equal(withHistory.contact.phone, "");
    assert.ok(!properties.docs.includes(untouched) && !properties.docs.includes(draft), "listings nobody used are deleted");
    assert.deepEqual(customer.savedProperties.map(String), [String(withHistory._id)], "and taken out of saved lists");
    assert.equal(invites.docs.length, 0);
    assert.ok(!notifications.docs.some((n) => String(n.recipient) === String(company._id)));
    assert.equal(String(manager.pastMemberships.at(-1).owner), String(company._id), "team history still resolves");
    assert.equal((await asAdmin("POST", `/admin/agents/${company._id}/restore`, {})).status, 409, "can't be restored after deletion");
    assert.equal((await asAdmin("GET", `/admin/agents/${company._id}/deletion`)).status, 409, "or deleted twice");
  });

  await t.test("a provider nothing depends on is erased, leaving no references behind", async () => {
    await asAdmin("POST", `/admin/agents/${individual._id}/remove`, { reason: "duplicate" });
    const plan = await asAdmin("GET", `/admin/agents/${individual._id}/deletion`);
    assert.equal(plan.body.data.mode, "erase");
    const { status } = await asAdmin("DELETE", `/admin/agents/${individual._id}`, { confirm: "DELETE KWAME DARKO" });
    assert.equal(status, 200);
    const id = String(individual._id);
    assert.ok(!users.docs.includes(individual));
    const everything = [users, properties, inquiries, conversations, messages, payments, subscriptions, invites, notifications].flatMap((store) => store.docs.map((doc) => JSON.stringify(doc.toObject())));
    assert.ok(!everything.some((json) => json.includes(id)), "no record anywhere still points at the erased account");
  });
});
