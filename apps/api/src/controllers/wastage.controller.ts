import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess, sendPaginated } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import { WastageService } from '../services/wastage.service';

export const WastageController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const outletId = req.query.outletId as string;
    if (!outletId) throw ApiError.badRequest('outletId query parameter is required');
    const page = parseInt((req.query.page as string) ?? '1', 10);
    const limit = parseInt((req.query.limit as string) ?? '20', 10);
    const { items, total } = await WastageService.list(outletId, {
      reason: req.query.reason as never,
      page,
      limit,
    });
    return sendPaginated(res, items, { page, limit, total });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth || req.auth.type !== 'STAFF') throw ApiError.forbidden('Staff access required');
    const { outletId, inventoryItemId, quantity, reason, notes } = req.body;
    const wastage = await WastageService.create(outletId, inventoryItemId, quantity, reason, notes, {
      userId: req.auth.sub,
      ipAddress: req.ip,
    });
    return sendSuccess(res, wastage, 'Wastage recorded', 201);
  }),
};
