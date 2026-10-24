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
import { useFocusEffect } from 'expo-router';
import { OrderDetailModal } from '../../components/OrderDetailModal';
import { AssignDeliveryModal } from '../../components/AssignDeliveryModal';
import { ConfirmModal } from '../../components/ConfirmModal';
import { ErrorState } from '../../components/ErrorState';
import { ApiErrorType } from '../../services/api';
import { Colors } from '../../constants/colors';
import { orderService } from '../../services/order.service';
import { useToast } from '../../context/ToastContext';
import { Order, OrderStatus } from '../../types';
import { Skeleton } from '../../components/Skeleton';
import {
  Search,
  WifiOff,
  RefreshCw,
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
} from 'lucide-react-native';
import { printThermalReceipt, isAutoPrintEnabled, getLastPrintJobReport, getOrderScheduleInfo } from '../../services/thermal-print.service';
import { getSanitizedOrderNotes } from '../../services/printer/receipt-document';
import { getPosPrinterConfig } from '../../services/pos-config.service';
import { getActiveReceiptTemplate } from '../../services/receipt-customization.service';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TABLET_BREAKPOINT = 768;
const BOARD_COLUMNS_STORAGE_KEY = '@krifoo_board_columns_count';

export type BoardColumnsOption = 'auto' | 1 | 2 | 3 | 4 | 5 | 6;

export interface BoardColumnPreset {
  value: BoardColumnsOption;
  title: string;
}

const BOARD_COLUMN_PRESETS: BoardColumnPreset[] = [
  { value: 'auto', title: 'Auto (Responsive)' },
  { value: 1, title: '1 Tab per Screen' },
  { value: 2, title: '2 Tabs per Screen' },
  { value: 3, title: '3 Tabs per Screen' },
  { value: 4, title: '4 Tabs per Screen' },
  { value: 5, title: '5 Tabs per Screen' },
  { value: 6, title: '6 Tabs (Fit All)' },
];

