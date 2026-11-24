import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronDown, CircleCheck, CreditCard, KeyRound, Loader2, MessageCircle, XCircle } from "lucide-react";
import AccountShell from "../../components/account/AccountShell";
import EmptyState from "../../components/ui/EmptyState";
import PageLoader from "../../components/ui/PageLoader";
import StatusBadge from "../../components/ui/StatusBadge";
import HistoryTimeline from "../../components/offers/HistoryTimeline";
import { rentalApi } from "../../frontApi";
import { formatDate } from "../../utils/date";
import { bookingPath } from "../../utils/hotel";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { arrivalText, bookingHeadline, guestCanCancel, payPlace } from "../../utils/hotelPayments";
import { cloudImage } from "../../utils/cloudImage";
import { formatGhs } from "../../utils/property";
import { AskAgentToUpdate } from "../../components/reports/PaymentSafety";
import { usePlatform } from "../../context/usePlatform";
import ReceiptCard from "../../components/receipts/ReceiptCard";

// What each rental status means for the customer
const statusHelp = {
  Pending: "Complete your payment to book this property.",
  "Payment Pending": "Your payment is awaiting confirmation. Check its status before paying again.",
  Paid: "Payment received. Waiting for the owner to confirm your rental.",
  Confirmed: "Your rental is confirmed. The owner will arrange your move-in.",
  Active: "You've moved in. Enjoy your new home!",
  Completed: "This rental has ended.",
  Cancelled: "This rental was cancelled.",
};

