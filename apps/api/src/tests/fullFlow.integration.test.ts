import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { Outlet } from '../models/Outlet';
import { MenuCategory } from '../models/MenuCategory';
import { MenuItem } from '../models/MenuItem';
import { InventoryItem } from '../models/InventoryItem';
import { Recipe } from '../models/Recipe';
import { Role } from '../models/Role';
import { User } from '../models/User';
import { hashPassword } from '../utils/password';
import { DEFAULT_ROLE_PERMISSIONS, ROLES } from '../config/permissions';

const app = createApp();

async function seedFullFlowFixtures() {
  for (const roleName of ROLES) {
    await Role.create({ name: roleName, permissions: DEFAULT_ROLE_PERMISSIONS[roleName], isSystem: true });
  }
  const outlet = await Outlet.create({
    name: 'Flow Outlet',
    code: 'FLW',
    address: 'Addr',
    phone: '+919999999996',
    email: 'flow@hfc.example',
  });
  const category = await MenuCategory.create({ outletId: outlet._id, name: 'Burgers', slug: 'burgers' });
  const menuItem = await MenuItem.create({
    outletId: outlet._id,
    categoryId: category._id,
    name: 'Flow Burger',
    slug: 'flow-burger',
    price: 120,
    preparationTimeMinutes: 8,
  });
  const bun = await InventoryItem.create({
    outletId: outlet._id, name: 'Flow Bun', sku: 'FBUN', category: 'Bakery', unit: 'piece',
    currentStock: 10, minimumStock: 5, costPerUnit: 8,
  });
  await Recipe.create({
    outletId: outlet._id,
    menuItemId: menuItem._id,
    yieldServings: 1,
    ingredients: [{ inventoryItemId: bun._id, quantity: 1, unit: 'piece' }],
  });

  const passwordHash = await hashPassword('Passw0rd!123');
  const cashier = await User.create({ name: 'Cashier', email: 'cashier@flow.example', passwordHash, role: 'CASHIER', outletIds: [outlet._id] });
  const kitchen = await User.create({ name: 'Kitchen', email: 'kitchen@flow.example', passwordHash, role: 'KITCHEN', outletIds: [outlet._id] });
  const manager = await User.create({ name: 'Manager', email: 'manager@flow.example', passwordHash, role: 'MANAGER', outletIds: [outlet._id] });

  return { outlet, menuItem, bun, cashier, kitchen, manager };
}

async function loginAs(email: string) {
  const res = await request(app).post('/api/v1/auth/staff/login').send({ email, password: 'Passw0rd!123' });
  return res.body.data.accessToken as string;
}

describe('Full order lifecycle: POS create -> KDS transitions -> completion -> inventory deduction', () => {
  it('walks the entire flow and deducts inventory exactly once', async () => {
    const { outlet, menuItem, bun, cashier, kitchen } = await seedFullFlowFixtures();
    const cashierToken = await loginAs(cashier.email);
    const kitchenToken = await loginAs(kitchen.email);

    // 1. Cashier creates a POS order
    const createRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        outletId: outlet.id,
        orderType: 'POS',
        lines: [{ menuItemId: menuItem.id, quantity: 2, selectedOptionIds: [] }],
      });
    expect(createRes.status).toBe(201);
    const orderId = createRes.body.data._id;
    expect(createRes.body.data.orderStatus).toBe('PENDING');

    // 2. Kitchen transitions PENDING -> CONFIRMED -> PREPARING -> READY
    for (const status of ['CONFIRMED', 'PREPARING', 'READY']) {
      const res = await request(app)
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${kitchenToken}`)
        .send({ status });
      expect(res.status).toBe(200);
      expect(res.body.data.orderStatus).toBe(status);
    }

    // Inventory should NOT be touched yet (default trigger is ON_COMPLETED for non-delivery orders)
    let bunNow = await InventoryItem.findById(bun._id);
    expect(bunNow!.currentStock).toBe(10);

    // 3. Kitchen hands the food over (READY -> COMPLETED for Take/Counter orders) -> triggers automatic, idempotent stock deduction
    const completeRes = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${kitchenToken}`)
      .send({ status: 'COMPLETED' });
    expect(completeRes.status).toBe(200);

    bunNow = await InventoryItem.findById(bun._id);
    expect(bunNow!.currentStock).toBe(8); // 2 burgers x 1 bun each
  });
});

describe('Permission restrictions', () => {
  it('blocks KITCHEN from accessing supplier/purchase endpoints', async () => {
    const { kitchen } = await seedFullFlowFixtures();
    const token = await loginAs(kitchen.email);
    const res = await request(app).get('/api/v1/suppliers').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('blocks CASHIER from managing recipes', async () => {
    const { cashier, outlet, menuItem, bun } = await seedFullFlowFixtures();
    const token = await loginAs(cashier.email);
    const res = await request(app)
      .post('/api/v1/recipes')
      .set('Authorization', `Bearer ${token}`)
      .send({ outletId: outlet.id, menuItemId: menuItem.id, ingredients: [{ inventoryItemId: bun.id, quantity: 1, unit: 'piece' }] });
    expect(res.status).toBe(403);
  });

  it('blocks INVENTORY role from managing users', async () => {
    const { outlet } = await seedFullFlowFixtures();
    const passwordHash = await hashPassword('Passw0rd!123');
    const invUser = await User.create({ name: 'Inv', email: 'inv@flow.example', passwordHash, role: 'INVENTORY', outletIds: [outlet._id] });
    const token = await loginAs(invUser.email);
    const res = await request(app).get('/api/v1/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('rejects an order when ingredient stock is insufficient, unless overridden by a manager', async () => {
    const { outlet, menuItem, bun, cashier, manager } = await seedFullFlowFixtures();
    await InventoryItem.findByIdAndUpdate(bun._id, { currentStock: 0 });

    const cashierToken = await loginAs(cashier.email);
    const blocked = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ outletId: outlet.id, orderType: 'POS', lines: [{ menuItemId: menuItem.id, quantity: 1, selectedOptionIds: [] }] });
    expect(blocked.status).toBe(409);

    const managerToken = await loginAs(manager.email);
    const overridden = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        outletId: outlet.id,
        orderType: 'POS',
        lines: [{ menuItemId: menuItem.id, quantity: 1, selectedOptionIds: [] }],
        overrideStockCheck: true,
      });
    expect(overridden.status).toBe(201);
    expect(overridden.body.data.stockOverrideApplied).toBe(true);
  });
});
