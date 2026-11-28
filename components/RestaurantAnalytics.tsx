import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Modal,
} from 'react-native';
import { Skeleton } from './Skeleton';
import { Colors } from '../constants/colors';
import { Order } from '../types';
import { orderService } from '../services/order.service';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  X,
  Bike,
  ShoppingBag,
  UtensilsCrossed,
} from 'lucide-react-native';

export type TimeframeKey = 'today' | '7d' | '30d' | 'custom' | 'all';
export type ChartMetric = 'revenue' | 'orders' | 'payment';

export interface DashboardAnalytics {
  totalRevenue: number;
  totalOrders: number;
  /** Orders counted in sales: not cancelled and, for card/online, paid. */
  salesCount: number;
  /** Card/online orders whose payment isn't complete (left out of sales). */
  unpaidOrders: number;
  deliveredOrders: number;
  deliveredRevenue: number;
  cancelledOrders: number;
  cancelledRevenue: number;
  averageOrderValue: number;
  cashOrdersCount: number;
  cashRevenue: number;
  onlineOrdersCount: number;
  onlineRevenue: number;
  dailyBreakdown: Array<{
    date: string;
    rawDate: Date;
    orders: number;
    delivered: number;
    revenue: number;
    cashOrders: number;
    onlineOrders: number;
  }>;
  orderTypeBreakdown: Array<{
    id: string;
    name: string;
    icon: string;
    count: number;
    revenue: number;
    percentage: number;
  }>;
  statusReport: Array<{
    id: string;
    name: string;
    count: number;
  }>;
}

/**
 * How each order counts (one place, so every figure on the screen agrees):
 *  - Ignored entirely: `awaiting_payment` (a card checkout that was never paid — not a real order).
 *  - Cancelled: status `cancelled`, or rejected by the restaurant.
 *  - Unpaid: a card / online order whose payment is not `paid` (pending, failed or refunded).
 *    Cash orders are paid at the counter or door, so they count from the moment they are placed.
 *  - Sale: every order that is neither cancelled nor unpaid. Sales, average order, channel and
 *    payment figures and the daily chart are built from sales only.
 *  - Orders (the count) is every order except awaiting_payment, cancelled ones included,
 *    so "cancelled" and "completed" can be shown against it.
 */
export function orderTotalOf(order: Order): number {
  const explicitTotal =
    order.pricing?.totalAmount ??
    order.pricing?.total ??
    order.totalAmount ??
    (order as any).totalPrice ??
    (order as any).grandTotal;
  if (explicitTotal !== undefined && explicitTotal !== null && !isNaN(Number(explicitTotal))) {
    return Number(explicitTotal);
  }
  if (Array.isArray(order.orderedItems)) {
    return order.orderedItems.reduce((sum, it: any) => {
      const p = Number(it.itemTotal || it.totalPrice || (it.price ? it.price * (it.quantity || 1) : 0));
      return sum + (isNaN(p) ? 0 : p);
    }, 0);
  }
  return 0;
}

export function classifyOrder(order: Order) {
  const status = String(order.status || 'placed').toLowerCase();
  const ignored = status === 'awaiting_payment';
  const cancelled = status === 'cancelled' || (order as any).acceptanceStatus === 'rejected';
  const payType = String(order.paymentType || '').toLowerCase();
  const isCash = payType === 'cash';
  const paymentStatus = String((order as any).paymentStatus || '').toLowerCase();
  const unpaid = !isCash && paymentStatus !== 'paid';
  return { status, ignored, cancelled, isCash, unpaid, isSale: !ignored && !cancelled && !unpaid };
}

/** delivery | pickup (pickup + takeaway, both collected at the counter) | dine_in */
export function channelOf(order: Order): 'delivery' | 'pickup' | 'dine_in' {
  const raw = String(order.orderType || (order as any).fulfillmentType || '').toLowerCase();
  if (raw.includes('dine')) return 'dine_in';
  if (raw.includes('pick') || raw.includes('takeaway') || raw.includes('collect')) return 'pickup';
  return 'delivery';
}

