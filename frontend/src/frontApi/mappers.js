// Translate between the backend models and the shapes the UI components use,
// so components don't need to know how the API stores data.

const idOf = (value) => (value && typeof value === "object" ? value.id || value._id : value) || null;

// ---------- Plans ----------
export const mapPlan = (p) => ({
  id: p.id,
  name: p.name,
  tagline: p.tagline || "",
  price: p.price,
  durationDays: p.duration,
  propertyLimit: p.propertyLimit,
  imageLimit: p.imageLimit,
  featuredLimit: p.featuredPropertyLimit ?? 0,
  analytics: p.analyticsLevel,
  inquiryManagement: p.inquiryManagement,
  priorityVisibility: Boolean(p.priorityVisibility),
  extraFeatures: p.features || [],
  active: p.isActive,
  popular: Boolean(p.popular),
});

export const toApiPlan = (p) => ({
  name: p.name,
  tagline: p.tagline,
  price: p.price,
  duration: p.durationDays,
  propertyLimit: p.propertyLimit,
  imageLimit: p.imageLimit,
  featuredPropertyLimit: p.featuredLimit,
  analyticsLevel: p.analytics,
  inquiryManagement: p.inquiryManagement,
  priorityVisibility: p.priorityVisibility,
  features: p.extraFeatures,
  isActive: p.active,
  popular: p.popular,
});

// ---------- Subscriptions ----------
export const mapSubscription = (s) =>
  s && typeof s === "object"
    ? {
        id: s.id,
        userId: idOf(s.user),
        planId: idOf(s.plan),
        planName: s.planName,
        price: s.amount,
        startDate: s.startDate || s.createdAt,
        expiryDate: s.expiresAt || s.createdAt,
        status: s.status,
        paymentStatus: s.paymentStatus,
        paymentMethod: s.paymentMethod,
        reference: s.paymentReference,
        paidAt: s.paidAt,
        cancelledAt: s.cancelledAt,
        createdAt: s.createdAt,
      }
    : null;

// Subscription records double as the payment ledger for admin reports
export const mapPayment = (s) => ({
  id: s.id,
  userId: idOf(s.user),
  planId: idOf(s.plan),
  amount: s.amount,
  method: s.paymentMethod,
  status: s.paymentStatus,
  createdAt: s.paidAt || s.createdAt,
  reference: s.paymentReference,
});

// ---------- Users ----------
export const mapUser = (u) =>
  u && {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    name: `${u.firstName} ${u.lastName}`,
    email: u.email,
    phone: u.phone || "",
    role: u.role,
    status: u.isActive === false ? "suspended" : "active",
    createdAt: u.createdAt,
    preferences: u.preferences || {},
    savedProperties: (u.savedProperties || []).map(String),
    subscription: mapSubscription(u.subscription),
    savedCount: u.savedCount ?? (u.savedProperties || []).length,
    inquiriesCount: u.inquiriesCount ?? 0,
  };

// ---------- Properties ----------
export const mapProperty = (p) => ({
  id: p.id,
  title: p.title,
  description: p.description || "",
  pricing:
    p.listingType === "Sale" || p.pricePeriod === "total"
      ? { amount: p.price, currency: p.currency }
      : p.pricePeriod === "night"
        ? { perNight: p.price, currency: p.currency }
        : { perMonth: p.price, currency: p.currency },
  location: {
    name: p.location?.neighbourhood || "",
    city: p.location?.city || "",
    region: p.location?.region || "",
    address: p.location?.address || "",
  },
  property: {
    type: p.propertyType,
    status: p.listingType,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    size: { value: p.area, unit: p.areaUnit || "sqm" },
  },
  features: p.amenities || [],
  media: { images: p.images || [] },
  agent: {
    id: p.contact?.id || idOf(p.owner),
    name: p.contact?.name || "HomeBase",
    phone: p.contact?.phone || "",
    email: p.contact?.email || "",
  },
  meta: { isFeatured: Boolean(p.isFeatured), rating: p.rating ?? null, views: p.views || 0 },
  owner: { type: p.ownerType, id: p.ownerType === "admin" ? "admin" : idOf(p.owner) },
  ownerUserId: idOf(p.owner),
  listing: {
    state: p.status,
    availability: p.availability,
    rejectionReason: p.rejectionReason || "",
    reviewedAt: p.reviewedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  },
});

// Accepts a full or partial property in UI shape and returns API fields
export const toApiProperty = (p) => {
  const out = {};
  if (p.title !== undefined) out.title = p.title;
  if (p.description !== undefined) out.description = p.description;
  if (p.pricing) {
    out.price = p.pricing.amount ?? p.pricing.perMonth ?? p.pricing.perNight ?? 0;
    out.pricePeriod = p.pricing.amount != null ? "total" : p.pricing.perNight != null ? "night" : "month";
  }
  if (p.property) {
    if (p.property.type !== undefined) out.propertyType = p.property.type;
    if (p.property.status !== undefined) out.listingType = p.property.status;
    if (p.property.bedrooms !== undefined) out.bedrooms = p.property.bedrooms;
    if (p.property.bathrooms !== undefined) out.bathrooms = p.property.bathrooms;
    if (p.property.size) out.area = p.property.size.value;
  }
  if (p.location) {
    out.location = { address: p.location.address, neighbourhood: p.location.name, city: p.location.city, region: p.location.region };
  }
  if (p.features) out.amenities = p.features;
  if (p.media) out.images = p.media.images;
  if (p.agent) out.contact = { name: p.agent.name, phone: p.agent.phone, email: p.agent.email };
  if (p.listing?.state !== undefined) out.status = p.listing.state;
  if (p.listing?.availability !== undefined) out.availability = p.listing.availability;
  if (p.meta?.isFeatured !== undefined) out.isFeatured = p.meta.isFeatured;
  return out;
};

// ---------- Inquiries ----------
const STATUS_TO_UI = { new: "New", contacted: "Contacted", inProgress: "In Progress", closed: "Closed" };
const STATUS_TO_API = Object.fromEntries(Object.entries(STATUS_TO_UI).map(([api, ui]) => [ui, api]));

export const inquiryStatusToApi = (status) => STATUS_TO_API[status] || status;

export const mapInquiry = (i) => ({
  id: i.id,
  propertyId: idOf(i.property),
  ownerType: i.ownerType,
  ownerId: i.ownerType === "admin" ? "admin" : idOf(i.agent),
  userId: idOf(i.customer),
  name: i.name,
  email: i.email,
  phone: i.phone || "",
  message: i.message,
  status: STATUS_TO_UI[i.status] || i.status,
  createdAt: i.createdAt,
});

// ---------- Chat ----------
export const mapConversation = (c) => {
  const p = c.property && typeof c.property === "object" ? c.property : null;
  return {
    id: c.id,
    side: c.side, // "customer" | "owner": which side the signed-in account is on
    unread: c.unread || 0,
    status: c.status,
    lastMessage: c.lastMessage,
    lastMessageAt: c.lastMessageAt,
    ownerType: c.ownerType,
    customer: c.customer,
    owner: c.owner,
    property: p
      ? {
          id: p.id,
          title: p.title,
          image: p.images?.[0] || "",
          location: [p.location?.neighbourhood, p.location?.city].filter(Boolean).join(", "),
          availability: p.availability,
          status: p.status,
        }
      : { id: idOf(c.property), title: "Removed property", image: "" },
  };
};

export const mapMessage = (m) => ({
  id: m.id,
  senderId: idOf(m.sender),
  message: m.message,
  read: m.read,
  createdAt: m.createdAt,
});
