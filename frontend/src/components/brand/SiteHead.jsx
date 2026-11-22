import { useEffect, useState } from "react";
import { usePlatform } from "../../context/usePlatform";
import router from "../../router/router";
import { usePageSeo } from "../../context/pageSeo";
import { publicSiteUrl } from "../../utils/siteUrl";

// Creates or updates a <meta>/<link> tag in <head>; an empty value removes it
const setTag = (tag, attr, key, valueAttr, value) => {
  let el = document.head.querySelector(`${tag}[${attr}="${key}"]`);
  if (!value) return el?.remove();
  if (!el) {
    el = document.createElement(tag);
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute(valueAttr, value);
};
const meta = (name, content) => setTag("meta", "name", name, "content", content);
const og = (property, content) => setTag("meta", "property", property, "content", content);

/**
 * Applies Admin Settings to the document head: title, description, keywords, robots,
 * Open Graph tags, favicon and the canonical URL. (index.html holds the pre-JavaScript fallback.)
 */
const SiteHead = () => {
  const { settings } = usePlatform();
  const { general, seo, branding } = settings;
  const [pathname, setPathname] = useState(router.state.location.pathname);
  const { metadata } = usePageSeo();

  useEffect(() => router.subscribe((state) => setPathname(state.location.pathname)), []);

  useEffect(() => {
    const current = metadata?.pathname === pathname ? metadata : null;
    // The same wording as the server's titles (backend/utils/seo.js pageMetadata)
    const labels = { [`/${settings.slugs.listings}`]: "Houses, Apartments & Land for Sale and Rent in Ghana", [`/${settings.slugs.properties}`]: "Explore Properties in Ghana", "/about": "About us", "/sale": "Houses & Apartments for Sale in Ghana", "/rent": "Houses & Apartments for Rent in Ghana", "/contact": "Contact our team" };
    const title = current?.title || (labels[pathname] ? `${labels[pathname]} | ${general.siteName}` : seo.title || (pathname === "/" ? `${general.siteName}: Houses & Apartments for Sale and Rent in Ghana` : [general.siteName, general.tagline].filter(Boolean).join(" | ")));
    const description = current?.description || seo.metaDescription || (pathname === "/" ? `Discover houses for sale, apartments for rent, and short-stay properties across Ghana. Explore listings and connect with property agents on ${general.siteName}.` : general.description);
    const image = new URL(current?.image || seo.ogImage || branding.logo || "/favicon.png", publicSiteUrl(settings)).href;
    const privatePage = /^\/(admin|account|agent|agents|checkout|make-offer|login|register|offer|payment)(\/|$)/.test(pathname) || pathname === `/${settings.slugs.agents}`;
    document.title = title;
    meta("description", description);
    meta("keywords", seo.keywords);
    meta("robots", !seo.allowIndexing || privatePage || current?.noindex ? "noindex, nofollow" : "index, follow");
    og("og:site_name", general.siteName);
    og("og:title", title);
    og("og:description", description);
    og("og:image", image);
    meta("twitter:card", image ? "summary_large_image" : "summary");
    meta("twitter:title", title);
    meta("twitter:description", description);
    meta("twitter:image", image);

    const icon = document.head.querySelector('link[rel="icon"]');
    if (icon) {
      icon.href = branding.favicon || "/favicon-nyafie.png?v=2";
      if (branding.favicon) {
        icon.removeAttribute("type");
        icon.removeAttribute("sizes");
      } else {
        icon.type = "image/png";
        icon.setAttribute("sizes", "64x64");
      }
    }
  }, [general, seo, branding, pathname, metadata, settings]);

  useEffect(() => {
    const url = new URL(pathname, publicSiteUrl(settings)).href;
    setTag("link", "rel", "canonical", "href", url);
    og("og:url", url);
  }, [settings, pathname]);

  return null;
};

export default SiteHead;
