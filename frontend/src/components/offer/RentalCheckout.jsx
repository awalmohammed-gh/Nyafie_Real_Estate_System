import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Banknote, CalendarCheck, CalendarDays, CircleCheck, CreditCard, Loader2, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { rentalApi } from "../../frontApi";
import { formatDate } from "../../utils/date";
import { getPriceParts, formatGhs } from "../../utils/property";
import { usePlatform } from "../../context/usePlatform";
import { arrivalText, bookingHeadline } from "../../utils/hotelPayments";
import { cloudImage } from "../../utils/cloudImage";
import BookingPass from "../receipts/BookingPass";

// "YYYY-MM-DD" in the viewer's local calendar
const toDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shift = (day, { days = 0, months = 0 }) => {
  const d = new Date(`${day}T00:00:00`);
  if (months) {
    const originalDay = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(originalDay, lastDay));
  }
  d.setDate(d.getDate() + days);
  return toDay(d);
};

const STEPS = ["Rental information", "Your details", "Review & pay"];
const UNIT = { month: ["month", "months"], night: ["night", "nights"] };

const Row = ({ label, children, strong }) => (
  <div className="flex items-start justify-between gap-4 py-2.5">
    <dt className="text-sm text-gray-500">{label}</dt>
    <dd className={`text-right text-sm ${strong ? "text-lg font-extrabold text-gray-900" : "font-semibold text-gray-900"}`}>{children}</dd>
  </div>
);

const ErrorNote = ({ children }) => children && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{children}</p>;

