import mongoose from "mongoose";
import User from "../models/User.js";
import Subscription from "../models/Subscription.js";
import Plan from "../models/Plan.js";
import { getSettings } from "../models/Setting.js";
import { chatEnabledAgents, subscriptionState } from "./permissions.js";
import { isOrganization } from "./accountTypes.js";
import { memo } from "./memo.js";

// Deliberately exclude application documents, approval actors, billing and account preferences.
export const PUBLIC_AGENT_FIELDS = "firstName lastName phone email profileImage createdAt isActive agentApplication.status agentApplication.agentType agentApplication.companyName agentApplication.bio agentApplication.region agentApplication.city agentApplication.yearsExperience agentApplication.agencyLogo agentApplication.whatsapp";

export const publicAgent = (user) => ({
  id: String(user._id),
  name: `${user.firstName} ${user.lastName}`.trim(),
  phone: user.phone || "",
  whatsapp: user.agentApplication?.whatsapp || user.phone || "",
  email: user.email || "",
  profileImage: user.profileImage || "",
  joinedAt: user.createdAt,
  verified: user.isActive === true && user.agentApplication?.status === "approved",
  agentType: user.agentApplication?.agentType,
  companyName: user.agentApplication?.companyName || "",
  bio: user.agentApplication?.bio || "",
  region: user.agentApplication?.region || "",
  city: user.agentApplication?.city || "",
  yearsExperience: user.agentApplication?.yearsExperience,
  agencyLogo: user.agentApplication?.agencyLogo || "",
});

// Agency staff work under the agency's account, so only owners and independent agents are listed
const LISTED_AGENT = { role: "agent", isActive: true, "agentApplication.status": "approved", agency: { $exists: false } };
const inGoodStanding = (settings, agent) => !settings.agent.requireSubscription || subscriptionState(agent.subscription).isActive;

/**
 * Listed agents matching `match`, each with { _id, subscription: { status, paymentStatus, expiresAt },
 * priority } in ONE database round trip. (find + populate takes three trips in a row: users, then
 * subscriptions, then plans; this runs on every public listing request, so it adds up.)
 */
const listedAgents = (match) => User.aggregate([
  { $match: { ...match, ...LISTED_AGENT } },
  { $project: { subscription: 1 } },
  { $lookup: { from: Subscription.collection.name, localField: "subscription", foreignField: "_id", as: "subscription", pipeline: [{ $project: { status: 1, paymentStatus: 1, expiresAt: 1, plan: 1 } }] } },
  { $set: { subscription: { $first: "$subscription" } } },
  { $lookup: { from: Plan.collection.name, localField: "subscription.plan", foreignField: "_id", as: "plan", pipeline: [{ $project: { priorityVisibility: 1 } }] } },
  { $project: { subscription: 1, priority: { $toBool: { $ifNull: [{ $first: "$plan.priorityVisibility" }, false] } } } },
]);

const loadVisibleAgents = async () => {
  const [settings, agents] = await Promise.all([getSettings(), listedAgents({})]);
  return agents.filter((agent) => inGoodStanding(settings, agent)).map((agent) => ({ id: agent._id, priority: agent.priority }));
};
// Every public listing request needs this list (publicQuery). It is computed once per server instance
// every 30 seconds rather than on every request (utils/memo.js), so traffic doesn't multiply the
// agent lookups. Approving, suspending, removing or restoring an agent, or activating a subscription,
// clears it at once on that instance; other instances follow within 30 seconds. A single listing's
// own page is always checked live (isPubliclyVisible).
const cachedVisibleAgents = memo(loadVisibleAgents, 30 * 1000);
export const visibleAgentIds = async () => (await cachedVisibleAgents()).map((agent) => ({ ...agent }));
export const clearVisibleAgentsCache = () => cachedVisibleAgents.clear();

/**
 * Listings in one place, by its key (models/Property.js location.areaKey / cityKey): every spelling of
 * the place matches, through an index. Listings saved before keys existed have none yet; they match by
 * name (`names`: exact strings or patterns) until `npm run places:backfill` gives them keys.
 * kind: "area" (neighbourhood) | "city"
 */
/**
 * A name pattern for listings without a key yet: the place's words with any spaces, hyphens or
 * punctuation between them, any capitals ("East-Legon" also finds "east legon"). Built from the key,
 * whose words are letters and digits only, so nothing typed can act as a pattern.
 */
export const placePattern = (key) => new RegExp(`^[\\W_]*${String(key).split("-").filter(Boolean).join("[\\W_]+")}[\\W_]*$`, "i");

