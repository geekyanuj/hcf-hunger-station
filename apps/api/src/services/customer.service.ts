import { Customer } from '../models/Customer';
import { ApiError } from '../utils/ApiError';

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

  async addAddress(customerId: string, address: Record<string, unknown>) {
    const customer = await Customer.findById(customerId);
    if (!customer) throw ApiError.notFound('Customer not found');
    if (address.isDefault) customer.addresses.forEach((a) => (a.isDefault = false));
    customer.addresses.push(address as never);
    await customer.save();
    return customer;
  },

  async removeAddress(customerId: string, addressId: string) {
    const customer = await Customer.findById(customerId);
    if (!customer) throw ApiError.notFound('Customer not found');
    customer.addresses = customer.addresses.filter((a) => a._id?.toString() !== addressId) as never;
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
