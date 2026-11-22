// An amount in Ghana cedis, e.g. ₵12,500
export const formatGhs = (value) => `₵${Number(value).toLocaleString()}`;

export const getPrice = (property) =>
  property.pricing.amount || property.pricing.perMonth || property.pricing.perNight || 0;

export const getPriceParts = (property) => {
  const { amount, perMonth, perNight, currency = "GHS" } = property.pricing;
  const prefix = currency === "GHS" ? "₵" : `${currency} `;
  if (property.property?.type?.toLowerCase() === "hotel") {
    const prices = (property.roomTypes || []).filter((room) => room.active).map((room) => room.pricePerNight);
    return prices.length ? { value: `From ${prefix}${Math.min(...prices).toLocaleString()}`, period: "/room /night" } : { value: "Rooms coming soon", period: "" };
  }
  if (amount != null) return { value: `${prefix}${amount.toLocaleString()}`, period: "" };
  if (perNight != null) return { value: `${prefix}${perNight.toLocaleString()}`, period: "/night" };
  return { value: `${prefix}${(perMonth || 0).toLocaleString()}`, period: "/month" };
};

export const formatPrice = (property) => {
  const { value, period } = getPriceParts(property);
  return value + period;
};

export const formatType = (type) => type.replace(/-/g, " ");

// Visibility follows the complete directory, not the bounded public-listing cache.
export const isListingPublic = (property, agents) => property.listing?.state === "published" && (property.owner?.type === "admin" || agents.some((agent) => agent.id === property.owner?.id));

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
    // NyaFie (admin) listings are shown as the platform, not as an agent
    if (!property.agent || property.owner?.type !== "agent" || ["Sold", "Rented"].includes(property.listing?.availability)) return;
    if (!map.has(property.agent.id)) map.set(property.agent.id, { ...property.agent, properties: [] });
    map.get(property.agent.id).properties.push(property);
  });

  return [...map.values()].map((agent) => {
    const ratings = agent.properties.map((p) => p.meta?.rating).filter(Boolean);
    return {
      ...agent,
      propertyCount: agent.properties.length,
      rating: ratings.length ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : null,
      saleCount: agent.properties.filter((p) => p.property.status === "Sale").length,
      rentCount: agent.properties.filter((p) => p.property.status === "Rent").length,
      views: agent.properties.reduce((sum, p) => sum + (p.meta?.views || 0), 0),
      locations: [...new Set(agent.properties.map((p) => p.location.name))],
    };
  });
};

/**
 * The public agents list: every available agent from the directory API (so an agent with no
 * published listing yet still appears), with stats from their public listings where they have any.
 * Without the directory (request failed), falls back to agents found on listings.
 */
export const mergeAgents = (directory, properties) => {
  const withListings = new Map(buildAgents(properties).map((a) => [String(a.id), a]));
  if (!directory) return [...withListings.values()];
  const empty = { propertyCount: 0, rating: null, saleCount: 0, rentCount: 0, views: 0, locations: [], properties: [] };
  return directory.map((d) => ({ ...empty, ...withListings.get(d.id), ...d }));
};

// "East Legon, Accra", but just "Kumasi" when the neighbourhood is the city
export const formatLocation = ({ name, city }) => [...new Set([name, city].filter(Boolean))].join(", ");

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
