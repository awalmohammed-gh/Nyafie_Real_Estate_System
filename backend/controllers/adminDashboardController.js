import User from "../models/User.js";
import Property from "../models/Property.js";
import Inquiry from "../models/Inquiry.js";
import Subscription from "../models/Subscription.js";
import Offer from "../models/Offer.js";
import Rental from "../models/Rental.js";
import SaleRequest, { CLOSED_SALE_STATUSES } from "../models/SaleRequest.js";
import Payment from "../models/Payment.js";
import Conversation from "../models/Conversation.js";
import Review from "../models/Review.js";
import { subscriptionState } from "../utils/permissions.js";
import { visibleAgentIds } from "./propertyController.js";
import { ok } from "../utils/response.js";
import { providerScope } from "../utils/paystack.js";

const DAY = 24 * 60 * 60 * 1000;
const EXPIRING_SOON_DAYS = 7; // same window as the frontend's subscription state
const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

const monthKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const countBy = (rows) => Object.fromEntries(rows.map((r) => [r._id, r.n]));
const percentChange = (current, previous) =>
  previous > 0
    ? Math.round(((current - previous) / previous) * 1000) / 10
    : null;
// Purchase requests still being worked on (paid-at-office ones only await completion)
const OPEN_SALE_STATUSES = [
  "pending",
  "contacted",
  "offer_received",
  "negotiating",
  "approved",
  "payment_pending",
];

/**
 * Revenue = money actually collected:
 *  - rental payments confirmed paid by Paystack, and sale payments confirmed at the office (Payment, status "paid")
 *  - agent subscription payments confirmed paid by Paystack (Subscription, paymentStatus "paid")
 * Excluded: pending and failed attempts, duplicate charges (to be refunded), "Test payment"
 * records, waived subscriptions, and property asking prices. Dated by when the payment was confirmed.
 */
// Paystack money counts only for the current Paystack mode, so test checkouts never appear as live revenue
const PAID_PAYMENT = () => ({ status: "paid", method: { $ne: "Test payment" }, ...providerScope() });
const PAID_SUBSCRIPTION = () => ({ paymentStatus: "paid", ...providerScope("paymentMethod") });
const paidAt = { $ifNull: ["$paidAt", "$createdAt"] };

const revenueSummary = async (now) => {
  const last30 = new Date(now.getTime() - 30 * DAY);
  const prev30 = new Date(now.getTime() - 60 * DAY);
  const facets = {
    totals: [{ $group: { _id: "$kind", total: { $sum: "$amount" } } }],
    windows: [
      {
        $group: {
          _id: null,
          last30: {
            $sum: { $cond: [{ $gte: ["$at", last30] }, "$amount", 0] },
          },
          prev30: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ["$at", prev30] }, { $lt: ["$at", last30] }] },
                "$amount",
                0,
              ],
            },
          },
        },
      },
    ],
  };
  const [[payments], [subscriptions]] = await Promise.all([
    Payment.aggregate([
      { $match: PAID_PAYMENT() },
      { $project: { kind: 1, amount: 1, at: paidAt } },
      { $facet: facets },
    ]),
    Subscription.aggregate([
      { $match: PAID_SUBSCRIPTION() },
      { $project: { kind: "subscription", amount: 1, at: paidAt } },
      { $facet: facets },
    ]),
  ]);

  const breakdown = { rental: 0, sale: 0, subscription: 0 };
  [...payments.totals, ...subscriptions.totals].forEach(
    (t) => (breakdown[t._id] = (breakdown[t._id] || 0) + t.total),
  );
  const windowOf = (key) =>
    (payments.windows[0]?.[key] || 0) + (subscriptions.windows[0]?.[key] || 0);
  const current = windowOf("last30");
  const previous = windowOf("prev30");

  return {
    total: breakdown.rental + breakdown.sale + breakdown.subscription,
    last30: current,
    previous30: previous,
    change: percentChange(current, previous), // null when there is nothing to compare with
    breakdown,
  };
};

// Agents waiting for an admin decision (profile complete and subscription paid)
// Agents still on NyaFie: providers an admin removed (or deleted) aren't counted anywhere
const CURRENT_AGENTS = {
  role: "agent",
  "agentApplication.status": { $ne: "removed" },
};

const pendingApplicationCount = () =>
  User.countDocuments({
    role: "agent",
    isActive: true,
    "agentApplication.status": "pending",
  });

