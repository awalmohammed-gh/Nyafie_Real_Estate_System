import { Router } from "express";
import { register, registerAgent, becomeAgent, login, logout, loginFor, logoutFor, me, updateMe, changePassword } from "../controllers/authController.js";
import { protectCustomer, protectAgentSession, protectAdmin } from "../middleware/authMiddleware.js";
import { fail } from "../utils/response.js";
import { uploadCustomerPhoto, removeCustomerPhoto } from "../controllers/customerPhotoController.js";
import { rateLimit } from "../middleware/security.js";
import { verifyEmailFor, resendVerificationFor } from "../controllers/emailVerificationController.js";
import { requestPasswordReset, resetCustomerPassword } from "../controllers/passwordResetController.js";
import { mySessions, endMySessions } from "../controllers/sessionController.js";
import { createGoogleChallenge, googleCustomerLogin } from "../controllers/googleAuthController.js";
import { resendAdminSignIn, verifyAdminSignIn } from "../controllers/adminSignInController.js";

const router = Router();
// A stolen session or distributed IPs must not provide unlimited current-password guesses.
const passwordChangeLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, key: (req) => String(req.user._id), message: "Too many password-change requests. Please wait 15 minutes and try again." });
router.use((_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });
for (const [session, guard] of [["customer", protectCustomer], ["agent", protectAgentSession], ["admin", protectAdmin]]) {
  router.use('/' + session, (req, res, next) => {
    const selected = req.get("X-Session-Domain");
    if (selected && selected !== session) return fail(res, 403, "This session cannot access this area.");
    next();
  });
  router.post('/' + session + '/login', loginFor(session));
  router.post('/' + session + '/logout', logoutFor(session));
  router.get('/' + session + '/me', guard, me);
  router.put('/' + session + '/me', guard, updateMe);
  router.put('/' + session + '/me/password', guard, passwordChangeLimit, changePassword);
  router.get('/' + session + '/sessions', guard, mySessions); // where they're signed in
  router.delete('/' + session + '/sessions/:id', guard, endMySessions); // an id, "others" or "all"
}
// Sign-ups are limited per network in app.js (limits.register); codes per email in utils/emailVerification.js
router.post("/customer/register", register);
const googleLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
router.post("/customer/google/challenge", googleLimit, createGoogleChallenge);
router.post("/customer/google", googleLimit, googleCustomerLogin);
const verificationLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
// New sign-ups, and existing accounts whose email isn't proved yet
for (const session of ["customer", "agent"]) {
  router.post(`/${session}/verify-email`, verificationLimit, verifyEmailFor(session));
  router.post(`/${session}/resend-verification`, verificationLimit, resendVerificationFor(session));
}
const recoveryLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
// One account and one password for both areas, so recovery is the same from either sign-in
for (const session of ["customer", "agent"]) {
  router.post(`/${session}/forgot-password`, recoveryLimit, requestPasswordReset);
  router.post(`/${session}/reset-password`, recoveryLimit, resetCustomerPassword);
}
// Admin sign-in, second step: the code emailed after the password (shares the admin login flood limit)
const adminCodeLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
router.post("/admin/verify-email", adminCodeLimit, verifyAdminSignIn);
router.post("/admin/resend-verification", adminCodeLimit, resendAdminSignIn);
router.post("/agent/register", registerAgent);
router.post("/customer/become-agent", protectCustomer, rateLimit({ windowMs: 15 * 60 * 1000, max: 10, key: (req) => String(req.user._id) }), becomeAgent);
router.post("/customer/me/photo", protectCustomer, rateLimit({ windowMs: 15 * 60 * 1000, max: 20, key: (req) => String(req.user._id) }), uploadCustomerPhoto);
router.delete("/customer/me/photo", protectCustomer, removeCustomerPhoto);
// Existing unscoped URLs remain customer-only aliases. The legacy token is never read.
router.use((req, res, next) => {
  const selected = req.get("X-Session-Domain");
  if (selected && selected !== "customer") return fail(res, 403, "This session cannot access this area.");
  next();
});
router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.get("/me", protectCustomer, me);
router.put("/me", protectCustomer, updateMe);
router.put("/me/password", protectCustomer, passwordChangeLimit, changePassword);
export default router;
