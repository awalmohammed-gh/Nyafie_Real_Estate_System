import { siteUrl } from "../config/runtime.js";

export const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const absoluteUrl = (path) => new URL(path, siteUrl()).href;
export const privatePath = (path, settings) => /^\/(admin|account|agent|agents|checkout|make-offer|login|register|offer|payment)(\/|$)/.test(path) || path === `/${settings.slugs.agents}`;

export const pageMetadata = (path, settings, property) => {
  const name = settings.general.siteName;
  const metadata = {
    pathname: path,
    title: settings.seo.title || `${name} | ${settings.general.tagline}`,
    description: settings.seo.metaDescription || settings.general.description,
    image: settings.seo.ogImage || settings.branding.logo || "/favicon.png",
    canonical: absoluteUrl(path),
    noindex: !settings.seo.allowIndexing || process.env.VERCEL_ENV === "preview" || privatePath(path, settings),
  };
  const titles = { [`/${settings.slugs.listings}`]: "All property listings", [`/${settings.slugs.properties}`]: "Explore properties", '/sale': 'Properties for sale', '/rent': 'Properties to rent', '/contact': 'Contact our team' };
  if (titles[path]) metadata.title = `${titles[path]} | ${name}`;
  if (path.startsWith('/house/')) {
    if (property) {
      metadata.title = `${property.title} | ${name}`;
      metadata.description = property.description?.replace(/\s+/g, ' ').slice(0, 160) || `${property.title} in ${property.location?.city || 'Ghana'}. View photos, pricing and details on ${name}.`;
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

export const injectMetadata = (template, metadata) => {
  const clean = template.replace(/<title>[\s\S]*?<\/title>/gi, '').replace(/<meta\s+[^>]*(?:name=["'](?:description|robots|twitter:[^"']+)["']|property=["']og:[^"']+["'])[^>]*>/gi, '').replace(/<link\s+[^>]*rel=["']canonical["'][^>]*>/gi, '');
  const tag = (name, content, property = false) => `<meta ${property ? 'property' : 'name'}="${name}" content="${escapeHtml(content)}" />`;
  const head = [
    `<title>${escapeHtml(metadata.title)}</title>`,
    tag('description', metadata.description), tag('robots', metadata.noindex ? 'noindex, nofollow' : 'index, follow'),
    `<link rel="canonical" href="${escapeHtml(metadata.canonical)}" />`,
    tag('og:title', metadata.title, true), tag('og:description', metadata.description, true), tag('og:image', metadata.image, true), tag('og:url', metadata.canonical, true), tag('og:type', 'website', true),
    tag('twitter:card', 'summary_large_image'), tag('twitter:title', metadata.title), tag('twitter:description', metadata.description), tag('twitter:image', metadata.image),
    `<script id="page-metadata" type="application/json">${JSON.stringify(metadata).replace(/</g, '\\u003c')}</script>`,
  ].join('\n');
  return clean.replace(/<\/head>/i, `${head}\n</head>`);
};
