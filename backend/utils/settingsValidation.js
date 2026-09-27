import mongoose from "mongoose";
import Plan from "../models/Plan.js";
import { defaultSettings } from "../models/Setting.js";
import { cloudinary } from "../config/cloudinary.js";
import { HttpError } from "./response.js";

// First path segments already used by the app; a public slug can never take one of these
export const RESERVED_SLUGS = [
  "admin", "agent", "account", "api", "assets", "checkout", "contact", "house", "login", "logout", "make-offer",
  "offer", "payment", "register", "rent", "sale", "favicon.svg", "icons.svg",
];

const fail = (message) => {
  throw new HttpError(400, message);
};

const text = (value, label, max, { required = false } = {}) => {
  const v = String(value ?? "").trim();
  if (required && !v) fail(`${label} is required.`);
  if (v.length > max) fail(`${label} must be ${max} characters or fewer.`);
  return v;
};

const bool = (value) => value === true;

const url = (value, label) => {
  const v = String(value ?? "").trim();
  if (!v) return "";
  try {
    const parsed = new URL(v);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
  } catch {
    fail(`${label} must be a full web address starting with https://`);
  }
  return v;
};

const IMAGE_TYPES = ["png", "jpeg", "webp", "svg+xml", "x-icon", "vnd.microsoft.icon"];

/**
 * A branding image: keeps an existing URL, clears it with "", or uploads a new data URI
 * (sent by the settings page) to Cloudinary and returns the stored URL.
 */
const image = async (value, label, maxKB, current) => {
  const v = String(value ?? "").trim();
  if (!v || v === current) return v;
  const match = /^data:image\/([a-z+.-]+);base64,/.exec(v);
  if (!match) {
    if (/^https:\/\//.test(v)) return v;
    fail(`${label} must be an uploaded image.`);
  }
  if (!IMAGE_TYPES.includes(match[1])) fail(`${label} must be a PNG, JPG, WebP, SVG or ICO file.`);
  if ((v.length - match[0].length) * 0.75 > maxKB * 1024) fail(`${label} must be smaller than ${maxKB >= 1024 ? `${maxKB / 1024}MB` : `${maxKB}KB`}.`);
  const result = await cloudinary.uploader.upload(v, { folder: "homebase/branding", resource_type: "image" });
  return result.secure_url;
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Property types are stored the way listings already use them: words joined by "-" (Family-Home)
const toTypeValue = (value) => String(value ?? "").trim().replace(/\s+/g, "-");

const validators = {
  general: async (b) => ({
    siteName: text(b.siteName, "Website name", 40, { required: true }),
    tagline: text(b.tagline, "Tagline", 80),
    description: text(b.description, "Website description", 300),
  }),

  branding: async (b, current) => ({
    logo: await image(b.logo, "Logo", 2048, current.logo),
    logoDark: await image(b.logoDark, "Logo for dark backgrounds", 2048, current.logoDark),
    favicon: await image(b.favicon, "Favicon", 512, current.favicon),
  }),

  seo: async (b, current) => ({
    title: text(b.title, "Site title", 70),
    metaDescription: text(b.metaDescription, "Meta description", 300),
    keywords: text(b.keywords, "Keywords", 300),
    ogImage: await image(b.ogImage, "Social sharing image", 3072, current.ogImage),
    baseUrl: url(b.baseUrl, "Website address").replace(/\/+$/, ""),
    allowIndexing: bool(b.allowIndexing),
  }),

  contact: async (b) => {
    const email = text(b.email, "Email", 120).toLowerCase();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) fail("Enter a valid email address.");
    const whatsapp = text(b.whatsapp, "WhatsApp number", 20);
    if (whatsapp && !/^\+?[\d\s-]{7,20}$/.test(whatsapp)) fail("Enter the WhatsApp number with country code, e.g. +233 24 000 0000.");
    return {
      phone: text(b.phone, "Phone", 30),
      email,
      whatsapp,
      address: text(b.address, "Office address", 150),
      city: text(b.city, "City", 60),
      region: text(b.region, "Region", 60),
      country: text(b.country, "Country", 60),
      mapUrl: url(b.mapUrl, "Map link"),
      hours: text(b.hours, "Business hours", 200),
    };
  },

  social: async (b) =>
    Object.fromEntries(Object.keys(defaultSettings.social).map((k) => [k, url(b[k], `${k === "x" ? "X" : k[0].toUpperCase() + k.slice(1)} link`)])),

  slugs: async (b) => {
    const out = {};
    for (const key of Object.keys(defaultSettings.slugs)) {
      const v = String(b[key] ?? "").trim().toLowerCase();
      if (!SLUG.test(v) || v.length < 2 || v.length > 40) fail(`The ${key} URL must be 2-40 lowercase letters, numbers or single hyphens (e.g. "${defaultSettings.slugs[key]}").`);
      if (RESERVED_SLUGS.includes(v)) fail(`"${v}" is already used by another page. Choose a different ${key} URL.`);
      out[key] = v;
    }
    if (new Set(Object.values(out)).size !== Object.keys(out).length) fail("Each page needs its own URL.");
    return out;
  },

  property: async (b) => {
    const maxImages = Math.round(Number(b.maxImages));
    if (!Number.isFinite(maxImages) || maxImages < 1 || maxImages > 50) fail("Maximum images must be between 1 and 50.");
    const types = [];
    for (const raw of Array.isArray(b.propertyTypes) ? b.propertyTypes : []) {
      const t = toTypeValue(raw);
      if (t.length < 2 || t.length > 40) fail("Each property type must be 2-40 characters.");
      if (!types.some((x) => x.toLowerCase() === t.toLowerCase())) types.push(t);
    }
    if (!types.length) fail("Keep at least one property type.");
    if (types.length > 40) fail("Up to 40 property types.");
    const rentPeriods = ["month", "night"].filter((p) => Array.isArray(b.rentPeriods) && b.rentPeriods.includes(p));
    if (!rentPeriods.length) fail("Allow at least one rental period.");
    return { maxImages, requireApproval: bool(b.requireApproval), allowAgentPublishing: bool(b.allowAgentPublishing), propertyTypes: types, rentPeriods };
  },

  agent: async (b) => {
    const defaultPlan = String(b.defaultPlan ?? "");
    if (defaultPlan && !(mongoose.isValidObjectId(defaultPlan) && (await Plan.exists({ _id: defaultPlan })))) fail("Choose an existing plan.");
    return { requireSubscription: bool(b.requireSubscription), defaultPlan };
  },

  payments: async (b) => ({ rentalsEnabled: bool(b.rentalsEnabled), subscriptionsEnabled: bool(b.subscriptionsEnabled) }),

  notifications: async (b) => Object.fromEntries(Object.keys(defaultSettings.notifications).map((k) => [k, bool(b[k])])),
};

// Returns the cleaned section, or throws a 400 HttpError with a message for the admin
export const validateSection = (section, body, current) => {
  if (!validators[section]) throw new HttpError(404, "Unknown settings section.");
  return validators[section](body || {}, current[section]);
};
