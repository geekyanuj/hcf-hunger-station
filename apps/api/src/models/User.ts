import { Schema, model, Document, Types } from 'mongoose';
import { RoleName } from '../config/permissions';

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: RoleName;
  outletIds: Types.ObjectId[]; // outlets this staff member can operate in
  isActive: boolean;
  isDeleted: boolean;
  lastLoginAt?: Date;
  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, required: true },
    outletIds: [{ type: Schema.Types.ObjectId, ref: 'Outlet' }],
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },
  },
  { timestamps: true }
);

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ role: 1 });

export const User = model<IUser>('User', UserSchema);
