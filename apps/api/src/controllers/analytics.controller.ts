import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { AnalyticsService } from '../services/analytics.service';
import { resolveOutletScope, parseDateRange } from './reportScope.util';
import { ApiError } from '../utils/ApiError';

export const AnalyticsController = {
  revenueOverTime: asyncHandler(async (req: Request, res: Response) => {
    const scope = resolveOutletScope(req);
    const range = parseDateRange(req);
    return sendSuccess(res, await AnalyticsService.revenueOverTime(scope, range));
  }),
  orderTypeDistribution: asyncHandler(async (req: Request, res: Response) => {
    const scope = resolveOutletScope(req);
    const range = parseDateRange(req);
    return sendSuccess(res, await AnalyticsService.orderTypeDistribution(scope, range));
  }),
  topProducts: asyncHandler(async (req: Request, res: Response) => {
    const scope = resolveOutletScope(req);
    const range = parseDateRange(req);
    const rawLimit = req.query.limit;
    const limit = rawLimit === undefined ? 10 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw ApiError.badRequest('limit must be an integer between 1 and 100');
    }
    return sendSuccess(res, await AnalyticsService.topProducts(scope, range, limit));
  }),
  categoryPerformance: asyncHandler(async (req: Request, res: Response) => {
    const scope = resolveOutletScope(req);
    const range = parseDateRange(req);
    return sendSuccess(res, await AnalyticsService.categoryPerformance(scope, range));
  }),
  paymentMethodBreakdown: asyncHandler(async (req: Request, res: Response) => {
    const scope = resolveOutletScope(req);
    const range = parseDateRange(req);
    return sendSuccess(res, await AnalyticsService.paymentMethodBreakdown(scope, range));
  }),
  purchaseTrend: asyncHandler(async (req: Request, res: Response) => {
    const scope = resolveOutletScope(req);
    const range = parseDateRange(req);
    return sendSuccess(res, await AnalyticsService.purchaseTrend(scope, range));
  }),
  wastageTrend: asyncHandler(async (req: Request, res: Response) => {
    const scope = resolveOutletScope(req);
    const range = parseDateRange(req);
    return sendSuccess(res, await AnalyticsService.wastageTrend(scope, range));
  }),
  foodCost: asyncHandler(async (req: Request, res: Response) => {
    const scope = resolveOutletScope(req);
    const range = parseDateRange(req);
    return sendSuccess(res, await AnalyticsService.foodCostSummary(scope, range));
  }),
  outletPerformance: asyncHandler(async (req: Request, res: Response) => {
    const scope = resolveOutletScope(req);
    const range = parseDateRange(req);
    return sendSuccess(res, await AnalyticsService.outletPerformance(scope, range));
  }),
  staffPerformance: asyncHandler(async (req: Request, res: Response) => {
    const scope = resolveOutletScope(req);
    const range = parseDateRange(req);
    return sendSuccess(res, await AnalyticsService.staffPerformance(scope, range));
  }),
};