const MyRentals = () => {
  const { siteName } = usePlatform();
  const [rentals, setRentals] = useState(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [cancelling, setCancelling] = useState(null); // the reservation being cancelled
  const [busy, setBusy] = useState(false);
  const run = useAsyncAction();
  const cancel = async () => {
    setBusy(true);
    const { ok, result } = await run(rentalApi.cancelReservation(cancelling.id), { success: "Reservation cancelled", description: cancelling.hotelId ? "The hotel has been told." : "The owner has been told." });
    if (ok) setRentals((list) => list.map((r) => (r.id === result.id ? result : r)));
    setBusy(false);
    setCancelling(null);
  };

  useEffect(() => {
    rentalApi.getMyRentals().then(setRentals).catch((err) => setError(err.message));
  }, []);

  return (
    <AccountShell title="My Rentals & Hotel Bookings" description="Your rentals and hotel stays, with payment and booking status.">
      <AskAgentToUpdate siteName={siteName} className="mb-6" />
      {error ? (
        <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      ) : !rentals ? (
        <PageLoader label="Loading your rentals..." />
      ) : rentals.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No rentals yet"
          description="Open a property for rent and tap “Rent Now” to send a request. Rent is paid at the owner's office; hotel and short stays can be paid online or on arrival."
          action={<Link to="/rent" className="btn btn-primary">Browse rentals</Link>}
        />
      ) : (
        <ul className="space-y-4">
          {rentals.map((rental) => {
            // Monthly and fixed-price rent is never paid online: the owner confirms, then it's paid at the office
            const office = rental.paysAtOffice;
            const unpaid = !office && ["Pending", "Payment Pending"].includes(rental.status) && rental.paymentStatus !== "Paid";
            const headline = bookingHeadline(rental);
            const dueOnArrival = rental.paymentOption === "on_arrival" && rental.paymentDue;
            const checkPayment = unpaid && rental.status === "Payment Pending" && Boolean(rental.reference);
            const checkoutPath = rental.hotelId ? `${bookingPath(rental.property.id, rental.roomTypeId)}&booking=${rental.id}` : `/checkout/rent/${rental.property.id}`;
            const paymentPath = checkPayment ? `/payment/success?reference=${encodeURIComponent(rental.reference)}` : checkoutPath;
            const open = openId === rental.id;
            return (
              <li key={rental.id} className="rounded-3xl bg-white p-4 ring-1 ring-gray-200 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row">
                  <Link to={`/house/${rental.property.id}`} className="shrink-0">
                    {rental.property.image ? (
                      <img src={cloudImage(rental.property.image, 400)} alt="" className="aspect-16/9 w-full rounded-2xl object-cover sm:h-28 sm:w-40" />
                    ) : (
                      <div className="grid h-28 w-40 place-items-center rounded-2xl bg-gray-100 text-xs text-gray-400">Removed</div>
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900">{rental.property.title}</p>
                        {rental.hotelId && <p className="mt-1 text-sm font-medium text-brand-700">{rental.roomName} · {rental.numberOfRooms} room(s) · {rental.occupants} guest(s)</p>}
                        <p className="text-sm text-gray-500">
                          {rental.property.location} · {rental.owner?.name}
                        </p>
                      </div>
                      <StatusBadge status={rental.status} />
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      <div>
                        <dt className="text-xs text-gray-500">{rental.hotelId ? "Check-in" : "Move-in"}</dt>
                        <dd className="flex items-center gap-1.5 font-semibold text-gray-900">
                          <CalendarDays className="h-3.5 w-3.5 text-brand-500" />
                          {formatDate(rental.startDate)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">{rental.hotelId ? "Check-out" : "Until"}</dt>
                        <dd className="font-semibold text-gray-900">{formatDate(rental.endDate)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">Amount</dt>
                        <dd className="font-extrabold text-gray-900">{formatGhs(rental.amount)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">Payment</dt>
                        <dd className="mt-0.5"><StatusBadge status={rental.paymentStatus} /></dd>
                      </div>
                    </dl>
                    {headline && <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-emerald-700"><CircleCheck className="h-4 w-4" aria-hidden="true" />{headline}</p>}
                    {dueOnArrival && rental.statusKey === "confirmed" && <p className="mt-1 text-sm text-gray-600">Pay {formatGhs(rental.amount)} {payPlace(rental)}. Please {rental.hotelId ? "check in" : "arrive"} {arrivalText(rental)}.</p>}
                    {dueOnArrival && rental.cancellationPolicy && ["confirmed", "active"].includes(rental.statusKey) && <p className="mt-1 text-xs whitespace-pre-line text-gray-500">{rental.hotelId ? "Hotel" : "Owner’s"} policy: {rental.cancellationPolicy}</p>}
                    {office && rental.statusKey === "pending" && <p className="mt-3 text-sm text-gray-600">Waiting for {rental.owner?.name || "the owner"} to confirm. Then pay {formatGhs(rental.amount)} at their office and get a receipt.</p>}
                    {office && rental.statusKey === "confirmed" && rental.paymentDue && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Your rental is confirmed. Pay {formatGhs(rental.amount)} at {rental.owner?.name || "the owner"}'s office: you get a receipt here and by email. {siteName} never takes rent online, and nobody should ask you to pay to a personal or mobile money number.</p>}
                    {!office && !headline && !(dueOnArrival && rental.statusKey === "confirmed") && <p className="mt-3 text-sm text-gray-600">{rental.hotelId ? ({ Pending: "Choose how to pay to reserve your rooms.", "Payment Pending": "Your secure checkout is in progress. Room holds last 30 minutes.", Paid: "Payment verified. The hotel will confirm your stay.", Confirmed: "Your hotel stay is confirmed.", Active: "You have checked in. Enjoy your stay!", Completed: "Your hotel stay has ended.", Cancelled: "This hotel booking was cancelled." })[rental.status] : rental.pricePeriod === "night" && rental.status === "Pending" ? "Choose how to pay to book this stay." : statusHelp[rental.status]}</p>}
                    {rental.hotelId && <p className="mt-1 text-xs text-gray-500">{formatGhs(rental.unitPrice)} / night × {rental.units} nights × {rental.numberOfRooms} rooms</p>}
                    {rental.hotelId && rental.paymentStatus === "Paid" && !rental.receipt && rental.statusKey !== "cancelled" && <p className="mt-1 text-xs text-gray-500">The hotel will send you a receipt for this payment.</p>}
                    <ReceiptCard receipt={rental.receipt} className="mt-3" />
                    {rental.reference && (
                      <p className="mt-1 text-xs text-gray-400">
                        Reference {rental.reference}
                        {rental.paidAt && ` · paid ${formatDate(rental.paidAt)}`}
                      </p>
                    )}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {unpaid && (
                        <Link to={paymentPath} className="btn btn-primary px-4 py-2 text-xs">
                          <CreditCard className="h-3.5 w-3.5" />
                          {checkPayment ? "Check payment status" : rental.hotelId || rental.pricePeriod === "night" ? "Complete booking" : "Complete payment"}
                        </Link>
                      )}
                      {guestCanCancel(rental) && (
                        <button type="button" onClick={() => setCancelling(rental)} className="btn btn-light px-4 py-2 text-xs text-red-600">
                          <XCircle className="h-3.5 w-3.5" />
                          Cancel reservation
                        </button>
                      )}
                      {rental.conversationId && (
                        <Link to={`/account/messages?c=${rental.conversationId}`} className="btn btn-light px-4 py-2 text-xs">
                          <MessageCircle className="h-3.5 w-3.5" />
                          Chat with owner
                        </Link>
                      )}
                      <button onClick={() => setOpenId(open ? null : rental.id)} aria-expanded={open} className="ml-auto flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-900">
                        History
                        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
                      </button>
                    </div>
                  </div>
                </div>
                {open && <HistoryTimeline history={rental.history} className="mt-5 ml-2" />}
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        onConfirm={cancel}
        disabled={busy}
        tone="danger"
        title="Cancel this reservation?"
        description={cancelling && (cancelling.hotelId
          ? `Your ${cancelling.roomName} reservation at "${cancelling.property.title}" will be cancelled and the rooms released.${cancelling.cancellationPolicy ? ` Hotel policy: ${cancelling.cancellationPolicy}` : ""}`
          : `Your rental of "${cancelling.property.title}" will be cancelled and the dates released.${cancelling.cancellationPolicy ? ` Owner's policy: ${cancelling.cancellationPolicy}` : ""}`)}
        confirmLabel={busy ? <><Loader2 className="h-4 w-4 animate-spin" />Cancelling…</> : "Cancel reservation"}
      />
    </AccountShell>
  );
};

export default MyRentals;
