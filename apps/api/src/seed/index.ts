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
  // Menu items are split into separate records by size/portion because the
  // current frontend does not provide a size selector.
  const categoryDefs = [
    { name: "Chicken Fry", sortOrder: 1 },
    { name: "Chilli", sortOrder: 2 },
    { name: "Chowmein", sortOrder: 3 },
    { name: "Non Veg Burgers", sortOrder: 4 },
    { name: "Non Veg Pizza", sortOrder: 5 },
    { name: "Non Veg Sandwich", sortOrder: 6 },
    { name: "Paratha", sortOrder: 7 },
    { name: "Shawarma & Rolls", sortOrder: 8 },
    { name: "Veg Burgers", sortOrder: 9 },
    { name: "Veg Pizza", sortOrder: 10 }
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

  const itemDefs = [
    { category: "Veg Pizza", name: "Margarita - Small", description: "Only cheese", price: 99, veg: true },
    { category: "Veg Pizza", name: "Margarita - Medium", description: "Only cheese", price: 190, veg: true },
    { category: "Veg Pizza", name: "Margarita - Large", description: "Only cheese", price: 290, veg: true },
    { category: "Veg Pizza", name: "Margarita - XL", description: "Only cheese", price: 390, veg: true },
    { category: "Veg Pizza", name: "Corn N Cheese - Small", description: "Cheese, sweet corn", price: 110, veg: true },
    { category: "Veg Pizza", name: "Corn N Cheese - Medium", description: "Cheese, sweet corn", price: 210, veg: true },
    { category: "Veg Pizza", name: "Corn N Cheese - Large", description: "Cheese, sweet corn", price: 310, veg: true },
    { category: "Veg Pizza", name: "Corn N Cheese - XL", description: "Cheese, sweet corn", price: 410, veg: true },
    { category: "Veg Pizza", name: "Veg Maxican - Small", description: "3 types bell peppers with Maxican dip", price: 120, veg: true },
    { category: "Veg Pizza", name: "Veg Maxican - Medium", description: "3 types bell peppers with Maxican dip", price: 220, veg: true },
    { category: "Veg Pizza", name: "Veg Maxican - Large", description: "3 types bell peppers with Maxican dip", price: 320, veg: true },
    { category: "Veg Pizza", name: "Veg Maxican - XL", description: "3 types bell peppers with Maxican dip", price: 420, veg: true },
    { category: "Veg Pizza", name: "Paneer Tikka - Small", description: "Capsicum, onion with tikka paneer", price: 120, veg: true },
    { category: "Veg Pizza", name: "Paneer Tikka - Medium", description: "Capsicum, onion with tikka paneer", price: 220, veg: true },
    { category: "Veg Pizza", name: "Paneer Tikka - Large", description: "Capsicum, onion with tikka paneer", price: 320, veg: true },
    { category: "Veg Pizza", name: "Paneer Tikka - XL", description: "Capsicum, onion with tikka paneer", price: 420, veg: true },
    { category: "Veg Pizza", name: "Peri Peri Paneer - Small", description: "Capsicum, onion paprika", price: 120, veg: true },
    { category: "Veg Pizza", name: "Peri Peri Paneer - Medium", description: "Capsicum, onion paprika", price: 220, veg: true },
    { category: "Veg Pizza", name: "Peri Peri Paneer - Large", description: "Capsicum, onion paprika", price: 320, veg: true },
    { category: "Veg Pizza", name: "Peri Peri Paneer - XL", description: "Capsicum, onion paprika", price: 420, veg: true },
    { category: "Veg Pizza", name: "Veg Tangy Pizza - Small", description: "Capsicum, onion, sweet corn, jalapeno; with garnish ketchup", price: 120, veg: true },
    { category: "Veg Pizza", name: "Veg Tangy Pizza - Medium", description: "Capsicum, onion, sweet corn, jalapeno; with garnish ketchup", price: 220, veg: true },
    { category: "Veg Pizza", name: "Veg Tangy Pizza - Large", description: "Capsicum, onion, sweet corn, jalapeno; with garnish ketchup", price: 320, veg: true },
    { category: "Veg Pizza", name: "Veg Tangy Pizza - XL", description: "Capsicum, onion, sweet corn, jalapeno; with garnish ketchup", price: 420, veg: true },
    { category: "Veg Pizza", name: "Mushroom Pizza - Small", description: "Capsicum, onion, mushroom", price: 110, veg: true },
    { category: "Veg Pizza", name: "Mushroom Pizza - Medium", description: "Capsicum, onion, mushroom", price: 210, veg: true },
    { category: "Veg Pizza", name: "Mushroom Pizza - Large", description: "Capsicum, onion, mushroom", price: 310, veg: true },
    { category: "Veg Pizza", name: "Mushroom Pizza - XL", description: "Capsicum, onion, mushroom", price: 410, veg: true },
    { category: "Non Veg Pizza", name: "Classic Tikka Chicken - Small", description: "Capsicum, onion, tikka chicken", price: 130, veg: false },
    { category: "Non Veg Pizza", name: "Classic Tikka Chicken - Medium", description: "Capsicum, onion, tikka chicken", price: 210, veg: false },
    { category: "Non Veg Pizza", name: "Classic Tikka Chicken - Large", description: "Capsicum, onion, tikka chicken", price: 310, veg: false },
    { category: "Non Veg Pizza", name: "Classic Tikka Chicken - XL", description: "Capsicum, onion, tikka chicken", price: 410, veg: false },
    { category: "Non Veg Pizza", name: "Chicken Corn - Small", description: "Cheese, chicken, corn", price: 130, veg: false },
    { category: "Non Veg Pizza", name: "Chicken Corn - Medium", description: "Cheese, chicken, corn", price: 210, veg: false },
    { category: "Non Veg Pizza", name: "Chicken Corn - Large", description: "Cheese, chicken, corn", price: 310, veg: false },
    { category: "Non Veg Pizza", name: "Chicken Corn - XL", description: "Cheese, chicken, corn", price: 410, veg: false },
    { category: "Non Veg Pizza", name: "Hot N Spicy Chicken - Small", description: "Capsicum with spicy fluid chicken", price: 130, veg: false },
    { category: "Non Veg Pizza", name: "Hot N Spicy Chicken - Medium", description: "Capsicum with spicy fluid chicken", price: 210, veg: false },
    { category: "Non Veg Pizza", name: "Hot N Spicy Chicken - Large", description: "Capsicum with spicy fluid chicken", price: 310, veg: false },
    { category: "Non Veg Pizza", name: "Hot N Spicy Chicken - XL", description: "Capsicum with spicy fluid chicken", price: 410, veg: false },
    { category: "Non Veg Pizza", name: "Maxican Chicken Pizza - Small", description: "Capsicum, olive, red paprika with Maxican dip", price: 150, veg: false },
    { category: "Non Veg Pizza", name: "Maxican Chicken Pizza - Medium", description: "Capsicum, olive, red paprika with Maxican dip", price: 240, veg: false },
    { category: "Non Veg Pizza", name: "Maxican Chicken Pizza - Large", description: "Capsicum, olive, red paprika with Maxican dip", price: 340, veg: false },
    { category: "Non Veg Pizza", name: "Maxican Chicken Pizza - XL", description: "Capsicum, olive, red paprika with Maxican dip", price: 440, veg: false },
    { category: "Non Veg Pizza", name: "Peri Peri Chicken - Small", description: "Capsicum, onion paprika", price: 130, veg: false },
    { category: "Non Veg Pizza", name: "Peri Peri Chicken - Medium", description: "Capsicum, onion paprika", price: 210, veg: false },
    { category: "Non Veg Pizza", name: "Peri Peri Chicken - Large", description: "Capsicum, onion paprika", price: 310, veg: false },
    { category: "Non Veg Pizza", name: "Peri Peri Chicken - XL", description: "Capsicum, onion paprika", price: 410, veg: false },
    { category: "Veg Burgers", name: "Veg Burger", description: "", price: 55, veg: true },
    { category: "Veg Burgers", name: "Veg Peri Peri Burger", description: "", price: 60, veg: true },
    { category: "Veg Burgers", name: "Veg Mexican Burger", description: "", price: 70, veg: true },
    { category: "Veg Burgers", name: "Veg Cheese Burger", description: "", price: 80, veg: true },
    { category: "Non Veg Burgers", name: "Chicken Burger", description: "", price: 70, veg: false },
    { category: "Non Veg Burgers", name: "Maxican Chicken Burger", description: "", price: 90, veg: false },
    { category: "Non Veg Burgers", name: "Double Patty Chicken Burger", description: "", price: 120, veg: false },
    { category: "Non Veg Burgers", name: "Cheese Chicken Burger", description: "", price: 110, veg: false },
    { category: "Non Veg Sandwich", name: "Tikka Chicken Grilled - Medium", description: "", price: 70, veg: false },
    { category: "Non Veg Sandwich", name: "Tikka Chicken Grilled - Large", description: "", price: 90, veg: false },
    { category: "Non Veg Sandwich", name: "Hot Chicken Grilled - Medium", description: "", price: 70, veg: false },
    { category: "Non Veg Sandwich", name: "Hot Chicken Grilled - Large", description: "", price: 90, veg: false },
    { category: "Non Veg Sandwich", name: "Peri Peri Chicken Grilled - Medium", description: "", price: 70, veg: false },
    { category: "Non Veg Sandwich", name: "Peri Peri Chicken Grilled - Large", description: "", price: 90, veg: false },
    { category: "Non Veg Sandwich", name: "Cheesy Chicken Grilled - Medium", description: "", price: 70, veg: false },
    { category: "Non Veg Sandwich", name: "Cheesy Chicken Grilled - Large", description: "", price: 90, veg: false },
    { category: "Chowmein", name: "Veg Chowmein - Half", description: "", price: 40, veg: false },
    { category: "Chowmein", name: "Veg Chowmein - Full", description: "", price: 80, veg: false },
    { category: "Chowmein", name: "Egg Chowmein - Half", description: "", price: 50, veg: false },
    { category: "Chowmein", name: "Egg Chowmein - Full", description: "", price: 90, veg: false },
    { category: "Chowmein", name: "Chicken Chowmein - Half", description: "", price: 60, veg: false },
    { category: "Chowmein", name: "Chicken Chowmein - Full", description: "", price: 120, veg: false },
    { category: "Chowmein", name: "Egg Chicken Chowmein - Half", description: "", price: 70, veg: false },
    { category: "Chowmein", name: "Egg Chicken Chowmein - Full", description: "", price: 130, veg: false },
    { category: "Chicken Fry", name: "Chicken Strips (10 Strip)", description: "", price: 100, veg: false },
    { category: "Chicken Fry", name: "Peri Peri Chicken Strips (10 Strip)", description: "", price: 120, veg: false },
    { category: "Chicken Fry", name: "Leg Fry - 2 Pcs", description: "Price shown for 2 pcs / 4 pcs", price: 110, veg: false },
    { category: "Chicken Fry", name: "Leg Fry - 4 Pcs", description: "Price shown for 2 pcs / 4 pcs", price: 180, veg: false },
    { category: "Chicken Fry", name: "Wing Fry - 2 Pcs", description: "Price shown for 2 pcs / 4 pcs", price: 80, veg: false },
    { category: "Chicken Fry", name: "Wing Fry - 4 Pcs", description: "Price shown for 2 pcs / 4 pcs", price: 140, veg: false },
    { category: "Chicken Fry", name: "Chicken Popcorn 5Pc", description: "", price: 60, veg: false },
    { category: "Chicken Fry", name: "Chicken Popcorn Peri Peri 5Pc", description: "", price: 70, veg: false },
    { category: "Chicken Fry", name: "Chicken Popcorn 10Pc", description: "", price: 110, veg: false },
    { category: "Chicken Fry", name: "Chicken Popcorn Peri Peri 10Pc", description: "", price: 120, veg: false },
    { category: "Chicken Fry", name: "French Fries", description: "", price: 50, veg: true },
    { category: "Chicken Fry", name: "Peri Peri French Fries", description: "", price: 60, veg: true },
    { category: "Chilli", name: "Paneer Chilli - Half", description: "", price: 100, veg: true },
    { category: "Chilli", name: "Paneer Chilli - Full", description: "", price: 200, veg: true },
    { category: "Chilli", name: "Chicken Chilli - Half", description: "", price: 100, veg: false },
    { category: "Chilli", name: "Chicken Chilli - Full", description: "", price: 200, veg: false },
    { category: "Paratha", name: "Paratha (1pc)", description: "", price: 20, veg: true },
    { category: "Shawarma & Rolls", name: "Classic Chicken Shawarma", description: "", price: 70, veg: false },
    { category: "Shawarma & Rolls", name: "Classic Cheese Chicken Shawarma", description: "", price: 90, veg: false },
    { category: "Shawarma & Rolls", name: "Chicken Roll", description: "", price: 60, veg: false },
    { category: "Shawarma & Rolls", name: "Chicken Cheese Roll", description: "", price: 70, veg: false },
    { category: "Shawarma & Rolls", name: "Egg Roll", description: "", price: 40, veg: false },
    { category: "Shawarma & Rolls", name: "Double Egg Roll", description: "", price: 50, veg: false },
    { category: "Shawarma & Rolls", name: "Egg Chicken Roll", description: "", price: 70, veg: false },
    { category: "Shawarma & Rolls", name: "Egg Chicken Cheese Roll", description: "", price: 80, veg: false },
    { category: "Shawarma & Rolls", name: "Double Egg Chicken Roll", description: "", price: 80, veg: false },
    { category: "Shawarma & Rolls", name: "Double Egg Chicken Cheese Roll", description: "", price: 90, veg: false },
    { category: "Shawarma & Rolls", name: "Paneer Roll", description: "", price: 70, veg: true },
    { category: "Shawarma & Rolls", name: "Paneer Cheese Roll", description: "", price: 80, veg: true }
  ];

  for (const def of itemDefs) {
    await MenuItem.findOneAndUpdate(
      { outletId, slug: slugify(def.name) },
      {
        outletId,
        categoryId: categories[def.category],
        name: def.name,
        slug: slugify(def.name),
        description: def.description || `${def.name} freshly prepared at HCF Hunger Station.`,
        images: [],
        price: def.price,
        taxCategory: "GST_5",
        preparationTimeMinutes: 10,
        isVeg: def.veg,
        isAvailable: true,
        isFeatured: false,
        isPopular: false,
        modifierIds: [],
      },
      { upsert: true, new: true },
    );
  }

  console.log(`Seeded ${categoryDefs.length} menu categories and ${itemDefs.length} size/portion-specific menu items for outlet ${outletId}`);
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