const STATUS_TABS = [
  { id: 'all', label: 'All Orders', subtitle: 'All Statuses', statuses: [] as OrderStatus[], accentColor: '#11181C', Icon: List },
  { id: 'new', label: 'New Orders', subtitle: 'Awaiting Acceptance', statuses: ['placed'] as OrderStatus[], accentColor: '#F59E0B', Icon: Inbox },
  { id: 'kitchen', label: 'In Kitchen', subtitle: 'Preparing & Cooking', statuses: ['confirmed', 'preparing'] as OrderStatus[], accentColor: '#3B82F6', Icon: Truck },
  { id: 'pickup', label: 'Self Pickup / Takeaway', subtitle: 'Ready for Collection', statuses: ['ready_for_pickup'] as OrderStatus[], accentColor: '#FF5C39', Icon: ShoppingBag },
  { id: 'delivery', label: 'Out for Delivery', subtitle: 'Rider on the Way', statuses: ['out_for_delivery'] as OrderStatus[], accentColor: '#8B5CF6', Icon: Bike },
  { id: 'completed', label: 'Completed', subtitle: 'Delivered Successfully', statuses: ['delivered'] as OrderStatus[], accentColor: '#10B981', Icon: CheckCircle2 },
  { id: 'cancelled', label: 'Cancelled', subtitle: 'Not Fulfilled', statuses: ['cancelled'] as OrderStatus[], accentColor: '#EF4444', Icon: RefreshCw },
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
  if (typeof order.customerId === 'object') return order.customerId?.phoneNumber || order.customerDetails?.phoneNumber || '';
  return order.customerDetails?.phoneNumber || '';
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
  const restSubdomain = restExt?.subdomain ? `${restExt.subdomain}.krifoo.com` : '';
  const fallbackExtDomain = restCustomDomain || restSubdomain;

  const custName = (order.customerDetails?.name || (order.customerId as any)?.fullName || '').toLowerCase();
  const phone = (order.customerDetails?.phoneNumber || (order.customerId as any)?.phoneNumber || '').replace(/\D/g, '');
  const oType = ((order.orderType || (order as any).deliveryType || '') as string).toLowerCase();

  const isTakeawayApp =
    oType === 'takeaway' ||
    rawDomain.toLowerCase().includes('swaad-takeaway') ||
    rawDomain.toLowerCase().includes('swaadtakeaway') ||
    custName.includes('takeaway') ||
    custName.includes('swaad takeaway') ||
    phone.includes('7783448291');

  if (isTakeawayApp) {
    return {
      isExternal: true,
      domainUrl: 'Swaad Takeaway App',
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
    let finalDomain = rawDomain;
    if (!finalDomain || finalDomain === 'External Website' || finalDomain === 'External Web') {
      finalDomain = fallbackExtDomain || 'swaadcambridge.co.uk';
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

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

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
    notes.includes('table') ||
    addr1.startsWith('table')
  ) {
    return 'dine_in';
  }

  const custName = (order.customerDetails?.name || (order.customerId as any)?.fullName || '').toLowerCase();
  const phone = (order.customerDetails?.phoneNumber || (order.customerId as any)?.phoneNumber || '').replace(/\D/g, '');

  const isTakeawayApp =
    oType === 'takeaway' ||
    domain.includes('swaad-takeaway') ||
    domain.includes('swaadtakeaway') ||
    app.includes('takeaway') ||
    notes.includes('takeaway') ||
    custName.includes('takeaway') ||
    custName.includes('swaad takeaway') ||
    phone.includes('7783448291');

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
    if (text.includes('dine') || text.includes('table')) return 'dine_in';
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
          <Skeleton width={44} height={10} borderRadius={3} style={{ marginTop: 4 }} />
        </View>
      </View>

      {/* Restaurant Title */}
      <View style={{ marginTop: 8 }}>
        <Skeleton width="55%" height={14} borderRadius={3} />
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
      <View style={[styles.kanbanAddressRow, isTablet && styles.kanbanAddressRowTablet, { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }]}>
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
}

const OrderCardItem: React.FC<OrderCardProps> = ({
  order,
  onPress,
  onAssignDelivery,
  onUpdateStatus,
  onPrint,
  paperRollSize = '58',
  compact = false,
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
            <Text style={[styles.acceptBtnText, isTablet && styles.acceptBtnTextTablet, compact && { fontSize: 11 }]}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.printIconBtn, isTablet && styles.printIconBtnTablet, compact && { width: 34, height: 32 }]}
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
              style={[styles.acceptBtn, isTablet && styles.acceptBtnTablet, { backgroundColor: '#7C3AED' }, compact && { paddingVertical: 7, paddingHorizontal: 6 }]}
              onPress={(e: any) => {
                e.stopPropagation?.();
                onUpdateStatus(order._id, 'delivered');
              }}
              activeOpacity={0.8}
            >
              <UtensilsCrossed size={isTablet ? 15 : compact ? 12 : 13} color="#FFFFFF" />
              <Text style={[styles.acceptBtnText, isTablet && styles.acceptBtnTextTablet, compact && { fontSize: 11 }]} numberOfLines={1}>Ready to Serve</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.printIconBtn, isTablet && styles.printIconBtnTablet, compact && { width: 34, height: 32 }]}
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
              style={[styles.acceptBtn, isTablet && styles.acceptBtnTablet, { backgroundColor: '#FF5C39' }, compact && { paddingVertical: 7, paddingHorizontal: 6 }]}
              onPress={(e: any) => {
                e.stopPropagation?.();
                onUpdateStatus(order._id, 'ready_for_pickup');
              }}
              activeOpacity={0.8}
            >
              <Check size={isTablet ? 15 : compact ? 12 : 13} color="#FFFFFF" />
              <Text style={[styles.acceptBtnText, isTablet && styles.acceptBtnTextTablet, compact && { fontSize: 11 }]} numberOfLines={1}>
                {fulfillmentType === 'takeaway' ? (compact ? 'Ready (Takeaway)' : 'Ready for Takeaway') : (compact ? 'Ready (Pickup)' : 'Ready for Pickup')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.printIconBtn, isTablet && styles.printIconBtnTablet, compact && { width: 34, height: 32 }]}
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
                  style={[styles.assignDriverIconBtn, { flex: 1, paddingVertical: 7, paddingHorizontal: 6 }]}
                  onPress={(e: any) => {
                    e.stopPropagation?.();
                    onAssignDelivery(order);
                  }}
                  activeOpacity={0.8}
                >
                  <Bike size={12} color="#FFFFFF" />
                  <Text style={[styles.assignDriverText, { fontSize: 11 }]} numberOfLines={1}>
                    {deliveryPartnerName ? `Rider: ${deliveryPartnerName}` : 'Assign Rider'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.printIconBtn, { width: 34, height: 32 }]}
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
                style={[styles.outForDeliveryBtn, { width: '100%', paddingVertical: 7, paddingHorizontal: 6 }]}
                onPress={(e: any) => {
                  e.stopPropagation?.();
                  onUpdateStatus(order._id, 'out_for_delivery');
                }}
                activeOpacity={0.8}
              >
                <Truck size={13} color="#FFFFFF" />
                <Text style={[styles.outForDeliveryBtnText, { fontSize: 11 }]} numberOfLines={1}>
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
            style={[styles.acceptBtn, isTablet && styles.acceptBtnTablet, { backgroundColor: '#10B981' }, compact && { paddingVertical: 7, paddingHorizontal: 6 }]}
            onPress={(e: any) => {
              e.stopPropagation?.();
              onUpdateStatus(order._id, 'delivered');
            }}
            activeOpacity={0.8}
          >
            <Check size={isTablet ? 15 : compact ? 12 : 13} color="#FFFFFF" />
            <Text style={[styles.acceptBtnText, isTablet && styles.acceptBtnTextTablet, compact && { fontSize: 11 }]} numberOfLines={1}>
              {fulfillmentType === 'takeaway' ? (compact ? 'Collected' : 'Mark Collected (Takeaway)') : (compact ? 'Collected' : 'Delivered')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.printIconBtn, isTablet && styles.printIconBtnTablet, compact && { width: 34, height: 32 }]}
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
                style={[styles.acceptBtn, { flex: 1, paddingVertical: 7, paddingHorizontal: 6 }]}
                onPress={(e: any) => {
                  e.stopPropagation?.();
                  onUpdateStatus(order._id, 'delivered');
                }}
                activeOpacity={0.8}
              >
                <Check size={12} color="#FFFFFF" />
                <Text style={[styles.acceptBtnText, { fontSize: 11 }]} numberOfLines={1}>Delivered</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.printIconBtn, { width: 34, height: 32 }]}
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
              style={[styles.assignDriverIconBtn, { width: '100%', paddingVertical: 7, paddingHorizontal: 6 }]}
              onPress={(e: any) => {
                e.stopPropagation?.();
                onAssignDelivery(order);
              }}
              activeOpacity={0.8}
            >
              <Bike size={12} color="#FFFFFF" />
              <Text style={[styles.assignDriverText, { fontSize: 11 }]} numberOfLines={1}>
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
            <Text style={[styles.acceptBtnText, isTablet && styles.acceptBtnTextTablet]}>Mark Delivered</Text>
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
            style={[styles.acceptBtn, isTablet && styles.acceptBtnTablet, { backgroundColor: '#10B981' }, compact && { paddingVertical: 7, paddingHorizontal: 6 }]}
            onPress={(e: any) => {
              e.stopPropagation?.();
              onUpdateStatus(order._id, 'delivered');
            }}
            activeOpacity={0.8}
          >
            <Check size={isTablet ? 15 : compact ? 12 : 13} color="#FFFFFF" />
            <Text style={[styles.acceptBtnText, isTablet && styles.acceptBtnTextTablet, compact && { fontSize: 11 }]}>Delivered</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.printIconBtn, isTablet && styles.printIconBtnTablet, compact && { width: 34, height: 32 }]}
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
          <Text style={[styles.kanbanItemCount, isTablet && styles.kanbanItemCountTablet, compact && { fontSize: 9 }]}>{itemCount} items</Text>
        </View>
      </View>

      <View style={styles.kanbanRestaurantRow}>
        <Text style={[styles.kanbanRestaurant, isTablet && styles.kanbanRestaurantTablet, compact && { fontSize: 12 }]} numberOfLines={1}>{restaurantName}</Text>
      </View>

      <View style={[styles.sourceBadgeContainer, isTablet && styles.sourceBadgeContainerTablet]}>
        <View style={[sourceDetails.isExternal ? styles.sourceBadgeExternal : styles.sourceBadgeKrifoo, isTablet && (sourceDetails.isExternal ? styles.sourceBadgeExternalTablet : styles.sourceBadgeKrifooTablet), compact && { paddingHorizontal: 6, paddingVertical: 2.5, maxWidth: '100%' }]}>
          <Text
            style={[sourceDetails.isExternal ? styles.sourceBadgeTextExternal : styles.sourceBadgeTextKrifoo, isTablet && (sourceDetails.isExternal ? styles.sourceBadgeTextExternalTablet : styles.sourceBadgeTextKrifooTablet), compact && { fontSize: 10 }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {sourceDetails.isExternal ? (sourceDetails.domainUrl.includes('Takeaway') ? `🥡 ${sourceDetails.domainUrl}` : `🌐 ${sourceDetails.domainUrl}`) : '📱 krifoo.co.uk'}
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
        <View style={[styles.kanbanAddressRow, isTablet && styles.kanbanAddressRowTablet, compact && { paddingHorizontal: 6, paddingVertical: 5, marginBottom: 5, gap: 5, minWidth: 0 }]}>
          <MapPin size={isTablet ? 15 : compact ? 11 : 13} color="#2563EB" style={[styles.addressPinIcon, compact && { marginTop: 1 }]} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.kanbanAddressHeader, isTablet && styles.kanbanAddressHeaderTablet, compact && { fontSize: 9, marginBottom: 0 }]}>DELIVERY ADDRESS:</Text>
            <Text style={[styles.kanbanAddressText, isTablet && styles.kanbanAddressTextTablet, compact && { fontSize: 10, lineHeight: 13 }]} numberOfLines={2}>
              {deliveryAddressText}
            </Text>
          </View>
        </View>
      ) : null}

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

      <View style={[styles.kanbanFooter, compact && { marginTop: 4 }]}>
        <View style={styles.kanbanDateRow}>
          <Clock size={isTablet ? 13 : compact ? 10 : 11} color="#9BA1A6" />
          <Text style={[styles.kanbanDate, isTablet && { fontSize: 11 }, compact && { fontSize: 9.5 }]}>{formatDateTime(order.createdAt)}</Text>
        </View>
        <View
          style={[
            styles.orderTypeBadge,
            compact && { paddingHorizontal: 4, paddingVertical: 1.5 },
            fulfillmentType === 'delivery'
              ? { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }
              : fulfillmentType === 'dine_in'
              ? { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }
              : fulfillmentType === 'takeaway'
              ? { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }
              : { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' },
          ]}
        >
          <Text
            style={[
              styles.orderTypeText,
              isTablet && { fontSize: 10 },
              compact && { fontSize: 8 },
              fulfillmentType === 'delivery'
                ? { color: '#2563EB' }
                : fulfillmentType === 'dine_in'
                ? { color: '#7C3AED' }
                : fulfillmentType === 'takeaway'
                ? { color: '#B45309' }
                : { color: '#EA580C' },
            ]}
            numberOfLines={1}
          >
            {fulfillmentType === 'delivery'
              ? 'DELIVERY'
              : fulfillmentType === 'dine_in'
                ? 'DINE IN'
              : fulfillmentType === 'takeaway'
              ? 'TAKEAWAY'
              : 'PICKUP'}
          </Text>
        </View>
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
                  {item.customization?.size ? (
                    <Text style={[styles.itemMeta, isTablet && { fontSize: 11 }]}>Size: {item.customization.size}</Text>
                  ) : null}
                  {item.customization?.addOns && item.customization.addOns.length > 0 ? (
                    <Text style={[styles.itemMeta, isTablet && { fontSize: 11 }]}>+{item.customization.addOns.join(', ')}</Text>
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

      {renderCardActions()}
    </TouchableOpacity>
  );
};

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isTablet = windowWidth >= TABLET_BREAKPOINT;
  const isMobile = windowWidth < TABLET_BREAKPOINT;

  const [headerHeight, setHeaderHeight] = useState(65);
  const [searchHeight, setSearchHeight] = useState(54);
  const [toolbarHeight, setToolbarHeight] = useState(isTablet ? 42 : 46);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);

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
    return Math.max(isTablet ? 200 : 160, rawWidth);
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

  const handleStepColumns = useCallback((delta: -1 | 1) => {
    const currentNum = boardColumnsSetting === 'auto' ? autoColumns : boardColumnsSetting;
    const nextNum = Math.max(1, Math.min(6, currentNum + delta));
    handleSetBoardColumns(nextNum as 1 | 2 | 3 | 4 | 5 | 6);
  }, [boardColumnsSetting, autoColumns, handleSetBoardColumns]);

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

  const fetchOrders = useCallback(async (isRefresh = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      if (!isRefresh) setLoading(true);
      const res: any = await orderService.fetchAllOrders();
      if (res.success && res.data) {
        setOrders(res.data);
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

  // 1. Refetch whenever screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchOrders(true);
      loadPaperRollSize();
    }, [fetchOrders, loadPaperRollSize])
  );

  // 2. Real-time WebSocket listener + auto polling + App foreground refresh
  useEffect(() => {
    fetchOrders();

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
        fetchOrders(true);
      }
    });

    // Fallback poll every 12 seconds so orders stay fresh if WebSocket disconnects
    const interval = setInterval(() => {
      fetchOrders(true);
    }, 12000);

    // Refresh immediately when coming back from background
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        fetchOrders(true);
      }
    });

    return () => {
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
      const past7 = new Date(now);
      past7.setDate(past7.getDate() - 7);
      dateFrom = startOfDay(past7);
      dateTo = endOfDay(now);
    } else if (datePreset === '30days') {
      const past30 = new Date(now);
      past30.setDate(past30.getDate() - 30);
      dateFrom = startOfDay(past30);
      dateTo = endOfDay(now);
    } else if (datePreset === 'custom' && customDateFrom && customDateTo) {
      dateFrom = startOfDay(new Date(customDateFrom));
      dateTo = endOfDay(new Date(customDateTo));
    }

    return orders.filter((order) => {
      const sourceDetails = getOrderSourceDetails(order);
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const idMatch = order._id?.toLowerCase().includes(q) || order.orderNumber?.toLowerCase().includes(q);
        const restMatch = getRestaurantName(order).toLowerCase().includes(q);
        const custMatch = getCustomerName(order).toLowerCase().includes(q);
        const domainMatch = sourceDetails.domainUrl.toLowerCase().includes(q);
        if (!idMatch && !restMatch && !custMatch && !domainMatch) return false;
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

      // Date filter
      if (dateFrom && dateTo && order.createdAt) {
        const created = new Date(order.createdAt);
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

  const activeOrderCount = useMemo(
    () => filteredOrders.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled').length,
    [filteredOrders]
  );

  const executeUpdateStatus = async (orderId: string, newStatus: string) => {
    // 1. Snapshot previous state for instant rollback if network or server fails
    const prevOrders = orders;
    const prevSelected = selectedOrder;

    // 2. Optimistic instant UI update (0ms latency)
    const updateOrderLocally = (o: Order): Order => {
      const updated: any = {
        ...o,
        status: newStatus as any,
        ...(newStatus !== 'placed' && newStatus !== 'cancelled' && (o.acceptanceStatus === 'pending' || !o.acceptanceStatus)
          ? { acceptanceStatus: 'accepted' as any }
          : {}),
      };
      if (newStatus === 'delivered' && (o.paymentType === 'cash' || (o as any).paymentType === 'cod')) {
        updated.paymentStatus = 'paid';
      }
      return updated;
    };

    setOrders((current) => current.map((o) => (o._id === orderId ? updateOrderLocally(o) : o)));
    if (selectedOrder && selectedOrder._id === orderId) {
      setSelectedOrder((prev) => (prev ? updateOrderLocally(prev) : null));
    }

    // 3. Instant feedback
    showToast({ title: 'Success', message: `Order status updated to '${newStatus}'.`, type: 'success' });

    // 4. Auto-print asynchronously in the background so it never freezes the UI
    if (newStatus === 'preparing') {
      (async () => {
        try {
          const autoPrint = await isAutoPrintEnabled();
          if (autoPrint) {
            let orderToPrint: any = selectedOrder?._id === orderId ? selectedOrder : orders.find((o) => o._id === orderId);
            if (!orderToPrint?.orderedItems?.length && !(orderToPrint as any)?.items?.length) {
              const fullOrderRes = await orderService.getOrderById(orderId);
              if (fullOrderRes.success && fullOrderRes.data) orderToPrint = fullOrderRes.data;
            }
            if (orderToPrint) await printThermalReceipt(orderToPrint, true);
          }
        } catch (printErr) {
          console.error('[Orders] Auto-print failed:', printErr);
        }
      })();
    }

    // 5. Send server update in background without blocking UI
    try {
      const res = await orderService.updateOrderStatus(orderId, newStatus);
      if (res.success) {
        if (res.data) {
          // Merge authoritative server fields silently
          setOrders((current) => current.map((o) => (o._id === orderId ? { ...o, ...res.data } : o)));
          if (selectedOrder && selectedOrder._id === orderId) {
            setSelectedOrder((prev) => (prev ? { ...prev, ...res.data } : null));
          }
        }
      } else {
        // Rollback state on server rejection
        setOrders(prevOrders);
        if (prevSelected) setSelectedOrder(prevSelected);
        showToast({ title: 'Error', message: res.message || 'Failed to update order.', type: 'error' });
      }
    } catch (err: any) {
      // Rollback state on network error
      setOrders(prevOrders);
      if (prevSelected) setSelectedOrder(prevSelected);
      showToast({ title: 'Error', message: err?.message || 'Network error updating status.', type: 'error' });
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

  const handleAssignConfirm = async (deliveryPartnerId: string) => {
    if (!selectedOrder) return;
    const orderId = selectedOrder._id;
    const prevOrders = orders;
    const prevSelected = selectedOrder;

    // Optimistic assignment update
    setSelectedOrder((prev) => (prev ? { ...prev, deliveryPartner: deliveryPartnerId as any } : null));
    setOrders((current) =>
      current.map((o) => (o._id === orderId ? { ...o, deliveryPartner: deliveryPartnerId as any } : o))
    );
    showToast({ title: 'Success', message: 'Delivery partner assigned.', type: 'success' });

    try {
      const res = await orderService.assignDeliveryPartner(orderId, deliveryPartnerId);
      if (res.success) {
        if (res.data) {
          setOrders((current) => current.map((o) => (o._id === orderId ? { ...o, ...res.data } : o)));
          setSelectedOrder((prev) => (prev ? { ...prev, ...res.data } : null));
        }
      } else {
        setOrders(prevOrders);
        setSelectedOrder(prevSelected);
        showToast({ title: 'Error', message: res.message || 'Failed to assign.', type: 'error' });
      }
    } catch {
      setOrders(prevOrders);
      setSelectedOrder(prevSelected);
      showToast({ title: 'Error', message: 'Network error assigning delivery partner.', type: 'error' });
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Page Header (collapses on scroll down to maximize board length) */}
      {!isHeaderCollapsed && (
        <View
          style={[styles.pageHeader, isMobile && styles.pageHeaderMobile, isTablet && styles.pageHeaderTablet]}
        >
        <View style={{ flexShrink: 1 }}>
          <View style={styles.pageTitleRow}>
            <Text style={[styles.pageTitle, isMobile && styles.pageTitleMobile]}>Orders Board</Text>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Live</Text>
            </View>
          </View>
          <Text style={[styles.pageSubtitle, isMobile && styles.pageSubtitleMobile]} numberOfLines={1}>
            {isMobile
              ? `${activeOrderCount} active order${activeOrderCount !== 1 ? 's' : ''}`
              : `${activeOrderCount} active order${activeOrderCount !== 1 ? 's' : ''} requiring attention`}
          </Text>
        </View>

        <View style={[styles.headerRightControls, isMobile && styles.headerRightControlsMobile]}>
          {isTablet && viewMode === 'board' && (
            <TouchableOpacity
              style={styles.headerBoardLayoutBtn}
              onPress={() => setBoardColumnsModalOpen(true)}
              activeOpacity={0.7}
            >
              <LayoutGrid size={13} color="#FF5C39" />
              <Text style={styles.headerBoardLayoutBtnText}>
                {boardColumnsSetting === 'auto' ? `Auto (${autoColumns})` : `${boardColumnsSetting} Tabs`}
              </Text>
              <ChevronDown size={11} color="#FF5C39" />
            </TouchableOpacity>
          )}

          <View style={[styles.viewToggleContainer, isMobile && styles.viewToggleContainerMobile]}>
            <TouchableOpacity
              style={[styles.toggleBtn, isMobile && styles.toggleBtnMobile, viewMode === 'board' && styles.toggleBtnActive]}
              onPress={() => setViewMode('board')}
              activeOpacity={0.7}
            >
              <LayoutGrid size={isMobile ? 12 : 13} color={viewMode === 'board' ? '#FFFFFF' : '#687076'} />
              <Text style={[styles.toggleBtnText, isMobile && styles.toggleBtnTextMobile, viewMode === 'board' && styles.toggleBtnTextActive]}>Board</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, isMobile && styles.toggleBtnMobile, viewMode === 'tabs' && styles.toggleBtnActive]}
              onPress={() => setViewMode('tabs')}
              activeOpacity={0.7}
            >
              <List size={isMobile ? 12 : 13} color={viewMode === 'tabs' ? '#FFFFFF' : '#687076'} />
              <Text style={[styles.toggleBtnText, isMobile && styles.toggleBtnTextMobile, viewMode === 'tabs' && styles.toggleBtnTextActive]}>Tabs</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.refreshBtn, isMobile && styles.refreshBtnMobile]} onPress={onRefresh}>
            <RefreshCw size={isMobile ? 14 : 16} color={Colors.textSubtle} />
          </TouchableOpacity>
        </View>
      </View>
      )}

      {/* STICKY SEARCH SECTION */}
      <View
        style={[styles.stickySearchWrapper, isHeaderCollapsed && styles.stickySearchWrapperElevated]}
      >
        {/* Controls */}
        <View style={[styles.controlsRow, isTablet && styles.controlsRowTablet]}>
        {/* Search + Filter + Channel Row */}
        <View style={[styles.searchAndChannelRow, isTablet && styles.searchAndChannelRowTablet]}>
          <View style={[styles.searchBox, { flex: 1 }]}>
            <Search size={14} color={Colors.textSubtle} />
            <TextInput
              style={styles.searchInput}
              placeholder={isMobile ? "Search orders..." : "Search #ORD, customer, item..."}
              placeholderTextColor={Colors.textSubtle}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={13} color="#9BA1A6" />
              </TouchableOpacity>
            )}
          </View>

          {/* Filter Button */}
          <TouchableOpacity
            style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]}
            onPress={() => setFilterModalOpen(true)}
            activeOpacity={0.8}
          >
            <SlidersHorizontal size={13} color={activeFilterCount > 0 ? '#FFFFFF' : '#11181C'} />
            <Text style={[styles.filterBtnText, activeFilterCount > 0 && styles.filterBtnTextActive]}>
              Filter
            </Text>
            {activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Dateframe Selection Dropdown Button (Replaced Channel By) */}
          <TouchableOpacity
            style={[styles.dateDropdownBtn, datePreset !== 'today' && styles.dateDropdownBtnActive]}
            onPress={() => setDateDropdownOpen(true)}
            activeOpacity={0.8}
          >
            <Calendar size={13} color={datePreset === 'today' ? '#687076' : '#FF5C39'} />
            <Text
              style={[styles.dateDropdownBtnText, datePreset !== 'today' && { color: '#FF5C39' }]}
              numberOfLines={1}
            >
              {getDatePresetLabel()}
            </Text>
            <ChevronDown size={11} color={datePreset === 'today' ? '#9BA1A6' : '#FF5C39'} />
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
                    Type: {typeFilter === 'takeaway' ? 'Takeaway' : typeFilter === 'pickup' ? 'Self Pickup' : typeFilter === 'delivery' ? 'Delivery' : typeFilter === 'dine_in' ? 'Dine-In' : typeFilter}
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
                    setTempDateFrom(customDateFrom || new Date().toISOString().slice(0, 10));
                    setTempDateTo(customDateTo || new Date().toISOString().slice(0, 10));
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
                      setTempDateFrom(from.toISOString().slice(0, 10));
                      setTempDateTo(to.toISOString().slice(0, 10));
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
                    setCustomDateFrom(tempDateFrom);
                    setCustomDateTo(tempDateTo);
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

      {/* Board Columns / Tabs Per Screen Customization Modal */}
      <Modal
        visible={boardColumnsModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setBoardColumnsModalOpen(false)}
      >
        <TouchableOpacity
          style={[styles.dropdownOverlay, isTablet && styles.modalOverlayTablet]}
          activeOpacity={1}
          onPress={() => setBoardColumnsModalOpen(false)}
        >
          <View
            style={[styles.boardModalContainer, isTablet && styles.boardModalContainerTablet]}
            onStartShouldSetResponder={() => true}
          >
            {/* Header */}
            <View style={styles.boardModalHeader}>
              <Text style={styles.boardModalTitle}>Customize Board Tabs</Text>
              <TouchableOpacity
                onPress={() => setBoardColumnsModalOpen(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.boardModalCloseBtn}
              >
                <X size={16} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Current Screen Metrics Box */}
            <View style={styles.boardMetricsBox}>
              <View style={styles.boardMetricItem}>
                <Text style={styles.boardMetricLabel}>Screen Width</Text>
                <Text style={styles.boardMetricValue}>{Math.round(windowWidth)}px</Text>
              </View>
              <View style={styles.boardMetricDivider} />
              <View style={styles.boardMetricItem}>
                <Text style={styles.boardMetricLabel}>Tabs on Screen</Text>
                <Text style={[styles.boardMetricValue, { color: '#FF5C39' }]}>
                  {boardColumnsSetting === 'auto' ? `${autoColumns} (Auto)` : `${boardColumnsSetting} Tabs`}
                </Text>
              </View>
              <View style={styles.boardMetricDivider} />
              <View style={styles.boardMetricItem}>
                <Text style={styles.boardMetricLabel}>Each Tab Width</Text>
                <Text style={styles.boardMetricValue}>{Math.round(columnWidth)}px</Text>
              </View>
            </View>

            {/* Stepper Row */}
            <View style={styles.boardStepperRow}>
              <Text style={styles.boardStepperLabel}>Quick Adjust:</Text>
              <View style={styles.boardStepperGroup}>
                <TouchableOpacity
                  style={[styles.stepperBtn, (boardColumnsSetting === 1 || (boardColumnsSetting === 'auto' && autoColumns <= 1)) && styles.stepperBtnDisabled]}
                  onPress={() => handleStepColumns(-1)}
                  disabled={boardColumnsSetting === 1}
                  activeOpacity={0.7}
                >
                  <Minus size={16} color={boardColumnsSetting === 1 ? '#CBD5E1' : '#11181C'} />
                </TouchableOpacity>

                <View style={styles.stepperValueBox}>
                  <Text style={styles.stepperValueText}>
                    {boardColumnsSetting === 'auto' ? `Auto (${autoColumns})` : `${boardColumnsSetting} Tabs`}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.stepperBtn, (boardColumnsSetting === 6 || (boardColumnsSetting === 'auto' && autoColumns >= 6)) && styles.stepperBtnDisabled]}
                  onPress={() => handleStepColumns(1)}
                  disabled={boardColumnsSetting === 6}
                  activeOpacity={0.7}
                >
                  <Plus size={16} color={boardColumnsSetting === 6 ? '#CBD5E1' : '#11181C'} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Presets List */}
            <ScrollView style={styles.boardPresetsScroll} showsVerticalScrollIndicator={false}>
              {BOARD_COLUMN_PRESETS.map((preset) => {
                const isSelected = boardColumnsSetting === preset.value;
                return (
                  <TouchableOpacity
                    key={String(preset.value)}
                    style={[styles.boardPresetItem, isSelected && styles.boardPresetItemActive]}
                    onPress={() => handleSetBoardColumns(preset.value)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.boardPresetTitle,
                        isSelected && styles.boardPresetTitleActive,
                      ]}
                    >
                      {preset.title}
                    </Text>
                    {isSelected && (
                      <View style={styles.boardPresetCheck}>
                        <Check size={12} color="#FFFFFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Footer */}
            <View style={styles.boardModalFooter}>
              <TouchableOpacity
                style={styles.boardModalResetBtn}
                onPress={() => handleSetBoardColumns('auto')}
                activeOpacity={0.8}
              >
                <RotateCcw size={13} color="#64748B" />
                <Text style={styles.boardModalResetBtnText}>Reset to Auto</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.boardModalApplyBtn}
                onPress={() => setBoardColumnsModalOpen(false)}
                activeOpacity={0.8}
              >
                <Check size={14} color="#FFFFFF" />
                <Text style={styles.boardModalApplyBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
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

      {/* Board View Column / Tab Size Customizer Toolbar (Shown in Board mode) */}
      {viewMode === 'board' && (
        <View
          onLayout={(e) => setToolbarHeight(e.nativeEvent.layout.height)}
          style={[styles.boardToolbarContainer, isTablet ? styles.boardToolbarContainerTablet : styles.boardToolbarContainerMobile]}
        >
          <View style={[styles.boardToolbarLeft, isMobile && { flex: 1, marginRight: 8 }]}>
            {isTablet && (
              <View style={styles.boardToolbarLabelRow}>
                <LayoutGrid size={13} color="#687076" />
                <Text style={styles.boardToolbarLabel}>Tabs / screen:</Text>
              </View>
            )}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.boardColPillsScroll, isMobile && { paddingRight: 4 }]}>
              {(['auto', 1, 2, 3, 4, 5, 6] as const).map((count) => {
                const isSelected = boardColumnsSetting === count;
                const labelText = count === 'auto'
                  ? (isTablet ? `Auto (${autoColumns})` : 'Auto')
                  : (isMobile ? `${count} Tab${count > 1 ? 's' : ''}` : `${count}`);
                return (
                  <TouchableOpacity
                    key={String(count)}
                    style={[styles.colPill, isMobile && styles.colPillMobile, isSelected && styles.colPillActive]}
                    onPress={() => handleSetBoardColumns(count)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.colPillText, isMobile && styles.colPillTextMobile, isSelected && styles.colPillTextActive]}>
                      {labelText}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <TouchableOpacity
            style={[styles.boardSettingsTrigger, isMobile && styles.boardSettingsTriggerMobile]}
            onPress={() => setBoardColumnsModalOpen(true)}
            activeOpacity={0.7}
          >
            <SlidersHorizontal size={isMobile ? 11 : 12} color="#FF5C39" />
            <Text style={[styles.boardSettingsTriggerText, isMobile && { fontSize: 10 }]}>
              {isTablet ? 'Customize' : 'Adjust'}
            </Text>
            <View style={styles.boardSettingsTriggerBadge}>
              <Text style={styles.boardSettingsTriggerBadgeText}>
                {Math.round(columnWidth)}px
              </Text>
            </View>
          </TouchableOpacity>
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
          <View style={styles.centerEmpty}>
            <ShoppingBag size={48} color="#EEEEEE" />
            <Text style={styles.emptyTitle}>No Orders Found</Text>
            <Text style={styles.emptySubtitle}>There are no orders for the selected status tab or search query.</Text>
          </View>
        ) : (
          <FlatList
            key={isTablet ? 'orders-tab-grid-2col' : 'orders-tab-list-1col'}
            data={activeTabOrders}
            keyExtractor={(item) => item._id}
            numColumns={isTablet ? 2 : 1}
            columnWrapperStyle={isTablet ? styles.ordersColumnWrapper : undefined}
            contentContainerStyle={[styles.tabOrdersList, isTablet && styles.tabOrdersListTablet]}
            onScroll={handleListScroll}
            scrollEventThrottle={16}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF5C39" colors={['#FF5C39']} />}
            renderItem={({ item }) => (
              <View style={isTablet ? styles.orderGridItemWrapper : undefined}>
                <OrderCardItem
                  order={item}
                  onPress={(o) => { setSelectedOrder(o); setDetailModalVisible(true); }}
                  onAssignDelivery={(o) => { setSelectedOrder(o); setAssignModalVisible(true); }}
                  onUpdateStatus={handleUpdateStatus}
                  onPrint={handlePrintOrder}
                  paperRollSize={paperRollSize}
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
                    renderItem={({ item }) => (
                      <OrderCardItem
                        order={item}
                        onPress={(o) => { setSelectedOrder(o); setDetailModalVisible(true); }}
                        onAssignDelivery={(o) => { setSelectedOrder(o); setAssignModalVisible(true); }}
                        onUpdateStatus={handleUpdateStatus}
                        onPrint={handlePrintOrder}
                        paperRollSize={paperRollSize}
                        compact={isCompact}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  stickySearchWrapper: {
    backgroundColor: '#FFFFFF',
    zIndex: 20,
    width: '100%',
  },
  stickySearchWrapperElevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 4,
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
  pageTitle: { fontSize: 20, fontWeight: '800', color: '#11181C', letterSpacing: -0.3 },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5',
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, gap: 4,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  liveText: { fontSize: 11, fontWeight: '700', color: '#065F46' },
  pageSubtitle: { fontSize: 12, color: '#9BA1A6', marginTop: 2 },
  headerRightControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  viewToggleContainer: {
    flexDirection: 'row', backgroundColor: '#F0F0F0', borderRadius: 8, padding: 3, gap: 2,
  },
  toggleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
  },
  toggleBtnActive: { backgroundColor: '#FF5C39' },
  toggleBtnText: { fontSize: 12, fontWeight: '700', color: '#687076' },
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
    borderRadius: 8, borderWidth: 1, borderColor: '#EEEEEE', paddingHorizontal: 10, gap: 8, height: 38,
  },
  searchInput: { flex: 1, fontSize: 13, color: '#11181C', height: 38 },
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
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 8,
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
    fontSize: 12,
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
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 8,
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
    fontSize: 11.5,
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
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: '#FFF4F2',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  activeFilterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF5C39',
  },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  clearAllBtnText: {
    fontSize: 11,
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
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: '#EEEEEE',
  },
  statusTabLabel: { fontSize: 12, fontWeight: '700', color: '#11181C' },
  statusTabLabelActive: { color: '#FFFFFF' },
  tabBadge: {
    borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, minWidth: 18, alignItems: 'center', justifyContent: 'center',
  },
  tabBadgeActive: { backgroundColor: '#FFFFFF' },
  tabBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },

  tabOrdersList: { padding: 16, gap: 12, paddingBottom: 110 },
  centerLoader: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  centerEmpty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#11181C', marginTop: 8 },
  emptySubtitle: { fontSize: 12, color: '#9BA1A6', textAlign: 'center' },

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
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    padding: 12,
    paddingTop: 15,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
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
    height: 4,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    zIndex: 1,
  },
  cardTopStatusStripTablet: {
    height: 5,
    borderTopLeftRadius: 11,
    borderTopRightRadius: 11,
  },
  kanbanCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  kanbanOrderIdCol: { gap: 2 },
  kanbanOrderIdRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kanbanOrderId: { fontSize: 13, fontWeight: '700', color: '#11181C' },
  kanbanPaymentBelowId: { fontSize: 11, fontWeight: '700', color: '#687076', marginTop: 2 },
  paidBadge: { backgroundColor: '#ECFDF5', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  paidBadgeText: { fontSize: 9, fontWeight: '800', color: '#065F46', letterSpacing: 0.5 },
  pendingBadge: { backgroundColor: '#FFFBEB', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  pendingBadgeText: { fontSize: 9, fontWeight: '800', color: '#B45309', letterSpacing: 0.5 },
  failedBadge: { backgroundColor: '#FEF2F2', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  failedBadgeText: { fontSize: 9, fontWeight: '800', color: '#DC2626', letterSpacing: 0.5 },
  refundedBadge: { backgroundColor: '#F3E8FF', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  refundedBadgeText: { fontSize: 9, fontWeight: '800', color: '#7C3AED', letterSpacing: 0.5 },
  kanbanAmountRow: { alignItems: 'flex-end' },
  kanbanAmount: { fontSize: 15, fontWeight: '800', color: '#11181C' },
  kanbanItemCount: { fontSize: 10, color: '#9BA1A6', marginTop: 1 },

  kanbanDivider: { height: 1, backgroundColor: '#F5F5F5', marginVertical: 10 },
  kanbanCustomerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  kanbanAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  kanbanAvatarText: { fontSize: 12, fontWeight: '700', color: '#687076' },
  kanbanCustomerName: { fontSize: 13, fontWeight: '600', color: '#11181C' },
  kanbanCustomerPhone: { fontSize: 11, color: '#9BA1A6' },
  kanbanAddressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    marginBottom: 8,
    gap: 7,
  },
  addressPinIcon: {
    marginTop: 2,
  },
  kanbanAddressHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1E40AF',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 1,
  },
  kanbanAddressText: {
    fontSize: 11.5,
    color: '#1E3A8A',
    fontWeight: '600',
    lineHeight: 16,
  },
  kanbanTypeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
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
  riderBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F8F9FA', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1, borderColor: '#EEEEEE' },
  riderText: { fontSize: 10, color: '#687076' },
  kanbanFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kanbanDateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  kanbanDate: { fontSize: 10, color: '#9BA1A6' },
  orderTypeBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  orderTypeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  viewItemsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F5F5F5' },
  viewItemsBtnText: { fontSize: 10, fontWeight: '700', color: '#9BA1A6', letterSpacing: 0.3 },
  itemsList: { marginTop: 8, gap: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemQty: { fontSize: 11, fontWeight: '700', color: '#9BA1A6', width: 22 },
  itemName: { flex: 1, fontSize: 11, color: '#11181C' },
  itemPrice: { fontSize: 11, fontWeight: '600', color: '#687076' },
  noteRow: { flexDirection: 'row', marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#F5F5F5' },
  noteLabel: { fontSize: 11, fontWeight: '700', color: '#9BA1A6' },
  noteText: { fontSize: 11, color: '#687076', flex: 1 },
  actionButtonsRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  acceptBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#10B981', borderRadius: 8, paddingVertical: 8 },
  acceptBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#EF4444', borderRadius: 8, paddingVertical: 8 },
  rejectBtnText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },
  outForDeliveryBtn: { flex: 1.3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#8B5CF6', borderRadius: 8, paddingVertical: 8 },
  outForDeliveryBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  assignDriverIconBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#FF5C39', borderRadius: 8, paddingVertical: 8 },
  assignDriverText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  printIconBtn: {
    width: 36,
    height: 34,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  printFullBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingVertical: 8,
  },
  printFullBtnText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
  },
  itemMeta: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1,
  },

  /* Watermark Stamp Styles */
  stampOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
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
    padding: 16,
    paddingTop: 19,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  kanbanOrderIdTablet: {
    fontSize: 15,
  },
  kanbanPaymentBelowIdTablet: {
    fontSize: 12,
  },
  kanbanAmountTablet: {
    fontSize: 17,
  },
  kanbanItemCountTablet: {
    fontSize: 11,
  },
  kanbanRestaurantTablet: {
    fontSize: 12.5,
  },
  kanbanCustomerRowTablet: {
    marginBottom: 8,
    gap: 10,
  },
  kanbanAvatarTablet: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  kanbanAvatarTextTablet: {
    fontSize: 13,
  },
  kanbanCustomerNameTablet: {
    fontSize: 14.5,
  },
  kanbanCustomerPhoneTablet: {
    fontSize: 12,
  },
  kanbanAddressRowTablet: {
    paddingHorizontal: 11,
    paddingVertical: 9,
    marginBottom: 10,
    gap: 8,
    borderRadius: 9,
  },
  kanbanAddressHeaderTablet: {
    fontSize: 11,
  },
  kanbanAddressTextTablet: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  kanbanTypeRowTablet: {
    marginBottom: 10,
    gap: 8,
  },
  actionButtonsRowTablet: {
    gap: 10,
    marginTop: 12,
  },
  acceptBtnTablet: {
    paddingVertical: 10,
    borderRadius: 9,
  },
  acceptBtnTextTablet: {
    fontSize: 13,
  },
  rejectBtnTablet: {
    paddingVertical: 10,
    borderRadius: 9,
  },
  rejectBtnTextTablet: {
    fontSize: 13,
  },
  outForDeliveryBtnTablet: {
    paddingVertical: 10,
    borderRadius: 9,
  },
  outForDeliveryBtnTextTablet: {
    fontSize: 13,
  },
  assignDriverIconBtnTablet: {
    paddingVertical: 10,
    borderRadius: 9,
  },
  assignDriverTextTablet: {
    fontSize: 13,
  },
  printFullBtnTablet: {
    paddingVertical: 10,
    borderRadius: 9,
  },
  printFullBtnTextTablet: {
    fontSize: 13,
  },
  printIconBtnTablet: {
    width: 42,
    height: 40,
    borderRadius: 9,
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
  boardModalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '92%',
    maxWidth: 520,
    maxHeight: '88%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
  },
  boardModalContainerTablet: {
    width: 520,
  },
  boardModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  boardModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#11181C',
    letterSpacing: -0.2,
  },
  boardModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardMetricsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#F8FAFC',
    marginHorizontal: 20,
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  boardMetricItem: {
    alignItems: 'center',
  },
  boardMetricLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  boardMetricValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#11181C',
    marginTop: 2,
  },
  boardMetricDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#CBD5E1',
  },
  boardStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  boardStepperLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#11181C',
  },
  boardStepperGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  stepperBtnDisabled: {
    opacity: 0.4,
  },
  stepperValueBox: {
    minWidth: 95,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#FF5C39',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  stepperValueText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FF5C39',
  },
  boardPresetsScroll: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    maxHeight: 280,
  },
  boardPresetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    backgroundColor: '#FAFAFA',
  },
  boardPresetItemActive: {
    borderColor: '#FF5C39',
    backgroundColor: '#FFF4F2',
  },
  boardPresetTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#11181C',
  },
  boardPresetTitleActive: {
    color: '#FF5C39',
    fontWeight: '800',
  },
  boardPresetCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FF5C39',
    alignItems: 'center',
    justifyContent: 'center',
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
