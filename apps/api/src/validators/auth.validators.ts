import { z } from 'zod';

export const staffLoginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(6),
  }),
  query: z.any().optional(),
  params: z.any().optional(),
});

const addressSchema = z.object({
  label: z.string().optional(),
  line1: z.string().min(3),
  line2: z.string().optional(),
  city: z.string().min(2),
  state: z.string().min(2),
  pincode: z.string().min(4),
});

export const customerLoginSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    mobile: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
    email: z.string().email().optional(),
    address: addressSchema.optional(),
  }),
  query: z.any().optional(),
  params: z.any().optional(),
});

export const refreshSchema = z.object({
  body: z.object({ refreshToken: z.string().min(10) }),
  query: z.any().optional(),
  params: z.any().optional(),
});

export const forgotPasswordSchema = z.object({
  body: z.object({ email: z.string().email() }),
  query: z.any().optional(),
  params: z.any().optional(),
});

export const resetPasswordSchema = z.object({
  body: z.object({ token: z.string().min(10), newPassword: z.string().min(8) }),
  query: z.any().optional(),
  params: z.any().optional(),
});

export const changePasswordSchema = z.object({
  body: z.object({ currentPassword: z.string().min(6), newPassword: z.string().min(8) }),
  query: z.any().optional(),
  params: z.any().optional(),
});

export const dashboardResetSchema = z.object({
  body: z.object({ password: z.string().min(1, 'Password is required').max(200) }),
  query: z.any().optional(),
  params: z.any().optional(),
});
