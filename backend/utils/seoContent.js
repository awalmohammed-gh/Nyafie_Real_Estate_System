import { siteUrl } from "../config/runtime.js";
import { absoluteUrl, escapeHtml, formatPrice, intentWords, placeLabel, placeSlug, propertyHeadline } from "./seo.js";

/*
 * What search engines read on a page besides its title and description (routes/seoRoutes.js):
 *  - structuredData(): schema.org JSON-LD. The business behind the site and its search box (homepage),
 *    each listing's price, place, size and photos, location pages' listings, and breadcrumbs.
 *    Exact map pins are never included (some listings only show an approximate area).
 *  - pageContent(): the page's main text as plain HTML inside #root, readable without JavaScript
 *    (search engines that don't run it, link previews, AI search). The app replaces it when it starts.
 * Both describe only what the page itself shows publicly.
 */

const AVAILABILITY = { Available: "https://schema.org/InStock", "Under Offer": "https://schema.org/LimitedAvailability", Sold: "https://schema.org/SoldOut", Rented: "https://schema.org/SoldOut" };
const HOUSE = /house|duplex|villa|bungalow|townhouse|mansion|detached|semi/i;
const APARTMENT = /apartment|flat|studio|condo|penthouse/i;
const accommodationType = (type = "") => (HOUSE.test(type) ? "House" : APARTMENT.test(type) ? "Apartment" : /^hotel/i.test(type) ? "Hotel" : /land|plot/i.test(type) ? "Place" : "Accommodation");
const intentPath = (listingType) => (listingType === "Sale" ? "/sale" : "/rent");
const intentName = (listingType) => (listingType === "Sale" ? "For sale" : "For rent");

const breadcrumbList = (items) => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], index) => ({ "@type": "ListItem", position: index + 1, name, item: absoluteUrl(path) })),
});

