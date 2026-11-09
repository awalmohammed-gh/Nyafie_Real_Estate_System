import { test } from "node:test";
import assert from "node:assert/strict";
import { advanceLabel, moveInCosts } from "../src/utils/moveIn.js";

test("move-in costs add the advance, the agent fee and the deposit", () => {
  assert.deepEqual(moveInCosts(2500, { advanceMonths: 12, agentFeeType: "percent", agentFeeValue: 10, securityDeposit: 2500 }), { advanceMonths: 12, advance: 30000, feeLabel: "Agent fee (10% of the advance)", fee: 3000, deposit: 2500, total: 35500 });
  assert.equal(moveInCosts(2500, { advanceMonths: 6, agentFeeType: "fixed", agentFeeValue: 1500 }).total, 16500);
  assert.equal(moveInCosts(1999.99, { advanceMonths: 3, agentFeeType: "percent", agentFeeValue: 5 }).fee, 300, "rounded to pesewas");
  assert.equal(moveInCosts(2500, { advanceMonths: 0, agentFeeType: "none" }), null, "nothing stated: nothing shown");
  assert.equal(moveInCosts(2500, null), null);
  assert.equal(moveInCosts(250, { advanceMonths: 12 }, "night"), null, "monthly rentals only");
  assert.equal(advanceLabel(1), "1 month's advance");
  assert.equal(advanceLabel(12), "12 months' advance");
});
