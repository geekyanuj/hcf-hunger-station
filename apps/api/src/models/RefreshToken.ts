import { Schema, model, Document, Types } from 'mongoose';

export type PrincipalType = 'USER' | 'CUSTOMER';

export interface IRefreshToken extends Document {
  principalType: PrincipalType;
  principalId: Types.ObjectId;
  tokenHash: string; // sha256 hash of the raw refresh token, never store raw value
  userAgent?: string;
  ipAddress?: string;
  isRevoked: boolean;
  expiresAt: Date;
  createdAt: Date;
}

const RefreshTokenSchema = new Schema<IRefreshToken>(
  {
    principalType: { type: String, enum: ['USER', 'CUSTOMER'], required: true },
    principalId: { type: Schema.Types.ObjectId, required: true },
    tokenHash: { type: String, required: true, unique: true },
    userAgent: { type: String },
    ipAddress: { type: String },
    isRevoked: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

RefreshTokenSchema.index({ tokenHash: 1 }, { unique: true });
RefreshTokenSchema.index({ principalId: 1, isRevoked: 1 });
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = model<IRefreshToken>('RefreshToken', RefreshTokenSchema);
