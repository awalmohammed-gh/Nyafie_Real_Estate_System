import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { Lock } from "lucide-react";

// Consistent "why is this unavailable" card for plan-restricted features.
// Pass copy from lockCopy() so wording matches across the app.
const LockedFeature = ({ title, description, cta = "Upgrade Plan", to = "/agent/subscription/plans#plans", compact = false, className = "" }) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25 }}
    className={`flex flex-col items-center rounded-3xl border border-dashed border-gray-300 bg-gray-50/70 text-center ${compact ? "px-5 py-6" : "px-6 py-10"} ${className}`}
  >
    <span className={`grid place-items-center rounded-2xl bg-white text-gray-500 shadow-sm ring-1 ring-gray-200 ${compact ? "h-10 w-10" : "h-12 w-12"}`}>
      <Lock className={compact ? "h-4 w-4" : "h-5 w-5"} />
    </span>
    <h3 className={`mt-4 font-bold text-gray-900 ${compact ? "text-sm" : ""}`}>{title}</h3>
    <p className={`mt-1 max-w-sm text-gray-500 ${compact ? "text-xs" : "text-sm"}`}>{description}</p>
    {cta && (
      <Link to={to} className={`btn btn-primary ${compact ? "mt-4 px-4 py-2 text-xs" : "mt-5"}`}>
        {cta}
      </Link>
    )}
  </motion.div>
);

export default LockedFeature;
