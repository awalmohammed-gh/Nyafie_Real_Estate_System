import mongoose from "mongoose";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Inquiry from "../models/Inquiry.js";
import Subscription from "../models/Subscription.js";
import { siteName } from "../models/Setting.js";
import { COUNTED_STATES } from "../utils/permissions.js";
import { ACCOUNT_TYPES } from "../utils/accountTypes.js";
import { visibleAgentIds } from "../utils/marketplace.js";
import { choice, pageOf, pageResult, searchPattern } from "../utils/listPage.js";
import { propertyOptions, rangeFilter } from "../utils/ownerPage.js";
import { presentAdminProperties } from "./adminListController.js";
import { ok, fail } from "../utils/response.js";

const DAY = 24 * 60 * 60 * 1000;
const EXPIRING_DAYS = 7; // the same window as the frontend's subscription state
const TIMEZONE = "Africa/Accra";
const objectId = (value) => (typeof value === "string" && mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : null);

// ---------- Agents and their subscriptions ----------

const STATES = ["active", "expiring", "expired", "pending", "cancelled"];
// Agents page tabs, each counting only providers still on the platform (except "removed")
const PROVIDER_TABS = {
  all: { gone: false },
  active: { gone: false, state: { $in: ["active", "expiring"] } },
  ...Object.fromEntries(STATES.slice(1).map((state) => [state, { gone: false, state }])),
  suspended: { gone: false, suspended: true },
  unverified: { gone: false, verified: false }, // hasn't proved their email yet
  new: () => ({ gone: false, createdAt: { $gte: new Date(Date.now() - 30 * DAY) } }),
  removed: { gone: true },
};
const tabFilter = (tab) => (typeof PROVIDER_TABS[tab] === "function" ? PROVIDER_TABS[tab]() : PROVIDER_TABS[tab]);

// Every agent account with its current subscription's state (as utils/subscription.js shows it)
const providers = (now) => [
  { $match: { role: "agent" } },
  { $lookup: { from: Subscription.collection.name, localField: "subscription", foreignField: "_id", pipeline: [{ $project: { plan: 1, planName: 1, status: 1, paymentStatus: 1, expiresAt: 1, createdAt: 1 } }], as: "sub" } },
  { $set: { sub: { $first: "$sub" } } },
  { $project: {
    createdAt: 1, email: 1, phone: 1,
    name: { $concat: [{ $ifNull: ["$firstName", ""] }, " ", { $ifNull: ["$lastName", ""] }] },
    company: { $ifNull: ["$agentApplication.companyName", ""] },
    accountType: { $cond: [{ $in: ["$agentApplication.agentType", ["agency", "company"]] }, "$agentApplication.agentType", "individual"] },
    plan: "$sub.plan", planName: { $ifNull: ["$sub.planName", ""] }, expiry: { $ifNull: ["$sub.expiresAt", "$sub.createdAt"] },
    subscribed: { $gt: ["$sub._id", null] },
    gone: { $or: [{ $gt: ["$removal.deletedAt", null] }, { $eq: ["$agentApplication.status", "removed"] }] },
    suspended: { $eq: ["$isActive", false] },
    verified: { $gt: ["$emailVerifiedAt", null] },
    state: { $switch: {
      branches: [
        { case: { $not: [{ $gt: ["$sub._id", null] }] }, then: "none" },
        { case: { $in: ["$sub.status", ["cancelled", "expired"]] }, then: "$sub.status" },
        { case: { $or: [{ $ne: ["$sub.status", "active"] }, { $not: [{ $in: ["$sub.paymentStatus", ["paid", "waived"]] }] }] }, then: "pending" },
        { case: { $lte: ["$sub.expiresAt", now] }, then: "expired" },
        { case: { $lte: ["$sub.expiresAt", new Date(now.getTime() + EXPIRING_DAYS * DAY)] }, then: "expiring" },
      ],
      default: "active",
    } },
  } },
];

// Full records of these agents, with what they have on the platform
const presentProviders = async (ids) => {
  const [users, agents, listings, inquiries, staff] = await Promise.all([
    User.find({ _id: { $in: ids } }).populate("subscription"),
    visibleAgentIds(),
    Property.aggregate([
      { $match: { ownerType: "agent", owner: { $in: ids } } },
      { $group: { _id: "$owner", total: { $sum: 1 }, counted: { $sum: { $cond: [{ $in: ["$status", COUNTED_STATES] }, 1, 0] } }, published: { $sum: { $cond: [{ $eq: ["$status", "published"] }, 1, 0] } }, featured: { $sum: { $cond: ["$isFeatured", 1, 0] } } } },
    ]),
    Inquiry.aggregate([{ $match: { ownerType: "agent", agent: { $in: ids } } }, { $group: { _id: "$agent", total: { $sum: 1 }, fresh: { $sum: { $cond: [{ $eq: ["$status", "new"] }, 1, 0] } } } }]),
    User.aggregate([{ $match: { "agency.owner": { $in: ids } } }, { $group: { _id: "$agency.owner", n: { $sum: 1 } } }]),
  ]);
  const visible = new Set(agents.map((agent) => String(agent.id)));
  const of = (rows, id) => rows.find((row) => String(row._id) === id) || {};
  const byId = new Map(users.map((user) => {
    const id = String(user._id), mine = of(listings, id), leads = of(inquiries, id);
    return [id, {
      ...user.toJSON(),
      activeProperties: mine.counted || 0,
      stats: { properties: mine.total || 0, live: visible.has(id) ? mine.published || 0 : 0, featured: mine.featured || 0, inquiries: leads.total || 0, newInquiries: leads.fresh || 0, team: of(staff, id).n || 0 },
    }];
  }));
  return ids.map((id) => byId.get(String(id))).filter(Boolean);
};

