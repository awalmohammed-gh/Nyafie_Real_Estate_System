import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { AlertTriangle, Ban, Clock, Hourglass } from "lucide-react";
import { useAgentPermissions } from "../../hooks/useAgentPermissions";
import { useAuth } from "../../context/useAuth";
import { formatDate } from "../../utils/date";

// Account/subscription warning shown across the agent area
const SubscriptionBanner = () => {
  const { user } = useAuth();
  const perms = useAgentPermissions();
  const sub = user?.subscription;
  const { restriction, subscription } = perms;

  let banner = null;
  if (restriction === "suspended") {
    banner = { tone: "red", icon: Ban, title: "Your agent account is suspended.", text: "Your listings are hidden and agent tools are locked. Contact HomeBase support to restore access." };
  } else if (restriction === "expired") {
    banner = { tone: "red", icon: AlertTriangle, title: `Your ${sub.planName} subscription expired on ${formatDate(sub.expiryDate)}.`, text: "Your listings are hidden from the public and you can't publish or edit properties until you renew. Your account and data are safe.", cta: "Renew Subscription", to: `/agent/checkout?plan=${sub.planId}` };
  } else if (restriction === "cancelled") {
    banner = { tone: "red", icon: AlertTriangle, title: "Your subscription was cancelled.", text: "Your properties are kept but hidden. Renew to reactivate your agent tools.", cta: "Renew Subscription", to: `/agent/checkout?plan=${sub.planId}` };
  } else if (restriction === "pending") {
    banner = { tone: "amber", icon: Hourglass, title: "Your payment is being confirmed.", text: `Your ${sub.planName} plan starts as soon as HomeBase confirms your ${sub.paymentMethod?.toLowerCase() || "payment"}.` };
  } else if (subscription.expiringSoon) {
    banner = { tone: "amber", icon: Clock, title: `Your subscription expires in ${subscription.daysRemaining} ${subscription.daysRemaining === 1 ? "day" : "days"}.`, text: "Renew now to keep your listings online.", cta: "Manage subscription", to: "/agent/subscription" };
  }
  if (!banner) return null;

  const styles = banner.tone === "red" ? "bg-red-50 ring-red-100 text-red-800" : "bg-amber-50 ring-amber-100 text-amber-900";
  const iconColor = banner.tone === "red" ? "text-red-500" : "text-amber-500";

  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className={`mb-6 flex flex-col gap-4 rounded-2xl p-4 ring-1 sm:flex-row sm:items-center sm:justify-between sm:p-5 ${styles}`}>
      <p className="flex items-start gap-3 text-sm">
        <banner.icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconColor}`} />
        <span>
          <span className="font-semibold">{banner.title}</span> {banner.text}
        </span>
      </p>
      {banner.cta && (
        <Link to={banner.to} className={`btn shrink-0 ${banner.tone === "red" ? "btn-primary" : "btn-light"}`}>
          {banner.cta}
        </Link>
      )}
    </motion.div>
  );
};

export default SubscriptionBanner;
