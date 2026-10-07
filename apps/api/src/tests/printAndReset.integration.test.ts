import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import net from 'net';
import { createApp } from '../app';
import { env } from '../config/env';
import { Outlet } from '../models/Outlet';
import { MenuCategory } from '../models/MenuCategory';
import { MenuItem } from '../models/MenuItem';
import { Role } from '../models/Role';
import { User } from '../models/User';
import { Order } from '../models/Order';
import { PrintJob } from '../models/PrintJob';
import { AuditLog } from '../models/AuditLog';
import { hashPassword } from '../utils/password';
import { signAccessToken } from '../utils/tokenUtils';
import { DEFAULT_ROLE_PERMISSIONS, ROLES, RoleName } from '../config/permissions';
import { DashboardResetService, resetAttemptState } from '../services/dashboardReset.service';
import { AnalyticsService } from '../services/analytics.service';
import { KitchenService } from '../services/kitchen.service';
import { InventoryDashboardService } from '../services/inventoryDashboard.service';

const app = createApp();
const PASSWORD = 'Passw0rd!123';
const original = { ...env.printer };

// Tokens are signed directly (not via /auth/staff/login) so these tests do not use up the auth rate limiter.
function tokenFor(user: { _id: unknown }, role: RoleName, outletIds: string[]) {
  return signAccessToken({ type: 'STAFF', sub: String(user._id), role, permissions: DEFAULT_ROLE_PERMISSIONS[role], outletIds });
}

async function seed() {
  for (const name of ROLES) await Role.create({ name, permissions: DEFAULT_ROLE_PERMISSIONS[name], isSystem: true });
  const outlet = await Outlet.create({ name: 'HCF Azadnagar', code: 'HCF', address: 'Azadnagar, Dhanbad, Jharkhand', phone: '+919000000001', email: 'a@hcf.example' });
  const otherOutlet = await Outlet.create({ name: 'Other', code: 'OTH', address: 'Elsewhere', phone: '+919000000002', email: 'o@hcf.example' });
  const category = await MenuCategory.create({ outletId: outlet._id, name: 'Burgers', slug: 'burgers' });
  const item = await MenuItem.create({ outletId: outlet._id, categoryId: category._id, name: 'Classic Burger', slug: 'classic-burger', price: 150, preparationTimeMinutes: 9 });
  const passwordHash = await hashPassword(PASSWORD);
  const mk = (name: string, role: RoleName, outlets = [outlet]) =>
    User.create({ name, email: `${name.toLowerCase().replace(/\s/g, '.')}@hcf.example`, passwordHash, role, outletIds: outlets.map((o) => o._id) });
  const [owner, manager, cashier, kitchen, strangerManager] = await Promise.all([
    mk('Owner', 'OWNER'),
    mk('Manager', 'MANAGER'),
    mk('Cashier', 'CASHIER'),
    mk('Kitchen', 'KITCHEN'),
    mk('Stranger Manager', 'MANAGER', [otherOutlet]),
  ]);
  const id = (o: { _id: unknown }) => String(o._id);
  return {
    outlet,
    item,
    owner: { user: owner, token: tokenFor(owner, 'OWNER', [id(outlet)]) },
    manager: { user: manager, token: tokenFor(manager, 'MANAGER', [id(outlet)]) },
    cashier: { user: cashier, token: tokenFor(cashier, 'CASHIER', [id(outlet)]) },
    kitchen: { user: kitchen, token: tokenFor(kitchen, 'KITCHEN', [id(outlet)]) },
    stranger: { user: strangerManager, token: tokenFor(strangerManager, 'MANAGER', [id(otherOutlet)]) },
  };
}

async function placeOrder(s: Awaited<ReturnType<typeof seed>>) {
  const res = await request(app)
    .post('/api/v1/orders')
    .set('Authorization', `Bearer ${s.cashier.token}`)
    .send({ outletId: s.outlet.id, orderType: 'TAKEAWAY', lines: [{ menuItemId: s.item.id, quantity: 2, selectedOptionIds: [] }], customerNotes: 'Extra napkins' });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data as { _id: string; tokenNumber: string; orderNumber: string };
}

beforeEach(() => {
  Object.assign(env.printer, original, { driver: 'DISABLED' });
  resetAttemptState();
});
afterEach(() => {
  Object.assign(env.printer, original);
});

