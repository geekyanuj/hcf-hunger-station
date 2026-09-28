# API Documentation — HFC Restaurant OS (Part 1)

Base URL: `http://localhost:4000/api/v1` (dev) — all routes below are
relative to this. Health check (unversioned): `GET /health`.

## Response envelope

Success:
```json
{ "success": true, "data": { }, "message": "Order created successfully" }
```
List endpoints additionally include `pagination: { page, limit, total, totalPages }`.

Error:
```json
{ "success": false, "message": "Validation failed", "errors": [] }
```

## Auth

All protected routes expect `Authorization: Bearer <accessToken>`.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/staff/login` | none | `{ email, password }` → `{ accessToken, refreshToken, user }` |
| POST | `/auth/customer/register` | none | `{ name, mobile, email? }` — creates a customer profile |
| POST | `/auth/customer/otp/request` | none | `{ mobile }` → `{ devOtp? }` (dev-only; sends OTP via console/SMS) |
| POST | `/auth/customer/otp/verify` | none | `{ mobile, otp }` → `{ accessToken, refreshToken, customer }` |
| POST | `/auth/refresh` | none | `{ refreshToken }` → new `{ accessToken, refreshToken }` (rotated) |
| POST | `/auth/logout` | none | `{ refreshToken }` → revokes it |
| POST | `/auth/forgot-password` | none | `{ email }` → always 200 (doesn't leak account existence) |
| POST | `/auth/reset-password` | none | `{ token, newPassword }` |
| POST | `/auth/change-password` | staff | `{ currentPassword, newPassword }` |
| GET | `/auth/me` | any | Returns the decoded token payload |

## Outlets

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/outlets` | public | `?all=true` includes inactive. List active outlets by default. |
| GET | `/outlets/:id` | public | Single outlet |
| POST | `/outlets` | staff, `outlets.manage` | Create outlet |
| PATCH | `/outlets/:id` | staff, `outlets.manage` | Update outlet |
| DELETE | `/outlets/:id` | staff, `outlets.manage` | Soft-delete (deactivate) |

## Menu

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/menu?outletId=` | public | Full menu grouped by category (`[{ category, items }]`) |
| GET | `/menu/categories?outletId=` | public | Categories only |
| GET | `/menu/items?outletId=&categoryId=&search=&featured=` | public | Filtered item list |
| GET | `/menu/items/:id` | public | Single item (with modifiers populated) |
| GET | `/menu/modifiers?outletId=` | public | Modifier groups for an outlet |
| GET | `/menu/table/:qrToken` | public | Resolves a scanned dine-in QR to outlet + table |
| POST | `/menu/categories` | staff, `menu.manage` | Create category |
| POST | `/menu/items` | staff, `menu.manage` | Create menu item |
| PATCH | `/menu/items/:id` | staff, `menu.manage` | Update menu item |
| PATCH | `/menu/items/:id/availability` | staff, `menu.manage` | `{ isAvailable }` |
| POST | `/menu/modifiers` | staff, `menu.manage` | Create modifier group |

## Orders

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/orders/price` | optional | Preview server-computed totals without creating an order |
| POST | `/orders` | optional | Create order. Body: `{ outletId, orderType, lines[], tableQrToken?, couponCode?, scheduledAt?, deliveryAddress?, customerNotes? }` |
| GET | `/orders?outletId=&status=&orderType=&page=&limit=` | staff, `orders.read` | Paginated outlet order list |
| GET | `/orders/:id` | optional | Full order (customers can only fetch their own) |
| GET | `/orders/:id/status` | optional | Lightweight status-only payload for the tracking screen |
| PATCH | `/orders/:id/status` | staff, `orders.update` | `{ status, note? }` — validated state machine (see below) |
| POST | `/orders/:id/cancel` | optional | Cancel (only from cancellable states) |
| POST | `/orders/:id/reorder` | optional | Returns cart lines derived from a past order ("Order Again") |
| GET | `/orders/:id/receipt` | optional | Structured printable-receipt data (see `docs/PART2.md` §1) |