const organization = (settings) => {
  const { contact = {}, social = {}, general, branding = {} } = settings;
  const sameAs = Object.values(social).filter((url) => typeof url === "string" && /^https:\/\//.test(url));
  return {
    "@type": "RealEstateAgent",
    "@id": `${siteUrl()}/#organization`,
    name: general.siteName,
    description: general.description,
    url: `${siteUrl()}/`,
    logo: absoluteUrl(branding.logo || "/brand/nyafie-logo-purple.png"),
    image: absoluteUrl("/icons/icon-512.png"),
    ...(contact.phone && { telephone: contact.phone }),
    ...(contact.email && { email: contact.email }),
    ...(contact.address && { address: { "@type": "PostalAddress", streetAddress: contact.address, addressCountry: "GH" } }),
    areaServed: { "@type": "Country", name: "Ghana" },
    ...(sameAs.length && { sameAs }),
  };
};

const listingData = (property, url) => {
  const location = property.location || {};
  const offer = {
    "@type": "Offer",
    price: property.price,
    priceCurrency: property.currency || "GHS",
    availability: AVAILABILITY[property.availability] || AVAILABILITY.Available,
    businessFunction: property.listingType === "Sale" ? "http://purl.org/goodrelations/v1#Sell" : "http://purl.org/goodrelations/v1#LeaseOut",
    ...(["month", "night"].includes(property.pricePeriod) && {
      priceSpecification: { "@type": "UnitPriceSpecification", price: property.price, priceCurrency: property.currency || "GHS", unitCode: property.pricePeriod === "month" ? "MON" : "DAY" },
    }),
  };
  return {
    "@type": "RealEstateListing",
    "@id": `${url}#listing`,
    url,
    name: property.title,
    description: String(property.description || property.title).replace(/\s+/g, " ").slice(0, 500),
    ...(property.images?.length && { image: property.images.slice(0, 6).map((image) => absoluteUrl(image)) }),
    ...(property.createdAt && { datePosted: new Date(property.createdAt).toISOString() }),
    offers: offer,
    about: {
      "@type": accommodationType(property.propertyType),
      name: `${propertyHeadline(property)} in ${placeLabel(location)}`,
      ...(property.bedrooms > 0 && { numberOfBedrooms: property.bedrooms, numberOfRooms: property.bedrooms }),
      ...(property.bathrooms > 0 && { numberOfBathroomsTotal: property.bathrooms }),
      ...(property.area > 0 && { floorSize: { "@type": "QuantitativeValue", value: property.area, unitCode: "MTK" } }),
      address: {
        "@type": "PostalAddress",
        ...((location.neighbourhood || location.city) && { addressLocality: location.neighbourhood || location.city }),
        ...(location.region && { addressRegion: location.region }),
        addressCountry: "GH",
      },
    },
  };
};

/** JSON-LD for a page, or null when it has none (private pages, missing pages). */
export const structuredData = ({ path, settings, property = null, place = null, listings = [] }) => {
  const graph = [];
  if (path === "/") {
    const org = organization(settings);
    graph.push(org, {
      "@type": "WebSite",
      "@id": `${siteUrl()}/#website`,
      url: `${siteUrl()}/`,
      name: settings.general.siteName,
      inLanguage: "en-GH",
      publisher: { "@id": org["@id"] },
      // The sitelinks search box: searches go to the listings page
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${absoluteUrl(`/${settings.slugs.listings}`)}?search={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    });
  }
  if (property) {
    const url = absoluteUrl(path);
    const location = property.location || {};
    const trail = [["Home", "/"], [intentName(property.listingType), intentPath(property.listingType)]];
    if (location.city) trail.push([location.city, `${intentPath(property.listingType)}/${placeSlug(location.city)}`]);
    if (location.neighbourhood && location.neighbourhood !== location.city) trail.push([location.neighbourhood, `${intentPath(property.listingType)}/${placeSlug(location.neighbourhood)}`]);
    trail.push([property.title, path]);
    graph.push(listingData(property, url), breadcrumbList(trail));
  }
  if (place) {
    graph.push(
      breadcrumbList([["Home", "/"], [intentName(place.listingType), intentPath(place.listingType)], [place.label, path]]),
      {
        "@type": "ItemList",
        name: `Houses & Apartments ${intentWords(place.listingType)} in ${place.label}`,
        numberOfItems: place.count,
        itemListElement: listings.map((listing, index) => ({ "@type": "ListItem", position: index + 1, url: absoluteUrl(`/house/${listing._id}`), name: listing.title })),
      },
    );
  }
  if (["/sale", "/rent"].includes(path)) graph.push(breadcrumbList([["Home", "/"], [intentName(path === "/sale" ? "Sale" : "Rent"), path]]));
  return graph.length ? { "@context": "https://schema.org", "@graph": graph } : null;
};

const link = (href, text) => `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`;
const listingItem = (listing) => `<li>${link(`/house/${listing._id}`, listing.title)}: ${escapeHtml(propertyHeadline(listing))} in ${escapeHtml(placeLabel(listing.location))}, ${escapeHtml(formatPrice(listing.price, listing.pricePeriod, listing.currency))}</li>`;
const placeLinks = (places, listingType) => places.length
  ? `<h2>${escapeHtml(`Homes ${intentWords(listingType).toLowerCase()} by area`)}</h2><ul>${places.map((place) => `<li>${link(`${intentPath(listingType)}/${place.slug}`, `${intentName(listingType)} in ${place.label}`)} (${place.count})</li>`).join("")}</ul>`
  : "";

/**
 * Main content HTML for a page (escaped), or "" when the page gets none.
 * places: { Sale: [...], Rent: [...] } of { slug, label, count } (areas and cities with listings)
 */
export const pageContent = ({ path, settings, metadata, property = null, place = null, listings = [], places = { Sale: [], Rent: [] } }) => {
  const parts = [];
  if (property) {
    const location = property.location || {};
    const facts = [
      property.bedrooms > 0 && `${property.bedrooms} bedroom${property.bedrooms === 1 ? "" : "s"}`,
      property.bathrooms > 0 && `${property.bathrooms} bathroom${property.bathrooms === 1 ? "" : "s"}`,
      property.area > 0 && `${property.area} m²`,
      property.availability,
    ].filter(Boolean);
    const areaPath = location.neighbourhood ? `${intentPath(property.listingType)}/${placeSlug(location.neighbourhood)}` : location.city ? `${intentPath(property.listingType)}/${placeSlug(location.city)}` : intentPath(property.listingType);
    parts.push(
      `<nav aria-label="Breadcrumb">${link("/", "Home")} › ${link(intentPath(property.listingType), intentName(property.listingType))} › ${link(areaPath, placeLabel(location))}</nav>`,
      `<h1>${escapeHtml(property.title)}</h1>`,
      `<p>${escapeHtml(`${propertyHeadline(property)} in ${placeLabel(location)}`)}: <strong>${escapeHtml(formatPrice(property.price, property.pricePeriod, property.currency))}</strong></p>`,
      facts.length ? `<ul>${facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join("")}</ul>` : "",
      property.description ? `<p>${escapeHtml(String(property.description).slice(0, 3000))}</p>` : "",
      `<p>${link(areaPath, `More homes ${intentWords(property.listingType).toLowerCase()} in ${placeLabel(location)}`)}</p>`,
    );
  } else if (place) {
    parts.push(
      `<nav aria-label="Breadcrumb">${link("/", "Home")} › ${link(intentPath(place.listingType), intentName(place.listingType))} › ${escapeHtml(place.label)}</nav>`,
      `<h1>${escapeHtml(`Houses & Apartments ${intentWords(place.listingType)} in ${place.label}`)}</h1>`,
      `<p>${escapeHtml(metadata.description)}</p>`,
      listings.length ? `<ul>${listings.map(listingItem).join("")}</ul>` : "",
      placeLinks((places[place.listingType] || []).filter((other) => other.slug !== place.slug).slice(0, 30), place.listingType),
    );
  } else if (["/sale", "/rent"].includes(path)) {
    const listingType = path === "/sale" ? "Sale" : "Rent";
    parts.push(
      `<h1>${escapeHtml(`Houses & Apartments ${intentWords(listingType)} in Ghana`)}</h1>`,
      `<p>${escapeHtml(metadata.description)}</p>`,
      listings.length ? `<ul>${listings.map(listingItem).join("")}</ul>` : "",
      placeLinks(places[listingType] || [], listingType),
    );
  } else if (path === "/" || path === `/${settings.slugs.listings}`) {
    parts.push(
      `<h1>${escapeHtml(path === "/" ? `${settings.general.siteName}: Houses & Apartments for Sale and Rent in Ghana` : "Houses, Apartments & Land for Sale and Rent in Ghana")}</h1>`,
      `<p>${escapeHtml(settings.general.description)}</p>`,
      `<p>${link("/sale", "Homes for sale")} · ${link("/rent", "Homes for rent")} · ${link(`/${settings.slugs.listings}`, "All listings")}</p>`,
      listings.length ? `<ul>${listings.map(listingItem).join("")}</ul>` : "",
      placeLinks((places.Rent || []).slice(0, 20), "Rent"),
      placeLinks((places.Sale || []).slice(0, 20), "Sale"),
    );
  }
  const html = parts.filter(Boolean).join("");
  return html ? `<main class="seo-shell">${html}</main>` : "";
};