// Rent flow: rental information -> customer details -> review (amount from the backend) -> Pay
// Never paid online: monthly and fixed-price rent is a request the owner confirms, then it's paid at the
// office; rentals priced per night are reserved now and paid on arrival. Nothing here decides the amount.
const RentalCheckout = ({ property, ownerName }) => {
  const { siteName } = usePlatform();
  const { user } = useAuth();
  const { value: price, period } = getPriceParts(property);
  const pricePeriod = property.pricing.perNight != null ? "night" : property.pricing.perMonth != null ? "month" : "total";
  const firstDay = shift(toDay(new Date()), { days: 1 });
  // Monthly rentals: the owner's requested advance is the suggested length (the customer can change it)
  const advanceMonths = pricePeriod === "month" ? Number(property.moveIn?.advanceMonths) || 0 : 0;
  const lengths = [...new Set([1, 2, 3, 6, 12, 18, 24, 36, ...(advanceMonths ? [advanceMonths] : [])])].sort((a, b) => a - b);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    start: firstDay,
    end: shift(firstDay, pricePeriod === "night" ? { days: 2 } : { months: 1 }),
    months: advanceMonths || 12,
    occupants: 1,
    notes: "",
    arrivalTime: "", // per-night stays: when the guest will arrive on the check-in day
    fullName: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
    currentAddress: "",
  });
  const [rental, setRental] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  // Monthly rentals pick a length in months instead of a check-out date
  const endDate = pricePeriod === "month" ? shift(form.start, { months: Number(form.months) }) : form.end;

  const next = (e) => {
    e.preventDefault();
    setError("");
    setStep((s) => s + 1);
  };

  // Saves the request; the backend checks the dates and returns the amount to pay
  const review = async (e) => {
    e.preventDefault();
    setError("");
    setBusy("review");
    try {
      setRental(
        await rentalApi.createRental({
          propertyId: property.id,
          startDate: form.start,
          endDate,
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          currentAddress: form.currentAddress.trim(),
          occupants: Number(form.occupants),
          notes: form.notes.trim(),
          ...(pricePeriod === "night" ? { arrivalTime: form.arrivalTime } : {}),
        })
      );
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  // "Reserve now, pay on arrival": the server confirms only once the dates are secured
  const reserve = async () => {
    setError("");
    setBusy("reserve");
    try {
      setRental(await rentalApi.reserveOnArrival(rental.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const unitLabel = rental && UNIT[rental.pricePeriod]?.[rental.units === 1 ? 0 : 1];
  // Per-night rentals: what the owner offers (from the server). Other rentals: online only.
  const options = property.paymentOptions;
  const choosing = Boolean(options) && rental?.pricePeriod === "night";
  const headline = choosing && bookingHeadline(rental);

  return (
    <div>
      {/* Steps */}
      <ol className="mb-6 grid grid-cols-3 gap-2">
        {(pricePeriod === "night" ? STEPS : [...STEPS.slice(0, 2), "Send request"]).map((label, i) => (
          <li key={label}>
            <span className={`block h-1.5 rounded-full ${i <= step ? "bg-brand-500" : "bg-gray-200"}`} />
            <span className={`mt-2 block text-xs font-semibold ${i === step ? "text-brand-700" : "text-gray-400"}`}>
              {i + 1}. {label}
            </span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <form onSubmit={next} className="space-y-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <CalendarDays className="h-5 w-5 text-brand-500" />
            Rental information
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-gray-700">{pricePeriod === "night" ? "Check-in (move-in) date" : "Preferred move-in date"}</span>
              <input
                type="date"
                min={firstDay}
                value={form.start}
                onChange={(e) => setForm((f) => ({ ...f, start: e.target.value, end: f.end <= e.target.value ? shift(e.target.value, { days: 1 }) : f.end }))}
                required
                className="field"
              />
            </label>
            {pricePeriod === "month" ? (
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-gray-700">Rental length</span>
                <select value={form.months} onChange={set("months")} className="field">
                  {lengths.map((m) => (
                    <option key={m} value={m}>{m} {m === 1 ? "month" : "months"}</option>
                  ))}
                </select>
                {advanceMonths > 0 && <span className="mt-1.5 block text-xs text-gray-500">The owner asks for {advanceMonths} {advanceMonths === 1 ? "month" : "months"} of rent in advance.</span>}
              </label>
            ) : (
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-gray-700">{pricePeriod === "night" ? "Check-out" : "End date"}</span>
                <input type="date" min={shift(form.start, { days: 1 })} value={form.end} onChange={set("end")} required className="field" />
              </label>
            )}
          </div>
          {pricePeriod === "month" && (
            <p className="-mt-2 text-xs text-gray-500">
              Ends {formatDate(endDate)}. Rent is {price}{period}.
            </p>
          )}
          {pricePeriod === "night" && (
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-gray-700">When will you arrive on your check-in day?</span>
              <input type="time" value={form.arrivalTime} onChange={set("arrivalTime")} required max={property.paymentOptions?.arrivalDeadline || undefined} className="field sm:w-48" />
              <span className="mt-1.5 block text-xs text-gray-500">The owner expects you then{property.paymentOptions?.arrivalDeadline ? `, and asks guests to arrive by ${property.paymentOptions.arrivalDeadline}` : ""} (Ghana time). You can change it later.</span>
            </label>
          )}
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-700">Number of occupants</span>
            <input type="number" min="1" max="50" value={form.occupants} onChange={set("occupants")} required className="field sm:w-40" />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-700">
              Additional notes <span className="font-normal text-gray-400">(optional)</span>
            </span>
            <textarea rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value.slice(0, 1000) }))} placeholder="Move-in time, pets, questions for the owner..." className="field resize-none" />
          </label>
          <button type="submit" className="btn btn-primary w-full py-3.5">Continue</button>
        </form>
      )}

      {step === 1 && (
        <form onSubmit={review} className="space-y-5">
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <UserRound className="h-5 w-5 text-brand-500" />
            Your details
          </h2>
          <p className="-mt-2 text-sm text-gray-500">Filled in from your account. Update them if this rental is for someone else.</p>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-700">Full name</span>
            <input value={form.fullName} onChange={set("fullName")} required autoComplete="name" className="field" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-gray-700">Verified email</span>
              <input type="email" value={user.email} readOnly required autoComplete="email" className="field" />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-gray-700">Phone number</span>
              <input type="tel" value={form.phone} onChange={set("phone")} required autoComplete="tel" placeholder="024 000 0000" className="field" />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1.5 block font-medium text-gray-700">Current address</span>
            <input value={form.currentAddress} onChange={set("currentAddress")} required minLength={5} autoComplete="street-address" placeholder="House number, street, area, city" className="field" />
          </label>
          <ErrorNote>{error}</ErrorNote>
          <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
            <button type="button" onClick={() => setStep(0)} className="btn btn-light">
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <button type="submit" disabled={busy === "review"} className="btn btn-primary py-3.5">
              {busy === "review" && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy === "review" ? "Creating rental request..." : pricePeriod === "night" ? "Review rental" : "Send rental request"}
            </button>
          </div>
        </form>
      )}

      {step === 2 && rental && (
        <div className="space-y-5">
          <h2 className="text-lg font-bold text-gray-900">Rental Summary</h2>
          <div className="flex items-center gap-3 rounded-2xl bg-gray-50 p-2.5">
            <img src={cloudImage(property.media.images[0], 96)} alt="" className="h-16 w-24 shrink-0 rounded-xl object-cover" />
            <div className="min-w-0">
              <p className="truncate font-semibold text-gray-900">{property.title}</p>
              <p className="truncate text-sm text-gray-500">{[property.location.name, property.location.city].filter(Boolean).join(", ")}</p>
            </div>
          </div>
          <dl className="divide-y divide-gray-100 rounded-2xl px-4 ring-1 ring-gray-200">
            <Row label="Rental price">{price}{period || " (fixed)"}</Row>
            <Row label="Move-in date">{formatDate(rental.startDate)}</Row>
            <Row label="Rental duration">{formatDate(rental.startDate)} – {formatDate(rental.endDate)}</Row>
            {unitLabel && <Row label="Rent for the period">{rental.units} {unitLabel} × {formatGhs(rental.unitPrice)}</Row>}
            <Row label="Additional fees">{rental.fees > 0 ? formatGhs(rental.fees) : "None"}</Row>
            <Row label="Occupants">{rental.occupants}</Row>
            <Row label="Customer">{rental.contactName} · {rental.contactPhone}</Row>
            <Row label="Current address">{rental.currentAddress}</Row>
            <Row label="Owner">{ownerName}</Row>
            <Row label={choosing ? "Total" : "Total to pay at the office"} strong>{formatGhs(rental.amount)}</Row>
          </dl>
          {choosing ? (
            <StayPayment rental={{ ...rental, property: { title: property.title } }} options={options} headline={headline} ownerName={ownerName} busy={busy} error={error} onReserve={reserve} onBack={() => setStep(1)} />
          ) : (
          // Rent is never paid online (the server refuses it too): the owner confirms, then it is paid at the office
          <>
          <p className="flex items-start gap-2 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong className="block">Request sent to {ownerName}.</strong>
              Once they confirm, pay {formatGhs(rental.amount)} at their office and you'll get a receipt here and by email. {siteName} never takes rent online, and nobody should ask you to pay to a personal or mobile money number.
            </span>
          </p>
          <Link to="/account/rentals" className="btn btn-primary w-full py-4 text-base">View my rentals</Link>
          </>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * A rental priced per night: "Reserve now, pay on arrival" (never paid online). After reserving,
 * shows "Reservation confirmed — Payment due on arrival" and the booking code to show on arrival.
 */
const StayPayment = ({ rental, options, headline, ownerName, busy, error, onReserve, onBack }) => {
  if (headline) {
    return (
      <div className="space-y-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
        <p className="flex items-center gap-2 text-base font-semibold"><CircleCheck className="h-5 w-5" aria-hidden="true" />{headline}</p>
        {rental.paymentDue && <>
          <p className="flex items-start gap-2"><CalendarCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Pay {ownerName} {formatGhs(rental.amount)} when you arrive{rental.arrivalTime ? ` at ${rental.arrivalTime}` : ` ${arrivalText(rental)}`}, and show your booking code.</p>
          {rental.cancellationPolicy && <p className="whitespace-pre-line text-emerald-800"><span className="font-semibold">Owner's policy:</span> {rental.cancellationPolicy}</p>}
        </>}
        <BookingPass booking={rental} className="text-gray-900" />
        <Link to="/account/rentals" className="btn btn-primary w-full">View your booking</Link>
      </div>
    );
  }
  if (!["pending", "payment_pending"].includes(rental.statusKey)) return <p className="text-sm text-gray-600">This rental is {rental.status.toLowerCase()}.</p>;
  const noOption = !options.onArrival;
  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-gray-900">Reserve your stay</p>
      <ErrorNote>{error}</ErrorNote>
      {noOption && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">This listing isn't taking reservations right now. Your details are saved: chat with {ownerName} to arrange your stay.</p>}
      {options.onArrival && (
        <div className="rounded-2xl border border-gray-200 p-4">
          <p className="flex items-center gap-2 font-semibold text-gray-900"><Banknote className="h-4 w-4 text-brand-600" aria-hidden="true" />Reserve now, pay on arrival</p>
          <p className="mt-1 text-sm leading-6 text-gray-500">Nothing to pay online. We secure your dates and send you a booking code. Show it to {ownerName} when you arrive{rental.arrivalTime ? ` at ${rental.arrivalTime}` : ""} and pay {formatGhs(rental.amount)} then.</p>
          {options.cancellationPolicy && <p className="mt-2 whitespace-pre-line rounded-lg bg-gray-50 p-3 text-xs leading-5 text-gray-600"><span className="font-semibold text-gray-800">Cancellation and no-show policy:</span> {options.cancellationPolicy}</p>}
          <button type="button" onClick={onReserve} disabled={Boolean(busy)} className="btn btn-primary mt-3 w-full py-3.5">
            {busy === "reserve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarCheck className="h-4 w-4" />}
            {busy === "reserve" ? "Securing your dates..." : "Reserve, pay on arrival"}
          </button>
        </div>
      )}
      <button onClick={onBack} disabled={Boolean(busy)} className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" />
        Edit details
      </button>
    </div>
  );
};

export default RentalCheckout;
