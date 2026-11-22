import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Plan from "../models/Plan.js";
import { setAuthCookie, clearAuthCookie } from "../utils/generateToken.js";
import { ok, fail } from "../utils/response.js";
import { onboardingState, validPhone } from "../utils/agentApplication.js";
import { CUSTOMER_TAB_HEADER, validTabSecret } from "../utils/customerTabSession.js";
import { matchesSessionRole } from "../utils/sessionAccess.js";
import { loginAttempts, rejectLoginAttempt } from "../utils/loginAttempts.js";
import { startEmailVerification } from "./emailVerificationController.js";
import { pendingRegistrationFor, resumeRegistration, startRegistration } from "./registrationController.js";
import { passwordProblem, validPasswordInput } from "../utils/passwordPolicy.js";
import { getSettings, siteName } from "../models/Setting.js";

const isEmail = (value) => typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const text = (value) => (typeof value === "string" ? value.trim() : "");
// Compared against when no account matches, so a sign-in takes as long whether or not the email exists
const DUMMY_HASH = bcrypt.hashSync("nyafie-timing-equaliser", 10);

// The user as the frontend needs it: current subscription included, password never.
// Agents also get their server-computed onboarding state (next step, payment, approval).
export const loadUser = async (id) => {
  const user = await User.findById(id).populate("subscription");
  if (user?.role !== "agent") return user;
  const data = { ...user.toJSON(), onboarding: await onboardingState(user) };
  delete data.removal; // internal moderation record: admins only
  // Agency staff work under the owner's plan: share its name, logo and plan status (no billing details)
  if (user.agency?.owner) {
    const owner = await User.findById(user.agency.owner).populate("subscription");
    const sub = owner?.subscription;
    data.agency = {
      ...data.agency,
      name: owner?.agentApplication?.companyName || "",
      logo: owner?.agentApplication?.agencyLogo || "",
      subscription: sub ? { id: String(sub._id), plan: String(sub.plan), planName: sub.planName, accountType: sub.accountType, status: sub.status, paymentStatus: sub.paymentStatus, startDate: sub.startDate, expiresAt: sub.expiresAt } : null,
    };
  }
  return data;
};

// POST /api/auth/register
export const register = async (req, res) => {
  if (!validTabSecret(req.get(CUSTOMER_TAB_HEADER))) return fail(res, 400, "Reload this tab to start a secure sign-in session.");
  const { email, password } = req.body;
  const firstName = text(req.body.firstName);
  const lastName = text(req.body.lastName);
  const phone = text(req.body.phone);
  if (!firstName || !lastName || firstName.length > 80 || lastName.length > 80)
    return fail(res, 400, "First and last name are required.");
  if (!isEmail(email)) return fail(res, 400, "Enter a valid email address.");
  if (phone && !validPhone(phone)) return fail(res, 400, "Enter a valid phone number.");
  const problem = passwordProblem(password);
  if (problem) return fail(res, 400, problem);
  const normalizedEmail = email.trim().toLowerCase();
  if (await User.exists({ email: normalizedEmail }))
    return fail(res, 409, "An account with this email already exists. Try signing in.");
  // The account is created only once the emailed code is entered (controllers/registrationController.js).
  // Role is never taken from the request: every new account is a normal user.
  return startRegistration(req, res, "customer", { email: normalizedEmail, password, firstName, lastName, phone });
};

// New agent registrations start with zero workspace permissions.
export const registerAgent = async (req, res) => {
  const { fullName, email, phone, password, confirmPassword } = req.body;
  const normalizedEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";
  const names =
    typeof fullName === "string" ? fullName.trim().split(/\s+/) : [];
  if (names.length < 2 || fullName.length > 160)
    return fail(res, 400, "Enter your first and last name.");
  if (!isEmail(normalizedEmail) || normalizedEmail.length > 254)
    return fail(res, 400, "Enter a valid email address.");
  if (!validPhone(phone)) return fail(res, 400, "Enter a valid phone number.");
  const problem = passwordProblem(password);
  if (problem) return fail(res, 400, problem);
  if (password !== confirmPassword)
    return fail(res, 400, "Passwords do not match.");
  if (await User.exists({ email: normalizedEmail }))
    return fail(
      res,
      409,
      "An account with this email already exists. Use your existing sign-in or a different email.",
    );
  // Like customers, the agent account (with zero permissions) is created once the emailed code is entered
  return startRegistration(req, res, "agent", { email: normalizedEmail, password, firstName: names[0], lastName: names.slice(1).join(" "), phone: phone.trim() });
};

