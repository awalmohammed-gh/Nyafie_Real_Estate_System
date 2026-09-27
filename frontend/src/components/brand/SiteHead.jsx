import { useEffect, useState } from "react";
import { usePlatform } from "../../context/usePlatform";
import router from "../../router/router";

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

  useEffect(() => router.subscribe((state) => setPathname(state.location.pathname)), []);

  useEffect(() => {
    const title = seo.title || [general.siteName, general.tagline].filter(Boolean).join(" | ");
    const description = seo.metaDescription || general.description;
    const image = seo.ogImage || branding.logo;
    document.title = title;
    meta("description", description);
    meta("keywords", seo.keywords);
    meta("robots", seo.allowIndexing ? "" : "noindex, nofollow");
    og("og:site_name", general.siteName);
    og("og:title", title);
    og("og:description", description);
    og("og:image", image);
    meta("twitter:card", image ? "summary_large_image" : "summary");

    const icon = document.head.querySelector('link[rel="icon"]');
    if (icon) {
      icon.href = branding.favicon || "/favicon.svg";
      if (branding.favicon) icon.removeAttribute("type");
      else icon.type = "image/svg+xml";
    }
  }, [general, seo, branding]);

  useEffect(() => {
    const url = seo.baseUrl ? `${seo.baseUrl}${pathname}` : "";
    setTag("link", "rel", "canonical", "href", url);
    og("og:url", url);
  }, [seo.baseUrl, pathname]);

  return null;
};

export default SiteHead;
