import { BadgeCheck, MailWarning } from "lucide-react";

// Whether someone proved their email is theirs (a code from their inbox, or Google)
const EmailStatus = ({ verified, className = "" }) => {
  const Icon = verified ? BadgeCheck : MailWarning;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap ${verified ? "text-emerald-700" : "text-amber-700"} ${className}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {verified ? "Email verified" : "Not verified"}
    </span>
  );
};

export default EmailStatus;
