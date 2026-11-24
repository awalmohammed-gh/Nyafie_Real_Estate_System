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

## How guests pay (per hotel)

NyaFie never holds guests' money, so **reserve now, pay at the hotel is always offered** (it can't be switched off). Every booking asks for the guest's **arrival time** on the check-in day (no later than the hotel's arrival deadline; the guest can change it until check-in and the hotel is told) and gets a **booking code** (`NF-7KQ9PX`), emailed with the confirmation and shown in the guest's account, to show at the front desk. **The hotel approves every booking** (`PATCH /api/rentals/:id/approve { roomNumbers }`): it assigns the room number(s) the guest will stay in (one per booked room; a room can't be given to two overlapping stays), and only then is the booking code issued and the **booking receipt** (code, rooms, dates, arrival time, amount) sent to the guest in the app, by email and as a PDF to show at the front desk. Until then the rooms are held and the guest sees "waiting for the hotel". A booking paid online gets its payment receipt with the approval. Check-in needs an approved booking; to refuse a booking, the hotel cancels it. **Unanswered bookings are cancelled automatically** 24 hours before check-in (the check-in day at the guest's arrival time; a booking made less than a day ahead gives the hotel 2 hours, never past check-in): the rooms are released, the guest and hotel are told, and an online payment is flagged for a refund (`utils/bookingExpiry.js`). This runs in the daily job and whenever bookings are listed, opened, approved or checked for availability, so it never waits for the next day. An agent hotel may additionally offer online payment, paid straight into its own payout account; the platform's own hotels are paid at the hotel only.

Each hotel's options, in the listing editor under **How guests pay**:

- **Reserve now, pay at the hotel** (default for every hotel, including hotels saved before this option existed). `POST /api/rentals/:id/reserve` runs the same transaction and inventory check as a checkout, then confirms the reservation: `status: confirmed`, `paymentStatus: due`, `paymentOption: on_arrival`. The reservation stores the arrival deadline (check-in day + the hotel's time, Ghana/GMT) and a copy of the hotel's cancellation and no-show policy. No money passes through NyaFie, so this works when online payments are off. Not allowed while an online checkout for the same booking is still inside its 30-minute hold.
  - The hotel records the payment with `PATCH /api/rentals/:id/paid-on-arrival`. A stay with payment still due cannot be marked completed.
  - After the arrival deadline the hotel can mark a no-show (a cancellation with a note).
  - The guest can cancel (`PATCH /api/rentals/:id/cancel`) until the check-in day; unpaid requests can be cancelled any time.
  - If an earlier online attempt for the same booking still succeeds later, it pays the reservation (no double booking, nothing due at the hotel). A payment after the hotel already recorded one is flagged as a duplicate for refund.
- **Pay online** (Paystack). The money goes to the hotel: the owner connects a bank account or mobile money wallet (`GET/PUT/DELETE /api/properties/:id/payout`, banks from `GET /api/properties/payout-banks?type=bank|mobile_money`). The server creates a Paystack subaccount with `percentage_charge: 0`, and checkouts pass `subaccount` with `bearer: "subaccount"`, so the hotel receives the full amount minus Paystack's fee. NyaFie's own hotels settle to the main account.
  - Only the account owner (the agent, or the agency owner) can change it, and only with their password.
  - **Security hold:** a new account receives online payments only 48 hours after it is connected. A change creates a new Paystack subaccount that waits out the same hold as `pending`, while payments keep going to the current account; it replaces the current account the first time the account is read after the hold. The owner can cancel a waiting change (`DELETE /api/properties/:id/payout/pending`).
  - Every connection, change, cancellation and removal is sent to the owner in the app **and by email**, and to the admins as a critical alert.
  - Only the bank name, the account name Paystack returns and the last 4 digits are stored (`PayoutAccount`, one per hotel per Paystack mode). The full number lives at Paystack; the subaccount code is never sent to browsers.
  - Online payment is offered only when the hotel switched it on, its payout account is connected for the current Paystack mode, and platform rental payments are enabled. `GET /api/properties/:id` returns `paymentOptions` for hotels with the reason when online payment is unavailable.

Guests see "Booking confirmed — Paid" or "Reservation confirmed — Payment due at hotel".

### Rentals priced per night

Regular rental listings priced **per night** (short stays) offer the same choice, with the owner deciding under **How guests pay** in the editor (`stayBooking` on the property, same fields as hotels):

- Defaults: both options on (these listings already took online payments). Monthly and fixed-price rentals keep the online checkout only.
- **Reserve now, pay on arrival**: `POST /api/rentals/:id/reserve` re-checks the listing and that the dates are free inside the same property lock as an online checkout, then confirms the rental straight away (`confirmed`, `due`, `on_arrival`, method "On arrival"). The dates are blocked like a paid rental. The owner records the payment, marks a no-show after the deadline, or the guest cancels before check-in day, with the same endpoints as hotels.
- **Pay online**: the existing rental checkout (paid into the main NyaFie account; the owner then confirms). An owner who switches it off gets a 409 from `/api/payments/initialize` for that listing.
- A late online payment for a rental that was then reserved pays the reservation and keeps it confirmed.

Guests see "Reservation confirmed — Payment due on arrival".

**Check with Paystack before going live:** refunds of split (subaccount) payments. Refunds still go through the admin refund process. Confirm in the Paystack dashboard/support whose balance a refund is taken from, and agree with each hotel how refunds are recovered.
