import mongoose from "mongoose";
import { schemaOptions } from "../utils/schemaOptions.js";

// One document per Paystack dispute (chargeback) over a rental/hotel payment or a subscription.
// Disputes are answered in the Paystack dashboard; this record follows what Paystack reports:
//   open   waiting for an answer from NyaFie or the bank
//   won    closed in NyaFie's favour: the money stays
//   lost   accepted (by NyaFie, or automatically after the deadline): `lostAmount` went back to the customer
//   check  closed with an outcome NyaFie doesn't recognise: an admin checks the Paystack dashboard
// A closed dispute can be reopened by the customer's bank, so every outcome can change again.
const historySchema = new mongoose.Schema(
  {
    outcome: { type: String, required: true },
    providerStatus: { type: String, default: "" },
    resolution: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const disputeSchema = new mongoose.Schema(
  {
    disputeId: { type: String, required: true }, // Paystack's ID
    environment: { type: String, enum: ["test", "live"], required: true },
    source: { type: String, enum: ["payment", "subscription"], required: true },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: "Payment", default: null, index: true },
    subscription: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription", default: null, index: true },
    reference: { type: String, required: true, index: true }, // the disputed Paystack transaction
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true }, // GHS of the payment
    disputedAmount: { type: Number, default: null }, // GHS Paystack says is at stake; null when it can't be read
    lostAmount: { type: Number, default: 0 }, // GHS returned to the customer
    outcome: { type: String, enum: ["open", "won", "lost", "check"], required: true },
    providerStatus: { type: String, default: "" }, // Paystack's own words, for the admin
    resolution: { type: String, default: "" },
    category: { type: String, default: "" },
    dueAt: { type: Date, default: null }, // without an answer by then Paystack accepts the dispute
    resolvedAt: { type: Date, default: null },
    remindedAt: { type: Date, default: null },
    history: { type: [historySchema], default: [] },
    nextReconcileAt: { type: Date, default: null },
  },
  schemaOptions
);

disputeSchema.index({ environment: 1, disputeId: 1 }, { unique: true });
disputeSchema.index({ environment: 1, outcome: 1, nextReconcileAt: 1, createdAt: 1 }); // scheduled recovery

export default mongoose.models.Dispute || mongoose.model("Dispute", disputeSchema);
