import { Schema, model, Document, Types } from 'mongoose';
import { InventoryUnit } from './InventoryItem';

export interface IRecipeIngredient {
  inventoryItemId: Types.ObjectId;
  quantity: number;
  unit: InventoryUnit; // recorded per-ingredient since a recipe may use a different unit than the item's stock unit (e.g. item stocked in kg, recipe uses g)
}

export interface IRecipe extends Document {
  outletId: Types.ObjectId;
  menuItemId: Types.ObjectId;
  ingredients: IRecipeIngredient[];
  yieldServings: number; // recipe quantities are for this many servings (default 1)
  notes?: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RecipeIngredientSchema = new Schema<IRecipeIngredient>(
  {
    inventoryItemId: { type: Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, enum: ['kg', 'g', 'litre', 'ml', 'piece', 'packet', 'box'], required: true },
  },
  { _id: false }
);

const RecipeSchema = new Schema<IRecipe>(
  {
    outletId: { type: Schema.Types.ObjectId, ref: 'Outlet', required: true },
    menuItemId: { type: Schema.Types.ObjectId, ref: 'MenuItem', required: true },
    ingredients: { type: [RecipeIngredientSchema], required: true, validate: (v: unknown[]) => v.length > 0 },
    yieldServings: { type: Number, default: 1, min: 1 },
    notes: { type: String },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

RecipeSchema.index({ outletId: 1, menuItemId: 1 }, { unique: true });

export const Recipe = model<IRecipe>('Recipe', RecipeSchema);
