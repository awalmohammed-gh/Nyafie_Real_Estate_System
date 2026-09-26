import { fail } from "../utils/response.js";

// Use after `protect`: only admins may continue
export const adminOnly = (req, res, next) => {
  if (req.user?.role !== "admin") return fail(res, 403, "Admin access only.");
  next();
};
