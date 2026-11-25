import User from "../models/User.js";
import { clearVisibleAgentsCache } from "../utils/marketplace.js";
import {
  applicationRequirements,
  applicationStatus,
  validateAgentProfile,
} from "../utils/agentApplication.js";
import { resolveImages } from "../utils/uploadImages.js";
import Subscription from "../models/Subscription.js";
import { accountTypeOf, subscriptionState } from "../utils/permissions.js";
import { ACCOUNT_LABELS, isOrganization } from "../utils/accountTypes.js";
import { notifyAdmins, notifyUser } from "../utils/notify.js";
import { ok, fail } from "../utils/response.js";
import { loadUser } from "./authController.js";
import { endSessions } from "../utils/sessions.js";
import { reconcileOpenPayments } from "./subscriptionController.js";
import { destroyDocument } from "../utils/propertyDocuments.js";
import { reportError } from "../utils/monitoring.js";

// After a review the proof files are removed from storage (the database no longer lists them).
// A file the storage provider fails to delete is reported, so it can be removed by hand.
const deleteReviewedProofs = async (agentId, files) => {
  const results = await Promise.allSettled(files.map((file) => destroyDocument(file)));
  // Cloudinary answers { result: "ok" } (or "not found" when it is already gone); anything else failed
  const failed = results.filter((result) => !(result.status === "fulfilled" && ["ok", "not found"].includes(result.value?.result)));
  if (!failed.length) return;
  const error = new Error(`${failed.length} reviewed agent proof file(s) could not be deleted from storage for agent ${agentId}.`);
  console.error(error.message);
  await reportError(error, { tags: { area: "agent-proof-deletion" } });
};

// GET /api/agents/application -> the onboarding status page. Re-checks unfinished payments with
// Paystack first, and submits once the profile, proof and subscription are ready.
export const getApplication = async (req, res) => {
  await reconcileOpenPayments(req.user);
  await submitReadyApplication(await User.findById(req.user._id));
  const user = await User.findById(req.user._id);
  ok(res, {
    user: await loadUser(user._id),
    status: applicationStatus(user),
    requirements: await applicationRequirements(user),
  });
};

export const saveApplication = async (req, res) => {
  if (!["incomplete", "rejected"].includes(applicationStatus(req.user)))
    return fail(
      res,
      409,
      "This application cannot be edited at its current status.",
    );
  const { firstName, lastName, phone, profile } = validateAgentProfile(req.user.agency?.owner ? {
    ...req.body, agentType: accountTypeOf(req.user), companyName: req.user.agentApplication?.companyName || "",
  } : req.body);
  // An active plan is for one account type: switching type needs a plan for that type
  const subscription = req.user.subscription ? await Subscription.findById(req.user.subscription).populate("plan") : null;
  const planType = subscriptionState(subscription).isActive ? subscription.plan?.accountType || "individual" : null;
  if (planType && planType !== profile.agentType)
    return fail(res, 400, planType === "individual"
      ? "Your subscription is for individual agents. Once approved, you can upgrade to an agency plan."
      : `Your subscription is for ${ACCOUNT_LABELS[planType].toLowerCase()} accounts. Keep the ${ACCOUNT_LABELS[planType]} account type.`);
  const images = await resolveImages(
    [
      (req.body.profileImage !== undefined ? req.body.profileImage : req.user.profileImage) || "",
      ...(isOrganization(profile.agentType) && req.body.agencyLogo
        ? [req.body.agencyLogo]
        : []),
    ].filter(Boolean),
  );
  const changes = { firstName, lastName, phone, profileImage: images[0] || "" };
  // Resolve separately when no profile image was supplied, so a logo cannot become an avatar.
  const hasProfileImage = Boolean(
    req.body.profileImage !== undefined ? req.body.profileImage : req.user.profileImage,
  );
  changes.profileImage = hasProfileImage ? images[0] : "";
  profile.agencyLogo =
    isOrganization(profile.agentType) && req.body.agencyLogo
      ? images[hasProfileImage ? 1 : 0]
      : "";
  for (const [key, value] of Object.entries(profile))
    changes[`agentApplication.${key}`] = value;
  changes["agentApplication.profileCompletedAt"] = new Date();
  changes["agentApplication.status"] = "incomplete";
  changes["agentApplication.rejectionReason"] = "";
  const updated = await User.findOneAndUpdate(
    {
      _id: req.user._id,
      role: "agent",
      isActive: true,
      $or: [
        { "agentApplication.status": { $in: ["incomplete", "rejected"] } },
        { "agentApplication.status": { $exists: false } },
      ],
    },
    { $set: changes },
    { returnDocument: "after", runValidators: true },
  );
  if (!updated)
    return fail(
      res,
      409,
      "Your application changed. Refresh its status before continuing.",
    );
  ok(res, await loadUser(updated._id), "Agent profile saved");
};

