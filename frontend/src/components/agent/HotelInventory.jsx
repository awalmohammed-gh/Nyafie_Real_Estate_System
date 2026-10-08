import { useState } from "react";
import { Link } from "react-router-dom";
import { hotelApi } from "../../frontApi";
import { useApiQuery } from "../../hooks/useApiQuery";
import { today, tomorrow, roomPrice } from "../../utils/hotel";
import { formatDate } from "../../utils/date";

const HotelInventory = ({ property, bookings }) => {
  const [dates, setDates] = useState({ checkIn: today(), checkOut: tomorrow() });
  const { data, error, loading, reload } = useApiQuery(JSON.stringify([property.id, dates]), () => hotelApi.getRooms(property.id, dates));
  const upcoming = bookings.filter((r) => ["paid", "confirmed"].includes(r.statusKey) && r.startDate.slice(0, 10) >= today()).sort((a, b) => a.startDate.localeCompare(b.startDate));
  return <section className="rounded-xl border border-gray-200 bg-white p-5">
    <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-semibold text-gray-900">Room inventory</h2><p className="mt-1 text-sm text-gray-500">Available rooms for the full selected period, including checkout holds.</p></div><Link to={`/agent/properties/${property.id}/edit`} className="btn btn-light text-xs">Manage room types</Link></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm text-gray-700">Check-in<input type="date" min={today()} value={dates.checkIn} onChange={(e) => setDates((prev) => ({ ...prev, checkIn: e.target.value }))} className="field mt-1" /></label><label className="text-sm text-gray-700">Check-out<input type="date" min={tomorrow(dates.checkIn || today())} value={dates.checkOut} onChange={(e) => setDates((prev) => ({ ...prev, checkOut: e.target.value }))} className="field mt-1" /></label></div>
    {error && <p role="alert" className="mt-3 text-sm text-red-600">{error} <button onClick={reload} className="underline">Retry</button></p>}
    {loading ? <p className="mt-4 text-sm text-gray-500">Checking inventory…</p> : data && <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-gray-100 text-xs text-gray-500"><tr><th className="py-3 pr-3">Room type</th><th className="px-3">Per night</th><th className="px-3">Inventory</th><th className="px-3">Available</th><th className="px-3">State</th></tr></thead><tbody>{data.rooms.map((room) => <tr key={room.id} className="border-b border-gray-100 last:border-0"><td className="py-3 pr-3"><Link to={`/agent/rentals?property=${property.id}&room=${room.id}`} className="font-medium text-brand-700 hover:underline">{room.name}</Link></td><td className="whitespace-nowrap px-3">{roomPrice(room.pricePerNight)}</td><td className="px-3">{room.quantity}</td><td className="px-3 font-semibold">{room.availableRooms}</td><td className="px-3 text-xs text-gray-500">{room.active ? "Active" : "Inactive"}</td></tr>)}</tbody></table></div>}
    <div className="mt-5 border-t border-gray-100 pt-4"><h3 className="text-sm font-semibold text-gray-900">Upcoming check-ins</h3>{upcoming.length ? <ul className="mt-3 space-y-3">{upcoming.slice(0, 8).map((booking) => <li key={booking.id} className="flex flex-wrap justify-between gap-2 text-sm"><span><span className="font-medium text-gray-900">{booking.contactName}</span><span className="block text-xs text-gray-500">{booking.roomName} · {booking.numberOfRooms} room(s)</span></span><span className="text-gray-600">{formatDate(booking.startDate)}</span></li>)}</ul> : <p className="mt-2 text-sm text-gray-500">No upcoming paid or confirmed check-ins.</p>}</div>
  </section>;
};
export default HotelInventory;
