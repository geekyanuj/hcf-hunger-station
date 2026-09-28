import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess, sendPaginated } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import { OrderService } from '../services/order.service';
import { PricingService } from '../services/pricing.service';
import { ReceiptService } from '../services/receipt.service';
import { actorFromAuth } from '../services/orderStateMachine';
import { OrderType } from '../models/Order';

export const OrderController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const customerId = req.auth?.type === 'CUSTOMER' ? req.auth.sub : undefined;
    const createdByUserId = req.auth?.type === 'STAFF' ? req.auth.sub : undefined;
    // manualDiscount and overrideStockCheck are POS-only (OrderService itself
    // ignores them unless createdByUserId is set, but we also strip them here
    // so a customer-originated request body can't smuggle a discount through).
    const { manualDiscount, overrideStockCheck, tableId, ...rest } = req.body;
    const order = await OrderService.create({
      ...rest,
      customerId,
      createdByUserId,
      createdByRole: req.auth?.type === 'STAFF' ? req.auth.role : undefined,
      // Staff (POS) may pick a table directly; a customer must prove presence by scanning the table QR.
      tableId: createdByUserId ? tableId : undefined,
      manualDiscount: createdByUserId ? manualDiscount : undefined,
      overrideStockCheck: createdByUserId ? overrideStockCheck : undefined,
    });
    return sendSuccess(res, OrderService.decorate(order, actorFromAuth(req.auth)), 'Order created successfully', 201);
  }),

  /** Lets the client preview totals before placing the order (e.g. when the cart changes). */
  priceCart: asyncHandler(async (req: Request, res: Response) => {
    const { outletId, orderType, lines, couponCode, loyaltyPointsToRedeem } = req.body;
    const customerId = req.auth?.type === 'CUSTOMER' ? req.auth.sub : undefined;
    const priced = await PricingService.priceCart(outletId, lines, orderType, couponCode, customerId, loyaltyPointsToRedeem);
    return sendSuccess(res, priced, 'Cart priced');
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const order = await OrderService.getById(req.params.id);
    if (req.auth?.type === 'CUSTOMER' && order.customerId?.toString() !== req.auth.sub) {
      throw ApiError.forbidden('You do not have access to this order');
    }
    return sendSuccess(res, OrderService.decorate(order, actorFromAuth(req.auth)));
  }),

  getStatus: asyncHandler(async (req: Request, res: Response) => {
    const order = await OrderService.getById(req.params.id);
    return sendSuccess(res, {
      orderNumber: order.orderNumber,
      tokenNumber: order.tokenNumber,
      orderType: order.orderType,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      deliveryStatus: order.deliveryStatus,
      tableNumber: order.tableNumber,
      estimatedPreparationMinutesMin: order.estimatedPreparationMinutesMin,
      estimatedPreparationMinutesMax: order.estimatedPreparationMinutesMax,
      statusHistory: order.statusHistory,
    });
  }),

  listForOutlet: asyncHandler(async (req: Request, res: Response) => {
    const outletId = req.query.outletId as string;
    if (!outletId) throw ApiError.badRequest('outletId query parameter is required');
    const page = parseInt((req.query.page as string) ?? '1', 10);
    const limit = parseInt((req.query.limit as string) ?? '20', 10);
    const { items, total } = await OrderService.listForOutlet(outletId, {
      status: req.query.status as never,
      orderType: req.query.orderType as never,
      page,
      limit,
    });
    const actor = actorFromAuth(req.auth);
    return sendPaginated(res, items.map((o) => OrderService.decorate(o, actor)), { page, limit, total });
  }),

  /** "Current Orders" dashboard: active orders (+ recently closed) with per-status counters and role-aware available actions. */
  current: asyncHandler(async (req: Request, res: Response) => {
    const outletId = req.query.outletId as string;
    if (!outletId) throw ApiError.badRequest('outletId query parameter is required');
    if (req.auth?.type === 'STAFF' && req.auth.role !== 'OWNER' && !req.auth.outletIds.includes(outletId)) {
      throw ApiError.forbidden('You do not have access to this outlet');
    }
    const actor = actorFromAuth(req.auth);
    const { orders, counts } = await OrderService.listCurrent(outletId, {
      includeClosed: req.query.includeClosed === 'true',
      orderType: req.query.orderType as OrderType | undefined,
    });
    return sendSuccess(res, { orders: orders.map((o) => OrderService.decorate(o, actor)), counts });
  }),

  updateStatus: asyncHandler(async (req: Request, res: Response) => {
    const actor = actorFromAuth(req.auth);
    const order = await OrderService.updateStatus(req.params.id, req.body.status, actor, {
      note: req.body.note,
      reason: req.body.reason,
      expectedStatus: req.body.expectedStatus,
      ipAddress: req.ip,
    });
    return sendSuccess(res, OrderService.decorate(order, actor), 'Order status updated');
  }),

  /** Customer cancellation (PENDING/CONFIRMED) or staff/admin override — the state machine decides which applies. */
  cancel: asyncHandler(async (req: Request, res: Response) => {
    const actor = actorFromAuth(req.auth);
    const order = await OrderService.cancel(req.params.id, actor, {
      note: req.body?.note,
      reason: req.body?.reason,
      expectedStatus: req.body?.expectedStatus,
      ipAddress: req.ip,
    });
    return sendSuccess(res, OrderService.decorate(order, actor), 'Order cancelled');
  }),

  reorder: asyncHandler(async (req: Request, res: Response) => {
    const lines = await OrderService.reorderLines(req.params.id);
    return sendSuccess(res, lines, 'Cart lines derived from previous order');
  }),

  receipt: asyncHandler(async (req: Request, res: Response) => {
    const receipt = await ReceiptService.build(req.params.id);
    return sendSuccess(res, receipt);
  }),
};
