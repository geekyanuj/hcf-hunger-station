import { Schema, model, Document, Types } from 'mongoose';

export type OrderType = 'DELIVERY' | 'TAKEAWAY' | 'DINE_IN' | 'POS' | 'CATERING';

/**
 * Canonical order lifecycle statuses. See services/orderStateMachine.ts for
 * the exact transition matrix — this is the ONLY list of order statuses.
 * Payment and delivery progress live in their own fields (paymentStatus,
 * deliveryStatus) and must never be encoded into orderStatus.
 */
export const ORDER_STATUS_VALUES = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUS_VALUES)[number];

export const PAYMENT_STATUS_VALUES = ['PENDING', 'AUTHORIZED', 'PARTIALLY_PAID', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUS_VALUES)[number];

export const DELIVERY_STATUS_VALUES = ['PENDING', 'ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUS_VALUES)[number];

/** How the customer intends to pay. PAY_AFTER_DINE_IN is only valid for DINE_IN orders; payment is recorded by staff after the meal. */
export const ORDER_PAYMENT_METHOD_VALUES = ['CASH', 'UPI', 'CARD', 'ONLINE', 'PAY_AFTER_DINE_IN'] as const;
export type OrderPaymentMethod = (typeof ORDER_PAYMENT_METHOD_VALUES)[number];

export type CancelledBy = 'CUSTOMER' | 'STAFF' | 'ADMIN' | 'SYSTEM';

export interface ISelectedModifierOption {
  modifierId: Types.ObjectId;
  modifierName: string;
  optionName: string;
  priceDelta: number;
}

export interface IOrderItem {
  _id?: Types.ObjectId;
  menuItemId: Types.ObjectId;
  name: string; // snapshot at time of order
  unitPrice: number; // snapshot (base price after item-level discount, before modifiers)
  quantity: number;
  selectedModifiers: ISelectedModifierOption[];
  lineTotal: number; // (unitPrice + sum(modifier priceDelta)) * quantity
  notes?: string;
  preparationTimeMinutes: number; // snapshot, used for prep-time estimation audit
}

export interface IStatusHistoryEntry {
  status: OrderStatus;
  timestamp: Date;
  /** Staff user id or customer id; absent for guests/system. */
  changedBy?: Types.ObjectId;
  /** CUSTOMER | GUEST | SYSTEM | a staff role name (OWNER, MANAGER, CASHIER, KITCHEN, DELIVERY, ...). */
  changedByRole: string;
  note?: string;
}

/** Delivery progress is tracked separately from orderStatus so the Delivery Dashboard can evolve without corrupting the core order lifecycle. */
export interface IDeliveryHistoryEntry {
  status: DeliveryStatus;
  timestamp: Date;
  changedBy?: Types.ObjectId;
  changedByRole: string;
  note?: string;
}

export interface IManualDiscount {
  discountType: 'FLAT' | 'PERCENT';
  value: number;
  appliedByUserId: Types.ObjectId;
  reason?: string;
}

export interface IDeliveryAddressSnapshot {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  latitude?: number;
  longitude?: number;
}

export interface IOrder extends Document {
  orderNumber: string; // e.g. HCF284
  tokenNumber: string; // e.g. T-104, D-057, O-286
  outletId: Types.ObjectId;
  customerId?: Types.ObjectId;
  tableId?: Types.ObjectId;
  /** Snapshot of Table.tableNumber. Required (with tableId) for DINE_IN orders throughout their lifecycle. */
  tableNumber?: string;
  createdByUserId?: Types.ObjectId; // for POS orders created by staff
  orderType: OrderType;
  items: IOrderItem[];
  subtotal: number;
  discount: number;
  couponCode?: string;
  tax: number;
  packagingCharge: number;
  deliveryCharge: number;
  total: number;
  paymentStatus: PaymentStatus;
  /** Customer's chosen payment method (e.g. PAY_AFTER_DINE_IN). Independent from orderStatus and paymentStatus. */
  paymentMethod?: OrderPaymentMethod;
  orderStatus: OrderStatus;
  /** Only set for DELIVERY (Parcel) orders. */
  deliveryStatus?: DeliveryStatus;
  deliveryHistory: IDeliveryHistoryEntry[];
  estimatedPreparationMinutesMin: number;
  estimatedPreparationMinutesMax: number;
  scheduledAt?: Date; // for scheduled takeaway/delivery
  deliveryAddress?: IDeliveryAddressSnapshot;
  customerNotes?: string;
  statusHistory: IStatusHistoryEntry[];
  /** Populated only when orderStatus becomes CANCELLED. */
  cancelledAt?: Date;
  cancelledBy?: CancelledBy;
  cancelledByUserId?: Types.ObjectId;
  cancellationReason?: string;
  cancellationNote?: string;
  previousOrderStatus?: OrderStatus;
  /** Snapshot of paymentStatus at the moment of cancellation (tells staff whether a refund is due). */
  paymentStatusAtCancellation?: PaymentStatus;
  isDeleted: boolean;
  /** Part 2: idempotency guard so ingredient stock is deducted at most once per order, however many times the completion event fires. */
  inventoryConsumedAt?: Date;
  /** Part 2: staff-applied POS discount, separate from customer coupon codes. */
  manualDiscount?: IManualDiscount;
  /** Part 2: true if this order was let through despite insufficient ingredient stock, by an authorized manager/owner. */
  stockOverrideApplied: boolean;
  /** Part 3: delivery workflow — which DELIVERY-role staff member is assigned to run this order. */
  deliveryStaffId?: Types.ObjectId;
  deliveryNotes?: string;
  /** Part 3: links a converted quotation back to its originating party/catering request. */
  partyOrderId?: Types.ObjectId;
  /** Part 3: loyalty points redeemed against this order's total, and points earned once it completes (see loyalty.service.ts). */
  loyaltyPointsRedeemed: number;
  loyaltyDiscountAmount: number;
  loyaltyPointsEarned: number;
  loyaltyPointsCreditedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SelectedModifierSchema = new Schema<ISelectedModifierOption>(
  {
    modifierId: { type: Schema.Types.ObjectId, ref: 'Modifier', required: true },
    modifierName: { type: String, required: true },
    optionName: { type: String, required: true },
    priceDelta: { type: Number, default: 0 },
  },
  { _id: false }
);

const OrderItemSchema = new Schema<IOrderItem>({
  menuItemId: { type: Schema.Types.ObjectId, ref: 'MenuItem', required: true },
  name: { type: String, required: true },
  unitPrice: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
  selectedModifiers: { type: [SelectedModifierSchema], default: [] },
  lineTotal: { type: Number, required: true },
  notes: { type: String },
  preparationTimeMinutes: { type: Number, required: true },
});

const StatusHistorySchema = new Schema<IStatusHistoryEntry>(
  {
    status: { type: String, enum: ORDER_STATUS_VALUES, required: true },
    timestamp: { type: Date, default: Date.now },
    changedBy: { type: Schema.Types.ObjectId }, // may reference a User or a Customer, so no single `ref`
    changedByRole: { type: String, required: true, default: 'SYSTEM' },
    note: { type: String },
  },
  { _id: false }
);

const DeliveryHistorySchema = new Schema<IDeliveryHistoryEntry>(
  {
    status: { type: String, enum: DELIVERY_STATUS_VALUES, required: true },
    timestamp: { type: Date, default: Date.now },
    changedBy: { type: Schema.Types.ObjectId },
    changedByRole: { type: String, required: true, default: 'SYSTEM' },
    note: { type: String },
  },
  { _id: false }
);

const DeliveryAddressSchema = new Schema<IDeliveryAddressSnapshot>(
  {
    line1: { type: String, required: true },
    line2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    latitude: { type: Number },
    longitude: { type: Number },
  },
  { _id: false }
);

const ManualDiscountSchema = new Schema<IManualDiscount>(
  {
    discountType: { type: String, enum: ['FLAT', 'PERCENT'], required: true },
    value: { type: Number, required: true },
    appliedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String },
  },
  { _id: false }
);

const OrderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, required: true, unique: true },
    tokenNumber: { type: String, required: true },
    outletId: { type: Schema.Types.ObjectId, ref: 'Outlet', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    tableId: { type: Schema.Types.ObjectId, ref: 'Table' },
    tableNumber: { type: String },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    orderType: { type: String, enum: ['DELIVERY', 'TAKEAWAY', 'DINE_IN', 'POS', 'CATERING'], required: true },
    items: { type: [OrderItemSchema], required: true, validate: (v: unknown[]) => v.length > 0 },
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    couponCode: { type: String },
    tax: { type: Number, required: true },
    packagingCharge: { type: Number, default: 0 },
    deliveryCharge: { type: Number, default: 0 },
    total: { type: Number, required: true },
    paymentStatus: { type: String, enum: PAYMENT_STATUS_VALUES, default: 'PENDING' },
    paymentMethod: { type: String, enum: ORDER_PAYMENT_METHOD_VALUES },
    orderStatus: { type: String, enum: ORDER_STATUS_VALUES, default: 'PENDING' },
    deliveryStatus: { type: String, enum: DELIVERY_STATUS_VALUES },
    deliveryHistory: { type: [DeliveryHistorySchema], default: [] },
    estimatedPreparationMinutesMin: { type: Number, required: true },
    estimatedPreparationMinutesMax: { type: Number, required: true },
    scheduledAt: { type: Date },
    deliveryAddress: { type: DeliveryAddressSchema },
    customerNotes: { type: String },
    statusHistory: { type: [StatusHistorySchema], default: [] },
    cancelledAt: { type: Date },
    cancelledBy: { type: String, enum: ['CUSTOMER', 'STAFF', 'ADMIN', 'SYSTEM'] },
    cancelledByUserId: { type: Schema.Types.ObjectId },
    cancellationReason: { type: String },
    cancellationNote: { type: String },
    previousOrderStatus: { type: String, enum: ORDER_STATUS_VALUES },
    paymentStatusAtCancellation: { type: String, enum: PAYMENT_STATUS_VALUES },
    isDeleted: { type: Boolean, default: false },
    inventoryConsumedAt: { type: Date },
    manualDiscount: { type: ManualDiscountSchema },
    stockOverrideApplied: { type: Boolean, default: false },
    deliveryStaffId: { type: Schema.Types.ObjectId, ref: 'User' },
    deliveryNotes: { type: String },
    partyOrderId: { type: Schema.Types.ObjectId, ref: 'PartyOrder' },
    loyaltyPointsRedeemed: { type: Number, default: 0 },
    loyaltyDiscountAmount: { type: Number, default: 0 },
    loyaltyPointsEarned: { type: Number, default: 0 },
    loyaltyPointsCreditedAt: { type: Date },
  },
  { timestamps: true }
);

OrderSchema.index({ orderNumber: 1 }, { unique: true });
OrderSchema.index({ outletId: 1, orderStatus: 1, createdAt: -1 });
OrderSchema.index({ outletId: 1, orderType: 1, createdAt: -1 });
OrderSchema.index({ customerId: 1, createdAt: -1 });
OrderSchema.index({ tableId: 1, orderStatus: 1 });
OrderSchema.index({ deliveryStaffId: 1, orderStatus: 1 });
OrderSchema.index({ outletId: 1, orderType: 1, orderStatus: 1, deliveryStatus: 1 });
OrderSchema.index({ outletId: 1, scheduledAt: 1 });

export const Order = model<IOrder>('Order', OrderSchema);
