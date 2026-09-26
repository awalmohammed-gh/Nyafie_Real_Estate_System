export const getPrice = (property) =>
  property.pricing.amount || property.pricing.perMonth || property.pricing.perNight || 0;

export const getPriceParts = (property) => {
  const { amount, perMonth, perNight } = property.pricing;
  if (amount) return { value: `₵${amount.toLocaleString()}`, period: "" };
  if (perNight) return { value: `₵${perNight.toLocaleString()}`, period: "/night" };
  return { value: `₵${(perMonth || 0).toLocaleString()}`, period: "/month" };
};

export const formatPrice = (property) => {
  const { value, period } = getPriceParts(property);
  return value + period;
};

export const formatType = (type) => type.replace(/-/g, " ");

export const statusLabel = (status) => (status === "Sale" ? "For Sale" : "For Rent");

export const getInitials = (name) =>
  name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

// Groups properties by agent and derives stats for each one
export const buildAgents = (properties) => {
  const map = new Map();
  properties.forEach((property) => {
    // HomeBase (admin) listings are shown as the platform, not as an agent
    if (!property.agent || property.agent.id === "homebase") return;
    if (!map.has(property.agent.id)) map.set(property.agent.id, { ...property.agent, properties: [] });
    map.get(property.agent.id).properties.push(property);
  });

  return [...map.values()].map((agent) => {
    const ratings = agent.properties.map((p) => p.meta?.rating).filter(Boolean);
    return {
      ...agent,
      rating: ratings.length ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : null,
      saleCount: agent.properties.filter((p) => p.property.status === "Sale").length,
      rentCount: agent.properties.filter((p) => p.property.status === "Rent").length,
      views: agent.properties.reduce((sum, p) => sum + (p.meta?.views || 0), 0),
      locations: [...new Set(agent.properties.map((p) => p.location.name))],
    };
  });
};

// "East Legon, Accra", but just "Kumasi" when the neighbourhood is the city
export const formatLocation = ({ name, city }) => (name === city ? name : `${name}, ${city}`);

export const LISTING_STATE_LABELS = {
  draft: "Draft",
  pending: "Pending Review",
  published: "Published",
  rejected: "Rejected",
  suspended: "Suspended",
};

// Status shown for a listing. Published listings show availability once it
// changes (Under Offer / Sold / Rented), or "Hidden" when the owner's plan lapsed.
export const getListingStatus = (property, visible = true) => {
  const { state, availability } = property.listing || {};
  if (state !== "published") return LISTING_STATE_LABELS[state] || "Draft";
  if (!visible) return "Hidden";
  if (["Under Offer", "Sold", "Rented"].includes(availability)) return availability;
  return "Published";
};

export const getApprovalStatus = (property) =>
  ({ draft: "Not submitted", pending: "Pending", rejected: "Rejected" })[property.listing?.state] || "Approved";
