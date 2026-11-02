import { OAuth2Client } from "google-auth-library";
import { HttpError } from "./response.js";

export const googleClientId = () => {
  const value = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!value || !/^[a-zA-Z0-9_.-]+\.apps\.googleusercontent\.com$/.test(value))
    throw new HttpError(503, "Google sign-in is not configured yet. You can still sign in with email and password.");
  return value;
};

const client = new OAuth2Client();
export const googleIdentity = {
  async verify(credential, audience) {
    const ticket = await client.verifyIdToken({ idToken: credential, audience });
    return ticket.getPayload();
  },
};

export const validGoogleClaims = (payload, audience, nonce) => Boolean(
  payload && ["accounts.google.com", "https://accounts.google.com"].includes(payload.iss) &&
  payload.aud === audience && Number.isFinite(payload.exp) && payload.exp > Date.now() / 1000 &&
  typeof payload.sub === "string" && payload.sub.length > 0 && payload.sub.length <= 255 &&
  payload.nonce === nonce && payload.email_verified === true &&
  typeof payload.email === "string" && payload.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) &&
  (payload.email.toLowerCase().endsWith("@gmail.com") || (typeof payload.hd === "string" && payload.hd.length > 0))
);
