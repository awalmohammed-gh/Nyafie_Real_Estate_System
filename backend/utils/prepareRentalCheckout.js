import Rental from "../models/Rental.js";
import Payment from "../models/Payment.js";
import { addHistory, quoteRental, toDay } from "../controllers/rentalController.js";
import { formatGHS } from "./ownership.js";
import { inCurrentEnvironment, newReference, paymentEnvironment } from "./paystack.js";
import { HttpError } from "./response.js";
import { PAYMENT_HOLD, rentalInventoryTransaction } from "./rentalAvailability.js";

// Reserve dates and create the ledger entry together. The provider request runs
// afterward so a network call is never repeated by a MongoDB transaction retry.
export const prepareRentalCheckout = (initial, user) => rentalInventoryTransaction(initial.property, async (_property, session) => {
  const rental = await Rental.findOne({ _id: initial._id, customer: user._id }).session(session);
  if (!rental || rental.paymentStatus === "paid" || !["pending", "payment_pending"].includes(rental.status)) {
    throw new HttpError(409, "This rental can no longer start a payment. Reload your bookings.");
  }
  const quote = await quoteRental({ propertyId: rental.property, startDate: toDay(rental.startDate), endDate: toDay(rental.endDate) }, user, { session, excludeId: rental._id });
  if (quote.error) throw new HttpError(quote.status, quote.error);

  if (rental.status === "payment_pending" && rental.paymentStartedAt > new Date(Date.now() - PAYMENT_HOLD)) {
    const current = await Payment.findOne({ rental: rental._id, reference: rental.paymentReference, status: "pending" }).session(session);
    if (current && inCurrentEnvironment(current)) {
      if (!current.authorizationUrl) throw new HttpError(409, "Your secure checkout is being prepared. Please try again shortly.");
      return { rental, payment: current, resume: true };
    }
  }

  const payment = new Payment({ kind: "rental", rental: rental._id, customer: user._id, property: rental.property, owner: rental.owner, ownerType: rental.ownerType, amount: quote.amount, method: "Paystack", environment: paymentEnvironment(), reference: newReference("HBR") });
  await payment.save({ session });
  rental.set({ amount: quote.amount, units: quote.units, unitPrice: quote.property.price, status: "payment_pending", paymentReference: payment.reference, paymentStartedAt: new Date(), paymentStatus: "pending", paymentMethod: payment.method });
  addHistory(rental, user, `Checkout started (${formatGHS(quote.amount)})`);
  await rental.save({ session });
  return { rental, payment, resume: false };
});
