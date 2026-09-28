import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import { User } from '../models/User';
import { DeliveryService } from '../services/delivery.service';
import { OrderService } from '../services/order.service';
import { actorFromAuth } from '../services/orderStateMachine';

export const DeliveryController = {
  unassigned: asyncHandler(async (req: Request, res: Response) => {
    const outletId = req.query.outletId as string;
    if (!outletId) throw ApiError.badRequest('outletId query parameter is required');
    const orders = await DeliveryService.unassigned(outletId);
    return sendSuccess(res, orders.map((o) => OrderService.decorate(o, actorFromAuth(req.auth))));
  }),

  executives: asyncHandler(async (req: Request, res: Response) => {
    const outletId = req.query.outletId as string;
    if (!outletId) throw ApiError.badRequest('outletId query parameter is required');
    return sendSuccess(res, await DeliveryService.executives(outletId));
  }),

  inFlight: asyncHandler(async (req: Request, res: Response) => {
    const outletId = req.query.outletId as string;
    if (!outletId) throw ApiError.badRequest('outletId query parameter is required');
    const orders = await DeliveryService.inFlight(outletId);
    const actor = actorFromAuth(req.auth);
    const riders = await User.find({ _id: { $in: orders.map((o) => o.deliveryStaffId) } }).select('name');
    const nameById = new Map(riders.map((r) => [r.id, r.name]));
    return sendSuccess(
      res,
      orders.map((o) => ({ ...OrderService.decorate(o, actor), deliveryStaffName: nameById.get(o.deliveryStaffId?.toString() ?? '') }))
    );
  }),

  assign: asyncHandler(async (req: Request, res: Response) => {
    const { deliveryStaffId } = req.body;
    const order = await DeliveryService.assign(req.params.orderId, deliveryStaffId, actorFromAuth(req.auth));
    return sendSuccess(res, OrderService.decorate(order, actorFromAuth(req.auth)), 'Delivery executive assigned');
  }),

  pickedUp: asyncHandler(async (req: Request, res: Response) => {
    const order = await DeliveryService.markPickedUp(req.params.orderId, actorFromAuth(req.auth));
    return sendSuccess(res, OrderService.decorate(order, actorFromAuth(req.auth)), 'Marked as picked up');
  }),

  myOrders: asyncHandler(async (req: Request, res: Response) => {
    if (!req.auth || req.auth.type !== 'STAFF') throw ApiError.forbidden('Staff access required');
    const actor = actorFromAuth(req.auth);
    const orders = await DeliveryService.myOrders(req.auth.sub);
    return sendSuccess(res, orders.map((o) => OrderService.decorate(o, actor)));
  }),
};
