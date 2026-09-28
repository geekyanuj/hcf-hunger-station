import { describe, it, expect } from 'vitest';
import { Outlet } from '../models/Outlet';
import { MenuCategory } from '../models/MenuCategory';
import { MenuItem } from '../models/MenuItem';
import { InventoryItem } from '../models/InventoryItem';
import { Recipe } from '../models/Recipe';
import { Order } from '../models/Order';
import { LedgerService } from '../services/ledger.service';
import { RecipeService } from '../services/recipe.service';
import { StockDeductionService } from '../services/stockDeduction.service';
import { PurchaseService } from '../services/purchase.service';
import { WastageService } from '../services/wastage.service';
import { Supplier } from '../models/Supplier';

async function setupBurgerWithRecipe() {
  const outlet = await Outlet.create({
    name: 'Test Outlet',
    code: 'TST2',
    address: 'Addr',
    phone: '+919999999997',
    email: 'test2@hfc.example',
  });
  const category = await MenuCategory.create({ outletId: outlet._id, name: 'Burgers', slug: 'burgers' });
  const menuItem = await MenuItem.create({
    outletId: outlet._id,
    categoryId: category._id,
    name: 'Chicken Burger',
    slug: 'chicken-burger',
    price: 149,
    preparationTimeMinutes: 8,
  });

  const bun = await InventoryItem.create({
    outletId: outlet._id, name: 'Bun', sku: 'BUN', category: 'Bakery', unit: 'piece',
    currentStock: 100, minimumStock: 20, costPerUnit: 8,
  });
  const patty = await InventoryItem.create({
    outletId: outlet._id, name: 'Patty', sku: 'PATTY', category: 'Frozen', unit: 'piece',
    currentStock: 100, minimumStock: 20, costPerUnit: 32,
  });
  const lettuce = await InventoryItem.create({
    outletId: outlet._id, name: 'Lettuce', sku: 'LETTUCE', category: 'Produce', unit: 'kg',
    currentStock: 5, minimumStock: 2, costPerUnit: 60,
  });

  const recipe = await Recipe.create({
    outletId: outlet._id,
    menuItemId: menuItem._id,
    yieldServings: 1,
    ingredients: [
      { inventoryItemId: bun._id, quantity: 1, unit: 'piece' },
      { inventoryItemId: patty._id, quantity: 1, unit: 'piece' },
      { inventoryItemId: lettuce._id, quantity: 20, unit: 'g' }, // recipe in grams, stock tracked in kg
    ],
  });

  return { outlet, menuItem, bun, patty, lettuce, recipe };
}

describe('LedgerService.recordMovement', () => {
  it('updates stock and writes a ledger entry atomically', async () => {
    const { outlet, bun } = await setupBurgerWithRecipe();
    const result = await LedgerService.recordMovement({
      inventoryItemId: bun.id,
      outletId: outlet.id,
      delta: -10,
      type: 'SALE_CONSUMPTION',
      referenceType: 'ORDER',
      referenceId: outlet._id, // arbitrary distinct id for the test
    });
    expect(result.skippedDuplicate).toBe(false);
    expect(result.newStock).toBe(90);

    const updated = await InventoryItem.findById(bun._id);
    expect(updated!.currentStock).toBe(90);
  });

  it('rejects a movement that would drive stock negative unless allowNegative is set', async () => {
    const { outlet, bun } = await setupBurgerWithRecipe();
    await expect(
      LedgerService.recordMovement({
        inventoryItemId: bun.id,
        outletId: outlet.id,
        delta: -1000,
        type: 'ADJUSTMENT',
        referenceType: 'MANUAL',
      })
    ).rejects.toThrow(/insufficient/i);
  });

  it('is idempotent: a duplicate (referenceType, referenceId, item, type) movement is a no-op', async () => {
    const { outlet, bun } = await setupBurgerWithRecipe();
    const referenceId = outlet._id;

    const first = await LedgerService.recordMovement({
      inventoryItemId: bun.id, outletId: outlet.id, delta: -5,
      type: 'SALE_CONSUMPTION', referenceType: 'ORDER', referenceId,
    });
    const second = await LedgerService.recordMovement({
      inventoryItemId: bun.id, outletId: outlet.id, delta: -5,
      type: 'SALE_CONSUMPTION', referenceType: 'ORDER', referenceId,
    });

    expect(first.skippedDuplicate).toBe(false);
    expect(second.skippedDuplicate).toBe(true);

    const item = await InventoryItem.findById(bun._id);
    expect(item!.currentStock).toBe(95); // only deducted once, not twice
  });
});

