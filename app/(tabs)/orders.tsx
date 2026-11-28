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
import { orderService, type ManualPaymentStatus } from '../../services/order.service';
import { useToast } from '../../context/ToastContext';
import { Order, OrderStatus } from '../../types';
import { getItemOptionsList } from '../../services/receipt-customization.service';
import { Skeleton } from '../../components/Skeleton';
import { OrderCountdownBadge } from '../../components/OrderCountdownBadge';
import { EditExpectedTimeModal } from '../../components/order/EditExpectedTimeModal';
import { FilterSheet, FilterSection, FilterChips } from '../../components/filters/FilterSheet';
import { getOrderFulfillmentType, matchesOrderTypeFilter, ORDER_TYPE_FILTER_VALUES } from '../../utils/order-fulfillment';
import { getOrderStatusColor, getOrderStatusSurface, ACTIVE_ORDER_STATUSES } from '../../utils/order-status';
import { facetedFilter } from '../../utils/faceted-filter';
import {
  DatePresetKey,
  PeriodRange,
  getPeriodRange,
  isInPeriod as isInPeriodBase,
  isOrderPaid,
  paymentKindOf,
} from '../../utils/order-filters';
import { useAuth } from '../../context/AuthContext';
import {
  Search,
  WifiOff,
  ChevronDown,
  ChevronUp,
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
  Calendar,
  CalendarDays,
  SlidersHorizontal,
  RotateCcw,
  CreditCard,
  Banknote,
  Sparkles,
  ChefHat,
  CircleX,
  House,
  Package,
  Zap,
  CalendarClock,
  Smartphone,
  Globe,
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
  // Pickup & takeaway orders that are ready (see tabCounts / activeTabOrders: isOrderPickup).
  // Only those go through "ready": dine-in goes kitchen → served, delivery → out for delivery.
  // Same words as the status badge on these cards.
  { id: 'pickup', label: 'Ready for Collection', subtitle: 'Pickup & takeaway', statuses: ['ready_for_pickup'] as OrderStatus[], accentColor: '#FF5C39', Icon: ShoppingBag },
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

/** "14:05" for today, "12 Nov, 14:05" otherwise — short enough for the card meta line. */
function formatCardTime(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}

const CARD_TYPE_META = {
  delivery: { label: 'Delivery', Icon: Bike, color: '#1D4ED8', bg: '#DBEAFE' },
  pickup: { label: 'Pickup', Icon: ShoppingBag, color: '#C2410C', bg: '#FFEDD5' },
  takeaway: { label: 'Takeaway', Icon: ShoppingBag, color: '#B45309', bg: '#FEF3C7' },
  dine_in: { label: 'Dine-in', Icon: UtensilsCrossed, color: '#6D28D9', bg: '#EDE9FE' },
} as const;

export { getOrderStatusColor, getOrderStatusSurface };

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



/** In the chosen period, with this screen's "still in progress" rule (see utils/order-filters). */
const isInPeriod = (order: Order, range: PeriodRange) => isInPeriodBase(order, range, isActiveOrder);

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
  /** Owner only: one-tap "Mark paid" for unpaid counter / cash orders. */
  onMarkPaid?: (o: Order) => Promise<void>;
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
  onMarkPaid,
}) => {
  const { width: cardScreenWidth } = useWindowDimensions();
  const [markingPaid, setMarkingPaid] = useState(false);
  const isTablet = cardScreenWidth >= TABLET_BREAKPOINT && !compact;
  const [expanded, setExpanded] = useState(false);
  // Owners only see their own restaurant, so its name is noise on every card; super admins need it.
  const showRestaurantName = useAuth().user?.userType === 'super_admin';
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

  const statusSurface = getOrderStatusSurface(order.status);
  const statusColor = getOrderStatusColor(order.status);
  const sizeFactor = compact ? 0.86 : isTablet ? 1.12 : 1;
  const fs = (n: number) => Math.round(n * sizeFactor * 2) / 2;
  const typeMeta = CARD_TYPE_META[fulfillmentType];
  const TypeIcon = typeMeta.Icon;
  const tableLabel =
    fulfillmentType === 'dine_in'
      ? (order as any).tableNumber
        ? `Table ${(order as any).tableNumber}`
        : (order.deliveryAddress as any)?.addressLine1?.toLowerCase().startsWith('table')
        ? (order.deliveryAddress as any).addressLine1
        : null
      : null;
  const payment = isPaid
    ? { label: 'Paid', color: '#047857', bg: '#D1FAE5' }
    : isFailed
    ? { label: 'Failed', color: '#B91C1C', bg: '#FEE2E2' }
    : isRefunded
    ? { label: 'Refunded', color: '#6D28D9', bg: '#EDE9FE' }
    : { label: 'Unpaid', color: '#B45309', bg: '#FEF3C7' };
  const paymentMethod = paymentLabel.replace(/^Payment\s*:\s*/i, '');
  const sourceText = sourceDetails.isExternal ? sourceDetails.domainUrl : 'Krifoo App';
  const orderNote = getSanitizedOrderNotes(order.notes);
  const previewItems = orderItems.slice(0, 3).map((it: any) => `${Number(it.quantity || it.qty || 1)}× ${getItemName(it)}`);
  const moreItems = Math.max(0, itemCount - previewItems.length);

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={() => onPress(order)}
      style={[
        styles.kanbanCard,
        isTablet && styles.kanbanCardTablet,
        compact && styles.kanbanCardCompact,
        { backgroundColor: statusSurface.bg, borderColor: statusSurface.border },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Order ${orderNum}, ${statusLabel(order.status)}, ${typeMeta.label}, £${(totalAmount || 0).toFixed(2)}, ${payment.label}`}
    >
      {/* ── Header: order number + status · total ───────────────────── */}
      <View style={styles.ocHeader}>
        <View style={styles.ocHeaderLeft}>
          <Text style={[styles.ocOrderId, { fontSize: fs(17) }]} numberOfLines={1}>#{orderNum}</Text>
          <View style={[styles.ocStatusChip, { borderColor: statusSurface.border }]}>
            <View style={[styles.ocStatusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.ocStatusText, { color: statusSurface.text, fontSize: fs(11) }]} numberOfLines={1}>
              {statusLabel(order.status)}
            </Text>
          </View>
        </View>
        <Text style={[styles.ocAmount, { fontSize: fs(17) }]}>£{(totalAmount || 0).toFixed(2)}</Text>
      </View>

      {/* ── Chips: fulfilment type · schedule · payment ─────────────── */}
      <View style={styles.ocChips}>
        <View style={[styles.ocChip, { backgroundColor: typeMeta.bg }]}>
          <TypeIcon size={fs(12)} color={typeMeta.color} />
          <Text style={[styles.ocChipText, { color: typeMeta.color, fontSize: fs(11.5) }]} numberOfLines={1}>
            {tableLabel ? `${typeMeta.label} · ${tableLabel}` : typeMeta.label}
          </Text>
        </View>
        {scheduleInfo.isScheduled && (
          <View style={[styles.ocChip, styles.ocChipShrink, { backgroundColor: '#FEF3C7' }]}>
            <Calendar size={fs(12)} color="#92400E" />
            <Text style={[styles.ocChipText, { color: '#92400E', fontSize: fs(11.5) }]} numberOfLines={1}>
              {scheduleInfo.scheduleTimeText}
            </Text>
          </View>
        )}
        <View style={[styles.ocChip, styles.ocChipShrink, { backgroundColor: payment.bg }]}>
          <Text style={[styles.ocChipText, { color: payment.color, fontSize: fs(11.5) }]} numberOfLines={1}>
            {payment.label} · {paymentMethod}
          </Text>
        </View>
        {onMarkPaid && pStatus === 'pending' && !order.sessionId && order.status !== 'cancelled' ? (
          <TouchableOpacity
            onPress={async () => {
              if (markingPaid) return;
              setMarkingPaid(true);
              try {
                await onMarkPaid(order);
              } finally {
                setMarkingPaid(false);
              }
            }}
            style={styles.ocMarkPaidBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel={`Mark order ${orderNum} as paid`}
          >
            {markingPaid ? (
              <ActivityIndicator size="small" color="#047857" />
            ) : (
              <>
                <Check size={fs(13)} color="#047857" strokeWidth={3} />
                <Text style={[styles.ocMarkPaidText, { fontSize: fs(11.5) }]}>Mark paid</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}
      </View>

      {/* ── Meta line ──────────────────────────────────────────────── */}
      <Text style={[styles.ocMeta, { fontSize: fs(12) }]} numberOfLines={1}>
        {formatCardTime(order.createdAt)} · {itemCount} {itemCount === 1 ? 'item' : 'items'} · via {sourceText}
        {showRestaurantName ? ` · ${restaurantName}` : ''}
      </Text>

      <View style={[styles.ocDivider, { backgroundColor: statusSurface.border }]} />

      {/* ── Customer, address, rider ───────────────────────────────── */}
      <View style={styles.ocCustomerRow}>
        <View style={[styles.ocAvatar, { width: fs(30), height: fs(30), borderRadius: fs(15) }]}>
          <Text style={[styles.ocAvatarText, { fontSize: fs(13) }]}>{customerName.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.ocFlex}>
          <Text style={[styles.ocCustomerName, { fontSize: fs(14) }]} numberOfLines={1}>{customerName}</Text>
          {customerPhone ? (
            <Text style={[styles.ocCustomerPhone, { fontSize: fs(12) }]} numberOfLines={1}>{customerPhone}</Text>
          ) : null}
        </View>
      </View>

      {fulfillmentType === 'delivery' && deliveryAddressText ? (
        <View style={styles.ocInfoRow}>
          <MapPin size={fs(14)} color="#2563EB" style={styles.ocInfoIcon} />
          <Text style={[styles.ocInfoText, { fontSize: fs(12.5) }]} numberOfLines={2}>{deliveryAddressText}</Text>
        </View>
      ) : null}

      {deliveryPartnerName ? (
        <View style={styles.ocInfoRow}>
          <Bike size={fs(14)} color="#6B7280" style={styles.ocInfoIcon} />
          <Text style={[styles.ocInfoText, { fontSize: fs(12.5) }]} numberOfLines={1}>
            Rider · <Text style={styles.ocInfoStrong}>{deliveryPartnerName}</Text>
          </Text>
        </View>
      ) : null}

      {/* ── Countdown (active orders) ──────────────────────────────── */}
      {isActiveOrder(order) && (
        <View style={styles.ocTimingRow}>
          <OrderCountdownBadge
            order={order}
            style={[styles.expectedDeliveryBadge, isTablet && styles.expectedDeliveryBadgeTablet, compact && { paddingHorizontal: 6, paddingVertical: 2.5 }]}
            textStyle={[styles.expectedDeliveryBadgeText, { fontSize: fs(11.5) }]}
            iconSize={fs(12)}
          />
          {onEditDeliveryTime ? (
            <TouchableOpacity
              style={styles.ocEditBtn}
              onPress={(e: any) => {
                e.stopPropagation?.();
                onEditDeliveryTime(order);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Edit expected time"
            >
              <Text style={[styles.ocEditBtnText, { fontSize: fs(12) }]}>Edit time</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* ── Items preview (tap to expand) ──────────────────────────── */}
      <TouchableOpacity
        style={[styles.ocItemsToggle, { borderTopColor: statusSurface.border }]}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${expanded ? 'Hide' : 'Show'} ${itemCount} items${orderNote ? ' and note' : ''}`}
      >
        <Text style={[styles.ocItemsPreview, { fontSize: fs(12.5) }]} numberOfLines={expanded ? 1 : 2}>
          {expanded
            ? `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`
            : `${previewItems.join(', ')}${moreItems ? `  +${moreItems} more` : ''}`}
        </Text>
        {orderNote ? (
          <View style={styles.ocNoteFlag}>
            <Text style={[styles.ocNoteFlagText, { fontSize: fs(10.5) }]}>NOTE</Text>
          </View>
        ) : null}
        {expanded ? <ChevronUp size={fs(16)} color="#687076" /> : <ChevronDown size={fs(16)} color="#687076" />}
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
          {orderNote ? (
            <View style={styles.noteRow}>
              <Text style={[styles.noteLabel, isTablet && { fontSize: 12 }]}>Note: </Text>
              <Text style={[styles.noteText, isTablet && { fontSize: 12 }]}>{orderNote}</Text>
            </View>
          ) : null}
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
    if (routeParams?.channel && (ORDER_TYPE_FILTER_VALUES as readonly string[]).includes(routeParams.channel)) {
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
  const [datePreset, setDatePreset] = useState<DatePresetKey>('today');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const periodRange = useMemo(
    () => getPeriodRange(datePreset, customDateFrom, customDateTo),
    [datePreset, customDateFrom, customDateTo]
  );
  /** Latest period for fetchOrders (a stable callback used by the poll and socket listeners). */
  const periodRangeRef = useRef<PeriodRange>(periodRange);
  periodRangeRef.current = periodRange;
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
  const isOwnerUser = useAuth().user?.userType !== 'super_admin';
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const isFocusedRef = useRef(false);

  /** A full load was asked for while another fetch ran — run it as soon as that one finishes. */
  const pendingFullFetchRef = useRef(false);

  /**
   * Loads orders.
   *  - full (opening the tab, pull to refresh, changing the period): EVERY order in the chosen
   *    period plus every order still in progress (any date). Previously only the newest 150
   *    orders were loaded, so "30 days" / "All time" and the counts stopped at 150.
   *  - quick (the 12 s poll, socket events, back from background): the newest page plus every
   *    order in progress, merged into the list — so a refresh every few seconds stays light and
   *    older orders of the period don't disappear.
   */
  const fetchOrders = useCallback(async (isRefresh = false, full = true) => {
    if (isFetchingRef.current) {
      if (full) pendingFullFetchRef.current = true;
      if (isRefresh) setRefreshing(false);
      return;
    }
    isFetchingRef.current = true;
    const startedAt = Date.now();
    const range = periodRangeRef.current;
    try {
      if (!isRefresh) setLoading(true);
      const [res, activeRes]: any[] = await Promise.all([
        full
          ? orderService.fetchAllOrders({
              ...(range ? { startDate: range.from.toISOString(), endDate: range.to.toISOString() } : {}),
              allPages: true,
            })
          : orderService.fetchAllOrders(),
        orderService
          .fetchAllOrders({ status: ACTIVE_ORDER_STATUSES.join(','), allPages: true })
          .catch(() => ({ success: false, data: [] })),
      ]);
      if (res.success && res.data) {
        // Forget mutation timestamps older than a minute.
        recentMutationsRef.current.forEach((at, id) => {
          if (startedAt - at > 60000) recentMutationsRef.current.delete(id);
        });
        // Period orders + in-progress orders, each once
        const incomingById = new Map<string, Order>();
        [...(res.data as Order[]), ...((activeRes?.success ? activeRes.data : []) as Order[])].forEach((o) => {
          if (o?._id) incomingById.set(o._id, o);
        });
        const newestFirst = (a: Order, b: Order) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        setOrders((prev) => {
          const prevById = new Map(prev.map((o) => [o._id, o]));
          const reconcile = (server: Order) => {
            const pending = pendingPatchesRef.current.get(server._id);
            if (pending) return { ...server, ...pending } as Order;
            const mutatedAt = recentMutationsRef.current.get(server._id);
            if (mutatedAt && mutatedAt > startedAt) return prevById.get(server._id) ?? server;
            return server;
          };
          const fresh = Array.from(incomingById.values()).map(reconcile);
          if (full) return fresh.sort(newestFirst);
          // Quick refresh: update what came back, keep the rest of the period as it was
          const kept = prev.filter((o) => !incomingById.has(o._id));
          return [...fresh, ...kept].sort(newestFirst);
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
      // e.g. the period changed while a quick refresh was running: load the new period now
      if (pendingFullFetchRef.current) {
        pendingFullFetchRef.current = false;
        setTimeout(() => fetchOrdersRef.current(true, true), 0);
      }
    }
  }, []);
  const fetchOrdersRef = useRef(fetchOrders);
  fetchOrdersRef.current = fetchOrders;

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
        if (canRefresh()) fetchOrders(true, false);
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
      if (canRefresh()) fetchOrders(true, false);
    }, 12000);

    // Refresh immediately when coming back from background
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && isFocusedRef.current) {
        fetchOrders(true, false);
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

  // A different period needs its own orders (a full load). Skips the first render: opening the
  // tab already loads through useFocusEffect.
  const firstPeriodRef = useRef(true);
  useEffect(() => {
    if (firstPeriodRef.current) {
      firstPeriodRef.current = false;
      return;
    }
    fetchOrders(false, true);
  }, [periodRange, fetchOrders]);

  /**
   * One yes/no check per filter. The list is what passes them all; each filter section's chip
   * counts come from what passes every OTHER check (facetedFilter), so every number matches the
   * list you'd get by tapping it — date, search and the other filters included. Previously only
   * the status chips did; the others counted every loaded order ("Dine-in 95" on a 71-order day).
   */
  const facets = useMemo(() => {
    // Normalise the search once: "#1234" should match order 1234; phone search ignores spaces.
    const rawQuery = searchQuery.trim().toLowerCase();
    const q = rawQuery.replace(/^#/, '');
    const qDigits = q.replace(/\D/g, '');

    return facetedFilter(orders, {
      search: (order: Order) => {
        if (!q) return true;
        const orderNum = String(order.orderNumber ?? '').toLowerCase();
        const idMatch = String(order._id ?? '').toLowerCase().includes(q) || orderNum.includes(q);
        const restMatch = getRestaurantName(order).toLowerCase().includes(q);
        const custMatch = getCustomerName(order).toLowerCase().includes(q);
        const domainMatch = getOrderSourceDetails(order).domainUrl.toLowerCase().includes(q);
        const phoneMatch = qDigits.length >= 3 && getCustomerPhone(order).replace(/\D/g, '').includes(qDigits);
        const itemMatch =
          !idMatch && !custMatch && getOrderItems(order).some((it) => getItemName(it).toLowerCase().includes(q));
        return idMatch || restMatch || custMatch || domainMatch || phoneMatch || itemMatch;
      },
      // Date — applies to finished orders only. Orders still in progress are always shown
      // so nothing placed before midnight (or scheduled for later) can drop off the board.
      date: (order: Order) => isInPeriod(order, periodRange),
      type: (order: Order) => matchesOrderTypeFilter(order, typeFilter),
      source: (order: Order) => {
        const isExt = getOrderSourceDetails(order).isExternal;
        return sourceFilter === 'all' || (sourceFilter === 'external' ? isExt : !isExt);
      },
      schedule: (order: Order) => {
        if (scheduleFilter === 'all') return true;
        const scheduled = getOrderScheduleInfo(order).isScheduled;
        return scheduleFilter === 'scheduled' ? scheduled : !scheduled;
      },
      payment: (order: Order) => paymentFilter === 'all' || paymentKindOf(order) === paymentFilter,
      paymentStatus: (order: Order) =>
        paymentStatusFilter === 'all' || (paymentStatusFilter === 'paid' ? isOrderPaid(order) : !isOrderPaid(order)),
    });
  }, [orders, searchQuery, typeFilter, sourceFilter, scheduleFilter, paymentFilter, paymentStatusFilter, periodRange]);

  const filteredOrders = facets.filtered;

  /** Chip counts per filter section (see facets). Each section's "All" is that section's total. */
  const filterCounts = useMemo(() => {
    const byType = facets.except('type');
    const bySchedule = facets.except('schedule');
    const bySource = facets.except('source');
    const byPayment = facets.except('payment');
    const byPaymentStatus = facets.except('paymentStatus');
    const count = <T,>(list: T[], test: (o: T) => boolean) => list.reduce((n, o) => n + (test(o) ? 1 : 0), 0);
    return {
      typeTotal: byType.length,
      delivery: count(byType, (o) => getOrderFulfillmentType(o) === 'delivery'),
      pickup: count(byType, (o) => getOrderFulfillmentType(o) === 'pickup'),
      takeaway: count(byType, (o) => getOrderFulfillmentType(o) === 'takeaway'),
      dineIn: count(byType, (o) => getOrderFulfillmentType(o) === 'dine_in'),
      scheduleTotal: bySchedule.length,
      scheduled: count(bySchedule, (o) => getOrderScheduleInfo(o).isScheduled),
      asap: count(bySchedule, (o) => !getOrderScheduleInfo(o).isScheduled),
      sourceTotal: bySource.length,
      marketplace: count(bySource, (o) => !getOrderSourceDetails(o).isExternal),
      external: count(bySource, (o) => getOrderSourceDetails(o).isExternal),
      paymentTotal: byPayment.length,
      cash: count(byPayment, (o) => paymentKindOf(o) === 'cash'),
      card: count(byPayment, (o) => paymentKindOf(o) === 'card'),
      paymentStatusTotal: byPaymentStatus.length,
      paid: count(byPaymentStatus, isOrderPaid),
      pending: count(byPaymentStatus, (o) => !isOrderPaid(o)),
      /** Orders in the chosen period, before the other filters — the sheet's "of N". */
      periodTotal: count(orders, (o) => isInPeriod(o, periodRange)),
    };
  }, [facets, orders, periodRange]);

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
      // Start the expected-time countdown immediately; the server's acceptedAt replaces this on refresh.
      if (!prevOrder?.acceptedAt) (patch as any).acceptedAt = new Date().toISOString();
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

  // Manual payment status (cash / pay at counter / POS card machine). Waits for the server so the
  // badge never shows a state the server refused (e.g. orders paid online via Stripe).
  const handleUpdatePaymentStatus = async (orderId: string, paymentStatus: ManualPaymentStatus) => {
    const target = orders.find((o) => o._id === orderId) ?? (selectedOrder?._id === orderId ? selectedOrder : undefined);
    const label = `#${target?.orderNumber || orderId.substring(0, 7).toUpperCase()}`;
    try {
      const res = await orderService.updatePaymentStatus(orderId, paymentStatus);
      if (!res.success) {
        showToast({ title: 'Payment not updated', message: res.message || 'Could not update the payment status.', type: 'error' });
        return;
      }
      const patch: Partial<Order> = { paymentStatus: res.data?.paymentStatus ?? paymentStatus };
      recentMutationsRef.current.set(orderId, Date.now());
      setOrders((current) => current.map((o) => (o._id === orderId ? ({ ...o, ...patch } as Order) : o)));
      setSelectedOrder((prev) => (prev && prev._id === orderId ? ({ ...prev, ...patch } as Order) : prev));
      showToast({
        title: 'Payment updated',
        message: `${label} marked ${paymentStatus === 'pending' ? 'unpaid' : paymentStatus}.`,
        type: 'success',
      });
    } catch (err: any) {
      showToast({ title: 'Payment not updated', message: err?.message || 'Network error.', type: 'error' });
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
    setDeliveryTimeModalOpen(true);
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

          {/* Kitchen Mode — full-screen view for kitchen staff */}
          <TouchableOpacity
            style={[styles.kitchenModeBtn, isMobile && styles.kitchenModeBtnIconOnly]}
            onPress={() => router.push('/kitchen')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Open Kitchen Mode"
          >
            <ChefHat size={15} color="#FFFFFF" />
            {!isMobile && <Text style={styles.kitchenModeBtnText}>Kitchen</Text>}
          </TouchableOpacity>
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
                      Type: {typeFilter === 'in_store' ? 'Dine-in & takeaway' : typeFilter === 'takeaway' ? 'Takeaway' : typeFilter === 'dine_in' ? 'Dine-In' : typeFilter === 'pickup' ? 'Self Pickup' : typeFilter === 'delivery' ? 'Delivery' : typeFilter}
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

      {/* Filter sheet (shared design with the Menu tab) */}
      <FilterSheet
        visible={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        title="Filter orders"
        subtitle={`Showing ${activeTabOrders.length} of ${filterCounts.periodTotal} orders`}
        activeCount={activeFilterCount}
        onReset={resetAllFilters}
        applyLabel={`Show ${activeTabOrders.length} order${activeTabOrders.length !== 1 ? 's' : ''}`}
      >
        <FilterSection title="Order status" hint="Kitchen & dispatch stage">
          <FilterChips
            accessibilityLabel="Order status"
            value={activeTab}
            onChange={setActiveTab}
            options={STATUS_TABS.map((tab) => ({
              value: tab.id,
              label: tab.id === 'all' ? 'All' : tab.label,
              count: tabCounts[tab.id] ?? 0,
              accent: tab.id === 'all' ? undefined : tab.accentColor,
            }))}
          />
        </FilterSection>

        <FilterSection title="Order type" hint="How it's fulfilled">
          <FilterChips
            accessibilityLabel="Order type"
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: 'all', label: 'All', count: filterCounts.typeTotal },
              { value: 'delivery', label: 'Delivery', count: filterCounts.delivery, Icon: Bike },
              { value: 'pickup', label: 'Self pickup', count: filterCounts.pickup, Icon: ShoppingBag },
              { value: 'takeaway', label: 'Takeaway', count: filterCounts.takeaway, Icon: Package },
              { value: 'dine_in', label: 'Dine-in', count: filterCounts.dineIn, Icon: UtensilsCrossed },
            ]}
          />
        </FilterSection>

        <FilterSection title="Timing" hint="ASAP or scheduled">
          <FilterChips
            accessibilityLabel="Timing"
            value={scheduleFilter}
            onChange={setScheduleFilter}
            options={[
              { value: 'all', label: 'All', count: filterCounts.scheduleTotal },
              { value: 'asap', label: 'ASAP', count: filterCounts.asap, Icon: Zap },
              { value: 'scheduled', label: 'Scheduled', count: filterCounts.scheduled, Icon: CalendarClock },
            ]}
          />
        </FilterSection>

        <FilterSection title="Sales channel" hint="Where it was placed">
          <FilterChips
            accessibilityLabel="Sales channel"
            value={sourceFilter}
            onChange={setSourceFilter}
            options={[
              { value: 'all', label: 'All', count: filterCounts.sourceTotal },
              { value: 'krifoo', label: 'Krifoo app', count: filterCounts.marketplace, Icon: Smartphone },
              { value: 'external', label: 'Own website', count: filterCounts.external, Icon: Globe },
            ]}
          />
        </FilterSection>

        <FilterSection title="Payment method">
          <FilterChips
            accessibilityLabel="Payment method"
            value={paymentFilter}
            onChange={setPaymentFilter}
            options={[
              { value: 'all', label: 'All', count: filterCounts.paymentTotal },
              { value: 'cash', label: 'Cash', count: filterCounts.cash, Icon: Banknote },
              { value: 'card', label: 'Card / online', count: filterCounts.card, Icon: CreditCard },
            ]}
          />
        </FilterSection>

        <FilterSection title="Payment status">
          <FilterChips
            accessibilityLabel="Payment status"
            value={paymentStatusFilter}
            onChange={setPaymentStatusFilter}
            options={[
              { value: 'all', label: 'All', count: filterCounts.paymentStatusTotal },
              { value: 'paid', label: 'Paid', count: filterCounts.paid, dotColor: '#16A34A' },
              { value: 'pending', label: 'Unpaid', count: filterCounts.pending, dotColor: '#F59E0B' },
            ]}
          />
        </FilterSection>
      </FilterSheet>

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
                  onMarkPaid={isOwnerUser ? (o) => handleUpdatePaymentStatus(o._id, 'paid') : undefined}
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
                        onMarkPaid={isOwnerUser ? (o) => handleUpdatePaymentStatus(o._id, 'paid') : undefined}
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
        onUpdatePaymentStatus={isOwnerUser ? handleUpdatePaymentStatus : undefined}
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

      {/* Edit Expected Time (shared with the order details screen) */}
      <EditExpectedTimeModal
        visible={deliveryTimeModalOpen}
        order={deliveryTimeOrder}
        onClose={() => {
          setDeliveryTimeModalOpen(false);
          setDeliveryTimeOrder(null);
        }}
        onSaved={(orderId, patch) => {
          setOrders((prev) => prev.map((o) => (o._id === orderId ? ({ ...o, ...patch } as Order) : o)));
          setSelectedOrder((prev) => (prev && prev._id === orderId ? ({ ...prev, ...patch } as Order) : prev));
        }}
      />
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
  kitchenModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#11181C',
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  kitchenModeBtnIconOnly: { width: 44, paddingHorizontal: 0 },
  kitchenModeBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
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

  /* ── Order card (redesign) ─────────────────────────────── */
  ocHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  ocHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  ocOrderId: { fontWeight: '800', color: '#11181C', letterSpacing: -0.3, flexShrink: 1 },
  ocStatusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    flexShrink: 1,
  },
  ocStatusDot: { width: 7, height: 7, borderRadius: 4 },
  ocStatusText: { fontWeight: '700' },
  ocAmount: { fontWeight: '800', color: '#11181C', fontVariant: ['tabular-nums'] },
  ocChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  ocChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  ocChipShrink: { flexShrink: 1 },
  ocMarkPaidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 28,
    paddingHorizontal: 9,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#6EE7B7',
    backgroundColor: '#FFFFFF',
  },
  ocMarkPaidText: { fontWeight: '800', color: '#047857' },
  ocChipText: { fontWeight: '700', flexShrink: 1 },
  ocMeta: { color: '#687076', fontWeight: '500', marginTop: 8 },
  ocDivider: { height: 1, marginVertical: 12 },
  ocCustomerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ocAvatar: { backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
  ocAvatarText: { color: '#FF5C39', fontWeight: '800' },
  ocFlex: { flex: 1, minWidth: 0 },
  ocCustomerName: { color: '#11181C', fontWeight: '700' },
  ocCustomerPhone: { color: '#687076', fontWeight: '500', marginTop: 1 },
  ocInfoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8 },
  ocInfoIcon: { marginTop: 1 },
  ocInfoText: { flex: 1, color: '#374151', fontWeight: '500', lineHeight: 18 },
  ocInfoStrong: { color: '#11181C', fontWeight: '700' },
  ocTimingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12 },
  ocEditBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  ocEditBtnText: { color: '#FF5C39', fontWeight: '700' },
  ocItemsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  ocItemsPreview: { flex: 1, color: '#11181C', fontWeight: '600', lineHeight: 18 },
  ocNoteFlag: { backgroundColor: '#FEF3C7', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  ocNoteFlagText: { color: '#92400E', fontWeight: '800', letterSpacing: 0.5 },

  kanbanCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    position: 'relative',
    overflow: 'hidden',
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
    backgroundColor: '#FFFFFF',
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
  itemsList: { marginTop: 2, marginBottom: 4, gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#FFFFFF' },
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
    borderRadius: 8,
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
    borderRadius: 4,
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
