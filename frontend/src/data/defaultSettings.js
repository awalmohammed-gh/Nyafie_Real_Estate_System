// Mirrors the backend defaults (backend/models/Setting.js). Used only for the very first visit,
// until GET /api/settings returns the saved values from MongoDB (managed from /admin/settings).
export const defaultSettings = {
  general: {
    siteName: "HomeBase",
    tagline: "Real Estate in Ghana",
    description: "Discover verified homes for sale and rent across Ghana, with trusted local agents.",
  },
  branding: { logo: "", logoDark: "", favicon: "" },
  seo: { title: "", metaDescription: "", keywords: "", ogImage: "", baseUrl: "", allowIndexing: true },
  contact: { phone: "", email: "", whatsapp: "", address: "", city: "", region: "", country: "Ghana", mapUrl: "", hours: "" },
  social: { facebook: "", instagram: "", x: "", linkedin: "", youtube: "", tiktok: "" },
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
  notifications: { newUsers: true, propertyReviews: true, offers: true, rentals: true, sales: true, payments: true, messages: true },
};
