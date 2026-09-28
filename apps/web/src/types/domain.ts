export type OrderType = 'DELIVERY' | 'TAKEAWAY' | 'DINE_IN' | 'POS' | 'CATERING';
/** The seven canonical order statuses. Payment and delivery progress are separate fields. */
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'OUT_FOR_DELIVERY' | 'COMPLETED' | 'CANCELLED';
export type PaymentStatus = 'PENDING' | 'AUTHORIZED' | 'PARTIALLY_PAID' | 'PAID' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED';
export type DeliveryStatus = 'PENDING' | 'ASSIGNED' | 'PICKED_UP' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'ONLINE';
export type OrderPaymentMethod = PaymentMethod | 'PAY_AFTER_DINE_IN';

export type OrderActionKey =
  | 'CONFIRM'
  | 'START_PREPARING'
  | 'MARK_READY'
  | 'ASSIGN_DELIVERY'
  | 'MARK_OUT_FOR_DELIVERY'
  | 'COMPLETE'
  | 'CANCEL'
  | 'PRINT_CUSTOMER'
  | 'PRINT_KITCHEN'
  | 'VIEW';

/** Computed by the backend state machine for the logged-in user — the UI renders exactly these and nothing else. */
export interface OrderAction {
  key: OrderActionKey;
  label: string;
  kind: 'STATUS' | 'ASSIGN_DELIVERY' | 'PRINT' | 'VIEW';
  targetStatus?: OrderStatus;
  enabled: boolean;
  disabledReason?: string;
  requiresReason?: boolean;
  destructive?: boolean;
}

export interface StatusHistoryEntry {
  status: OrderStatus;
  timestamp: string;
  changedBy?: string;
  changedByRole: string;
  note?: string;
}

export interface Outlet {
  _id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
  isActive: boolean;
  settings: {
    taxPercentage: number;
    packagingCharge: number;
    deliveryBaseCharge: number;
    currency: string;
  };
}

export interface ModifierOption {
  _id: string;
  name: string;
  priceDelta: number;
  isDefault: boolean;
  isAvailable: boolean;
}

export interface Modifier {
  _id: string;
  name: string;
  selectionType: 'SINGLE' | 'MULTIPLE';
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  options: ModifierOption[];
}

export interface MenuCategory {
  _id: string;
  name: string;
  slug: string;
  sortOrder: number;
}

export interface MenuItem {
  _id: string;
  categoryId: string;
  name: string;
  slug: string;
  description?: string;
  images: string[];
  price: number;
  discountPrice?: number;
  offerPercent: number;
  ingredients: string[];
  preparationTimeMinutes: number;
  isVeg: boolean;
  isAvailable: boolean;
  isFeatured: boolean;
  isPopular: boolean;
  modifierIds: Modifier[];
}

export interface MenuSection {
  category: MenuCategory;
  items: MenuItem[];
}

export interface CartLine {
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  selectedOptionIds: string[];
  selectedOptionLabels: string[]; // for display only, e.g. "Large, +Cheese"
  notes?: string;
}

export interface PricedCart {
  items: unknown[];
  subtotal: number;
  discount: number;
  tax: number;
  packagingCharge: number;
  deliveryCharge: number;
  total: number;
}

export interface Order {
  _id: string;
  orderNumber: string;
  tokenNumber: string;
  outletId: string;
  orderType: OrderType;
  items: {
    name: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    selectedModifiers: { modifierName: string; optionName: string; priceDelta: number }[];
  }[];
  subtotal: number;
  discount: number;
  tax: number;
  packagingCharge: number;
  deliveryCharge: number;
  total: number;
  paymentStatus: PaymentStatus;
  paymentMethod?: OrderPaymentMethod;
  orderStatus: OrderStatus;
  deliveryStatus?: DeliveryStatus;
  deliveryStaffId?: string | { _id: string; name: string };
  orderFlow?: 'PARCEL' | 'TAKE' | 'DINE';
  availableActions?: OrderAction[];
  statusHistory?: StatusHistoryEntry[];
  cancelledAt?: string;
  cancelledBy?: 'CUSTOMER' | 'STAFF' | 'ADMIN' | 'SYSTEM';
  cancellationReason?: string;
  cancellationNote?: string;
  previousOrderStatus?: OrderStatus;
  estimatedPreparationMinutesMin: number;
  estimatedPreparationMinutesMax: number;
  tableId?: string;
  tableNumber?: string;
  customerNotes?: string;
  deliveryAddress?: { line1: string; line2?: string; city: string; state: string; pincode: string };
  scheduledAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Address {
  _id?: string;
  label: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

export interface Customer {
  _id: string;
  name: string;
  mobile: string;
  email?: string;
  addresses: Address[];
}
