import { MenuCategory } from '../models/MenuCategory';
import { MenuItem } from '../models/MenuItem';
import { Modifier } from '../models/Modifier';
import { ApiError } from '../utils/ApiError';
import { slugify } from '../utils/format';
import { AuditService, AuditContext } from './audit.service';

export const MenuService = {
  async getFullMenu(outletId: string) {
    const [categories, items] = await Promise.all([
      MenuCategory.find({ outletId, isActive: true, isDeleted: false }).sort({ sortOrder: 1 }),
      MenuItem.find({ outletId, isAvailable: true, isDeleted: false })
        .populate('modifierIds')
        .sort({ sortOrder: 1 }),
    ]);

    return categories.map((category) => ({
      category,
      items: items.filter((item) => item.categoryId.toString() === category.id),
    }));
  },

  async listCategories(outletId: string) {
    return MenuCategory.find({ outletId, isDeleted: false }).sort({ sortOrder: 1 });
  },

  async createCategory(payload: { outletId: string; name: string; description?: string; image?: string; sortOrder?: number }) {
    return MenuCategory.create({ ...payload, slug: slugify(payload.name) });
  },

  async getItemById(itemId: string) {
    const item = await MenuItem.findOne({ _id: itemId, isDeleted: false }).populate('modifierIds');
    if (!item) throw ApiError.notFound('Menu item not found');
    return item;
  },

  async listItems(filters: { outletId: string; categoryId?: string; search?: string; featuredOnly?: boolean }) {
    const query: Record<string, unknown> = { outletId: filters.outletId, isDeleted: false };
    if (filters.categoryId) query.categoryId = filters.categoryId;
    if (filters.featuredOnly) query.isFeatured = true;
    if (filters.search) query.$text = { $search: filters.search };
    return MenuItem.find(query).populate('modifierIds').sort({ sortOrder: 1 });
  },

  async createItem(payload: Record<string, unknown> & { name: string }) {
    return MenuItem.create({ ...payload, slug: slugify(payload.name) });
  },

  async updateItem(itemId: string, payload: Record<string, unknown>, ctx?: AuditContext) {
    const before = await MenuItem.findOne({ _id: itemId, isDeleted: false }).lean();
    if (!before) throw ApiError.notFound('Menu item not found');
    const item = await MenuItem.findOneAndUpdate({ _id: itemId, isDeleted: false }, payload, { new: true });
    if (!item) throw ApiError.notFound('Menu item not found');

    const priceChanged =
      ('price' in payload && payload.price !== before.price) ||
      ('discountPrice' in payload && payload.discountPrice !== before.discountPrice);
    if (priceChanged && ctx) {
      await AuditService.record({
        ctx,
        action: 'PRICE_CHANGE',
        entity: 'MenuItem',
        entityId: itemId,
        outletId: item.outletId.toString(),
        before: { price: before.price, discountPrice: before.discountPrice },
        after: { price: item.price, discountPrice: item.discountPrice },
      });
    }

    return item;
  },

  async setAvailability(itemId: string, isAvailable: boolean) {
    const item = await MenuItem.findOneAndUpdate({ _id: itemId }, { isAvailable }, { new: true });
    if (!item) throw ApiError.notFound('Menu item not found');
    return item;
  },

  async createModifier(payload: Record<string, unknown>) {
    return Modifier.create(payload);
  },

  async listModifiers(outletId: string) {
    return Modifier.find({ outletId, isDeleted: false });
  },
};
