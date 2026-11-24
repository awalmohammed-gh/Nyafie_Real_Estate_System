# NyaFie deployment guide

NyaFie remains a Vite 8 / React 19 SPA with React Router 7, an Express 5 API, Mongoose 9 / MongoDB, Cloudinary images, and Paystack payments (test mode by default; live mode only after the go-live checklist below). No Next.js migration is required. The canonical production origin is **https://nyafie.vercel.app**.

The app is deployed from `main` to the Vercel project **`nyafie`** (team `awalmohammed-ghs-projects`). The production checklist below has not been signed off yet, so keep Paystack in test mode until it has. Local checks and the remaining production checks are listed below.

## Architecture and Vercel configuration

Deploy the repository root as **one Vercel project with two Services**. [Vercel Services is currently Beta](https://vercel.com/docs/services); the existing independently built frontend and backend fit that model.

| Service | Root | Framework | Install | Build / entrypoint | Output |
| --- | --- | --- | --- | --- | --- |
| frontend | `frontend` | Vite | `npm ci --include=dev` (Vite is a dev dependency; `NODE_ENV=production` would otherwise skip it) | `npm run build` | `dist` |
| backend | `backend` | Express | `npm ci` | exported Express app in `app.js` | Vercel Node.js Function |

Both packages specify Node.js **24.x**. `vercel.json` owns these settings and the ordered public routing table. Select the repository root (`./`), not either service folder, when importing the project. Set the project's framework preset to **Services** in Build and Deployment settings, as required by the [Services setup guide](https://vercel.com/kb/guide/vercel-services). Each service's framework remains defined in the committed configuration. Do not add a project-wide build command or output directory that overrides the service settings.

Requests to `/api/*` reach Express with their original path. Public page HTML, property deep links, private dashboard deep links, `robots.txt`, and the sitemap routes reach Express. Express fetches the static frontend HTML using the deployment-specific `FRONTEND_INTERNAL_URL` service binding and injects metadata. The frontend supplies static assets and the remaining SPA fallback routes. The browser calls relative `/api` URLs, so cookies and the API use the same domain.

`backend/app.js` exports the app without opening a listener; `backend/server.js` starts the local server only. This uses [Vercel's native Express support](https://vercel.com/docs/frameworks/backend/express). Do not deploy `server.js` as a background daemon or select an Edge runtime.

## Environment variables

Both `.env.example` files contain empty assignments only. Actual local `.env` files remain ignored. Configure environment variables in the Vercel project's settings for the appropriate Production or Preview environment. Services share project environment configuration; the tables identify which code consumes each variable. Backend credentials must never have a `VITE_` prefix or be imported into frontend code. Configure secrets directly in the Vercel dashboard; do not commit them or paste them into issue bodies.

### Backend service: Production

| Variable | Required | Configuration |
| --- | --- | --- |
| `NODE_ENV` | Yes | `production` |
| `MONGODB_URI` | Yes | Production Atlas connection string for a dedicated NyaFie database user. Include the intended database in the URI or set `MONGODB_DB`. |
| `MONGODB_DB` | If the URI does not select the intended database | Production database name. Overrides the database in the URI when supplied. |
| `PUBLIC_SITE_URL` | Yes | `https://nyafie.vercel.app` |
| `JWT_KEY` | Yes | A fresh randomly generated secret of at least 32 characters; use a separate value for Preview. Production refuses shorter values. |
| `CLOUD_NAME` | Yes | Production Cloudinary cloud name. |
| `CLOUD_API_KEY` | Yes | Cloudinary API key, backend only. |
| `CLOUD_SECRET_KEY` | Yes | Cloudinary API secret, backend only. |
| `PAYSTACK_MODE` | Optional | `test` (default) or `live`. Live mode must be chosen explicitly; any other value disables online payments. |
| `PAYSTACK_SECRET_KEY` | Required for online payments | `sk_test_…` in test mode, `sk_live_…` in live mode. A key never works in the other mode. The older `Test_Secret_Key` variable is still read for test mode only. |
| `PAYSTACK_PUBLIC_KEY` | Optional | Matching `pk_test_…`/`pk_live_…` key, shown only as configured/not configured in the admin summary. Checkout uses the authorization URL returned by the backend. |
| `ADMIN_ENTRY_PATH` | Required to use the admin console | The private address of the admin console: `https://nyafie.vercel.app/<ADMIN_ENTRY_PATH>/login`. 16-64 random letters, digits, `-` or `_` (generate one with `node -e "console.log('hb-' + require('crypto').randomBytes(12).toString('base64url'))"`). Set the **same** value on the frontend service. Admin endpoints answer exactly like unknown endpoints without it, and `/admin` is an ordinary 404 page. Without this variable production has no admin console. |
| `ADMIN_TWO_STEP` | Optional | Leave unset. Admin sign-in then has two steps: the password, then a six-digit code emailed to the admin (10 minutes, five guesses). Set `off` only in an emergency, such as email delivery being down, and remove it again straight after. |
| `CRON_SECRET` | Required for scheduled payment and refund recovery; live mode stays off without it | At least 32 random characters. Vercel sends it as a Bearer authorization header to `/api/payments/reconcile`. Never expose it in frontend variables. |
| `CLIENT_URL` | Optional | `https://nyafie.vercel.app`. Defaults to the canonical origin. Additional origins must be an exact comma-separated list of HTTPS origins with no paths; no wildcard. |
| `COOKIE_SAME_SITE` | Optional | Leave unset or use `lax` for this same-domain architecture. |
| `ADMIN_EMAIL` | Required to create the first admin in a fresh database | A dedicated admin email that does not belong to an existing customer or agent. |
| `ADMIN_PSD` | Required with `ADMIN_EMAIL` for initial bootstrap | Strong initial admin password. The minimum accepted length is 8 characters. Remove both bootstrap variables after creating and verifying the admin account. |
| `ADMIN_WHATSAPP_NUMBER` | Optional | Fallback platform WhatsApp number when Admin Settings has none. Agent contacts continue to come from the property's actual agent. |
| `VIEW_HASH_SECRET` | Optional | Key for the hashed visitor ids used to deduplicate property views. Defaults to a key derived from `JWT_KEY`; changing either lets returning visitors count once more. |
| `VIEW_WINDOW_HOURS` | Optional | How long one visitor counts as one view of a listing (1 to 720, default 24). |

Vercel supplies `VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, and `VERCEL_BRANCH_URL`. The declared service binding supplies `FRONTEND_INTERNAL_URL`; do **not** enter a fixed frontend URL for that variable in Vercel. `PORT` and `TRUST_PROXY` are local/separate-host options and are not needed here: on Vercel the app trusts exactly one proxy hop, so `req.ip` (used by rate limits and view deduplication) is the real client address and a forged `X-Forwarded-For` cannot change it.

When first deploying real property view tracking, run `npm run views:reset` once in `backend/` against the production database. It sets earlier counts (seeded numbers and refresh-inflated counts) to 0, so every displayed view comes from deduplicated visits.

The application uses one signing secret (`JWT_KEY`) with separate customer, agent and admin cookies and mandatory role/session JWT claims. It does not read separate customer/agent/admin secret variables. Email (an email provider, or Gmail as a fallback) delivers the sign-up, verification and password reset codes, so **email must be configured before anyone can create an account**. At startup the backend logs an error (and reports it to Sentry in production) when it isn't. Contact forms, property inquiries and conversations remain stored in MongoDB; contact email and WhatsApp buttons open external contact links.

### Google SMTP customer verification

Set these backend-only variables locally in `backend/.env` and in each deployment environment:

```dotenv
SMTP_USER=your-sending-account@gmail.com
SMTP_APP_PASSWORD=your-google-app-password
```

Use a dedicated Gmail or Google Workspace sending account. Enable Google 2-Step Verification and generate an [App Password](https://support.google.com/mail/answer/185833?hl=en); use that app password, not the ordinary Google account password. Some managed accounts restrict app passwords; check the account's administrator if the option is unavailable. Do not commit credentials or prefix them with `VITE_`. Restart the backend or redeploy after configuring them. The implementation connects to `smtp.gmail.com:465` with TLS and sends from `SMTP_USER`. See [Google's SMTP documentation](https://developers.google.com/workspace/gmail/imap/imap-smtp).

**Email/password sign-up (customers and agents)** creates no account until the emailed six-digit code is entered. Registration returns HTTP 202 with a short-lived challenge and stores the details in `PendingRegistration` (password already hashed). The correct code creates the account, already verified, and removes the pending record in one transaction; only then is a session issued and, for customers, the admins notified. Unfinished sign-ups are deleted automatically 24 hours after the last attempt (MongoDB TTL index). Signing up again with the same password continues the same sign-up; different details replace it and void any code already sent. Signing in with the email and password of an unfinished sign-up returns to the code step instead of "incorrect password". A customer code can't finish an agent sign-up, or the reverse. Google sign-up is unchanged (Google has already verified the address).

Codes expire after ten minutes, allow five attempts, and may be resent after sixty seconds with a maximum of five sends per email per hour. Only keyed code hashes are persisted. Delivery failures display a retry option and never enable access. The challenge is held only in the form's memory; after a reload, sign in again to resume. Sign-ups are also limited to 30 per hour per network (generous, because many mobile users share one address).

**Whose email it is.** Email/password sign-up accepts Gmail addresses only (`@gmail.com`, `@googlemail.com`); the server refuses anything else. Set `SIGNUP_EMAILS=any` to accept every provider again; existing accounts and Google sign-in are unaffected either way. Each Gmail inbox gets one account: dots, `+tags` and `googlemail.com` are ignored when comparing (`User.emailKey`, unique), so `a.b+x@gmail.com` and `ab@gmail.com` can't both sign up. A code proves control of the inbox, not the person's legal identity. Admins see **Email verified** / **Not verified** on the Customers and Agents pages and can list unverified accounts.

Existing customer accounts created before codes were required must verify on their next sign-in; older customer cookies cannot bypass the requirement. Existing agents must do the same: the next agent sign-in asks for a code, and older agent cookies stop working until the email is verified. **Check that email is delivered on the deployment before releasing this**, because agents who can't receive a code can't sign in. Suspended agents may verify but stay suspended; admins are not affected. Rentals, hotel bookings, purchase requests and property inquiries use the verified account email from the server, rather than an arbitrary address submitted in the form. Admin sign-in is unchanged. Changing an account email from admin settings clears that address's verification status.

### Google customer sign-in

Customer sign-in and signup include Google's **Continue with Google** button. A verified Gmail or Google Workspace identity creates a customer account on the first visit and signs the customer in on later visits, without an additional email code. Existing customers with the same authoritative Google email are linked to their existing account. Google identities using third-party email providers must use the normal email/password flow. Admin accounts cannot use the Google button; agents can, for the customer area only.

**Typing the same email later.** Google never shares a person's Google password, so it can't be stored. The account keeps the name and email Google confirmed, and after signing in the person is offered a NyaFie password of their own (or later in Settings > Security, or with "Forgot your password?"). Both ways then open the same account. Choosing a first password without a current one works only within 15 minutes of signing in with Google, so an old or stolen session can't set one; it signs out other sessions. When that time has passed, the dialog asks Google to confirm the same account first. `User.passwordSetAt` records that a password exists.

**Agents and Google.** The agent area has no Google sign-in, and Google never creates an agent. A customer (Google or not) applies from **Become an agent**: a NyaFie password if they don't have one, the plan and payment when subscriptions are on, the professional profile, proof documents, then admin approval. Until approval the workspace stays closed. Every agent is a customer too, with one account and password for both areas: they can book, buy and save, but never on their own or their agency's listings, and suspending or removing an agent closes both. `User.customerAccess` only records who started as a customer (plan before profile). Google opens an agent's customer area; the agent area needs the password. "Forgot your password?" works from both sign-ins, and signing out of one area signs the same person out of the other.

**"The server isn't responding" (502).** Locally this means the backend isn't running or is restarting; the sign-in page retries for a few seconds. `npm run server` now keeps retrying while the database can't be reached, instead of stopping until a file changes.

Create a **Web application** OAuth client in [Google Auth Platform](https://console.cloud.google.com/auth/clients), configure the app's branding and audience, and add the actual frontend origins under **Authorized JavaScript origins**. For local development, add `http://localhost:5173` and `http://127.0.0.1:5173`. Add your deployed HTTPS origin separately. Origins have no path. If the consent screen is in testing, add the intended Google test users. See [Google Identity Services setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).

Set the client ID on the backend:

```dotenv
GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
```

This ID is separate from `SMTP_USER` and `SMTP_APP_PASSWORD`. The popup credential flow does not need a client secret or redirect callback URL. The frontend receives the public client ID from a tab-bound challenge endpoint, so no additional `VITE_` variable is required. Restart the backend after adding the ID; configure the same variable on your deployment before redeploying. Google sign-in remains unavailable while the ID is missing, and email/password remains usable. If you add frontend CSP restrictions, allow Google's script/frame/connect URLs as described in the setup guide; a strict `Cross-Origin-Opener-Policy: same-origin` on the HTML may need `same-origin-allow-popups` for popup compatibility.

The backend uses Google's official authentication library to verify the signature and audience, then checks issuer, expiry, nonce and verified email ownership. Google subject IDs are stored as hidden, unique identifiers. Challenges expire after ten minutes, are single-use and bind to the current customer tab. A Google email change does not silently transfer an existing account. Linking an unverified pre-registration replaces its old password and revokes its old sessions to prevent a person who registered someone else's address retaining access; that customer can set a password through email recovery afterward. New Google accounts have an unguessable generated password and may use recovery if they want email/password access later.

Run the default tests with `npm test`. For isolated database tests, set `RUN_GOOGLE_AUTH_INTEGRATION=1` and run `node --test tests/googleAuth.integration.test.js` in `backend/`. Tests mock Google's token verifier; actual popup consent, authorized origins and Google token issuance must be checked using your configured Google OAuth client.

### Email provider (strongly recommended for production)

Gmail works for testing, but it limits how many emails one account can send per day (about 500, or 2,000 on Google Workspace), and mail sent from a Gmail address for this site often lands in spam. Because every new account needs its code email, hitting that limit stops all sign-ups for the rest of the day. For production, send through an email provider from your own domain. Any provider with SMTP works (Brevo, Resend, Mailgun, SendGrid, Postmark, Amazon SES...):

1. Add your domain in the provider's dashboard and add the DNS records it gives you (SPF, DKIM and usually DMARC). This is what keeps the emails out of spam.
2. Create SMTP credentials in the provider's dashboard.
3. Set these backend variables (Production and Preview):

| Variable | Value |
| --- | --- |
| `EMAIL_SMTP_HOST` | The provider's SMTP host, e.g. `smtp-relay.brevo.com`, `smtp.resend.com`, `smtp.mailgun.org`, `smtp.sendgrid.net` |
| `EMAIL_SMTP_PORT` | `587` (default, STARTTLS) or `465` (TLS) |
| `EMAIL_SMTP_USER` / `EMAIL_SMTP_PASSWORD` | The SMTP login the provider gives you (backend only, never `VITE_`) |
| `EMAIL_FROM` | The sender address on your verified domain, e.g. `no-reply@yourdomain.com` |

When `EMAIL_SMTP_HOST` is set the provider is used for every email, and all four other values are required; a missing one shows "Email delivery is temporarily unavailable" rather than silently falling back. Without `EMAIL_SMTP_HOST`, Gmail (`SMTP_USER` / `SMTP_APP_PASSWORD`) is used as before. Emails go out as text plus a simple HTML version, with the site name from Admin Settings as the sender name. TLS is always required.

### Error monitoring (Sentry)

Unexpected errors are reported to [Sentry](https://sentry.io) when a DSN is set; without one nothing is sent.

1. Create a Sentry project (platform: Node.js for the backend, React for the frontend; one project with both DSNs set to the same value also works).
2. Set `SENTRY_DSN` on the backend and `VITE_SENTRY_DSN` on the frontend (the DSN is not a secret; the frontend one is built into the site). Redeploy.

What is reported: server errors (HTTP 500 and failed start-up), failures of the daily payment recovery and renewal reminder jobs, crashed pages and uncaught browser errors. What is never sent: cookies, headers, request bodies, IP addresses, emails, console output, query strings (payment references), invite tokens and the admin console's private address (replaced by `:admin`). Reports carry the error, a cleaned path, the deployment environment and commit, and the signed-in account's internal id. Set up an alert rule in Sentry (e.g. email on every new issue) so failures reach you.

### Customer password recovery

The customer sign-in form includes **Forgot your password?**. Google SMTP sends a separate six-digit password reset code using the same `SMTP_USER` and `SMTP_APP_PASSWORD`. Reset codes expire after ten minutes, allow five guesses, are single-use, and may be requested at most once per minute and five times per account per hour. Request and reset endpoints also share an IP limit of twenty requests per fifteen minutes. A new code invalidates the previous one. Only keyed hashes are stored; code values and SMTP credentials are never logged.

`POST /api/auth/customer/forgot-password` accepts `{ email }` and returns the same response for eligible, unknown, inactive and non-customer accounts. `POST /api/auth/customer/reset-password` accepts `{ email, code, newPassword }`. Successful recovery changes the password hash and session revocation marker together, clears failed-login locks, and requires a fresh sign-in. Mailbox ownership established during recovery also verifies the customer email. Pending codes cannot override a subsequent password or email change. This flow supports customer accounts, including customers who upgraded to agents; standalone agent and admin recovery are not exposed through these public endpoints.

To run the recovery integration checks, set `RUN_PASSWORD_RESET_INTEGRATION=1` and run `node --test tests/passwordReset.integration.test.js` from `backend/`. They use temporary local MongoDB and mocked SMTP. Test actual delivery with your own inbox after restarting/redeploying; no new SMTP variables are required.

Run `npm test` in `backend/` for unit/regression checks. To exercise real MongoDB verification, set `RUN_EMAIL_INTEGRATION=1` and run `node --test tests/emailVerification.integration.test.js` with a local MongoDB binary available (`MONGOD_TEST_BINARY` overrides its path). The integration test uses a temporary replica set and mocks SMTP, never the application database or real inboxes. After setting actual credentials, verify delivery and the complete signup/code/resend/login flow with an inbox you control on the deployed site.

### Frontend service: Production

| Variable | Value |
| --- | --- |
| `VITE_API_URL` | `/api` |
| `VITE_PUBLIC_SITE_URL` | `https://nyafie.vercel.app` |
| `ADMIN_ENTRY_PATH` | The same private value as the backend service |
| `VITE_MAP_TILE_URL` | Recommended for production: a map tile provider URL with your key (MapTiler, Stadia, Carto...). Without it the maps use OpenStreetMap's community tile servers, whose [usage policy](https://operations.osmfoundation.org/policies/tiles/) does not allow heavy commercial use. |
| `VITE_MAP_TILE_ATTRIBUTION` | The attribution your tile provider requires (HTML). |
| `VITE_SENTRY_DSN` | Optional: browser error monitoring (see "Error monitoring"). |

The `VITE_` values are public build-time values. `ADMIN_ENTRY_PATH` is not public: the build only embeds its SHA-256 hash, so the app recognises the console's address without revealing it. Redeploy the frontend after changing any of them, and change both services together.

### Admin console address

The admin console is not linked or listed anywhere: not in the site, robots.txt, the sitemap, or the JavaScript. `/admin`, `/admin/login` and any other guess show the normal "page not found" with a 404 status. Only people who know `ADMIN_ENTRY_PATH` can open `https://nyafie.vercel.app/<ADMIN_ENTRY_PATH>/login`; bookmark it and share it only with administrators. The browser sends the address with each admin request and the server checks it before anything else, so the admin login cannot even be tried without it. This hides the console; the admin password, rate limits and sign-in lockout still protect the account itself. If the address leaks, change `ADMIN_ENTRY_PATH` on both services and redeploy: the old address stops working immediately.

### Preview and Development

Give Preview a separate MongoDB database/user, JWT key, first admin account, and preferably separate Cloudinary credentials. Keep Paystack test keys. Use the same canonical `PUBLIC_SITE_URL` and `VITE_PUBLIC_SITE_URL`; Preview HTML is automatically `noindex`, and Preview robots disallows indexing. The backend allows its exact Vercel preview deployment and branch origins and returns test payment callbacks to the trusted preview origin. Add any extra preview alias explicitly to Preview `CLIENT_URL`.

Development retains actual values in `backend/.env` and `frontend/.env`. Local API calls use the Vite proxy from `/api` to the backend's `PORT` in `backend/.env` (4000 when unset; set it to another port, such as 4100, if another project's server already uses 4000). The proxy reads only that line; `API_PROXY_TARGET` in `frontend/.env` overrides it. Run the backend with `npm run server` (Node's built-in `--watch`). If its port is taken it stops with "port … is already used by another program" instead of appearing to run. Local MongoDB credentials are not automatically suitable for Production. In particular, create a fresh sufficiently long production JWT secret rather than copying a short development value.

## MongoDB and persistent storage

Create the production database and Atlas database user before the first deployment. Give that user access to the intended database and configure Atlas network access for the Vercel functions' outbound connectivity. Select a Vercel function region near the database where possible. Preview must not point at the production database.

Concurrent cold-start requests reuse one MongoDB connection promise; warm requests reuse the connection. A failed connection clears the promise and can retry. Connection selection/connect timeouts are 10 seconds and the pool has at most 10 connections per function instance. Initialization failure returns a safe 503 rather than terminating a function process.

Production rate limits use atomic MongoDB `RateLimitBucket` records shared across instances, with hashed identifiers and an `expiresAt` TTL index. Ensure the deployment database user can create the application's collections/indexes. A first admin is created once from the bootstrap variables; deployment never promotes an existing customer or resets an existing admin password. Do not run the demo seed against Production.

Images persist in Cloudinary. The upload endpoint accepts authenticated active agents (including onboarding profile uploads) and admins, validates the image type, and limits each data URI to 3 MiB. The frontend resizes property photos and uploads images individually before saving cloud URLs, preserving the editable form if an upload fails. This keeps saves below [Vercel's 4.5 MB function request limit](https://vercel.com/docs/functions/limitations). The endpoint uses an account-specific Cloudinary folder; the client cannot choose a folder. Property writes still enforce approval, ownership, and subscription rules.

The runtime does not depend on Multer disk storage or local permanent files. The supplied contact banner and favicon are served as static frontend assets. Existing HTTPS image URLs continue to work; there is no Next.js Image allowlist because this is a Vite app.

## Authentication and marketplace behavior

Production cookies are HTTP-only, Secure, host-only, path `/`, and SameSite=Lax by default. Customer and agent cookies persist for seven days; admin cookies for twelve hours. Each `/me` route restores only its own role session, and logout clears only the selected role's cookie. An existing agent tab does not bypass an explicitly opened agent login or registration form.

Customers cannot access agent or admin APIs; agents cannot access admin APIs. Agent property ownership comes from the authenticated agent, and changing a property ID does not permit editing another agent's property. Approval and configured subscription requirements are checked server-side, including expiry. When subscriptions are required, they must be active and paid or explicitly waived by an admin. Preserve the desired setting in Admin Settings before opening the marketplace.

Guests can browse published properties but cannot see agent identities or the directory. The agent directory and profiles require login, as requested. They are excluded from the sitemap and marked noindex. Agent inquiries route to the actual listing owner. Sale listings retain contact/offer flows; rental totals and availability come from the database. Payment success requires server verification of Paystack's reference, currency and amount. A browser return URL alone does not mark a payment successful.

Paystack runs in **test mode** unless `PAYSTACK_MODE=live` is set with a live key and `CRON_SECRET`; see "Going live with Paystack" below. Until then the deployment does not collect real rental or subscription payments.

### Subscription activation consistency

Verified subscription activation runs in a MongoDB transaction: the paid ledger record, previous plan's status and account's subscription pointer commit together or roll back together. This requires a replica set or MongoDB Atlas, as do the existing booking transactions. Provider verification happens before the transaction; application submission and notifications happen after commit. No external payment request is repeated by a transaction retry.

Activation reloads the subscription from the database instead of trusting the request's earlier copy. A committed `activationProcessedAt` marker makes retries and simultaneous verification idempotent, including after a plan has been replaced or cancelled. Removed providers' late payments are recorded without restoring their subscription. Subscription documents use optimistic concurrency so a delayed pending/failed response cannot replace a paid state.

Expiry uses `durationDays` saved when checkout starts, even if the plan is edited before payment confirmation. Older attempts without a duration snapshot use the plan's current duration once and persist that value. The original `planPrice` snapshot is retained. This change prevents new partial activations; historical records from earlier versions that are already inconsistent require separate review rather than an automatic reassignment of an older paid plan.

Set `RUN_SUBSCRIPTION_INTEGRATION=1` and run `node --test tests/subscriptionActivation.integration.test.js` from `backend/` to verify rollback, competing confirmations, renewal dates, stale provider responses, removed providers and duration snapshots against temporary local MongoDB with mocked Paystack.

### Payment webhook and recovery

After deploying, register `https://nyafie.vercel.app/api/payments/paystack/webhook` as the webhook URL for the Paystack mode you use (test and live each have their own webhook setting). This endpoint confirms regular-rental, hotel-room and agent subscription charges, and receives refund progress and dispute events, without a browser return or login cookie. It verifies the exact raw body's HMAC-SHA512 signature and independently checks the reference, currency and amount with Paystack before using the existing transactional booking/inventory checks or subscription activation. Paystack retries callbacks when the endpoint returns a non-200 response; the app acknowledges a charge only after a durable payment, activation or refund-review outcome. See [Paystack's webhook setup](https://paystack.com/docs/payments/webhooks/).

Set `CRON_SECRET` in the backend deployment environment. The committed `vercel.json` schedules `GET /api/payments/reconcile` daily at 02:00 UTC as a fallback for missed webhooks and return pages. The job checks up to 20 due items per invocation, taking turns between rental attempts, subscription attempts, accepted refunds and open disputes so no backlog starves the others. It only touches records made in the current Paystack mode; pending attempts remain eligible, and failed attempts are rechecked for seven days. Atomic ten-minute leases prevent overlapping jobs checking the same attempt. Increase the schedule frequency with a compatible hosting plan or invoke the same authenticated endpoint from another scheduler when payment volume needs more than 20 checks per day. On other hosts, configure an equivalent scheduled GET with `Authorization: Bearer <CRON_SECRET>`. See [Vercel cron authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).

The same daily job also keeps listings fresh and reminds agents about renewals: owners of listings not confirmed as available for 30 days are asked to confirm them, and listings still unconfirmed 14 days later are hidden from search until the owner confirms (Agent → My Properties → Still available; admins confirm the platform's own listings in Admin → Properties). Hotels are not included. Saved-search alerts are sent when a matching listing is published, not by the job.

Never put `CRON_SECRET` in a URL. Missing/short secrets disable the recovery endpoint. Preview deployments need an explicitly configured callback URL for their own test environment; production cron scheduling does not imply a preview scheduler. Unknown references are acknowledged without creating records.

### Refunds

A Paystack charge is flagged **Refund required** (or **Duplicate**) when it cannot be honoured: a duplicate charge, a payment that arrived after its booking was cancelled or its dates were taken, a booking cancelled after it was paid, or a subscription paid after a newer plan became current. Admins and the customer are notified. Nothing is refunded automatically.

An admin refunds it from **Admin → Payments → Refund**, always for the whole amount:

- **Refund through Paystack** sends one refund request. The payment is claimed in the same database transaction that records the refund, so double clicks or two admins cannot send two. Progress arrives through the signed `refund.*` webhooks and the scheduled job. When Paystack reports it processed, the payment (and its booking) show **Refunded** and the customer is notified; Paystack notes it can take up to 10 business days to reach them. A failed or rejected refund alerts admins and may be retried.
- If Paystack does not answer the request, the refund is marked **unconfirmed** and is **never resent**. Check the transaction in the Paystack dashboard, then use **Manage refund** to record what it shows. Refunds Paystack marks *needs attention* (usually missing customer account details) are completed in the Paystack dashboard.
- **Already returned another way** records a refund made outside Paystack (for example by mobile money). It needs the transaction reference and a note, and is recorded as processed immediately. Use this for test-mode payments after switching to live mode, since the live key cannot refund them.

Refunded amounts are excluded from revenue and appear as **Refunded** in Financial inventory. Each refund keeps its own history (who requested it, every status change, and any admin confirmation).

### Payment disputes (chargebacks)

When a customer disputes a charge with their bank or mobile money provider, Paystack sends `charge.dispute.create`, then `charge.dispute.remind` every few hours and `charge.dispute.resolve` at the end. The same webhook URL receives them. NyaFie asks Paystack for the dispute's current state, saves it on the payment or subscription and alerts admins, even when payment notifications are switched off. **Admin → Payments** shows open disputes with their deadline at the top, and a **Disputed** tab. Reminders reach admins about once a day. The daily job also re-checks open disputes.

**Disputes are answered in the Paystack dashboard, not in NyaFie.** One that isn't answered in time is accepted automatically and the money goes back to the customer.

- **Dispute open**: Paystack refunds of that payment are blocked, because the customer could be paid twice. Money already returned another way can still be recorded.
- **Dispute won**: the money stays. If the payment was also flagged for a refund, it can be refunded as usual.
- **Dispute lost**: the returned amount comes off revenue, and a fully returned payment appears as **Refunded** in Financial inventory. **The booking or plan is not changed**: cancel it yourself if it should end. Cancelling a booking whose whole payment was returned does not ask for another refund.
- **Check dispute**: Paystack reported an outcome NyaFie doesn't recognise. Look at it in the Paystack dashboard; refunds stay blocked.

For a disputed subscription, the agent's upgrades are paused until the dispute is settled (they can still renew), and money lost to a dispute is taken off their upgrade credit.

Disputes from the other Paystack mode, or over transactions NyaFie has no record of, are ignored. Run the checks with `npm run test:integration -- disputes` in `backend/`.

### Going live with Paystack

Do this only after every test-mode check below has passed on the production deployment.

1. In the Paystack dashboard, finish business verification for live payments and settlement, and confirm GHS is enabled.
2. Set the **live** webhook URL to `https://nyafie.vercel.app/api/payments/paystack/webhook`. The test and live webhook settings are separate.
3. Set `CRON_SECRET` (32+ random characters) and confirm the daily `/api/payments/reconcile` cron is listed in Vercel. Live mode refuses to start without it.
4. In the backend **Production** environment only, set `PAYSTACK_MODE=live`, `PAYSTACK_SECRET_KEY=sk_live_…` and `PAYSTACK_PUBLIC_KEY=pk_live_…`. Keep Preview and Development on test keys. Redeploy.
5. In **Admin → Settings → Payments**, confirm the provider shows **Live: real money** with no blockers listed. If it lists blockers, payments stay off until they are fixed.
6. Make one small real payment with your own card or mobile money, then refund it: cancel the paid booking as the owner, refund it from **Admin → Payments**, and wait for **Refunded**. Confirm the charge and the refund in the Paystack dashboard and the refund on your statement.
7. A hotel guest chooses **Pay online now** (the hotel's own Paystack payout account) or **Pay when you move in**. Online is on by default for agent hotels but opens only once the owner connects a payout account; hotels saved earlier with online payment off stay off until the owner ticks it. NyaFie's own hotels are paid when moving in. Hotels that take online payments reconnect their payout account once in live mode (Agent → listing editor → How guests pay). Payout accounts are stored per Paystack mode, because test subaccounts don't exist in live mode; until a hotel reconnects, its guests can still reserve and pay at the hotel.
8. Keep Paystack's transaction fees on the merchant account (the default) unless you have confirmed in test mode that Paystack reports `requested_amount` when customers pay the fee; otherwise those payments are held for review instead of confirmed.
9. Watch the admin notifications and the cron response for the first days. To stop taking real money at any time, set `PAYSTACK_MODE=test` (or turn rental/subscription payments off in Settings) and redeploy.

Payments are recorded with the Paystack mode they were made in. In live mode, older test-mode checkouts stay visible (tagged **Test mode** on the Payments page) but are excluded from revenue, financial inventory and recovery, and cannot be verified or refunded with the live key.

### Location-based property discovery

Visitors can find homes near them on the homepage ("Homes near you"), from the hero's **Near me** option, and on every listings page (`/listings`, `/sale`, `/rent`), as a list or on a map. The map shows clustered price pins (rent and sale in different colours) and a preview card per pin.

- **No API keys are required.** Maps use Leaflet with OpenStreetMap tiles. Place search goes through the backend (`GET /api/geo/search`), which proxies OpenStreetMap's public Photon geocoder, caches answers for 24 hours per instance and limits each visitor to 60 searches a minute. Both free services are fair-use only. When traffic grows, set `GEOCODER_URL` (backend, any Photon-compatible service) and `VITE_MAP_TILE_URL` / `VITE_MAP_TILE_ATTRIBUTION` (frontend, any `{z}/{x}/{y}` tile service) to a paid or self-hosted provider. No code changes are needed.
- **API keys and URLs:** no API key is ever placed in a URL the browser sees. Paystack's secret key goes only in a server-side `Authorization` header, Cloudinary signs uploads on the server, and `CRON_SECRET` is a header. The browser only calls this site's `/api` and keyless OpenStreetMap tiles. A key in `GEOCODER_URL` stays on the server: it is never returned, logged or sent on a redirect. The one exception is a paid **tile** provider (`VITE_MAP_TILE_URL`): browsers fetch tiles directly, so that key is public by nature. Use only the provider's public, domain-restricted token there, never a secret key. `RUN_SECURITY_INTEGRATION=1 node --test tests/secretExposure.integration.test.js` plants fake secrets and checks that every route, response header and log line stays free of them.
- **Every listing is placed on the map automatically.** When a listing is saved without a pin, the backend finds its neighbourhood and city (for example "East Legon, Accra") and places it there. These pins are marked approximate (`location.pinSource: "address"`), so distances read "About 3.3 km away" and the details page shows the area as a circle, never a precise spot. An agent or admin can make a pin exact in the editor's Location step (**Find address on map**, then click or drag onto the building, or **I'm at the property**). A pin placed by a person never moves when the address text changes. If an area can't be found, or the geocoder is unavailable, the listing is saved without a pin rather than given a guessed one. The property lists show "Area pin" or "No map pin" badges.
- **Existing listings:** `npm run geo:locate` in `backend/` previews where listings without a pin would go, and `npm run geo:locate -- --apply` places them. It paces itself for the free geocoder, retries when it is busy, never touches a listing that already has a pin, and keeps `updatedAt`. All 13 production listings were placed this way on 2026-11-08.
- **Landing page:** the hero's **Where?** search covers this site's neighbourhoods, places on the map and **Use my current location**. "Homes near …" appears under the hero only after a location is chosen and there are homes nearby. Otherwise the page is unchanged, or shows a one-line note.
- **House details:** a map shows where the house is: a marker for an exact pin, or a shaded area for an approximate one, with a Google Maps link for directions.
- **Search:** `GET /api/properties/nearby?latitude&longitude&radius` (km: 1, 2, 5, 10, 20 or 50; default 5) plus the normal filters (`listingType`, `type`, `minPrice`, `maxPrice`, `bedrooms`, `bathrooms`, `amenities`, `sort`, `page`, `limit`). It applies the same public visibility rules as every other public listing query. It returns only Available and Under Offer listings, nearest first, each with `distance` in metres measured by MongoDB. `format=markers` returns up to 200 compact map pins. Invalid coordinates, radii or filters get a 400 with a clear message.
- **Database:** `Property.geo` is a GeoJSON point (`[longitude, latitude]`) with a 2dsphere index. It is derived from the existing `location.latitude` / `location.longitude` on every save and is absent when there is no pin. The index is created automatically when the backend starts. Run `npm run geo:backfill` once in `backend/` against any database whose listings already had coordinates before this change. It indexes existing coordinates, never invents any, keeps `updatedAt`, and is safe to repeat.
- **Privacy:** the browser only asks for location after the visitor presses **Use my current location**, and a refusal is never asked again. The position is rounded to about 110 m immediately, kept only in that browser tab for 30 minutes, and never put in a URL, stored on the server or shown to anyone. Only the visitor's choice (current location, manual place, skip) and their last searched place are remembered on the device. Browsers only allow location on HTTPS (and localhost), which production uses.

Integration tests: `RUN_NEARBY_INTEGRATION=1 node --test tests/nearbyProperties.integration.test.js` in `backend/` (temporary local MongoDB). The place-search proxy test runs with `npm test`.

## SEO, routing and performance

HTML responses provide canonical, title, description, Open Graph and Twitter metadata before JavaScript. Property metadata is fetched from visible published listings, safely escaped, and excludes private agent data. Client navigation updates metadata and uses the same canonical origin for property sharing, WhatsApp and email links. `/house/:id` is the existing property detail route; no route migration to `/properties/:id` is needed.

Page HTML carries `X-Frame-Options: DENY`, `nosniff`, a referrer policy and a **Content Security Policy in report-only mode** (`PAGE_CSP` in `backend/middleware/security.js`). Nothing is blocked yet: browsers report what would have been blocked to `/api/csp-report`, which writes one short line per report to the backend logs (`CSP report-only: …`, without query strings). After a week or two of production traffic with no unexpected lines, change the header name in `backend/routes/seoRoutes.js` from `Content-Security-Policy-Report-Only` to `Content-Security-Policy` to enforce it. If you add a new outside service (another video host, a map tile provider on its own domain for scripts or frames, an analytics script), add it to the policy first.

**Search wording and location pages.** Titles lead with what people search for ("3-Bedroom House for Rent in East Legon, Accra"). Every neighbourhood and city with public listings has its own page for sale and for rent (`/rent/east-legon`, `/sale/accra`, `backend/routes/seoRoutes.js placeIndex`), listed in the sitemap and linked from `/sale`, `/rent`, each listing's breadcrumb and the "by area" links; places without listings return 404. Pages carry schema.org JSON-LD (`backend/utils/seoContent.js`): the business and the sitelinks search box on the homepage, `RealEstateListing` with price, place, size and photos on listings (never exact map pins), `ItemList` on location pages, and breadcrumbs. The main text is also written into `#root` as plain HTML for crawlers that don't run JavaScript; the app replaces it when it starts. After deploying: add the site to [Google Search Console](https://search.google.com/search-console) and [Bing Webmaster Tools](https://www.bing.com/webmasters), submit `/sitemap.xml`, and check a listing with the [Rich Results Test](https://search.google.com/test/rich-results). For "near me" searches, create a Google Business Profile for the business.

`/sitemap.xml` is a sitemap index with public page entries and property batches of up to 5,000. Only visible listings are included. Admin, agent dashboard, account, checkout, authentication, inquiries and login-required agent profiles are noindex. Renamed default listing/directory slugs redirect to the configured slugs. Valid dashboard/property deep links retain the SPA shell after refresh; unknown public pages and nonexistent property IDs return 404.

Public listing queries are bounded (48 maximum per page); the agent profile paginates its own listings. Directory counts come from server aggregation and remain accurate despite the bounded shared property cache. Pages and dashboards are lazy-loaded separately, including charts and PDF dependencies. The main JavaScript bundle is approximately 211 KB before gzip (67 KB gzip), with React in its own cached chunk; dashboard, map and PDF code are in separate chunks.

## Exact deployment steps

1. From `backend`, run `npm ci` and `npm test`. From `frontend`, run `npm ci`, `npm test`, `npm run lint` and `npm run build`. Use Node 24.x.
2. Commit the reviewed changes to `main` and push them. The environment examples and this guide may be committed; actual `.env`, dependencies and build output must remain ignored.
3. The Vercel project is `nyafie`, with root directory `./` and the committed `vercel.json`; `main` is the production branch. Link a fresh checkout with `vercel link --project nyafie`. To set up a new project instead, import the repository with root `./`.
4. Keep the project framework on **Services** and verify the two service roots/frameworks against the table above. Set the project's Node.js version to **24.x** to match both `package.json` files. Add the Production and Preview environment variables to the correct environments before building. Do not use `frontend` as the project root.
5. Deploy. Inspect both service build logs and backend runtime logs. Confirm that the backend binding was injected and MongoDB/Cloudinary initialization succeeds. Visit `/api/health` and expect HTTP 200 with `{ "success": true, "service": "NyaFie" }`.
6. In project Domains, confirm this project owns `nyafie.vercel.app`. Naming the project does not guarantee that hostname is available. If Vercel assigns a different domain, update both canonical URL variables and `CLIENT_URL` to the actual chosen domain and redeploy before sharing links.
7. Sign in through `https://nyafie.vercel.app/<ADMIN_ENTRY_PATH>/login`, review settings, property publication rules and subscription requirements, and check the payment summary says Paystack test and active. Verify the first admin account, then remove its bootstrap variables and redeploy. MongoDB retains the account.
8. Bring the production database's indexes in line with the code, from `backend/` with the production `MONGODB_URI`: `npm run indexes:sync` shows what would be dropped (old indexes that newer ones replace) and changes nothing; `npm run indexes:sync -- --apply` makes the changes. New indexes, including the automatic clean-up of unfinished sign-ups, are created by the app itself on start. Then run `npm run places:backfill` once: it gives listings saved before place keys existed their `location.areaKey` / `cityKey`, so area search and location pages use the place-key indexes for every listing (new and edited listings get keys automatically; it is safe to run again).

Values read on nearly every request are kept briefly per server instance (`backend/utils/memo.js`), so traffic doesn't multiply database work: platform settings for 15 seconds (cleared at once when an admin saves them), the agents whose listings are public for 30 seconds (cleared when an agent is approved, suspended, removed or restored, or a subscription activates), and the location-page index for 5 minutes. A listing's own page is always checked live.
9. Complete the production checks below using dedicated test accounts and Paystack's test checkout. Keep the project in test operation until those checks pass. Roll back the whole deployment if a release breaks a verified flow.

## Verification results and production checklist

Local automated verification (2026-11-22): **266 backend unit tests, 229 backend integration tests (495 in total) and 65 frontend tests passed**, the production Vite build passed and lint is clean; `npm audit` reports no vulnerabilities in either package. The integration suites are opt-in: set the matching `RUN_*_INTEGRATION=1` variable (for example `RUN_RENTAL_INTEGRATION=1`) and run `node --test tests/<name>.integration.test.js` from `backend/`. Each one starts its own temporary MongoDB replica set (`MONGOD_TEST_BINARY` overrides the default `C:/Program Files/MongoDB/Server/9.0/bin/mongod.exe`) and never touches the application database. Vercel CLI 63.1.0 recognized both services in unlinked local mode. Read-only requests through its routing table verified the API health endpoint, page HTML/canonical URLs, private-route noindex, robots/sitemap responses, guest directory denial, favicon/banner image responses and JavaScript asset delivery, using the actual local database connection. Backend tests use real HTTP requests with controlled database/provider fixtures; they do not constitute an Atlas write test or a live Paystack checkout. Tests cover role isolation, cookie restoration, logout, approval/subscription bypasses, property ownership, contact inbox permissions, rental quotes/payment verification, concurrent connection reuse/retry, dynamic HTML metadata, robots/sitemaps, upload guards and shared rate limits. PDF tests generate real three-page reports.

Production results: **deployed, checklist not yet signed off**. The service binding, Vercel ingress, HTTPS cookies in a browser, real Cloudinary upload, and test Paystack checkout must be verified on the actual deployment. Use this checklist:

| Area | Production checks |
| --- | --- |
| Public site | Homepage/navbar/footer, contact banner, favicon/logo; listings, search/location/type/price/bedroom filters, sale/rent and enabled hotel types; pagination/sorting; published detail and image loading; refresh `/house/:id`; unknown page and invalid ID return 404. |
| Sign-up codes | Customer and agent sign-up: the code email arrives (check spam), a wrong code is refused, the right one creates the account and signs in; nothing is created before the code; startup logs show no "Email is not configured" error. |
| Customer | Register/login, refresh restores customer only, favorites, inquiry reaches the correct agent, sale WhatsApp/email links use the canonical property URL, logout; guests see no agent identities and cannot open the agent directory/profile. |
| Agent | Register/onboarding profile and agency images, test subscription, admin review/approval, agent login and refresh; add/edit/delete own property and images, My Properties, correct inquiries; explicit switch opens login/create account even with an existing agent tab. |
| Admin | Dedicated login/refresh, dashboard, agent approval/suspension, property management, subscriptions/plans/settings, contact inbox/status, report PDF download, logout. |
| Rental/payment | Availability and database price enforced, test rental checkout, verified callback/recheck, declined/cancelled/retried payment, fake success rejected; no live transactions. |
| Security | Customer token -> admin and agent APIs denied; agent token -> admin denied; Agent A -> Agent B property denied; unsubscribed/expired agent -> add property denied; guest -> account API denied; cross-origin writes denied; upload validation/limits enforced. |
| Nearby discovery | Add map pins to real listings; homepage location prompt, allow and deny; manual place search (e.g. East Legon, Spintex); radius 1–50 km; list and map views; marker preview opens the right listing; works on a phone over HTTPS. |
| Security policy | Browse the main pages (home, listings, a property with a video tour, Google sign-in, maps, checkout) and check the backend logs for `CSP report-only:` lines; add any legitimate source to `PAGE_CSP` before enforcing it. |
| SEO/routing | View source for homepage/listing/property metadata, correct canonical/OG; robots and all sitemap children load; private profiles/dashboards noindex; refresh `/account`, `/agent/login`, `/agent/dashboard`, `/agent/properties`, `/<ADMIN_ENTRY_PATH>/login`, `/<ADMIN_ENTRY_PATH>/dashboard`; `/admin` shows page not found; configured slugs and old-slug redirects work. |

## Changed files and remaining limits

Deployment changes are concentrated in `vercel.json`, `backend/app.js`, `backend/server.js`, `backend/config/{runtime,initialize,mongodb}.js`, environment examples/package files, security/auth/bootstrap helpers, rate-limit and image-upload routes/models, payment callback origins, SEO routes/utilities, listing/directory queries, frontend API/image handling, route splitting, metadata providers, canonical sharing helpers, and deployment tests. The same commit also includes the requested contact page/inbox, exact banner/favicon assets, logo sizing, matching agent banner/navbar and login-required agent visibility.

Services is Beta and its routing/binding behavior still needs deployment verification. This remains a client-rendered application with server-generated metadata rather than full page-content SSR. Contact/email links do not send transactional email; customer verification codes are delivered separately through Google SMTP. Paystack live payments stay off until the go-live checklist is completed; no live checkout or refund has been run by these tests. Large supplied static banner/favicon originals remain unchanged; property uploads are resized in the browser. No production credentials, domain ownership, external checkout, browser refresh, or real upload success is implied by local test results.

## Database integration tests

`npm test` in `backend/` runs the unit tests and skips the database integration suites. Run those on a computer with MongoDB installed (any recent `mongod`; the tests start and delete their own throwaway replica sets and never touch the application database):

```powershell
$env:MONGOD_TEST_BINARY='C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe'
npm run test:integration
```

Run a few suites only with `npm run test:integration -- hotelFlow rentalInventory`. The tests use Paystack **test keys** and replace every Paystack request, so no money moves and no real key is needed; the runner removes any live key set in the shell.

Keep Paystack in **test mode** (test keys, `PAYSTACK_MODE` unset or `test`) until the site is launched on its own domain and the go-live checklist above is signed off. Only then set the live secret key (`sk_live_…`) from your own Paystack account and `PAYSTACK_MODE=live` in Vercel.

