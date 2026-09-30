# Security

This document covers the security posture of HCF ROS as of Part 3, and is
written to be read alongside the code it describes rather than as a
standalone claim.

## Authentication

- Staff: email + argon2id-hashed password. Customer: mobile + OTP (6-digit,
  argon2-hashed, 5-minute expiry).
- Access tokens are short-lived JWTs (15 min default). Refresh tokens are
  opaque random strings; only their SHA-256 hash is stored
  (RefreshToken.tokenHash), so a database leak alone cannot be used to mint
  new sessions. Every /auth/refresh call rotates the token (old one
  revoked, new one issued).
- Socket.IO connections authenticate the same JWT via
  socket.handshake.auth.token - see sockets/index.ts.

## Authorization

- Permission-based, not role-name-based: authorize('orders.update') checks
  a token's embedded permission list, resolved from the Role collection at
  login time. See config/permissions.ts for the full list and
  docs/USER_ROLES.md for what each role can/cannot do.
- Never trust the frontend for authorization. Every permission check that
  matters happens in Express middleware or inside a service function, never
  only in a React component's conditional render. The frontend's
  role-based nav hiding is explicitly documented as non-authoritative in
  utils/jwt.ts's own comment - the server re-checks everything.
- Outlet scoping: requireOutletScope middleware (Part 1) and
  resolveOutletScope (Part 3, for reporting endpoints) both enforce that
  non-OWNER staff can only act on/see their assigned outlet(s).

## Injection and input validation

- Every mutating route validates its body with a Zod schema
  (middleware/validate.ts) before touching the database.
- mongo-sanitize strips operator-injection characters from
  req.body/req.params/req.query globally (middleware/security.ts).
- All Mongoose queries use the driver's parameterized query builders - this
  codebase does not construct query objects from unsanitized string
  concatenation anywhere.

## XSS

React escapes all interpolated content by default. dangerouslySetInnerHTML
is not used anywhere in apps/web. User-supplied text (order notes, wastage
notes, coupon descriptions, etc.) is always rendered as text content, never
as HTML.

## CSRF

Not applicable in the traditional sense: this is a stateless JSON API
authenticated via Authorization: Bearer headers, not cookies - there is no
ambient browser credential a forged cross-origin request could ride on. If
a future phase adds cookie-based session auth, CSRF tokens should be added
at that point.

## CORS

cors() middleware is configured with a single allowed origin (CORS_ORIGIN
env var), not a wildcard. In production, set this to your actual frontend
origin(s); do not set it to *.

## Rate limiting

- Global rate limiter on all routes (express-rate-limit, configurable via
  RATE_LIMIT_WINDOW_MS/RATE_LIMIT_MAX).
- A stricter limiter on /auth/* endpoints specifically, to slow down
  credential-stuffing/brute-force attempts.
- Multi-instance note: express-rate-limit's default in-memory store is
  per-process. If you scale the API horizontally, point it at a shared
  store instead - rate-limit-redis against the same Redis instance already
  provisioned for menu caching would be the natural choice; this is not
  wired by default in Part 3 because a single-instance deployment (this
  project's default docker-compose) doesn't need it.

## Payment webhook security

Webhooks are HMAC-SHA256 signed (PAYMENT_WEBHOOK_SECRET) and verified with
a timing-safe comparison (utils/webhookSignature.ts) before any payment
status is trusted. Scoped limitation: the signature is computed over the
JSON-stringified parsed body rather than the exact raw request bytes,
because this project's Express app uses express.json() globally. A real
gateway integration should switch the webhook route specifically to
express.raw({ type: 'application/json' }) and verify against the exact
bytes the gateway signed. PaymentService never sets paymentStatus: 'PAID'
from a client-supplied value under any code path - only CASH (synchronous,
staff-witnessed) or a verified webhook can do that.

## Secrets and environment variables

- No secret is ever sent to the frontend. Vite only bundles VITE_* prefixed
  variables into the client build, and none of those are secrets.
- .env.example at the repo root documents every variable without real
  values. .env itself is git-ignored.
- JWT secrets, the Mongo root password, and the payment webhook secret all
  have insecure development defaults in env.ts purely so the app boots
  without configuration in local dev - every one of these MUST be
  overridden with a strong, randomly-generated value in production.

## File uploads

There are no file upload endpoints in this project. Menu item images and
outlet logos are plain string URL fields that staff populate with a link to
an already-hosted image - there is no multipart upload handler and
therefore no path-traversal/arbitrary-file-write/unrestricted-file-type
surface to secure. If a future phase adds direct image upload, use a
dedicated object-storage service (S3-compatible) with server-side
validation rather than writing to local disk.

## Sensitive data exposure

- Password hashes (User.passwordHash, Customer.otpHash,
  User.passwordResetTokenHash) are select: false in their schemas - a
  normal find()/findOne() never returns them.
- Customer data exports are gated behind customers.manage, not general
  staff read access.
- A DELIVERY-role account can only ever query its own assigned orders
  (filtered by deliveryStaffId in the database query itself), so customer
  address/phone for orders it isn't handling is never returned to it.

## Known gaps (honestly stated)

- No Web Application Firewall / DDoS mitigation layer is configured - that
  is an infrastructure-level concern outside this application's code.
- No automated dependency vulnerability scanning is wired into a CI
  pipeline, because there is no CI pipeline configured in this repository -
  see docs/OPERATIONS.md.
- No security headers beyond Helmet's defaults and the HSTS/X-Frame-Options/
  X-Content-Type-Options set explicitly in docker/nginx.prod.conf - a full
  Content-Security-Policy is not defined, since it needs to be hand-tuned
  against the actual production asset hosts.
