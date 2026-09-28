import { Types } from 'mongoose';
import { Order, IOrder, OrderStatus, OrderType, OrderPaymentMethod, DeliveryStatus } from '../models/Order';
import { Table, ITable } from '../models/Table';
import { ApiError } from '../utils/ApiError';
import { PricingService, CartLineInput } from './pricing.service';
import { PrepTimeEstimationService } from './prepTimeEstimation.service';
import { TokenService } from './token.service';
import { StockDeductionService } from './stockDeduction.service';
import { AuditService } from './audit.service';
import { Outlet } from '../models/Outlet';
import { round2 } from '../utils/format';
import { CouponService } from './coupon.service';
import { LoyaltyService } from './loyalty.service';
import { NotificationService } from './notification.service';
import { emitOrderCreated, emitOrderTransition } from '../sockets';
import { logger } from '../config/logger';
import {
  ACTIVE_STATUSES,
  TERMINAL_STATUSES,
  OrderActor,
  OrderFacts,
  actorRoleLabel,
  cancelledByFor,
  canTransitionOrderStatus,
  customerStatusLabel,
  flowForOrderType,
  getAvailableActions,
} from './orderStateMachine';

export interface ManualDiscountInput {
  discountType: 'FLAT' | 'PERCENT';
  value: number;
  reason?: string;
}

export interface CreateOrderInput {
  outletId: string;
  orderType: OrderType;
  customerId?: string;
  tableQrToken?: string; // for DINE_IN, resolved server-side to a tableId
  /** Staff-only alternative to tableQrToken (POS picks the table from a list). Ignored unless createdByUserId is set. */
  tableId?: string;
  /** How the customer intends to pay. PAY_AFTER_DINE_IN is only valid for DINE_IN orders. */
  paymentMethod?: OrderPaymentMethod;
  createdByUserId?: string; // for POS
  /** Role of the creating staff member, stored in the first status-history entry. */
  createdByRole?: string;
  lines: CartLineInput[];
  couponCode?: string;
  scheduledAt?: string;
  deliveryAddress?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    pincode: string;
    latitude?: number;
    longitude?: number;
  };
  customerNotes?: string;
  /** POS-only: staff-applied discount, distinct from customer coupon codes. Ignored unless createdByUserId is set. */
  manualDiscount?: ManualDiscountInput;
  /** Staff (manager/owner) explicitly overriding an insufficient-stock block. Ignored for customer-originated orders. */
  overrideStockCheck?: boolean;
  /** Points the customer wants to redeem at checkout; the actual amount applied is capped and recomputed server-side (see pricing.service.ts). */
  loyaltyPointsToRedeem?: number;
}

/** True once the order reaches the outlet's configured "food is consumed" status (default COMPLETED, optionally READY). */
function isConsumptionTriggerStatus(status: OrderStatus, trigger: 'ON_COMPLETED' | 'ON_READY'): boolean {
  return trigger === 'ON_READY' ? status === 'READY' : status === 'COMPLETED';
}

type StatusNotificationType =
  | 'ORDER_CONFIRMED'
  | 'ORDER_PREPARING'
  | 'ORDER_READY'
  | 'ORDER_DISPATCHED'
  | 'ORDER_DELIVERED'
  | 'ORDER_COMPLETED'
  | 'ORDER_CANCELLED';

