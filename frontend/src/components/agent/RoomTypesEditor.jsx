import { useState } from "react";
import { Bed, Plus, Trash2 } from "lucide-react";
import ImageUploader from "./ImageUploader";
import { createId } from "../../utils/crypto";

import { roomNumberList } from "../../utils/hotel";

// What can be inside a hotel room, grouped so it's quick to tick (any other item can be added by hand)
const ROOM_AMENITY_GROUPS = [
  ["Comfort", ["Air conditioning", "Ceiling fan", "Wardrobe", "Desk", "Sofa", "Mosquito net", "Blackout curtains", "Iron and ironing board"]],
  ["Bathroom", ["Private bathroom", "Shower", "Bathtub", "Hot water", "Towels", "Toiletries", "Hair dryer"]],
  ["Entertainment", ["Free Wi-Fi", "Television", "Smart TV", "Satellite TV (DStv)"]],
  ["Food and drink", ["Refrigerator", "Mini bar", "Kettle", "Coffee maker", "Kitchenette", "Room service", "Breakfast included"]],
  ["View and space", ["Balcony", "City view", "Ocean view", "Pool view", "Garden view"]],
  ["Safety", ["Safe", "Smoke detector", "Key card access"]],
];
const AMENITIES = ROOM_AMENITY_GROUPS.flatMap(([, items]) => items);

const RoomEditor = ({ room, update, remove, imageLimit }) => {
  const [custom, setCustom] = useState("");
  const field = (key) => ({ value: room[key], onChange: (e) => update({ [key]: e.target.value }) });
  const toggle = (value) => update({ amenities: room.amenities.includes(value) ? room.amenities.filter((a) => a !== value) : [...room.amenities, value] });
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold text-gray-900"><Bed className="h-4 w-4 text-brand-600" />{room.name || "New room type"}</h3>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={room.active} onChange={(e) => update({ active: e.target.checked })} className="accent-brand-600" />Active</label>
          {!room.id && <button type="button" onClick={remove} aria-label="Remove new room type" className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">Room name / type<input {...field("name")} maxLength={100} list="hotel-room-names" placeholder="Deluxe Room or your own name" className="field mt-1.5" /></label>
        <label className="text-sm font-medium text-gray-700">Price per night (GHS)<input {...field("pricePerNight")} type="number" min="0.01" step="0.01" className="field mt-1.5" /></label>
        <label className="text-sm font-medium text-gray-700 sm:col-span-2">
          Room numbers <span className="font-normal text-gray-400">(optional)</span>
          <input value={room.roomNumbersText || ""} onChange={(e) => { const text = e.target.value; const count = roomNumberList(text).length; update({ roomNumbersText: text, ...(count ? { quantity: String(count) } : {}) }); }} maxLength={6000} placeholder="e.g. 101, 102, 103, 104" className="field mt-1.5" />
          <span className="mt-1 block text-xs font-normal text-gray-500">Separate with commas. The number of rooms then follows this list, and when you approve a booking you pick the guest's room from it. Guests never see room numbers until you assign one.</span>
        </label>
        {[ ["quantity", "Total room inventory", 0, 10000], ["maxGuests", "Maximum guests per room", 1, 50], ["beds", "Number of beds", 1, 30] ].map(([key, label, min, max]) => <label key={key} className="text-sm font-medium text-gray-700">{label}<input {...field(key)} type="number" min={min} max={max} step="1" readOnly={key === "quantity" && roomNumberList(room.roomNumbersText).length > 0} className="field mt-1.5" />{key === "quantity" && roomNumberList(room.roomNumbersText).length > 0 && <span className="mt-1 block text-xs font-normal text-gray-500">From your room numbers</span>}</label>)}
        <label className="text-sm font-medium text-gray-700">Bed type / configuration<input {...field("bedType")} maxLength={120} placeholder="1 king bed + 1 single bed" className="field mt-1.5" /></label>
        <label className="text-sm font-medium text-gray-700">Room size<input {...field("size")} type="number" min="0" step="0.1" className="field mt-1.5" /></label>
        <label className="text-sm font-medium text-gray-700">Size unit<select {...field("sizeUnit")} className="field mt-1.5"><option value="sqm">Square metres</option><option value="sqft">Square feet</option></select></label>
        <label className="text-sm font-medium text-gray-700 sm:col-span-2">Room description<textarea {...field("description")} maxLength={3000} rows={3} className="field mt-1.5" placeholder="Describe this room and what makes it special." /></label>
      </div>
      <div className="mt-5"><h4 className="mb-3 text-sm font-semibold text-gray-900">Room photos</h4><ImageUploader images={room.images} setImages={(value) => update((current) => ({ images: typeof value === "function" ? value(current.images) : value }))} max={imageLimit} /></div>
      <fieldset className="mt-5"><legend className="text-sm font-semibold text-gray-900">What's inside this room</legend>
        {[...ROOM_AMENITY_GROUPS, ["Your own items", room.amenities.filter((a) => !AMENITIES.includes(a))]].filter(([, items]) => items.length).map(([group, items]) => (
          <div key={group} className="mt-3">
            <p className="mb-1.5 text-xs font-semibold text-gray-500">{group}</p>
            <div className="flex flex-wrap gap-2">{items.map((a) => <button type="button" key={a} aria-pressed={room.amenities.includes(a)} onClick={() => toggle(a)} className={`rounded-lg border px-3 py-2 text-xs font-medium ${room.amenities.includes(a) ? "border-brand-200 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-600 hover:border-brand-200"}`}>{a}</button>)}</div>
          </div>
        ))}
        <div className="mt-3 flex gap-2"><input aria-label="Custom room amenity" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={100} placeholder="Add a custom room amenity" className="field min-w-0 flex-1" /><button type="button" className="btn btn-light" disabled={!custom.trim() || room.amenities.length >= 40} onClick={() => { if (!room.amenities.includes(custom.trim())) update({ amenities: [...room.amenities, custom.trim()] }); setCustom(""); }}>Add</button></div>
      </fieldset>
      {room.id && <p className="mt-4 text-xs text-gray-500">Deactivate this room type to stop new bookings. Existing bookings and room IDs are preserved.</p>}
    </article>
  );
};

const RoomTypesEditor = ({ rooms, setRooms, imageLimit }) => {
  const update = (key, patch) => setRooms((prev) => prev.map((room) => room._key === key ? { ...room, ...(typeof patch === "function" ? patch(room) : patch) } : room));
  return <div className="space-y-4">
    <datalist id="hotel-room-names">{["Standard Room", "Deluxe Room", "Executive Room", "Twin Room", "Family Room", "Suite", "Presidential Suite"].map((name) => <option key={name} value={name} />)}</datalist>
    {rooms.map((room) => <RoomEditor key={room._key} room={room} update={(patch) => update(room._key, patch)} remove={() => setRooms((prev) => prev.filter((r) => r._key !== room._key))} imageLimit={imageLimit} />)}
    {!rooms.length && <p className="rounded-xl border border-dashed border-gray-200 p-5 text-sm text-gray-500">Add your first room type so customers can choose the stay that suits them.</p>}
    <button type="button" disabled={rooms.length >= 40} className="btn btn-light" onClick={() => setRooms((prev) => [...prev, { _key: createId("room"), name: "", description: "", pricePerNight: "", quantity: 1, maxGuests: 2, beds: 1, bedType: "Double bed", size: "", sizeUnit: "sqm", amenities: [], images: [], active: true }])}><Plus className="h-4 w-4" />Add room type</button>
  </div>;
};
export default RoomTypesEditor;
