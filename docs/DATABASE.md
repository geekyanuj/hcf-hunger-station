# Database Documentation — HFC Restaurant OS (Part 1)

MongoDB via Mongoose. All timestamps use `{ timestamps: true }`
(`createdAt`/`updatedAt`). Soft-deletable collections use an `isDeleted`
boolean flag instead of physical deletion.

## Collections

### Outlet
| Field | Type | Notes |
|---|---|---|
| name, code, address, phone, email | String | `code` unique, uppercase |
| latitude, longitude | Number | optional |
| openingHours | `[{ day, openTime, closeTime, isClosed }]` | embedded |
| isActive | Boolean | |
| settings | embedded object | `taxPercentage, packagingCharge, deliveryBaseCharge, deliveryPerKmCharge, kitchenCapacityPerSlot, rushMultiplier, tokenResetPolicy, currency` |
| isDeleted | Boolean | soft delete |

Indexes: `{ code: 1 }` unique, `{ isActive: 1, isDeleted: 1 }`.

### Role
| Field | Type | Notes |
|---|---|---|
| name | String enum | `OWNER \| MANAGER \| CASHIER \| KITCHEN \| INVENTORY \| DELIVERY`, unique |
| permissions | String[] | from the canonical `Permission` list |
| isSystem | Boolean | seeded roles are protected from deletion (enforced at the app layer in Part 2's admin UI) |

### User (staff)
| Field | Type | Notes |
|---|---|---|
| name, email | String | `email` unique |
| passwordHash | String | `select: false` — never returned by default queries |
| role | String | FK to `Role.name` (string, not ObjectId — roles are a small fixed set) |
| outletIds | ObjectId[] | outlets this staff member may operate in |
| isActive, isDeleted | Boolean | |
| lastLoginAt | Date | |
| passwordResetTokenHash, passwordResetExpiresAt | String/Date | `select: false`, forgot-password flow |

Indexes: `{ email: 1 }` unique, `{ role: 1 }`.

### Customer
| Field | Type | Notes |
|---|---|---|
| name, mobile | String | `mobile` unique |
| email | String | optional |
| otpHash, otpExpiresAt | String/Date | `select: false`, mobile OTP login |
| addresses | `[{ label, line1, line2, city, state, pincode, latitude, longitude, isDefault }]` | embedded |
| favouriteMenuItemIds | ObjectId[] | ref `MenuItem` |
| isActive, isDeleted | Boolean | |

Indexes: `{ mobile: 1 }` unique.

### MenuCategory
| Field | Type | Notes |
|---|---|---|
| outletId | ObjectId | ref `Outlet` |
| name, slug | String | |
| description, image | String | optional |
| sortOrder | Number | |
| isActive, isDeleted | Boolean | |

Indexes: `{ outletId: 1, slug: 1 }` unique, `{ outletId: 1, sortOrder: 1 }`.

### Modifier
| Field | Type | Notes |
|---|---|---|
| outletId | ObjectId | ref `Outlet` |
| name | String | e.g. "Size", "Add-ons" |
| selectionType | `SINGLE \| MULTIPLE` | |
| isRequired, minSelect, maxSelect | Boolean/Number | |
| options | `[{ name, priceDelta, isDefault, isAvailable }]` | embedded, each option has its own `_id` used as `selectedOptionIds` in cart requests |
| isDeleted | Boolean | |

### MenuItem
| Field | Type | Notes |
|---|---|---|
| outletId, categoryId | ObjectId | refs |
| name, slug, description | String | |
| images | String[] | |
| price, discountPrice | Number | `discountPrice` used as effective price when set |
| taxCategory | `GST_5 \| GST_12 \| GST_18 \| EXEMPT` | drives tax-rate lookup in `PricingService` |
| preparationTimeMinutes | Number | input to `PrepTimeEstimationService` |
| isVeg, isAvailable, isFeatured, isPopular | Boolean | |
| sortOrder | Number | |
| modifierIds | ObjectId[] | ref `Modifier` |
| nutritionalInfo | `{ calories, protein, carbs, fat }` | optional |
| isDeleted | Boolean | |

Indexes: `{ outletId: 1, slug: 1 }` unique, `{ outletId: 1, categoryId: 1, isAvailable: 1 }`, `{ outletId: 1, isFeatured: 1 }`, text index on `name`+`description`.

### Table
| Field | Type | Notes |
|---|---|---|
| outletId | ObjectId | ref |
| tableNumber | String | unique per outlet |
| qrToken | String | globally unique, regenerable |
| capacity | Number | |
| isActive, isDeleted | Boolean | |

Indexes: `{ outletId: 1, tableNumber: 1 }` unique, `{ qrToken: 1 }` unique.

### Counter
Generic atomic sequence generator, `{ _id: string, seq: number }`, incremented
via `findByIdAndUpdate(..., { $inc: { seq: 1 } }, { upsert: true })` — this is
what makes order numbers and daily tokens gap-free and race-condition-safe
under concurrent order creation. Keys used:
- `ORDER:<outletId>`
- `TOKEN:<series>:<outletId>:<businessDate>` where `series` is `TAKEAWAY | DINE_IN | DELIVERY`

### Order
| Field | Type | Notes |
|---|---|---|
| orderNumber | String | e.g. `BKM284`, unique |
| tokenNumber | String | e.g. `T-104`, `D-057`, `O-286` |
| outletId | ObjectId | ref |
| customerId | ObjectId | ref `Customer`, optional (guest dine-in/takeaway) |
| tableId | ObjectId | ref `Table`, set for `DINE_IN` |
| createdByUserId | ObjectId | ref `User`, set for POS orders |
| orderType | `DELIVERY \| TAKEAWAY \| DINE_IN \| POS` | |
| items | embedded array (see below) | snapshotted at order time |
| subtotal, discount, tax, packagingCharge, deliveryCharge, total | Number | server-computed, never trusts client input |
| paymentStatus | `PENDING \| AUTHORIZED \| PARTIALLY_PAID \| PAID \| FAILED \| REFUNDED \| PARTIALLY_REFUNDED` | separate payment state machine (`paymentStateMachine.ts`) |
| paymentMethod | `CASH \| UPI \| CARD \| ONLINE \| PAY_AFTER_DINE_IN` | `PAY_AFTER_DINE_IN` only for `DINE_IN` |
| orderStatus | `PENDING \| CONFIRMED \| PREPARING \| READY \| OUT_FOR_DELIVERY \| COMPLETED \| CANCELLED` | validated state machine, see ORDER_STATUS.md |
| deliveryStatus | `PENDING \| ASSIGNED \| PICKED_UP \| OUT_FOR_DELIVERY \| DELIVERED \| CANCELLED` | Parcel (`DELIVERY`) orders only; independent of `orderStatus` |
| deliveryHistory | `[{ status, timestamp, changedBy, changedByRole, note }]` | delivery timeline |
| tableId, tableNumber | ObjectId, String | mandatory for `DINE_IN` for the whole lifecycle |
| cancelledAt, cancelledBy (`CUSTOMER\|STAFF\|ADMIN\|SYSTEM`), cancelledByUserId, cancellationReason, cancellationNote, previousOrderStatus, paymentStatusAtCancellation | | only set when `orderStatus = CANCELLED` |
| estimatedPreparationMinutesMin/Max | Number | from `PrepTimeEstimationService` |
| scheduledAt | Date | optional, for scheduled pickup/delivery |
| deliveryAddress | embedded snapshot | set for `DELIVERY` |
| customerNotes | String | |
| statusHistory | `[{ status, timestamp, changedBy, changedByRole, note }]` | full order timeline — never overwritten, one entry per transition |
| isDeleted | Boolean | |

`items[]` (embedded `OrderItem`, see `docs/ARCHITECTURE.md` §7 for why it's
embedded rather than a separate collection):
`{ menuItemId, name, unitPrice, quantity, selectedModifiers: [{ modifierId, modifierName, optionName, priceDelta }], lineTotal, notes, preparationTimeMinutes }`.

Indexes: `{ orderNumber: 1 }` unique, `{ outletId: 1, orderStatus: 1, createdAt: -1 }`, `{ outletId: 1, orderType: 1, createdAt: -1 }`, `{ customerId: 1, createdAt: -1 }`, `{ tableId: 1, orderStatus: 1 }`.

### Payment
| Field | Type | Notes |
|---|---|---|
| orderId, outletId | ObjectId | refs |
| amount | Number | |
| method | `CASH \| UPI \| CARD \| ONLINE` | |
| provider | String | `MOCK` in Part 1 |
| providerReferenceId | String | gateway-side reference |
| status | `INITIATED \| SUCCESS \| FAILED \| REFUNDED` | |
| failureReason | String | optional |
| refundedAmount | Number | |
| rawWebhookPayloads | Mixed[] | audit log of every webhook received for this payment |

### Token
Audit trail of every issued queue token (separate from the cached
`Order.tokenNumber` for query/reporting convenience).
| Field | Type | Notes |
|---|---|---|
| outletId, orderId | ObjectId | refs |
| series | `TAKEAWAY \| DINE_IN \| DELIVERY` | |
| prefix | String | `T \| D \| O` |
| sequence | Number | from `Counter` |
| displayValue | String | e.g. `T-104` |
| businessDate | String | `YYYY-MM-DD`, or `ALL_TIME` if `tokenResetPolicy: NEVER` |

Indexes: `{ outletId: 1, series: 1, businessDate: 1, sequence: 1 }` unique.

### RefreshToken
| Field | Type | Notes |
|---|---|---|
| principalType | `USER \| CUSTOMER` | |
| principalId | ObjectId | |
| tokenHash | String | SHA-256 of the raw token, unique — raw token is never stored |
| userAgent, ipAddress | String | device/session tracking |
| isRevoked | Boolean | set true on rotation/logout |
| expiresAt | Date | TTL-indexed — MongoDB automatically purges expired documents |

Indexes: `{ tokenHash: 1 }` unique, `{ principalId: 1, isRevoked: 1 }`, `{ expiresAt: 1 }` with `expireAfterSeconds: 0` (TTL).

## Transactions

Part 1's write paths (order creation, status updates, payment webhooks) each
touch one primary document per logical step and use MongoDB's
per-document atomicity plus the atomic `Counter` increment for uniqueness
guarantees — there's no multi-document operation in the current code paths
that requires a multi-document ACID transaction (e.g. order creation writes
the `Order` once, then the `Token` once, referencing the already-created
order's `_id`; a failure between those two steps leaves an order with
`tokenNumber: 'PENDING'` rather than a partial/corrupt state, and can be
detected and repaired). If Part 2 adds multi-document flows that must be
atomic (e.g. simultaneous inventory decrement + order confirmation),
`mongoose.startSession()` + `withTransaction()` should wrap them — the schema
design here doesn't preclude it (MongoDB replica-set transactions work
across any of these collections).

