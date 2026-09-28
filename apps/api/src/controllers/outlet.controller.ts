import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { OutletService } from '../services/outlet.service';

export const OutletController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const activeOnly = req.query.all !== 'true';
    const outlets = await OutletService.list(activeOnly);
    return sendSuccess(res, outlets);
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const outlet = await OutletService.getById(req.params.id);
    return sendSuccess(res, outlet);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const outlet = await OutletService.create(req.body);
    return sendSuccess(res, outlet, 'Outlet created', 201);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const outlet = await OutletService.update(req.params.id, req.body);
    return sendSuccess(res, outlet, 'Outlet updated');
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await OutletService.softDelete(req.params.id);
    return sendSuccess(res, null, 'Outlet deactivated');
  }),
};
