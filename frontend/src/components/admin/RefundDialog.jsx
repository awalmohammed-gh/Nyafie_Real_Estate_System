import { useState } from "react";
import { Loader2, RefreshCw, RotateCcw } from "lucide-react";
import AdminRecordModal from "./AdminRecordModal";
import StatusBadge from "../ui/StatusBadge";
import { useToast } from "../../context/useToast";
import { paymentApi } from "../../frontApi";
import { formatDate } from "../../utils/date";

const ghs = (value) => `₵${Number(value).toLocaleString()}`;
// Paystack never confirmed these, so an admin settles them after checking the dashboard
const UNCONFIRMED = ["submitting", "unconfirmed"];
const FINAL = ["processed", "failed"];

/**
 * Refunds one flagged payment (rental, hotel or subscription), or follows up on its refund.
 * `payment`: { source, recordId, reference, amount, payer, item, note, refund }
 */
const RefundDialog = ({ payment, onClose, onChanged }) => {
  const { toast } = useToast();
  const refund = payment?.refund;
  const startNew = !refund || refund.status === "failed";
  const [method, setMethod] = useState("paystack");
  const [reason, setReason] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [outcome, setOutcome] = useState("processed");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (action) => {
    setBusy(true);
    try {
      const { message } = await action();
      toast({ title: message || "Refund updated" });
      onChanged();
    } catch (error) {
      toast({ type: "error", title: error.message });
    } finally {
      setBusy(false);
    }
  };

  const manual = method === "manual";
  const canSubmit = !busy && (!manual || (reason.trim() && externalReference.trim()));
  const submit = () => run(() => paymentApi.requestRefund({ source: payment.source, id: payment.recordId, method, reason: reason.trim(), externalReference: externalReference.trim() }));
  const check = () => run(() => paymentApi.checkRefund(refund.id));
  const settle = () => run(() => paymentApi.resolveRefund(refund.id, { outcome, note: note.trim() }));

  const footer = payment && (
    <>
      <button type="button" onClick={onClose} disabled={busy} className="btn btn-light">Close</button>
      {startNew ? (
        <button type="button" onClick={submit} disabled={!canSubmit} className="btn btn-primary">
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <RotateCcw size={16} aria-hidden="true" />}
          {manual ? "Record refund" : `Refund ${ghs(payment.amount)}`}
        </button>
      ) : UNCONFIRMED.includes(refund.status) ? (
        <button type="button" onClick={settle} disabled={busy || !note.trim()} className="btn btn-primary">Save Paystack outcome</button>
      ) : !FINAL.includes(refund.status) && refund.providerRefundId ? (
        <button type="button" onClick={check} disabled={busy} className="btn btn-primary">
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}Check with Paystack
        </button>
      ) : null}
    </>
  );

  return (
    <AdminRecordModal open={Boolean(payment)} onClose={() => !busy && onClose()} title={startNew ? "Refund payment" : "Refund"} description={payment ? `${payment.item} · ${payment.reference}` : ""} footer={footer}>
      {payment && (
        <div className="space-y-5 text-sm">
          <dl className="grid gap-3 rounded-xl bg-gray-50 p-4 sm:grid-cols-2">
            {[["Paid by", payment.payer], ["Amount", ghs(payment.amount)], ["Why it needs a refund", payment.note || "Flagged for review"]].map(([label, value]) => (
              <div key={label} className={label.startsWith("Why") ? "sm:col-span-2" : ""}><dt className="text-gray-500">{label}</dt><dd className="font-medium break-words text-gray-900">{value}</dd></div>
            ))}
          </dl>

          {refund && (
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-gray-900">{startNew ? "Previous attempt" : "Refund status"}</h2>
                <StatusBadge status={refund.label} dot={false} />
              </div>
              <dl className="mt-3 grid gap-2 text-gray-600">
                <div><dt className="inline text-gray-500">Method: </dt><dd className="inline">{refund.method === "Manual" ? `Outside Paystack (${refund.externalReference})` : "Paystack"}</dd></div>
                <div><dt className="inline text-gray-500">Requested: </dt><dd className="inline">{formatDate(refund.createdAt)}</dd></div>
                {refund.processedAt && <div><dt className="inline text-gray-500">Processed: </dt><dd className="inline">{formatDate(refund.processedAt)}</dd></div>}
                {refund.providerRefundId && <div><dt className="inline text-gray-500">Paystack refund ID: </dt><dd className="inline font-mono text-xs">{refund.providerRefundId}</dd></div>}
                {refund.failureReason && <div><dt className="inline text-gray-500">Reason: </dt><dd className="inline text-red-700">{refund.failureReason}</dd></div>}
              </dl>
              {refund.status === "processed" && refund.method === "Paystack" && <p className="mt-3 text-xs text-gray-500">Paystack has processed this refund. It can take up to 10 business days to reach the customer.</p>}
              {refund.status === "needs-attention" && <p className="mt-3 text-xs text-amber-800">Paystack needs more information, usually the customer&apos;s account details. Complete it in the Paystack dashboard; this page updates when Paystack does.</p>}
            </div>
          )}

          {startNew && (
            <>
              <fieldset className="space-y-2">
                <legend className="mb-2 font-semibold text-gray-900">How is the money returned?</legend>
                {[["paystack", "Refund through Paystack", "Paystack returns the whole payment to the customer's original payment method."], ["manual", "Already returned another way", "Record a refund you made outside Paystack, for example by mobile money."]].map(([value, label, hint]) => (
                  <label key={value} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${method === value ? "border-brand-200 bg-brand-50" : "border-gray-200"}`}>
                    <input type="radio" name="refund-method" value={value} checked={method === value} onChange={() => setMethod(value)} className="mt-1" />
                    <span><span className="block font-medium text-gray-900">{label}</span><span className="text-xs text-gray-500">{hint}</span></span>
                  </label>
                ))}
              </fieldset>
              {manual && (
                <label className="block font-medium text-gray-900">Transaction reference
                  <input value={externalReference} onChange={(e) => setExternalReference(e.target.value)} maxLength={100} placeholder="e.g. the mobile money transaction ID" className="field mt-2 font-normal" />
                </label>
              )}
              <label className="block font-medium text-gray-900">{manual ? "How the money was returned" : "Note (optional)"}
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} placeholder={manual ? "Who sent it, to which account, and when" : "Shown to Paystack as the merchant note"} className="field mt-2 font-normal" />
              </label>
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">This refunds the whole {ghs(payment.amount)}. It cannot be undone, and the booking or plan it paid for is not restored.</p>
            </>
          )}

          {refund && UNCONFIRMED.includes(refund.status) && (
            <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-amber-900">Paystack did not confirm this refund, so it may or may not have been sent. <strong>Do not refund again.</strong> Find payment {payment.reference} in the Paystack dashboard and record what it shows.</p>
              <div role="group" aria-label="What Paystack shows" className="grid grid-cols-2 gap-2">
                {[["processed", "Refund processed"], ["failed", "No refund / failed"]].map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={outcome === value} onClick={() => setOutcome(value)} className={`rounded-lg border px-3 py-2.5 font-medium ${outcome === value ? "border-brand-200 bg-white text-brand-800" : "border-amber-200 text-amber-900"}`}>{label}</button>
                ))}
              </div>
              <label className="block font-medium text-gray-900">What the dashboard shows
                <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} className="field mt-2 font-normal" />
              </label>
            </div>
          )}
        </div>
      )}
    </AdminRecordModal>
  );
};

export default RefundDialog;
