import { Schema, model, Document } from 'mongoose';
import { Permission, RoleName } from '../config/permissions';

export interface IRole extends Document {
  name: RoleName;
  description: string;
  permissions: Permission[];
  isSystem: boolean; // system roles (seeded) cannot be deleted
  createdAt: Date;
  updatedAt: Date;
}

const RoleSchema = new Schema<IRole>(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String, default: '' },
    permissions: { type: [String], default: [] },
    isSystem: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Role = model<IRole>('Role', RoleSchema);
