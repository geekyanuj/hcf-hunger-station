import { z } from 'zod';

const cartLineSchema = z.object({
  menuItemId: z.string().length(24),
  quantity: z.number().int().min(1).max(50),
  selectedOptionIds: z.array(z.string()).default([]),
  notes: z.string().max(300).optional(),
});

export const createOrderSchema = z.object({
  body: z.object({
    outletId: z.string().length(24),
    orderType: z.enum(['DELIVERY', 'TAKEAWAY', 'DINE_IN', 'POS', 'CATERING']),
    tableQrToken: z.string().optional(),
    /** Staff-only (POS): pick the table directly instead of scanning its QR. Stripped for customer requests by the controller. */
    tableId: z.string().length(24).optional(),
    paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'ONLINE', 'PAY_AFTER_DINE_IN']).optional(),
    lines: z.array(cartLineSchema).min(1),
    couponCode: z.string().optional(),
    loyaltyPointsToRedeem: z.number().int().min(0).optional(),
    scheduledAt: z.string().datetime().optional(),
    deliveryAddress: z
      .object({
        line1: z.string().min(3),
        line2: z.string().optional(),
        city: z.string().min(2),
        state: z.string().min(2),
        pincode: z.string().min(4),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
      })
      .optional(),
    customerNotes: z.string().max(500).optional(),
    manualDiscount: z
      .object({
        discountType: z.enum(['FLAT', 'PERCENT']),
        value: z.number().positive(),
        reason: z.string().max(200).optional(),
      })
      .optional(),
    overrideStockCheck: z.boolean().optional(),
  }),
  query: z.any().optional(),
  params: z.any().optional(),
});

export const priceCartSchema = z.object({
  body: z.object({
    outletId: z.string().length(24),
    orderType: z.enum(['DELIVERY', 'TAKEAWAY', 'DINE_IN', 'POS', 'CATERING']),
    lines: z.array(cartLineSchema).min(1),
    couponCode: z.string().optional(),
    loyaltyPointsToRedeem: z.number().int().min(0).optional(),
  }),
  query: z.any().optional(),
  params: z.any().optional(),
});

const orderStatusEnum = z.enum(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED']);

/**
 * All seven canonical statuses are accepted syntactically so that an illegal
 * request (e.g. PREPARING → PENDING) is rejected by the state machine with a
 * meaningful message, rather than by a generic schema error. Legacy statuses
 * (RECEIVED, ASSIGNED, PICKED_UP, DELIVERED) no longer exist and fail validation.
 */
export const updateOrderStatusSchema = z.object({
  body: z.object({
    status: orderStatusEnum,
    note: z.string().max(300).optional(),
    /** Required by the state machine when staff cancel after preparation has started. */
    reason: z.string().max(200).optional(),
    /** The status the caller's screen was showing; a mismatch yields a controlled "already updated" 409. */
    expectedStatus: orderStatusEnum.optional(),
  }),
  query: z.any().optional(),
  params: z.any().optional(),
});

export const cancelOrderSchema = z.object({
  body: z
    .object({
      reason: z.string().max(200).optional(),
      note: z.string().max(300).optional(),
      expectedStatus: orderStatusEnum.optional(),
    })
    .optional()
    .default({}),
  query: z.any().optional(),
  params: z.any().optional(),
});

export const assignDeliverySchema = z.object({
  body: z.object({ deliveryStaffId: z.string().length(24) }),
  query: z.any().optional(),
  params: z.any().optional(),
});

export const createMenuCategorySchema = z.object({
  body: z.object({
    outletId: z.string().length(24),
    name: z.string().min(2),
    description: z.string().optional(),
    image: z.string().optional(),
    sortOrder: z.number().optional(),
  }),
  query: z.any().optional(),
  params: z.any().optional(),
});

export const createMenuItemSchema = z.object({
  body: z.object({
    outletId: z.string().length(24),
    categoryId: z.string().length(24),
    name: z.string().min(2),
    description: z.string().optional(),
    images: z.array(z.string()).optional(),
    price: z.number().positive(),
    discountPrice: z.number().positive().optional(),
    offerPercent: z.number().min(0).max(100).optional(),
    ingredients: z.array(z.string()).optional(),
    taxCategory: z.enum(['GST_5', 'GST_12', 'GST_18', 'EXEMPT']).optional(),
    preparationTimeMinutes: z.number().int().positive(),
    isVeg: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    modifierIds: z.array(z.string()).optional(),
  }),
  query: z.any().optional(),
  params: z.any().optional(),
});

export const updateMenuItemSchema = z.object({
  body: z.object({
    categoryId: z.string().length(24).optional(),
    name: z.string().min(2).optional(),
    description: z.string().optional(),
    images: z.array(z.string()).optional(),
    price: z.number().positive().optional(),
    discountPrice: z.number().positive().optional(),
    offerPercent: z.number().min(0).max(100).optional(),
    ingredients: z.array(z.string()).optional(),
    taxCategory: z.enum(['GST_5', 'GST_12', 'GST_18', 'EXEMPT']).optional(),
    preparationTimeMinutes: z.number().int().positive().optional(),
    isVeg: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    isAvailable: z.boolean().optional(),
    modifierIds: z.array(z.string()).optional(),
  }),
  query: z.any().optional(),
  params: z.any().optional(),
});
