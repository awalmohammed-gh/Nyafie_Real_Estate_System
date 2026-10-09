import { getSubscriptionState } from "./subscription";

// Listing states that occupy a slot in the agent's plan limit
export const COUNTED_STATES = ["published", "pending"];

/**
 * The single source of truth for what an agent may do.
 * Combines: role + account status + subscription lifecycle + the live plan
 * configuration + platform settings + current usage.
 * Components ask this object instead of checking roles or plans themselves.
 * (A real backend must enforce the same rules server-side.)
 */
export const getAgentPermissions = ({ user, plans, settings, listings }) => {
  const isAgent = user?.role === "agent";
  const isSuspended = user?.status === "suspended";
  // Agency staff work under the agency owner's plan; their role decides what they handle
  const team = isAgent ? user.agency : null;
  const teamRole = team ? team.role : "owner";
  const accountSubscription = team ? team.subscription : user?.subscription;
  const subscription = getSubscriptionState(accountSubscription);

  // When the admin turns off "Require subscription", agents fall back to the default plan
  const subscriptionWaived = isAgent && !settings.agent.requireSubscription && !subscription.isActive;
  const planId = subscriptionWaived ? settings.agent.defaultPlan : accountSubscription?.planId;
  const plan = plans.find((p) => p.id === planId) || (subscriptionWaived ? [...plans].filter((p) => p.active).sort((a, b) => a.price - b.price)[0] : null) || null;
  const isApproved = user?.agentApplication?.status === "approved";
  // Staff hold their organisation's type (agency or company), set when they join
  const accountType = ["agency", "company"].includes(user?.agentApplication?.agentType) ? user.agentApplication.agentType : "individual";
  const isOrganization = accountType !== "individual";
  const isActive = isAgent && isApproved && !isSuspended && Boolean(plan) && (subscription.isActive || subscriptionWaived);

  const mine = listings.filter((p) => p.owner?.type === "agent" && p.owner.id === (team ? team.ownerId : user?.id));
  const activeCount = mine.filter((p) => COUNTED_STATES.includes(p.listing.state)).length;
  const featuredCount = mine.filter((p) => p.meta?.isFeatured && p.listing.state === "published").length;

  const propertyLimit = plan?.propertyLimit ?? 0;
  const imageLimit = Math.min(plan?.imageLimit ?? 0, settings.property.maxImages);
  const featuredLimit = plan?.featuredLimit ?? 0;
  const analytics = plan?.analytics ?? "basic";
  // The upgrade ladder: active plans of the same account type on a higher tier (the server decides; this is for display)
  const upgradePlans = !team && subscription.isActive && plan ? plans.filter((p) => p.active && p.accountType === plan.accountType && p.sortOrder > plan.sortOrder) : [];
  const limitReached = activeCount >= propertyLimit;
  const nearLimit = !limitReached && propertyLimit > 0 && activeCount / propertyLimit >= 0.8;

  // Why the agent area is restricted, if it is
  const restriction = !isAgent
    ? "not-agent"
    : isSuspended
      ? "suspended"
      : !isActive
        ? subscription.status // expired | cancelled | pending | none
        : null;

  return {
    siteName: settings.general.siteName, // for messages such as "Contact HomeBase support"
    isAgent,
    isSuspended,
    isActive,
    accountType,
    isAgency: accountType === "agency",
    isOrganization, // agency or company: a team and one shared subscription
    teamRole, // owner | manager | agent
    isTeamMember: Boolean(team),
    agencyName: team ? team.name : user?.agentApplication?.companyName || "",
    teamMemberLimit: isOrganization ? plan?.teamMemberLimit ?? 0 : 0,
    canViewTeam: isOrganization && teamRole !== "agent",
    canManageTeam: isOrganization && teamRole === "owner",
    canAssignWork: isActive && isOrganization && teamRole !== "agent",
    canManageSubscription: !team,
    canUpgrade: upgradePlans.length > 0, // only the account owner, on an active plan with a higher tier available
    isHighestPlan: !team && subscription.isActive && Boolean(plan) && upgradePlans.length === 0,
    upgradePath: upgradePlans.length > 0 ? "/agent/subscription/upgrade" : "/agent/subscription",
    restriction,
    subscription,
    plan,
    requiresApproval: settings.property.requireApproval,
    agentPublishingAllowed: settings.property.allowAgentPublishing,

    // Limits & usage
    propertyLimit,
    imageLimit,
    featuredLimit,
    activeCount,
    featuredCount,
    remainingListings: Math.max(propertyLimit - activeCount, 0),
    limitReached,
    nearLimit,

    // Actions
    canCreateDraft: isActive,
    canAddProperty: isActive && settings.property.allowAgentPublishing && !limitReached,
    canEditProperty: isActive,
    canDeleteProperty: isAgent && isApproved && !isSuspended && teamRole !== "agent", // staff agents unpublish instead
    canFeatureProperty: isActive && featuredLimit > 0 && featuredCount < featuredLimit,
    canUseFeatured: isActive && featuredLimit > 0,
    canViewInquiries: isAgent && isApproved && !isSuspended,
    canManageInquiries: isActive && plan?.inquiryManagement === "full",
    canUseChat: isActive && plan?.internalChat === true, // inquiries, phone, email and WhatsApp work on every plan
    canViewAnalytics: isActive,
    canViewInquiryStats: isActive && (analytics === "standard" || analytics === "advanced"),
    canViewPerformance: isActive && (analytics === "standard" || analytics === "advanced"),
    canViewAdvancedAnalytics: isActive && analytics === "advanced",
    analyticsLevel: analytics,
  };
};

