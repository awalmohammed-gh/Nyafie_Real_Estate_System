import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

const WorkspaceStats = ({ items, className = "" }) => (
  <dl className={`workspace-stats ${className}`}>
    {items.map(({ label, value, note, icon: Icon, to }) => {
      return <div key={label} className="workspace-stat"><dt className="flex items-center justify-between gap-3 text-sm font-medium text-gray-500">{to ? <Link to={to} className="after:absolute after:inset-0 after:rounded-2xl">{label}</Link> : label}{Icon && <Icon className="h-4 w-4 text-brand-600" aria-hidden="true" />}</dt><dd className="mt-3"><span className="block text-3xl font-semibold tracking-tight text-gray-900 tabular-nums">{value}</span>{note && <span className="mt-1 block text-xs text-gray-500">{note}</span>}</dd>{to && <ArrowUpRight className="absolute right-4 bottom-4 h-4 w-4 text-gray-400" aria-hidden="true" />}</div>;
    })}
  </dl>
);
export default WorkspaceStats;
