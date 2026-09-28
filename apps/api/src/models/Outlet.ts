import { Schema, model, Types, Document } from 'mongoose';

export interface IOpeningHours {
  day: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
  openTime: string; // "10:00"
  closeTime: string; // "23:00"
  isClosed: boolean;
}

export interface IOutletSettings {
  taxPercentage: number;
  packagingCharge: number;
  deliveryBaseCharge: number;
  deliveryPerKmCharge: number;
  kitchenCapacityPerSlot: number; // # of items kitchen can realistically cook in parallel per ~5 min slot
  rushMultiplier: number; // extra time multiplier applied during rush hours
  tokenResetPolicy: 'DAILY' | 'NEVER';
  currency: string;
  /** Part 2: configurable kitchen-workload thresholds (active-order counts), not hard-coded in KDS logic. */
  kitchenLoadThresholds: {
    busyActiveOrders: number;
    criticalActiveOrders: number;
    delayedOrderMinutes: number; // an order is "delayed" once it's been active longer than this
  };
  /** Part 2: business rule for when a completed order's ingredients are deducted from stock. */
  stockDeductionTrigger: 'ON_COMPLETED' | 'ON_READY';
  /** Part 3: how many minutes before a scheduled order's target time it gets released to the kitchen (see scheduling.service.ts). */
  scheduledOrderReleaseWindowMinutes: number;
  /** Part 3: how many scheduled orders may share the same 15-minute slot before it's considered full. */
  scheduledOrdersPerSlotCapacity: number;
  notificationSettings: {
    lowStockAlerts: boolean;
    newOrderAlerts: boolean;
    delayedOrderAlerts: boolean;
  };
}

export interface IOutletHoliday {
  date: Date;
  reason?: string;
}

export interface IOutlet extends Document {
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
  logoUrl?: string;
  latitude?: number;
  longitude?: number;
  openingHours: IOpeningHours[];
  holidays: IOutletHoliday[];
  isActive: boolean;
  settings: IOutletSettings;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const OpeningHoursSchema = new Schema<IOpeningHours>(
  {
    day: { type: String, enum: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'], required: true },
    openTime: { type: String, required: true },
    closeTime: { type: String, required: true },
    isClosed: { type: Boolean, default: false },
  },
  { _id: false }
);

const OutletHolidaySchema = new Schema<IOutletHoliday>(
  { date: { type: Date, required: true }, reason: { type: String } },
  { _id: false }
);

const OutletSettingsSchema = new Schema<IOutletSettings>(
  {
    taxPercentage: { type: Number, default: 5 },
    packagingCharge: { type: Number, default: 10 },
    deliveryBaseCharge: { type: Number, default: 30 },
    deliveryPerKmCharge: { type: Number, default: 8 },
    kitchenCapacityPerSlot: { type: Number, default: 6 },
    rushMultiplier: { type: Number, default: 1.4 },
    tokenResetPolicy: { type: String, enum: ['DAILY', 'NEVER'], default: 'DAILY' },
    currency: { type: String, default: 'INR' },
    kitchenLoadThresholds: {
      type: {
        busyActiveOrders: { type: Number, default: 8 },
        criticalActiveOrders: { type: Number, default: 14 },
        delayedOrderMinutes: { type: Number, default: 20 },
      },
      default: () => ({ busyActiveOrders: 8, criticalActiveOrders: 14, delayedOrderMinutes: 20 }),
      _id: false,
    },
    stockDeductionTrigger: { type: String, enum: ['ON_COMPLETED', 'ON_READY'], default: 'ON_COMPLETED' },
    scheduledOrderReleaseWindowMinutes: { type: Number, default: 45 },
    scheduledOrdersPerSlotCapacity: { type: Number, default: 5 },
    notificationSettings: {
      type: {
        lowStockAlerts: { type: Boolean, default: true },
        newOrderAlerts: { type: Boolean, default: true },
        delayedOrderAlerts: { type: Boolean, default: true },
      },
      default: () => ({ lowStockAlerts: true, newOrderAlerts: true, delayedOrderAlerts: true }),
      _id: false,
    },
  },
  { _id: false }
);

const OutletSchema = new Schema<IOutlet>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    address: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    logoUrl: { type: String },
    latitude: { type: Number },
    longitude: { type: Number },
    openingHours: { type: [OpeningHoursSchema], default: [] },
    holidays: { type: [OutletHolidaySchema], default: [] },
    isActive: { type: Boolean, default: true },
    settings: { type: OutletSettingsSchema, default: () => ({}) },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

OutletSchema.index({ code: 1 }, { unique: true });
OutletSchema.index({ isActive: 1, isDeleted: 1 });

export const Outlet = model<IOutlet>('Outlet', OutletSchema);
export type OutletId = Types.ObjectId;
