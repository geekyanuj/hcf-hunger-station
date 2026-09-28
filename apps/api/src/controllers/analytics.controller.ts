import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { AnalyticsService } from '../services/analytics.service';
import { resolveOutletScope, parseDateRange } from './reportScope.util';

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
    const limit = parseInt((req.query.limit as string) ?? '10', 10);
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
