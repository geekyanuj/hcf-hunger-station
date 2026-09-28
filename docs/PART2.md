# Part 2 — POS, KDS, Inventory & Integrated Order Flow

Part 2 extends the Part 1 platform in place — same monorepo, same auth/RBAC
system, same pricing/token/socket architecture — with everything needed to
run a physical outlet day-to-day: a cashier POS, a kitchen display, and a
full ingredient-level inventory system wired to automatic stock deduction.

## 1. POS (Point of Sale)

`apps/web/src/pages/staff/POSPage.tsx` implements the spec's exact layout:
categories left, products center, cart/summary right, order-type and
table/search controls on top, discount/pay/cancel on the bottom bar.

- **Order types**: Counter (`POS`), Dine-in, Takeaway, Delivery — all reuse
  `POST /api/v1/orders` (the same endpoint the customer app uses), so pricing,
  token generation, and prep-time estimation are never duplicated.
- **Discount**: a POS-only percentage discount is applied via
  `manualDiscount` on the order-creation payload. The server (not the
  browser) computes the discount amount from the *server-priced* subtotal
  and stores who applied it (`Order.manualDiscount.appliedByUserId`) —
  never trust a client-computed discount total.
- **Payment**: `PaymentModal` supports **split payments** — call
  `POST /api/v1/payments` more than once with different methods/amounts;
  the order's `paymentStatus` is always recomputed server-side from the sum
  of successful `Payment` records (`PENDING → PARTIALLY_PAID → PAID`), never
  set directly by a single call.
- **Printable receipt**: `GET /api/v1/orders/:id/receipt` returns structured
  receipt data (outlet info, line items with modifiers, tax/discount/total
  breakdown, payments, balance due); the POS's "Print" button opens the
  browser's native print dialog against that data. See README §8 for why
  this stops short of real thermal-printer hardware integration.
- **Hold/Cancel**: "Cancel" clears the in-progress cart (a true POS "hold for
  later" queue — saving multiple in-progress carts side by side — is a
  Part 3 item; the current cart can always be abandoned without side effects
  since nothing is written to the database until "Charge" is pressed).

## 2. Kitchen Display System (KDS)

`apps/web/src/pages/staff/KDSPage.tsx` — a fullscreen, dark-themed, three
column board (NEW / PREPARING / READY) that a kitchen account can log into
without ever seeing admin functionality (`KITCHEN`'s permission set is
`kds.read`, `kds.update`, `orders.read`, `menu.read` only — verified by the
`fullFlow.integration.test.ts` permission tests).

- **Real-time**: `GET /kitchen/board` seeds the initial state; a
  staff-authenticated Socket.IO connection (`kds:subscribe`) then pushes
  `kds:new_order` and `kds:order_update` events so new orders and status
  changes appear without a refresh. A 15s polling refetch runs alongside the
  socket as a fallback, matching the same pattern used by the customer
  tracking page in Part 1.
- **Actions**: the buttons on each ticket come from the backend
  (`order.availableActions`, computed by the order state machine for the
  logged-in role): Confirm (`PENDING→CONFIRMED`), Start Preparing
  (`CONFIRMED→PREPARING`), Mark Ready (`PREPARING→READY`), Complete
  (`READY→COMPLETED` for Take/Dine). Every action calls
  `PATCH /orders/:id/status`, the same authoritative, state-machine-validated
  endpoint used everywhere else. See `ORDER_STATUS.md`.
- **Sound notification**: a Web Audio API tone plays on `kds:new_order` with
  a mute toggle (`soundOn` state) — the architecture point (`playChime()`) is
  isolated so a real configurable sound library can be swapped in later.

## 3. Kitchen Workload

`GET /kitchen/workload` (`services/kitchen.service.ts`) returns active/
pending/delayed order counts, average prep time, and a `normal | busy |
critical` state computed **entirely from `Outlet.settings.kitchenLoadThresholds`**
(`busyActiveOrders`, `criticalActiveOrders`, `delayedOrderMinutes`) — nothing
is hard-coded, so each outlet can tune its own thresholds. The KDS header
shows this as a colored pill.

## 4. Inventory (ingredient-level)

`InventoryItem` tracks ingredients, not finished products, with every field
from the spec (SKU, category, unit, currentStock/minimumStock/maximumStock/
reorderLevel, costPerUnit, supplier, expiryDate, batchNumber) plus a
`stockStatus` virtual (`OUT_OF_STOCK | LOW_STOCK | NORMAL`) computed live
from `currentStock` vs `minimumStock` — never stored, so it's always
accurate. UI: `/inventory/items` (search, low-stock filter, create, adjust).

