# Architecture — HFC Restaurant OS (Part 1)

## 1. High-level flow

```
Customer (web/QR) ──┐
                     ├─► POST /orders ──► PricingService (server-side price recalculation)
Staff POS ───────────┘                 ├─► PrepTimeEstimationService (dynamic min–max range)
                                        ├─► TokenService (order number + T-/D-/O- queue token)
                                        └─► Order saved ──► Socket.IO emit ──► KDS + customer tracking screen

Order status changes (staff/KDS) ──► OrderService.updateStatus ──► Socket.IO emit ──► customer tracking screen

Payment (CASH/UPI/CARD/ONLINE) ──► PaymentService ──► PaymentProvider (Mock in Part 1) ──► webhook confirms ──► Order.paymentStatus
```

## 2. Clean architecture layering (API)

```
routes/         → wiring only: path + middleware chain + controller method
controllers/    → parse req, call service, shape res (no business logic)
services/       → all business logic (pricing, tokens, prep-time, auth, orders...)
models/         → Mongoose schemas (persistence + validation only)
middleware/     → cross-cutting concerns (auth, authorize, validate, errors, security)
validators/     → Zod schemas, one file per resource
utils/          → pure helpers (ApiError, tokenUtils, password, format)
sockets/        → Socket.IO room management + emit helpers
```

Controllers never touch Mongoose models directly except in a couple of
lightweight, single-collection admin endpoints (`table.controller.ts`,
`user.controller.ts`) where introducing a service would be pure ceremony —
everything with actual business rules (pricing, orders, tokens, auth,
payments) goes through a service.

## 3. Multi-outlet design

Every operational document (`MenuCategory`, `MenuItem`, `Modifier`, `Table`,
`Order`, `Payment`, `Token`) carries an `outletId`. There is no global menu —
`GET /api/v1/menu?outletId=...` is required. Order numbers and queue tokens
are sequenced per-outlet (via the `Counter` collection keyed by
`ORDER:<outletId>` / `TOKEN:<series>:<outletId>:<date>`), so adding a 4th,
5th, Nth outlet requires zero code changes — only a new `Outlet` document
plus its menu/tables.

Staff `User` documents hold `outletIds: ObjectId[]`. The JWT access token
embeds the resolved `outletIds` and `permissions` at login time (see §5), and
`requireOutletScope` middleware enforces that non-OWNER staff can only act on
outlets they're assigned to.

## 4. Domain entities and relationships

```
Outlet 1───* MenuCategory 1───* MenuItem *───* Modifier
Outlet 1───* Table
Outlet 1───* Order *───1 Customer
Order 1───* OrderItem (embedded, not a separate collection — see §7)
Order 1───* Payment
Order 1───1 Token (audit record; the display value is also cached on Order.tokenNumber)
Role 1───* User (role stored on User as a string FK to Role.name; permissions resolved from Role at login)
```

Full field-by-field schemas: see [`DATABASE.md`](DATABASE.md).

## 5. Authentication & RBAC

- **Two independent principal types**: `STAFF` (email+password) and
  `CUSTOMER` (mobile+OTP). A single `authenticate` middleware verifies either
  and attaches `req.auth: AccessTokenPayload` (a discriminated union on
  `type`). `requireStaff` / `requireCustomer` narrow further where needed.
- **Access tokens are short-lived JWTs** (15 min default) containing, for
  staff, the *resolved* permission list (not just the role name) — so
  authorization checks never need a database round-trip.
- **Refresh tokens are opaque random strings**, not JWTs. Only a SHA-256
  hash is stored (`RefreshToken.tokenHash`), so a database leak alone can't
  be used to mint sessions. Each `/auth/refresh` call **rotates** the token:
  the old one is marked `isRevoked`, a new one issued. Session/device
  metadata (`userAgent`, `ipAddress`) is stored per refresh token, which is
  the seed of a "log out all devices" feature (not built in Part 1, but the
  data model supports it: revoke all `RefreshToken`s for a `principalId`).
- **Authorization is permission-based**, not role-name-based:
  `authorize('orders.update')` checks the token's embedded permission set.
  `config/permissions.ts` defines the canonical permission list and default
  role→permission mapping, seeded into the `Role` collection so an OWNER
  could edit a role's permissions later without a code deploy (editing UI
  not built in Part 1 — it's a document update away).
- **Password hashing**: argon2id (`utils/password.ts`).
- **Forgot/reset password**: real hashed, expiring, single-use tokens
  (`User.passwordResetTokenHash` / `passwordResetExpiresAt`); delivery is
  mocked to console (see README §8).

## 6. Dynamic preparation-time estimation

