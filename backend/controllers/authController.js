import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { setAuthCookie, clearAuthCookie } from "../utils/generateToken.js";
import { ok, fail } from "../utils/response.js";
import { notifyAdmins } from "../utils/notify.js";
import { onboardingState, validPhone } from "../utils/agentApplication.js";

const isEmail = (value) => typeof value === "string" && value.length <= 254 && /^\S+@\S+\.\S+$/.test(value.trim());
const text = (value) => (typeof value === "string" ? value.trim() : "");
// bcrypt only uses the first 72 bytes, so longer passwords are refused rather than silently cut
const passwordProblem = (value) =>
  typeof value !== "string" || value.length < 8 ? "Use at least 8 characters for your password." : Buffer.byteLength(value, "utf8") > 72 ? "Use a password of at most 72 bytes." : null;
// Compared against when no account matches, so a sign-in takes as long whether or not the email exists
const DUMMY_HASH = bcrypt.hashSync("homebase-timing-equaliser", 10);

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
  if (await User.exists({ email: email.trim().toLowerCase() })) {
    return fail(
      res,
      409,
      "An account with this email already exists. Try signing in.",
    );
  }

  // Role is never taken from the request: every new account is a normal user
  const user = await User.create({
    firstName,
    lastName,
    email,
    phone,
    password,
    role: "user",
  });
  setAuthCookie(res, user._id, "customer");
  notifyAdmins({
    type: "user",
    title: "New account",
    message: `${user.firstName} ${user.lastName} (${user.email}) signed up.`,
    link: "/admin/customers",
  });
  ok(res, await loadUser(user._id), "Account created", 201);
};

// A distinct agent identity starts with zero workspace permissions.
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
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    Buffer.byteLength(password, "utf8") > 72
  )
    return fail(
      res,
      400,
      "Use a password with at least 8 characters and no more than 72 bytes.",
    );
  if (password !== confirmPassword)
    return fail(res, 400, "Passwords do not match.");
  if (await User.exists({ email: normalizedEmail }))
    return fail(
      res,
      409,
      "An account with this email already exists. Use your existing sign-in or a different email.",
    );
  let user;
  try {
    user = await User.create({
      firstName: names[0],
      lastName: names.slice(1).join(" "),
      email: normalizedEmail,
      phone,
      password,
      role: "agent",
      isActive: true,
      agentApplication: { status: "incomplete" },
    });
  } catch (error) {
    if (error.code === 11000)
      return fail(res, 409, "An account with this email already exists.");
    throw error;
  }
  setAuthCookie(res, user._id, "agent");
  ok(
    res,
    await loadUser(user._id),
    "Agent account created. Complete your application to continue.",
    201,
  );
};

const checkCredentials = async (email, password) => {
  if (typeof email !== "string" || typeof password !== "string" || !password || Buffer.byteLength(password, "utf8") > 72) return null;
  const user = await User.findOne({ email: email.trim().toLowerCase().slice(0, 254) }).select("+password");
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH); // same work as a real check: no account-existence timing signal
    return null;
  }
  return (await user.matchPassword(password)) ? user : null;
};

// Each login authenticates only the role named by its route.
export const loginFor = (session) => async (req, res) => {
  const user = await checkCredentials(req.body.email, req.body.password);
  const role = session === "customer" ? "user" : session;
  if (!user || user.role !== role || (session !== "agent" && !user.isActive))
    return fail(res, 401, "Incorrect email or password for this area.");
  // Removed providers: a plain message, never the internal reason
  if (user.agentApplication?.status === "removed")
    return fail(res, 403, "Your provider account is no longer active. Contact HomeBase support if you believe this is an error.");
  setAuthCookie(res, user._id, session);
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
  const user = await User.findById(req.user._id).select("+password");
  if (typeof currentPassword !== "string" || !(await user.matchPassword(currentPassword)))
    return fail(res, 400, "Your current password is incorrect.");
  const problem = passwordProblem(newPassword);
  if (problem) return fail(res, 400, problem.replace("your password", "your new password"));
  user.password = newPassword;
  await user.save();
  ok(res, null, "Password updated");
};
