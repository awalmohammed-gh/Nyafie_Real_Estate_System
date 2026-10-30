import mongoose from "mongoose";
import Property from "../models/Property.js";
import Review from "../models/Review.js";
import User from "../models/User.js";
import { siteName } from "../models/Setting.js";
import { notifyAdmins } from "../utils/notify.js";
import { COUNTED_STATES, withinImageLimit } from "../utils/permissions.js";
import { PUBLIC_AGENT_FIELDS, publicAgent, presentProperties, publicQuery, visibleAgentIds, isPubliclyVisible } from "../utils/marketplace.js";
import { claimView, isCrawler, viewerHash } from "../utils/propertyViews.js";
export { publicQuery, visibleAgentIds } from "../utils/marketplace.js";
import { resolveImages } from "../utils/uploadImages.js";
import { ok, fail } from "../utils/response.js";
import Rental from "../models/Rental.js";
import Inquiry from "../models/Inquiry.js";
import Conversation from "../models/Conversation.js";
import Offer from "../models/Offer.js";
import SaleRequest from "../models/SaleRequest.js";
import { canHandleTeamRecord, canSeeAllAgencyWork, isTeamMember, teamFilter, teamOf } from "../utils/team.js";
import { agencyAssignee } from "./agentController.js";
import { isHotel, prepareHotelFields, saveHotelProperty, validateHotelPublishing } from "../utils/hotel.js";

const TYPES_OF_PRICE = ["total", "month", "night"];

// Only these fields can be written by clients; owner, status and counters are set by the server
export const pickPropertyFields = (body) => {
  const out = {};
  const text = ["title", "description", "propertyType", "currency", "areaUnit"];
  text.forEach((key) => body[key] !== undefined && (out[key] = String(body[key]).trim()));
  const numbers = ["price", "bedrooms", "bathrooms", "area"];
  numbers.forEach((key) => body[key] !== undefined && (out[key] = Math.max(0, Number(body[key]) || 0)));
  if (body.listingType !== undefined) out.listingType = body.listingType === "Rent" ? "Rent" : "Sale";
  if (body.pricePeriod !== undefined) out.pricePeriod = TYPES_OF_PRICE.includes(body.pricePeriod) ? body.pricePeriod : "total";
  if (body.location) {
    out.location = {
      address: String(body.location.address || "").trim(),
      neighbourhood: String(body.location.neighbourhood || "").trim(),
      city: String(body.location.city || "").trim(),
      region: String(body.location.region || "").trim(),
      country: String(body.location.country || "Ghana").trim(),
      digitalAddress: String(body.location.digitalAddress || "").trim().slice(0, 30),
    };
    for (const [key, min, max] of [["latitude", -90, 90], ["longitude", -180, 180]]) {
      const raw = body.location[key];
      const value = Number(raw);
      out.location[key] = raw !== "" && raw != null && Number.isFinite(value) && value >= min && value <= max ? value : null;
    }
  }
  if (Array.isArray(body.amenities)) out.amenities = body.amenities.map((a) => String(a).trim()).filter(Boolean).slice(0, 40);
  if (body.availability !== undefined && ["Available", "Under Offer", "Sold", "Rented"].includes(body.availability)) {
    out.availability = body.availability;
  }
  if (body.contact) {
    out.contact = {
      name: String(body.contact.name || "").trim(),
      phone: String(body.contact.phone || "").trim(),
      email: String(body.contact.email || "").trim().toLowerCase(),
    };
  }
  return out;
};

/**
 * Property type and rental period must be ones enabled in Admin Settings. A value the listing
 * already has stays valid, so removing a type later never blocks editing older listings.
 */
export const checkPropertyOptions = (fields, settings, existing = null) => {
  const { propertyTypes, rentPeriods } = settings.property;
  if (fields.propertyType !== undefined && fields.propertyType !== existing?.propertyType && !propertyTypes.includes(fields.propertyType)) {
    return "Choose one of the available property types.";
  }
  const listingType = fields.listingType ?? existing?.listingType;
  const period = fields.pricePeriod ?? existing?.pricePeriod;
  const changed = fields.listingType !== undefined || fields.pricePeriod !== undefined;
  if (listingType === "Rent" && changed && period !== existing?.pricePeriod && !rentPeriods.includes(period)) {
    return `Rentals can be priced ${rentPeriods.map((p) => `per ${p}`).join(" or ")}.`;
  }
  return null;
};

