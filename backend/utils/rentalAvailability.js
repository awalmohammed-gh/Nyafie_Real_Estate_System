import mongoose from "mongoose";
import Property from "../models/Property.js";
import Rental, { OCCUPYING_STATUSES } from "../models/Rental.js";
import { HttpError } from "./response.js";

export const PAYMENT_HOLD = 30 * 60 * 1000;

// End dates are exclusive: a new rental may start on the previous checkout day.
// Inventory claims exclude only the booking being processed. Advisory request
// previews may ignore the customer's holds; they never reserve these dates.
export const rentalConflictFilter = (rental, { excludeId = rental._id, now = new Date(), ignoreHoldCustomer } = {}) => ({
  property: rental.property,
  ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  startDate: { $lt: rental.endDate },
  endDate: { $gt: rental.startDate },
  $or: [
    { status: { $in: [...OCCUPYING_STATUSES, "completed"] } },
    {
      status: "payment_pending",
      paymentStartedAt: { $gt: new Date(now.getTime() - PAYMENT_HOLD) },
      ...(ignoreHoldCustomer ? { customer: { $ne: ignoreHoldCustomer } } : {}),
    },
  ],
});

export const hasRentalConflict = (rental, { session, ...options } = {}) => {
  const query = Rental.exists(rentalConflictFilter(rental, options));
  return session ? query.session(session) : query;
};

// All regular-rental inventory claims write this same property document. MongoDB
// retries competing transactions against a fresh snapshot, across server instances.
export const lockRentalProperty = (propertyId, session) => Property.findOneAndUpdate(
  { _id: propertyId }, { $inc: { __v: 1 } }, { session, returnDocument: "after", timestamps: false },
);

export const rentalInventoryTransaction = (propertyId, work) => mongoose.connection.transaction(async (session) => {
  const property = await lockRentalProperty(propertyId, session);
  if (!property) throw new HttpError(404, "This property is no longer available.");
  return work(property, session);
});
