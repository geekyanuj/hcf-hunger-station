/* eslint-disable no-console */
import mongoose from "mongoose";
import { v4 as uuid } from "uuid";
import { env } from "../config/env";
import { Outlet } from "../models/Outlet";
import { Role } from "../models/Role";
import { User } from "../models/User";
import { Customer } from "../models/Customer";
import { MenuCategory } from "../models/MenuCategory";
import { Modifier } from "../models/Modifier";
import { MenuItem } from "../models/MenuItem";
import { Table } from "../models/Table";
import { InventoryItem } from "../models/InventoryItem";
import { Supplier } from "../models/Supplier";
import { Recipe } from "../models/Recipe";
import { Coupon } from "../models/Coupon";
import { LoyaltyConfig } from "../models/Loyalty";
import { DEFAULT_ROLE_PERMISSIONS, ROLES } from "../config/permissions";
import { hashPassword } from "../utils/password";
import { slugify } from "../utils/format";
import { applyOutletSetup } from "./hcfOutlet";

async function seedRoles() {
  for (const roleName of ROLES) {
    await Role.findOneAndUpdate(
      { name: roleName },
      {
        name: roleName,
        permissions: DEFAULT_ROLE_PERMISSIONS[roleName],
        isSystem: true,
      },
      { upsert: true, new: true },
    );
  }
  console.log(`Seeded ${ROLES.length} roles`);
}

async function seedOutlets() {
  const { outlets } = await applyOutletSetup();

  for (const outlet of outlets) {
    console.log(
      `Outlet "${outlet.name}" (${outlet.address}, ${outlet.openingHours?.[0]?.openTime
      }-${outlet.openingHours?.[0]?.closeTime})`,
    );
  }

  return outlets;
}

async function seedStaffUsers(
  outlets: Awaited<ReturnType<typeof seedOutlets>>,
) {
  const outletIds = outlets.map((o) => o._id);
  const staffDefs = [
    {
      name: "Owner Account",
      email: "owner@hcfhungerstation.space",
      role: "OWNER",
      outletIds,
    },
    {
      name: "Azadnagar Manager",
      email: "manager.azadnagar@hcfhungerstation.space",
      role: "MANAGER",
      outletIds,
    },
    {
      name: "Azadnagar Cashier",
      email: "cashier.azadnagar@hcfhungerstation.space",
      role: "CASHIER",
      outletIds,
    },
    {
      name: "Azadnagar Kitchen",
      email: "kitchen.azadnagar@hcfhungerstation.space",
      role: "KITCHEN",
      outletIds,
    },
    {
      name: "Azadnagar Inventory",
      email: "inventory.azadnagar@hcfhungerstation.space",
      role: "INVENTORY",
      outletIds,
    },
    {
      name: "Azadnagar Delivery Rider",
      email: "delivery.azadnagar@hcfhungerstation.space",
      role: "DELIVERY",
      outletIds,
    },
  ];

  const passwordHash = await hashPassword("123456");
  for (const def of staffDefs) {
    await User.findOneAndUpdate(
      { email: def.email },
      {
        name: def.name,
        email: def.email,
        passwordHash,
        role: def.role,
        outletIds: def.outletIds,
        isActive: true,
      },
      { upsert: true, new: true },
    );
  }
  console.log(`Seeded ${staffDefs.length} staff users (password: 123456)`);
}

async function seedCustomers() {
  await Customer.findOneAndUpdate(
    { mobile: "9876543210" },
    {
      name: "Test Customer",
      mobile: "9876543210",
      email: "customer@example.com",
      addresses: [
        {
          label: "Home",
          line1: "12 Steel City Colony",
          city: "Dhanbad",
          state: "Jharkhand",
          pincode: "826001",
          isDefault: true,
        },
      ],
    },
    { upsert: true, new: true },
  );
  console.log("Seeded 1 test customer (mobile: 9876543210)");
}

