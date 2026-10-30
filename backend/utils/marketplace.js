import User from "../models/User.js";
import { getSettings } from "../models/Setting.js";
import { chatEnabledAgents, subscriptionState } from "./permissions.js";
import { isOrganization } from "./accountTypes.js";

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

export const visibleAgentIds = async () => {
  const [settings, agents] = await Promise.all([
    getSettings(),
    User.find(LISTED_AGENT).select("subscription").populate({
      path: "subscription",
      select: "status paymentStatus expiresAt plan",
      populate: { path: "plan", select: "priorityVisibility" },
    }),
  ]);
  return agents.filter((agent) => inGoodStanding(settings, agent))
    .map((agent) => ({ id: agent._id, priority: Boolean(agent.subscription?.plan?.priorityVisibility) }));
};

// The publicQuery() rule for a single listing, without loading the whole agent directory
export const isPubliclyVisible = async (property) => {
  if (property.status !== "published") return false;
  if (property.ownerType === "admin") return true;
  const [settings, owner] = await Promise.all([getSettings(), User.findOne({ _id: property.owner, ...LISTED_AGENT }).select("subscription").populate("subscription")]);
  return Boolean(owner) && inGoodStanding(settings, owner);
};

export const publicQuery = async () => {
  const agents = await visibleAgentIds();
  return { agents, query: { status: "published", $or: [{ ownerType: "admin" }, { ownerType: "agent", owner: { $in: agents.map((agent) => agent.id) } }] } };
};

// A single batch lookup supplies live profile data for every card, including aggregated results.
export const presentProperties = async (properties, { includeAgentDetails = true } = {}) => {
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
