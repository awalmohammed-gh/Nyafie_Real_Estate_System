import { useId, useState } from "react";
import { motion } from "motion/react";
import { CheckCircle2, Flag, Loader2 } from "lucide-react";
import Modal from "../ui/Modal";
import { reportApi } from "../../frontApi";
import { usePlatform } from "../../context/usePlatform";

/**
 * Reports a listing or an agent to the NyaFie team. target: { type: "property" | "agent", id, name }.
 * The reported side is never told who reported them.
 */
const ReportModal = ({ target, open, onClose }) => {
  const id = useId();
  const { siteName } = usePlatform();
  const reasons = reportApi.REPORT_REASONS[target.type];
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent
  const [error, setError] = useState("");
  const noun = target.type === "property" ? "listing" : "agent";

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setStatus("sending");
    try {
      await reportApi.sendReport({ targetType: target.type, targetId: target.id, reason, details: details.trim() });
      setStatus("sent");
    } catch (err) {
      setError(err.message);
      setStatus("idle");
    }
  };

  const close = () => {
    onClose();
    setTimeout(() => { setStatus("idle"); setReason(""); setDetails(""); setError(""); }, 250);
  };

  return (
    <Modal open={open} onClose={close} title={status === "sent" ? "Report sent" : `Report this ${noun}`} description={status === "sent" ? undefined : target.name}>
      {status === "sent" ? (
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="py-6 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50"><CheckCircle2 className="h-8 w-8 text-emerald-500" aria-hidden="true" /></span>
          <p className="mt-4 font-semibold text-gray-900">Thank you for helping keep {siteName} safe.</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">Our team will review your report. The {noun === "listing" ? "owner" : "agent"} won't be told who reported them, and we'll let you know once it's reviewed.</p>
          <button type="button" onClick={close} className="btn btn-primary mt-6">Done</button>
        </motion.div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-gray-700">What's wrong?</legend>
            <div className="space-y-2">
              {Object.entries(reasons).map(([key, label]) => (
                <label key={key} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-colors ${reason === key ? "border-brand-400 bg-brand-50/60 text-gray-900" : "border-gray-200 text-gray-700 hover:border-gray-300"}`}>
                  <input type="radio" name={`${id}-reason`} value={key} checked={reason === key} onChange={() => setReason(key)} required className="accent-brand-600" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor={`${id}-details`} className="mb-1.5 block text-sm font-medium text-gray-700">Details {reason === "other" ? "" : <span className="font-normal text-gray-500">(optional)</span>}</label>
            <textarea id={`${id}-details`} rows={3} maxLength={1000} required={reason === "other"} minLength={reason === "other" ? 10 : undefined} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What happened? Include dates, amounts or messages if you can." className="field resize-none" />
          </div>
          {reason === "scam" && <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">If you've already sent money, also contact your bank or mobile money provider and the police as soon as possible.</p>}
          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={status === "sending" || !reason} className="btn btn-primary w-full py-3.5">
            {status === "sending" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Flag className="h-4 w-4" aria-hidden="true" />}
            Send report
          </button>
        </form>
      )}
    </Modal>
  );
};

export default ReportModal;
