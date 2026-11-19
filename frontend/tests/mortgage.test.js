import { test } from "node:test";
import assert from "node:assert/strict";
import { incomeNeeded, mortgageEstimate } from "../src/utils/mortgage.js";

test("a standard amortising loan: deposit upfront, the rest monthly", () => {
  const estimate = mortgageEstimate({ price: 1_000_000, depositPercent: 20, ratePercent: 24, years: 15 });
  assert.equal(estimate.deposit, 200_000);
  assert.equal(estimate.loan, 800_000);
  assert.equal(estimate.months, 180);
  // 800,000 at 2% a month over 180 months
  const exactMonthly = (800_000 * 0.02) / (1 - 1.02 ** -180);
  assert.equal(estimate.monthly, Math.round(exactMonthly));
  assert.equal(estimate.monthly, 16_466); // worked out by hand: 16,000 / (1 - 1.02^-180)
  assert.equal(estimate.totalInterest, Math.round(exactMonthly * 180 - 800_000));
  assert.ok(Math.abs(estimate.totalCost - (200_000 + 800_000 + estimate.totalInterest)) <= 1);
});

test("edge cases: no interest, full deposit, and inputs that can't make a loan", () => {
  assert.equal(mortgageEstimate({ price: 120_000, depositPercent: 0, ratePercent: 0, years: 10 }).monthly, 1000);
  assert.deepEqual({ ...mortgageEstimate({ price: 500_000, depositPercent: 100, ratePercent: 25, years: 20 }), months: undefined }, { deposit: 500_000, loan: 0, monthly: 0, totalInterest: 0, totalCost: 500_000, months: undefined });
  for (const bad of [{ price: 0 }, { depositPercent: 120 }, { ratePercent: -1 }, { years: 0 }, { years: 50 }, { price: "abc" }]) {
    assert.equal(mortgageEstimate({ price: 100_000, depositPercent: 20, ratePercent: 20, years: 10, ...bad }), null, JSON.stringify(bad));
  }
  assert.equal(incomeNeeded(10_000), 30_000);
});
