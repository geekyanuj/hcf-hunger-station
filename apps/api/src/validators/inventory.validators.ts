import { z } from 'zod';

const unitEnum = z.enum(['kg', 'g', 'litre', 'ml', 'piece', 'packet', 'box']);

export const createInventoryItemSchema = z.object({
  body: z.object({
    outletId: z.string().length(24),
    name: z.string().min(2),
    sku: z.string().min(1),
    category: z.string().min(1),
    unit: unitEnum,
    currentStock: z.number().min(0).optional(),
    minimumStock: z.number().min(0),
    maximumStock: z.number().min(0).optional(),
    reorderLevel: z.number().min(0).optional(),
    costPerUnit: z.number().min(0),
    supplierId: z.string().length(24).optional(),
    expiryDate: z.string().datetime().optional(),
    batchNumber: z.string().optional(),
  }),
  query: z.any().optional(),
  params: z.any().optional(),
});

export const updateInventoryItemSchema = z.object({
  body: createInventoryItemSchema.shape.body.partial(),
  query: z.any().optional(),
  params: z.any().optional(),
});

export const adjustStockSchema = z.object({
  body: z.object({
    outletId: z.string().length(24),
    delta: z.number().refine((v) => v !== 0, 'delta must be non-zero'),
    notes: z.string().max(300).optional(),
  }),
  query: z.any().optional(),
  params: z.any().optional(),
});

export const upsertRecipeSchema = z.object({
  body: z.object({
    outletId: z.string().length(24),
    menuItemId: z.string().length(24),
    yieldServings: z.number().int().positive().optional(),
    ingredients: z
      .array(
        z.object({
          inventoryItemId: z.string().length(24),
          quantity: z.number().positive(),
          unit: unitEnum,
        })
      )
      .min(1),
  }),
  query: z.any().optional(),
  params: z.any().optional(),
});

export const createSupplierSchema = z.object({
  body: z.object({
    outletId: z.string().length(24),
    name: z.string().min(2),
    contactPerson: z.string().optional(),
    phone: z.string().min(6),
    email: z.string().email().optional(),
    address: z.string().optional(),
    gstin: z.string().optional(),
    paymentTerms: z.string().optional(),
    notes: z.string().optional(),
  }),
  query: z.any().optional(),
  params: z.any().optional(),
});

export const createPurchaseSchema = z.object({
  body: z.object({
    outletId: z.string().length(24),
    supplierId: z.string().length(24),
    invoiceNumber: z.string().optional(),
    purchaseDate: z.string().datetime().optional(),
    lines: z
      .array(
        z.object({
          inventoryItemId: z.string().length(24),
          quantity: z.number().positive(),
          rate: z.number().min(0),
          taxPercent: z.number().min(0).max(100).optional(),
        })
      )
      .min(1),
  }),
  query: z.any().optional(),
  params: z.any().optional(),
});

export const createWastageSchema = z.object({
  body: z.object({
    outletId: z.string().length(24),
    inventoryItemId: z.string().length(24),
    quantity: z.number().positive(),
    reason: z.enum([
      'BURNT_FOOD',
      'EXPIRED',
      'SPOILAGE',
      'PREPARATION_MISTAKE',
      'CANCELLATION',
      'DAMAGED_PACKAGING',
      'OTHER',
    ]),
    notes: z.string().max(300).optional(),
  }),
  query: z.any().optional(),
  params: z.any().optional(),
});
