import { formatDate, formatTime } from "../../utils/date";

const ROLE = { admin: "Admin", agent: "Agent", user: "Customer" };

// Transaction history of a rental or purchase request, newest first
const HistoryTimeline = ({ history, className = "" }) => {
  if (!history?.length) return null;
  return (
    <ol className={`relative space-y-4 border-l-2 border-gray-100 pl-5 ${className}`}>
      {[...history].reverse().map((h, i) => (
        <li key={`${h.at}-${i}`} className="relative">
          <span className={`absolute top-1 -left-[1.6rem] h-3 w-3 rounded-full ring-4 ring-white ${i === 0 ? "bg-brand-500" : "bg-gray-300"}`} />
          <p className="text-sm font-semibold text-gray-900">{h.note || h.statusLabel}</p>
          <p className="text-xs text-gray-500">
            {formatDate(h.at)} · {formatTime(h.at)}
            {h.by && ` · ${h.by.name} (${ROLE[h.by.role] || "User"})`}
          </p>
        </li>
      ))}
    </ol>
  );
};

export default HistoryTimeline;
