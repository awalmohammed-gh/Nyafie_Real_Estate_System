# Hotel room bookings

`Property.propertyType = Hotel` uses embedded `roomTypes` with stable MongoDB IDs. A room is only resolved inside its hotel. The regular agent/admin property editors save these items through the existing ownership and subscription guards. Hotel properties use `Rent` and `night`; their catalogue starting price is derived from active room prices. Hotel amenities remain in `Property.amenities`, and room amenities remain in `roomTypes[].amenities`. Hotel-Apartment listings retain their existing rental behavior.

Existing settings gain the Hotel option once during backend initialization. Subsequent administrator changes to the available property types are respected. No room types or prices are invented for existing Hotel listings; an agent must configure them. Existing paid whole-hotel rentals conservatively block room availability for their overlapping dates.

## API and ledger

- `GET /api/properties/:id/rooms?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD` returns date-specific availability. Guests see active room types from published, visible hotels. Authenticated owners/admins may inspect draft and inactive inventory.
- `POST /api/properties/:id/rooms/quote` takes `roomTypeId`, `checkIn`, `checkOut`, `guests`, and `numberOfRooms`. The response is informational and is recalculated on booking.
- `POST /api/rentals` takes the same selection, `propertyId`, and the existing guest contact fields. Hotel stays do not require a residential address. Hotel bookings are stored in the shared Rental ledger, with `hotelId`, `roomTypeId`, `roomName`, and `numberOfRooms`. The authenticated customer and database property supply identity/ownership. Each booking has its own immutable request ID.
- Booking JSON also exposes hotel terminology: `customerId`, `checkIn`, `checkOut`, `guests`, `pricePerNight`, `numberOfNights`, `totalAmount`, and `bookingStatus`. These are aliases over the existing customer, dates, unit price, units, amount and status fields; there is one source of truth for each value.
- The existing `/api/payments/initialize` and `/api/payments/verify/:reference` routes support hotel bookings. Payment amount is the saved, server-calculated nightly price × nights × room count. The booked room name and price stay fixed if room settings change.

Availability uses half-open UTC date intervals `[checkIn, checkOut)`. It subtracts the peak concurrent room count for the full stay, rather than adding all reservations that ever overlap. Paid, confirmed, active and completed bookings occupy their booked dates. Pending requests do not hold inventory. Starting a payment reserves inventory for 30 minutes; holds from every customer, including the same customer, count. Only the exact booking being retried is excluded.

## Concurrency and payment handling

**MongoDB must be a replica set or Atlas deployment supporting transactions.** No unsafe nontransactional fallback is provided. Booking creation, checkout holds, payment confirmation, hotel inventory edits, and hotel status transitions write the same hotel document inside a MongoDB transaction. Concurrent requests encounter write conflicts and retry with current inventory. Hotel edits also compare the document version so stale edits cannot overwrite checkout changes.

Provider initialization happens after the inventory transaction. Failures release the hold; repeated initialization resumes the current checkout URL. Verification queries Paystack from the backend. A provider response still processing preserves the hold. Failed payments release it. A late successful payment must pass the inventory check again. Cancelled bookings, unavailable inventory, mismatched totals and duplicate charges are flagged for refund/review and never silently confirmed. Refunds require the existing administrative process; they are not automatically sent to Paystack.

Room quantities cannot fall below peak future reservations. Persisted room types cannot be removed or reassigned; deactivate them. Hotels with room types or booking history cannot be deleted; save them as drafts to archive them. Legacy whole-hotel payments must be resolved through their existing ledger.

## Verification

Run `npm test` in both backend and frontend and `npm run lint` / `npm run build` in frontend. To also exercise real HTTP routes and transaction contention against a disposable local MongoDB replica set:

```powershell
$env:RUN_HOTEL_INTEGRATION='1'
# Optional for a different local mongod installation:
$env:MONGOD_TEST_BINARY='C:/Program Files/MongoDB/Server/8.2/bin/mongod.exe'
npm test
```

The integration test uses a temporary database directory and random loopback port, then removes its own data. It does not use the configured application database or make real Paystack calls. It verifies room ownership, forged inputs, price snapshots, capacity, back-to-back dates, payment retries, peak inventory, simultaneous last-room checkouts, late payments and refund handling.
