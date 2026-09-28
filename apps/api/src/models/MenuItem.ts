import { Schema, model, Document, Types } from 'mongoose';

export interface INutritionalInfo {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

export interface IMenuItem extends Document {
  outletId: Types.ObjectId;
  categoryId: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  images: string[];
  price: number;
  discountPrice?: number;
  offerPercent: number; // 0-100, simple % discount shown as a badge on the customer menu
  ingredients: string[]; // major ingredients, e.g. ["Paneer", "Bell Pepper", "Onion"]
  taxCategory: 'GST_5' | 'GST_12' | 'GST_18' | 'EXEMPT';
  preparationTimeMinutes: number; // baseline prep time used by estimation service
  isVeg: boolean;
  isAvailable: boolean;
  isFeatured: boolean;
  isPopular: boolean;
  sortOrder: number;
  modifierIds: Types.ObjectId[];
  nutritionalInfo?: INutritionalInfo;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NutritionalInfoSchema = new Schema<INutritionalInfo>(
  { calories: Number, protein: Number, carbs: Number, fat: Number },
  { _id: false }
);

const MenuItemSchema = new Schema<IMenuItem>(
  {
    outletId: { type: Schema.Types.ObjectId, ref: 'Outlet', required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'MenuCategory', required: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    description: { type: String },
    images: { type: [String], default: [] },
    price: { type: Number, required: true, min: 0 },
    discountPrice: { type: Number, min: 0 },
    offerPercent: { type: Number, min: 0, max: 100, default: 0 },
    ingredients: { type: [String], default: [] },
    taxCategory: { type: String, enum: ['GST_5', 'GST_12', 'GST_18', 'EXEMPT'], default: 'GST_5' },
    preparationTimeMinutes: { type: Number, required: true, default: 10, min: 1 },
    isVeg: { type: Boolean, default: true },
    isAvailable: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    isPopular: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    modifierIds: [{ type: Schema.Types.ObjectId, ref: 'Modifier' }],
    nutritionalInfo: { type: NutritionalInfoSchema },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

MenuItemSchema.index({ outletId: 1, slug: 1 }, { unique: true });
MenuItemSchema.index({ outletId: 1, categoryId: 1, isAvailable: 1 });
MenuItemSchema.index({ outletId: 1, isFeatured: 1 });
MenuItemSchema.index({ name: 'text', description: 'text' });

export const MenuItem = model<IMenuItem>('MenuItem', MenuItemSchema);
