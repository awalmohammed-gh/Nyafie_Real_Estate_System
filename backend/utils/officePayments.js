import { takesStayBookings } from "./hotelPayout.js";

/*
 * Large payments are made at the office, never online:
 *  - monthly and fixed-price rentals (rent, often months or a year in advance)
 *  - houses and land for sale (sale requests are never paid online)
 * The owner side records the payment and the customer gets a receipt (utils/receipts.js). Hotels and
 * rentals priced per night keep their own options: pay online, or pay on arrival.
 */
export const paysAtOffice = (property) => Boolean(property) && (property.listingType === "Sale" || (property.listingType === "Rent" && !takesStayBookings(property)));

export const OFFICE_METHOD = "At the office";

// What customers are told, wherever they could otherwise be asked to pay
export const OFFICE_RULE = "Rent, house and land payments are made at the office, never online or to a personal number. You get a receipt when the payment is recorded.";
