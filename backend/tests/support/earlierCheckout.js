import Rental from "../../models/Rental.js";
import Payment from "../../models/Payment.js";
import { newReference } from "../../utils/paystack.js";

/**
 * An online payment a customer started before online rent and platform-hotel payments were removed.
 * Those payments are still verified, confirmed by webhooks, recovered by the daily job and refunded,
 * so the integration tests keep checking that path. Written straight to the ledger exactly as the
 * old checkout did (test mode, Paystack method, a 30-minute hold starting now), since new bookings
 * can no longer start one. Returns { reference, payment }.
 */
export const earlierCheckout = async (bookingId) => {
  const rental = await Rental.findById(bookingId);
  if (!rental) throw new Error(`No booking ${bookingId}`);
  const payment = await Payment.create({
    kind: "rental", rental: rental._id, customer: rental.customer, property: rental.hotelId || rental.property,
    owner: rental.owner, ownerType: rental.ownerType, amount: rental.amount, method: "Paystack", environment: "test",
    reference: newReference(rental.hotelId ? "HBH" : "HBR"), authorizationUrl: "https://checkout.paystack.com/earlier-test",
  });
  await Rental.updateOne({ _id: rental._id }, {
    status: "payment_pending", paymentStatus: "pending", paymentOption: "online", paymentMethod: "Paystack",
    paymentReference: payment.reference, paymentStartedAt: new Date(),
    ...(rental.hotelId ? { approvalRequired: true } : {}),
  });
  return { reference: payment.reference, payment };
};
