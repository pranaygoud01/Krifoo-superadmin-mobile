import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  X,
  ArrowLeft,
  MapPin,
  Bike,
  CreditCard,
  Phone,
  ShoppingBag,
  UtensilsCrossed,
  Printer,
  Banknote,
  ChevronDown,
  ChevronUp,
  Check,
  AlertTriangle,
  Calendar,
  Clock,
  Globe,
  Smartphone,
  StickyNote,
  Navigation,
} from 'lucide-react-native';
import type { Order } from '../../types';
import type { ManualPaymentStatus } from '../../services/order.service';
import { Colors } from '../../constants/colors';
import { OrderCountdownText } from '../OrderCountdownBadge';
import { getOrderScheduleInfo } from '../../services/thermal-print.service';
import { getSanitizedOrderNotes } from '../../services/printer/receipt-document';
import { getItemOptionsList } from '../../services/receipt-customization.service';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getOrderFulfillmentType } from '../../utils/order-fulfillment';
import { getOrderStatusColor, getOrderStatusLabel, getOrderStatusSurface } from '../../utils/order-status';

/**
 * The order details UI, shared by the Orders-tab sheet (`OrderDetailModal`) and the
 * full-screen route (`app/order-details.tsx`). Wrappers own data loading and side effects;
 * this component owns layout plus the small local UI state (status list, cancel confirm).
 */

export type OrderDetailViewProps = {
  order: Order;
  variant: 'sheet' | 'screen';
  loading?: boolean;
  /** Sheet: close. Screen: go back. */
  onClose: () => void;
  /** Change status (never called with 'cancelled' — that goes through onCancelOrder after confirmation). */
  onUpdateStatus?: (status: string) => Promise<void>;
  /** Manually set payment status (owner only; hidden for orders paid online via Stripe). */
  onUpdatePaymentStatus?: (status: ManualPaymentStatus) => Promise<void>;
  onCancelOrder: () => Promise<void>;
  onAssignDelivery?: () => void;
  onEditDeliveryTime?: () => void;
  onPrint: () => void;
  printing?: boolean;
  paperRollSize?: string;
};

const PAYMENT_OPTIONS: Array<{ value: ManualPaymentStatus; label: string; sub: string; color: string }> = [
  { value: 'pending', label: 'Unpaid', sub: 'Not paid yet', color: '#D97706' },
  { value: 'paid', label: 'Paid', sub: 'Money received', color: '#059669' },
  { value: 'failed', label: 'Failed', sub: 'Payment didn’t go through', color: '#DC2626' },
  { value: 'refunded', label: 'Refunded', sub: 'Money returned to the customer', color: '#7C3AED' },
];

const STATUS_OPTIONS = [
  { label: 'New', sub: 'Order received', value: 'placed' },
  { label: 'In Kitchen', sub: 'Being prepared', value: 'preparing' },
  { label: 'Ready for Collection', sub: 'Waiting for the customer', value: 'ready_for_pickup' },
  { label: 'Out for Delivery', sub: 'Rider on the way', value: 'out_for_delivery' },
  { label: 'Completed', sub: 'Delivered or collected', value: 'delivered' },
  { label: 'Cancelled', sub: 'Order cancelled', value: 'cancelled' },
];

const TYPE_META = {
  delivery: { label: 'Delivery', Icon: Bike, color: '#1D4ED8', bg: '#DBEAFE' },
  pickup: { label: 'Self Pickup', Icon: ShoppingBag, color: '#C2410C', bg: '#FFEDD5' },
  takeaway: { label: 'Takeaway', Icon: ShoppingBag, color: '#B45309', bg: '#FEF3C7' },
  dine_in: { label: 'Dine-in', Icon: UtensilsCrossed, color: '#6D28D9', bg: '#EDE9FE' },
} as const;

const money = (n: number) => `£${(Number(n) || 0).toFixed(2)}`;

const cleanAddressString = (text: string) => {
  if (!text || typeof text !== 'string') return '';
  return text
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !/hyderabad|telangana/i.test(t))
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .join(', ');
};

