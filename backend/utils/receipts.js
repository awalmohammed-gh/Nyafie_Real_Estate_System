import { randomBytes } from "node:crypto";
import User from "../models/User.js";
import { getSettings, siteName } from "../models/Setting.js";
import { receiptMailer } from "./email.js";
import { notifyUser } from "./notify.js";
import { formatGHS } from "./ownership.js";
import { reportError } from "./monitoring.js";

/*
 * Receipts for payments the receiving side records: rent paid at the office, a house or land paid for
 * at the office, a hotel or short stay paid on arrival, and a hotel booking paid online into the
 * hotel's own account (the hotel sends that one itself). Each is issued once, inside the same
 * transaction as the payment it confirms, and then delivered to the customer in the app and by email.
 */

// NFR-20261123-9F3A61C2: the day it was issued and 8 random characters
export const newReceiptNumber = (now = new Date()) => `NFR-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(4).toString("hex").toUpperCase()}`;

const fullName = (user) => [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();

/** Who received the money: the agency or agent from the listing, or the platform for its own listings */
export const receivingBusiness = async (record, { session } = {}) => {
  if (record.ownerType === "admin") {
    const settings = await getSettings();
    return { business: siteName(), businessAddress: settings.contact?.address || "", businessPhone: settings.contact?.phone || "" };
  }
  const ownerId = record.owner?._id || record.owner;
  const query = User.findById(ownerId).select("firstName lastName phone agentApplication.companyName agentApplication.officeAddress agentApplication.city").lean();
  const owner = await (session ? query.session(session) : query);
  const application = owner?.agentApplication || {};
  return {
    business: (application.companyName || fullName(owner) || "The listing agent").slice(0, 160),
    businessAddress: [application.officeAddress, application.city].filter(Boolean).join(", ").slice(0, 300),
    businessPhone: String(owner?.phone || "").slice(0, 40),
  };
};

/**
 * The receipt for a payment, ready to store on the record (record.receipt = await buildReceipt(...)).
 * issuer: the signed-in person recording or sending it. Everything else comes from the stored record.
 */
export const buildReceipt = async (record, { amount, method, paymentReference = "", note = "", description, issuer, now = new Date(), session }) => ({
  number: newReceiptNumber(now),
  amount,
  currency: "GHS",
  method,
  paymentReference: String(paymentReference || "").slice(0, 80),
  note: String(note || "").slice(0, 300),
  issuedAt: now,
  issuedBy: issuer._id,
  issuedByName: (fullName(issuer) || "Staff").slice(0, 160),
  ...(await receivingBusiness(record, { session })),
  customerName: String(record.contactName || "Customer").slice(0, 120),
  description: String(description).slice(0, 300),
});

/**
 * After the transaction commits: the customer hears about the receipt in the app and gets it by email.
 * Email is best effort (the receipt stays in their account either way); a failure is logged and reported.
 */
export const deliverReceipt = async ({ customer, email, receipt, link }) => {
  await notifyUser(customer, {
    type: "payment",
    title: `Receipt ${receipt.number}`,
    message: `${receipt.business} gave you a receipt for ${formatGHS(receipt.amount)} (${receipt.method}): ${receipt.description}.`,
    link,
  });
  if (!email) return;
  try {
    await receiptMailer.send(email, receipt);
  } catch (error) {
    console.error("Receipt email failed:", error.message);
    await reportError(error, { tags: { area: "receipt-email" } });
  }
};

/** The receipt as customers and owners see it (null when none was issued yet) */
export const presentReceipt = (receipt) => (receipt?.number ? {
  number: receipt.number, amount: receipt.amount, currency: receipt.currency, method: receipt.method,
  paymentReference: receipt.paymentReference, note: receipt.note, issuedAt: receipt.issuedAt, issuedByName: receipt.issuedByName,
  business: receipt.business, businessAddress: receipt.businessAddress, businessPhone: receipt.businessPhone,
  customerName: receipt.customerName, description: receipt.description,
} : null);