// Checks required fields before a listing is submitted/published
export const validateForPublishing = (p) => {
  if (isHotel(p)) { const problem = validateHotelPublishing(p); if (problem) return problem; }
  if (!p.title || p.title.length < 3) return "Give the property a title (at least 3 characters).";
  if (!p.description || p.description.length < 30) return "Describe the property in at least 30 characters.";
  if (!p.propertyType) return "Choose a property type.";
  if (!Number.isFinite(p.price) || !(p.price > 0)) return "Enter a price greater than 0.";
  if (!p.location?.neighbourhood || !p.location?.city || !p.location?.address) return "Complete the property location.";
  if (!Number.isFinite(p.area) || !(p.area > 0)) return "Enter the floor area.";
  if (!p.images?.length) return "Add at least one photo before publishing.";
  if (!p.contact?.phone || !/^\S+@\S+\.\S+$/.test(p.contact?.email || "")) return "Add a contact phone number and email.";
  return null;
};

/**
 * GET /api/agents/public -> agents customers can contact: active account and (when Admin Settings
 * require it) an active subscription, whether or not they have published a listing yet.
 * Only public profile fields; complete listing statistics are aggregated on the server.
 */
export const listPublicAgents = async (_req, res) => {
  const ids = (await visibleAgentIds()).map((a) => a.id);
  const [agents, statistics] = await Promise.all([
    User.find({ _id: { $in: ids } }).select(PUBLIC_AGENT_FIELDS).sort({ createdAt: 1 }),
    Property.aggregate([
      { $match: { ownerType: "agent", owner: { $in: ids }, status: "published", availability: { $in: ["Available", "Under Offer"] } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: "$owner", propertyCount: { $sum: 1 }, saleCount: { $sum: { $cond: [{ $eq: ["$listingType", "Sale"] }, 1, 0] } }, rentCount: { $sum: { $cond: [{ $eq: ["$listingType", "Rent"] }, 1, 0] } }, locations: { $addToSet: "$location.neighbourhood" }, rating: { $avg: { $cond: [{ $gt: ["$ratingCount", 0] }, "$ratingAverage", null] } }, coverImage: { $first: { $arrayElemAt: ["$images", 0] } } } },
    ]),
  ]);
  const byOwner = new Map(statistics.map(({ _id, ...stats }) => [String(_id), stats]));
  ok(res, agents.map((agent) => ({ ...publicAgent(agent), propertyCount: 0, saleCount: 0, rentCount: 0, locations: [], rating: null, ...byOwner.get(String(agent._id)) })));
};

const { ObjectId } = mongoose.Types;
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const list = (value) => String(value || "").split(",").map((v) => v.trim()).filter(Boolean);
const toIds = (values) => values.filter((v) => mongoose.isValidObjectId(v)).map((v) => new ObjectId(v));
const number = (value) => (value === undefined || value === "" || Number.isNaN(Number(value)) ? null : Number(value));
const exact = (value) => new RegExp(`^${escapeRegex(value)}$`, "i");

const SORTS = {
  latest: { createdAt: -1 },
  priceAsc: { price: 1, createdAt: -1 },
  priceDesc: { price: -1, createdAt: -1 },
  popular: { views: -1, createdAt: -1 },
  rating: { ratingAverage: -1, ratingCount: -1, createdAt: -1 }, // from published customer reviews
  featured: { isFeatured: -1, ratingAverage: -1, createdAt: -1 }, // featured listings first (homepage)
};

/**
 * Turns query-string filters into a MongoDB filter on top of the public visibility rules.
 * Supported: search, listingType, type (comma list), area, city, availability (comma list),
 * minPrice, maxPrice, bedrooms, bathrooms (minimums), featured, owner, ids, exclude.
 * ObjectIds are cast explicitly because the recommended sort runs as an aggregation.
 */