async function seedMenuForOutlet(outletId: mongoose.Types.ObjectId) {
  const categoryDefs = [
    { name: "Burgers", sortOrder: 1 },
    { name: "Combos", sortOrder: 2 },
    { name: "Meals", sortOrder: 3 },
    { name: "Sides", sortOrder: 4 },
    { name: "Beverages", sortOrder: 5 },
  ];

  const categories: Record<string, mongoose.Types.ObjectId> = {};
  for (const def of categoryDefs) {
    const category = await MenuCategory.findOneAndUpdate(
      { outletId, slug: slugify(def.name) },
      {
        outletId,
        name: def.name,
        slug: slugify(def.name),
        sortOrder: def.sortOrder,
        isActive: true,
      },
      { upsert: true, new: true },
    );
    categories[def.name] = category._id as mongoose.Types.ObjectId;
  }

  const sizeModifier = await Modifier.findOneAndUpdate(
    { outletId, name: "Size" },
    {
      outletId,
      name: "Size",
      selectionType: "SINGLE",
      isRequired: true,
      minSelect: 1,
      maxSelect: 1,
      options: [
        { name: "Regular", priceDelta: 0, isDefault: true, isAvailable: true },
        { name: "Large", priceDelta: 40, isDefault: false, isAvailable: true },
      ],
    },
    { upsert: true, new: true },
  );

  const addonsModifier = await Modifier.findOneAndUpdate(
    { outletId, name: "Add-ons" },
    {
      outletId,
      name: "Add-ons",
      selectionType: "MULTIPLE",
      isRequired: false,
      minSelect: 0,
      maxSelect: 4,
      options: [
        { name: "Cheese", priceDelta: 25, isAvailable: true },
        { name: "Extra Patty", priceDelta: 60, isAvailable: true },
        { name: "Peri-Peri Sauce", priceDelta: 15, isAvailable: true },
        { name: "Jalapenos", priceDelta: 20, isAvailable: true },
      ],
    },
    { upsert: true, new: true },
  );

  const itemDefs = [
    {
      name: "Classic Chicken Burger",
      category: "Burgers",
      price: 129,
      prep: 8,
      modifiers: [sizeModifier._id, addonsModifier._id],
      featured: true,
      veg: false,
    },
    {
      name: "Zinger Burger",
      category: "Burgers",
      price: 159,
      prep: 10,
      modifiers: [sizeModifier._id, addonsModifier._id],
      featured: true,
      veg: false,
    },
    {
      name: "Veg Crunch Burger",
      category: "Burgers",
      price: 109,
      prep: 7,
      modifiers: [sizeModifier._id, addonsModifier._id],
      featured: false,
      veg: true,
    },
    {
      name: "Burger + Fries + Coke Combo",
      category: "Combos",
      price: 249,
      prep: 12,
      modifiers: [],
      featured: true,
      veg: false,
    },
    {
      name: "Family Feast Meal",
      category: "Meals",
      price: 599,
      prep: 18,
      modifiers: [],
      featured: false,
      veg: false,
    },
    {
      name: "French Fries",
      category: "Sides",
      price: 89,
      prep: 6,
      modifiers: [],
      featured: false,
      veg: true,
    },
    {
      name: "Peri-Peri Fries",
      category: "Sides",
      price: 99,
      prep: 6,
      modifiers: [],
      featured: false,
      veg: true,
    },
    {
      name: "Coca-Cola (500ml)",
      category: "Beverages",
      price: 60,
      prep: 1,
      modifiers: [],
      featured: false,
      veg: true,
    },
    {
      name: "Cold Coffee",
      category: "Beverages",
      price: 89,
      prep: 4,
      modifiers: [],
      featured: true,
      veg: true,
    },
  ];

  for (const def of itemDefs) {
    await MenuItem.findOneAndUpdate(
      { outletId, slug: slugify(def.name) },
      {
        outletId,
        categoryId: categories[def.category],
        name: def.name,
        slug: slugify(def.name),
        description: `${def.name} freshly prepared at HCF.`,
        images: [],
        price: def.price,
        taxCategory: "GST_5",
        preparationTimeMinutes: def.prep,
        isVeg: def.veg,
        isAvailable: true,
        isFeatured: def.featured,
        isPopular: def.featured,
        modifierIds: def.modifiers,
      },
      { upsert: true, new: true },
    );
  }
}

