import { Recipe } from '../models/Recipe';
import { InventoryItem } from '../models/InventoryItem';
import { MenuItem } from '../models/MenuItem';
import { ApiError } from '../utils/ApiError';
import { convertUnit } from '../utils/units';
import { round2 } from '../utils/format';
import { AuditService, AuditContext } from './audit.service';

export interface CostBreakdown {
  ingredientCost: number;
  sellingPrice: number;
  grossMarginAmount: number;
  grossMarginPercent: number;
  ingredients: { name: string; quantity: number; unit: string; cost: number }[];
}

export const RecipeService = {
  async getForMenuItem(outletId: string, menuItemId: string) {
    return Recipe.findOne({ outletId, menuItemId, isDeleted: false }).populate('ingredients.inventoryItemId', 'name unit costPerUnit currentStock');
  },

  async list(outletId: string) {
    return Recipe.find({ outletId, isDeleted: false }).populate('menuItemId', 'name price discountPrice').populate('ingredients.inventoryItemId', 'name unit costPerUnit');
  },

  async upsert(
    outletId: string,
    menuItemId: string,
    ingredients: { inventoryItemId: string; quantity: number; unit: string }[],
    yieldServings: number | undefined,
    ctx: AuditContext
  ) {
    const menuItem = await MenuItem.findOne({ _id: menuItemId, outletId, isDeleted: false });
    if (!menuItem) throw ApiError.notFound('Menu item not found for this outlet');

    for (const ing of ingredients) {
      const exists = await InventoryItem.exists({ _id: ing.inventoryItemId, outletId, isDeleted: false });
      if (!exists) throw ApiError.badRequest(`Inventory item ${ing.inventoryItemId} not found for this outlet`);
    }

    const before = await Recipe.findOne({ outletId, menuItemId, isDeleted: false }).lean();

    const recipe = await Recipe.findOneAndUpdate(
      { outletId, menuItemId },
      { outletId, menuItemId, ingredients, yieldServings: yieldServings ?? 1 },
      { upsert: true, new: true }
    );

    await AuditService.record({
      ctx,
      action: 'RECIPE_CHANGE',
      entity: 'Recipe',
      entityId: recipe.id,
      outletId,
      before,
      after: recipe.toObject(),
    });

    return recipe;
  },

  async remove(outletId: string, menuItemId: string) {
    const recipe = await Recipe.findOneAndUpdate({ outletId, menuItemId }, { isDeleted: true }, { new: true });
    if (!recipe) throw ApiError.notFound('Recipe not found');
    return recipe;
  },

  /**
   * Computes ingredient cost, gross margin amount, and gross margin percent
   * for one serving of a menu item, entirely from live InventoryItem
   * costPerUnit values — never hard-coded.
   */
  async calculateCost(outletId: string, menuItemId: string): Promise<CostBreakdown> {
    const menuItem = await MenuItem.findOne({ _id: menuItemId, outletId, isDeleted: false });
    if (!menuItem) throw ApiError.notFound('Menu item not found');

    const recipe = await Recipe.findOne({ outletId, menuItemId, isDeleted: false }).populate('ingredients.inventoryItemId');
    if (!recipe) throw ApiError.notFound('No recipe defined for this menu item yet');

    const sellingPrice = menuItem.discountPrice ?? menuItem.price;
    const breakdownIngredients: CostBreakdown['ingredients'] = [];
    let ingredientCost = 0;

    for (const ing of recipe.ingredients) {
      const item = ing.inventoryItemId as unknown as InstanceType<typeof InventoryItem>;
      if (!item) continue;
      const quantityInStockUnit = convertUnit(ing.quantity, ing.unit, item.unit);
      const cost = round2((quantityInStockUnit / recipe.yieldServings) * item.costPerUnit);
      ingredientCost += cost;
      breakdownIngredients.push({ name: item.name, quantity: ing.quantity / recipe.yieldServings, unit: ing.unit, cost });
    }

    ingredientCost = round2(ingredientCost);
    const grossMarginAmount = round2(sellingPrice - ingredientCost);
    const grossMarginPercent = sellingPrice > 0 ? round2((grossMarginAmount / sellingPrice) * 100) : 0;

    return { ingredientCost, sellingPrice, grossMarginAmount, grossMarginPercent, ingredients: breakdownIngredients };
  },
};
