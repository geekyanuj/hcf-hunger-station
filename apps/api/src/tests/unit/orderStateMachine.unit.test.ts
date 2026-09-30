import { describe, it, expect } from 'vitest';
import {
  ORDER_TRANSITIONS,
  OrderActor,
  OrderFacts,
  canTransitionOrderStatus,
  getAvailableActions,
  flowForOrderType,
  cancelledByFor,
  customerStatusLabel,
} from '../../services/orderStateMachine';
import { DEFAULT_ROLE_PERMISSIONS, RoleName } from '../../config/permissions';
import { OrderStatus, OrderType } from '../../models/Order';
import { canTransitionPaymentStatus } from '../../services/paymentStateMachine';

const staff = (role: RoleName, id = `${role.toLowerCase()}-1`): OrderActor => ({
  type: 'STAFF',
  role,
  id,
  permissions: DEFAULT_ROLE_PERMISSIONS[role],
  outletIds: ['outlet-1'],
});
const customer = (id = 'cust-1'): OrderActor => ({ type: 'CUSTOMER', id, permissions: [] });
const guest: OrderActor = { type: 'GUEST', permissions: [] };

const manager = staff('MANAGER');
const cashier = staff('CASHIER');
const kitchen = staff('KITCHEN');
const rider = staff('DELIVERY', 'rider-1');
const inventory = staff('INVENTORY');

function order(orderStatus: OrderStatus, orderType: OrderType, extra: Partial<OrderFacts> = {}): OrderFacts {
  const base: OrderFacts = { orderStatus, orderType };
  if (orderType === 'DINE_IN') Object.assign(base, { tableId: 'table-1', tableNumber: '12' });
  return { ...base, ...extra };
}

const ALL: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'];

describe('order type → flow mapping', () => {
  it('maps Parcel/Take/Dine (POS + Catering are handed over in person, so Take)', () => {
    expect(flowForOrderType('DELIVERY')).toBe('PARCEL');
    expect(flowForOrderType('TAKEAWAY')).toBe('TAKE');
    expect(flowForOrderType('DINE_IN')).toBe('DINE');
    expect(flowForOrderType('POS')).toBe('TAKE');
    expect(flowForOrderType('CATERING')).toBe('TAKE');
  });
});

