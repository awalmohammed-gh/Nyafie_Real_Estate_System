import { test } from "node:test";
import assert from "node:assert/strict";
import { readPaystackDispute } from "../utils/paystack.js";
import { disputeOutcome } from "../utils/disputes.js";

// Paystack's published charge.dispute.* shape, in GHS
const sample = (extra = {}) => ({
  id: 358950, refund_amount: 5800, currency: "GHS", status: "awaiting-merchant-feedback", resolution: null, domain: "live",
  transaction: { id: 896467688, domain: "live", status: "success", reference: "v3mjfgbnc19v97x", amount: 5800, currency: "GHS" },
  transaction_reference: null, category: "chargeback", dueAt: "2026-11-25T18:00:00.000Z", resolvedAt: null, ...extra,
});

test("a dispute is read from Paystack's published shape", () => {
  assert.deepEqual(readPaystackDispute(sample()), {
    id: "358950", reference: "v3mjfgbnc19v97x", domain: "live", status: "awaiting-merchant-feedback", resolution: "", category: "chargeback",
    amount: 58, dueAt: new Date("2026-11-25T18:00:00.000Z"), resolvedAt: null,
  });
  assert.equal(readPaystackDispute(sample({ transaction: null, transaction_reference: "HBR-1" })).reference, "HBR-1");
});

test("a dispute that can't be identified is not read", () => {
  for (const data of [null, undefined, "text", {}, sample({ id: undefined }), sample({ id: "12; drop" }), sample({ id: { $ne: null } }), sample({ transaction: {} }), sample({ transaction: { reference: { $ne: null } } }), sample({ transaction: { reference: "x".repeat(101) } })]) {
    assert.equal(readPaystackDispute(data), null, JSON.stringify(data));
  }
});

test("amounts and dates that can't be trusted are left empty", () => {
  for (const extra of [{ currency: "NGN" }, { refund_amount: "5800" }, { refund_amount: -1 }, { refund_amount: 0 }, { refund_amount: 1.5 }]) assert.equal(readPaystackDispute(sample(extra)).amount, null, JSON.stringify(extra));
  assert.equal(readPaystackDispute(sample({ dueAt: "soon" })).dueAt, null);
});

test("only outcomes Paystack documents are decided; anything else is for an admin", () => {
  for (const status of ["awaiting-merchant-feedback", "awaiting-bank-feedback", "pending"]) assert.equal(disputeOutcome({ status, resolution: "", amount: 58 }), "open");
  assert.equal(disputeOutcome({ status: "resolved", resolution: "declined", amount: 58 }), "won");
  assert.equal(disputeOutcome({ status: "resolved", resolution: "merchant-accepted", amount: 58 }), "lost");
  assert.equal(disputeOutcome({ status: "resolved", resolution: "auto-accepted", amount: 58 }), "lost");
  assert.equal(disputeOutcome({ status: "resolved", resolution: "auto-accepted", amount: null }), "check");
  assert.equal(disputeOutcome({ status: "resolved", resolution: "something-new", amount: 58 }), "check");
  assert.equal(disputeOutcome({ status: "resolved", resolution: "", amount: 58 }), "check");
  assert.equal(disputeOutcome({ status: "something-new", resolution: "declined", amount: 58 }), "check");
});
