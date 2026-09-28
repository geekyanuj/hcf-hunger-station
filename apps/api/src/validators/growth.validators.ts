import { z } from 'zod';

export const createCouponSchema = z.object({
  body: z.object({
    code: z.string().min(3).max(30),
    description: z.string().optional(),
    discountType: z.enum(['FLAT', 'PERCENT']),
    value: z.number().positive(),
    minOrderValue: z.number().min(0).optional(),
    maxDiscount: z.number().positive().optional(),
    applicableMenuItemIds: z.array(z.string()).optional(),
    applicableCategoryIds: z.array(z.string()).optional(),
    applicableOutletIds: z.array(z.string()).optional(),
    newCustomerOnly: z.boolean().optional(),
    validDays: z.array(z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'])).optional(),
    startDate: z.string().datetime().optional(),
    expiryDate: z.string().datetime().optional(),
    usageLimit: z.number().int().positive().optional(),
    perCustomerUsageLimit: z.number().int().positive().optional(),
    isActive: z.boolean().optional(),
  }),
  query: z.any().optional(),
  params: z.any().optional(),
});

export const updateCouponSchema = z.object({
  body: createCouponSchema.shape.body.partial(),
  query: z.any().optional(),
  params: z.any().optional(),
});

export const upsertLoyaltyConfigSchema = z.object({
  body: z.object({
    outletId: z.string().length(24).optional(),
    isActive: z.boolean().optional(),
    pointsPerRupeeSpent: z.number().min(0).optional(),
    redemptionValuePerPoint: z.number().min(0).optional(),
    minPointsToRedeem: z.number().min(0).optional(),
    maxRedemptionPercentOfOrder: z.number().min(0).max(100).optional(),
    pointsExpiryDays: z.number().int().positive().optional(),
  }),
  query: z.any().optional(),
  params: z.any().optional(),
});

export const submitPartyOrderSchema = z.object({
  body: z.object({
    outletId: z.string().length(24),
    contactName: z.string().min(2),
    contactPhone: z.string().min(6),
    contactEmail: z.string().email().optional(),
    eventType: z.enum(['BIRTHDAY', 'WEDDING', 'OFFICE', 'PARTY', 'OTHER']),
    expectedGuests: z.number().int().positive(),
    eventDate: z.string().datetime(),
    eventTime: z.string().min(3),
    foodPreference: z.enum(['VEG', 'NON_VEG', 'MIXED']),
    requirements: z.string().optional(),
    approximateBudget: z.number().positive().optional(),
    deliverySetupRequired: z.boolean().optional(),
  }),
  query: z.any().optional(),
  params: z.any().optional(),
});

export const addQuotationSchema = z.object({
  body: z.object({
    description: z.string().min(3),
    amount: z.number().positive(),
    validUntil: z.string().datetime().optional(),
    notes: z.string().optional(),
  }),
  query: z.any().optional(),
  params: z.any().optional(),
});

export const convertPartyOrderSchema = z.object({
  body: z.object({
    lines: z
      .array(
        z.object({
          menuItemId: z.string().length(24),
          quantity: z.number().int().positive(),
          selectedOptionIds: z.array(z.string()).default([]),
          notes: z.string().optional(),
        })
      )
      .min(1),
    scheduledAt: z.string().datetime().optional(),
    deliveryAddress: z
      .object({
        line1: z.string().min(3),
        line2: z.string().optional(),
        city: z.string().min(2),
        state: z.string().min(2),
        pincode: z.string().min(4),
      })
      .optional(),
  }),
  query: z.any().optional(),
  params: z.any().optional(),
});
