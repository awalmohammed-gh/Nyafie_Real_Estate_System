import User from "../models/User.js";

// Creates (or keeps in sync) the main admin account from ADMIN_EMAIL / ADMIN_PSD.
// The admin never comes from public registration and the password never leaves the server.
export const ensureAdmin = async () => {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PSD;
  if (!email || !password) {
    console.warn("ADMIN_EMAIL / ADMIN_PSD are not set: no admin account was created.");
    return;
  }
  if (password.length < 8) {
    console.warn("ADMIN_PSD must be at least 8 characters: admin account not updated.");
    return;
  }

  let admin = await User.findOne({ email }).select("+password");
  if (!admin) {
    admin = new User({ firstName: "Platform", lastName: "Admin", email, password, role: "admin" });
    await admin.save();
    console.log(`Admin account created for ${email}`);
    return;
  }

  let changed = false;
  if (admin.role !== "admin") {
    admin.role = "admin";
    changed = true;
  }
  if (!admin.isActive) {
    admin.isActive = true;
    changed = true;
  }
  if (!(await admin.matchPassword(password))) {
    admin.password = password; // re-hashed by the pre-save hook
    changed = true;
  }
  if (changed) {
    await admin.save();
    console.log(`Admin account updated for ${email}`);
  }
};
