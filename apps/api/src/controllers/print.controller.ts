import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import { PrintService } from '../services/print.service';
import { StaffAccessTokenPayload } from '../types/auth';

function staff(req: Request): StaffAccessTokenPayload {
  if (!req.auth || req.auth.type !== 'STAFF') throw ApiError.forbidden('Staff access required');
  return req.auth;
}

export const PrintController = {
  status: asyncHandler(async (_req: Request, res: Response) => sendSuccess(res, PrintService.status())),

  printToken: asyncHandler(async (req: Request, res: Response) => {
    const result = await PrintService.printToken(req.params.orderId, staff(req), { copies: req.body?.copies });
    return sendSuccess(res, result, 'Token ready for browser print preview');
  }),

  previewToken: asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await PrintService.previewToken(req.params.orderId, staff(req)))
  ),

  testPrint: asyncHandler(async (req: Request, res: Response) => {
    const result = await PrintService.testPrint(staff(req), req.body.outletId);
    return sendSuccess(res, result, 'Test slip ready for browser print preview');
  }),

  jobs: asyncHandler(async (req: Request, res: Response) =>
    sendSuccess(res, await PrintService.recentJobs(req.query.outletId as string, staff(req), Number(req.query.limit) || 20))
  ),
};
