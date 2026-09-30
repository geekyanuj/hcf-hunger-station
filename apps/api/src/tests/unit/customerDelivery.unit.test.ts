import { describe, it, expect } from 'vitest';
import { deliveryReadiness, isSameAddress } from '../../services/customer.service';
import { deliveryAddressSchema, deliveryDetailsSchema } from '../../validators/customer.validators';
import type { ICustomer } from '../../models/Customer';

const address = (over: Record<string, unknown> = {}) => ({ line1: '12 Main Road', city: 'Dhanbad', state: 'Jharkhand', pincode: '826001', isDefault: true, ...over });
const customer = (name: string, addresses: unknown[]) => ({ name, addresses }) as unknown as Pick<ICustomer, 'name' | 'addresses'>;

describe('deliveryReadiness', () => {
  it('is ready with a name and one complete address', () => {
    expect(deliveryReadiness(customer('Amit Kumar', [address()]))).toMatchObject({ ready: true, missing: [] });
  });
  it('reports a missing address', () => {
    expect(deliveryReadiness(customer('Amit Kumar', []))).toMatchObject({ ready: false, missing: ['address'] });
  });
  it('reports a missing / blank name', () => {
    expect(deliveryReadiness(customer('  ', [address()]))).toMatchObject({ ready: false, missing: ['name'] });
  });
  it('reports both, and treats an incomplete address as missing', () => {
    expect(deliveryReadiness(customer('', [address({ pincode: '' })])).missing).toEqual(['name', 'address']);
  });
  it('returns the default address id (falling back to the first)', () => {
    expect(deliveryReadiness(customer('A B', [address({ _id: { toString: () => 'a1' }, isDefault: false }), address({ _id: { toString: () => 'a2' } })])).defaultAddressId).toBe('a2');
    expect(deliveryReadiness(customer('A B', [address({ _id: { toString: () => 'a1' }, isDefault: false })])).defaultAddressId).toBe('a1');
  });
});

describe('isSameAddress', () => {
  it('ignores case and extra spaces', () => {
    expect(isSameAddress(address(), address({ line1: '  12  main ROAD ', city: 'DHANBAD' }))).toBe(true);
  });
  it('detects a different address', () => {
    expect(isSameAddress(address(), address({ line1: '99 Other Street' }))).toBe(false);
  });
});

describe('validation', () => {
  it('requires a 6-digit pincode', () => {
    expect(deliveryAddressSchema.safeParse(address({ pincode: '8260' })).success).toBe(false);
    expect(deliveryAddressSchema.safeParse(address()).success).toBe(true);
  });
  it('requires a name and address for delivery details, and allows an empty email', () => {
    const ok = deliveryDetailsSchema.safeParse({ body: { name: 'Amit Kumar', email: '', address: address() } });
    expect(ok.success).toBe(true);
    expect(deliveryDetailsSchema.safeParse({ body: { name: 'A', address: address() } }).success).toBe(false);
    expect(deliveryDetailsSchema.safeParse({ body: { name: 'Amit Kumar' } }).success).toBe(false);
  });
});
