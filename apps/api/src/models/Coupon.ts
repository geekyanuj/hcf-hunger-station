import { Schema, model, Document, Types } from 'mongoose';

export type CouponDiscountType = 'FLAT' | 'PERCENT';
export type WeekDay = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export interface ICoupon extends Document {
  code: string; // e.g. "WELCOME50", stored uppercase, globally unique
  description?: string;
  discountType: CouponDiscountType;
  value: number; // flat amount or percentage, depending on discountType
  minOrderValue: number;
  maxDiscount?: number; // caps a PERCENT discount's absolute value
  applicableMenuItemIds: Types.ObjectId[]; // empty = applies to any item
  applicableCategoryIds: Types.ObjectId[]; // empty = applies to any category
  applicableOutletIds: Types.ObjectId[]; // empty = valid at all outlets
  newCustomerOnly: boolean;
  validDays: WeekDay[]; // empty = valid every day
  startDate?: Date;
  expiryDate?: Date;
  usageLimit?: number; // total redemptions across all customers; undefined = unlimited
  perCustomerUsageLimit?: number; // undefined = unlimited per customer
  totalRedemptions: number; // denormalized counter, only ever incremented via CouponService (see coupon.service.ts)
  isActive: boolean;
  isDeleted: boolean;
  createdByUserId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CouponSchema = new Schema<ICoupon>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String },
    discountType: { type: String, enum: ['FLAT', 'PERCENT'], required: true },
    value: { type: Number, required: true, min: 0 },
    minOrderValue: { type: Number, default: 0 },
    maxDiscount: { type: Number },
    applicableMenuItemIds: [{ type: Schema.Types.ObjectId, ref: 'MenuItem' }],
    applicableCategoryIds: [{ type: Schema.Types.ObjectId, ref: 'MenuCategory' }],
    applicableOutletIds: [{ type: Schema.Types.ObjectId, ref: 'Outlet' }],
    newCustomerOnly: { type: Boolean, default: false },
    validDays: [{ type: String, enum: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] }],
    startDate: { type: Date },
    expiryDate: { type: Date },
    usageLimit: { type: Number },
    perCustomerUsageLimit: { type: Number },
    totalRedemptions: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    createdByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

CouponSchema.index({ code: 1 }, { unique: true });
CouponSchema.index({ isActive: 1, expiryDate: 1 });

export const Coupon = model<ICoupon>('Coupon', CouponSchema);

/** One redemption record per (coupon, order) — enforces the per-customer usage limit via a query, and gives an audit trail. */
export interface ICouponRedemption extends Document {
  couponId: Types.ObjectId;
  customerId?: Types.ObjectId;
  orderId: Types.ObjectId;
  discountApplied: number;
  createdAt: Date;
}

const CouponRedemptionSchema = new Schema<ICouponRedemption>(
  {
    couponId: { type: Schema.Types.ObjectId, ref: 'Coupon', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    discountApplied: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

CouponRedemptionSchema.index({ couponId: 1, customerId: 1 });
CouponRedemptionSchema.index({ orderId: 1 }, { unique: true });

export const CouponRedemption = model<ICouponRedemption>('CouponRedemption', CouponRedemptionSchema);
