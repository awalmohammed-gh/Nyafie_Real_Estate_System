import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { customerTabClaims, customerTabHeaders } from "./support/customerTab.js";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Setting from "../models/Setting.js";
import Plan from "../models/Plan.js";
import agentRoutes from "../routes/agentRoutes.js";
import propertyRoutes from "../routes/propertyRoutes.js";

const query = (value) => ({
  then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  catch: (reject) => Promise.resolve(value).catch(reject),
  select: () => query(value), populate: () => query(value), sort: () => query(value),
  limit: () => query(value), skip: () => query(value), lean: () => Promise.resolve(value),
});

test("agent directory and listing identities require a valid selected session", async (t) => {
  process.env.JWT_KEY = "agent-visibility-regression-test-key";
  const customer = new User({ firstName: "Customer", lastName: "Test", email: "customer@example.test", role: "user", isActive: true });
  const agent = new User({ firstName: "Akua", lastName: "Mensah", email: "akua@example.test", phone: "+233241234567", role: "agent", isActive: true, agentApplication: { status: "approved" } });
  const listing = new Property({ title: "Accra Apartment", description: "A comfortable apartment in Accra.", owner: agent._id, ownerType: "agent", status: "published", listingType: "Rent", price: 2000, location: { city: "Accra", neighbourhood: "East Legon" }, contact: { name: "Stale Agent", phone: "0000000", email: "stale@example.test" } });
  t.mock.method(User, "findById", (id) => query([customer, agent].find((user) => String(user._id) === String(id))));
  t.mock.method(User, "find", () => query([agent]));
  t.mock.method(Setting, "findOneAndUpdate", () => query({ agent: { requireSubscription: false } }));
  t.mock.method(Plan, "findOne", () => query(null)); // the waived default plan, read for the chat check
  t.mock.method(Property, "aggregate", () => Promise.resolve([listing.toObject()]));
  t.mock.method(Property, "find", () => query([listing]));
  t.mock.method(Property, "findById", () => query(listing));
  t.mock.method(Property, "exists", () => Promise.resolve({ _id: listing._id }));
  t.mock.method(Property, "countDocuments", () => Promise.resolve(1));
  const app = express();
  app.use(cookieParser());
  app.use("/api/agents", agentRoutes);
  app.use("/api/properties", propertyRoutes);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = (user, session) => jwt.sign({ id: String(user._id), role: user.role, session, ...customerTabClaims(session) }, process.env.JWT_KEY, { expiresIn: "1h" });
  const customerCookie = `customer_token=${token(customer, "customer")}`;
  const call = (path, cookie, domain = "customer") => fetch(`${base}${path}`, { headers: { ...customerTabHeaders(domain), "X-Session-Domain": domain, ...(cookie ? { Cookie: cookie } : {}) } });
  try {
    await t.test("guest, forged and expired sessions cannot download the directory", async () => {
      for (const cookie of [undefined, "customer_token=invalid", `customer_token=${jwt.sign({ id: String(customer._id), role: "user", session: "customer" }, process.env.JWT_KEY, { expiresIn: -1 })}`]) {
        const response = await call("/api/agents/public", cookie);
        assert.equal(response.status, 401);
        assert.equal(Object.hasOwn(await response.json(), "data"), false);
      }
      assert.equal((await call("/api/agents/public", customerCookie, "agent")).status, 401);
    });
    await t.test("signed-in customers and approved agents can access the directory", async () => {
      for (const [cookie, domain] of [[customerCookie, "customer"], [`agent_token=${token(agent, "agent")}`, "agent"]]) {
        const response = await call("/api/agents/public", cookie, domain);
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.data[0].name, "Akua Mensah");
        assert.equal(body.data[0].email, agent.email);
      }
    });
    await t.test("all public property responses omit agent identity for guests and preserve it after login", async () => {
      const paths = ["/api/properties", "/api/properties?page=1", `/api/properties/${listing._id}`, `/api/properties/${listing._id}/related`];
      for (const path of paths) for (const signedIn of [false, true]) {
        const response = await call(path, signedIn ? customerCookie : undefined);
        assert.equal(response.status, 200, path);
        const { data } = await response.json();
        const items = Array.isArray(data) ? data : data.items || [data];
        assert.ok(items.length > 0, path);
        for (const item of items) {
          assert.equal(item.title, listing.title);
          if (signedIn) {
            assert.equal(item.agent.name, "Akua Mensah", path);
            assert.equal(item.contact.email, agent.email, path);
          } else {
            for (const field of ["agent", "contact", "owner"]) assert.equal(Object.hasOwn(item, field), false, `${path}: ${field}`);
          }
        }
      }
    });
    await t.test("another tab's agent cookie cannot disclose identities in a guest customer session", async () => {
      const response = await call(`/api/properties/${listing._id}`, `agent_token=${token(agent, "agent")}`);
      const { data } = await response.json();
      assert.equal(response.status, 200);
      assert.equal(Object.hasOwn(data, "agent"), false);
      assert.equal(Object.hasOwn(data, "contact"), false);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
