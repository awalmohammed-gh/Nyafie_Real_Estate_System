import Rental from "../models/Rental.js";
import SaleRequest from "../models/SaleRequest.js";
import Viewing from "../models/Viewing.js";

/*
 * Only customers who really dealt with a property may review it, so rivals and fake accounts can't
 * flood a listing with ratings, and owners can't rate their own:
 *  - a viewing of it that took place (the owner marked it completed)
 *  - a rental or hotel stay they moved into or checked into (active or completed)
 *  - a purchase they paid for at the office or completed
 * Reviews written before this rule stay, and their authors can still edit or delete them.
 */
export const REVIEW_RULE = "You can review a property after you've viewed it with the owner, stayed in it or bought it through this site.";

export const canReview = async (userId, propertyId) => {
  if (!userId || !propertyId) return false;
  const [viewed, stayed, bought] = await Promise.all([
    Viewing.exists({ customer: userId, property: propertyId, status: "completed" }),
    Rental.exists({ customer: userId, property: propertyId, status: { $in: ["active", "completed"] } }),
    SaleRequest.exists({ customer: userId, property: propertyId, status: { $in: ["paid_at_office", "completed"] } }),
  ]);
  return Boolean(viewed || stayed || bought);
};
