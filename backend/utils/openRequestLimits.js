import Offer from "../models/Offer.js";
import Rental from "../models/Rental.js";
import SaleRequest, { CLOSED_SALE_STATUSES } from "../models/SaleRequest.js";

/**
 * How many open requests one customer account may have at a time, across all listings. Far above
 * what someone genuinely house-hunting needs, and it stops one account filling the database (and
 * owners' inboxes) with requests. Closed ones (answered, paid, cancelled...) never count.
 */
export const OPEN_REQUEST_LIMITS = { offers: 20, rentals: 20, sales: 10 };

const OPEN = {
  offers: { Model: Offer, filter: { status: { $in: ["pending", "countered"] } }, noun: "offers" },
  rentals: { Model: Rental, filter: { status: { $in: ["pending", "payment_pending"] }, paymentStatus: { $ne: "paid" } }, noun: "rental requests" },
  sales: { Model: SaleRequest, filter: { status: { $nin: CLOSED_SALE_STATUSES } }, noun: "purchase requests" },
};

/**
 * The message to show when the customer already has the maximum number of open requests of this
 * kind on other listings, or null. The listing being acted on is left out, so updating or resuming
 * a request for the same listing is never blocked.
 */
export const openRequestLimitProblem = async (kind, customerId, propertyId) => {
  const { Model, filter, noun } = OPEN[kind];
  const max = OPEN_REQUEST_LIMITS[kind];
  const open = await Model.countDocuments({ customer: customerId, ...filter, ...(propertyId ? { property: { $ne: propertyId } } : {}) });
  return open >= max ? `You have ${max} open ${noun}. Finish, withdraw or cancel some of them before starting another.` : null;
};
