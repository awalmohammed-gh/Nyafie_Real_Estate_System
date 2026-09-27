import mongoose from "mongoose";
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
  // In-app notifications for the admin team (the bell in the admin console)
  notifications: { newUsers: true, propertyReviews: true, offers: true, rentals: true, sales: true, payments: true, messages: true },
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
  return merged;
};

export default Setting;
