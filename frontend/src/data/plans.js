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
  plan.inquiryManagement === "full" ? "Full inquiry management" : "Customer inquiries",
  plan.internalChat ? "HomeBase customer chat" : "Inquiries, calls, email & WhatsApp (no HomeBase chat)",
  ...(isOrganization(plan.accountType) && plan.teamMemberLimit > 0 ? [`Up to ${plan.teamMemberLimit} team members, with listing and lead assignment`] : []),
  ...(plan.priorityVisibility ? ["Priority visibility in search"] : []),
  ...(plan.extraFeatures || []),
];

// The two kinds of agent account. Plans are made for one of them.
export const ACCOUNT_TYPES = {
  individual: {
    label: "Individual Agent",
    plural: "Individual plans",
    description: "For independent property agents, property owners and solo real estate professionals.",
  },
  agency: {
    label: "Agency",
    plural: "Agency plans",
    description: "For real estate agencies that manage multiple properties, agents and customer inquiries.",
  },
  company: {
    label: "Company",
    plural: "Company plans",
    description: "For property developers, property management firms, hotel and property operators, and other registered businesses with larger teams and portfolios.",
  },
};

// Agencies and companies are organisations: an owner, a team, shared listings and one subscription
export const isOrganization = (type) => type === "agency" || type === "company";
export const accountTypeOf = (value) => (ACCOUNT_TYPES[value] ? value : "individual");

export const plansFor = (plans, accountType) => plans.filter((plan) => plan.accountType === accountType);
