import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { prepareCustomerTab, readCustomerTabSecret, clearCustomerTab } from "../src/utils/customerTabSession.js";

test("customer tab proofs survive reloads, stay out of localStorage and disappear with the tab", (t) => {
  const previous = globalThis.window;
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  const storage = new Map();
  globalThis.window = { crypto: webcrypto, sessionStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }, localStorage: { setItem: () => assert.fail("Never persist a tab proof in localStorage") } };
  assert.equal(readCustomerTabSecret(), "");
  const first = prepareCustomerTab();
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(prepareCustomerTab(), first, "same-tab reload reuses its proof");
  storage.clear();
  assert.equal(readCustomerTabSecret(), "", "new tab has no proof");
  assert.notEqual(prepareCustomerTab(), first, "new tab creates an independent proof");
  clearCustomerTab(); assert.equal(readCustomerTabSecret(), "");
  Object.defineProperty(window, "sessionStorage", { get() { throw new Error("Blocked"); } });
  assert.equal(readCustomerTabSecret(), "");
  assert.throws(prepareCustomerTab, /Allow session storage/);
});