## 5. Recipe / BOM

`Recipe` links a `MenuItem` to a list of `{ inventoryItemId, quantity, unit }`
ingredients plus a `yieldServings` count. `RecipeService.calculateCost`
computes ingredient cost and gross margin **live from current
`InventoryItem.costPerUnit` values** — nothing hard-coded — with unit
conversion (`utils/units.ts`) so a recipe can be written in grams while the
ingredient's stock is tracked in kilograms (exactly the spec's example:
"Lettuce — 20g" against a kg-tracked inventory item). UI: `/inventory/recipes`
lets a manager/inventory user build a BOM per menu item and view its cost
breakdown and margin %.

## 6. Automatic Stock Deduction (idempotent)

This is the core integration requirement, and it's real, not simulated:

1. **Trigger**: configurable per outlet
   (`Outlet.settings.stockDeductionTrigger`, default `ON_COMPLETED`). Default
   behavior: every order type deducts on `COMPLETED` (for Parcel orders that
   is the moment the delivery is completed, i.e. the customer has the food). `OrderService.updateStatus` checks this after every valid status
   transition and calls `StockDeductionService.consumeForOrder`.
2. **Aggregation**: for every order line with a defined `Recipe`, ingredient
   quantities are converted to the ingredient's own stock unit and summed
   across all lines (so two menu items sharing an ingredient combine
   correctly). Menu items with no recipe are skipped — Part 2 doesn't
   require every item to have a BOM before it can be sold.
3. **Idempotency**: `Order.inventoryConsumedAt` is checked first (fast
   short-circuit for the common case). The real guarantee, though, is
   `InventoryLedger`'s **unique index** on
   `(referenceType, referenceId, inventoryItemId, type)`: if the same order's
   consumption is attempted twice (a retried event, a duplicate socket
   emission, a double status-update call), the second attempt's ledger
   insert hits that unique index, is caught as a duplicate-key error, and is
   treated as a no-op — proven by `inventory.test.ts`'s
   "is idempotent" test and `fullFlow.integration.test.ts`'s end-to-end walk.
