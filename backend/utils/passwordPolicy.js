// Existing passwords remain valid at sign-in. These rules apply only when setting a password.
export const MIN_PASSWORD_LENGTH = 15;
export const MAX_PASSWORD_BYTES = 72; // bcrypt's input limit; never silently truncate.

export const validPasswordInput = (value) => typeof value === "string" && value.length > 0 && Buffer.byteLength(value, "utf8") <= MAX_PASSWORD_BYTES;

export const passwordProblem = (value) => {
  if (typeof value !== "string" || [...value].length < MIN_PASSWORD_LENGTH)
    return "Use at least 15 characters for your password. A longer passphrase is a good choice.";
  if (!validPasswordInput(value)) return "Use a password of at most 72 bytes.";
  if (/^(.)\1+$/u.test(value) || ["123456789012345", "12345678901234567890", "passwordpassword", "password123456789", "qwertyuiopasdfgh"].includes(value.toLowerCase()))
    return "Choose a less predictable password or a longer passphrase.";
  return null;
};