/** Full delivery address, or null when there isn't one. */
function formatAddress(order: Order): string | null {
  const addr: any = order.deliveryAddress;
  if (!addr) {
    const custAddr: any = order.customerDetails?.address;
    if (typeof custAddr === 'string' && custAddr.trim()) return cleanAddressString(custAddr) || custAddr.trim();
    return null;
  }
  if (typeof addr === 'string') return cleanAddressString(addr) || addr.trim() || null;
  for (const field of [addr.fullAddress, addr.formattedAddress]) {
    if (typeof field === 'string' && field.trim()) {
      const cleaned = cleanAddressString(field);
      if (cleaned) return cleaned;
    }
  }
  if (typeof addr.addressLine1 === 'string' && addr.addressLine1.includes(',')) {
    const cleaned = cleanAddressString(addr.addressLine1);
    if (cleaned) return cleaned;
  }
  const rawParts = [
    addr.houseNumber || addr.flatNumber || addr.doorNo,
    addr.addressLine1,
    addr.addressLine2,
    addr.street,
    addr.landmark,
    addr.area,
    addr.city,
    addr.postalCode || addr.postcode || addr.zipCode,
  ].filter(Boolean);
  const uniqueParts: string[] = [];
  rawParts.forEach((p: any) => {
    const str = String(p).trim();
    if (
      str &&
      !/hyderabad|telangana/i.test(str) &&
      !uniqueParts.some((u) => u.toLowerCase() === str.toLowerCase() || u.toLowerCase().includes(str.toLowerCase()))
    ) {
      uniqueParts.push(str);
    }
  });
  return uniqueParts.length > 0 ? uniqueParts.join(', ') : addr.address || null;
}

const getItemName = (item: any) =>
  item.name || item.itemName || item.title || item.dishName || item.productName || item.menuItemId?.name || item.itemId?.name || 'Item';

function getItemTotal(item: any, qty: number) {
  for (const v of [item.itemTotal, item.totalPrice]) {
    if (v !== undefined && v !== null && !isNaN(Number(v)) && Number(v) > 0) return Number(v);
  }
  const unit = Number(
    item.price ?? item.basePrice ?? item.unitPrice ?? item.menuItemId?.price ?? item.menuItemId?.basePrice ?? item.itemId?.price ?? item.itemId?.basePrice ?? 0
  );
  return unit * qty;
}

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