async function seedTables(outletId: mongoose.Types.ObjectId) {
  for (let i = 1; i <= 8; i += 1) {
    await Table.findOneAndUpdate(
      { outletId, tableNumber: String(i) },
      {
        outletId,
        tableNumber: String(i),
        capacity: i % 2 === 0 ? 4 : 2,
        qrToken: uuid(),
        isActive: true,
      },
      { upsert: true, new: true },
    );
  }
}

/**
 * Part 2: ingredient-level inventory + a supplier + one fully worked example
 * recipe (Chicken Burger — matches the exact spec example) so the recipe
 * cost/margin calculation, low-stock alerts, and automatic stock deduction
 * are all demonstrable immediately after seeding, without any manual setup.
 */
async function seedInventoryAndRecipes(outletId: mongoose.Types.ObjectId) {
  const supplier = await Supplier.findOneAndUpdate(
    { outletId, name: "Dhanbad Fresh Foods Supply Co." },
    {
      outletId,
      name: "Dhanbad Fresh Foods Supply Co.",
      contactPerson: "Ramesh Kumar",
      phone: "+919812345678",
      email: "orders@dhanbadfresh.example",
      address: "Industrial Area, Dhanbad, Jharkhand",
      gstin: "20AAAAA0000A1Z5",
      paymentTerms: "Net 15",
      isActive: true,
    },
    { upsert: true, new: true },
  );

  const itemDefs = [
    {
      name: "Burger Bun",
      sku: "BUN-001",
      category: "Bakery",
      unit: "piece",
      currentStock: 200,
      minimumStock: 50,
      maximumStock: 500,
      reorderLevel: 80,
      costPerUnit: 8,
    },
    {
      name: "Chicken Patty",
      sku: "PATTY-CHK-001",
      category: "Frozen",
      unit: "piece",
      currentStock: 150,
      minimumStock: 40,
      maximumStock: 400,
      reorderLevel: 60,
      costPerUnit: 32,
    },
    {
      name: "Cheese Slice",
      sku: "CHEESE-001",
      category: "Dairy",
      unit: "piece",
      currentStock: 180,
      minimumStock: 50,
      maximumStock: 400,
      reorderLevel: 70,
      costPerUnit: 10,
    },
    {
      name: "Lettuce",
      sku: "VEG-LETTUCE-001",
      category: "Produce",
      unit: "kg",
      currentStock: 5,
      minimumStock: 2,
      maximumStock: 15,
      reorderLevel: 3,
      costPerUnit: 60,
    },
    {
      name: "Burger Sauce",
      sku: "SAUCE-001",
      category: "Condiments",
      unit: "litre",
      currentStock: 8,
      minimumStock: 2,
      maximumStock: 20,
      reorderLevel: 3,
      costPerUnit: 180,
    },
    {
      name: "Potato (Fries Cut)",
      sku: "VEG-POTATO-001",
      category: "Produce",
      unit: "kg",
      currentStock: 25,
      minimumStock: 10,
      maximumStock: 80,
      reorderLevel: 15,
      costPerUnit: 45,
    },
    {
      name: "Cola Syrup",
      sku: "BEV-COLA-001",
      category: "Beverages",
      unit: "litre",
      currentStock: 1.5,
      minimumStock: 3,
      maximumStock: 20,
      reorderLevel: 5,
      costPerUnit: 220,
    },
  ];

  const items: Record<string, mongoose.Types.ObjectId> = {};
  for (const def of itemDefs) {
    const item = await InventoryItem.findOneAndUpdate(
      { outletId, sku: def.sku },
      { ...def, outletId, supplierId: supplier._id, isActive: true },
      { upsert: true, new: true },
    );
    items[def.name] = item._id as mongoose.Types.ObjectId;
  }

  // Recipe for "Classic Chicken Burger" — the exact example from the spec:
  // Bun x1, Chicken Patty x1, Cheese x1, Lettuce 20g, Sauce 15ml.
  const chickenBurger = await MenuItem.findOne({
    outletId,
    slug: slugify("Classic Chicken Burger"),
  });
  if (chickenBurger) {
    await Recipe.findOneAndUpdate(
      { outletId, menuItemId: chickenBurger._id },
      {
        outletId,
        menuItemId: chickenBurger._id,
        yieldServings: 1,
        ingredients: [
          { inventoryItemId: items["Burger Bun"], quantity: 1, unit: "piece" },
          {
            inventoryItemId: items["Chicken Patty"],
            quantity: 1,
            unit: "piece",
          },
          {
            inventoryItemId: items["Cheese Slice"],
            quantity: 1,
            unit: "piece",
          },
          { inventoryItemId: items["Lettuce"], quantity: 20, unit: "g" },
          { inventoryItemId: items["Burger Sauce"], quantity: 15, unit: "ml" },
        ],
      },
      { upsert: true, new: true },
    );
  }

  // Recipe for "French Fries" so wastage/consumption has a second real example.
  const fries = await MenuItem.findOne({
    outletId,
    slug: slugify("French Fries"),
  });
  if (fries) {
    await Recipe.findOneAndUpdate(
      { outletId, menuItemId: fries._id },
      {
        outletId,
        menuItemId: fries._id,
        yieldServings: 1,
        ingredients: [
          {
            inventoryItemId: items["Potato (Fries Cut)"],
            quantity: 180,
            unit: "g",
          },
        ],
      },
      { upsert: true, new: true },
    );
  }

  console.log(
    `Seeded ${itemDefs.length} inventory items, 1 supplier, and 2 recipes (Cola Syrup is intentionally seeded LOW STOCK to demo alerts)`,
  );
}

