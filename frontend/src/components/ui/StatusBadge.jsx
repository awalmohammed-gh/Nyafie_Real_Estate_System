const tones = {
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
  gray: "bg-gray-100 text-gray-700 ring-gray-200",
};

const statusTone = {
  New: "brand",
  Contacted: "amber",
  Closed: "gray",
  Published: "green",
  Draft: "gray",
  Active: "green",
  Expired: "red",
  "Expiring soon": "amber",
  Available: "green",
  "Under Offer": "amber",
  Sold: "sky",
  Rented: "sky",
  Hidden: "red",
  "Pending Review": "amber",
  Pending: "amber",
  Rejected: "red",
  Suspended: "red",
  Approved: "green",
  "Not submitted": "gray",
  "In Progress": "sky",
  Cancelled: "gray",
  Paid: "green",
  Failed: "red",
  Waived: "gray",
  Featured: "brand",
  "No subscription": "gray",
};

const StatusBadge = ({ status, tone, dot = true, className = "" }) => {
  const key = tone || statusTone[status] || "gray";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset ${tones[key]} ${className}`}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {status}
    </span>
  );
};

export default StatusBadge;
