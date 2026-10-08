# HomeBase deployment guide

HomeBase remains a Vite 8 / React 19 SPA with React Router 7, an Express 5 API, Mongoose 9 / MongoDB, Cloudinary images, and Paystack **test** payments. No Next.js migration is required. The canonical production origin is **https://real-estate-home-phi.vercel.app**.

The repository is prepared for deployment. No Vercel production deployment or production browser/payment verification has been performed in this session. Local checks and the remaining production checks are listed below.

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
| `MONGODB_URI` | Yes | Production Atlas connection string for a dedicated HomeBase database user. Include the intended database in the URI or set `MONGODB_DB`. |
| `MONGODB_DB` | If the URI does not select the intended database | Production database name. Overrides the database in the URI when supplied. |
| `PUBLIC_SITE_URL` | Yes | `https://real-estate-home-phi.vercel.app` |
| `JWT_KEY` | Yes | A fresh randomly generated secret of at least 32 characters; use a separate value for Preview. Production refuses shorter values. |
| `CLOUD_NAME` | Yes | Production Cloudinary cloud name. |
| `CLOUD_API_KEY` | Yes | Cloudinary API key, backend only. |
| `CLOUD_SECRET_KEY` | Yes | Cloudinary API secret, backend only. |
| `Test_Secret_Key` | Required for online payments | Paystack **test** secret key (`sk_test_` prefix). Missing or live keys disable checkout. |
| `Test_Public_Key` | Optional | Paystack test public key for the admin configuration summary. Checkout currently uses the authorization URL returned by the backend. |
| `CLIENT_URL` | Optional | `https://real-estate-home-phi.vercel.app`. Defaults to the canonical origin. Additional origins must be an exact comma-separated list of HTTPS origins with no paths; no wildcard. |
| `COOKIE_SAME_SITE` | Optional | Leave unset or use `lax` for this same-domain architecture. |
| `ADMIN_EMAIL` | Required to create the first admin in a fresh database | A dedicated admin email that does not belong to an existing customer or agent. |
| `ADMIN_PSD` | Required with `ADMIN_EMAIL` for initial bootstrap | Strong initial admin password. The minimum accepted length is 8 characters. Remove both bootstrap variables after creating and verifying the admin account. |
| `ADMIN_WHATSAPP_NUMBER` | Optional | Fallback platform WhatsApp number when Admin Settings has none. Agent contacts continue to come from the property's actual agent. |

Vercel supplies `VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, and `VERCEL_BRANCH_URL`. The declared service binding supplies `FRONTEND_INTERNAL_URL`; do **not** enter a fixed frontend URL for that variable in Vercel. `PORT` and `TRUST_PROXY` are local/separate-host options and are not needed here.

The application uses one signing secret (`JWT_KEY`) with separate customer, agent and admin cookies and mandatory role/session JWT claims. It does not read separate customer/agent/admin secret variables. There is no email delivery provider or WhatsApp API integration: email and WhatsApp use external contact links, while contact forms, property inquiries and conversations are stored in MongoDB.

### Frontend service: Production

| Variable | Value |
| --- | --- |
| `VITE_API_URL` | `/api` |
| `VITE_PUBLIC_SITE_URL` | `https://real-estate-home-phi.vercel.app` |

These are public build-time values. Redeploy the frontend after changing them.

### Preview and Development

Give Preview a separate MongoDB database/user, JWT key, first admin account, and preferably separate Cloudinary credentials. Keep Paystack test keys. Use the same canonical `PUBLIC_SITE_URL` and `VITE_PUBLIC_SITE_URL`; Preview HTML is automatically `noindex`, and Preview robots disallows indexing. The backend allows its exact Vercel preview deployment and branch origins and returns test payment callbacks to the trusted preview origin. Add any extra preview alias explicitly to Preview `CLIENT_URL`.

Development retains actual values in `backend/.env` and `frontend/.env`. Local API calls use the Vite proxy from `/api` to port 4000. Local MongoDB credentials are not automatically suitable for Production. In particular, create a fresh sufficiently long production JWT secret rather than copying a short development value.

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

Paystack remains **test-only**, including on the production domain. The deployment is suitable for testing the marketplace on HTTPS; it will not collect live rental or subscription payments. The current integration verifies payments during the application's callback/recheck flow and has no payment webhook receiver. A webhook configuration is therefore not required for this version.

## SEO, routing and performance

HTML responses provide canonical, title, description, Open Graph and Twitter metadata before JavaScript. Property metadata is fetched from visible published listings, safely escaped, and excludes private agent data. Client navigation updates metadata and uses the same canonical origin for property sharing, WhatsApp and email links. `/house/:id` is the existing property detail route; no route migration to `/properties/:id` is needed.

`/sitemap.xml` is a sitemap index with public page entries and property batches of up to 5,000. Only visible listings are included. Admin, agent dashboard, account, checkout, authentication, inquiries and login-required agent profiles are noindex. Renamed default listing/directory slugs redirect to the configured slugs. Valid dashboard/property deep links retain the SPA shell after refresh; unknown public pages and nonexistent property IDs return 404.

Public listing queries are bounded (48 maximum per page); the agent profile paginates its own listings. Directory counts come from server aggregation and remain accurate despite the bounded shared property cache. Pages and dashboards are lazy-loaded separately, including charts and PDF dependencies. The verified main JavaScript bundle is approximately 354 KB before gzip (113 KB gzip); dashboard code is in separate chunks.

