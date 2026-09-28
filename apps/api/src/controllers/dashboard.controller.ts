import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { DashboardService } from '../services/dashboard.service';
import { resolveOutletScope } from './reportScope.util';

export const DashboardController = {
  overview: asyncHandler(async (req: Request, res: Response) => {
    const scope = resolveOutletScope(req);
    const overview = await DashboardService.overview(scope);
    return sendSuccess(res, overview);
  }),
};
