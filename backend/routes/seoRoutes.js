import { Router } from "express";
import mongoose from "mongoose";
import Property from "../models/Property.js";
import { getSettings } from "../models/Setting.js";
import { publicQuery } from "../utils/marketplace.js";
import { absoluteUrl, escapeHtml, injectMetadata, pageMetadata } from "../utils/seo.js";

const router = Router();
const PAGE_SIZE = 5000;
let templatePromise;
const template = () => {
  if (!templatePromise || process.env.NODE_ENV !== "production") {
    const frontend = process.env.FRONTEND_INTERNAL_URL || (process.env.NODE_ENV !== "production" ? "http://127.0.0.1:5173" : "");
    templatePromise = (async () => {
      if (!frontend) throw new Error('FRONTEND_INTERNAL_URL service binding is missing.');
      const response = await fetch(new URL('/index.html', frontend), { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Frontend HTML could not be loaded.');
      const html = await response.text();
      if (!html.includes('id="root"') || !html.includes('</head>')) throw new Error('Frontend returned an invalid app shell.');
      return html;
    })().catch((error) => { templatePromise = undefined; throw error; });
  }
  return templatePromise;
};

router.get('/robots.txt', async (_req, res) => {
  const settings = await getSettings();
  const blocked = !settings.seo.allowIndexing || process.env.VERCEL_ENV === 'preview';
  const rules = blocked ? ['User-agent: *', 'Disallow: /'] : ['User-agent: *', ...['/api/', '/admin', '/agent', `/${settings.slugs.agents}`, '/account', '/login', '/register', '/checkout', '/make-offer', '/payment', '/offer'].map((path) => `Disallow: ${path}`), `Sitemap: ${absoluteUrl('/sitemap.xml')}`];
  res.type('text/plain').set('Cache-Control', 'public, max-age=300').send(rules.join('\n') + '\n');
});

router.get('/sitemap.xml', async (_req, res) => {
  const settings = await getSettings();
  if (!settings.seo.allowIndexing || process.env.VERCEL_ENV === 'preview') return res.status(404).type('text/plain').send('Indexing is disabled.');
  const { query } = await publicQuery();
  const count = await Property.countDocuments(query);
  const locations = ['/sitemap-pages.xml', ...Array.from({ length: Math.ceil(count / PAGE_SIZE) }, (_, i) => `/sitemap-properties-${i + 1}.xml`)];
  res.type('application/xml').set('Cache-Control', 'public, max-age=300').send(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locations.map((path) => `<sitemap><loc>${escapeHtml(absoluteUrl(path))}</loc></sitemap>`).join('')}</sitemapindex>`);
});

router.get(['/sitemap-pages.xml', '/sitemap-properties-:page.xml'], async (req, res) => {
  const settings = await getSettings();
  if (!settings.seo.allowIndexing || process.env.VERCEL_ENV === 'preview') return res.status(404).type('text/plain').send('Indexing is disabled.');
  let entries;
  if (!req.params.page) entries = ['/', `/${settings.slugs.properties}`, `/${settings.slugs.listings}`, '/sale', '/rent', '/contact'].map((path) => ({ url: absoluteUrl(path) }));
  else {
    const page = Number(req.params.page);
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) return res.sendStatus(404);
    const { query } = await publicQuery();
    const properties = await Property.find(query).select('_id updatedAt').sort({ _id: 1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean();
    entries = properties.map((property) => ({ url: absoluteUrl(`/house/${property._id}`), modified: property.updatedAt }));
  }
  res.type('application/xml').set('Cache-Control', 'public, max-age=300').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map((entry) => `<url><loc>${escapeHtml(entry.url)}</loc>${entry.modified ? `<lastmod>${new Date(entry.modified).toISOString()}</lastmod>` : ''}</url>`).join('')}</urlset>`);
});

router.get(['/', '/:slug', '/house/:id', '/agents/:id', '/agent/{*path}', '/admin/{*path}', '/account/{*path}', '/checkout/{*path}', '/payment/{*path}', '/make-offer/:id', '/{*unmatched}'], async (req, res) => {
  const settings = await getSettings();
  let property;
  let status = 200;
  if (req.params.unmatched) status = 404;
  const renamed = ['properties', 'listings', 'agents'].find((name) => req.params.slug === name && settings.slugs[name] !== name);
  if (renamed) return res.redirect(301, `/${settings.slugs[renamed]}${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`);
  if (req.path.startsWith('/house/')) {
    const { query } = await publicQuery();
    property = mongoose.isValidObjectId(req.params.id) ? await Property.findOne({ _id: req.params.id, ...query }).select('title description images location').lean() : null;
    if (!property) status = 404;
  } else if (req.params.slug && ![...Object.values(settings.slugs), 'sale', 'rent', 'contact', 'login', 'register', 'offer', 'agent', 'admin', 'account'].includes(req.params.slug)) status = 404;
  const metadata = pageMetadata(req.path, settings, property);
  if (status === 404) { metadata.title = `Page not found | ${settings.general.siteName}`; metadata.noindex = true; }
  res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
  if (metadata.noindex) res.set('X-Robots-Tag', 'noindex, nofollow');
  // The HTML contains no private agent/account data. The SPA performs its usual session guards.
  res.status(status).type('html').send(injectMetadata(await template(), metadata));
});
export default router;
