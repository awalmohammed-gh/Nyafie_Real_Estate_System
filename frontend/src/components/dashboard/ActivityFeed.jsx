import { Link } from "react-router-dom";
import { Activity } from "lucide-react";
import StatusBadge from "../ui/StatusBadge";
import { timeAgo } from "../../utils/date";

const TONES = {
  brand: "bg-brand-50 text-brand-600",
  green: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  sky: "bg-sky-50 text-sky-600",
  gray: "bg-gray-100 text-gray-500",
  red: "bg-red-50 text-red-600",
};

/**
 * Compact timeline of real events (see utils/activity.js). Each row: icon,
 * what happened, the related property or person, when, and a status.
 */
const ActivityFeed = ({ items, loading, emptyText = "No activity yet." }) => {
  if (loading) {
    return (
      <ul className="divide-y divide-gray-100" aria-busy="true">
        {Array.from({ length: 5 }, (_, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <span className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-gray-100" />
            <span className="flex-1 space-y-1.5">
              <span className="block h-3 w-2/3 animate-pulse rounded bg-gray-100" />
              <span className="block h-2.5 w-1/3 animate-pulse rounded bg-gray-100" />
            </span>
          </li>
        ))}
      </ul>
    );
  }
  if (!items.length) {
    return (
      <p className="flex items-center gap-2 px-4 py-8 text-sm text-gray-500 sm:px-5">
        <Activity className="h-4 w-4 text-gray-400" />
        {emptyText}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-gray-100">
      {items.map((item) => {
        const row = (
          <>
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${TONES[item.tone || "gray"]}`}>
              <item.icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-gray-900">
                <span className="font-medium">{item.title}</span>
                {item.subject && <span className="text-gray-500"> · {item.subject}</span>}
              </span>
              <span className="block truncate text-xs text-gray-500">
                {item.detail ? `${item.detail} · ` : ""}
                {timeAgo(item.at)}
              </span>
            </span>
            {item.status && <StatusBadge status={item.status} className="hidden shrink-0 sm:inline-flex" />}
          </>
        );
        return (
          <li key={item.id}>
            {item.to ? (
              <Link to={item.to} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-gray-50 sm:px-5">{row}</Link>
            ) : (
              <div className="flex items-center gap-3 px-4 py-2.5 sm:px-5">{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export default ActivityFeed;
