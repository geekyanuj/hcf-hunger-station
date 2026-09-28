import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess, sendPaginated } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import { LoyaltyService } from '../services/loyalty.service';

export const LoyaltyController = {
  getConfig: asyncHandler(async (req: Request, res: Response) => {
    const config = await LoyaltyService.getConfig(req.query.outletId as string | undefined);
    return sendSuccess(res, config);
  }),

  upsertConfig: asyncHandler(async (req: Request, res: Response) => {
    const config = await LoyaltyService.upsertConfig(req.body.outletId, req.body);
    return sendSuccess(res, config, 'Loyalty configuration saved');
  }),

  myBalance: asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth || req.auth.type !== 'CUSTOMER') throw ApiError.forbidden('Customer access required');
    const balance = await LoyaltyService.getBalance(req.auth.sub);
    return sendSuccess(res, { balance });
  }),

  myHistory: asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth || req.auth.type !== 'CUSTOMER') throw ApiError.forbidden('Customer access required');
    const page = parseInt((req.query.page as string) ?? '1', 10);
    const limit = parseInt((req.query.limit as string) ?? '20', 10);
    const { items, total } = await LoyaltyService.history(req.auth.sub, page, limit);
    return sendPaginated(res, items, { page, limit, total });
  }),

  previewRedemption: asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth || req.auth.type !== 'CUSTOMER') throw ApiError.forbidden('Customer access required');
    const { outletId, orderTotal, pointsRequested } = req.body;
    const preview = await LoyaltyService.previewRedemption(req.auth.sub, outletId, orderTotal, pointsRequested);
    return sendSuccess(res, preview);
  }),

  adjust: asyncHandler(async (req: Request, res: Response) => {
    const { customerId, points, notes } = req.body;
    const customer = await LoyaltyService.adjust(customerId, points, notes);
    return sendSuccess(res, customer, 'Loyalty balance adjusted');
  }),
};
