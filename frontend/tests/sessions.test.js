import { test } from "node:test";
import assert from "node:assert/strict";
import { areaLabel, orderSessions, otherDevices, sessionDetail } from "../src/utils/sessions.js";

test("this device is listed first, then the most recently used", () => {
  const list = [{ id: "a", lastUsedAt: "2026-01-01" }, { id: "b", lastUsedAt: "2026-03-01" }, { id: "c", current: true, lastUsedAt: "2025-01-01" }];
  assert.deepEqual(orderSessions(list).map((entry) => entry.id), ["c", "b", "a"]);
  assert.deepEqual(list.map((entry) => entry.id), ["a", "b", "c"], "the list itself isn't changed");
  assert.equal(otherDevices(list), 2);
  assert.deepEqual([orderSessions(), otherDevices()], [[], 0]);
});

test("a session is described by its area and network", () => {
  assert.equal(sessionDetail({ area: "agent", network: "102.176.x.x" }), "Agent dashboard · network 102.176.x.x");
  assert.equal(sessionDetail({ area: "customer", network: "" }), "Customer area");
  assert.equal(areaLabel("other"), "");
});
