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
  rejected. Existing paid/confirmed/active bookings and checkout holds still apply.
- Only payment-provider verification can confirm rental payment. The existing
  Paystack integration supports **test keys only**. Production charges have not
  been enabled by this change. Customer and owner notifications remain in place.

## Verification

Run `npm test` in `backend`; marketplace regressions cover public privacy,
ownership spoofing, cross-agent writes, subscription payment checks, inquiry
routing/conversation links, search escaping, rental pricing/availability and
provider verification. Run `npm run lint` and `npm run build` in `frontend`.

Live API discovery was checked against the configured MongoDB. No test payment
was submitted and no test listing/account was inserted into that database. A
visual browser walkthrough requires a connected browser.