describe('transition matrix (§7) — manager, which holds every permission', () => {
  it('has exactly the specified base transitions', () => {
    expect(ORDER_TRANSITIONS).toEqual({
      PENDING: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['PREPARING', 'CANCELLED'],
      PREPARING: ['READY', 'CANCELLED'],
      READY: ['COMPLETED', 'OUT_FOR_DELIVERY', 'CANCELLED'],
      OUT_FOR_DELIVERY: ['COMPLETED', 'CANCELLED'],
      COMPLETED: [],
      CANCELLED: [],
    });
  });

  it('walks the full Take flow', () => {
    const steps: [OrderStatus, OrderStatus][] = [
      ['PENDING', 'CONFIRMED'],
      ['CONFIRMED', 'PREPARING'],
      ['PREPARING', 'READY'],
      ['READY', 'COMPLETED'],
    ];
    for (const [from, to] of steps) {
      expect(canTransitionOrderStatus(order(from, 'TAKEAWAY'), to, manager).allowed, `${from}→${to}`).toBe(true);
    }
  });

  it('walks the full Dine flow (with table)', () => {
    const steps: [OrderStatus, OrderStatus][] = [
      ['PENDING', 'CONFIRMED'],
      ['CONFIRMED', 'PREPARING'],
      ['PREPARING', 'READY'],
      ['READY', 'COMPLETED'],
    ];
    for (const [from, to] of steps) {
      expect(canTransitionOrderStatus(order(from, 'DINE_IN'), to, manager).allowed, `${from}→${to}`).toBe(true);
    }
  });

  it('walks the full Parcel flow (READY → OUT_FOR_DELIVERY → COMPLETED)', () => {
    const rest = { deliveryStaffId: 'rider-1' };
    expect(canTransitionOrderStatus(order('PENDING', 'DELIVERY'), 'CONFIRMED', manager).allowed).toBe(true);
    expect(canTransitionOrderStatus(order('CONFIRMED', 'DELIVERY'), 'PREPARING', manager).allowed).toBe(true);
    expect(canTransitionOrderStatus(order('PREPARING', 'DELIVERY'), 'READY', manager).allowed).toBe(true);
    expect(canTransitionOrderStatus(order('READY', 'DELIVERY', rest), 'OUT_FOR_DELIVERY', manager).allowed).toBe(true);
    expect(canTransitionOrderStatus(order('OUT_FOR_DELIVERY', 'DELIVERY', rest), 'COMPLETED', manager).allowed).toBe(true);
  });

  it('rejects every arbitrary jump named in the spec', () => {
    const jumps: [OrderStatus, OrderStatus][] = [
      ['PENDING', 'READY'],
      ['PENDING', 'COMPLETED'],
      ['PREPARING', 'PENDING'],
      ['COMPLETED', 'PREPARING'],
      ['CANCELLED', 'CONFIRMED'],
      ['CANCELLED', 'PREPARING'],
    ];
    for (const [from, to] of jumps) {
      const r = canTransitionOrderStatus(order(from, 'TAKEAWAY'), to, manager);
      expect(r.allowed, `${from}→${to}`).toBe(false);
    }
  });

  it('never allows a backward move or a self-transition, for any type', () => {
    for (const type of ['DELIVERY', 'TAKEAWAY', 'DINE_IN'] as OrderType[]) {
      for (const from of ALL) {
        for (const to of ALL) {
          const legalBase = ORDER_TRANSITIONS[from].includes(to);
          const r = canTransitionOrderStatus(order(from, type, { deliveryStaffId: 'rider-1' }), to, manager, { cancellationReason: 'test reason' });
          if (!legalBase) expect(r.allowed, `${type}: ${from}→${to}`).toBe(false);
        }
      }
    }
  });

  it('treats COMPLETED and CANCELLED as terminal for every actor, including admin override', () => {
    for (const to of ALL) {
      expect(canTransitionOrderStatus(order('COMPLETED', 'TAKEAWAY'), to, manager, { cancellationReason: 'refund please' }).allowed).toBe(false);
      expect(canTransitionOrderStatus(order('CANCELLED', 'TAKEAWAY'), to, manager).allowed).toBe(false);
    }
    // §6: COMPLETED → CANCELLED specifically must never happen
    const r = canTransitionOrderStatus(order('COMPLETED', 'DELIVERY'), 'CANCELLED', staff('OWNER'), { cancellationReason: 'x'.repeat(10) });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('TERMINAL_STATUS');
  });
});

describe('order-type-specific validation (§8)', () => {
  it('Parcel cannot go READY → COMPLETED (no counter handover)', () => {
    const r = canTransitionOrderStatus(order('READY', 'DELIVERY', { deliveryStaffId: 'rider-1' }), 'COMPLETED', manager);
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('INVALID_FOR_ORDER_TYPE');
  });
  it('Take and Dine cannot go READY → OUT_FOR_DELIVERY', () => {
    for (const type of ['TAKEAWAY', 'DINE_IN', 'POS', 'CATERING'] as OrderType[]) {
      const r = canTransitionOrderStatus(order('READY', type), 'OUT_FOR_DELIVERY', manager);
      expect(r.allowed, type).toBe(false);
      expect(r.code).toBe('INVALID_FOR_ORDER_TYPE');
    }
  });
  it('a Parcel order cannot leave for delivery without a delivery executive', () => {
    const r = canTransitionOrderStatus(order('READY', 'DELIVERY'), 'OUT_FOR_DELIVERY', manager);
    expect(r.allowed).toBe(false);
    expect(r.code).toBe('DELIVERY_NOT_ASSIGNED');
  });
  it('a Dine order must carry tableId and tableNumber to progress', () => {
    const noTable: OrderFacts = { orderStatus: 'PENDING', orderType: 'DINE_IN' };
    expect(canTransitionOrderStatus(noTable, 'CONFIRMED', manager).code).toBe('TABLE_REQUIRED');
    expect(canTransitionOrderStatus({ ...noTable, tableId: 't1' }, 'CONFIRMED', manager).code).toBe('TABLE_REQUIRED');
    expect(canTransitionOrderStatus({ ...noTable, tableId: 't1', tableNumber: '4' }, 'CONFIRMED', manager).allowed).toBe(true);
    // ...but a table problem must never trap an order that needs cancelling
    expect(canTransitionOrderStatus(noTable, 'CANCELLED', manager).allowed).toBe(true);
  });
});

