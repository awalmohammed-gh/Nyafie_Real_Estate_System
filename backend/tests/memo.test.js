import { test } from "node:test";
import assert from "node:assert/strict";
import { memo } from "../utils/memo.js";

// A controllable clock and a load function that counts its calls
const setup = (ttl = 1000) => {
  let clock = 0;
  let calls = 0;
  let fail = false;
  const load = async () => {
    calls += 1;
    if (fail) throw new Error("database unavailable");
    return { version: calls };
  };
  const get = memo(load, ttl, { enabled: true, now: () => clock });
  return { get, tick: (ms) => { clock += ms; }, calls: () => calls, failNext: (value) => { fail = value; } };
};

test("a value is reused until it expires, then loaded again", async () => {
  const cache = setup(1000);
  assert.deepEqual(await cache.get(), { version: 1 });
  cache.tick(999);
  assert.deepEqual(await cache.get(), { version: 1 });
  assert.equal(cache.calls(), 1, "one database call for every request in the window");
  cache.tick(2);
  assert.deepEqual(await cache.get(), { version: 2 });
});

test("many requests at once share one load (no stampede when it expires)", async () => {
  const cache = setup();
  const results = await Promise.all(Array.from({ length: 50 }, () => cache.get()));
  assert.equal(cache.calls(), 1);
  assert.ok(results.every((result) => result.version === 1));
});

test("a failed load is not kept: the next request tries again", async () => {
  const cache = setup();
  cache.failNext(true);
  await assert.rejects(cache.get(), /database unavailable/);
  cache.failNext(false);
  assert.deepEqual(await cache.get(), { version: 2 });
});

test("clear() forgets the value at once, even one still loading", async () => {
  const cache = setup();
  await cache.get();
  cache.get.clear();
  assert.deepEqual(await cache.get(), { version: 2 }, "an admin change is seen on the next request");
  // Cleared while a load is running: that (possibly outdated) result is returned but not kept
  cache.tick(5000);
  const loading = cache.get();
  cache.get.clear();
  assert.deepEqual(await loading, { version: 3 });
  assert.deepEqual(await cache.get(), { version: 4 });
});

test("under the test runner nothing is kept unless asked", async () => {
  let calls = 0;
  const get = memo(async () => ++calls, 60_000);
  await get();
  await get();
  assert.equal(calls, 2);
});
