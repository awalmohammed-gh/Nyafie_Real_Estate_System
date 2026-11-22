import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { promisify } from "node:util";
import mongoose from "mongoose";
import { isolatedMongo } from "./support/isolatedMongo.js";

const run = promisify(execFile);

for (const file of await readdir(new URL("../models/", import.meta.url))) {
  if (/^[A-Z]\w*\.js$/.test(file)) await import(`../models/${file}`);
}
const { Property, User, Inquiry, Offer, Rental, SaleRequest, Viewing, Conversation, Message, Notification, Review, Subscription } = mongoose.models;

// Every stage of the winning plan (classic and SBE explain formats)
const stages = (node, found = []) => {
  if (Array.isArray(node)) node.forEach((child) => stages(child, found));
  else if (node && typeof node === "object") {
    if (typeof node.stage === "string") found.push(node.stage);
    Object.values(node).forEach((child) => stages(child, found));
  }
  return found;
};
const winningStages = (explain) => stages(explain.queryPlanner?.winningPlan ?? explain);

// The query is answered from an index, in index order: no collection scan, no in-memory sort
// (Mongoose returns the number for an explained count, so counts are explained as a count command)
const explain = (query) => query.op === "countDocuments"
  ? mongoose.connection.db.command({ explain: { count: query.model.collection.collectionName, query: query.getFilter() }, verbosity: "queryPlanner" })
  : query.explain("queryPlanner");
const assertIndexed = async (label, query) => {
  const used = winningStages(await explain(query));
  assert.ok(used.includes("IXSCAN") || used.includes("COUNT_SCAN"), `${label}: uses an index (${used.join(" > ")})`);
  assert.ok(!used.includes("COLLSCAN"), `${label}: no collection scan (${used.join(" > ")})`);
  assert.ok(!used.includes("SORT"), `${label}: no in-memory sort (${used.join(" > ")})`);
};

const id = () => new mongoose.Types.ObjectId();
const days = (n) => new Date(Date.now() - n * 86400000);