describe('cancellation rules (§6)', () => {
  it('customer may cancel their own PENDING and CONFIRMED orders only', () => {
    const own = { customerId: 'cust-1' };
    expect(canTransitionOrderStatus(order('PENDING', 'TAKEAWAY', own), 'CANCELLED', customer()).allowed).toBe(true);
    expect(canTransitionOrderStatus(order('CONFIRMED', 'TAKEAWAY', own), 'CANCELLED', customer()).allowed).toBe(true);
    for (const s of ['PREPARING', 'READY'] as OrderStatus[]) {
      const r = canTransitionOrderStatus(order(s, 'TAKEAWAY', own), 'CANCELLED', customer(), { cancellationReason: 'changed my mind' });
      expect(r.allowed, s).toBe(false);
      expect(r.httpStatus).toBe(403);
    }
    const out = canTransitionOrderStatus(order('OUT_FOR_DELIVERY', 'DELIVERY', { ...own, deliveryStaffId: 'r' }), 'CANCELLED', customer(), { cancellationReason: 'changed my mind' });
    expect(out.allowed).toBe(false);
  });

  it("a customer cannot cancel someone else's order", () => {
    const r = canTransitionOrderStatus(order('PENDING', 'TAKEAWAY', { customerId: 'someone-else' }), 'CANCELLED', customer());
    expect(r.allowed).toBe(false);
    expect(r.httpStatus).toBe(403);
  });

  it('a guest may cancel only guest orders (no customer account attached)', () => {
    expect(canTransitionOrderStatus(order('PENDING', 'DINE_IN'), 'CANCELLED', guest).allowed).toBe(true);
    expect(canTransitionOrderStatus(order('PENDING', 'TAKEAWAY', { customerId: 'cust-1' }), 'CANCELLED', guest).allowed).toBe(false);
  });

  it('staff/admin override: PREPARING and READY need orders.cancel AND a reason', () => {
    for (const s of ['PREPARING', 'READY'] as OrderStatus[]) {
      const noReason = canTransitionOrderStatus(order(s, 'TAKEAWAY'), 'CANCELLED', cashier);
      expect(noReason.allowed).toBe(false);
      expect(noReason.code).toBe('REASON_REQUIRED');
      expect(canTransitionOrderStatus(order(s, 'TAKEAWAY'), 'CANCELLED', cashier, { cancellationReason: 'Kitchen ran out' }).allowed).toBe(true);
      // kitchen and inventory have no orders.cancel
      expect(canTransitionOrderStatus(order(s, 'TAKEAWAY'), 'CANCELLED', kitchen, { cancellationReason: 'Kitchen ran out' }).allowed).toBe(false);
      expect(canTransitionOrderStatus(order(s, 'TAKEAWAY'), 'CANCELLED', inventory, { cancellationReason: 'Kitchen ran out' }).allowed).toBe(false);
    }
  });

  it('OUT_FOR_DELIVERY cancellation is an admin (owner/manager) override only', () => {
    const o = order('OUT_FOR_DELIVERY', 'DELIVERY', { deliveryStaffId: 'rider-1' });
    const ctx = { cancellationReason: 'Customer unreachable' };
    expect(canTransitionOrderStatus(o, 'CANCELLED', cashier, ctx).allowed).toBe(false);
    expect(canTransitionOrderStatus(o, 'CANCELLED', rider, ctx).allowed).toBe(false);
    expect(canTransitionOrderStatus(o, 'CANCELLED', manager, ctx).allowed).toBe(true);
    expect(canTransitionOrderStatus(o, 'CANCELLED', staff('OWNER'), ctx).allowed).toBe(true);
  });

  it('early-stage cancellation by staff needs no reason', () => {
    expect(canTransitionOrderStatus(order('PENDING', 'TAKEAWAY'), 'CANCELLED', cashier).allowed).toBe(true);
    expect(canTransitionOrderStatus(order('CONFIRMED', 'TAKEAWAY'), 'CANCELLED', cashier).allowed).toBe(true);
  });

  it('attributes cancellation to CUSTOMER / STAFF / ADMIN / SYSTEM', () => {
    expect(cancelledByFor(customer())).toBe('CUSTOMER');
    expect(cancelledByFor(guest)).toBe('CUSTOMER');
    expect(cancelledByFor(cashier)).toBe('STAFF');
    expect(cancelledByFor(manager)).toBe('ADMIN');
    expect(cancelledByFor(staff('OWNER'))).toBe('ADMIN');
    expect(cancelledByFor({ type: 'SYSTEM', permissions: [] })).toBe('SYSTEM');
  });
});

