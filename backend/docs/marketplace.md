# Marketplace behavior

The existing React/Express/MongoDB app connects customers to the agent who owns a
listing. Existing platform-owned listings remain identified as platform listings.
No existing data needs a destructive migration.

## Ownership and public identity

- Agent posting routes require an approved, active account and a paid or waived,
  unexpired subscription when subscriptions are required. The server attaches
  `req.user._id` as the owner and ignores client ownership/contact overrides.
- Editing, featuring and deleting agent listings check ownership on the server.
  Live listing edits are checked against publication requirements again.
- Public list, detail, related and own-listing responses attach `agent`, populated
  in a batch from current public profile fields. Saved contact snapshots cannot
  impersonate another agent. Approval actors, rejection notes, billing, saved
  properties and account preferences are excluded from the public agent payload.
- Approval badges use actual approval and account status. `/agents/:id` and the
  existing `/agent/:id` both open the public agent profile. Active listing counts
  exclude sold and rented homes; those properties retain their history.

## Discovery and communication

- `/listings?purpose=rent&city=accra&type=Apartment` works alongside the existing
  `status=Rent` links. Region, city, neighbourhood, type, price and room filters
  remain in the URL. Server matching ignores case and escapes regex characters.
- Structured location supports country, region, city, neighbourhood, address,
  digital address and optional latitude/longitude. Older records default to Ghana
  with no invented coordinates. Published location details are public; the editor
  states this. Map links distinguish exact coordinates from an area search.
- Property WhatsApp and email links use the owner's business contact details and
  include the title, reference and property URL, without customer personal data.
- Account inquiries resolve their recipient from the listing, notify that agent
  and open/reuse the customer/property conversation. Both inboxes link to the
  conversation. Older inquiries remain accessible without a conversation link.
  Customer inbox access is by authenticated customer ID, not a submitted email.
- Public visibility checks apply when starting inquiries, chats, offers, sale
  requests and rentals, including agent suspension and subscription expiry.

## Rental and sale flows

- Sales emphasize Contact Agent, inquiries and existing structured offers. The
  purchase-request route records interest; it does not charge or complete a sale.
  The buyer and agent/owner agree on the final amount and sale arrangements.
- Rentals offer checkout only for available GHS listings when the backend reports
  online rental payments available. Amounts, periods, existing fees and totals come
  from the backend. No deposit or additional fees have been introduced.
- Calendar-month rentals use calendar anniversaries (including month-end
  clamping). A 12-month rental costs 12 months; a partial final month rounds up.
  Nightly rentals charge by night. Invalid dates and unavailable properties are
  rejected. Paid/confirmed/active/completed bookings and live checkout holds block
  overlapping dates. End dates are exclusive, so back-to-back rentals are allowed.
- Regular rentals share one availability filter and one property-level transaction
  lock for checkout preparation, payment confirmation and owner status changes.
  Competing requests retry against fresh inventory; they cannot both reserve the
  same dates. Request edits also use this lock and never rewrite the dates or
  total of a booking whose checkout has already started.
- Holds last 30 minutes. Confirmation checks availability again inside the
  transaction, excluding only that booking, including other holds by the same
  customer. If another booking has reserved the dates, the late charge is marked
  `refund_required`, its booking is cancelled, and admins receive a refund-review
  notification. An expired hold can still complete if the dates remain free.
  Refund flags require admin handling; this flow does not issue provider refunds.
- Payment and booking saves commit together. MongoDB must support transactions
  (Atlas or a replica set), as required by hotel bookings too.
- Only payment-provider verification can confirm rental payment. The existing
  Paystack integration supports **test keys only**. Production charges have not
  been enabled by this change. Customer and owner notifications remain in place.
- `POST /api/payments/paystack/webhook` authenticates Paystack's HMAC-SHA512 over
  the exact raw body, then verifies successful charges with Paystack itself. It
  does not need a browser cookie or trusted browser Origin. Unsupported events and
  unknown/non-rental references are acknowledged without creating data. Successful
  charges are acknowledged only after transactional payment/refund-review handling;
  temporary failures return non-200 so the provider can retry.
- Browser verification, rental/hotel webhooks and scheduled recovery share
  `processRentalPayment`. Replays do not pay the booking twice. Processing payments
  retain their hold and do not become failed. Cancellation, duplicate-charge and
  inventory checks apply identically when the customer closes the payment tab.
- `GET /api/payments/reconcile` requires the `CRON_SECRET` Bearer credential. The
  supplied daily Vercel schedule checks up to 20 due attempts; failed attempts are
  retried for seven days and pending attempts remain eligible. Atomic ten-minute
  leases prevent concurrent scheduled calls claiming the same attempt. Configure
  the Paystack test webhook URL and `CRON_SECRET` after deployment; adjust recovery
  frequency to payment volume. See the deployment guide for exact settings.

## Verification

Run `npm test` in `backend`; marketplace regressions cover public privacy,
ownership spoofing, cross-agent writes, subscription payment checks, inquiry
routing/conversation links, search escaping, rental pricing/availability and
provider verification. Run `npm run lint` and `npm run build` in `frontend`.

The regular-rental integration suite uses real HTTP and a disposable local MongoDB
replica set, with mocked Paystack responses. It tests simultaneous holds and
payments, expired holds, unchanged checkout snapshots and adjacent rental dates.
It never connects to the configured application database. From `backend`, run:

```powershell
$env:RUN_RENTAL_INTEGRATION = '1'
# Override this path if mongod is installed elsewhere.
$env:MONGOD_TEST_BINARY = 'C:/Program Files/MongoDB/Server/9.0/bin/mongod.exe'
node --test tests/rentalInventory.integration.test.js
```

Signed webhook and scheduled recovery integration tests use the same disposable
database helper and mocked provider, covering no-cookie delivery, hotel payments,
missed callbacks, replay/concurrency, signature checks and provider failures:

```powershell
$env:RUN_PAYMENT_INTEGRATION = '1'
node --test tests/paymentCallbacks.integration.test.js
```

Live API discovery was checked against the configured MongoDB. No test payment
was submitted and no test listing/account was inserted into that database. A
visual browser walkthrough requires a connected browser.

### Financial inventory

`GET /api/admin/inventory` is admin-only and combines property payment records
with agent subscription payments. It separates rentals, hotels/short stays,
property sales, and subscriptions. Totals use integer pesewas and confirmation
dates (creation dates where no confirmation date exists).

Only `paid` records count as recorded receipts. Pending/failed attempts and
duplicate/refund-review charges are shown separately. Explicit test payments,
waived subscriptions, plan credits, and zero-value records are excluded. These
are gross recorded payments across admin and agent listings, not net platform
profit, expenses, commissions, payouts, or verified bank settlement. The page
shows the configured Paystack test environment when applicable.

`from` and `to` accept Ghana calendar dates (`YYYY-MM-DD`, inclusive).
`sector`, `status`, `search` (literal reference text), and `page` filter the
20-row ledger; the sector accounting summary always covers all sectors in the
selected date range. `Cache-Control: private, no-store` protects responses.

Local regression checks use a disposable MongoDB database:

```powershell
$env:RUN_FINANCE_INTEGRATION = '1'
node --test tests/financialInventory.integration.test.js
```
