import { Check, XCircle } from "lucide-react";

// Lifecycle of each kind of transaction, in order
const STEPS = {
  offer: [
    { key: "pending", label: "Pending" },
    { key: "countered", label: "Negotiating" },
    { key: "accepted", label: "Accepted" },
  ],
  rental: [
    { key: "pending", label: "Pending" },
    { key: "payment_pending", label: "Payment pending" },
    { key: "paid", label: "Paid" },
    { key: "confirmed", label: "Confirmed" },
    { key: "active", label: "Active" },
    { key: "completed", label: "Completed" },
  ],
  // "Reserve now, pay on arrival" (hotels and per-night rentals): reserved without paying; paid on arrival
  stayReservation: [
    { key: "pending", label: "Requested" },
    { key: "confirmed", label: "Reserved" },
    { key: "active", label: "Checked in" },
    { key: "completed", label: "Completed" },
  ],
  sale: [
    { key: "pending", label: "Pending" },
    { key: "contacted", label: "Contacted" },
    { key: "negotiating", label: "Negotiating", also: ["offer_received", "approved"] },
    { key: "payment_pending", label: "Payment pending" },
    { key: "paid_at_office", label: "Payment received" },
    { key: "completed", label: "Completed" },
  ],
};

const ENDED = { rejected: "Rejected", cancelled: "Cancelled", withdrawn: "Withdrawn" };

/**
 * Shows where a transaction is in its lifecycle. `status` is the API key
 * (e.g. "payment_pending"); ended statuses (rejected/cancelled) are shown plainly.
 */
const StatusSteps = ({ kind, status }) => {
  if (ENDED[status]) {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
        <XCircle className="h-4 w-4 text-gray-400" />
        This {{ sale: "purchase request", stayReservation: "reservation" }[kind] || kind} was {ENDED[status].toLowerCase()}.
      </p>
    );
  }
  const steps = STEPS[kind];
  const index = Math.max(0, steps.findIndex((s) => s.key === status || s.also?.includes(status)));
  return (
    <ol className="flex items-start" aria-label="Progress">
      {steps.map((step, i) => {
        const done = i < index;
        const current = i === index;
        return (
          <li key={step.key} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 && <span className={`absolute top-2.5 right-1/2 h-0.5 w-full -translate-y-1/2 ${i <= index ? "bg-brand-500" : "bg-gray-200"}`} aria-hidden="true" />}
            <span
              className={`relative grid h-5 w-5 place-items-center rounded-full text-[10px] font-semibold ${
                done ? "bg-brand-500 text-white" : current ? "bg-white text-brand-700 ring-2 ring-brand-500" : "bg-white text-gray-400 ring-1 ring-gray-300"
              }`}
            >
              {done ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className={`mt-1.5 px-0.5 text-[11px] leading-tight ${current ? "font-semibold text-gray-900" : "text-gray-500"}`} aria-current={current ? "step" : undefined}>
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

export default StatusSteps;