/** Local calendar day, with the year (so "All time" never merges 5 Mar 2025 with 5 Mar 2026). */
function dayKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function computeDashboardAnalytics(orders: Order[]): DashboardAnalytics {
  let totalOrders = 0;
  let salesCount = 0;
  let totalRevenue = 0;
  let deliveredOrders = 0;
  let deliveredRevenue = 0;
  let cancelledOrders = 0;
  let cancelledRevenue = 0;
  let unpaidOrders = 0;
  let cashOrdersCount = 0;
  let cashRevenue = 0;
  let onlineOrdersCount = 0;
  let onlineRevenue = 0;

  const dailyMap = new Map<string, DashboardAnalytics['dailyBreakdown'][number]>();
  const channelCount: Record<string, number> = { delivery: 0, pickup: 0, dine_in: 0 };
  const channelRevenue: Record<string, number> = { delivery: 0, pickup: 0, dine_in: 0 };
  const statusMap: Record<string, number> = {
    placed: 0,
    preparing: 0,
    ready_for_pickup: 0,
    out_for_delivery: 0,
    delivered: 0,
    cancelled: 0,
  };

  orders.forEach((order) => {
    const c = classifyOrder(order);
    if (c.ignored) return;
    totalOrders += 1;

    const orderTotal = orderTotalOf(order);
    const isDelivered = c.status === 'delivered' && !c.cancelled;

    // Status breakdown: a rejected order is cancelled even if its status still says "placed"
    const statusBucket = c.cancelled
      ? 'cancelled'
      : c.status === 'confirmed'
        ? 'preparing'
        : statusMap[c.status] !== undefined
          ? c.status
          : 'placed';
    statusMap[statusBucket] += 1;

    if (c.cancelled) {
      cancelledOrders += 1;
      cancelledRevenue += orderTotal;
    } else if (c.unpaid) {
      unpaidOrders += 1;
    }
    if (isDelivered) {
      deliveredOrders += 1;
      deliveredRevenue += orderTotal;
    }

    // Daily: every order counts towards the day's orders; only sales towards its revenue
    const created = order.createdAt ? new Date(order.createdAt) : new Date();
    const key = dayKeyOf(created);
    let day = dailyMap.get(key);
    if (!day) {
      day = {
        date: key,
        rawDate: new Date(created.getFullYear(), created.getMonth(), created.getDate()),
        orders: 0,
        delivered: 0,
        revenue: 0,
        cashOrders: 0,
        onlineOrders: 0,
      };
      dailyMap.set(key, day);
    }
    day.orders += 1;
    if (isDelivered) day.delivered += 1;

    if (!c.isSale) return;
    salesCount += 1;
    totalRevenue += orderTotal;
    day.revenue += orderTotal;

    const channel = channelOf(order);
    channelCount[channel] += 1;
    channelRevenue[channel] += orderTotal;

    if (c.isCash) {
      cashOrdersCount += 1;
      cashRevenue += orderTotal;
      day.cashOrders += 1;
    } else {
      onlineOrdersCount += 1;
      onlineRevenue += orderTotal;
      day.onlineOrders += 1;
    }
  });

  const dailyBreakdown = Array.from(dailyMap.values()).sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());
  const pct = (n: number) => (salesCount > 0 ? Math.round((n / salesCount) * 100) : 0);

  return {
    totalRevenue,
    totalOrders,
    salesCount,
    unpaidOrders,
    deliveredOrders,
    deliveredRevenue,
    cancelledOrders,
    cancelledRevenue,
    averageOrderValue: salesCount > 0 ? totalRevenue / salesCount : 0,
    cashOrdersCount,
    cashRevenue,
    onlineOrdersCount,
    onlineRevenue,
    dailyBreakdown,
    orderTypeBreakdown: [
      { id: 'delivery', name: 'Delivery', icon: '🛵', count: channelCount.delivery, revenue: channelRevenue.delivery, percentage: pct(channelCount.delivery) },
      { id: 'pickup', name: 'Pickup & takeaway', icon: '🛍️', count: channelCount.pickup, revenue: channelRevenue.pickup, percentage: pct(channelCount.pickup) },
      { id: 'dine_in', name: 'Dine In', icon: '🍽️', count: channelCount.dine_in, revenue: channelRevenue.dine_in, percentage: pct(channelCount.dine_in) },
    ],
    statusReport: [
      { id: 'placed', name: 'Placed', count: statusMap.placed },
      { id: 'preparing', name: 'In Kitchen', count: statusMap.preparing },
      { id: 'ready_for_pickup', name: 'Ready', count: statusMap.ready_for_pickup },
      { id: 'out_for_delivery', name: 'Out for delivery', count: statusMap.out_for_delivery },
      { id: 'delivered', name: 'Delivered', count: statusMap.delivered },
      { id: 'cancelled', name: 'Cancelled', count: statusMap.cancelled },
    ],
  };
}

interface TopDishItem {
  itemName: string;
  totalQuantitySold: number;
  totalRevenue: number;
}

const getStatusTheme = (id: string) => {
  switch (id) {
    case 'delivered':
      return { bg: '#ECFDF5', border: '#A7F3D0', text: '#059669' };
    case 'cancelled':
      return { bg: '#FEF2F2', border: '#FECACA', text: '#DC2626' };
    case 'ready_for_pickup':
      return { bg: '#FFF7ED', border: '#FED7AA', text: '#EA580C' };
    case 'preparing':
      return { bg: '#EFF6FF', border: '#BFDBFE', text: '#2563EB' };
    case 'out_for_delivery':
      return { bg: '#F5F3FF', border: '#DDD6FE', text: '#7C3AED' };
    default:
      return { bg: '#F8FAFC', border: '#E2E8F0', text: '#475569' };
  }
};

const PAY_CASH = '#10B981';
const PAY_CARD = '#6366F1';

export interface AnalyticsRestaurantProps {
  initialOrders: Order[];
  ownerStats?: {
    totalOrders: number;
    totalDelivered: number;
    totalCancelled: number;
    totalIncome: number;
  };
  restaurantName?: string;
  restaurantId?: string;
  onNavigateOrders?: () => void;
  onClose?: () => void;
}

export type RestaurantAnalyticsProps = AnalyticsRestaurantProps & {
  /** Bump to reload (the Analytics screen's refresh button / pull-to-refresh) */
  refreshKey?: number;
};

const TIMEFRAMES: Array<{ id: TimeframeKey; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'all', label: 'All Time' },
  { id: 'custom', label: 'Select Date' },
];