`services/prepTimeEstimation.service.ts` is intentionally isolated behind one
function (`PrepTimeEstimationService.estimate`) so the algorithm can be
replaced later without touching order creation code. Current algorithm:

1. **Base time** = slowest single item's `preparationTimeMinutes` (kitchen
   stations work items in parallel) + a capped per-extra-item allowance.
2. **Kitchen load** = count of `PENDING|CONFIRMED|PREPARING` orders at the
   outlet right now; minutes are added only for orders *beyond*
   `outlet.settings.kitchenCapacityPerSlot`.
3. **Rush multiplier** = if the reference time (now, or `scheduledAt` for
   scheduled orders) falls in a configured lunch/dinner window, load minutes
   are multiplied by `outlet.settings.rushMultiplier`.
4. **Order-type adjustment**: dine-in is slightly faster (no
   packaging/handoff), delivery gets a small buffer.
5. Returns a **range** (`minMinutes`–`maxMinutes`), never a single number.

## 7. Why `OrderItem` is embedded, not a separate collection

The spec lists `OrderItem` as an entity. In Part 1 it's implemented as an
**embedded subdocument array** on `Order` (`Order.items[]`) rather than a
separate top-level collection with its own `_id` references, because:

- Order items are never queried independently of their order (no "find all
  order items for menu item X across all orders" use case in Part 1).
  Reports that need this later can use MongoDB's `$unwind` aggregation
  directly against `Order.items`.
- Every field on an order item (`name`, `unitPrice`,
  `preparationTimeMinutes`, `selectedModifiers[].optionName`/`priceDelta`)
  is a **snapshot at order time** — if the menu item's name or price changes
  tomorrow, historical orders must still show what the customer actually
  paid. Embedding makes "snapshot, not live reference" the natural default;
  a separate collection would need the same snapshotting discipline anyway.
- Atomicity: an order and its line items are always written together in one
  `Order.create()` call — no multi-document transaction needed for the
  common path.

If Part 2 needs cross-order item analytics at scale, this can be
revisited without breaking the API contract (the embedded shape is what
`GET /orders/:id` already returns).

## 8. Payment abstraction

```
PaymentProvider (interface)
 ├─ createPayment(orderId, amount, method) → { providerReferenceId, status, redirectUrl? }
 ├─ verifyPayment(providerReferenceId) → { status }
 ├─ refundPayment({ providerReferenceId, amount }) → { status, refundReferenceId }
 └─ handleWebhook(rawBody, signature?) → { providerReferenceId, status }

MockPaymentProvider implements PaymentProvider
 - CASH → SUCCESS immediately
 - UPI/CARD/ONLINE → INITIATED, then confirmed via POST /payments/webhook
   (mirrors a real gateway's async confirm-by-webhook flow)
```

`payment.service.ts` never lets a client directly set `Order.paymentStatus`
to `PAID` — that only happens (a) synchronously for CASH, or (b) via the
webhook handler, which is the single source of truth for non-cash payment
confirmation, per the "never trust client-side payment success" requirement.

Razorpay Payment Links and Juspay hosted checkout implement `PaymentProvider`
and are selected with `PAYMENT_PROVIDER`. Razorpay handles signed webhook
settlement and refunds. Juspay callbacks trigger a server-side status query;
Juspay refunds remain unimplemented.

## 9. Real-time updates (Socket.IO) with polling fallback

- Customers join room `order:<orderId>` (via `socket.emit('order:subscribe', orderId)`
  from the tracking page).
- Kitchen/outlet staff join room `kds:<outletId>`.
- `OrderService.updateStatus` and `PaymentService` emit
  `order:status_update` / `order:payment_update` to the relevant order room,
  and `kds:order_update` / `kds:new_order` to the outlet's KDS room.
- The frontend's `OrderTrackingPage` uses TanStack Query's `refetchInterval`
  as an automatic fallback: it polls every 8s **only** while
  `socket.connected` is false, satisfying "if Socket.IO disconnects,
  frontend should fall back to polling."

## 10. Security measures implemented

Helmet, CORS allow-list, global + auth-specific rate limiting
(`express-rate-limit`), Zod request validation on every mutating route,
Mongo-operator-injection stripping (`mongo-sanitize`) on body/params/query,
argon2 password hashing, short-lived JWTs + rotated hashed refresh tokens,
permission-based authorization middleware, `.env`-only secrets (never sent to
the frontend — Vite only bundles `VITE_*` vars, none of which are secret),
and an order `statusHistory` audit trail (who changed what, when).

## 11. Known Limitations & Part 2

See [`README.md` §8](../README.md#8-known-limitations-part-1) for the full,
itemized list (mocked SMS/payment, single demo coupon, no inventory/reports
module, no staff dashboard UI, etc.) and the delivery message's "Part 2 Plan"
section for sequencing.
