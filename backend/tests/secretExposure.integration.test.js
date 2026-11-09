import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import jwt from "jsonwebtoken";
import { isolatedMongo } from "./support/isolatedMongo.js";

/**
 * Plants recognisable fake ("canary") values in every secret environment variable, then calls
 * every API route the app defines (as a guest, a signed-in agent and a signed-in admin), the page
 * routes, and the place search in each failure mode. No canary may appear in any response body,
 * response header (including cookies) or server log line.
 */
const CANARIES = {
  JWT_KEY: "CANARY-jwt-signing-key-4f1d9a7c2e8b6d3f0a5c",
  CLOUD_API_KEY: "CANARY-cloudinary-api-key-77aa",
  CLOUD_SECRET_KEY: "CANARY-cloudinary-secret-91bb",
  PAYSTACK_SECRET_KEY: "sk_test_CANARYpaystacksecret0c3d",
  PAYSTACK_PUBLIC_KEY: "pk_test_CANARYpaystackpublic5e6f",
  CRON_SECRET: "CANARY-cron-secret-with-more-than-32-chars-0011",
  SMTP_APP_PASSWORD: "CANARY-smtp-app-password-22cc",
  ADMIN_PSD: "CANARY-admin-bootstrap-password-33dd",
  ADMIN_ENTRY_PATH: "hbCanaryEntry_9f8e7d6c5b4a",
  VIEW_HASH_SECRET: "CANARY-view-hash-secret-44ee",
  GEOCODER_KEY: "CANARY-geocoder-api-key-55ff",
};
const METHODS = /router\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;

// Every route definition in routes/*.js, under the prefix app.js mounts it at
const apiRoutes = () => {
  const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const files = Object.fromEntries(
    [...app.matchAll(/import (\w+) from "\.\/routes\/(\w+)\.js"/g)].map(
      ([, name, file]) => [name, file],
    ),
  );
  const mounts = [...app.matchAll(/app\.use\("(\/api\/[\w-]+)", (\w+)\)/g)].map(
    ([, prefix, name]) => ({ prefix, file: files[name] }),
  );
  return mounts.flatMap(({ prefix, file }) =>
    [
      ...readFileSync(
        new URL(`../routes/${file}.js`, import.meta.url),
        "utf8",
      ).matchAll(METHODS),
    ].map(([, method, path]) => ({
      method: method.toUpperCase(),
      path: `${prefix}${path === "/" ? "" : path}`,
    })),
  );
};

