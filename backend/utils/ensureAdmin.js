import User from "../models/User.js";

/**
 * Creates the first admin account from ADMIN_EMAIL / ADMIN_PSD when the database has none.
 * After that the account lives in MongoDB: the admin edits their name, email and password
 * from Admin Settings > Admin Account, and restarts never overwrite those changes.
 * Forgotten password: run `npm run admin:reset` (sets the password back to ADMIN_PSD).
 */
export const ensureAdmin = async () => {
  if (await User.exists({ role: "admin" })) return;

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PSD;
  if (!email || !password) {
    console.warn("ADMIN_EMAIL / ADMIN_PSD are not set: no admin account was created.");
    return;
  }
  if (password.length < 8) {
    console.warn("ADMIN_PSD must be at least 8 characters: admin account not created.");
    return;
  }

  // Never promote an existing customer or agent during deployment bootstrap.
  const existing = await User.findOne({ email });
  if (existing) {
    throw new Error("ADMIN_EMAIL belongs to a non-admin account. Use a dedicated admin email.");
  } else {
    try {
      await User.create({ firstName: "Platform", lastName: "Admin", email, password, role: "admin" });
    } catch (error) {
      // Concurrent cold starts may both try to create the same first admin.
      if (error.code !== 11000 || !await User.exists({ email, role: "admin" })) throw error;
    }
  }
  console.log(`Admin account created for ${email}`);
};
