import { Router } from "express";
import { register, registerAgent, login, logout, loginFor, logoutFor, me, updateMe, changePassword } from "../controllers/authController.js";
import { protectCustomer, protectAgentSession, protectAdmin } from "../middleware/authMiddleware.js";
import { fail } from "../utils/response.js";

const router = Router();
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
  router.put('/' + session + '/me/password', guard, changePassword);
}
router.post("/customer/register", register);
router.post("/agent/register", registerAgent);
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
router.put("/me/password", protectCustomer, changePassword);
export default router;