describe('RecipeService.calculateCost', () => {
  it('computes ingredient cost and gross margin using live costPerUnit, with unit conversion', async () => {
    const { outlet, menuItem } = await setupBurgerWithRecipe();
    const breakdown = await RecipeService.calculateCost(outlet.id, menuItem.id);

    // bun 8 + patty 32 + lettuce 20g @ 60/kg = 1.2 => total 41.2
    expect(breakdown.ingredientCost).toBeCloseTo(41.2, 1);
    expect(breakdown.sellingPrice).toBe(149);
    expect(breakdown.grossMarginAmount).toBeCloseTo(149 - 41.2, 1);
    expect(breakdown.grossMarginPercent).toBeGreaterThan(0);
  });
});

describe('StockDeductionService (idempotent order-completion consumption)', () => {
  it('deducts recipe ingredients exactly once even if called twice for the same order', async () => {
    const { outlet, menuItem, bun, patty, lettuce } = await setupBurgerWithRecipe();

    const order = await Order.create({
      orderNumber: 'TST2-1',
      tokenNumber: 'T-001',
      outletId: outlet._id,
      orderType: 'TAKEAWAY',
      items: [
        {
          menuItemId: menuItem._id,
          name: menuItem.name,
          unitPrice: menuItem.price,
          quantity: 3,
          selectedModifiers: [],
          lineTotal: menuItem.price * 3,
          preparationTimeMinutes: 8,
        },
      ],
      subtotal: menuItem.price * 3,
      discount: 0,
      tax: 0,
      packagingCharge: 0,
      deliveryCharge: 0,
      total: menuItem.price * 3,
      estimatedPreparationMinutesMin: 8,
      estimatedPreparationMinutesMax: 12,
      statusHistory: [],
    });

    const firstRun = await StockDeductionService.consumeForOrder(order.id);
    expect(firstRun.alreadyConsumed).toBe(false);

    const secondRun = await StockDeductionService.consumeForOrder(order.id);
    expect(secondRun.alreadyConsumed).toBe(true);

    const updatedBun = await InventoryItem.findById(bun._id);
    const updatedPatty = await InventoryItem.findById(patty._id);
    const updatedLettuce = await InventoryItem.findById(lettuce._id);

    // 3 burgers => 3 buns, 3 patties, 60g lettuce (0.06kg), deducted ONCE.
    expect(updatedBun!.currentStock).toBe(97);
    expect(updatedPatty!.currentStock).toBe(97);
    expect(updatedLettuce!.currentStock).toBeCloseTo(5 - 0.06, 5);
  });

  it('checkAvailability flags a shortage without deducting anything', async () => {
    const { outlet, menuItem, lettuce } = await setupBurgerWithRecipe();
    await InventoryItem.findByIdAndUpdate(lettuce._id, { currentStock: 0.001 }); // effectively out

    const items = [
      {
        menuItemId: menuItem._id,
        name: menuItem.name,
        unitPrice: menuItem.price,
        quantity: 5,
        selectedModifiers: [],
        lineTotal: menuItem.price * 5,
        preparationTimeMinutes: 8,
      },
    ] as never;

    const shortages = await StockDeductionService.checkAvailability(outlet.id, items);
    expect(shortages.length).toBeGreaterThan(0);
    expect(shortages.some((s) => s.name === 'Lettuce')).toBe(true);

    const stillFull = await InventoryItem.findById(lettuce._id);
    expect(stillFull!.currentStock).toBeCloseTo(0.001, 5); // unchanged - this was only a check
  });
});

describe('PurchaseService', () => {
  it('increases stock only after complete(), never on create()', async () => {
    const { outlet, bun } = await setupBurgerWithRecipe();
    const supplier = await Supplier.create({ outletId: outlet._id, name: 'Test Supplier', phone: '+911234567890' });

    const purchase = await PurchaseService.create(
      outlet.id,
      supplier.id,
      [{ inventoryItemId: bun.id, quantity: 50, rate: 8.5 }],
      undefined,
      undefined,
      bun.id // any valid-looking id stands in for a userId here since we don't assert on it
    );
    expect(purchase.status).toBe('DRAFT');

    const beforeComplete = await InventoryItem.findById(bun._id);
    expect(beforeComplete!.currentStock).toBe(100); // untouched while DRAFT

    await PurchaseService.complete(purchase.id, { userId: undefined });

    const afterComplete = await InventoryItem.findById(bun._id);
    expect(afterComplete!.currentStock).toBe(150); // +50 after completion

    await expect(PurchaseService.complete(purchase.id, { userId: undefined })).rejects.toThrow(/already/i);
  });
});

describe('WastageService', () => {
  it('decreases stock and records estimated value from live costPerUnit', async () => {
    const { outlet, lettuce } = await setupBurgerWithRecipe();
    const wastage = await WastageService.create(outlet.id, lettuce.id, 0.5, 'SPOILAGE', 'left out overnight', {
      userId: undefined,
    });
    expect(wastage.estimatedValue).toBeCloseTo(30, 2); // 0.5kg * 60/kg

    const updated = await InventoryItem.findById(lettuce._id);
    expect(updated!.currentStock).toBeCloseTo(4.5, 5);
  });
});