---

# Part 2 additions

### InventoryItem
| Field | Type | Notes |
|---|---|---|
| outletId | ObjectId | ref |
| name, sku, category | String | `sku` unique per outlet |
| unit | `kg\|g\|litre\|ml\|piece\|packet\|box` | |
| currentStock, minimumStock, maximumStock, reorderLevel | Number | `currentStock` is **only** ever written by `LedgerService.recordMovement` |
| costPerUnit | Number | refreshed automatically on purchase completion |
| supplierId | ObjectId | ref `Supplier`, optional |
| expiryDate, batchNumber | Date/String | optional |
| isActive, isDeleted | Boolean | |
| `stockStatus` (virtual) | `OUT_OF_STOCK\|LOW_STOCK\|NORMAL` | computed from `currentStock` vs `minimumStock`, never stored |

Indexes: `{ outletId: 1, sku: 1 }` unique, `{ outletId: 1, category: 1 }`, `{ outletId: 1, currentStock: 1 }`.

### Recipe
| Field | Type | Notes |
|---|---|---|
| outletId, menuItemId | ObjectId | refs, unique together |
| ingredients | `[{ inventoryItemId, quantity, unit }]` | `unit` may differ from the ingredient's own stock unit — converted at read time via `utils/units.ts` |
| yieldServings | Number | recipe quantities are for this many servings |

