import { daysUntil } from "./date.js";

export const EXPIRING_SOON_DAYS = 7;

const labels = {
  none: "No subscription",
  active: "Active",
  expiring: "Expiring soon",
  expired: "Expired",
  cancelled: "Cancelled",
  pending: "Pending",
};

// Derives the lifecycle state of a subscription:
// active | expiring | expired | cancelled | pending | none
export const getSubscriptionState = (subscription) => {
  if (!subscription) {
    return { status: "none", statusLabel: labels.none, hasSubscription: false, isActive: false, isExpired: false, expiringSoon: false, daysRemaining: 0 };
  }
  const days = daysUntil(subscription.expiryDate);
  let status;
  if (subscription.status === "cancelled") status = "cancelled";
  else if (subscription.status === "expired") status = "expired";
  else if (subscription.status !== "active" || !["paid", "waived"].includes(subscription.paymentStatus)) status = "pending";
  else if (!Number.isFinite(days) || days <= 0) status = "expired";
  else if (days <= EXPIRING_SOON_DAYS) status = "expiring";
  else status = "active";

  const isActive = status === "active" || status === "expiring";
  return {
    status,
    statusLabel: labels[status],
    hasSubscription: true,
    isActive,
    isExpired: status === "expired",
    expiringSoon: status === "expiring",
    daysRemaining: isActive ? Math.max(days, 0) : 0,
  };
};
