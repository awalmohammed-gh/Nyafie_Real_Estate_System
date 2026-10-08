export const isHotel = (property) => property?.property?.type?.toLowerCase() === "hotel";
export const roomToForm = (room) => ({ ...room, _key: room.id, images: (room.images || []).map((src, i) => ({ id: `${room.id}-${i}`, src, name: `Room photo ${i + 1}`, status: "done", progress: 100 })) });
export const roomsToPayload = (rooms) => rooms.map(({ _key: _unused, images, ...room }) => ({ ...room, images: images.filter((img) => img.status === "done").map((img) => img.src) }));
export const roomPrice = (price, currency = "GHS") => new Intl.NumberFormat("en-GH", { style: "currency", currency, maximumFractionDigits: 2 }).format(price);
export const today = () => new Date().toISOString().slice(0, 10);
export const tomorrow = (day = today()) => {
  const date = new Date(`${day}T00:00:00Z`);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(+date) && date.toISOString().slice(0, 10) === day;
  return new Date((valid ? +date : +new Date(`${today()}T00:00:00Z`)) + 86400000).toISOString().slice(0, 10);
};
export const bookingPath = (hotelId, roomId, selection = {}) => {
  const params = new URLSearchParams({ room: roomId });
  for (const key of ["checkIn", "checkOut", "guests", "numberOfRooms"]) if (selection[key]) params.set(key, selection[key]);
  return `/checkout/rent/${hotelId}?${params}`;
};
