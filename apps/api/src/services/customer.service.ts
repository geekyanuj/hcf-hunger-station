import { Customer, IAddress, ICustomer } from '../models/Customer';
import { ApiError } from '../utils/ApiError';

type AddressInput = Pick<IAddress, 'line1' | 'city' | 'state' | 'pincode'> & Partial<Pick<IAddress, 'label' | 'line2'>>;

const norm = (v?: string) => (v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Same street address? (case / spacing insensitive) - used to stop the same address being saved twice. */
export function isSameAddress(a: AddressInput, b: AddressInput): boolean {
  return norm(a.line1) === norm(b.line1) && norm(a.line2) === norm(b.line2) && norm(a.city) === norm(b.city) && norm(a.pincode) === norm(b.pincode);
}

export type DeliveryMissing = 'name' | 'address';

/**
 * Can this customer place a DELIVERY order? They need a real name and at least one complete saved address.
 * The web app uses this to send them to the "name & address" page first.
 */
export function deliveryReadiness(customer: Pick<ICustomer, 'name' | 'addresses'>) {
  const missing: DeliveryMissing[] = [];
  if (!customer.name || customer.name.trim().length < 2) missing.push('name');
  const hasAddress = customer.addresses.some((a) => a.line1?.trim() && a.city?.trim() && a.state?.trim() && a.pincode?.trim());
  if (!hasAddress) missing.push('address');
  const defaultAddress = customer.addresses.find((a) => a.isDefault) ?? customer.addresses[0];
  return { ready: missing.length === 0, missing, defaultAddressId: defaultAddress?._id?.toString() };
}

export const CustomerService = {
  async getProfile(customerId: string) {
    const customer = await Customer.findById(customerId);
    if (!customer) throw ApiError.notFound('Customer not found');
    return customer;
  },

  async updateProfile(customerId: string, payload: { name?: string; email?: string }) {
    const customer = await Customer.findByIdAndUpdate(customerId, payload, { new: true });
    if (!customer) throw ApiError.notFound('Customer not found');
    return customer;
  },

  async addAddress(customerId: string, address: AddressInput & { isDefault?: boolean }) {
    const customer = await Customer.findById(customerId);
    if (!customer) throw ApiError.notFound('Customer not found');
    const existing = customer.addresses.find((a) => isSameAddress(a, address));
    if (existing) {
      // Already saved - never create a duplicate; just honour a request to make it the default.
      if (address.isDefault) customer.addresses.forEach((a) => (a.isDefault = a === existing));
    } else {
      // The very first address is always the default.
      const makeDefault = !!address.isDefault || customer.addresses.length === 0;
      if (makeDefault) customer.addresses.forEach((a) => (a.isDefault = false));
      customer.addresses.push({ label: 'Home', ...address, isDefault: makeDefault } as never);
    }
    await customer.save();
    return customer;
  },

  /**
   * The "name + address" step before a delivery order: updates the name (and email), then edits the given saved
   * address or adds a new one, and makes it the default. Returns the customer.
   */
  async saveDeliveryDetails(customerId: string, input: { name: string; email?: string; addressId?: string; address: AddressInput }) {
    const customer = await Customer.findById(customerId);
    if (!customer) throw ApiError.notFound('Customer not found');

    customer.name = input.name;
    if (input.email) customer.email = input.email;

    let target = input.addressId ? customer.addresses.find((a) => a._id?.toString() === input.addressId) : undefined;
    if (input.addressId && !target) throw ApiError.notFound('Address not found');
    if (!target) target = customer.addresses.find((a) => isSameAddress(a, input.address));

    if (target) {
      target.label = input.address.label || target.label || 'Home';
      target.line1 = input.address.line1;
      target.line2 = input.address.line2;
      target.city = input.address.city;
      target.state = input.address.state;
      target.pincode = input.address.pincode;
    } else {
      customer.addresses.push({ label: input.address.label || 'Home', ...input.address, isDefault: false } as never);
      target = customer.addresses[customer.addresses.length - 1];
    }
    customer.addresses.forEach((a) => (a.isDefault = a === target));

    await customer.save();
    return customer;
  },

  async setDefaultAddress(customerId: string, addressId: string) {
    const customer = await Customer.findById(customerId);
    if (!customer) throw ApiError.notFound('Customer not found');
    const target = customer.addresses.find((a) => a._id?.toString() === addressId);
    if (!target) throw ApiError.notFound('Address not found');
    customer.addresses.forEach((a) => (a.isDefault = a === target));
    await customer.save();
    return customer;
  },

  async removeAddress(customerId: string, addressId: string) {
    const customer = await Customer.findById(customerId);
    if (!customer) throw ApiError.notFound('Customer not found');
    customer.addresses = customer.addresses.filter((a) => a._id?.toString() !== addressId) as never;
    if (customer.addresses.length > 0 && !customer.addresses.some((a) => a.isDefault)) customer.addresses[0].isDefault = true;
    await customer.save();
    return customer;
  },

  async toggleFavourite(customerId: string, menuItemId: string) {
    const customer = await Customer.findById(customerId);
    if (!customer) throw ApiError.notFound('Customer not found');
    const idx = customer.favouriteMenuItemIds.findIndex((id) => id.toString() === menuItemId);
    if (idx >= 0) customer.favouriteMenuItemIds.splice(idx, 1);
    else customer.favouriteMenuItemIds.push(menuItemId as never);
    await customer.save();
    return customer;
  },
};
