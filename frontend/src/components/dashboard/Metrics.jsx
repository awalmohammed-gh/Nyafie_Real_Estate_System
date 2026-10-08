import { Link } from "react-router-dom";

// Literal class names so Tailwind can see them
const LG_COLS = { 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6" };

const TONES = {
  default: "text-gray-900",
  brand: "text-brand-700",
  green: "text-emerald-700",
  amber: "text-amber-700",
  red: "text-red-700",
};

/**
 * A row of related numbers in one bordered strip, separated by dividers,
 * instead of a grid of identical cards. Cells with `to` link to the page
 * behind the number; `attention` marks a number that needs action.
 */
export const MetricStrip = ({ items, className = "" }) => (
  <div className={`grid grid-cols-2 overflow-hidden rounded-xl border border-gray-200 bg-white sm:grid-cols-3 ${LG_COLS[Math.min(items.length, 6)] || ""} ${className}`}>
    {items.map((item) => {
      const body = (
        <>
          <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
            {item.attention && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />}
            {item.label}
          </p>
          <p className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${TONES[item.tone || "default"]}`}>{item.value}</p>
          {item.hint && <p className="mt-0.5 truncate text-xs text-gray-500">{item.hint}</p>}
        </>
      );
      const cell = "-mb-px -mr-px border-r border-b border-gray-100 px-4 py-3.5 sm:px-5";
      return item.to ? (
        <Link key={item.label} to={item.to} className={`${cell} transition-colors hover:bg-gray-50`}>
          {body}
        </Link>
      ) : (
        <div key={item.label} className={cell}>
          {body}
        </div>
      );
    })}
  </div>
);

// Stacked bar with a legend; used for inventory and status breakdowns
export const Breakdown = ({ segments, total }) => {
  const sum = total ?? segments.reduce((s, x) => s + x.value, 0);
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(", ")}>
        {sum > 0 && segments.map((s) => s.value > 0 && <span key={s.label} className={s.className} style={{ width: `${(s.value / sum) * 100}%` }} />)}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {segments.map((s) => {
          const content = (
            <>
              <span className={`h-2 w-2 shrink-0 rounded-full ${s.className}`} />
              <span className="flex-1 truncate text-gray-600">{s.label}</span>
              <span className="font-semibold text-gray-900 tabular-nums">{s.value}</span>
            </>
          );
          return (
            <li key={s.label}>
              {s.to ? (
                <Link to={s.to} className="-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-0.5 hover:bg-gray-50">{content}</Link>
              ) : (
                <span className="flex items-center gap-2">{content}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
