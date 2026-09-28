import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import { InventoryDashboardService } from '../services/inventoryDashboard.service';

export const InventoryDashboardController = {
  summary: asyncHandler(async (req: Request, res: Response) => {
    const outletId = req.query.outletId as string;
    if (!outletId) throw ApiError.badRequest('outletId query parameter is required');
    const summary = await InventoryDashboardService.summary(outletId);
    return sendSuccess(res, summary);
  }),
};