// Called after profile submission and after verified payment; never grants approval.
// Approved agents edit public details without changing their application decision or audit trail.
export const updateAgentProfile = async (req, res) => {
  // The account type is fixed once approved: it only changes through a paid agency plan (or an admin).
  // Agency staff edit their personal profile; the agency's name and logo belong to the agency account.
  const member = Boolean(req.user.agency?.owner);
  const { firstName, lastName, phone, profile } = validateAgentProfile({ ...req.body, agentType: member ? "individual" : accountTypeOf(req.user) });
  if (member) Object.assign(profile, { agentType: accountTypeOf(req.user), companyName: req.user.agentApplication?.companyName || "" });
  const avatar = req.body.profileImage !== undefined ? req.body.profileImage : req.user.profileImage;
  const logo = isOrganization(profile.agentType) && !member ? req.body.agencyLogo ?? req.user.agentApplication?.agencyLogo : "";
  const images = await resolveImages([avatar, logo].filter(Boolean));
  const changes = { firstName, lastName, phone, profileImage: avatar ? images[0] : "" };
  profile.agencyLogo = logo ? images[avatar ? 1 : 0] : "";
  for (const [key, value] of Object.entries(profile)) changes[`agentApplication.${key}`] = value;
  const updated = await User.findOneAndUpdate(
    { _id: req.user._id, role: "agent", isActive: true, "agentApplication.status": "approved" },
    { $set: changes }, { returnDocument: "after", runValidators: true },
  );
  if (!updated) return fail(res, 409, "Your account status changed. Refresh before editing your profile.");
  ok(res, await loadUser(updated._id), "Agent profile updated");
};

export const submitReadyApplication = async (user) => {
  const requirements = await applicationRequirements(user);
  if (!requirements.profileComplete || !requirements.documentsComplete || !requirements.subscriptionSatisfied)
    return false;
  const updated = await User.findOneAndUpdate(
    {
      _id: user._id,
      role: "agent",
      isActive: true,
      "agentApplication.status": "incomplete",
      "agentApplication.proofCount": { $gt: 0 },
    },
    {
      $set: {
        "agentApplication.status": "pending",
        "agentApplication.submittedAt": new Date(),
        "agentApplication.rejectionReason": "",
      },
    },
    { returnDocument: "after", runValidators: true },
  );
  if (updated)
    notifyAdmins({
      type: "agent_application",
      title: "Agent application submitted",
      message: `${updated.firstName} ${updated.lastName} is ready for review.`,
      link: "/admin/agent-applications",
    });
  return Boolean(updated);
};

export const submitApplication = async (req, res) => {
  if (applicationStatus(req.user) !== "incomplete")
    return fail(
      res,
      409,
      "This application cannot be submitted at its current status.",
    );
  const requirements = await applicationRequirements(req.user);
  if (!requirements.profileComplete)
    return fail(res, 400, "Complete your agent profile first.");
  if (!requirements.documentsComplete)
    return fail(res, 400, "Upload proof that you work as an agent before submitting your application.");
  if (!requirements.subscriptionSatisfied)
    return fail(
      res,
      400,
      "Complete the subscription requirement before submitting.",
    );
  if (!(await submitReadyApplication(req.user)))
    return fail(
      res,
      409,
      "Your application changed. Refresh its status before continuing.",
    );
  ok(res, await loadUser(req.user._id), "Application submitted for review");
};

export const listApplications = async (_req, res) => {
  const users = await User.find({ role: "agent", "agentApplication.status": { $ne: "removed" } })
    .populate({ path: "subscription", populate: { path: "plan" } })
    .sort({ "agentApplication.submittedAt": -1, createdAt: -1 });
  ok(res, await Promise.all(users.map(async user => ({ ...user.toJSON(), applicationRequirements: await applicationRequirements(user) }))));
};

