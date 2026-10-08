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
    profileImage: u.profileImage || "",
    role: u.role,
    status: u.isActive === false ? "suspended" : "active",
    createdAt: u.createdAt,
    preferences: u.preferences || {},
    agentApplication: u.agentApplication || null,
    // Agents only: next onboarding step and statuses, computed by the server
    onboarding: u.onboarding || null,
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
    country: p.location?.country || "Ghana",
    digitalAddress: p.location?.digitalAddress || "",
    latitude: p.location?.latitude ?? null,
    longitude: p.location?.longitude ?? null,
  },
  property: {
    type: p.propertyType,
    status: p.listingType,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    size: { value: p.area, unit: p.areaUnit || "sqm" },
  },
  features: p.amenities || [],
  roomTypes: p.roomTypes || [],
  media: { images: p.images || [] },
  agent: {
    id: p.agent?.id || idOf(p.owner),
    name: p.agent?.name || p.contact?.name || "Agent",
    phone: p.agent?.phone ?? p.contact?.phone ?? "",
    email: p.agent?.email ?? p.contact?.email ?? "",
    whatsapp: p.agent?.whatsapp || p.agent?.phone || p.contact?.phone || "",
    profileImage: p.agent?.profileImage || "",
    companyName: p.agent?.companyName || "",
    joinedAt: p.agent?.joinedAt,
    verified: p.agent?.verified === true,
  },
  // rating: average of published customer reviews (null until the first one)
  meta: { isFeatured: Boolean(p.isFeatured), rating: p.ratingCount ? p.ratingAverage : null, ratingCount: p.ratingCount || 0, views: p.views || 0 },
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
    if (p.pricing.currency !== undefined) out.currency = p.pricing.currency;
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
    out.location = { address: p.location.address, neighbourhood: p.location.name, city: p.location.city, region: p.location.region, country: p.location.country, digitalAddress: p.location.digitalAddress, latitude: p.location.latitude, longitude: p.location.longitude };
  }
  if (p.features) out.amenities = p.features;
  if (p.roomTypes !== undefined) out.roomTypes = p.roomTypes;
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
  conversationId: idOf(i.conversation),
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

// ---------- Offers & rentals ----------
const mapListingSummary = (p) =>
  p && typeof p === "object"
    ? {
        id: p.id,
        title: p.title,
        image: p.images?.[0] || "",
        location: [p.location?.neighbourhood, p.location?.city].filter(Boolean).join(", "),
        price: p.price,
        pricePeriod: p.pricePeriod,
        listingType: p.listingType,
        availability: p.availability,
      }
    : { id: idOf(p), title: "Removed property", image: "", location: "" };

const OFFER_STATUS = { pending: "Pending", accepted: "Accepted", rejected: "Rejected", countered: "Countered", withdrawn: "Withdrawn" };

export const mapOffer = (o) => ({
  id: o.id,
  property: mapListingSummary(o.property),
  customer: o.customer,
  owner: o.owner,
  ownerType: o.ownerType,
  askingPrice: o.askingPrice,
  amount: o.amount,
  message: o.message || "",
  status: OFFER_STATUS[o.status] || o.status,
  counterAmount: o.counterAmount,
  response: o.response || "",
  respondedAt: o.respondedAt,
  conversationId: o.conversation || null,
  createdAt: o.createdAt,
});


// Who made each change to a rental or purchase request
const mapHistory = (history = []) => history.map((h) => ({ ...h, statusLabel: h.status, at: h.at }));

export const RENTAL_STATUS = {
  pending: "Pending",
  payment_pending: "Payment Pending",
  paid: "Paid",
  confirmed: "Confirmed",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};
const PAYMENT_STATUS = { pending: "Pending", paid: "Paid", failed: "Failed", duplicate: "Duplicate" };

export const mapRental = (r) => ({
  id: r.id,
  hotelId: r.hotelId || null,
  roomTypeId: r.roomTypeId || null,
  roomName: r.roomName || "",
  numberOfRooms: r.numberOfRooms || 1,
  property: mapListingSummary(r.property),
  customer: r.customer,
  owner: r.owner,
  ownerType: r.ownerType,
  startDate: r.startDate, // preferred move-in date
  endDate: r.endDate,
  pricePeriod: r.pricePeriod,
  unitPrice: r.unitPrice,
  units: r.units,
  fees: r.fees || 0,
  amount: r.amount,
  statusKey: r.status,
  status: RENTAL_STATUS[r.status] || r.status,
  paymentStatus: PAYMENT_STATUS[r.paymentStatus] || r.paymentStatus,
  paymentMethod: r.paymentMethod,
  contactName: r.contactName,
  contactPhone: r.contactPhone,
  contactEmail: r.contactEmail,
  currentAddress: r.currentAddress || "",
  occupants: r.occupants,
  notes: r.notes || "",
  reference: r.paymentReference,
  paidAt: r.paidAt,
  conversationId: r.conversation || null,
  history: mapHistory(r.history).map((h) => ({ ...h, statusLabel: RENTAL_STATUS[h.status] || h.status })),
  canManage: Boolean(r.canManage),
  createdAt: r.createdAt,
});

// ---------- Purchase (sale) requests ----------
export const SALE_STATUS = {
  pending: "Pending",
  contacted: "Contacted",
  offer_received: "Offer Received",
  negotiating: "Negotiating",
  approved: "Approved",
  payment_pending: "Payment Pending",
  paid_at_office: "Paid at Office",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected",
};
export const SALE_PAYMENT_STATUS = { pending: "Pending", payment_requested: "Payment Requested", confirmed: "Payment Confirmed", failed: "Failed" };

export const mapSaleRequest = (s) => ({
  id: s.id,
  property: mapListingSummary(s.property),
  customer: s.customer,
  owner: s.owner,
  ownerType: s.ownerType,
  askingPrice: s.askingPrice,
  contactName: s.contactName,
  contactEmail: s.contactEmail,
  contactPhone: s.contactPhone,
  message: s.message || "",
  statusKey: s.status,
  status: SALE_STATUS[s.status] || s.status,
  paymentStatusKey: s.paymentStatus,
  paymentStatus: SALE_PAYMENT_STATUS[s.paymentStatus] || s.paymentStatus,
  amountPaid: s.amountPaid,
  paymentConfirmedBy: s.paymentConfirmedBy,
  paymentConfirmedAt: s.paymentConfirmedAt,
  offer: s.offer, // the customer's latest offer on this property, if any
  conversationId: s.conversation || null,
  history: mapHistory(s.history).map((h) => ({ ...h, statusLabel: SALE_STATUS[h.status] || h.status })),
  canManage: Boolean(s.canManage),
  createdAt: s.createdAt,
});

// ---------- Payment records (rentals online, sales at the office) ----------
export const mapPaymentRecord = (p) => ({
  id: p.id,
  kind: p.kind,
  reference: p.reference,
  amount: p.amount,
  method: p.method,
  status: p.status === "refund_required" ? "Refund required" : PAYMENT_STATUS[p.status] || p.status,
  customer: p.customer?.firstName ? `${p.customer.firstName} ${p.customer.lastName}` : "Deleted user",
  property: p.property?.title || "Removed property",
  ownerType: p.ownerType,
  owner: p.ownerType === "admin" ? "Admin" : p.owner?.firstName ? `${p.owner.firstName} ${p.owner.lastName}` : "Agent",
  confirmedBy: p.confirmedBy?.firstName ? `${p.confirmedBy.firstName} ${p.confirmedBy.lastName}` : null,
  note: p.note || "",
  paidAt: p.paidAt,
  createdAt: p.createdAt,
});