## Kitchen (KDS)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/kitchen/board?outletId=` | staff, `kds.read` | Orders grouped into `{ new, preparing, ready, completed }` |
| GET | `/kitchen/workload?outletId=` | staff, `kds.read` | `{ activeOrders, pendingOrders, delayedOrders, averagePreparationMinutes, state, thresholds }` — `state` is `normal\|busy\|critical`, computed from the outlet's configurable thresholds |

## Inventory

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/inventory?outletId=&category=&lowStockOnly=&search=&page=&limit=` | staff, `inventory.read` | Paginated ingredient list, each with a live `stockStatus` virtual |
| GET | `/inventory/:id` | staff, `inventory.read` | Single item |
| GET | `/inventory/ledger?outletId=&type=` | staff, `inventory.read` | Outlet-wide transaction ledger, filterable by type |
| GET | `/inventory/:id/ledger` | staff, `inventory.read` | Ledger history for one item |
| POST | `/inventory` | staff, `inventory.write` | Create an ingredient |
| PATCH | `/inventory/:id` | staff, `inventory.write` | Update (never accepts `currentStock` directly — see `/inventory/:id/adjust`) |
| DELETE | `/inventory/:id` | staff, `inventory.write` | Soft-delete |
| POST | `/inventory/:id/adjust` | staff, `inventory.write` | `{ outletId, delta, notes? }` — manual stocktake correction, always ledgered (`ADJUSTMENT`) and audit-logged |

## Recipes / BOM

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/recipes?outletId=` | staff, `inventory.read` | All recipes for an outlet |
| GET | `/recipes/:menuItemId?outletId=` | staff, `inventory.read` | Recipe for one menu item |
| GET | `/recipes/:menuItemId/cost?outletId=` | staff, `inventory.read` | `{ ingredientCost, sellingPrice, grossMarginAmount, grossMarginPercent, ingredients[] }` — computed live |
| POST | `/recipes` | staff, `recipes.manage` | `{ outletId, menuItemId, ingredients: [{inventoryItemId, quantity, unit}], yieldServings? }` — upsert, audit-logged |
| DELETE | `/recipes/:menuItemId?outletId=` | staff, `recipes.manage` | Soft-delete a recipe |

## Suppliers

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/suppliers?outletId=&all=` | staff, `suppliers.manage` | List (active-only by default) |
| GET | `/suppliers/:id` | staff, `suppliers.manage` | Single supplier |
| GET | `/suppliers/:id/products` | staff, `suppliers.manage` | Inventory items sourced from this supplier |
| POST | `/suppliers` | staff, `suppliers.manage` | Create |
| PATCH | `/suppliers/:id` | staff, `suppliers.manage` | Update |
| DELETE | `/suppliers/:id` | staff, `suppliers.manage` | Soft-delete |

## Purchases

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/purchases?outletId=&status=&supplierId=&page=&limit=` | staff, `purchases.manage` | Paginated purchase orders |
| GET | `/purchases/:id` | staff, `purchases.manage` | Single purchase |
| POST | `/purchases` | staff, `purchases.manage` | `{ outletId, supplierId, lines: [{inventoryItemId, quantity, rate, taxPercent?}], invoiceNumber?, purchaseDate? }` — created as `DRAFT`, stock untouched |
| POST | `/purchases/:id/complete` | staff, `purchases.manage` | Increases stock (one `PURCHASE` ledger entry per line), updates each item's `costPerUnit`, audit-logged. Rejects if already completed/cancelled. |
| POST | `/purchases/:id/cancel` | staff, `purchases.manage` | Cancels a `DRAFT` purchase (rejects if already completed) |
| PATCH | `/purchases/:id/payment-status` | staff, `purchases.manage` | `{ paymentStatus: 'PENDING'\|'PARTIAL'\|'PAID' }` |

## Wastage

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/wastage?outletId=&reason=&page=&limit=` | staff, `wastage.manage` | Paginated wastage records |
| POST | `/wastage` | staff, `wastage.manage` | `{ outletId, inventoryItemId, quantity, reason, notes? }` — decreases stock immediately (`WASTAGE` ledger entry), audit-logged |

## Inventory Dashboard

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/inventory-dashboard/summary?outletId=` | staff, `reports.read` | Total value, low/out-of-stock lists, recent purchases/wastage, 30-day wastage value, top consumed ingredients |

