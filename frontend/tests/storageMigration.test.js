import { test } from "node:test";
import assert from "node:assert/strict";
import { migrateStorage } from "../src/utils/storage.js";

// A minimal Web Storage: values are own enumerable properties, as in browsers
class FakeStorage {
  getItem(key) { return Object.hasOwn(this, key) ? this[key] : null; }
  setItem(key, value) { this[key] = String(value); }
  removeItem(key) { delete this[key]; }
}
const OLD = ["home", "base:"].join("");

test("the NyaFie rename keeps what this browser saved under the old key prefix", () => {
  globalThis.localStorage = Object.assign(new FakeStorage(), { [`${OLD}version`]: "3", [`${OLD}favorites`]: '["p1","p2"]', [`${OLD}view:listings`]: "map", other: "kept" });
  globalThis.sessionStorage = Object.assign(new FakeStorage(), { [`${OLD}checkout`]: "plan-1" });
  migrateStorage();
  assert.equal(localStorage.getItem("nyafie:favorites"), '["p1","p2"]', "guest favorites survive");
  assert.equal(localStorage.getItem("nyafie:view:listings"), "map");
  assert.equal(localStorage.getItem("nyafie:version"), "3");
  assert.equal(sessionStorage.getItem("nyafie:checkout"), "plan-1");
  assert.equal(Object.keys(localStorage).some((key) => key.startsWith(OLD)), false, "old keys removed");
  assert.equal(localStorage.getItem("other"), "kept");
  migrateStorage(); // running again changes nothing
  assert.equal(localStorage.getItem("nyafie:favorites"), '["p1","p2"]');
});

test("browsers with data from before the API version are still cleared", () => {
  globalThis.localStorage = Object.assign(new FakeStorage(), { [`${OLD}version`]: "2", [`${OLD}properties`]: "[old local data]" });
  globalThis.sessionStorage = new FakeStorage();
  migrateStorage();
  assert.equal(localStorage.getItem("nyafie:properties"), null);
  assert.equal(localStorage.getItem("nyafie:version"), "3");
});
