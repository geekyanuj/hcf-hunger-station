import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { Customer } from '../models/Customer';

const app = createApp();
const address = { line1: '12 Main Road', line2: 'Azadnagar', city: 'Dhanbad', state: 'Jharkhand', pincode: '826001' };

async function login(mobile: string, extra: Record<string, unknown> = {}) {
  const res = await request(app).post('/api/v1/auth/customer/login').send({ name: 'Amit Kumar', mobile, ...extra });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data.accessToken as string;
}
const me = (token: string) => request(app).get('/api/v1/customers/me').set('Authorization', `Bearer ${token}`);

describe('delivery name + address step', () => {
  it('a new customer with no address is not delivery-ready until they save one', async () => {
    const token = await login('9876500001');
    const before = await me(token);
    expect(before.body.data.delivery).toMatchObject({ ready: false, missing: ['address'] });

    const save = await request(app).put('/api/v1/customers/me/delivery-details').set('Authorization', `Bearer ${token}`).send({ name: 'Amit Kumar', address });
    expect(save.status, JSON.stringify(save.body)).toBe(200);
    expect(save.body.data.delivery.ready).toBe(true);
    expect(save.body.data.addresses).toHaveLength(1);
    expect(save.body.data.addresses[0]).toMatchObject({ line1: '12 Main Road', isDefault: true });
    expect((await me(token)).body.data.delivery.ready).toBe(true);
  });

  it('updates the name and edits an existing address in place (no duplicate)', async () => {
    const token = await login('9876500002', { address });
    const first = (await me(token)).body.data;
    expect(first.delivery.ready).toBe(true);
    const addressId = first.addresses[0]._id;

    const edit = await request(app)
      .put('/api/v1/customers/me/delivery-details')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Amit K Sharma', addressId, address: { ...address, line1: '99 New Street', pincode: '826004' } });
    expect(edit.status).toBe(200);
    expect(edit.body.data.name).toBe('Amit K Sharma');
    expect(edit.body.data.addresses).toHaveLength(1);
    expect(edit.body.data.addresses[0]).toMatchObject({ line1: '99 New Street', pincode: '826004' });
  });

  it('adding a second address makes it the default; the same address is never saved twice', async () => {
    const token = await login('9876500003', { address });
    const put = (a: object) => request(app).put('/api/v1/customers/me/delivery-details').set('Authorization', `Bearer ${token}`).send({ name: 'Amit Kumar', address: a });

    const second = await put({ ...address, line1: '5 Other Lane' });
    expect(second.body.data.addresses).toHaveLength(2);
    expect(second.body.data.addresses.filter((a: { isDefault: boolean }) => a.isDefault)).toHaveLength(1);
    expect(second.body.data.addresses.find((a: { isDefault: boolean }) => a.isDefault).line1).toBe('5 Other Lane');

    const again = await put({ ...address, line1: '  5 other  LANE ' });
    expect(again.body.data.addresses).toHaveLength(2);
  });

  it('logging in repeatedly with the same address does not pile up duplicates', async () => {
    await login('9876500004', { address });
    await login('9876500004', { address });
    const token = await login('9876500004', { address: { ...address, line1: ' 12 MAIN road ' } });
    expect((await me(token)).body.data.addresses).toHaveLength(1);
    expect(await Customer.countDocuments({ mobile: '9876500004' })).toBe(1);
  });

  it('validates the input', async () => {
    const token = await login('9876500005');
    const put = (body: object) => request(app).put('/api/v1/customers/me/delivery-details').set('Authorization', `Bearer ${token}`).send(body);
    expect((await put({ name: 'A', address })).status).toBe(400);
    expect((await put({ name: 'Amit Kumar', address: { ...address, pincode: '8260' } })).status).toBe(400);
    expect((await put({ name: 'Amit Kumar', address: { ...address, line1: '' } })).status).toBe(400);
    expect((await put({ name: 'Amit Kumar' })).status).toBe(400);
    expect((await put({ name: 'Amit Kumar', addressId: 'aaaaaaaaaaaaaaaaaaaaaaaa', address })).status).toBe(404);
  });

  it('removing the default address promotes another one; the default can be switched', async () => {
    const token = await login('9876500006', { address });
    const put = (a: object) => request(app).put('/api/v1/customers/me/delivery-details').set('Authorization', `Bearer ${token}`).send({ name: 'Amit Kumar', address: a });
    const two = (await put({ ...address, line1: '5 Other Lane' })).body.data;
    const [home, other] = [two.addresses.find((a: { line1: string }) => a.line1 === '12 Main Road'), two.addresses.find((a: { line1: string }) => a.line1 === '5 Other Lane')];

    const switched = await request(app).patch(`/api/v1/customers/me/addresses/${home._id}/default`).set('Authorization', `Bearer ${token}`);
    expect(switched.body.data.addresses.find((a: { isDefault: boolean }) => a.isDefault)._id).toBe(home._id);

    const removed = await request(app).delete(`/api/v1/customers/me/addresses/${home._id}`).set('Authorization', `Bearer ${token}`);
    expect(removed.body.data.addresses).toHaveLength(1);
    expect(removed.body.data.addresses[0]).toMatchObject({ _id: other._id, isDefault: true });
    expect(removed.body.data.delivery.ready).toBe(true);
  });

  it('requires a customer session', async () => {
    expect((await request(app).put('/api/v1/customers/me/delivery-details').send({ name: 'Amit Kumar', address })).status).toBe(401);
    expect((await request(app).get('/api/v1/customers/me')).status).toBe(401);
  });
});
