# HCF Restaurant Operating System (ROS)

A production-grade restaurant management platform (currently running a single outlet, **HCF Azadnagar**, Dhanbad): **Customer →
Ordering → Payment → Token → Kitchen → Preparation → Ready → Pickup/Serve →
Sales.** Built as a TypeScript monorepo (React/Vite web app + Express/MongoDB
API) with real-time order tracking over Socket.IO.

This document covers Part 1, Part 2, **and Part 3 (final)**. Part 3 adds an
owner/admin dashboard, server-side analytics, coupons, customer loyalty,
scheduled orders, party/catering requests, notifications, delivery
management, global search, CSV exports, and production hardening (Redis
caching, signed payment webhooks, HTTPS nginx config, backup scripts) — see
[`docs/PART3.md`](docs/PART3.md) for the full module-by-module writeup, and
[`docs/PART2.md`](docs/PART2.md) / this file's history for Parts 1-2.

Full documentation index: [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) ·
[`API.md`](docs/API.md) · [`DATABASE.md`](docs/DATABASE.md) ·
[`DEPLOYMENT.md`](docs/DEPLOYMENT.md) · [`SECURITY.md`](docs/SECURITY.md) ·
[`BACKUP.md`](docs/BACKUP.md) · [`USER_ROLES.md`](docs/USER_ROLES.md) ·
[`OPERATIONS.md`](docs/OPERATIONS.md) · [`PART2.md`](docs/PART2.md) ·
[`PART3.md`](docs/PART3.md)

---

## 1. Architecture at a glance

```
hcf-restaurant-system/
├── apps/
│   ├── web/     React 18 + TS + Vite + Tailwind — customer ordering app
│   └── api/     Express + TS + MongoDB/Mongoose — REST API + Socket.IO
├── packages/
│   ├── shared/  reserved for a future shared types package (see limitations)
│   └── config/  reserved for shared lint/tsconfig presets
├── docker/      nginx reverse-proxy config
├── docs/        ARCHITECTURE.md, API.md, DATABASE.md
├── docker-compose.yml
└── .env.example
```

Full details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md),
[`docs/API.md`](docs/API.md), [`docs/DATABASE.md`](docs/DATABASE.md).

## 2. Prerequisites

- Node.js 18+
- MongoDB 6+ (local install, Docker, or Atlas) — or use `docker compose up mongo`
- Redis 7+ (optional — only used for menu-read caching; the app runs fine without it, see `docs/PART3.md` "Redis")
- Docker + Docker Compose (optional, for full-stack containerized run)

## 3. Environment variables

Copy `.env.example` to `.env` at the repo root, and adjust as needed:

```bash
cp .env.example .env
```

Key variables (see `.env.example` for the full list and defaults):

| Variable | Purpose |
|---|---|
| `MONGO_URI` | MongoDB connection string for the API |
| `REDIS_URL` | Optional. Unset = caching disabled, app runs normally |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | JWT signing secrets — **must** be changed in production |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | Token lifetimes (default 15m / 7d) |
| `CORS_ORIGIN` | Allowed frontend origin |
| `PAYMENT_PROVIDER` | `MOCK` (see §8 and `docs/SECURITY.md`) |
| `PAYMENT_WEBHOOK_SECRET` | HMAC secret webhooks are signed/verified with — **must** be changed in production |
| `PRINTER_DRIVER` (+ `PRINTER_HOST`, `PRINTER_PORT`, `PRINTER_DEVICE_PATH`, `PRINTER_PAPER_WIDTH`, ...) | Thermal token printer. Default `DISABLED` = browser print. See `docs/PRINTING.md` |
| `VITE_API_BASE_URL` / `VITE_SOCKET_URL` | Frontend → API/socket endpoints |

Never commit a real `.env` file. Secrets are read only from environment
variables server-side and are never sent to the frontend bundle (Vite only
exposes `VITE_*` prefixed variables, and none of those are secrets).

## 4. Local development (without Docker)

```bash
# 1. Install dependencies for both apps
cd apps/api && npm install
cd ../web && npm install

# 2. Start MongoDB locally (or: docker compose up -d mongo)

# 3. Seed the database (outlets, roles, staff, customers, menu, tables)
cd ../api && npm run seed

# 4. Run the API (http://localhost:4000)
npm run dev

# 5. In a second terminal, run the web app (http://localhost:5173)
cd ../web && npm run dev
```

## 5. Running with Docker Compose (full stack)

```bash
docker compose up --build
```

This starts: `mongo` (27017), `api` (4000), `web` (5173, static build served
by nginx), and a root `nginx` reverse proxy (80) that fronts both under one
origin — `/api/*` and `/socket.io/*` go to the API, everything else to the
web app. Seed the database once the containers are healthy:

```bash
docker compose exec api npm run seed
```

## 6. Running tests

```bash
cd apps/api
npm run test
```

