import mongoose from "mongoose";
import Property from "../models/Property.js";
import Rental from "../models/Rental.js";
import { HttpError } from "./response.js";
import { resolveImages } from "./uploadImages.js";
import { listingImages } from "./listingMedia.js";
import { withinImageLimit } from "./permissions.js";
import { parseStayBooking, takesStayBookings } from "./hotelPayout.js";

export const DAY = 86400000;
export const HOTEL_HOLD = 30 * 60 * 1000;
export const isHotel = (property) => String(property?.propertyType || "").toLowerCase() === "hotel";
export const parseHotelDay = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(+date) || date.toISOString().slice(0, 10) !== value ? null : date;
};
export const hotelDates = (checkIn, checkOut, now = new Date()) => {
  const startDate = parseHotelDay(checkIn), endDate = parseHotelDay(checkOut);
  const today = new Date(now.toISOString().slice(0, 10));
  if (!startDate || !endDate) throw new HttpError(400, "Choose valid check-in and check-out dates.");
  const nights = (endDate - startDate) / DAY;
  if (startDate < today) throw new HttpError(400, "Check-in cannot be in the past.");
  if (nights < 1 || nights > 366) throw new HttpError(400, "Choose a stay between 1 and 366 nights.");
  return { startDate, endDate, nights };
};
const whole = (value, min, max, label) => {
  const n = typeof value === "number" || typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${label} must be a whole number between ${min} and ${max}.`);
  return n;
};
export const hotelPrice = (price, nights, rooms) => {
  const cents = Math.round(price * 100);
  const total = cents * nights * rooms;
  if (!Number.isSafeInteger(total) || total <= 0) throw new HttpError(400, "This room price cannot be booked online.");
  return total / 100;
};

// Peak concurrent occupancy, not the sum of unrelated reservations across a stay.
// Checkout is exclusive: one guest can arrive on another guest's departure day.
export const peakRooms = (bookings, startDate, endDate) => {
  const events = new Map();
  for (const booking of bookings) {
    const start = Math.max(+new Date(booking.startDate), +startDate);
    const end = Math.min(+new Date(booking.endDate), +endDate);
    if (start >= end) continue;
    const count = booking.numberOfRooms || 1;
    events.set(start, (events.get(start) || 0) + count);
    events.set(end, (events.get(end) || 0) - count);
  }
  let used = 0, peak = 0;
  for (const [, change] of [...events].sort(([a], [b]) => a - b)) { used += change; peak = Math.max(peak, used); }
  return peak;
};
export const occupancyFilter = (hotelId, roomTypeId, startDate, endDate, excludeId) => ({
  hotelId, roomTypeId,
  ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  startDate: { $lt: endDate }, endDate: { $gt: startDate },
  $or: [
    { status: { $in: ["paid", "confirmed", "active", "completed"] } },
    { status: "payment_pending", paymentStartedAt: { $gt: new Date(Date.now() - HOTEL_HOLD) } },
  ],
});
export const roomAvailability = async (hotelId, room, startDate, endDate, { session, excludeId } = {}) => {
  const bookings = await Rental.find(occupancyFilter(hotelId, room._id, startDate, endDate, excludeId)).select("startDate endDate numberOfRooms").session(session || null);
  // Older Hotel listings were booked as a whole property. Their paid stays
  // conservatively block every category until checkout; no room IDs are invented.
  const legacyFilter = occupancyFilter(hotelId, room._id, startDate, endDate, excludeId);
  delete legacyFilter.hotelId; delete legacyFilter.roomTypeId;
  const legacy = await Rental.find({ ...legacyFilter, property: hotelId, roomTypeId: { $exists: false } }).select("startDate endDate").session(session || null);
  if (legacy.length) return 0;
  return Math.max(0, room.quantity - peakRooms(bookings, startDate, endDate));
};
export const quoteHotelRoom = async (property, body, { session, excludeId } = {}) => {
  if (!isHotel(property) || property.listingType !== "Rent" || property.status !== "published" || property.availability !== "Available") throw new HttpError(400, "This hotel is not available for booking.");
  if (property.currency !== "GHS") throw new HttpError(400, "Online hotel payments support GHS only.");
  if (!mongoose.isValidObjectId(body.roomTypeId)) throw new HttpError(400, "Select a room type belonging to this hotel.");
  const room = property.roomTypes.id(body.roomTypeId);
  if (!room || !room.active) throw new HttpError(400, "Select an active room type belonging to this hotel.");
  const { startDate, endDate, nights } = hotelDates(body.checkIn ?? body.startDate, body.checkOut ?? body.endDate);
  const numberOfRooms = whole(body.numberOfRooms, 1, 10000, "Number of rooms");
  const guests = whole(body.guests ?? body.occupants, 1, 50, "Number of guests");
  if (guests > room.maxGuests * numberOfRooms) throw new HttpError(400, `This room accommodates ${room.maxGuests} guests per room. Select more rooms or fewer guests.`);
  const availableRooms = await roomAvailability(property._id, room, startDate, endDate, { session, excludeId });
  if (numberOfRooms > availableRooms) throw new HttpError(409, `Only ${availableRooms} ${room.name} rooms are available for the full stay.`);
  return { property, room, startDate, endDate, units: nights, fees: 0, numberOfRooms, guests, availableRooms, amount: hotelPrice(room.pricePerNight, nights, numberOfRooms) };
};

// Every inventory mutation touches the same hotel document. Concurrent transactions
// get a write conflict and retry with a fresh inventory snapshot (including across servers).
export const hotelTransaction = (hotelId, work) => mongoose.connection.transaction(async (session) => {
  const property = await Property.findOneAndUpdate({ _id: hotelId }, { $inc: { __v: 1 } }, { session, returnDocument: "after" });
  if (!property) throw new HttpError(404, "Hotel not found.");
  return work(property, session);
});

export const prepareHotelFields = async (fields, body, existing = null, imageLimit = 8, uploaderIds = []) => {
  const hotel = isHotel({ propertyType: fields.propertyType ?? existing?.propertyType });
  // Hotels and per-night rentals: how guests may pay (anything else ignores these options)
  const stay = { ownerType: existing?.ownerType, propertyType: fields.propertyType ?? existing?.propertyType, listingType: hotel ? "Rent" : fields.listingType ?? existing?.listingType, pricePeriod: hotel ? "night" : fields.pricePeriod ?? existing?.pricePeriod, stayBooking: existing?.stayBooking };
  if (body.stayBooking !== undefined && takesStayBookings(stay)) fields.stayBooking = parseStayBooking(body.stayBooking, stay);
  if (existing?.roomTypes?.length && !hotel) throw new HttpError(400, "A hotel with room types must remain a hotel. Archive its room types instead.");
  if (!hotel) {
    if (body.roomTypes?.length) throw new HttpError(400, "Room types can only belong to a hotel.");
    return;
  }
  fields.listingType = "Rent";
  fields.pricePeriod = "night";
  if (body.roomTypes !== undefined) {
    if (!Array.isArray(body.roomTypes) || body.roomTypes.length > 40) throw new HttpError(400, "Add up to 40 room types per hotel.");
    const ids = new Set();
    fields.roomTypes = [];
    for (const input of body.roomTypes) {
      if (!input || typeof input !== "object") throw new HttpError(400, "Invalid room type.");
      const id = input.id || input._id;
      if (id && (!mongoose.isValidObjectId(id) || !existing?.roomTypes.id(id) || ids.has(String(id)))) throw new HttpError(400, "Room type does not belong to this hotel or was supplied twice.");
      if (id) ids.add(String(id));
      const name = String(input.name || "").trim(), description = String(input.description || "").trim(), bedType = String(input.bedType || "").trim();
      const price = Number(input.pricePerNight), size = Number(input.size || 0);
      if (!name || name.length > 100 || description.length > 3000 || !bedType || bedType.length > 120) throw new HttpError(400, "Enter a room name, bed type and description within their limits.");
      if (!Number.isFinite(price) || price <= 0 || price > 10000000 || !Number.isFinite(size) || size < 0 || size > 100000) throw new HttpError(400, "Enter a valid room price and size.");
      if (input.active !== undefined && typeof input.active !== "boolean") throw new HttpError(400, "Room active state must be true or false.");
      if (!Array.isArray(input.images) || !withinImageLimit(input.images, imageLimit, (id && existing?.roomTypes.id(id)?.images) || [])) throw new HttpError(400, `Your plan supports up to ${imageLimit} photos per room type. Upgrade your plan to add more photos.`);
      if (!Array.isArray(input.amenities) || input.amenities.length > 40 || input.amenities.some((a) => typeof a !== "string" || !a.trim() || a.length > 100)) throw new HttpError(400, "Add up to 40 room amenities, each under 100 characters.");
      fields.roomTypes.push({
        ...(id ? { _id: id } : {}), name, description, bedType,
        pricePerNight: Math.round(price * 100) / 100,
        quantity: whole(input.quantity, 0, 10000, "Room quantity"),
        maxGuests: whole(input.maxGuests, 1, 50, "Maximum guests"), beds: whole(input.beds, 1, 30, "Beds"),
        size, sizeUnit: input.sizeUnit === "sqft" ? "sqft" : "sqm",
        active: input.active !== false, images: await resolveImages(input.images, { current: listingImages(existing), uploaderIds }), amenities: [...new Set(input.amenities.map((a) => a.trim()))],
      });
    }
    // Persisted room types are archived, never removed or recreated with another ID.
    if (existing?.roomTypes.some((room) => !ids.has(String(room._id)))) throw new HttpError(409, "Keep existing room types and deactivate them instead of deleting them.");
  }
  const rooms = fields.roomTypes ?? existing?.roomTypes ?? [];
  const active = rooms.filter((room) => room.active);
  fields.price = active.length ? Math.min(...active.map((room) => room.pricePerNight)) : 0;
};
export const validateHotelPublishing = (property) => {
  if (!property.roomTypes?.some((room) => room.active)) return "Add at least one active room type before publishing this hotel.";
  for (const room of property.roomTypes.filter((room) => room.active)) {
    if (!room.description || !room.images?.length) return `Add a description and photo for ${room.name}.`;
  }
  return null;
};
export const protectHotelInventory = async (property, session) => {
  const start = new Date(new Date().toISOString().slice(0, 10));
  const end = new Date("9999-12-31T00:00:00Z");
  for (const room of property.roomTypes) {
    const bookings = await Rental.find(occupancyFilter(property._id, room._id, start, end)).select("startDate endDate numberOfRooms").session(session);
    if (room.quantity < peakRooms(bookings, start, end)) throw new HttpError(409, `The quantity for ${room.name} cannot be lower than its reserved inventory.`);
  }
};
// CAS also protects edits read before a checkout changed the hotel's version.
export const saveHotelProperty = async (property) => {
  if (!isHotel(property)) return property.save();
  const version = property.__v;
  const data = property.toObject({ virtuals: false });
  return hotelTransaction(property._id, async (current, session) => {
    if (current.__v !== version + 1) throw new HttpError(409, "This hotel's inventory changed. Reload it before saving your edits.");
    current.set(data);
    current.__v = version + 1;
    await protectHotelInventory(current, session);
    return current.save({ session });
  });
};
