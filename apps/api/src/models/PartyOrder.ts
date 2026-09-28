import { Schema, model, Document, Types } from 'mongoose';

export type PartyEventType = 'BIRTHDAY' | 'WEDDING' | 'OFFICE' | 'PARTY' | 'OTHER';
export type PartyFoodPreference = 'VEG' | 'NON_VEG' | 'MIXED';
export type PartyOrderStatus = 'REQUESTED' | 'CONTACTED' | 'QUOTED' | 'APPROVED' | 'REJECTED' | 'CONVERTED';

export interface IQuotation {
  description: string; // free-text line-item summary, e.g. "50 veg thalis + 50 non-veg thalis + dessert"
  amount: number;
  validUntil?: Date;
  notes?: string;
  preparedByUserId: Types.ObjectId;
  preparedAt: Date;
}

export interface IPartyOrder extends Document {
  outletId: Types.ObjectId;
  customerId?: Types.ObjectId; // set if the requester is a logged-in customer
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  eventType: PartyEventType;
  expectedGuests: number;
  eventDate: Date;
  eventTime: string; // "19:30"
  foodPreference: PartyFoodPreference;
  requirements?: string;
  approximateBudget?: number;
  deliverySetupRequired: boolean;
  status: PartyOrderStatus;
  quotations: IQuotation[]; // history — the latest entry is the active quotation
  reviewedByUserId?: Types.ObjectId;
  rejectionReason?: string;
  convertedOrderId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const QuotationSchema = new Schema<IQuotation>(
  {
    description: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    validUntil: { type: Date },
    notes: { type: String },
    preparedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    preparedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const PartyOrderSchema = new Schema<IPartyOrder>(
  {
    outletId: { type: Schema.Types.ObjectId, ref: 'Outlet', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    contactName: { type: String, required: true },
    contactPhone: { type: String, required: true },
    contactEmail: { type: String },
    eventType: { type: String, enum: ['BIRTHDAY', 'WEDDING', 'OFFICE', 'PARTY', 'OTHER'], required: true },
    expectedGuests: { type: Number, required: true, min: 1 },
    eventDate: { type: Date, required: true },
    eventTime: { type: String, required: true },
    foodPreference: { type: String, enum: ['VEG', 'NON_VEG', 'MIXED'], required: true },
    requirements: { type: String },
    approximateBudget: { type: Number },
    deliverySetupRequired: { type: Boolean, default: false },
    status: { type: String, enum: ['REQUESTED', 'CONTACTED', 'QUOTED', 'APPROVED', 'REJECTED', 'CONVERTED'], default: 'REQUESTED' },
    quotations: { type: [QuotationSchema], default: [] },
    reviewedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectionReason: { type: String },
    convertedOrderId: { type: Schema.Types.ObjectId, ref: 'Order' },
  },
  { timestamps: true }
);

PartyOrderSchema.index({ outletId: 1, status: 1, eventDate: 1 });
PartyOrderSchema.index({ contactPhone: 1 });

export const PartyOrder = model<IPartyOrder>('PartyOrder', PartyOrderSchema);