// Consistent copy for locked states, so every screen explains restrictions the same way
export const lockCopy = (perms, feature) => {
  const planName = perms.plan?.name || "current";
  if (perms.restriction === "suspended") {
    return { title: "Your agent account is suspended", description: `Contact ${perms.siteName} support to restore access to your listings and inquiries.`, cta: null };
  }
  if (perms.restriction && perms.restriction !== "not-agent") {
    const reason = { expired: "has expired", cancelled: "was cancelled", pending: "is waiting for payment confirmation", none: "is not active" }[perms.restriction];
    return { title: "Subscription required", description: `Your subscription ${reason}. Renew to use this feature again. Your data is safe.`, cta: "Renew Subscription" };
  }
  switch (feature) {
    case "propertyLimit":
      return { title: "Property limit reached", description: `Your ${planName} plan allows up to ${perms.propertyLimit} active properties. Upgrade your plan to add more properties.`, cta: "Upgrade Plan" };
    case "featured":
      return perms.featuredLimit === 0
        ? { title: "Featured listings", description: "Featured listings are not available on your current plan. Upgrade your subscription to feature properties.", cta: "Upgrade Plan" }
        : { title: "Featured limit reached", description: `Your ${planName} plan allows ${perms.featuredLimit} featured listings. Unfeature one or upgrade to feature more.`, cta: "Upgrade Plan" };
    case "images":
      return { title: "Photo limit reached", description: `Your ${planName} plan supports up to ${perms.imageLimit} photos per property. Upgrade your plan to add more property photos.`, cta: "View Upgrade Options" };
    case "chat":
      return { title: "Customer Chat", description: "Upgrade your subscription to communicate with customers directly through HomeBase messaging. Customers can still send you inquiries, call, email or WhatsApp you.", cta: "Upgrade Plan" };
    case "inquiries":
      return { title: "Full inquiry management", description: "Tracking inquiry status is available on plans with full inquiry management.", cta: "Upgrade Plan" };
    case "inquiryStats":
      return { title: "Inquiry statistics", description: "See how your leads progress from new to closed on plans with standard or advanced analytics.", cta: "Upgrade Plan" };
    case "performance":
      return { title: "Property performance", description: "Inquiry statistics and property performance are available on plans with standard or advanced analytics.", cta: "Upgrade Plan" };
    case "advanced":
      return { title: "Advanced Analytics", description: "Listing performance trends are available on plans with advanced analytics.", cta: "Upgrade Plan" };
    case "publishing":
      return { title: "Publishing paused", description: `${perms.siteName} has temporarily paused new agent listings. You can still save drafts.`, cta: null };
    default:
      return { title: "Not available", description: "This feature isn't available on your current plan.", cta: "Upgrade Plan" };
  }
};

// Same rule as the server: a gallery over the plan's photo limit (kept after a downgrade) may be
// reordered or trimmed, but can't take new photos or grow. images: uploader items or URLs.
export const withinImageLimit = (images, limit, existing = []) => {
  if (images.length <= limit) return true;
  const kept = new Set(existing || []);
  return images.length <= (existing || []).length && images.every((img) => kept.has(typeof img === "string" ? img : img.src));
};
