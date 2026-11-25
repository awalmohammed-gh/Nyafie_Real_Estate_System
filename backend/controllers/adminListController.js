import mongoose from "mongoose";
import User from "../models/User.js";
import Property from "../models/Property.js";
import Inquiry from "../models/Inquiry.js";
import Offer from "../models/Offer.js";
import Rental from "../models/Rental.js";
import SaleRequest from "../models/SaleRequest.js";
import Payment from "../models/Payment.js";
import Subscription from "../models/Subscription.js";
import Dispute from "../models/Dispute.js";
import { siteName } from "../models/Setting.js";
import { REFUND_SUMMARY } from "./refundController.js";
import { DISPUTE_SUMMARY } from "../utils/disputes.js";
import { visibleAgentIds } from "../utils/marketplace.js";
import {
  choice,
  fullNameMatch,
  pageOf,
  pageResult,
  searchPattern,
} from "../utils/listPage.js";
import { ok, fail } from "../utils/response.js";

// The admin lists that can grow without limit: filtered, searched, sorted, counted and cut into pages by
// the database, so a page asks only for the rows it shows.

const DAY = 24 * 60 * 60 * 1000;
const objectId = (value) =>
  mongoose.isValidObjectId(value)
    ? new mongoose.Types.ObjectId(String(value))
    : null;
const fullName = (user) => `${user.firstName} ${user.lastName}`;

// ---------- Customers ----------

const CUSTOMER_FILTERS = {
  all: () => ({}),
  active: () => ({ isActive: { $ne: false } }),
  suspended: () => ({ isActive: false }),
  unverified: () => ({ emailVerifiedAt: null }),
  recent: () => ({ createdAt: { $gte: new Date(Date.now() - 30 * DAY) } }),
};

// How many inquiries, offers, rentals and purchase requests each of these customers made
const activityCounts = async (users) => {
  const ids = users.map((user) => user._id);
  const byCustomer = (Model) =>
    Model.aggregate([
      { $match: { customer: { $in: ids } } },
      { $group: { _id: "$customer", n: { $sum: 1 } } },
    ]);
  const [inquiries, offers, rentals, sales] = await Promise.all([
    // Signed in, or as a guest with the same email
    Inquiry.aggregate([
      {
        $match: {
          $or: [
            { customer: { $in: ids } },
            { email: { $in: users.map((user) => user.email) } },
          ],
        },
      },
      {
        $group: {
          _id: { customer: "$customer", email: "$email" },
          n: { $sum: 1 },
        },
      },
    ]),
    byCustomer(Offer),
    byCustomer(Rental),
    byCustomer(SaleRequest),
  ]);
  const of = (rows, user) =>
    rows.find((row) => String(row._id) === String(user._id))?.n || 0;
  return new Map(
    users.map((user) => [
      String(user._id),
      {
        inquiries: inquiries
          .filter(
            ({ _id }) =>
              String(_id.customer) === String(user._id) ||
              _id.email === user.email,
          )
          .reduce((sum, row) => sum + row.n, 0),
        offers: of(offers, user),
        rentals: of(rentals, user),
        purchases: of(sales, user),
      },
    ]),
  );
};

// GET /api/admin/customers?page&search&filter=all|active|recent|suspended
export const listCustomers = async (req, res) => {
  const paging = pageOf(req.query),
    pattern = searchPattern(req.query.search);
  const base = { role: "user" };
  const filter = {
    ...base,
    ...CUSTOMER_FILTERS[
      choice(req.query.filter, Object.keys(CUSTOMER_FILTERS))
    ](),
    ...(pattern
      ? {
          $or: [
            { email: pattern },
            { phone: pattern },
            { $expr: fullNameMatch(pattern) },
          ],
        }
      : {}),
  };
  const [total, users, ...counted] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(paging.skip)
      .limit(paging.limit),
    ...Object.values(CUSTOMER_FILTERS).map((extra) =>
      User.countDocuments({ ...base, ...extra() }),
    ),
  ]);
  const activity = await activityCounts(users);
  ok(
    res,
    pageResult(
      users.map((user) => ({
        ...user.toJSON(),
        savedCount: user.savedProperties.length,
        activity: activity.get(String(user._id)),
      })),
      total,
      paging,
      {
        counts: Object.fromEntries(
          Object.keys(CUSTOMER_FILTERS).map((key, index) => [
            key,
            counted[index],
          ]),
        ),
      },
    ),
  );
};

const RECENT_ACTIVITY = 8;

