import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { CheckCircle2, Loader2, MessageCircle, RotateCcw, XCircle } from "lucide-react";
import { paymentApi, rentalApi } from "../frontApi";
import { formatDate } from "../utils/date";
import { usePlatform } from "../context/usePlatform";

const ghs = (value) => `₵${Number(value).toLocaleString()}`;

// /payment/success?reference=... (Paystack's callback). The backend verifies the
// transaction with Paystack before anything is shown as paid.
const PaymentResult = () => {
  const { paths } = usePlatform();
  const [params] = useSearchParams();
  const reference = params.get("reference");
  const [state, setState] = useState({ status: "verifying" }); // verifying | paid | failed

  useEffect(() => {
    if (!reference) return undefined;
    let active = true;
    paymentApi
      .verifyPayment(reference)
      .then((rental) => active && setState({ status: "paid", rental }))
      .catch(async (err) => {
        // Look up the rental so "Try Again" and "Contact Agent" go to the right property
        const rental = await rentalApi
          .getMyRentals()
          .then((list) => list.find((r) => r.reference === reference))
          .catch(() => null);
        if (active) setState({ status: "failed", message: err.message, rental });
      });
    return () => {
      active = false;
    };
  }, [reference]);

  if (!reference) return <Navigate to="/account/rentals" replace />;

  const { status, rental, message } = state;

  return (
    <div className="grid min-h-[70vh] place-items-center bg-gray-50 px-4 py-16">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl sm:p-10">
        {status === "verifying" && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-brand-500" />
            <h1 className="mt-5 text-xl font-bold text-gray-900">Confirming your payment...</h1>
            <p className="mt-2 text-sm text-gray-600">Please keep this page open. We're checking the payment with Paystack.</p>
          </>
        )}

        {status === "paid" && (
          <>
            <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-50">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            </span>
            <h1 className="mt-6 text-2xl font-extrabold text-gray-900">Payment Successful</h1>
            <p className="mt-2 text-gray-600">Your rental payment was received and verified. {rental.owner?.name || "The owner"} has been notified and will confirm your rental.</p>
            <dl className="mt-6 divide-y divide-gray-100 rounded-2xl px-4 text-left text-sm ring-1 ring-gray-200">
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-gray-500">Property</dt>
                <dd className="text-right font-semibold text-gray-900">{rental.property.title}</dd>
              </div>
              {rental.hotelId && <div className="flex justify-between gap-4 py-3"><dt className="text-gray-500">Room</dt><dd className="text-right font-semibold text-gray-900">{rental.roomName} · {rental.numberOfRooms} room(s)</dd></div>}
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-gray-500">Rental period</dt>
                <dd className="text-right font-semibold text-gray-900">{formatDate(rental.startDate)} – {formatDate(rental.endDate)}</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-gray-500">Amount paid</dt>
                <dd className="font-extrabold text-gray-900">{ghs(rental.amount)}</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-gray-500">Reference</dt>
                <dd className="font-mono text-xs font-semibold text-gray-900">{rental.reference}</dd>
              </div>
            </dl>
            <div className="mt-8 grid gap-3">
              <Link to="/account/rentals" className="btn btn-primary">View My Rental</Link>
              <Link to={paths.listings} className="btn btn-light">Back to Properties</Link>
            </div>
          </>
        )}

        {status === "failed" && (
          <>
            <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-red-50">
              <XCircle className="h-10 w-10 text-red-500" />
            </span>
            <h1 className="mt-6 text-2xl font-extrabold text-gray-900">Payment needs attention</h1>
            <p className="mt-2 text-gray-600">We couldn't confirm this booking. Review the payment status below before trying again.</p>
            {message && <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{message}</p>}
            <div className="mt-8 grid gap-3">
              <Link to="/account/rentals" className="btn btn-primary">
                <RotateCcw className="h-4 w-4" />
                View bookings & payment status
              </Link>
              <Link to={rental ? `/house/${rental.property.id}?action=chat` : "/account/messages"} className="btn btn-light">
                <MessageCircle className="h-4 w-4" />
                Contact Agent
              </Link>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default PaymentResult;
