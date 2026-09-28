import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import { SupplierService } from '../services/supplier.service';

export const SupplierController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const outletId = req.query.outletId as string;
    if (!outletId) throw ApiError.badRequest('outletId query parameter is required');
    const suppliers = await SupplierService.list(outletId, req.query.all !== 'true');
    return sendSuccess(res, suppliers);
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const supplier = await SupplierService.getById(req.params.id);
    return sendSuccess(res, supplier);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const supplier = await SupplierService.create(req.body);
    return sendSuccess(res, supplier, 'Supplier created', 201);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const supplier = await SupplierService.update(req.params.id, req.body);
    return sendSuccess(res, supplier, 'Supplier updated');
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await SupplierService.softDelete(req.params.id);
    return sendSuccess(res, null, 'Supplier deactivated');
  }),

  products: asyncHandler(async (req: Request, res: Response) => {
    const products = await SupplierService.productsForSupplier(req.params.id);
    return sendSuccess(res, products);
  }),
};
