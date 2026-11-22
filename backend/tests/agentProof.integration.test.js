import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { createApp } from "../app.js";
import { cloudinary } from "../config/cloudinary.js";
import User from "../models/User.js";
import Setting from "../models/Setting.js";
import Plan from "../models/Plan.js";
import Subscription from "../models/Subscription.js";
import { cookieName } from "../utils/generateToken.js";
import { adminEntryHeaders, customerTabClaims, customerTabHeaders } from "./support/customerTab.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

const PDF = `data:application/pdf;base64,${Buffer.from("%PDF-1.4\n% agent certificate\n%%EOF").toString("base64")}`;

test("private agent proof uploads are required, locked during review, and approved only by an admin", { skip: process.env.RUN_AGENT_PROOF_INTEGRATION !== "1", timeout: 120000 }, async (t) => {
  await isolatedMongo(t);
  const oldKey = process.env.JWT_KEY;
  process.env.JWT_KEY = "isolated-agent-proof-signing-key-32-characters";
  t.after(() => { if (oldKey === undefined) delete process.env.JWT_KEY; else process.env.JWT_KEY = oldKey; });
  await Setting.create({ key: "platform", agent: { requireSubscription: false } });
  cloudinary.config({ cloud_name: "test-cloud", api_key: "test-key", api_secret: "test-secret" });
  const uploads = [], destroyed = [];
  t.mock.method(cloudinary.uploader, "upload", async (_file, options) => {
    uploads.push(options);
    return { public_id: `${options.folder}/proof-${uploads.length}`, format: "pdf", secure_url: "https://example.test/never-expose-this-url" };
  });
  t.mock.method(cloudinary.uploader, "destroy", async (id, options) => { destroyed.push({ id, options }); return { result: "ok" }; });
  const makeUser = (fields) => User.create({ firstName: "Test", lastName: "Agent", password: "test-password-long-enough", phone: "0241234567", ...fields });
  const applicant = await makeUser({ email: "applicant@proof.test", role: "agent", agentApplication: { status: "incomplete", profileCompletedAt: new Date() } });
  const other = await makeUser({ email: "other@proof.test", role: "agent", agentApplication: { status: "incomplete" } });
  const admin = await makeUser({ email: "admin@proof.test", role: "admin" });
  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise(done => server.once("listening", done));
  t.after(() => new Promise(done => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (user, method, path, body) => {
    const domain = ["agent", "admin"].includes(user.role) ? user.role : "customer";
    const token = jwt.sign({ id: user.id, role: user.role, session: domain, ...customerTabClaims(domain) }, process.env.JWT_KEY, { expiresIn: "1h" });
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", "X-Session-Domain": domain, ...customerTabHeaders(domain), ...(domain === "admin" ? adminEntryHeaders() : {}), Cookie: `${cookieName(domain)}=${token}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") };
  };
  const documents = "/agents/application/documents";
  await t.test("profile and payment alone cannot submit without professional proof", async () => {
    const application = await request(applicant, "GET", "/agents/application");
    assert.equal(application.body.data.requirements.documentsComplete, false);
    assert.equal(application.body.data.user.onboarding.step, "profile");
    assert.equal((await request(applicant, "POST", "/agents/application/submit", {})).status, 400);
    assert.equal((await User.findById(applicant.id)).agentApplication.status, "incomplete");
  });
  let docId;
  await t.test("only validated private files are stored, with no permanent URLs in responses", async () => {
    assert.equal((await request(applicant, "POST", documents, { kind: "professional_certificate", file: "data:text/html;base64,PGh0bWw+" })).status, 400);
    const uploaded = await request(applicant, "POST", documents, { kind: "professional_certificate", name: "Agent certificate", file: PDF });
    assert.equal(uploaded.status, 201);
    docId = uploaded.body.data.documents[0].id;
    assert.equal(uploads[0].type, "private");
    assert.equal(uploads[0].overwrite, false);
    assert.doesNotMatch(JSON.stringify(uploaded.body), /publicId|secure_url|never-expose/);
    const user = await User.findById(applicant.id);
    assert.equal(user.agentApplication.proofCount, 1);
    assert.equal(user.agentApplication.proofDocuments, undefined);
    const selected = await User.findById(applicant.id).select("+agentApplication.proofDocuments");
    assert.doesNotMatch(JSON.stringify(selected), /proofDocuments|publicId|never-expose/);
  });
  await t.test("the applicant and admin receive expiring links; another agent has no access", async () => {
    const own = await request(applicant, "GET", `${documents}/${docId}/link`);
    assert.equal(own.status, 200);
    assert.equal(own.body.data.expiresInMinutes, 10);
    assert.match(own.body.data.url, /expires_at=/);
    assert.match(own.cache, /no-store/);
    assert.equal((await request(other, "GET", `${documents}/${docId}/link`)).status, 404);
    assert.ok([403, 404].includes((await request(other, "GET", `/admin/agent-applications/${applicant.id}/documents`)).status));
    const review = await request(admin, "GET", `/admin/agent-applications/${applicant.id}/documents`);
    assert.equal(review.body.data.documents.length, 1);
    assert.equal((await request(admin, "GET", `/admin/agent-applications/${applicant.id}/documents/${docId}/link`)).status, 200);
  });
  await t.test("submitted proof cannot change, and uploading never unlocks the workspace", async () => {
    assert.equal((await request(applicant, "POST", "/agents/application/submit", {})).status, 200);
    assert.equal((await request(applicant, "GET", "/agents/dashboard")).status, 403);
    assert.equal((await request(applicant, "POST", documents, { kind: "agency_authorization", file: PDF })).status, 409);
    assert.equal((await request(applicant, "DELETE", `${documents}/${docId}`)).status, 409);
    assert.equal((await User.findById(applicant.id)).agentApplication.proofCount, 1);
  });
  await t.test("proof is deleted once reviewed: rejected applicants upload again, approved agents keep only the review record", async () => {
    const review = `/admin/agent-applications/${applicant.id}`;
    assert.equal((await request(admin, "PATCH", review, { action: "approve" })).status, 400);
    assert.equal(destroyed.length, 0, "nothing is deleted before a decision");
    assert.equal((await request(admin, "PATCH", review, { action: "reject", rejectionReason: "Upload a clearer document." })).status, 200);
    // Rejected: the file is deleted from storage and from the database straight away
    assert.equal(destroyed.length, 1);
    assert.equal(destroyed[0].id, uploads[0].folder + "/proof-1");
    assert.equal(destroyed[0].options.type, "private");
    const rejected = await User.findById(applicant.id).select("+agentApplication.proofDocuments");
    assert.equal(rejected.agentApplication.proofDocuments.length, 0);
    assert.equal(rejected.agentApplication.proofCount, 0);
    assert.ok(rejected.agentApplication.proofReviewedAt);
    const afterReject = await request(applicant, "GET", documents);
    assert.deepEqual(afterReject.body.data.documents, []);
    assert.ok(afterReject.body.data.reviewedAt, "the agent is told their documents were reviewed (and deleted)");
    assert.equal((await request(applicant, "DELETE", `${documents}/${docId}`)).status, 404);
    assert.equal((await request(admin, "GET", `/admin/agent-applications/${applicant.id}/documents/${docId}/link`)).status, 404);
    assert.equal((await request(applicant, "POST", "/agents/application/submit", {})).status, 409);
    // Applying again needs new documents
    const resubmitted = await request(applicant, "POST", documents, { kind: "agency_authorization", file: PDF });
    assert.equal(resubmitted.status, 201);
    const newDocId = resubmitted.body.data.documents[0].id;
    assert.equal((await request(applicant, "POST", "/agents/application/submit", {})).status, 200);
    assert.equal((await request(admin, "PATCH", review, { action: "approve", proofReviewed: true, reviewSubmittedAt: "2000-01-01" })).status, 409);
    assert.equal(destroyed.length, 1, "a refused approval deletes nothing");
    const submitted = (await User.findById(applicant.id)).agentApplication.submittedAt.toISOString();
    assert.equal((await request(admin, "PATCH", review, { action: "approve", proofReviewed: true, reviewSubmittedAt: submitted })).status, 200);
    // Approved: the file is deleted too; the review record and the completed onboarding stay
    assert.equal(destroyed.length, 2);
    const approved = await User.findById(applicant.id).select("+agentApplication.proofDocuments");
    assert.equal(approved.agentApplication.status, "approved");
    assert.equal(String(approved.agentApplication.proofReviewedBy), admin.id);
    assert.ok(approved.agentApplication.proofReviewedAt);
    assert.equal(approved.agentApplication.proofDocuments.length, 0);
    assert.equal(approved.agentApplication.proofCount, 1);
    assert.equal((await request(admin, "GET", `/admin/agent-applications/${applicant.id}/documents/${newDocId}/link`)).status, 404);
    assert.deepEqual((await request(admin, "GET", `/admin/agent-applications/${applicant.id}/documents`)).body.data.documents, []);
    assert.equal((await request(applicant, "GET", "/auth/agent/me")).body.data.onboarding.dashboardAccess, true);
  });
  await t.test("concurrent uploads cannot exceed four documents, and failed additions are cleaned up", async () => {
    const responses = await Promise.all(Array.from({ length: 6 }, () => request(other, "POST", documents, { kind: "business_registration", file: PDF })));
    assert.equal(responses.filter(response => response.status === 201).length, 4);
    const saved = await User.findById(other.id).select("+agentApplication.proofDocuments");
    assert.equal(saved.agentApplication.proofCount, 4);
    assert.equal(saved.agentApplication.proofDocuments.length, 4);
  });

  let freePlan;
  await t.test("only admins can save free access and an active plan supplies workspace limits", async () => {
    freePlan = await Plan.create({ name: "Launch workspace", price: 200, duration: 30, propertyLimit: 12, imageLimit: 8, internalChat: true, isActive: true });
    const body = { requireSubscription: false, defaultPlan: freePlan.id };
    assert.ok([403, 404].includes((await request(applicant, "PUT", "/admin/settings/agent", body)).status));
    assert.equal((await request(admin, "PUT", "/admin/settings/agent", body)).status, 200);
    assert.equal((await request(applicant, "GET", "/agents/dashboard")).body.data.usage.propertyLimit, 12);
    assert.equal((await request(applicant, "GET", "/auth/agent/me")).body.data.onboarding.fullAccess, true);
  });

  await t.test("customers can apply without selecting or buying a plan in free mode", async () => {
    const customer = await makeUser({ email: "customer@proof.test", role: "user", emailVerifiedAt: new Date() });
    const started = await request(customer, "POST", "/auth/customer/become-agent", {});
    assert.equal(started.status, 200);
    assert.equal(started.body.data.id, customer.id);
    assert.equal(started.body.data.onboarding.step, "profile");
    assert.equal(started.body.data.onboarding.requireSubscription, false);
    const provider = await User.findById(customer.id);
    assert.equal(provider.agentApplication.status, "incomplete");
    assert.equal(provider.subscription, null);
    assert.equal((await request(provider, "GET", "/agents/dashboard")).status, 403);
    assert.equal((await request(provider, "POST", "/agents/application/submit", {})).status, 400);
  });

  await t.test("free mode blocks purchases, paid mode restores requirements, and saved listings survive toggling", async () => {
    for (const path of ["/subscriptions/quote", "/subscriptions/initialize", "/subscriptions/upgrade"]) {
      assert.equal((await request(applicant, "POST", path, { planId: freePlan.id })).status, 403);
    }
    assert.equal((await request(applicant, "GET", "/subscriptions/upgrades")).status, 403);
    assert.equal((await request(applicant, "GET", "/subscriptions/current")).body.data.paymentMode, "disabled");
    assert.equal(await Subscription.countDocuments(), 0);
    const draft = await request(applicant, "POST", "/properties", { title: "Free launch listing", status: "draft" });
    assert.equal(draft.status, 201);
    const savedId = draft.body.data.id;
    const body = { requireSubscription: true, defaultPlan: freePlan.id };
    assert.equal((await request(admin, "PUT", "/admin/settings/agent", body)).status, 200);
    assert.equal((await request(applicant, "GET", "/auth/agent/me")).body.data.onboarding.fullAccess, false);
    assert.equal((await request(applicant, "POST", "/properties", { title: "Requires a subscription", status: "draft" })).status, 403);
    assert.equal((await request(applicant, "POST", "/subscriptions/quote", { planId: freePlan.id })).status, 200);
    await User.updateOne({ _id: other.id }, { $set: { "agentApplication.profileCompletedAt": new Date() } });
    assert.equal((await request(other, "POST", "/agents/application/submit", {})).status, 400);
    assert.equal((await request(admin, "PUT", "/admin/settings/agent", { ...body, requireSubscription: false })).status, 200);
    assert.equal((await request(other, "POST", "/agents/application/submit", {})).status, 200);
    assert.equal((await request(other, "GET", "/agents/dashboard")).status, 403, "free mode never bypasses admin approval");
    assert.equal((await request(applicant, "GET", "/properties/my")).body.data.some(property => property.id === savedId), true);
    assert.equal((await request(applicant, "POST", "/properties", { title: "Free access restored", status: "draft" })).status, 201);
    assert.equal(await Subscription.countDocuments(), 0);
  });
});
