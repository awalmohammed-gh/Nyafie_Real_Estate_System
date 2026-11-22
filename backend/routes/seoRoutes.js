import { Router } from "express";
import mongoose from "mongoose";
import Property from "../models/Property.js";
import { getSettings } from "../models/Setting.js";
import { isPubliclyVisible, publicQuery } from "../utils/marketplace.js";
import { PAGE_CSP } from "../middleware/security.js";
import {
  absoluteUrl,
  escapeHtml,
  injectMetadata,
  pageMetadata,
} from "../utils/seo.js";

const router = Router();
const PAGE_SIZE = 5000;
let templatePromise;
const template = () => {
  if (!templatePromise || process.env.NODE_ENV !== "production") {
    const frontend =
      process.env.FRONTEND_INTERNAL_URL ||
      (process.env.NODE_ENV !== "production" ? "http://127.0.0.1:5173" : "");
    templatePromise = (async () => {
      if (!frontend)
        throw new Error("FRONTEND_INTERNAL_URL service binding is missing.");
      // Resolve relative to the binding's URL base so any path it carries is kept.
      const response = await fetch(
        new URL(
          "index.html",
          frontend.endsWith("/") ? frontend : `${frontend}/`,
        ),
        { signal: AbortSignal.timeout(10000) },
      );
      if (!response.ok) throw new Error("Frontend HTML could not be loaded.");
      const html = await response.text();
      if (!html.includes('id="root"') || !html.includes("</head>"))
        throw new Error("Frontend returned an invalid app shell.");
      return html;
    })().catch((error) => {
      templatePromise = undefined;
      throw error;
    });
  }
  return templatePromise;
};

router.get("/robots.txt", async (_req, res) => {
  const settings = await getSettings();
  const blocked =
    !settings.seo.allowIndexing || process.env.VERCEL_ENV === "preview";
  const rules = blocked
    ? ["User-agent: *", "Disallow: /"]
    : [
        "User-agent: *",
        ...[
          "/api/",
          "/agent",
          `/${settings.slugs.agents}`,
          "/account",
          "/login",
          "/register",
          "/checkout",
          "/make-offer",
          "/payment",
          "/offer",
        ].map((path) => `Disallow: ${path}`),
        `Sitemap: ${absoluteUrl("/sitemap.xml")}`,
      ];
  res
    .type("text/plain")
    .set("Cache-Control", "public, max-age=300, s-maxage=300")
    .send(rules.join("\n") + "\n");
});

router.get("/sitemap.xml", async (_req, res) => {
  const settings = await getSettings();
  if (!settings.seo.allowIndexing || process.env.VERCEL_ENV === "preview")
    return res.status(404).type("text/plain").send("Indexing is disabled.");
  const { query } = await publicQuery();
  const count = await Property.countDocuments(query);
  const locations = [
    "/sitemap-pages.xml",
    ...Array.from(
      { length: Math.ceil(count / PAGE_SIZE) },
      (_, i) => `/sitemap-properties-${i + 1}.xml`,
    ),
  ];
  res
    .type("application/xml")
    .set("Cache-Control", "public, max-age=300, s-maxage=300")
    .send(
      `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locations.map((path) => `<sitemap><loc>${escapeHtml(absoluteUrl(path))}</loc></sitemap>`).join("")}</sitemapindex>`,
    );
});

router.get(
  ["/sitemap-pages.xml", "/sitemap-properties-:page.xml"],
  async (req, res) => {
    const settings = await getSettings();
    if (!settings.seo.allowIndexing || process.env.VERCEL_ENV === "preview")
      return res.status(404).type("text/plain").send("Indexing is disabled.");
    let entries;
    if (!req.params.page)
      entries = [
        "/",
        `/${settings.slugs.properties}`,
        `/${settings.slugs.listings}`,
        "/sale",
        "/rent",
        "/about",
        "/contact",
      ].map((path) => ({ url: absoluteUrl(path) }));
    else {
      const page = Number(req.params.page);
      if (!Number.isSafeInteger(page) || page < 1 || page > 10000)
        return res.sendStatus(404);
      const { query } = await publicQuery();
      const properties = await Property.find(query)
        .select("_id updatedAt")
        .sort({ _id: 1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean();
      entries = properties.map((property) => ({
        url: absoluteUrl(`/house/${property._id}`),
        modified: property.updatedAt,
      }));
    }
    res
      .type("application/xml")
      .set("Cache-Control", "public, max-age=300, s-maxage=300")
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map((entry) => `<url><loc>${escapeHtml(entry.url)}</loc>${entry.modified ? `<lastmod>${new Date(entry.modified).toISOString()}</lastmod>` : ""}</url>`).join("")}</urlset>`,
      );
  },
);

router.get(
  [
    "/",
    "/:slug",
    "/house/:id",
    "/agents/:id",
    "/agent/{*path}",
    "/account/{*path}",
    "/checkout/{*path}",
    "/payment/{*path}",
    "/make-offer/:id",
    "/{*unmatched}",
  ],
  async (req, res) => {
    const settings = await getSettings();
    let property;
    let status = 200;
    if (req.params.unmatched) status = 404;
    const renamed = ["properties", "listings", "agents"].find(
      (name) => req.params.slug === name && settings.slugs[name] !== name,
    );
    if (renamed)
      return res.redirect(
        301,
        `/${settings.slugs[renamed]}${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}`,
      );
    if (req.path.startsWith("/house/")) {
      // The listing, then the same visibility rule as the API checked for its owner only
      property = mongoose.isValidObjectId(req.params.id)
        ? await Property.findById(req.params.id)
            .select(
              "title description images location status staleSince ownerType owner",
            )
            .lean()
        : null;
      if (!property || !(await isPubliclyVisible(property))) {
        property = null;
        status = 404;
      }
    } else if (
      req.params.slug &&
      ![
        ...Object.values(settings.slugs),
        "sale",
        "rent",
        "contact",
        "about",
        "compare",
        "login",
        "register",
        "offer",
        "agent",
        "account",
      ].includes(req.params.slug)
    )
      status = 404;
    // The admin console (at its private address, or the old /admin) is served exactly like a missing page
    const metadata = pageMetadata(req.path, settings, property);
    if (status === 404) {
      metadata.title = `Page not found | ${settings.general.siteName}`;
      metadata.noindex = true;
    }
    // The HTML holds no account data (the SPA checks sessions itself), so Vercel's CDN may keep it for a
    // minute and refresh it in the background: most visits are then answered without starting the
    // backend. Browsers always revalidate (max-age=0), and a new deployment clears the CDN copy.
    res.set({
      "Cache-Control":
        "public, max-age=0, s-maxage=60, stale-while-revalidate=600",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      // Report-only until production logs confirm nothing legitimate is caught (middleware/security.js)
      "Content-Security-Policy-Report-Only": PAGE_CSP,
    });
    if (metadata.noindex) res.set("X-Robots-Tag", "noindex, nofollow");
    // The HTML contains no private agent/account data. The SPA performs its usual session guards.
    // Agent pages install as the agent app (frontend/public/agent.webmanifest). The admin console's
    // address is served exactly like a missing page, so it never names an app here: the console
    // points the browser at its own app once it has recognised the address (frontend utils/appManifest.js).
    const manifest = /^\/agent(\/|$)/.test(req.path) ? "/agent.webmanifest" : undefined;
    res
      .status(status)
      .type("html")
      .send(injectMetadata(await template(), metadata, { manifest }));
  },
);
export default router;
