import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { customerTabClaims, customerTabHeaders } from "./support/customerTab.js";
import { isolatedMongo } from "./support/isolatedMongo.js";
import { createApp } from "../app.js";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Payment from "../models/Payment.js";
import SaleRequest from "../models/SaleRequest.js";
import Offer from "../models/Offer.js";
import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";
import Setting from "../models/Setting.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import Review from "../models/Review.js";
import Notification from "../models/Notification.js";
import { syncPropertyRating } from "../utils/reviews.js";
import Viewing from "../models/Viewing.js";
import DocumentCheck from "../models/DocumentCheck.js";
import { cloudinary } from "../config/cloudinary.js";
import TeamInvite from "../models/TeamInvite.js";

/**
 * Multi-step changes commit together or not at all. Each case makes one write fail partway through
 * (after earlier writes of the same change already ran) and checks nothing of the change was kept,
 * then checks the change still works normally. Everything runs in a temporary database.
 */
test("transactions: multi-step changes are all-or-nothing", { skip: process.env.RUN_TRANSACTIONS_INTEGRATION !== "1", timeout: 180000 }, async (t) => {
  await isolatedMongo(t);
  process.env.JWT_KEY = "isolated-transactions-signing-key-32-characters";
  await Setting.create({ key: "platform", agent: { requireSubscription: true } });
  const plan = await Plan.create({ name: "Agency Plan", price: 0, duration: 365, propertyLimit: 50, imageLimit: 15, accountType: "agency", teamMemberLimit: 5, internalChat: true });
  const password = "test-password-long-enough";
  const admin = await User.create({ emailVerifiedAt: new Date(), firstName: "Admin", lastName: "Test", email: "admin@tx.test", password, role: "admin" });
  const owner = await User.create({ emailVerifiedAt: new Date(), firstName: "Agency", lastName: "Owner", email: "owner@tx.test", phone: "0241234567", password, role: "agent", agentApplication: { status: "approved", agentType: "agency", companyName: "Tx Homes" } });
  owner.subscription = (await Subscription.create({ user: owner._id, plan: plan._id, planName: plan.name, accountType: "agency", amount: 0, paymentReference: "tx-agency-owner", status: "active", paymentStatus: "waived", startDate: new Date(), expiresAt: new Date("2035-01-01") }))._id;
  await owner.save();
  const customer = await User.create({ emailVerifiedAt: new Date(), firstName: "Buyer", lastName: "Test", email: "buyer@tx.test", phone: "0241234567", password });

  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const SESSIONS = { admin: ["admin", "admin_token"], agent: ["agent", "agent_token"], user: ["customer", "customer_token"] };
  const as = (user) => async (path, { method = "GET", body } = {}) => {
    const [session, cookie] = SESSIONS[user.role];
    const token = jwt.sign({ id: user.id, role: user.role, session, ...customerTabClaims(session) }, process.env.JWT_KEY, { expiresIn: "1h" });
    const headers = { "Content-Type": "application/json", "X-Session-Domain": session, ...customerTabHeaders(session), Cookie: `${cookie}=${token}` };
    const response = await fetch(`${base}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { code: response.status, ...(await response.json()) };
  };
  const asAdmin = as(admin), asOwner = as(owner), asCustomer = as(customer);

  // Makes one model method fail while `run` executes (the failure lands after earlier writes)
  const failing = async (model, method, run) => {
    const original = model[method];
    model[method] = async () => { throw new Error(`Simulated ${model.modelName || model.constructor?.modelName}.${method} failure`); };
    try { return await run(); } finally { model[method] = original; }
  };
  const listing = (fields = {}) => Property.create({ title: "Tx House", description: "A house used to check transactions.", propertyType: "House", listingType: "Sale", price: 500000, pricePeriod: "total", owner: owner._id, ownerType: "agent", status: "published", availability: "Available", ...fields });
  const saleRequest = (house, fields = {}) => SaleRequest.create({ customer: customer._id, property: house._id, owner: owner._id, ownerType: "agent", askingPrice: house.price, contactName: "Buyer Test", contactEmail: customer.email, contactPhone: "0241234567", status: "payment_pending", paymentStatus: "payment_requested", ...fields });
  const chatNotes = (house) => Conversation.find({ property: house._id }).then((list) => Message.countDocuments({ conversation: { $in: list.map((c) => c._id) } }));

  await t.test("1. confirming a sale payment: request, payment record and chat note together", async () => {
    const house = await listing();
    const request = await saleRequest(house);
    const failed = await failing(Message, "create", () => asOwner(`/sale-requests/${request.id}/confirm-payment`, { method: "PATCH", body: { amount: 500000 } }));
    assert.equal(failed.code, 500);
    const unchanged = await SaleRequest.findById(request._id);
    assert.equal(unchanged.paymentStatus, "payment_requested", "the request is not left confirmed");
    assert.equal(unchanged.status, "payment_pending");
    assert.equal(await Payment.countDocuments({ saleRequest: request._id }), 0, "no payment record without its request");
    assert.equal(await chatNotes(house), 0);

    const confirmed = await asOwner(`/sale-requests/${request.id}/confirm-payment`, { method: "PATCH", body: { amount: 500000 } });
    assert.equal(confirmed.code, 200, confirmed.message);
    const saved = await SaleRequest.findById(request._id);
    assert.equal(saved.paymentStatus, "confirmed");
    assert.equal(saved.status, "paid_at_office");
    assert.equal(saved.history.at(-1).paymentStatus, "confirmed");
    assert.equal(await Payment.countDocuments({ saleRequest: request._id }), 1);
    assert.equal(await chatNotes(house), 1);
  });

  await t.test("2. completing a sale: sold, other buyers closed and offers declined together", async () => {
    const house = await listing({ availability: "Under Offer" });
    const request = await saleRequest(house, { status: "paid_at_office", paymentStatus: "confirmed" });
    const other = await saleRequest(house, { customer: owner._id }); // another open request on the same house
    const offer = await Offer.create({ customer: customer._id, property: house._id, owner: owner._id, ownerType: "agent", askingPrice: house.price, amount: 450000, status: "pending" });

    // The offers are the last write: by then the sale, the property and the other request were changed
    const failed = await failing(Offer, "updateMany", () => asOwner(`/sale-requests/${request.id}/complete`, { method: "PATCH" }));
    assert.equal(failed.code, 500);
    assert.equal((await SaleRequest.findById(request._id)).status, "paid_at_office", "sale not completed");
    assert.equal((await Property.findById(house._id)).availability, "Under Offer", "property not marked sold");
    assert.equal((await SaleRequest.findById(other._id)).status, "payment_pending", "other buyer's request still open");
    assert.equal((await Offer.findById(offer._id)).status, "pending");
    assert.equal(await chatNotes(house), 0);

    const completed = await asOwner(`/sale-requests/${request.id}/complete`, { method: "PATCH" });
    assert.equal(completed.code, 200, completed.message);
    assert.equal((await SaleRequest.findById(request._id)).status, "completed");
    assert.equal((await Property.findById(house._id)).availability, "Sold");
    assert.equal((await SaleRequest.findById(other._id)).status, "cancelled");
    assert.equal((await Offer.findById(offer._id)).status, "rejected");
    assert.ok([400, 409].includes((await asOwner(`/sale-requests/${request.id}/complete`, { method: "PATCH" })).code), "completing twice is refused");
    // Two clicks at once: only one completes (the other conflicts, retries and is refused)
    const again = await listing({ availability: "Under Offer" });
    const twice = await saleRequest(again, { status: "paid_at_office", paymentStatus: "confirmed" });
    const results = await Promise.all([1, 2].map(() => asOwner(`/sale-requests/${twice.id}/complete`, { method: "PATCH" })));
    assert.deepEqual(results.map((r) => r.code).sort(), [200, 409], JSON.stringify(results.map((r) => [r.code, r.message])));
    assert.equal((await SaleRequest.findById(twice._id)).history.filter((h) => h.status === "completed").length, 1, "completed once");
  });

  await t.test("3. answering an offer: answer, property reservation and chat note together", async () => {
    const house = await listing();
    const offer = await Offer.create({ customer: customer._id, property: house._id, owner: owner._id, ownerType: "agent", askingPrice: house.price, amount: 480000, status: "pending" });
    // The chat note runs after the property was reserved
    const failed = await failing(Message, "create", () => asOwner(`/offers/${offer.id}/respond`, { method: "PATCH", body: { action: "accept" } }));
    assert.equal(failed.code, 500);
    assert.equal((await Property.findById(house._id)).availability, "Available", "property not left reserved");
    assert.equal((await Offer.findById(offer._id)).status, "pending", "offer not left accepted");

    const accepted = await asOwner(`/offers/${offer.id}/respond`, { method: "PATCH", body: { action: "accept" } });
    assert.equal(accepted.code, 200, accepted.message);
    assert.equal(accepted.data.status, "accepted");
    assert.equal((await Property.findById(house._id)).availability, "Under Offer");
    assert.equal(await chatNotes(house), 1);

    // Answer and withdrawal at the same moment: exactly one of them applies
    const other = await Offer.create({ customer: customer._id, property: house._id, owner: owner._id, ownerType: "agent", askingPrice: house.price, amount: 400000, status: "pending" });
    const results = await Promise.all([
      asOwner(`/offers/${other.id}/respond`, { method: "PATCH", body: { action: "reject" } }),
      asCustomer(`/offers/${other.id}/withdraw`, { method: "PATCH" }),
    ]);
    assert.equal(results.filter((r) => r.code === 200).length, 1, JSON.stringify(results.map((r) => [r.code, r.message])));
    assert.ok(results.every((r) => [200, 400, 409].includes(r.code)));
    assert.ok(["rejected", "withdrawn"].includes((await Offer.findById(other._id)).status));
  });

  await t.test("4. an admin granting a plan: the subscription is created and activated together", async () => {
    const solo = await User.create({ emailVerifiedAt: new Date(), firstName: "Solo", lastName: "Agent", email: "solo@tx.test", phone: "0241234567", password, role: "agent", agentApplication: { status: "approved", agentType: "individual" } });
    // Activation saves the account last, after the subscription was inserted and activated
    const failed = await failing(User.prototype, "save", () => asAdmin(`/admin/agents/${solo.id}/subscription`, { method: "PATCH", body: { action: "changePlan", planId: plan.id } }));
    assert.equal(failed.code, 500);
    assert.equal(await Subscription.countDocuments({ user: solo._id }), 0, "no half-made subscription left behind");
    assert.equal((await User.findById(solo._id)).subscription ?? null, null);

    const granted = await asAdmin(`/admin/agents/${solo.id}/subscription`, { method: "PATCH", body: { action: "changePlan", planId: plan.id } });
    assert.equal(granted.code, 200, granted.message);
    const subscriptions = await Subscription.find({ user: solo._id });
    assert.equal(subscriptions.length, 1);
    assert.equal(subscriptions[0].status, "active");
    assert.equal(subscriptions[0].paymentStatus, "waived");
    const saved = await User.findById(solo._id);
    assert.equal(String(saved.subscription), subscriptions[0].id);
    assert.equal(saved.agentApplication.agentType, "agency", "an agency plan makes the account an agency");
  });

  await t.test("5. deleting a customer: the account and its activity go together", async () => {
    const leaving = await User.create({ emailVerifiedAt: new Date(), firstName: "Leaving", lastName: "Customer", email: "leaving@tx.test", phone: "0241234567", password });
    const house = await listing();
    await Offer.create({ customer: leaving._id, property: house._id, owner: owner._id, ownerType: "agent", askingPrice: house.price, amount: 300000, status: "pending" });
    await Review.create({ property: house._id, user: leaving._id, rating: 5 });
    await syncPropertyRating(house._id);
    const chat = await Conversation.create({ customer: leaving._id, owner: owner._id, ownerType: "agent", property: house._id });
    await Message.create({ conversation: chat._id, sender: leaving._id, message: "Hello" });
    await Notification.create({ recipient: leaving._id, type: "status", title: "Hi" });
    const counts = async () => [await Offer.countDocuments({ customer: leaving._id }), await Review.countDocuments({ user: leaving._id }), await Conversation.countDocuments({ customer: leaving._id }), await Message.countDocuments({ conversation: chat._id }), await Notification.countDocuments({ recipient: leaving._id }), await User.countDocuments({ _id: leaving._id })];

    // Deleting the account is the last step: every delete before it already ran
    const failed = await failing(User, "deleteOne", () => asAdmin(`/admin/users/${leaving.id}`, { method: "DELETE" }));
    assert.equal(failed.code, 500);
    assert.deepEqual(await counts(), [1, 1, 1, 1, 1, 1], "nothing was deleted");
    assert.equal((await Property.findById(house._id)).ratingCount, 1, "rating unchanged");

    const deleted = await asAdmin(`/admin/users/${leaving.id}`, { method: "DELETE" });
    assert.equal(deleted.code, 200, deleted.message);
    assert.deepEqual(await counts(), [0, 0, 0, 0, 0, 0]);
    const rated = await Property.findById(house._id);
    assert.equal(rated.ratingCount, 0, "rating recalculated without the deleted review");
    assert.equal(rated.ratingAverage, null);
  });

  await t.test("6. deleting a listing: the listing and what belongs to it go together; files only after", async () => {
    const destroyed = [];
    t.mock.method(cloudinary.uploader, "destroy", async (publicId) => { destroyed.push(publicId); return { result: "ok" }; });
    const house = await listing({ availability: "Available" });
    await Review.create({ property: house._id, user: customer._id, rating: 4 });
    await User.updateOne({ _id: customer._id }, { $addToSet: { savedProperties: house._id } });
    const viewing = await Viewing.create({ customer: customer._id, property: house._id, owner: owner._id, ownerType: "agent", scheduledAt: new Date(Date.now() + 3 * 86400000), proposedBy: "customer", contactName: "Buyer Test", contactPhone: "0241234567", status: "requested" });
    await DocumentCheck.create({ property: house._id, owner: owner._id, status: "pending", documents: [{ kind: "title", name: "Title deed", publicId: "tx/title-deed", format: "pdf" }] });

    // Cancelling the viewings is the last write: the listing, saves, reviews and documents went before it
    const failed = await failing(Viewing, "updateMany", () => asOwner(`/properties/${house.id}`, { method: "DELETE" }));
    assert.equal(failed.code, 500);
    assert.ok(await Property.exists({ _id: house._id }), "listing kept");
    assert.equal(await Review.countDocuments({ property: house._id }), 1);
    assert.ok((await User.findById(customer._id)).savedProperties.some((id) => id.equals(house._id)), "still saved");
    assert.ok(await DocumentCheck.exists({ property: house._id }));
    assert.equal((await Viewing.findById(viewing._id)).status, "requested");
    assert.deepEqual(destroyed, [], "no file deleted for a change that rolled back");

    const deleted = await asOwner(`/properties/${house.id}`, { method: "DELETE" });
    assert.equal(deleted.code, 200, deleted.message);
    assert.ok(!(await Property.exists({ _id: house._id })));
    assert.equal(await Review.countDocuments({ property: house._id }), 0);
    assert.ok(!(await User.findById(customer._id)).savedProperties.some((id) => id.equals(house._id)));
    assert.ok(!(await DocumentCheck.exists({ property: house._id })));
    assert.equal((await Viewing.findById(viewing._id)).status, "cancelled");
    assert.deepEqual(destroyed, ["tx/title-deed"], "the file goes once the delete is saved");

    // A listing with a sale on record is refused, and nothing changes
    const sold = await listing();
    await saleRequest(sold);
    assert.equal((await asOwner(`/properties/${sold.id}`, { method: "DELETE" })).code, 409);
    assert.ok(await Property.exists({ _id: sold._id }));
  });

  await t.test("7–9. removing, restoring and permanently deleting a provider are each all-or-nothing", async () => {
    const agency = await User.create({ emailVerifiedAt: new Date(), firstName: "Gone", lastName: "Owner", email: "gone@tx.test", phone: "0241234567", password, role: "agent", agentApplication: { status: "approved", agentType: "agency", companyName: "Gone Homes" } });
    agency.subscription = (await Subscription.create({ user: agency._id, plan: plan._id, planName: plan.name, accountType: "agency", amount: 0, paymentReference: "tx-gone", status: "active", paymentStatus: "waived", startDate: new Date(), expiresAt: new Date("2035-01-01") }))._id;
    await agency.save();
    const staff = await User.create({ emailVerifiedAt: new Date(), firstName: "Gone", lastName: "Staff", email: "gone-staff@tx.test", phone: "0241234567", password, role: "agent", agency: { owner: agency._id, role: "agent", joinedAt: new Date() }, agentApplication: { status: "approved", agentType: "agency" } });
    const house = await listing({ owner: agency._id, assignedTo: staff._id });
    const invite = await TeamInvite.create({ agency: agency._id, email: "next@tx.test", role: "agent", tokenHash: "tx-gone-invite", expiresAt: new Date(Date.now() + 86400000) });
    const chat = await Conversation.create({ customer: customer._id, owner: agency._id, ownerType: "agent", property: house._id });
    const state = async () => ({
      account: (await User.findById(agency._id)).agentApplication.status,
      listing: (await Property.findById(house._id))?.status ?? "deleted",
      invite: Boolean((await TeamInvite.findById(invite._id))?.revokedAt),
      chat: (await Conversation.findById(chat._id)).status,
      plan: (await Subscription.findById(agency.subscription)).status,
      staff: Boolean((await User.findById(staff._id)).agency?.owner),
    });
    const before = { account: "approved", listing: "published", invite: false, chat: "open", plan: "active", staff: true };

    // Remove: cancelling the plan comes after the account, listings, invites and chats were changed
    const failedRemove = await failing(Subscription, "updateMany", () => asAdmin(`/admin/agents/${agency.id}/remove`, { method: "POST", body: { reason: "closed" } }));
    assert.equal(failedRemove.code, 500);
    assert.deepEqual(await state(), before, "a failed removal changes nothing");
    const removed = await asAdmin(`/admin/agents/${agency.id}/remove`, { method: "POST", body: { reason: "closed" } });
    assert.equal(removed.code, 200, removed.message);
    assert.deepEqual(await state(), { account: "removed", listing: "suspended", invite: true, chat: "closed", plan: "cancelled", staff: false });

    // Restore with the listings: the listings are the second write
    const failedRestore = await failing(Property, "updateMany", () => asAdmin(`/admin/agents/${agency.id}/restore`, { method: "POST", body: { republish: true } }));
    assert.equal(failedRestore.code, 500);
    assert.equal((await state()).account, "removed", "a failed restore leaves the account removed");
    assert.equal((await state()).listing, "suspended");
    const restored = await asAdmin(`/admin/agents/${agency.id}/restore`, { method: "POST", body: { republish: true } });
    assert.equal(restored.code, 200, restored.message);
    assert.equal((await state()).account, "approved");
    assert.equal((await state()).listing, "published");

    // Permanent delete (after removing again): notifications go in the middle of the deletes
    assert.equal((await asAdmin(`/admin/agents/${agency.id}/remove`, { method: "POST", body: { reason: "closed" } })).code, 200);
    await Notification.create({ recipient: agency._id, type: "status", title: "Hi" });
    const confirm = (await asAdmin(`/admin/agents/${agency.id}/deletion`)).data.confirmText;
    const failedDelete = await failing(Notification, "deleteMany", () => asAdmin(`/admin/agents/${agency.id}`, { method: "DELETE", body: { confirm } }));
    assert.equal(failedDelete.code, 500);
    assert.equal((await User.findById(agency._id)).firstName, "Gone", "personal details kept");
    assert.ok(await Property.exists({ _id: house._id }), "listing kept");
    assert.ok(await TeamInvite.exists({ _id: invite._id }), "invites kept");
    const deleted = await asAdmin(`/admin/agents/${agency.id}`, { method: "DELETE", body: { confirm } });
    assert.equal(deleted.code, 200, deleted.message);
    const gone = await User.findById(agency._id);
    assert.ok(!gone || gone.firstName === "Deleted", "erased or anonymised");
    assert.ok(!(await TeamInvite.exists({ _id: invite._id })));
    assert.equal(await Notification.countDocuments({ recipient: agency._id }), 0);
  });

  await t.test("10–12. assigning listings, removing a member and joining by invite are each all-or-nothing", async () => {
    const member = await User.create({ emailVerifiedAt: new Date(), firstName: "Team", lastName: "Member", email: "member@tx.test", phone: "0241234567", password, role: "agent", agency: { owner: owner._id, role: "agent", joinedAt: new Date() }, agentApplication: { status: "approved", agentType: "agency" } });
    const house = await listing();
    const offer = await Offer.create({ customer: customer._id, property: house._id, owner: owner._id, ownerType: "agent", askingPrice: house.price, amount: 450000, status: "pending" });
    const viewing = await Viewing.create({ customer: customer._id, property: house._id, owner: owner._id, ownerType: "agent", scheduledAt: new Date(Date.now() + 3 * 86400000), proposedBy: "customer", contactName: "Buyer Test", contactPhone: "0241234567", status: "requested" });
    const assignedTo = async () => [(await Property.findById(house._id)).assignedTo, (await Offer.findById(offer._id)).assignedTo, (await Viewing.findById(viewing._id)).assignedTo].map((id) => (id ? String(id) : null));

    // 10. The viewings are the last of the leads to move
    const failedAssign = await failing(Viewing, "updateMany", () => asOwner(`/properties/${house.id}/assign`, { method: "PATCH", body: { memberId: member.id } }));
    assert.equal(failedAssign.code, 500);
    assert.deepEqual(await assignedTo(), [null, null, null], "listing and leads stay with the owner");
    const assigned = await asOwner(`/properties/${house.id}/assign`, { method: "PATCH", body: { memberId: member.id } });
    assert.equal(assigned.code, 200, assigned.message);
    assert.deepEqual(await assignedTo(), [member.id, member.id, member.id]);

    // 11. Ending the membership comes after the work was handed back
    const failedRemove = await failing(User, "updateOne", () => asOwner(`/agents/team/members/${member.id}`, { method: "DELETE" }));
    assert.equal(failedRemove.code, 500);
    assert.deepEqual(await assignedTo(), [member.id, member.id, member.id], "work stays with the member");
    assert.ok((await User.findById(member._id)).agency?.owner, "still on the team");
    const removed = await asOwner(`/agents/team/members/${member.id}`, { method: "DELETE" });
    assert.equal(removed.code, 200, removed.message);
    assert.deepEqual(await assignedTo(), [null, null, null]);
    assert.ok(!(await User.findById(member._id)).agency?.owner);

    // 12. Joining: the joining account's update comes after the invite was claimed
    const tokenFor = (n) => `tx-invite-token-${n}-${"x".repeat(24)}`;
    const invite = async (n) => TeamInvite.create({ agency: owner._id, email: `joiner${n}@tx.test`, role: "agent", tokenHash: crypto.createHash("sha256").update(tokenFor(n)).digest("hex"), expiresAt: new Date(Date.now() + 86400000) });
    const joiner = async (n) => User.create({ emailVerifiedAt: new Date(), firstName: "Joiner", lastName: String(n), email: `joiner${n}@tx.test`, phone: "0241234567", password, role: "agent", agentApplication: { status: "incomplete" } });
    const first = await joiner(1);
    const firstInvite = await invite(1);
    const realUpdateOne = User.updateOne;
    User.updateOne = function (filter, ...rest) {
      if (String(filter?._id) === first.id) return Promise.reject(new Error("Simulated failure joining the team"));
      return realUpdateOne.call(this, filter, ...rest);
    };
    let failedJoin;
    try { failedJoin = await as(first)(`/team/invites/${tokenFor(1)}/accept`, { method: "POST" }); } finally { User.updateOne = realUpdateOne; }
    assert.equal(failedJoin.code, 500);
    assert.equal((await TeamInvite.findById(firstInvite._id)).usedAt ?? null, null, "the invite isn't used up by a failed join");
    assert.ok(!(await User.findById(first._id)).agency?.owner);
    const joined = await as(first)(`/team/invites/${tokenFor(1)}/accept`, { method: "POST" });
    assert.equal(joined.code, 200, joined.message);
    assert.equal(String((await User.findById(first._id)).agency.owner), owner.id);
    assert.ok((await TeamInvite.findById(firstInvite._id)).usedAt);

    // Two people accepting the last free seat at the same moment: only one joins
    const members = await User.countDocuments({ "agency.owner": owner._id });
    await Plan.updateOne({ _id: plan._id }, { $set: { teamMemberLimit: members + 1 } });
    try {
      const [a, b] = [await joiner(2), await joiner(3)];
      await invite(2); await invite(3);
      const results = await Promise.all([as(a)(`/team/invites/${tokenFor(2)}/accept`, { method: "POST" }), as(b)(`/team/invites/${tokenFor(3)}/accept`, { method: "POST" })]);
      assert.deepEqual(results.map((r) => r.code).sort(), [200, 403], JSON.stringify(results.map((r) => [r.code, r.message])));
      assert.equal(await User.countDocuments({ "agency.owner": owner._id }), members + 1, "the team limit holds");
    } finally {
      await Plan.updateOne({ _id: plan._id }, { $set: { teamMemberLimit: 5 } });
    }
  });

  await t.test("13–14. new offers, purchase requests, viewings and enquiries are saved with their chat note", async () => {
    const shopper = await User.create({ emailVerifiedAt: new Date(), firstName: "Shopper", lastName: "Test", email: "shopper@tx.test", phone: "0241234567", password });
    const asShopper = as(shopper);
    const notes = (house) => Conversation.find({ property: house._id, customer: shopper._id }).then((list) => Message.countDocuments({ conversation: { $in: list.map((c) => c._id) } }));

    // Offer: moving the buyer's purchase request to "offer received" is the last write
    const forOffer = await listing();
    const asked = await saleRequest(forOffer, { customer: shopper._id, status: "pending", paymentStatus: "pending" });
    const failedOffer = await failing(SaleRequest, "updateMany", () => asShopper("/offers", { method: "POST", body: { propertyId: forOffer.id, amount: 450000 } }));
    assert.equal(failedOffer.code, 500);
    assert.equal(await Offer.countDocuments({ customer: shopper._id }), 0, "no offer");
    assert.equal(await notes(forOffer), 0, "the chat doesn't mention an offer that wasn't saved");
    assert.equal((await SaleRequest.findById(asked._id)).status, "pending");
    const offered = await asShopper("/offers", { method: "POST", body: { propertyId: forOffer.id, amount: 450000 } });
    assert.equal(offered.code, 201, offered.message);
    assert.equal(await notes(forOffer), 1);
    assert.equal((await SaleRequest.findById(asked._id)).status, "offer_received");

    // Purchase request: the request itself is saved after its chat note
    const forSale = await listing();
    const body = { propertyId: forSale.id, fullName: "Shopper Test", email: shopper.email, phone: "0241234567" };
    const failedSale = await failing(SaleRequest.prototype, "save", () => asShopper("/sale-requests", { method: "POST", body }));
    assert.equal(failedSale.code, 500);
    assert.equal(await notes(forSale), 0);
    assert.equal((await asShopper("/sale-requests", { method: "POST", body })).code, 201);
    assert.equal(await SaleRequest.countDocuments({ property: forSale._id, customer: shopper._id }), 1);
    assert.equal(await notes(forSale), 1);

    // Viewing: saved after its chat note, and linked to it
    const forViewing = await listing();
    const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const failedViewing = await failing(Viewing.prototype, "save", () => asShopper("/viewings", { method: "POST", body: { propertyId: forViewing.id, date, time: "10:00", phone: "0241234567" } }));
    assert.equal(failedViewing.code, 500);
    assert.equal(await notes(forViewing), 0);
    const booked = await asShopper("/viewings", { method: "POST", body: { propertyId: forViewing.id, date, time: "10:00", phone: "0241234567" } });
    assert.equal(booked.code, 201, booked.message);
    const viewing = await Viewing.findOne({ property: forViewing._id, customer: shopper._id });
    assert.ok(viewing.conversation, "linked to its chat");
    assert.equal(await notes(forViewing), 1);
    assert.equal((await asShopper("/viewings", { method: "POST", body: { propertyId: forViewing.id, date, time: "11:00", phone: "0241234567" } })).code, 409, "one open viewing per listing");
    assert.equal(await notes(forViewing), 1, "a refused viewing leaves no chat note");

    // Enquiry: created after its chat note
    const forEnquiry = await listing();
    const enquiry = { propertyId: forEnquiry.id, name: "Shopper Test", message: "Is it still available?" };
    const failedEnquiry = await failing(mongoose.models.Inquiry, "create", () => asShopper("/inquiries", { method: "POST", body: enquiry }));
    assert.equal(failedEnquiry.code, 500);
    assert.equal(await notes(forEnquiry), 0);
    assert.equal((await asShopper("/inquiries", { method: "POST", body: enquiry })).code, 201);
    assert.equal(await notes(forEnquiry), 1);
  });

  await t.test("15. reviewing ownership documents: the decision and the listing's badge agree", async () => {
    const house = await listing();
    const check = await DocumentCheck.create({ property: house._id, owner: owner._id, status: "pending", submittedAt: new Date(), documents: [{ kind: "title", name: "Deed", publicId: "tx/deed-2", format: "pdf" }] });
    const failed = await failing(Property, "findByIdAndUpdate", () => asAdmin(`/admin/document-checks/${check.id}`, { method: "PATCH", body: { decision: "verify" } }));
    assert.equal(failed.code, 500);
    assert.equal((await DocumentCheck.findById(check._id)).status, "pending", "still waiting for a decision");
    assert.equal((await Property.findById(house._id)).documentsVerifiedAt, null);
    const verified = await asAdmin(`/admin/document-checks/${check.id}`, { method: "PATCH", body: { decision: "verify" } });
    assert.equal(verified.code, 200, verified.message);
    assert.equal((await DocumentCheck.findById(check._id)).status, "verified");
    assert.ok((await Property.findById(house._id)).documentsVerifiedAt, "badge shown");

    // Reopening: the badge comes off with the check
    const failedReopen = await failing(Property, "updateOne", () => asOwner(`/properties/${house.id}/documents/reopen`, { method: "POST" }));
    assert.equal(failedReopen.code, 500);
    assert.equal((await DocumentCheck.findById(check._id)).status, "verified");
    assert.ok((await Property.findById(house._id)).documentsVerifiedAt);
    assert.equal((await asOwner(`/properties/${house.id}/documents/reopen`, { method: "POST" })).code, 200);
    assert.equal((await DocumentCheck.findById(check._id)).status, "draft");
    assert.equal((await Property.findById(house._id)).documentsVerifiedAt, null);
  });
});
