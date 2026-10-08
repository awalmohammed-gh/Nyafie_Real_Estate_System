import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Property from "../models/Property.js";
import Rental from "../models/Rental.js";
import { hotelDates, hotelPrice, peakRooms, occupancyFilter, prepareHotelFields, quoteHotelRoom, validateHotelPublishing } from "../utils/hotel.js";

const room = { name: "Deluxe Room", description: "A spacious room with a private balcony.", pricePerNight: 650, quantity: 10, maxGuests: 2, beds: 1, bedType: "King bed", size: 32, images: ["/hero/furnished-bedroom.jpg"], amenities: ["Air conditioning", "Private bathroom"], active: true };
const hotel = () => new Property({ title: "Accra Hotel", propertyType: "Hotel", listingType: "Rent", price: 650, pricePeriod: "night", currency: "GHS", status: "published", owner: new mongoose.Types.ObjectId(), ownerType: "agent", roomTypes: [room] });
const dates = { checkIn: "2030-01-01", checkOut: "2030-01-04" };
const query = (data) => ({ select: () => query(data), session: () => Promise.resolve(data) });

test("hotel dates reject invalid calendar dates, past dates and invalid stay lengths", () => {
  for (const pair of [["2030-02-31", "2030-03-04"], ["2000-01-01", "2000-01-04"], ["2030-01-01", "2030-01-01"], ["2030-01-04", "2030-01-01"], ["2030-01-01", "2032-01-01"], [null, "2030-01-04"]]) assert.throws(() => hotelDates(...pair), { status: 400 });
  assert.equal(hotelDates(dates.checkIn, dates.checkOut).nights, 3);
  assert.equal(hotelDates("2032-02-28", "2032-03-01").nights, 2);
});
test("hotel pricing uses nights × rooms and integer currency subunits", () => {
  assert.equal(hotelPrice(650, 3, 2), 3900);
  assert.equal(hotelPrice(0.1, 3, 2), 0.6);
});
test("inventory uses the worst occupied night and treats checkout as exclusive", () => {
  const start = new Date("2030-01-01"), end = new Date("2030-01-04");
  assert.equal(peakRooms([{ startDate: "2030-01-01", endDate: "2030-01-02", numberOfRooms: 6 }, { startDate: "2030-01-02", endDate: "2030-01-04", numberOfRooms: 6 }], start, end), 6);
  assert.equal(peakRooms([{ startDate: "2029-12-30", endDate: "2030-01-03", numberOfRooms: 6 }, { startDate: "2030-01-02", endDate: "2030-01-04", numberOfRooms: 3 }], start, end), 9);
  assert.equal(peakRooms([{ startDate: "2029-12-30", endDate: "2030-01-01", numberOfRooms: 10 }], start, end), 0);
});
test("inventory filters include other checkouts by the same customer, completed stays and only live holds", () => {
  const filter = occupancyFilter("hotel", "room", new Date(dates.checkIn), new Date(dates.checkOut), "this-booking");
  assert.deepEqual(filter._id, { $ne: "this-booking" });
  assert.ok(filter.$or[0].status.$in.includes("completed"));
  assert.equal(filter.$or[1].customer, undefined);
  assert.ok(filter.$or[1].paymentStartedAt.$gt > new Date(Date.now() - 31 * 60000));
});
test("hotel quotes ignore client prices, totals, payment status and agent/customer IDs", async (t) => {
  const property = hotel();
  t.mock.method(Rental, "find", () => query([]));
  const quote = await quoteHotelRoom(property, { ...dates, roomTypeId: property.roomTypes[0].id, numberOfRooms: 2, guests: 4, amount: 1, pricePerNight: 1, paymentStatus: "paid", customerId: "imposter" });
  assert.equal(quote.amount, 3900);
  assert.equal(quote.room.pricePerNight, 650);
  assert.equal(quote.availableRooms, 10);
});
test("six occupied Deluxe rooms leave four, and a request for five is rejected", async (t) => {
  const property = hotel();
  t.mock.method(Rental, "find", (filter) => query(filter.roomTypeId?.$exists === false ? [] : [{ startDate: dates.checkIn, endDate: dates.checkOut, numberOfRooms: 6 }]));
  await assert.rejects(quoteHotelRoom(property, { ...dates, roomTypeId: property.roomTypes[0].id, numberOfRooms: 5, guests: 4 }), { status: 409 });
  assert.equal((await quoteHotelRoom(property, { ...dates, roomTypeId: property.roomTypes[0].id, numberOfRooms: 4, guests: 4 })).availableRooms, 4);
});
test("legacy whole-hotel bookings conservatively block new room reservations", async (t) => {
  const property = hotel();
  t.mock.method(Rental, "find", (filter) => query(filter.roomTypeId?.$exists === false ? [{ startDate: dates.checkIn, endDate: dates.checkOut }] : []));
  await assert.rejects(quoteHotelRoom(property, { ...dates, roomTypeId: property.roomTypes[0].id, numberOfRooms: 1, guests: 1 }), { status: 409 });
});
test("hotel quotes require this hotel's active room, integer room/guest counts and sufficient capacity", async (t) => {
  const property = hotel();
  t.mock.method(Rental, "find", () => query([]));
  const body = { ...dates, roomTypeId: property.roomTypes[0].id, numberOfRooms: 1, guests: 2 };
  for (const extra of [{ roomTypeId: new mongoose.Types.ObjectId().toString() }, { numberOfRooms: 0 }, { numberOfRooms: 1.5 }, { guests: 0 }, { guests: 3 }, { guests: 1.5 }, { roomTypeId: undefined }]) await assert.rejects(quoteHotelRoom(property, { ...body, ...extra }), { status: 400 });
  property.roomTypes[0].active = false;
  await assert.rejects(quoteHotelRoom(property, body), { status: 400 });
});
test("custom rooms and amenities are allowlisted; hotel price and listing mode derive from rooms", async () => {
  const fields = { propertyType: "Hotel", listingType: "Sale", price: 1, pricePeriod: "month" };
  await prepareHotelFields(fields, { roomTypes: [{ ...room, name: "Artist's Loft", amenities: ["Record player", "Record player"], owner: "forged", hotelId: "forged" }] });
  assert.equal(fields.listingType, "Rent"); assert.equal(fields.pricePeriod, "night"); assert.equal(fields.price, 650);
  assert.deepEqual(fields.roomTypes[0].amenities, ["Record player"]);
  assert.equal(fields.roomTypes[0].owner, undefined);
  assert.equal(fields.roomTypes[0].hotelId, undefined);
  assert.equal(validateHotelPublishing(fields), null);
});
test("existing room IDs cannot be deleted, moved to another hotel or replaced", async () => {
  const property = hotel();
  await assert.rejects(prepareHotelFields({}, { roomTypes: [] }, property), { status: 409 });
  await assert.rejects(prepareHotelFields({ propertyType: "Apartment" }, {}, property), { status: 400 });
  await assert.rejects(prepareHotelFields({}, { roomTypes: [{ ...room, id: new mongoose.Types.ObjectId().toString() }] }, property), { status: 400 });
  const fields = {};
  await prepareHotelFields(fields, { roomTypes: [{ ...room, id: property.roomTypes[0].id, active: false }] }, property);
  assert.equal(fields.roomTypes[0].active, false);
  assert.equal(String(fields.roomTypes[0]._id), property.roomTypes[0].id);
});
