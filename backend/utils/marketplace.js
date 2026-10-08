import User from "../models/User.js";
import { getSettings } from "../models/Setting.js";
import { subscriptionState } from "./permissions.js";

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

export const visibleAgentIds = async () => {
  const settings = await getSettings();
  const agents = await User.find({ role: "agent", isActive: true, "agentApplication.status": "approved" }).populate({ path: "subscription", populate: { path: "plan" } });
  return agents.filter((agent) => !settings.agent.requireSubscription || subscriptionState(agent.subscription).isActive)
    .map((agent) => ({ id: agent._id, priority: Boolean(agent.subscription?.plan?.priorityVisibility) }));
};

export const publicQuery = async () => {
  const agents = await visibleAgentIds();
  return { agents, query: { status: "published", $or: [{ ownerType: "admin" }, { ownerType: "agent", owner: { $in: agents.map((agent) => agent.id) } }] } };
};

// A single batch lookup supplies live profile data for every card, including aggregated results.
export const presentProperties = async (properties) => {
  const ids = [...new Set(properties.filter((property) => property.ownerType === "agent").map((property) => String(property.owner)))];
  const users = ids.length ? await User.find({ _id: { $in: ids } }).select(PUBLIC_AGENT_FIELDS) : [];
  const agents = new Map(users.map((user) => [String(user._id), publicAgent(user)]));
  return properties.map((property) => {
    const data = property.toJSON();
    if (property.ownerType === "agent") {
      data.agent = agents.get(String(property.owner)) || { id: String(property.owner), name: "Agent", verified: false };
      data.contact = { id: data.agent.id, name: data.agent.name, phone: data.agent.phone || "", email: data.agent.email || "" };
    }
    return data;
  });
};
