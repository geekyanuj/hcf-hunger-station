import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { verifyAccessToken } from '../utils/tokenUtils';
import { AccessTokenPayload } from '../types/auth';
import { IOrder, OrderStatus } from '../models/Order';

let io: Server | null = null;

/**
 * Sockets authenticate the same way HTTP requests do: the client sends its
 * JWT access token in `socket.handshake.auth.token`. Anonymous connections
 * are still allowed (a guest tracking their own order doesn't need an
 * account) — `socket.data.auth` is simply left undefined for them, and any
 * room that requires staff/permission checks rejects the join instead of
 * rejecting the whole connection.
 */
function authenticateSocket(socket: Socket): AccessTokenPayload | undefined {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) return undefined;
  try {
    return verifyAccessToken(token);
  } catch {
    return undefined;
  }
}

function isStaffWithOutletAccess(auth: AccessTokenPayload | undefined, outletId: string): boolean {
  if (!auth || auth.type !== 'STAFF') return false;
  if (auth.role === 'OWNER') return true;
  return auth.outletIds.includes(outletId);
}

function hasPermission(auth: AccessTokenPayload | undefined, permission: string): boolean {
  return !!auth && auth.type === 'STAFF' && auth.permissions.includes(permission as never);
}

export function initSockets(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: env.corsOrigin, credentials: true },
  });

  io.on('connection', (socket: Socket) => {
    const auth = authenticateSocket(socket);
    socket.data.auth = auth;
    logger.debug(`Socket connected: ${socket.id}${auth ? ` (${auth.type})` : ' (anonymous)'}`);

    // Every authenticated connection auto-joins its own personal
    // notification room, so NotificationService can push to `user:<id>` /
    // `customer:<id>` without a separate subscribe handshake.
    if (auth?.type === 'STAFF') socket.join(`user:${auth.sub}`);
    if (auth?.type === 'CUSTOMER') socket.join(`customer:${auth.sub}`);

    // Customer/guest tracking screen joins the room for its own order. No
    // permission check here by design — a dine-in/guest takeaway order has
    // no customer account, so tracking is authorized by knowledge of the
    // orderId itself (same trust model as a physical receipt/token number).
    socket.on('order:subscribe', (orderId: string) => {
      if (typeof orderId === 'string') socket.join(`order:${orderId}`);
    });

    socket.on('order:unsubscribe', (orderId: string) => {
      if (typeof orderId === 'string') socket.leave(`order:${orderId}`);
    });

    // Kitchen Display Screen (KDS) joins the room for its outlet — requires
    // authenticated staff with kds.read for that outlet (or OWNER).
    socket.on('kds:subscribe', (outletId: string) => {
      if (typeof outletId !== 'string') return;
      if (!isStaffWithOutletAccess(socket.data.auth, outletId) || !hasPermission(socket.data.auth, 'kds.read')) {
        socket.emit('error', { message: 'Not authorized to subscribe to this kitchen display' });
        return;
      }
      socket.join(`kds:${outletId}`);
    });

    socket.on('kds:unsubscribe', (outletId: string) => {
      if (typeof outletId === 'string') socket.leave(`kds:${outletId}`);
    });

    // General staff/back-office room for an outlet: inventory:low,
    // inventory:out, kitchen:updated. Requires authenticated staff scoped to
    // that outlet (or OWNER) — no specific permission beyond outlet access,
    // since the low-stock banner is useful to any staff role.
    socket.on('staff:subscribe', (outletId: string) => {
      if (typeof outletId !== 'string') return;
      if (!isStaffWithOutletAccess(socket.data.auth, outletId)) {
        socket.emit('error', { message: 'Not authorized to subscribe to this outlet' });
        return;
      }
      socket.join(`outlet:${outletId}:staff`);
    });

    socket.on('staff:unsubscribe', (outletId: string) => {
      if (typeof outletId === 'string') socket.leave(`outlet:${outletId}:staff`);
    });

    socket.on('disconnect', () => {
      logger.debug(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.IO has not been initialized yet');
  return io;
}

/**
 * Real-time order events. Every one of these is emitted ONLY AFTER the
 * database write (order state + status history) has succeeded — see
 * OrderService.transitionStatus. Names follow the spec:
 * ORDER_CREATED, ORDER_CONFIRMED, ORDER_PREPARING, ORDER_READY,
 * ORDER_OUT_FOR_DELIVERY, ORDER_COMPLETED, ORDER_CANCELLED,
 * PAYMENT_UPDATED, DELIVERY_UPDATED (+ DASHBOARD_UPDATED for counters).
 */
export const ORDER_EVENT_BY_STATUS: Readonly<Record<OrderStatus, string>> = {
  PENDING: 'ORDER_CREATED',
  CONFIRMED: 'ORDER_CONFIRMED',
  PREPARING: 'ORDER_PREPARING',
  READY: 'ORDER_READY',
  OUT_FOR_DELIVERY: 'ORDER_OUT_FOR_DELIVERY',
  COMPLETED: 'ORDER_COMPLETED',
  CANCELLED: 'ORDER_CANCELLED',
};

/** Returns null (instead of throwing) when the socket layer isn't running, e.g. in unit/integration tests. */
function tryGetIO(): Server | null {
  return io;
}

function orderPayload(order: IOrder, extra: Record<string, unknown> = {}) {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    tokenNumber: order.tokenNumber,
    outletId: order.outletId.toString(),
    orderType: order.orderType,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    deliveryStatus: order.deliveryStatus,
    tableId: order.tableId?.toString(),
    tableNumber: order.tableNumber,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

/** Emit to the customer's tracking room, the outlet KDS room and the outlet staff room (Current Orders / Delivery dashboards). */
function emitToOrderAudiences(eventName: string, order: IOrder, payload: Record<string, unknown>) {
  const instance = tryGetIO();
  if (!instance) return;
  const outletId = order.outletId.toString();
  instance.to(`order:${order.id}`).to(`kds:${outletId}`).to(`outlet:${outletId}:staff`).emit(eventName, payload);
}

/**
 * Emits the named lifecycle event for a status transition PLUS the generic
 * `order:status_update` / `kds:order_update` / `kitchen:updated` events the
 * customer tracking screen, the KDS and the staff dashboards already listen
 * to, and finally a DASHBOARD_UPDATED nudge so counters refresh.
 */
export function emitOrderTransition(order: IOrder, previousStatus: OrderStatus | undefined) {
  const instance = tryGetIO();
  if (!instance) return;
  const outletId = order.outletId.toString();
  const payload = orderPayload(order, { previousStatus });

  const eventName = ORDER_EVENT_BY_STATUS[order.orderStatus];
  emitToOrderAudiences(eventName, order, payload);

  // Generic events consumed by existing screens.
  const generic = {
    orderId: order.id,
    outletId,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    deliveryStatus: order.deliveryStatus,
    estimatedPreparationMinutesMin: order.estimatedPreparationMinutesMin,
    estimatedPreparationMinutesMax: order.estimatedPreparationMinutesMax,
  };
  instance.to(`order:${order.id}`).emit('order:status_update', generic);
  instance.to(`kds:${outletId}`).emit('kds:order_update', generic);
  instance.to(`outlet:${outletId}:staff`).emit('kitchen:updated', generic);
  emitDashboardUpdated(outletId);
}

/** ORDER_CREATED — also pushes the new ticket onto the kitchen display. */
export function emitOrderCreated(order: IOrder, summary: unknown) {
  const instance = tryGetIO();
  if (!instance) return;
  const outletId = order.outletId.toString();
  emitToOrderAudiences('ORDER_CREATED', order, orderPayload(order));
  instance.to(`kds:${outletId}`).emit('kds:new_order', summary);
  emitDashboardUpdated(outletId);
}

export function emitPaymentUpdated(order: IOrder) {
  const instance = tryGetIO();
  if (!instance) return;
  const payload = orderPayload(order);
  emitToOrderAudiences('PAYMENT_UPDATED', order, payload);
  instance.to(`order:${order.id}`).emit('order:payment_update', { orderId: order.id, paymentStatus: order.paymentStatus });
  emitDashboardUpdated(order.outletId.toString());
}

export function emitDeliveryUpdated(order: IOrder) {
  const instance = tryGetIO();
  if (!instance) return;
  emitToOrderAudiences('DELIVERY_UPDATED', order, orderPayload(order, { deliveryStaffId: order.deliveryStaffId?.toString() }));
  if (order.deliveryStaffId) instance.to(`user:${order.deliveryStaffId.toString()}`).emit('DELIVERY_UPDATED', orderPayload(order));
}

export function emitDashboardUpdated(outletId: string) {
  tryGetIO()?.to(`outlet:${outletId}:staff`).emit('DASHBOARD_UPDATED', { outletId, timestamp: new Date().toISOString() });
}
