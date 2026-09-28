import { Schema, model, Document, Types } from 'mongoose';

/**
 * Singleton-per-outlet (or a single global doc with outletId undefined,
 * treated as the default for outlets without their own override) loyalty
 * configuration. Nothing about points-per-rupee or redemption value is
 * hard-coded in the earning/redemption code — it's always read from here.
 */
export interface ILoyaltyConfig extends Document {
  outletId?: Types.ObjectId; // undefined = global default config
  isActive: boolean;
  pointsPerRupeeSpent: number; // e.g. 0.01 => ₹100 spent = 1 point
  redemptionValuePerPoint: number; // ₹ value of a single point when redeemed, e.g. 0.10 => 100 points = ₹10
  minPointsToRedeem: number;
  maxRedemptionPercentOfOrder: number; // caps how much of an order's total can be paid via points, e.g. 50 (%)
  pointsExpiryDays?: number; // undefined = points never expire
  createdAt: Date;
  updatedAt: Date;
}

const LoyaltyConfigSchema = new Schema<ILoyaltyConfig>(
  {
    outletId: { type: Schema.Types.ObjectId, ref: 'Outlet' },
    isActive: { type: Boolean, default: true },
    pointsPerRupeeSpent: { type: Number, default: 0.01 },
    redemptionValuePerPoint: { type: Number, default: 0.1 },
    minPointsToRedeem: { type: Number, default: 50 },
    maxRedemptionPercentOfOrder: { type: Number, default: 50 },
    pointsExpiryDays: { type: Number },
  },
  { timestamps: true }
);

LoyaltyConfigSchema.index({ outletId: 1 }, { unique: true, sparse: true });

export const LoyaltyConfig = model<ILoyaltyConfig>('LoyaltyConfig', LoyaltyConfigSchema);

export type LoyaltyTransactionType = 'EARN' | 'REDEEM' | 'EXPIRE' | 'ADJUST';

/**
 * Append-only ledger — same pattern as InventoryLedger in Part 2.
 * Customer.loyaltyPoints is a denormalized cache that must only ever be
 * updated by LoyaltyService alongside a ledger entry, so the two can never
 * drift.
 */
export interface ILoyaltyTransaction extends Document {
  customerId: Types.ObjectId;
  type: LoyaltyTransactionType;
  points: number; // signed: positive for EARN, negative for REDEEM/EXPIRE
  balanceAfter: number;
  orderId?: Types.ObjectId;
  notes?: string;
  createdAt: Date;
}

const LoyaltyTransactionSchema = new Schema<ILoyaltyTransaction>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    type: { type: String, enum: ['EARN', 'REDEEM', 'EXPIRE', 'ADJUST'], required: true },
    points: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    notes: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

LoyaltyTransactionSchema.index({ customerId: 1, createdAt: -1 });
LoyaltyTransactionSchema.index(
  { orderId: 1, type: 1 },
  { unique: true, partialFilterExpression: { orderId: { $exists: true } } }
);

export const LoyaltyTransaction = model<ILoyaltyTransaction>('LoyaltyTransaction', LoyaltyTransactionSchema);
