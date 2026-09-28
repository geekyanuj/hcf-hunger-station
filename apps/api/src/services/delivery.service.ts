import { Types } from 'mongoose';
import { Order, IOrder, DeliveryStatus } from '../models/Order';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { OrderActor, actorRoleLabel } from './orderStateMachine';
import { emitDeliveryUpdated } from '../sockets';
import { logger } from '../config/logger';

/**
 * Delivery workflow for Parcel (DELIVERY) orders.
 *
 * Delivery progress lives in `deliveryStatus` (PENDING → ASSIGNED → PICKED_UP
 * → OUT_FOR_DELIVERY → DELIVERED, or CANCELLED) and is deliberately separate
 * from `orderStatus`:
 *
 *   orderStatus = READY             deliveryStatus = ASSIGNED / PICKED_UP
 *   orderStatus = OUT_FOR_DELIVERY  deliveryStatus = OUT_FOR_DELIVERY
 *   orderStatus = COMPLETED         deliveryStatus = DELIVERED
 *
 * Assigning a rider or marking pickup therefore never changes orderStatus.
 * The order-level moves (READY → OUT_FOR_DELIVERY → COMPLETED) go through
 * OrderService.transitionStatus, which also keeps deliveryStatus in sync.
 */
function historyEntry(status: DeliveryStatus, actor: OrderActor, note?: string) {
  return {
    status,
    timestamp: new Date(),
    changedBy: actor.id && Types.ObjectId.isValid(actor.id) ? new Types.ObjectId(actor.id) : undefined,
    changedByRole: actorRoleLabel(actor),
    note,
  };
}

function emitSafely(order: IOrder) {
  try {
    emitDeliveryUpdated(order);
  } catch (err) {
    logger.warn(`DELIVERY_UPDATED emit failed for ${order.orderNumber}: ${(err as Error).message}`);
  }
}

export const DeliveryService = {
  /** Ready-but-unassigned Parcel orders, for a manager's "assign a delivery executive" screen. */
  async unassigned(outletId: string) {
    return Order.find({
      outletId,
      orderType: 'DELIVERY',
      orderStatus: 'READY',
      deliveryStaffId: { $exists: false },
      isDeleted: false,
    }).sort({ createdAt: 1 });
  },

  /** Active delivery executives at an outlet — the choices offered by "Assign Delivery" (needs only delivery.assign, not users.manage). */
  async executives(outletId: string) {
    return User.find({ role: 'DELIVERY', isActive: true, isDeleted: false, outletIds: outletId }).select('name').sort({ name: 1 });
  },

  /** Parcel orders that have a delivery executive and are still in flight (READY-assigned or OUT_FOR_DELIVERY) — for the manager's dispatch board. */
  async inFlight(outletId: string) {
    return Order.find({
      outletId,
      orderType: 'DELIVERY',
      orderStatus: { $in: ['READY', 'OUT_FOR_DELIVERY'] },
      deliveryStaffId: { $exists: true },
      isDeleted: false,
    }).sort({ createdAt: 1 });
  },

  /** Assign (or reassign, until pickup) a delivery executive. Does NOT change orderStatus. */
  async assign(orderId: string, deliveryStaffId: string, actor: OrderActor) {
    const rider = await User.findOne({ _id: deliveryStaffId, role: 'DELIVERY', isActive: true, isDeleted: false });
    if (!rider) throw ApiError.badRequest('Selected staff member is not an active delivery executive');

    const order = await Order.findOne({ _id: orderId, isDeleted: false });
    if (!order) throw ApiError.notFound('Order not found');
    if (order.orderType !== 'DELIVERY') throw ApiError.badRequest('Only Parcel (delivery) orders can be assigned to a delivery executive');
    if (order.orderStatus !== 'READY') {
      throw ApiError.badRequest(`A delivery executive can only be assigned while the order is READY (currently ${order.orderStatus})`);
    }
    if (actor.type === 'STAFF' && actor.role !== 'OWNER' && actor.outletIds && !actor.outletIds.includes(order.outletId.toString())) {
      throw ApiError.forbidden('You do not have access to this outlet');
    }
    if (!rider.outletIds.some((id) => id.toString() === order.outletId.toString())) {
      throw ApiError.badRequest('This delivery executive does not work at the order\'s outlet');
    }

    // Conditional atomic update: still READY, and the delivery hasn't been picked up yet.
    const updated = await Order.findOneAndUpdate(
      {
        _id: order._id,
        orderStatus: 'READY',
        isDeleted: false,
        deliveryStatus: { $in: ['PENDING', 'ASSIGNED', null] },
      },
      {
        $set: { deliveryStaffId: rider._id, deliveryStatus: 'ASSIGNED' },
        $push: { deliveryHistory: historyEntry('ASSIGNED', actor, `Assigned to ${rider.name}`) },
      },
      { new: true }
    );
    if (!updated) throw ApiError.conflict('Order status has already been updated.');
    emitSafely(updated);
    return updated;
  },

  /** The assigned delivery executive (or a manager) records that the parcel has been picked up from the counter. orderStatus stays READY until "Out for Delivery". */
  async markPickedUp(orderId: string, actor: OrderActor) {
    const order = await Order.findOne({ _id: orderId, isDeleted: false });
    if (!order) throw ApiError.notFound('Order not found');
    if (order.orderType !== 'DELIVERY') throw ApiError.badRequest('Only Parcel (delivery) orders have a delivery status');
    if (order.orderStatus !== 'READY') throw ApiError.badRequest(`Cannot mark pickup while the order is ${order.orderStatus}`);
    if (!order.deliveryStaffId) throw ApiError.badRequest('Assign a delivery executive first');

    const isAssignedRider = actor.type === 'STAFF' && actor.id === order.deliveryStaffId.toString();
    const isManager = actor.type === 'STAFF' && actor.permissions.includes('delivery.assign');
    if (!isAssignedRider && !isManager) throw ApiError.forbidden('Only the assigned delivery executive or a manager can mark this order as picked up');
    if (actor.type === 'STAFF' && actor.role !== 'OWNER' && actor.outletIds && !actor.outletIds.includes(order.outletId.toString())) {
      throw ApiError.forbidden('You do not have access to this outlet');
    }

    const updated = await Order.findOneAndUpdate(
      { _id: order._id, orderStatus: 'READY', deliveryStatus: 'ASSIGNED', isDeleted: false },
      { $set: { deliveryStatus: 'PICKED_UP' }, $push: { deliveryHistory: historyEntry('PICKED_UP', actor) } },
      { new: true }
    );
    if (!updated) throw ApiError.conflict('Order status has already been updated.');
    emitSafely(updated);
    return updated;
  },

  /** A delivery executive's own queue — the only orders a DELIVERY-role account can see (enforced by this query, not just the frontend). */
  async myOrders(deliveryStaffId: string) {
    return Order.find({
      deliveryStaffId,
      orderType: 'DELIVERY',
      orderStatus: { $in: ['READY', 'OUT_FOR_DELIVERY'] },
      isDeleted: false,
    }).sort({ createdAt: 1 });
  },
};