describe('role-based forward permissions', () => {
  it('kitchen can confirm/prepare/ready and hand over Take/Dine, but not dispatch or complete Parcel', () => {
    expect(canTransitionOrderStatus(order('PENDING', 'TAKEAWAY'), 'CONFIRMED', kitchen).allowed).toBe(true);
    expect(canTransitionOrderStatus(order('CONFIRMED', 'TAKEAWAY'), 'PREPARING', kitchen).allowed).toBe(true);
    expect(canTransitionOrderStatus(order('PREPARING', 'TAKEAWAY'), 'READY', kitchen).allowed).toBe(true);
    expect(canTransitionOrderStatus(order('READY', 'DINE_IN'), 'COMPLETED', kitchen).allowed).toBe(true);
    const dispatch = canTransitionOrderStatus(order('READY', 'DELIVERY', { deliveryStaffId: 'rider-1' }), 'OUT_FOR_DELIVERY', kitchen);
    expect(dispatch.allowed).toBe(false);
    expect(dispatch.httpStatus).toBe(403);
    expect(canTransitionOrderStatus(order('OUT_FOR_DELIVERY', 'DELIVERY', { deliveryStaffId: 'rider-1' }), 'COMPLETED', kitchen).allowed).toBe(false);
  });

  it('only the ASSIGNED delivery executive can dispatch and complete a Parcel', () => {
    const mine = { deliveryStaffId: 'rider-1' };
    const notMine = { deliveryStaffId: 'rider-2' };
    expect(canTransitionOrderStatus(order('READY', 'DELIVERY', mine), 'OUT_FOR_DELIVERY', rider).allowed).toBe(true);
    expect(canTransitionOrderStatus(order('READY', 'DELIVERY', notMine), 'OUT_FOR_DELIVERY', rider).allowed).toBe(false);
    expect(canTransitionOrderStatus(order('OUT_FOR_DELIVERY', 'DELIVERY', mine), 'COMPLETED', rider).allowed).toBe(true);
    expect(canTransitionOrderStatus(order('OUT_FOR_DELIVERY', 'DELIVERY', notMine), 'COMPLETED', rider).allowed).toBe(false);
    // riders cannot touch kitchen steps
    expect(canTransitionOrderStatus(order('PREPARING', 'DELIVERY', mine), 'READY', rider).allowed).toBe(false);
  });

  it('customers, guests and inventory staff cannot move an order forward', () => {
    for (const actor of [customer(), guest, inventory]) {
      expect(canTransitionOrderStatus(order('PENDING', 'TAKEAWAY', { customerId: 'cust-1' }), 'CONFIRMED', actor).allowed).toBe(false);
    }
  });
});