async function seedCouponsAndLoyalty() {
  await Coupon.findOneAndUpdate(
    { code: "WELCOME50" },
    {
      code: "WELCOME50",
      description: "₹50 off your first order above ₹299",
      discountType: "FLAT",
      value: 50,
      minOrderValue: 299,
      newCustomerOnly: true,
      isActive: true,
    },
    { upsert: true, new: true },
  );

  await Coupon.findOneAndUpdate(
    { code: "HCF10" },
    {
      code: "HCF10",
      description: "10% off, up to ₹100",
      discountType: "PERCENT",
      value: 10,
      minOrderValue: 0,
      maxDiscount: 100,
      isActive: true,
    },
    { upsert: true, new: true },
  );

  await Coupon.findOneAndUpdate(
    { code: "WEEKEND15" },
    {
      code: "WEEKEND15",
      description: "15% off on weekends, up to ₹150",
      discountType: "PERCENT",
      value: 15,
      minOrderValue: 199,
      maxDiscount: 150,
      validDays: ["SAT", "SUN"],
      isActive: true,
    },
    { upsert: true, new: true },
  );

  await LoyaltyConfig.findOneAndUpdate(
    { outletId: { $exists: false } },
    {
      isActive: true,
      pointsPerRupeeSpent: 0.01, // ₹100 spent = 1 point
      redemptionValuePerPoint: 0.1, // 100 points = ₹10
      minPointsToRedeem: 50,
      maxRedemptionPercentOfOrder: 50,
    },
    { upsert: true, new: true },
  );

  console.log(
    "Seeded 3 coupons (WELCOME50, HCF10, WEEKEND15) and the default loyalty configuration",
  );
}

async function run() {
  await mongoose.connect(env.mongoUri);
  console.log("Connected to MongoDB for seeding");

  await seedRoles();
  const outlets = await seedOutlets();
  await seedStaffUsers(outlets);
  await seedCustomers();

  for (const outlet of outlets) {
    await seedMenuForOutlet(outlet._id as mongoose.Types.ObjectId);
    await seedTables(outlet._id as mongoose.Types.ObjectId);
    await seedInventoryAndRecipes(outlet._id as mongoose.Types.ObjectId);
  }

  await seedCouponsAndLoyalty();

  console.log("\nSeed complete.");
  console.log(
    "Staff login: any *@hcfhungerstation.space address above, password: 123456",
  );
  console.log(
    "Customer login: enter name + mobile 9876543210 on the Account page (no OTP needed).",
  );

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
