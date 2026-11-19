import mongoose from "mongoose";
import Property from "../models/Property.js";
import User from "../models/User.js";
import Inquiry from "../models/Inquiry.js";
import Offer from "../models/Offer.js";
import Viewing from "../models/Viewing.js";
import Rental from "../models/Rental.js";
import SaleRequest from "../models/SaleRequest.js";
import PropertyViewDay, { startOfDay } from "../models/PropertyViewDay.js";
import { canHandleTeamRecord } from "../utils/team.js";
import { ok, fail } from "../utils/response.js";

const DAY = 24 * 60 * 60 * 1000;
export const INSIGHT_PERIODS = [14, 30, 90];

/**
 * GET /api/properties/:id/insights?days=14|30|90 -> how a listing is doing, for its own team (and admins):
 * views per day, all-time views, how many people saved it, and the leads it brought in the period.
 */
export const listingInsights = async (req, res) => {
  const property = mongoose.isValidObjectId(req.params.id) ? await Property.findById(req.params.id).select("owner ownerType assignedTo views createdAt") : null;
  const allowed = property && (req.user.role === "admin" || (property.ownerType === "agent" && canHandleTeamRecord(property, req.user)));
  if (!allowed) return fail(res, 404, "Property not found.");

  const periodDays = INSIGHT_PERIODS.includes(Number(req.query.days)) ? Number(req.query.days) : 14;
  const today = startOfDay();
  const since = new Date(today.getTime() - (periodDays - 1) * DAY);
  const id = property._id;
  const inPeriod = { property: id, createdAt: { $gte: since } };

  const [rows, saves, inquiries, offers, viewings, rentals, sales] = await Promise.all([
    PropertyViewDay.find({ property: id, day: { $gte: since } }).select("day count").lean(),
    User.countDocuments({ savedProperties: id }),
    Inquiry.countDocuments(inPeriod),
    Offer.countDocuments(inPeriod),
    Viewing.countDocuments(inPeriod),
    Rental.countDocuments(inPeriod),
    SaleRequest.countDocuments(inPeriod),
  ]);

  // One entry per day, including days without views
  const byDay = new Map(rows.map((row) => [row.day.toISOString().slice(0, 10), row.count]));
  const days = Array.from({ length: periodDays }, (_, i) => {
    const date = new Date(since.getTime() + i * DAY).toISOString().slice(0, 10);
    return { date, views: byDay.get(date) || 0 };
  });
  const periodViews = days.reduce((sum, day) => sum + day.views, 0);
  const leads = { inquiries, offers, viewings, rentals, sales };
  const totalLeads = Object.values(leads).reduce((a, b) => a + b, 0);

  ok(res, {
    periodDays,
    since: since.toISOString().slice(0, 10),
    days,
    views: { period: periodViews, allTime: property.views || 0 },
    saves,
    leads,
    totalLeads,
    // Leads per 100 views in the period (null until there are views)
    leadRate: periodViews ? Math.round((totalLeads / periodViews) * 1000) / 10 : null,
  });
};
