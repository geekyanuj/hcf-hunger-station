/**
 * Centralized ORDER STATUS state machine.
 *
 * This file is the single source of truth for what an order is allowed to do.
 * Controllers, services, the KDS, the delivery dashboard and the "available
 * actions" the frontend renders all go through it — transition logic must
 * never be re-implemented anywhere else.
 *
 *   PENDING → CONFIRMED → PREPARING → READY ─┬─→ COMPLETED               (Take / Dine)
 *                                            └─→ OUT_FOR_DELIVERY → COMPLETED   (Parcel)
 *   Any non-terminal status → CANCELLED (subject to who is asking, see below)
 *   COMPLETED and CANCELLED are terminal.
 *
 * Order-type mapping used by the business vocabulary:
 *   Parcel = DELIVERY, Take = TAKEAWAY, Dine = DINE_IN.
 *   POS (counter) and CATERING hand the food over in person, so they follow
 *   the Take flow.
 *
 * The module is deliberately pure (no database, no sockets) so it is trivial
 * to unit test and can be shared by every layer.
 */
import { OrderStatus, OrderType, DeliveryStatus, CancelledBy } from '../models/Order';
import { Permission, RoleName } from '../config/permissions';
import { AccessTokenPayload } from '../types/auth';

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export type OrderFlow = 'PARCEL' | 'TAKE' | 'DINE';

export function flowForOrderType(orderType: OrderType): OrderFlow {
  if (orderType === 'DELIVERY') return 'PARCEL';
  if (orderType === 'DINE_IN') return 'DINE';
  return 'TAKE'; // TAKEAWAY, POS (counter) and CATERING are handed over in person
}

export const TERMINAL_STATUSES: readonly OrderStatus[] = ['COMPLETED', 'CANCELLED'];
export const ACTIVE_STATUSES: readonly OrderStatus[] = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'];

