import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  DeviceEventEmitter,
  Modal,
  Platform,
  AppState,
  NativeSyntheticEvent,
  NativeScrollEvent,
  LayoutAnimation,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { OrderDetailModal } from '../../components/OrderDetailModal';
import { AssignDeliveryModal } from '../../components/AssignDeliveryModal';
import { ConfirmModal } from '../../components/ConfirmModal';
import { ErrorState } from '../../components/ErrorState';
import { ApiErrorType } from '../../services/api';
import { Colors } from '../../constants/colors';
import { orderService } from '../../services/order.service';
import { useToast } from '../../context/ToastContext';
import { Order, OrderStatus } from '../../types';
import { getItemOptionsList } from '../../services/receipt-customization.service';
import { Skeleton } from '../../components/Skeleton';
import {
  Search,
  WifiOff,
  ChevronDown,
  ChevronUp,
  Clock,
  Bike,
  ShoppingBag,
  CheckCircle2,
  Inbox,
  Truck,
  Check,
  X,
  LayoutGrid,
  List,
  MapPin,
  UtensilsCrossed,
  Printer,
  Globe,
  Calendar,
  CalendarDays,
  SlidersHorizontal,
  RotateCcw,
  CreditCard,
  Banknote,
  Sparkles,
  Plus,
  Minus,
  Smartphone,
  ChefHat,
  CircleX,
  House,
} from 'lucide-react-native';
import { printThermalReceipt, isAutoPrintEnabled, getLastPrintJobReport, getOrderScheduleInfo } from '../../services/thermal-print.service';
import { getSanitizedOrderNotes } from '../../services/printer/receipt-document';
import { getPosPrinterConfig } from '../../services/pos-config.service';
import { getActiveReceiptTemplate, isDummyCustomerPhone } from '../../services/receipt-customization.service';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TABLET_BREAKPOINT = 768;
const BOARD_COLUMNS_STORAGE_KEY = '@krifoo_board_columns_count';

export type BoardColumnsOption = 'auto' | 1 | 2 | 3 | 4 | 5 | 6;

export interface BoardColumnPreset {
  value: BoardColumnsOption;
  /** Short name shown on the tile (e.g. "Focus") */
  title: string;
  /** One-line hint explaining when to use it */
  description: string;
}

/** Number of status columns rendered in Board view (all tabs except "All Orders") */
const BOARD_STATUS_COLUMN_COUNT = 6;
/** Narrowest a board column may get before it is clamped (see columnWidth) */
const BOARD_MIN_COLUMN_WIDTH = { phone: 160, tablet: 200 };

const BOARD_AUTO_PRESET: BoardColumnPreset = {
  value: 'auto',
  title: 'Auto',
  description: 'Adapts to screen size & rotation',
};

const BOARD_COLUMN_PRESETS: BoardColumnPreset[] = [
  { value: 1, title: 'Focus', description: 'One status at a time' },
  { value: 2, title: 'Split', description: 'Two side by side' },
  { value: 3, title: 'Balanced', description: 'Kitchen-friendly view' },
  { value: 4, title: 'Overview', description: 'Most of the flow' },
  { value: 5, title: 'Wide', description: 'Large screens' },
  { value: 6, title: 'Fit all', description: 'Every status at once' },
];

const STATUS_TABS = [
  { id: 'all', label: 'All Orders', subtitle: 'All Statuses', statuses: [] as OrderStatus[], accentColor: '#11181C', Icon: List },
  { id: 'new', label: 'New Orders', subtitle: 'Awaiting Acceptance', statuses: ['placed'] as OrderStatus[], accentColor: '#F59E0B', Icon: Inbox },
  { id: 'kitchen', label: 'In Kitchen', subtitle: 'Preparing & Cooking', statuses: ['confirmed', 'preparing'] as OrderStatus[], accentColor: '#3B82F6', Icon: ChefHat },
  { id: 'pickup', label: 'Self Pickup / Takeaway', subtitle: 'Ready for Collection', statuses: ['ready_for_pickup'] as OrderStatus[], accentColor: '#FF5C39', Icon: ShoppingBag },
  { id: 'delivery', label: 'Out for Delivery', subtitle: 'Rider on the Way', statuses: ['out_for_delivery'] as OrderStatus[], accentColor: '#8B5CF6', Icon: Bike },
  { id: 'completed', label: 'Completed', subtitle: 'Delivered Successfully', statuses: ['delivered'] as OrderStatus[], accentColor: '#10B981', Icon: CheckCircle2 },
  { id: 'cancelled', label: 'Cancelled', subtitle: 'Not Fulfilled', statuses: ['cancelled'] as OrderStatus[], accentColor: '#EF4444', Icon: CircleX },
];

