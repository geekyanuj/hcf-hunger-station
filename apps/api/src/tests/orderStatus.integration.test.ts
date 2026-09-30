import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { Outlet } from '../models/Outlet';
import { MenuCategory } from '../models/MenuCategory';
import { MenuItem } from '../models/MenuItem';
import { Role } from '../models/Role';
import { User } from '../models/User';
import { Table } from '../models/Table';
import { Order } from '../models/Order';
import { Payment } from '../models/Payment';
import { hashPassword } from '../utils/password';
import { DEFAULT_ROLE_PERMISSIONS, ROLES, RoleName } from '../config/permissions';
import { signAccessToken } from '../utils/tokenUtils';
import { OrderService } from '../services/order.service';
import { actorFromAuth } from '../services/orderStateMachine';

const app = createApp();
const PASSWORD = 'Passw0rd!123';

async function seed() {
  for (const roleName of ROLES) {
    await Role.create({ name: roleName, permissions: DEFAULT_ROLE_PERMISSIONS[roleName], isSystem: true });
  }
  const outlet = await Outlet.create({ name: 'Status Outlet', code: 'STA', address: 'Addr', phone: '+919999999990', email: 'sta@hcf.example' });
  const category = await MenuCategory.create({ outletId: outlet._id, name: 'Burgers', slug: 'burgers' });
  const item = await MenuItem.create({ outletId: outlet._id, categoryId: category._id, name: 'Status Burger', slug: 'status-burger', price: 100, preparationTimeMinutes: 6 });
  const table = await Table.create({ outletId: outlet._id, tableNumber: '7', qrToken: 'qr-status-7' });
  const passwordHash = await hashPassword(PASSWORD);
  const mk = (name: string, role: string, extra = {}) =>
    User.create({ name, email: `${name.toLowerCase()}@sta.example`, passwordHash, role, outletIds: [outlet._id], ...extra });
  const [manager, cashier, kitchen, rider, otherRider] = await Promise.all([
    mk('Manager', 'MANAGER'), mk('Cashier', 'CASHIER'), mk('Kitchen', 'KITCHEN'), mk('Rider', 'DELIVERY'), mk('Rider2', 'DELIVERY'),
  ]);
  return { outlet, item, table, manager, cashier, kitchen, rider, otherRider };
}

// Login is rate-limited (10/min), so tests mint the same JWT the login endpoint would issue.
// One real login round-trip is still exercised in "staff can log in" below.
async function staffToken(email: string) {
  const user = await User.findOne({ email });
  return signAccessToken({
    type: 'STAFF',
    sub: user!.id,
    role: user!.role as RoleName,
    permissions: DEFAULT_ROLE_PERMISSIONS[user!.role as RoleName],
    outletIds: user!.outletIds.map((o) => o.toString()),
  });
}
async function customerLogin(mobile = '9876543210') {
  const res = await request(app).post('/api/v1/auth/customer/login').send({ name: 'Test Customer', mobile });
  return res.body.data.accessToken as string;
}

const patch = (id: string, token: string, body: Record<string, unknown>) =>
  request(app).patch(`/api/v1/orders/${id}/status`).set('Authorization', `Bearer ${token}`).send(body);