// GET /api/admin/customers/:id -> one customer with their counts and latest activity
export const getCustomer = async (req, res) => {
  const user =
    objectId(req.params.id) &&
    (await User.findOne({ _id: req.params.id, role: "user" }));
  if (!user) return fail(res, 404, "Customer not found.");
  const latest = (Model, filter) =>
    Model.find(filter)
      .sort({ createdAt: -1 })
      .limit(RECENT_ACTIVITY)
      .populate("property", "title")
      .lean();
  const [activity, inquiries, offers, rentals, sales] = await Promise.all([
    activityCounts([user]),
    latest(Inquiry, { $or: [{ customer: user._id }, { email: user.email }] }),
    latest(Offer, { customer: user._id }),
    latest(Rental, { customer: user._id }),
    latest(SaleRequest, { customer: user._id }),
  ]);
  const entries = (kind, rows) =>
    rows.map((row) => ({
      id: `${kind}-${row._id}`,
      kind,
      amount: row.amount ?? null,
      subject: row.property?.title || "Removed property",
      status: row.status,
      createdAt: row.createdAt,
    }));
  const recent = [
    ...entries("offer", offers),
    ...entries("rental", rentals),
    ...entries("purchase", sales),
    ...entries("inquiry", inquiries),
  ]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, RECENT_ACTIVITY);
  ok(res, {
    ...user.toJSON(),
    savedCount: user.savedProperties.length,
    activity: activity.get(String(user._id)),
    recent,
  });
};

// ---------- Properties ----------

const STATES = ["published", "pending", "rejected", "suspended", "draft"];
const OWNER_TYPES = ["admin", "agent"];
const PURPOSES = ["Rent", "Sale"];
const STALE_SHOWN = 50; // the platform's own listings waiting to be confirmed

// What a listing costs when sorting: hotels by their cheapest active room. No price sorts last.
const sortPrice = {
  $cond: [
    { $eq: [{ $toLower: { $ifNull: ["$propertyType", ""] } }, "hotel"] },
    {
      $min: {
        $map: {
          input: {
            $filter: {
              input: { $ifNull: ["$roomTypes", []] },
              as: "room",
              cond: { $eq: ["$$room.active", true] },
            },
          },
          as: "room",
          in: "$$room.pricePerNight",
        },
      },
    },
    "$price",
  ],
};
const PROPERTY_SORTS = {
  review: { sortReview: -1, createdAt: -1, _id: -1 },
  newest: { createdAt: -1, _id: -1 },
  views: { views: -1, createdAt: -1, _id: -1 },
  priceAsc: { sortPriced: -1, sortPrice: 1, _id: -1 },
  priceDesc: { sortPriced: -1, sortPrice: -1, _id: -1 },
};

const ownersOf = async (properties) => {
  const ids = [
    ...new Set(
      properties
        .filter((property) => property.ownerType === "agent")
        .map((property) => String(property.owner)),
    ),
  ];
  const users = ids.length
    ? await User.find({ _id: { $in: ids } })
        .select("firstName lastName")
        .lean()
    : [];
  return new Map(users.map((user) => [String(user._id), fullName(user)]));
};

// Listings as the admin pages show them: with the owner's name and whether customers can see them
export const presentAdminProperties = async (properties) => {
  const [owners, agents] = await Promise.all([
    ownersOf(properties),
    visibleAgentIds(),
  ]);
  const visible = new Set(agents.map((agent) => String(agent.id)));
  return properties.map((property) => ({
    ...property.toJSON(),
    ownerName:
      property.ownerType === "admin"
        ? siteName()
        : owners.get(String(property.owner)) || "Deleted agent",
    isPublic:
      property.status === "published" &&
      (property.ownerType === "admin" || visible.has(String(property.owner))),
  }));
};