describe('token printing', () => {
  it('is limited to OWNER, MANAGER and CASHIER', async () => {
    const s = await seed();
    const order = await placeOrder(s);
    for (const who of [s.owner, s.manager, s.cashier]) {
      const res = await request(app).post(`/api/v1/print/orders/${order._id}/token`).set('Authorization', `Bearer ${who.token}`).send({});
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    }
    const kitchen = await request(app).post(`/api/v1/print/orders/${order._id}/token`).set('Authorization', `Bearer ${s.kitchen.token}`).send({});
    expect(kitchen.status).toBe(403);
    const anon = await request(app).post(`/api/v1/print/orders/${order._id}/token`).send({});
    expect(anon.status).toBe(401);
  });

  it('cannot print another outlet\'s order', async () => {
    const s = await seed();
    const order = await placeOrder(s);
    const res = await request(app).post(`/api/v1/print/orders/${order._id}/token`).set('Authorization', `Bearer ${s.stranger.token}`).send({});
    expect(res.status).toBe(403);
  });

  it('returns browser print content at 58 mm and logs the preview request', async () => {
    const s = await seed();
    const order = await placeOrder(s);
    const status = await request(app).get('/api/v1/print/status').set('Authorization', `Bearer ${s.cashier.token}`);
    expect(status.body.data).toMatchObject({ driver: 'DISABLED', mode: 'BROWSER', configured: false, paperWidthMm: 58 });

    const first = await request(app).post(`/api/v1/print/orders/${order._id}/token`).set('Authorization', `Bearer ${s.cashier.token}`).send({});
    expect(first.body.data).toMatchObject({ printed: false, mode: 'BROWSER', isReprint: false });
    expect(first.body.data.text).toContain(order.tokenNumber);
    expect(first.body.data.text).toContain('HCF Azadnagar');
    expect(first.body.data.text).toContain('Classic Burger');

    const second = await request(app).post(`/api/v1/print/orders/${order._id}/token`).set('Authorization', `Bearer ${s.cashier.token}`).send({});
    expect(second.body.data.isReprint).toBe(true);
    expect(second.body.data.text).toContain('** REPRINT **');
    expect(await PrintJob.countDocuments({ orderId: order._id, status: 'BROWSER' })).toBe(2);
  });

  it('ignores legacy network settings and always logs browser output at 58 mm', async () => {
    const s = await seed();
    const order = await placeOrder(s);
    Object.assign(env.printer, { driver: 'NETWORK', host: '127.0.0.1', port: 1 });

    const result = await request(app)
      .post(`/api/v1/print/orders/${order._id}/token`)
      .set('Authorization', `Bearer ${s.cashier.token}`)
      .send({ copies: 2 });
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.data).toMatchObject({ printed: false, mode: 'BROWSER', driver: 'BROWSER', copies: 2, paperWidthMm: 58 });
    expect(await PrintJob.countDocuments({ orderId: order._id, status: 'BROWSER' })).toBe(1);
  });

  it('does not send ESC/POS bytes to a network printer', async () => {
    const s = await seed();
    const order = await placeOrder(s);
    const jobs: Buffer[] = [];
    const server = net.createServer((socket) => {
      const chunks: Buffer[] = [];
      socket.on('data', (c) => chunks.push(c));
      socket.on('end', () => jobs.push(Buffer.concat(chunks)));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    Object.assign(env.printer, { driver: 'NETWORK', host: '127.0.0.1', port: (server.address() as net.AddressInfo).port, timeoutMs: 2000 });

    const res = await request(app).post(`/api/v1/print/orders/${order._id}/token`).set('Authorization', `Bearer ${s.manager.token}`).send({ copies: 2 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ printed: false, mode: 'BROWSER', driver: 'BROWSER', copies: 2, paperWidthMm: 58 });
    await new Promise((r) => setTimeout(r, 100));
    server.close();

    expect(jobs).toHaveLength(0);
    expect(await PrintJob.countDocuments({ orderId: order._id, status: 'BROWSER' })).toBe(1);
  });

  it('does not try an unreachable network printer', async () => {
    const s = await seed();
    const order = await placeOrder(s);
    const probe = net.createServer();
    await new Promise<void>((r) => probe.listen(0, '127.0.0.1', r));
    const port = (probe.address() as net.AddressInfo).port;
    await new Promise((r) => probe.close(r));
    Object.assign(env.printer, { driver: 'NETWORK', host: '127.0.0.1', port, timeoutMs: 1000 });

    const res = await request(app).post(`/api/v1/print/orders/${order._id}/token`).set('Authorization', `Bearer ${s.cashier.token}`).send({});
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ printed: false, mode: 'BROWSER', driver: 'BROWSER', paperWidthMm: 58 });
    const job = await PrintJob.findOne({ orderId: order._id });
    expect(job).toMatchObject({ status: 'BROWSER', driver: 'BROWSER' });
  });

  it('uses browser print when legacy printer settings are incomplete', async () => {
    const s = await seed();
    const order = await placeOrder(s);
    Object.assign(env.printer, { driver: 'NETWORK', host: '' });
    const res = await request(app).post(`/api/v1/print/orders/${order._id}/token`).set('Authorization', `Bearer ${s.cashier.token}`).send({});
    expect(res.body.data).toMatchObject({ printed: false, mode: 'BROWSER', driver: 'BROWSER', paperWidthMm: 58 });
  });

  it('rejects an invalid copy count and exposes the kitchen token action', async () => {
    const s = await seed();
    const order = await placeOrder(s);
    const bad = await request(app).post(`/api/v1/print/orders/${order._id}/token`).set('Authorization', `Bearer ${s.cashier.token}`).send({ copies: 50 });
    expect(bad.status).toBe(400);
    const current = await request(app).get(`/api/v1/orders/${order._id}`).set('Authorization', `Bearer ${s.cashier.token}`);
    expect(current.body.data.availableActions.map((a: { key: string }) => a.key)).toContain('PRINT_KITCHEN');
  });

  it('test print works for managers and is recorded', async () => {
    const s = await seed();
    const res = await request(app).post('/api/v1/print/test').set('Authorization', `Bearer ${s.manager.token}`).send({ outletId: s.outlet.id });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.text).toContain('PRINTER TEST');
    expect(await PrintJob.countDocuments({ type: 'TEST' })).toBe(1);
    const jobs = await request(app).get(`/api/v1/print/jobs?outletId=${s.outlet.id}`).set('Authorization', `Bearer ${s.manager.token}`);
    expect(jobs.body.data).toHaveLength(1);
    const cashierJobs = await request(app).get(`/api/v1/print/jobs?outletId=${s.outlet.id}`).set('Authorization', `Bearer ${s.cashier.token}`);
    expect(cashierJobs.status).toBe(403); // the print log is an owner/manager view
  });
});

