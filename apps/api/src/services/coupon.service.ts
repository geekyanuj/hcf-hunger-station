import { Types } from 'mongoose';
import { Coupon, CouponRedemption, ICoupon, WeekDay } from '../models/Coupon';
import { Order } from '../models/Order';
import { ApiError } from '../utils/ApiError';
import { round2 } from '../utils/format';
import { AuditContext } from './audit.service';

const WEEKDAY_BY_INDEX: WeekDay[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export interface CouponValidationContext {
  outletId: string;
  customerId?: string;
  subtotal: number;
  cartMenuItemIds: string[];
  cartCategoryIds: string[];
}

export interface CouponValidationResult {
  coupon: ICoupon;
  discountAmount: number;
}

/**
 * Validates a coupon code against every rule from the spec and computes the
 * exact discount amount, entirely server-side — the client never computes or
 * sends a discount figure for a coupon. Throws ApiError.badRequest with a
 * specific reason on the first rule that fails, so the UI can show a useful
 * message ("Minimum order value is 299", "This coupon has expired", etc).
 */
export const CouponService = {
  async validate(code: string, ctx: CouponValidationContext): Promise<CouponValidationResult> {
    const coupon = await Coupon.findOne({ code: code.toUpperCase(), isDeleted: false });
    if (!coupon) throw ApiError.badRequest('Invalid coupon code');
    if (!coupon.isActive) throw ApiError.badRequest('This coupon is no longer active');

    const now = new Date();
    if (coupon.startDate && now < coupon.startDate) throw ApiError.badRequest('This coupon is not active yet');
    if (coupon.expiryDate && now > coupon.expiryDate) throw ApiError.badRequest('This coupon has expired');

    if (coupon.validDays.length > 0) {
      const today = WEEKDAY_BY_INDEX[now.getDay()];
      if (!coupon.validDays.includes(today)) throw ApiError.badRequest('This coupon is not valid today');
    }

    if (coupon.applicableOutletIds.length > 0 && !coupon.applicableOutletIds.some((id) => id.toString() === ctx.outletId)) {
      throw ApiError.badRequest('This coupon is not valid at this outlet');
    }

    if (coupon.minOrderValue > 0 && ctx.subtotal < coupon.minOrderValue) {
      throw ApiError.badRequest(`Minimum order value for this coupon is Rs.${coupon.minOrderValue}`);
    }

    if (coupon.applicableMenuItemIds.length > 0) {
      const hasApplicableItem = coupon.applicableMenuItemIds.some((id) => ctx.cartMenuItemIds.includes(id.toString()));
      if (!hasApplicableItem) throw ApiError.badRequest('This coupon does not apply to any item in your cart');
    }

    if (coupon.applicableCategoryIds.length > 0) {
      const hasApplicableCategory = coupon.applicableCategoryIds.some((id) => ctx.cartCategoryIds.includes(id.toString()));
      if (!hasApplicableCategory) throw ApiError.badRequest('This coupon does not apply to any category in your cart');
    }

    if (coupon.newCustomerOnly) {
      if (!ctx.customerId) throw ApiError.badRequest('This coupon is only valid for new customers - please sign in');
      const priorOrders = await Order.countDocuments({ customerId: ctx.customerId, isDeleted: false });
      if (priorOrders > 0) throw ApiError.badRequest('This coupon is only valid for new customers');
    }

    if (coupon.usageLimit !== undefined && coupon.totalRedemptions >= coupon.usageLimit) {
      throw ApiError.badRequest('This coupon has reached its usage limit');
    }

    if (coupon.perCustomerUsageLimit !== undefined) {
      if (!ctx.customerId) throw ApiError.badRequest('Please sign in to use this coupon');
      const customerUsage = await CouponRedemption.countDocuments({ couponId: coupon._id, customerId: ctx.customerId });
      if (customerUsage >= coupon.perCustomerUsageLimit) {
        throw ApiError.badRequest('You have already used this coupon the maximum number of times');
      }
    }

    let discountAmount =
      coupon.discountType === 'PERCENT' ? round2((ctx.subtotal * coupon.value) / 100) : coupon.value;
    if (coupon.maxDiscount !== undefined) discountAmount = Math.min(discountAmount, coupon.maxDiscount);
    discountAmount = Math.min(discountAmount, ctx.subtotal); // never discount more than the order is worth

    return { coupon, discountAmount: round2(discountAmount) };
  },

  /** Records a redemption and bumps the coupon's usage counter. Called once an order is actually created (not on preview). */
  async recordRedemption(couponId: Types.ObjectId, customerId: string | undefined, orderId: Types.ObjectId, discountApplied: number) {
    await CouponRedemption.create({ couponId, customerId, orderId, discountApplied });
    await Coupon.updateOne({ _id: couponId }, { $inc: { totalRedemptions: 1 } });
  },

  async list(filters: { activeOnly?: boolean }) {
    const query: Record<string, unknown> = { isDeleted: false };
    if (filters.activeOnly) query.isActive = true;
    return Coupon.find(query).sort({ createdAt: -1 });
  },

  async create(payload: Record<string, unknown>, ctx: AuditContext) {
    return Coupon.create({ ...payload, createdByUserId: ctx.userId });
  },

  async update(id: string, payload: Record<string, unknown>) {
    const coupon = await Coupon.findOneAndUpdate({ _id: id, isDeleted: false }, payload, { new: true });
    if (!coupon) throw ApiError.notFound('Coupon not found');
    return coupon;
  },

  async softDelete(id: string) {
    const coupon = await Coupon.findOneAndUpdate({ _id: id }, { isDeleted: true, isActive: false }, { new: true });
    if (!coupon) throw ApiError.notFound('Coupon not found');
    return coupon;
  },

  async getById(id: string) {
    const coupon = await Coupon.findOne({ _id: id, isDeleted: false });
    if (!coupon) throw ApiError.notFound('Coupon not found');
    return coupon;
  },
};