export function isTerminalStatus(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Staff roles that count as "admin" for cancellation attribution and for the late-stage cancellation override. */
const ADMIN_ROLES: readonly RoleName[] = ['OWNER', 'MANAGER'];

// ---------------------------------------------------------------------------
// The exact transition matrix (order-type independent part)
// ---------------------------------------------------------------------------

export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['COMPLETED', 'OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** Order-type-specific rules layered on top of ORDER_TRANSITIONS. */
function isValidForFlow(current: OrderStatus, requested: OrderStatus, flow: OrderFlow): boolean {
  if (current === 'READY' && requested === 'OUT_FOR_DELIVERY') return flow === 'PARCEL';
  if (current === 'READY' && requested === 'COMPLETED') return flow !== 'PARCEL'; // Parcel must go through OUT_FOR_DELIVERY
  if (current === 'OUT_FOR_DELIVERY') return flow === 'PARCEL';
  return true;
}

// ---------------------------------------------------------------------------
// Actor (who is asking)
// ---------------------------------------------------------------------------

export type OrderActorType = 'CUSTOMER' | 'GUEST' | 'STAFF' | 'SYSTEM';

export interface OrderActor {
  type: OrderActorType;
  /** Staff role name when type === 'STAFF'. */
  role?: RoleName;
  permissions: readonly Permission[];
  /** Staff user id (STAFF) or customer id (CUSTOMER). */
  id?: string;
  /** Outlets a staff member is scoped to (OWNER bypasses). */
  outletIds?: readonly string[];
}

export const SYSTEM_ACTOR: OrderActor = { type: 'SYSTEM', permissions: [] };

/** Builds an actor from the verified JWT payload (or a guest when there is none). */
export function actorFromAuth(auth?: AccessTokenPayload): OrderActor {
  if (!auth) return { type: 'GUEST', permissions: [] };
  if (auth.type === 'CUSTOMER') return { type: 'CUSTOMER', id: auth.sub, permissions: [] };
  return { type: 'STAFF', id: auth.sub, role: auth.role, permissions: auth.permissions, outletIds: auth.outletIds };
}

/** Role label stored in status history / audit entries. */
export function actorRoleLabel(actor: OrderActor): string {
  if (actor.type === 'STAFF') return actor.role ?? 'STAFF';
  return actor.type; // CUSTOMER | GUEST | SYSTEM
}

export function cancelledByFor(actor: OrderActor): CancelledBy {
  if (actor.type === 'STAFF') return actor.role && ADMIN_ROLES.includes(actor.role) ? 'ADMIN' : 'STAFF';
  if (actor.type === 'SYSTEM') return 'SYSTEM';
  return 'CUSTOMER';
}

function hasPermission(actor: OrderActor, permission: Permission): boolean {
  return actor.type === 'STAFF' && actor.permissions.includes(permission);
}

// ---------------------------------------------------------------------------
// Transition validation
// ---------------------------------------------------------------------------

/** The facts about an order that the validator needs. Kept minimal so it can be built from a document or a lean query. */
export interface OrderFacts {
  orderStatus: OrderStatus;
  orderType: OrderType;
  customerId?: string;
  deliveryStaffId?: string;
  deliveryStatus?: DeliveryStatus;
  tableId?: string;
  tableNumber?: string;
}

export type TransitionCode =
  | 'OK'
  | 'TERMINAL_STATUS'
  | 'INVALID_TRANSITION'
  | 'INVALID_FOR_ORDER_TYPE'
  | 'FORBIDDEN'
  | 'DELIVERY_NOT_ASSIGNED'
  | 'TABLE_REQUIRED'
  | 'REASON_REQUIRED';

export interface TransitionResult {
  allowed: boolean;
  code: TransitionCode;
  message: string;
  /** HTTP status the API layer should use when `allowed` is false. */
  httpStatus: 200 | 400 | 403;
}

export interface TransitionContext {
  /** Free-text reason supplied with a cancellation. Mandatory for staff overrides after preparation has started. */
  cancellationReason?: string;
}

const ok: TransitionResult = { allowed: true, code: 'OK', message: 'OK', httpStatus: 200 };
const deny = (code: TransitionCode, message: string, httpStatus: 400 | 403 = 400): TransitionResult => ({
  allowed: false,
  code,
  message,
  httpStatus,
});

/**
 * THE validator. Conceptually:
 *
 *   canTransitionOrderStatus(currentStatus, requestedStatus, orderType, userRole)
 *
 * The "userRole" is passed as a full OrderActor (role + permissions + identity)
 * plus the order facts that some rules need (delivery assignment, table,
 * ownership). It validates: current status, requested status, order type,
 * user role, cancellation permission, delivery requirements and table
 * requirements — and nothing else in the codebase should duplicate that.
 */
export function canTransitionOrderStatus(
  order: OrderFacts,
  requestedStatus: OrderStatus,
  actor: OrderActor,
  context: TransitionContext = {}
): TransitionResult {
  const current = order.orderStatus;
  const flow = flowForOrderType(order.orderType);

  // 1. Terminal states never move again ("COMPLETED = terminal, CANCELLED = terminal").
  if (isTerminalStatus(current)) {
    return deny('TERMINAL_STATUS', `Order is already ${current} and can no longer be changed`);
  }

  // 2. The base matrix.
  if (!ORDER_TRANSITIONS[current].includes(requestedStatus)) {
    return deny('INVALID_TRANSITION', `Cannot transition order from ${current} to ${requestedStatus}`);
  }

  // 3. Order-type rules (Parcel vs Take/Dine).
  if (!isValidForFlow(current, requestedStatus, flow)) {
    const why =
      requestedStatus === 'OUT_FOR_DELIVERY'
        ? 'only Parcel orders can go out for delivery'
        : 'Parcel orders must go out for delivery before they can be completed';
    return deny('INVALID_FOR_ORDER_TYPE', `Cannot transition ${flow} order from ${current} to ${requestedStatus}: ${why}`);
  }

  // 4. Who is asking?
  if (requestedStatus === 'CANCELLED') {
    const cancelCheck = checkCancellation(order, actor, context);
    if (!cancelCheck.allowed) return cancelCheck;
  } else {
    const forwardCheck = checkForwardPermission(order, requestedStatus, actor);
    if (!forwardCheck.allowed) return forwardCheck;
  }

  // 5. Delivery requirement: a Parcel cannot leave the kitchen without a delivery executive.
  if (requestedStatus === 'OUT_FOR_DELIVERY' && !order.deliveryStaffId) {
    return deny('DELIVERY_NOT_ASSIGNED', 'Assign a delivery executive before marking the order out for delivery');
  }

  // 6. Table requirement: a Dine order must carry tableId + tableNumber throughout its lifecycle.
  if (flow === 'DINE' && requestedStatus !== 'CANCELLED' && (!order.tableId || !order.tableNumber)) {
    return deny('TABLE_REQUIRED', 'Dine orders must have a table (tableId and tableNumber) to progress');
  }

  return ok;
}

function checkForwardPermission(order: OrderFacts, requested: OrderStatus, actor: OrderActor): TransitionResult {
  if (actor.type === 'SYSTEM') return ok;
  if (actor.type !== 'STAFF') {
    return deny('FORBIDDEN', 'Only staff can move an order forward', 403);
  }

  // Managers/cashiers/owners (orders.update) can run every forward step.
  if (hasPermission(actor, 'orders.update')) return ok;

  const flow = flowForOrderType(order.orderType);
  const isAssignedRider = !!actor.id && !!order.deliveryStaffId && order.deliveryStaffId === actor.id;

  switch (requested) {
    case 'CONFIRMED':
    case 'PREPARING':
    case 'READY':
      // The kitchen (KDS) runs these steps.
      if (hasPermission(actor, 'kds.update')) return ok;
      break;
    case 'COMPLETED':
      if (order.orderStatus === 'READY' && flow !== 'PARCEL' && hasPermission(actor, 'kds.update')) return ok; // hand-over at the counter/table
      if (order.orderStatus === 'OUT_FOR_DELIVERY' && hasPermission(actor, 'delivery.update') && isAssignedRider) return ok;
      break;
    case 'OUT_FOR_DELIVERY':
      if (hasPermission(actor, 'delivery.update') && isAssignedRider) return ok;
      break;
    default:
      break;
  }
  return deny('FORBIDDEN', 'Your role is not permitted to perform this status change', 403);
}

function checkCancellation(order: OrderFacts, actor: OrderActor, context: TransitionContext): TransitionResult {
  const current = order.orderStatus;
  const earlyStage = current === 'PENDING' || current === 'CONFIRMED';

  if (actor.type === 'SYSTEM') return ok;

  if (earlyStage) {
    // Customer default rule: PENDING → CANCELLED and CONFIRMED → CANCELLED.
    if (actor.type === 'CUSTOMER') {
      if (order.customerId && order.customerId === actor.id) return ok;
      return deny('FORBIDDEN', 'You can only cancel your own orders', 403);
    }
    if (actor.type === 'GUEST') {
      // A guest order (no customer account) is authorised by knowledge of the order id, same trust model as tracking it.
      if (!order.customerId) return ok;
      return deny('FORBIDDEN', 'Please log in to cancel this order', 403);
    }
    if (hasPermission(actor, 'orders.cancel')) return ok;
    return deny('FORBIDDEN', 'Your role is not permitted to cancel orders', 403);
  }

  // From PREPARING onwards only authorised staff/admin may cancel (override).
  if (actor.type !== 'STAFF' || !hasPermission(actor, 'orders.cancel')) {
    return deny(
      'FORBIDDEN',
      'This order can no longer be cancelled by the customer. Please contact the restaurant.',
      403
    );
  }
  if (current === 'OUT_FOR_DELIVERY' && !(actor.role && ADMIN_ROLES.includes(actor.role))) {
    return deny('FORBIDDEN', 'Cancelling an order that is already out for delivery requires a manager/owner override', 403);
  }
  if (!context.cancellationReason || context.cancellationReason.trim().length < 3) {
    return deny('REASON_REQUIRED', 'A cancellation reason is required once preparation has started');
  }
  return ok;
}

// ---------------------------------------------------------------------------
// Available UI actions (what the dashboard may render for a given order + actor)
// ---------------------------------------------------------------------------

export type OrderActionKey =
  | 'CONFIRM'
  | 'START_PREPARING'
  | 'MARK_READY'
  | 'ASSIGN_DELIVERY'
  | 'MARK_OUT_FOR_DELIVERY'
  | 'COMPLETE'
  | 'CANCEL'
  | 'PRINT_CUSTOMER'
  | 'PRINT_KITCHEN'
  | 'PRINT_TOKEN'
  | 'VIEW';

export interface OrderAction {
  key: OrderActionKey;
  label: string;
  kind: 'STATUS' | 'ASSIGN_DELIVERY' | 'PRINT' | 'VIEW';
  /** For kind === 'STATUS': the status this action requests. */
  targetStatus?: OrderStatus;
  enabled: boolean;
  disabledReason?: string;
  /** UI should collect a cancellation reason before firing this action. */
  requiresReason?: boolean;
  destructive?: boolean;
}

const STATUS_ACTIONS: { key: OrderActionKey; label: string; target: OrderStatus }[] = [
  { key: 'CONFIRM', label: 'Confirm', target: 'CONFIRMED' },
  { key: 'START_PREPARING', label: 'Start Preparing', target: 'PREPARING' },
  { key: 'MARK_READY', label: 'Mark Ready', target: 'READY' },
  { key: 'MARK_OUT_FOR_DELIVERY', label: 'Mark Out for Delivery', target: 'OUT_FOR_DELIVERY' },
  { key: 'COMPLETE', label: 'Complete', target: 'COMPLETED' },
];

/**
 * Computes the actions to display for an order. The list is derived from the
 * same validator the API enforces, so the UI can never offer a button the
 * backend would reject (and terminal orders never get a status-changing action).
 */
export function getAvailableActions(order: OrderFacts, actor: OrderActor): OrderAction[] {
  const actions: OrderAction[] = [];
  const status = order.orderStatus;
  const flow = flowForOrderType(order.orderType);
  const isStaff = actor.type === 'STAFF';

  if (!isTerminalStatus(status)) {
    // Forward step(s) valid for this status + order type.
    for (const def of STATUS_ACTIONS) {
      if (!ORDER_TRANSITIONS[status].includes(def.target)) continue;
      if (!isValidForFlow(status, def.target, flow)) continue;
      const result = canTransitionOrderStatus(order, def.target, actor);
      if (result.allowed) {
        actions.push({ key: def.key, label: def.label, kind: 'STATUS', targetStatus: def.target, enabled: true });
      } else if (result.code === 'DELIVERY_NOT_ASSIGNED') {
        // Visible but disabled: the actor may do this once a delivery executive is assigned.
        actions.push({ key: def.key, label: def.label, kind: 'STATUS', targetStatus: def.target, enabled: false, disabledReason: result.message });
      }
    }

    // Parcel at READY: staff with delivery.assign can (re)assign a delivery executive until pickup.
    if (status === 'READY' && flow === 'PARCEL' && hasPermission(actor, 'delivery.assign') && order.deliveryStatus !== 'PICKED_UP') {
      const assignAction: OrderAction = {
        key: 'ASSIGN_DELIVERY',
        label: order.deliveryStaffId ? 'Reassign Delivery' : 'Assign Delivery',
        kind: 'ASSIGN_DELIVERY',
        enabled: true,
      };
      // Keep "Assign Delivery" ahead of "Mark Out for Delivery".
      const outIdx = actions.findIndex((a) => a.key === 'MARK_OUT_FOR_DELIVERY');
      if (outIdx >= 0) actions.splice(outIdx, 0, assignAction);
      else actions.push(assignAction);
    }

    // Cancellation — evaluated with a placeholder reason so that "reason required" is surfaced as requiresReason instead of hiding the button.
    const cancel = canTransitionOrderStatus(order, 'CANCELLED', actor, { cancellationReason: 'placeholder-reason' });
    if (cancel.allowed) {
      actions.push({
        key: 'CANCEL',
        label: 'Cancel',
        kind: 'STATUS',
        targetStatus: 'CANCELLED',
        enabled: true,
        requiresReason: !(status === 'PENDING' || status === 'CONFIRMED'),
        destructive: true,
      });
    }
  }

  if (isStaff) {
    actions.push({ key: 'PRINT_CUSTOMER', label: 'Print Customer', kind: 'PRINT', enabled: true });
    if (status === 'PENDING' || status === 'CONFIRMED' || status === 'PREPARING' || status === 'READY') {
      actions.push({ key: 'PRINT_KITCHEN', label: 'Print Kitchen', kind: 'PRINT', enabled: true });
    }
    // Thermal token slip: only roles holding `tokens.print` (OWNER, MANAGER, CASHIER) see this button.
    if (hasPermission(actor, 'tokens.print')) {
      actions.push({ key: 'PRINT_TOKEN', label: 'Print Token', kind: 'PRINT', enabled: true });
    }
    if (isTerminalStatus(status)) {
      actions.unshift({ key: 'VIEW', label: 'View', kind: 'VIEW', enabled: true });
    }
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Customer-facing wording (used for notifications; the web app has its own presentation copy of these)
// ---------------------------------------------------------------------------

export function customerStatusLabel(status: OrderStatus, orderType: OrderType): string {
  switch (status) {
    case 'PENDING':
      return 'Order Received';
    case 'CONFIRMED':
      return 'Order Confirmed';
    case 'PREPARING':
      return 'Preparing Your Order';
    case 'READY': {
      const flow = flowForOrderType(orderType);
      if (flow === 'PARCEL') return 'Ready for Delivery';
      if (flow === 'DINE') return 'Your Food Is Ready';
      return 'Ready for Pickup';
    }
    case 'OUT_FOR_DELIVERY':
      return 'Out for Delivery';
    case 'COMPLETED':
      return 'Order Completed';
    case 'CANCELLED':
      return 'Order Cancelled';
  }
}
