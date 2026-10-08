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
  payments: { rentalsEnabled: true, subscriptionsEnabled: true, rentalsAvailable: false },
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
  notifications: { newUsers: true, propertyReviews: true, customerReviews: true, offers: true, rentals: true, sales: true, payments: true, messages: true },
};