Indexes: `{ outletId: 1, menuItemId: 1 }` unique.

### Supplier
| Field | Type | Notes |
|---|---|---|
| outletId, name, phone | required | |
| contactPerson, email, address, gstin, paymentTerms, notes | String | optional |
| isActive, isDeleted | Boolean | |

### Purchase
| Field | Type | Notes |
|---|---|---|
| purchaseNumber | String | e.g. `PO-00001`, unique, from `Counter` key `PURCHASE:<outletId>` |
| outletId, supplierId | ObjectId | refs |
| items | `[{ inventoryItemId, name, quantity, rate, taxPercent, lineTotal }]` | `name` snapshotted |
| subtotal, tax, total | Number | server-computed from `items[]` |
| paymentStatus | `PENDING\|PARTIAL\|PAID` | |
| status | `DRAFT\|COMPLETED\|CANCELLED` | stock only changes on `DRAFT→COMPLETED` |
| invoiceNumber, purchaseDate, completedAt | String/Date | |
| createdByUserId | ObjectId | ref `User` |

Indexes: `{ purchaseNumber: 1 }` unique, `{ outletId: 1, status: 1, createdAt: -1 }`, `{ outletId: 1, supplierId: 1 }`.

### Wastage
| Field | Type | Notes |
|---|---|---|
| outletId, inventoryItemId | ObjectId | refs |
| quantity | Number | |
| reason | `BURNT_FOOD\|EXPIRED\|SPOILAGE\|PREPARATION_MISTAKE\|CANCELLATION\|DAMAGED_PACKAGING\|OTHER` | |
| estimatedValue | Number | `quantity × costPerUnit` at time of recording |
| notes | String | optional |
| recordedByUserId | ObjectId | ref `User` |

