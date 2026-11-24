import { getSubscriptionState } from "../utils/subscription.js";
// Translate between the backend models and the shapes the UI components use,
// so components don't need to know how the API stores data.

const idOf = (value) => (value && typeof value === "object" ? value.id || value._id : value) || null;

// ---------- Plans ----------
export const mapPlan = (p) => ({
  id: p.id,
  name: p.name,
  tagline: p.tagline || "",
  accountType: ["agency", "company"].includes(p.accountType) ? p.accountType : "individual",
  sortOrder: p.sortOrder || 0,
  price: p.price,
  durationDays: p.duration,
  propertyLimit: p.propertyLimit,
  imageLimit: p.imageLimit,
  featuredLimit: p.featuredPropertyLimit ?? 0,
  analytics: p.analyticsLevel,
  inquiryManagement: p.inquiryManagement,
  priorityVisibility: Boolean(p.priorityVisibility),
  internalChat: Boolean(p.internalChat),
  teamMemberLimit: p.teamMemberLimit || 0,
  extraFeatures: p.features || [],
  active: p.isActive,
  popular: Boolean(p.popular),
});

export const toApiPlan = (p) => ({
  name: p.name,
  tagline: p.tagline,
  accountType: p.accountType,
  price: p.price,
  duration: p.durationDays,
  propertyLimit: p.propertyLimit,
  imageLimit: p.imageLimit,
  featuredPropertyLimit: p.featuredLimit,
  analyticsLevel: p.analytics,
  inquiryManagement: p.inquiryManagement,
  priorityVisibility: p.priorityVisibility,
  internalChat: p.internalChat,
  teamMemberLimit: p.teamMemberLimit,
  sortOrder: p.sortOrder,
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
        accountType: ["agency", "company"].includes(s.accountType) ? s.accountType : "individual",
        price: s.amount,
        kind: s.kind || "new",
        credit: s.credit || 0,
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
// ---------- Refunds of flagged payments ----------
const REFUND_LABEL = {
  submitting: "Sending refund",
  unconfirmed: "Refund unconfirmed",
  pending: "Refund pending",
  processing: "Refund processing",
  "needs-attention": "Refund needs attention",
  processed: "Refunded",
  failed: "Refund failed",
};
export const mapRefund = (r) =>
  r && typeof r === "object"
    ? {
        id: r.id || r._id,
        status: r.status,
        label: REFUND_LABEL[r.status] || r.status,
        method: r.method,
        amount: r.amount,
        providerRefundId: r.providerRefundId || "",
        externalReference: r.externalReference || "",
        reason: r.reason || "",
        failureReason: r.failureReason || "",
        processedAt: r.processedAt,
        createdAt: r.createdAt,
      }
    : null;

// ---------- Paystack disputes (chargebacks) ----------
const DISPUTE_LABEL = { open: "Dispute open", check: "Check dispute", lost: "Dispute lost", won: "Dispute won" };
export const mapDispute = (d) =>
  d && typeof d === "object"
    ? {
        id: d.disputeId,
        outcome: d.outcome,
        label: DISPUTE_LABEL[d.outcome] || d.outcome,
        // The customer's bank has the payment in hand: a Paystack refund could pay the customer twice
        blocksRefund: d.outcome !== "won",
        awaitingAnswer: d.outcome === "open" && d.providerStatus === "awaiting-merchant-feedback",
        amount: d.disputedAmount,
        lostAmount: d.lostAmount || 0,
        dueAt: d.dueAt,
        resolvedAt: d.resolvedAt,
      }
    : null;
// What is left of a payment after money returned through lost disputes
const receivedAmount = (p) => Math.round((p.amount - (p.disputeLost || 0)) * 100) / 100;

export const mapPayment = (s) => ({
  id: s.id,
  received: receivedAmount(s),
  dispute: mapDispute(s.dispute),
  userId: idOf(s.user),
  planId: idOf(s.plan),
  amount: s.amount,
  method: s.paymentMethod,
  status: s.paymentStatus,
  note: s.note || "",
  environment: s.environment || "test",
  refund: mapRefund(s.refund),
  createdAt: s.paidAt || s.createdAt,
  reference: s.paymentReference,
});

// ---------- Users ----------
export const mapUser = (u, domain) =>
  u && {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    name: `${u.firstName} ${u.lastName}`,
    email: u.email,
    emailVerified: Boolean(u.emailVerifiedAt), // they proved the inbox is theirs (a code, or Google)
    passwordMissing: Boolean(u.passwordMissing), // your own account only: Google sign-in, no NyaFie password yet
    phone: u.phone || "",
    profileImage: u.profileImage || "",
    role: domain === "customer" && u.role === "agent" ? "user" : u.role, // every agent is a customer too
    customerAccess: Boolean(u.customerAccess),
    agentAccess: u.role === "agent",
    status: u.removal?.deletedAt ? "deleted" : u.agentApplication?.status === "removed" ? "removed" : u.isActive === false ? "suspended" : "active",
    // Admin views only: why and when the provider was removed
    removal: u.removal || null,
    createdAt: u.createdAt,
    preferences: u.preferences || {},
    agentApplication: u.agentApplication || null,
    applicationRequirements: u.applicationRequirements || null,
    // Agents only: next onboarding step and statuses, computed by the server
    onboarding: u.onboarding || null,
    savedProperties: (u.savedProperties || []).map(String),
    subscription: mapSubscription(u.subscription),
    // Agency staff: the agency they work for, their role there and the agency's plan
    agency: u.agency?.owner ? { ownerId: idOf(u.agency.owner), role: u.agency.role, joinedAt: u.agency.joinedAt, name: u.agency.name || "", logo: u.agency.logo || "", subscription: mapSubscription(u.agency.subscription) } : null,
    savedCount: u.savedCount ?? (u.savedProperties || []).length,
    inquiriesCount: u.inquiriesCount ?? 0,
    activeProperties: u.activeProperties ?? 0, // agents, admin views: listings that count toward the plan
  };

// A customer on the admin Customers page, with what they did (and, for one customer, their latest activity)
const ACTIVITY_STATUS = { offer: (s) => OFFER_STATUS[s], rental: (s) => RENTAL_STATUS[s], purchase: (s) => SALE_STATUS[s], inquiry: (s) => STATUS_TO_UI[s] };
export const mapCustomer = (u) => ({
  ...mapUser(u),
  activity: u.activity || { inquiries: 0, offers: 0, rentals: 0, purchases: 0 },
  recent: (u.recent || []).map((entry) => ({ ...entry, status: ACTIVITY_STATUS[entry.kind]?.(entry.status) || entry.status })),
});

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
    // The pin was found from the address (the area), not placed on the building
    approximate: p.location?.pinSource === "address",
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
  // Hotels: the owner's saved payment options, and what a guest can choose right now (details page only)
  stayBooking: p.stayBooking || null,
  hotelInfo: p.hotelInfo || null, // hotels: check-in from, check-out by, star rating
  moveIn: p.moveIn || null, // monthly rentals: advance, agent fee, deposit (utils/moveIn.js)
  paymentOptions: p.paymentOptions || null,
  // video / virtualTour: { provider, id } or null (utils/mediaLinks.js builds the players)
  // videoFile: an uploaded video { publicId, url, duration, ... } or null (frontApi/videoApi.js)
  media: { images: p.images || [], video: p.video || null, virtualTour: p.virtualTour || null, videoFile: p.videoFile || null },
  agent: {
    id: p.agent?.id || idOf(p.owner),
    name: p.agent?.name || p.contact?.name || "Agent",
    phone: p.agent?.phone ?? p.contact?.phone ?? "",
    email: p.agent?.email ?? p.contact?.email ?? "",
    // Guests get only this, on a listing's details page (guestContact), to message the agent on WhatsApp
    whatsapp: p.agent?.whatsapp || p.agent?.phone || p.contact?.phone || p.guestContact?.whatsapp || "",
    profileImage: p.agent?.profileImage || "",
    companyName: p.agent?.companyName || "",
    joinedAt: p.agent?.joinedAt,
    verified: p.agent?.verified === true,
    chat: p.ownerType !== "agent" || p.agent?.chat === true, // NyaFie chat is a plan feature for agents
    agency: p.agent?.agency || null, // { id, name, logo } for agency listings
    profileId: p.agent?.agency?.id || p.agent?.id || idOf(p.owner), // staff link to their agency's profile
  },
  assignedTo: idOf(p.assignedTo), // agency staff member handling the listing (null: the owner)
  // rating: average of published customer reviews (null until the first one)
  meta: { isFeatured: Boolean(p.isFeatured), rating: p.ratingCount ? p.ratingAverage : null, ratingCount: p.ratingCount || 0, views: p.views || 0 },
  owner: { type: p.ownerType, id: p.ownerType === "admin" ? "admin" : idOf(p.owner) },
  ownerUserId: idOf(p.owner),
  // Nearby search only: metres from the search location, measured by the server
  distance: Number.isFinite(p.distance) ? p.distance : null,
  listing: {
    state: p.status,
    availability: p.availability,
    rejectionReason: p.rejectionReason || "",
    reviewedAt: p.reviewedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    // Listing freshness: when the owner last confirmed it is available; "hidden" | "confirm" | "fresh"
    confirmedAt: p.availabilityConfirmedAt || null,
    freshness: p.staleSince ? "hidden" : p.freshnessReminderAt ? "confirm" : "fresh",
    // When NyaFie checked the owner's ownership documents (sale listings); null when not checked
    documentsVerifiedAt: p.documentsVerifiedAt || null,
  },
});

