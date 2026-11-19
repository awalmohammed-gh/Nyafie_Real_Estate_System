import mongoose from "mongoose";
import SafetyReport, { REPORT_REASONS, REPORT_STATUSES } from "../models/SafetyReport.js";
import User from "../models/User.js";
import { isOwnListing, loadPublishedProperty, same } from "../utils/ownership.js";
import { teamOf } from "../utils/team.js";
import { notifyAdmins, notifyUser } from "../utils/notify.js";
import { ok, fail } from "../utils/response.js";

export const MAX_OPEN_REPORTS = 20; // per person: far above genuine use, stops one account flooding the queue

const name = (user) => (user ? `${user.firstName} ${user.lastName}`.trim() : "Deleted user");

const present = (report) => {
  const r = report.toJSON();
  delete r.openKey;
  const reporter = report.reporter;
  const agent = report.agent;
  return {
    ...r,
    reasonLabel: REPORT_REASONS[report.targetType]?.[report.reason] || report.reason,
    reporter: reporter?._id ? { id: String(reporter._id), name: name(reporter), email: reporter.email, role: reporter.role } : null,
    agent: agent?._id ? { id: String(agent._id), name: name(agent), email: agent.email } : agent ? { id: String(agent) } : null,
    property: report.property?._id ? { id: String(report.property._id), title: report.property.title, status: report.property.status } : report.property ? { id: String(report.property), removed: true } : null,
    reviewedBy: report.reviewedBy?._id ? { id: String(report.reviewedBy._id), name: name(report.reviewedBy) } : null,
  };
};

const populate = (query) =>
  query.populate("reporter", "firstName lastName email role").populate("agent", "firstName lastName email").populate("property", "title status").populate("reviewedBy", "firstName lastName");

/**
 * POST /api/reports { targetType: property|agent, targetId, reason, details }
 * Any signed-in customer or agent can report a public listing or an agent. Admins review them;
 * the reported side is never told who reported them.
 */
export const createReport = async (req, res) => {
  if (req.user.role === "admin") return fail(res, 400, "Admins can act on listings and agents directly.");
  const { targetType, targetId } = req.body;
  const reasons = REPORT_REASONS[targetType];
  if (!reasons) return fail(res, 400, "Choose what you're reporting.");
  const reason = String(req.body.reason || "");
  if (!Object.hasOwn(reasons, reason)) return fail(res, 400, "Choose a reason for your report.");
  const details = String(req.body.details || "").trim().slice(0, 1000);
  if (reason === "other" && details.length < 10) return fail(res, 400, "Tell us briefly what's wrong (at least 10 characters).");

  let target;
  if (targetType === "property") {
    const property = await loadPublishedProperty(targetId);
    if (!property) return fail(res, 404, "This listing is not available.");
    if (isOwnListing(property, req.user)) return fail(res, 400, "You can't report your own listing.");
    target = { property: property._id, agent: property.ownerType === "agent" ? property.owner : null, ownerType: property.ownerType, targetTitle: property.title.slice(0, 200), id: property._id };
  } else {
    const agent = mongoose.isValidObjectId(targetId) ? await User.findOne({ _id: targetId, role: "agent", isActive: true, "agentApplication.status": "approved" }).select("firstName lastName role agency") : null;
    if (!agent) return fail(res, 404, "This agent is not available.");
    if (same(agent, req.user) || (req.user.role === "agent" && same(teamOf(agent).ownerId, teamOf(req.user).ownerId))) return fail(res, 400, "You can't report your own account or agency.");
    target = { property: null, agent: agent._id, ownerType: "agent", targetTitle: name(agent).slice(0, 200), id: agent._id };
  }

  const open = await SafetyReport.countDocuments({ reporter: req.user._id, status: "open" });
  if (open >= MAX_OPEN_REPORTS) return fail(res, 429, "You have many reports waiting for review. We'll look at them before you send more.");

  const { id, ...fields } = target;
  let report;
  try {
    report = await SafetyReport.create({ reporter: req.user._id, targetType, ...fields, reason, details, openKey: `${req.user._id}:${targetType}:${id}` });
  } catch (error) {
    if (error.code === 11000) return fail(res, 409, "You've already reported this. Our team is reviewing it.");
    throw error;
  }
  // Reports always reach the admins (no notification setting turns them off)
  await notifyAdmins({ type: "report", title: reason === "scam" ? "Possible scam reported" : "New safety report", message: `${targetType === "property" ? "Listing" : "Agent"} "${fields.targetTitle}": ${reasons[reason]}.`, link: "/admin/safety-reports" });
  ok(res, { id: String(report._id), status: report.status }, "Thank you. Our team will review your report.", 201);
};

// GET /api/admin/reports?status=open|resolved|dismissed|all -> newest first
export const listReports = async (req, res) => {
  const status = REPORT_STATUSES.includes(req.query.status) ? req.query.status : req.query.status === "all" ? null : "open";
  const reports = await populate(SafetyReport.find(status ? { status } : {}).sort({ createdAt: -1 }).limit(500));
  ok(res, reports.map(present));
};

/**
 * PATCH /api/admin/reports/:id { status: resolved|dismissed, note }
 * resolved: the admin took action (e.g. suspended the listing or removed the agent from their own
 * pages); dismissed: no problem found. The reporter is thanked either way; the note stays internal.
 */
export const reviewReport = async (req, res) => {
  const { status } = req.body;
  if (!["resolved", "dismissed"].includes(status)) return fail(res, 400, "Choose whether action was taken.");
  const note = String(req.body.note || "").trim().slice(0, 1000);
  const report = mongoose.isValidObjectId(req.params.id)
    ? await SafetyReport.findOneAndUpdate({ _id: req.params.id, status: "open" }, { $set: { status, adminNote: note, reviewedBy: req.user._id, reviewedAt: new Date() }, $unset: { openKey: "" } }, { returnDocument: "after" })
    : null;
  if (!report) return fail(res, 409, "This report was already reviewed, or it doesn't exist. Refresh the list.");
  await notifyUser(report.reporter, {
    type: "report",
    title: "Your report was reviewed",
    message: status === "resolved"
      ? `Thank you for reporting "${report.targetTitle}". We reviewed it and took action.`
      : `Thank you for reporting "${report.targetTitle}". We reviewed it and didn't find a problem this time.`,
  });
  ok(res, present(await populate(SafetyReport.findById(report._id))), status === "resolved" ? "Report resolved" : "Report dismissed");
};

export const openReportCount = () => SafetyReport.countDocuments({ status: "open" });
