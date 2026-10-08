# Independent role sessions

Customer, agent and admin sessions coexist in the same browser profile. Each
login and logout changes only its role's persistent HTTP-only cookie.

| Domain | Account role | Cookie | Session endpoint | Login page |
| --- | --- | --- | --- | --- |
| customer | user | customer_token | /api/auth/customer/me | /login |
| agent | agent | agent_token | /api/auth/agent/me | /login?account=agent (also /agent/login) |
| admin | admin | admin_token | /api/auth/admin/me | /admin/login |

Each domain also exposes `POST /api/auth/:domain/login`,
`POST /api/auth/:domain/logout`, `PUT /api/auth/:domain/me`, and
`PUT /api/auth/:domain/me/password`. Customers register through
`POST /api/auth/customer/register`; agents through `POST /api/auth/agent/register`.
Existing unscoped auth endpoints are customer-only compatibility aliases.
The old `token` cookie is ignored; existing users need to sign in again once.

JWT verification checks HS256 signature, expiry, account ID, signed session
domain, signed role and current database role. Customer/admin identities also
require an active account. Agent identities can restore a suspended session to
read its application status, but workspace access requires an active account and
an explicitly approved agent application. A JWT
copied into another role cookie is rejected. Missing or invalid sessions return
401; disallowed roles/selectors return 403. Authentication never falls back to
another role cookie. Database failures do not clear valid cookies.

Private customer routes use `protectCustomer`; agent routes use `protectAgent`;
admin routes use `protectAdmin`. Shared notifications, chats and transaction
resources select exactly one allowed session using `X-Session-Domain`.
This header is a routing selector, not proof of identity. Omitting it on shared
routes selects customer, without cookie fallback. Ownership checks still apply.
Subsequent role guards retain that selection rather than switching identities.

The frontend mounts a separate role-bound AuthProvider instance in SessionLayout.
Changing areas unmounts the previous instance and its private data providers.
Every instance validates returned account roles and calls only its own session
endpoint. Other tabs have independent state. Guards and login pages wait for
restoration; focusing a tab rechecks its own session. JWTs remain in HTTP-only
cookies and are never saved in JavaScript storage.

Public property pages, public agent profiles and `/agent/plans` use customer auth.
Selecting Agent on `/login` or `/register` uses `?account=agent` to mount the agent
provider and issue only the agent cookie. Agent onboarding, status and checkout
use `/agent/onboarding`, `/agent/status` and `/agent/checkout`. Approved agents
compare and renew plans through `/agent/subscription/plans` and
`/agent/subscription/checkout`. Customer payment never changes the customer's
role. Customer and agent accounts retain the existing shared User model and
globally unique email constraint, while their sessions and permissions remain
logically separate.

## Agent applications

Registration creates an agent identity with `agentApplication.status=incomplete`.
It grants access only to authentication, profile/application and subscription
requirements. `GET/PUT /api/agents/application` and
`POST /api/agents/application/submit` use `protectAgentSession`, not the workspace
guard. Profile fields are allowlisted; roles, account activation, decisions and
review audit fields never come from applicant requests.

After profile completion, the server checks the current require-subscription
setting. When required, a verified active subscription (paid or admin-waived)
must exist before submission or approval. Verified payment sets the application
to pending and never approves it. Existing paid subscription dates are preserved;
the plan duration begins at payment as it did before this change.

Admins review `/admin/agent-applications` using the admin-only application API.
Approval records `approvedAt` and `approvedBy`. Rejection stores optional feedback;
the applicant can update and resubmit. Suspension revokes workspace and public
listing access immediately, including for an already issued token. Reactivation
restores prior approval only when requirements are complete. An older suspended
identity without prior approval instead returns to incomplete to finish onboarding.
Conditional database updates
prevent competing reviews or profile saves from overwriting a changed status.
In-app notifications announce submission and review decisions.

Existing agent accounts without an application record are intentionally treated
as incomplete, never silently approved. Active legacy agents must complete their
profile, satisfy the current subscription requirement and receive explicit admin
approval. Their account ID, listings and subscription history are retained.

Frontend route guards block manually entered dashboard URLs; backend workspace
and shared owner guards independently enforce approved + active. Public agents
and their listings are hidden until approval. Expired subscriptions still restrict
publishing through the existing subscription permissions after approval.

Cookies preserve the existing deployment settings: HTTP-only, path `/`, seven
days, Secure in production, SameSite=None in production for separate frontend
and API origins (HTTPS required), and SameSite=Lax for local development.

## Verification

Run `npm test` in backend for HTTP regression tests. These run actual routes,
controllers, JWT cookies and bcrypt hooks with isolated in-memory model storage;
they do not connect to MongoDB or charge a real payment. Run frontend
`npm run lint` and `npm run build`.

With local frontend/backend servers running, run
`node scripts/verifyAuthBrowser.js <path-to-agent-browser-executable>` in backend.
The script uses the development MongoDB connection, creates three uniquely named
temporary accounts, and removes exactly those accounts in `finally`. It opens
one browser profile with three role tabs and tests UI login, refresh, reopening,
each role's UI logout, both other roles staying signed in, cross-role API denial,
role-specific bootstrap calls, agent profile/renewal navigation and absence of
JWTs in JavaScript storage. It never saves browser state or prints credentials.
