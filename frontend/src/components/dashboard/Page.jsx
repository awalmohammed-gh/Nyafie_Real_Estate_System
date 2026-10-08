import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { dashboardReveal } from "../../utils/dashboardMotion";

// Page title row used by every admin and agent page
export const PageHeader = ({ title, description, actions, eyebrow }) => (
  <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      {eyebrow && <p className="mb-1 text-xs font-medium text-gray-500">{eyebrow}</p>}
      <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">{title}</h1>
      {description && <p className="mt-1 max-w-2xl text-sm text-gray-500">{description}</p>}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

// A workspace card (16px radius, hairline border) with an optional header row: title, hint, link or actions
export const Panel = ({ title, description, action, to, toLabel = "View all", children, className = "", bodyClassName = "p-4 sm:p-6", as: Tag = "section" }) => {
  const reducedMotion = useReducedMotion();
  const MotionTag = motion[Tag];
  return (
  <MotionTag initial={reducedMotion ? false : "hidden"} whileInView="visible" viewport={{ once: true, amount: 0.1 }} variants={reducedMotion ? undefined : dashboardReveal} className={`admin-card overflow-hidden ${className}`}>
    {(title || action || to) && (
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-gray-100 px-4 py-3.5 sm:px-6 sm:py-4">
        <div className="min-w-0">
          {title && <h2 className="text-[0.9375rem] font-semibold text-gray-900">{title}</h2>}
          {description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}
        </div>
        {action}
        {to && (
          <Link to={to} className="inline-flex min-h-9 shrink-0 items-center gap-0.5 text-sm font-semibold text-brand-700 hover:text-brand-800">
            {toLabel}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </header>
    )}
    <div className={bodyClassName}>{children}</div>
  </MotionTag>
  );
};

// Label/value pairs in a responsive grid (details panels and side panels)
export const DetailList = ({ items, columns = "sm:grid-cols-2", className = "" }) => (
  <dl className={`grid grid-cols-1 gap-x-6 gap-y-3 text-sm ${columns} ${className}`}>
    {items.filter(Boolean).map(([label, value]) => (
      <div key={label} className="flex min-w-0 justify-between gap-4 border-b border-gray-100 pb-2.5 sm:block sm:border-0 sm:pb-0">
        <dt className="shrink-0 text-gray-500">{label}</dt>
        <dd className="min-w-0 text-right font-medium break-words text-gray-900 sm:mt-0.5 sm:text-left">{value}</dd>
      </div>
    ))}
  </dl>
);
