// Plan display helpers. Plan limits live in the database (managed from /admin/plans)
// and are enforced by the backend; the frontend only reads them.

export const ANALYTICS_LEVELS = {
  basic: { label: "Basic", description: "Property views" },
  standard: { label: "Standard", description: "Views, inquiry statistics & property performance" },
  advanced: { label: "Advanced", description: "Everything in Standard plus listing performance trends" },
};

export const INQUIRY_LEVELS = {
  basic: { label: "Basic", description: "View and reply to inquiries" },
  full: { label: "Full", description: "Track inquiry status, search and filter" },
};

export const durationLabel = (days) => {
  if (days % 365 === 0) return days === 365 ? "12 months" : `${days / 365} years`;
  if (days % 30 === 0) return days === 30 ? "1 month" : `${days / 30} months`;
  return `${days} days`;
};

export const formatLimit = (limit) => (limit == null ? "Unlimited" : limit);

// Feature bullets are derived from the limits so the marketing copy can never
// disagree with what the permission system actually allows.
export const planFeatureList = (plan) => [
  `Up to ${plan.propertyLimit} active listings`,
  `Up to ${plan.imageLimit} photos per property`,
  plan.featuredLimit > 0 ? `${plan.featuredLimit} featured listings` : "No featured listings",
  `${ANALYTICS_LEVELS[plan.analytics]?.label} analytics: ${ANALYTICS_LEVELS[plan.analytics]?.description.toLowerCase()}`,
  plan.inquiryManagement === "full" ? "Full inquiry management" : "Basic inquiries",
  ...(plan.priorityVisibility ? ["Priority visibility in search"] : []),
  ...(plan.extraFeatures || []),
];
