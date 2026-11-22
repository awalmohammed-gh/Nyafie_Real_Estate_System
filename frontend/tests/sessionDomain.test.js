import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sessionDomainForPath } from "../src/utils/sessionDomain.js";

// Every page of the agent workspace must use the agent session. A page missing from the list in
// sessionDomainForPath is treated as a customer page, and the agent is sent away from it.
test("every route in the agent workspace belongs to the agent session", () => {
  const router = readFileSync(new URL("../src/router/router.jsx", import.meta.url), "utf8");
  const start = router.indexOf("<Route path='agent' element={<AgentLayout />}>");
  assert.ok(start > 0, "agent workspace routes found");
  const block = router.slice(start, router.indexOf("</Route>", start));
  const paths = [...block.matchAll(/path='([^']+)'/g)].map((m) => m[1]).filter((path) => path !== "agent");
  assert.ok(paths.includes("viewings") && paths.includes("offers"), JSON.stringify(paths));
  for (const path of paths) {
    const url = `/agent/${path.replace(/:[A-Za-z]+/g, "x123")}`;
    assert.equal(sessionDomainForPath(url), "agent", url);
  }
});

test("customer and public pages keep the customer session", () => {
  for (const url of ["/", "/account/viewings", "/house/abc", "/compare", "/agents/abc"]) assert.equal(sessionDomainForPath(url), "customer", url);
});
