import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronDown, CreditCard, KeyRound, MessageCircle } from "lucide-react";
import AccountShell from "../../components/account/AccountShell";
import EmptyState from "../../components/ui/EmptyState";
import PageLoader from "../../components/ui/PageLoader";
import StatusBadge from "../../components/ui/StatusBadge";
import HistoryTimeline from "../../components/offers/HistoryTimeline";
import { rentalApi } from "../../frontApi";
import { formatDate } from "../../utils/date";

const ghs = (value) => `₵${Number(value).toLocaleString()}`;

// What each rental status means for the customer
const statusHelp = {
  Pending: "Complete your payment to book this property.",
  "Payment Pending": "Your checkout is in progress. If you didn't finish paying, you can try again.",
  Paid: "Payment received. Waiting for the owner to confirm your rental.",
  Confirmed: "Your rental is confirmed. The owner will arrange your move-in.",
  Active: "You've moved in. Enjoy your new home!",
  Completed: "This rental has ended.",
  Cancelled: "This rental was cancelled.",
};

const MyRentals = () => {
  const [rentals, setRentals] = useState(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    rentalApi.getMyRentals().then(setRentals).catch((err) => setError(err.message));
  }, []);

  return (
    <AccountShell title="My Rentals" description="Properties you've rented, their payment and rental status.">
      {error ? (
        <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      ) : !rentals ? (
        <PageLoader label="Loading your rentals..." />
      ) : rentals.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No rentals yet"
          description="Open a property for rent and tap “Rent Now” to book it and pay online."
          action={<Link to="/rent" className="btn btn-primary">Browse rentals</Link>}
        />
      ) : (
        <ul className="space-y-4">
          {rentals.map((rental) => {
            const unpaid = ["Pending", "Payment Pending"].includes(rental.status) && rental.paymentStatus !== "Paid";
            const open = openId === rental.id;
            return (
              <li key={rental.id} className="rounded-3xl bg-white p-4 ring-1 ring-gray-200 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row">
                  <Link to={`/house/${rental.property.id}`} className="shrink-0">
                    {rental.property.image ? (
                      <img src={rental.property.image} alt="" className="aspect-16/9 w-full rounded-2xl object-cover sm:h-28 sm:w-40" />
                    ) : (
                      <div className="grid h-28 w-40 place-items-center rounded-2xl bg-gray-100 text-xs text-gray-400">Removed</div>
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900">{rental.property.title}</p>
                        <p className="text-sm text-gray-500">
                          {rental.property.location} · {rental.owner?.name}
                        </p>
                      </div>
                      <StatusBadge status={rental.status} />
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      <div>
                        <dt className="text-xs text-gray-500">Move-in</dt>
                        <dd className="flex items-center gap-1.5 font-semibold text-gray-900">
                          <CalendarDays className="h-3.5 w-3.5 text-brand-500" />
                          {formatDate(rental.startDate)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">Until</dt>
                        <dd className="font-semibold text-gray-900">{formatDate(rental.endDate)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">Amount</dt>
                        <dd className="font-extrabold text-gray-900">{ghs(rental.amount)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-gray-500">Payment</dt>
                        <dd className="mt-0.5"><StatusBadge status={rental.paymentStatus} /></dd>
                      </div>
                    </dl>
                    <p className="mt-3 text-sm text-gray-600">{statusHelp[rental.status]}</p>
                    {rental.reference && (
                      <p className="mt-1 text-xs text-gray-400">
                        Reference {rental.reference}
                        {rental.paidAt && ` · paid ${formatDate(rental.paidAt)}`}
                      </p>
                    )}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {unpaid && (
                        <Link to={`/checkout/rent/${rental.property.id}`} className="btn btn-primary px-4 py-2 text-xs">
                          <CreditCard className="h-3.5 w-3.5" />
                          Complete payment
                        </Link>
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
    </AccountShell>
  );
};

export default MyRentals;