describe('available actions (§15) — what the dashboard may render', () => {
  const keys = (o: OrderFacts, a: OrderActor) => getAvailableActions(o, a).map((x) => x.key);

  it('PENDING: Confirm, Cancel, Print Customer, Print Kitchen, Print Token', () => {
    expect(keys(order('PENDING', 'TAKEAWAY'), manager)).toEqual(['CONFIRM', 'CANCEL', 'PRINT_CUSTOMER', 'PRINT_KITCHEN', 'PRINT_TOKEN']);
  });
  it('CONFIRMED: Start Preparing, Cancel, prints', () => {
    expect(keys(order('CONFIRMED', 'TAKEAWAY'), manager)).toEqual(['START_PREPARING', 'CANCEL', 'PRINT_CUSTOMER', 'PRINT_KITCHEN', 'PRINT_TOKEN']);
  });
  it('PREPARING: Mark Ready (+ Cancel only for roles with permission)', () => {
    expect(keys(order('PREPARING', 'TAKEAWAY'), manager)).toEqual(['MARK_READY', 'CANCEL', 'PRINT_CUSTOMER', 'PRINT_KITCHEN', 'PRINT_TOKEN']);
    expect(keys(order('PREPARING', 'TAKEAWAY'), kitchen)).toEqual(['MARK_READY', 'PRINT_CUSTOMER', 'PRINT_KITCHEN']);
  });
  it('READY (Parcel): Assign Delivery + Mark Out for Delivery (disabled until assigned)', () => {
    const unassigned = getAvailableActions(order('READY', 'DELIVERY'), manager);
    expect(unassigned.map((a) => a.key)).toEqual(['ASSIGN_DELIVERY', 'MARK_OUT_FOR_DELIVERY', 'CANCEL', 'PRINT_CUSTOMER', 'PRINT_KITCHEN', 'PRINT_TOKEN']);
    expect(unassigned.find((a) => a.key === 'MARK_OUT_FOR_DELIVERY')!.enabled).toBe(false);
    const assigned = getAvailableActions(order('READY', 'DELIVERY', { deliveryStaffId: 'rider-1' }), manager);
    expect(assigned.find((a) => a.key === 'MARK_OUT_FOR_DELIVERY')!.enabled).toBe(true);
    expect(assigned.find((a) => a.key === 'ASSIGN_DELIVERY')!.label).toBe('Reassign Delivery');
    expect(assigned.some((a) => a.key === 'COMPLETE')).toBe(false); // never on a Parcel at READY
  });
  it('READY (Take / Dine): Complete, never Out for Delivery', () => {
    for (const type of ['TAKEAWAY', 'DINE_IN'] as OrderType[]) {
      const k = keys(order('READY', type), manager);
      expect(k).toContain('COMPLETE');
      expect(k).not.toContain('MARK_OUT_FOR_DELIVERY');
      expect(k).not.toContain('ASSIGN_DELIVERY');
    }
  });
  it('OUT_FOR_DELIVERY: Complete + Print Customer (no kitchen print)', () => {
    const k = keys(order('OUT_FOR_DELIVERY', 'DELIVERY', { deliveryStaffId: 'r' }), manager);
    expect(k).toContain('COMPLETE');
    expect(k).toContain('PRINT_CUSTOMER');
    expect(k).not.toContain('PRINT_KITCHEN');
  });
  it('terminal states: View + prints only — no status-changing action', () => {
    for (const s of ['COMPLETED', 'CANCELLED'] as OrderStatus[]) {
      const actions = getAvailableActions(order(s, 'TAKEAWAY'), staff('OWNER'));
      expect(actions.map((a) => a.key)).toEqual(['VIEW', 'PRINT_CUSTOMER', 'PRINT_TOKEN']);
      expect(actions.some((a) => a.kind === 'STATUS')).toBe(false);
    }
  });
  it('Print Token is offered to OWNER, MANAGER and CASHIER only', () => {
    for (const role of ['OWNER', 'MANAGER', 'CASHIER'] as RoleName[]) {
      expect(keys(order('PENDING', 'TAKEAWAY'), staff(role)), role).toContain('PRINT_TOKEN');
    }
    for (const role of ['KITCHEN', 'INVENTORY', 'DELIVERY'] as RoleName[]) {
      expect(keys(order('PENDING', 'TAKEAWAY'), staff(role)), role).not.toContain('PRINT_TOKEN');
    }
    expect(keys(order('PENDING', 'TAKEAWAY'), guest)).not.toContain('PRINT_TOKEN');
    expect(keys(order('PENDING', 'TAKEAWAY'), customer())).not.toContain('PRINT_TOKEN');
  });
  it('a token can be re-printed on closed orders too', () => {
    expect(keys(order('COMPLETED', 'TAKEAWAY'), cashier)).toContain('PRINT_TOKEN');
    expect(keys(order('CANCELLED', 'TAKEAWAY'), cashier)).toContain('PRINT_TOKEN');
  });
  it('a customer only ever sees Cancel, and only while it is allowed', () => {
    const own = { customerId: 'cust-1' };
    expect(keys(order('PENDING', 'TAKEAWAY', own), customer())).toEqual(['CANCEL']);
    expect(keys(order('CONFIRMED', 'TAKEAWAY', own), customer())).toEqual(['CANCEL']);
    expect(keys(order('PREPARING', 'TAKEAWAY', own), customer())).toEqual([]);
    expect(keys(order('READY', 'TAKEAWAY', own), customer())).toEqual([]);
  });
  it('late-stage cancel asks for a reason; early cancel does not', () => {
    expect(getAvailableActions(order('PREPARING', 'TAKEAWAY'), manager).find((a) => a.key === 'CANCEL')!.requiresReason).toBe(true);
    expect(getAvailableActions(order('PENDING', 'TAKEAWAY'), manager).find((a) => a.key === 'CANCEL')!.requiresReason).toBe(false);
  });
  it('every enabled status action the UI is offered is accepted by the validator (UI and API cannot disagree)', () => {
    for (const type of ['DELIVERY', 'TAKEAWAY', 'DINE_IN'] as OrderType[]) {
      for (const status of ALL) {
        for (const actor of [manager, cashier, kitchen, rider, customer(), guest]) {
          const facts = order(status, type, { deliveryStaffId: 'rider-1', customerId: 'cust-1' });
          for (const a of getAvailableActions(facts, actor)) {
            if (a.kind !== 'STATUS' || !a.enabled) continue;
            const r = canTransitionOrderStatus(facts, a.targetStatus!, actor, { cancellationReason: 'valid reason' });
            expect(r.allowed, `${type} ${status} ${a.key} as ${actor.role ?? actor.type}`).toBe(true);
          }
        }
      }
    }
  });
});