const TYPE_FILTERS = [
  { label: 'All Orders', value: 'all', color: '#11181C', bg: '#F8F9FA', border: '#EEEEEE', Icon: List },
  { label: 'Delivery', value: 'delivery', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', Icon: Bike },
  { label: 'Pickup', value: 'pickup', color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA', Icon: ShoppingBag },
  { label: 'Dine In', value: 'dine_in', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', Icon: UtensilsCrossed },
];

export function getOrderItems(order: Order): any[] {
  if (Array.isArray(order.orderedItems) && order.orderedItems.length > 0) {
    return order.orderedItems;
  }
  if (Array.isArray((order as any).items) && (order as any).items.length > 0) {
    return (order as any).items;
  }
  return [];
}

export function getItemName(item: any): string {
  if (!item) return 'Item';
  return (
    item.name ||
    item.itemName ||
    item.title ||
    item.dishName ||
    item.productName ||
    (typeof item.menuItemId === 'object' ? item.menuItemId?.name || item.menuItemId?.itemName : undefined) ||
    (typeof item.itemId === 'object' ? item.itemId?.name || item.itemId?.itemName : undefined) ||
    (typeof item.menuItem === 'object' ? item.menuItem?.name || item.menuItem?.itemName : undefined) ||
    'Item'
  );
}

export function getItemPrice(item: any): number {
  if (!item) return 0;
  const qty = Number(item.quantity || item.qty || 1);

  // 1. Direct line total
  const lineTotal = item.itemTotal ?? item.totalPrice ?? item.total;
  if (lineTotal !== undefined && lineTotal !== null && !isNaN(Number(lineTotal)) && Number(lineTotal) > 0) {
    return Number(lineTotal);
  }

  // 2. Unit price fields
  const unitPrice =
    item.price ??
    item.basePrice ??
    item.unitPrice ??
    item.cost ??
    item.rate ??
    (typeof item.menuItemId === 'object' ? item.menuItemId?.price ?? item.menuItemId?.basePrice : undefined) ??
    (typeof item.itemId === 'object' ? item.itemId?.price ?? item.itemId?.basePrice : undefined) ??
    (typeof item.menuItem === 'object' ? item.menuItem?.price ?? item.menuItem?.basePrice : undefined);

  if (unitPrice !== undefined && unitPrice !== null && !isNaN(Number(unitPrice)) && Number(unitPrice) > 0) {
    return Number(unitPrice) * qty;
  }

  // 3. Customization price
  if (item.customization) {
    const customPrice = item.customization.price ?? item.customization.totalPrice;
    if (customPrice !== undefined && customPrice !== null && !isNaN(Number(customPrice)) && Number(customPrice) > 0) {
      return Number(customPrice) * qty;
    }
  }

  return 0;
}

function getCustomerName(order: Order) {
  if (typeof order.customerId === 'object') return order.customerId?.fullName || order.customerDetails?.name || 'Customer';
  return order.customerDetails?.name || 'Customer';
}

function getCustomerPhone(order: Order) {
  let phone = '';
  if (typeof order.customerId === 'object') phone = order.customerId?.phoneNumber || order.customerDetails?.phoneNumber || '';
  else phone = order.customerDetails?.phoneNumber || '';
  if (isDummyCustomerPhone(phone)) return '';
  return phone;
}

function getRestaurantName(order: Order) {
  if (typeof order.restaurantId === 'object') return order.restaurantId?.restaurantName || 'Restaurant';
  return 'Restaurant';
}

export function getOrderSourceDetails(order: Order): {
  isExternal: boolean;
  domainUrl: string;
} {
  const source = (order.orderSource || '').toLowerCase();
  const rawDomain = (order.sourceDomain || '').trim();
  const restExt = typeof order.restaurantId === 'object' ? (order.restaurantId as any)?.externalWebsiteSettings : undefined;
  const restCustomDomain = (restExt?.customDomain || restExt?.domain || '').trim();
  const restSubdomain = restExt?.subdomain ? `${restExt.subdomain}.krifoo.co.uk` : '';
  const fallbackExtDomain = restCustomDomain || restSubdomain;

  const custName = (order.customerDetails?.name || (order.customerId as any)?.fullName || '').toLowerCase();
  const phone = (order.customerDetails?.phoneNumber || (order.customerId as any)?.phoneNumber || '').replace(/\D/g, '');
  const oType = ((order.orderType || (order as any).deliveryType || '') as string).toLowerCase();

  const appName = ((order as any).appName || '').trim();
  if (appName) {
    return {
      isExternal: true,
      domainUrl: appName,
    };
  }

  // 1. Explicit krifoo marketplace check
  if (
    rawDomain.toLowerCase().includes('krifoo.co.uk') ||
    (!rawDomain && source === 'krifoo')
  ) {
    return {
      isExternal: false,
      domainUrl: 'krifoo.co.uk',
    };
  }

  // 2. Explicit external check
  if (
    source === 'external' ||
    (rawDomain && !rawDomain.toLowerCase().includes('krifoo.co.uk'))
  ) {
    const restName = typeof order.restaurantId === 'object' ? (order.restaurantId as any)?.restaurantName : '';
    let finalDomain = rawDomain;
    if (!finalDomain || finalDomain === 'External Website' || finalDomain === 'External Web') {
      finalDomain = fallbackExtDomain || (restName ? `${restName} App` : 'External Web');
    }
    return {
      isExternal: true,
      domainUrl: finalDomain,
    };
  }

  // 3. Fallback: restaurant has custom domain/website configuration
  if (fallbackExtDomain && source === 'external') {
    return {
      isExternal: true,
      domainUrl: fallbackExtDomain,
    };
  }

  return {
    isExternal: false,
    domainUrl: 'krifoo.co.uk',
  };
}

function getTotalAmount(order: Order) {
  const explicitTotal =
    order.pricing?.totalAmount ??
    order.pricing?.total ??
    order.totalAmount ??
    (order as any).totalPrice ??
    (order as any).grandTotal;
  if (explicitTotal !== undefined && explicitTotal !== null && !isNaN(Number(explicitTotal)) && Number(explicitTotal) > 0) {
    return Number(explicitTotal);
  }
  const items = getOrderItems(order);
  const itemsSum = items.reduce((acc, it) => acc + getItemPrice(it), 0);
  const deliveryFee = Number(order.pricing?.deliveryFee ?? (order as any).deliveryFee ?? 0);
  return itemsSum + deliveryFee;
}

function formatDateTime(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

/** Statuses that are finished — everything else is an order still being worked on. */
const FINAL_STATUSES = ['delivered', 'cancelled'];
const isActiveOrder = (o: Order) => !FINAL_STATUSES.includes(o.status);

/** Human-friendly names for toasts (never show raw ids like "out_for_delivery"). */
const STATUS_LABELS: Record<string, string> = {
  placed: 'New',
  confirmed: 'Confirmed',
  preparing: 'In Kitchen',
  ready_for_pickup: 'Ready for Collection',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Completed',
  cancelled: 'Cancelled',
};
const statusLabel = (s: string) => STATUS_LABELS[s] || s.replace(/_/g, ' ');

/** Local-time YYYY-MM-DD (toISOString would use UTC and pick the wrong day late in the evening). */
const toLocalYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Parses a strict YYYY-MM-DD string as a local date; returns null if it isn't a real calendar date. */
const parseLocalYMD = (s: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
};

function formatPaymentLabel(order: Order) {
  const pType = (order.paymentType || (order as any).paymentMethod || '').toLowerCase();
  const fulfillment = getOrderFulfillmentType(order);
  const isCounter = fulfillment === 'dine_in' || fulfillment === 'pickup' || fulfillment === 'takeaway';

  if (pType === 'cash') {
    return isCounter ? 'Payment : Cash at Counter' : 'Payment : COD';
  }
  if (pType === 'card') {
    return isCounter ? 'Payment : Card at Counter' : 'Payment : Card / Online';
  }
  if (pType === 'stripe' || pType === 'online') {
    return 'Payment : Online (Stripe)';
  }
  if (!pType) {
    return 'Payment : Not Specified';
  }
  return `Payment : ${pType.charAt(0).toUpperCase() + pType.slice(1)}`;
}

export function getOrderStatusColor(status?: string): string {
  const s = (status || '').toLowerCase().trim();
  switch (s) {
    case 'placed':
      return '#F59E0B'; // Amber - New Orders / Awaiting Acceptance
    case 'confirmed':
    case 'preparing':
      return '#3B82F6'; // Kitchen Blue - In Kitchen Cooking
    case 'ready_for_pickup':
      return '#FF5C39'; // Brand Coral - Ready for Pickup / Takeaway
    case 'out_for_delivery':
      return '#8B5CF6'; // Purple - Rider on the Way / Out for Delivery
    case 'delivered':
      return '#10B981'; // Emerald Green - Completed Successfully
    case 'cancelled':
      return '#EF4444'; // Red - Cancelled
    default:
      return '#94A3B8'; // Slate Gray fallback
  }
}


function getOrderFulfillmentType(order: Order): 'delivery' | 'pickup' | 'takeaway' | 'dine_in' {
  const oType = ((order.orderType || (order as any).deliveryType || '') as string).toLowerCase();
  const domain = ((order.sourceDomain || '') as string).toLowerCase();
  const notes = typeof order.notes === 'string' ? order.notes.toLowerCase() : '';
  const addr1 = typeof (order.deliveryAddress as any)?.addressLine1 === 'string' ? (order.deliveryAddress as any).addressLine1.toLowerCase() : '';
  const app = ((order as any).appName || '').toLowerCase();

  if (
    oType === 'dine_in' ||
    oType === 'dinein' ||
    oType === 'eatin' ||
    oType === 'eat_in' ||
    (order as any).tableNumber ||
    notes.includes('eat-in') ||
    notes.includes('dine-in') ||
    notes.includes('dine in') ||
    // Whole-word match only: "vegetable" / "comfortable" must not flag an order as dine-in.
    /\btable\b/.test(notes) ||
    addr1.startsWith('table')
  ) {
    return 'dine_in';
  }

  const custName = (order.customerDetails?.name || (order.customerId as any)?.fullName || '').toLowerCase();
  const phone = (order.customerDetails?.phoneNumber || (order.customerId as any)?.phoneNumber || '').replace(/\D/g, '');

  const isTakeawayApp =
    oType === 'takeaway' ||
    app.includes('takeaway') ||
    notes.includes('takeaway') ||
    custName.includes('takeaway');

  if (oType === 'takeaway' || ((oType === 'pickup' || !oType) && isTakeawayApp)) {
    return 'takeaway';
  }

  if (oType === 'pickup' || oType === 'collection') {
    return 'pickup';
  }
  if (oType === 'delivery') {
    return 'delivery';
  }
  const addr = order.deliveryAddress;
  if (!addr) return isTakeawayApp ? 'takeaway' : 'pickup';
  if (typeof addr === 'string') return addr.trim() ? 'delivery' : (isTakeawayApp ? 'takeaway' : 'pickup');
  const hasAddrField = Boolean(
    addr.formattedAddress ||
    addr.addressLine1 ||
    (addr as any).fullAddress ||
    (addr as any).address ||
    addr.street ||
    addr.area ||
    addr.city ||
    addr.postalCode ||
    addr.postcode
  );
  if (hasAddrField) {
    const text = (addr.formattedAddress || addr.addressLine1 || (addr as any).fullAddress || '').toLowerCase();
    if (text.includes('pickup') || text.includes('collection')) return 'pickup';
    if (text.includes('takeaway')) return 'takeaway';
    if (/\b(dine|dine-in|table)\b/.test(text)) return 'dine_in';
    return 'delivery';
  }
  return isTakeawayApp ? 'takeaway' : 'pickup';
}

function isOrderPickup(order: Order): boolean {
  const f = getOrderFulfillmentType(order);
  return f === 'pickup' || f === 'takeaway';
}

function getDeliveryAddressText(order: Order): string {
  const addr: any = order.deliveryAddress;
  if (!addr) {
    const custAddr: any = order.customerDetails?.address;
    if (typeof custAddr === 'string' && custAddr.trim()) {
      return custAddr.trim();
    }
    return '';
  }
  if (typeof addr === 'string') return addr.trim();

  if (addr.formattedAddress && typeof addr.formattedAddress === 'string' && addr.formattedAddress.trim()) {
    return addr.formattedAddress.trim();
  }

  const parts = [
    addr.houseNumber || addr.flatNumber || addr.doorNo,
    addr.addressLine1,
    addr.addressLine2,
    addr.street,
    addr.landmark,
    addr.area,
    addr.city,
    addr.postalCode || addr.postcode || addr.zipCode,
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(', ');
  }

  return addr.fullAddress || addr.address || '';
}

export const OrderCardSkeletonItem: React.FC = () => {
  const { width: cardScreenWidth } = useWindowDimensions();
  const isTablet = cardScreenWidth >= TABLET_BREAKPOINT;

  return (
    <View style={[styles.kanbanCard, isTablet && styles.kanbanCardTablet, { opacity: 0.95 }]}>
      {/* Top Status Accent Strip Placeholder */}
      <View
        style={[
          styles.cardTopStatusStrip,
          isTablet && styles.cardTopStatusStripTablet,
          { backgroundColor: '#E2E8F0' },
        ]}
      />

      {/* Top Header: Order ID & Amount */}
      <View style={styles.kanbanCardTop}>
        <View style={styles.kanbanOrderIdCol}>
          <View style={styles.kanbanOrderIdRow}>
            <Skeleton width={80} height={18} borderRadius={4} />
            <Skeleton width={42} height={16} borderRadius={4} />
          </View>
          <Skeleton width={110} height={12} borderRadius={3} style={{ marginTop: 6 }} />
        </View>
        <View style={styles.kanbanAmountRow}>
          <Skeleton width={64} height={20} borderRadius={4} />
          <Skeleton width={80} height={11} borderRadius={3} style={{ marginTop: 4 }} />
        </View>
      </View>

      {/* Restaurant Title & Items */}
      <View style={[styles.kanbanRestaurantRow, { marginTop: 8 }]}>
        <Skeleton width="45%" height={14} borderRadius={3} />
        <Skeleton width={44} height={12} borderRadius={3} />
      </View>

      {/* Channel Source Badge */}
      <View style={{ marginTop: 6 }}>
        <Skeleton width={110} height={18} borderRadius={6} />
      </View>

      <View style={styles.kanbanDivider} />

      {/* Customer Row */}
      <View style={[styles.kanbanCustomerRow, isTablet && styles.kanbanCustomerRowTablet]}>
        <Skeleton width={28} height={28} borderRadius={14} />
        <View style={{ flex: 1, gap: 4 }}>
          <Skeleton width="45%" height={13} borderRadius={3} />
          <Skeleton width="30%" height={10} borderRadius={3} />
        </View>
      </View>

      {/* Address Block */}
      <View style={[styles.kanbanAddressRow, isTablet && styles.kanbanAddressRowTablet]}>
        <Skeleton width={14} height={14} borderRadius={7} style={{ marginTop: 2 }} />
        <View style={{ flex: 1, gap: 4 }}>
          <Skeleton width="30%" height={10} borderRadius={2} />
          <Skeleton width="85%" height={12} borderRadius={3} />
        </View>
      </View>

      {/* Type Tag & Rider */}
      <View style={[styles.kanbanTypeRow, isTablet && styles.kanbanTypeRowTablet]}>
        <Skeleton width={100} height={24} borderRadius={8} />
      </View>

      {/* Footer & Buttons */}
      <View style={styles.kanbanFooter}>
        <Skeleton width={85} height={12} borderRadius={3} />
        <Skeleton width={70} height={18} borderRadius={4} />
      </View>

      {/* Action Buttons */}
      <View style={[styles.actionButtonsRow, isTablet && styles.actionButtonsRowTablet, { marginTop: 10 }]}>
        <Skeleton width="75%" height={34} borderRadius={8} />
        <Skeleton width={38} height={34} borderRadius={8} />
      </View>
    </View>
  );
};

interface OrderCardProps {
  order: Order;
  onPress: (o: Order) => void;
  onAssignDelivery: (o: Order) => void;
  onUpdateStatus: (orderId: string, newStatus: string) => void;
  onPrint: (o: Order) => void;
  paperRollSize?: string;
  compact?: boolean;
  onEditDeliveryTime?: (o: Order) => void;
  /** True while a status change / rider assignment for this order is being sent. */
  isUpdating?: boolean;
}

const OrderCardItem: React.FC<OrderCardProps> = ({
  order,
  onPress,
  onAssignDelivery,
  onUpdateStatus,
  onPrint,
  paperRollSize = '58',
  compact = false,
  onEditDeliveryTime,
  isUpdating = false,
}) => {
  const { width: cardScreenWidth } = useWindowDimensions();
  const isTablet = cardScreenWidth >= TABLET_BREAKPOINT && !compact;
  const [expanded, setExpanded] = useState(false);
  const customerName = getCustomerName(order);
  const customerPhone = getCustomerPhone(order);
  const restaurantName = getRestaurantName(order);
  const totalAmount = getTotalAmount(order);
  const pStatus = (order.paymentStatus || 'pending').toLowerCase();
  const isPaid = pStatus === 'paid' || pStatus === 'completed';
  const isFailed = pStatus === 'failed';
  const isRefunded = pStatus === 'refunded';
  const paymentLabel = formatPaymentLabel(order);
  const orderItems = getOrderItems(order);
  const itemCount = orderItems.length;
  const orderNum = order.orderNumber || order._id?.substring(0, 7).toUpperCase();
  const fulfillmentType = getOrderFulfillmentType(order);
  const isPickup = fulfillmentType === 'pickup' || fulfillmentType === 'takeaway';
  const deliveryAddressText = getDeliveryAddressText(order);
  const deliveryPartnerName = typeof order.assignedDeliveryPartnerId === 'object' ? order.assignedDeliveryPartnerId?.fullName : undefined;
  const sourceDetails = getOrderSourceDetails(order);
  const scheduleInfo = getOrderScheduleInfo(order);

  const renderCardActions = () => {
    // 1. Delivered / Completed & Cancelled Orders
    if (order.status === 'delivered' || order.status === 'cancelled') {
      return (
        <View style={[styles.actionButtonsRow, isTablet && styles.actionButtonsRowTablet]}>
          <TouchableOpacity
            style={[styles.printFullBtn, isTablet && styles.printFullBtnTablet]}
            onPress={(e: any) => {
              e.stopPropagation?.();
              onPrint(order);
            }}
            activeOpacity={0.8}
          >
            <Printer size={isTablet ? 15 : 13} color="#11181C" />
            <Text style={[styles.printFullBtnText, isTablet && styles.printFullBtnTextTablet]}>
              Print Receipt({paperRollSize || '58'}mm)
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    // 2. Placed (New Orders)
    if (order.status === 'placed') {
      return (
        <View style={[styles.actionButtonsRow, isTablet && styles.actionButtonsRowTablet]}>
          <TouchableOpacity
            style={[styles.acceptBtn, isTablet && styles.acceptBtnTablet]}
            onPress={(e: any) => {
              e.stopPropagation?.();
              onUpdateStatus(order._id, 'preparing');
            }}
            activeOpacity={0.8}
          >
            <Check size={isTablet ? 15 : compact ? 12 : 13} color="#FFFFFF" />
            <Text style={[styles.acceptBtnText, isTablet && styles.acceptBtnTextTablet, compact && { fontSize: 12 }]}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Print receipt"
            style={[styles.printIconBtn, isTablet && styles.printIconBtnTablet, compact && { width: 40, height: 40 }]}
            onPress={(e: any) => {
              e.stopPropagation?.();
              onPrint(order);
            }}
            activeOpacity={0.8}
          >
            <Printer size={compact ? 14 : 16} color="#11181C" />
          </TouchableOpacity>
        </View>
      );
    }

    // 3. In Kitchen / Preparing / Confirmed
    if (order.status === 'confirmed' || order.status === 'preparing') {
      if (fulfillmentType === 'dine_in') {
        // Eat-In (Dine-In) Order in Kitchen: "Ready to Serve" button -> marks served/delivered
        return (
          <View style={[styles.actionButtonsRow, isTablet && styles.actionButtonsRowTablet, compact && { gap: 6, marginTop: 8 }]}>
            <TouchableOpacity
              style={[styles.acceptBtn, isTablet && styles.acceptBtnTablet, { backgroundColor: '#7C3AED' }, compact && { paddingVertical: 10, paddingHorizontal: 8 }]}
              onPress={(e: any) => {
                e.stopPropagation?.();
                onUpdateStatus(order._id, 'delivered');
              }}
              activeOpacity={0.8}
            >
              <UtensilsCrossed size={isTablet ? 15 : compact ? 12 : 13} color="#FFFFFF" />
              <Text style={[styles.acceptBtnText, isTablet && styles.acceptBtnTextTablet, compact && { fontSize: 12 }]} numberOfLines={1}>Prepared</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Print receipt"
              style={[styles.printIconBtn, isTablet && styles.printIconBtnTablet, compact && { width: 40, height: 40 }]}
              onPress={(e: any) => {
                e.stopPropagation?.();
                onPrint(order);
              }}
              activeOpacity={0.8}
            >
              <Printer size={compact ? 14 : 16} color="#11181C" />
            </TouchableOpacity>
          </View>
        );
      } else if (isPickup) {
        // Self Pickup in Kitchen: Show "Ready" (Ready for Pickup) -> moves to Self Pickup tab
        return (
          <View style={[styles.actionButtonsRow, isTablet && styles.actionButtonsRowTablet, compact && { gap: 6, marginTop: 8 }]}>
            <TouchableOpacity
              style={[styles.acceptBtn, isTablet && styles.acceptBtnTablet, { backgroundColor: '#FF5C39' }, compact && { paddingVertical: 10, paddingHorizontal: 8 }]}
              onPress={(e: any) => {
                e.stopPropagation?.();
                onUpdateStatus(order._id, 'ready_for_pickup');
              }}
              activeOpacity={0.8}
            >
              <Check size={isTablet ? 15 : compact ? 12 : 13} color="#FFFFFF" />
              <Text style={[styles.acceptBtnText, isTablet && styles.acceptBtnTextTablet, compact && { fontSize: 12 }]} numberOfLines={1}>
                {fulfillmentType === 'takeaway' ? (compact ? 'Ready (Takeaway)' : 'Ready for Takeaway') : (compact ? 'Ready (Pickup)' : 'Ready for Pickup')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Print receipt"
              style={[styles.printIconBtn, isTablet && styles.printIconBtnTablet, compact && { width: 40, height: 40 }]}
              onPress={(e: any) => {
                e.stopPropagation?.();
                onPrint(order);
              }}
              activeOpacity={0.8}
            >
              <Printer size={compact ? 14 : 16} color="#11181C" />
            </TouchableOpacity>
          </View>
        );
      } else {
        // Delivery order in kitchen: Button to assign Rider + Out for Delivery button
        if (compact) {
          return (
            <View style={[styles.actionButtonsRow, { flexDirection: 'column', gap: 6, marginTop: 8 }]}>
              <View style={{ flexDirection: 'row', gap: 6, width: '100%' }}>
                <TouchableOpacity
                  style={[styles.assignDriverIconBtn, { flex: 1, paddingVertical: 10, paddingHorizontal: 8 }]}
                  onPress={(e: any) => {
                    e.stopPropagation?.();
                    onAssignDelivery(order);
                  }}
                  activeOpacity={0.8}
                >
                  <Bike size={12} color="#FFFFFF" />
                  <Text style={[styles.assignDriverText, { fontSize: 12 }]} numberOfLines={1}>
                    {deliveryPartnerName ? `Rider: ${deliveryPartnerName}` : 'Assign Rider'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Print receipt"
                  style={[styles.printIconBtn, { width: 40, height: 40 }]}
                  onPress={(e: any) => {
                    e.stopPropagation?.();
                    onPrint(order);
                  }}
                  activeOpacity={0.8}
                >
                  <Printer size={14} color="#11181C" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.outForDeliveryBtn, { width: '100%', paddingVertical: 10, paddingHorizontal: 8 }]}
                onPress={(e: any) => {
                  e.stopPropagation?.();
                  onUpdateStatus(order._id, 'out_for_delivery');
                }}
                activeOpacity={0.8}
              >
                <Truck size={13} color="#FFFFFF" />
                <Text style={[styles.outForDeliveryBtnText, { fontSize: 12 }]} numberOfLines={1}>
                  Out for Delivery
                </Text>
              </TouchableOpacity>
            </View>
          );
        }

        return (
          <View style={[styles.actionButtonsRow, isTablet && styles.actionButtonsRowTablet]}>
            <TouchableOpacity
              style={[styles.assignDriverIconBtn, isTablet && styles.assignDriverIconBtnTablet]}
              onPress={(e: any) => {
                e.stopPropagation?.();
                onAssignDelivery(order);
              }}
              activeOpacity={0.8}
            >
              <Bike size={isTablet ? 15 : 13} color="#FFFFFF" />
              <Text style={[styles.assignDriverText, isTablet && styles.assignDriverTextTablet]}>
                {deliveryPartnerName ? `Rider: ${deliveryPartnerName}` : 'Assign Rider'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.outForDeliveryBtn, isTablet && styles.outForDeliveryBtnTablet]}
              onPress={(e: any) => {
                e.stopPropagation?.();
                onUpdateStatus(order._id, 'out_for_delivery');
              }}
              activeOpacity={0.8}
            >
              <Truck size={15} color="#FFFFFF" />
              <Text style={[styles.outForDeliveryBtnText, isTablet && styles.outForDeliveryBtnTextTablet]}>Out for Delivery</Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Print receipt"
              style={[styles.printIconBtn, isTablet && styles.printIconBtnTablet]}
              onPress={(e: any) => {
                e.stopPropagation?.();
                onPrint(order);
              }}
              activeOpacity={0.8}
            >
              <Printer size={16} color="#11181C" />
            </TouchableOpacity>
          </View>
        );
      }
    }

    // 4. Self Pickup Orders in Ready State (Waiting in Self Pickup Tab for Customer Collection)
    if (isPickup && order.status === 'ready_for_pickup') {
      return (
        <View style={[styles.actionButtonsRow, isTablet && styles.actionButtonsRowTablet, compact && { gap: 6, marginTop: 8 }]}>
          <TouchableOpacity
            style={[styles.acceptBtn, isTablet && styles.acceptBtnTablet, { backgroundColor: '#10B981' }, compact && { paddingVertical: 10, paddingHorizontal: 8 }]}
            onPress={(e: any) => {
              e.stopPropagation?.();
              onUpdateStatus(order._id, 'delivered');
            }}
            activeOpacity={0.8}
          >
            <Check size={isTablet ? 15 : compact ? 12 : 13} color="#FFFFFF" />
            <Text style={[styles.acceptBtnText, isTablet && styles.acceptBtnTextTablet, compact && { fontSize: 12 }]} numberOfLines={1}>
              {fulfillmentType === 'takeaway' ? (compact ? 'Collected' : 'Mark Collected (Takeaway)') : (compact ? 'Collected' : 'Delivered')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Print receipt"
            style={[styles.printIconBtn, isTablet && styles.printIconBtnTablet, compact && { width: 40, height: 40 }]}
            onPress={(e: any) => {
              e.stopPropagation?.();
              onPrint(order);
            }}
            activeOpacity={0.8}
          >
            <Printer size={compact ? 14 : 16} color="#11181C" />
          </TouchableOpacity>
        </View>
      );
    }

    // 5. Out for Delivery
    if (order.status === 'out_for_delivery') {
      if (compact) {
        return (
          <View style={[styles.actionButtonsRow, { flexDirection: 'column', gap: 6, marginTop: 8 }]}>
            <View style={{ flexDirection: 'row', gap: 6, width: '100%' }}>
              <TouchableOpacity
                style={[styles.acceptBtn, { flex: 1, paddingVertical: 10, paddingHorizontal: 8 }]}
                onPress={(e: any) => {
                  e.stopPropagation?.();
                  onUpdateStatus(order._id, 'delivered');
                }}
                activeOpacity={0.8}
              >
                <Check size={12} color="#FFFFFF" />
                <Text style={[styles.acceptBtnText, { fontSize: 12 }]} numberOfLines={1}>Delivered</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Print receipt"
                style={[styles.printIconBtn, { width: 40, height: 40 }]}
                onPress={(e: any) => {
                  e.stopPropagation?.();
                  onPrint(order);
                }}
                activeOpacity={0.8}
              >
                <Printer size={14} color="#11181C" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.assignDriverIconBtn, { width: '100%', paddingVertical: 10, paddingHorizontal: 8 }]}
              onPress={(e: any) => {
                e.stopPropagation?.();
                onAssignDelivery(order);
              }}
              activeOpacity={0.8}
            >
              <Bike size={12} color="#FFFFFF" />
              <Text style={[styles.assignDriverText, { fontSize: 12 }]} numberOfLines={1}>
                {deliveryPartnerName ? `Rider: ${deliveryPartnerName}` : 'Assign Rider'}
              </Text>
            </TouchableOpacity>
          </View>
        );
      }
      return (
        <View style={[styles.actionButtonsRow, isTablet && styles.actionButtonsRowTablet]}>
          <TouchableOpacity
            style={[styles.acceptBtn, isTablet && styles.acceptBtnTablet]}
            onPress={(e: any) => {
              e.stopPropagation?.();
              onUpdateStatus(order._id, 'delivered');
            }}
            activeOpacity={0.8}
          >
            <Check size={isTablet ? 15 : 13} color="#FFFFFF" />
            <Text style={[styles.acceptBtnText, isTablet && styles.acceptBtnTextTablet]}>Delivered</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.assignDriverIconBtn, isTablet && styles.assignDriverIconBtnTablet]}
            onPress={(e: any) => {
              e.stopPropagation?.();
              onAssignDelivery(order);
            }}
            activeOpacity={0.8}
          >
            <Bike size={isTablet ? 15 : 13} color="#FFFFFF" />
            <Text style={[styles.assignDriverText, isTablet && styles.assignDriverTextTablet]}>
              {deliveryPartnerName ? `Rider: ${deliveryPartnerName}` : 'Assign Rider'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Print receipt"
            style={[styles.printIconBtn, isTablet && styles.printIconBtnTablet]}
            onPress={(e: any) => {
              e.stopPropagation?.();
              onPrint(order);
            }}
            activeOpacity={0.8}
          >
            <Printer size={16} color="#11181C" />
          </TouchableOpacity>
        </View>
      );
    }

    // 6. Any other active Self Pickup order
    if (isPickup) {
      return (
        <View style={[styles.actionButtonsRow, isTablet && styles.actionButtonsRowTablet, compact && { gap: 6, marginTop: 8 }]}>
          <TouchableOpacity
            style={[styles.acceptBtn, isTablet && styles.acceptBtnTablet, { backgroundColor: '#10B981' }, compact && { paddingVertical: 10, paddingHorizontal: 8 }]}
            onPress={(e: any) => {
              e.stopPropagation?.();
              onUpdateStatus(order._id, 'delivered');
            }}
            activeOpacity={0.8}
          >
            <Check size={isTablet ? 15 : compact ? 12 : 13} color="#FFFFFF" />
            <Text style={[styles.acceptBtnText, isTablet && styles.acceptBtnTextTablet, compact && { fontSize: 12 }]}>Delivered</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Print receipt"
            style={[styles.printIconBtn, isTablet && styles.printIconBtnTablet, compact && { width: 40, height: 40 }]}
            onPress={(e: any) => {
              e.stopPropagation?.();
              onPrint(order);
            }}
            activeOpacity={0.8}
          >
            <Printer size={compact ? 14 : 16} color="#11181C" />
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={[styles.actionButtonsRow, isTablet && styles.actionButtonsRowTablet]}>
        <TouchableOpacity
          style={[styles.printFullBtn, isTablet && styles.printFullBtnTablet]}
          onPress={(e: any) => {
            e.stopPropagation?.();
            onPrint(order);
          }}
          activeOpacity={0.8}
        >
          <Printer size={isTablet ? 15 : 13} color="#11181C" />
          <Text style={[styles.printFullBtnText, isTablet && styles.printFullBtnTextTablet]}>
            Print Receipt({paperRollSize || '58'}mm)
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const statusColor = getOrderStatusColor(order.status);

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => onPress(order)}
      style={[
        styles.kanbanCard,
        isTablet && styles.kanbanCardTablet,
        compact && styles.kanbanCardCompact,
      ]}
    >
      {/* Top Status Accent Strip */}
      <View
        style={[
          styles.cardTopStatusStrip,
          isTablet && styles.cardTopStatusStripTablet,
          { backgroundColor: statusColor },
        ]}
      />

      {/* Watermark Stamp Overlay for Completed (Success) & Cancelled Orders */}
      {order.status === 'delivered' && (
        <View style={styles.stampOverlay} pointerEvents="none">
          <View style={[styles.stampBox, styles.stampSuccess]}>
            <CheckCircle2 size={isTablet ? 15 : 13} color="#10B981" style={{ marginRight: 3 }} />
            <Text style={[styles.stampText, styles.stampSuccessText, isTablet && { fontSize: 16 }]}>SUCCESS</Text>
          </View>
        </View>
      )}

      {order.status === 'cancelled' && (
        <View style={styles.stampOverlay} pointerEvents="none">
          <View style={[styles.stampBox, styles.stampCancelled]}>
            <X size={isTablet ? 15 : 13} color="#EF4444" style={{ marginRight: 3 }} />
            <Text style={[styles.stampText, styles.stampCancelledText, isTablet && { fontSize: 16 }]}>CANCELLED</Text>
          </View>
        </View>
      )}

      <View style={styles.kanbanCardTop}>
        <View style={[styles.kanbanOrderIdCol, compact && { flex: 1, minWidth: 0, marginRight: 6 }]}>
          <View style={styles.kanbanOrderIdRow}>
            <Text style={[styles.kanbanOrderId, isTablet && styles.kanbanOrderIdTablet, compact && { fontSize: 12 }]} numberOfLines={1}>#{orderNum}</Text>
            {isPaid ? (
              <View style={[styles.paidBadge, compact && { paddingHorizontal: 4, paddingVertical: 1 }]}>
                <Text style={[styles.paidBadgeText, isTablet && { fontSize: 10 }, compact && { fontSize: 8 }]}>PAID</Text>
              </View>
            ) : isFailed ? (
              <View style={[styles.failedBadge, compact && { paddingHorizontal: 4, paddingVertical: 1 }]}>
                <Text style={[styles.failedBadgeText, isTablet && { fontSize: 10 }, compact && { fontSize: 8 }]}>FAILED</Text>
              </View>
            ) : isRefunded ? (
              <View style={[styles.refundedBadge, compact && { paddingHorizontal: 4, paddingVertical: 1 }]}>
                <Text style={[styles.refundedBadgeText, isTablet && { fontSize: 10 }, compact && { fontSize: 8 }]}>REFUNDED</Text>
              </View>
            ) : (
              <View style={[styles.pendingBadge, compact && { paddingHorizontal: 4, paddingVertical: 1 }]}>
                <Text style={[styles.pendingBadgeText, isTablet && { fontSize: 10 }, compact && { fontSize: 8 }]}>UNPAID</Text>
              </View>
            )}
          </View>
          <Text style={[styles.kanbanPaymentBelowId, isTablet && styles.kanbanPaymentBelowIdTablet, compact && { fontSize: 10 }]} numberOfLines={1}>{paymentLabel}</Text>
        </View>

        <View style={[styles.kanbanAmountRow, compact && { flexShrink: 0, alignItems: 'flex-end' }]}>
          <Text style={[styles.kanbanAmount, isTablet && styles.kanbanAmountTablet, compact && { fontSize: 13 }]}>£{(totalAmount || 0).toFixed(2)}</Text>
          <View style={[styles.kanbanDateRow, { marginTop: 2 }]}>
            <Clock size={isTablet ? 11 : compact ? 9 : 10} color="#9BA1A6" />
            <Text style={[styles.kanbanDate, isTablet && { fontSize: 11 }, compact && { fontSize: 9.5 }]}>{formatDateTime(order.createdAt)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.kanbanRestaurantRow}>
        <Text style={[styles.kanbanRestaurant, isTablet && styles.kanbanRestaurantTablet, compact && { fontSize: 12 }, { flex: 1, marginRight: 8 }]} numberOfLines={1}>{restaurantName}</Text>
        <Text style={[styles.kanbanItemCount, isTablet && styles.kanbanItemCountTablet, compact && { fontSize: 9.5 }, { flexShrink: 0 }]}>{itemCount} {itemCount === 1 ? 'item' : 'items'}</Text>
      </View>

      <View style={[styles.sourceBadgeContainer, isTablet && styles.sourceBadgeContainerTablet]}>
        <View style={[sourceDetails.isExternal ? styles.sourceBadgeExternal : styles.sourceBadgeKrifoo, isTablet && (sourceDetails.isExternal ? styles.sourceBadgeExternalTablet : styles.sourceBadgeKrifooTablet), compact && { paddingHorizontal: 6, paddingVertical: 2.5, maxWidth: '100%' }]}>
          {(() => {
            const SourceIcon = !sourceDetails.isExternal
              ? Smartphone
              : sourceDetails.domainUrl.includes('Takeaway')
              ? ShoppingBag
              : Globe;
            return (
              <SourceIcon
                size={isTablet ? 13 : 12}
                color={sourceDetails.isExternal ? '#B45309' : '#2563EB'}
                style={{ marginRight: 5 }}
              />
            );
          })()}
          <Text
            style={[sourceDetails.isExternal ? styles.sourceBadgeTextExternal : styles.sourceBadgeTextKrifoo, isTablet && (sourceDetails.isExternal ? styles.sourceBadgeTextExternalTablet : styles.sourceBadgeTextKrifooTablet), compact && { fontSize: 11 }, { flexShrink: 1 }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {sourceDetails.isExternal ? sourceDetails.domainUrl : 'Krifoo App'}
          </Text>
        </View>
      </View>

      <View style={[styles.kanbanDivider, compact && { marginVertical: 6 }]} />

      <View style={[styles.kanbanCustomerRow, isTablet && styles.kanbanCustomerRowTablet, compact && { minWidth: 0, gap: 6, marginBottom: 4 }]}>
        <View style={[styles.kanbanAvatar, isTablet && styles.kanbanAvatarTablet, compact && { width: 22, height: 22, borderRadius: 11 }]}>
          <Text style={[styles.kanbanAvatarText, isTablet && styles.kanbanAvatarTextTablet, compact && { fontSize: 10 }]}>{customerName.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.kanbanCustomerName, isTablet && styles.kanbanCustomerNameTablet, compact && { fontSize: 11.5, lineHeight: 15 }]} numberOfLines={1}>{customerName}</Text>
          {customerPhone ? <Text style={[styles.kanbanCustomerPhone, isTablet && styles.kanbanCustomerPhoneTablet, compact && { fontSize: 10 }]} numberOfLines={1}>{customerPhone}</Text> : null}
        </View>
      </View>

      {fulfillmentType === 'delivery' && deliveryAddressText ? (
        <View style={[styles.kanbanAddressRow, isTablet && styles.kanbanAddressRowTablet, compact && { paddingHorizontal: 8, paddingVertical: 6, marginBottom: 6, gap: 6, minWidth: 0 }]}>
          <MapPin size={isTablet ? 15 : compact ? 11 : 13} color="#2563EB" style={[styles.addressPinIcon, compact && { marginTop: 1 }]} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.kanbanAddressHeader, isTablet && styles.kanbanAddressHeaderTablet, compact && { fontSize: 9, marginBottom: 0 }]}>DELIVERY ADDRESS:</Text>
            <Text style={[styles.kanbanAddressText, isTablet && styles.kanbanAddressTextTablet, compact && { fontSize: 10, lineHeight: 13 }]} numberOfLines={2}>
              {deliveryAddressText}
            </Text>
          </View>
        </View>
      ) : null}

      {isActiveOrder(order) && (
      <View style={[styles.expectedDeliveryRow, isTablet && styles.expectedDeliveryRowTablet, compact && { marginBottom: 4 }]}>
        <View style={[styles.expectedDeliveryBadge, isTablet && styles.expectedDeliveryBadgeTablet, compact && { paddingHorizontal: 6, paddingVertical: 2.5 }]}>
          <Clock size={isTablet ? 12 : compact ? 10 : 11} color="#1D4ED8" />
          <Text style={[styles.expectedDeliveryBadgeText, isTablet && { fontSize: 11 }, compact && { fontSize: 9.5 }]}>
            Expected: {order.expectedDeliveryTime || order.deliveryTime || 30} mins
          </Text>
        </View>
        {onEditDeliveryTime ? (
          <TouchableOpacity
            style={[styles.editDeliveryTimeBtn, isTablet && styles.editDeliveryTimeBtnTablet, compact && { paddingHorizontal: 6, paddingVertical: 2.5 }]}
            onPress={(e: any) => {
              e.stopPropagation?.();
              onEditDeliveryTime(order);
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Edit expected time"
          >
            <Text style={[styles.editDeliveryTimeBtnText, isTablet && { fontSize: 10.5 }, compact && { fontSize: 9 }]}>
              Edit
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      )}

      <View style={[styles.kanbanTypeRow, isTablet && styles.kanbanTypeRowTablet, compact && { gap: 4, marginBottom: 5 }]}>
        {scheduleInfo.isScheduled && (
          <View style={[styles.scheduledTag, isTablet && { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }, compact && { paddingHorizontal: 5, paddingVertical: 2.5, borderRadius: 6, maxWidth: '100%' }]}>
            <Clock size={isTablet ? 13 : compact ? 10 : 11} color="#92400E" />
            <Text style={[styles.scheduledTagText, isTablet && { fontSize: 11 }, compact && { fontSize: 9.5 }]} numberOfLines={1} ellipsizeMode="tail">
              Scheduled: {scheduleInfo.scheduleTimeText}
            </Text>
          </View>
        )}
        {fulfillmentType === 'delivery' ? (
          <View style={[styles.deliveryTag, isTablet && { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }, compact && { paddingHorizontal: 5, paddingVertical: 2.5, borderRadius: 6 }]}>
            <Bike size={isTablet ? 14 : compact ? 11 : 12} color="#2563EB" />
            <Text style={[styles.deliveryTagText, isTablet && { fontSize: 12 }, compact && { fontSize: 10 }]}>Delivery Order</Text>
          </View>
        ) : fulfillmentType === 'dine_in' ? (
          <View style={[styles.dineInTag, isTablet && { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }, compact && { paddingHorizontal: 5, paddingVertical: 2.5, borderRadius: 6, maxWidth: '100%' }]}>
            <UtensilsCrossed size={isTablet ? 14 : compact ? 11 : 12} color="#7C3AED" />
            <Text style={[styles.dineInTagText, isTablet && { fontSize: 12 }, compact && { fontSize: 10 }]} numberOfLines={1} ellipsizeMode="tail">
                Dine In {
                (order as any).tableNumber
                  ? `• T${(order as any).tableNumber}`
                  : (order.deliveryAddress as any)?.addressLine1?.toLowerCase().startsWith('table')
                  ? `• ${(order.deliveryAddress as any).addressLine1}`
                  : typeof order.notes === 'string' && order.notes.includes('Table')
                  ? `• ${order.notes}`
                  : ''
              }
            </Text>
          </View>
        ) : fulfillmentType === 'takeaway' ? (
          <View style={[styles.takeawayTag, isTablet && { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }, compact && { paddingHorizontal: 5, paddingVertical: 2.5, borderRadius: 6 }]}>
            <ShoppingBag size={isTablet ? 14 : compact ? 11 : 12} color="#D97706" />
            <Text style={[styles.takeawayTagText, isTablet && { fontSize: 12 }, compact && { fontSize: 10 }]} numberOfLines={1} ellipsizeMode="tail">
              {order.status === 'delivered'
                ? 'Takeaway (Collected)'
                : order.status === 'ready_for_pickup'
                ? 'Takeaway (Ready)'
                : order.status === 'preparing' || order.status === 'confirmed'
                ? 'Takeaway (Kitchen)'
                : 'Takeaway Order'}
            </Text>
          </View>
        ) : (
          <View style={[styles.pickupTag, isTablet && { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }, compact && { paddingHorizontal: 5, paddingVertical: 2.5, borderRadius: 6 }]}>
            <ShoppingBag size={isTablet ? 14 : compact ? 11 : 12} color="#EA580C" />
            <Text style={[styles.pickupTagText, isTablet && { fontSize: 12 }, compact && { fontSize: 10 }]} numberOfLines={1} ellipsizeMode="tail">
              {order.status === 'delivered'
                ? 'Pickup (Picked Up)'
                : order.status === 'ready_for_pickup'
                ? 'Pickup (Ready)'
                : order.status === 'preparing' || order.status === 'confirmed'
                ? 'Pickup (Kitchen)'
                : 'Self Pickup'}
            </Text>
          </View>
        )}
        {deliveryPartnerName && (
          <View style={[styles.riderBadge, isTablet && { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }, compact && { paddingHorizontal: 5, paddingVertical: 2.5, borderRadius: 6 }]}>
            <Bike size={isTablet ? 13 : compact ? 10 : 11} color="#6B7280" />
            <Text style={[styles.riderText, isTablet && { fontSize: 11 }, compact && { fontSize: 9.5 }]} numberOfLines={1}>{deliveryPartnerName}</Text>
          </View>
        )}
      </View>



      <TouchableOpacity style={[styles.viewItemsBtn, isTablet && { marginTop: 12, paddingTop: 10 }, compact && { marginTop: 6, paddingTop: 6 }]} onPress={() => setExpanded(!expanded)} activeOpacity={0.7}>
        <Text style={[styles.viewItemsBtnText, isTablet && { fontSize: 11 }, compact && { fontSize: 9.5 }]}>VIEW ITEMS & NOTES ({itemCount})</Text>
        {expanded ? <ChevronUp size={isTablet ? 15 : compact ? 11 : 13} color="#9BA1A6" /> : <ChevronDown size={isTablet ? 15 : compact ? 11 : 13} color="#9BA1A6" />}
      </TouchableOpacity>

      {expanded && (
        <View style={styles.itemsList}>
          {orderItems.map((item: any, idx: number) => {
            const itemName = getItemName(item);
            const itemQty = Number(item.quantity || item.qty || 1);
            const itemTotalPrice = getItemPrice(item);
            return (
              <View key={idx} style={styles.itemRow}>
                <Text style={[styles.itemQty, isTablet && { fontSize: 12.5 }]}>{itemQty}x</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemName, isTablet && { fontSize: 12.5 }]} numberOfLines={1}>{itemName}</Text>
                  {getItemOptionsList(item).map((opt: string, oIdx: number) => (
                    <Text key={oIdx} style={[styles.itemMeta, isTablet && { fontSize: 11 }]}>+ {opt}</Text>
                  ))}
                  {item.instructions ? (
                    <Text style={[styles.itemMeta, isTablet && { fontSize: 11 }, { fontStyle: 'italic' }]}>Note: {item.instructions}</Text>
                  ) : null}
                </View>
                <Text style={[styles.itemPrice, isTablet && { fontSize: 12.5 }]}>£{itemTotalPrice.toFixed(2)}</Text>
              </View>
            );
          })}
          {(() => {
            const cleanNote = getSanitizedOrderNotes(order.notes);
            return cleanNote ? (
              <View style={styles.noteRow}>
                <Text style={[styles.noteLabel, isTablet && { fontSize: 12 }]}>Note: </Text>
                <Text style={[styles.noteText, isTablet && { fontSize: 12 }]}>{cleanNote}</Text>
              </View>
            ) : null;
          })()}
        </View>
      )}

      {/* While a change is being sent, block further taps on the action buttons. */}
      <View pointerEvents={isUpdating ? 'none' : 'auto'} accessibilityState={{ busy: isUpdating }}>
        <View style={isUpdating ? styles.actionsUpdating : undefined}>{renderCardActions()}</View>
        {isUpdating && (
          <View style={styles.updatingOverlay}>
            <ActivityIndicator size="small" color="#FF5C39" />
            <Text style={styles.updatingText}>Updating…</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

export default function OrdersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isTablet = windowWidth >= TABLET_BREAKPOINT;
  const isMobile = windowWidth < TABLET_BREAKPOINT;
  // Tabs-view grid: 1 column on phones, 2 on tablets, 3 on wide landscape tablets.
  const tabColumns = windowWidth >= 1200 ? 3 : isTablet ? 2 : 1;

  const [headerHeight, setHeaderHeight] = useState(65);
  const [searchHeight, setSearchHeight] = useState(54);
  const toolbarHeight = isTablet ? 42 : 46;
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);

  const routeParams = useLocalSearchParams<{ channel?: string }>();

  // Board view layout customization:
  // Users can customize how many status tabs / columns fit per screen (e.g. 1, 2, 3, 4, 5, 6, or 'auto').
  const [boardColumnsSetting, setBoardColumnsSetting] = useState<BoardColumnsOption>('auto');
  const [boardColumnsModalOpen, setBoardColumnsModalOpen] = useState(false);

  // Auto-calculated columns based on screen width
  const autoColumns = useMemo(() => {
    if (windowWidth >= 1350) return 4;
    if (windowWidth >= 960) return 3;
    if (windowWidth >= 680) return 2;
    return 1;
  }, [windowWidth]);

  const effectiveColumns = useMemo(() => {
    if (boardColumnsSetting === 'auto') return autoColumns;
    return boardColumnsSetting;
  }, [boardColumnsSetting, autoColumns]);

  // Remove the gap between status tabs: flush edge-to-edge columns
  const boardHorizontalPadding = 0;
  const boardColumnGap = 0;

  const columnWidth = useMemo(() => {
    if (effectiveColumns === 1) {
      if (boardColumnsSetting === 1) {
        return windowWidth;
      }
      return isTablet
        ? windowWidth
        : Math.round(windowWidth * 0.9);
    }
    const rawWidth = Math.floor(windowWidth / effectiveColumns);
    return Math.max(isTablet ? BOARD_MIN_COLUMN_WIDTH.tablet : BOARD_MIN_COLUMN_WIDTH.phone, rawWidth);
  }, [effectiveColumns, boardColumnsSetting, windowWidth, isTablet]);

  const isCompact = columnWidth < 260 || effectiveColumns >= 4;
  const snapInterval = columnWidth;

  // Load saved Board view columns setting from AsyncStorage
  useEffect(() => {
    const loadSavedBoardColumns = async () => {
      try {
        const saved = await AsyncStorage.getItem(BOARD_COLUMNS_STORAGE_KEY);
        if (saved) {
          if (saved === 'auto') {
            setBoardColumnsSetting('auto');
          } else {
            const num = parseInt(saved, 10);
            if (num >= 1 && num <= 6) {
              setBoardColumnsSetting(num as 1 | 2 | 3 | 4 | 5 | 6);
            }
          }
        }
      } catch (e) {
        // ignore error
      }
    };
    loadSavedBoardColumns();
  }, []);

  const handleSetBoardColumns = useCallback(async (option: BoardColumnsOption) => {
    setBoardColumnsSetting(option);
    try {
      await AsyncStorage.setItem(BOARD_COLUMNS_STORAGE_KEY, String(option));
    } catch (e) {
      // ignore error
    }
  }, []);

  // Width of the live preview frame inside the board layout sheet
  const [boardPreviewWidth, setBoardPreviewWidth] = useState(0);
  const boardMinColumnWidth = isTablet ? BOARD_MIN_COLUMN_WIDTH.tablet : BOARD_MIN_COLUMN_WIDTH.phone;
  /** How many columns actually fit at full size on this screen for a given choice */
  const presetFitsScreen = useCallback(
    (n: number) => n === 1 || Math.floor(windowWidth / n) >= boardMinColumnWidth,
    [windowWidth, boardMinColumnWidth],
  );


  const { showToast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'krifoo' | 'external'>('all');
  const [scheduleFilter, setScheduleFilter] = useState<'all' | 'scheduled' | 'asap'>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'cash' | 'card'>('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [activeTab, setActiveTab] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'tabs' | 'board'>('tabs');

  useEffect(() => {
    if (routeParams?.channel && ['all', 'delivery', 'pickup', 'takeaway', 'dine_in'].includes(routeParams.channel)) {
      setTypeFilter(routeParams.channel);
    }
  }, [routeParams?.channel]);

  // Full length board calculation:
  // The boards length should be full length extending all the way down to the bottom
  const boardFullHeight = Math.max(520, windowHeight - insets.top - searchHeight - (viewMode === 'board' ? toolbarHeight : 45));

  const toggleHeaderCollapse = useCallback((collapse: boolean) => {
    setIsHeaderCollapsed((prev) => {
      if (prev !== collapse) {
        try {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        } catch {}
        return collapse;
      }
      return prev;
    });
  }, []);

  const handleListScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (y > 35 && !isHeaderCollapsed) {
      toggleHeaderCollapse(true);
    } else if (y <= 5 && isHeaderCollapsed) {
      toggleHeaderCollapse(false);
    }
  }, [isHeaderCollapsed, toggleHeaderCollapse]);


  // Dateframe dropdown & Comprehensive filter modal
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const [channelDropdownOpen, setChannelDropdownOpen] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);

  // Date filter
  const [datePreset, setDatePreset] = useState<'today' | 'yesterday' | '7days' | '30days' | 'all' | 'custom'>('today');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [customDateModalOpen, setCustomDateModalOpen] = useState(false);
  const [tempDateFrom, setTempDateFrom] = useState('');
  const [tempDateTo, setTempDateTo] = useState('');
  const [customDateError, setCustomDateError] = useState<string | null>(null);

  const getDatePresetLabel = useCallback(() => {
    if (datePreset === 'today') return 'Today';
    if (datePreset === 'yesterday') return 'Yesterday';
    if (datePreset === '7days') return '7 Days';
    if (datePreset === '30days') return '30 Days';
    if (datePreset === 'all') return 'All Time';
    if (datePreset === 'custom' && customDateFrom && customDateTo) {
      return `${customDateFrom.slice(5)} → ${customDateTo.slice(5)}`;
    }
    if (datePreset === 'custom') return 'Custom';
    return 'Timeframe';
  }, [datePreset, customDateFrom, customDateTo]);

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);
  const [deliveryTimeModalOpen, setDeliveryTimeModalOpen] = useState(false);
  const [deliveryTimeOrder, setDeliveryTimeOrder] = useState<Order | null>(null);
  const [editingDeliveryTimeInput, setEditingDeliveryTimeInput] = useState('30');
  const [savingDeliveryTime, setSavingDeliveryTime] = useState(false);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (typeFilter !== 'all') count++;
    if (sourceFilter !== 'all') count++;
    if (scheduleFilter !== 'all') count++;
    if (paymentFilter !== 'all') count++;
    if (paymentStatusFilter !== 'all') count++;
    if (activeTab !== 'all') count++;
    return count;
  }, [typeFilter, sourceFilter, scheduleFilter, paymentFilter, paymentStatusFilter, activeTab]);

  const resetAllFilters = useCallback(() => {
    setTypeFilter('all');
    setSourceFilter('all');
    setScheduleFilter('all');
    setPaymentFilter('all');
    setPaymentStatusFilter('all');
    setActiveTab('all');
  }, []);

  const filterCounts = useMemo(() => {
    const total = orders.length;
    const delivery = orders.filter((o) => getOrderFulfillmentType(o) === 'delivery').length;
    const takeaway = orders.filter((o) => getOrderFulfillmentType(o) === 'takeaway').length;
    const pickup = orders.filter((o) => getOrderFulfillmentType(o) === 'pickup').length;
    const dineIn = orders.filter((o) => getOrderFulfillmentType(o) === 'dine_in').length;

    const scheduled = orders.filter((o) => getOrderScheduleInfo(o).isScheduled).length;
    const asap = total - scheduled;

    const marketplace = orders.filter((o) => !getOrderSourceDetails(o).isExternal).length;
    const external = orders.filter((o) => getOrderSourceDetails(o).isExternal).length;

    const cash = orders.filter((o) => {
      const p = (o.paymentType || (o as any).paymentMethod || '').toLowerCase();
      return p.includes('cash') || p === 'cod';
    }).length;
    const card = orders.filter((o) => {
      const p = (o.paymentType || (o as any).paymentMethod || '').toLowerCase();
      return p.includes('card') || p.includes('stripe') || p.includes('online');
    }).length;

    const paid = orders.filter((o) => (o.paymentStatus || '').toLowerCase() === 'paid' || (o.paymentStatus || '').toLowerCase() === 'completed').length;
    const pending = total - paid;

    return {
      total,
      delivery,
      takeaway,
      pickup,
      dineIn,
      scheduled,
      asap,
      marketplace,
      external,
      cash,
      card,
      paid,
      pending,
    };
  }, [orders]);

  const isFetchingRef = useRef(false);
  const [paperRollSize, setPaperRollSize] = useState<string>('58');
  const [ordersError, setOrdersError] = useState<{ type: ApiErrorType; message: string; statusCode?: number } | null>(null);

  const loadPaperRollSize = useCallback(async () => {
    try {
      const config = await getPosPrinterConfig();
      const template = await getActiveReceiptTemplate();
      const rawWidth = config?.paperWidth || template?.layout?.paperWidth || '58mm';
      const digits = String(rawWidth).replace(/[^0-9]/g, '');
      setPaperRollSize(digits || '58');
    } catch (err) {
      console.warn('[Orders] Could not load paper roll size:', err);
    }
  }, []);

  useEffect(() => {
    loadPaperRollSize();
  }, [loadPaperRollSize]);

  /**
   * Optimistic-update bookkeeping.
   * - pendingPatches: changes sent to the server but not yet confirmed (also acts as a double-tap guard).
   * - recentMutations: when each order was last changed locally, so a refresh that STARTED before the
   *   change finished can't overwrite it with stale server data.
   */
  const pendingPatchesRef = useRef<Map<string, Partial<Order>>>(new Map());
  const recentMutationsRef = useRef<Map<string, number>>(new Map());
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const isFocusedRef = useRef(false);

  const fetchOrders = useCallback(async (isRefresh = false) => {
    if (isFetchingRef.current) {
      if (isRefresh) setRefreshing(false);
      return;
    }
    isFetchingRef.current = true;
    const startedAt = Date.now();
    try {
      if (!isRefresh) setLoading(true);
      const res: any = await orderService.fetchAllOrders();
      if (res.success && res.data) {
        // Forget mutation timestamps older than a minute.
        recentMutationsRef.current.forEach((at, id) => {
          if (startedAt - at > 60000) recentMutationsRef.current.delete(id);
        });
        setOrders((prev) => {
          const prevById = new Map(prev.map((o) => [o._id, o]));
          return (res.data as Order[]).map((server) => {
            const pending = pendingPatchesRef.current.get(server._id);
            if (pending) return { ...server, ...pending } as Order;
            const mutatedAt = recentMutationsRef.current.get(server._id);
            if (mutatedAt && mutatedAt > startedAt) return prevById.get(server._id) ?? server;
            return server;
          });
        });
        setOrdersError(null);
      } else {
        console.warn('Failed fetching orders:', res.message);
        setOrdersError({
          type: res.errorType || 'unknown',
          message: res.message || 'Unable to fetch orders from server.',
          statusCode: res.statusCode,
        });
      }
    } catch (e: any) {
      console.warn('Failed fetching orders:', e);
      setOrdersError({
        type: 'network',
        message: e?.message || 'Cannot reach server.',
      });
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // 1. Refetch whenever screen comes into focus (this also covers the very first load).
  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      fetchOrders(true);
      loadPaperRollSize();
      return () => {
        isFocusedRef.current = false;
      };
    }, [fetchOrders, loadPaperRollSize])
  );

  // 2. Real-time WebSocket listener + auto polling + App foreground refresh.
  //    Only runs while this tab is visible and the app is in the foreground; bursts of socket
  //    messages are collapsed into a single refresh.
  useEffect(() => {
    const canRefresh = () => isFocusedRef.current && AppState.currentState === 'active';
    let socketTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (socketTimer) clearTimeout(socketTimer);
      socketTimer = setTimeout(() => {
        socketTimer = null;
        if (canRefresh()) fetchOrders(true);
      }, 600);
    };

    const sub = DeviceEventEmitter.addListener('websocket_message', (data: any) => {
      // Refresh on any websocket event related to orders
      const type = (data?.type || data?.event || '').toUpperCase();
      if (
        !type ||
        type.includes('ORDER') ||
        type.includes('STATUS') ||
        type.includes('DELIVERY') ||
        type.includes('REFRESH') ||
        type.includes('UPDATE') ||
        type === 'NEW_ORDER' ||
        type === 'RESTAURANT_ORDER_UPDATE' ||
        type === 'SUPERADMIN_ORDER_UPDATE' ||
        data?.orderId ||
        data?.order ||
        data?.status
      ) {
        scheduleRefresh();
      }
    });

    // Fallback poll every 12 seconds so orders stay fresh if WebSocket disconnects
    const interval = setInterval(() => {
      if (canRefresh()) fetchOrders(true);
    }, 12000);

    // Refresh immediately when coming back from background
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && isFocusedRef.current) {
        fetchOrders(true);
      }
    });

    return () => {
      if (socketTimer) clearTimeout(socketTimer);
      sub.remove();
      clearInterval(interval);
      appStateSub.remove();
    };
  }, [fetchOrders]);

  const onRefresh = () => { setRefreshing(true); fetchOrders(true); };

  const filteredOrders = useMemo(() => {
    // Compute date range for the selected preset
    const now = new Date();
    const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

    let dateFrom: Date | null = null;
    let dateTo: Date | null = null;

    if (datePreset === 'today') {
      dateFrom = startOfDay(now);
      dateTo = endOfDay(now);
    } else if (datePreset === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      dateFrom = startOfDay(y);
      dateTo = endOfDay(y);
    } else if (datePreset === '7days') {
      // "Last 7 days" = today plus the 6 days before it.
      const past7 = new Date(now);
      past7.setDate(past7.getDate() - 6);
      dateFrom = startOfDay(past7);
      dateTo = endOfDay(now);
    } else if (datePreset === '30days') {
      const past30 = new Date(now);
      past30.setDate(past30.getDate() - 29);
      dateFrom = startOfDay(past30);
      dateTo = endOfDay(now);
    } else if (datePreset === 'custom') {
      const from = parseLocalYMD(customDateFrom);
      const to = parseLocalYMD(customDateTo);
      if (from && to) {
        dateFrom = startOfDay(from);
        dateTo = endOfDay(to);
      }
    }

    // Normalise the search once: "#1234" should match order 1234; phone search ignores spaces.
    const rawQuery = searchQuery.trim().toLowerCase();
    const q = rawQuery.replace(/^#/, '');
    const qDigits = q.replace(/\D/g, '');

    return orders.filter((order) => {
      const sourceDetails = getOrderSourceDetails(order);
      if (q) {
        const orderNum = String(order.orderNumber ?? '').toLowerCase();
        const idMatch = String(order._id ?? '').toLowerCase().includes(q) || orderNum.includes(q);
        const restMatch = getRestaurantName(order).toLowerCase().includes(q);
        const custMatch = getCustomerName(order).toLowerCase().includes(q);
        const domainMatch = sourceDetails.domainUrl.toLowerCase().includes(q);
        const phoneMatch = qDigits.length >= 3 && getCustomerPhone(order).replace(/\D/g, '').includes(qDigits);
        const itemMatch =
          !idMatch && !custMatch && getOrderItems(order).some((it) => getItemName(it).toLowerCase().includes(q));
        if (!idMatch && !restMatch && !custMatch && !domainMatch && !phoneMatch && !itemMatch) return false;
      }
      const fType = getOrderFulfillmentType(order);
      if (typeFilter !== 'all' && fType !== typeFilter) return false;

      const isExt = sourceDetails.isExternal;
      if (sourceFilter === 'external' && !isExt) return false;
      if (sourceFilter === 'krifoo' && isExt) return false;

      // Schedule filter
      const schedInfo = getOrderScheduleInfo(order);
      if (scheduleFilter === 'scheduled' && !schedInfo.isScheduled) return false;
      if (scheduleFilter === 'asap' && schedInfo.isScheduled) return false;

      // Payment method filter
      const pType = (order.paymentType || (order as any).paymentMethod || '').toLowerCase();
      const isCash = pType.includes('cash') || pType === 'cod';
      const isCard = pType.includes('card') || pType.includes('stripe') || pType.includes('online');
      if (paymentFilter === 'cash' && !isCash) return false;
      if (paymentFilter === 'card' && !isCard) return false;

      // Payment status filter
      const pStatus = (order.paymentStatus || '').toLowerCase();
      if (paymentStatusFilter === 'paid' && pStatus !== 'paid' && pStatus !== 'completed') return false;
      if (paymentStatusFilter === 'pending' && (pStatus === 'paid' || pStatus === 'completed')) return false;

      // Date filter — applies to finished orders only. Orders still in progress are always shown
      // so nothing placed before midnight (or scheduled for later) can drop off the board.
      if (dateFrom && dateTo && !isActiveOrder(order)) {
        const created = order.createdAt ? new Date(order.createdAt) : null;
        if (!created || isNaN(created.getTime())) return false;
        if (created < dateFrom || created > dateTo) return false;
      }

      return true;
    });
  }, [orders, searchQuery, typeFilter, sourceFilter, scheduleFilter, paymentFilter, paymentStatusFilter, datePreset, customDateFrom, customDateTo]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: filteredOrders.length,
      new: filteredOrders.filter((o) => o.status === 'placed').length,
      kitchen: filteredOrders.filter((o) => o.status === 'confirmed' || o.status === 'preparing').length,
      pickup: filteredOrders.filter((o) => isOrderPickup(o) && o.status === 'ready_for_pickup').length,
      delivery: filteredOrders.filter((o) => o.status === 'out_for_delivery').length,
      completed: filteredOrders.filter((o) => o.status === 'delivered').length,
      cancelled: filteredOrders.filter((o) => o.status === 'cancelled').length,
    };
    return counts;
  }, [filteredOrders]);

  const activeTabOrders = useMemo(() => {
    if (activeTab === 'all') return filteredOrders;
    if (activeTab === 'kitchen') {
      return filteredOrders.filter((o) => o.status === 'confirmed' || o.status === 'preparing');
    }
    if (activeTab === 'pickup') {
      return filteredOrders.filter((o) => isOrderPickup(o) && o.status === 'ready_for_pickup');
    }
    const tabDef = STATUS_TABS.find((t) => t.id === activeTab);
    if (!tabDef) return filteredOrders;
    return filteredOrders.filter((o) => tabDef.statuses.includes(o.status));
  }, [filteredOrders, activeTab]);

  // Never leave the header (with the Board/Tabs toggle) stuck hidden: re-show it whenever the
  // user switches tab/view/filters, or when the current list is empty and can't be scrolled back up.
  useEffect(() => {
    toggleHeaderCollapse(false);
  }, [activeTab, viewMode, typeFilter, sourceFilter, scheduleFilter, paymentFilter, paymentStatusFilter, datePreset, toggleHeaderCollapse]);

  useEffect(() => {
    if (isHeaderCollapsed && viewMode === 'tabs' && activeTabOrders.length === 0) toggleHeaderCollapse(false);
  }, [isHeaderCollapsed, viewMode, activeTabOrders.length, toggleHeaderCollapse]);

  const activeOrderCount = useMemo(
    () => filteredOrders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled').length,
    [filteredOrders]
  );

  const setOrderUpdating = (orderId: string, updating: boolean) =>
    setUpdatingIds((prev) => {
      const next = new Set(prev);
      if (updating) next.add(orderId);
      else next.delete(orderId);
      return next;
    });

  const executeUpdateStatus = async (orderId: string, newStatus: string) => {
    // 1. Double-tap guard: ignore further taps while this order already has a change in flight.
    if (pendingPatchesRef.current.has(orderId)) return;

    // 2. Snapshot ONLY this order so a failure rolls back just this order — not orders that
    //    arrived (or were changed) in the meantime.
    const prevOrder =
      orders.find((o) => o._id === orderId) ?? (selectedOrder?._id === orderId ? selectedOrder : undefined);

    const patch: Partial<Order> = { status: newStatus as OrderStatus };
    if (
      newStatus !== 'placed' &&
      newStatus !== 'cancelled' &&
      (!prevOrder?.acceptanceStatus || prevOrder.acceptanceStatus === 'pending')
    ) {
      (patch as any).acceptanceStatus = 'accepted';
    }
    const pType = String(prevOrder?.paymentType || (prevOrder as any)?.paymentMethod || '').toLowerCase();
    if (newStatus === 'delivered' && (pType === 'cash' || pType === 'cod')) {
      (patch as any).paymentStatus = 'paid';
    }

    // 3. Optimistic UI update — also registered as "pending" so background refreshes keep it.
    pendingPatchesRef.current.set(orderId, patch);
    setOrderUpdating(orderId, true);
    setOrders((current) => current.map((o) => (o._id === orderId ? ({ ...o, ...patch } as Order) : o)));
    setSelectedOrder((prev) => (prev && prev._id === orderId ? ({ ...prev, ...patch } as Order) : prev));

    const rollback = () => {
      if (!prevOrder) return;
      setOrders((current) => current.map((o) => (o._id === orderId ? prevOrder : o)));
      setSelectedOrder((prev) => (prev && prev._id === orderId ? prevOrder : prev));
    };

    const orderLabel = `#${prevOrder?.orderNumber || orderId.substring(0, 7).toUpperCase()}`;

    try {
      const res = await orderService.updateOrderStatus(orderId, newStatus);
      if (res.success) {
        const confirmed = { ...(prevOrder || {}), ...patch, ...(res.data || {}) } as Order;
        if (res.data) {
          setOrders((current) => current.map((o) => (o._id === orderId ? ({ ...o, ...res.data } as Order) : o)));
          setSelectedOrder((prev) => (prev && prev._id === orderId ? ({ ...prev, ...res.data } as Order) : prev));
        }
        recentMutationsRef.current.set(orderId, Date.now());
        showToast({
          title: `Order ${statusLabel(newStatus)}`,
          message: `${orderLabel} moved to ${statusLabel(newStatus)}.`,
          type: 'success',
        });

        // 4. Auto-print the kitchen ticket only AFTER the server has accepted the order,
        //    in the background so it never blocks the UI.
        if (newStatus === 'preparing') {
          (async () => {
            try {
              if (!(await isAutoPrintEnabled())) return;
              let orderToPrint: any = confirmed;
              if (!orderToPrint?.orderedItems?.length && !orderToPrint?.items?.length) {
                const fullOrderRes = await orderService.getOrderById(orderId);
                if (fullOrderRes.success && fullOrderRes.data) orderToPrint = fullOrderRes.data;
              }
              if (orderToPrint) await printThermalReceipt(orderToPrint, false, undefined, undefined, 'accepted');
            } catch (printErr) {
              console.error('[Orders] Auto-print failed:', printErr);
            }
          })();
        }
      } else {
        rollback();
        showToast({ title: 'Update failed', message: res.message || `Couldn’t update ${orderLabel}.`, type: 'error' });
      }
    } catch (err: any) {
      rollback();
      showToast({
        title: 'Update failed',
        message: err?.message || `Network error — ${orderLabel} was not updated.`,
        type: 'error',
      });
    } finally {
      pendingPatchesRef.current.delete(orderId);
      setOrderUpdating(orderId, false);
    }
  };

  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    if (newStatus === 'cancelled') {
      const target =
        orders.find((o) => o._id === orderId) ||
        (selectedOrder?._id === orderId ? selectedOrder : null) ||
        ({ _id: orderId } as Order);
      setOrderToCancel(target);
      if (detailModalVisible) {
        setDetailModalVisible(false);
        setTimeout(() => {
          setCancelModalVisible(true);
        }, 350);
      } else {
        setCancelModalVisible(true);
      }
      return;
    }
    await executeUpdateStatus(orderId, newStatus);
  };

  const assigningRef = useRef<Set<string>>(new Set());

  const handleAssignConfirm = async (deliveryPartnerId: string) => {
    if (!selectedOrder) return;
    const orderId = selectedOrder._id;
    if (assigningRef.current.has(orderId)) return; // ignore double submits
    assigningRef.current.add(orderId);
    setOrderUpdating(orderId, true);

    try {
      const res = await orderService.assignDeliveryPartner(orderId, deliveryPartnerId);
      if (res.success) {
        if (res.data) {
          // The card reads `assignedDeliveryPartnerId`; merge whatever the server returned.
          setOrders((current) => current.map((o) => (o._id === orderId ? ({ ...o, ...res.data } as Order) : o)));
          setSelectedOrder((prev) => (prev && prev._id === orderId ? ({ ...prev, ...res.data } as Order) : prev));
        }
        recentMutationsRef.current.set(orderId, Date.now());
        showToast({ title: 'Rider assigned', message: 'The delivery partner has been assigned.', type: 'success' });
        // Refresh so the rider's name is populated on the card even if the response only held an id.
        fetchOrders(true);
      } else {
        showToast({ title: 'Assignment failed', message: res.message || 'Could not assign the rider.', type: 'error' });
      }
    } catch {
      showToast({ title: 'Assignment failed', message: 'Network error assigning the delivery partner.', type: 'error' });
    } finally {
      assigningRef.current.delete(orderId);
      setOrderUpdating(orderId, false);
    }
  };

  const handleOpenEditDeliveryTime = (order: Order) => {
    setDeliveryTimeOrder(order);
    setEditingDeliveryTimeInput(String(order.expectedDeliveryTime || order.deliveryTime || 30));
    setDeliveryTimeModalOpen(true);
  };

  const handleSaveDeliveryTime = async (overrideMins?: number) => {
    if (!deliveryTimeOrder) return;
    const finalMins = overrideMins !== undefined ? overrideMins : parseInt(editingDeliveryTimeInput, 10);
    if (isNaN(finalMins) || finalMins < 5 || finalMins > 300) {
      showToast({ title: 'Invalid Time', message: 'Expected delivery time must be between 5 and 300 minutes.', type: 'error' });
      return;
    }

    setSavingDeliveryTime(true);
    try {
      const res = await orderService.updateOrderDeliveryTime(deliveryTimeOrder._id, finalMins);
      if (res.success) {
        showToast({ title: 'Updated', message: `Expected delivery time set to ${finalMins} minutes.`, type: 'success' });
        setOrders((prev) =>
          prev.map((o) =>
            o._id === deliveryTimeOrder._id
              ? { ...o, deliveryTime: finalMins, expectedDeliveryTime: finalMins, ...(res.data || {}) }
              : o
          )
        );
        if (selectedOrder && selectedOrder._id === deliveryTimeOrder._id) {
          setSelectedOrder((prev) =>
            prev ? { ...prev, deliveryTime: finalMins, expectedDeliveryTime: finalMins, ...(res.data || {}) } : null
          );
        }
        setDeliveryTimeModalOpen(false);
        setDeliveryTimeOrder(null);
      } else {
        showToast({ title: 'Error', message: res.message || 'Failed to update expected delivery time.', type: 'error' });
      }
    } catch (err: any) {
      showToast({ title: 'Error', message: err?.message || 'Error updating expected delivery time.', type: 'error' });
    } finally {
      setSavingDeliveryTime(false);
    }
  };

  const handlePrintOrder = async (order: Order) => {
    const orderNum = order.orderNumber || order._id?.slice(-5).toUpperCase() || 'Order';
    const orderStatus = order.status;
    console.log(`\n[PRINT CLICK] User tapped "Print Receipt" on Order #${orderNum} | Stage: "${orderStatus}" | ID: ${order._id}`);

    try {
      showToast({ title: 'Printing Receipt...', message: `Sending #${orderNum} (${orderStatus}) to printer...`, type: 'info' });

      let orderToPrint: any = order;
      if (!orderToPrint?.orderedItems?.length && !(orderToPrint as any)?.items?.length) {
        console.log(`[PRINT CLICK] Order items missing in card view, fetching full details for #${orderNum}...`);
        const fullRes = await orderService.getOrderById(order._id);
        if (fullRes.success && fullRes.data) {
          orderToPrint = fullRes.data;
        }
      }

      const success = await printThermalReceipt(orderToPrint, true);
      const report = getLastPrintJobReport();

      console.log(`[PRINT CLICK RESULT] Order #${orderNum} | Result: ${success ? '✅ SUCCESS' : '❌ FAILED'} | Driver: ${report?.driverLabel || 'Unknown'} | Time: ${report?.durationMs || 0}ms`);

      if (success) {
        showToast({
          title: 'Print Success ✅',
          message: `Receipt printed via ${report?.driverLabel || 'printer'}.`,
          type: 'success',
        });
      } else {
        showToast({
          title: 'Print Status Notice',
          message: report?.error || 'Printer not ready or print cancelled.',
          type: 'info',
        });
      }
    } catch (err: any) {
      console.error(`[PRINT CLICK ERROR] Order #${orderNum} failed:`, err);
      showToast({ title: 'Print Error ❌', message: err?.message || 'Failed to print receipt.', type: 'error' });
    }
  };

  // Shared top-bar buttons (rendered inline on tablets, on a second row on phones).
  const filterButton = (
    <TouchableOpacity
      style={[styles.filterBtn, styles.filterBtnIconOnly, activeFilterCount > 0 && styles.filterBtnActive]}
      onPress={() => setFilterModalOpen(true)}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : 'Filters'}
    >
      <SlidersHorizontal size={18} color={activeFilterCount > 0 ? '#FFFFFF' : '#11181C'} />
      {activeFilterCount > 0 && (
        <View style={[styles.filterBadge, styles.filterBadgeCorner]}>
          <Text style={[styles.filterBadgeText, { color: '#FFFFFF' }]}>{activeFilterCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const dateButton = (
    <TouchableOpacity
      style={[styles.dateDropdownBtn, styles.topBarBtnMobile, datePreset !== 'today' && styles.dateDropdownBtnActive]}
      onPress={() => setDateDropdownOpen(true)}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Date range: ${getDatePresetLabel()}`}
    >
      <Calendar size={15} color={datePreset === 'today' ? '#687076' : '#FF5C39'} />
      <Text
        style={[styles.dateDropdownBtnText, { flex: 0 }, datePreset !== 'today' && { color: '#FF5C39' }]}
        numberOfLines={1}
      >
        {getDatePresetLabel()}
      </Text>
      <ChevronDown size={13} color={datePreset === 'today' ? '#9BA1A6' : '#FF5C39'} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* TOP BAR: Home + Search & filters + view toggle (always visible) */}
      <View
        style={[styles.stickySearchWrapper, isHeaderCollapsed && styles.stickySearchWrapperElevated]}
      >
        <View style={[styles.controlsRow, isTablet && styles.controlsRowTablet]}>
        <View style={[styles.searchAndChannelRow, isTablet && styles.searchAndChannelRowTablet]}>
          <TouchableOpacity
            style={styles.homeBtn}
            onPress={() => router.navigate('/(tabs)')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Go to Home"
          >
            <House size={20} color="#FF5C39" />
          </TouchableOpacity>

          <View style={[styles.searchBox, { flex: 1 }]}>
            <Search size={16} color={Colors.textSubtle} />
            <TextInput
              style={styles.searchInput}
              placeholder={isMobile ? 'Search orders…' : 'Search order #, customer, phone or item…'}
              placeholderTextColor={Colors.textSubtle}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search orders"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Clear search"
              >
                <X size={15} color="#9BA1A6" />
              </TouchableOpacity>
            )}
          </View>

          {/* Filter sits right beside the search bar */}
          {filterButton}
        </View>

        {/* Second row (all devices): time frame + Board / Tabs toggle — always visible */}
        <View style={styles.mobileFilterRow}>
          <View style={styles.flex1}>{dateButton}</View>

          {/* Board / Tabs toggle — icon-only on phones.
              When Board is active it becomes a dropdown: tap it again to choose tabs per screen. */}
          <View style={styles.viewToggleContainer}>
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                isMobile && styles.toggleBtnIconOnly,
                isMobile && viewMode === 'board' && styles.toggleBtnIconWithChevron,
                viewMode === 'board' && styles.toggleBtnActive,
              ]}
              onPress={() => (viewMode === 'board' ? setBoardColumnsModalOpen(true) : setViewMode('board'))}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={
                viewMode === 'board'
                  ? `Board view, ${boardColumnsSetting === 'auto' ? `auto ${autoColumns}` : boardColumnsSetting} tabs per screen. Tap to change`
                  : 'Board view'
              }
              accessibilityState={{ selected: viewMode === 'board' }}
            >
              <LayoutGrid size={15} color={viewMode === 'board' ? '#FFFFFF' : '#687076'} />
              {!isMobile && (
                <Text style={[styles.toggleBtnText, viewMode === 'board' && styles.toggleBtnTextActive]}>
                  {viewMode === 'board'
                    ? `Board · ${boardColumnsSetting === 'auto' ? `Auto (${autoColumns})` : boardColumnsSetting}`
                    : 'Board'}
                </Text>
              )}
              {viewMode === 'board' && <ChevronDown size={13} color="#FFFFFF" />}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, isMobile && styles.toggleBtnIconOnly, viewMode === 'tabs' && styles.toggleBtnActive]}
              onPress={() => setViewMode('tabs')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Tabs view"
              accessibilityState={{ selected: viewMode === 'tabs' }}
            >
              <List size={15} color={viewMode === 'tabs' ? '#FFFFFF' : '#687076'} />
              {!isMobile && (
                <Text style={[styles.toggleBtnText, viewMode === 'tabs' && styles.toggleBtnTextActive]}>Tabs</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Active Filter Chips (if any filter is applied) */}
        {activeFilterCount > 0 && (
          <View style={styles.activeFiltersRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeFiltersList}>
              <View style={styles.activeFilterCountTag}>
                <Text style={styles.activeFilterCountTagText}>{activeFilterCount} active</Text>
              </View>

              {typeFilter !== 'all' && (
                <TouchableOpacity
                  style={styles.activeFilterChip}
                  onPress={() => setTypeFilter('all')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.activeFilterChipText}>
                      Type: {typeFilter === 'takeaway' ? 'Takeaway' : typeFilter === 'dine_in' ? 'Dine-In' : typeFilter === 'pickup' ? 'Self Pickup' : typeFilter === 'delivery' ? 'Delivery' : typeFilter}
                  </Text>
                  <X size={11} color="#FF5C39" />
                </TouchableOpacity>
              )}

              {sourceFilter !== 'all' && (
                <TouchableOpacity
                  style={styles.activeFilterChip}
                  onPress={() => setSourceFilter('all')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.activeFilterChipText}>
                    Channel: {sourceFilter === 'krifoo' ? 'Marketplace' : 'External'}
                  </Text>
                  <X size={11} color="#FF5C39" />
                </TouchableOpacity>
              )}

              {scheduleFilter !== 'all' && (
                <TouchableOpacity
                  style={styles.activeFilterChip}
                  onPress={() => setScheduleFilter('all')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.activeFilterChipText}>
                    {scheduleFilter === 'scheduled' ? '⏰ Scheduled' : '⚡ ASAP'}
                  </Text>
                  <X size={11} color="#FF5C39" />
                </TouchableOpacity>
              )}

              {paymentFilter !== 'all' && (
                <TouchableOpacity
                  style={styles.activeFilterChip}
                  onPress={() => setPaymentFilter('all')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.activeFilterChipText}>
                    {paymentFilter === 'cash' ? '💵 Cash / COD' : '💳 Card / Online'}
                  </Text>
                  <X size={11} color="#FF5C39" />
                </TouchableOpacity>
              )}

              {paymentStatusFilter !== 'all' && (
                <TouchableOpacity
                  style={styles.activeFilterChip}
                  onPress={() => setPaymentStatusFilter('all')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.activeFilterChipText}>
                    {paymentStatusFilter === 'paid' ? '✅ Paid' : '⏳ Pending'}
                  </Text>
                  <X size={11} color="#FF5C39" />
                </TouchableOpacity>
              )}


              {activeTab !== 'all' && (
                <TouchableOpacity
                  style={styles.activeFilterChip}
                  onPress={() => setActiveTab('all')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.activeFilterChipText}>
                    Status: {STATUS_TABS.find((t) => t.id === activeTab)?.label || activeTab}
                  </Text>
                  <X size={11} color="#FF5C39" />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.clearAllBtn}
                onPress={resetAllFilters}
                activeOpacity={0.7}
              >
                <RotateCcw size={10} color="#EF4444" />
                <Text style={styles.clearAllBtnText}>Clear All</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}
      </View>
    </View>

    {/* Modals Layer */}
    <View pointerEvents="box-none" style={styles.modalsOverlayWrapper}>

      {/* Comprehensive Filter Modal */}
      <Modal
        visible={filterModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterModalOpen(false)}
      >
        <View style={[styles.filterModalOverlay, isTablet && styles.modalOverlayTablet]}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setFilterModalOpen(false)}
          />

          <View style={[styles.filterModalContainer, isTablet && styles.filterModalContainerTablet]}>
            {!isTablet && <View style={styles.filterDragHandle} />}

            {/* Header */}
            <View style={styles.filterModalHeader}>
              <View style={styles.filterModalHeaderTitleRow}>
                <View style={styles.filterModalIconCircle}>
                  <SlidersHorizontal size={18} color="#FF5C39" />
                </View>
                <View>
                  <Text style={styles.filterModalTitle}>Order Filters</Text>
                  <Text style={styles.filterModalSubtitle}>
                    Showing {filteredOrders.length} of {orders.length} orders
                  </Text>
                </View>
              </View>

              <View style={styles.filterModalHeaderActions}>
                {activeFilterCount > 0 && (
                  <TouchableOpacity
                    style={styles.filterResetTextBtn}
                    onPress={resetAllFilters}
                    activeOpacity={0.7}
                  >
                    <RotateCcw size={12} color="#EF4444" />
                    <Text style={styles.filterResetTextBtnLabel}>Reset</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.filterModalCloseBtn}
                  onPress={() => setFilterModalOpen(false)}
                  activeOpacity={0.8}
                >
                  <X size={16} color="#64748B" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Scrollable Filter Sections */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.filterModalBody}
            >
              {/* Section 1: Fulfillment Type */}
              <View style={styles.filterSection}>
                <View style={styles.filterSectionHeader}>
                  <View style={styles.filterSectionTitleRow}>
                    <Text style={styles.filterSectionTitle}>Fulfillment Type</Text>
                  </View>
                  <Text style={styles.filterSectionSubtitle}>Delivery, pickup, or eat-in</Text>
                </View>
                <View style={styles.filterGrid2}>
                  {([
                    { label: 'All Types', value: 'all', emoji: '📦', count: filterCounts.total, desc: 'Every order mode' },
                    { label: 'Takeaway Order', value: 'takeaway', emoji: '🥡', count: filterCounts.takeaway, desc: 'Takeaway kiosk & app' },
                    { label: 'Delivery', value: 'delivery', emoji: '🛵', count: filterCounts.delivery, desc: 'Rider doorstep delivery' },
                    { label: 'Self Pickup', value: 'pickup', emoji: '🛍️', count: filterCounts.pickup, desc: 'Customer collection' },
                    { label: 'Dine-In', value: 'dine_in', emoji: '🍽️', count: filterCounts.dineIn, desc: 'Table eat-in orders' },
                  ] as const).map((opt) => {
                    const isSelected = typeFilter === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[styles.filterOptionCard, isSelected && styles.filterOptionCardActive]}
                        onPress={() => setTypeFilter(opt.value)}
                        activeOpacity={0.75}
                      >
                        <Text style={styles.filterOptionCardEmoji}>{opt.emoji}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.filterOptionCardLabel, isSelected && styles.filterOptionCardLabelActive]}>
                            {opt.label}
                          </Text>
                          <Text style={styles.filterOptionCardDesc} numberOfLines={1}>{opt.desc}</Text>
                        </View>
                        <View style={[styles.filterOptionCountBadge, isSelected && styles.filterOptionCountBadgeActive]}>
                          <Text style={[styles.filterOptionCountText, isSelected && styles.filterOptionCountTextActive]}>
                            {opt.count}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Section 2: Order Timing (Scheduled vs ASAP) */}
              <View style={styles.filterSection}>
                <View style={styles.filterSectionHeader}>
                  <View style={styles.filterSectionTitleRow}>
                    <Text style={styles.filterSectionTitle}>Order Timing</Text>
                  </View>
                  <Text style={styles.filterSectionSubtitle}>Immediate vs scheduled slots</Text>
                </View>
                <View style={styles.filterGrid2}>
                  {([
                    { label: 'All Timings', value: 'all' as const, emoji: '⚡', count: filterCounts.total, desc: 'ASAP & scheduled' },
                    { label: 'Scheduled Orders', value: 'scheduled' as const, emoji: '⏰', count: filterCounts.scheduled, desc: 'Future date/slot bookings' },
                    { label: 'Immediate / ASAP', value: 'asap' as const, emoji: '🔥', count: filterCounts.asap, desc: 'Cook and dispatch now' },
                  ]).map((opt) => {
                    const isSelected = scheduleFilter === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[styles.filterOptionCard, isSelected && styles.filterOptionCardActive]}
                        onPress={() => setScheduleFilter(opt.value)}
                        activeOpacity={0.75}
                      >
                        <Text style={styles.filterOptionCardEmoji}>{opt.emoji}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.filterOptionCardLabel, isSelected && styles.filterOptionCardLabelActive]}>
                            {opt.label}
                          </Text>
                          <Text style={styles.filterOptionCardDesc} numberOfLines={1}>{opt.desc}</Text>
                        </View>
                        <View style={[styles.filterOptionCountBadge, isSelected && styles.filterOptionCountBadgeActive]}>
                          <Text style={[styles.filterOptionCountText, isSelected && styles.filterOptionCountTextActive]}>
                            {opt.count}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Section 3: Sales Channel */}
              <View style={styles.filterSection}>
                <View style={styles.filterSectionHeader}>
                  <View style={styles.filterSectionTitleRow}>
                    <Text style={styles.filterSectionTitle}>Sales Channel</Text>
                  </View>
                  <Text style={styles.filterSectionSubtitle}>Origin of order</Text>
                </View>
                <View style={styles.filterGrid2}>
                  {([
                    { label: 'All Channels', value: 'all' as const, emoji: '🌐', count: filterCounts.total, desc: 'All sources' },
                    { label: 'Marketplace', value: 'krifoo' as const, emoji: '📱', count: filterCounts.marketplace, desc: 'krifoo.co.uk App' },
                    { label: 'External Website', value: 'external' as const, emoji: '💻', count: filterCounts.external, desc: 'Branded website orders' },
                  ]).map((opt) => {
                    const isSelected = sourceFilter === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[styles.filterOptionCard, isSelected && styles.filterOptionCardActive]}
                        onPress={() => setSourceFilter(opt.value)}
                        activeOpacity={0.75}
                      >
                        <Text style={styles.filterOptionCardEmoji}>{opt.emoji}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.filterOptionCardLabel, isSelected && styles.filterOptionCardLabelActive]}>
                            {opt.label}
                          </Text>
                          <Text style={styles.filterOptionCardDesc} numberOfLines={1}>{opt.desc}</Text>
                        </View>
                        <View style={[styles.filterOptionCountBadge, isSelected && styles.filterOptionCountBadgeActive]}>
                          <Text style={[styles.filterOptionCountText, isSelected && styles.filterOptionCountTextActive]}>
                            {opt.count}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Section 4: Payment Method */}
              <View style={styles.filterSection}>
                <View style={styles.filterSectionHeader}>
                  <View style={styles.filterSectionTitleRow}>
                    <Text style={styles.filterSectionTitle}>Payment Method</Text>
                  </View>
                  <Text style={styles.filterSectionSubtitle}>Cash vs Card/Online</Text>
                </View>
                <View style={styles.filterGrid2}>
                  {([
                    { label: 'All Methods', value: 'all' as const, emoji: '💰', count: filterCounts.total, desc: 'Cash and Card' },
                    { label: 'Cash / COD', value: 'cash' as const, emoji: '💵', count: filterCounts.cash, desc: 'Pay on delivery/counter' },
                    { label: 'Card / Online', value: 'card' as const, emoji: '💳', count: filterCounts.card, desc: 'Stripe or digital cards' },
                  ]).map((opt) => {
                    const isSelected = paymentFilter === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[styles.filterOptionCard, isSelected && styles.filterOptionCardActive]}
                        onPress={() => setPaymentFilter(opt.value)}
                        activeOpacity={0.75}
                      >
                        <Text style={styles.filterOptionCardEmoji}>{opt.emoji}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.filterOptionCardLabel, isSelected && styles.filterOptionCardLabelActive]}>
                            {opt.label}
                          </Text>
                          <Text style={styles.filterOptionCardDesc} numberOfLines={1}>{opt.desc}</Text>
                        </View>
                        <View style={[styles.filterOptionCountBadge, isSelected && styles.filterOptionCountBadgeActive]}>
                          <Text style={[styles.filterOptionCountText, isSelected && styles.filterOptionCountTextActive]}>
                            {opt.count}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Section 5: Payment Status */}
              <View style={styles.filterSection}>
                <View style={styles.filterSectionHeader}>
                  <View style={styles.filterSectionTitleRow}>
                    <Text style={styles.filterSectionTitle}>Payment Status</Text>
                  </View>
                  <Text style={styles.filterSectionSubtitle}>Settlement status</Text>
                </View>
                <View style={styles.filterChipsWrap}>
                  {([
                    { label: 'All Statuses', value: 'all' as const },
                    { label: 'Paid ✅', value: 'paid' as const },
                    { label: 'Pending ⏳', value: 'pending' as const },
                  ]).map((opt) => {
                    const isSelected = paymentStatusFilter === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[styles.filterChip, isSelected && styles.filterChipActive]}
                        onPress={() => setPaymentStatusFilter(opt.value)}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Section 6: Order Status */}
              <View style={styles.filterSection}>
                <View style={styles.filterSectionHeader}>
                  <View style={styles.filterSectionTitleRow}>
                    <Text style={styles.filterSectionTitle}>Order Status</Text>
                  </View>
                  <Text style={styles.filterSectionSubtitle}>Stage in kitchen / dispatch workflow</Text>
                </View>
                <View style={styles.filterChipsWrap}>
                  {STATUS_TABS.map((tab) => {
                    const isSelected = activeTab === tab.id;
                    const count = tabCounts[tab.id] ?? 0;
                    return (
                      <TouchableOpacity
                        key={tab.id}
                        style={[
                          styles.filterChip,
                          isSelected && { borderColor: tab.accentColor, backgroundColor: `${tab.accentColor}12` },
                        ]}
                        onPress={() => setActiveTab(tab.id)}
                        activeOpacity={0.75}
                      >
                        <Text
                          style={[
                            styles.filterChipText,
                            isSelected && { color: tab.accentColor, fontWeight: '800' },
                          ]}
                        >
                          {tab.label} ({count})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            {/* Sticky Action Footer */}
            <View style={styles.filterModalFooter}>
              <TouchableOpacity
                style={styles.filterFooterResetBtn}
                onPress={resetAllFilters}
                activeOpacity={0.8}
              >
                <Text style={styles.filterFooterResetBtnText}>Reset All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.filterFooterApplyBtn}
                onPress={() => setFilterModalOpen(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.filterFooterApplyBtnText}>
                  Show {filteredOrders.length} Order{filteredOrders.length !== 1 ? 's' : ''}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Dateframe Selection Modal */}
      <Modal
        visible={dateDropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDateDropdownOpen(false)}
      >
        <TouchableOpacity
          style={[styles.dropdownOverlay, isTablet && styles.modalOverlayTablet]}
          activeOpacity={1}
          onPress={() => setDateDropdownOpen(false)}
        >
          <View style={[styles.channelDropdownSheet, isTablet && styles.channelDropdownSheetTablet]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Calendar size={18} color="#FF5C39" />
                <Text style={styles.channelDropdownTitle}>Select Timeframe</Text>
              </View>
              <TouchableOpacity onPress={() => setDateDropdownOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={16} color="#64748B" />
              </TouchableOpacity>
            </View>
            {([
              { label: 'Today', value: 'today', icon: '🟢', desc: 'Orders placed today' },
              { label: 'Yesterday', value: 'yesterday', icon: '⏪', desc: 'Orders placed yesterday' },
              { label: 'Last 7 Days', value: '7days', icon: '🗓️', desc: 'Orders from the past week' },
              { label: 'Last 30 Days', value: '30days', icon: '📆', desc: 'Orders from the past month' },
              { label: 'All Time', value: 'all', icon: '🌐', desc: 'Every order from the beginning' },
              { label: 'Custom Range...', value: 'custom', icon: '🎯', desc: 'Pick specific from and to dates' },
            ] as const).map((dp) => (
              <TouchableOpacity
                key={dp.value}
                style={[
                  styles.channelDropdownItem,
                  datePreset === dp.value && styles.channelDropdownItemActive,
                ]}
                onPress={() => {
                  setDateDropdownOpen(false);
                  if (dp.value === 'custom') {
                    setTempDateFrom(customDateFrom || toLocalYMD(new Date()));
                    setTempDateTo(customDateTo || toLocalYMD(new Date()));
                    setCustomDateError(null);
                    setCustomDateModalOpen(true);
                  } else {
                    setDatePreset(dp.value);
                  }
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.channelDropdownItemIcon}>{dp.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.channelDropdownItemLabel, datePreset === dp.value && { color: '#FF5C39' }]}>
                    {dp.label}
                  </Text>
                  <Text style={styles.channelDropdownItemDesc}>{dp.desc}</Text>
                </View>
                {datePreset === dp.value && (
                  <View style={styles.channelDropdownCheck}>
                    <Check size={12} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Custom Date Range Modal */}
      <Modal
        visible={customDateModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCustomDateModalOpen(false)}
      >
        <TouchableOpacity
          style={[styles.dropdownOverlay, isTablet && styles.modalOverlayTablet]}
          activeOpacity={1}
          onPress={() => setCustomDateModalOpen(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={[styles.customDateSheet, isTablet && styles.customDateSheetTablet]}>
              <View style={styles.customDateHeader}>
                <Calendar size={16} color='#FF5C39' />
                <Text style={styles.customDateTitle}>Select Date Range</Text>
              </View>

              <Text style={styles.customDateLabel}>From Date</Text>
              <TextInput
                style={styles.customDateInput}
                value={tempDateFrom}
                onChangeText={setTempDateFrom}
                placeholder="YYYY-MM-DD"
                placeholderTextColor='#C4C9CE'
                keyboardType='numeric'
                maxLength={10}
              />

              <Text style={[styles.customDateLabel, { marginTop: 12 }]}>To Date</Text>
              <TextInput
                style={styles.customDateInput}
                value={tempDateTo}
                onChangeText={setTempDateTo}
                placeholder="YYYY-MM-DD"
                placeholderTextColor='#C4C9CE'
                keyboardType='numeric'
                maxLength={10}
              />

              {customDateError ? (
                <Text style={styles.customDateError} accessibilityLiveRegion="polite">
                  {customDateError}
                </Text>
              ) : null}

              <View style={styles.customDatePresets}>
                {[
                  { label: 'Last 7 days', days: 7 },
                  { label: 'Last 30 days', days: 30 },
                  { label: 'Last 90 days', days: 90 },
                ].map((p) => (
                  <TouchableOpacity
                    key={p.days}
                    style={styles.quickPresetBtn}
                    onPress={() => {
                      const to = new Date();
                      const from = new Date(); from.setDate(from.getDate() - (p.days - 1));
                      setTempDateFrom(toLocalYMD(from));
                      setTempDateTo(toLocalYMD(to));
                      setCustomDateError(null);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.quickPresetBtnText}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.customDateActions}>
                <TouchableOpacity
                  style={styles.customDateCancel}
                  onPress={() => setCustomDateModalOpen(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.customDateCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.customDateApply}
                  onPress={() => {
                    const from = parseLocalYMD(tempDateFrom);
                    const to = parseLocalYMD(tempDateTo);
                    if (!from || !to) {
                      setCustomDateError('Enter both dates as YYYY-MM-DD, e.g. 2026-11-07.');
                      return;
                    }
                    if (from > to) {
                      setCustomDateError('The “From” date must be on or before the “To” date.');
                      return;
                    }
                    setCustomDateError(null);
                    setCustomDateFrom(tempDateFrom.trim());
                    setCustomDateTo(tempDateTo.trim());
                    setDatePreset('custom');
                    setCustomDateModalOpen(false);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.customDateApplyText}>Apply Filter</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Board Layout sheet — choose how many status columns fit on screen */}
      <Modal
        visible={boardColumnsModalOpen}
        transparent
        animationType={isTablet ? 'fade' : 'slide'}
        statusBarTranslucent
        onRequestClose={() => setBoardColumnsModalOpen(false)}
      >
        <View style={[styles.boardSheetOverlay, isTablet && styles.boardSheetOverlayTablet]}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setBoardColumnsModalOpen(false)}
            accessibilityLabel="Close board layout"
          />
          <View
            style={[
              styles.boardSheet,
              isTablet ? styles.boardSheetTablet : { paddingBottom: Math.max(insets.bottom, 12) },
            ]}
          >
            {!isTablet && <View style={styles.boardSheetHandle} />}

            {/* Header */}
            <View style={styles.boardSheetHeader}>
              <View style={styles.boardSheetHeaderIcon}>
                <LayoutGrid size={18} color="#FF5C39" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.boardSheetTitle}>Board layout</Text>
                <Text style={styles.boardSheetSubtitle}>Choose how many status columns fit on screen</Text>
              </View>
              <TouchableOpacity
                onPress={() => setBoardColumnsModalOpen(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.boardModalCloseBtn}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={16} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.boardSheetScroll}
              contentContainerStyle={styles.boardSheetScrollContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {/* Live preview — true-to-scale miniature of the board on this screen */}
              <View style={styles.boardPreviewCard}>
                <View
                  style={styles.boardPreviewFrame}
                  onLayout={(e) => setBoardPreviewWidth(Math.round(e.nativeEvent.layout.width))}
                >
                  {boardPreviewWidth > 0 && (
                    <View style={styles.boardPreviewTrack}>
                      {STATUS_TABS.filter((c) => c.id !== 'all').map((col) => {
                        const miniWidth = Math.max(10, (boardPreviewWidth * columnWidth) / windowWidth);
                        return (
                          <View key={col.id} style={[styles.boardPreviewCol, { width: miniWidth }]}>
                            <View style={[styles.boardPreviewColHeader, { backgroundColor: col.accentColor }]} />
                            <View style={styles.boardPreviewCardStub} />
                            <View style={[styles.boardPreviewCardStub, { opacity: 0.7 }]} />
                            {miniWidth > 40 && <View style={[styles.boardPreviewCardStub, { opacity: 0.45 }]} />}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>

                <View style={styles.boardPreviewMeta}>
                  <Text style={styles.boardPreviewMetaStrong}>
                    {Math.min(BOARD_STATUS_COLUMN_COUNT, Math.floor(windowWidth / columnWidth) || 1)} of {BOARD_STATUS_COLUMN_COUNT} columns visible
                  </Text>
                  <Text style={styles.boardPreviewMetaMuted}>
                    {Math.round(columnWidth)}px each
                    {Math.floor(windowWidth / columnWidth) < BOARD_STATUS_COLUMN_COUNT ? ' · swipe for more' : ''}
                  </Text>
                </View>
              </View>

              {/* Auto — recommended */}
              {(() => {
                const isSelected = boardColumnsSetting === 'auto';
                return (
                  <TouchableOpacity
                    style={[styles.boardAutoTile, isSelected && styles.boardTileActive]}
                    onPress={() => handleSetBoardColumns('auto')}
                    activeOpacity={0.75}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`Auto, currently ${autoColumns} columns on this screen`}
                  >
                    <View style={[styles.boardAutoIcon, isSelected && styles.boardAutoIconActive]}>
                      <Sparkles size={18} color={isSelected ? '#FFFFFF' : '#FF5C39'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.boardAutoTitleRow}>
                        <Text style={[styles.boardTileTitle, isSelected && styles.boardTileTitleActive]}>
                          {BOARD_AUTO_PRESET.title}
                        </Text>
                        <View style={styles.boardRecommendedBadge}>
                          <Text style={styles.boardRecommendedBadgeText}>Recommended</Text>
                        </View>
                      </View>
                      <Text style={styles.boardTileDescription} numberOfLines={1}>
                        {BOARD_AUTO_PRESET.description} · {autoColumns} here
                      </Text>
                    </View>
                    <View style={[styles.boardRadio, isSelected && styles.boardRadioActive]}>
                      {isSelected && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                    </View>
                  </TouchableOpacity>
                );
              })()}

              <Text style={styles.boardSectionLabel}>Or pick a fixed layout</Text>

              {/* Fixed presets grid */}
              <View style={styles.boardTileGrid}>
                {BOARD_COLUMN_PRESETS.map((preset) => {
                  const n = preset.value as number;
                  const isSelected = boardColumnsSetting === preset.value;
                  const fits = presetFitsScreen(n);
                  const isBestFit = n === autoColumns;
                  return (
                    <TouchableOpacity
                      key={String(preset.value)}
                      style={[
                        styles.boardTile,
                        { width: isTablet ? '31.6%' : '31%' },
                        isSelected && styles.boardTileActive,
                      ]}
                      onPress={() => handleSetBoardColumns(preset.value)}
                      activeOpacity={0.75}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`${n} ${n === 1 ? 'column' : 'columns'}, ${preset.title}. ${preset.description}${fits ? '' : '. Too narrow for this screen, will scroll'}`}
                    >
                      {/* Column glyph */}
                      <View style={styles.boardTileGlyph}>
                        {Array.from({ length: n }).map((_, i) => (
                          <View
                            key={i}
                            style={[
                              styles.boardTileGlyphBar,
                              isSelected && styles.boardTileGlyphBarActive,
                            ]}
                          />
                        ))}
                      </View>

                      <View style={styles.boardTileTextRow}>
                        <Text style={[styles.boardTileCount, isSelected && styles.boardTileTitleActive]}>{n}</Text>
                        <Text style={[styles.boardTileTitle, isSelected && styles.boardTileTitleActive]} numberOfLines={1}>
                          {preset.title}
                        </Text>
                      </View>
                      <Text
                        style={[styles.boardTileDescription, !fits && styles.boardTileWarning]}
                        numberOfLines={1}
                      >
                        {fits ? preset.description : 'Narrow · scrolls'}
                      </Text>

                      {isSelected ? (
                        <View style={styles.boardTileCheck}>
                          <Check size={10} color="#FFFFFF" strokeWidth={3} />
                        </View>
                      ) : isBestFit ? (
                        <View style={styles.boardTileBestFitDot} />
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Footer */}
            <View style={styles.boardModalFooter}>
              <TouchableOpacity
                style={[styles.boardModalResetBtn, boardColumnsSetting === 'auto' && { opacity: 0.5 }]}
                onPress={() => handleSetBoardColumns('auto')}
                disabled={boardColumnsSetting === 'auto'}
                activeOpacity={0.8}
              >
                <RotateCcw size={13} color="#64748B" />
                <Text style={styles.boardModalResetBtnText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.boardModalApplyBtn}
                onPress={() => setBoardColumnsModalOpen(false)}
                activeOpacity={0.85}
              >
                <Check size={15} color="#FFFFFF" />
                <Text style={styles.boardModalApplyBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>

    {/* Main Body Container (Toolbar + Content) */}
    <View style={styles.mainBodyContainer}>
      {/* Status Tabs Navigation Bar (Shown in Tabs mode) */}
      {viewMode === 'tabs' && (
        <View style={[styles.statusTabsBarContainer, isTablet && styles.statusTabsBarContainerTablet]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusTabsBar}>
            {STATUS_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const count = tabCounts[tab.id] || 0;
              const { Icon } = tab;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.statusTabPill, isActive && { backgroundColor: '#11181C', borderColor: '#11181C' }]}
                  onPress={() => setActiveTab(tab.id)}
                  activeOpacity={0.7}
                >
                  <Icon size={14} color={isActive ? '#FFFFFF' : tab.accentColor} />
                  <Text style={[styles.statusTabLabel, isActive && styles.statusTabLabelActive]}>
                    {tab.label}
                  </Text>
                  <View style={[styles.tabBadge, isActive ? styles.tabBadgeActive : { backgroundColor: tab.accentColor }]}>
                    <Text style={[styles.tabBadgeText, isActive && { color: '#11181C' }]}>{count}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Content View */}
      {ordersError && orders.length === 0 ? (
        <ErrorState
          errorType={ordersError.type}
          message={ordersError.message}
          statusCode={ordersError.statusCode}
          onRetry={() => fetchOrders(false)}
          isRetrying={loading || refreshing}
        />
      ) : viewMode === 'tabs' ? (
        loading ? (
          <ScrollView
            contentContainerStyle={[styles.tabOrdersList, isTablet && styles.tabOrdersListTablet]}
            showsVerticalScrollIndicator={false}
          >
            {isTablet ? (
              <View style={{ gap: 14 }}>
                <View style={{ flexDirection: 'row', gap: 14 }}>
                  <View style={{ flex: 1 }}><OrderCardSkeletonItem /></View>
                  <View style={{ flex: 1 }}><OrderCardSkeletonItem /></View>
                </View>
                <View style={{ flexDirection: 'row', gap: 14 }}>
                  <View style={{ flex: 1 }}><OrderCardSkeletonItem /></View>
                  <View style={{ flex: 1 }}><OrderCardSkeletonItem /></View>
                </View>
              </View>
            ) : (
              <>
                <OrderCardSkeletonItem />
                <OrderCardSkeletonItem />
                <OrderCardSkeletonItem />
                <OrderCardSkeletonItem />
              </>
            )}
          </ScrollView>
        ) : activeTabOrders.length === 0 ? (
          <ScrollView
            contentContainerStyle={[styles.centerEmpty, { flex: undefined, flexGrow: 1, paddingBottom: 120 }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF5C39" colors={['#FF5C39']} />}
          >
            {(() => {
              const q = searchQuery.trim();
              const filtersOn = activeFilterCount > 0 || datePreset !== 'today';
              const tab = STATUS_TABS.find((t) => t.id === activeTab);
              const EmptyIcon = q ? Search : tab?.Icon || ShoppingBag;
              const title = q
                ? 'No matching orders'
                : activeTab === 'new'
                ? 'No new orders'
                : activeTab === 'kitchen'
                ? 'Kitchen is clear'
                : filtersOn
                ? 'No orders match your filters'
                : 'No orders yet';
              const message = q
                ? `Nothing matches “${q}”. Try an order number, customer name, phone or item.`
                : activeTab === 'new'
                ? 'New orders will appear here as soon as they come in.'
                : filtersOn
                ? 'Try clearing filters or choosing a wider date range.'
                : 'Pull down to refresh.';
              return (
                <>
                  <View style={styles.emptyIconCircle}>
                    <EmptyIcon size={30} color="#9BA1A6" />
                  </View>
                  <Text style={styles.emptyTitle}>{title}</Text>
                  <Text style={styles.emptySubtitle}>{message}</Text>
                  {(q || filtersOn) && (
                    <TouchableOpacity
                      style={styles.emptyClearBtn}
                      onPress={() => {
                        setSearchQuery('');
                        resetAllFilters();
                        setDatePreset('today');
                      }}
                      activeOpacity={0.8}
                    >
                      <RotateCcw size={14} color="#11181C" />
                      <Text style={styles.emptyClearBtnText}>Clear search & filters</Text>
                    </TouchableOpacity>
                  )}
                </>
              );
            })()}
          </ScrollView>
        ) : (
          <FlatList
            key={`orders-tab-grid-${tabColumns}`}
            data={activeTabOrders}
            extraData={updatingIds}
            keyExtractor={(item) => item._id}
            numColumns={tabColumns}
            contentContainerStyle={[
              styles.tabOrdersList,
              isTablet && styles.tabOrdersListTablet,
              tabColumns > 1 && { paddingHorizontal: (isTablet ? 24 : 16) - 7 },
            ]}
            onScroll={handleListScroll}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF5C39" colors={['#FF5C39']} />}
            renderItem={({ item }) => (
              // Fixed-width cells: a lone card on the last row keeps its column width instead of stretching.
              <View style={tabColumns > 1 ? { width: `${100 / tabColumns}%`, paddingHorizontal: 7 } : undefined}>
                <OrderCardItem
                  order={item}
                  onPress={(o) => { setSelectedOrder(o); setDetailModalVisible(true); }}
                  onAssignDelivery={(o) => { setSelectedOrder(o); setAssignModalVisible(true); }}
                  onUpdateStatus={handleUpdateStatus}
                  onPrint={handlePrintOrder}
                  onEditDeliveryTime={handleOpenEditDeliveryTime}
                  paperRollSize={paperRollSize}
                  isUpdating={updatingIds.has(item._id)}
                />
              </View>
            )}
          />
        )
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.kanbanScrollView}
          contentContainerStyle={[
            styles.kanbanBoard,
            isTablet && styles.kanbanBoardTablet,
          ]}
          decelerationRate="fast"
          snapToInterval={snapInterval}
          snapToAlignment="start"
        >
          {STATUS_TABS.filter((c) => c.id !== 'all').map((col) => {
            const ordersInCol = col.id === 'pickup'
              ? filteredOrders.filter((o) => isOrderPickup(o) && o.status === 'ready_for_pickup')
              : col.id === 'kitchen'
              ? filteredOrders.filter((o) => o.status === 'confirmed' || o.status === 'preparing')
              : filteredOrders.filter((o) => col.statuses.includes(o.status));
            const { Icon, accentColor, label, subtitle } = col;
            return (
              <View
                key={col.id}
                style={[
                  styles.kanbanColumn,
                  isTablet && styles.kanbanColumnTablet,
                  {
                    width: columnWidth,
                    minWidth: columnWidth,
                    maxWidth: columnWidth,
                    flexBasis: columnWidth,
                    flexShrink: 0,
                    flexGrow: 0,
                    height: '100%',
                  },
                ]}
              >
                <View
                  style={[
                    styles.kanbanColumnHeader,
                    isTablet && styles.kanbanColumnHeaderTablet,
                    isCompact && styles.kanbanColumnHeaderCompact,
                    { borderLeftColor: accentColor },
                  ]}
                >
                  <Text
                    style={[
                      styles.kanbanColumnTitle,
                      isTablet && styles.kanbanColumnTitleTablet,
                      isCompact && styles.kanbanColumnTitleCompact,
                      { flex: 1 },
                    ]}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                  <View
                    style={[
                      styles.kanbanBadge,
                      isTablet && styles.kanbanBadgeTablet,
                      isCompact && styles.kanbanBadgeCompact,
                      { backgroundColor: accentColor },
                    ]}
                  >
                    <Text
                      style={[
                        styles.kanbanBadgeText,
                        isTablet && styles.kanbanBadgeTextTablet,
                        isCompact && styles.kanbanBadgeTextCompact,
                      ]}
                    >
                      {ordersInCol.length}
                    </Text>
                  </View>
                </View>
                {loading ? (
                  <View style={{ padding: 10, gap: 10, flex: 1 }}>
                    <OrderCardSkeletonItem />
                    <OrderCardSkeletonItem />
                  </View>
                ) : ordersInCol.length === 0 ? (
                  <View style={[styles.columnCenter, { flex: 1 }]}>
                    <Icon size={isCompact ? 32 : (isTablet ? 42 : 36)} color="#EEEEEE" />
                    <Text style={[styles.emptyColumnText, isTablet && { fontSize: 13 }, isCompact && { fontSize: 11 }]}>
                      No orders in {label.toLowerCase()}
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={ordersInCol}
                    keyExtractor={(item) => item._id}
                    showsVerticalScrollIndicator={false}
                    style={{ flex: 1 }}
                    onScroll={handleListScroll}
                    scrollEventThrottle={16}
                    contentContainerStyle={[
                      styles.kanbanCardList,
                      isTablet && styles.kanbanCardListTablet,
                      isCompact && { padding: 6, gap: 6 },
                      { paddingBottom: isTablet ? 95 : 85 },
                    ]}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColor} colors={[accentColor]} />}
                    extraData={updatingIds}
                    renderItem={({ item }) => (
                      <OrderCardItem
                        order={item}
                        onPress={(o) => { setSelectedOrder(o); setDetailModalVisible(true); }}
                        onAssignDelivery={(o) => { setSelectedOrder(o); setAssignModalVisible(true); }}
                        onUpdateStatus={handleUpdateStatus}
                        onPrint={handlePrintOrder}
                        onEditDeliveryTime={handleOpenEditDeliveryTime}
                        paperRollSize={paperRollSize}
                        compact={isCompact}
                        isUpdating={updatingIds.has(item._id)}
                      />
                    )}
                  />
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>

      <OrderDetailModal
        visible={detailModalVisible}
        order={selectedOrder}
        onClose={() => setDetailModalVisible(false)}
        onAssignDelivery={(o) => { setSelectedOrder(o); setAssignModalVisible(true); }}
        onUpdateStatus={handleUpdateStatus}
        onCancelOrder={async (orderId) => {
          await executeUpdateStatus(orderId, 'cancelled');
        }}
        onEditDeliveryTime={handleOpenEditDeliveryTime}
        paperRollSize={paperRollSize}
      />
      <AssignDeliveryModal
        visible={assignModalVisible}
        order={selectedOrder}
        onClose={() => setAssignModalVisible(false)}
        onConfirmAssign={handleAssignConfirm}
      />
      <ConfirmModal
        visible={cancelModalVisible}
        title="Cancel Order"
        message={
          orderToCancel?.orderNumber || orderToCancel?._id
            ? `Are you sure you want to cancel order #${orderToCancel.orderNumber || orderToCancel._id.substring(0, 7).toUpperCase()}? This action cannot be undone.`
            : 'Are you sure you want to cancel this order? This action cannot be undone.'
        }
        confirmText="Yes"
        cancelText="No"
        isDestructive={true}
        onConfirm={async () => {
          if (orderToCancel?._id) {
            const id = orderToCancel._id;
            setOrderToCancel(null);
            setCancelModalVisible(false);
            await executeUpdateStatus(id, 'cancelled');
          }
        }}
        onClose={() => {
          setCancelModalVisible(false);
          setOrderToCancel(null);
        }}
      />

      {/* Edit Expected Delivery Time Modal */}
      <Modal
        visible={deliveryTimeModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          if (!savingDeliveryTime) {
            setDeliveryTimeModalOpen(false);
            setDeliveryTimeOrder(null);
          }
        }}
      >
        <TouchableOpacity
          style={[styles.dropdownOverlay, isTablet && styles.modalOverlayTablet]}
          activeOpacity={1}
          onPress={() => {
            if (!savingDeliveryTime) {
              setDeliveryTimeModalOpen(false);
              setDeliveryTimeOrder(null);
            }
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.dtModalContainer, isTablet && styles.dtModalContainerTablet]}
          >
            {/* Header */}
            <View style={styles.dtModalHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Clock size={18} color="#2563EB" />
                  <Text style={styles.dtModalTitle}>Expected Delivery Time</Text>
                </View>
                {deliveryTimeOrder && (
                  <Text style={styles.dtModalSubtitle} numberOfLines={1}>
                    Order #{deliveryTimeOrder.orderNumber || deliveryTimeOrder._id?.substring(0, 7).toUpperCase()} • {getCustomerName(deliveryTimeOrder)}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => {
                  if (!savingDeliveryTime) {
                    setDeliveryTimeModalOpen(false);
                    setDeliveryTimeOrder(null);
                  }
                }}
                style={styles.dtModalCloseBtn}
                disabled={savingDeliveryTime}
              >
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Body */}
            <View style={styles.dtModalBody}>
              <Text style={styles.dtSectionLabel}>Set Delivery Time (Minutes)</Text>

              {/* Number Input with Stepper */}
              <View style={styles.dtInputRow}>
                <TouchableOpacity
                  style={styles.dtStepperBtn}
                  onPress={() => {
                    const current = parseInt(editingDeliveryTimeInput, 10) || 30;
                    setEditingDeliveryTimeInput(String(Math.max(5, current - 5)));
                  }}
                  disabled={savingDeliveryTime}
                >
                  <Minus size={18} color="#1E293B" />
                </TouchableOpacity>

                <View style={styles.dtInputWrapper}>
                  <TextInput
                    style={styles.dtNumberInput}
                    keyboardType="numeric"
                    value={editingDeliveryTimeInput}
                    onChangeText={setEditingDeliveryTimeInput}
                    editable={!savingDeliveryTime}
                    selectTextOnFocus
                  />
                  <Text style={styles.dtInputSuffix}>mins</Text>
                </View>

                <TouchableOpacity
                  style={styles.dtStepperBtn}
                  onPress={() => {
                    const current = parseInt(editingDeliveryTimeInput, 10) || 30;
                    setEditingDeliveryTimeInput(String(Math.min(300, current + 5)));
                  }}
                  disabled={savingDeliveryTime}
                >
                  <Plus size={18} color="#1E293B" />
                </TouchableOpacity>
              </View>

              {/* Quick Presets */}
              <Text style={[styles.dtSectionLabel, { marginTop: 14 }]}>Quick Presets</Text>
              <View style={styles.dtPresetsRow}>
                {[15, 20, 30, 45, 60].map((mins) => {
                  const isSelected = editingDeliveryTimeInput === String(mins);
                  return (
                    <TouchableOpacity
                      key={mins}
                      style={[styles.dtPresetPill, isSelected && styles.dtPresetPillActive]}
                      onPress={() => setEditingDeliveryTimeInput(String(mins))}
                      disabled={savingDeliveryTime}
                    >
                      <Text style={[styles.dtPresetPillText, isSelected && styles.dtPresetPillTextActive]}>
                        {mins}m
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

            </View>

            {/* Footer */}
            <View style={styles.dtModalFooter}>
              <TouchableOpacity
                style={styles.dtCancelBtn}
                onPress={() => {
                  setDeliveryTimeModalOpen(false);
                  setDeliveryTimeOrder(null);
                }}
                disabled={savingDeliveryTime}
              >
                <Text style={styles.dtCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.dtSaveBtn, savingDeliveryTime && { opacity: 0.7 }]}
                onPress={() => handleSaveDeliveryTime()}
                disabled={savingDeliveryTime}
              >
                {savingDeliveryTime ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.dtSaveBtnText}>Save Time</Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  expectedDeliveryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 6,
  },
  expectedDeliveryRowTablet: {
    marginBottom: 8,
  },
  expectedDeliveryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 7,
    flexShrink: 1,
  },
  expectedDeliveryBadgeTablet: {
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 8,
  },
  expectedDeliveryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  editDeliveryTimeBtn: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 7,
  },
  editDeliveryTimeBtnTablet: {
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 8,
  },
  editDeliveryTimeBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#334155',
  },
  dtModalContainer: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
  },
  dtModalContainerTablet: {
    width: '90%',
    maxWidth: 460,
    borderRadius: 16,
    alignSelf: 'center',
    marginBottom: 'auto',
    marginTop: 'auto',
    paddingBottom: 0,
  },
  dtModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dtModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  dtModalSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
  },
  dtModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dtModalBody: {
    padding: 18,
  },
  dtSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  dtInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginVertical: 4,
  },
  dtStepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dtInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
    minWidth: 130,
    justifyContent: 'center',
  },
  dtNumberInput: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    padding: 0,
    minWidth: 45,
  },
  dtInputSuffix: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
    marginLeft: 6,
  },
  dtPresetsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  dtPresetPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dtPresetPillActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  dtPresetPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  dtPresetPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  dtAdjustPill: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dtAdjustPillText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  dtModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#F8FAFC',
  },
  dtCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  dtCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  dtSaveBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dtSaveBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  stickySearchWrapper: {
    zIndex: 20,
    width: '100%',
  },
  stickySearchWrapperElevated: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    
  },
  modalsOverlayWrapper: {
    position: 'absolute',
    width: 0,
    height: 0,
    overflow: 'hidden',
  },
  mainBodyContainer: {
    flex: 1,
    width: '100%',
    backgroundColor: '#F8F9FA',
  },
  pageHeader: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#EEEEEE',
  },
  pageTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pageTitle: { fontSize: 22, fontWeight: '800', color: '#11181C', letterSpacing: -0.5 },
  homeBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFF0EC',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  toggleBtnIconOnly: { paddingHorizontal: 0, width: 36, justifyContent: 'center' },
  toggleBtnIconWithChevron: { width: 50, gap: 2 },
  filterBtnIconOnly: { width: 44, paddingHorizontal: 0, justifyContent: 'center', flexShrink: 0 },
  filterBadgeCorner: {
    position: 'absolute',
    top: -6,
    right: -6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#11181C',
  },
  mobileFilterRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  flex1: { flex: 1 },
  topBarBtnMobile: { justifyContent: 'center', minWidth: 0 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5',
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, gap: 4,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  liveText: { fontSize: 11, fontWeight: '700', color: '#065F46' },
  pageSubtitle: { fontSize: 12, color: '#9BA1A6', marginTop: 2 },
  headerRightControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  viewToggleContainer: {
    flexDirection: 'row', backgroundColor: '#F1F3F5', borderRadius: 12, padding: 4, gap: 2,
    borderWidth: 1, borderColor: '#EEEEEE',
  },
  toggleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 34, borderRadius: 9,
  },
  toggleBtnActive: { backgroundColor: '#FF5C39' },
  toggleBtnText: { fontSize: 13, fontWeight: '700', color: '#687076' },
  toggleBtnTextActive: { color: '#FFFFFF' },
  refreshBtn: {
    padding: 8, borderRadius: 8, backgroundColor: '#F8F9FA',
    borderWidth: 1, borderColor: '#EEEEEE',
  },
  controlsRow: {
    backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingBottom: 10, paddingTop: 8,
    gap: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F9FA',
    borderRadius: 12, borderWidth: 1, borderColor: '#EEEEEE', paddingHorizontal: 12, gap: 8, height: 44,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14, color: '#11181C', height: 44, paddingVertical: 0 },
  typeFilters: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  typeChipText: { fontSize: 12, fontWeight: '700' },
  typeChipCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeChipCountText: { fontSize: 10, fontWeight: '800' },

  // Channel dropdown & date filter
  searchAndChannelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EEEEEE',
    flexShrink: 0,
  },
  filterBtnActive: {
    backgroundColor: '#FF5C39',
    borderColor: '#FF5C39',
  },
  filterBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#11181C',
  },
  filterBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  filterBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FF5C39',
  },
  dateDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EEEEEE',
    minWidth: 105,
    flexShrink: 0,
  },
  dateDropdownBtnActive: {
    borderColor: '#FED7AA',
    backgroundColor: '#FFF7ED',
  },
  dateDropdownBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#687076',
    flex: 1,
  },
  channelDropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EEEEEE',
    width: 112,
    flexShrink: 0,
  },
  channelDropdownBtnActive: {
    borderColor: '#FED7AA',
    backgroundColor: '#FFF7ED',
  },
  channelDropdownBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#687076',
    flex: 1,
  },
  activeFiltersRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeFiltersList: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeFilterCountTag: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#1E293B',
  },
  activeFilterCountTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  activeFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF4F2',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  activeFilterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FF5C39',
  },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  clearAllBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EF4444',
  },
  filterModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  filterModalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    display: 'flex',
    flexDirection: 'column',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 16,
  },
  filterModalContainerTablet: {
    borderRadius: 24,
    maxWidth: 620,
    alignSelf: 'center',
    maxHeight: '85%',
    width: '100%',
  },
  filterDragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  filterModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  filterModalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  filterModalIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFF4F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  filterModalSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
    fontWeight: '500',
  },
  filterModalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterResetTextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
  },
  filterResetTextBtnLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
  },
  filterModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterModalBody: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  filterSection: {
    marginBottom: 20,
  },
  filterSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  filterSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  filterSectionSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  filterGrid2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterOptionCard: {
    flex: 1,
    minWidth: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  filterOptionCardActive: {
    borderColor: '#FF5C39',
    backgroundColor: '#FFF4F2',
  },
  filterOptionCardEmoji: {
    fontSize: 16,
  },
  filterOptionCardLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  filterOptionCardLabelActive: {
    color: '#FF5C39',
    fontWeight: '800',
  },
  filterOptionCardDesc: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1,
  },
  filterOptionCountBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterOptionCountBadgeActive: {
    backgroundColor: '#FED7AA',
  },
  filterOptionCountText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
  },
  filterOptionCountTextActive: {
    color: '#C2410C',
  },
  filterChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  filterChipActive: {
    borderColor: '#FF5C39',
    backgroundColor: '#FFF4F2',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#FF5C39',
    fontWeight: '800',
  },
  inlineCustomDateBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  inlineDateRow: {
    flexDirection: 'row',
    gap: 10,
  },
  filterModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  filterFooterResetBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterFooterResetBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  filterFooterApplyBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#FF5C39',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF5C39',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  filterFooterApplyBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  channelDropdownSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  channelDropdownTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#11181C',
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  channelDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
    marginBottom: 6,
    backgroundColor: '#F8F9FA',
  },
  channelDropdownItemActive: {
    borderColor: '#FF5C39',
    backgroundColor: '#FFF4F2',
  },
  channelDropdownItemIcon: {
    fontSize: 22,
  },
  channelDropdownItemLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#11181C',
  },
  channelDropdownItemDesc: {
    fontSize: 11,
    color: '#9BA1A6',
    marginTop: 2,
  },
  channelDropdownCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FF5C39',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Date filter
  dateFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  datePresetList: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  datePresetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  datePresetChipActive: {
    backgroundColor: '#11181C',
    borderColor: '#11181C',
  },
  datePresetChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#687076',
  },
  datePresetChipTextActive: {
    color: '#FFFFFF',
  },
  todayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },

  // Custom date range modal
  customDateSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  customDateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 18,
  },
  customDateTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#11181C',
    letterSpacing: -0.2,
  },
  customDateLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#687076',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  customDateInput: {
    height: 44,
    borderWidth: 1.5,
    borderColor: '#EEEEEE',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#11181C',
    fontWeight: '600',
    backgroundColor: '#F8F9FA',
  },
  customDatePresets: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    flexWrap: 'wrap',
  },
  quickPresetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  quickPresetBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#687076',
  },
  customDateActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  customDateCancel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  customDateCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#687076',
  },
  customDateApply: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#FF5C39',
  },
  customDateApplyText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  statusTabsBarContainer: {
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#EEEEEE', paddingVertical: 8, paddingHorizontal: 12,
  },
  statusTabsBar: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  statusTabPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 38,
    borderRadius: 19, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E6E8EB',
  },
  statusTabLabel: { fontSize: 13, fontWeight: '700', color: '#11181C' },
  statusTabLabelActive: { color: '#FFFFFF' },
  tabBadge: {
    borderRadius: 11, paddingHorizontal: 7, height: 22, minWidth: 22, alignItems: 'center', justifyContent: 'center',
  },
  tabBadgeActive: { backgroundColor: '#FFFFFF' },
  tabBadgeText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },

  tabOrdersList: { padding: 16, gap: 14, paddingBottom: 110 },
  centerLoader: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  centerEmpty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#11181C', marginTop: 8 },
  emptySubtitle: { fontSize: 14, color: '#687076', textAlign: 'center', lineHeight: 20, maxWidth: 360 },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EEEEEE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyClearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E6E8EB',
  },
  emptyClearBtnText: { fontSize: 14, fontWeight: '700', color: '#11181C' },

  kanbanScrollView: {
    flex: 1,
    width: '100%',
  },
  kanbanBoard: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    gap: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
    flexGrow: 1,
  },
  kanbanColumn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    borderWidth: 0,
    borderRightWidth: 1,
    borderRightColor: '#EBEBEB',
    overflow: 'hidden',
    height: '100%',
    flex: 1,
  },
  kanbanColumnHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10, borderLeftWidth: 4,
    backgroundColor: '#FAFAFA', borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  kanbanColumnTitle: { fontSize: 13, fontWeight: '700', color: '#11181C' },
  kanbanBadge: { borderRadius: 20, minWidth: 26, height: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  kanbanBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  columnCenter: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 8 },
  emptyColumnText: { fontSize: 12, color: '#C4C9CE', textAlign: 'center', marginTop: 4 },
  kanbanCardList: { padding: 10, gap: 10 },

  kanbanCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    padding: 14,
    paddingTop: 18,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  cardTopStatusStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
    zIndex: 1,
  },
  cardTopStatusStripTablet: {
    height: 6,
  },
  kanbanCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  kanbanOrderIdCol: { gap: 2 },
  kanbanOrderIdRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kanbanOrderId: { fontSize: 16, fontWeight: '800', color: '#11181C', letterSpacing: -0.2 },
  kanbanPaymentBelowId: { fontSize: 12, fontWeight: '600', color: '#687076', marginTop: 3 },
  paidBadge: { backgroundColor: '#ECFDF5', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  paidBadgeText: { fontSize: 10, fontWeight: '800', color: '#065F46', letterSpacing: 0.4 },
  pendingBadge: { backgroundColor: '#FFF8E7', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  pendingBadgeText: { fontSize: 10, fontWeight: '800', color: '#B45309', letterSpacing: 0.4 },
  failedBadge: { backgroundColor: '#FEF2F2', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  failedBadgeText: { fontSize: 10, fontWeight: '800', color: '#DC2626', letterSpacing: 0.4 },
  refundedBadge: { backgroundColor: '#F3E8FF', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  refundedBadgeText: { fontSize: 10, fontWeight: '800', color: '#7C3AED', letterSpacing: 0.4 },
  kanbanAmountRow: { alignItems: 'flex-end' },
  kanbanAmount: { fontSize: 18, fontWeight: '800', color: '#11181C', letterSpacing: -0.3 },
  kanbanItemCount: { fontSize: 12, fontWeight: '600', color: '#687076' },

  kanbanDivider: { height: 1, backgroundColor: '#F0F0F0', marginVertical: 12 },
  kanbanCustomerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  kanbanAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#FFF0EC', alignItems: 'center', justifyContent: 'center' },
  kanbanAvatarText: { fontSize: 14, fontWeight: '800', color: '#FF5C39' },
  kanbanCustomerName: { fontSize: 15, fontWeight: '700', color: '#11181C' },
  kanbanCustomerPhone: { fontSize: 12, color: '#687076', marginTop: 1 },
  kanbanAddressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
    gap: 8,
    borderRadius: 10,
    backgroundColor: '#F8FAFF',
  },
  addressPinIcon: {
    marginTop: 2,
  },
  kanbanAddressHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  kanbanAddressText: {
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '500',
    lineHeight: 18,
  },
  kanbanTypeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  scheduledTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FEF3C7', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3.5,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  scheduledTagText: { fontSize: 11, fontWeight: '800', color: '#92400E' },
  scheduledCardBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FEF3C7', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  scheduledCardBadgeTablet: {
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8,
  },
  scheduledCardBadgeText: { fontSize: 11, fontWeight: '800', color: '#92400E' },
  scheduledCardBadgeTextTablet: { fontSize: 12, fontWeight: '800' },
  pickupTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FFF7ED', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3.5,
    borderWidth: 1, borderColor: '#FED7AA',
  },
  pickupTagText: { fontSize: 11, fontWeight: '700', color: '#EA580C' },
  deliveryTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EFF6FF', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3.5,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  deliveryTagText: { fontSize: 11, fontWeight: '700', color: '#2563EB' },
  dineInTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F5F3FF', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3.5,
    borderWidth: 1, borderColor: '#DDD6FE',
  },
  dineInTagText: { fontSize: 11, fontWeight: '700', color: '#7C3AED' },
  takeawayTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FEF3C7', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3.5,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  takeawayTagText: { fontSize: 11, fontWeight: '700', color: '#B45309' },
  riderBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F8F9FA', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#EEEEEE' },
  riderText: { fontSize: 11, fontWeight: '600', color: '#687076' },
  kanbanFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kanbanDateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  kanbanDate: { fontSize: 11, fontWeight: '500', color: '#9BA1A6' },
  orderTypeBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  orderTypeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  viewItemsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  viewItemsBtnText: { fontSize: 11, fontWeight: '800', color: '#687076', letterSpacing: 0.4 },
  itemsList: { marginTop: 2, marginBottom: 4, gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#F8F9FA' },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemQty: { fontSize: 13, fontWeight: '800', color: '#FF5C39', width: 26 },
  itemName: { flex: 1, fontSize: 13, fontWeight: '600', color: '#11181C' },
  itemPrice: { fontSize: 13, fontWeight: '700', color: '#11181C' },
  noteRow: { flexDirection: 'row', marginTop: 2, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#EEEEEE' },
  noteLabel: { fontSize: 12, fontWeight: '800', color: '#B45309' },
  noteText: { fontSize: 12, color: '#11181C', flex: 1, lineHeight: 17 },
  actionButtonsRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  actionsUpdating: { opacity: 0.25 },
  updatingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 12,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  updatingText: { fontSize: 13, fontWeight: '800', color: '#11181C' },
  customDateError: { fontSize: 12, fontWeight: '600', color: '#EF4444', marginTop: 10, lineHeight: 16 },
  acceptBtn: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1B942F', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 10 },
  acceptBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  rejectBtn: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#FECACA', borderRadius: 12, paddingVertical: 11 },
  rejectBtnText: { color: '#EF4444', fontSize: 14, fontWeight: '800' },
  outForDeliveryBtn: { flex: 1.3, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#7C3AED', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 10 },
  outForDeliveryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  assignDriverIconBtn: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FF5C39', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 10 },
  assignDriverText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  printIconBtn: {
    width: 44,
    height: 44,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  printFullBtn: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 11,
  },
  printFullBtnText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
  },
  itemMeta: {
    fontSize: 12,
    color: '#687076',
    marginTop: 2,
  },

  /* Watermark Stamp Styles — kept subtle so the card stays readable */
  stampOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    opacity: 0.45,
  },
  stampBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 2.5,
    borderStyle: 'dashed',
    transform: [{ rotate: '-14deg' }],
  },
  stampSuccess: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  stampCancelled: {
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  stampText: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  stampSuccessText: {
    color: '#10B981',
  },
  stampCancelledText: {
    color: '#EF4444',
  },

  /* Tablet Responsive Layout Enhancements (width >= 768px) */
  kanbanBoardTablet: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    gap: 0,
    alignItems: 'stretch',
    flexGrow: 1,
  },
  kanbanColumnTablet: {
    borderRadius: 0,
    borderWidth: 0,
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
  },
  kanbanColumnHeaderTablet: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderLeftWidth: 5,
  },
  kanbanColumnTitleTablet: {
    fontSize: 15,
  },
  kanbanColumnSubtitleTablet: {
    fontSize: 11,
  },
  kanbanBadgeTablet: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
  },
  kanbanBadgeTextTablet: {
    fontSize: 13,
  },
  kanbanCardListTablet: {
    padding: 12,
    gap: 12,
  },
  kanbanCardTablet: {
    padding: 18,
    paddingTop: 22,
    borderRadius: 18,
  },
  kanbanOrderIdTablet: {
    fontSize: 18,
  },
  kanbanPaymentBelowIdTablet: {
    fontSize: 13,
  },
  kanbanAmountTablet: {
    fontSize: 21,
  },
  kanbanItemCountTablet: {
    fontSize: 13,
  },
  kanbanRestaurantTablet: {
    fontSize: 14,
  },
  kanbanCustomerRowTablet: {
    marginBottom: 12,
    gap: 12,
  },
  kanbanAvatarTablet: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  kanbanAvatarTextTablet: {
    fontSize: 16,
  },
  kanbanCustomerNameTablet: {
    fontSize: 16,
  },
  kanbanCustomerPhoneTablet: {
    fontSize: 13,
  },
  kanbanAddressRowTablet: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 10,
  },
  kanbanAddressHeaderTablet: {
    fontSize: 11,
  },
  kanbanAddressTextTablet: {
    fontSize: 14,
    lineHeight: 20,
  },
  kanbanTypeRowTablet: {
    marginBottom: 12,
    gap: 8,
  },
  actionButtonsRowTablet: {
    gap: 10,
    marginTop: 14,
  },
  acceptBtnTablet: {
    minHeight: 50,
    paddingVertical: 13,
    borderRadius: 14,
  },
  acceptBtnTextTablet: {
    fontSize: 15,
  },
  rejectBtnTablet: {
    minHeight: 50,
    paddingVertical: 13,
    borderRadius: 14,
  },
  rejectBtnTextTablet: {
    fontSize: 15,
  },
  outForDeliveryBtnTablet: {
    minHeight: 50,
    paddingVertical: 13,
    borderRadius: 14,
  },
  outForDeliveryBtnTextTablet: {
    fontSize: 15,
  },
  assignDriverIconBtnTablet: {
    minHeight: 50,
    paddingVertical: 13,
    borderRadius: 14,
  },
  assignDriverTextTablet: {
    fontSize: 15,
  },
  printFullBtnTablet: {
    minHeight: 50,
    paddingVertical: 13,
    borderRadius: 14,
  },
  printFullBtnTextTablet: {
    fontSize: 15,
  },
  printIconBtnTablet: {
    width: 50,
    height: 50,
    borderRadius: 14,
  },
  tabOrdersListTablet: {
    maxWidth: 1300,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 18,
    gap: 14,
  },
  ordersColumnWrapper: {
    gap: 14,
  },
  orderGridItemWrapper: {
    flex: 1,
  },
  pageHeaderTablet: {
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  controlsRowTablet: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  searchAndChannelRowTablet: {
    gap: 12,
  },
  statusTabsBarContainerTablet: {
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  modalOverlayTablet: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  channelDropdownSheetTablet: {
    maxWidth: 480,
    width: '100%',
    borderRadius: 20,
    alignSelf: 'center',
  },
  customDateSheetTablet: {
    maxWidth: 480,
    width: '100%',
    borderRadius: 20,
    alignSelf: 'center',
  },
  kanbanRestaurantRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kanbanRestaurant: {
    fontSize: 12,
    color: '#FF5C39',
    fontWeight: '700',
  },
  sourceBadgeContainer: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sourceBadgeContainerTablet: {
    marginTop: 6,
  },
  sourceBadgeExternal: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  sourceBadgeExternalTablet: {
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 7,
  },
  sourceBadgeTextExternal: {
    color: '#B45309',
    fontSize: 11,
    fontWeight: '700',
  },
  sourceBadgeTextExternalTablet: {
    fontSize: 12,
  },
  sourceBadgeKrifoo: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  sourceBadgeKrifooTablet: {
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 7,
  },
  sourceBadgeTextKrifoo: {
    color: '#2563EB',
    fontSize: 11,
    fontWeight: '700',
  },
  sourceBadgeTextKrifooTablet: {
    fontSize: 12,
  },
  sourceFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginRight: 6,
  },
  sourceFilterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  sourceFilterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  sourceFilterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  /* Board View Layout & Columns Customizer Styles */
  headerBoardLayoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FFF4F2',
    borderWidth: 1,
    borderColor: '#FFE4DE',
  },
  headerBoardLayoutBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FF5C39',
  },
  boardToolbarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    gap: 8,
  },
  boardToolbarContainerTablet: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  boardToolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  boardToolbarLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  boardToolbarLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  boardColPillsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingRight: 6,
  },
  colPill: {
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 7,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colPillActive: {
    backgroundColor: '#FF5C39',
    borderColor: '#FF5C39',
  },
  colPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  colPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  boardSettingsTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 7,
    backgroundColor: '#FFF4F2',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  boardSettingsTriggerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF5C39',
  },
  boardSettingsTriggerBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  boardSettingsTriggerBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#EA580C',
  },
  /* Board Layout sheet */
  boardSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  boardSheetOverlayTablet: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  boardSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    width: '100%',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 16,
  },
  boardSheetTablet: {
    width: 560,
    maxWidth: '100%',
    maxHeight: '86%',
    borderRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  },
  boardSheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    marginTop: 10,
  },
  boardSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
  },
  boardSheetHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFF0EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardSheetTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#11181C',
    letterSpacing: -0.2,
  },
  boardSheetSubtitle: {
    fontSize: 12.5,
    color: '#687076',
    marginTop: 2,
  },
  boardModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardSheetScroll: {
    flexGrow: 0,
  },
  boardSheetScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },

  // Live preview
  boardPreviewCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EEF2F6',
    padding: 12,
  },
  boardPreviewFrame: {
    height: 92,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  boardPreviewTrack: {
    flexDirection: 'row',
    height: '100%',
  },
  boardPreviewCol: {
    height: '100%',
    paddingHorizontal: 3,
    paddingTop: 4,
    gap: 4,
    borderRightWidth: 1,
    borderRightColor: '#F1F5F9',
  },
  boardPreviewColHeader: {
    height: 6,
    borderRadius: 3,
  },
  boardPreviewCardStub: {
    height: 16,
    borderRadius: 4,
    backgroundColor: '#EEF2F6',
  },
  boardPreviewMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 10,
  },
  boardPreviewMetaStrong: {
    fontSize: 13,
    fontWeight: '700',
    color: '#11181C',
  },
  boardPreviewMetaMuted: {
    fontSize: 12,
    color: '#687076',
  },

  // Auto tile
  boardAutoTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E6E8EB',
    backgroundColor: '#FFFFFF',
  },
  boardAutoIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFF0EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardAutoIconActive: {
    backgroundColor: '#FF5C39',
  },
  boardAutoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  boardRecommendedBadge: {
    backgroundColor: '#ECFDF5',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  boardRecommendedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
    letterSpacing: 0.2,
  },
  boardRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardRadioActive: {
    backgroundColor: '#FF5C39',
    borderColor: '#FF5C39',
  },

  boardSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9BA1A6',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 18,
    marginBottom: 10,
  },

  // Fixed preset tiles
  boardTileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  boardTile: {
    minHeight: 104,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E6E8EB',
    backgroundColor: '#FFFFFF',
  },
  boardTileActive: {
    borderColor: '#FF5C39',
    backgroundColor: '#FFF6F3',
  },
  boardTileGlyph: {
    flexDirection: 'row',
    gap: 2,
    height: 26,
    padding: 3,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    marginBottom: 8,
  },
  boardTileGlyphBar: {
    flex: 1,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
  },
  boardTileGlyphBarActive: {
    backgroundColor: '#FF5C39',
  },
  boardTileTextRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  boardTileCount: {
    fontSize: 18,
    fontWeight: '800',
    color: '#11181C',
  },
  boardTileTitle: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#11181C',
  },
  boardTileTitleActive: {
    color: '#FF5C39',
  },
  boardTileDescription: {
    fontSize: 11,
    color: '#687076',
    marginTop: 2,
  },
  boardTileWarning: {
    color: '#B45309',
  },
  boardTileCheck: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FF5C39',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardTileBestFitDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  boardModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  boardModalResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  boardModalResetBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  boardModalApplyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#FF5C39',
  },
  boardModalApplyBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  /* Compact Column & Card Styles (for 4+ tabs per screen) */
  kanbanColumnHeaderCompact: {
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  kanbanColumnTitleCompact: {
    fontSize: 12,
  },
  kanbanColumnSubtitleCompact: {
    fontSize: 9,
  },
  kanbanBadgeCompact: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 4,
  },
  kanbanBadgeTextCompact: {
    fontSize: 11,
  },
  actionButtonsRowCompact: {
    gap: 6,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  kanbanCardCompact: {
    padding: 7,
    paddingTop: 10,
    borderRadius: 8,
    overflow: 'hidden',
  },

  /* Mobile Responsive Enhancements (< 768px) */
  pageHeaderMobile: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },
  pageTitleMobile: {
    fontSize: 18,
  },
  pageSubtitleMobile: {
    fontSize: 11,
  },
  headerRightControlsMobile: {
    gap: 6,
  },
  viewToggleContainerMobile: {
    padding: 2,
    borderRadius: 8,
  },
  toggleBtnMobile: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 3,
  },
  toggleBtnTextMobile: {
    fontSize: 11,
  },
  refreshBtnMobile: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  boardToolbarContainerMobile: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  colPillMobile: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  colPillTextMobile: {
    fontSize: 10,
  },
  boardSettingsTriggerMobile: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
});
