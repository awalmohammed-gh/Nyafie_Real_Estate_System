import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { createApp } from "../app.js";
import { cloudinary } from "../config/cloudinary.js";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Setting from "../models/Setting.js";
import Plan from "../models/Plan.js";
import DocumentCheck from "../models/DocumentCheck.js";
import Notification from "../models/Notification.js";
import { customerTabClaims, customerTabHeaders } from "./support/customerTab.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

const PDF = `data:application/pdf;base64,${Buffer.from("%PDF-1.4\n% test indenture\n%%EOF").toString("base64")}`;
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

test("document checks: private ownership documents, admin review and the public badge", { skip: process.env.RUN_DOCUMENTS_INTEGRATION !== "1", timeout: 120000 }, async (t) => {
  await isolatedMongo(t);
  process.env.JWT_KEY = "isolated-documents-signing-key-32-characters";
  await Setting.create({ key: "platform", agent: { requireSubscription: false } });
  // With subscriptions waived, agents use the cheapest active plan (editing a listing needs one)
  await Plan.create({ name: "Starter", price: 0, duration: 30, propertyLimit: 10, imageLimit: 10, isActive: true });
  // Cloudinary is never called for real: uploads and deletes are recorded; links are signed locally
  cloudinary.config({ cloud_name: "test-cloud", api_key: "test-key", api_secret: "test-secret" });
  const uploads = [];
  const destroyed = [];
  t.mock.method(cloudinary.uploader, "upload", async (_file, options) => {
    uploads.push(options);
    return { public_id: `${options.folder}/doc-${uploads.length}`, format: "pdf", secure_url: "https://res.cloudinary.com/test-cloud/image/private/s--permanent--/never-stored.pdf" };
  });
  t.mock.method(cloudinary.uploader, "destroy", async (publicId, options) => { destroyed.push({ publicId, options }); return { result: "ok" }; });

  const user = (fields) => User.create({ emailVerifiedAt: new Date(), lastName: "Test", password: "test-password-long-enough", phone: "0241234567", ...fields });
  const admin = await user({ firstName: "Site", email: "admin@documents.test", role: "admin" });
  const agent = await user({ firstName: "Owner", email: "agent@documents.test", role: "agent", agentApplication: { status: "approved" } });
  const otherAgent = await user({ firstName: "Other", email: "other@documents.test", role: "agent", agentApplication: { status: "approved" } });
  const listing = (fields = {}) => Property.create({ title: "Titled house", description: "A house used to check ownership documents.", propertyType: "House", listingType: "Sale", price: 800000, pricePeriod: "total", owner: agent._id, ownerType: "agent", status: "published", availability: "Available", location: { address: "12 Palm Street", neighbourhood: "East Legon", city: "Accra", region: "Greater Accra" }, area: 240, images: ["/house.jpg"], contact: { phone: "0241234567", email: "agent@documents.test" }, ...fields }); // complete enough to stay published
  const house = await listing();

  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const as = (person) => async (method, path, body) => {
    const session = { agent: "agent", admin: "admin" }[person?.role] || "customer";
    const token = person && jwt.sign({ id: person.id, role: person.role, session, ...customerTabClaims(session) }, process.env.JWT_KEY, { expiresIn: "1h" });
    const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", "X-Session-Domain": session, ...customerTabHeaders(session), ...(token ? { Cookie: `${session}_token=${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { code: response.status, ...(await response.json()) };
  };
  const owner = as(agent);
  const staff = as(admin);
  const docs = `/properties/${house.id}/documents`;

  await t.test("only the listing's own team can see or add documents, and only for sale listings", async () => {
    assert.equal((await as(otherAgent)("GET", docs)).code, 404);
    assert.equal((await as(null)("GET", docs)).code, 403, "no agent session");
    const rental = await listing({ listingType: "Rent", pricePeriod: "month", price: 3000 });
    assert.match((await owner("GET", `/properties/${rental.id}/documents`)).message, /for sale/);
    const empty = await owner("GET", docs);
    assert.equal(empty.data.status, "draft");
    assert.deepEqual(empty.data.documents, []);
  });

  await t.test("files are checked by their content and stored privately; no file URL is ever returned", async () => {
    assert.equal((await owner("POST", docs, { kind: "indenture", file: "data:application/pdf;base64,SGVsbG8=" })).code, 400, "not really a PDF");
    assert.equal((await owner("POST", docs, { kind: "indenture", file: PNG.replace("image/png", "application/pdf") })).code, 400, "declared type must match the content");
    assert.equal((await owner("POST", docs, { kind: "passport", file: PDF })).code, 400, "unknown kind");
    const big = `data:application/pdf;base64,${Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(3_000_000)]).toString("base64")}`;
    assert.equal((await owner("POST", docs, { kind: "indenture", file: big })).code, 413);
    assert.equal(uploads.length, 0, "nothing invalid reached Cloudinary");

    const added = await owner("POST", docs, { kind: "site_plan", name: "Site plan 2024", file: PNG });
    assert.equal(added.code, 201, JSON.stringify(added));
    assert.equal(uploads[0].type, "private");
    assert.equal(uploads[0].folder, `nyafie/documents/${house.id}`);
    assert.equal(added.data.documents[0].kindLabel, "Site plan");
    assert.doesNotMatch(JSON.stringify(added), /cloudinary|publicId|never-stored/);
    assert.doesNotMatch(JSON.stringify(await DocumentCheck.findOne({ property: house._id }).lean()), /never-stored/, "the permanent URL isn't stored either");
  });

  let checkId;
  await t.test("submitting needs a title or indenture; then the admins are told and editing waits", async () => {
    assert.match((await owner("POST", `${docs}/submit`)).message, /land title certificate or an indenture/);
    assert.equal((await owner("POST", docs, { kind: "indenture", file: PDF })).code, 201);
    const sent = await owner("POST", `${docs}/submit`);
    assert.equal(sent.data.status, "pending");
    checkId = sent.data.id;
    assert.ok(await Notification.exists({ audience: "admins", title: "Documents to check" }));
    assert.equal((await owner("POST", docs, { kind: "other", file: PDF })).code, 409, "no changes during the check");
    assert.equal((await staff("GET", "/admin/counts")).data.pendingDocumentChecks, 1);
  });

  await t.test("the public never sees the documents", async () => {
    const page = await as(null)("GET", `/properties/${house.id}`);
    assert.doesNotMatch(JSON.stringify(page), /indenture|documents\/|site_plan/i);
    assert.equal(page.data.documentsVerifiedAt, null);
  });

  await t.test("admins and the owner open documents through links that expire; others can't", async () => {
    const queue = await staff("GET", "/admin/document-checks");
    assert.equal(queue.data.length, 1);
    assert.equal(queue.data[0].owner.email, agent.email);
    const doc = queue.data[0].documents.find((d) => d.kind === "indenture");
    const link = await staff("GET", `/admin/document-checks/${checkId}/documents/${doc.id}/link`);
    assert.match(link.data.url, /^https:\/\/api\.cloudinary\.com\/v1_1\/test-cloud\/image\/download\?/);
    const expires = Number(new URL(link.data.url).searchParams.get("expires_at"));
    assert.ok(expires > Date.now() / 1000 && expires <= Date.now() / 1000 + 600 + 5, "valid for about 10 minutes");
    assert.equal((await owner("GET", `${docs}/${doc.id}/link`)).code, 200);
    assert.equal((await as(otherAgent)("GET", `${docs}/${doc.id}/link`)).code, 404);
    assert.equal((await owner("GET", `/admin/document-checks`)).code, 404, "the admin API stays hidden");
  });

  await t.test("a rejection tells the owner what to fix; a verification shows the badge, once", async () => {
    assert.match((await staff("PATCH", `/admin/document-checks/${checkId}`, { decision: "reject", note: "no" })).message, /at least 10 characters/);
    const rejected = await staff("PATCH", `/admin/document-checks/${checkId}`, { decision: "reject", note: "The indenture page with the stamp is missing." });
    assert.equal(rejected.data.status, "rejected");
    assert.match((await Notification.findOne({ recipient: agent._id, title: "Documents need attention" })).message, /stamp is missing/);
    assert.equal((await owner("POST", docs, { kind: "search_report", file: PDF })).code, 201, "the owner can fix it");
    assert.equal((await owner("POST", `${docs}/submit`)).data.status, "pending");

    const decisions = await Promise.all([1, 2].map(() => staff("PATCH", `/admin/document-checks/${checkId}`, { decision: "verify" })));
    assert.deepEqual(decisions.map((d) => d.code).sort(), [200, 409]);
    const page = await as(null)("GET", `/properties/${house.id}`);
    assert.ok(page.data.documentsVerifiedAt, "the public listing carries the badge date");
    assert.ok(await Notification.exists({ recipient: agent._id, title: "Documents verified" }));
    assert.equal((await owner("POST", docs, { kind: "other", file: PDF })).code, 409, "verified documents are locked");
  });

  await t.test("changing the address after verification removes the badge until checked again", async () => {
    const edited = await owner("PUT", `/properties/${house.id}`, { location: { address: "40 Different Road", neighbourhood: "Cantonments", city: "Accra", region: "Greater Accra" } });
    assert.equal(edited.code, 200, JSON.stringify(edited).slice(0, 300));
    assert.equal((await Property.findById(house._id)).documentsVerifiedAt, null);
    assert.equal((await DocumentCheck.findById(checkId)).status, "pending");
    assert.ok(await Notification.exists({ audience: "admins", title: "Documents to check again" }));
  });

  await t.test("reopening verified documents removes the badge; deleting the listing deletes the files", async () => {
    await staff("PATCH", `/admin/document-checks/${checkId}`, { decision: "verify" });
    const reopened = await owner("POST", `${docs}/reopen`);
    assert.equal(reopened.data.status, "draft");
    assert.equal((await Property.findById(house._id)).documentsVerifiedAt, null);

    const stored = (await DocumentCheck.findById(checkId)).documents.length;
    assert.equal((await owner("DELETE", `/properties/${house.id}`)).code, 200);
    assert.equal(await DocumentCheck.countDocuments({ property: house._id }), 0);
    assert.equal(destroyed.length, stored);
    assert.ok(destroyed.every((d) => d.options.type === "private"));
  });
});