// A listing on the admin pages: with its owner's name and whether customers can see it
export const mapAdminProperty = (p) => ({ ...mapProperty(p), ownerName: p.ownerName || "Deleted agent", isPublic: Boolean(p.isPublic) });

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
  if (p.stayBooking) out.stayBooking = p.stayBooking;
  if (p.hotelInfo) out.hotelInfo = p.hotelInfo;
  if (p.moveIn !== undefined) out.moveIn = p.moveIn;
  if (p.media) {
    out.images = p.media.images;
    // Pasted links, checked by the server ("" removes them)
    if (p.media.videoUrl !== undefined) out.videoUrl = p.media.videoUrl;
    if (p.media.virtualTourUrl !== undefined) out.virtualTourUrl = p.media.virtualTourUrl;
    // An uploaded video: its id only (the server checks it with Cloudinary); null removes it
    if (p.media.videoFile !== undefined) out.videoFile = p.media.videoFile ? { publicId: p.media.videoFile.publicId } : null;
  }
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
  assignedTo: idOf(i.assignedTo),
  status: STATUS_TO_UI[i.status] || i.status,
  createdAt: i.createdAt,
});

// ---------- Chat ----------
export const mapConversation = (c) => {
  const p = c.property && typeof c.property === "object" ? c.property : null;
  return {
    id: c.id,
    side: c.side, // "customer" | "owner": which side the signed-in account is on
    chatEnabled: c.chatEnabled !== false, // false when the agent's plan has no NyaFie chat
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


// ---------- Viewings ----------
export const VIEWING_STATUS = { requested: "Requested", confirmed: "Confirmed", declined: "Declined", cancelled: "Cancelled", completed: "Completed", missed: "Missed", expired: "Expired" };

// awaiting: "owner" | "customer" | null, the side that must answer the proposed time
export const mapViewing = (v) => ({
  id: v.id,
  property: mapListingSummary(v.property),
  customer: v.customer,
  owner: v.owner,
  ownerType: v.ownerType,
  scheduledAt: v.scheduledAt,
  statusKey: v.status,
  status: VIEWING_STATUS[v.status] || v.status,
  awaiting: v.awaiting || null,
  proposedBy: v.proposedBy,
  contactName: v.contactName || "",
  contactPhone: v.contactPhone || "",
  message: v.message || "",
  response: v.response || "",
  cancelledBy: v.cancelledBy || null,
  conversationId: v.conversation || null,
  history: v.history || [],
  createdAt: v.createdAt,
  updatedAt: v.updatedAt,
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
const PAYMENT_STATUS = { pending: "Pending", paid: "Paid", failed: "Failed", duplicate: "Duplicate", refunded: "Refunded" };

// A receipt the agent, agency or hotel gave the customer (backend utils/receipts.js), or null
export const mapReceipt = (receipt) => (receipt?.number ? { ...receipt } : null);

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
  paymentStatus: r.paymentStatus === "due" ? (r.paymentOption === "office" ? "Due at the office" : r.hotelId ? "Due at hotel" : "Due on arrival") : PAYMENT_STATUS[r.paymentStatus] || r.paymentStatus,
  paymentDue: r.paymentStatus === "due", // reserved; the guest pays the hotel, the owner on arrival, or at the office
  paymentMethod: r.paymentMethod,
  paymentOption: r.paymentOption || null, // "online" | "on_arrival" (stays) | "office" (monthly and fixed-price rent)
  paysAtOffice: Boolean(r.paysAtOffice), // monthly and fixed-price rent: never paid online
  receipt: mapReceipt(r.receipt),
  arrivalDeadline: r.arrivalDeadline || null,
  arrivalTime: r.arrivalTime || "", // stays: when the guest said they'll arrive ("15:30", Ghana time)
  bookingCode: r.bookingCode || "", // stays: shown at the hotel or to the owner on arrival (hotels: once approved)
  roomNumbers: r.roomNumbers || [], // hotels: the room(s) the hotel assigned when approving
  roomOptions: r.roomOptions || [], // hotels, owner side: the room type's room numbers to choose from when approving
  approvedAt: r.approvedAt || null,
  awaitingApproval: Boolean(r.awaitingApproval), // hotels: waiting for the hotel to approve and assign rooms
  approvalDeadline: r.approvalDeadline || null, // ...cancelled automatically if not approved by then
  cancellationPolicy: r.cancellationPolicy || "",
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
  paid_at_office: "Payment Received",
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
  receipt: mapReceipt(s.receipt),
  offer: s.offer, // the customer's latest offer on this property, if any
  conversationId: s.conversation || null,
  history: mapHistory(s.history).map((h) => ({ ...h, statusLabel: SALE_STATUS[h.status] || h.status })),
  canManage: Boolean(s.canManage),
  createdAt: s.createdAt,
});

// ---------- Payment records (rentals online, sales paid to the owner) ----------
export const mapPaymentRecord = (p) => ({
  id: p.id,
  received: receivedAmount(p),
  dispute: mapDispute(p.dispute),
  kind: p.kind,
  reference: p.reference,
  amount: p.amount,
  method: p.method,
  status: p.status === "refund_required" ? "Refund required" : PAYMENT_STATUS[p.status] || p.status,
  statusKey: p.status,
  environment: p.environment || "test",
  refund: mapRefund(p.refund),
  customer: p.customer?.firstName ? `${p.customer.firstName} ${p.customer.lastName}` : "Deleted user",
  property: p.property?.title || "Removed property",
  ownerType: p.ownerType,
  owner: p.ownerType === "admin" ? "Admin" : p.owner?.firstName ? `${p.owner.firstName} ${p.owner.lastName}` : "Agent",
  confirmedBy: p.confirmedBy?.firstName ? `${p.confirmedBy.firstName} ${p.confirmedBy.lastName}` : null,
  note: p.note || "",
  paidAt: p.paidAt,
  createdAt: p.createdAt,
});

// ---------- Admin: an inquiry with its listing and who handles it ----------
export const mapAdminInquiry = (i) => ({ ...mapInquiry(i), property: mapListingSummary(i.property), ownerName: i.ownerName || "Deleted agent" });

// ---------- Admin: an agent with their subscription's state and what they have on the platform ----------
export const mapProvider = (u) => {
  const user = mapUser(u);
  return {
    ...user,
    sub: getSubscriptionState(user.subscription),
    activeCount: user.activeProperties,
    accountType: ["agency", "company"].includes(user.agentApplication?.agentType) ? user.agentApplication.agentType : "individual",
    stats: u.stats,
    teamCount: u.stats?.team || 0,
    listings: (u.listings || []).map(mapAdminProperty), // one agent only: their latest
    payments: (u.payments || []).map(mapPayment),
  };
};

// ---------- Admin payments: rentals, sales and agent subscriptions as one list ----------
const capitalise = (s = "") => s.charAt(0).toUpperCase() + s.slice(1);
const SUBSCRIPTION_PAYMENT_STATUS = { refund_required: "Refund required" };
export const mapLedgerRow = ({ source, record }) => {
  if (source === "subscription") {
    const p = mapPayment(record);
    return {
      id: `s-${p.id}`, source, recordId: p.id, type: "subscription", statusKey: p.status, refund: p.refund, dispute: p.dispute, received: p.received,
      environment: p.environment, reference: p.reference, amount: p.amount, method: p.method, note: p.note, date: p.createdAt,
      payer: record.user?.firstName ? `${record.user.firstName} ${record.user.lastName}` : "Deleted user",
      item: "Agent subscription", listing: "", status: SUBSCRIPTION_PAYMENT_STATUS[p.status] || capitalise(p.status),
    };
  }
  const p = mapPaymentRecord(record);
  return {
    id: `p-${p.id}`, source, recordId: p.id, type: p.kind, statusKey: p.statusKey, refund: p.refund, dispute: p.dispute, received: p.received,
    environment: p.environment, reference: p.reference, amount: p.amount, method: p.method, note: p.note, date: p.paidAt || p.createdAt,
    payer: p.customer, item: p.property, status: p.status,
    listing: `${p.ownerType === "admin" ? "Admin listing" : `Agent listing · ${p.owner}`}${p.confirmedBy ? ` · confirmed by ${p.confirmedBy}` : ""}`,
  };
};