Tests use `mongodb-memory-server` (an in-memory MongoDB) so they don't touch
your real database. **Note:** this sandbox's network policy blocked the
one-time MongoDB binary download at build time, so the suite could not be
executed end-to-end in this environment — `npx tsc --noEmit` passes cleanly
and both test files were reviewed manually. Run `npm run test` in an
environment with normal internet access (or a locally cached
`mongodb-memory-server` binary / `MONGOMS_SYSTEM_BINARY` pointing at an
installed `mongod`) to execute them.

## 7. Test credentials (seeded)

**Staff** (email + password; HCF runs from one outlet, **HCF Azadnagar**):

| Role | Email | Password |
|---|---|---|
| OWNER | `owner@hcf.example` | `Passw0rd!123` |
| MANAGER | `manager.azadnagar@hcf.example` | `Passw0rd!123` |
| CASHIER | `cashier.azadnagar@hcf.example` | `Passw0rd!123` |
| KITCHEN | `kitchen.azadnagar@hcf.example` | `Passw0rd!123` |
| INVENTORY | `inventory.azadnagar@hcf.example` | `Passw0rd!123` |
| DELIVERY | `delivery.azadnagar@hcf.example` | `Passw0rd!123` |

Staff sign in at **`/staff/login`** in the web app, which routes to `/pos`,
`/kds`, or `/inventory/*` depending on their permissions (the nav bar only
shows what a given role can access — enforced again, authoritatively, on the
server).

**Customer** (mobile + OTP): `9876543210` — request an OTP via
`POST /api/v1/auth/customer/otp/request`; in development the OTP is returned
in the response body and also printed to the API server console (no SMS
provider is wired up — see §8).

## 7a. HCF Azadnagar setup, delivery details, token printing, dashboard reset

**Single outlet.** `npm run seed` creates exactly one outlet: **HCF Azadnagar** -
Azadnagar, Dhanbad, Jharkhand - open **10:00 AM - 11:00 PM**. The customer app selects it
automatically (no outlet picker). Update its phone/email in *Admin -> Outlet Settings*.
Already running the old three-outlet database? Run this once (safe to repeat):

```bash
npm run migrate:single-outlet
```

It converts the old Bank More outlet into HCF Azadnagar **in place** (menu, tables, inventory and
order history are kept), retires the other two outlets (soft-delete, nothing hard-deleted), points
all staff at the single outlet, renames `@hfc.example` staff logins to `@hcf.example`, grants the new
permissions to the existing roles, and lists staff who only worked at closed outlets so you can
deactivate them. **Everyone signs in again once afterwards.**

**Delivery needs a name + address first.** When a customer chooses *Delivery* (on the home page,
from the cart, or at checkout) the app checks that they are signed in and have a saved name and
address. If not, they are sent to the *Delivery details* page, then return to where they were.
Saved addresses can be picked, edited or removed at checkout and on the Account page. The check
lives in `GET /customers/me` (`delivery.ready` / `delivery.missing`).

**Token printing** (Owner, Manager, Cashier - permission `tokens.print`): a *Print Token* button
on every order (Current Orders) and in the POS (with an optional *Auto-print token* switch).
Works immediately through the browser print dialog; connect a thermal printer by setting
`PRINTER_*` variables in the API environment - see **[docs/PRINTING.md](docs/PRINTING.md)**.
*Admin -> Printer* shows the connection, prints a test slip and lists recent prints.

**Reset dashboard** (Owner only - permission `dashboard.reset`): *Admin -> Dashboard -> Reset
dashboard* asks for the owner's password (verified on the server; 5 wrong tries lock it for 15
minutes) and then the dashboard counts from zero. **Nothing is deleted** - orders, payments,
Analytics and exports keep the full history; every reset is written to the audit log.

## 8. Known Limitations

Grouped by phase for traceability. Nothing here is a silent gap — every
item below has a real, working architecture behind it with one specific
piece deliberately deferred, documented so the next phase (or a real
integration) knows exactly what to plug in.

**From Part 1:**

- **SMS/Email delivery is mocked.** Customer OTP and staff password-reset
  tokens are generated, hashed, and expiry-checked exactly as a production
  system would, but instead of calling an SMS/email provider they are
  logged to the API server console (OTP is also returned in the API
  response outside production, so the flow is testable end-to-end).
- **`packages/shared` is a placeholder** — type contracts are hand-duplicated
  between `apps/api/src/types`/`models` and `apps/web/src/types/domain.ts`.
- **Delivery distance pricing is flat**, not distance/route-calculated.

**From Part 2:**

- **No multi-document ACID transaction for stock deduction.** Ingredient
  consumption is idempotent (guaranteed by `InventoryLedger`'s unique
  index) but applied per-ingredient rather than inside a MongoDB session
  transaction, because that requires a replica set and this project's
  `docker-compose` MongoDB is a standalone instance. See `docs/PART2.md`
  §6 for the full reasoning.
- **Recipe unit conversion is mass/volume only** (kg↔g, litre↔ml) — a
  recipe and its inventory item must use the exact same count unit
  (piece/packet/box).