export const buildPublicFilter = (q, base) => {
  const and = [base];
  const search = String(q.search || "").trim().slice(0, 80);
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    and.push({ $or: [{ title: rx }, { description: rx }, { propertyType: rx }, { "location.neighbourhood": rx }, { "location.city": rx }, { "location.region": rx }, { "location.address": rx }] });
  }
  const listingType = q.listingType || ({ rent: "Rent", sale: "Sale" })[q.purpose];
  if (["Sale", "Rent"].includes(listingType)) and.push({ listingType });
  if (list(q.type).length) and.push({ propertyType: { $in: list(q.type).map(exact) } });
  if (q.area) and.push({ "location.neighbourhood": exact(String(q.area)) });
  if (q.city) and.push({ "location.city": exact(String(q.city)) });
  if (q.region) and.push({ "location.region": exact(String(q.region)) });
  const availability = list(q.availability).filter((a) => ["Available", "Under Offer", "Sold", "Rented"].includes(a));
  if (availability.length) and.push({ availability: { $in: availability } });
  const minPrice = number(q.minPrice);
  const maxPrice = number(q.maxPrice);
  if (minPrice !== null || maxPrice !== null) and.push({ price: { ...(minPrice !== null && { $gte: minPrice }), ...(maxPrice !== null && { $lte: maxPrice }) } });
  if (number(q.bedrooms) !== null) and.push({ bedrooms: { $gte: number(q.bedrooms) } });
  if (number(q.bathrooms) !== null) and.push({ bathrooms: { $gte: number(q.bathrooms) } });
  if (q.featured === "true") and.push({ isFeatured: true });
  if (q.owner && mongoose.isValidObjectId(q.owner)) and.push({ owner: new ObjectId(String(q.owner)) });
  if (q.ids) and.push({ _id: { $in: toIds(list(q.ids)).slice(0, 100) } });
  if (q.exclude && mongoose.isValidObjectId(q.exclude)) and.push({ _id: { $ne: new ObjectId(String(q.exclude)) } });
  return { $and: and };
};

// Mongo filter for "published and publicly visible" with ObjectIds cast for aggregations
const publicBase = (agents) => ({ status: "published", $or: [{ ownerType: "admin" }, { ownerType: "agent", owner: { $in: agents.map((a) => new ObjectId(String(a.id))) } }] });

/**
 * GET /api/properties (public)
 * Without `page`: up to 48 public listings for the shared property cache.
 * With `page`: filtered, sorted and paginated -> { items, total, page, pages, limit }.
 * The default "recommended" order puts HomeBase listings first, then agents with
 * priority visibility, then everyone else (newest first within each group).
 */
export const listPublicProperties = async (req, res) => {
  const { agents } = await publicQuery();
  const priorityIds = agents.filter((a) => a.priority).map((a) => new ObjectId(String(a.id)));
  const filter = buildPublicFilter(req.query, publicBase(agents));
  const recommended = [
    { $addFields: { _rank: { $cond: [{ $eq: ["$ownerType", "admin"] }, 0, { $cond: [{ $in: ["$owner", priorityIds] }, 1, 2] }] } } },
    { $sort: { _rank: 1, createdAt: -1 } },
  ];

  if (req.query.page === undefined) {
    const docs = await Property.aggregate([{ $match: filter }, ...recommended, { $limit: 48 }, { $project: { _rank: 0 } }]);
    return ok(res, await presentProperties(docs.slice(0, 48).map((d) => Property.hydrate(d)), { includeAgentDetails: Boolean(req.user) }));
  }

  const limit = Math.min(48, Math.max(1, Math.round(number(req.query.limit) || 12)));
  const page = Math.max(1, Math.round(number(req.query.page) || 1));
  const skip = (page - 1) * limit;
  const sort = SORTS[req.query.sort];
  const [total, docs] = await Promise.all([
    Property.countDocuments(filter),
    sort
      ? Property.find(filter).sort(sort).skip(skip).limit(limit)
      : Property.aggregate([{ $match: filter }, ...recommended, { $skip: skip }, { $limit: limit }, { $project: { _rank: 0 } }]).then((rows) => rows.map((d) => Property.hydrate(d))),
  ]);
  ok(res, { items: await presentProperties(docs, { includeAgentDetails: Boolean(req.user) }), total, page, pages: Math.max(1, Math.ceil(total / limit)), limit });
};

