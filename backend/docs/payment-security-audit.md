# Paystack payment security audit (November 2026)

Scope: every route that starts, confirms, refunds or changes a payment, or grants paid access. That covers agent subscriptions (new, renewal, upgrade, plan credit), rental and per-night checkouts, hotel bookings (including payouts to hotels' Paystack subaccounts), pay-on-arrival reservations, the Paystack webhook, the scheduled recovery job, admin refunds and payment lists, the payment models, and how keys are configured.

Verdict: the integration was already built around server-side truth. Four gaps were found and fixed (below). No critical vulnerability was found: no path lets a user get paid access or a booking without Paystack confirming a matching payment.

## What was already in place (verified, with tests)

| Requirement | How it is met | Where |
|---|---|---|
| Server-side initialization, price from the database | Subscriptions: plan and upgrade credit from `quotePlan`. Rentals: `quoteRental`. Hotels: `quoteHotelRoom`. Browser amounts, prices and tiers are ignored. A local record is created before Paystack is called. | `subscriptionController.startCheckout`, `prepareRentalCheckout`, `hotelPaymentController` |
| Unpredictable unique references | Prefix + time + 24 random bits; unique index on `Payment.reference` and `Subscription.paymentReference` | `utils/paystack.js newReference` |
| Secret key never exposed | Server-only env vars; key fingerprint never logged; responses checked by `secretExposure.integration.test.js` (canary key); `.env` files are git-ignored; no real key in git history (only the test canary) | `utils/paystack.js`, tests |
| Test and live isolation | `PAYSTACK_MODE`; live needs an `sk_live_` key and `CRON_SECRET`; every record stores its environment; a record from the other mode is never verified or refunded with the current key; a transaction from the other domain never pays | `paymentEnvironment`, `inCurrentEnvironment`, `sameDomain` |
| Server-side verification | Only `GET /transaction/verify/:reference`, checked against the stored record (reference, amount, currency, environment). Ownership comes from the stored record; webhook metadata, customer and amount are ignored. Browser verification endpoints look records up by reference **and** the signed-in user. | `processRentalPayment`, `processSubscriptionPayment` |
| Webhook security | `POST` only; `express.raw` keeps the exact bytes; HMAC-SHA512 of the raw body with the secret key, `timingSafeEqual`, hex format checked, missing header rejected. Only `charge.success` and `refund.*` are acted on. | `middleware/paymentCallbacks.js`, `app.js` |
| Durable acknowledgement | The webhook re-verifies with Paystack and commits before replying 200. Pending or errors reply non-200 so Paystack redelivers. A daily signed recovery job (`/api/payments/reconcile`, `CRON_SECRET`) re-checks unsettled payments with leases. | `paymentCallbackController.js`, `vercel.json` |
| Idempotent fulfilment, races | Confirmation runs in MongoDB transactions. Subscriptions use optimistic concurrency and `activationProcessedAt` (a replay never extends a plan). Rentals and hotels lock their inventory document, so a webhook racing the browser, or two charges for the same dates, confirm one booking; the other is flagged `duplicate` / `refund_required`. | `settleSubscription`, `confirmRentalPayment`, `confirmHotelPayment` |
| Subscription access rules | Only agents pay; agency staff can't (the owner manages billing); dates are computed on the server; `subscriptionState` decides access from `expiresAt`; payment never skips admin approval (`submitReadyApplication` only submits). | `subscriptionController`, `utils/permissions.js` |
| Mobile money | Hosted Paystack checkout only (no card or MoMo PIN fields in NyaFie). `ongoing`, `pending`, `processing` and `queued` stay pending with the booking hold kept. Abandoned or failed checkouts are re-checked for 7 days. No automatic recurring charges exist: renewal is always manual. | `checkPaystackTransaction` |
| Rentals and stays | Property published and available, dates validated, conflicts checked under a lock; a payment that lands after the dates were taken or the listing was withdrawn is flagged for refund, not booked. | `quoteRental`, `confirmRentalPayment` |
| Refunds | Admin only (`protectAdmin, adminOnly`). The payment record is claimed in the same transaction that creates the refund (no double refund). Results come from Paystack's refund API or webhook; unknown answers are never resent. | `utils/refunds.js` |
| No escrow claims | No page describes payments as held in escrow. | — |

## Gaps found and fixed

1. **Overpayment counted as paid (medium).** Verification accepted `amount >= expected`, and a different amount was silently retried as "not ready" instead of being reviewed.
   - Now `checkPaystackTransaction` requires exactly the expected pesewas in GHS. A higher `amount` is accepted only when `requested_amount` equals the expected amount, which is the case when the customer bears Paystack's fee.
   - A successful charge with a different amount or currency is now `mismatch`: nothing is granted, the booking hold is released, and the record becomes `refund_required` with the note and `paidAmount`. Admins and the customer are notified. Redeliveries cannot revive it.
   - Refunds of such a record return `paidAmount`, which is what Paystack actually charged.
2. **No Paystack transaction ID stored (low; audit).**
   - Confirmed payments and subscriptions now store `providerTransactionId` and `channel`.
   - A unique partial index allows one Paystack transaction per record. A clash alerts admins: "Paystack transaction recorded twice".
3. **Subscription checkout robustness (low).**
   - Pesewas are now computed with the shared `toSubunit` (integer-safe for two-decimal amounts; rejects non-finite or negative values) from the stored record, not inline.
   - A network error from Paystack now marks the attempt failed and returns 502, where it used to return an unhandled 500.
4. **No renewal reminders (feature gap).** The daily job now notifies agents once, 7 days or less before their current plan expires (claimed atomically, never twice). It states that nothing is charged automatically.

Tests: `marketplace.test.js` (exact amounts, fee-bearing customers, pesewa rounding), `paymentCallbacks.integration.test.js` (mismatch held for refund on rentals and subscriptions, transaction ID uniqueness, refund of the charged amount, reminders), `subscriptionUpgrades.test.js` (underpaid upgrade held, never activated).

## Open items (need a decision or Paystack confirmation)

- **Webhook signature scheme.** Paystack's published scheme is `x-paystack-signature` (HMAC-SHA512, no timestamp), which is what is implemented. No timestamped `Paystack-Signature` scheme could be confirmed in Paystack's documentation, so none was added. Replays are harmless because processing is idempotent and re-verified with the API. If Paystack enables a newer scheme on the account, add it then from their docs.
- **Customer-borne fees.** If the Paystack account passes fees to customers, confirm in test mode that verify returns `requested_amount`. Otherwise those payments are held for review instead of confirmed.
- **Disputes and chargebacks (`charge.dispute.*`) and reversals** are not handled automatically. A reversed payment keeps the access it granted until an admin acts. Consider handling dispute webhooks: flag the record and notify admins.
- **Split payments to hotels:** confirm with Paystack whose balance refunds come from (see `hotel-bookings.md`).
- **Ghana regulatory review** of collecting money for agents (rentals settle to NyaFie's account) is a business and legal question, not a code one.
- **Live secret rotation:** no live key was found anywhere in code or history. Rotate it if it was ever shared outside the server environment.
