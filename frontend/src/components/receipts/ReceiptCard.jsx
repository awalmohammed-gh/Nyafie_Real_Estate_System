import { useState } from "react";
import { Download, Loader2, ReceiptText } from "lucide-react";
import { usePlatform } from "../../context/usePlatform";
import { receiptRows } from "../../utils/receipt";

/**
 * The receipt the agent, agency or hotel gave for a payment (rentals, hotel bookings and purchases),
 * with a PDF download. Shown to the customer and to the owner side.
 */
const ReceiptCard = ({ receipt, className = "" }) => {
  const { siteName } = usePlatform();
  const [busy, setBusy] = useState(false);
  if (!receipt) return null;
  const download = async () => {
    setBusy(true);
    try {
      const { downloadReceipt } = await import("../../utils/receiptPdf");
      downloadReceipt(receipt, siteName);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={`rounded-xl p-4 ring-1 ring-emerald-200 bg-emerald-50/60 ${className}`} aria-label={`Receipt ${receipt.number}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
          <ReceiptText className="h-4 w-4" aria-hidden="true" />
          Receipt {receipt.number}
        </p>
        <button type="button" onClick={download} disabled={busy} className="btn btn-light px-3 py-1.5 text-xs">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Download PDF
        </button>
      </div>
      <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        {receiptRows(receipt).slice(1).map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-gray-500">{label}</dt>
            <dd className="min-w-0 font-semibold break-words text-gray-900">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

export default ReceiptCard;