## Audit Log

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/audit-logs?outletId=&entity=&action=&page=&limit=` | staff, `audit.read` | Paginated audit trail |

`lines[]` item shape: `{ menuItemId, quantity, selectedOptionIds: string[], notes? }`
— **no price fields are accepted from the client**; totals are always
recomputed server-side from the current `MenuItem`/`Modifier` documents.
Staff-originated requests (`req.auth.type === 'STAFF'`) may additionally
include:
- `manualDiscount?: { discountType: 'FLAT'|'PERCENT', value: number, reason?: string }` — POS discount, ignored for customer-originated orders.
- `overrideStockCheck?: boolean` — lets a manager/owner push an order through despite insufficient ingredient stock; the resulting order is flagged `stockOverrideApplied: true`.

If any recipe-linked ingredient doesn't have enough stock and no override is
supplied, order creation returns `409 Conflict` naming the short ingredients.

**Order status state machine** (`orderStatus`) — full spec in
[`ORDER_STATUS.md`](./ORDER_STATUS.md). Seven statuses only:
`PENDING → CONFIRMED → PREPARING → READY → COMPLETED` (Take / Dine) and
`… READY → OUT_FOR_DELIVERY → COMPLETED` (Parcel). `COMPLETED` and
`CANCELLED` are terminal. Illegal transitions return `400`, a caller who
lacks the right returns `403`, and a stale/lost race returns `409`
(`"Order status has already been updated."`).

| Method | Path | Auth | Description |
|---|---|---|---|
| PATCH | `/orders/:id/status` | staff, one of `orders.update` / `kds.update` / `delivery.update` | `{ status, note?, reason?, expectedStatus? }` — the state machine decides which of those roles may perform which transition |
| POST | `/orders/:id/cancel` | optional | `{ reason?, note?, expectedStatus? }` — customer default rule (PENDING/CONFIRMED, own order) or staff/admin override (`orders.cancel`; reason mandatory once PREPARING; OUT_FOR_DELIVERY needs OWNER/MANAGER) |
| GET | `/orders/current?outletId=&includeClosed=&orderType=` | staff, `orders.read` | "Current Orders" feed: active (+ recently closed) orders, per-status `counts`, role-aware `availableActions` |
| POST | `/delivery/:orderId/assign` | staff, `delivery.assign` | `{ deliveryStaffId }` — assigns/reassigns a delivery executive while READY; sets `deliveryStatus=ASSIGNED`, **does not change `orderStatus`** |
| POST | `/delivery/:orderId/picked-up` | assigned executive or `delivery.assign` | `deliveryStatus=PICKED_UP` (orderStatus stays READY) |
| GET | `/delivery/executives?outletId=` · `/delivery/in-flight?outletId=` · `/delivery/unassigned?outletId=` · `/delivery/my-orders` | staff | dispatch board data / the executive's own queue |

Every order returned by the API (create, get, list, current, kitchen board,
status/cancel responses) carries `availableActions` (computed for the
caller by the same validator the API enforces), `orderFlow`
(`PARCEL|TAKE|DINE`), and the separate `paymentStatus` / `deliveryStatus`.

## Payments

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/payments` | optional | `{ orderId, method, amount? }` — initiates a payment. Omitting `amount` charges the full remaining balance; passing a smaller `amount` records a **partial/split payment** (call multiple times with different methods to split cash+UPI, etc). `paymentStatus` is always recomputed server-side from the sum of successful payments (`PENDING → PARTIALLY_PAID → PAID`; refunds move it to `PARTIALLY_REFUNDED` / `REFUNDED` and never touch `orderStatus`). |
| POST | `/payments/webhook` | none (gateway-called) | Server-side payment confirmation — the only way `paymentStatus` becomes `PAID`/advances for non-cash methods |
| POST | `/payments/refund` | staff, `payments.refund` | `{ orderId, amount }` — partial or full; `paymentStatus` becomes `PARTIALLY_REFUNDED`/`REFUNDED`, `orderStatus` is left alone; audit-logged |
| GET | `/payments/order/:orderId` | optional | Lists every payment record (useful for showing a split-payment breakdown on a receipt) |

