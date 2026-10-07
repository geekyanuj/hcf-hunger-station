# Order status, payment status and delivery status

The order lifecycle is a **backend-enforced state machine**. One module owns
it — `apps/api/src/services/orderStateMachine.ts` — and every route, the KDS,
the delivery dashboard and the buttons the frontend draws all go through it.

## 1. Statuses

`PENDING → CONFIRMED → PREPARING → READY → COMPLETED` (Take / Dine)
`PENDING → CONFIRMED → PREPARING → READY → OUT_FOR_DELIVERY → COMPLETED` (Parcel)
`CANCELLED` is reachable from every non-terminal status (rules below).
`COMPLETED` and `CANCELLED` are terminal.

Business vocabulary → stored `orderType`: **Parcel = `DELIVERY`**, **Take = `TAKEAWAY`**,
**Dine = `DINE_IN`**. `POS` (counter) and `CATERING` hand the food over in
person, so they follow the Take flow.

## 2. Transition matrix

| From | To | Who |
|---|---|---|
| PENDING | CONFIRMED | `orders.update` or `kds.update` |
| PENDING | CANCELLED | the customer (own order) / a guest (guest order) / staff with `orders.cancel` |
| CONFIRMED | PREPARING | `orders.update` or `kds.update` |
| CONFIRMED | CANCELLED | same as above |
| PREPARING | READY | `orders.update` or `kds.update` |
| PREPARING | CANCELLED | staff/admin with `orders.cancel`, **reason required** |
| READY | COMPLETED | **Take/Dine only** — `orders.update` or `kds.update` |
| READY | OUT_FOR_DELIVERY | **Parcel only**, needs an assigned delivery executive — `orders.update`, or the assigned executive (`delivery.update`) |
| READY | CANCELLED | staff/admin with `orders.cancel`, reason required |
| OUT_FOR_DELIVERY | COMPLETED | `orders.update`, or the assigned executive |
| OUT_FOR_DELIVERY | CANCELLED | **OWNER / MANAGER only** (admin override), reason required |
| COMPLETED, CANCELLED | — | nothing, ever (a refund is a *payment* change, see §4) |

Everything else (e.g. `PENDING→READY`, `PREPARING→PENDING`,
`COMPLETED→PREPARING`, `CANCELLED→CONFIRMED`, `READY→COMPLETED` on a Parcel,
`READY→OUT_FOR_DELIVERY` on Take/Dine) is rejected. Dine orders must carry
`tableId` + `tableNumber` to progress.

Error codes: `400` invalid transition / missing requirement · `403` role not
permitted · `409` "Order status has already been updated." (lost a race, or a
stale screen sent an outdated `expectedStatus`).

## 3. How a transition is executed

`OrderService.transitionStatus` — the only place an order's status changes:

1. **Validate** with `canTransitionOrderStatus(order, requested, actor, ctx)`.
2. **Persist** atomically: `findOneAndUpdate({ _id, orderStatus: <validated status> }, { $set, $push statusHistory })`.
   If two staff race, exactly one write matches; the other gets the 409. Status,
   timestamps, cancellation data and the history entry are one atomic
   single-document update (no replica set / transaction required).
3. **Log**: a `statusHistory` entry `{ status, timestamp, changedBy, changedByRole, note }` (+ audit log for staff cancellations).
4. **Broadcast**: socket events are emitted only after the write succeeded.
5. Side effects (idempotent, failures are logged and never undo the transition): stock consumption + loyalty on the configured trigger, customer notification, loyalty refund on cancel, dine-in table release.

## 4. Payment status is separate

`paymentStatus`: `PENDING · AUTHORIZED · PARTIALLY_PAID · PAID · FAILED · REFUNDED · PARTIALLY_REFUNDED`
(`paymentStateMachine.ts`). Recording a payment or a refund never changes
`orderStatus`, and `orderStatus` never changes `paymentStatus`.

