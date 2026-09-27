import User from "../models/User.js";
import { setAuthCookie, clearAuthCookie } from "../utils/generateToken.js";
import { ok, fail } from "../utils/response.js";
import { notifyAdmins } from "../utils/notify.js";
import { siteName } from "../models/Setting.js";

const isEmail = (value) => /^\S+@\S+\.\S+$/.test(String(value || ""));

// The user as the frontend needs it: current subscription included, password never
export const loadUser = (id) => User.findById(id).populate("subscription");

// POST /api/auth/register
export const register = async (req, res) => {
  const { firstName, lastName, email, phone = "", password } = req.body;
  if (!firstName?.trim() || !lastName?.trim())
    return fail(res, 400, "First and last name are required.");
  if (!isEmail(email)) return fail(res, 400, "Enter a valid email address.");
  if (!password || password.length < 8)
    return fail(res, 400, "Use at least 8 characters for your password.");
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
  setAuthCookie(res, user._id);
  notifyAdmins({ type: "user", title: "New account", message: `${user.firstName} ${user.lastName} (${user.email}) signed up.`, link: "/admin/customers" });
  ok(res, await loadUser(user._id), "Account created", 201);
};

const checkCredentials = async (email, password) => {
  const user = await User.findOne({
    email: String(email || "")
      .trim()
      .toLowerCase(),
  }).select("+password");
  if (!user || !password || !(await user.matchPassword(password))) return null;
  return user;
};

// POST /api/auth/login (customers and agents)
export const login = async (req, res) => {
  const user = await checkCredentials(req.body.email, req.body.password);
  if (!user) return fail(res, 401, "Incorrect email or password.");
  if (user.role === "admin")
    return fail(
      res,
      403,
      "Admin accounts sign in from the admin login at /admin.",
    );
  if (!user.isActive)
    return fail(
      res,
      403,
      `This account has been suspended. Please contact ${siteName()} support.`,
    );
  setAuthCookie(res, user._id);
  ok(res, await loadUser(user._id), "Signed in");
};

// POST /api/auth/admin/login (admins only; same error for any failure)
export const adminLogin = async (req, res) => {
  const user = await checkCredentials(req.body.email, req.body.password);
  if (!user || user.role !== "admin" || !user.isActive)
    return fail(res, 401, "Incorrect admin email or password.");
  setAuthCookie(res, user._id);
  ok(res, await loadUser(user._id), "Signed in");
};

// POST /api/auth/logout
export const logout = (_req, res) => {
  clearAuthCookie(res);
  ok(res, null, "Signed out");
};

// GET /api/auth/me (returns null for guests instead of an error)
export const me = async (req, res) => {
  ok(res, req.user ? await loadUser(req.user._id) : null);
};

// PUT /api/auth/me
export const updateMe = async (req, res) => {
  const { firstName, lastName, phone, preferences } = req.body;
  if (firstName !== undefined && !firstName.trim())
    return fail(res, 400, "First name is required.");
  if (lastName !== undefined && !lastName.trim())
    return fail(res, 400, "Last name is required.");

  if (firstName !== undefined) req.user.firstName = firstName;
  if (lastName !== undefined) req.user.lastName = lastName;
  if (phone !== undefined) req.user.phone = phone;
  if (preferences && typeof preferences === "object")
    req.user.preferences = preferences;
  await req.user.save();
  ok(res, await loadUser(req.user._id), "Profile updated");
};

// PUT /api/auth/me/password
export const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select("+password");
  if (!(await user.matchPassword(currentPassword || "")))
    return fail(res, 400, "Your current password is incorrect.");
  if (!newPassword || newPassword.length < 8)
    return fail(res, 400, "Your new password needs at least 8 characters.");
  user.password = newPassword;
  await user.save();
  ok(res, null, "Password updated");
};