test(
  "no route, response header or log line exposes a secret",
  { skip: process.env.RUN_SECURITY_INTEGRATION !== "1", timeout: 180000 },
  async (t) => {
    const uri = await isolatedMongo(t);
    const saved = { ...process.env };
    t.after(() => {
      for (const key of Object.keys(process.env))
        if (!(key in saved)) delete process.env[key];
      Object.assign(process.env, saved);
    });
    Object.assign(process.env, {
      ...Object.fromEntries(
        Object.entries(CANARIES).filter(([key]) => key !== "GEOCODER_KEY"),
      ),
      NODE_ENV: "development",
      PAYSTACK_MODE: "test",
      SMTP_USER: "sender@example.test",
      ADMIN_EMAIL: "",
      TRUST_PROXY: "1",
      MONGODB_URI: uri,
      FRONTEND_INTERNAL_URL: "http://frontend.internal/",
      PUBLIC_SITE_URL: "http://localhost:5173",
      GEOCODER_URL: `https://geo.invalid/api?apikey=${CANARIES.GEOCODER_KEY}`,
    });
    const canaries = [...Object.values(CANARIES), uri];

    const { createApp } = await import("../app.js");
    const { clearGeocodeCache } =
      await import("../controllers/geoController.js");
    const { default: User } = await import("../models/User.js");
    const { default: Property } = await import("../models/Property.js");
    const { default: Setting } = await import("../models/Setting.js");
    await Property.createIndexes(); // loaded after the temporary database was prepared
    await Setting.create({
      key: "platform",
      agent: { requireSubscription: false },
    });
    const admin = await User.create({
      emailVerifiedAt: new Date(),
      firstName: "Canary",
      lastName: "Admin",
      email: "admin@canary.test",
      password: "test-password",
      role: "admin",
    });
    const agent = await User.create({
      emailVerifiedAt: new Date(),
      firstName: "Canary",
      lastName: "Agent",
      email: "agent@canary.test",
      password: "test-password",
      role: "agent",
      agentApplication: { status: "approved" },
    });
    const property = await Property.create({
      title: "Canary flat",
      description: "A listing that exists only for the secret exposure sweep.",
      price: 2000,
      pricePeriod: "month",
      propertyType: "Apartment",
      listingType: "Rent",
      area: 80,
      images: ["/x.jpg"],
      owner: admin._id,
      ownerType: "admin",
      status: "published",
      contact: { name: "Desk", phone: "0240000000", email: "desk@canary.test" },
      location: {
        address: "1 Road",
        neighbourhood: "East Legon",
        city: "Accra",
        latitude: 5.6355,
        longitude: -0.1617,
      },
    });
    const id = String(property._id);

    // Nothing leaves this machine: outside services answer from here
    const realFetch = globalThis.fetch;
    let geocoder = () => ({ ok: true, json: async () => ({ features: [] }) });
    t.mock.method(globalThis, "fetch", async (url, options) => {
      const target = String(url);
      if (target.startsWith("http://127.0.0.1")) return realFetch(url, options);
      if (target.startsWith("https://geo.invalid/")) return geocoder(target);
      if (target.startsWith("http://frontend.internal/"))
        return new Response(
          '<!doctype html><html><head><title>x</title></head><body><div id="root"></div></body></html>',
          { status: 200 },
        );
      return new Response(
        JSON.stringify({ status: false, message: "offline in tests" }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    });
    // Capture every log line the server writes
    const logs = [];
    for (const level of ["log", "info", "warn", "error"])
      t.mock.method(console, level, (...args) =>
        logs.push(
          args
            .map((a) =>
              a instanceof Error
                ? `${a.message}\n${a.stack}`
                : typeof a === "string"
                  ? a
                  : JSON.stringify(a),
            )
            .join(" "),
        ),
      );

    const server = createApp({ initialize: async () => {} }).listen(
      0,
      "127.0.0.1",
    );
    await new Promise((done) => server.once("listening", done));
    t.after(() => new Promise((done) => server.close(done)));
    const base = `http://127.0.0.1:${server.address().port}`;
    const sessions = {
      guest: {},
      agent: {
        Cookie: `agent_token=${jwt.sign({ id: String(agent._id), role: "agent", session: "agent" }, CANARIES.JWT_KEY, { expiresIn: "1h" })}`,
        "X-Session-Domain": "agent",
      },
      admin: {
        Cookie: `admin_token=${jwt.sign({ id: String(admin._id), role: "admin", session: "admin" }, CANARIES.JWT_KEY, { expiresIn: "1h" })}`,
        "X-Session-Domain": "admin",
        "X-Admin-Entry": CANARIES.ADMIN_ENTRY_PATH,
      },
    };
    let ip = 0;
    const exposures = [];
    const call = async (label, method, path, headers = {}, body) => {
      const response = await realFetch(base + path, {
        method,
        // A fresh client address per request, so flood limits never cut the sweep short
        headers: {
          "X-Forwarded-For": `10.${(++ip >> 16) & 255}.${(ip >> 8) & 255}.${ip & 255}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        ...(body !== undefined ? { body } : {}),
      });
      const text = await response.text();
      const visible = `${text}\n${[...response.headers].map(([name, value]) => `${name}: ${value}`).join("\n")}`;
      for (const canary of canaries)
        if (visible.includes(canary))
          exposures.push(
            `${label} ${method} ${path} -> ${response.status} exposes ${canary.slice(0, 18)}…`,
          );
      return response.status;
    };

    const routes = apiRoutes();
    assert.ok(
      routes.length > 140,
      `found ${routes.length} API routes to sweep`,
    );
    assert.ok(
      routes.some((route) => route.path === "/api/properties/nearby") &&
        routes.some((route) => route.path === "/api/geo/search"),
    );
    const fill = (path) => path.replace(/:\w+/g, id);
    const statuses = new Map();
    for (const route of routes) {
      // Guests try every method; signed-in sessions read every GET route
      statuses.set(
        `guest ${route.method} ${route.path}`,
        await call(
          "guest",
          route.method,
          fill(route.path),
          sessions.guest,
          route.method === "GET" ? undefined : "{}",
        ),
      );
      if (route.method === "GET") {
        for (const who of ["agent", "admin"])
          statuses.set(
            `${who} GET ${route.path}`,
            await call(
              who,
              "GET",
              `${fill(route.path)}${route.path.includes("nearby") ? "?latitude=5.6355&longitude=-0.1617" : route.path.includes("geo") ? "?q=Accra" : ""}`,
              sessions[who],
            ),
          );
      }
    }
    // Page routes, error paths and malformed requests
    for (const [method, path, body] of [
      ["GET", "/"],
      ["GET", `/house/${id}`],
      ["GET", "/house/not-an-id"],
      ["GET", "/robots.txt"],
      ["GET", "/sitemap.xml"],
      ["GET", "/admin"],
      ["GET", "/api/does-not-exist"],
      ["POST", "/api/auth/customer/login", "{not json"],
      ["POST", "/api/contact", JSON.stringify({ $where: "1" })],
      ["POST", "/api/payments/paystack/webhook", '{"event":"charge.success"}'],
      ["GET", "/api/payments/reconcile"],
      ["GET", "/api/properties/nearby?latitude=999&longitude=0"],
      ["GET", "/api/geo/search?q=a"],
    ])
      await call("guest", method, path, {}, body);

    await t.test(
      "the place search keeps a keyed geocoder URL private in every failure mode",
      async () => {
        const scenarios = [
          [
            "answers",
            () => ({
              ok: true,
              json: async () => ({
                features: [
                  {
                    geometry: { coordinates: [-0.16, 5.63] },
                    properties: { name: "Accra", type: "city" },
                  },
                ],
              }),
            }),
          ],
          [
            "errors",
            () => ({ ok: false, status: 500, json: async () => ({}) }),
          ],
          [
            "fails",
            (target) => {
              throw new TypeError(`fetch failed for ${target}`);
            },
          ],
          [
            "returns junk",
            () => ({
              ok: true,
              json: async () => {
                throw new SyntaxError(
                  `Unexpected token in ${process.env.GEOCODER_URL}`,
                );
              },
            }),
          ],
        ];
        for (const [name, answer] of scenarios) {
          clearGeocodeCache();
          geocoder = answer;
          const status = await call(
            `geocoder ${name}`,
            "GET",
            "/api/geo/search?q=Accra",
          );
          assert.equal(status, name === "answers" ? 200 : 503, name);
        }
        process.env.GEOCODER_URL = `not a url apikey=${CANARIES.GEOCODER_KEY}`;
        clearGeocodeCache();
        assert.equal(
          await call(
            "geocoder misconfigured",
            "GET",
            "/api/geo/search?q=Accra",
          ),
          503,
        );
        assert.ok(
          logs.some((line) => line.includes("GEOCODER_URL is not a valid URL")),
          "the log still says what to fix",
        );
      },
    );

    await t.test(
      "nearby search without its geo index says it is unavailable instead of crashing",
      async () => {
        await Property.collection.dropIndex("geo_2dsphere");
        const before = logs.length;
        const response = await realFetch(
          `${base}/api/properties/nearby?latitude=5.6355&longitude=-0.1617`,
          { headers: { "X-Forwarded-For": "10.99.99.99" } },
        );
        assert.equal(response.status, 503);
        assert.match(
          (await response.json()).message,
          /temporarily unavailable/,
        );
        const logged = logs.slice(before).join("\n");
        assert.match(logged, /geo index missing/);
        assert.doesNotMatch(
          logged,
          /5\.6355|0\.1617/,
          "the visitor's search point is not logged",
        );
        await Property.createIndexes();
        assert.equal(
          (
            await realFetch(
              `${base}/api/properties/nearby?latitude=5.6355&longitude=-0.1617`,
              { headers: { "X-Forwarded-For": "10.99.99.98" } },
            )
          ).status,
          200,
        );
      },
    );

    await t.test("no route crashes while being swept", () => {
      const crashed = [...statuses]
        .filter(([, status]) => status >= 500)
        .map(([key, status]) => `${status} ${key}`);
      assert.deepEqual(
        crashed,
        [],
        `server errors:\n${crashed.join("\n")}\nlogs:\n${logs.map((line) => line.split("\n").slice(0, 2).join(" | ")).join("\n")}`,
      );
    });
    await t.test("the sweep reached real handlers, not only rejections", () => {
      assert.equal(
        statuses.get("guest GET /api/properties/nearby"),
        400,
        "nearby without a location is validated",
      );
      assert.equal(statuses.get("admin GET /api/properties/nearby"), 200);
      assert.equal(
        statuses.get("admin GET /api/admin/settings/payment-status"),
        200,
        "the admin payment summary was read",
      );
      assert.equal(statuses.get("guest GET /api/settings"), 200);
      assert.equal(
        statuses.get("guest GET /api/admin/dashboard"),
        404,
        "admin routes look absent without the private address",
      );
      assert.ok(
        [...statuses.values()].filter((status) => status === 200).length >= 30,
        "many routes answered with data",
      );
    });

    await t.test(
      "no canary appears in any response, header or log line",
      () => {
        const leakedLogs = logs.filter((line) =>
          canaries.some((canary) => line.includes(canary)),
        );
        assert.deepEqual(exposures, [], "responses");
        assert.deepEqual(
          leakedLogs.map((line) => line.slice(0, 160)),
          [],
          "server logs",
        );
      },
    );
  },
);