/** Which customer-facing notification fires on each status transition (text comes from the shared customer wording). */
function notificationFor(order: IOrder): { type: StatusNotificationType; title: string; message: string } | null {
  const label = customerStatusLabel(order.orderStatus, order.orderType);
  const ref = `Order ${order.orderNumber} (token ${order.tokenNumber})`;
  const flow = flowForOrderType(order.orderType);
  switch (order.orderStatus) {
    case 'CONFIRMED':
      return { type: 'ORDER_CONFIRMED', title: label, message: `${ref} has been confirmed.` };
    case 'PREPARING':
      return { type: 'ORDER_PREPARING', title: label, message: `${ref} is now being prepared.` };
    case 'READY':
      return {
        type: 'ORDER_READY',
        title: label,
        message:
          flow === 'DINE' ? `${ref}: your food is ready.` : flow === 'PARCEL' ? `${ref} is ready and will be handed to your delivery executive.` : `${ref} is ready for pickup.`,
      };
    case 'OUT_FOR_DELIVERY':
      return { type: 'ORDER_DISPATCHED', title: label, message: `${ref} is on its way to you.` };
    case 'COMPLETED':
      return flow === 'PARCEL'
        ? { type: 'ORDER_DELIVERED', title: 'Delivered', message: `${ref} has been delivered. Enjoy!` }
        : { type: 'ORDER_COMPLETED', title: label, message: `${ref} is complete. Enjoy!` };
    case 'CANCELLED':
      return { type: 'ORDER_CANCELLED', title: label, message: `${ref} has been cancelled.` };
    default:
      return null;
  }
}

/** The facts the state machine needs, extracted from an order document. */
export function orderFacts(order: IOrder): OrderFacts {
  return {
    orderStatus: order.orderStatus,
    orderType: order.orderType,
    customerId: order.customerId?.toString(),
    deliveryStaffId: order.deliveryStaffId?.toString(),
    deliveryStatus: order.deliveryStatus,
    tableId: order.tableId?.toString(),
    tableNumber: order.tableNumber,
  };
}

/** Staff outside the order's outlet (other than OWNER) may not touch it. */
function assertOutletAccess(actor: OrderActor, order: IOrder) {
  if (actor.type !== 'STAFF' || actor.role === 'OWNER' || !actor.outletIds) return;
  if (!actor.outletIds.includes(order.outletId.toString())) {
    throw ApiError.forbidden('You do not have access to this outlet');
  }
}

export interface StatusChangeOptions {
  note?: string;
  /** Cancellation reason (mandatory for staff overrides after preparation has started). */
  reason?: string;
  /** Optimistic guard: the status the caller was looking at. A mismatch is reported as "already updated". */
  expectedStatus?: OrderStatus;
  ipAddress?: string;
}

const ALREADY_UPDATED_MESSAGE = 'Order status has already been updated.';

