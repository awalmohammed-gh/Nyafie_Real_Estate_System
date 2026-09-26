import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { clearAuthCookie } from "../utils/generateToken.js";
import { fail } from "../utils/response.js";

const userFromCookie = async (req) => {
  const token = req.cookies?.token;
  if (!token) return null;
  try {
    const { id } = jwt.verify(token, process.env.JWT_KEY);
    return await User.findById(id);
  } catch {
    return null; // expired or tampered token
  }
};

// Requires a signed-in, active user
export const protect = async (req, res, next) => {
  try {
    const user = await userFromCookie(req);
    if (!user || !user.isActive) {
      if (req.cookies?.token) clearAuthCookie(res);
      return fail(res, 401, user && !user.isActive ? "Your account has been suspended." : "Please sign in to continue.");
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

// Attaches the user when signed in, but lets guests through (e.g. guest inquiries)
export const optionalAuth = async (req, _res, next) => {
  try {
    const user = await userFromCookie(req);
    if (user?.isActive) req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