## Customers

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/customers/me` | customer | Profile |
| PATCH | `/customers/me` | customer | `{ name?, email? }` |
| GET | `/customers/me/orders?page=&limit=` | customer | Paginated order history |
| POST | `/customers/me/addresses` | customer | Add an address |
| DELETE | `/customers/me/addresses/:addressId` | customer | Remove an address |
| POST | `/customers/me/favourites/:menuItemId` | customer | Toggle favourite |

## Tables (dine-in QR management)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/tables?outletId=` | staff, `tables.manage` | List tables |
| POST | `/tables` | staff, `tables.manage` | `{ outletId, tableNumber, capacity }` — generates a fresh `qrToken` |
| PATCH | `/tables/:id/regenerate-qr` | staff, `tables.manage` | Invalidates the old QR, issues a new one |
| DELETE | `/tables/:id` | staff, `tables.manage` | Soft-delete |

The customer-facing QR code should encode a URL like
`https://<web-app-host>/t/<qrToken>`, which the frontend's
`DineInLandingPage` resolves via `GET /menu/table/:qrToken`.

## Staff users

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users?outletId=` | staff, `users.manage` | List staff |
| POST | `/users` | staff, `users.manage` | `{ name, email, password, role, outletIds }` |
| PATCH | `/users/:id` | staff, `users.manage` | Update |
| DELETE | `/users/:id` | staff, `users.manage` | Soft-delete (deactivate) |

## Real-time events (Socket.IO)

Connect to the API's base URL (default `http://localhost:4000`), passing the
current JWT access token (if any) as `auth: { token }` in the client
handshake — staff-only rooms (`kds:*`, `outlet:*:staff`) reject the join
otherwise.

Client → server:
- `order:subscribe` (orderId) — join that order's room (no auth required — see `docs/PART2.md` §14)
- `order:unsubscribe` (orderId)
- `kds:subscribe` (outletId) — requires staff with `kds.read` scoped to that outlet
- `kds:unsubscribe` (outletId)
- `staff:subscribe` (outletId) — requires any staff scoped to that outlet; joins the outlet's general back-office room
- `staff:unsubscribe` (outletId)

Server → client:
- `order:status_update` — `{ orderId, outletId, orderStatus, estimatedPreparationMinutesMin, estimatedPreparationMinutesMax }`
- `order:payment_update` — `{ orderId, paymentStatus }`
- `ORDER_CREATED` / `ORDER_CONFIRMED` / `ORDER_PREPARING` / `ORDER_READY` / `ORDER_OUT_FOR_DELIVERY` / `ORDER_COMPLETED` / `ORDER_CANCELLED` / `PAYMENT_UPDATED` / `DELIVERY_UPDATED` — `{ orderId, orderNumber, tokenNumber, outletId, orderType, orderStatus, paymentStatus, deliveryStatus, tableId, tableNumber, previousStatus?, timestamp }`, emitted to the order's room, the outlet's KDS room and the outlet staff room — **only after the database write succeeded**
- `DASHBOARD_UPDATED` — `{ outletId }`, emitted to `outlet:<outletId>:staff` after any order/payment/delivery change so dashboard counters refresh
- `kds:new_order` — order summary, emitted to `kds:<outletId>` on creation
- `kds:order_update` — same payload as `order:status_update`, emitted to `kds:<outletId>`
- `kitchen:updated` — emitted to `outlet:<outletId>:staff` on every order status change
- `inventory:low` / `inventory:out` — `{ inventoryItemId, name, outletId, currentStock, minimumStock, unit }`, emitted to `outlet:<outletId>:staff` the instant a stock movement crosses a threshold

## Permission reference

See `apps/api/src/config/permissions.ts` for the full list (`orders.*`,
`kds.*`, `inventory.*`, `recipes.manage`, `suppliers.manage`,
`purchases.manage`, `wastage.manage`, `audit.read`, `reports.read`,
`users.manage`, `menu.*`, `outlets.*`, `tables.manage`, `payments.*`,
`delivery.*`, `customers.manage`) and the default role→permission mapping.
