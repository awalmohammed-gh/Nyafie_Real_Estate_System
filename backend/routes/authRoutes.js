import { Router } from "express";
import { register, login, adminLogin, logout, me, updateMe, changePassword } from "../controllers/authController.js";
import { protect, optionalAuth } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/admin/login", adminLogin);
router.post("/logout", logout);
router.get("/me", optionalAuth, me);
router.put("/me", protect, updateMe);
router.put("/me/password", protect, changePassword);

export default router;