4. **No hard multi-document transaction**: see README §8 for why (standalone
   MongoDB in this project's `docker-compose`, and the unique-index approach
   already satisfies the spec's actual requirement — "prevent double
   deduction if order events are retried" — without needing one).

## 7. Inventory Ledger

`InventoryLedger` is the **only** thing allowed to change
`InventoryItem.currentStock` — enforced by convention (`LedgerService.recordMovement`
is the sole call site that writes `currentStock`, and `InventoryService.update`
explicitly strips `currentStock` from any generic PATCH payload). Every
movement — `PURCHASE`, `SALE_CONSUMPTION`, `WASTAGE`, `ADJUSTMENT`,
`TRANSFER_IN/OUT`, `RETURN` — records `previousStock`/`newStock`/`quantity`/
`referenceId`/`userId`/`notes`. UI: `/inventory/transactions`, filterable by
type.

## 8. Low Stock / Out of Stock

- **Alerts**: `LedgerService.recordMovement` checks the post-movement stock
  level and emits `inventory:low` / `inventory:out` over the outlet's staff
  Socket.IO room (`outlet:<id>:staff`) the moment a movement crosses a
  threshold — not on a polling timer. The Inventory Dashboard subscribes and
  shows a toast + refetches automatically.
- **Order blocking with override**: `OrderService.create` calls
  `StockDeductionService.checkAvailability` before finalizing an order. If
  any ingredient is short, the order is rejected (`409 Conflict`) **unless**
  the request carries `overrideStockCheck: true` **and** was made by staff
  (`createdByUserId` is set) — the resulting order is flagged
  `stockOverrideApplied: true` for later review. This is exercised end-to-end
  in `fullFlow.integration.test.ts` (cashier blocked, manager override
  succeeds).

## 9. Suppliers

`Supplier` (name, contact, phone, email, address, GSTIN, payment terms,
notes, active) with a reverse lookup (`GET /suppliers/:id/products`) for the
inventory items sourced from them. UI: `/inventory/suppliers`.

## 10. Purchase Management

`Purchase` is created in **`DRAFT`** status (`POST /purchases`) — stock is
untouched. Only `POST /purchases/:id/complete` increases stock, one
`PURCHASE` ledger entry per line item, and also refreshes each ingredient's
`costPerUnit` to the latest purchase rate (so recipe cost calculations stay
current without manual upkeep). Completing an already-completed purchase is
rejected outright (`409`), and completing a cancelled one is rejected too —
proven in `inventory.test.ts`. UI: `/inventory/purchases` (create with
multiple line items, then "Receive stock" to complete).

## 11. Wastage Management

`WastageService.create` decreases stock immediately (unlike purchases, which
stay draft until confirmed — wastage is, by definition, already a fact) and
computes `estimatedValue` from the ingredient's **current** `costPerUnit` at
the moment of recording. All seven spec reasons are supported as an enum.
UI: `/inventory/wastage`.

## 12. Inventory Dashboard

`GET /inventory-dashboard/summary` aggregates: total inventory value (sum of
`currentStock × costPerUnit` across all items), low-stock and out-of-stock
lists, the 5 most recent purchases and wastage records, wastage value over
the last 30 days, and the top 10 consumed ingredients over the last 30 days
(aggregated straight from the `InventoryLedger`'s `SALE_CONSUMPTION`
entries — this is real consumption data, not a placeholder). UI:
`/inventory` (the default inventory landing page).

## 13. POS ↔ KDS ↔ Inventory integrated flow

There is exactly **one** order-lifecycle code path
(`OrderService.create` / `OrderService.updateStatus`), used identically by
the customer app (Part 1), the POS, and the KDS. No business logic is
duplicated per surface:

```
POS creates order (orderType=POS/DINE_IN/TAKEAWAY/DELIVERY)
  → PricingService (server-side totals) + StockDeductionService.checkAvailability
  → TokenService (order number + T-/D-/O- token)
  → PrepTimeEstimationService (dynamic range)
  → emitNewOrderToKitchen + order:created socket event
KDS receives kds:new_order in real time
  → staff taps START/READY/COMPLETE → PATCH /orders/:id/status
  → state-machine validated, emits order:confirmed/preparing/ready/completed
  → on the outlet's configured trigger status: StockDeductionService.consumeForOrder (idempotent)
Customer tracking screen (Part 1) receives the same order:status_update events
```

## 14. Real-time events

All named events from the spec are implemented in `sockets/index.ts`:
`order:created`, `order:confirmed`, `order:preparing`, `order:ready`,
`order:completed`, `order:cancelled`, `inventory:low`, `inventory:out`,
`kitchen:updated` — plus Part 1's `order:status_update`, `order:payment_update`,
`kds:new_order`, `kds:order_update`. **Authorization**: sockets authenticate
via a JWT passed in `socket.handshake.auth.token` (same token as HTTP
requests); `kds:subscribe` requires staff with `kds.read` scoped to that
outlet, `staff:subscribe` (inventory alerts) requires any staff member
scoped to that outlet, and `order:subscribe` (customer tracking) remains
open by design — a guest dine-in/takeaway order has no account, so knowledge
of the `orderId` itself is the trust boundary, the same as a physical
receipt.

## 15. Audit Log

`AuditLog` records `userId`, `action`, `entity`, `entityId`, `outletId`,
`before`/`after` snapshots, and `ipAddress`. Wired into: stock adjustments
(`InventoryService.adjustStock`), recipe changes (`RecipeService.upsert`),
menu price changes (`MenuService.updateItem`, only fires when `price` or
`discountPrice` actually changed), order cancellations
(`OrderService.cancel`), refunds (`PaymentService.refund`), purchase
completion (`PurchaseService.complete`), wastage (`WastageService.create`),
and staff permission changes (`UserController.update`, only fires when
`role` or `outletIds` actually changed). `GET /audit-logs` (owner/manager
only, `audit.read` permission) lists them, filterable by outlet/entity/action.

## 16. Permissions (Part 2 additions)

New permissions: `recipes.manage`, `suppliers.manage`, `purchases.manage`,
`wastage.manage`, `inventory.override`, `audit.read`, `orders.discount`.
Role defaults follow the spec's explicit restrictions exactly — see
`config/permissions.ts` and the permission-restriction tests in
`fullFlow.integration.test.ts` for proof: KITCHEN → 403 on `/suppliers`,
CASHIER → 403 on `POST /recipes`, INVENTORY → 403 on `/users`.
