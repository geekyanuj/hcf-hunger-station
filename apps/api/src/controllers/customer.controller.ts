import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess, sendPaginated } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import { CustomerService, deliveryReadiness } from '../services/customer.service';
import { OrderService } from '../services/order.service';

function requireCustomerId(req: Request): string {
  if (!req.auth || req.auth.type !== 'CUSTOMER') throw ApiError.forbidden('Customer access required');
  return req.auth.sub;
}

/** Customer document + whether they can place a delivery order yet (name + saved address). */
function withDeliveryStatus(customer: Parameters<typeof deliveryReadiness>[0] & { toJSON: () => object }) {
  return { ...customer.toJSON(), delivery: deliveryReadiness(customer) };
}

export const CustomerController = {
  me: asyncHandler(async (req: Request, res: Response) => {
    const customer = await CustomerService.getProfile(requireCustomerId(req));
    return sendSuccess(res, withDeliveryStatus(customer));
  }),

  saveDeliveryDetails: asyncHandler(async (req: Request, res: Response) => {
    const customer = await CustomerService.saveDeliveryDetails(requireCustomerId(req), req.body);
    return sendSuccess(res, withDeliveryStatus(customer), 'Details saved');
  }),

  setDefaultAddress: asyncHandler(async (req: Request, res: Response) => {
    const customer = await CustomerService.setDefaultAddress(requireCustomerId(req), req.params.addressId);
    return sendSuccess(res, withDeliveryStatus(customer), 'Default address updated');
  }),

  updateMe: asyncHandler(async (req: Request, res: Response) => {
    const customer = await CustomerService.updateProfile(requireCustomerId(req), req.body);
    return sendSuccess(res, withDeliveryStatus(customer), 'Profile updated');
  }),

  addAddress: asyncHandler(async (req: Request, res: Response) => {
    const customer = await CustomerService.addAddress(requireCustomerId(req), req.body);
    return sendSuccess(res, withDeliveryStatus(customer), 'Address added', 201);
  }),

  removeAddress: asyncHandler(async (req: Request, res: Response) => {
    const customer = await CustomerService.removeAddress(requireCustomerId(req), req.params.addressId);
    return sendSuccess(res, withDeliveryStatus(customer), 'Address removed');
  }),

  toggleFavourite: asyncHandler(async (req: Request, res: Response) => {
    const customer = await CustomerService.toggleFavourite(requireCustomerId(req), req.params.menuItemId);
    return sendSuccess(res, customer, 'Favourites updated');
  }),

  myOrders: asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt((req.query.page as string) ?? '1', 10);
    const limit = parseInt((req.query.limit as string) ?? '20', 10);
    const { items, total } = await OrderService.listForCustomer(requireCustomerId(req), page, limit);
    return sendPaginated(res, items, { page, limit, total });
  }),
};
