import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import { KitchenService } from '../services/kitchen.service';
import { OrderService } from '../services/order.service';
import { actorFromAuth } from '../services/orderStateMachine';

export const KitchenController = {
  board: asyncHandler(async (req: Request, res: Response) => {
    const outletId = req.query.outletId as string;
    if (!outletId) throw ApiError.badRequest('outletId query parameter is required');
    const board = await KitchenService.board(outletId);
    const actor = actorFromAuth(req.auth);
    // Every ticket carries the actions THIS user may perform on it, computed by the order state machine.
    const decorated = Object.fromEntries(
      Object.entries(board).map(([column, orders]) => [column, orders.map((o) => OrderService.decorate(o, actor))])
    );
    return sendSuccess(res, decorated);
  }),

  workload: asyncHandler(async (req: Request, res: Response) => {
    const outletId = req.query.outletId as string;
    if (!outletId) throw ApiError.badRequest('outletId query parameter is required');
    const workload = await KitchenService.workload(outletId);
    return sendSuccess(res, workload);
  }),
};