- **No printer/ESC-POS hardware integration** — the printable-receipt
  architecture (`GET /orders/:id/receipt`) returns structured data; the POS
  calls the browser's native `window.print()` on it rather than talking to
  a thermal printer driver.
- **KDS sound notification** is a plain Web Audio tone, not a configurable
  sound library.

**From Part 3:**

- **Payment gateway is still the mock provider**, now with a real,
  HMAC-verified webhook path and split/partial payments. No real Indian
  payment gateway (Razorpay/PhonePe/etc.) credentials are wired in —
  swapping one in means implementing `PaymentProvider` once (see
  `services/payment/`) and switching the webhook route to raw-body
  verification (see `docs/SECURITY.md`).
- **Loyalty tiers, birthday offers, and referral bonuses are not built.**
  The ledger and config architecture (`LoyaltyConfig`, `LoyaltyTransaction`)
  is deliberately shaped so these can be added without a schema migration,
  but the actual rules engines for them are a future phase.
- **Coupon and outlet-change events are not yet audit-logged.** Every other
  sensitive action from the spec's audit list is
  (`AuditService`/`AuditAction` already support adding these two — see
  `docs/PART3.md` §17).
- **Payment-failure and delayed-order notifications aren't wired to fire
  automatically.** The `NotificationType` values and `NotificationService`
  support them; nothing currently calls `NotificationService.send` at those
  two trigger points.
- **Party/catering "convert to order" has no dedicated order-builder UI.**
  The API (`POST /party-orders/:id/convert`) is fully functional — a staff
  member supplies real menu-item line items which are priced and
  stock-checked exactly like any POS order — but the admin page doesn't yet
  have a mini cart-builder wired to that specific action (it's reachable via
  the API/Postman/a follow-up UI pass, not via a button in
  `PartyOrdersPage.tsx` today).
- **Push notifications and WhatsApp/SMS are console-logging placeholders**,
  matching the same honest pattern as OTP delivery — the `NotificationProvider`
  interface is implemented and ready for a real vendor (FCM, WhatsApp
  Business API, Twilio/MSG91) to be swapped in.
- **No dedicated admin "customer detail" page** showing one customer's full
  order history, coupon usage, and loyalty ledger together — the individual
  APIs for all three exist (`GET /customers/me/orders` pattern extended to
  staff would need a small addition), but there's no single staff-facing
  screen presenting them side by side yet.
- **CI/CD pipeline is not configured** — see `docs/OPERATIONS.md` for what a
  minimal one should check before this project scales past one contributor.
- **Rate limiting is per-process, not Redis-backed**, since a single-instance
  deployment (this project's default) doesn't need a shared store — see
  `docs/SECURITY.md` for how to add `rate-limit-redis` if you scale
  horizontally.

## 9. Test results

`npx tsc --noEmit` (API) and `npx tsc -b` + `npx vite build` (web) all pass
cleanly with zero errors after Parts 1, 2, and 3. The Vitest suite
(`npm run test` in `apps/api`) could not be executed end-to-end **in this
sandbox** because `mongodb-memory-server` needs to download a MongoDB binary
from `fastdl.mongodb.org`, which this environment's network allowlist
blocks — confirmed via the exact download error, not a silent skip. Every
test file was reviewed by hand for correctness. Run `npm run test` in an
environment with normal internet access (or `MONGOMS_SYSTEM_BINARY` pointed
at a locally installed `mongod`) to execute:

- `pricing.service.test.ts` — server-side price recalculation, coupon, unavailable-item rejection (Part 1)
- `order.integration.test.ts` — staff login, order creation, bogus-outlet rejection (Part 1)
- `inventory.test.ts` — ledger atomicity + idempotency, recipe cost/margin with unit conversion, idempotent stock deduction, availability checks, purchase-completion stock increase, wastage stock decrease (Part 2)
- `orderStatus.integration.test.ts` + `unit/*.unit.test.ts` — the order/payment/delivery state machines (see `docs/ORDER_STATUS.md`)
- `fullFlow.integration.test.ts` — full POS→KDS→completion→inventory-deduction lifecycle over HTTP, plus permission-restriction tests (KITCHEN blocked from suppliers, CASHIER blocked from recipes, INVENTORY blocked from users) and a stock-shortage-with-manager-override test (Part 2)

No new automated test file was added specifically for Part 3's growth
features (coupons/loyalty/scheduling/party orders) in this delivery — the
checkout-path wiring (coupon validation, loyalty redeem/earn) reuses the
same `PricingService`/`OrderService` code paths already covered by the
Part 1/2 tests above, but dedicated coupon-rule-matrix and loyalty-ledger
tests analogous to `inventory.test.ts` are a recommended follow-up (see
"Recommended future improvements" in the final delivery summary).

## 10. Production readiness summary

See the end of this project's delivery message for the full "Features
completed / Database models / API modules / Socket events / Frontend
routes / User roles / Security measures / Tests completed / Build status /
Docker services / Deployment instructions / Known limitations / Recommended
future improvements" report, and the full documentation set linked at the
top of this file for the module-by-module detail behind each line of that
report.
