import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeMessages } from "../src/utils/messages.js";

const message = (id, minute, extra = {}) => ({ id, createdAt: new Date(2026, 0, 1, 12, minute).toISOString(), ...extra });

test("earlier and new pages join into one thread, each message once, oldest first", () => {
  const latest = [message("c", 3), message("d", 4)];
  const withEarlier = mergeMessages(latest, [message("a", 1), message("b", 2)]);
  assert.deepEqual(withEarlier.map((m) => m.id), ["a", "b", "c", "d"]);
  const refreshed = mergeMessages(withEarlier, [message("d", 4, { read: true }), message("e", 5)]);
  assert.deepEqual(refreshed.map((m) => m.id), ["a", "b", "c", "d", "e"], "earlier messages stay while the latest refresh");
  assert.equal(refreshed[3].read, true, "the newest copy wins");
});

test("messages sent at the same moment keep a steady order, and empty threads are fine", () => {
  assert.deepEqual(mergeMessages([message("b", 1)], [message("a", 1)]).map((m) => m.id), ["a", "b"]);
  assert.deepEqual(mergeMessages(undefined, []), []);
});