/**
 * GET /api/properties/facets (public): filter options and headline numbers,
 * computed from the public listings in MongoDB (optionally for one listingType).
 */
export const propertyFacets = async (req, res) => {
  const { agents } = await publicQuery();
  const base = publicBase(agents);
  const match = ["Sale", "Rent"].includes(req.query.listingType) ? { $and: [base, { listingType: req.query.listingType }] } : base;
  const [facet] = await Property.aggregate([
    { $match: match },
    {
      $facet: {
        types: [{ $group: { _id: "$propertyType", count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
        regions: [{ $match: { "location.region": { $nin: ["", null] } } }, { $group: { _id: "$location.region", count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
        cities: [{ $match: { "location.city": { $nin: ["", null] } } }, { $group: { _id: { city: "$location.city", region: "$location.region" }, count: { $sum: 1 } } }, { $sort: { "_id.city": 1 } }],
        areas: [
          { $match: { "location.neighbourhood": { $ne: "" } } },
          { $sort: { views: -1 } },
          { $group: { _id: "$location.neighbourhood", city: { $first: "$location.city" }, region: { $first: "$location.region" }, image: { $first: { $arrayElemAt: ["$images", 0] } }, count: { $sum: 1 }, views: { $sum: "$views" } } },
          { $sort: { count: -1, views: -1, _id: 1 } },
        ],
        listingTypes: [{ $group: { _id: "$listingType", count: { $sum: 1 }, minPrice: { $min: "$price" }, maxPrice: { $max: "$price" } } }],
        totals: [{ $group: { _id: null, total: { $sum: 1 }, avgRating: { $avg: { $cond: [{ $gt: ["$ratingCount", 0] }, "$ratingAverage", null] } }, agents: { $addToSet: { $cond: [{ $eq: ["$ownerType", "agent"] }, "$owner", null] } } } }],
      },
    },
  ]);
  const totals = facet.totals[0] || { total: 0, avgRating: null, agents: [] };
  const byListingType = Object.fromEntries(facet.listingTypes.map((t) => [t._id, { count: t.count, minPrice: t.minPrice, maxPrice: t.maxPrice }]));
  ok(res, {
    total: totals.total,
    sale: byListingType.Sale?.count || 0,
    rent: byListingType.Rent?.count || 0,
    priceRange: byListingType,
    agents: agents.length, // available agents (same rule as the public agents directory), with or without listings
    avgRating: totals.avgRating ? Math.round(totals.avgRating * 10) / 10 : null,
    types: facet.types.map((t) => ({ value: t._id, count: t.count })),
    regions: facet.regions.map((r) => ({ name: r._id, count: r.count })),
    cities: facet.cities.map((c) => ({ name: c._id.city, region: c._id.region, count: c.count })),
    areas: facet.areas.map((a) => ({ name: a._id, city: a.city, region: a.region, image: a.image || "", count: a.count, views: a.views })),
  });
};

/**
 * GET /api/properties/:id/related (public): up to `limit` visible listings like this one:
 * same listing type, then the same property type or city, in a similar price range.
 */
export const relatedProperties = async (req, res) => {
  const property = mongoose.isValidObjectId(req.params.id) ? await Property.findById(req.params.id) : null;
  if (!property) return fail(res, 404, "Property not found.");
  const { agents } = await publicQuery();
  if (!await Property.exists({ $and: [publicBase(agents), { _id: property._id }] })) return fail(res, 404, "Property not found.");
  const base = { $and: [publicBase(agents), { listingType: property.listingType, _id: { $ne: property._id } }] };
  const limit = Math.min(12, Math.max(1, Math.round(number(req.query.limit) || 3)));

  const similar = await Property.find({
    $and: [
      base,
      { $or: [{ propertyType: property.propertyType }, { "location.city": property.location.city }, { "location.neighbourhood": property.location.neighbourhood }] },
      ...(property.price > 0 ? [{ price: { $gte: property.price * 0.5, $lte: property.price * 1.5 } }] : []),
    ],
  })
    .sort({ views: -1, createdAt: -1 })
    .limit(limit);

  // Not enough close matches: fill with other listings of the same type (sale/rent)
  const fill = similar.length < limit ? await Property.find({ $and: [base, { _id: { $nin: similar.map((p) => p._id) } }] }).sort({ createdAt: -1 }).limit(limit - similar.length) : [];
  ok(res, await presentProperties([...similar, ...fill], { includeAgentDetails: Boolean(req.user) }));
};

// The posting agent, or for an agency listing: the owner, managers and the assigned staff member
const isOwner = (property, user) => Boolean(user) && property.ownerType === "agent" && canHandleTeamRecord(property, user);

// GET /api/properties/:id (public when visible; owners and admins can always see it)
export const getProperty = async (req, res) => {
  const property = await Property.findById(req.params.id).catch(() => null);
  if (!property) return fail(res, 404, "Property not found.");
  if (req.user?.role === "admin" || isOwner(property, req.user)) return ok(res, (await presentProperties([property]))[0]);
  const { query } = await publicQuery();
  const visible = await Property.exists({ _id: property._id, ...query });
  if (!visible) return fail(res, 404, "Property not found.");
  ok(res, (await presentProperties([property], { includeAgentDetails: Boolean(req.user) }))[0]);
};

/**
 * POST /api/properties/:id/view -> { counted, views }
 * Called by the property details page (never by cards or search). The browser only names the listing:
 * who is viewing comes from verified session cookies or a server-side hash, and the total from the
 * database. Each viewer counts once per listing per window (utils/propertyViews.js). HomeBase admins,
 * anyone in the organisation that owns the listing, and crawlers never add views. Sold and rented
 * listings stay public, so they still count; drafts, hidden and removed listings do not.
 */
export const recordView = async (req, res) => {
  const property = mongoose.isValidObjectId(req.params.id) ? await Property.findById(req.params.id).select("status ownerType owner views") : null;
  if (!property) return fail(res, 404, "Property not found.");
  const result = (counted, views = property.views || 0) => ok(res, { counted, views });
  const { customer, agent, admin } = req.viewerSessions || {};
  const ownTeam = Boolean(agent) && property.ownerType === "agent" && String(teamOf(agent).ownerId) === String(property.owner);
  if (admin || ownTeam) return result(false);
  if (!await isPubliclyVisible(property)) return fail(res, 404, "Property not found.");
  if (isCrawler(req.get("user-agent"))) return result(false);

  // Tracking problems never break the page: the visit just isn't counted
  try {
    if (!await claimView(property._id, viewerHash(req, customer || agent))) return result(false);
    // Atomic increment; a view is not an edit, so updatedAt stays as it was
    const updated = await Property.findByIdAndUpdate(property._id, { $inc: { views: 1 } }, { returnDocument: "after", projection: { views: 1 }, timestamps: false });
    return result(true, updated?.views ?? (property.views || 0) + 1);
  } catch (error) {
    console.error(`[views] could not record a view for ${property._id}: ${error.message}`);
    return result(false);
  }
};

// GET /api/properties/my (agent)
export const myProperties = async (req, res) => {
  ok(res, await presentProperties(await Property.find(teamFilter(req.user)).sort({ createdAt: -1 })));
};

const limitMessage = (access) =>
  `Property limit reached. Your ${access.plan?.name || "current"} plan allows up to ${access.propertyLimit} active properties. Please upgrade your plan.`;

// Works out the status for an agent save: "draft", or submit -> pending/published
const resolveAgentStatus = (intent, current, access) => {
  if (intent === "draft") return "draft";
  if (current === "published") return "published"; // approved listings stay live when edited
  return access.settings.property.requireApproval ? "pending" : "published";
};

const imageLimitMessage = (access) =>
  `Your ${access.plan?.name || "current"} plan supports up to ${access.imageLimit} photos per property. Upgrade your plan to add more photos.`;

// POST /api/properties (agent with an active subscription)
export const createProperty = async (req, res) => {
  const { access } = req;
  const intent = req.body.status === "draft" ? "draft" : "submit";
  const fields = pickPropertyFields(req.body);
  await prepareHotelFields(fields, req.body, null, access.imageLimit);
  if (fields.listingType === "Sale") fields.pricePeriod = "total";
  const images = Array.isArray(req.body.images) ? req.body.images : [];

  if (!fields.title || fields.title.length < 3) return fail(res, 400, "Give the property a title (at least 3 characters).");
  const optionProblem = checkPropertyOptions(fields, access.settings);
  if (optionProblem) return fail(res, 400, optionProblem);
  if (!withinImageLimit(images, access.imageLimit)) return fail(res, 400, imageLimitMessage(access));
  if (intent === "submit") {
    if (!access.settings.property.allowAgentPublishing) return fail(res, 403, `Publishing is paused by ${siteName()}. You can still save drafts.`);
    if (access.activeCount >= access.propertyLimit) return fail(res, 403, limitMessage(access));
  }

  const contact = { name: `${req.user.firstName} ${req.user.lastName}`, phone: req.user.phone, email: req.user.email };
  const draft = {
    listingType: "Sale",
    propertyType: "Apartment",
    price: 0,
    ...fields,
    contact: { ...contact, id: String(req.user._id) },
    images: await resolveImages(images),
    owner: teamOf(req.user).ownerId, // the signed-in agent, or their agency's owner; never taken from the request
    assignedTo: isTeamMember(req.user) ? req.user._id : null, // staff listings start assigned to them
    ownerType: "agent",
  };
  if (intent === "submit") {
    const problem = validateForPublishing(draft);
    if (problem) return fail(res, 400, problem);
  }
  draft.status = resolveAgentStatus(intent, null, access);

  const property = await Property.create(draft);
  if (property.status === "pending") notifyReview(property, req.user);
  const message = property.status === "pending" ? "Submitted for review" : property.status === "published" ? "Property published" : "Draft saved";
  ok(res, property, message, 201);
};

// Tells the admin team a listing is waiting for review
const notifyReview = (property, agent) =>
  notifyAdmins({ type: "review", title: "Listing submitted for review", message: `${agent.firstName} ${agent.lastName} submitted "${property.title}".`, link: "/admin/properties?status=pending" });

// Loads a property and checks the signed-in agent owns it
const loadOwned = async (req, res) => {
  const property = await Property.findById(req.params.id).catch(() => null);
  if (!property) {
    fail(res, 404, "Property not found.");
    return null;
  }
  if (!isOwner(property, req.user)) {
    fail(res, 403, "You can only manage your own properties.");
    return null;
  }
  return property;
};

// PUT /api/properties/:id (owning agent with an active subscription)
export const updateProperty = async (req, res) => {
  const { access } = req;
  const property = await loadOwned(req, res);
  if (!property) return;

  const fields = pickPropertyFields(req.body);
  await prepareHotelFields(fields, req.body, property, access.imageLimit);
  fields.contact = { id: String(req.user._id), name: `${req.user.firstName} ${req.user.lastName}`, phone: req.user.phone, email: req.user.email };
  if ((fields.listingType ?? property.listingType) === "Sale") fields.pricePeriod = "total";
  const optionProblem = checkPropertyOptions(fields, access.settings, property);
  if (optionProblem) return fail(res, 400, optionProblem);
  const images = req.body.images !== undefined ? req.body.images : null;
  if (images && !Array.isArray(images)) return fail(res, 400, "Images must be a list.");
  if (images && !withinImageLimit(images, access.imageLimit, property.images)) return fail(res, 400, imageLimitMessage(access));

  // Status changes requested by the agent: "draft" (unpublish/withdraw) or submit
  let status = property.status;
  if (req.body.status !== undefined) {
    if (property.status === "suspended") return fail(res, 403, `This listing was hidden by ${siteName()}. Contact support.`);
    const intent = req.body.status === "draft" ? "draft" : "submit";
    status = resolveAgentStatus(intent, property.status, access);
    const willCount = COUNTED_STATES.includes(status) && !COUNTED_STATES.includes(property.status);
    if (willCount) {
      if (!access.settings.property.allowAgentPublishing) return fail(res, 403, `Publishing is paused by ${siteName()}. You can still save drafts.`);
      if (access.activeCount >= access.propertyLimit) return fail(res, 403, limitMessage(access));
    }
  }

  Object.assign(property, fields);
  if (fields.contact) property.contact = { ...fields.contact, id: String(req.user._id) };
  if (images) property.images = await resolveImages(images);
  if (COUNTED_STATES.includes(status)) {
    const problem = validateForPublishing(property);
    if (problem) return fail(res, 400, problem);
  }
  if (status !== property.status) {
    property.status = status;
    if (status === "pending") notifyReview(property, req.user);
    if (status !== "rejected") property.rejectionReason = "";
    if (status !== "published") property.isFeatured = false;
  }
  await saveHotelProperty(property);
  ok(res, property, status === "pending" ? "Submitted for review" : "Property updated");
};

// PATCH /api/properties/:id/feature (owning agent, within the plan's featured allowance)
export const setFeatured = async (req, res) => {
  const { access } = req;
  const property = await loadOwned(req, res);
  if (!property) return;
  const featured = Boolean(req.body.isFeatured);

  if (featured && !property.isFeatured) {
    if (property.status !== "published") return fail(res, 400, "Only published properties can be featured.");
    if (access.featuredLimit === 0) return fail(res, 403, "Featured listings are not available on your current plan. Upgrade your subscription to feature properties.");
    if (access.featuredCount >= access.featuredLimit) return fail(res, 403, `Your ${access.plan.name} plan allows ${access.featuredLimit} featured listings.`);
  }
  property.isFeatured = featured;
  await property.save();
  ok(res, property, featured ? "Property featured" : "Removed from featured");
};

// DELETE /api/properties/:id (owning agent, or any admin)
export const deleteProperty = async (req, res) => {
  const property = await Property.findById(req.params.id).catch(() => null);
  if (!property) return fail(res, 404, "Property not found.");
  // Agency staff agents can unpublish listings; deleting is for the owner and managers
  if (req.user.role !== "admin" && !(req.user.role === "agent" && isOwner(property, req.user) && canSeeAllAgencyWork(req.user))) {
    return fail(res, 403, "You can only delete your own properties.");
  }
  if (isHotel(property) && (property.roomTypes.length || await Rental.exists({ property: property._id }))) return fail(res, 409, "Archive this hotel by saving it as a draft. Its room types and booking history must be preserved.");
  await property.deleteOne();
  await Promise.all([
    User.updateMany({ savedProperties: property._id }, { $pull: { savedProperties: property._id } }),
    Review.deleteMany({ property: property._id }),
  ]);
  ok(res, null, "Property deleted");
};

// PATCH /api/properties/:id/assign { memberId } (agency owner or manager): give a listing to a team member.
// Its leads (inquiries, chats, offers, rentals, sale requests) follow it. null hands it back to the owner.
export const assignProperty = async (req, res) => {
  if (!canSeeAllAgencyWork(req.user) || !req.access.isOrganization) return fail(res, 403, "Only the owner or a manager can assign listings.");
  const property = mongoose.isValidObjectId(req.params.id) ? await Property.findOne({ _id: req.params.id, owner: req.access.ownerId, ownerType: "agent" }) : null;
  if (!property) return fail(res, 404, "Property not found.");
  const assignee = await agencyAssignee(req.access.ownerId, req.body.memberId);
  if (assignee === undefined) return fail(res, 400, "Choose a member of your agency.");
  property.assignedTo = assignee;
  await property.save();
  const scope = { property: property._id, owner: req.access.ownerId };
  await Promise.all([
    Inquiry.updateMany({ property: property._id, agent: req.access.ownerId }, { $set: { assignedTo: assignee } }),
    Conversation.updateMany(scope, { $set: { assignedTo: assignee } }),
    Offer.updateMany(scope, { $set: { assignedTo: assignee } }),
    Rental.updateMany(scope, { $set: { assignedTo: assignee } }),
    SaleRequest.updateMany(scope, { $set: { assignedTo: assignee } }),
  ]);
  ok(res, (await presentProperties([property]))[0], assignee ? "Listing assigned" : "Listing returned to the agency owner");
};