*Pay After Dine In* (`orderType=DINE_IN`, `paymentMethod=PAY_AFTER_DINE_IN`):
the order runs the normal flow to `COMPLETED` while `paymentStatus` stays
`PENDING`; **staff** (`payments.process`) record the payment afterwards
(Current Orders → *Record Payment*). Guests cannot mark such an order paid.

A refund on a completed order is `orderStatus=COMPLETED`, `paymentStatus=REFUNDED`
(or `PARTIALLY_REFUNDED`) — never `CANCELLED`.

## 5. Delivery status is separate

`deliveryStatus` (Parcel only): `PENDING · ASSIGNED · PICKED_UP · OUT_FOR_DELIVERY · DELIVERED · CANCELLED`.

| orderStatus | deliveryStatus |
|---|---|
| READY | PENDING → ASSIGNED → PICKED_UP |
| OUT_FOR_DELIVERY | OUT_FOR_DELIVERY |
| COMPLETED | DELIVERED |
| CANCELLED | CANCELLED |

Assigning an executive and marking pickup only change `deliveryStatus`
(recorded in `deliveryHistory`); the order-level moves go through the state
machine, which keeps `deliveryStatus` in sync.

## 6. Cancellation data

When an order becomes `CANCELLED`: `cancelledAt`, `cancelledBy`
(`CUSTOMER | STAFF | ADMIN | SYSTEM`; OWNER/MANAGER ⇒ `ADMIN`),
`cancelledByUserId`, `cancellationReason`, `cancellationNote`,
`previousOrderStatus`, `paymentStatusAtCancellation`.

## 7. What the UI shows

`order.availableActions` is computed by the backend for the logged-in user
(`getAvailableActions`) and the web app draws exactly that list — no status
dropdown, nothing status-changing on terminal orders. Actions per status:
PENDING *Confirm · Cancel*; CONFIRMED *Start Preparing · Cancel*; PREPARING
*Mark Ready · (Cancel if permitted)*; READY-Parcel *Assign Delivery · Mark Out
for Delivery*; READY-Take/Dine *Complete*; OUT_FOR_DELIVERY *Complete*;
COMPLETED/CANCELLED *View*. Kitchen tokens are available while the order is
active; the customer bill appears only at READY, OUT_FOR_DELIVERY, or COMPLETED
(never for cancelled orders).

Customer wording (never the enum): Order Received · Order Confirmed · Preparing
Your Order · Ready for Pickup (Take) / Your Food Is Ready (Dine) / Ready for
Delivery (Parcel) · Out for Delivery · Order Completed · Order Cancelled.
Dashboard badges: Pending · Confirmed · Preparing · Ready · Out for Delivery ·
Completed · Cancelled.

## 8. Real-time events

`ORDER_CREATED, ORDER_CONFIRMED, ORDER_PREPARING, ORDER_READY,
ORDER_OUT_FOR_DELIVERY, ORDER_COMPLETED, ORDER_CANCELLED, PAYMENT_UPDATED,
DELIVERY_UPDATED, DASHBOARD_UPDATED` — see `API.md` for payloads and rooms.

## 9. Migrating existing data

Older databases contain `RECEIVED`, `ASSIGNED`, `PICKED_UP`, `DELIVERED`.
Run once (safe to re-run; `--dry-run` previews):

```bash
npm run migrate:order-status -- --dry-run
npm run migrate:order-status
```

`RECEIVED→PENDING`, `ASSIGNED/PICKED_UP→READY` (+ `deliveryStatus`),
`DELIVERED→COMPLETED` (+ `deliveryStatus=DELIVERED`); history entries are
rewritten (`changedAt→timestamp`, `changedByRole` added), Parcel orders get a
`deliveryStatus`, Dine orders a `tableNumber`, cancelled orders their
cancellation info.

## 10. Tests

`npm run test:api:unit` — pure state-machine / migration unit tests (no DB).
`npm run test:api` — integration tests (`orderStatus.integration.test.ts`
covers all three flows, cancellation rules, payment/delivery separation,
concurrency, dashboards). Set `TEST_MONGO_URI` to run against an existing
MongoDB-compatible server instead of the in-memory one.
