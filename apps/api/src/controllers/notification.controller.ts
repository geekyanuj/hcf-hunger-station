import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import { NotificationService } from '../services/notification.service';

function principal(req: Request): { type: 'USER' | 'CUSTOMER'; id: string } {
  if (!req.auth) throw ApiError.unauthorized('Login required');
  return { type: req.auth.type === 'STAFF' ? 'USER' : 'CUSTOMER', id: req.auth.sub };
}

export const NotificationController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const { type, id } = principal(req);
    const page = parseInt((req.query.page as string) ?? '1', 10);
    const limit = parseInt((req.query.limit as string) ?? '20', 10);
    const result = await NotificationService.listForPrincipal(type, id, page, limit);
    return sendSuccess(res, result);
  }),

  markRead: asyncHandler(async (req: Request, res: Response) => {
    const { id } = principal(req);
    await NotificationService.markRead(req.params.id, id);
    return sendSuccess(res, null, 'Marked as read');
  }),

  markAllRead: asyncHandler(async (req: Request, res: Response) => {
    const { type, id } = principal(req);
    await NotificationService.markAllRead(type, id);
    return sendSuccess(res, null, 'All notifications marked as read');
  }),
};
