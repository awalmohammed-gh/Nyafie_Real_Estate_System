import { test } from "node:test";
import assert from "node:assert/strict";
import { createLoginAttempts, LOGIN_LOCK_MS } from "../utils/loginAttempts.js";

test("three failures lock for a full 30 minutes starting at the third failure", async () => {
  let time = 1000000;
  const attempts = createLoginAttempts({ persistent: () => false, now: () => time });
  assert.deepEqual(await attempts.failure("user@example.test"), { failures: 1, retryAfter: 0 });
  time += 10 * 60 * 1000;
  assert.deepEqual(await attempts.failure(" USER@example.test "), { failures: 2, retryAfter: 0 });
  time += 10 * 60 * 1000;
  assert.deepEqual(await attempts.failure("user@example.test"), { failures: 3, retryAfter: 1800 });
  time += LOGIN_LOCK_MS - 1000;
  assert.equal((await attempts.check("user@example.test")).retryAfter, 1);
  assert.equal((await attempts.success("user@example.test")).retryAfter, 1, "correct passwords cannot erase an active lock");
  assert.equal((await attempts.failure("user@example.test")).retryAfter, 1, "concurrent/blocked failures do not extend the lock");
  time += 1000;
  assert.deepEqual(await attempts.check("user@example.test"), { failures: 0, retryAfter: 0 });
  assert.deepEqual(await attempts.failure("user@example.test"), { failures: 1, retryAfter: 0 });
});

test("successful sign-ins reset failures, other accounts stay independent, and incomplete sequences expire", async () => {
  let time = 1000000;
  const attempts = createLoginAttempts({ persistent: () => false, now: () => time });
  await attempts.failure("first@example.test");
  await attempts.failure("first@example.test");
  assert.equal((await attempts.check("second@example.test")).failures, 0);
  assert.deepEqual(await attempts.success("first@example.test"), { failures: 0, retryAfter: 0 });
  assert.equal((await attempts.failure("first@example.test")).failures, 1);
  time += LOGIN_LOCK_MS;
  assert.equal((await attempts.failure("first@example.test")).failures, 1);
});
