import Offer from "../models/Offer.js";
import Rental from "../models/Rental.js";
import SaleRequest from "../models/SaleRequest.js";
import Viewing from "../models/Viewing.js";
import { ownerFilter } from "./ownership.js";

/**
 * What needs a response from the owner side (agents: their own or agency listings; admins: the whole
 * platform), for the sidebar badges. Counted by the database: the lists themselves load only on the
 * pages that show them.
 */
export const workCounts = async (user) => {
  const mine = ownerFilter(user);
  const [offers, rentals, sales, officePayments, viewings] = await Promise.all([
    Offer.countDocuments({ ...mine, status: "pending" }),
    Rental.countDocuments({ ...mine, status: "paid" }), // paid, waiting to be confirmed
    SaleRequest.countDocuments({ ...mine, status: "pending" }),
    SaleRequest.countDocuments({ ...mine, status: "payment_pending" }),
    Viewing.countDocuments({ ...mine, status: "requested", proposedBy: "customer" }), // requests to answer
  ]);
  return { offers, rentals, sales, officePayments, viewings };
};

// Offers and requests received on each of the owner's listings: { <property id>: { offers, pendingOffers, requests } }
export const propertyActivity = async (user) => {
  const mine = ownerFilter(user);
  const perProperty = (Model, extra = {}) => Model.aggregate([{ $match: mine }, { $group: { _id: "$property", n: { $sum: 1 }, ...extra } }]);
  const [offers, rentals, sales] = await Promise.all([
    perProperty(Offer, { pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } } }), perProperty(Rental), perProperty(SaleRequest),
  ]);
  const activity = {};
  const of = (id) => (activity[String(id)] ||= { offers: 0, pendingOffers: 0, requests: 0 });
  offers.forEach((row) => Object.assign(of(row._id), { offers: row.n, pendingOffers: row.pending }));
  [...rentals, ...sales].forEach((row) => { of(row._id).requests += row.n; });
  return activity;
};