## Exact deployment steps

1. From `backend`, run `npm ci` and `npm test`. From `frontend`, run `npm ci`, `npm test`, and `npm run build`. Use Node 24.x. The deployment preparation checks have passed locally.
2. Commit the reviewed deployment changes and push the `platform-redesign` branch to `awalmohammed-gh/Real-Estate`. The environment examples and this guide may be committed; actual `.env`, dependencies and build output must remain ignored.
3. In Vercel, import that GitHub repository into the intended account/team. Choose root directory `./` and retain the committed `vercel.json`. Configure `platform-redesign` as the production branch if deploying this branch directly; otherwise merge the reviewed branch into the project's production branch first.
4. Set the project framework to **Services** and verify the two service roots/frameworks and Node 24.x settings against the table above. Add the Production and Preview environment variables to the correct environments before building. Do not use `frontend` as the project root.
5. Deploy. Inspect both service build logs and backend runtime logs. Confirm that the backend binding was injected and MongoDB/Cloudinary initialization succeeds. Visit `/api/health` and expect HTTP 200 with `{ "success": true, "service": "HomeBase" }`.
6. In project Domains, confirm this project owns `real-estate-home-phi.vercel.app`. Naming the project does not guarantee that hostname is available. If Vercel assigns a different domain, update both canonical URL variables and `CLIENT_URL` to the actual chosen domain and redeploy before sharing links.
7. Sign in through `/admin/login`, review settings, property publication rules and subscription requirements, and check the payment summary says Paystack test and active. Verify the first admin account, then remove its bootstrap variables and redeploy. MongoDB retains the account.
8. Complete the production checks below using dedicated test accounts and Paystack's test checkout. Keep the project in test operation until those checks pass. Roll back the whole deployment if a release breaks a verified flow.

## Verification results and production checklist

Local automated verification completed: **66 backend tests and 7 frontend tests passed**, production Vite build passed, targeted lint passed. Vercel CLI 63.1.0 recognized both services in unlinked local mode. Read-only requests through its routing table verified the API health endpoint, page HTML/canonical URLs, private-route noindex, robots/sitemap responses, guest directory denial, favicon/banner image responses and JavaScript asset delivery, using the actual local database connection. Backend tests use real HTTP requests with controlled database/provider fixtures; they do not constitute an Atlas write test or a live Paystack checkout. Tests cover role isolation, cookie restoration, logout, approval/subscription bypasses, property ownership, contact inbox permissions, rental quotes/payment verification, concurrent connection reuse/retry, dynamic HTML metadata, robots/sitemaps, upload guards and shared rate limits. PDF tests generate real three-page reports.

Production results: **not deployed or tested yet**. The service binding, Vercel ingress, HTTPS cookies in a browser, real Cloudinary upload, and test Paystack checkout must be verified on the actual deployment. Use this checklist:

| Area | Production checks |
| --- | --- |
| Public site | Homepage/navbar/footer, contact banner, favicon/logo; listings, search/location/type/price/bedroom filters, sale/rent and enabled hotel types; pagination/sorting; published detail and image loading; refresh `/house/:id`; unknown page and invalid ID return 404. |
| Customer | Register/login, refresh restores customer only, favorites, inquiry reaches the correct agent, sale WhatsApp/email links use the canonical property URL, logout; guests see no agent identities and cannot open the agent directory/profile. |
| Agent | Register/onboarding profile and agency images, test subscription, admin review/approval, agent login and refresh; add/edit/delete own property and images, My Properties, correct inquiries; explicit switch opens login/create account even with an existing agent tab. |
| Admin | Dedicated login/refresh, dashboard, agent approval/suspension, property management, subscriptions/plans/settings, contact inbox/status, report PDF download, logout. |
| Rental/payment | Availability and database price enforced, test rental checkout, verified callback/recheck, declined/cancelled/retried payment, fake success rejected; no live transactions. |
| Security | Customer token -> admin and agent APIs denied; agent token -> admin denied; Agent A -> Agent B property denied; unsubscribed/expired agent -> add property denied; guest -> account API denied; cross-origin writes denied; upload validation/limits enforced. |
| SEO/routing | View source for homepage/listing/property metadata, correct canonical/OG; robots and all sitemap children load; private profiles/dashboards noindex; refresh `/account`, `/agent/login`, `/agent/dashboard`, `/agent/properties`, `/admin/login`, `/admin/dashboard`; configured slugs and old-slug redirects work. |

## Changed files and remaining limits

Deployment changes are concentrated in `vercel.json`, `backend/app.js`, `backend/server.js`, `backend/config/{runtime,initialize,mongodb}.js`, environment examples/package files, security/auth/bootstrap helpers, rate-limit and image-upload routes/models, payment callback origins, SEO routes/utilities, listing/directory queries, frontend API/image handling, route splitting, metadata providers, canonical sharing helpers, and deployment tests. The same commit also includes the requested contact page/inbox, exact banner/favicon assets, logo sizing, matching agent banner/navbar and login-required agent visibility.

Services is Beta and its routing/binding behavior still needs deployment verification. This remains a client-rendered application with server-generated metadata rather than full page-content SSR. Contact/email links do not send transactional email. Paystack live payments are intentionally disabled. Large supplied static banner/favicon originals remain unchanged; property uploads are resized in the browser. No production credentials, domain ownership, external checkout, browser refresh, or real upload success is implied by local test results.
