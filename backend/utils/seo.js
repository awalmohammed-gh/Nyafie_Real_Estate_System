import { siteUrl } from "../config/runtime.js";

export const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const absoluteUrl = (path) => new URL(path, siteUrl()).href;
export const privatePath = (path, settings) => /^\/(account|agent|agents|checkout|make-offer|login|register|offer|payment)(\/|$)/.test(path) || path === `/${settings.slugs.agents}`;

/*
 * Search wording. People search the way they speak: "3 bedroom house for rent in East Legon".
 * Titles and descriptions lead with exactly that (type, bedrooms, sale or rent, the place), and
 * every neighbourhood and city with listings has its own page: /rent/east-legon, /sale/accra.
 * placeSlug must match the frontend's copy (frontend/src/utils/places.js); a test checks both.
 */
// Ghanaian letters keep their sound (Ɔdɔ -> odo, Ɛkumfi -> ekumfi); other accents are dropped
export const placeSlug = (name = "") => String(name).toLowerCase().replace(/ɔ/g, "o").replace(/ɛ/g, "e").normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
export const intentWords = (listingType) => (listingType === "Sale" ? "for Sale" : "for Rent");
const typeName = (type = "") => String(type).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const NO_BEDROOMS = /^(land|plot|office|shop|store|warehouse|commercial|hotel)/i;
/** "3-Bedroom House for Rent", "Land for Sale", "Hotel" */
export const propertyHeadline = (property) => {
  const type = typeName(property.propertyType) || "Property";
  if (/^hotel/i.test(property.propertyType || "")) return type;
  const beds = property.bedrooms > 0 && !NO_BEDROOMS.test(property.propertyType || "") ? `${property.bedrooms}-Bedroom ` : "";
  return `${beds}${type} ${intentWords(property.listingType)}`;
};
/** "East Legon, Accra" (no repeats), or "Ghana" */
export const placeLabel = (location = {}) => [...new Set([location.neighbourhood, location.city].map((v) => v?.trim()).filter(Boolean))].join(", ") || "Ghana";
const PERIODS = { month: "/month", night: "/night" };
export const formatPrice = (price, pricePeriod, currency = "GHS") =>
  `${currency === "GHS" ? "GH₵" : `${currency} `}${Math.round(Number(price) || 0).toLocaleString("en-GH")}${PERIODS[pricePeriod] || ""}`;
const sentence = (text = "", max = 160) => {
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
};

/**
 * place (location pages, from routes/seoRoutes.js): { label, listingType, count, minPrice, pricePeriod }
 */
