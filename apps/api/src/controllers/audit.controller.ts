import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendPaginated } from '../utils/apiResponse';
import { AuditService } from '../services/audit.service';

export const AuditController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt((req.query.page as string) ?? '1', 10);
    const limit = parseInt((req.query.limit as string) ?? '20', 10);
    const { items, total } = await AuditService.list({
      outletId: req.query.outletId as string | undefined,
      entity: req.query.entity as string | undefined,
      action: req.query.action as never,
      page,
      limit,
    });
    return sendPaginated(res, items, { page, limit, total });
  }),
};
