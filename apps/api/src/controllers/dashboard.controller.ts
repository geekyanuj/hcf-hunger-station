import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { DashboardService } from '../services/dashboard.service';
import { resolveOutletScope } from './reportScope.util';
import { DashboardResetService } from '../services/dashboardReset.service';

export const DashboardController = {
  overview: asyncHandler(async (req: Request, res: Response) => {
    const scope = resolveOutletScope(req);
    const overview = await DashboardService.overview(scope);
    return sendSuccess(res, overview);
  }),

  /** Password-confirmed dashboard reset. Scope follows the same ?outletId= rules as the overview (ALL is owner-only). */
  reset: asyncHandler(async (req: Request, res: Response) => {
    const scope = resolveOutletScope(req);
    const result = await DashboardResetService.reset({
      userId: req.auth!.sub,
      password: req.body.password,
      scope,
      ipAddress: req.ip,
    });
    return sendSuccess(res, result, 'Dashboard reset');
  }),
};
