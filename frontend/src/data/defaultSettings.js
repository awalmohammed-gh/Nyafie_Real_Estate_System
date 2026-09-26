// Default platform settings managed from /admin/settings (frontend-only for now)
export const defaultSettings = {
  platform: {
    name: "HomeBase",
    email: "info@homebase.com",
    phone: "+233 24 152 9904",
    currency: "GHS",
    location: "Airport City, Accra, Ghana",
  },
  property: {
    maxImages: 15, // platform-wide cap; each plan's image limit applies within it
    requireApproval: true, // agent submissions go to "Pending Review"
    allowAgentPublishing: true,
  },
  agent: {
    requireSubscription: true,
    defaultPlan: "starter",
    manualAgentVerification: false,
  },
  // Public contact for HomeBase listings (the backend sends ADMIN_WHATSAPP_NUMBER here)
  contact: {
    whatsapp: "+233 24 152 9904",
  },
  notifications: {
    email: true,
    inquiries: true,
    subscriptions: true,
    weeklyDigest: false,
  },
};
