import { lastMonths, monthlySeries } from "./reports.js";
import { getSubscriptionState } from "./subscription.js";

export const sumReportValues = (data, key) => data.reduce((sum, row) => sum + (row.values[key] || 0), 0);

// Both the reports page and its PDF use these same buckets and definitions.
export const buildAdminReport = ({ users = [], listings = [], inquiries = [], payments = [] }, now = new Date()) => {
  const customers = users.filter((user) => user.role === "user");
  const agents = users.filter((user) => user.role === "agent");
  const paid = payments.filter((payment) => payment.status === "paid");
  const agentListings = listings.filter((property) => property.owner?.type === "agent");
  const reviewed = agentListings.filter((property) => ["published", "rejected", "suspended"].includes(property.listing?.state));
  const monthly = (series) => monthlySeries(series, 6, now);
  const sections = [
    { key: "revenue", title: "Subscription revenue", description: "Paid agent subscriptions per month", currency: true, wide: true, totalKey: "revenue", series: [{ key: "revenue", label: "Revenue" }], data: monthly({ revenue: { items: paid, date: (payment) => payment.createdAt, value: (payment) => payment.amount } }) },
    { key: "users", title: "User registrations", description: "New customer accounts", totalKey: "users", series: [{ key: "users", label: "Users" }], data: monthly({ users: { items: customers, date: (user) => user.createdAt } }) },
    { key: "agents", title: "Agent registrations", description: "Accounts that became agents", totalKey: "agents", series: [{ key: "agents", label: "Agents" }], data: monthly({ agents: { items: agents, date: (agent) => agent.createdAt } }) },
    { key: "listings", title: "Property listings", description: "New listings created (admin and agents)", totalKey: "listings", series: [{ key: "listings", label: "Listings" }], data: monthly({ listings: { items: listings, date: (property) => property.listing?.createdAt } }) },
    { key: "approvals", title: "Property approvals", description: "Agent submissions vs approvals", series: [{ key: "submitted", label: "Submitted" }, { key: "approved", label: "Approved" }], data: monthly({ submitted: { items: agentListings.filter((property) => property.listing?.state !== "draft"), date: (property) => property.listing?.createdAt }, approved: { items: reviewed.filter((property) => property.listing?.state !== "rejected"), date: (property) => property.listing?.reviewedAt || property.listing?.createdAt } }) },
    { key: "subscriptions", title: "Subscription growth", description: "New and renewed subscriptions per month", totalKey: "subscriptions", series: [{ key: "subscriptions", label: "Subscriptions" }], data: monthly({ subscriptions: { items: paid, date: (payment) => payment.createdAt } }) },
    { key: "inquiries", title: "Inquiries", description: "Customer inquiries received", totalKey: "inquiries", series: [{ key: "inquiries", label: "Inquiries" }], data: monthly({ inquiries: { items: inquiries, date: (inquiry) => inquiry.createdAt } }) },
  ].map((section) => ({ ...section, total: section.totalKey ? sumReportValues(section.data, section.totalKey) : null }));

  const states = agents.map((agent) => getSubscriptionState(agent.subscription));
  const statuses = [
    { label: "Active", value: states.filter((state) => state.isActive).length, className: "bg-emerald-500", color: "#10b981" },
    { label: "Expired", value: states.filter((state) => state.isExpired).length, className: "bg-red-500", color: "#ef4444" },
    { label: "Cancelled", value: states.filter((state) => state.status === "cancelled").length, className: "bg-slate-400", color: "#94a3b8" },
    { label: "Pending", value: states.filter((state) => state.status === "pending").length, className: "bg-amber-400", color: "#fbbf24" },
  ];
  const months = lastMonths(6, now).map((month) => ({ ...month, fullLabel: month.start.toLocaleDateString("en-GB", { month: "short", year: "numeric" }) }));
  return { generatedAt: now, period: { from: months[0].start, to: now }, months, sections, statuses, agentsWithoutSubscription: states.filter((state) => !state.hasSubscription).length };
};
