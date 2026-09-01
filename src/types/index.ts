export type OrderStatus =
  | 'placed'
  | 'preparing'
  | 'ready_for_pickup'
  | 'out_for_delivery'
  | 'delivered'
  | 'completed'
  | 'cancelled';

export type FulfillmentType = 'DELIVERY' | 'COLLECTION' | 'DINE_IN';

export type PaymentMethod = 'CASH' | 'CARD' | 'UPI' | 'ONLINE';
export type PaymentStatus = 'PENDING' | 'PAID' | 'REFUNDED' | 'FAILED';

export interface OrderItemVariant {
  id?: string;
  name: string;
  price?: number;
  additionalPrice?: number;
}

export interface OrderItemAddon {
  id?: string;
  name: string;
  price?: number;
  additionalPrice?: number;
}

export interface OrderItem {
  _id?: string;
  id?: string;
  itemId?: string;
  itemName?: string;
  name?: string;
  quantity: number;
  basePrice: number;
  itemTotal: number;
  selectedVariants?: OrderItemVariant[];
  selectedAddons?: OrderItemAddon[];
  instructions?: string;
  note?: string;
}

export interface CustomerDetails {
  name: string;
  phoneNumber?: string;
  email?: string;
}

export interface DeliveryAddress {
  fullAddress?: string;
  addressLine1?: string;
  addressLine2?: string;
  street?: string;
  city?: string;
  landmark?: string;
  postalCode?: string;
  postcode?: string;
  phoneNumber?: string;
}

export interface OrderPricing {
  subtotal: number;
  deliveryFee?: number;
  serviceFee?: number;
  discount?: number;
  tip?: number;
  tax?: number;
  total: number;
}

export interface Order {
  _id: string;
  orderNumber: string;
  restaurantId: string | { _id: string; restaurantName: string; phoneNumber?: string };
  customerDetails?: CustomerDetails;
  deliveryAddress?: DeliveryAddress | string;
  orderedItems: OrderItem[];
  status: OrderStatus;
  orderType: FulfillmentType;
  tableId?: string;
  tableName?: string;
  pricing: OrderPricing;
  paymentType: PaymentMethod;
  paymentStatus: PaymentStatus;
  deliveryInstructions?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
  isSyncedToCloud?: boolean;
}

export interface MenuItem {
  _id: string;
  name: string;
  description?: string;
  price: number;
  categoryId: string;
  categoryName?: string;
  image?: string;
  isAvailable: boolean; // false = 86'd (Out of Stock)
  variants?: OrderItemVariant[];
  addons?: OrderItemAddon[];
}

export interface Category {
  _id: string;
  name: string;
  sortOrder?: number;
}

export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'BILLED' | 'RESERVED';

export interface Table {
  _id: string;
  tableNumber: string;
  capacity: number;
  status: TableStatus;
  currentOrderId?: string;
  activeOrder?: Order;
  occupiedAt?: string;
  section?: string;
}

export type PrinterConnectionType = 'BLUETOOTH' | 'NETWORK' | 'USB' | 'SUNMI';
export type PaperWidth = '58mm' | '80mm';

export interface PrinterDevice {
  id: string;
  name: string;
  connectionType: PrinterConnectionType;
  ipAddress?: string;
  port?: number;
  macAddress?: string;
  target?: string; // MFi / SPP identifier
  paperWidth: PaperWidth;
  isDefault: boolean;
}

import { PosBrand } from '../../services/pos-config.service';

export interface PosPrinterConfig {
  brand?: PosBrand | string;
  connectionType: PrinterConnectionType | string;
  ipAddress: string;
  port: number;
  macAddress?: string;
  paperWidth: PaperWidth;
  autoPrintNewOrders?: boolean;
  autoPrint?: boolean;
  openCashDrawerOnCashPayment?: boolean;
  openCashDrawer?: boolean;
  autoCutReceipt?: boolean;
  autoCut?: boolean;
  copies?: number;
  receiptHeaderNotes?: string;
  receiptFooterNotes?: string;
}

export interface ShiftReport {
  id: string;
  shiftStartTime: string;
  shiftEndTime: string;
  cashierName: string;
  totalSales: number;
  totalOrdersCount: number;
  cashSales: number;
  cardSales: number;
  upiSales: number;
  deliveryAggregatorSales: number;
  totalDiscount: number;
  openingCashDrawer: number;
  expectedClosingCash: number;
  actualClosingCash: number;
  cashDifference: number;
  printedAt: string;
}
