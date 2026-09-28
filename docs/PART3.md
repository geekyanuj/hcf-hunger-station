# Part 3 - Management, Analytics, Growth and Production Hardening

Part 3 turns the platform from "an outlet can run on this" (Parts 1-2) into
"a multi-outlet business can be managed on this" - an owner-facing admin
dashboard, real analytics, coupons/loyalty/scheduling/catering, delivery and
notification workflows, and a production-grade deployment/security/backup
story. Same monorepo, same auth/RBAC/socket architecture as before.

## 1. Admin Dashboard

`GET /dashboard/overview?outletId=<id>|ALL` (`dashboard.service.ts`) combines
Today's Overview (sales, orders, AOV, per-order-type counts), Kitchen
(reuses `KitchenService.workload`), Inventory (reuses
`InventoryDashboardService.summary`), and Sales (best-selling item, best
category, 7-day revenue trend) into one call. `outletId=ALL` is only honored
for OWNER accounts (`resolveOutletScope` in `reportScope.util.ts`) - a
MANAGER's request silently falls back to their own assigned outlet(s), and
an explicit request for an outlet they don't have access to is rejected with
403. The frontend (`AdminDashboardPage.tsx`) shows an ALL-OUTLETS / per-outlet
toggle only to OWNER accounts.

## 2. Analytics

Ten server-side aggregation endpoints under `/analytics/*`
(`analytics.service.ts`): revenue over time, order-type distribution, top
products, category performance, payment method breakdown, purchase trend,
wastage trend, food cost, outlet performance, staff performance. Every one
is a MongoDB aggregation pipeline - nothing is computed by pulling raw
documents into Node and reducing in JavaScript, per the spec's "use
server-side aggregation" requirement. Date range filters (today, yesterday,
last7days, last30days, or explicit from/to) and outlet scoping are handled
by the same `reportScope.util.ts` helper the dashboard uses. The frontend
(`AnalyticsPage.tsx`) renders these with recharts: line charts for
revenue/wastage trends, a pie chart for order-type distribution, bar charts
for top products and category performance.

