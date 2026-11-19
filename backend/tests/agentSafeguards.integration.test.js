import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { customerTabClaims, customerTabHeaders } from "./support/customerTab.js";
import { createApp } from "../app.js";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Payment from "../models/Payment.js";
import SaleRequest from "../models/SaleRequest.js";
import Setting from "../models/Setting.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import TeamInvite from "../models/TeamInvite.js";
import Notification from "../models/Notification.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

test("agent safeguards: sale payments are recorded once; declined applicants can't join agencies", { skip: process.env.RUN_AGENT_SAFEGUARDS_INTEGRATION !== "1", timeout: 90000 }, async (t) => {
  await isolatedMongo(t);
  process.env.JWT_KEY = "isolated-agent-safeguards-signing-key-32-chars";
  await Setting.create({ key: "platform", agent: { requireSubscription: true } });
  const plan = await Plan.create({ name: "Agency Plan", price: 0, duration: 365, propertyLimit: 20, imageLimit: 15, accountType: "agency", teamMemberLimit: 5 });
  const owner = await User.create({ emailVerifiedAt: new Date(), firstName: "Agency", lastName: "Owner", email: "owner@agent-safe.test", phone: "0241234567", password: "test-password-long-enough", role: "agent", agentApplication: { status: "approved", agentType: "agency", companyName: "Safe Homes" } });
  owner.subscription = (await Subscription.create({ user: owner._id, plan: plan._id, planName: plan.name, accountType: "agency", amount: 0, paymentReference: "test-agency-owner", status: "active", paymentStatus: "waived", startDate: new Date(), expiresAt: new Date("2035-01-01") }))._id;
  await owner.save();
  const customer = await User.create({ emailVerifiedAt: new Date(), firstName: "Buyer", lastName: "Test", email: "buyer@agent-safe.test", phone: "0241234567", password: "test-password-long-enough" });

  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const asAgent = async (user, path, { method = "GET", body } = {}) => {
    const headers = { "Content-Type": "application/json", "X-Session-Domain": "agent", ...customerTabHeaders("agent"), Cookie: `agent_token=${jwt.sign({ id: user.id, role: "agent", session: "agent", ...customerTabClaims("agent") }, process.env.JWT_KEY, { expiresIn: "1h" })}` };
    const response = await fetch(`${base}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { code: response.status, ...(await response.json()) };
  };

  await t.test("confirming a sale payment several times at once records exactly one payment", async () => {
    const house = await Property.create({ title: "Safe House", description: "A house used to check sale payment confirmation.", propertyType: "House", listingType: "Sale", price: 500000, pricePeriod: "total", owner: owner._id, ownerType: "agent", status: "published", availability: "Available" });
    const request = await SaleRequest.create({ customer: customer._id, property: house._id, owner: owner._id, ownerType: "agent", askingPrice: 500000, contactName: "Buyer Test", contactEmail: customer.email, contactPhone: "0241234567", status: "payment_pending", paymentStatus: "payment_requested" });
    const results = await Promise.all(Array.from({ length: 5 }, () => asAgent(owner, `/sale-requests/${request.id}/confirm-payment`, { method: "PATCH", body: { amount: 500000 } })));
    assert.deepEqual(results.map((r) => r.code).filter((code) => code === 200).length, 1, JSON.stringify(results.map((r) => r.code)));
    assert.ok(results.every((r) => [200, 400, 409].includes(r.code)));
    assert.equal(await Payment.countDocuments({ saleRequest: request._id }), 1, "one payment record, not five");
    const saved = await SaleRequest.findById(request._id);
    assert.equal(saved.paymentStatus, "confirmed");
    assert.equal(saved.status, "paid_at_office");
    assert.equal(saved.amountPaid, 500000);
    assert.equal((await Payment.findOne({ saleRequest: request._id })).method, "Direct", "sales are paid to the owner, not at an office");
    assert.equal((await asAgent(owner, `/sale-requests/${request.id}/confirm-payment`, { method: "PATCH", body: { amount: 1 } })).code, 400, "already confirmed");
  });

  await t.test("requesting payment tells the buyer to agree it with the owner, never to pay at an office", async () => {
    const house = await Property.create({ title: "Direct House", description: "A house used to check the payment request wording.", propertyType: "House", listingType: "Sale", price: 400000, pricePeriod: "total", owner: owner._id, ownerType: "agent", status: "published" });
    const request = await SaleRequest.create({ customer: customer._id, property: house._id, owner: owner._id, ownerType: "agent", askingPrice: 400000, contactName: "Buyer Test", contactEmail: customer.email, contactPhone: "0241234567", status: "approved" });
    const updated = await asAgent(owner, `/sale-requests/${request.id}/status`, { method: "PATCH", body: { status: "payment_pending" } });
    assert.equal(updated.code, 200, JSON.stringify(updated));
    const sent = await Notification.findOne({ recipient: customer._id, title: "Payment requested" }).sort({ createdAt: -1 });
    assert.match(sent.message, /agree with .+ how to pay/);
    assert.match(sent.message, /Only pay the owner or agent shown on/);
    assert.doesNotMatch(sent.message, /office/i);
  });

  await t.test("an applicant an admin declined can't become approved by joining an agency", async () => {
    const invite = async () => {
      const token = crypto.randomBytes(24).toString("base64url");
      await TeamInvite.create({ agency: owner._id, role: "agent", tokenHash: crypto.createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 86400000) });
      return token;
    };
    const declined = await User.create({ emailVerifiedAt: new Date(), firstName: "Declined", lastName: "Applicant", email: "declined@agent-safe.test", phone: "0241234567", password: "test-password-long-enough", role: "agent", agentApplication: { status: "rejected", rejectionReason: "Documents could not be verified" } });
    const refused = await asAgent(declined, `/team/invites/${await invite()}/accept`, { method: "POST" });
    assert.equal(refused.code, 403);
    const after = await User.findById(declined._id);
    assert.equal(after.agentApplication.status, "rejected", "the admin's decision stands");
    assert.equal(after.agency?.owner, undefined);

    const newcomer = await User.create({ emailVerifiedAt: new Date(), firstName: "New", lastName: "Agent", email: "newcomer@agent-safe.test", phone: "0241234567", password: "test-password-long-enough", role: "agent", agentApplication: { status: "incomplete" } });
    const joined = await asAgent(newcomer, `/team/invites/${await invite()}/accept`, { method: "POST" });
    assert.equal(joined.code, 200, JSON.stringify(joined));
    assert.equal((await User.findById(newcomer._id)).agency.role, "agent", "other agents still join as before");
  });
});
