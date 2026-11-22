import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HandCoins, MessageCircle, Undo2 } from "lucide-react";
import AccountShell from "../../components/account/AccountShell";
import EmptyState from "../../components/ui/EmptyState";
import PageLoader from "../../components/ui/PageLoader";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { offerApi } from "../../frontApi";
import { formatRelative } from "../../utils/date";
import { cloudImage } from "../../utils/cloudImage";
import { formatGhs } from "../../utils/property";

const statusHelp = {
  Pending: "Waiting for the owner to respond",
  Accepted: "The owner accepted. Continue in chat to arrange next steps.",
  Rejected: "The owner declined this offer",
  Countered: "The owner sent a counter offer",
  Withdrawn: "You withdrew this offer",
};

const MyOffers = () => {
  const run = useAsyncAction();
  const [offers, setOffers] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    offerApi.getMyOffers().then(setOffers).catch((err) => setError(err.message));
  }, []);

  const withdraw = async (offer) => {
    const { ok, result } = await run(offerApi.withdrawOffer(offer.id), { success: "Offer withdrawn" });
    if (ok) setOffers((prev) => prev.map((o) => (o.id === offer.id ? result : o)));
  };

  return (
    <AccountShell title="My Offers" description="Offers you've made on properties for sale.">
      {error ? (
        <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      ) : !offers ? (
        <PageLoader label="Loading your offers..." />
      ) : offers.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="You haven't made any offers"
          description="Open a property for sale and tap “Make Offer” to propose your price."
          action={<Link to="/sale" className="btn btn-primary">Browse properties for sale</Link>}
        />
      ) : (
        <ul className="space-y-4">
          {offers.map((offer) => {
            const open = offer.status === "Pending" || offer.status === "Countered";
            return (
              <li key={offer.id} className="flex flex-col gap-4 rounded-3xl bg-white p-4 ring-1 ring-gray-200 sm:flex-row sm:p-5">
                <Link to={`/house/${offer.property.id}`} className="shrink-0">
                  {offer.property.image ? (
                    <img src={cloudImage(offer.property.image, 400)} alt="" className="aspect-16/9 w-full rounded-2xl object-cover sm:h-28 sm:w-40" />
                  ) : (
                    <div className="grid h-28 w-40 place-items-center rounded-2xl bg-gray-100 text-xs text-gray-400">Removed</div>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900">{offer.property.title}</p>
                      <p className="text-sm text-gray-500">
                        {offer.property.location} · Listed by {offer.owner?.name}
                      </p>
                    </div>
                    <StatusBadge status={offer.status} />
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs text-gray-500">Asking price</dt>
                      <dd className="font-semibold text-gray-900">{formatGhs(offer.askingPrice)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">Your offer</dt>
                      <dd className="font-extrabold text-brand-600">{formatGhs(offer.amount)}</dd>
                    </div>
                    {offer.counterAmount && (
                      <div>
                        <dt className="text-xs text-gray-500">Counter offer</dt>
                        <dd className="font-extrabold text-sky-700">{formatGhs(offer.counterAmount)}</dd>
                      </div>
                    )}
                  </dl>
                  {offer.response && <p className="mt-3 rounded-2xl bg-gray-50 p-3 text-sm text-gray-600">“{offer.response}”</p>}

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-gray-400">
                      {formatRelative(offer.createdAt)} · {statusHelp[offer.status]}
                    </p>
                    <div className="flex gap-2">
                      {open && (
                        <button onClick={() => withdraw(offer)} className="btn btn-light px-4 py-2 text-xs">
                          <Undo2 className="h-3.5 w-3.5" />
                          Withdraw
                        </button>
                      )}
                      <Link to={offer.conversationId ? `/account/messages?c=${offer.conversationId}` : "/account/messages"} className="btn btn-primary px-4 py-2 text-xs">
                        <MessageCircle className="h-3.5 w-3.5" />
                        Chat with owner
                      </Link>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AccountShell>
  );
};

export default MyOffers;