test("searches and inbox lists are answered from indexes", { skip: process.env.RUN_INDEX_INTEGRATION !== "1", timeout: 120000 }, async (t) => {
  await isolatedMongo(t); // a temporary database: nothing here touches the application's data
  const agents = [id(), id(), id()];
  const customers = [id(), id(), id()];

  // Enough varied records that the planner has real choices to make
  const properties = Array.from({ length: 120 }, (_, i) => ({
    _id: id(), title: `Home ${i}`, price: 1000 + i * 37, propertyType: ["Apartment", "Villa", "Studio"][i % 3], listingType: i % 2 ? "Rent" : "Sale",
    owner: agents[i % 3], ownerType: i % 5 ? "agent" : "admin", status: ["published", "draft", "pending"][i % 3], staleSince: i % 7 ? null : days(1),
    location: { city: ["Accra", "Kumasi"][i % 2] }, createdAt: days(i), updatedAt: days(i),
  }));
  await Property.collection.insertMany(properties);
  await User.collection.insertMany(Array.from({ length: 60 }, (_, i) => ({ email: `person${i}@example.test`, role: ["user", "agent"][i % 2], savedProperties: [properties[i % 10]._id], createdAt: days(i) })));
  const request = (i) => ({ customer: customers[i % 3], owner: agents[i % 3], ownerType: "agent", property: properties[i]._id, status: "pending", createdAt: days(i), scheduledAt: days(i) });
  for (const model of [Offer, Rental, SaleRequest, Viewing]) await model.collection.insertMany(Array.from({ length: 80 }, (_, i) => request(i)));
  await Inquiry.collection.insertMany(Array.from({ length: 80 }, (_, i) => ({ customer: customers[i % 3], agent: agents[i % 3], property: properties[i]._id, status: ["new", "closed"][i % 2], createdAt: days(i) })));
  const conversations = Array.from({ length: 40 }, (_, i) => ({ _id: id(), customer: customers[i % 3], owner: agents[i % 3], ownerType: i % 4 ? "agent" : "admin", property: properties[i]._id, status: "open", lastMessageAt: days(i) }));
  await Conversation.collection.insertMany(conversations);
  await Message.collection.insertMany(Array.from({ length: 200 }, (_, i) => ({ conversation: conversations[i % 40]._id, sender: customers[i % 3], message: "Hello", read: false, createdAt: days(i) })));
  await Notification.collection.insertMany(Array.from({ length: 150 }, (_, i) => ({ recipient: i % 4 ? customers[i % 3] : null, audience: i % 4 ? "user" : "admins", type: "status", title: "Update", read: i % 2 === 0, createdAt: days(i) })));
  await Review.collection.insertMany(Array.from({ length: 60 }, (_, i) => ({ property: properties[i]._id, user: customers[i % 3], rating: 1 + (i % 5), status: "published", adminSeenAt: i % 3 ? days(1) : null, createdAt: days(i) })));
  await Subscription.collection.insertMany(Array.from({ length: 60 }, (_, i) => ({ user: agents[i % 3], status: "active", paymentReference: `ref-${i}`, createdAt: days(i) })));

  const published = { status: "published", staleSince: null, $or: [{ ownerType: "admin" }, { ownerType: "agent", owner: { $in: agents.slice(0, 2) } }] };
  await assertIndexed("public listings, newest", Property.find(published).sort({ createdAt: -1 }).limit(12));
  await assertIndexed("rent listings, newest", Property.find({ $and: [published, { listingType: "Rent" }] }).sort({ createdAt: -1 }).limit(12));
  await assertIndexed("public listings by price", Property.find(published).sort({ price: 1, createdAt: -1 }).limit(12));
  await assertIndexed("public listings by price, high to low", Property.find(published).sort({ price: -1, createdAt: -1 }).limit(12));
  await assertIndexed("public listing count", Property.find(published).countDocuments());
  await assertIndexed("an agent's listings", Property.find({ owner: agents[0] }).sort({ createdAt: -1 }));
  await assertIndexed("admin listings", Property.find().sort({ createdAt: -1 }));

  await assertIndexed("agent list", User.find({ role: "agent" }).sort({ createdAt: -1 }));
  await assertIndexed("customer count", User.find({ role: "user" }).countDocuments());
  await assertIndexed("saves of a listing", User.find({ savedProperties: properties[0]._id }).countDocuments());

  for (const model of [Offer, Rental, SaleRequest]) {
    await assertIndexed(`${model.modelName}: customer's list`, model.find({ customer: customers[0] }).sort({ createdAt: -1 }));
    await assertIndexed(`${model.modelName}: owner's list`, model.find({ ownerType: "agent", owner: agents[0] }).sort({ createdAt: -1 }));
    await assertIndexed(`${model.modelName}: admin list`, model.find({}).sort({ createdAt: -1 }));
  }
  await assertIndexed("viewings: customer's list", Viewing.find({ customer: customers[0] }).sort({ scheduledAt: -1 }).limit(200));
  await assertIndexed("viewings: owner's list", Viewing.find({ ownerType: "agent", owner: agents[0] }).sort({ scheduledAt: -1 }).limit(500));
  await assertIndexed("inquiries: customer's list", Inquiry.find({ customer: customers[0] }).sort({ createdAt: -1 }));
  await assertIndexed("inquiries: agent's leads", Inquiry.find({ agent: agents[0] }).sort({ createdAt: -1 }));
  await assertIndexed("inquiries: new count", Inquiry.find({ status: "new" }).countDocuments());

  await assertIndexed("conversations: customer", Conversation.find({ customer: customers[0] }).sort({ lastMessageAt: -1 }));
  await assertIndexed("conversations: agent", Conversation.find({ ownerType: "agent", owner: agents[0] }).sort({ lastMessageAt: -1 }));
  await assertIndexed("conversations: admin", Conversation.find({ ownerType: "admin" }).sort({ lastMessageAt: -1 }));
  await assertIndexed("chat thread", Message.find({ conversation: conversations[0]._id }).sort({ createdAt: 1 }));

  await assertIndexed("notification bell", Notification.find({ recipient: customers[0] }).sort({ createdAt: -1 }).limit(30));
  await assertIndexed("admin notification bell", Notification.find({ $or: [{ recipient: agents[0] }, { audience: "admins" }] }).sort({ createdAt: -1 }).limit(30));
  await assertIndexed("unseen reviews badge", Review.find({ adminSeenAt: null }).countDocuments());
  await assertIndexed("admin reviews", Review.find({}).sort({ createdAt: -1, _id: -1 }).limit(20));
  await mongoose.models.ContactMessage.collection.insertMany(Array.from({ length: 60 }, (_, i) => ({ name: "Visitor", email: "visitor@example.test", subject: "Hi", message: "Hello", status: ["new", "read"][i % 2], createdAt: days(i) })));
  await assertIndexed("contact inbox", mongoose.models.ContactMessage.find({}).sort({ createdAt: -1, _id: -1 }).limit(20));
  await assertIndexed("contact inbox by status", mongoose.models.ContactMessage.find({ status: "new" }).sort({ createdAt: -1, _id: -1 }).limit(20));
  await assertIndexed("latest subscription", Subscription.findOne({ user: agents[0] }).sort({ createdAt: -1 }));
});

test("indexes:sync builds missing indexes and drops replaced ones only with --apply", { skip: process.env.RUN_INDEX_INTEGRATION !== "1", timeout: 120000 }, async (t) => {
  const uri = await isolatedMongo(t); // a temporary database: nothing here touches the application's data
  // A database from before this change: the old single-field indexes, and a new index not built yet
  await Offer.collection.createIndex({ customer: 1 });
  await Message.collection.createIndex({ conversation: 1 });
  await Notification.collection.createIndex({ read: 1 }); // still in the schema: must stay
  await Offer.collection.dropIndex("owner_1_createdAt_-1");
  const names = async (model) => (await model.collection.indexes()).map((index) => index.name);
  const sync = (...args) => run(process.execPath, ["seed/syncIndexes.js", ...args], { env: { ...process.env, MONGODB_URI: uri, MONGODB_DB: "" }, cwd: process.cwd() });

  const preview = await sync();
  assert.match(preview.stdout, /2 old indexes can be removed/);
  assert.ok((await names(Offer)).includes("owner_1_createdAt_-1"), "missing index built");
  assert.ok((await names(Offer)).includes("customer_1"), "nothing dropped without --apply");

  const applied = await sync("--apply");
  assert.match(applied.stdout, /Dropped 2 old indexes/);
  assert.ok(!(await names(Offer)).includes("customer_1"));
  assert.ok(!(await names(Message)).includes("conversation_1"));
  assert.ok((await names(Offer)).includes("customer_1_createdAt_-1"), "replacement kept");
  assert.ok((await names(Notification)).includes("read_1"), "indexes the schema still defines are kept");

  assert.match((await sync("--apply")).stdout, /No old indexes to remove/, "safe to run again");
});
