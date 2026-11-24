import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENT_PROMO, accepted, addActiveTime, initialPromo, notNow, promoAllowedFor, promoAllowedOn, readPromo, remindLater, shouldShowPromo, startOfNextDay, startVisit, writePromo } from "../src/utils/agentPromo.js";

const SECOND = 1000, MINUTE = 60 * SECOND, DAY = 24 * 60 * MINUTE;
const monday9am = new Date(2026, 10, 9, 9, 0).getTime();
// Simulates time on the site: the visitor has the page open and visible for `ms`
const browse = (state, ms) => addActiveTime(state, ms);

test("it first appears after 20 seconds on the site", () => {
  let state = startVisit(initialPromo(), monday9am);
  assert.equal(shouldShowPromo(browse(state, 19 * SECOND), monday9am), false);
  state = browse(state, 20 * SECOND);
  assert.equal(shouldShowPromo(state, monday9am), true);
});

test("'Not now' hides it for the rest of the day; it returns on the next day's visit", () => {
  let state = browse(initialPromo(), 30 * SECOND);
  state = notNow(state, monday9am);
  // Same day, even after hours of browsing: never
  assert.equal(shouldShowPromo(browse(state, 5 * 60 * MINUTE), new Date(2026, 10, 9, 23, 59).getTime()), false);
  // Next day: a new visit, then the usual short delay
  const tuesday = new Date(2026, 10, 10, 8, 0).getTime();
  state = startVisit(browse(state, 5 * 60 * MINUTE), tuesday);
  assert.equal(shouldShowPromo(state, tuesday), false, "not the instant they arrive");
  assert.equal(shouldShowPromo(browse(state, 20 * SECOND), tuesday), true);
});

test("'Not now' late in the evening still means tomorrow, not 24 hours later", () => {
  const lateEvening = new Date(2026, 10, 9, 23, 30).getTime();
  assert.equal(startOfNextDay(lateEvening), new Date(2026, 10, 10, 0, 0).getTime());
  const state = notNow(browse(initialPromo(), MINUTE), lateEvening);
  const nextMorning = new Date(2026, 10, 10, 7, 0).getTime();
  assert.equal(shouldShowPromo(browse(startVisit(state, nextMorning), 20 * SECOND), nextMorning), true);
});

test("'Remind me later' brings it back after 10 more minutes on the site", () => {
  let state = remindLater(browse(initialPromo(), 30 * SECOND));
  assert.equal(shouldShowPromo(browse(state, 9 * MINUTE + 59 * SECOND), monday9am), false);
  state = browse(state, 10 * MINUTE);
  assert.equal(shouldShowPromo(state, monday9am), true);
  // Time counts across page loads too: a reload starts a visit but keeps the count
  const reloaded = startVisit(remindLater(browse(initialPromo(), MINUTE)), monday9am);
  assert.equal(shouldShowPromo(browse(browse(reloaded, 6 * MINUTE), 4 * MINUTE), monday9am), true);
});

test("'Become an agent' keeps it away for 30 days", () => {
  const state = accepted(browse(initialPromo(), MINUTE), monday9am);
  assert.equal(shouldShowPromo(browse(state, 10 * 60 * MINUTE), monday9am + 29 * DAY), false);
  const later = monday9am + AGENT_PROMO.acceptedQuietMs + DAY;
  assert.equal(shouldShowPromo(browse(startVisit(state, later), 20 * SECOND), later), true);
});

test("who and where: never agents, admins, applicants, or agent and checkout pages", () => {
  assert.equal(promoAllowedFor(null), true, "visitors");
  assert.equal(promoAllowedFor({ role: "user" }), true, "customers");
  assert.equal(promoAllowedFor({ role: "user", agentApplication: { status: "incomplete" } }), true, "an abandoned start still sees it");
  for (const user of [{ role: "agent" }, { role: "admin" }, { role: "user", agentAccess: true }, { role: "user", agentApplication: { status: "pending" } }]) assert.equal(promoAllowedFor(user), false, JSON.stringify(user));
  assert.equal(promoAllowedOn("/"), false, "the home page starts with homes, not an invitation to sell");
  for (const path of ["/listings", "/house/abc", "/contact", "/about", "/agents"]) assert.equal(promoAllowedOn(path), true, path);
  for (const path of ["/agent/plans", "/agent/join/xyz", "/account/saved", "/checkout/rent/1", "/payment/success", "/make-offer/1"]) assert.equal(promoAllowedOn(path), false, path);
});

test("stored state survives reloads and ignores damaged values", () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  assert.deepEqual(readPromo(storage), initialPromo());
  const state = remindLater(browse(initialPromo(), MINUTE));
  writePromo(state, storage);
  assert.deepEqual(readPromo(storage), state);
  data.set("nyafie.agentPromo", JSON.stringify({ activeMs: "lots", showAt: -1 }));
  assert.deepEqual(readPromo(storage), initialPromo());
  data.set("nyafie.agentPromo", "{not json");
  assert.deepEqual(readPromo(storage), initialPromo());
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.deepEqual(readPromo(blocked), initialPromo());
  assert.doesNotThrow(() => writePromo(state, blocked));
});
