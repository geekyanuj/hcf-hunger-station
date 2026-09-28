import { Supplier } from '../models/Supplier';
import { InventoryItem } from '../models/InventoryItem';
import { ApiError } from '../utils/ApiError';

export const SupplierService = {
  async list(outletId: string, activeOnly = true) {
    const query: Record<string, unknown> = { outletId, isDeleted: false };
    if (activeOnly) query.isActive = true;
    return Supplier.find(query).sort({ name: 1 });
  },

  async getById(id: string) {
    const supplier = await Supplier.findOne({ _id: id, isDeleted: false });
    if (!supplier) throw ApiError.notFound('Supplier not found');
    return supplier;
  },

  async create(payload: Record<string, unknown>) {
    return Supplier.create(payload);
  },

  async update(id: string, payload: Record<string, unknown>) {
    const supplier = await Supplier.findOneAndUpdate({ _id: id, isDeleted: false }, payload, { new: true });
    if (!supplier) throw ApiError.notFound('Supplier not found');
    return supplier;
  },

  async softDelete(id: string) {
    const supplier = await Supplier.findOneAndUpdate({ _id: id }, { isDeleted: true, isActive: false }, { new: true });
    if (!supplier) throw ApiError.notFound('Supplier not found');
    return supplier;
  },

  /** The inventory items this supplier is the designated source for. */
  async productsForSupplier(id: string) {
    return InventoryItem.find({ supplierId: id, isDeleted: false });
  },
};
