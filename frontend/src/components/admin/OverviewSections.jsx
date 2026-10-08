import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight } from "lucide-react";
import { formatCedis } from "../../utils/reports";
import { motion, useReducedMotion } from "motion/react";
import { dashboardReveal, dashboardStagger } from "../../utils/dashboardMotion";

// Pieces of the admin overview (pages/admin/AdminDashboard.jsx). Data comes from GET /api/admin/dashboard.

const plural = (count, one, many) => (count === 1 ? one : many);
const TONE_SOFT = {
  brand: "bg-brand-50 text-brand-600",
  amber: "bg-amber-50 text-amber-700",
  sky: "bg-sky-50 text-sky-700",
  gray: "bg-gray-100 text-gray-600",
};

// ---------- Summary cards: label, value, icon, one supporting line and where to manage it

export const MetricGrid = ({ items }) => {
  const reducedMotion = useReducedMotion();
  return (
  <motion.ul initial={reducedMotion ? false : "hidden"} animate="visible" variants={reducedMotion ? undefined : dashboardStagger} className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
    {items.map(({ label, value, hint, icon: Icon, to, toLabel, attention }) => (
      <motion.li key={label} variants={reducedMotion ? undefined : dashboardReveal} className="admin-card flex min-w-0 flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-gray-600">{label}</p>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600" aria-hidden="true">
            <Icon className="h-4.5 w-4.5" />
          </span>
        </div>
        <p className="mt-1 truncate text-2xl font-semibold tracking-tight text-gray-900 sm:text-[1.75rem]">{value}</p>
        <p className={`mt-1 flex items-center gap-1.5 text-xs ${attention ? "font-medium text-amber-800" : "text-gray-500"}`}>
          {attention && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />}
          {hint}
        </p>
        {to && (
          <Link to={to} className="mt-auto inline-flex min-h-9 items-center gap-1 self-start pt-3 text-sm font-semibold text-brand-700 hover:text-brand-800">
            {toLabel}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        )}
      </motion.li>
    ))}
  </motion.ul>
  );
};

// ---------- Needs attention: only work someone has to act on, most urgent first

export const AttentionItems = ({ items }) => (
  <ul className="divide-y divide-gray-100">
    {items.map(({ icon: Icon, count, label, hint, to, tone, action }) => (
      <li key={to + label[0]}>
        <Link to={to} className="group flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 sm:px-6">
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${TONE_SOFT[tone]}`} aria-hidden="true">
            <Icon className="h-4.5 w-4.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-gray-900">
              <span className="tabular-nums">{count}</span> {plural(count, label[0], label[1])}
            </span>
            {hint && <span className="block text-xs text-gray-500">{hint}</span>}
          </span>
          <span className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-brand-700 group-hover:text-brand-800">
            {action}
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </Link>
      </li>
    ))}
  </ul>
);

// ---------- Deals: compact counters, each one links to where it's handled

export const CounterList = ({ items }) => (
  <ul className="divide-y divide-gray-100">
    {items.map(({ label, value, to }) => (
      <li key={label}>
        <Link to={to} className="group flex min-h-11 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-gray-50 sm:px-6">
          <span className="flex-1 truncate text-sm text-gray-700">{label}</span>
          <span className={`text-sm font-semibold tabular-nums ${value > 0 ? "text-gray-900" : "text-gray-400"}`}>{value}</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" aria-hidden="true" />
        </Link>
      </li>
    ))}
  </ul>
);

// ---------- Revenue by source: all money collected so far, split by where it came from

export const RevenueSources = ({ revenue }) => {
  const rows = [
    ["Rental payments", revenue.breakdown.rental],
    ["Property sales (office)", revenue.breakdown.sale],
    ["Agent subscriptions", revenue.breakdown.subscription],
  ];
  return (
    <div className="p-4 sm:p-6">
      <p className="text-2xl font-semibold tracking-tight text-gray-900">{formatCedis(revenue.total)}</p>
      <p className="mt-0.5 text-xs text-gray-500">Collected since launch</p>
      <dl className="mt-4 space-y-2 border-t border-gray-100 pt-4 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3">
            <dt className="text-gray-600">{label}</dt>
            <dd className={`font-medium tabular-nums ${value ? "text-gray-900" : "text-gray-400"}`}>{formatCedis(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};
