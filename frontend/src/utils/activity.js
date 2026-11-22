import { BadgeCheck, Building, Building2, CreditCard, HandCoins, Home, Inbox, KeyRound, UserPlus, Wallet, XCircle } from "lucide-react";
import { adminPath } from "./adminEntry";
import { formatGhs } from "./property.js";

// Events from a rental's status history (the request itself is added separately)
const RENTAL_EVENTS = {
  paid: { title: "Rental payment received", icon: CreditCard, tone: "green", status: "Paid" },
  confirmed: { title: "Rental confirmed", icon: BadgeCheck, tone: "brand", status: "Confirmed" },
  active: { title: "Property rented", icon: Home, tone: "green", status: "Active" },
  completed: { title: "Rental completed", icon: BadgeCheck, tone: "gray", status: "Completed" },
  cancelled: { title: "Rental cancelled", icon: XCircle, tone: "red", status: "Cancelled" },
};

const SALE_EVENTS = {
  paid_at_office: { title: "Payment confirmed by the owner", icon: Wallet, tone: "green", status: "Payment Received" },
  completed: { title: "Property sold", icon: BadgeCheck, tone: "green", status: "Completed" },
  rejected: { title: "Purchase request rejected", icon: XCircle, tone: "red", status: "Rejected" },
  cancelled: { title: "Purchase request cancelled", icon: XCircle, tone: "gray", status: "Cancelled" },
};

/**
 * Builds a recent-activity timeline from data the dashboard already has.
 * Every entry is a real event with its own timestamp; nothing is estimated.
 * base: "/agent", or "admin" for the admin console (where the links go)
 */
export const buildActivity = ({ base, listings = [], agents = [], offers = [], rentals = [], sales = [], inquiries = [], findProperty = () => null, limit = 12 }) => {
  const items = [];

  listings.forEach((p) =>
    items.push({
      id: `listing-${p.id}`,
      icon: Building2,
      tone: "brand",
      title: "New property added",
      subject: p.title,
      detail: [p.location.name, p.location.city].filter(Boolean).join(", "),
      at: p.listing.createdAt,
      status: { pending: "Pending Review", published: "Published", draft: "Draft", rejected: "Rejected", suspended: "Hidden" }[p.listing.state],
      to: base !== "/agent" ? adminPath(`/properties?open=${p.id}`) : `/agent/properties/${p.id}`,
    })
  );

  agents.forEach((a) =>
    items.push({ id: `agent-${a.id}`, icon: UserPlus, tone: "sky", title: "New agent registered", subject: a.name, detail: a.email, at: a.createdAt, to: adminPath(`/agents?open=${a.id}`) })
  );

  offers.forEach((o) => {
    items.push({
      id: `offer-${o.id}`,
      icon: HandCoins,
      tone: "amber",
      title: "New offer received",
      subject: o.property.title,
      detail: `${o.customer.name} · ${formatGhs(o.amount)}`,
      at: o.createdAt,
      status: o.status === "Pending" ? "Pending" : undefined,
      to: `${base}/offers`,
    });
    if (o.respondedAt && ["Accepted", "Rejected", "Countered"].includes(o.status)) {
      items.push({
        id: `offer-reply-${o.id}`,
        icon: HandCoins,
        tone: o.status === "Accepted" ? "green" : o.status === "Rejected" ? "red" : "sky",
        title: `Offer ${o.status.toLowerCase()}`,
        subject: o.property.title,
        detail: `${o.customer.name} · ${formatGhs(o.counterAmount && o.status === "Countered" ? o.counterAmount : o.amount)}`,
        at: o.respondedAt,
        status: o.status,
        to: `${base}/offers`,
      });
    }
  });

  rentals.forEach((r) => {
    items.push({ id: `rental-${r.id}`, icon: KeyRound, tone: "brand", title: "Rental request submitted", subject: r.property.title, detail: r.contactName, at: r.createdAt, to: `${base}/rentals` });
    r.history.forEach((h, i) => {
      const event = RENTAL_EVENTS[h.status];
      if (event) items.push({ id: `rental-${r.id}-${i}`, ...event, subject: r.property.title, detail: `${r.contactName} · ${formatGhs(r.amount)}`, at: h.at, to: `${base}/rentals` });
    });
  });

  sales.forEach((s) => {
    items.push({ id: `sale-${s.id}`, icon: Building, tone: "amber", title: "Purchase request submitted", subject: s.property.title, detail: s.contactName, at: s.createdAt, to: `${base}/sale-requests` });
    s.history.forEach((h, i) => {
      const event = SALE_EVENTS[h.status];
      // Status changes are recorded more than once in a request's history; show each kind once
      if (event && s.history.findIndex((x) => x.status === h.status) === i) {
        items.push({ id: `sale-${s.id}-${i}`, ...event, subject: s.property.title, detail: s.contactName, at: h.at, to: `${base}/sale-requests` });
      }
    });
  });

  inquiries.forEach((inq) =>
    items.push({
      id: `inquiry-${inq.id}`,
      icon: Inbox,
      tone: "sky",
      title: "New inquiry",
      subject: findProperty(inq.propertyId)?.title || "Removed property",
      detail: inq.name,
      at: inq.createdAt,
      status: inq.status === "New" ? "New" : undefined,
      to: `${base}/inquiries?open=${inq.id}`,
    })
  );

  return items
    .filter((i) => i.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, limit);
};
