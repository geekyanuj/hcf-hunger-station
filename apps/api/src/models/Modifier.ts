import { Schema, model, Document, Types } from 'mongoose';

export interface IModifierOption {
  _id?: Types.ObjectId;
  id?: string; // mongoose virtual string id, available on subdocuments at runtime
  name: string; // "Large", "Extra Cheese"
  priceDelta: number; // amount added to base item price
  isDefault: boolean;
  isAvailable: boolean;
}

export interface IModifier extends Document {
  outletId: Types.ObjectId;
  name: string; // "Size", "Add-ons", "Sauce"
  selectionType: 'SINGLE' | 'MULTIPLE';
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  options: IModifierOption[];
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ModifierOptionSchema = new Schema<IModifierOption>({
  name: { type: String, required: true },
  priceDelta: { type: Number, default: 0 },
  isDefault: { type: Boolean, default: false },
  isAvailable: { type: Boolean, default: true },
});

const ModifierSchema = new Schema<IModifier>(
  {
    outletId: { type: Schema.Types.ObjectId, ref: 'Outlet', required: true },
    name: { type: String, required: true },
    selectionType: { type: String, enum: ['SINGLE', 'MULTIPLE'], default: 'SINGLE' },
    isRequired: { type: Boolean, default: false },
    minSelect: { type: Number, default: 0 },
    maxSelect: { type: Number, default: 1 },
    options: { type: [ModifierOptionSchema], default: [] },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ModifierSchema.index({ outletId: 1 });

export const Modifier = model<IModifier>('Modifier', ModifierSchema);