describe('customer-facing wording (§13)', () => {
  it('uses friendly text and is order-type aware for READY', () => {
    expect(customerStatusLabel('PENDING', 'TAKEAWAY')).toBe('Order Received');
    expect(customerStatusLabel('CONFIRMED', 'TAKEAWAY')).toBe('Order Confirmed');
    expect(customerStatusLabel('PREPARING', 'TAKEAWAY')).toBe('Preparing Your Order');
    expect(customerStatusLabel('READY', 'TAKEAWAY')).toBe('Ready for Pickup');
    expect(customerStatusLabel('READY', 'DINE_IN')).toBe('Your Food Is Ready');
    expect(customerStatusLabel('READY', 'DELIVERY')).toBe('Ready for Delivery');
    expect(customerStatusLabel('OUT_FOR_DELIVERY', 'DELIVERY')).toBe('Out for Delivery');
    expect(customerStatusLabel('COMPLETED', 'DINE_IN')).toBe('Order Completed');
    expect(customerStatusLabel('CANCELLED', 'DINE_IN')).toBe('Order Cancelled');
  });
});

describe('payment state machine (§9–10) is separate from order status', () => {
  it('supports the normal, failure/retry and refund paths', () => {
    expect(canTransitionPaymentStatus('PENDING', 'PAID')).toBe(true);
    expect(canTransitionPaymentStatus('PENDING', 'PARTIALLY_PAID')).toBe(true);
    expect(canTransitionPaymentStatus('PARTIALLY_PAID', 'PAID')).toBe(true);
    expect(canTransitionPaymentStatus('PENDING', 'FAILED')).toBe(true);
    expect(canTransitionPaymentStatus('FAILED', 'PAID')).toBe(true);
    expect(canTransitionPaymentStatus('PAID', 'PARTIALLY_REFUNDED')).toBe(true);
    expect(canTransitionPaymentStatus('PARTIALLY_REFUNDED', 'REFUNDED')).toBe(true);
    expect(canTransitionPaymentStatus('PAID', 'REFUNDED')).toBe(true);
  });
  it('blocks nonsense payment moves', () => {
    expect(canTransitionPaymentStatus('PENDING', 'REFUNDED')).toBe(false);
    expect(canTransitionPaymentStatus('REFUNDED', 'PAID')).toBe(false);
    expect(canTransitionPaymentStatus('PAID', 'PENDING')).toBe(false);
    expect(canTransitionPaymentStatus('PAID', 'FAILED')).toBe(false);
  });
});
