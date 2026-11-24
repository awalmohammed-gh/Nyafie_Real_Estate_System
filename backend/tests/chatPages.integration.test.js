import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { customerTabClaims, customerTabHeaders } from "./support/customerTab.js";
import { createApp } from "../app.js";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import Setting from "../models/Setting.js";
import { isolatedMongo } from "./support/isolatedMongo.js";

test("a conversation sends its latest messages, and earlier ones on demand", { skip: process.env.RUN_CHAT_PAGES_INTEGRATION !== "1", timeout: 90000 }, async (t) => {
  const previous = process.env.JWT_KEY;
  process.env.JWT_KEY = "isolated-chat-pages-signing-key-at-least-32-characters";
  t.after(() => { if (previous === undefined) delete process.env.JWT_KEY; else process.env.JWT_KEY = previous; });
  await isolatedMongo(t);
  await Setting.create({ key: "platform" });
  const person = (name, role) => User.create({ emailVerifiedAt: new Date(), firstName: name, lastName: "Test", email: `${name}@chat.test`, phone: "0241234567", password: "test-password-long-enough", role });
  const admin = await person("admin", "admin"), customer = await person("customer", "user"), stranger = await person("stranger", "user");
  const property = await Property.create({ title: "Chat home", propertyType: "House", listingType: "Sale", price: 500, pricePeriod: "total", owner: admin._id, ownerType: "admin", status: "published" });
  const open = (who) => Conversation.collection.insertOne({ property: property._id, customer: who._id, owner: admin._id, ownerType: "admin", status: "open", customerUnread: 0, ownerUnread: 0, lastMessageAt: new Date() }).then((row) => row.insertedId);
  const id = await open(customer), other = await open(stranger);
  // Several share a moment: paging must neither repeat nor lose any
  const start = Date.now() - 3600000;
  await Message.collection.insertMany(Array.from({ length: 250 }, (_, i) => ({ conversation: id, sender: customer._id, senderRole: "customer", message: `Message ${i + 1}`, read: false, createdAt: new Date(start + Math.floor(i / 7) * 1000), updatedAt: new Date() })));
  const foreign = await Message.collection.insertOne({ conversation: other, sender: stranger._id, senderRole: "customer", message: "Private", read: false, createdAt: new Date(start), updatedAt: new Date() });

  const server = createApp({ initialize: async () => {} }).listen(0, "127.0.0.1");
  await new Promise((done) => server.once("listening", done));
  t.after(() => new Promise((done) => server.close(done)));
  const ask = async (query = "", conversation = id, user = customer) => {
    const token = jwt.sign({ id: user.id, role: "user", session: "customer", ...customerTabClaims("customer") }, process.env.JWT_KEY, { expiresIn: "1h" });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/conversations/${conversation}${query}`, { headers: { "X-Session-Domain": "customer", ...customerTabHeaders("customer"), Cookie: `customer_token=${token}` } });
    return { ...(await response.json()), code: response.status };
  };
  const texts = (data) => data.messages.map((message) => message.message);

  const latest = (await ask()).data;
  assert.equal(latest.messages.length, 100);
  assert.equal(latest.hasEarlier, true);
  assert.deepEqual([texts(latest)[0], texts(latest).at(-1)], ["Message 151", "Message 250"], "oldest first within the page");
  const middle = (await ask(`?before=${latest.messages[0].id}`)).data;
  const first = (await ask(`?before=${middle.messages[0].id}`)).data;
  assert.deepEqual([middle.messages.length, middle.hasEarlier, first.messages.length, first.hasEarlier], [100, true, 50, false]);
  assert.deepEqual([...texts(first), ...texts(middle), ...texts(latest)], Array.from({ length: 250 }, (_, i) => `Message ${i + 1}`));

  assert.equal((await ask(`?before=${foreign.insertedId}`)).code, 400, "a message of another conversation");
  assert.equal((await ask("?before=nonsense")).code, 400);
  assert.equal((await ask(`?before=${new mongoose.Types.ObjectId()}`)).code, 400);
  assert.equal((await ask("", id, stranger)).code, 404, "only the people in the conversation");
  const short = (await ask("", other, stranger)).data;
  assert.deepEqual([short.messages.length, short.hasEarlier], [1, false]);
});