export const reviewApplication = async (req, res) => {
  const user = await User.findById(req.params.id).catch(() => null);
  if (!user || user.role !== "agent")
    return fail(res, 404, "Agent application not found.");
  const { action } = req.body;
  const storedStatus = user.agentApplication?.status;
  const status = applicationStatus(user);
  const previouslyApproved = Boolean(user.agentApplication?.approvedAt);
  const transitions = {
    approve: ["pending"],
    reject: ["pending"],
    suspend: ["approved"],
    reactivate: ["suspended"],
  };
  if (!transitions[action]?.includes(status))
    return fail(
      res,
      409,
      "This action is not available for the current application status.",
    );
  if (action === "approve" || (action === "reactivate" && previouslyApproved)) {
    if (action === "approve" && req.body.proofReviewed !== true)
      return fail(res, 400, "Confirm that you have reviewed the agent's professional proof documents.");
    if (action === "approve" && Date.parse(req.body.reviewSubmittedAt) !== new Date(user.agentApplication.submittedAt).getTime())
      return fail(res, 409, "This application was resubmitted. Refresh and review the latest proof documents before approving.");
    const requirements = await applicationRequirements(user);
    if (action === "approve" && !requirements.documentsComplete)
      return fail(res, 400, "The agent must upload professional proof documents before approval.");
    if (!requirements.profileComplete || !requirements.subscriptionSatisfied)
      return fail(
        res,
        400,
        "The agent must complete their profile and subscription requirement before approval.",
      );
  }
  const rejectionReason =
    typeof req.body.rejectionReason === "string"
      ? req.body.rejectionReason.trim()
      : "";
  if (rejectionReason.length > 1000)
    return fail(res, 400, "Keep the rejection reason under 1000 characters.");
  const next = {
    approve: "approved",
    reject: "rejected",
    suspend: "suspended",
    // Restoring an older suspended identity never silently grants approval.
    reactivate: previouslyApproved ? "approved" : "incomplete",
  }[action];
  const changes = {
    "agentApplication.status": next,
    "agentApplication.reviewedAt": new Date(),
    "agentApplication.reviewedBy": req.user._id,
    "agentApplication.rejectionReason":
      action === "reject" ? rejectionReason : "",
    isActive: action !== "suspend",
  };
  if (action === "approve") {
    changes["agentApplication.approvedAt"] = new Date();
    changes["agentApplication.approvedBy"] = req.user._id;
  }
  // Proof documents are kept only until the review: approved or rejected, the files are deleted
  // (below, once the decision is saved). Only the fact that they were reviewed, when and by whom, stays.
  // Approved agents keep their document count (their onboarding stays complete); rejected agents
  // upload new documents to apply again.
  const reviewed = action === "approve" || action === "reject";
  let proofFiles = [];
  if (reviewed) {
    proofFiles = (await User.findById(user._id).select("+agentApplication.proofDocuments"))?.agentApplication?.proofDocuments?.map((doc) => doc.toObject()) || [];
    changes["agentApplication.proofReviewedAt"] = new Date();
    changes["agentApplication.proofReviewedBy"] = req.user._id;
    changes["agentApplication.proofDocuments"] = [];
    if (action === "reject") changes["agentApplication.proofCount"] = 0;
  }
  const updated = await User.findOneAndUpdate(
    { _id: user._id, role: "agent", isActive: user.isActive, "agentApplication.status": storedStatus === undefined ? { $exists: false } : storedStatus, ...(action === "approve" ? { "agentApplication.proofCount": { $gt: 0 }, "agentApplication.submittedAt": user.agentApplication.submittedAt } : {}) },
    { $set: changes },
    { returnDocument: "after", runValidators: true },
  );
  if (!updated)
    return fail(
      res,
      409,
      "Another reviewer updated this application. Refresh to see the latest status.",
    );
  if (action === "suspend") await endSessions(updated._id, "suspended"); // they can sign in again to read why
  if (reviewed) await deleteReviewedProofs(updated._id, proofFiles);
  clearVisibleAgentsCache(); // approved, suspended or restored: whose listings are public changed
  notifyUser(updated._id, {
    type: "agent_application",
    title: `Agent application ${next}`,
    message:
      rejectionReason ||
      (next === "approved"
        ? "Your agent account is approved. You can now access your dashboard."
        : `Your agent application is ${next}.`),
    link: "/agent/status",
  });
  ok(res, await loadUser(updated._id), `Agent application ${next}`);
};