// GET /api/admin/providers?page&search&status&plan&accountType&subscribed=1&sort=newest|expiry
export const listProviders = async (req, res) => {
  const paging = pageOf(req.query), pattern = searchPattern(req.query.search), now = new Date();
  const status = choice(req.query.status, Object.keys(PROVIDER_TABS));
  const accountType = choice(req.query.accountType, ACCOUNT_TYPES);
  const plan = objectId(req.query.plan);
  const scope = req.query.subscribed === "1" ? { subscribed: true } : {};
  const regex = pattern && { $regex: pattern.source, $options: "i" };
  const filter = {
    ...scope, ...tabFilter(status),
    ...(plan ? { plan } : {}), ...(accountType !== "all" ? { accountType } : {}),
    ...(regex ? { $or: ["name", "email", "phone", "company", "planName"].map((field) => ({ [field]: regex })) } : {}),
  };
  const [result] = await User.aggregate([
    ...providers(now),
    { $facet: {
      rows: [{ $match: filter }, { $sort: req.query.sort === "expiry" ? { expiry: 1, _id: 1 } : { createdAt: -1, _id: -1 } }, { $skip: paging.skip }, { $limit: paging.limit }, { $project: { _id: 1 } }],
      total: [{ $match: filter }, { $count: "n" }],
      ...Object.fromEntries(Object.keys(PROVIDER_TABS).map((tab) => [`tab_${tab}`, [{ $match: { ...scope, ...tabFilter(tab) } }, { $count: "n" }]])),
    } },
  ]);
  ok(res, pageResult(await presentProviders(result.rows.map((row) => row._id)), result.total[0]?.n || 0, paging, {
    counts: Object.fromEntries(Object.keys(PROVIDER_TABS).map((tab) => [tab, result[`tab_${tab}`][0]?.n || 0])),
  }));
};

const LISTINGS_SHOWN = 20;
const PAYMENTS_SHOWN = 50;

// GET /api/admin/providers/:id -> one agent, with their latest listings and their subscription payments
export const getProvider = async (req, res) => {
  const id = objectId(req.params.id);
  const [provider] = id && await User.exists({ _id: id, role: "agent" }) ? await presentProviders([id]) : [];
  if (!provider) return fail(res, 404, "Agent not found.");
  const [listings, payments] = await Promise.all([
    Property.find({ ownerType: "agent", owner: id }).sort({ createdAt: -1 }).limit(LISTINGS_SHOWN),
    Subscription.find({ user: id }).sort({ createdAt: -1 }).limit(PAYMENTS_SHOWN),
  ]);
  ok(res, { ...provider, listings: await presentAdminProperties(listings), payments });
};

// Subscription money received and kept, by month (a lost dispute's money comes off)
const revenueByMonth = (from) => Subscription.aggregate([
  { $match: { paymentStatus: "paid", amount: { $gt: 0 } } },
  { $project: { at: { $ifNull: ["$paidAt", "$createdAt"] }, kept: { $subtract: ["$amount", { $ifNull: ["$disputeLost", 0] }] } } },
  { $match: { at: { $gte: from } } },
  { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$at", timezone: TIMEZONE } }, total: { $sum: "$kept" } } },
]);
const monthsBack = (count, now = new Date()) => Array.from({ length: count }, (_, i) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1) + i, 1)));

const REVENUE_MONTHS = 8;

// GET /api/admin/plan-summary -> subscribers of each plan, and subscription revenue month by month
export const planSummary = async (_req, res) => {
  const months = monthsBack(REVENUE_MONTHS);
  const isActive = { $in: ["$state", ["active", "expiring"]] };
  const [groups, revenue] = await Promise.all([
    User.aggregate([...providers(new Date()), { $match: { gone: false } }, { $group: { _id: "$plan", total: { $sum: 1 }, active: { $sum: { $cond: [isActive, 1, 0] } } } }]),
    revenueByMonth(months[0]),
  ]);
  const totals = new Map(revenue.map((month) => [month._id, month.total]));
  ok(res, {
    providers: groups.reduce((sum, group) => sum + group.total, 0),
    activeSubscribers: groups.reduce((sum, group) => sum + group.active, 0),
    byPlan: Object.fromEntries(groups.filter((group) => group._id).map((group) => [String(group._id), { total: group.total, active: group.active }])),
    revenue: months.map((month) => {
      const key = month.toISOString().slice(0, 7);
      return { month: key, total: Math.round((totals.get(key) || 0) * 100) / 100 };
    }),
  });
};