describe('dashboard reset', () => {
  // The overview runs several Mongo aggregations ($lte inside $match, $dateToString ...). Some Mongo-compatible servers
  // used to run CI lack those operators, so the aggregations are replaced by small in-memory equivalents that read the
  // REAL orders collection using exactly the start time the dashboard passes in. That keeps this a genuine test of the
  // reset logic (which orders are counted, and from when) rather than of the aggregation engine.
  const ranges: Record<string, Date[]> = {};
  beforeEach(() => {
    for (const key of ['revenueOverTime', 'topProducts', 'categoryPerformance', 'orderTypeDistribution'] as const) {
      ranges[key] = [];
      vi.spyOn(AnalyticsService, key).mockImplementation((async (_ids: unknown, range: { from: Date }) => {
        ranges[key].push(range.from);
        return [];
      }) as never);
    }
    // Operational panels (live kitchen load, stock summary) are unrelated to the reset baseline.
    vi.spyOn(KitchenService, 'workload').mockResolvedValue({ activeOrders: 0, pendingOrders: 0, delayedOrders: 0, averagePreparationMinutes: 0 } as never);
    vi.spyOn(InventoryDashboardService, 'summary').mockResolvedValue({} as never);
    vi.spyOn(Order, 'aggregate').mockImplementation((async (pipeline: { $match?: { createdAt?: { $gte: Date } } }[]) => {
      const from = pipeline[0].$match!.createdAt!.$gte;
      const rows = await Order.find({ createdAt: { $gte: from } });
      return rows.length ? [{ _id: null, sales: rows.reduce((sum, o) => sum + o.total, 0), orders: rows.length }] : [];
    }) as never);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const overview = (token: string, outletId: string) =>
    request(app).get(`/api/v1/dashboard/overview?outletId=${outletId}`).set('Authorization', `Bearer ${token}`);
  const reset = (token: string, outletId: string, password: string) =>
    request(app).post(`/api/v1/dashboard/reset?outletId=${outletId}`).set('Authorization', `Bearer ${token}`).send({ password });

  it('only the owner may reset, and only with the correct password', async () => {
    const s = await seed();
    await placeOrder(s);

    const asManager = await reset(s.manager.token, s.outlet.id, PASSWORD);
    expect(asManager.status).toBe(403);

    const wrong = await reset(s.owner.token, s.outlet.id, 'not-the-password');
    expect(wrong.status).toBe(403);
    expect(wrong.body.message).toBe('Incorrect password');
    expect((await overview(s.owner.token, s.outlet.id)).body.data.todaysOverview.orders).toBe(1); // untouched

    const ok = await reset(s.owner.token, s.outlet.id, PASSWORD);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.data.resetBy).toBe('Owner');
  });

  it('zeroes the dashboard, keeps every order, and counts new orders again afterwards', async () => {
    const s = await seed();
    await placeOrder(s);
    await placeOrder(s);
    const before = (await overview(s.owner.token, s.outlet.id)).body.data;
    expect(before.todaysOverview.orders).toBe(2);
    expect(before.todaysOverview.sales).toBeGreaterThan(0);
    expect(before.lastReset).toBeNull();

    expect((await reset(s.owner.token, s.outlet.id, PASSWORD)).status).toBe(200);

    const after = (await overview(s.owner.token, s.outlet.id)).body.data;
    expect(after.todaysOverview).toMatchObject({ orders: 0, sales: 0, averageOrderValue: 0, takeawayOrders: 0 });
    expect(after.sales.bestSellingItem).toBeNull();
    expect(after.lastReset).toMatchObject({ by: 'Owner' });
    expect(await Order.countDocuments({})).toBe(2); // nothing was deleted

    // Every chart/tile query now starts at the reset moment (not at midnight / 7 days ago).
    const resetAt = new Date(after.lastReset.at);
    for (const key of ['revenueOverTime', 'topProducts', 'categoryPerformance']) {
      expect(ranges[key].at(-1)!.getTime(), key).toBe(resetAt.getTime());
    }

    await new Promise((r) => setTimeout(r, 15));
    await placeOrder(s);
    const later = (await overview(s.owner.token, s.outlet.id)).body.data;
    expect(later.todaysOverview.orders).toBe(1);
    // owner "ALL OUTLETS" view honours the same baseline
    expect((await request(app).get('/api/v1/dashboard/overview?outletId=ALL').set('Authorization', `Bearer ${s.owner.token}`)).body.data.todaysOverview.orders).toBe(1);
  });

  it('is written to the audit log', async () => {
    const s = await seed();
    await reset(s.owner.token, s.outlet.id, PASSWORD);
    const log = await AuditLog.findOne({ action: 'DASHBOARD_RESET' });
    expect(log).toBeTruthy();
    expect(String(log!.userId)).toBe(String(s.owner.user._id));
    expect(String(log!.outletId)).toBe(s.outlet.id);
  });

  it('requires a password in the request', async () => {
    const s = await seed();
    const res = await request(app).post(`/api/v1/dashboard/reset?outletId=${s.outlet.id}`).set('Authorization', `Bearer ${s.owner.token}`).send({});
    expect(res.status).toBe(400);
  });

  it('locks the account out after repeated wrong passwords, even for the right password', async () => {
    const s = await seed();
    const scope = [s.outlet.id];
    for (let i = 0; i < 5; i += 1) {
      await expect(DashboardResetService.reset({ userId: s.owner.user.id, password: 'nope', scope })).rejects.toMatchObject({ statusCode: 403 });
    }
    await expect(DashboardResetService.reset({ userId: s.owner.user.id, password: PASSWORD, scope })).rejects.toMatchObject({ statusCode: 429 });
    resetAttemptState(s.owner.user.id);
    await expect(DashboardResetService.reset({ userId: s.owner.user.id, password: PASSWORD, scope })).resolves.toMatchObject({ resetBy: 'Owner' });
  });
});
