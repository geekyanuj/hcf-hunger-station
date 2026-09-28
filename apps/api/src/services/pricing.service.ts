import { Types } from 'mongoose';
import { MenuItem } from '../models/MenuItem';
import { Modifier } from '../models/Modifier';
import { Outlet } from '../models/Outlet';
import { ApiError } from '../utils/ApiError';
import { round2 } from '../utils/format';
import { IOrderItem, ISelectedModifierOption, OrderType } from '../models/Order';
import { CouponService } from './coupon.service';
import { LoyaltyService } from './loyalty.service';
import { ICoupon } from '../models/Coupon';

export interface CartLineInput {
  menuItemId: string;
  quantity: number;
  selectedOptionIds: string[]; // Modifier option _ids chosen by the customer
  notes?: string;
}

export interface PricedCart {
  items: IOrderItem[];
  subtotal: number;
  discount: number;
  couponDiscount: number;
  loyaltyDiscount: number;
  loyaltyPointsToRedeem: number;
  tax: number;
  packagingCharge: number;
  deliveryCharge: number;
  total: number;
  appliedCoupon?: { couponId: string; code: string; description?: string };
}

const TAX_RATE: Record<string, number> = { GST_5: 0.05, GST_12: 0.12, GST_18: 0.18, EXEMPT: 0 };

/**
 * Recomputes every price server-side from the current MenuItem/Modifier
 * documents. The client only ever sends menuItemId + quantity + chosen option
 * ids - it never sends prices, and any price field in the request body is
 * ignored entirely. This is the single choke point that guarantees a
 * tampered client cannot change what gets charged.
 *
 * Part 3: coupon codes are validated through the real rules engine
 * (CouponService), and a customer may additionally request to redeem loyalty
 * points — both discounts stack (coupon first, then loyalty against the
 * coupon-discounted total), and both are recomputed here, never trusted from
 * the client.
 */
export const PricingService = {
  async priceCart(
    outletId: string,
    lines: CartLineInput[],
    orderType: OrderType,
    couponCode?: string,
    customerId?: string,
    loyaltyPointsRequested = 0
  ): Promise<PricedCart> {
    if (lines.length === 0) throw ApiError.badRequest('Cart is empty');

    const outlet = await Outlet.findById(outletId);
    if (!outlet || !outlet.isActive) throw ApiError.notFound('Outlet not found or inactive');

    const menuItemIds = lines.map((l) => l.menuItemId);
    const menuItems = await MenuItem.find({ _id: { $in: menuItemIds }, outletId, isDeleted: false });
    const menuItemMap = new Map(menuItems.map((m) => [m.id, m]));

    const allOptionIds = lines.flatMap((l) => l.selectedOptionIds);
    const modifiers = await Modifier.find({ outletId, 'options._id': { $in: allOptionIds } });

    const orderItems: IOrderItem[] = [];
    let subtotal = 0;
    let taxTotal = 0;

    for (const line of lines) {
      const menuItem = menuItemMap.get(line.menuItemId);
      if (!menuItem) throw ApiError.badRequest(`Menu item ${line.menuItemId} is not available at this outlet`);
      if (!menuItem.isAvailable) throw ApiError.badRequest(`"${menuItem.name}" is currently unavailable`);
      if (line.quantity < 1 || line.quantity > 50) throw ApiError.badRequest('Invalid quantity');

      const basePrice = menuItem.discountPrice ?? menuItem.price;
      const selectedModifiers: ISelectedModifierOption[] = [];

      for (const optionId of line.selectedOptionIds) {
        const modifier = modifiers.find((m) => m.options.some((o) => o.id === optionId));
        const option = modifier?.options.find((o) => o.id === optionId);
        if (!modifier || !option) throw ApiError.badRequest(`Invalid modifier option: ${optionId}`);
        if (!option.isAvailable) throw ApiError.badRequest(`"${option.name}" is currently unavailable`);
        selectedModifiers.push({
          modifierId: modifier._id as Types.ObjectId,
          modifierName: modifier.name,
          optionName: option.name,
          priceDelta: option.priceDelta,
        });
      }

      const modifierTotal = selectedModifiers.reduce((sum, m) => sum + m.priceDelta, 0);
      const unitPrice = round2(basePrice + modifierTotal);
      const lineTotal = round2(unitPrice * line.quantity);
      const taxRate = TAX_RATE[menuItem.taxCategory] ?? 0.05;

      subtotal += lineTotal;
      taxTotal += lineTotal * taxRate;

      orderItems.push({
        menuItemId: menuItem._id as Types.ObjectId,
        name: menuItem.name,
        unitPrice: basePrice,
        quantity: line.quantity,
        selectedModifiers,
        lineTotal,
        notes: line.notes,
        preparationTimeMinutes: menuItem.preparationTimeMinutes,
      });
    }
    subtotal = round2(subtotal);

    // 1. Coupon (real, server-validated rules engine — see coupon.service.ts)
    let couponDiscount = 0;
    let appliedCoupon: ICoupon | undefined;
    if (couponCode) {
      const result = await CouponService.validate(couponCode, {
        outletId,
        customerId,
        subtotal,
        cartMenuItemIds: orderItems.map((i) => i.menuItemId.toString()),
        cartCategoryIds: menuItems.map((m) => m.categoryId.toString()),
      });
      couponDiscount = result.discountAmount;
      appliedCoupon = result.coupon;
    }

    const afterCoupon = round2(subtotal - couponDiscount);

    // 2. Loyalty points redemption, applied against the coupon-discounted total
    let loyaltyDiscount = 0;
    let loyaltyPointsToRedeem = 0;
    if (customerId && loyaltyPointsRequested > 0) {
      const preview = await LoyaltyService.previewRedemption(customerId, outletId, afterCoupon, loyaltyPointsRequested);
      loyaltyDiscount = preview.discountAmount;
      loyaltyPointsToRedeem = preview.pointsToRedeem;
    }

    const discount = round2(couponDiscount + loyaltyDiscount);
    const discountedSubtotal = round2(subtotal - discount);
    const tax = round2(taxTotal * (discountedSubtotal / (subtotal || 1))); // scale tax proportionally to discount
    const packagingCharge = orderType === 'DINE_IN' ? 0 : outlet.settings.packagingCharge;
    const deliveryCharge = orderType === 'DELIVERY' ? outlet.settings.deliveryBaseCharge : 0;

    const total = round2(discountedSubtotal + tax + packagingCharge + deliveryCharge);

    return {
      items: orderItems,
      subtotal,
      discount,
      couponDiscount,
      loyaltyDiscount,
      loyaltyPointsToRedeem,
      tax,
      packagingCharge,
      deliveryCharge,
      total,
      appliedCoupon: appliedCoupon ? { couponId: (appliedCoupon._id as Types.ObjectId).toString(), code: appliedCoupon.code, description: appliedCoupon.description } : undefined,
    };
  },
};
