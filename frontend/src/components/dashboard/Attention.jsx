import { Link } from "react-router-dom";
import { CheckCircle2, ChevronRight } from "lucide-react";

const TONES = {
  amber: "bg-amber-50 text-amber-700",
  brand: "bg-brand-50 text-brand-700",
  red: "bg-red-50 text-red-700",
  sky: "bg-sky-50 text-sky-700",
  gray: "bg-gray-100 text-gray-600",
};

/**
 * "Needs attention": only the things someone has to act on, each linking to
 * where it gets done. Items with a count of 0 are hidden.
 * label: text, or [singular, plural] so counts read naturally ("1 offer", "2 offers").
 */
const labelFor = (item) => (Array.isArray(item.label) ? item.label[item.count === 1 ? 0 : 1] : item.label);

const AttentionList = ({ items, emptyText = "You're all caught up." }) => {
  const visible = items.filter((i) => i.count > 0);
  if (visible.length === 0) {
    return (
      <p className="flex items-center gap-2 px-4 py-6 text-sm text-gray-500 sm:px-5">
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        {emptyText}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-gray-100">
      {visible.map((item) => (
        <li key={labelFor(item)}>
          <Link to={item.to} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 sm:px-5">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${TONES[item.tone || "amber"]}`}>
              <item.icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-gray-900">
                <span className="tabular-nums">{item.count}</span> {labelFor(item)}
              </span>
              {item.hint && <span className="block truncate text-xs text-gray-500">{item.hint}</span>}
            </span>
            <span className="hidden text-xs font-semibold text-brand-600 sm:inline">{item.action || "Review"}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-gray-500" />
          </Link>
        </li>
      ))}
    </ul>
  );
};

export default AttentionList;
