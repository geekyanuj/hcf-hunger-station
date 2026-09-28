import { Schema, model, Document, Types } from 'mongoose';

export interface IMenuCategory extends Document {
  outletId: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  sortOrder: number;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MenuCategorySchema = new Schema<IMenuCategory>(
  {
    outletId: { type: Schema.Types.ObjectId, ref: 'Outlet', required: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    description: { type: String },
    image: { type: String },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

MenuCategorySchema.index({ outletId: 1, slug: 1 }, { unique: true });
MenuCategorySchema.index({ outletId: 1, sortOrder: 1 });

export const MenuCategory = model<IMenuCategory>('MenuCategory', MenuCategorySchema);