// ---------- Inquiries ----------

const INQUIRY_STATUSES = ["new", "contacted", "inProgress", "closed"];
const MATCHES = 500;

// GET /api/admin/inquiries?page&search&status&agent=admin|<id>&property&range
export const pageInquiries = async (req, res) => {
  const paging = pageOf(req.query), pattern = searchPattern(req.query.search);
  const status = choice(req.query.status, INQUIRY_STATUSES);
  const agent = objectId(req.query.agent), property = objectId(req.query.property);
  const ofOwner = agent ? { ownerType: "agent", agent } : req.query.agent === "admin" ? { ownerType: "admin" } : {};
  const scope = { ...ofOwner, ...(property ? { property } : {}), ...rangeFilter(req.query.range) };
  const filter = { ...scope, ...(status !== "all" ? { status } : {}) };
  if (pattern) {
    const listings = await Property.find({ title: pattern }).select("_id").limit(MATCHES).lean();
    filter.$or = [{ name: pattern }, { email: pattern }, { message: pattern }, { property: { $in: listings.map((listing) => listing._id) } }];
  }
  const [total, rows, groups, properties, agentIds] = await Promise.all([
    Inquiry.countDocuments(filter),
    Inquiry.find(filter).sort({ createdAt: -1, _id: -1 }).skip(paging.skip).limit(paging.limit).populate("property", "title images location price pricePeriod listingType availability").populate("agent", "firstName lastName"),
    Inquiry.aggregate([{ $match: scope }, { $group: { _id: "$status", n: { $sum: 1 } } }]),
    propertyOptions(Inquiry, ofOwner, property),
    Inquiry.distinct("agent", { ownerType: "agent" }),
  ]);
  const agents = await User.find({ _id: { $in: agent ? [...agentIds, agent] : agentIds } }).select("firstName lastName").sort({ firstName: 1, lastName: 1 }).limit(MATCHES).lean();
  const count = (key) => groups.find((group) => group._id === key)?.n || 0;
  ok(res, pageResult(
    rows.map((row) => ({ ...row.toJSON(), agent: row.agent?._id ? String(row.agent._id) : null, ownerName: row.ownerType === "admin" ? siteName() : row.agent?.firstName ? `${row.agent.firstName} ${row.agent.lastName}` : "Deleted agent" })),
    total, paging,
    {
      counts: { all: groups.reduce((sum, group) => sum + group.n, 0), ...Object.fromEntries(INQUIRY_STATUSES.map((key) => [key, count(key)])) },
      options: { properties, agents: agents.map((user) => ({ id: String(user._id), name: `${user.firstName} ${user.lastName}` })) },
    },
  ));
};

// ---------- Reports ----------

// GET /api/admin/report-data -> only the fields the reports count (no names, emails or other details)
export const reportData = async (_req, res) => {
  const [users, listings, inquiries, payments] = await Promise.all([
    User.find({ role: { $in: ["user", "agent"] } }).select("role isActive createdAt removal.deletedAt agentApplication.status subscription").populate("subscription", "status paymentStatus expiresAt createdAt").lean(),
    Property.find().select("ownerType status createdAt reviewedAt").lean(),
    Inquiry.find().select("createdAt").lean(),
    Subscription.find({ paymentStatus: "paid" }).select("amount disputeLost paidAt createdAt").lean(),
  ]);
  ok(res, {
    users: users.map((user) => ({
      role: user.role, createdAt: user.createdAt,
      status: user.removal?.deletedAt ? "deleted" : user.agentApplication?.status === "removed" ? "removed" : user.isActive === false ? "suspended" : "active",
      subscription: user.subscription?.status ? { status: user.subscription.status, paymentStatus: user.subscription.paymentStatus, expiryDate: user.subscription.expiresAt || user.subscription.createdAt } : null,
    })),
    listings: listings.map((listing) => ({ owner: { type: listing.ownerType }, listing: { state: listing.status, createdAt: listing.createdAt, reviewedAt: listing.reviewedAt || null } })),
    inquiries: inquiries.map((inquiry) => ({ createdAt: inquiry.createdAt })),
    payments: payments.map((payment) => ({ status: "paid", createdAt: payment.paidAt || payment.createdAt, amount: payment.amount, received: Math.round((payment.amount - (payment.disputeLost || 0)) * 100) / 100 })),
  });
};
