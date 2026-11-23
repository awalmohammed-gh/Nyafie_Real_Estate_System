import { Router } from "express";
import mongoose from "mongoose";
import Property from "../models/Property.js";
import { getSettings } from "../models/Setting.js";
import { isPubliclyVisible, placeFilter, publicQuery } from "../utils/marketplace.js";
import { PAGE_CSP } from "../middleware/security.js";
import {
  absoluteUrl,
  escapeHtml,
  injectMetadata,
  pageMetadata,
  placeLabel,
  placeSlug,
} from "../utils/seo.js";
import { pageContent, structuredData } from "../utils/seoContent.js";
import { memo } from "../utils/memo.js";

const router = Router();
const PAGE_SIZE = 5000;

/**
 * Every neighbourhood and city with public listings, for sale and for rent: the location pages
 * (/rent/east-legon, /sale/accra), their sitemap entries and the area links on hub pages. It comes
 * from the listings themselves, so a listing published in a new place gives that place a page (and a
 * sitemap entry) on its own, and a place whose last listing goes returns 404.
 *  - Spellings of the same place are one page: "East Legon", "east legon " and "East-Legon" all have the
 *    address east-legon. `names` keeps every spelling (location pages fetch the listings of all of them);
 *    the page shows the spelling most listings use.
 *  - Neighbourhoods come first, so a neighbourhood and a city with the same name share the neighbourhood's page.
 *  - One grouped query (with the indexes on status/listingType/location in models/Property.js), kept for
 *    5 minutes per server instance: traffic never multiplies it, however many listings and visitors there are.
 * { Sale: [...], Rent: [...] } of { slug, kind, names, name, city, label, count, minPrice, pricePeriod }
 */
const PLACE_INDEX_MS = 5 * 60 * 1000;
const loadPlaceIndex = async () => {
  const { query } = await publicQuery();
  const group = (field, extra = {}) => [
    { $match: { [field]: { $nin: ["", null] } } },
    { $group: { _id: { listingType: "$listingType", name: `$${field}` }, count: { $sum: 1 }, minPrice: { $first: "$price" }, pricePeriod: { $first: "$pricePeriod" }, ...extra } },
  ];
  const [facet] = await Property.aggregate([
    { $match: query },
    { $sort: { price: 1 } },
    { $facet: { areas: group("location.neighbourhood", { city: { $first: "$location.city" } }), cities: group("location.city") } },
  ]);
  const byKey = new Map(); // "Rent:east-legon" -> place
  const add = (row, kind) => {
    const { listingType, name } = row._id;
    const slug = placeSlug(name);
    if (!["Sale", "Rent"].includes(listingType) || !slug) return;
    const key = `${listingType}:${slug}`;
    const place = byKey.get(key);
    if (place && place.kind !== kind) return; // a neighbourhood already has this address
    if (!place) {
      byKey.set(key, { listingType, slug, kind, names: [name], spellings: { [name]: row.count }, city: row.city || "", count: row.count, minPrice: row.minPrice, pricePeriod: row.pricePeriod });
      return;
    }
    place.names.push(name);
    place.spellings[name] = row.count;
    place.count += row.count;
    if (row.minPrice < place.minPrice) Object.assign(place, { minPrice: row.minPrice, pricePeriod: row.pricePeriod });
    if (!place.city && row.city) place.city = row.city;
  };
  facet.areas.forEach((row) => add(row, "area"));
  facet.cities.forEach((row) => add(row, "city"));
  const places = { Sale: [], Rent: [] };
  for (const { listingType, spellings, ...place } of byKey.values()) {
    const name = Object.entries(spellings).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0].trim();
    places[listingType].push({ ...place, name, label: place.kind === "area" ? placeLabel({ neighbourhood: name, city: place.city }) : name });
  }
  for (const list of Object.values(places)) list.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return places;
};
const placeIndex = memo(loadPlaceIndex, PLACE_INDEX_MS);

