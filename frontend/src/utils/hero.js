// Helpers for the homepage hero slides managed in Admin Settings > Homepage Hero
import { CLOUDINARY_UPLOAD, cloudImageSources } from "./cloudImage.js";

const BUILT_IN = /^(\/hero\/[a-z0-9-]+)\.jpg$/;

/**
 * Responsive sources for a full-width hero image. Uploaded images are resized and converted
 * (WebP/AVIF) by Cloudinary; the built-in images ship with a 960px copy for phones.
 */
export const heroImageSources = (url = "") => {
  if (CLOUDINARY_UPLOAD.test(url)) {
    const { src, srcSet } = cloudImageSources(url, undefined, [960, 1440, 1920, 2560], 1920);
    return { src, srcSet };
  }
  const builtIn = BUILT_IN.exec(url);
  if (builtIn) return { src: url, srcSet: `${builtIn[1]}-960.jpg 960w, ${url} 1920w` };
  return { src: url };
};

// Hero links are written with the default page URLs; follow any slugs renamed in Settings > SEO & URLs
const SLUG_KEYS = ["properties", "listings", "agents"];

export const resolveHeroLink = (link = "", paths) => {
  if (/^https?:\/\//.test(link)) return { href: link, external: true };
  const [, first = "", rest = ""] = /^\/([^/?#]*)(.*)$/.exec(link) || [];
  return { href: SLUG_KEYS.includes(first) ? `${paths[first]}${rest}` : link, external: false };
};

// "Homes with a *story* to tell." -> [{ text, accent }] so the starred phrase gets the serif accent
export const splitAccent = (title = "") =>
  title.split(/(\*[^*]+\*)/).filter(Boolean).map((part) => (/^\*[^*]+\*$/.test(part) ? { text: part.slice(1, -1), accent: true } : { text: part, accent: false }));