Indexes: `{ outletId: 1, createdAt: -1 }`, `{ outletId: 1, inventoryItemId: 1 }`.

### InventoryLedger
The single source of truth for every stock change; see `docs/PART2.md` §7.

| Field | Type | Notes |
|---|---|---|
| inventoryItemId, outletId | ObjectId | refs |
| quantity | Number | signed delta |
| previousStock, newStock | Number | snapshot before/after |
| type | `PURCHASE\|SALE_CONSUMPTION\|WASTAGE\|ADJUSTMENT\|TRANSFER_IN\|TRANSFER_OUT\|RETURN` | |
| referenceType | `ORDER\|PURCHASE\|WASTAGE\|MANUAL\|TRANSFER` | |
| referenceId | ObjectId | optional — the `Order`/`Purchase`/`Wastage` this movement stems from |
| userId | ObjectId | optional |
| notes | String | |

Indexes: `{ outletId: 1, inventoryItemId: 1, createdAt: -1 }`, `{ outletId: 1, type: 1, createdAt: -1 }`, and the
**idempotency-guaranteeing** unique partial index:
`{ referenceType: 1, referenceId: 1, inventoryItemId: 1, type: 1 }` (only enforced when `referenceId` exists).

### AuditLog
| Field | Type | Notes |
|---|---|---|
| userId | ObjectId | ref `User` |
| action | `STOCK_ADJUSTMENT\|RECIPE_CHANGE\|PRICE_CHANGE\|ORDER_CANCELLATION\|REFUND\|PURCHASE_COMPLETED\|WASTAGE_RECORDED\|USER_PERMISSION_CHANGE\|STOCK_OVERRIDE` | |
| entity, entityId | String/ObjectId | which document was affected |
| outletId | ObjectId | optional |
| before, after | Mixed | snapshots for diffing |
| ipAddress | String | optional |

Indexes: `{ outletId: 1, createdAt: -1 }`, `{ entity: 1, entityId: 1, createdAt: -1 }`, `{ userId: 1, createdAt: -1 }`.

### Order (Part 2 additions)
| Field | Type | Notes |
|---|---|---|
| inventoryConsumedAt | Date | set once ingredients have been deducted; the fast-path idempotency check |
| manualDiscount | `{ discountType, value, appliedByUserId, reason? }` | POS-only staff discount |
| stockOverrideApplied | Boolean | true if a manager pushed the order through despite an ingredient shortage |
| paymentStatus | now includes `PARTIALLY_PAID` | for split payments |

### Outlet.settings (Part 2 additions)
| Field | Type | Notes |
|---|---|---|
| kitchenLoadThresholds | `{ busyActiveOrders, criticalActiveOrders, delayedOrderMinutes }` | drives the KDS workload `state`, fully configurable per outlet |
| stockDeductionTrigger | `ON_COMPLETED\|ON_READY` | when automatic ingredient consumption fires |

