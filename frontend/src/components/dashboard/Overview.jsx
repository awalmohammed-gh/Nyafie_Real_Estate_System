import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { CheckCircle2, ChevronRight } from "lucide-react";

// Building blocks for the admin and agent overview pages

// One wide surface split into zones (side by side on large screens, stacked on phones)
export const Band = ({ children, className = "", cols = "lg:grid-cols-3" }) => (
  <motion.section
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25, ease: "easeOut" }}
    className={`grid overflow-hidden rounded-xl border border-gray-200 bg-white ${cols} divide-y divide-gray-100 lg:divide-x lg:divide-y-0 ${className}`}
  >
    {children}
  </motion.section>
);

export const Zone = ({ title, action, children, className = "" }) => (
  <div className={`min-w-0 p-5 ${className}`}>
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-xs font-semibold tracking-wider text-gray-500 uppercase">{title}</h2>
      {action}
    </div>
    {children}
  </div>
);

// A labelled figure that links to the page where it can be acted on
export const FigureRow = ({ label, value, hint, to, attention = false }) => {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-gray-700">{label}</span>
        {hint && <span className="block truncate text-xs text-gray-400">{hint}</span>}
      </span>
      <span className={`text-lg font-semibold tabular-nums ${attention ? "text-amber-600" : "text-gray-900"}`}>{value}</span>
      {to && <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" />}
    </>
  );
  return to ? (
    <Link to={to} className="group -mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-gray-50">
      {body}
    </Link>
  ) : (
    <div className="flex items-center gap-3 py-1.5">{body}</div>
  );
};

// Six small monthly bars with the latest month highlighted (no axis chrome)
export const MiniBars = ({ data, format = (v) => v, label }) => {
  const max = Math.max(...data.map((d) => d.value), 0);
  return (
    <div role="img" aria-label={`${label}: ${data.map((d) => `${d.label} ${format(d.value)}`).join(", ")}`}>
      <div className="flex h-16 items-end gap-1.5">
        {data.map((d, i) => (
          <div key={d.label} className="flex h-full flex-1 flex-col justify-end" title={`${d.label}: ${format(d.value)}`}>
            <motion.span
              initial={{ height: 0 }}
              animate={{ height: max ? `${Math.max((d.value / max) * 100, d.value ? 6 : 2)}%` : "2%" }}
              transition={{ duration: 0.4, delay: i * 0.04, ease: "easeOut" }}
              className={`block w-full rounded-sm ${i === data.length - 1 ? "bg-brand-500" : d.value ? "bg-brand-200" : "bg-gray-100"}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {data.map((d) => (
          <span key={d.label} className="flex-1 text-center text-[10px] text-gray-400">{d.label}</span>
        ))}
      </div>
    </div>
  );
};

// Shown instead of an empty "needs attention" panel
export const AllClear = ({ children }) => (
  <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-5 py-3.5 text-sm text-emerald-900">
    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
    {children}
  </div>
);

// Section heading used between overview rows
export const SectionTitle = ({ title, description, to, toLabel = "View all" }) => (
  <div className="mb-3 flex items-end justify-between gap-3">
    <div className="min-w-0">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {description && <p className="text-sm text-gray-500">{description}</p>}
    </div>
    {to && (
      <Link to={to} className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-brand-600 hover:text-brand-800">
        {toLabel}
        <ChevronRight className="h-4 w-4" />
      </Link>
    )}
  </div>
);
