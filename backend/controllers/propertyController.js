import Property from "../models/Property.js";
import User from "../models/User.js";
import { getSettings } from "../models/Setting.js";
import { COUNTED_STATES, subscriptionState } from "../utils/permissions.js";
import { resolveImages } from "../utils/uploadImages.js";
import { ok, fail } from "../utils/response.js";

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
    };
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

// Checks required fields before a listing is submitted/published
export const validateForPublishing = (p) => {
  if (!p.title || p.title.length < 3) return "Give the property a title (at least 3 characters).";
  if (!p.description || p.description.length < 30) return "Describe the property in at least 30 characters.";
  if (!p.propertyType) return "Choose a property type.";
  if (!(p.price > 0)) return "Enter a price greater than 0.";
  if (!p.location?.neighbourhood || !p.location?.city || !p.location?.address) return "Complete the property location.";
  if (!(p.area > 0)) return "Enter the floor area.";
  if (!p.images?.length) return "Add at least one photo before publishing.";
  if (!p.contact?.phone || !/^\S+@\S+\.\S+$/.test(p.contact?.email || "")) return "Add a contact phone number and email.";
  return null;
};

// Agents whose listings may be public: active account + active subscription
const visibleAgentIds = async () => {
  const settings = await getSettings();
  const agents = await User.find({ role: "agent", isActive: true }).populate({ path: "subscription", populate: { path: "plan" } });
  return agents
    .filter((a) => !settings.agent.requireSubscription || subscriptionState(a.subscription).isActive)
    .map((a) => ({ id: a._id, priority: Boolean(a.subscription?.plan?.priorityVisibility) }));
};

const publicQuery = async () => {
  const agents = await visibleAgentIds();
  return {
    agents,
    query: { status: "published", $or: [{ ownerType: "admin" }, { owner: { $in: agents.map((a) => a.id) } }] },
  };
};

// GET /api/properties (public)
export const listPublicProperties = async (_req, res) => {
  const { agents, query } = await publicQuery();
  const properties = await Property.find(query).sort({ createdAt: -1 });
  const priority = new Set(agents.filter((a) => a.priority).map((a) => String(a.id)));
  // Company listings first, then agents with priority visibility, then everyone else
  const rank = (p) => (p.ownerType === "admin" ? 0 : priority.has(String(p.owner)) ? 1 : 2);
  ok(res, properties.sort((a, b) => rank(a) - rank(b)));
};

const isOwner = (property, user) => user && String(property.owner) === String(user._id);

// GET /api/properties/:id (public when visible; owners and admins can always see it)
export const getProperty = async (req, res) => {
  const property = await Property.findById(req.params.id).catch(() => null);
  if (!property) return fail(res, 404, "Property not found.");
  if (req.user?.role === "admin" || isOwner(property, req.user)) return ok(res, property);
  const { query } = await publicQuery();
  const visible = await Property.exists({ _id: property._id, ...query });
  if (!visible) return fail(res, 404, "Property not found.");
  ok(res, property);
};

// POST /api/properties/:id/view
export const recordView = async (req, res) => {
  const property = await Property.findById(req.params.id).catch(() => null);
  if (!property || property.ownerType !== "agent" || isOwner(property, req.user)) return ok(res, null);
  await Property.updateOne({ _id: property._id, status: "published" }, { $inc: { views: 1 } });
  ok(res, null);
};

// GET /api/properties/my (agent)
export const myProperties = async (req, res) => {
  ok(res, await Property.find({ owner: req.user._id }).sort({ createdAt: -1 }));
};

const limitMessage = (access) =>
  `Property limit reached. Your ${access.plan?.name || "current"} plan allows up to ${access.propertyLimit} active properties. Please upgrade your plan.`;

// Works out the status for an agent save: "draft", or submit -> pending/published
const resolveAgentStatus = (intent, current, access) => {
  if (intent === "draft") return "draft";
  if (current === "published") return "published"; // approved listings stay live when edited
  return access.settings.property.requireApproval ? "pending" : "published";
};

// POST /api/properties (agent with an active subscription)
export const createProperty = async (req, res) => {
  const { access } = req;
  const intent = req.body.status === "draft" ? "draft" : "submit";
  const fields = pickPropertyFields(req.body);
  const images = Array.isArray(req.body.images) ? req.body.images : [];

  if (!fields.title || fields.title.length < 3) return fail(res, 400, "Give the property a title (at least 3 characters).");
  if (images.length > access.imageLimit) {
    return fail(res, 400, `Your ${access.plan.name} plan allows up to ${access.imageLimit} photos per property.`);
  }
  if (intent === "submit") {
    if (!access.settings.property.allowAgentPublishing) return fail(res, 403, "Publishing is paused by HomeBase. You can still save drafts.");
    if (access.activeCount >= access.propertyLimit) return fail(res, 403, limitMessage(access));
  }

  const contact = { name: `${req.user.firstName} ${req.user.lastName}`, phone: req.user.phone, email: req.user.email, ...fields.contact };
  const draft = {
    listingType: "Sale",
    propertyType: "Apartment",
    price: 0,
    ...fields,
    contact: { ...contact, id: String(req.user._id) },
    images: await resolveImages(images),
    owner: req.user._id, // always the signed-in agent, never taken from the request
    ownerType: "agent",
  };
  if (intent === "submit") {
    const problem = validateForPublishing(draft);
    if (problem) return fail(res, 400, problem);
  }
  draft.status = resolveAgentStatus(intent, null, access);

  const property = await Property.create(draft);
  const message = property.status === "pending" ? "Submitted for review" : property.status === "published" ? "Property published" : "Draft saved";
  ok(res, property, message, 201);
};

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
  const images = req.body.images !== undefined ? req.body.images : null;
  if (images && images.length > access.imageLimit) {
    return fail(res, 400, `Your ${access.plan.name} plan allows up to ${access.imageLimit} photos per property.`);
  }

  // Status changes requested by the agent: "draft" (unpublish/withdraw) or submit
  let status = property.status;
  if (req.body.status !== undefined) {
    if (property.status === "suspended") return fail(res, 403, "This listing was hidden by HomeBase. Contact support.");
    const intent = req.body.status === "draft" ? "draft" : "submit";
    status = resolveAgentStatus(intent, property.status, access);
    const willCount = COUNTED_STATES.includes(status) && !COUNTED_STATES.includes(property.status);
    if (willCount) {
      if (!access.settings.property.allowAgentPublishing) return fail(res, 403, "Publishing is paused by HomeBase. You can still save drafts.");
      if (access.activeCount >= access.propertyLimit) return fail(res, 403, limitMessage(access));
    }
  }

  Object.assign(property, fields);
  if (fields.contact) property.contact = { ...fields.contact, id: String(req.user._id) };
  if (images) property.images = await resolveImages(images);
  if (status !== property.status) {
    if (COUNTED_STATES.includes(status)) {
      const problem = validateForPublishing(property);
      if (problem) return fail(res, 400, problem);
    }
    property.status = status;
    if (status !== "rejected") property.rejectionReason = "";
    if (status !== "published") property.isFeatured = false;
  }
  await property.save();
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
  if (req.user.role !== "admin" && !(req.user.role === "agent" && isOwner(property, req.user))) {
    return fail(res, 403, "You can only delete your own properties.");
  }
  await property.deleteOne();
  await User.updateMany({ savedProperties: property._id }, { $pull: { savedProperties: property._id } });
  ok(res, null, "Property deleted");
};