export const OrderService = {
  async create(input: CreateOrderInput): Promise<IOrder> {
    if (input.orderType === 'DELIVERY' && !input.deliveryAddress) {
      throw ApiError.badRequest('A delivery address is required for delivery orders');
    }

    if (input.paymentMethod === 'PAY_AFTER_DINE_IN' && input.orderType !== 'DINE_IN') {
      throw ApiError.badRequest('Pay After Dine In is only available for dine-in orders');
    }

    // A Dine order carries tableId + tableNumber for its whole lifecycle.
    let tableId: Types.ObjectId | undefined;
    let tableNumber: string | undefined;
    let dineTable: ITable | null = null;
    if (input.orderType === 'DINE_IN') {
      if (input.tableId && input.createdByUserId) {
        dineTable = await Table.findOne({ _id: input.tableId, isActive: true, isDeleted: false });
      } else if (input.tableQrToken) {
        dineTable = await Table.findOne({ qrToken: input.tableQrToken, isActive: true, isDeleted: false });
      } else {
        throw ApiError.badRequest('A table is required for dine-in orders (table QR token, or a table selected by staff)');
      }
      if (!dineTable) throw ApiError.notFound('Table not found or inactive');
      if (dineTable.outletId.toString() !== input.outletId) {
        throw ApiError.badRequest('This table does not belong to the selected outlet');
      }
      tableId = dineTable._id as Types.ObjectId;
      tableNumber = dineTable.tableNumber;
    }

    // 1. Authoritative server-side pricing - never trust client-sent amounts.
    //    Also validates any coupon code and prices any requested loyalty
    //    redemption entirely server-side (see pricing.service.ts). Nothing
    //    is deducted/recorded yet — that only happens once the order is
    //    actually created below, so a failed order never consumes a coupon
    //    use or loyalty points.
    const priced = await PricingService.priceCart(
      input.outletId,
      input.lines,
      input.orderType,
      input.couponCode,
      input.customerId,
      input.loyaltyPointsToRedeem
    );

    // 1b. Staff-only manual discount (POS). Applied on top of the coupon
    // discount; customer-originated orders never reach this branch because
    // createdByUserId is only set when req.auth.type === 'STAFF' (see
    // order.controller.ts).
    let total = priced.total;
    let discount = priced.discount;
    if (input.manualDiscount && input.createdByUserId) {
      const manualAmount =
        input.manualDiscount.discountType === 'PERCENT'
          ? round2((priced.subtotal * input.manualDiscount.value) / 100)
          : input.manualDiscount.value;
      const cappedAmount = Math.min(manualAmount, total);
      discount = round2(discount + cappedAmount);
      total = round2(total - cappedAmount);
    }

    // 2. Ingredient stock availability (soft check at order time). Menu items
    // without a recipe are always considered available.
    let stockOverrideApplied = false;
    const shortages = await StockDeductionService.checkAvailability(input.outletId, priced.items);
    if (shortages.length > 0) {
      if (input.overrideStockCheck && input.createdByUserId) {
        stockOverrideApplied = true;
      } else {
        const names = shortages.map((s) => s.name).join(', ');
        throw ApiError.conflict(`Insufficient ingredient stock to fulfill this order: ${names}`);
      }
    }

    // 3. Dynamic preparation-time estimate.
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : undefined;
    const estimate = await PrepTimeEstimationService.estimate({
      outletId: input.outletId,
      items: priced.items.map((i) => ({ preparationTimeMinutes: i.preparationTimeMinutes, quantity: i.quantity })),
      orderType: input.orderType,
      scheduledAt,
    });

    // 4. Order number + queue token (token creation needs the order's _id, so
    //    we create the order first with a placeholder token, then patch it).
    const orderNumber = await TokenService.nextOrderNumber(input.outletId);
    const creatorIdRaw = input.createdByUserId ?? input.customerId;
    const creatorId = creatorIdRaw && Types.ObjectId.isValid(creatorIdRaw) ? new Types.ObjectId(creatorIdRaw) : undefined;

    const order = await Order.create({
      orderNumber,
      tokenNumber: 'PENDING',
      outletId: input.outletId,
      customerId: input.customerId,
      tableId,
      tableNumber,
      createdByUserId: input.createdByUserId,
      orderType: input.orderType,
      items: priced.items,
      subtotal: priced.subtotal,
      discount,
      couponCode: priced.appliedCoupon?.code,
      tax: priced.tax,
      packagingCharge: priced.packagingCharge,
      deliveryCharge: priced.deliveryCharge,
      total,
      estimatedPreparationMinutesMin: estimate.minMinutes,
      estimatedPreparationMinutesMax: estimate.maxMinutes,
      scheduledAt,
      deliveryAddress: input.deliveryAddress,
      customerNotes: input.customerNotes,
      paymentMethod: input.paymentMethod,
      // Order lifecycle always starts at PENDING; Parcel orders also start a separate delivery lifecycle.
      statusHistory: [
        {
          status: 'PENDING',
          timestamp: new Date(),
          changedBy: creatorId,
          changedByRole: input.createdByUserId ? input.createdByRole ?? 'STAFF' : input.customerId ? 'CUSTOMER' : 'GUEST',
        },
      ],
      deliveryStatus: input.orderType === 'DELIVERY' ? 'PENDING' : undefined,
      deliveryHistory:
        input.orderType === 'DELIVERY'
          ? [{ status: 'PENDING', timestamp: new Date(), changedBy: creatorId, changedByRole: input.createdByUserId ? input.createdByRole ?? 'STAFF' : input.customerId ? 'CUSTOMER' : 'GUEST' }]
          : [],
      manualDiscount:
        input.manualDiscount && input.createdByUserId
          ? {
              discountType: input.manualDiscount.discountType,
              value: input.manualDiscount.value,
              appliedByUserId: input.createdByUserId,
              reason: input.manualDiscount.reason,
            }
          : undefined,
      stockOverrideApplied,
      loyaltyPointsRedeemed: priced.loyaltyPointsToRedeem,
      loyaltyDiscountAmount: priced.loyaltyDiscount,
    });

    // The order exists now, so the table can be marked occupied (doing this before pricing/creation
    // could leave a table stuck OCCUPIED if the order was rejected).
    if (dineTable) {
      dineTable.status = 'OCCUPIED';
      await dineTable.save();
    }

    // Now that the order has a real _id: record the coupon redemption and
    // deduct the loyalty points actually reserved against it. Both are
    // idempotency-safe against retries (CouponRedemption has a unique index
    // on orderId; LoyaltyService.redeemForOrder is a straightforward debit
    // that only ever runs once per successful order-creation call).
    if (priced.appliedCoupon) {
      await CouponService.recordRedemption(
        new Types.ObjectId(priced.appliedCoupon.couponId),
        input.customerId,
        order._id as Types.ObjectId,
        priced.couponDiscount
      );
    }
    if (input.customerId && priced.loyaltyPointsToRedeem > 0) {
      await LoyaltyService.redeemForOrder(input.customerId, priced.loyaltyPointsToRedeem, order._id as Types.ObjectId);
    }

    const tokenNumber = await TokenService.nextToken(input.outletId, input.orderType, order._id as Types.ObjectId);
    order.tokenNumber = tokenNumber;
    await order.save();

    try {
      emitOrderCreated(order, summarize(order));
    } catch (err) {
      // socket layer trouble must never fail order creation
      logger.warn(`ORDER_CREATED emit failed for ${order.orderNumber}: ${(err as Error).message}`);
    }

    return order;
  },

  async getById(orderId: string): Promise<IOrder> {
    const order = await Order.findOne({ _id: orderId, isDeleted: false });
    if (!order) throw ApiError.notFound('Order not found');
    return order;
  },

  async getByOrderNumber(orderNumber: string): Promise<IOrder> {
    const order = await Order.findOne({ orderNumber, isDeleted: false });
    if (!order) throw ApiError.notFound('Order not found');
    return order;
  },

  async listForOutlet(outletId: string, filters: { status?: OrderStatus; orderType?: OrderType; page: number; limit: number }) {
    const query: Record<string, unknown> = { outletId, isDeleted: false };
    if (filters.status) query.orderStatus = filters.status;
    if (filters.orderType) query.orderType = filters.orderType;
    const [items, total] = await Promise.all([
      Order.find(query)
        .sort({ createdAt: -1 })
        .skip((filters.page - 1) * filters.limit)
        .limit(filters.limit),
      Order.countDocuments(query),
    ]);
    return { items, total };
  },

  async listForCustomer(customerId: string, page: number, limit: number) {
    const query = { customerId, isDeleted: false };
    const [items, total] = await Promise.all([
      Order.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Order.countDocuments(query),
    ]);
    return { items, total };
  },

  /**
   * THE one place where an order's status changes. Every route (staff status
   * endpoint, customer cancel, KDS, delivery dashboard) ends up here, so the
   * lifecycle is:  validated → persisted → logged → broadcast → reflected in UI.
   *
   * 1. VALIDATE via the centralized state machine (order type, role,
   *    cancellation rights, delivery + table requirements).
   * 2. PERSIST atomically: the write is conditional on the status we
   *    validated against (`findOneAndUpdate({ _id, orderStatus: current })`),
   *    so if two staff members race on the same order exactly one wins and the
   *    other gets a controlled 409 — status history can never be inconsistent.
   *    Status, timestamps, cancellation data and the history entry are written
   *    in that single atomic document update (MongoDB guarantees single-document
   *    atomicity, so no multi-document transaction / replica set is needed).
   * 3. LOG: the history entry above (+ audit log for staff cancellations).
   * 4. BROADCAST: socket events are emitted only after the write succeeded.
   */
  async transitionStatus(orderId: string, requestedStatus: OrderStatus, actor: OrderActor, opts: StatusChangeOptions = {}): Promise<IOrder> {
    if (!Types.ObjectId.isValid(orderId)) throw ApiError.notFound('Order not found');
    const order = await Order.findOne({ _id: orderId, isDeleted: false });
    if (!order) throw ApiError.notFound('Order not found');
    assertOutletAccess(actor, order);

    // Someone else already moved the order to where the caller wants it (or the caller's screen is stale).
    // (PENDING is never a legal target, so PENDING → PENDING is left to the state machine to reject as invalid.)
    const alreadyThere = requestedStatus !== 'PENDING' && order.orderStatus === requestedStatus;
    if (alreadyThere || (opts.expectedStatus && opts.expectedStatus !== order.orderStatus)) {
      throw ApiError.conflict(ALREADY_UPDATED_MESSAGE);
    }

    // Older Dine orders may predate the tableNumber snapshot; recover it from the table before validating.
    if (order.orderType === 'DINE_IN' && order.tableId && !order.tableNumber) {
      const table = await Table.findById(order.tableId).select('tableNumber');
      if (table) {
        order.tableNumber = table.tableNumber;
        await Order.updateOne({ _id: order._id }, { $set: { tableNumber: table.tableNumber } });
      }
    }

    const verdict = canTransitionOrderStatus(orderFacts(order), requestedStatus, actor, { cancellationReason: opts.reason });
    if (!verdict.allowed) {
      throw new ApiError(verdict.httpStatus, verdict.message, [{ code: verdict.code }]);
    }

    const previousStatus = order.orderStatus;
    const now = new Date();
    const roleLabel = actorRoleLabel(actor);
    const changedBy = actor.id && Types.ObjectId.isValid(actor.id) ? new Types.ObjectId(actor.id) : undefined;
    const isCancel = requestedStatus === 'CANCELLED';

    const set: Record<string, unknown> = { orderStatus: requestedStatus };
    const push: Record<string, unknown> = {};

    // Delivery lifecycle is kept in sync but stays a separate field.
    let nextDeliveryStatus: DeliveryStatus | undefined;
    if (order.orderType === 'DELIVERY') {
      if (requestedStatus === 'OUT_FOR_DELIVERY') nextDeliveryStatus = 'OUT_FOR_DELIVERY';
      else if (requestedStatus === 'COMPLETED') nextDeliveryStatus = 'DELIVERED';
      else if (isCancel) nextDeliveryStatus = 'CANCELLED';
    }
    if (nextDeliveryStatus) {
      set.deliveryStatus = nextDeliveryStatus;
      push.deliveryHistory = { status: nextDeliveryStatus, timestamp: now, changedBy, changedByRole: roleLabel, note: opts.note };
    }

    if (isCancel) {
      const defaultReason = actor.type === 'CUSTOMER' || actor.type === 'GUEST' ? 'Cancelled by customer' : 'Cancelled by staff';
      set.cancelledAt = now;
      set.cancelledBy = cancelledByFor(actor);
      if (actor.type === 'STAFF' && changedBy) set.cancelledByUserId = changedBy;
      set.cancellationReason = opts.reason?.trim() || defaultReason;
      if (opts.note?.trim()) set.cancellationNote = opts.note.trim();
      set.previousOrderStatus = previousStatus;
      set.paymentStatusAtCancellation = order.paymentStatus;
    }

    push.statusHistory = {
      status: requestedStatus,
      timestamp: now,
      changedBy,
      changedByRole: roleLabel,
      note: opts.note?.trim() || (isCancel ? (set.cancellationReason as string) : undefined),
    };

    // Conditional atomic write — see method docs. The extra deliveryStaffId guard makes sure the
    // executive we validated against is still the assigned one when the order leaves for delivery.
    const filter: Record<string, unknown> = { _id: order._id, orderStatus: previousStatus, isDeleted: false };
    if (requestedStatus === 'OUT_FOR_DELIVERY') filter.deliveryStaffId = order.deliveryStaffId;

    const updated = await Order.findOneAndUpdate(filter, { $set: set, $push: push }, { new: true, runValidators: true });
    if (!updated) throw ApiError.conflict(ALREADY_UPDATED_MESSAGE);

    await this.runPostTransitionEffects(updated, previousStatus, actor, opts);
    return updated;
  },

  /**
   * Everything that happens AFTER the transition is safely persisted:
   * broadcast, cancellation clean-up, stock/loyalty on fulfilment,
   * customer notification, table release. A failure in any of these is
   * logged but never rolls back or fails a status change that already
   * succeeded — each step is idempotent where a retry could matter.
   */
  async runPostTransitionEffects(order: IOrder, previousStatus: OrderStatus, actor: OrderActor, opts: StatusChangeOptions) {
    const nextStatus = order.orderStatus;
    const safely = async (label: string, fn: () => Promise<void> | void) => {
      try {
        await fn();
      } catch (err) {
        logger.error(`Post-transition step "${label}" failed for order ${order.orderNumber}: ${(err as Error).message}`);
      }
    };

    // 4. BROADCAST (events go out only now that the write has succeeded).
    await safely('emit', () => emitOrderTransition(order, previousStatus));

    if (nextStatus === 'CANCELLED') {
      // Refund any loyalty points reserved against this order. Runs once: only the request whose
      // conditional update succeeded reaches this point.
      await safely('loyalty-refund', async () => {
        if (order.customerId && order.loyaltyPointsRedeemed > 0) {
          await LoyaltyService.adjust(order.customerId.toString(), order.loyaltyPointsRedeemed, `Refund for cancelled order ${order.orderNumber}`);
        }
      });
      await safely('audit', async () => {
        if (actor.type !== 'STAFF') return;
        await AuditService.record({
          ctx: { userId: actor.id, ipAddress: opts.ipAddress },
          action: 'ORDER_CANCELLATION',
          entity: 'Order',
          entityId: order.id,
          outletId: order.outletId.toString(),
          before: { orderStatus: previousStatus },
          after: {
            orderStatus: 'CANCELLED',
            reason: order.cancellationReason,
            note: order.cancellationNote,
            cancelledBy: order.cancelledBy,
            paymentStatus: order.paymentStatus,
          },
        });
      });
    }

    // Automatic, idempotent ingredient consumption once the order reaches the outlet's configured
    // "consumed" trigger status (default COMPLETED — see Outlet.settings.stockDeductionTrigger).
    await safely('stock-and-loyalty', async () => {
      const outlet = await Outlet.findById(order.outletId).select('settings');
      const trigger = outlet?.settings.stockDeductionTrigger ?? 'ON_COMPLETED';
      if (!isConsumptionTriggerStatus(nextStatus, trigger)) return;

      await StockDeductionService.consumeForOrder(order.id, actor.id);

      // Loyalty points are earned on the same trigger, only for orders tied to a customer account.
      // Idempotent via LoyaltyTransaction's unique (orderId, type) index.
      if (order.customerId && !order.loyaltyPointsCreditedAt) {
        const earned = await LoyaltyService.earnForOrder(order.customerId.toString(), order._id as Types.ObjectId, order.total, order.outletId.toString());
        if (earned > 0) {
          const creditedAt = new Date();
          await Order.updateOne({ _id: order._id }, { $set: { loyaltyPointsEarned: earned, loyaltyPointsCreditedAt: creditedAt } });
          order.loyaltyPointsEarned = earned;
          order.loyaltyPointsCreditedAt = creditedAt;
          await NotificationService.send({
            principalType: 'CUSTOMER',
            principalId: order.customerId,
            outletId: order.outletId,
            type: 'LOYALTY',
            title: 'Loyalty points earned',
            message: `You earned ${earned} points on order ${order.orderNumber}`,
            data: { orderId: order.id, points: earned },
          });
        }
      }
    });

    // Customer-facing notification (in-app + socket). A customer who cancelled the order themselves doesn't need to be told.
    await safely('notification', async () => {
      if (!order.customerId) return;
      if (nextStatus === 'CANCELLED' && order.cancelledBy === 'CUSTOMER') return;
      const notif = notificationFor(order);
      if (!notif) return;
      await NotificationService.send({
        principalType: 'CUSTOMER',
        principalId: order.customerId,
        outletId: order.outletId,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        data: { orderId: order.id },
      });
    });

    // Free up the dine-in table once its order reaches a terminal state, but only if no other
    // active order is still occupying it.
    await safely('table-release', async () => {
      if (!order.tableId || !TERMINAL_STATUSES.includes(nextStatus)) return;
      const stillActive = await Order.exists({
        tableId: order.tableId,
        orderStatus: { $nin: TERMINAL_STATUSES as OrderStatus[] },
        isDeleted: false,
      });
      if (!stillActive) await Table.updateOne({ _id: order.tableId }, { status: 'AVAILABLE' });
    });
  },

  /** Thin wrapper: staff status endpoint. All rules live in transitionStatus / the state machine. */
  async updateStatus(orderId: string, nextStatus: OrderStatus, actor: OrderActor, opts: StatusChangeOptions = {}): Promise<IOrder> {
    return this.transitionStatus(orderId, nextStatus, actor, opts);
  },

  /** Thin wrapper: cancellation (customer default rule, or staff/admin override — decided by the state machine). */
  async cancel(orderId: string, actor: OrderActor, opts: StatusChangeOptions = {}): Promise<IOrder> {
    return this.transitionStatus(orderId, 'CANCELLED', actor, opts);
  },

  /**
   * "Current Orders" dashboard feed: every active order for the outlet plus
   * (optionally) recently closed ones, with per-status counters.
   */
  async listCurrent(outletId: string, opts: { includeClosed?: boolean; orderType?: OrderType; closedWithinHours?: number } = {}) {
    const typeFilter = opts.orderType ? { orderType: opts.orderType } : {};
    const active = await Order.find({ outletId, isDeleted: false, orderStatus: { $in: ACTIVE_STATUSES as OrderStatus[] }, ...typeFilter }).sort({ createdAt: 1 });
    let closed: IOrder[] = [];
    if (opts.includeClosed) {
      const since = new Date(Date.now() - (opts.closedWithinHours ?? 24) * 3600 * 1000);
      closed = await Order.find({
        outletId,
        isDeleted: false,
        orderStatus: { $in: TERMINAL_STATUSES as OrderStatus[] },
        updatedAt: { $gte: since },
        ...typeFilter,
      })
        .sort({ updatedAt: -1 })
        .limit(50);
    }
    const orders = [...active, ...closed];
    const counts: Record<OrderStatus, number> = { PENDING: 0, CONFIRMED: 0, PREPARING: 0, READY: 0, OUT_FOR_DELIVERY: 0, COMPLETED: 0, CANCELLED: 0 };
    for (const o of orders) counts[o.orderStatus] += 1;
    return { orders, counts };
  },

  /** Serialises an order for the API together with the actions the given actor may perform on it right now. */
  decorate(order: IOrder, actor: OrderActor) {
    return {
      ...order.toJSON(),
      orderFlow: flowForOrderType(order.orderType),
      availableActions: getAvailableActions(orderFacts(order), actor),
    };
  },

  /** "Order Again": returns cart lines re-derived from a previous order so the client can re-price and re-add to cart. */
  async reorderLines(orderId: string): Promise<CartLineInput[]> {
    const order = await this.getById(orderId);
    return order.items.map((item) => ({
      menuItemId: item.menuItemId.toString(),
      quantity: item.quantity,
      selectedOptionIds: [], // modifier option identity is not preserved 1:1 across menu changes; see README limitations
      notes: item.notes,
    }));
  },
};

function summarize(order: IOrder) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    tokenNumber: order.tokenNumber,
    orderType: order.orderType,
    total: order.total,
    itemCount: order.items.reduce((sum, i) => sum + i.quantity, 0),
    estimatedPreparationMinutesMin: order.estimatedPreparationMinutesMin,
    estimatedPreparationMinutesMax: order.estimatedPreparationMinutesMax,
  };
}

