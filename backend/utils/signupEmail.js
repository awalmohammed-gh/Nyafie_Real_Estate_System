import { escapeRegex } from "./validation.js";

/**
 * Which emails may open an account, and which emails are the same inbox.
 * New email/password sign-ups use a Gmail address; "Continue with Google" also takes Google Workspace
 * accounts, which Google itself has confirmed. Existing accounts keep their address.
 * SIGNUP_EMAILS=any lets every email provider sign up again.
 */
const GMAIL = ["gmail.com", "googlemail.com"]; // two names for the same service

const split = (email) => {
  const address = String(email || "").trim().toLowerCase();
  const at = address.lastIndexOf("@");
  return [address.slice(0, at), address.slice(at + 1), address];
};
export const isGmail = (email) => GMAIL.includes(split(email)[1]);
const gmailOnly = () => process.env.SIGNUP_EMAILS?.trim().toLowerCase() !== "any";

// Gmail ignores dots and anything after a "+": k.ofi+home@gmail.com is kofi@gmail.com
const gmailName = (email) => split(email)[0].split("+")[0].replaceAll(".", "");

/** One value per inbox, stored on new accounts (unique index): each Gmail inbox opens one account. */
export const inboxKey = (email) => (isGmail(email) ? `${gmailName(email)}@gmail.com` : split(email)[2]);

/** MongoDB filter for the accounts of this inbox, including ones from before inbox keys were stored. */
export const sameInbox = (email) => {
  const address = split(email)[2];
  if (!isGmail(email)) return { email: address };
  const name = [...gmailName(email)].map(escapeRegex).join("\\.?");
  return { $or: [{ email: address }, { emailKey: inboxKey(email) }, { email: new RegExp(`^${name}(\\+[^@]*)?@(gmail|googlemail)\\.com$`) }] };
};

/** Why this email can't open an account, or null. */
export const signupEmailProblem = (email) => {
  if (isGmail(email)) return gmailName(email) ? null : "Enter a valid Gmail address.";
  return gmailOnly() ? "Use a Gmail address (you@gmail.com) to create an account." : null;
};
