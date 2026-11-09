import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMoveIn } from "../utils/moveIn.js";
import { pickPropertyFields } from "../controllers/propertyController.js";

test("move-in costs are validated: whole months of advance, a fee type and value, a deposit", () => {
  assert.deepEqual(parseMoveIn({ advanceMonths: 12, agentFeeType: "percent", agentFeeValue: 10, securityDeposit: "2500" }), { advanceMonths: 12, agentFeeType: "percent", agentFeeValue: 10, securityDeposit: 2500 });
  assert.deepEqual(parseMoveIn({ advanceMonths: 6, agentFeeType: "fixed", agentFeeValue: 1500 }), { advanceMonths: 6, agentFeeType: "fixed", agentFeeValue: 1500, securityDeposit: 0 });
  assert.equal(parseMoveIn({ agentFeeType: "none", agentFeeValue: 999 }).agentFeeValue, 0, "no fee means no fee value");
  assert.equal(parseMoveIn({ agentFeeType: "made-up" }).agentFeeType, "none");
  for (const bad of [{ advanceMonths: 37 }, { advanceMonths: 1.5 }, { advanceMonths: -1 }, { agentFeeType: "percent", agentFeeValue: 25 }, { securityDeposit: "lots" }, null, []]) {
    assert.throws(() => parseMoveIn(bad), { status: 400 }, JSON.stringify(bad));
  }
  assert.deepEqual(pickPropertyFields({ moveIn: { advanceMonths: 12 } }).moveIn, { advanceMonths: 12, agentFeeType: "none", agentFeeValue: 0, securityDeposit: 0 });
  assert.equal("moveIn" in pickPropertyFields({ title: "x" }), false, "untouched when not sent");
});
