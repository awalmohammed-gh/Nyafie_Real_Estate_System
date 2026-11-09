import { notifyAdmins } from "./notify.js";

/**
 * Records Paystack's transaction ID and channel on a confirmed payment record (Payment or
 * Subscription), for audit and reconciliation. A unique index allows each Paystack transaction
 * on one record only. A clash means two records claim the same transaction: it can't undo
 * the confirmation that already happened, so it alerts an administrator instead of failing.
 */
export const recordProviderDetails = async (Model, id, check, reference) => {
  const fields = {
    ...(check?.transactionId ? { providerTransactionId: check.transactionId } : {}),
    ...(check?.channel ? { channel: check.channel } : {}),
  };
  if (!Object.keys(fields).length) return;
  try {
    await Model.updateOne({ _id: id, providerTransactionId: { $exists: false } }, { $set: fields });
  } catch (error) {
    if (error.code !== 11000) { console.error(`Could not record Paystack details for ${reference}:`, error.message); return; }
    console.error(`Paystack transaction ${check.transactionId} is already recorded on another payment (${reference}).`);
    await notifyAdmins({ critical: true, type: "payment", title: "Paystack transaction recorded twice", message: `Paystack transaction ${check.transactionId} (payment ${reference}) is already linked to another payment record. Check both in the Paystack dashboard.`, link: "/admin/payments" }).catch(() => {});
  }
};

// The fields stored when Paystack reports a successful charge for a different amount or currency
export const mismatchFields = (check, now = new Date()) => ({
  note: check.problem,
  paidAt: now,
  ...(check.paidAmount != null && check.currency === "GHS" ? { paidAmount: check.paidAmount } : {}),
  ...(check.transactionId ? { providerTransactionId: check.transactionId } : {}),
  ...(check.channel ? { channel: check.channel } : {}),
});