/** Single-series bar chart of sales per day. Tap a bar to read it; the best day is shown by default. */
function SalesTrend({ days, money }: { days: DashboardAnalytics['dailyBreakdown']; money: (n: number) => string }) {
  const [active, setActive] = useState<string | null>(null);
  const shown = days.slice(-31); // up to a month of bars
  const max = Math.max(1, ...shown.map((d) => d.revenue));
  const best = shown.reduce((b, d) => (d.revenue > b.revenue ? d : b), shown[0]);
  const current = shown.find((d) => d.date === active) || best;
  const label = (d: { rawDate: Date }) => new Date(d.rawDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const step = shown.length > 14 ? Math.ceil(shown.length / 7) : 1; // keep axis labels readable
  return (
    <View>
      <Text style={styles.trendReadout} accessibilityLiveRegion="polite">
        <Text style={styles.trendReadoutStrong}>{money(current.revenue)}</Text>
        {`  ${label(current)} · ${current.orders} ${current.orders === 1 ? 'order' : 'orders'}${current === best && !active ? ' · best day' : ''}`}
      </Text>
      <View style={styles.trendBars}>
        {shown.map((d, i) => {
          const on = d === current;
          return (
            <TouchableOpacity
              key={d.date}
              style={styles.trendCol}
              onPress={() => setActive((a) => (a === d.date ? null : d.date))}
              accessibilityRole="button"
              accessibilityLabel={`${label(d)}: ${money(d.revenue)}, ${d.orders} orders`}
            >
              <View style={styles.trendTrack}>
                <View style={[styles.trendBar, { height: `${Math.max(2, (d.revenue / max) * 100)}%` }, !on && styles.trendBarMuted]} />
              </View>
              <Text style={styles.trendLabel} numberOfLines={1}>
                {i % step === 0 ? new Date(d.rawDate).getDate() : ' '}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

/* ── Loading skeleton ─────────────────────────────────────────────────── */

/** A card of placeholder rows (label on the left, value on the right). */
function SkeletonListCard({ rows, testID }: { rows: number; testID?: string }) {
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.cardHeader}>
        <Skeleton width={120} height={16} />
        <Skeleton width={60} height={12} />
      </View>
      <View style={{ gap: 12, marginTop: 4 }}>
        {Array.from({ length: rows }, (_, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Skeleton width={`${45 - (i % 3) * 8}%`} height={12} />
            <Skeleton width={56} height={12} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** Bar heights for the placeholder chart (fixed, so it doesn't flicker between renders). */
const SKELETON_BARS = [40, 65, 30, 80, 55, 70, 45, 90, 60, 35, 75, 50];

/**
 * Placeholder for the whole dashboard while orders load: the same cards in the same places
 * (phone, portrait tablet, landscape two-column), so nothing jumps when the numbers arrive.
 */
function AnalyticsSkeleton({ wide, isTablet, pairInRow }: { wide: boolean; isTablet: boolean; pairInRow: boolean }) {
  const kpis = (
    <View style={[styles.kpiArea, isTablet && styles.kpiAreaTablet]} testID="analytics-skeleton-kpis">
      <View style={[styles.heroCard, isTablet && styles.heroCardTablet, styles.skeletonHero]}>
        <Skeleton width={60} height={12} style={{ marginBottom: 12 }} />
        <Skeleton width="65%" height={30} style={{ marginBottom: 10 }} />
        <Skeleton width="45%" height={12} />
      </View>
      <View style={[styles.kpiGrid, isTablet && styles.kpiGridTablet]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.kpiCard, isTablet ? styles.kpiCardStacked : styles.kpiCardPhone]}>
            <Skeleton width="55%" height={11} style={{ marginBottom: 10 }} />
            <Skeleton width="70%" height={22} style={{ marginBottom: 8 }} />
            <Skeleton width="50%" height={10} />
          </View>
        ))}
      </View>
    </View>
  );
  const trend = (
    <View style={styles.card} testID="analytics-skeleton-trend">
      <View style={styles.cardHeader}>
        <Skeleton width={110} height={16} />
        <Skeleton width={50} height={12} />
      </View>
      <Skeleton width="55%" height={14} style={{ marginBottom: 14 }} />
      <View style={styles.skeletonBars}>
        {SKELETON_BARS.map((h, i) => (
          <View key={i} style={styles.skeletonBarCol}>
            <Skeleton width="100%" height={`${h}%`} borderRadius={4} />
          </View>
        ))}
      </View>
    </View>
  );
  const status = <SkeletonListCard rows={6} />;
  const payments = <SkeletonListCard rows={2} />;
  const dishes = <SkeletonListCard rows={5} />;
  const channels = <SkeletonListCard rows={3} />;

  return (
    <View
      testID="analytics-skeleton"
      accessible
      accessibilityLabel="Loading analytics"
      accessibilityState={{ busy: true }}
    >
      {wide ? (
        <View style={styles.wideRow}>
          <View style={styles.wideCol}>
            {kpis}
            {trend}
            {channels}
          </View>
          <View style={styles.wideCol}>
            {status}
            {payments}
            {dishes}
          </View>
        </View>
      ) : (
        <>
          {kpis}
          {trend}
          {status}
          <View style={[styles.pairRow, pairInRow && styles.pairRowTablet]}>
            {payments}
            {dishes}
          </View>
          {channels}
        </>
      )}
    </View>
  );
}

export const RestaurantAnalytics: React.FC<RestaurantAnalyticsProps> = ({
  initialOrders,
  ownerStats,
  restaurantName = 'Restaurant',
  restaurantId,
  onNavigateOrders,
  refreshKey = 0,
}) => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isTablet = windowWidth >= 768;
  // Landscape tablets: two columns (numbers + trends | status, payments, dishes)
  const wide = windowWidth >= 900 && windowWidth > windowHeight;
  const pairInRow = isTablet && !wide;

  const [timeframe, setTimeframe] = useState<TimeframeKey>('today');
  // Start loading with nothing: showing `initialOrders` (every order) under "Today" until the
  // first fetch finished made the first numbers on screen wrong.
  const [loading, setLoading] = useState(true);
  const [timeframeOrders, setTimeframeOrders] = useState<Order[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Only the newest request may update the screen (switching periods quickly used to let a slow, older answer win). */
  const requestSeq = React.useRef(0);
  const [topDishes, setTopDishes] = useState<TopDishItem[]>([]);
  // The menu report isn't date-filtered, so say so instead of implying it matches the period.
  const [dishesAllTime, setDishesAllTime] = useState(false);

  // Selective Date (Custom Range) State
  const [customStartDate, setCustomStartDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [customEndDate, setCustomEndDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  });
  const [dateRangeModalVisible, setDateRangeModalVisible] = useState(false);
  const [pickerStartDate, setPickerStartDate] = useState<Date>(customStartDate);
  const [pickerEndDate, setPickerEndDate] = useState<Date | null>(customEndDate);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());

  // Helper for generating calendar month days
  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days: { date: Date; isCurrentMonth: boolean }[] = [];

    // Previous month padding
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthDays - i),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({
        date: new Date(year, month, d),
        isCurrentMonth: true,
      });
    }

    // Next month padding to complete row
    const remaining = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      days.push({
        date: new Date(year, month + 1, d),
        isCurrentMonth: false,
      });
    }

    return days;
  }, [calendarMonth]);

  const isDateSameDay = (d1: Date | null, d2: Date | null) => {
    if (!d1 || !d2) return false;
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  const isDateInRange = (d: Date, start: Date | null, end: Date | null) => {
    if (!start || !end) return false;
    const time = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const startTime = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
    const endTime = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
    return time >= startTime && time <= endTime;
  };

  const handleSelectCalendarDate = (date: Date) => {
    const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (!pickerEndDate && pickerStartDate && normalized.getTime() > pickerStartDate.getTime()) {
      setPickerEndDate(normalized);
    } else {
      setPickerStartDate(normalized);
      setPickerEndDate(null);
    }
  };

  const applyPreset = (preset: 'today' | 'yesterday' | '7d' | '30d' | 'this_month' | 'last_month') => {
    const now = new Date();
    let s = new Date();
    let e = new Date();

    if (preset === 'today') {
      s = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (preset === 'yesterday') {
      s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      e = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
    } else if (preset === '7d') {
      s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
      e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (preset === '30d') {
      s = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0);
      e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (preset === 'this_month') {
      s = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (preset === 'last_month') {
      s = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    }

    setPickerStartDate(s);
    setPickerEndDate(e);
    setCalendarMonth(new Date(s));
  };

  // Calculate timeframe bounds
  const getTimeframeBounds = useCallback((tf: TimeframeKey, customStart = customStartDate, customEnd = customEndDate) => {
    const now = new Date();
    if (tf === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return { startDate: start.toISOString(), endDate: end.toISOString() };
    }
    if (tf === '7d') {
      const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return { startDate: start.toISOString(), endDate: now.toISOString() };
    }
    if (tf === '30d') {
      const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      return { startDate: start.toISOString(), endDate: now.toISOString() };
    }
    if (tf === 'custom') {
      const s = new Date(customStart);
      s.setHours(0, 0, 0, 0);
      const e = new Date(customEnd);
      e.setHours(23, 59, 59, 999);
      return { startDate: s.toISOString(), endDate: e.toISOString() };
    }
    return {};
  }, [customStartDate, customEndDate]);

  const fetchAnalyticsData = useCallback(
    async (tf: TimeframeKey, overrideStart?: Date, overrideEnd?: Date) => {
      const seq = ++requestSeq.current;
      setLoading(true);
      setLoadError(null);
      try {
        const bounds = getTimeframeBounds(tf, overrideStart || customStartDate, overrideEnd || customEndDate);
        const [ordersRes, menuRes] = await Promise.allSettled([
          orderService.fetchAllOrders({
            startDate: bounds.startDate,
            endDate: bounds.endDate,
            allPages: true,
          }),
          orderService.getMenuPerformanceReport(),
        ]);
        if (seq !== requestSeq.current) return; // a newer period was chosen meanwhile

        if (ordersRes.status === 'fulfilled' && ordersRes.value.success) {
          let list = ordersRes.value.data || (ordersRes.value as any).orders || [];
          // Keep exactly the chosen period on this device's clock. (The server stretches the end
          // of the range to 23:59 in its own time zone, which adds hours of the next day for
          // phones ahead of UTC.)
          if (bounds.startDate || bounds.endDate) {
            const from = bounds.startDate ? new Date(bounds.startDate).getTime() : -Infinity;
            const to = bounds.endDate ? new Date(bounds.endDate).getTime() : Infinity;
            list = list.filter((o: any) => {
              const t = o.createdAt ? new Date(o.createdAt).getTime() : NaN;
              return Number.isFinite(t) && t >= from && t <= to;
            });
          }
          if (restaurantId) {
            list = list.filter((o: any) => {
              const rId =
                o.restaurantId?._id ||
                o.restaurantId?.id ||
                o.restaurantId ||
                (o.restaurant as any)?._id ||
                (o.restaurant as any)?.id;
              return String(rId) === String(restaurantId);
            });
          }
          setTimeframeOrders(list);
        } else {
          // Never leave the previous period's numbers on screen under the new period's name
          setTimeframeOrders([]);
          setLoadError(
            (ordersRes.status === 'fulfilled' && ordersRes.value.message) ||
              'Could not load orders for this period. Pull down to try again.'
          );
        }

        if (menuRes.status === 'fulfilled' && menuRes.value.success && Array.isArray(menuRes.value.data)) {
          const dishes = menuRes.value.data.map((d: any) => ({
            itemName: d.itemName || d.name || 'Dish',
            totalQuantitySold: Number(d.totalQuantitySold || d.count || 0),
            totalRevenue: Number(d.totalRevenue || 0),
          }));
          setTopDishes(dishes.slice(0, 5));
          setDishesAllTime(true);
        } else {
          // Fallback: derive top dishes from orders
          let fallbackList = ordersRes.status === 'fulfilled' && ordersRes.value.data ? ordersRes.value.data : initialOrders;
          if (restaurantId) {
            fallbackList = fallbackList.filter((o: any) => {
              const rId =
                o.restaurantId?._id ||
                o.restaurantId?.id ||
                o.restaurantId ||
                (o.restaurant as any)?._id ||
                (o.restaurant as any)?.id;
              return String(rId) === String(restaurantId);
            });
          }
          const dishMap = new Map<string, TopDishItem>();
          fallbackList.forEach((o) => {
            if (o.status === 'cancelled') return;
            const items = o.orderedItems || (o as any).items || [];
            items.forEach((it: any) => {
              const name = it.name || it.itemName || it.dishName || 'Item';
              const qty = Number(it.quantity || it.qty || 1);
              const price = Number(it.itemTotal || it.totalPrice || (it.price ? it.price * qty : 0));
              const cur = dishMap.get(name) || { itemName: name, totalQuantitySold: 0, totalRevenue: 0 };
              cur.totalQuantitySold += qty;
              cur.totalRevenue += price;
              dishMap.set(name, cur);
            });
          });
          const sorted = Array.from(dishMap.values()).sort((a, b) => b.totalQuantitySold - a.totalQuantitySold);
          setTopDishes(sorted.slice(0, 5));
          setDishesAllTime(false);
        }
      } catch (err) {
        console.warn('Failed fetching analytics data:', err);
        if (seq === requestSeq.current) {
          setTimeframeOrders([]);
          setLoadError('Could not load orders for this period. Pull down to try again.');
        }
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [getTimeframeBounds, initialOrders, customStartDate, customEndDate, restaurantId]
  );

  const handleApplyCustomRange = () => {
    if (pickerStartDate) {
      const s = new Date(pickerStartDate);
      s.setHours(0, 0, 0, 0);
      const e = pickerEndDate ? new Date(pickerEndDate) : new Date(pickerStartDate);
      e.setHours(23, 59, 59, 999);
      setCustomStartDate(s);
      setCustomEndDate(e);
      setTimeframe('custom');
      setDateRangeModalVisible(false);
      fetchAnalyticsData('custom', s, e);
    }
  };

  useEffect(() => {
    fetchAnalyticsData(timeframe);
    // refreshKey: the screen's refresh button
  }, [timeframe, fetchAnalyticsData, restaurantId, refreshKey]);

  // (Removed: an effect that replaced the "All time" orders with `initialOrders` — only the newest
  // 150 orders — and a fallback that swapped in server totals counted by different rules.
  // Every figure now comes from the same full list and the same rules.)
  const analytics = useMemo(() => computeDashboardAnalytics(timeframeOrders), [timeframeOrders]);

  const money = (n: number) =>
    `£${(Number.isFinite(n) ? n : 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const shortDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const longDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const customRangeLabel = isDateSameDay(customStartDate, customEndDate)
    ? shortDate(customStartDate)
    : `${shortDate(customStartDate)} – ${shortDate(customEndDate)}`;
  const periodLabel =
    timeframe === 'today'
      ? `Today, ${shortDate(new Date())}`
      : timeframe === 'custom'
        ? isDateSameDay(customStartDate, customEndDate)
          ? longDate(customStartDate)
          : `${shortDate(customStartDate)} – ${longDate(customEndDate)}`
        : 'All time';

  const salesCount = analytics.salesCount;
  const totalCashAndOnline = analytics.cashOrdersCount + analytics.onlineOrdersCount;
  const cashPct = totalCashAndOnline > 0 ? Math.round((analytics.cashOrdersCount / totalCashAndOnline) * 100) : 0;
  const onlinePct = totalCashAndOnline > 0 ? 100 - cashPct : 0;
  const completionRate =
    analytics.totalOrders > 0 ? Math.round((analytics.deliveredOrders / analytics.totalOrders) * 100) : 0;
  const maxDishQty = Math.max(...topDishes.map((d) => d.totalQuantitySold), 1);

  const openCustomRange = () => {
    setPickerStartDate(customStartDate);
    setPickerEndDate(customEndDate);
    setCalendarMonth(new Date(customStartDate));
    setDateRangeModalVisible(true);
  };

  const kpis: Array<{ label: string; value: string; sub: string; subTone?: 'bad' }> = [
    {
      label: 'Sales',
      value: money(analytics.totalRevenue),
      sub:
        `${salesCount} ${salesCount === 1 ? 'order' : 'orders'}` +
        (analytics.unpaidOrders > 0 ? ` · ${analytics.unpaidOrders} unpaid not included` : ''),
    },
    { label: 'Orders', value: String(analytics.totalOrders), sub: `${analytics.deliveredOrders} completed` },
    { label: 'Average order', value: money(analytics.averageOrderValue), sub: 'Excludes cancelled & unpaid' },
    {
      label: 'Completion',
      value: `${completionRate}%`,
      sub: `${analytics.cancelledOrders} cancelled`,
      subTone: analytics.cancelledOrders > 0 ? 'bad' : undefined,
    },
  ];

  const channelIcon = (id: string) =>
    id === 'dine_in' ? UtensilsCrossed : id === 'pickup' ? ShoppingBag : Bike;

  // Sales leads; the other three sit beside it (tablets) or below it (phones)
  const [hero, ...restKpis] = kpis;
  const kpiBlock = (
    <View style={[styles.kpiArea, isTablet && styles.kpiAreaTablet]}>
      <View style={[styles.heroCard, isTablet && styles.heroCardTablet]}>
        <Text style={styles.heroLabel}>{hero.label}</Text>
        <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {hero.value}
        </Text>
        <Text style={styles.heroSub} numberOfLines={1}>{hero.sub}</Text>
      </View>
      <View style={[styles.kpiGrid, isTablet && styles.kpiGridTablet]}>
        {restKpis.map((k) => (
          <View key={k.label} style={[styles.kpiCard, isTablet ? styles.kpiCardStacked : styles.kpiCardPhone]}>
            <Text style={styles.kpiLabel}>{k.label}</Text>
            <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {k.value}
            </Text>
            <Text style={[styles.kpiSub, k.subTone === 'bad' && styles.kpiSubBad]} numberOfLines={1}>
              {k.sub}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );

  // Sales per day across the period (2+ days); one hue, the best day highlighted
  const trendBlock =
    analytics.dailyBreakdown.length >= 2 ? (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Sales trend</Text>
          <Text style={styles.cardMeta}>{analytics.dailyBreakdown.length} days</Text>
        </View>
        <SalesTrend days={analytics.dailyBreakdown} money={money} />
      </View>
    ) : null;

  const statusBlock = (
    <>
      {/* Order status */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Order status</Text>
          {onNavigateOrders ? (
            <TouchableOpacity onPress={onNavigateOrders} style={styles.linkBtn} activeOpacity={0.7}>
              <Text style={styles.linkText}>View orders</Text>
              <ChevronRight size={16} color={Colors.primary} />
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.statusGrid}>
          {analytics.statusReport.map((st) => (
            <View key={st.id} style={[styles.statusCell, isTablet ? styles.statusCellTablet : styles.statusCellPhone]}>
              <Text style={[styles.statusCount, st.count === 0 && styles.statusCountZero]}>{st.count}</Text>
              <View style={styles.statusLabelRow}>
                <View style={[styles.statusDot, { backgroundColor: getStatusTheme(st.id).text }]} />
                <Text style={styles.statusLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                  {st.name}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </>
  );
  const paymentsBlock = (
    <>
      {/* Payments */}
      <View style={[styles.card, pairInRow && styles.pairCol]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Payments</Text>
        </View>
        <View style={styles.splitBar}>
          {totalCashAndOnline > 0 ? (
            <>
              {cashPct > 0 && <View style={{ flex: cashPct, backgroundColor: PAY_CASH }} />}
              {onlinePct > 0 && <View style={{ flex: onlinePct, backgroundColor: PAY_CARD }} />}
            </>
          ) : null}
        </View>
        <View style={styles.payRow}>
          {[
            { label: 'Cash', color: PAY_CASH, amount: analytics.cashRevenue, count: analytics.cashOrdersCount, pct: cashPct },
            { label: 'Card / online', color: PAY_CARD, amount: analytics.onlineRevenue, count: analytics.onlineOrdersCount, pct: onlinePct },
          ].map((p, i) => (
            <View key={p.label} style={[styles.payCol, i === 1 && styles.payColRight]}>
              <View style={styles.payLabelRow}>
                <View style={[styles.statusDot, { backgroundColor: p.color }]} />
                <Text style={styles.payLabel}>{p.label}</Text>
              </View>
              <Text style={styles.payAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                {money(p.amount)}
              </Text>
              <Text style={styles.paySub}>
                {p.count} {p.count === 1 ? 'order' : 'orders'} · {p.pct}%
              </Text>
            </View>
          ))}
        </View>
      </View>
    </>
  );
  const dishesBlock = (
    <>
      {/* Top dishes */}
      <View style={[styles.card, pairInRow && styles.pairCol]}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Top dishes</Text>
          {dishesAllTime && topDishes.length > 0 ? <Text style={styles.cardMeta}>All time</Text> : null}
        </View>
        {topDishes.length === 0 ? (
          <Text style={styles.emptyText}>No dishes sold in this period.</Text>
        ) : (
          topDishes.map((dish, idx) => (
            <View key={dish.itemName + idx} style={styles.dishRow}>
              <Text style={styles.dishRank}>{idx + 1}</Text>
              <View style={styles.dishBody}>
                <View style={styles.dishTop}>
                  <Text style={styles.dishName} numberOfLines={1}>{dish.itemName}</Text>
                  <Text style={styles.dishQty}>
                    {dish.totalQuantitySold} sold
                    {dish.totalRevenue > 0 ? <Text style={styles.dishRev}>{`  ${money(dish.totalRevenue)}`}</Text> : null}
                  </Text>
                </View>
                <View style={styles.dishTrack}>
                  <View
                    style={[
                      styles.dishFill,
                      { width: `${Math.round((dish.totalQuantitySold / maxDishQty) * 100)}%` },
                      idx > 0 && styles.dishFillMuted,
                    ]}
                  />
                </View>
              </View>
            </View>
          ))
        )}
      </View>
    </>
  );
  const channelBlock = (
    <>
      {/* Sales by channel */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Sales by channel</Text>
        </View>
        <View style={styles.tableHead}>
          <Text style={[styles.th, styles.colName]}>Channel</Text>
          <Text style={[styles.th, styles.colNum]}>Orders</Text>
          <Text style={[styles.th, styles.colNum]}>Share</Text>
          <Text style={[styles.th, styles.colMoney]}>Sales</Text>
        </View>
        {analytics.orderTypeBreakdown.map((row) => {
          const Icon = channelIcon(row.id);
          return (
            <View key={row.id} style={styles.tr}>
              <View style={[styles.colName, styles.channelCell]}>
                <Icon size={16} color="#64748B" />
                <Text style={styles.td} numberOfLines={1}>{row.name}</Text>
              </View>
              <Text style={[styles.td, styles.colNum]}>{row.count}</Text>
              <Text style={[styles.tdMuted, styles.colNum]}>{row.percentage}%</Text>
              <Text style={[styles.td, styles.colMoney]} numberOfLines={1}>{money(row.revenue)}</Text>
            </View>
          );
        })}
        <View style={[styles.tr, styles.trTotal]}>
          <Text style={[styles.tdTotal, styles.colName]}>Total</Text>
          <Text style={[styles.tdTotal, styles.colNum]}>{analytics.totalOrders}</Text>
          <Text style={[styles.tdMuted, styles.colNum]}>{analytics.totalOrders > 0 ? '100%' : '0%'}</Text>
          <Text style={[styles.tdTotal, styles.colMoney]} numberOfLines={1}>{money(analytics.totalRevenue)}</Text>
        </View>
        {analytics.cancelledRevenue > 0 ? (
          <Text style={styles.footnote}>
            Sales exclude {analytics.cancelledOrders} cancelled {analytics.cancelledOrders === 1 ? 'order' : 'orders'} ({money(analytics.cancelledRevenue)}).
          </Text>
        ) : null}
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      {/* Period */}
      <View style={styles.segment}>
        {TIMEFRAMES.map((tf) => {
          const active = timeframe === tf.id;
          const isCustom = tf.id === 'custom';
          return (
            <TouchableOpacity
              key={tf.id}
              style={[styles.segmentBtn, active && styles.segmentBtnActive]}
              onPress={() => (isCustom ? openCustomRange() : setTimeframe(tf.id))}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              {isCustom && <CalendarDays size={14} color={active ? Colors.text : '#64748B'} />}
              <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
                {isCustom ? (active ? customRangeLabel : 'Dates') : tf.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.periodRow}>
        <Text style={styles.periodLabel} numberOfLines={1}>{periodLabel}</Text>
      </View>
      {loadError && !loading ? (
        <Text style={styles.loadError} accessibilityRole="alert">
          {loadError}
        </Text>
      ) : null}

      {loading ? (
        <AnalyticsSkeleton wide={wide} isTablet={isTablet} pairInRow={pairInRow} />
      ) : wide ? (
        <View style={styles.wideRow}>
          <View style={styles.wideCol}>
            {kpiBlock}
            {trendBlock}
            {channelBlock}
          </View>
          <View style={styles.wideCol}>
            {statusBlock}
            {paymentsBlock}
            {dishesBlock}
          </View>
        </View>
      ) : (
        <>
          {kpiBlock}
          {trendBlock}
          {statusBlock}
          <View style={[styles.pairRow, pairInRow && styles.pairRowTablet]}>
            {paymentsBlock}
            {dishesBlock}
          </View>
          {channelBlock}
        </>
      )}

      {/* Date Range Picker Modal */}
      <Modal
        visible={dateRangeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDateRangeModalVisible(false)}
      >
        <View style={styles.dateModalOverlay}>
          <View style={styles.dateModalCard}>
            {/* Modal Header */}
            <View style={styles.dateModalHeader}>
              <View style={styles.dateModalTitleRow}>
                <CalendarDays size={18} color="#0F172A" />
                <Text style={styles.dateModalTitle}>Choose dates</Text>
              </View>
              <TouchableOpacity
                style={styles.dateModalCloseBtn}
                onPress={() => setDateRangeModalVisible(false)}
                activeOpacity={0.7}
              >
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Quick Presets */}
            
            <View style={styles.presetsGrid}>
              {[
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: '7d', label: 'Last 7 Days' },
                { id: '30d', label: 'Last 30 Days' },
                { id: 'this_month', label: 'This Month' },
                { id: 'last_month', label: 'Last Month' },
              ].map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.presetChip}
                  onPress={() => applyPreset(p.id as any)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.presetChipText}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Selected Range Display */}
            <View style={styles.rangeSummaryBox}>
              <Text style={styles.rangeSummaryLabel}>Range:</Text>
              <Text style={styles.rangeSummaryDates}>
                {pickerStartDate
                  ? `${pickerStartDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${
                      pickerEndDate
                        ? pickerEndDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                        : pickerStartDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                    }`
                  : 'Select dates'}
              </Text>
            </View>

            {/* Calendar Navigation */}
            <View style={styles.calendarNavRow}>
              <TouchableOpacity
                style={styles.calendarNavBtn}
                onPress={() =>
                  setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                }
                activeOpacity={0.7}
              >
                <ChevronLeft size={16} color="#0F172A" />
              </TouchableOpacity>
              <Text style={styles.calendarMonthTitle}>
                {calendarMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
              </Text>
              <TouchableOpacity
                style={styles.calendarNavBtn}
                onPress={() =>
                  setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                }
                activeOpacity={0.7}
              >
                <ChevronRight size={16} color="#0F172A" />
              </TouchableOpacity>
            </View>

            {/* Weekday headers */}
            <View style={styles.weekdaysRow}>
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
                <Text key={day} style={styles.weekdayText}>
                  {day}
                </Text>
              ))}
            </View>

            {/* Calendar Day Grid */}
            <View style={styles.calendarDaysGrid}>
              {calendarDays.map((item, idx) => {
                const isStart = isDateSameDay(item.date, pickerStartDate);
                const isEnd = isDateSameDay(item.date, pickerEndDate);
                const inRange = isDateInRange(item.date, pickerStartDate, pickerEndDate);
                const isSingle = isStart && (!pickerEndDate || isDateSameDay(pickerStartDate, pickerEndDate));

                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      styles.calendarDayCell,
                      inRange && !isStart && !isEnd && styles.calendarDayCellInRange,
                      isStart && !isSingle && styles.calendarDayCellSelectedStart,
                      isEnd && !isSingle && styles.calendarDayCellSelectedEnd,
                      isSingle && styles.calendarDayCellSingle,
                    ]}
                    onPress={() => handleSelectCalendarDate(item.date)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.calendarDayText,
                        !item.isCurrentMonth && styles.calendarDayTextMuted,
                        (isStart || isEnd) && styles.calendarDayTextSelected,
                      ]}
                    >
                      {item.date.getDate()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Actions */}
            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setDateRangeModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.applyBtn}
                onPress={handleApplyCustomRange}
                activeOpacity={0.8}
              >
                <Text style={styles.applyBtnText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  /* Date Range Picker Modal Styles */
  dateModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  dateModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    width: '100%',
    maxWidth: 380,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  dateModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  dateModalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  dateModalCloseBtn: {
    padding: 5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  modalSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
  },
  rangeSummaryBox: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  rangeSummaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  rangeSummaryDates: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  calendarNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  calendarMonthTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  calendarNavBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  weekdayText: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  calendarDaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 14,
  },
  calendarDayCell: {
    width: '14.28%',
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 1,
  },
  calendarDayCellSelectedStart: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  calendarDayCellSelectedEnd: {
    backgroundColor: '#0F172A',
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  calendarDayCellSingle: {
    backgroundColor: '#0F172A',
    borderRadius: 8,
  },
  calendarDayCellInRange: {
    backgroundColor: '#E2E8F0',
  },
  calendarDayText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },
  calendarDayTextMuted: {
    color: '#CBD5E1',
  },
  calendarDayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  modalFooterRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  applyBtn: {
    flex: 1.4,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  container: { marginTop: 4, marginBottom: 8 },


  segment: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: '#F1F3F5', borderRadius: 10, padding: 3, marginBottom: 14 },
  segmentBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, minHeight: 34, borderRadius: 8 },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentText: { fontSize: 13.5, fontWeight: '600', color: '#64748B' },
  segmentTextActive: { color: Colors.text, fontWeight: '700' },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  kpiCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  kpiCardPhone: { flexBasis: '46%', flexGrow: 1 },
  kpiCardStacked: { flexBasis: '30%', flexGrow: 1 },
  kpiArea: { gap: 10, marginBottom: 12 },
  kpiAreaTablet: { flexDirection: 'row', alignItems: 'stretch' },
  kpiGridTablet: { flex: 1, marginBottom: 0 },
  heroCard: { padding: 16, borderRadius: 16, backgroundColor: Colors.primary },
  // Loading skeleton: the hero card's shape in a neutral colour, and the chart's bar row
  skeletonHero: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: Colors.cardBorder },
  skeletonBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 120 },
  skeletonBarCol: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  heroCardTablet: { flexBasis: '34%', justifyContent: 'center' },
  heroLabel: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  heroValue: { fontSize: 32, fontWeight: '800', color: '#FFFFFF', marginTop: 4, letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  periodRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -6, marginBottom: 12 },
  periodLabel: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  loadError: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B91C1C',
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  wideRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  wideCol: { flex: 1, minWidth: 0 },
  trendReadout: { fontSize: 13, color: Colors.textMuted, marginBottom: 8 },
  trendReadoutStrong: { fontSize: 16, fontWeight: '800', color: Colors.text },
  trendBars: { flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 3 },
  trendCol: { flex: 1, height: '100%', alignItems: 'center' },
  trendTrack: { flex: 1, width: '100%', justifyContent: 'flex-end', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  trendBar: { width: '100%', maxWidth: 26, alignSelf: 'center', backgroundColor: '#3B6FD8', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  trendBarMuted: { opacity: 0.45 },
  trendLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 4 },
  kpiLabel: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  kpiValue: { fontSize: 22, fontWeight: '800', color: Colors.text, marginTop: 4, letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  kpiSub: { fontSize: 12.5, color: Colors.textMuted, marginTop: 2 },
  kpiSubBad: { color: '#DC2626', fontWeight: '600' },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, minHeight: 24 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, letterSpacing: -0.3 },
  cardMeta: { fontSize: 12.5, color: Colors.textMuted, fontWeight: '600' },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 32 },
  linkText: { fontSize: 13.5, fontWeight: '700', color: Colors.primary },

  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusCell: { backgroundColor: '#F8F9FA', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10 },
  statusCellPhone: { flexBasis: '30%', flexGrow: 1 },
  statusCellTablet: { flexBasis: '14%', flexGrow: 1 },
  statusCount: { fontSize: 20, fontWeight: '800', color: Colors.text, fontVariant: ['tabular-nums'] },
  statusCountZero: { color: '#CBD5E1' },
  statusLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { flexShrink: 1, fontSize: 12.5, fontWeight: '600', color: '#475569' },

  pairRow: {},
  pairRowTablet: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  pairCol: { flex: 1 },

  splitBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: '#F1F3F5', gap: 2 },
  payRow: { flexDirection: 'row', marginTop: 14 },
  payCol: { flex: 1, minWidth: 0 },
  payColRight: { paddingLeft: 14, borderLeftWidth: 1, borderLeftColor: '#F1F3F5' },
  payLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  payLabel: { fontSize: 13, fontWeight: '600', color: '#475569' },
  payAmount: { fontSize: 18, fontWeight: '800', color: Colors.text, marginTop: 4, fontVariant: ['tabular-nums'] },
  paySub: { fontSize: 12.5, color: Colors.textMuted, marginTop: 2 },

  emptyText: { fontSize: 13.5, color: Colors.textMuted, paddingVertical: 8 },
  dishRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  dishRank: { width: 16, fontSize: 13, fontWeight: '700', color: '#94A3B8', textAlign: 'center', fontVariant: ['tabular-nums'] },
  dishBody: { flex: 1, minWidth: 0 },
  dishTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  dishName: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.text },
  dishQty: { fontSize: 13, fontWeight: '700', color: Colors.text, fontVariant: ['tabular-nums'] },
  dishRev: { fontWeight: '500', color: Colors.textMuted },
  dishTrack: { height: 4, borderRadius: 2, backgroundColor: '#F1F3F5', marginTop: 6, overflow: 'hidden' },
  dishFill: { height: 4, borderRadius: 2, backgroundColor: Colors.primary },
  dishFillMuted: { opacity: 0.45 },

  tableHead: { flexDirection: 'row', alignItems: 'center', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#F1F3F5' },
  th: { fontSize: 12.5, fontWeight: '600', color: Colors.textMuted },
  tr: { flexDirection: 'row', alignItems: 'center', minHeight: 44, borderBottomWidth: 1, borderBottomColor: '#F6F7F8' },
  trTotal: { borderBottomWidth: 0 },
  colName: { flex: 2 },
  colNum: { flex: 1, textAlign: 'right' },
  colMoney: { flex: 1.6, textAlign: 'right' },
  channelCell: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  td: { fontSize: 14, fontWeight: '600', color: Colors.text, fontVariant: ['tabular-nums'] },
  tdMuted: { fontSize: 13.5, color: Colors.textMuted, fontVariant: ['tabular-nums'] },
  tdTotal: { fontSize: 14, fontWeight: '800', color: Colors.text, fontVariant: ['tabular-nums'] },
  footnote: { fontSize: 12.5, color: Colors.textMuted, marginTop: 8 },
});
