import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess, sendPaginated } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import { InventoryService } from '../services/inventory.service';

function pageLimit(req: Request) {
  return {
    page: parseInt((req.query.page as string) ?? '1', 10),
    limit: parseInt((req.query.limit as string) ?? '20', 10),
  };
}

export const InventoryController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const outletId = req.query.outletId as string;
    if (!outletId) throw ApiError.badRequest('outletId query parameter is required');
    const { page, limit } = pageLimit(req);
    const { items, total } = await InventoryService.list({
      outletId,
      category: req.query.category as string | undefined,
      lowStockOnly: req.query.lowStockOnly === 'true',
      search: req.query.search as string | undefined,
      page,
      limit,
    });
    return sendPaginated(res, items, { page, limit, total });
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const item = await InventoryService.getById(req.params.id);
    return sendSuccess(res, item);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const item = await InventoryService.create(req.body);
    return sendSuccess(res, item, 'Inventory item created', 201);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const item = await InventoryService.update(req.params.id, req.body);
    return sendSuccess(res, item, 'Inventory item updated');
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await InventoryService.softDelete(req.params.id);
    return sendSuccess(res, null, 'Inventory item deactivated');
  }),

  adjustStock: asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth || req.auth.type !== 'STAFF') throw ApiError.forbidden('Staff access required');
    const { outletId, delta, notes } = req.body;
    const item = await InventoryService.adjustStock(req.params.id, outletId, delta, notes, {
      userId: req.auth.sub,
      ipAddress: req.ip,
    });
    return sendSuccess(res, item, 'Stock adjusted');
  }),

  ledgerForItem: asyncHandler(async (req: Request, res: Response) => {
    const { page, limit } = pageLimit(req);
    const { items, total } = await InventoryService.ledgerForItem(req.params.id, page, limit);
    return sendPaginated(res, items, { page, limit, total });
  }),

  ledgerForOutlet: asyncHandler(async (req: Request, res: Response) => {
    const outletId = req.query.outletId as string;
    if (!outletId) throw ApiError.badRequest('outletId query parameter is required');
    const { page, limit } = pageLimit(req);
    const { items, total } = await InventoryService.ledgerForOutlet(outletId, {
      type: req.query.type as string | undefined,
      page,
      limit,
    });
    return sendPaginated(res, items, { page, limit, total });
  }),
};
