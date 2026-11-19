import { test } from "node:test";
import assert from "node:assert/strict";
import { VIEWING_SLOTS, availableSlots, formatViewingTime, viewingDateRange, viewingParts } from "../src/utils/viewingTimes.js";

const now = Date.parse("2026-11-19T15:10:00Z"); // 15:10 in Ghana

test("viewing slots run on the half hour from 08:00 to 18:00", () => {
  assert.equal(VIEWING_SLOTS[0], "08:00");
  assert.equal(VIEWING_SLOTS.at(-1), "18:00");
  assert.equal(VIEWING_SLOTS.length, 21);
});

test("today only offers slots at least two hours away; later days offer every slot", () => {
  assert.deepEqual(availableSlots("2026-11-19", now), ["17:30", "18:00"]);
  assert.equal(availableSlots("2026-11-20", now).length, 21);
  assert.deepEqual(availableSlots("2027-02-01", now), [], "beyond 60 days");
  assert.deepEqual(availableSlots("", now), []);
});

test("the date picker starts tomorrow once today's last slot is too soon", () => {
  assert.deepEqual(viewingDateRange(now), { min: "2026-11-19", max: "2027-01-18" });
  assert.equal(viewingDateRange(Date.parse("2026-11-19T16:30:00Z")).min, "2026-11-20");
});

test("times are shown and prefilled in Ghana time", () => {
  assert.equal(formatViewingTime("2026-11-25T10:30:00.000Z"), "Wed 25 Nov 10:30");
  assert.deepEqual(viewingParts("2026-11-25T10:30:00.000Z"), { date: "2026-11-25", time: "10:30" });
});
