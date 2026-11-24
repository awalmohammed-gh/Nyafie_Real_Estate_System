import { test } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers";
import { startPolling } from "../src/utils/poll.js";

const setup = (t, visibilityState = "visible") => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"] });
  const listeners = new Set();
  const doc = {
    visibilityState,
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
  const show = (state) => { doc.visibilityState = state; listeners.forEach((listener) => listener()); };
  const tick = async (ms) => { t.mock.timers.tick(ms); await new Promise(setImmediate); };
  return { doc, show, tick, listeners };
};

test("a visible tab polls on time, and a hidden one not at all", async (t) => {
  const { doc, show, tick } = setup(t);
  let runs = 0;
  const stop = startPolling(() => { runs += 1; }, 60000, { doc });
  assert.equal(runs, 0, "the first load is the caller's");
  await tick(60000);
  await tick(60000);
  assert.equal(runs, 2);
  show("hidden");
  await tick(24 * 60 * 60 * 1000);
  assert.equal(runs, 2, "nothing for a whole day in the background");
  stop();
});

test("coming back asks straight away, then carries on as before", async (t) => {
  const { doc, show, tick } = setup(t);
  let runs = 0;
  const stop = startPolling(() => { runs += 1; }, 60000, { doc });
  show("hidden");
  await tick(20000);
  show("visible");
  assert.equal(runs, 1);
  await new Promise(setImmediate); // let it finish
  await tick(60000);
  assert.equal(runs, 2);
  stop();
});

test("flicking between tabs doesn't ask again and again", async (t) => {
  const { doc, show, tick } = setup(t);
  let runs = 0;
  const stop = startPolling(() => { runs += 1; }, 60000, { doc });
  for (let i = 0; i < 10; i++) { show("hidden"); await tick(500); show("visible"); await tick(500); }
  assert.equal(runs, 0);
  stop();
});

test("a chat catches up quickly on return", async (t) => {
  const { doc, show, tick } = setup(t);
  let runs = 0;
  const stop = startPolling(() => { runs += 1; }, 8000, { doc });
  show("hidden");
  await tick(9000);
  show("visible");
  assert.equal(runs, 1);
  stop();
});

test("a tab opened in the background waits until it is looked at", async (t) => {
  const { doc, show, tick } = setup(t, "hidden");
  let runs = 0;
  const stop = startPolling(() => { runs += 1; }, 60000, { doc });
  await tick(300000);
  assert.equal(runs, 0);
  show("visible");
  assert.equal(runs, 1);
  stop();
});

test("runs never overlap, a failure doesn't stop polling, and stopping is final", async (t) => {
  const { doc, show, tick, listeners } = setup(t);
  let runs = 0, finish;
  const stop = startPolling(() => { runs += 1; return new Promise((_yes, no) => { finish = () => no(new Error("offline")); }); }, 1000, { doc });
  await tick(1000);
  await tick(1000);
  assert.equal(runs, 1, "still waiting for the first");
  finish();
  await new Promise(setImmediate);
  await tick(1000);
  assert.equal(runs, 2);
  stop();
  finish();
  await tick(10000);
  show("visible");
  assert.equal(runs, 2);
  assert.equal(listeners.size, 0);
});
