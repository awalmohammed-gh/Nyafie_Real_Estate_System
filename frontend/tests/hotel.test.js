import { test } from "node:test";
import assert from "node:assert/strict";
import { mapProperty, toApiProperty, mapRental } from "../src/frontApi/mappers.js";
import { bookingPath, roomToForm, roomsToPayload, tomorrow, today } from "../src/utils/hotel.js";
import { getPriceParts } from "../src/utils/property.js";
import { prepareImagePayload } from "../src/utils/imagePayload.js";

const room = { id: "room-1", name: "Deluxe", pricePerNight: 650, quantity: 10, maxGuests: 2, beds: 1, bedType: "King bed", size: 32, sizeUnit: "sqm", images: ["/room.jpg"], amenities: ["Private bathroom"], active: true };
test("invalid dates in checkout URLs do not crash date input rendering", () => {
  assert.equal(tomorrow("2030-01-01"), "2030-01-02");
  assert.equal(tomorrow("invalid"), tomorrow(today()));
  assert.equal(tomorrow("2030-02-31"), tomorrow(today()));
});
test("hotel mapping keeps room identities and separates hotel and room amenities on save", () => {
  const property = mapProperty({ id: "hotel-1", propertyType: "Hotel", listingType: "Rent", price: 650, pricePeriod: "night", currency: "GHS", amenities: ["Swimming pool"], roomTypes: [room], ownerType: "agent", owner: "agent-1" });
  const saved = toApiProperty(property);
  assert.deepEqual(saved.amenities, ["Swimming pool"]);
  assert.deepEqual(saved.roomTypes[0].amenities, ["Private bathroom"]);
  assert.equal(saved.roomTypes[0].id, room.id);
  assert.match(getPriceParts(property).value, /From/);
  assert.equal(getPriceParts(property).period, "/room /night");
});
test("editing room photos preserves IDs, filters unfinished images and uploads nested assets", async () => {
  const form = roomToForm(room);
  form.images.push({ id: "new-image", src: "data:image/png;base64,new", status: "done" }, { id: "unfinished", src: "", status: "uploading" });
  const payload = roomsToPayload([form]);
  assert.equal(payload[0].id, room.id);
  assert.equal(payload[0]._key, undefined);
  assert.equal(payload[0].images.length, 2);
  const uploaded = await prepareImagePayload({ roomTypes: payload }, async () => "https://example.test/room.png");
  assert.deepEqual(uploaded.roomTypes[0].images, ["/room.jpg", "https://example.test/room.png"]);
  assert.match(form.images[1].src, /^data:/);
});
test("hotel booking records preserve room, quantity and paid price snapshots in the UI", () => {
  const booking = mapRental({ id: "booking-1", hotelId: "hotel-1", roomTypeId: "room-1", roomName: "Deluxe", numberOfRooms: 2, unitPrice: 650, units: 3, amount: 3900, occupants: 4, status: "paid", paymentStatus: "paid", property: { id: "hotel-1", title: "Hotel", price: 800 } });
  assert.equal(booking.unitPrice, 650); assert.equal(booking.amount, 3900); assert.equal(booking.numberOfRooms, 2);
  assert.equal(booking.roomName, "Deluxe"); assert.equal(booking.paymentStatus, "Paid");
});
test("room selection carries dates and guest counts into checkout without carrying a price", () => {
  const path = bookingPath("hotel-1", "room-1", { checkIn: "2030-01-01", checkOut: "2030-01-04", guests: 4, numberOfRooms: 2, amount: 1, paymentStatus: "paid" });
  const params = new URL(path, "https://example.test").searchParams;
  assert.equal(params.get("room"), "room-1"); assert.equal(params.get("numberOfRooms"), "2"); assert.equal(params.get("guests"), "4");
  assert.equal(params.has("amount"), false); assert.equal(params.has("paymentStatus"), false);
});
