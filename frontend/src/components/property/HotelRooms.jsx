import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bed, Check, Loader2, Maximize2, Users } from "lucide-react";
import { hotelApi } from "../../frontApi";
import { bookingPath, roomPrice, today, tomorrow } from "../../utils/hotel";
import HotelRoomDetails from "./HotelRoomDetails";
import { cloudImage } from "../../utils/cloudImage";

const HotelRooms = ({ property, canBook = true }) => {
  const navigate = useNavigate();
  const request = useRef(0);
  const [selection, setSelection] = useState({ checkIn: today(), checkOut: tomorrow(), guests: 1, numberOfRooms: 1 });
  const [availability, setAvailability] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);
  const key = `${selection.checkIn}:${selection.checkOut}`;
  const checked = availability?.key === key;
  const rooms = (property.roomTypes || []).filter((room) => room.active);
  const available = (room) => checked ? availability.rooms.find((r) => r.id === room.id)?.availableRooms : null;
  const set = (field) => (event) => { request.current += 1; setBusy(false); setError(""); setSelection((prev) => ({ ...prev, [field]: event.target.value })); };
  const check = async (event) => {
    event.preventDefault();
    const id = ++request.current;
    setBusy(true); setError("");
    try { const data = await hotelApi.getRooms(property.id, { checkIn: selection.checkIn, checkOut: selection.checkOut }); if (id === request.current) setAvailability({ key, rooms: data.rooms }); }
    catch (err) { if (id === request.current) { setAvailability(null); setError(err.message); } }
    finally { if (id === request.current) setBusy(false); }
  };
  const select = (room) => navigate(bookingPath(property.id, room.id, selection));
  const blocked = (room) => !canBook || room.quantity === 0 || (checked && available(room) < Number(selection.numberOfRooms)) || Number(selection.guests) > room.maxGuests * Number(selection.numberOfRooms);
  return <section id="choose-room" className="scroll-mt-28 border-t border-gray-200 py-8" aria-labelledby="choose-room-heading">
    <p className="text-xs font-semibold tracking-wide text-brand-600 uppercase">Find your stay</p><h2 id="choose-room-heading" className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">Choose Your Room</h2><p className="mt-2 text-sm text-gray-500">Compare rooms, see what's included, and choose the space that suits you.</p>
    {!!rooms.length && <form onSubmit={check} className="mt-5 grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2">
      <label className="text-xs font-medium text-gray-700">Check-in<input type="date" min={today()} required value={selection.checkIn} onChange={set("checkIn")} className="field mt-1.5" /></label>
      <label className="text-xs font-medium text-gray-700">Check-out<input type="date" min={tomorrow(selection.checkIn || today())} required value={selection.checkOut} onChange={set("checkOut")} className="field mt-1.5" /></label>
      <label className="text-xs font-medium text-gray-700">Guests (total)<input type="number" min="1" max="50" step="1" required value={selection.guests} onChange={set("guests")} className="field mt-1.5" /></label>
      <label className="text-xs font-medium text-gray-700">Number of rooms<input type="number" min="1" max="10000" step="1" required value={selection.numberOfRooms} onChange={set("numberOfRooms")} className="field mt-1.5" /></label>
      <button type="submit" disabled={busy} className="btn btn-primary sm:col-span-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />}Check availability</button>
      <p aria-live="polite" className="text-xs text-gray-500 sm:col-span-2">{checked ? "Availability checked for your dates. Rooms are reserved when you begin payment." : "Choose your dates to see available rooms for the full stay."}</p>
    </form>}
    {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="mt-6 space-y-5">{rooms.map((room) => <article key={room.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm sm:grid sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      {room.images[0] ? <img src={cloudImage(room.images[0], 480)} alt={room.name} loading="lazy" className="h-56 w-full object-cover sm:h-full sm:min-h-64" /> : <div className="grid h-56 place-items-center bg-gray-100 text-gray-400"><Bed className="h-8 w-8" /></div>}
      <div className="min-w-0 p-5"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-lg font-semibold text-gray-900">{room.name}</h3><p className="font-semibold text-brand-700">{roomPrice(room.pricePerNight, property.pricing.currency)}<span className="block text-right text-xs font-normal text-gray-500">per room / night</span></p></div>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-500">{room.description}</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-600"><span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />Up to {room.maxGuests} guests</span><span className="flex items-center gap-1"><Bed className="h-3.5 w-3.5" />{room.beds} bed(s) · {room.bedType}</span>{room.size > 0 && <span className="flex items-center gap-1"><Maximize2 className="h-3.5 w-3.5" />{room.size} {room.sizeUnit}</span>}</div>
        <ul aria-label="Room amenities" className="mt-4 flex flex-wrap gap-x-4 gap-y-2">{room.amenities.slice(0, 4).map((a) => <li key={a} className="flex items-center gap-1 text-xs text-gray-600"><Check className="h-3.5 w-3.5 text-brand-600" />{a}</li>)}</ul>
        <p className="mt-4 text-xs font-medium text-gray-600">{checked ? `${available(room)} rooms available for these dates` : `${room.quantity} rooms · select dates for availability`}</p>
        <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => setOpen(room)} className="btn btn-light px-3 text-xs">View Room Details</button>{canBook && <Link to={bookingPath(property.id, room.id, selection)} onClick={(e) => { if (blocked(room)) e.preventDefault(); }} aria-disabled={blocked(room)} tabIndex={blocked(room) ? -1 : undefined} className={`btn px-3 text-xs ${blocked(room) ? "cursor-not-allowed bg-gray-100 text-gray-400" : "btn-primary"}`}>{checked && available(room) < Number(selection.numberOfRooms) ? "Not enough rooms" : "Select Room"}</Link>}</div>
        {Number(selection.guests) > room.maxGuests * Number(selection.numberOfRooms) && <p className="mt-2 text-xs text-gray-500">Select more rooms to accommodate your guests.</p>}
      </div>
    </article>)}</div>
    {!rooms.length && <p className="mt-5 rounded-xl bg-gray-50 p-5 text-sm text-gray-600">This hotel hasn't made room types available yet. Contact the hotel for more information.</p>}
    <HotelRoomDetails room={open} currency={property.pricing.currency} availability={open ? available(open) : null} onClose={() => setOpen(null)} onSelect={open && !blocked(open) ? select : undefined} />
  </section>;
};
export default HotelRooms;
