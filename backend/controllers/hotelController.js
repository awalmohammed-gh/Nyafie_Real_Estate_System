import mongoose from "mongoose";
import Property from "../models/Property.js";
import { canManageRecord, loadPublishedProperty } from "../utils/ownership.js";
import {
  hotelDates,
  isHotel,
  quoteHotelRoom,
  roomAvailability,
} from "../utils/hotel.js";
import { ok, fail } from "../utils/response.js";

// Date-specific availability is informational; checkout rechecks inside a transaction.
export const hotelRooms = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id))
    return fail(res, 404, "Hotel not found.");
  let property = await Property.findById(req.params.id);
  const managing = property && req.user && canManageRecord(property, req.user);
  if (!managing) property = await loadPublishedProperty(req.params.id);
  if (!property || !isHotel(property))
    return fail(res, 404, "Hotel not found.");
  const hasDates =
    req.query.checkIn !== undefined || req.query.checkOut !== undefined;
  const dates = hasDates
    ? hotelDates(req.query.checkIn, req.query.checkOut)
    : null;
  const rooms = [];
  for (const room of property.roomTypes.filter((r) => managing || r.active)) {
    rooms.push({
      ...room.toJSON(),
      availableRooms: dates
        ? await roomAvailability(
            property._id,
            room,
            dates.startDate,
            dates.endDate,
          )
        : null,
    });
  }
  ok(res, {
    hotelId: String(property._id),
    checkIn: req.query.checkIn || null,
    checkOut: req.query.checkOut || null,
    rooms,
  });
};
export const hotelQuote = async (req, res) => {
  const property = await loadPublishedProperty(req.params.id);
  if (!property || !isHotel(property))
    return fail(res, 404, "Hotel not found.");
  const quote = await quoteHotelRoom(property, req.body);
  ok(res, {
    hotelId: String(property._id),
    roomTypeId: String(quote.room._id),
    roomName: quote.room.name,
    checkIn: req.body.checkIn,
    checkOut: req.body.checkOut,
    guests: quote.guests,
    numberOfRooms: quote.numberOfRooms,
    pricePerNight: quote.room.pricePerNight,
    numberOfNights: quote.units,
    totalAmount: quote.amount,
    availableRooms: quote.availableRooms,
  });
};