function CallButton({ phone, label }: { phone: string; label: string }) {
  return (
    <TouchableOpacity
      style={styles.callBtn}
      onPress={() => Linking.openURL(`tel:${phone}`)}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${phone}`}
    >
      <Phone size={16} color="#047857" />
      <Text style={styles.callBtnText}>Call</Text>
    </TouchableOpacity>
  );
}

export function OrderDetailView({
  order,
  variant,
  loading = false,
  onClose,
  onUpdateStatus,
  onUpdatePaymentStatus,
  onCancelOrder,
  onAssignDelivery,
  onEditDeliveryTime,
  onPrint,
  printing = false,
  paperRollSize = '58',
}: OrderDetailViewProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { showToast } = useToast();
  const isSuperAdmin = user?.userType === 'super_admin';
  const isScreen = variant === 'screen';

  const [editingStatus, setEditingStatus] = React.useState(false);
  const [loadingStatus, setLoadingStatus] = React.useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [editingPayment, setEditingPayment] = React.useState(false);
  const [savingPayment, setSavingPayment] = React.useState<ManualPaymentStatus | null>(null);

  // Reset local UI when a different order is shown.
  React.useEffect(() => {
    setEditingStatus(false);
    setEditingPayment(false);
    setSavingPayment(null);
    setShowCancelConfirm(false);
    setCancelling(false);
  }, [order._id]);

  const handleStatusSelect = async (newStatus: string) => {
    if (newStatus === 'cancelled') {
      setEditingStatus(false);
      setShowCancelConfirm(true);
      return;
    }
    if (!onUpdateStatus || newStatus === order.status) {
      setEditingStatus(false);
      return;
    }
    setLoadingStatus(true);
    try {
      await onUpdateStatus(newStatus);
    } finally {
      setLoadingStatus(false);
      setEditingStatus(false);
    }
  };

  const handlePaymentSelect = async (next: ManualPaymentStatus) => {
    const current = (order.paymentStatus || 'pending') === 'completed' ? 'paid' : (order.paymentStatus || 'pending');
    if (!onUpdatePaymentStatus || next === current) {
      setEditingPayment(false);
      return;
    }
    setSavingPayment(next);
    try {
      await onUpdatePaymentStatus(next);
      setEditingPayment(false);
    } finally {
      setSavingPayment(null);
    }
  };

  const handleConfirmCancel = async () => {
    setCancelling(true);
    try {
      await onCancelOrder();
      setShowCancelConfirm(false);
    } catch (err: any) {
      showToast({ title: 'Error', message: err?.message || 'Failed to cancel order.', type: 'error' });
    } finally {
      setCancelling(false);
    }
  };

  /* ── Derived data ───────────────────────────────────────────────────── */

  const orderNum = order.orderNumber || order._id?.substring(0, 8).toUpperCase();
  const restaurantName =
    typeof order.restaurantId === 'object' ? order.restaurantId?.restaurantName || 'Unknown Restaurant' : 'Restaurant';
  const customerName =
    typeof order.customerId === 'object'
      ? order.customerId?.fullName || order.customerDetails?.name || 'Customer'
      : order.customerDetails?.name || 'Customer';
  const customerPhone =
    typeof order.customerId === 'object'
      ? order.customerId?.phoneNumber || order.customerDetails?.phoneNumber
      : order.customerDetails?.phoneNumber;

  const fulfillment = getOrderFulfillmentType(order);
  const isDeliveryOrder = fulfillment === 'delivery';
  const typeMeta = TYPE_META[fulfillment];
  const TypeIcon = typeMeta.Icon;
  const tableNumber = (order as any).tableNumber;

  const statusSurface = getOrderStatusSurface(order.status);
  const statusColor = getOrderStatusColor(order.status);
  const isActive = order.status !== 'delivered' && order.status !== 'cancelled';

  const deliveryPartner = typeof order.assignedDeliveryPartnerId === 'object' ? order.assignedDeliveryPartnerId : undefined;
  const scheduleInfo = getOrderScheduleInfo(order);
  const orderNote = getSanitizedOrderNotes(order.notes);
  const addressText = isDeliveryOrder ? formatAddress(order) : null;

  const channel = (() => {
    const source = (order.orderSource || '').toLowerCase();
    const rawDomain = (order.sourceDomain || '').trim();
    const restExt = typeof order.restaurantId === 'object' ? (order.restaurantId as any)?.externalWebsiteSettings : undefined;
    const fallbackExtDomain =
      (restExt?.customDomain || restExt?.domain || '').trim() || (restExt?.subdomain ? `${restExt.subdomain}.krifoo.co.uk` : '');
    const isMarketplace = rawDomain.toLowerCase().includes('krifoo.co.uk') || (!rawDomain && source === 'krifoo');
    const isExt = !isMarketplace && (source === 'external' || Boolean(rawDomain));
    const appName = ((order as any).appName || '').trim();
    if (appName) return { external: true, label: appName };
    if (isExt) {
      const label =
        rawDomain && rawDomain !== 'External Website' && rawDomain !== 'External Web'
          ? rawDomain
          : fallbackExtDomain || (restaurantName ? `${restaurantName} Web` : 'External Web');
      return { external: true, label };
    }
    return { external: false, label: 'Krifoo App' };
  })();

  const orderedItemsList: any[] =
    Array.isArray(order.orderedItems) && order.orderedItems.length > 0
      ? order.orderedItems
      : Array.isArray((order as any).items) && (order as any).items.length > 0
      ? (order as any).items
      : [];

  const pricing: NonNullable<Order['pricing']> = order.pricing || {};
  const deliveryFee = pricing.deliveryFee || order.deliveryFee || 0;
  const taxOrHandling = pricing.handlingCharge || pricing.tax || order.taxAmount || 0;
  const discount = pricing.discount || pricing.discountAmount || 0;
  const total = pricing.totalAmount ?? pricing.total ?? order.totalAmount ?? order.totalPrice ?? 0;

  const payType = (order.paymentType || 'cash').toLowerCase();
  const isCash = payType === 'cash';
  const paymentTitle = isCash ? 'Cash' : payType === 'card' ? 'Card' : payType.charAt(0).toUpperCase() + payType.slice(1);
  const paymentSub = isCash
    ? isDeliveryOrder
      ? 'Cash on delivery'
      : 'Pay at counter'
    : payType === 'card' && !isDeliveryOrder
    ? 'Card at counter / terminal'
    : 'Paid online via Stripe';
  const pStatus = (order.paymentStatus || 'pending').toLowerCase();
  // Online (Stripe) payments are kept in sync by Stripe; only counter/cash payments are editable.
  const isOnlinePayment = Boolean(order.sessionId);
  const canEditPayment = Boolean(onUpdatePaymentStatus) && !isOnlinePayment;
  const currentPaymentValue: ManualPaymentStatus =
    pStatus === 'paid' || pStatus === 'completed' ? 'paid' : pStatus === 'failed' ? 'failed' : pStatus === 'refunded' ? 'refunded' : 'pending';
  const payStatus =
    pStatus === 'paid' || pStatus === 'completed'
      ? { label: 'Paid', color: '#047857', bg: '#D1FAE5' }
      : pStatus === 'failed'
      ? { label: 'Failed', color: '#B91C1C', bg: '#FEE2E2' }
      : pStatus === 'refunded'
      ? { label: 'Refunded', color: '#6D28D9', bg: '#EDE9FE' }
      : { label: 'Unpaid', color: '#B45309', bg: '#FEF3C7' };

  const createdText = order.createdAt
    ? new Date(order.createdAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';

  const openInMaps = () => {
    const coords = (order.deliveryAddress as any)?.coordinates?.coordinates;
    const query = coords && coords.length === 2 ? `${coords[1]},${coords[0]}` : encodeURIComponent(addressText || '');
    const url = Platform.select({
      ios: `maps://?q=${query}`,
      android: `geo:0,0?q=${query}`,
      default: `https://www.google.com/maps/search/?api=1&query=${query}`,
    });
    Linking.openURL(url).catch(() => showToast({ title: 'Error', message: 'Could not open maps application.', type: 'error' }));
  };

  const showFooter = !loading && (isActive || order.status === 'delivered');

  /* ── UI ─────────────────────────────────────────────────────────────── */

  return (
    <View style={[styles.root, isScreen && styles.rootScreen]}>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <View
        style={[
          styles.header,
          { backgroundColor: statusSurface.bg, borderBottomColor: statusSurface.border },
          isScreen && { paddingTop: insets.top + 10 },
        ]}
      >
        <View style={styles.headerTop}>
          {isScreen && (
            <TouchableOpacity onPress={onClose} style={styles.roundBtn} accessibilityRole="button" accessibilityLabel="Back">
              <ArrowLeft size={20} color="#11181C" />
            </TouchableOpacity>
          )}
          <View style={styles.headerTitleRow}>
            <Text style={styles.orderNo} numberOfLines={1}>#{orderNum}</Text>
            <View style={[styles.statusChip, { borderColor: statusSurface.border }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusChipText, { color: statusSurface.text }]}>{getOrderStatusLabel(order.status)}</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={onPrint}
            disabled={printing}
            style={styles.roundBtn}
            accessibilityRole="button"
            accessibilityLabel={`Print receipt, ${paperRollSize} millimetre`}
          >
            {printing ? <ActivityIndicator size="small" color="#11181C" /> : <Printer size={19} color="#11181C" />}
          </TouchableOpacity>
          {!isScreen && (
            <TouchableOpacity
              onPress={onClose}
              style={styles.roundBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={20} color="#11181C" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.metaRow}>
          {channel.external ? <Globe size={13} color="#687076" /> : <Smartphone size={13} color="#687076" />}
          <Text style={styles.metaText} numberOfLines={1}>
            {createdText} · via {channel.label}
            {isSuperAdmin ? ` · ${restaurantName}` : ''}
          </Text>
        </View>

        <View style={styles.chipsRow}>
          <View style={[styles.chip, { backgroundColor: typeMeta.bg }]}>
            <TypeIcon size={13} color={typeMeta.color} />
            <Text style={[styles.chipText, { color: typeMeta.color }]}>
              {fulfillment === 'dine_in' && tableNumber ? `Dine-in · Table ${tableNumber}` : typeMeta.label}
            </Text>
          </View>
          <View style={[styles.chip, { backgroundColor: payStatus.bg }]}>
            <Text style={[styles.chipText, { color: payStatus.color }]}>
              {payStatus.label} · {paymentTitle}
            </Text>
          </View>
          {scheduleInfo.isScheduled && (
            <View style={[styles.chip, styles.chipShrink, { backgroundColor: '#FEF3C7' }]}>
              <Calendar size={13} color="#92400E" />
              <Text style={[styles.chipText, { color: '#92400E' }]} numberOfLines={1}>
                {scheduleInfo.scheduleTimeText}
              </Text>
            </View>
          )}
        </View>
      </View>

      {loading ? (
        <View style={[styles.loadingBox, isScreen && styles.flex]}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading order details…</Text>
        </View>
      ) : (
        <ScrollView
          style={isScreen ? styles.flex : styles.bodySheet}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Status / primary action ─────────────────────────── */}
          {order.status === 'placed' ? (
            <TouchableOpacity
              style={styles.acceptBtn}
              onPress={() => handleStatusSelect('preparing')}
              disabled={loadingStatus}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Accept order"
            >
              {loadingStatus ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Check size={20} color="#FFFFFF" strokeWidth={3} />
                  <Text style={styles.acceptBtnText}>Accept order</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.statusRow}
                onPress={() => setEditingStatus(!editingStatus)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityState={{ expanded: editingStatus }}
                accessibilityLabel={`Status: ${getOrderStatusLabel(order.status)}. Change status`}
              >
                <View style={styles.flex}>
                  <Text style={styles.label}>Status</Text>
                  <Text style={[styles.statusValue, { color: statusSurface.text }]}>{getOrderStatusLabel(order.status)}</Text>
                </View>
                <View style={styles.linkRow}>
                  <Text style={styles.linkText}>{editingStatus ? 'Close' : 'Change'}</Text>
                  {editingStatus ? <ChevronUp size={16} color={Colors.primary} /> : <ChevronDown size={16} color={Colors.primary} />}
                </View>
              </TouchableOpacity>

              {editingStatus && (
                <View style={styles.statusList}>
                  {STATUS_OPTIONS.map((opt) => {
                    const selected = order.status === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        disabled={loadingStatus}
                        style={[styles.statusOption, selected && styles.statusOptionSelected]}
                        onPress={() => handleStatusSelect(opt.value)}
                        activeOpacity={0.7}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                      >
                        <View style={[styles.statusOptionDot, { backgroundColor: getOrderStatusColor(opt.value) }]} />
                        <View style={styles.flex}>
                          <Text style={[styles.statusOptionText, opt.value === 'cancelled' && { color: '#B91C1C' }]}>{opt.label}</Text>
                          <Text style={styles.statusOptionSub}>{opt.sub}</Text>
                        </View>
                        {selected ? <Check size={18} color="#047857" /> : null}
                      </TouchableOpacity>
                    );
                  })}
                  {loadingStatus && <ActivityIndicator style={styles.statusSpinner} color={Colors.primary} />}
                </View>
              )}
            </View>
          )}

          {/* ── Timing ──────────────────────────────────────────── */}
          {isActive && (
            <View style={[styles.card, styles.timingCard]}>
              <View style={styles.iconCircle}>
                <Clock size={18} color="#1D4ED8" />
              </View>
              <View style={styles.flex}>
                <Text style={styles.label}>{isDeliveryOrder ? 'Expected delivery' : 'Expected ready time'}</Text>
                <OrderCountdownText order={order} style={styles.timingValue} />
                {scheduleInfo.isScheduled && (
                  <Text style={styles.timingHint}>Scheduled order — cook closer to {scheduleInfo.scheduleTimeText}.</Text>
                )}
              </View>
              {onEditDeliveryTime ? (
                <TouchableOpacity
                  style={styles.outlineBtn}
                  onPress={onEditDeliveryTime}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel="Edit expected time"
                >
                  <Text style={styles.outlineBtnText}>Edit</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          {/* ── Customer ────────────────────────────────────────── */}
          <View style={styles.card}>
            <SectionTitle>Customer</SectionTitle>
            <View style={styles.personRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{customerName.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.personName} numberOfLines={1}>{customerName}</Text>
                {customerPhone ? <Text style={styles.personSub}>{customerPhone}</Text> : null}
              </View>
              {customerPhone ? <CallButton phone={customerPhone} label="Call customer" /> : null}
            </View>

            {addressText ? (
              <View style={styles.infoRow}>
                <MapPin size={16} color="#2563EB" style={styles.infoIcon} />
                <Text style={styles.infoText}>{addressText}</Text>
                <TouchableOpacity
                  style={styles.mapsBtn}
                  onPress={openInMaps}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel="Open address in maps"
                >
                  <Navigation size={15} color="#1D4ED8" />
                  <Text style={styles.mapsBtnText}>Maps</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {orderNote ? (
              <View style={styles.noteBox}>
                <StickyNote size={16} color="#92400E" style={styles.infoIcon} />
                <View style={styles.flex}>
                  <Text style={styles.noteTitle}>Customer note</Text>
                  <Text style={styles.noteText}>{orderNote}</Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* ── Delivery partner ────────────────────────────────── */}
          {isDeliveryOrder && (
            <View style={styles.card}>
              <SectionTitle>Delivery partner</SectionTitle>
              {deliveryPartner ? (
                <View style={styles.personRow}>
                  <View style={[styles.avatar, { backgroundColor: '#EDE9FE' }]}>
                    <Bike size={18} color="#6D28D9" />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.personName} numberOfLines={1}>{deliveryPartner.fullName}</Text>
                    <Text style={styles.personSub} numberOfLines={1}>
                      {[deliveryPartner.phoneNumber, deliveryPartner.vehicleNumber].filter(Boolean).join(' · ') || 'Rider assigned'}
                    </Text>
                  </View>
                  {deliveryPartner.phoneNumber ? <CallButton phone={deliveryPartner.phoneNumber} label="Call rider" /> : null}
                </View>
              ) : (
                <Text style={styles.emptyText}>No rider assigned yet.</Text>
              )}
            </View>
          )}

          {/* ── Items & bill ────────────────────────────────────── */}
          <View style={styles.card}>
            <SectionTitle
              right={
                <Text style={styles.sectionCount}>
                  {orderedItemsList.length} {orderedItemsList.length === 1 ? 'item' : 'items'}
                </Text>
              }
            >
              Items
            </SectionTitle>

            {orderedItemsList.map((item: any, idx: number) => {
              const qty = Number(item.quantity || item.qty || 1);
              return (
                <View key={idx} style={[styles.itemRow, idx > 0 && styles.itemRowDivider]}>
                  <View style={styles.qtyBadge}>
                    <Text style={styles.qtyText}>{qty}×</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.itemName}>{getItemName(item)}</Text>
                    {getItemOptionsList(item).map((opt: string, oIdx: number) => (
                      <Text key={oIdx} style={styles.itemOption}>+ {opt}</Text>
                    ))}
                    {item.instructions ? <Text style={styles.itemNote}>“{item.instructions}”</Text> : null}
                  </View>
                  <Text style={styles.itemPrice}>{money(getItemTotal(item, qty))}</Text>
                </View>
              );
            })}

            <View style={styles.billBox}>
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Subtotal</Text>
                <Text style={styles.billValue}>{money(pricing.subtotal || 0)}</Text>
              </View>
              {isDeliveryOrder || deliveryFee ? (
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Delivery fee</Text>
                  <Text style={styles.billValue}>{deliveryFee ? money(deliveryFee) : 'Free'}</Text>
                </View>
              ) : null}
              {taxOrHandling ? (
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Handling & tax</Text>
                  <Text style={styles.billValue}>{money(taxOrHandling)}</Text>
                </View>
              ) : null}
              {pricing.onlinePaymentFee ? (
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Online payment fee</Text>
                  <Text style={styles.billValue}>{money(pricing.onlinePaymentFee)}</Text>
                </View>
              ) : null}
              {pricing.platformFee ? (
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Platform fee</Text>
                  <Text style={styles.billValue}>{money(pricing.platformFee)}</Text>
                </View>
              ) : null}
              {discount ? (
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Discount</Text>
                  <Text style={[styles.billValue, { color: '#047857' }]}>−{money(discount)}</Text>
                </View>
              ) : null}
              <View style={[styles.billRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>{money(total)}</Text>
              </View>
            </View>

            <View style={styles.paymentRow}>
              <View style={[styles.iconCircle, { backgroundColor: isCash ? '#DCFCE7' : '#DBEAFE' }]}>
                {isCash ? <Banknote size={18} color="#15803D" /> : <CreditCard size={18} color="#1D4ED8" />}
              </View>
              <View style={styles.flex}>
                <Text style={styles.personName}>{paymentTitle}</Text>
                <Text style={styles.personSub}>{paymentSub}</Text>
              </View>
              {canEditPayment ? (
                <TouchableOpacity
                  onPress={() => setEditingPayment((v) => !v)}
                  style={[styles.chip, styles.chipButton, { backgroundColor: payStatus.bg }]}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Payment ${payStatus.label}. Change payment status`}
                >
                  <Text style={[styles.chipText, { color: payStatus.color }]}>{payStatus.label}</Text>
                  {editingPayment ? <ChevronUp size={14} color={payStatus.color} /> : <ChevronDown size={14} color={payStatus.color} />}
                </TouchableOpacity>
              ) : (
                <View style={[styles.chip, { backgroundColor: payStatus.bg }]}>
                  <Text style={[styles.chipText, { color: payStatus.color }]}>{payStatus.label}</Text>
                </View>
              )}
            </View>

            {isOnlinePayment && onUpdatePaymentStatus ? (
              <Text style={styles.paymentHint}>Paid online — updated automatically by Stripe.</Text>
            ) : null}

            {canEditPayment && editingPayment && (
              <View style={styles.statusList}>
                {PAYMENT_OPTIONS.map((opt) => {
                  const selected = currentPaymentValue === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      disabled={savingPayment !== null}
                      style={[styles.statusOption, selected && styles.statusOptionSelected]}
                      onPress={() => handlePaymentSelect(opt.value)}
                      activeOpacity={0.7}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                    >
                      <View style={[styles.statusOptionDot, { backgroundColor: opt.color }]} />
                      <View style={styles.flex}>
                        <Text style={styles.statusOptionText}>{opt.label}</Text>
                        <Text style={styles.statusOptionSub}>{opt.sub}</Text>
                      </View>
                      {savingPayment === opt.value ? (
                        <ActivityIndicator size="small" color={Colors.primary} />
                      ) : selected ? (
                        <Check size={18} color="#047857" />
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
                {currentPaymentValue !== 'paid' && (
                  <Text style={styles.paymentHint}>Marking as Paid emails the customer an invoice.</Text>
                )}
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* ── Footer ─────────────────────────────────────────────────── */}
      {showFooter && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {order.status === 'delivered' ? (
            <TouchableOpacity
              style={[styles.primaryBtn, styles.darkBtn]}
              onPress={onPrint}
              disabled={printing}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              {printing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Printer size={18} color="#FFFFFF" />
                  <Text style={styles.primaryBtnText}>Print receipt ({paperRollSize}mm)</Text>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.footerRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowCancelConfirm(true)}
                disabled={cancelling}
                activeOpacity={0.75}
                accessibilityRole="button"
              >
                <X size={16} color="#B91C1C" />
                <Text style={styles.cancelBtnText}>Cancel order</Text>
              </TouchableOpacity>
              {isDeliveryOrder && onAssignDelivery && (
                <TouchableOpacity style={[styles.primaryBtn, styles.flex]} onPress={onAssignDelivery} activeOpacity={0.85} accessibilityRole="button">
                  <Bike size={18} color="#FFFFFF" />
                  <Text style={styles.primaryBtnText} numberOfLines={1}>
                    {deliveryPartner ? 'Reassign rider' : 'Assign rider'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}

      {/* ── Cancel confirmation ────────────────────────────────────── */}
      {showCancelConfirm && (
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <View style={styles.confirmIcon}>
              <AlertTriangle size={24} color="#DC2626" />
            </View>
            <Text style={styles.confirmTitle}>Cancel order #{orderNum}?</Text>
            <Text style={styles.confirmMessage}>This can’t be undone.</Text>
            <View style={styles.confirmBtnRow}>
              <TouchableOpacity style={styles.confirmKeepBtn} onPress={() => setShowCancelConfirm(false)} disabled={cancelling} activeOpacity={0.75}>
                <Text style={styles.confirmKeepText}>Keep order</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmCancelBtn} onPress={handleConfirmCancel} disabled={cancelling} activeOpacity={0.75}>
                {cancelling ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.confirmCancelText}>Yes, cancel</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  root: { backgroundColor: '#F4F5F7', flexShrink: 1 },
  rootScreen: { flex: 1 },

  /* Header */
  header: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 14, borderBottomWidth: 1 },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, flexWrap: 'wrap' },
  orderNo: { fontSize: 22, fontWeight: '800', color: '#11181C', letterSpacing: -0.4, flexShrink: 1 },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusChipText: { fontSize: 12, fontWeight: '700' },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  metaText: { flex: 1, fontSize: 13, color: '#687076', fontWeight: '500' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 5, maxWidth: '100%' },
  chipShrink: { flexShrink: 1 },
  chipButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  paymentHint: { fontSize: 12.5, color: '#64748B', marginTop: 8 },
  chipText: { fontSize: 12.5, fontWeight: '700', flexShrink: 1 },

  /* Body */
  loadingBox: { paddingVertical: 64, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#687076', marginTop: 12, fontWeight: '600' },
  bodySheet: { flexGrow: 0, flexShrink: 1 },
  bodyContent: { padding: 14, gap: 12, paddingBottom: 24 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#E9EBEE', padding: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: '#687076', letterSpacing: 0.8, textTransform: 'uppercase' },
  sectionCount: { fontSize: 12.5, fontWeight: '600', color: '#687076' },
  label: { fontSize: 12, fontWeight: '700', color: '#687076', letterSpacing: 0.3 },

  /* Status */
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 54,
    borderRadius: 10,
    backgroundColor: '#16A34A',
  },
  acceptBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  statusValue: { fontSize: 17, fontWeight: '800', marginTop: 2 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingLeft: 8 },
  linkText: { color: Colors.primary, fontWeight: '700', fontSize: 14 },
  statusList: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#F0F1F3', paddingTop: 6 },
  statusOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8, minHeight: 52 },
  statusOptionSelected: { backgroundColor: '#F4F5F7' },
  statusOptionDot: { width: 10, height: 10, borderRadius: 5 },
  statusOptionText: { fontSize: 15, fontWeight: '700', color: '#11181C' },
  statusOptionSub: { fontSize: 12.5, color: '#687076', marginTop: 1 },
  statusSpinner: { marginTop: 8 },

  /* Timing */
  timingCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' },
  timingValue: { fontSize: 18, fontWeight: '800', color: '#11181C', marginTop: 2 },
  timingHint: { fontSize: 12.5, color: '#92400E', marginTop: 4, fontWeight: '600' },
  outlineBtn: { borderWidth: 1, borderColor: '#D0D5DB', borderRadius: 8, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  outlineBtnText: { fontSize: 14, fontWeight: '700', color: '#11181C' },

  /* People */
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF0EC', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800', color: '#FF5C39' },
  personName: { fontSize: 15.5, fontWeight: '700', color: '#11181C' },
  personSub: { fontSize: 13, color: '#687076', marginTop: 2, fontWeight: '500' },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 40,
  },
  callBtnText: { color: '#047857', fontWeight: '700', fontSize: 14 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F0F1F3' },
  infoIcon: { marginTop: 2 },
  infoText: { flex: 1, fontSize: 14, lineHeight: 20, color: '#374151', fontWeight: '500' },
  mapsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 8,
    paddingHorizontal: 10,
    minHeight: 36,
  },
  mapsBtnText: { color: '#1D4ED8', fontWeight: '700', fontSize: 13 },
  noteBox: { flexDirection: 'row', gap: 10, marginTop: 12, backgroundColor: '#FFFBEB', borderRadius: 8, borderWidth: 1, borderColor: '#FDE68A', padding: 12 },
  noteTitle: { fontSize: 12, fontWeight: '800', color: '#92400E', letterSpacing: 0.3 },
  noteText: { fontSize: 14, lineHeight: 20, color: '#78350F', marginTop: 2, fontWeight: '600' },
  emptyText: { fontSize: 14, color: '#687076', fontStyle: 'italic' },

  /* Items */
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10 },
  itemRowDivider: { borderTopWidth: 1, borderTopColor: '#F0F1F3' },
  qtyBadge: { minWidth: 34, height: 26, borderRadius: 6, backgroundColor: '#FFF0EC', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  qtyText: { fontSize: 13, fontWeight: '800', color: '#FF5C39' },
  itemName: { fontSize: 15, fontWeight: '700', color: '#11181C', lineHeight: 20 },
  itemOption: { fontSize: 13, color: '#687076', marginTop: 2 },
  itemNote: { fontSize: 13, color: '#92400E', fontStyle: 'italic', marginTop: 3, fontWeight: '600' },
  itemPrice: { fontSize: 14.5, fontWeight: '700', color: '#11181C', fontVariant: ['tabular-nums'] },
  billBox: { marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E9EBEE', gap: 8 },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  billLabel: { fontSize: 14, color: '#687076', fontWeight: '500' },
  billValue: { fontSize: 14, color: '#11181C', fontWeight: '600', fontVariant: ['tabular-nums'] },
  totalRow: { marginTop: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E9EBEE', borderStyle: 'dashed' },
  totalLabel: { fontSize: 16, fontWeight: '800', color: '#11181C' },
  totalValue: { fontSize: 20, fontWeight: '800', color: '#11181C', fontVariant: ['tabular-nums'] },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, padding: 12, borderRadius: 8, backgroundColor: '#F8F9FA' },

  /* Footer */
  footer: { backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E9EBEE', paddingHorizontal: 14, paddingTop: 12 },
  footerRow: { flexDirection: 'row', gap: 10 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 50,
    borderRadius: 10,
    backgroundColor: '#FF5C39',
    paddingHorizontal: 16,
  },
  darkBtn: { backgroundColor: '#11181C' },
  primaryBtnText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '800' },
  cancelBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 50,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    backgroundColor: '#FFFFFF',
  },
  cancelBtnText: { color: '#B91C1C', fontSize: 15, fontWeight: '700' },

  /* Cancel confirmation */
  confirmOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 24, 28, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 10,
  },
  confirmBox: { width: '100%', maxWidth: 380, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 22, alignItems: 'center' },
  confirmIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  confirmTitle: { fontSize: 18, fontWeight: '800', color: '#11181C', textAlign: 'center' },
  confirmMessage: { fontSize: 14, lineHeight: 20, color: '#687076', textAlign: 'center', marginTop: 6 },
  confirmBtnRow: { flexDirection: 'row', gap: 10, marginTop: 20, alignSelf: 'stretch' },
  confirmKeepBtn: { flex: 1, minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: '#D0D5DB', alignItems: 'center', justifyContent: 'center' },
  confirmKeepText: { fontSize: 15, fontWeight: '700', color: '#11181C' },
  confirmCancelBtn: { flex: 1, minHeight: 48, borderRadius: 10, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' },
  confirmCancelText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
});