export const pageMetadata = (path, settings, property, place = null) => {
  const name = settings.general.siteName;
  const metadata = {
    pathname: path,
    siteName: name,
    title: settings.seo.title || `${name}: Houses & Apartments for Sale and Rent in Ghana`,
    description: settings.seo.metaDescription || settings.general.description,
    image: settings.seo.ogImage || settings.branding.logo || "/favicon.png",
    canonical: absoluteUrl(path),
    noindex: !settings.seo.allowIndexing || process.env.VERCEL_ENV === "preview" || privatePath(path, settings),
  };
  const titles = {
    [`/${settings.slugs.listings}`]: "Houses, Apartments & Land for Sale and Rent in Ghana",
    [`/${settings.slugs.properties}`]: "Explore Properties in Ghana",
    '/sale': 'Houses & Apartments for Sale in Ghana',
    '/rent': 'Houses & Apartments for Rent in Ghana',
    '/contact': 'Contact our team', '/about': 'About us', '/compare': 'Compare homes',
  };
  if (titles[path]) metadata.title = `${titles[path]} | ${name}`;
  const intros = {
    '/sale': `Find houses, apartments and land for sale across Ghana: Accra, Kumasi, Tema and more. Verified listings with photos, prices and trusted agents on ${name}.`,
    '/rent': `Find houses and apartments for rent across Ghana: Accra, Kumasi, Tema and more. Verified listings with monthly prices, photos and trusted agents on ${name}.`,
  };
  if (intros[path] && !settings.seo.metaDescription) metadata.description = intros[path];
  // Each visitor's own comparison: nothing for search engines to index
  if (path === '/compare') metadata.noindex = true;
  if (place) {
    const words = intentWords(place.listingType);
    metadata.title = `Houses & Apartments ${words} in ${place.label} | ${name}`;
    const from = place.minPrice > 0 ? `, from ${formatPrice(place.minPrice, place.listingType === "Rent" ? place.pricePeriod : "total")}` : "";
    metadata.description = sentence(`${place.count} verified ${place.count === 1 ? "home" : "homes"} ${words.toLowerCase()} in ${place.label}${from}. See photos, prices and the map, and contact trusted agents on ${name}.`);
  }
  if (path.startsWith('/house/')) {
    if (property) {
      const headline = propertyHeadline(property);
      const where = placeLabel(property.location);
      metadata.title = `${headline} in ${where} | ${name}`;
      metadata.description = sentence(`${property.title}: ${headline.toLowerCase()} in ${where} at ${formatPrice(property.price, property.pricePeriod, property.currency)}. ${property.description || `View photos and details, and contact a trusted agent on ${name}.`}`);
      metadata.image = property.images?.[0] || metadata.image;
    } else {
      metadata.title = `Property not found | ${name}`;
      metadata.noindex = true;
    }
  }
  if (metadata.noindex && privatePath(path, settings)) {
    metadata.title = `Sign in | ${name}`;
    metadata.description = `Sign in to ${name} to continue.`;
  }
  metadata.image = absoluteUrl(metadata.image);
  return metadata;
};

/**
 * manifest: the installable app this page belongs to (the agent workspace has its own); default: the site's
 * jsonLd: schema.org structured data (utils/seoContent.js), so search engines read the listing's
 *   price, place and photos, the breadcrumbs and the business behind the site
 * body: plain HTML for the page's main content, placed inside #root. Search engines and link previews
 *   read it without running JavaScript; the app replaces it as soon as it starts.
 */
export const injectMetadata = (template, metadata, { manifest, jsonLd, body } = {}) => {
  let clean = template.replace(/<title>[\s\S]*?<\/title>/gi, '').replace(/<meta\s+[^>]*(?:name=["'](?:description|robots|twitter:[^"']+)["']|property=["']og:[^"']+["'])[^>]*>/gi, '').replace(/<link\s+[^>]*rel=["']canonical["'][^>]*>/gi, '');
  const tag = (name, content, property = false) => `<meta ${property ? 'property' : 'name'}="${name}" content="${escapeHtml(content)}" />`;
  const head = [
    `<title>${escapeHtml(metadata.title)}</title>`,
    tag('description', metadata.description), tag('robots', metadata.noindex ? 'noindex, nofollow' : 'index, follow'),
    `<link rel="canonical" href="${escapeHtml(metadata.canonical)}" />`,
    tag('og:title', metadata.title, true), tag('og:description', metadata.description, true), tag('og:image', metadata.image, true), tag('og:url', metadata.canonical, true), tag('og:type', 'website', true),
    tag('og:site_name', metadata.siteName || '', true), tag('og:locale', 'en_GH', true),
    tag('twitter:card', 'summary_large_image'), tag('twitter:title', metadata.title), tag('twitter:description', metadata.description), tag('twitter:image', metadata.image),
    `<script id="page-metadata" type="application/json">${JSON.stringify(metadata).replace(/</g, '\\u003c')}</script>`,
    // JSON in a script: "<" is escaped so no text in it can end the script early
    ...(jsonLd ? [`<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`] : []),
  ].join('\n');
  if (manifest) clean = clean.replace(/<link\s+[^>]*rel=["']manifest["'][^>]*>/i, `<link rel="manifest" href="${escapeHtml(manifest)}" />`);
  if (body) clean = clean.replace(/<div id="root"><\/div>/, `<div id="root">${body}</div>`);
  return clean.replace(/<\/head>/i, `${head}\n</head>`);
};
