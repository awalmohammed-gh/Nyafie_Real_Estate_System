import { test } from "node:test";
import assert from "node:assert/strict";
import { retryUnreachable } from "../src/utils/googleIdentity.js";

const setup = async (t) => {
  const previous = { window: globalThis.window, document: globalThis.document };
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  const scripts = [], timers = new Map();
  let timerId = 0;
  globalThis.window = {
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  };
  globalThis.document = {
    createElement() { return { remove() { this.removed = true; } }; },
    head: { appendChild(script) { scripts.push(script); } },
  };
  const { loadGoogleIdentity } = await import(`../src/utils/googleIdentity.js?test=${encodeURIComponent(t.name)}`);
  return { loadGoogleIdentity, scripts, timers };
};

test("Google SDK requests share one script and resolve to the loaded SDK", async (t) => {
  const { loadGoogleIdentity, scripts, timers } = await setup(t);
  const first = loadGoogleIdentity();
  assert.equal(loadGoogleIdentity(), first);
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, "https://accounts.google.com/gsi/client");
  const sdk = { initialize() {}, renderButton() {} };
  window.google = { accounts: { id: sdk } };
  scripts[0].onload();
  assert.equal(await first, sdk);
  assert.equal(await loadGoogleIdentity(), sdk);
  assert.equal(timers.size, 0);
});

test("a failed Google script can be retried without stale events cancelling the new attempt", async (t) => {
  const { loadGoogleIdentity, scripts } = await setup(t);
  const failed = loadGoogleIdentity();
  const lateError = scripts[0].onerror;
  scripts[0].onerror();
  await assert.rejects(failed, /accounts\.google\.com/);
  assert.equal(scripts[0].removed, true);
  const retry = loadGoogleIdentity();
  assert.equal(scripts.length, 2);
  lateError();
  assert.equal(loadGoogleIdentity(), retry);
  window.google = { accounts: { id: {} } };
  scripts[1].onload();
  assert.equal(await retry, window.google.accounts.id);
});

test("a timeout or a script without the Google SDK offers a fresh retry", async (t) => {
  const { loadGoogleIdentity, scripts, timers } = await setup(t);
  const timedOut = loadGoogleIdentity();
  [...timers.values()][0]();
  await assert.rejects(timedOut, /could not load/);
  const missingSdk = loadGoogleIdentity();
  scripts[1].onload();
  await assert.rejects(missingSdk, /could not load/);
  const retry = loadGoogleIdentity();
  assert.equal(scripts.length, 3);
  window.google = { accounts: { id: {} } };
  scripts[2].onload();
  await retry;
});

test("a synchronous script insertion failure does not poison future Google sign-in attempts", async (t) => {
  const { loadGoogleIdentity } = await setup(t);
  document.head.appendChild = () => { throw new Error("Blocked script"); };
  const failed = loadGoogleIdentity();
  await assert.rejects(failed, /could not load/);
  const retry = loadGoogleIdentity();
  assert.notEqual(retry, failed);
  await assert.rejects(retry, /could not load/);
});

test("Google challenge creation recovers from a temporary gateway failure", async () => {
  let calls = 0;
  const delays = [];
  const challenge = { clientId: "client", nonce: "nonce", challenge: "challenge" };
  const result = await retryUnreachable(async () => {
    if (++calls < 3) throw Object.assign(new Error("Bad gateway"), { status: calls === 1 ? 502 : 504 });
    return challenge;
  }, async (ms) => { delays.push(ms); });
  assert.equal(result, challenge);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [500, 1000]);
});

test("Google challenge retries are bounded and explain an unreachable backend", async () => {
  let calls = 0;
  await assert.rejects(retryUnreachable(async () => {
    calls++;
    throw Object.assign(new Error("Bad gateway"), { status: 502 });
  }, async () => {}), /backend is running/);
  assert.equal(calls, 7);
});

test("Google challenges do not retry configuration, rate-limit or authorization errors", async () => {
  for (const status of [400, 401, 403, 429, 503]) {
    let calls = 0;
    const error = Object.assign(new Error("Original server message"), { status });
    await assert.rejects(retryUnreachable(async () => { calls++; throw error; }, async () => { assert.fail("Must not retry"); }), (actual) => actual === error);
    assert.equal(calls, 1);
  }
});
