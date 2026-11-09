import { test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { passwordProblem } from "../utils/passwordPolicy.js";

test("new passwords need long passphrases and cannot exceed bcrypt's byte limit", () => {
  for (const password of [null, {}, "short", "NewPassword123", "a".repeat(15), "passwordpassword", "123456789012345", "😀".repeat(19)]) assert.ok(passwordProblem(password));
  for (const password of ["a longer private passphrase", "StrongNewPassword123", "Ghana homes 2026!", "界".repeat(23) + "a"]) assert.equal(passwordProblem(password), null);
});

test("existing short passwords still work, but overlong values cannot exploit bcrypt truncation", async () => {
  const legacy = new User({ password: await bcrypt.hash("OldPass1", 4) });
  assert.equal(await legacy.matchPassword("OldPass1"), true);
  const full = "a".repeat(72);
  const user = new User({ password: await bcrypt.hash(full, 4) });
  assert.equal(await user.matchPassword(full), true);
  assert.equal(await user.matchPassword(full + "different"), false);
  for (const invalid of [null, [], {}, ""]) assert.equal(await user.matchPassword(invalid), false);
});
