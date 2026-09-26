import jwt from "jsonwebtoken";

const WEEK = 7 * 24 * 60 * 60 * 1000;

// Signs a JWT and stores it in an HTTP-only cookie (never readable by frontend JS)
export const setAuthCookie = (res, userId) => {
  const token = jwt.sign({ id: userId }, process.env.JWT_KEY, { expiresIn: "7d" });
  const production = process.env.NODE_ENV === "production";
  res.cookie("token", token, {
    httpOnly: true,
    secure: production,
    sameSite: production ? "none" : "lax",
    maxAge: WEEK,
  });
};

export const clearAuthCookie = (res) => {
  const production = process.env.NODE_ENV === "production";
  res.clearCookie("token", { httpOnly: true, secure: production, sameSite: production ? "none" : "lax" });
};
