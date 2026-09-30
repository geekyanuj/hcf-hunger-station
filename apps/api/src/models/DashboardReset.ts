import { Schema, model, Document, Types } from 'mongoose';

/**
 * A "dashboard reset" is a NON-DESTRUCTIVE baseline marker: after it, the admin
 * dashboard only counts orders created from `resetAt` onwards. Orders,
 * payments, reports, exports and analytics pages are never touched, so
 * accounting history stays intact - only what the dashboard tiles/charts
 * start counting from changes.
 *
 * `outletId` absent = the reset covers every outlet (owner resetting "ALL").
 */
export interface IDashboardReset extends Document {
  outletId?: Types.ObjectId;
  resetAt: Date;
  resetBy: Types.ObjectId;
  resetByName: string;
  createdAt: Date;
}

const DashboardResetSchema = new Schema<IDashboardReset>(
  {
    outletId: { type: Schema.Types.ObjectId, ref: 'Outlet' },
    resetAt: { type: Date, required: true },
    resetBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    resetByName: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

DashboardResetSchema.index({ outletId: 1, resetAt: -1 });

export const DashboardReset = model<IDashboardReset>('DashboardReset', DashboardResetSchema);
