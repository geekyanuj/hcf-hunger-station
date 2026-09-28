import { Types } from 'mongoose';
import { Order, IOrder } from '../models/Order';
import { Recipe } from '../models/Recipe';
import { InventoryItem } from '../models/InventoryItem';
import { convertUnit } from '../utils/units';
import { LedgerService } from './ledger.service';
import { logger } from '../config/logger';

interface RequiredIngredient {
  inventoryItemId: Types.ObjectId;
  name: string;
  unit: string;
  requiredInStockUnit: number;
  availableStock: number;
}

/**
 * Aggregates the total ingredient requirement for a set of order lines,
 * converting each recipe ingredient's unit to the inventory item's own stock
 * unit so quantities are always comparable/subtractable in one unit.
 * Menu items with no recipe defined are silently skipped (Part 2 does not
 * require every item to have a BOM before it can be sold).
 */
async function aggregateIngredientRequirements(
  outletId: string,
  items: IOrder['items']
): Promise<RequiredIngredient[]> {
  const menuItemIds = items.map((i) => i.menuItemId);
  const recipes = await Recipe.find({ outletId, menuItemId: { $in: menuItemIds }, isDeleted: false }).populate(
    'ingredients.inventoryItemId'
  );

  const requirementByItem = new Map<string, RequiredIngredient>();

  for (const orderLine of items) {
    const recipe = recipes.find((r) => r.menuItemId.toString() === orderLine.menuItemId.toString());
    if (!recipe) continue; // no BOM defined for this menu item — nothing to deduct

    for (const ing of recipe.ingredients) {
      const invItem = ing.inventoryItemId as unknown as InstanceType<typeof InventoryItem>;
      if (!invItem) continue;
      const perServing = convertUnit(ing.quantity, ing.unit, invItem.unit) / recipe.yieldServings;
      const totalNeeded = perServing * orderLine.quantity;

      const key = invItem.id;
      const existing = requirementByItem.get(key);
      if (existing) {
        existing.requiredInStockUnit += totalNeeded;
      } else {
        requirementByItem.set(key, {
          inventoryItemId: invItem._id as Types.ObjectId,
          name: invItem.name,
          unit: invItem.unit,
          requiredInStockUnit: totalNeeded,
          availableStock: invItem.currentStock,
        });
      }
    }
  }

  return Array.from(requirementByItem.values());
}

export const StockDeductionService = {
  /**
   * Checked at order-creation time (soft check): returns the list of
   * ingredients that don't have enough stock to fulfill the cart. Does NOT
   * deduct anything — deduction only happens on order completion, see
   * `consumeForOrder` below. Menu items without a recipe are always
   * considered available.
   */
  async checkAvailability(outletId: string, items: IOrder['items']): Promise<RequiredIngredient[]> {
    const requirements = await aggregateIngredientRequirements(outletId, items);
    return requirements.filter((r) => r.requiredInStockUnit > r.availableStock);
  },

  /**
   * Deducts recipe ingredients for a completed order. Idempotent: if this
   * order's ingredients were already deducted (Order.inventoryConsumedAt is
   * set, OR the ledger's unique index rejects a specific ingredient's entry
   * because it's already there), calling this again is a safe no-op.
   *
   * Design note: this loops per-ingredient with atomic, individually-ledgered
   * stock updates rather than wrapping everything in a multi-document Mongo
   * transaction. A replica-set transaction would give stronger all-or-nothing
   * atomicity across ingredients, but requires a replica set — this project's
   * docker-compose Mongo is a standalone instance, matching how most small
   * restaurant deployments would actually run MongoDB. Idempotency (the
   * property actually required by the spec — "prevent double deduction if
   * order events are retried") comes from the ledger's unique index, not from
   * transactional atomicity, and holds regardless of replica-set topology.
   */
  async consumeForOrder(orderId: string, userId?: string): Promise<{ alreadyConsumed: boolean; deducted: number }> {
    const order = await Order.findById(orderId);
    if (!order) throw new Error(`Order ${orderId} not found`);

    if (order.inventoryConsumedAt) {
      return { alreadyConsumed: true, deducted: 0 };
    }

    const requirements = await aggregateIngredientRequirements(order.outletId.toString(), order.items);

    let deducted = 0;
    for (const req of requirements) {
      try {
        const result = await LedgerService.recordMovement({
          inventoryItemId: req.inventoryItemId,
          outletId: order.outletId,
          delta: -req.requiredInStockUnit,
          type: 'SALE_CONSUMPTION',
          referenceType: 'ORDER',
          referenceId: order._id as Types.ObjectId,
          userId,
          notes: `Consumption for order ${order.orderNumber}`,
          allowNegative: order.stockOverrideApplied, // manager already approved selling below available stock
        });
        if (!result.skippedDuplicate) deducted += 1;
      } catch (err) {
        // Insufficient stock at consumption time (stock moved between order
        // creation and completion, e.g. wastage/another order). We log and
        // continue rather than blocking order completion — the order has
        // already been served to the customer by this point in the flow.
        logger.warn(
          `Stock deduction shortfall for order ${order.orderNumber}, ingredient ${req.name}: ${(err as Error).message}`
        );
      }
    }

    order.inventoryConsumedAt = new Date();
    await order.save();

    return { alreadyConsumed: false, deducted };
  },
};