Food cost is an approximation, not an exact historical figure: it values
each SALE_CONSUMPTION ledger entry at the ingredient's *current*
costPerUnit rather than the price that was actually in effect when that
entry was written (the ledger doesn't snapshot cost-at-time-of-consumption).
For a restaurant where ingredient costs don't swing wildly week to week this
is a reasonable estimate; documented here rather than silently presented as
exact.

## 3. Multi-outlet management

Every operational Part 1/2 collection already carried outletId (menu,
inventory, orders, etc). Part 3's job was making the reporting layer
outlet-aware in the same way: `resolveOutletScope` is the single chokepoint
every analytics/dashboard/search/export endpoint goes through, so "Owner can
select ALL OUTLETS... Managers should normally only access assigned
outlet(s)" is enforced once, server-side, rather than re-implemented per
endpoint.

## 4. Outlet settings

Extended Outlet.settings (Part 1/2 already had tax/charges/kitchen
capacity/token policy): logoUrl, holidays[], scheduledOrderReleaseWindowMinutes,
scheduledOrdersPerSlotCapacity, notificationSettings. All configurable per
outlet via PATCH /outlets/:id, surfaced in OutletSettingsPage.tsx. Tax
remains a plain configurable percentage (taxPercentage), never a hard-coded
GST constant anywhere in pricing.service.ts.

## 5. Table management

Table gained a status field (AVAILABLE | OCCUPIED | RESERVED | INACTIVE) on
top of Part 1's QR/capacity fields. Status is both staff-editable
(PATCH /tables/:id) and automatically managed by the order lifecycle:
OrderService.create sets a dine-in table to OCCUPIED the moment an order is
placed against it, and OrderService.updateStatus releases it back to
AVAILABLE once every order at that table has reached COMPLETED or
CANCELLED - a staff member doesn't have to remember to do this by hand
(though they still can, e.g. to mark a table RESERVED ahead of a booking).

## 6. Staff management

Part 1/2 already had staff CRUD; Part 3 adds admin-forced
POST /users/:id/reset-password (distinct from the self-service
forgot-password flow - this one doesn't require knowing the old password,
only users.manage), and every role/outlet change is audit-logged
(USER_PERMISSION_CHANGE, already wired in Part 2, still fires here).

## 7. Coupons and offers

Coupon + CouponRedemption (coupon.service.ts) implement every rule from the
spec: min order value, max discount cap, flat/percent, specific menu
items/categories/outlets, new-customer-only, valid weekdays, start/expiry
dates, total usage limit, per-customer usage limit. CouponService.validate
is the single function both PricingService.priceCart (cart preview) and
OrderService.create (actual order) call - a customer sees the exact
discount they'll get before committing, and the server recomputes and
re-validates everything at order time rather than trusting the preview.
Redemption is recorded (CouponRedemption, unique per order) and the
coupon's totalRedemptions counter incremented only once an order is
actually created, never on preview.

## 8. Customer loyalty

LoyaltyConfig (global or per-outlet override) + LoyaltyTransaction
(append-only ledger, same idempotency pattern as Part 2's
InventoryLedger). Nothing about the earn rate, redemption value, minimum
redeemable balance, or max-redemption-percentage-of-order is hard-coded -
loyalty.service.ts reads all of it from LoyaltyConfig. Points are reserved
(debited) at order-creation time so they can't be spent twice while an
order is pending, refunded automatically if the order is cancelled, and
credited (idempotently - guarded by the ledger's unique (orderId, type)
index, exactly like inventory consumption) on the same "order genuinely
fulfilled" trigger as stock deduction. Customer.loyaltyPoints is a
denormalized cache that only LoyaltyService is allowed to write, always
alongside a ledger entry.

Future-ready, not yet built: tiers, birthday offers, and referral bonuses
are explicitly not implemented - the ledger and config shape were designed
so they can be layered on without a schema migration (a tier is just
another field read at earn/redeem time; a referral bonus is just another
LoyaltyTransaction type), but building the actual rules was out of scope
for this phase. See README "Known Limitations".

## 9. Customer management

Existing Customer model (Part 1) plus everything Part 3 adds sits on top of
it: loyaltyPoints, coupon redemption history (queryable via
CouponRedemption.find({ customerId }), not yet surfaced in a dedicated
admin customer-detail page - see limitations), and the global search index.
Customer data export (GET /exports/customers.csv) is gated behind
customers.manage, not general staff access, per the spec's "do not expose
unnecessary personal information."

## 10. Scheduled orders

SchedulingService.validateSlot (called from OrderService.create whenever
scheduledAt is present) rejects a requested time that's less than 10
minutes out, more than 7 days out, or falls in a 15-minute slot that's
already at the outlet's configured scheduledOrdersPerSlotCapacity.
Critically, a scheduled order does not appear on the KDS board immediately
- KitchenService.board filters PENDING/CONFIRMED orders by
SchedulingService.isReleasedToKitchen, which only returns true once the
order is within scheduledOrderReleaseWindowMinutes of its target time (an
ASAP order is always released immediately). Orders still waiting are
returned in a separate `scheduled` bucket so the KDS can show "5 upcoming"
without treating them as actionable.

## 11. Party / catering orders

PartyOrder (partyOrder.service.ts) implements the full spec workflow:
REQUESTED -> CONTACTED -> QUOTED -> APPROVED/REJECTED -> CONVERTED, with a
quotations[] history (not just a single overwritable quote - every revision
is kept). Submitting a request notifies every OWNER/MANAGER at the target
outlet via NotificationService. Converting an approved quotation to a real
Order (orderType: 'CATERING') goes through the exact same OrderService.create
path as every other order - the quoted amount doesn't bypass pricing/stock
integrity; a staff member supplies the actual line items (bulk/combo menu
items) that make up the catering order, and the server recomputes real
totals from them, same as any POS order.

## 12. Notifications

Notification model + a real provider architecture (services/notification/):
NotificationProvider interface, InAppProvider (persists + Socket.IO push -
fully working), and console-logging placeholders
PushProvider/WhatsAppProvider/SMSProvider - the same honest "architecture
without a paid vendor" pattern already used for OTP delivery in Part 1.
NotificationService.send fans out across whichever channels are requested
(default [IN_APP, SOCKET]). Every customer order-status transition fires a
notification (ORDER_CONFIRMED -> ORDER_DELIVERED); admin-side, low/out-of-stock
(Part 2's inventory:low/inventory:out events) and new party requests are
wired. Not wired: payment-failure and delayed-order notifications exist as
NotificationType values and the NotificationService can send them, but
nothing currently calls it for those two triggers - see README "Known
Limitations". Every authenticated socket auto-joins its own
user:<id>/customer:<id> room on connect, so no separate subscribe handshake
is needed for the notification bell.

## 13. Delivery management

**Superseded by `ORDER_STATUS.md`:** ASSIGNED and PICKED_UP are no longer
order statuses — they are `deliveryStatus` values tracked separately from
`orderStatus` (delivery.service.ts + services/orderStateMachine.ts). A manager assigns a READY delivery order to an active
DELIVERY-role staff member (POST /delivery/:orderId/assign); the rider's own
queue (GET /delivery/my-orders) is scoped by a database query, not a
frontend filter - a DELIVERY account's token simply can't retrieve another
rider's orders regardless of what the client asks for.

## 14. Search

GET /search?q= (search.service.ts) fans a regex query out across seven
collections in parallel, but - critically - only includes a section the
requester actually holds the permission for: a CASHIER's search results
never contain supplier or staff records even though the underlying query
would technically match them, because orders.read/customers.manage/
inventory.read/suppliers.manage/users.manage are each checked before that
section's query even runs.

## 15. Exports

GET /exports/{orders,inventory,purchases,wastage,customers}.csv
(export.controller.ts + a small dependency-free utils/csv.ts serializer)
stream a CSV with Content-Disposition: attachment. The frontend downloads
via an authenticated axios blob request rather than a plain <a href> link,
specifically so the JWT stays in the Authorization header rather than being
exposed in a URL (browser history, server access logs, etc).

## 16. Dashboard UX

Sidebar-free, top-nav layout (consistent with Parts 1-2's StaffLayout):
outlet selector, global search, notification bell, and role-gated nav links
(POS/KDS/Inventory/Delivery/Admin) live in one header, with sub-navigation
tabs for the Inventory and Admin sections (InventoryLayout.tsx,
AdminLayout.tsx - the same "tabbed sub-section" pattern from Part 2's
inventory pages, reused rather than reinvented). All new pages reuse the
existing Card/Badge/Button/Modal/Input UI kit and brand tokens (brand-*,
ink-*, font-display) from Part 1 - no new design system was introduced.

## 17. Audit and security

AuditLog (Part 2) now also fires on staff-forced password resets. Every
sensitive admin action from the spec (login/logout, permission changes,
menu/price changes, inventory changes, refunds, cancellations, coupon
changes, outlet changes) maps to an existing AuditAction except explicit
login/logout and coupon/outlet-change events - coupon and outlet changes are
not yet audit-logged (see README "Known Limitations"; the AuditService and
AuditAction enum are ready for it, it's a few call-site additions away, not
a missing subsystem).

## 18. Production security review

- Payment webhooks: real HMAC-SHA256 signature verification
  (utils/webhookSignature.ts) - a request without a valid signature is
  rejected with 401 before it ever reaches PaymentService. A
  staff-authenticated /payments/dev/simulate-webhook route exists purely to
  exercise the async payment path against the mock provider (403's for any
  real PAYMENT_PROVIDER).
- CORS: already restricted to a single configured origin (CORS_ORIGIN)
  since Part 1; unchanged and reviewed.
- Rate limiting: express-rate-limit on all routes plus a stricter limiter
  on auth endpoints (Part 1); Redis is available to back a shared store for
  a multi-instance deployment (not wired by default - see
  docs/SECURITY.md).
- Injection: mongo-sanitize strips operator injection from
  body/params/query (Part 1); every Mongoose query in this codebase uses
  the driver's parameterized query builders, never raw string
  interpolation into a query.
- XSS: React escapes all rendered content by default; no
  dangerouslySetInnerHTML is used anywhere in the frontend.
- CSRF: not applicable in the traditional sense - this API is a pure JSON
  API consumed with Authorization: Bearer tokens (no cookie-based
  session), so there's no ambient credential for a forged cross-site
  request to ride on.
- Secrets: never sent to the frontend (Vite only bundles VITE_* variables,
  none of which are secret); .env.example documents every variable without
  real values.
- Insecure file uploads: none exist in this project - logoUrl and menu
  images[] are plain string URL fields, not file upload endpoints, so
  there is no upload-handling attack surface to secure (or to leave
  insecure).
- Full checklist and reasoning: docs/SECURITY.md.

## 19. Performance

- MongoDB indexes: every new Part 3 collection has purpose-built indexes
  (see docs/DATABASE.md) - Coupon.code unique, CouponRedemption.orderId
  unique, LoyaltyTransaction compound + idempotency-unique index,
  PartyOrder by outlet+status+date, Notification by principal+read-state.
- Pagination: every new list endpoint (coupons excepted, since the coupon
  list is expected to stay small - a handful to a few dozen active
  promotions) follows the existing page/limit convention.
- Redis caching: see "Redis" below - one concrete, justified use case, not
  a blanket cache-everything layer.
- React rendering: modal-hoisting fixes from Part 2 (components defined at
  module scope, not inside a parent's render body, to avoid remount-on-
  every-keystroke) were carried forward into every new Part 3 form.
- Socket.IO: rooms are scoped per-order/per-outlet/per-principal rather
  than broadcasting globally, so a large deployment's event volume stays
  proportional to what each connected client actually needs.

## Redis - what it's for and what it isn't

Per the explicit instruction not to add Redis without purpose: it backs
exactly one thing, GET /menu response caching (config/redis.ts,
utils/cache.ts), invalidated on every menu write. It is not used for
sessions (this API is stateless/JWT), not used for a job queue (there is no
job queue in this project - nothing here needed one), and the API degrades
to direct MongoDB reads with zero functional loss if Redis is stopped.
docker-compose.yml includes it as a proper service with a health check; it
is not a hard startup dependency of api (only a depends_on ordering hint,
not a fatal MONGO_URI-style requirement).

## 20. Error handling

Every new page follows the same loading/empty/error pattern established in
Parts 1-2 (isLoading skeletons, explicit "no results" copy, toast-based
error surfacing via useToast). The backend's centralized error handler
(middleware/errorHandler.ts, Part 1) and structured logging (winston,
Part 1) are unchanged and still the single error path every new
controller/service routes through via asyncHandler + ApiError.
