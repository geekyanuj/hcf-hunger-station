import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import { CouponService } from '../services/coupon.service';

export const CouponController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const coupons = await CouponService.list({ activeOnly: req.query.activeOnly === 'true' });
    return sendSuccess(res, coupons);
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const coupon = await CouponService.getById(req.params.id);
    return sendSuccess(res, coupon);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth || req.auth.type !== 'STAFF') throw ApiError.forbidden('Staff access required');
    const coupon = await CouponService.create(req.body, { userId: req.auth.sub, ipAddress: req.ip });
    return sendSuccess(res, coupon, 'Coupon created', 201);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const coupon = await CouponService.update(req.params.id, req.body);
    return sendSuccess(res, coupon, 'Coupon updated');
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await CouponService.softDelete(req.params.id);
    return sendSuccess(res, null, 'Coupon deactivated');
  }),
};
