import User from "../models/User.js";
import {
  applicationRequirements,
  applicationStatus,
  validateAgentProfile,
} from "../utils/agentApplication.js";
import { resolveImages } from "../utils/uploadImages.js";
import { notifyAdmins, notifyUser } from "../utils/notify.js";
import { ok, fail } from "../utils/response.js";
import { loadUser } from "./authController.js";
import { reconcileLatestPayment } from "./subscriptionController.js";

// GET /api/agents/application -> the onboarding status page. Re-checks an unfinished payment with
// Paystack first, and submits the application for review once profile and subscription are done.
export const getApplication = async (req, res) => {
  await reconcileLatestPayment(req.user);
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
  const { firstName, lastName, phone, profile } = validateAgentProfile(
    req.body,
  );
  const images = await resolveImages(
    [
      (req.body.profileImage !== undefined ? req.body.profileImage : req.user.profileImage) || "",
      ...(profile.agentType === "agency" && req.body.agencyLogo
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
    profile.agentType === "agency" && req.body.agencyLogo
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
  const { firstName, lastName, phone, profile } = validateAgentProfile(req.body);
  const avatar = req.body.profileImage !== undefined ? req.body.profileImage : req.user.profileImage;
  const logo = profile.agentType === "agency" ? req.body.agencyLogo ?? req.user.agentApplication?.agencyLogo : "";
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
  if (!requirements.profileComplete || !requirements.subscriptionSatisfied)
    return false;
  const updated = await User.findOneAndUpdate(
    {
      _id: user._id,
      role: "agent",
      isActive: true,
      "agentApplication.status": "incomplete",
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

export const listApplications = async (_req, res) =>
  ok(
    res,
    await User.find({ role: "agent" })
      .populate({ path: "subscription", populate: { path: "plan" } })
      .sort({ "agentApplication.submittedAt": -1, createdAt: -1 }),
  );

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
    const requirements = await applicationRequirements(user);
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
  const updated = await User.findOneAndUpdate(
    { _id: user._id, role: "agent", isActive: user.isActive, "agentApplication.status": storedStatus === undefined ? { $exists: false } : storedStatus },
    { $set: changes },
    { returnDocument: "after", runValidators: true },
  );
  if (!updated)
    return fail(
      res,
      409,
      "Another reviewer updated this application. Refresh to see the latest status.",
    );
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
