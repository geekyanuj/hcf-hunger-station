import { Schema, model, Document, Types } from 'mongoose';

export interface IAddress {
  _id?: Types.ObjectId;
  label: string; // "Home", "Work"
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  latitude?: number;
  longitude?: number;
  isDefault: boolean;
}

export interface ICustomer extends Document {
  name: string;
  mobile: string;
  email?: string;
  addresses: IAddress[];
  favouriteMenuItemIds: Types.ObjectId[];
  /** Denormalized cache, kept in sync with LoyaltyTransaction ledger by LoyaltyService only — see models/Loyalty.ts. */
  loyaltyPoints: number;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AddressSchema = new Schema<IAddress>(
  {
    label: { type: String, default: 'Home' },
    line1: { type: String, required: true },
    line2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    latitude: { type: Number },
    longitude: { type: Number },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: false }
);

const CustomerSchema = new Schema<ICustomer>(
  {
    name: { type: String, required: true, trim: true },
    mobile: { type: String, required: true, unique: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    addresses: { type: [AddressSchema], default: [] },
    favouriteMenuItemIds: [{ type: Schema.Types.ObjectId, ref: 'MenuItem' }],
    loyaltyPoints: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

CustomerSchema.index({ mobile: 1 }, { unique: true });

export const Customer = model<ICustomer>('Customer', CustomerSchema);