// GET /api/admin/dashboard -> everything the admin overview shows, in one request
export const dashboard = async (_req, res) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const visibleIds = (await visibleAgentIds()).map((a) => a.id);
  // Published and actually shown to customers (agent listings hide when the agent's plan lapses)
  const visibleMatch = {
    status: "published",
    $or: [{ ownerType: "admin" }, { owner: { $in: visibleIds } }],
  };

  const [
    [inventory],
    agentDocs,
    pendingApplications,
    customers,
    newCustomers,
    pendingOffers,
    rentalsToConfirm,
    saleCounts,
    newInquiries,
    [unread],
    revenue,
    newReviews,
  ] = await Promise.all([
    Property.aggregate([
      {
        $facet: {
          byStatus: [{ $group: { _id: "$status", n: { $sum: 1 } } }],
          byAvailability: [
            { $match: visibleMatch },
            { $group: { _id: "$availability", n: { $sum: 1 } } },
          ],
          added: [
            {
              $group: {
                _id: null,
                thisMonth: {
                  $sum: { $cond: [{ $gte: ["$createdAt", monthStart] }, 1, 0] },
                },
                lastMonth: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $gte: ["$createdAt", lastMonthStart] },
                          { $lt: ["$createdAt", monthStart] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
          ],
          // Real, deduplicated views (see recordView): the marketplace total and the most viewed live listings
          views: [{ $group: { _id: null, total: { $sum: "$views" } } }],
          mostViewed: [
            { $match: { ...visibleMatch, views: { $gt: 0 } } },
            { $sort: { views: -1, createdAt: -1 } },
            { $limit: 5 },
            { $project: { title: 1, views: 1, ownerType: 1, "location.neighbourhood": 1, "location.city": 1, image: { $arrayElemAt: ["$images", 0] } } },
          ],
          // Deals close listings whatever their review state, so these count every listing
          closed: [
            {
              $match: {
                availability: { $in: ["Under Offer", "Rented", "Sold"] },
              },
            },
            { $group: { _id: "$availability", n: { $sum: 1 } } },
          ],
        },
      },
    ]),
    // subscriptionState() needs paymentStatus too: without it every plan reads as unpaid
    User.find(CURRENT_AGENTS)
      .select("isActive subscription")
      .populate("subscription", "status paymentStatus expiresAt")
      .lean(),
    pendingApplicationCount(),
    User.countDocuments({ role: "user" }),
    User.countDocuments({
      role: "user",
      createdAt: { $gte: new Date(now.getTime() - 30 * DAY) },
    }),
    Offer.countDocuments({ status: "pending" }),
    Rental.countDocuments({ status: "paid" }), // paid online, waiting for the owner to confirm
    SaleRequest.aggregate([
      { $match: { status: { $nin: CLOSED_SALE_STATUSES } } },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ]),
    Inquiry.countDocuments({ status: "new" }),
    Conversation.aggregate([
      { $match: { ownerType: "admin", status: "open" } },
      { $group: { _id: null, n: { $sum: "$ownerUnread" } } },
    ]),
    revenueSummary(now),
    Review.countDocuments({ adminSeenAt: null }), // posted since an admin last opened the Reviews page
  ]);

  // ---------- Inventory
  const byStatus = countBy(inventory.byStatus);
  const visibleByAvailability = countBy(inventory.byAvailability);
  const closed = countBy(inventory.closed);
  const visiblePublished = Object.values(visibleByAvailability).reduce(
    (s, n) => s + n,
    0,
  );
  const totalProperties = Object.values(byStatus).reduce((s, n) => s + n, 0);

  // ---------- Agents
  let active = 0;
  let expiringSoon = 0;
  agentDocs.forEach((a) => {
    const state = subscriptionState(a.subscription);
    if (a.isActive === false || !state.isActive) return;
    active += 1;
    if (
      Math.ceil((new Date(a.subscription.expiresAt) - now) / DAY) <=
      EXPIRING_SOON_DAYS
    )
      expiringSoon += 1;
  });

  // ---------- Deals
  const sales = countBy(saleCounts);
  const purchasesInProgress = OPEN_SALE_STATUSES.reduce(
    (s, status) => s + (sales[status] || 0),
    0,
  );

  ok(res, {
    generatedAt: now,
    properties: {
      total: totalProperties,
      addedThisMonth: inventory.added[0]?.thisMonth || 0,
      addedLastMonth: inventory.added[0]?.lastMonth || 0,
      published: byStatus.published || 0,
      inReview: byStatus.pending || 0,
      drafts: byStatus.draft || 0,
      rejected: byStatus.rejected || 0,
      suspended: byStatus.suspended || 0,
      hidden: (byStatus.published || 0) - visiblePublished, // published, but the agent's plan lapsed
      available: visibleByAvailability.Available || 0,
      underOffer: closed["Under Offer"] || 0,
      rented: closed.Rented || 0,
      sold: closed.Sold || 0,
      views: inventory.views[0]?.total || 0,
      mostViewed: inventory.mostViewed.map((p) => ({ id: String(p._id), title: p.title, views: p.views, ownerType: p.ownerType, area: [...new Set([p.location?.neighbourhood, p.location?.city].filter(Boolean))].join(", "), image: p.image || "" })),
    },
    agents: {
      total: agentDocs.length,
      active,
      expiringSoon,
      pendingApplications,
    },
    customers: { total: customers, newLast30Days: newCustomers },
    deals: {
      pendingOffers,
      newInquiries,
      rentalsToConfirm,
      newPurchaseRequests: sales.pending || 0,
      officePaymentsExpected: sales.payment_pending || 0,
      purchasesInProgress,
    },
    unreadMessages: unread?.n || 0,
    reviews: { new: newReviews },
    revenue,
  });
};

const PERIODS = [3, 6, 12];
const COUNT = { $literal: 1 }; // a plain 1 in $project would mean "include the field"

/**
 * GET /api/admin/performance?months=3|6|12 -> the Platform performance chart.
 * Monthly totals for the selected period (calendar months, the current one to date) and the
 * same number of months before it, for four metrics:
 *  - revenue:   money collected (see PAID_PAYMENT / PAID_SUBSCRIPTION), by confirmation date
 *  - listings:  properties added by agents or the admin team, excluding unsubmitted drafts
 *  - inquiries: customer inquiries received about any listing
 *  - agents:    agent accounts registered
 */
export const performance = async (req, res) => {
  const months = PERIODS.includes(Number(req.query.months))
    ? Number(req.query.months)
    : 6;
  const now = new Date();
  const periodStart = new Date(
    now.getFullYear(),
    now.getMonth() - (months - 1),
    1,
  );
  const previousStart = new Date(
    now.getFullYear(),
    now.getMonth() - (2 * months - 1),
    1,
  );

  const monthly = (Model, match, value, date = "$createdAt") =>
    Model.aggregate([
      { $match: match },
      { $project: { at: date, value } },
      { $match: { at: { $gte: previousStart, $lte: now } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m", date: "$at", timezone: TIMEZONE },
          },
          total: { $sum: "$value" },
        },
      },
    ]);

  const [
    rentalSales,
    subscriptions,
    listings,
    inquiries,
    agents,
    revenueByKind,
  ] = await Promise.all([
    monthly(Payment, PAID_PAYMENT(), "$amount", paidAt),
    monthly(Subscription, PAID_SUBSCRIPTION(), "$amount", paidAt),
    monthly(Property, { status: { $ne: "draft" } }, COUNT),
    monthly(Inquiry, {}, COUNT),
    monthly(User, CURRENT_AGENTS, COUNT),
    // Where the selected period's revenue came from
    Promise.all([
      Payment.aggregate([
        { $match: PAID_PAYMENT() },
        { $project: { kind: 1, amount: 1, at: paidAt } },
        { $match: { at: { $gte: periodStart, $lte: now } } },
        { $group: { _id: "$kind", total: { $sum: "$amount" } } },
      ]),
      Subscription.aggregate([
        { $match: PAID_SUBSCRIPTION() },
        { $project: { amount: 1, at: paidAt } },
        { $match: { at: { $gte: periodStart, $lte: now } } },
        { $group: { _id: "subscription", total: { $sum: "$amount" } } },
      ]),
    ]),
  ]);

  const keys = Array.from({ length: months * 2 }, (_, i) =>
    monthKey(
      new Date(previousStart.getFullYear(), previousStart.getMonth() + i, 1),
    ),
  );
  const build = (...sources) => {
    const byMonth = {};
    sources
      .flat()
      .forEach(
        (row) => (byMonth[row._id] = (byMonth[row._id] || 0) + row.total),
      );
    const values = keys.map((month) => ({ month, value: byMonth[month] || 0 }));
    const previous = values.slice(0, months);
    const series = values.slice(months);
    const total = series.reduce((s, m) => s + m.value, 0);
    const previousTotal = previous.reduce((s, m) => s + m.value, 0);
    return {
      series,
      total,
      previousTotal,
      change: percentChange(total, previousTotal),
    };
  };
  const breakdown = { rental: 0, sale: 0, subscription: 0 };
  revenueByKind.flat().forEach((row) => (breakdown[row._id] = row.total));

  ok(res, {
    months,
    generatedAt: now,
    period: { from: periodStart, to: now },
    previousPeriod: {
      from: previousStart,
      to: new Date(periodStart.getTime() - 1),
    },
    metrics: {
      revenue: { ...build(rentalSales, subscriptions), breakdown },
      listings: build(listings),
      inquiries: build(inquiries),
      agents: build(agents),
    },
  });
};

// GET /api/admin/counts -> small counters for the sidebar badges (polled)
export const counts = async (_req, res) => {
  ok(res, { pendingApplications: await pendingApplicationCount() });
};
