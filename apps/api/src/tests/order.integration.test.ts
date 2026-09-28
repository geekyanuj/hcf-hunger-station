import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { Outlet } from '../models/Outlet';
import { MenuCategory } from '../models/MenuCategory';
import { MenuItem } from '../models/MenuItem';
import { Role } from '../models/Role';
import { User } from '../models/User';
import { hashPassword } from '../utils/password';
import { DEFAULT_ROLE_PERMISSIONS, ROLES } from '../config/permissions';

const app = createApp();

async function seedBasics() {
  for (const roleName of ROLES) {
    await Role.create({ name: roleName, permissions: DEFAULT_ROLE_PERMISSIONS[roleName], isSystem: true });
  }
  const outlet = await Outlet.create({
    name: 'Integration Outlet',
    code: 'INT',
    address: 'Addr',
    phone: '+919999999998',
    email: 'int@hfc.example',
  });
  const category = await MenuCategory.create({ outletId: outlet._id, name: 'Burgers', slug: 'burgers' });
  const item = await MenuItem.create({
    outletId: outlet._id,
    categoryId: category._id,
    name: 'Integration Burger',
    slug: 'integration-burger',
    price: 150,
    preparationTimeMinutes: 9,
  });
  const passwordHash = await hashPassword('Passw0rd!123');
  await User.create({ name: 'Manager', email: 'manager@int.example', passwordHash, role: 'MANAGER', outletIds: [outlet._id] });

  return { outlet, item };
}

describe('Auth + Order flow', () => {
  beforeEach(async () => {
    // handled by global afterEach cleanup in setup.ts
  });

  it('logs in staff and rejects wrong password', async () => {
    await seedBasics();
    const badLogin = await request(app).post('/api/v1/auth/staff/login').send({ email: 'manager@int.example', password: 'wrong' });
    expect(badLogin.status).toBe(401);

    const goodLogin = await request(app).post('/api/v1/auth/staff/login').send({ email: 'manager@int.example', password: 'Passw0rd!123' });
    expect(goodLogin.status).toBe(200);
    expect(goodLogin.body.data.accessToken).toBeDefined();
    expect(goodLogin.body.data.user.role).toBe('MANAGER');
  });

  it('creates a takeaway order and returns a T-prefixed token with server-computed totals', async () => {
    const { outlet, item } = await seedBasics();

    const res = await request(app)
      .post('/api/v1/orders')
      .send({
        outletId: outlet.id,
        orderType: 'TAKEAWAY',
        lines: [{ menuItemId: item.id, quantity: 2, selectedOptionIds: [] }],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokenNumber).toMatch(/^T-\d{3}$/);
    expect(res.body.data.total).toBeGreaterThan(300); // 2 x 150 + tax + packaging
    expect(res.body.data.estimatedPreparationMinutesMin).toBeGreaterThan(0);
  });

  it('rejects an order with a bogus outlet id', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .send({ outletId: '0'.repeat(24), orderType: 'TAKEAWAY', lines: [{ menuItemId: '0'.repeat(24), quantity: 1, selectedOptionIds: [] }] });
    expect(res.status).toBe(404);
  });
});
