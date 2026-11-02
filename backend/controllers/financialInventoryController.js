import Payment from "../models/Payment.js";
import Subscription from "../models/Subscription.js";
import { paymentStatus, providerScope } from "../utils/paystack.js";
import { ok, HttpError } from "../utils/response.js";

const SECTORS = ["rental", "hotel", "sale", "subscription"];
const STATUSES = ["paid", "pending", "failed", "review", "refunded"];
// Match checkout's Math.round(amount * 100), including half-pesewa values.
const minor = { $toLong: { $floor: { $add: [{ $multiply: ["$amount", 100] }, 0.5] } } };
const day = (value, label) => {
  if (value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, `Choose a valid ${label} date.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new HttpError(400, `Choose a valid ${label} date.`);
  return parsed;
};
const filterValue = (value, allowed, label) => {
  if (value === undefined || value === "all") return "all";
  if (!allowed.includes(value)) throw new HttpError(400, `Choose a valid ${label}.`);
  return value;
};

// Both ledgers are projected into the same read-only cash-record shape. Amounts
// are summed in pesewas, so floating-point addition cannot change sector totals.
export const financialInventory = async (req, res) => {
  const now = new Date();
  const from = day(req.query.from, "start"), to = day(req.query.to, "end");
  if (from && to && from > to) throw new HttpError(400, "The start date must be before the end date.");
  const sector = filterValue(req.query.sector, SECTORS, "sector");
  const status = filterValue(req.query.status, STATUSES, "status");
  const pageText = req.query.page ?? "1";
  if (typeof pageText !== "string" || !/^[1-9]\d{0,4}$/.test(pageText)) throw new HttpError(400, "Choose a valid page.");
  const page = Number(pageText), limit = 20;
  const search = req.query.search ?? "";
  if (typeof search !== "string" || search.length > 100) throw new HttpError(400, "Search must be 100 characters or fewer.");
  const at = { ...(from ? { $gte: from } : {}), $lt: to ? new Date(to.getTime() + 86400000) : new Date(now.getTime() + 1) };
  const ledgerFilter = { ...(sector !== "all" ? { sector } : {}), ...(status !== "all" ? { state: status } : {}), ...(search.trim() ? { reference: { $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } } : {}) };
  const [result] = await Payment.aggregate([
    // Only the current Paystack mode: test checkouts never mix with live money
    { $match: { amount: { $gt: 0 }, method: { $ne: "Test payment" }, currency: { $in: ["GHS", null] }, ...providerScope() } },
    { $lookup: { from: "rentals", localField: "rental", foreignField: "_id", pipeline: [{ $project: { hotelId: 1, roomTypeId: 1 } }], as: "booking" } },
    { $lookup: { from: "properties", localField: "property", foreignField: "_id", pipeline: [{ $project: { title: 1, propertyType: 1 } }], as: "listing" } },
    { $project: {
      source: { $literal: "payment" }, reference: 1, amountMinor: minor, at: { $ifNull: ["$paidAt", "$createdAt"] }, method: 1, ownerType: 1, account: "$customer",
      subject: { $ifNull: [{ $arrayElemAt: ["$listing.title", 0] }, "Removed property"] },
      sector: { $cond: [{ $eq: ["$kind", "sale"] }, "sale", { $cond: [{ $or: [{ $ifNull: [{ $arrayElemAt: ["$booking.hotelId", 0] }, false] }, { $ifNull: [{ $arrayElemAt: ["$booking.roomTypeId", 0] }, false] }, { $in: [{ $arrayElemAt: ["$listing.propertyType", 0] }, ["Hotel", "Hotel-Apartment"]] }] }, "hotel", "rental"] }] },
      state: { $cond: [{ $in: ["$status", ["duplicate", "refund_required"]] }, "review", "$status"] },
    } },
    { $unionWith: { coll: Subscription.collection.name, pipeline: [
      { $match: { amount: { $gt: 0 }, paymentStatus: { $in: ["paid", "pending", "failed", "refund_required", "refunded"] }, paymentMethod: { $nin: ["Test payment", "Plan credit"] }, ...providerScope("paymentMethod") } },
      { $project: { source: { $literal: "subscription" }, sector: { $literal: "subscription" }, reference: "$paymentReference", amountMinor: minor, at: { $ifNull: ["$paidAt", "$createdAt"] }, method: "$paymentMethod", state: { $cond: [{ $eq: ["$paymentStatus", "refund_required"] }, "review", "$paymentStatus"] }, account: "$user", subject: "$planName", ownerType: { $literal: "admin" } } },
    ] } },
    { $match: { at } },
    { $facet: {
      summary: [{ $group: { _id: { sector: "$sector", status: "$state" }, amount: { $sum: "$amountMinor" }, count: { $sum: 1 } } }],
      count: [{ $match: ledgerFilter }, { $count: "total" }],
      rows: [{ $match: ledgerFilter }, { $sort: { at: -1, _id: -1, source: 1 } }, { $skip: (page - 1) * limit }, { $limit: limit },
        { $lookup: { from: "users", localField: "account", foreignField: "_id", pipeline: [{ $project: { firstName: 1, lastName: 1 } }], as: "person" } },
        { $project: { source: 1, reference: 1, amountMinor: 1, at: 1, method: 1, state: 1, sector: 1, subject: 1, ownerType: 1, name: { $trim: { input: { $concat: [{ $ifNull: [{ $arrayElemAt: ["$person.firstName", 0] }, ""] }, " ", { $ifNull: [{ $arrayElemAt: ["$person.lastName", 0] }, ""] }] } } } } }],
    } },
  ]);
  const sectors = SECTORS.map(key => ({ key, paid: 0, pending: 0, failed: 0, review: 0, refunded: 0, paidCount: 0, pendingCount: 0, failedCount: 0, reviewCount: 0, refundedCount: 0 }));
  const totals = { paid: 0, pending: 0, failed: 0, review: 0, refunded: 0, paidCount: 0, pendingCount: 0, failedCount: 0, reviewCount: 0, refundedCount: 0 };
  for (const group of result.summary) {
    const item = sectors.find(item => item.key === group._id.sector);
    if (!item || !STATUSES.includes(group._id.status)) continue;
    item[group._id.status] = Number(group.amount) / 100;
    item[`${group._id.status}Count`] = group.count;
  }
  // Re-sum integer minor units rather than adding decimal sector values.
  for (const state of STATUSES) {
    const groups = result.summary.filter(group => group._id.status === state && SECTORS.includes(group._id.sector));
    totals[state] = groups.reduce((sum, group) => sum + Number(group.amount), 0) / 100;
    totals[`${state}Count`] = groups.reduce((sum, group) => sum + group.count, 0);
  }
  res.set("Cache-Control", "private, no-store");
  ok(res, { generatedAt: now, currency: "GHS", providerEnvironment: paymentStatus().environment, from, to, sectors, totals, page, limit, total: result.count[0]?.total || 0,
    rows: result.rows.map(row => ({ id: String(row._id), source: row.source, reference: row.reference, amount: Number(row.amountMinor) / 100, at: row.at, method: row.method, status: row.state, sector: row.sector, subject: row.subject, ownerType: row.ownerType, name: row.name || "Deleted account" })),
  });
};