// The newest public listings matching `filter`, with what titles, descriptions and links need
const LISTING_FIELDS = "title description images location price pricePeriod currency propertyType listingType bedrooms bathrooms area availability createdAt";
// ($and, never a spread: the visibility rule's own $or must not be replaced by a filter's $or)
const recentListings = async (filter = {}, limit = 24) => {
  const { query } = await publicQuery();
  return Property.find({ $and: [query, filter] }).select(LISTING_FIELDS).sort({ createdAt: -1 }).limit(limit).lean();
};
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
    if (!req.params.page) {
      // Fixed pages, then a page per neighbourhood and city with listings (for sale and for rent)
      const places = await placeIndex();
      entries = [
        "/",
        `/${settings.slugs.properties}`,
        `/${settings.slugs.listings}`,
        "/sale",
        "/rent",
        ...places.Sale.map((place) => `/sale/${place.slug}`),
        ...places.Rent.map((place) => `/rent/${place.slug}`),
        "/about",
        "/contact",
      ].map((path) => ({ url: absoluteUrl(path) }));
    } else {
      const page = Number(req.params.page);
      if (!Number.isSafeInteger(page) || page < 1 || page > 10000)
        return res.sendStatus(404);
      const { query } = await publicQuery();
      const properties = await Property.find(query)
        .select("_id updatedAt images")
        .sort({ _id: 1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean();
      entries = properties.map((property) => ({
        url: absoluteUrl(`/house/${property._id}`),
        modified: property.updatedAt,
        // Listing photos, so they can appear in image search too
        images: (property.images || []).slice(0, 5).map((image) => absoluteUrl(image)),
      }));
    }
    const images = (entry) => (entry.images || []).map((image) => `<image:image><image:loc>${escapeHtml(image)}</image:loc></image:image>`).join("");
    res
      .type("application/xml")
      .set("Cache-Control", "public, max-age=300, s-maxage=300")
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${entries.map((entry) => `<url><loc>${escapeHtml(entry.url)}</loc>${entry.modified ? `<lastmod>${new Date(entry.modified).toISOString()}</lastmod>` : ""}${images(entry)}</url>`).join("")}</urlset>`,
      );
  },
);

router.get(
  [
    "/",
    "/:slug",
    "/house/:id",
    "/sale/:place",
    "/rent/:place",
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
    let place = null;
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
              `${LISTING_FIELDS} status staleSince ownerType owner`,
            )
            .lean()
        : null;
      if (!property || !(await isPubliclyVisible(property))) {
        property = null;
        status = 404;
      }
    } else if (req.params.place) {
      // A location page: a neighbourhood or city with public listings for sale / for rent
      const listingType = req.path.startsWith("/sale/") ? "Sale" : "Rent";
      const found = (await placeIndex())[listingType].find((entry) => entry.slug === req.params.place.toLowerCase());
      if (found) place = { ...found, listingType };
      else status = 404;
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
    const path = place ? `/${place.listingType === "Sale" ? "sale" : "rent"}/${place.slug}` : req.path;
    const metadata = pageMetadata(path, settings, property, place);
    if (status === 404) {
      metadata.title = `Page not found | ${settings.general.siteName}`;
      metadata.noindex = true;
    }
    // Structured data and readable main content for public pages (missing and private pages get none,
    // so the admin console's address stays identical to any missing page)
    let seo = {};
    if (status === 200 && !metadata.noindex) {
      const hub = ["/sale", "/rent", "/", `/${settings.slugs.listings}`].includes(path);
      const places = place || hub ? await placeIndex() : undefined;
      const listingType = place?.listingType || (path === "/sale" ? "Sale" : path === "/rent" ? "Rent" : null);
      const listings = place
        ? await recentListings({ listingType: place.listingType, ...placeFilter(place.kind === "area" ? "area" : "city", place.slug, place.names) })
        : hub ? await recentListings(listingType ? { listingType } : {}, listingType ? 24 : 12) : [];
      seo = {
        jsonLd: structuredData({ path, settings, property, place, listings }),
        body: pageContent({ path, settings, metadata, property, place, listings, places }),
      };
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
      // Enforced: what it allows and why is listed in middleware/security.js; violations are still reported
      "Content-Security-Policy": PAGE_CSP,
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
      .send(injectMetadata(await template(), metadata, { manifest, ...seo }));
  },
);
export default router;
