import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Banknote, CalendarCheck, CircleCheck, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { usePlatform } from "../../context/usePlatform";
import { paymentApi, rentalApi } from "../../frontApi";
import HotelRoomDetails from "../property/HotelRoomDetails";
import { roomPrice, today, tomorrow } from "../../utils/hotel";
import { formatDate } from "../../utils/date";
import { arrivalText, bookingHeadline } from "../../utils/hotelPayments";

const HotelCheckout = ({ property, ownerName }) => {
  const { user } = useAuth();
  const { settings } = usePlatform();
  const [params] = useSearchParams();
  const rooms = (property.roomTypes || []).filter((room) => room.active);
  const [form, setForm] = useState(() => ({
    roomTypeId: rooms.find((room) => room.id === params.get("room"))?.id || "",
    checkIn: params.get("checkIn") || today(), checkOut: params.get("checkOut") || tomorrow(),
    guests: params.get("guests") || 1, numberOfRooms: params.get("numberOfRooms") || 1,
    fullName: user.name || "", email: user.email || "", phone: user.phone || "", notes: "",
  }));
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(Boolean(params.get("booking")));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [details, setDetails] = useState(false);
  const bookingId = params.get("booking");
  useEffect(() => {
    if (!bookingId) return;
    let active = true;
    rentalApi.getRentalById(bookingId).then((booking) => {
      if (active) {
        if (booking.hotelId !== property.id) setError("This booking belongs to another hotel.");
        else setSaved(booking);
      }
    }).catch((err) => active && setError(err.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [bookingId, property.id]);
  const room = (property.roomTypes || []).find((r) => r.id === (saved?.roomTypeId || form.roomTypeId));
  const set = (key) => (e) => { setForm((prev) => ({ ...prev, [key]: e.target.value })); setError(""); };
  const review = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try { setSaved(await rentalApi.createRental({ propertyId: property.id, ...form, guests: Number(form.guests), numberOfRooms: Number(form.numberOfRooms) })); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  // "Reserve now, pay at the hotel": the server secures the rooms first, then confirms
  const reserve = async () => {
    setBusy(true); setError("");
    try { setSaved(await rentalApi.reserveOnArrival(saved.id)); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const pay = async () => {
    setBusy(true); setError("");
    try { const payment = await paymentApi.initializeRentalPayment(saved.id); window.location.assign(payment.authorizationUrl); }
    catch (err) { setError(err.message); setBusy(false); }
  };
  // What this hotel accepts right now (from the server). Older responses: online only, as before.
  const options = property.paymentOptions || { online: settings.payments.rentalsAvailable && property.pricing.currency === "GHS", onArrival: false, onlineProblem: "Online payments are currently unavailable.", arrivalDeadline: "18:00", cancellationPolicy: "" };
  const noOption = !options.online && !options.onArrival;
  const nights = Math.round((new Date(form.checkOut) - new Date(form.checkIn)) / 86400000);
  const estimate = room && nights > 0 ? room.pricePerNight * nights * Number(form.numberOfRooms) : null;
  if (loading) return <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />Loading your hotel booking…</p>;
  if (!rooms.length && !saved) return <p className="text-sm text-gray-600">No active room types are available. <Link to={`/house/${property.id}`} className="text-brand-600 underline">Return to the hotel</Link> to contact the owner.</p>;
  return <div className="space-y-5">
    <h2 className="text-xl font-semibold text-gray-900">{saved ? (bookingHeadline(saved) ? "Your hotel booking" : "Review your hotel booking") : "Choose your room and stay"}</h2>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!saved ? <form onSubmit={review} className="space-y-5">
      <label className="block text-sm font-medium text-gray-700">Room type<select required value={form.roomTypeId} onChange={set("roomTypeId")} className="field mt-1.5"><option value="">Choose a room type</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name} · {roomPrice(r.pricePerNight)} / night</option>)}</select></label>
      {room && <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">{room.images[0] && <img src={room.images[0]} alt={room.name} className="h-20 w-24 rounded-lg object-cover" />}<div className="min-w-0"><p className="font-semibold text-gray-900">{room.name}</p><p className="text-xs text-gray-500">Up to {room.maxGuests} guests / room · {room.bedType}</p><button type="button" onClick={() => setDetails(true)} className="mt-1 text-sm font-medium text-brand-600">See everything in this room</button></div></div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">Check-in<input required type="date" min={today()} value={form.checkIn} onChange={set("checkIn")} className="field mt-1.5" /></label>
        <label className="text-sm font-medium text-gray-700">Check-out<input required type="date" min={tomorrow(form.checkIn || today())} value={form.checkOut} onChange={set("checkOut")} className="field mt-1.5" /></label>
        <label className="text-sm font-medium text-gray-700">Guests (total)<input required type="number" min="1" max="50" step="1" value={form.guests} onChange={set("guests")} className="field mt-1.5" /></label>
        <label className="text-sm font-medium text-gray-700">Number of rooms<input required type="number" min="1" max={room?.quantity || 10000} step="1" value={form.numberOfRooms} onChange={set("numberOfRooms")} className="field mt-1.5" /></label>
      </div>
      {estimate != null && <p className="rounded-xl bg-brand-50 p-4 text-sm text-brand-800">Estimated stay: {roomPrice(room.pricePerNight)} × {nights} night(s) × {form.numberOfRooms} room(s) = <strong>{roomPrice(estimate)}</strong></p>}
      <fieldset className="grid gap-4 border-t border-gray-100 pt-5 sm:grid-cols-2"><legend className="pt-4 font-semibold text-gray-900">Guest contact details</legend>
        <label className="text-sm font-medium text-gray-700 sm:col-span-2">Full name<input required minLength={2} maxLength={120} autoComplete="name" value={form.fullName} onChange={set("fullName")} className="field mt-1.5" /></label>
        <label className="text-sm font-medium text-gray-700">Verified email<input required type="email" autoComplete="email" value={user.email} readOnly className="field mt-1.5" /></label>
        <label className="text-sm font-medium text-gray-700">Phone<input required type="tel" autoComplete="tel" maxLength={30} value={form.phone} onChange={set("phone")} className="field mt-1.5" /></label>
        <label className="text-sm font-medium text-gray-700 sm:col-span-2">Special requests (optional)<textarea value={form.notes} onChange={set("notes")} maxLength={1000} rows={2} className="field mt-1.5" /></label>
      </fieldset>
      <p className="text-xs leading-5 text-gray-500">We check availability for your full stay before showing the final total. Special requests are subject to the hotel's confirmation.</p>
      <button type="submit" disabled={busy} className="btn btn-primary w-full">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Check availability & review booking</button>
    </form> : <div className="space-y-5">
      <dl className="divide-y divide-gray-100 rounded-xl border border-gray-200 px-4">{[
        ["Hotel", property.title], ["Room", saved.roomName], ["Check-in", formatDate(saved.startDate)], ["Check-out", formatDate(saved.endDate)], ["Guests", saved.occupants], ["Rooms", saved.numberOfRooms], ["Stay", `${saved.units} night(s)`], ["Price per room / night", roomPrice(saved.unitPrice)], ["Calculation", `${roomPrice(saved.unitPrice)} × ${saved.units} × ${saved.numberOfRooms}`], ["Guest", `${saved.contactName} · ${saved.contactPhone}`], ["Total", roomPrice(saved.amount)],
      ].map(([label, value]) => <div key={label} className="flex justify-between gap-4 py-3 text-sm"><dt className="text-gray-500">{label}</dt><dd className={`text-right font-semibold ${label === "Total" ? "text-lg text-brand-700" : "text-gray-900"}`}>{value}</dd></div>)}</dl>
      {(() => {
        const headline = bookingHeadline(saved);
        if (headline) return <div className="space-y-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
          <p className="flex items-center gap-2 text-base font-semibold"><CircleCheck className="h-5 w-5" aria-hidden="true" />{headline}</p>
          {saved.paymentOption === "on_arrival" && saved.paymentStatus !== "Paid" && <>
            <p className="flex items-start gap-2"><CalendarCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Pay {roomPrice(saved.amount)} when you arrive. Please check in {arrivalText(saved)}.</p>
            {saved.cancellationPolicy && <p className="whitespace-pre-line text-emerald-800"><span className="font-semibold">Hotel policy:</span> {saved.cancellationPolicy}</p>}
          </>}
          <Link to="/account/rentals" className="btn btn-primary w-full">View your booking</Link>
        </div>;
        if (!["pending", "payment_pending"].includes(saved.statusKey)) return <p className="text-sm text-gray-600">This booking is {saved.status.toLowerCase()}.</p>;
        return <div className="space-y-4">
          <p className="text-sm font-semibold text-gray-900">How would you like to pay?</p>
          {noOption && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{options.onlineProblem || "Online booking is unavailable."} Contact the hotel to arrange your stay.</p>}
          {options.online && <div className="rounded-xl border border-gray-200 p-4">
            <p className="flex items-center gap-2 font-semibold text-gray-900"><CreditCard className="h-4 w-4 text-brand-600" aria-hidden="true" />Pay online now</p>
            <p className="mt-1 flex items-start gap-2 text-sm leading-6 text-gray-500"><ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />Card or mobile money through Paystack. Your rooms are held for 30 minutes while you pay, and the payment goes to the hotel.</p>
            <button type="button" onClick={pay} disabled={busy} className="btn btn-primary mt-3 w-full">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}Pay securely · {roomPrice(saved.amount)}</button>
          </div>}
          {options.onArrival && <div className="rounded-xl border border-gray-200 p-4">
            <p className="flex items-center gap-2 font-semibold text-gray-900"><Banknote className="h-4 w-4 text-brand-600" aria-hidden="true" />Reserve now, pay at the hotel</p>
            <p className="mt-1 text-sm leading-6 text-gray-500">Nothing to pay today. We secure your rooms, then you pay {ownerName} {roomPrice(saved.amount)} on arrival. Please arrive by {options.arrivalDeadline} on your check-in day.</p>
            {options.cancellationPolicy && <p className="mt-2 whitespace-pre-line rounded-lg bg-gray-50 p-3 text-xs leading-5 text-gray-600"><span className="font-semibold text-gray-800">Cancellation and no-show policy:</span> {options.cancellationPolicy}</p>}
            <button type="button" onClick={reserve} disabled={busy} className={`btn mt-3 w-full ${options.online ? "btn-light" : "btn-primary"}`}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Reserve, pay at the hotel</button>
          </div>}
          {!options.online && options.onArrival && options.onlineProblem && <p className="text-xs text-gray-500">{options.onlineProblem}</p>}
        </div>;
      })()}
      {!bookingId && !saved.reference && saved.statusKey === "pending" && <button type="button" disabled={busy} onClick={() => { setSaved(null); setError(""); }} className="flex items-center gap-1 text-sm font-medium text-gray-500"><ArrowLeft className="h-4 w-4" />Edit stay details</button>}
    </div>}
    <HotelRoomDetails room={details ? room : null} currency={property.pricing.currency} onClose={() => setDetails(false)} />
  </div>;
};
export default HotelCheckout;
