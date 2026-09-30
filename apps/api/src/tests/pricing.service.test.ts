import { describe, it, expect } from 'vitest';
import { Outlet } from '../models/Outlet';
import { MenuCategory } from '../models/MenuCategory';
import { MenuItem } from '../models/MenuItem';
import { Modifier } from '../models/Modifier';
import { PricingService } from '../services/pricing.service';

async function setupOutletWithMenu() {
  const outlet = await Outlet.create({
    name: 'Test Outlet',
    code: 'TST',
    address: 'Test Address',
    phone: '+919999999999',
    email: 'test@hcf.example',
    settings: { taxPercentage: 5, packagingCharge: 10, deliveryBaseCharge: 30, deliveryPerKmCharge: 8, kitchenCapacityPerSlot: 6, rushMultiplier: 1.4, tokenResetPolicy: 'DAILY', currency: 'INR' },
  });

  const category = await MenuCategory.create({ outletId: outlet._id, name: 'Burgers', slug: 'burgers' });

  const sizeModifier = await Modifier.create({
    outletId: outlet._id,
    name: 'Size',
    selectionType: 'SINGLE',
    options: [
      { name: 'Regular', priceDelta: 0, isDefault: true, isAvailable: true },
      { name: 'Large', priceDelta: 40, isAvailable: true },
    ],
  });

  const item = await MenuItem.create({
    outletId: outlet._id,
    categoryId: category._id,
    name: 'Test Burger',
    slug: 'test-burger',
    price: 100,
    taxCategory: 'GST_5',
    preparationTimeMinutes: 10,
    modifierIds: [sizeModifier._id],
  });

  return { outlet, item, sizeModifier };
}

describe('PricingService.priceCart', () => {
  it('computes totals from the stored menu item price, ignoring any client-sent price', async () => {
    const { outlet, item, sizeModifier } = await setupOutletWithMenu();
    const largeOptionId = sizeModifier.options[1].id as string;

    const priced = await PricingService.priceCart(
      outlet.id,
      [{ menuItemId: item.id, quantity: 2, selectedOptionIds: [largeOptionId] }],
      'TAKEAWAY'
    );

    // unit price = 100 (base) + 40 (Large) = 140; line total = 280
    expect(priced.items[0].unitPrice).toBe(100);
    expect(priced.items[0].lineTotal).toBe(280);
    expect(priced.subtotal).toBe(280);
    expect(priced.tax).toBeCloseTo(280 * 0.05, 2);
    expect(priced.packagingCharge).toBe(10); // TAKEAWAY incurs packaging
    expect(priced.deliveryCharge).toBe(0);
  });

  it('applies the HCF10 demo coupon as a 10% discount', async () => {
    const { outlet, item } = await setupOutletWithMenu();
    const priced = await PricingService.priceCart(
      outlet.id,
      [{ menuItemId: item.id, quantity: 1, selectedOptionIds: [] }],
      'DELIVERY',
      'HCF10'
    );
    expect(priced.discount).toBe(10); // 10% of 100
  });

  it('rejects an unavailable menu item', async () => {
    const { outlet, item } = await setupOutletWithMenu();
    await MenuItem.findByIdAndUpdate(item._id, { isAvailable: false });
    await expect(
      PricingService.priceCart(outlet.id, [{ menuItemId: item.id, quantity: 1, selectedOptionIds: [] }], 'TAKEAWAY')
    ).rejects.toThrow(/unavailable/i);
  });
});
