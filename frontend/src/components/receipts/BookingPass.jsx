import { useState } from "react";
import { Clock, Download, Loader2, Ticket } from "lucide-react";
import { usePlatform } from "../../context/usePlatform";
import { bookingRows } from "../../utils/bookingPass";

/**
 * The guest's booking pass for a stay: the booking code to show at the hotel (or to the owner) on
 * arrival, with the dates and arrival time, a PDF download and, while it's still allowed, a way to
 * change the arrival time. onChangeArrival(time) saves it (omit it to hide the control).
 */
const BookingPass = ({ booking, onChangeArrival, className = "" }) => {
  const { siteName } = usePlatform();
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState(false);
  const [time, setTime] = useState(booking?.arrivalTime || "");
  const [error, setError] = useState("");
  if (!booking?.bookingCode) return null;
  const download = async () => {
    setBusy("pdf");
    try {
      const { downloadBookingPass } = await import("../../utils/bookingPdf");
      downloadBookingPass(booking, siteName);
    } finally { setBusy(""); }
  };
  const save = async (event) => {
    event.preventDefault();
    setBusy("time"); setError("");
    try { await onChangeArrival(time); setEditing(false); }
    catch (err) { setError(err.message); }
    finally { setBusy(""); }
  };
  return (
    <section className={`rounded-xl p-4 ring-1 ring-brand-200 bg-brand-50/60 ${className}`} aria-label={`Booking ${booking.bookingCode}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-brand-700 uppercase"><Ticket className="h-4 w-4" aria-hidden="true" />Show this when you arrive</p>
          <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-gray-900">{booking.bookingCode}</p>
        </div>
        <button type="button" onClick={download} disabled={Boolean(busy)} className="btn btn-light px-3 py-1.5 text-xs">
          {busy === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Download booking
        </button>
      </div>
      <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
        {bookingRows(booking).map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-gray-500">{label}</dt>
            <dd className="min-w-0 font-semibold break-words text-gray-900">{value}</dd>
          </div>
        ))}
      </dl>
      {onChangeArrival && (editing ? (
        <form onSubmit={save} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-sm font-medium text-gray-700">New arrival time<input type="time" required value={time} onChange={(e) => setTime(e.target.value)} className="field mt-1" /></label>
          <button type="submit" disabled={Boolean(busy)} className="btn btn-primary px-3 py-2 text-xs">{busy === "time" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save</button>
          <button type="button" onClick={() => { setEditing(false); setError(""); }} className="btn btn-light px-3 py-2 text-xs">Cancel</button>
          {error && <p role="alert" className="w-full text-xs text-red-600">{error}</p>}
        </form>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800"><Clock className="h-3.5 w-3.5" aria-hidden="true" />Change arrival time</button>
      ))}
    </section>
  );
};

export default BookingPass;
