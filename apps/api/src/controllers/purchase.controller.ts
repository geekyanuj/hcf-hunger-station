import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess, sendPaginated } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import { PurchaseService } from '../services/purchase.service';

export const PurchaseController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const outletId = req.query.outletId as string;
    if (!outletId) throw ApiError.badRequest('outletId query parameter is required');
    const page = parseInt((req.query.page as string) ?? '1', 10);
    const limit = parseInt((req.query.limit as string) ?? '20', 10);
    const { items, total } = await PurchaseService.list(outletId, {
      status: req.query.status as string | undefined,
      supplierId: req.query.supplierId as string | undefined,
      page,
      limit,
    });
    return sendPaginated(res, items, { page, limit, total });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const purchase = await PurchaseService.getById(req.params.id);
    return sendSuccess(res, purchase);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth || req.auth.type !== 'STAFF') throw ApiError.forbidden('Staff access required');
    const { outletId, supplierId, lines, invoiceNumber, purchaseDate } = req.body;
    const purchase = await PurchaseService.create(outletId, supplierId, lines, invoiceNumber, purchaseDate, req.auth.sub);
    return sendSuccess(res, purchase, 'Purchase created (draft)', 201);
  }),

  complete: asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth || req.auth.type !== 'STAFF') throw ApiError.forbidden('Staff access required');
    const purchase = await PurchaseService.complete(req.params.id, { userId: req.auth.sub, ipAddress: req.ip });
    return sendSuccess(res, purchase, 'Purchase completed — stock updated');
  }),

  cancel: asyncHandler(async (req: Request, res: Response) => {
    const purchase = await PurchaseService.cancel(req.params.id);
    return sendSuccess(res, purchase, 'Purchase cancelled');
  }),

  updatePaymentStatus: asyncHandler(async (req: Request, res: Response) => {
    const purchase = await PurchaseService.updatePaymentStatus(req.params.id, req.body.paymentStatus);
    return sendSuccess(res, purchase, 'Payment status updated');
  }),
};
