import { z } from 'zod';

export const printTokenSchema = z.object({
  body: z
    .object({ copies: z.number().int().min(1).max(5).optional() })
    .optional()
    .default({}),
  query: z.any().optional(),
  params: z.object({ orderId: z.string().length(24) }),
});

export const orderIdParamSchema = z.object({
  body: z.any().optional(),
  query: z.any().optional(),
  params: z.object({ orderId: z.string().length(24) }),
});

export const testPrintSchema = z.object({
  body: z.object({ outletId: z.string().length(24) }),
  query: z.any().optional(),
  params: z.any().optional(),
});

export const printJobsSchema = z.object({
  body: z.any().optional(),
  query: z.object({ outletId: z.string().length(24), limit: z.coerce.number().int().min(1).max(100).optional() }),
  params: z.any().optional(),
});
