import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { TrendingDown, TrendingUp } from "lucide-react";

// Overview metric. `change` is the % change vs the previous 30 days (null = new).
const AdminStat = ({ icon: Icon, label, value, change, changeLabel = "vs last 30 days", to, index = 0, tone = "brand" }) => {
  const toneClass = { brand: "bg-brand-50 text-brand-600", slate: "bg-slate-100 text-slate-600", amber: "bg-amber-50 text-amber-600", red: "bg-red-50 text-red-600", green: "bg-emerald-50 text-emerald-600" }[tone];
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${toneClass}`}>
          <Icon className="h-4.5 w-4.5" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-extrabold tracking-tight text-gray-900 tabular-nums sm:text-3xl">{value}</p>
      {change !== undefined && (
        <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
          {change === null ? (
            <span className="font-semibold text-emerald-700">New</span>
          ) : change === 0 ? (
            <span className="font-semibold text-gray-600">No change</span>
          ) : (
            <span className={`inline-flex items-center gap-0.5 font-semibold ${change > 0 ? "text-emerald-700" : "text-red-600"}`}>
              {change > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {change > 0 ? "+" : ""}
              {change}%
            </span>
          )}
          <span>{changeLabel}</span>
        </p>
      )}
    </>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03, duration: 0.25 }}>
      {to ? (
        <Link to={to} className="block h-full rounded-2xl bg-white p-5 ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-lg">{content}</Link>
      ) : (
        <div className="h-full rounded-2xl bg-white p-5 ring-1 ring-slate-200">{content}</div>
      )}
    </motion.div>
  );
};

export default AdminStat;