// GET /api/admin/properties?page&search&status&ownerType&owner&purpose&sort
export const pageProperties = async (req, res) => {
  const paging = pageOf(req.query),
    pattern = searchPattern(req.query.search);
  const ownerId = req.query.owner ? objectId(req.query.owner) : null;
  if (req.query.owner && !ownerId) return fail(res, 400, "Unknown owner.");
  const ownerType = choice(req.query.ownerType, OWNER_TYPES);
  const status = choice(req.query.status, STATES),
    purpose = choice(req.query.purpose, PURPOSES);
  const sort = choice(req.query.sort, Object.keys(PROPERTY_SORTS), "review");
  // The collection being looked at; the status tabs count all of it, whatever is searched
  const scope = {
    ...(ownerType !== "all" ? { ownerType } : {}),
    ...(ownerId
      ? { owner: ownerId, ownerType: ownerType === "all" ? "agent" : ownerType }
      : {}),
  };
  const filter = {
    ...scope,
    ...(status !== "all" ? { status } : {}),
    ...(purpose !== "all" ? { listingType: purpose } : {}),
  };
  if (pattern) {
    const owners = await User.find({
      role: "agent",
      $expr: fullNameMatch(pattern),
    })
      .select("_id")
      .limit(500)
      .lean();
    filter.$or = [
      { title: pattern },
      { propertyType: pattern },
      { "location.neighbourhood": pattern },
      { "location.city": pattern },
      ...(owners.length
        ? [
            {
              ownerType: "agent",
              owner: { $in: owners.map((user) => user._id) },
            },
          ]
        : []),
      ...(pattern.test(siteName()) ? [{ ownerType: "admin" }] : []),
    ];
  }
  const [total, order, groups, stale, owner, everything] = await Promise.all([
    Property.countDocuments(filter),
    Property.aggregate([
      { $match: filter },
      {
        $project: {
          createdAt: 1,
          views: 1,
          sortReview: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
          sortPrice,
        },
      },
      {
        $set: { sortPriced: { $cond: [{ $gt: ["$sortPrice", null] }, 1, 0] } },
      },
      { $sort: PROPERTY_SORTS[sort] },
      { $skip: paging.skip },
      { $limit: paging.limit },
      { $project: { _id: 1 } },
    ]),
    Property.aggregate([
      { $match: scope },
      {
        $group: {
          _id: { status: "$status", purpose: "$listingType" },
          n: { $sum: 1 },
        },
      },
    ]),
    Property.find({
      ownerType: "admin",
      $or: [
        { staleSince: { $ne: null } },
        { freshnessReminderAt: { $ne: null } },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(STALE_SHOWN),
    ownerId ? User.findById(ownerId).select("firstName lastName").lean() : null,
    Property.exists({}),
  ]);
  const found = await Property.find({
    _id: { $in: order.map((row) => row._id) },
  });
  const byId = new Map(
    found.map((property) => [String(property._id), property]),
  );
  const rows = order.map((row) => byId.get(String(row._id))).filter(Boolean); // deleted in between: left out
  const [items, staleItems] = await Promise.all([
    presentAdminProperties(rows),
    presentAdminProperties(stale),
  ]);
  const sum = (matches) =>
    groups
      .filter(({ _id }) => matches(_id))
      .reduce((count, group) => count + group.n, 0);
  ok(
    res,
    pageResult(items, total, paging, {
      counts: {
        all: sum(() => true),
        ...Object.fromEntries(
          STATES.map((state) => [
            state,
            sum((group) => group.status === state),
          ]),
        ),
      },
      purposes: Object.fromEntries(
        PURPOSES.map((value) => [
          value,
          sum((group) => group.purpose === value),
        ]),
      ),
      stale: staleItems,
      ownerName: owner ? fullName(owner) : null,
      empty: !everything,
    }),
  );
};

// GET /api/admin/properties/:id -> one listing, whoever owns it
export const getAdminProperty = async (req, res) => {
  const property =
    objectId(req.params.id) && (await Property.findById(req.params.id));
  if (!property) return fail(res, 404, "Property not found.");
  ok(res, (await presentAdminProperties([property]))[0]);
};

// ---------- Payments ----------

const PAYMENT_TYPES = ["rental", "sale", "subscription", "disputed"];
const DISPUTES_SHOWN = 3;

// Rental and sale payments and agent subscriptions as one list
const ledger = () => [
  {
    $project: {
      source: { $literal: "payment" },
      type: "$kind",
      reference: 1,
      person: "$customer",
      property: 1,
      status: 1,
      amount: 1,
      disputeLost: 1,
      dispute: 1,
      at: { $ifNull: ["$paidAt", "$createdAt"] },
    },
  },
  {
    $unionWith: {
      coll: Subscription.collection.name,
      pipeline: [
        {
          $project: {
            source: { $literal: "subscription" },
            type: { $literal: "subscription" },
            reference: "$paymentReference",
            person: "$user",
            status: "$paymentStatus",
            amount: 1,
            disputeLost: 1,
            dispute: 1,
            at: { $ifNull: ["$paidAt", "$createdAt"] },
          },
        },
      ],
    },
  },
];

// GET /api/admin/payments?page&search&type=all|rental|sale|subscription|disputed
export const pagePayments = async (req, res) => {
  const paging = pageOf(req.query),
    pattern = searchPattern(req.query.search);
  const type = choice(req.query.type, PAYMENT_TYPES);
  const ofType =
    type === "all"
      ? {}
      : type === "disputed"
        ? { dispute: { $ne: null } }
        : { type };
  const regex = (input) => ({
    $regexMatch: {
      input: { $ifNull: [input, ""] },
      regex: pattern.source,
      options: "i",
    },
  });
  // Names and titles are only looked up while searching
  const search = pattern
    ? [
        {
          $lookup: {
            from: User.collection.name,
            localField: "person",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  name: {
                    $concat: [
                      { $ifNull: ["$firstName", ""] },
                      " ",
                      { $ifNull: ["$lastName", ""] },
                    ],
                  },
                },
              },
            ],
            as: "who",
          },
        },
        {
          $lookup: {
            from: Property.collection.name,
            localField: "property",
            foreignField: "_id",
            pipeline: [{ $project: { title: 1 } }],
            as: "what",
          },
        },
        {
          $match: {
            $expr: {
              $or: [
                regex("$reference"),
                regex({ $first: "$who.name" }),
                regex({
                  $cond: [
                    { $eq: ["$source", "subscription"] },
                    "Agent subscription",
                    { $first: "$what.title" },
                  ],
                }),
              ],
            },
          },
        },
      ]
    : [];
  const open = { outcome: { $in: ["open", "check"] } };
  const [[result], disputesOpen, disputes] = await Promise.all([
    Payment.aggregate([
      ...ledger(),
      {
        $facet: {
          counts: [
            {
              $group: {
                _id: "$type",
                n: { $sum: 1 },
                disputed: {
                  $sum: { $cond: [{ $gt: ["$dispute", null] }, 1, 0] },
                },
              },
            },
          ],
          // Money received and kept: what lost disputes took back comes off
          paid: [
            { $match: { ...ofType, status: "paid" } },
            {
              $group: {
                _id: null,
                total: {
                  $sum: {
                    $subtract: ["$amount", { $ifNull: ["$disputeLost", 0] }],
                  },
                },
              },
            },
          ],
          total: [{ $match: ofType }, ...search, { $count: "n" }],
          rows: [
            { $match: ofType },
            ...search,
            { $sort: { at: -1, _id: -1 } },
            { $skip: paging.skip },
            { $limit: paging.limit },
            { $project: { source: 1 } },
          ],
        },
      },
    ]),
    Dispute.countDocuments(open),
    // Waiting for NyaFie's answer first, then the nearest deadline
    Dispute.aggregate([
      { $match: open },
      {
        $set: {
          sortWaiting: {
            $cond: [
              {
                $and: [
                  { $eq: ["$outcome", "open"] },
                  { $eq: ["$providerStatus", "awaiting-merchant-feedback"] },
                ],
              },
              0,
              1,
            ],
          },
          sortDue: { $ifNull: ["$dueAt", new Date("9999-12-31")] },
        },
      },
      { $sort: { sortWaiting: 1, sortDue: 1, _id: 1 } },
      { $limit: DISPUTES_SHOWN },
      {
        $project: {
          _id: 0,
          disputeId: 1,
          reference: 1,
          amount: 1,
          disputedAmount: 1,
          lostAmount: 1,
          outcome: 1,
          providerStatus: 1,
          dueAt: 1,
        },
      },
    ]),
  ]);
  const ids = (source) =>
    result.rows.filter((row) => row.source === source).map((row) => row._id);
  const [payments, subscriptions] = await Promise.all([
    Payment.find({ _id: { $in: ids("payment") } })
      .populate("customer", "firstName lastName email")
      .populate("property", "title")
      .populate("owner", "firstName lastName")
      .populate("confirmedBy", "firstName lastName")
      .populate("refund", REFUND_SUMMARY)
      .populate("dispute", DISPUTE_SUMMARY),
    Subscription.find({ _id: { $in: ids("subscription") } })
      .populate("user", "firstName lastName")
      .populate("refund", REFUND_SUMMARY)
      .populate("dispute", DISPUTE_SUMMARY),
  ]);
  const records = new Map([
    ...payments.map((record) => [`payment-${record._id}`, record]),
    ...subscriptions.map((record) => [`subscription-${record._id}`, record]),
  ]);
  const items = result.rows
    .map((row) => ({
      source: row.source,
      record: records.get(`${row.source}-${row._id}`),
    }))
    .filter((item) => item.record);
  const count = (key) =>
    result.counts.find((group) => group._id === key)?.n || 0;
  ok(
    res,
    pageResult(items, result.total[0]?.n || 0, paging, {
      counts: {
        all: result.counts.reduce((sum, group) => sum + group.n, 0),
        rental: count("rental"),
        sale: count("sale"),
        subscription: count("subscription"),
        disputed: result.counts.reduce((sum, group) => sum + group.disputed, 0),
      },
      paidTotal: Math.round((result.paid[0]?.total || 0) * 100) / 100,
      openDisputes: { total: disputesOpen, items: disputes },
    }),
  );
};
