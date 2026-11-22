import { BadgeCheck, Flag, ShieldCheck } from "lucide-react";
import { formatDate } from "../../utils/date";

// Short safety advice beside a listing's contact actions, with a way to report it
// documentsVerifiedAt: when NyaFie checked the owner's ownership documents (sale listings)
const SafetyNote = ({ forSale, onReport, reportLabel = "Report this listing", documentsVerifiedAt }) => (
  <div className="rounded-xl bg-gray-50 p-4 text-xs leading-5 text-gray-600">
    {forSale && documentsVerifiedAt && (
      <p className="mb-3 flex items-start gap-1.5 rounded-lg bg-emerald-50 p-2.5 text-emerald-900">
        <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span><span className="font-semibold">Documents checked</span> on {formatDate(documentsVerifiedAt)}: the owner showed our team the title documents for this property. This isn't a legal guarantee, so do your own search at the Lands Commission before paying.</span>
      </p>
    )}
    <p className="flex items-center gap-1.5 font-semibold text-gray-900"><ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />Stay safe</p>
    <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
      <li><span className="font-semibold text-gray-800">Don't pay anything, online or in cash, until you've seen the property in person.</span></li>
      <li>Never pay anyone just to view a property. Viewings are free.</li>
      {forSale && <li>Check the title documents before paying anything.</li>}
      <li>Only pay the owner or agent shown on this page, and keep a receipt.</li>
      <li>Once you've paid, ask the agent to mark it as {forSale ? "sold" : "rented"} here, so nobody else pays for it.</li>
    </ul>
    {onReport && (
      <button type="button" onClick={onReport} className="mt-2 inline-flex min-h-8 items-center gap-1.5 font-semibold text-gray-700 hover:text-red-700">
        <Flag className="h-3.5 w-3.5" aria-hidden="true" />
        {reportLabel}
      </button>
    )}
  </div>
);

export default SafetyNote;
