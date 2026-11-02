import { test } from "node:test";
import assert from "node:assert/strict";
import { OAuth2Client } from "google-auth-library";
import { googleClientId, googleIdentity, validGoogleClaims } from "../utils/googleIdentity.js";

const audience = "test-client.apps.googleusercontent.com";
const nonce = "test-nonce";
const claims = () => ({ sub: "google-person-1", email: "customer@gmail.com", email_verified: true, iss: "https://accounts.google.com", aud: audience, nonce, exp: Math.floor(Date.now() / 1000) + 300 });

test("Google identity validation requires audience, issuer, expiry, nonce and authoritative email ownership", () => {
  assert.equal(validGoogleClaims(claims(), audience, nonce), true);
  assert.equal(validGoogleClaims({ ...claims(), email: "customer@company.test", hd: "company.test" }, audience, nonce), true);
  for (const fields of [{ aud: "another-client" }, { iss: "https://attacker.test" }, { exp: 0 }, { nonce: "wrong" }, { email_verified: false }, { sub: "" }, { email: "customer@third-party.test" }, { email: "invalid" }])
    assert.equal(validGoogleClaims({ ...claims(), ...fields }, audience, nonce), false);
});

test("Google token signatures are verified through the official library with the configured audience", async (t) => {
  let options;
  const expected = claims();
  t.mock.method(OAuth2Client.prototype, "verifyIdToken", async (input) => { options = input; return { getPayload: () => expected }; });
  assert.deepEqual(await googleIdentity.verify("signed-google-token", audience), expected);
  assert.deepEqual(options, { idToken: "signed-google-token", audience });
  const previous = process.env.GOOGLE_CLIENT_ID;
  try {
    delete process.env.GOOGLE_CLIENT_ID;
    assert.throws(googleClientId, /not configured/);
    process.env.GOOGLE_CLIENT_ID = audience;
    assert.equal(googleClientId(), audience);
  } finally { if (previous === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = previous; }
});