export const placeFilter = (kind, key, names = []) => {
  const [keyField, nameField] = kind === "city" ? ["location.cityKey", "location.city"] : ["location.areaKey", "location.neighbourhood"];
  return { $or: [{ [keyField]: key }, { [keyField]: { $exists: false }, [nameField]: { $in: names } }] };
};

// The publicQuery() rule for a single listing, without loading the whole agent directory
export const isPubliclyVisible = async (property) => {
  if (property.status !== "published" || property.staleSince) return false; // stale: hidden until the owner confirms it
  if (property.ownerType === "admin") return true;
  // Aggregations aren't cast by the schema: match on a real ObjectId (owner may also be populated)
  const ownerId = String(property.owner?._id ?? property.owner ?? "");
  const owner = /^[a-f\d]{24}$/i.test(ownerId) ? new mongoose.Types.ObjectId(ownerId) : null;
  if (!owner) return false;
  const [settings, [agent]] = await Promise.all([getSettings(), listedAgents({ _id: owner })]);
  return Boolean(agent) && inGoodStanding(settings, agent);
};

/**
 * The WhatsApp number a guest may use for one listing they are viewing: just the number, with no
 * name, email or profile (those still need an account). The staff member assigned to an agency
 * listing, otherwise the listing agent, as for signed-in customers. Null for platform listings.
 */
export const guestWhatsApp = async (property) => {
  if (property.ownerType !== "agent") return null;
  const ids = [property.owner, property.assignedTo].filter(Boolean);
  const users = await User.find({ _id: { $in: ids } }).select("phone agentApplication.whatsapp agency").lean();
  const owner = users.find((user) => String(user._id) === String(property.owner));
  const assignee = property.assignedTo && users.find((user) => String(user._id) === String(property.assignedTo));
  const contact = assignee && String(assignee.agency?.owner) === String(property.owner) ? assignee : owner;
  return contact?.agentApplication?.whatsapp || contact?.phone || null;
};

export const publicQuery = async () => {
  const agents = await visibleAgentIds();
  return { agents, query: { status: "published", staleSince: null, $or: [{ ownerType: "admin" }, { ownerType: "agent", owner: { $in: agents.map((agent) => agent.id) } }] } };
};

// A single batch lookup supplies live profile data for every card, including aggregated results.
export const presentProperties = async (properties, { includeAgentDetails = true, includeRoomNumbers = false } = {}) => {
  // Agency listings name the staff member assigned to them, with the agency's name and logo
  const agentListings = includeAgentDetails ? properties.filter((property) => property.ownerType === "agent") : [];
  const ids = [...new Set(agentListings.flatMap((property) => [property.owner, property.assignedTo]).filter(Boolean).map(String))];
  // role, subscription and agency are read for the chat and team checks only; publicAgent() never exposes them
  const users = ids.length ? await User.find({ _id: { $in: ids } }).select(`${PUBLIC_AGENT_FIELDS} role subscription agency`) : [];
  const byId = new Map(users.map((user) => [String(user._id), user]));
  const chat = await chatEnabledAgents(users.filter((user) => !user.agency?.owner));
  const agentFor = (property) => {
    const owner = byId.get(String(property.owner));
    if (!owner) return null;
    const assignee = property.assignedTo && byId.get(String(property.assignedTo));
    const member = assignee && String(assignee.agency?.owner) === String(owner._id) ? assignee : null;
    const isAgency = isOrganization(owner.agentApplication?.agentType); // agency or company
    return {
      ...publicAgent(member || owner),
      verified: publicAgent(owner).verified, // approval and plan features belong to the agency account
      chat: chat.has(String(owner._id)),
      agency: isAgency ? { id: String(owner._id), name: owner.agentApplication?.companyName || "", logo: owner.agentApplication?.agencyLogo || "" } : null,
    };
  };
  const agents = new Map(agentListings.map((property) => [String(property._id), agentFor(property)]));
  return properties.map((property) => {
    const data = property.toJSON();
    // A hotel's room numbers are for the hotel (approvals) and admins, never public pages
    if (!includeRoomNumbers && Array.isArray(data.roomTypes)) data.roomTypes = data.roomTypes.map(({ roomNumbers: _numbers, ...room }) => room);
    if (property.ownerType === "agent") {
      if (!includeAgentDetails) {
        delete data.agent;
        delete data.contact;
        delete data.owner;
        return data;
      }
      data.agent = agents.get(String(property._id)) || { id: String(property.owner), name: "Agent", verified: false };
      data.contact = { id: data.agent.id, name: data.agent.name, phone: data.agent.phone || "", email: data.agent.email || "" };
    }
    return data;
  });
};
