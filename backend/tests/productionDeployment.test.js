import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Setting from "../models/Setting.js";
import Subscription from "../models/Subscription.js";
import RateLimitBucket from "../models/RateLimitBucket.js";
import { cloudinary } from "../config/cloudinary.js";
import { createApp } from "../app.js";
import { validateRuntimeConfig, paymentReturnUrl, clientOrigins } from "../config/runtime.js";
import { setAuthCookie } from "../utils/generateToken.js";
import { injectMetadata } from "../utils/seo.js";
import { ensureAdmin } from "../utils/ensureAdmin.js";
import { rateLimit } from "../middleware/security.js";

const query = (value) => ({ then: (yes, no) => Promise.resolve(value).then(yes, no), catch: (no) => Promise.resolve(value).catch(no), select: () => query(value), populate: () => query(value), sort: () => query(value), limit: () => query(value), skip: () => query(value), lean: () => Promise.resolve(value) });
const listen = async (server) => { server.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve)); return `http://127.0.0.1:${server.address().port}`; };

test("production configuration, metadata, uploads and marketplace security", async (t) => {
  const keys = ['NODE_ENV', 'PUBLIC_SITE_URL', 'CLIENT_URL', 'JWT_KEY', 'COOKIE_SAME_SITE', 'VERCEL_ENV', 'VERCEL_URL', 'VERCEL_BRANCH_URL', 'FRONTEND_INTERNAL_URL', 'MONGODB_URI', 'CLOUD_NAME', 'CLOUD_API_KEY', 'CLOUD_SECRET_KEY', 'ADMIN_EMAIL', 'ADMIN_PSD'];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { NODE_ENV: 'production', PUBLIC_SITE_URL: 'https://homeb-real-estate.vercel.app', CLIENT_URL: 'https://homeb-real-estate.vercel.app', JWT_KEY: 'production-fixture-signing-key-at-least-32-characters', MONGODB_URI: 'mongodb://example.test/test', CLOUD_NAME: 'test', CLOUD_API_KEY: 'fixture', CLOUD_SECRET_KEY: 'fixture' });
  delete process.env.COOKIE_SAME_SITE;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_URL;
  delete process.env.VERCEL_BRANCH_URL;
  const customer = new User({ firstName: 'Customer', lastName: 'Test', email: 'customer@example.test', role: 'user', isActive: true });
  const agent = new User({ firstName: 'Agent', lastName: 'Test', email: 'agent@example.test', role: 'agent', isActive: true, agentApplication: { status: 'approved' } });
  const admin = new User({ firstName: 'Admin', lastName: 'Test', email: 'admin@example.test', role: 'admin', isActive: true });
  const property = new Property({ title: 'Accra & East Legon Home', description: 'A comfortable home with a garden in Accra.', owner: agent._id, ownerType: 'agent', status: 'published', images: ['/home.jpg'], location: { city: 'Accra' } });
  let requireSubscription = false;
  let savedSubscription = null;
  t.mock.method(User, 'findById', (id) => query([customer, agent, admin].find((user) => String(user._id) === String(id))));
  t.mock.method(User, 'find', () => query([agent]));
  t.mock.method(Setting, 'findOneAndUpdate', () => query({ agent: { requireSubscription } }));
  t.mock.method(Subscription, 'findById', () => query(savedSubscription));
  t.mock.method(Property, 'countDocuments', () => Promise.resolve(1));
  t.mock.method(Property, 'findOne', () => query(property));
  t.mock.method(Property, 'find', () => query([property]));
  let uploadCalls = 0;
  t.mock.method(cloudinary.uploader, 'upload', async (_image, options) => { uploadCalls++; assert.match(options.folder, /^homebase\/uploads\/[a-f\d]{24}$/); return { secure_url: 'https://res.cloudinary.com/test/image/upload/photo.jpg' }; });
  const buckets = new Map();
  t.mock.method(RateLimitBucket, 'findOneAndUpdate', async ({ _id }, update) => {
    assert.match(_id, /^[a-f\d]{64}$/);
    const hits = (buckets.get(_id) || 0) + update.$inc.hits;
    buckets.set(_id, hits);
    return { hits };
  });
  const frontend = http.createServer((_req, res) => res.end('<!doctype html><html><head><title>Old title</title><meta name="description" content="Old description"></head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>'));
  process.env.FRONTEND_INTERNAL_URL = await listen(frontend);
  let initializations = 0;
  const app = createApp({ initialize: async () => { initializations++; } });
  const server = http.createServer(app);
  const base = await listen(server);
  const cookie = (user, session) => `${session}_token=${jwt.sign({ id: String(user._id), role: user.role, session }, process.env.JWT_KEY, { expiresIn: '1h' })}`;
  const call = (path, user, session = 'customer', body) => fetch(base + path, { method: body ? 'POST' : 'GET', headers: { Origin: 'https://homeb-real-estate.vercel.app', 'X-Session-Domain': session, ...(user ? { Cookie: cookie(user, session) } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    await t.test('runtime rejects missing or weak production credentials without exposing values', () => {
      validateRuntimeConfig();
      const key = process.env.JWT_KEY;
      process.env.JWT_KEY = 'short';
      assert.throws(validateRuntimeConfig, /at least 32/);
      process.env.JWT_KEY = key;
      const url = process.env.PUBLIC_SITE_URL;
      delete process.env.PUBLIC_SITE_URL;
      assert.throws(validateRuntimeConfig, /PUBLIC_SITE_URL/);
      process.env.PUBLIC_SITE_URL = url;
      process.env.CLIENT_URL = 'https://homeb-real-estate.vercel.app/path';
      assert.throws(validateRuntimeConfig, /valid HTTPS origins/);
      process.env.CLIENT_URL = 'https://homeb-real-estate.vercel.app';
    });
    await t.test('callbacks have a single canonical origin; previews accept only their own configured origins', () => {
      process.env.CLIENT_URL = 'https://homeb-real-estate.vercel.app,https://www.example.test';
      assert.equal(paymentReturnUrl({ get: () => 'https://www.example.test' }), 'https://homeb-real-estate.vercel.app');
      process.env.VERCEL_ENV = 'preview';
      process.env.VERCEL_URL = 'homebase-preview.vercel.app';
      assert.ok(clientOrigins().includes('https://homebase-preview.vercel.app'));
      assert.equal(paymentReturnUrl({ get: () => 'https://evil.example' }), 'https://homeb-real-estate.vercel.app');
      assert.equal(paymentReturnUrl({ get: () => 'https://homebase-preview.vercel.app' }), 'https://homebase-preview.vercel.app');
      delete process.env.VERCEL_ENV; delete process.env.VERCEL_URL;
      process.env.CLIENT_URL = 'https://homeb-real-estate.vercel.app';
    });
    await t.test('role cookies are host-only, HTTP-only, secure and same-site; cross-site requires explicit configuration', () => {
      for (const session of ['customer', 'agent', 'admin']) setAuthCookie({ cookie: (_name, _token, options) => { assert.equal(options.secure, true); assert.equal(options.httpOnly, true); assert.equal(options.sameSite, 'lax'); assert.equal(options.domain, undefined); } }, customer._id, session);
      process.env.COOKIE_SAME_SITE = 'none';
      setAuthCookie({ cookie: (_name, _token, options) => assert.equal(options.sameSite, 'none') }, customer._id, 'customer');
      delete process.env.COOKIE_SAME_SITE;
    });
    await t.test('app entrypoint initializes per request and serves health safely without opening a listener on import', async () => {
      const response = await call('/api/health');
      assert.equal(response.status, 200);
      assert.equal((await response.json()).service, 'HomeBase');
      assert.ok(initializations > 0);
    });
    await t.test('direct property URLs deliver dynamic metadata and the SPA assets before JavaScript', async () => {
      const response = await call(`/house/${property._id}`);
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /text\/html/);
      assert.match(html, /<title>Accra &amp; East Legon Home \| HomeBase<\/title>/);
      assert.ok(html.includes(`https://homeb-real-estate.vercel.app/house/${property._id}`));
      assert.ok(html.includes('/assets/app.js'));
      assert.equal(html.includes('agent@example.test'), false);
      assert.equal(html.includes('Old description'), false);
    });
    await t.test('private deep links are noindex and unknown public routes return 404', async () => {
      for (const path of ['/agents', '/agents/123', '/agent/login', '/agent/dashboard', '/account/profile', '/admin/dashboard', '/payment/success', '/payment/failed']) {
        const response = await call(path);
        assert.equal(response.status, 200, path);
        assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow', path);
      }
      assert.equal((await call('/unknown-page')).status, 404);
      assert.equal((await call('/unknown/nested/page')).status, 404);
      assert.equal((await call('/house/invalid-id')).status, 404);
    });
    await t.test('robots and sitemap contain canonical public pages and visible properties, never private profiles', async () => {
      const robots = await (await call('/robots.txt')).text();
      assert.match(robots, /Sitemap: https:\/\/homeb-real-estate.vercel.app\/sitemap.xml/);
      assert.match(robots, /Disallow: \/agents/);
      const index = await (await call('/sitemap.xml')).text();
      assert.match(index, /sitemap-properties-1.xml/);
      const pages = await (await call('/sitemap-pages.xml')).text();
      assert.equal(pages.includes('/agents'), false);
      assert.equal(pages.includes('/admin'), false);
      const properties = await (await call('/sitemap-properties-1.xml')).text();
      assert.ok(properties.includes(`/house/${property._id}`));
      process.env.VERCEL_ENV = 'preview';
      assert.match(await (await call('/robots.txt')).text(), /Disallow: \//);
      assert.equal((await call('/sitemap.xml')).status, 404);
      delete process.env.VERCEL_ENV;
    });
    await t.test('metadata escapes markup and script terminators', () => {
      const html = injectMetadata('<html><head></head></html>', { title: '</title><script>alert(1)</script>', description: '" /><script>bad()</script>', image: '/image.png', canonical: 'https://homeb-real-estate.vercel.app' });
      assert.equal(html.includes('<script>alert(1)</script>'), false);
      assert.equal(html.includes('<script>bad()</script>'), false);
      assert.match(html, /\\u003c/);
    });
    await t.test('image upload requires the appropriate session and refuses malformed or oversized images', async () => {
      const image = { image: 'data:image/jpeg;base64,YQ==', folder: 'untrusted' };
      assert.equal((await call('/api/uploads/image', null, 'agent', image)).status, 401);
      assert.equal((await call('/api/uploads/image', customer, 'customer', image)).status, 403);
      assert.equal((await call('/api/uploads/image', agent, 'agent', { image: 'https://example.test' })).status, 400);
      assert.equal((await call('/api/uploads/image', agent, 'agent', { image: 'data:image/jpeg;base64,' + 'A'.repeat(3 * 1024 * 1024) })).status, 413);
      for (const [user, session] of [[agent, 'agent'], [admin, 'admin']]) assert.equal((await call('/api/uploads/image', user, session, image)).status, 201);
      assert.equal(uploadCalls, 2);
      agent.isActive = false;
      assert.equal((await call('/api/uploads/image', agent, 'agent', image)).status, 403);
      agent.isActive = true;
    });
    await t.test('customers cannot enter role APIs; unsubscribed and expired agents cannot add listings', async () => {
      assert.equal((await call('/api/admin/dashboard', customer)).status, 403);
      assert.equal((await call('/api/agents/dashboard', customer)).status, 403);
      assert.equal((await call('/api/admin/dashboard', agent, 'agent')).status, 403);
      assert.equal((await call('/api/users/saved')).status, 401);
      requireSubscription = true;
      assert.equal((await call('/api/properties', agent, 'agent', { title: 'Bypass' })).status, 403);
      agent.subscription = admin._id;
      savedSubscription = { status: 'active', paymentStatus: 'paid', expiresAt: new Date('2020-01-01'), plan: { propertyLimit: 10 } };
      assert.equal((await call('/api/properties', agent, 'agent', { title: 'Bypass' })).status, 403);
      requireSubscription = false;
      agent.subscription = undefined;
    });
    await t.test('rate limits share atomic production counters across instances', async () => {
      const first = rateLimit({ windowMs: 10000, max: 2 });
      const second = rateLimit({ windowMs: 10000, max: 2 });
      const req = { ip: 'fixture-limit' };
      let nextCalls = 0;
      const res = { code: 200, set() {}, status(code) { this.code = code; return this; }, json() {} };
      const next = (error) => { assert.equal(error, undefined); nextCalls++; };
      await first(req, res, next); await second(req, res, next); await first(req, res, next);
      assert.equal(nextCalls, 2);
      assert.equal(res.code, 429);
    });
    await t.test('admin bootstrap refuses to promote a customer or overwrite their password', async () => {
      process.env.ADMIN_EMAIL = customer.email;
      process.env.ADMIN_PSD = 'fixture-password123';
      t.mock.method(User, 'exists', async () => false);
      t.mock.method(User, 'findOne', async () => customer);
      await assert.rejects(ensureAdmin(), /dedicated admin email/);
      assert.equal(customer.role, 'user');
    });
  } finally {
    await Promise.all([new Promise((resolve) => server.close(resolve)), new Promise((resolve) => frontend.close(resolve))]);
    for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }
  }
});
