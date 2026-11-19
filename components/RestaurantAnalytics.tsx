import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  Modal,
} from 'react-native';
import { Colors } from '../constants/colors';
import { Order } from '../types';
import { orderService } from '../services/order.service';
import {
  RefreshCw,
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

export function computeDashboardAnalytics(orders: Order[]): DashboardAnalytics {
  let totalRevenue = 0;
  let deliveredOrders = 0;
  let deliveredRevenue = 0;
  let cancelledOrders = 0;
  let cancelledRevenue = 0;
  let cashOrdersCount = 0;
  let cashRevenue = 0;
  let onlineOrdersCount = 0;
  let onlineRevenue = 0;

  const dailyMap = new Map<string, any>();
  const fulfillmentMap: Record<string, number> = { delivery: 0, pickup: 0, dine_in: 0 };
  const fulfillmentRevMap: Record<string, number> = { delivery: 0, pickup: 0, dine_in: 0 };
  const statusMap: Record<string, number> = {
    placed: 0,
    preparing: 0,
    ready_for_pickup: 0,
    out_for_delivery: 0,
    delivered: 0,
    cancelled: 0,
  };

  orders.forEach((order) => {
    const explicitTotal =
      order.pricing?.totalAmount ??
      order.pricing?.total ??
      order.totalAmount ??
      (order as any).totalPrice ??
      (order as any).grandTotal;

    let orderTotal = 0;
    if (explicitTotal !== undefined && explicitTotal !== null && !isNaN(Number(explicitTotal))) {
      orderTotal = Number(explicitTotal);
    } else if (Array.isArray(order.orderedItems)) {
      orderTotal = order.orderedItems.reduce((sum, it: any) => {
        const p = Number(it.itemTotal || it.totalPrice || (it.price ? it.price * (it.quantity || 1) : 0));
        return sum + (isNaN(p) ? 0 : p);
      }, 0);
    }

    const st = (order.status || 'placed').toLowerCase();
    const isDelivered = st === 'delivered';
    const isCancelled = st === 'cancelled' || (order as any).acceptanceStatus === 'rejected';
    const isValid = !isCancelled;

    const pType = (order.paymentType || '').toLowerCase();
    const isCash = pType === 'cash';
    const isOnline = ['card', 'online', 'stripe', 'wallet'].includes(pType) || (!isCash && Boolean(pType));

    // Fulfillment
    const rawFType = ((order.orderType || (order as any).fulfillmentType || '') as string).toLowerCase();
    const fType = rawFType.includes('dine') ? 'dine_in' : rawFType.includes('pick') ? 'pickup' : 'delivery';
    fulfillmentMap[fType] = (fulfillmentMap[fType] || 0) + 1;

    // Status
    if (statusMap[st] !== undefined) {
      statusMap[st] += 1;
    } else {
      statusMap.placed += 1;
    }

    if (isValid) {
      totalRevenue += orderTotal;
      fulfillmentRevMap[fType] = (fulfillmentRevMap[fType] || 0) + orderTotal;
    }
    if (isDelivered) {
      deliveredOrders += 1;
      deliveredRevenue += orderTotal;
    }
    if (isCancelled) {
      cancelledOrders += 1;
      cancelledRevenue += orderTotal;
    }

    if (isCash) {
      cashOrdersCount += 1;
      if (isValid) cashRevenue += orderTotal;
    } else {
      onlineOrdersCount += 1;
      if (isValid) onlineRevenue += orderTotal;
    }

    // Daily grouping
    const dateObj = order.createdAt ? new Date(order.createdAt) : new Date();
    const day = dateObj.getDate().toString().padStart(2, '0');
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const dateKey = `${day}/${month}`;

    if (!dailyMap.has(dateKey)) {
      dailyMap.set(dateKey, {
        date: dateKey,
        rawDate: dateObj,
        orders: 0,
        delivered: 0,
        revenue: 0,
        cashOrders: 0,
        onlineOrders: 0,
      });
    }

    const dayObj = dailyMap.get(dateKey);
    dayObj.orders += 1;
    if (isValid) dayObj.revenue += orderTotal;
    if (isDelivered) dayObj.delivered += 1;
    if (isCash) dayObj.cashOrders += 1;
    else dayObj.onlineOrders += 1;
  });

  const dailyBreakdown = Array.from(dailyMap.values()).sort(
    (a, b) => a.rawDate.getTime() - b.rawDate.getTime()
  );

  const totalOrdersCount = orders.length;
  const validOrdersCount = orders.filter(
    (o) => o.status !== 'cancelled' && (o as any).acceptanceStatus !== 'rejected'
  ).length;

  const averageOrderValue = validOrdersCount > 0 ? totalRevenue / validOrdersCount : 0;

  const orderTypeBreakdown = [
    {
      id: 'delivery',
      name: 'Delivery',
      icon: '🛵',
      count: fulfillmentMap.delivery || 0,
      revenue: fulfillmentRevMap.delivery || 0,
      percentage: totalOrdersCount > 0 ? Math.round(((fulfillmentMap.delivery || 0) / totalOrdersCount) * 100) : 0,
    },
    {
      id: 'pickup',
      name: 'Self Pickup',
      icon: '🛍️',
      count: fulfillmentMap.pickup || 0,
      revenue: fulfillmentRevMap.pickup || 0,
      percentage: totalOrdersCount > 0 ? Math.round(((fulfillmentMap.pickup || 0) / totalOrdersCount) * 100) : 0,
    },
    {
      id: 'dine_in',
      name: 'Dine In',
      icon: '🍽️',
      count: fulfillmentMap.dine_in || 0,
      revenue: fulfillmentRevMap.dine_in || 0,
      percentage: totalOrdersCount > 0 ? Math.round(((fulfillmentMap.dine_in || 0) / totalOrdersCount) * 100) : 0,
    },
  ];

  const statusReport = [
    { id: 'placed', name: 'Placed', count: statusMap.placed || 0 },
    { id: 'preparing', name: 'In Kitchen', count: statusMap.preparing || 0 },
    { id: 'ready_for_pickup', name: 'Ready', count: statusMap.ready_for_pickup || 0 },
    { id: 'out_for_delivery', name: 'Out for delivery', count: statusMap.out_for_delivery || 0 },
    { id: 'delivered', name: 'Delivered', count: statusMap.delivered || 0 },
    { id: 'cancelled', name: 'Cancelled', count: statusMap.cancelled || 0 },
  ];

  return {
    totalRevenue,
    totalOrders: totalOrdersCount,
    deliveredOrders,
    deliveredRevenue,
    cancelledOrders,
    cancelledRevenue,
    averageOrderValue,
    cashOrdersCount,
    cashRevenue,
    onlineOrdersCount,
    onlineRevenue,
    dailyBreakdown,
    orderTypeBreakdown,
    statusReport,
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

export type RestaurantAnalyticsProps = AnalyticsRestaurantProps;

const TIMEFRAMES: Array<{ id: TimeframeKey; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'all', label: 'All Time' },
  { id: 'custom', label: 'Select Date' },
];

export const RestaurantAnalytics: React.FC<RestaurantAnalyticsProps> = ({
  initialOrders,
  ownerStats,
  restaurantName = 'Restaurant',
  restaurantId,
  onNavigateOrders,
}) => {
  const { width: windowWidth } = useWindowDimensions();
  const isTablet = windowWidth >= 768;

  const [timeframe, setTimeframe] = useState<TimeframeKey>('today');
  const [loading, setLoading] = useState(false);
  const [timeframeOrders, setTimeframeOrders] = useState<Order[]>(initialOrders);
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
      setLoading(true);
      try {
        const bounds = getTimeframeBounds(tf, overrideStart || customStartDate, overrideEnd || customEndDate);
        const [ordersRes, menuRes] = await Promise.allSettled([
          orderService.fetchAllOrders({
            startDate: bounds.startDate,
            endDate: bounds.endDate,
          }),
          orderService.getMenuPerformanceReport(),
        ]);

        if (ordersRes.status === 'fulfilled' && ordersRes.value.success) {
          let list = ordersRes.value.data || (ordersRes.value as any).orders || [];
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
        } else if (tf === 'all' && initialOrders.length > 0) {
          let list = initialOrders;
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
      } finally {
        setLoading(false);
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
  }, [timeframe, fetchAnalyticsData, restaurantId]);

  useEffect(() => {
    if (initialOrders && initialOrders.length > 0) {
      if (timeframe === 'all') {
        let list = initialOrders;
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
      }
    }
  }, [initialOrders, timeframe, restaurantId]);

  // Compute analytics
  const analytics = useMemo(() => {
    const res = computeDashboardAnalytics(timeframeOrders);
    // If all time and orders is empty or limited, blend ownerStats if available
    if (timeframe === 'all' && ownerStats && ownerStats.totalIncome > 0 && res.totalRevenue === 0) {
      return {
        ...res,
        totalRevenue: ownerStats.totalIncome,
        totalOrders: ownerStats.totalOrders,
        deliveredOrders: ownerStats.totalDelivered,
        cancelledOrders: ownerStats.totalCancelled,
        averageOrderValue: ownerStats.totalOrders > 0 ? ownerStats.totalIncome / ownerStats.totalOrders : 0,
      };
    }
    return res;
  }, [timeframeOrders, timeframe, ownerStats]);

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

  const paidOrders = Math.max(analytics.totalOrders - analytics.cancelledOrders, 0);
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
    { label: 'Sales', value: money(analytics.totalRevenue), sub: `${paidOrders} paid ${paidOrders === 1 ? 'order' : 'orders'}` },
    { label: 'Orders', value: String(analytics.totalOrders), sub: `${analytics.deliveredOrders} completed` },
    { label: 'Average order', value: money(analytics.averageOrderValue), sub: 'Excludes cancelled' },
    {
      label: 'Completion',
      value: `${completionRate}%`,
      sub: `${analytics.cancelledOrders} cancelled`,
      subTone: analytics.cancelledOrders > 0 ? 'bad' : undefined,
    },
  ];

  const channelIcon = (id: string) =>
    id === 'dine_in' ? UtensilsCrossed : id === 'pickup' ? ShoppingBag : Bike;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Overview</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{periodLabel}</Text>
        </View>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => fetchAnalyticsData(timeframe)}
          disabled={loading}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Refresh"
        >
          {loading ? <ActivityIndicator size="small" color={Colors.primary} /> : <RefreshCw size={16} color="#475569" />}
        </TouchableOpacity>
      </View>

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

      {/* Key numbers */}
      <View style={styles.kpiGrid}>
        {kpis.map((k) => (
          <View key={k.label} style={[styles.kpiCard, isTablet ? styles.kpiCardTablet : styles.kpiCardPhone]}>
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

      <View style={[styles.pairRow, isTablet && styles.pairRowTablet]}>
        {/* Payments */}
        <View style={[styles.card, isTablet && styles.pairCol]}>
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

        {/* Top dishes */}
        <View style={[styles.card, isTablet && styles.pairCol]}>
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
      </View>

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

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12 },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, letterSpacing: -0.3 },
  headerSubtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 2, fontWeight: '500' },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

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
  kpiCardTablet: { flexBasis: '22%', flexGrow: 1 },
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
