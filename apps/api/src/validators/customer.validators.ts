import { z } from 'zod';

const objectId = z.string().length(24);

export const deliveryAddressSchema = z.object({
  label: z.string().trim().max(30).optional(),
  line1: z.string().trim().min(3, 'Enter your house / street address').max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2, 'Enter your city').max(80),
  state: z.string().trim().min(2, 'Enter your state').max(80),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Enter a valid 6-digit pincode'),
});

export const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Enter your full name').max(80).optional(),
    email: z.string().trim().email().optional().or(z.literal('').transform(() => undefined)),
  }),
  query: z.any().optional(),
  params: z.any().optional(),
});

export const addAddressSchema = z.object({
  body: deliveryAddressSchema.extend({ isDefault: z.boolean().optional() }),
  query: z.any().optional(),
  params: z.any().optional(),
});

/** One call for the "name + address" step that is required before a delivery order. */
export const deliveryDetailsSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Enter your full name').max(80),
    email: z.string().trim().email().optional().or(z.literal('').transform(() => undefined)),
    /** Edit this saved address; omit to add a new one. */
    addressId: objectId.optional(),
    address: deliveryAddressSchema,
  }),
  query: z.any().optional(),
  params: z.any().optional(),
});

export const addressIdParamSchema = z.object({
  body: z.any().optional(),
  query: z.any().optional(),
  params: z.object({ addressId: objectId }),
});

export const setDefaultAddressSchema = addressIdParamSchema;
