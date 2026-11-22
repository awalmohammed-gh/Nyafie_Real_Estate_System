import { Link } from "react-router-dom";
import { ClipboardCheck, ShieldAlert } from "lucide-react";

/*
 * Payment safety messages, the same wherever money changes hands:
 *  - SeeBeforeYouPay: before paying for a rental or a purchase (or making an offer): don't pay
 *    anything, online or in cash, until you've seen the property in person. Hotel stays get advice
 *    that fits them (nobody inspects a hotel room first).
 *  - AskAgentToUpdate: after paying: ask the agent to mark the property rented / sold / booked on the
 *    site, so it comes off the market and nobody else pays for it.
 */

export const SeeBeforeYouPay = ({ propertyId, forSale = false, hotel = false, siteName = "NyaFie" }) => (
  <div role="note" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
    <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
    {hotel ? (
      <p>
        <strong className="font-semibold">Book safely.</strong> Only pay through {siteName} or to the hotel itself at check-in. Never send money to
        anyone who contacts you separately about this booking.
      </p>
    ) : (
      <div>
        <p className="font-semibold">Have you seen this property in person?</p>
        <p className="mt-1">
          Don't pay anything, online or in cash, until you've visited the property, met the {forSale ? "owner or agent and checked the title documents" : "owner or agent"},
          and you're sure it's real. Viewings are free.
        </p>
        {propertyId && (
          <Link to={`/house/${propertyId}#property-contact`} className="mt-2 inline-flex min-h-9 items-center font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-700">
            Arrange a free viewing first
          </Link>
        )}
      </div>
    )}
  </div>
);

const DONE = { rent: "rented", sale: "sold", booking: "booked" };

// kind: "rent" | "sale" | "booking"; several kinds (a list of rentals and stays) use the general wording
export const AskAgentToUpdate = ({ kind, siteName = "NyaFie", className = "" }) => (
  <div role="note" className={`flex items-start gap-3 rounded-2xl bg-brand-50 p-4 text-left text-sm leading-6 text-brand-950 ${className}`}>
    <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" />
    <p>
      <strong className="font-semibold">Paid? Ask your agent to update {siteName}.</strong> Once your payment is done, make sure the agent
      or agency marks the property as {DONE[kind] || "rented, sold or booked"} on {siteName}, so it comes off the market and nobody else pays for it.
    </p>
  </div>
);