// POST /api/auth/customer/become-agent: reuse the authenticated customer's identity.
// Opening onboarding creates no subscription and grants no publishing/dashboard permissions.
export const becomeAgent = async (req, res) => {
  const settings = await getSettings();
  const plan = settings.agent.requireSubscription
    ? await Plan.findById(req.body?.planId).catch(() => null)
    : null;
  if (settings.agent.requireSubscription && !plan?.isActive) return fail(res, 404, "This plan is not available.");
  let user = req.user;
  if (user.role === "user") {
    user = await User.findOneAndUpdate(
      { _id: user._id, role: "user", isActive: true },
      { $set: { role: "agent", customerAccess: true, agentApplication: { status: "incomplete", agentType: plan?.accountType || "individual" } } },
      { returnDocument: "after", runValidators: true },
    ).select("+sessionVersion");
    // A concurrent click may already have opened onboarding; never overwrite its progress.
    if (!user) user = await User.findById(req.user._id).select("+sessionVersion");
  }
  if (!user || user.role !== "agent" || !user.customerAccess || !user.isActive || user.agentApplication?.status === "removed")
    return fail(res, 403, "Your account cannot start agent onboarding. Contact support for help.");
  setAuthCookie(res, user._id, "agent", user.sessionVersion);
  ok(res, await loadUser(user._id), "Continue with your existing account");
};

const checkCredentials = async (email, password) => {
  if (typeof email !== "string" || typeof password !== "string" || !password || Buffer.byteLength(password, "utf8") > 72) return null;
  const user = await User.findOne({ email: email.trim().toLowerCase().slice(0, 254) }).select("+password +sessionVersion");
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH); // same work as a real check: no account-existence timing signal
    return null;
  }
  return (await user.matchPassword(password)) ? user : null;
};

// Each login authenticates only the role named by its route.
export const loginFor = (session) => async (req, res) => {
  if (session === "customer" && !validTabSecret(req.get(CUSTOMER_TAB_HEADER))) return fail(res, 400, "Reload this tab to start a secure sign-in session.");
  const { email, password } = req.body || {};
  if (!isEmail(email) || typeof password !== "string" || !password || Buffer.byteLength(password, "utf8") > 72)
    return fail(res, 400, "Enter a valid email address and password.");
  const attempt = await loginAttempts.check(email);
  if (attempt.retryAfter) return rejectLoginAttempt(res, attempt);
  const user = await checkCredentials(email, password);
  if (!user) {
    // An unfinished sign-up with these details: send a fresh code rather than "incorrect password"
    const pending = session !== "admin" ? await pendingRegistrationFor(email.trim().toLowerCase(), password, session) : null;
    if (!pending) return rejectLoginAttempt(res, await loginAttempts.failure(email));
    const cleared = await loginAttempts.success(email);
    if (cleared.retryAfter) return rejectLoginAttempt(res, cleared);
    return resumeRegistration(res, session, pending);
  }
  if (!matchesSessionRole(user, session) || (session !== "agent" && !user.isActive))
    return fail(res, 401, "Incorrect email or password for this area.");
  // Removed providers: a plain message, never the internal reason
  if (user.agentApplication?.status === "removed")
    return fail(res, 403, `Your provider account is no longer active. Contact ${siteName()} support if you believe this is an error.`);
  const cleared = await loginAttempts.success(email);
  if (cleared.retryAfter) return rejectLoginAttempt(res, cleared);
  if (session === "customer" && !user.emailVerifiedAt) return startEmailVerification(req, res, user);
  setAuthCookie(res, user._id, session, user.sessionVersion, req.get(CUSTOMER_TAB_HEADER));
  ok(res, await loadUser(user._id), "Signed in");
};
export const login = loginFor("customer");
export const adminLogin = loginFor("admin");
export const logoutFor = (session) => (_req, res) => {
  clearAuthCookie(res, session);
  ok(res, null, "Signed out");
};
export const logout = logoutFor("customer");

// GET /api/auth/:session/me (the matching role middleware runs first)
export const me = async (req, res) => {
  ok(res, req.user ? await loadUser(req.user._id) : null);
};

// PUT /api/auth/me
// Only names, phone and display preferences can change here; role, status, email,
// subscription and approval are never read from this request.
export const updateMe = async (req, res) => {
  const { firstName, lastName, phone, preferences } = req.body;
  if (firstName !== undefined && (!text(firstName) || text(firstName).length > 80))
    return fail(res, 400, "First name is required.");
  if (lastName !== undefined && (!text(lastName) || text(lastName).length > 80))
    return fail(res, 400, "Last name is required.");
  if (phone !== undefined && text(phone) && !validPhone(phone))
    return fail(res, 400, "Enter a valid phone number.");
  if (preferences !== undefined && (!preferences || typeof preferences !== "object" || Array.isArray(preferences) || JSON.stringify(preferences).length > 4000))
    return fail(res, 400, "Invalid preferences.");

  if (firstName !== undefined) req.user.firstName = text(firstName);
  if (lastName !== undefined) req.user.lastName = text(lastName);
  if (phone !== undefined) req.user.phone = text(phone);
  if (preferences !== undefined) req.user.preferences = preferences;
  await req.user.save();
  ok(res, await loadUser(req.user._id), "Profile updated");
};

// PUT /api/auth/me/password
export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select("+password +sessionVersion");
  if (!user || !validPasswordInput(currentPassword) || !(await user.matchPassword(currentPassword)))
    return fail(res, 400, "Your current password is incorrect.");
  const problem = passwordProblem(newPassword);
  if (problem) return fail(res, 400, problem.replace("your password", "your new password"));
  user.password = newPassword;
  await user.save();
  setAuthCookie(res, user._id, req.sessionDomain, user.sessionVersion, req.get(CUSTOMER_TAB_HEADER));
  ok(res, null, "Password updated. Other sessions have been signed out.");
};
