import { useMemo } from "react";
import { useAuth } from "../context/useAuth";
import { usePlatform } from "../context/usePlatform";
import { useRealEstate } from "../context/useRealEstate";
import { getSubscriptionState } from "../utils/subscription";
import { COUNTED_STATES } from "../utils/permissions";

const DAY = 86400000;
const inWindow = (date, fromDays, toDays) => {
  const age = (Date.now() - new Date(date).getTime()) / DAY;
  return age >= fromDays && age < toDays;
};

// Percentage change between the last 30 days and the 30 days before
export const trend = (items, getDate = (i) => i.createdAt, getValue = () => 1) => {
  const sum = (from, to) => items.filter((i) => inWindow(getDate(i), from, to)).reduce((s, i) => s + getValue(i), 0);
  const current = sum(0, 30);
  const previous = sum(30, 60);
  if (previous === 0) return current > 0 ? { value: current, change: null, isNew: true } : { value: 0, change: 0 };
  return { value: current, change: Math.round(((current - previous) / previous) * 100) };
};

// Platform-wide view for the admin: every user, agent, listing, inquiry and payment
export const useAdminData = () => {
  const auth = useAuth();
  const platform = usePlatform();
  const realEstate = useRealEstate();

  return useMemo(() => {
    const { users } = auth;
    const { listings, inquiries, isPubliclyVisible } = realEstate;

    const agents = users
      .filter((u) => u.role === "agent")
      .map((u) => {
        const properties = listings.filter((p) => p.owner.type === "agent" && p.owner.id === u.id);
        return {
          ...u,
          sub: getSubscriptionState(u.subscription),
          plan: platform.getPlan(u.subscription?.planId),
          properties,
          activeCount: properties.filter((p) => COUNTED_STATES.includes(p.listing.state)).length,
          inquiries: inquiries.filter((i) => i.ownerType === "agent" && i.ownerId === u.id),
        };
      });

    const ownerOf = (property) =>
      property.owner.type === "admin"
        ? { name: "HomeBase", type: "Admin" }
        : { name: users.find((u) => u.id === property.owner.id)?.name || "Deleted agent", type: "Agent", id: property.owner.id };

    const userInquiries = (u) => inquiries.filter((i) => i.userId === u.id || i.email.toLowerCase() === u.email.toLowerCase());

    return {
      ...auth,
      ...platform,
      ...realEstate,
      agents,
      ownerOf,
      userInquiries,
      savedCount: (u) => u.savedCount || 0,
      pendingListings: listings.filter((p) => p.listing.state === "pending"),
      newInquiries: inquiries.filter((i) => i.status === "New"),
      isPubliclyVisible,
    };
  }, [auth, platform, realEstate]);
};
