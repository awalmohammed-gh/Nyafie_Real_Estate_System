import mongoose from "mongoose";
import { siteUrl } from "../config/runtime.js";
import { schemaOptions } from "../utils/schemaOptions.js";

// Every system setting and its default. Only keys listed here are ever read or saved.
// Secrets (Paystack, JWT, Cloudinary) stay in backend/.env and never appear here.
export const defaultSettings = {
  general: {
    siteName: "HomeBase",
    tagline: "Real Estate in Ghana",
    description: "Discover verified homes for sale and rent across Ghana, with trusted local agents.",
  },
  // Cloudinary URLs; empty means the built-in lettermark / default favicon
  branding: { logo: "", logoDark: "", favicon: "" },
  seo: { title: "", metaDescription: "", keywords: "", ogImage: "", baseUrl: "", allowIndexing: true },
  contact: {
    phone: "+233 24 152 9904",
    email: "info@homebase.com",
    whatsapp: "", // public WhatsApp number for admin-owned listings
    address: "123 Independence Avenue, Airport City",
    city: "Accra",
    region: "Greater Accra",
    country: "Ghana",
    mapUrl: "",
    hours: "Mon - Fri: 9:00 AM - 6:00 PM\nSat: 10:00 AM - 4:00 PM",
  },
  social: { facebook: "", instagram: "", x: "", linkedin: "", youtube: "", tiktok: "" },
  // First path segment of the public list pages, e.g. /properties
  slugs: { properties: "properties", listings: "listings", agents: "agents" },
  property: {
    maxImages: 15,
    requireApproval: true,
    allowAgentPublishing: true,
    propertyTypes: ["Apartment", "Bungalow", "Duplex", "Family-Home", "Hotel-Apartment", "Luxury-Villa", "Manor", "Modern-Home", "Penthouse", "Single", "Studio", "Townhouse", "Villa"],
    rentPeriods: ["month", "night"],
  },
  agent: { requireSubscription: true, defaultPlan: "" },
  payments: { rentalsEnabled: true, subscriptionsEnabled: true },
  // Homepage hero slides, shown in this order. Built-in images live in frontend/public/hero;
  // uploaded ones are Cloudinary URLs. Titles may wrap one phrase in *asterisks* for the serif accent.
  hero: {
    slides: [
      {
        id: "modern-living", active: true, image: "/hero/modern-living.jpg", position: "center",
        label: "Modern living", title: "Light-filled homes made for *everyday* living.",
        description: "Open-plan apartments and modern homes with room to breathe, in neighbourhoods close to everything you need.",
        primaryText: "View apartments", primaryLink: "/properties?type=Apartment", secondaryText: "Browse all homes", secondaryLink: "/listings",
      },
      {
        id: "furnished-bedroom", active: true, image: "/hero/furnished-bedroom.jpg", position: "center",
        label: "Ready to move in", title: "Furnished rentals, ready *when you are.*",
        description: "Settle in from day one with fully furnished homes on monthly terms. Just bring your suitcase.",
        primaryText: "Browse rentals", primaryLink: "/rent", secondaryText: "", secondaryLink: "",
      },
      {
        id: "heritage-villa", active: true, image: "/hero/heritage-villa.jpg", position: "center",
        label: "Homes with character", title: "Heritage homes with a *story* to tell.",
        description: "Grand verandas, shuttered windows and gardens to gather in. Find a house worth staying in for generations.",
        primaryText: "View homes for sale", primaryLink: "/sale", secondaryText: "Talk to our team", secondaryLink: "/contact",
      },
      {
        id: "resort-pool", active: true, image: "/hero/resort-pool.jpg", position: "center",
        label: "Short stays", title: "Resort-style living, *by the night.*",
        description: "Serviced hotel apartments with pools, palms and everything taken care of, for holidays, work trips or a little time away.",
        primaryText: "Explore short stays", primaryLink: "/properties?type=Hotel-Apartment", secondaryText: "", secondaryLink: "",
      },
    ],
  },
  // In-app notifications for the admin team (the bell in the admin console)
  notifications: { newUsers: true, propertyReviews: true, customerReviews: true, offers: true, rentals: true, sales: true, payments: true, messages: true },
};

// A single settings document managed from the admin console
const section = (name) => ({ type: mongoose.Schema.Types.Mixed, default: () => defaultSettings[name] });
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, default: "platform", unique: true },
    ...Object.fromEntries(Object.keys(defaultSettings).map((name) => [name, section(name)])),
    platform: mongoose.Schema.Types.Mixed, // legacy section (before general/contact existed), read once for migration
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  schemaOptions
);

const Setting = mongoose.models.Setting || mongoose.model("Setting", settingSchema);

// Values saved before the settings were split into sections
const legacyValues = (doc) => {
  const p = doc.platform;
  if (!p) return {};
  return {
    general: doc.general ? {} : { siteName: p.name },
    contact: doc.contact?.phone !== undefined ? {} : { phone: p.phone, email: p.email, address: p.location },
  };
};

// Latest site name, kept in memory for server messages ("... contact HomeBase support")
let cachedSiteName = defaultSettings.general.siteName;
export const siteName = () => cachedSiteName;

// Settings merged with defaults (creates the document on first use). Unknown keys are dropped.
export const getSettings = async () => {
  // Atomic upsert, so parallel first requests on a fresh database never create duplicates
  const doc = await Setting.findOneAndUpdate({ key: "platform" }, { $setOnInsert: { key: "platform" } }, { upsert: true, returnDocument: "after" }).lean();
  const legacy = legacyValues(doc);
  const merged = {};
  for (const [name, defaults] of Object.entries(defaultSettings)) {
    const saved = { ...(legacy[name] || {}), ...(doc[name] || {}) };
    merged[name] = Object.fromEntries(Object.keys(defaults).map((k) => [k, saved[k] ?? defaults[k]]));
  }
  // The WhatsApp number used to come from ADMIN_WHATSAPP_NUMBER; it stays the fallback until one is saved
  if (!merged.contact.whatsapp) merged.contact.whatsapp = process.env.ADMIN_WHATSAPP_NUMBER || "";
  cachedSiteName = merged.general.siteName;
  if (process.env.PUBLIC_SITE_URL) merged.seo.baseUrl = siteUrl();
  if (process.env.VERCEL_ENV === "preview") merged.seo.allowIndexing = false;
  return merged;
};

export default Setting;