describe('order status API: full lifecycles, enforced by the backend', () => {
  it('Take: PENDING → CONFIRMED → PREPARING → READY → COMPLETED with a complete history timeline', async () => {
    const { outlet, item, cashier, kitchen } = await seed();
    const cashierToken = await staffToken(cashier.email);
    const kitchenToken = await staffToken(kitchen.email);

    const created = await request(app).post('/api/v1/orders').set('Authorization', `Bearer ${cashierToken}`)
      .send({ outletId: outlet.id, orderType: 'TAKEAWAY', lines: [{ menuItemId: item.id, quantity: 1, selectedOptionIds: [] }] });
    expect(created.status).toBe(201);
    expect(created.body.data.orderStatus).toBe('PENDING');
    expect(created.body.data.availableActions.map((a: { key: string }) => a.key)).toEqual(['CONFIRM', 'CANCEL', 'PRINT_CUSTOMER', 'PRINT_KITCHEN', 'PRINT_TOKEN']);
    const id = created.body.data._id;

    for (const status of ['CONFIRMED', 'PREPARING', 'READY']) {
      const res = await patch(id, kitchenToken, { status });
      expect(res.status, status).toBe(200);
      expect(res.body.data.orderStatus).toBe(status);
    }
    // READY (Take): Complete is offered, Out-for-delivery is not
    const readyActions = (await patch(id, cashierToken, { status: 'COMPLETED' })).body.data.availableActions.map((a: { key: string }) => a.key);
    expect(readyActions).toEqual(['VIEW', 'PRINT_CUSTOMER', 'PRINT_TOKEN']);

    const order = await Order.findById(id);
    expect(order!.orderStatus).toBe('COMPLETED');
    expect(order!.statusHistory.map((h) => h.status)).toEqual(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED']);
    for (const h of order!.statusHistory) {
      expect(h.timestamp).toBeInstanceOf(Date);
      expect(h.changedByRole).toBeTruthy();
    }
    expect(order!.statusHistory[1].changedByRole).toBe('KITCHEN');
    expect(order!.statusHistory[4].changedByRole).toBe('CASHIER');
  });

  it('rejects illegal jumps and terminal changes with 400 and leaves the order untouched', async () => {
    const { outlet, item, manager } = await seed();
    const token = await staffToken(manager.email);
    const created = await request(app).post('/api/v1/orders').set('Authorization', `Bearer ${token}`)
      .send({ outletId: outlet.id, orderType: 'TAKEAWAY', lines: [{ menuItemId: item.id, quantity: 1, selectedOptionIds: [] }] });
    const id = created.body.data._id;

    for (const status of ['READY', 'COMPLETED', 'PREPARING', 'OUT_FOR_DELIVERY', 'PENDING']) {
      const res = await patch(id, token, { status });
      expect(res.status, `PENDING → ${status}`).toBe(400);
    }
    expect((await Order.findById(id))!.orderStatus).toBe('PENDING');

    await patch(id, token, { status: 'CANCELLED' });
    for (const status of ['CONFIRMED', 'PREPARING', 'CANCELLED', 'COMPLETED']) {
      const res = await patch(id, token, { status });
      expect([400, 409], `CANCELLED → ${status}`).toContain(res.status);
    }
    expect((await Order.findById(id))!.orderStatus).toBe('CANCELLED');
    // legacy statuses no longer exist
    expect((await patch(id, token, { status: 'DELIVERED' })).status).toBe(400);
    expect((await patch(id, token, { status: 'RECEIVED' })).status).toBe(400);
  });

  it('Parcel: needs a delivery executive; deliveryStatus is tracked separately from orderStatus', async () => {
    const { outlet, item, manager, kitchen, rider, otherRider } = await seed();
    const mgr = await staffToken(manager.email);
    const kit = await staffToken(kitchen.email);
    const riderToken = await staffToken(rider.email);
    const otherToken = await staffToken(otherRider.email);

    const created = await request(app).post('/api/v1/orders').set('Authorization', `Bearer ${mgr}`).send({
      outletId: outlet.id, orderType: 'DELIVERY', lines: [{ menuItemId: item.id, quantity: 1, selectedOptionIds: [] }],
      deliveryAddress: { line1: '12 Test Road', city: 'Dhanbad', state: 'Jharkhand', pincode: '826001' },
    });
    expect(created.status).toBe(201);
    expect(created.body.data.deliveryStatus).toBe('PENDING');
    const id = created.body.data._id;

    for (const status of ['CONFIRMED', 'PREPARING', 'READY']) expect((await patch(id, kit, { status })).status).toBe(200);

    // Parcel cannot skip delivery
    expect((await patch(id, mgr, { status: 'COMPLETED' })).status).toBe(400);
    // kitchen may not dispatch
    expect((await patch(id, kit, { status: 'OUT_FOR_DELIVERY' })).status).toBe(403);
    // cannot dispatch before assigning an executive
    const early = await patch(id, mgr, { status: 'OUT_FOR_DELIVERY' });
    expect(early.status).toBe(400);
    expect(early.body.message).toMatch(/delivery executive/i);

    // assign → orderStatus stays READY, deliveryStatus ASSIGNED
    const assigned = await request(app).post(`/api/v1/delivery/${id}/assign`).set('Authorization', `Bearer ${mgr}`).send({ deliveryStaffId: rider.id });
    expect(assigned.status).toBe(200);
    expect(assigned.body.data.orderStatus).toBe('READY');
    expect(assigned.body.data.deliveryStatus).toBe('ASSIGNED');
    const keys = assigned.body.data.availableActions.map((a: { key: string; enabled: boolean }) => `${a.key}:${a.enabled}`);
    expect(keys).toContain('MARK_OUT_FOR_DELIVERY:true');

    // manager's dispatch board lists it with the executive's name and role-aware actions
    const board = await request(app).get(`/api/v1/delivery/in-flight?outletId=${outlet.id}`).set('Authorization', `Bearer ${mgr}`);
    expect(board.status).toBe(200);
    expect(board.body.data[0]).toMatchObject({ _id: id, deliveryStaffName: 'Rider', deliveryStatus: 'ASSIGNED' });
    expect(board.body.data[0].availableActions.map((a: { key: string }) => a.key)).toContain('MARK_OUT_FOR_DELIVERY');
    const execs = await request(app).get(`/api/v1/delivery/executives?outletId=${outlet.id}`).set('Authorization', `Bearer ${mgr}`);
    expect(execs.body.data.map((u: { name: string }) => u.name).sort()).toEqual(['Rider', 'Rider2']);

    // rider's queue only contains their own order
    const mine = await request(app).get('/api/v1/delivery/my-orders').set('Authorization', `Bearer ${riderToken}`);
    expect(mine.body.data.map((o: { _id: string }) => o._id)).toEqual([id]);
    const theirs = await request(app).get('/api/v1/delivery/my-orders').set('Authorization', `Bearer ${otherToken}`);
    expect(theirs.body.data).toHaveLength(0);

    // a different rider cannot pick it up or dispatch it
    expect((await request(app).post(`/api/v1/delivery/${id}/picked-up`).set('Authorization', `Bearer ${otherToken}`)).status).toBe(403);
    expect((await patch(id, otherToken, { status: 'OUT_FOR_DELIVERY' })).status).toBe(403);

    // picked up: still READY at the order level
    const picked = await request(app).post(`/api/v1/delivery/${id}/picked-up`).set('Authorization', `Bearer ${riderToken}`);
    expect(picked.status).toBe(200);
    expect(picked.body.data.orderStatus).toBe('READY');
    expect(picked.body.data.deliveryStatus).toBe('PICKED_UP');

    // rider dispatches and completes their own delivery
    const out = await patch(id, riderToken, { status: 'OUT_FOR_DELIVERY' });
    expect(out.status).toBe(200);
    expect(out.body.data.deliveryStatus).toBe('OUT_FOR_DELIVERY');
    const done = await patch(id, riderToken, { status: 'COMPLETED' });
    expect(done.status).toBe(200);
    expect(done.body.data.orderStatus).toBe('COMPLETED');
    expect(done.body.data.deliveryStatus).toBe('DELIVERED');

    const final = await Order.findById(id);
    expect(final!.statusHistory.map((h) => h.status)).toEqual(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED']);
    expect(final!.deliveryHistory.map((h) => h.status)).toEqual(['PENDING', 'ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED']);
  });

  it('Dine: carries tableId + tableNumber; Take/Dine reject OUT_FOR_DELIVERY; pay-after-dine-in keeps paymentStatus separate', async () => {
    const { outlet, item, table, manager, kitchen } = await seed();
    const mgr = await staffToken(manager.email);
    const kit = await staffToken(kitchen.email);

    // a dine order without a table is rejected up front
    const noTable = await request(app).post('/api/v1/orders').set('Authorization', `Bearer ${mgr}`)
      .send({ outletId: outlet.id, orderType: 'DINE_IN', lines: [{ menuItemId: item.id, quantity: 1, selectedOptionIds: [] }] });
    expect(noTable.status).toBe(400);
    // pay-after-dine-in only for dine
    const badPay = await request(app).post('/api/v1/orders').set('Authorization', `Bearer ${mgr}`)
      .send({ outletId: outlet.id, orderType: 'TAKEAWAY', paymentMethod: 'PAY_AFTER_DINE_IN', lines: [{ menuItemId: item.id, quantity: 1, selectedOptionIds: [] }] });
    expect(badPay.status).toBe(400);

    // staff pick the table directly (POS) …
    const created = await request(app).post('/api/v1/orders').set('Authorization', `Bearer ${mgr}`).send({
      outletId: outlet.id, orderType: 'DINE_IN', tableId: table.id, paymentMethod: 'PAY_AFTER_DINE_IN',
      lines: [{ menuItemId: item.id, quantity: 1, selectedOptionIds: [] }],
    });
    expect(created.status).toBe(201);
    expect(created.body.data.tableNumber).toBe('7');
    expect(created.body.data.paymentMethod).toBe('PAY_AFTER_DINE_IN');
    expect(created.body.data.paymentStatus).toBe('PENDING');
    const id = created.body.data._id;
    expect((await Table.findById(table._id))!.status).toBe('OCCUPIED');

    for (const status of ['CONFIRMED', 'PREPARING', 'READY']) expect((await patch(id, kit, { status })).status).toBe(200);
    expect((await patch(id, mgr, { status: 'OUT_FOR_DELIVERY' })).status).toBe(400);
    expect((await patch(id, kit, { status: 'COMPLETED' })).status).toBe(200);

    // order COMPLETED while payment is still PENDING; table released
    let order = await Order.findById(id);
    expect(order!.orderStatus).toBe('COMPLETED');
    expect(order!.paymentStatus).toBe('PENDING');
    expect(order!.tableId).toBeDefined();
    expect((await Table.findById(table._id))!.status).toBe('AVAILABLE');

    // a guest cannot mark a pay-after-dine-in order paid; staff can
    const guestPay = await request(app).post('/api/v1/payments').send({ orderId: id, method: 'CASH' });
    expect(guestPay.status).toBe(403);
    const staffPay = await request(app).post('/api/v1/payments').set('Authorization', `Bearer ${mgr}`).send({ orderId: id, method: 'CASH' });
    expect(staffPay.status).toBe(201);
    order = await Order.findById(id);
    expect(order!.paymentStatus).toBe('PAID');
    expect(order!.orderStatus).toBe('COMPLETED'); // payment never touches order status

    // refund → paymentStatus REFUNDED, orderStatus still COMPLETED
    const partial = await request(app).post('/api/v1/payments/refund').set('Authorization', `Bearer ${mgr}`).send({ orderId: id, amount: 10 });
    expect(partial.status).toBe(200);
    expect((await Order.findById(id))!.paymentStatus).toBe('PARTIALLY_REFUNDED');
    const tooMuch = await request(app).post('/api/v1/payments/refund').set('Authorization', `Bearer ${mgr}`).send({ orderId: id, amount: 100000 });
    expect(tooMuch.status).toBe(400);
    const rest = order!.total - 10;
    const full = await request(app).post('/api/v1/payments/refund').set('Authorization', `Bearer ${mgr}`).send({ orderId: id, amount: Number(rest.toFixed(2)) });
    expect(full.status).toBe(200);
    order = await Order.findById(id);
    expect(order!.paymentStatus).toBe('REFUNDED');
    expect(order!.orderStatus).toBe('COMPLETED');
    expect((await Payment.find({ orderId: id }))[0].status).toBe('REFUNDED');
  });
});

describe('cancellation (§6, §11)', () => {
  async function newOrder(token: string, outletId: string, itemId: string, orderType = 'TAKEAWAY') {
    const res = await request(app).post('/api/v1/orders').set('Authorization', `Bearer ${token}`)
      .send({ outletId, orderType, lines: [{ menuItemId: itemId, quantity: 1, selectedOptionIds: [] }] });
    return res.body.data._id as string;
  }

  it('customer can cancel PENDING/CONFIRMED (with cancellation data) but not once PREPARING', async () => {
    const { outlet, item, kitchen } = await seed();
    const custToken = await customerLogin();
    const kit = await staffToken(kitchen.email);

    const a = await newOrder(custToken, outlet.id, item.id);
    const cancelA = await request(app).post(`/api/v1/orders/${a}/cancel`).set('Authorization', `Bearer ${custToken}`).send({ reason: 'Ordered by mistake' });
    expect(cancelA.status).toBe(200);
    const doc = await Order.findById(a);
    expect(doc!.orderStatus).toBe('CANCELLED');
    expect(doc!.cancelledBy).toBe('CUSTOMER');
    expect(doc!.cancellationReason).toBe('Ordered by mistake');
    expect(doc!.previousOrderStatus).toBe('PENDING');
    expect(doc!.cancelledAt).toBeInstanceOf(Date);
    expect(doc!.paymentStatusAtCancellation).toBe('PENDING');
    expect(cancelA.body.data.availableActions.some((x: { kind: string }) => x.kind === 'STATUS')).toBe(false);
    expect(doc!.statusHistory.at(-1)!.status).toBe('CANCELLED');
    expect(doc!.statusHistory.at(-1)!.changedByRole).toBe('CUSTOMER');

    const b = await newOrder(custToken, outlet.id, item.id);
    await patch(b, kit, { status: 'CONFIRMED' });
    expect((await request(app).post(`/api/v1/orders/${b}/cancel`).set('Authorization', `Bearer ${custToken}`).send({})).status).toBe(200);

    const c = await newOrder(custToken, outlet.id, item.id);
    await patch(c, kit, { status: 'CONFIRMED' });
    await patch(c, kit, { status: 'PREPARING' });
    const late = await request(app).post(`/api/v1/orders/${c}/cancel`).set('Authorization', `Bearer ${custToken}`).send({ reason: 'too slow' });
    expect(late.status).toBe(403);
    expect((await Order.findById(c))!.orderStatus).toBe('PREPARING');

    // someone else's order
    const other = await customerLogin('9123456780');
    const d = await newOrder(custToken, outlet.id, item.id);
    expect((await request(app).post(`/api/v1/orders/${d}/cancel`).set('Authorization', `Bearer ${other}`).send({})).status).toBe(403);
    expect((await request(app).post(`/api/v1/orders/${d}/cancel`).send({})).status).toBe(403); // anonymous on an account order
  });

  it('staff override after preparation needs a reason and is attributed (STAFF vs ADMIN); COMPLETED can never be cancelled', async () => {
    const { outlet, item, cashier, manager, kitchen } = await seed();
    const cash = await staffToken(cashier.email);
    const mgr = await staffToken(manager.email);
    const kit = await staffToken(kitchen.email);
    const id = await newOrder(mgr, outlet.id, item.id);
    await patch(id, kit, { status: 'CONFIRMED' });
    await patch(id, kit, { status: 'PREPARING' });

    expect((await patch(id, kit, { status: 'CANCELLED', reason: 'no permission' })).status).toBe(403);
    expect((await patch(id, cash, { status: 'CANCELLED' })).status).toBe(400); // reason required
    const ok = await patch(id, cash, { status: 'CANCELLED', reason: 'Kitchen ran out of buns', note: 'called customer' });
    expect(ok.status).toBe(200);
    const doc = await Order.findById(id);
    expect(doc!.cancelledBy).toBe('STAFF');
    expect(doc!.cancelledByUserId?.toString()).toBe(cashier.id);
    expect(doc!.cancellationReason).toBe('Kitchen ran out of buns');
    expect(doc!.cancellationNote).toBe('called customer');
    expect(doc!.previousOrderStatus).toBe('PREPARING');

    const id2 = await newOrder(mgr, outlet.id, item.id);
    for (const s of ['CONFIRMED', 'PREPARING', 'READY', 'COMPLETED']) await patch(id2, mgr, { status: s });
    const afterDone = await patch(id2, mgr, { status: 'CANCELLED', reason: 'refund please' });
    expect(afterDone.status).toBe(400);
    expect((await Order.findById(id2))!.orderStatus).toBe('COMPLETED');

    const id3 = await newOrder(mgr, outlet.id, item.id);
    await patch(id3, mgr, { status: 'CONFIRMED' });
    await patch(id3, mgr, { status: 'PREPARING' });
    await patch(id3, mgr, { status: 'CANCELLED', reason: 'Owner decision' });
    expect((await Order.findById(id3))!.cancelledBy).toBe('ADMIN');
  });
});

describe('concurrency (§18)', () => {
  // Requires a database with real single-document atomic findOneAndUpdate semantics (MongoDB). Some
  // MongoDB-compatible emulators (e.g. FerretDB's SQLite backend) are not atomic under contention, so set
  // SKIP_ATOMIC_RACE_TEST=1 when running against one of those.
  it.skipIf(!!process.env.SKIP_ATOMIC_RACE_TEST)('two staff racing PREPARING → READY: exactly one wins, the other gets a controlled 409, history has a single READY', async () => {
    const { outlet, item, manager, kitchen, cashier } = await seed();
    const mgr = await staffToken(manager.email);
    const kit = await staffToken(kitchen.email);
    const cash = await staffToken(cashier.email);
    const created = await request(app).post('/api/v1/orders').set('Authorization', `Bearer ${mgr}`)
      .send({ outletId: outlet.id, orderType: 'TAKEAWAY', lines: [{ menuItemId: item.id, quantity: 1, selectedOptionIds: [] }] });
    const id = created.body.data._id;
    await patch(id, mgr, { status: 'CONFIRMED' });
    await patch(id, mgr, { status: 'PREPARING' });

    const results = await Promise.all([
      patch(id, kit, { status: 'READY', expectedStatus: 'PREPARING' }),
      patch(id, cash, { status: 'READY', expectedStatus: 'PREPARING' }),
      patch(id, mgr, { status: 'READY', expectedStatus: 'PREPARING' }),
    ]);
    const codes = results.map((r) => r.status).sort();
    expect(codes).toEqual([200, 409, 409]);
    const loser = results.find((r) => r.status === 409)!;
    expect(loser.body.message).toBe('Order status has already been updated.');

    const doc = await Order.findById(id);
    expect(doc!.statusHistory.filter((h) => h.status === 'READY')).toHaveLength(1);
    expect(doc!.statusHistory.map((h) => h.status)).toEqual(['PENDING', 'CONFIRMED', 'PREPARING', 'READY']);
  });

  it('a write that loses the race after validation is rejected by the conditional update (deterministic simulation)', async () => {
    const { outlet, item, manager, kitchen } = await seed();
    const mgr = await staffToken(manager.email);
    const created = await request(app).post('/api/v1/orders').set('Authorization', `Bearer ${mgr}`)
      .send({ outletId: outlet.id, orderType: 'TAKEAWAY', lines: [{ menuItemId: item.id, quantity: 1, selectedOptionIds: [] }] });
    const id = created.body.data._id;
    await patch(id, mgr, { status: 'CONFIRMED' });
    await patch(id, mgr, { status: 'PREPARING' });

    // Staff A reads the order (PREPARING) and validates; before A writes, staff B commits PREPARING → READY.
    const realFindOne = Order.findOne.bind(Order);
    const spy = vi.spyOn(Order, 'findOne').mockImplementationOnce(((...args: Parameters<typeof Order.findOne>) => {
      const q = realFindOne(...args);
      const origThen = q.then.bind(q);
      (q as unknown as { then: unknown }).then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        origThen(async (doc: unknown) => {
          await Order.updateOne({ _id: id }, { $set: { orderStatus: 'READY' }, $push: { statusHistory: { status: 'READY', timestamp: new Date(), changedByRole: 'KITCHEN' } } });
          return res(doc);
        }, rej);
      return q;
    }) as never);

    const actor = actorFromAuth({ type: 'STAFF', sub: manager.id, role: 'MANAGER', permissions: DEFAULT_ROLE_PERMISSIONS.MANAGER, outletIds: [outlet.id] });
    await expect(OrderService.updateStatus(id, 'READY', actor)).rejects.toMatchObject({ statusCode: 409, message: 'Order status has already been updated.' });
    spy.mockRestore();

    const doc = await Order.findById(id);
    expect(doc!.statusHistory.filter((h) => h.status === 'READY')).toHaveLength(1); // no duplicate entry from the loser
  });

  it('a stale screen (expectedStatus mismatch) or a repeated request gets the same controlled 409', async () => {
    const { outlet, item, manager } = await seed();
    const mgr = await staffToken(manager.email);
    const created = await request(app).post('/api/v1/orders').set('Authorization', `Bearer ${mgr}`)
      .send({ outletId: outlet.id, orderType: 'TAKEAWAY', lines: [{ menuItemId: item.id, quantity: 1, selectedOptionIds: [] }] });
    const id = created.body.data._id;
    expect((await patch(id, mgr, { status: 'CONFIRMED' })).status).toBe(200);
    expect((await patch(id, mgr, { status: 'CONFIRMED' })).status).toBe(409);
    const stale = await patch(id, mgr, { status: 'PREPARING', expectedStatus: 'PENDING' });
    expect(stale.status).toBe(409);
    expect((await Order.findById(id))!.orderStatus).toBe('CONFIRMED');
  });
});

describe('staff dashboards', () => {
  it('GET /orders/current returns active + recently closed orders, counters and role-aware actions', async () => {
    const { outlet, item, manager, kitchen } = await seed();
    const mgr = await staffToken(manager.email);
    const kit = await staffToken(kitchen.email);
    const mk = async () =>
      (await request(app).post('/api/v1/orders').set('Authorization', `Bearer ${mgr}`).send({ outletId: outlet.id, orderType: 'TAKEAWAY', lines: [{ menuItemId: item.id, quantity: 1, selectedOptionIds: [] }] })).body.data._id as string;
    const a = await mk();
    const b = await mk();
    const c = await mk();
    await patch(b, mgr, { status: 'CONFIRMED' });
    await patch(c, mgr, { status: 'CANCELLED' });

    const res = await request(app).get(`/api/v1/orders/current?outletId=${outlet.id}&includeClosed=true`).set('Authorization', `Bearer ${mgr}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.counts).toMatchObject({ PENDING: 1, CONFIRMED: 1, CANCELLED: 1, COMPLETED: 0 });
    const byId = Object.fromEntries(res.body.data.orders.map((o: { _id: string }) => [o._id, o]));
    expect(byId[a].availableActions.map((x: { key: string }) => x.key)).toContain('CONFIRM');
    expect(byId[c].availableActions.map((x: { key: string }) => x.key)).toEqual(['VIEW', 'PRINT_CUSTOMER', 'PRINT_TOKEN']);

    const withoutClosed = await request(app).get(`/api/v1/orders/current?outletId=${outlet.id}`).set('Authorization', `Bearer ${mgr}`);
    expect(withoutClosed.body.data.orders.map((o: { _id: string }) => o._id)).not.toContain(c);

    // kitchen board tickets carry the kitchen's own actions
    const board = await request(app).get(`/api/v1/kitchen/board?outletId=${outlet.id}`).set('Authorization', `Bearer ${kit}`);
    expect(board.status).toBe(200);
    const pending = board.body.data.new.find((o: { _id: string }) => o._id === a);
    expect(pending.availableActions.map((x: { key: string }) => x.key)).toEqual(['CONFIRM', 'PRINT_CUSTOMER', 'PRINT_KITCHEN']);
  });
});
