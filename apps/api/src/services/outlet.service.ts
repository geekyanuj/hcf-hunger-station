import { Outlet } from '../models/Outlet';
import { ApiError } from '../utils/ApiError';

export const OutletService = {
  async list(activeOnly = true) {
    const filter: Record<string, unknown> = { isDeleted: false };
    if (activeOnly) filter.isActive = true;
    return Outlet.find(filter).sort({ name: 1 });
  },

  async getById(outletId: string) {
    const outlet = await Outlet.findOne({ _id: outletId, isDeleted: false });
    if (!outlet) throw ApiError.notFound('Outlet not found');
    return outlet;
  },

  async create(payload: Partial<InstanceType<typeof Outlet>>) {
    return Outlet.create(payload);
  },

  async update(outletId: string, payload: Partial<InstanceType<typeof Outlet>>) {
    const outlet = await Outlet.findOneAndUpdate({ _id: outletId, isDeleted: false }, payload, { new: true });
    if (!outlet) throw ApiError.notFound('Outlet not found');
    return outlet;
  },

  async softDelete(outletId: string) {
    const outlet = await Outlet.findOneAndUpdate({ _id: outletId }, { isDeleted: true, isActive: false }, { new: true });
    if (!outlet) throw ApiError.notFound('Outlet not found');
    return outlet;
  },
};
