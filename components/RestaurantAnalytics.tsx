import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Share,
  Dimensions,
  Image,
  useWindowDimensions,
  Modal,
} from 'react-native';
import { Colors } from '../constants/colors';
import { Order } from '../types';
import { orderService } from '../services/order.service';
import {
  TrendingUp,
  ShoppingBag,
  Banknote,
  CreditCard,
  Receipt,
  CheckCircle2,
  RefreshCw,
  Share2,
  Calendar,
  CalendarDays,
  Bike,
  UtensilsCrossed,
  Award,
  ArrowUpRight,
  Clock,
  Check,
  X,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Flame,
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
    { id: 'out_for_delivery', name: 'Out for Delivery', count: statusMap.out_for_delivery || 0 },
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

export interface AnalyticsRestaurantProps {
  initialOrders: Order[];
  ownerStats?: {
    totalOrders: number;
    totalDelivered: number;
    totalCancelled: number;
    totalIncome: number;
  };
  restaurantName?: string;
  onNavigateOrders?: () => void;
}

export type RestaurantAnalyticsProps = AnalyticsRestaurantProps;

const TIMEFRAMES: Array<{ id: TimeframeKey; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 Days' },
  { id: '30d', label: '30 Days' },
  { id: 'custom', label: 'Select Date' },
  { id: 'all', label: 'All Time' },
];

export const RestaurantAnalytics: React.FC<RestaurantAnalyticsProps> = ({
  initialOrders,
  ownerStats,
  restaurantName = 'Restaurant',
  onNavigateOrders,
}) => {
  const { width: windowWidth } = useWindowDimensions();
  const isSmallScreen = windowWidth < 375;
  const isTablet = windowWidth >= 768;
  const numColumns = isTablet ? 3 : 2;
  const gridGap = isSmallScreen ? 8 : 10;
  const availableWidth = windowWidth - 32;
  const cardWidth = Math.floor((availableWidth - (numColumns - 1) * gridGap) / numColumns);
  const illustrationSize = isSmallScreen ? 44 : isTablet ? 60 : 52;
  const glowSize = isSmallScreen ? 60 : isTablet ? 82 : 72;

  const [timeframe, setTimeframe] = useState<TimeframeKey>('7d');
  const [chartMetric, setChartMetric] = useState<ChartMetric>('revenue');
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeframeOrders, setTimeframeOrders] = useState<Order[]>(initialOrders);
  const [topDishes, setTopDishes] = useState<TopDishItem[]>([]);

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
          const list = ordersRes.value.data || (ordersRes.value as any).orders || [];
          setTimeframeOrders(list);
        } else if (tf === 'all' && initialOrders.length > 0) {
          setTimeframeOrders(initialOrders);
        }

        if (menuRes.status === 'fulfilled' && menuRes.value.success && Array.isArray(menuRes.value.data)) {
          const dishes = menuRes.value.data.map((d: any) => ({
            itemName: d.itemName || d.name || 'Dish',
            totalQuantitySold: Number(d.totalQuantitySold || d.count || 0),
            totalRevenue: Number(d.totalRevenue || 0),
          }));
          setTopDishes(dishes.slice(0, 5));
        } else {
          // Fallback: derive top dishes from orders
          const fallbackList = ordersRes.status === 'fulfilled' && ordersRes.value.data ? ordersRes.value.data : initialOrders;
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
        }
      } catch (err) {
        console.warn('Failed fetching analytics data:', err);
      } finally {
        setLoading(false);
      }
    },
    [getTimeframeBounds, initialOrders, customStartDate, customEndDate]
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
      setSelectedDayIndex(null);
      setDateRangeModalVisible(false);
      fetchAnalyticsData('custom', s, e);
    }
  };

  useEffect(() => {
    fetchAnalyticsData(timeframe);
  }, [timeframe, fetchAnalyticsData]);

  useEffect(() => {
    if (initialOrders && initialOrders.length > 0) {
      if (timeframe === 'all') {
        setTimeframeOrders(initialOrders);
      }
    }
  }, [initialOrders, timeframe]);

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

  // Share report
  const handleShareReport = async () => {
    const tfLabel = TIMEFRAMES.find((t) => t.id === timeframe)?.label || 'Selected Period';
    const lines = [
      `📊 RESTAURANT SALES & OPERATIONAL REPORT`,
      `Restaurant: ${restaurantName}`,
      `Timeframe: ${tfLabel}`,
      `Generated: ${new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`,
      `----------------------------------------`,
      `Gross Sales: £${analytics.totalRevenue.toFixed(2)}`,
      `Total Orders: ${analytics.totalOrders}`,
      `Average Order Value (AOV): £${analytics.averageOrderValue.toFixed(2)}`,
      `Delivered Orders: ${analytics.deliveredOrders}`,
      `Cancelled / Rejected: ${analytics.cancelledOrders}`,
      `Fulfillment Rate: ${analytics.totalOrders > 0 ? Math.round((analytics.deliveredOrders / analytics.totalOrders) * 100) : 0}%`,
      `----------------------------------------`,
      `PAYMENT BREAKDOWN:`,
      `• Cash on Delivery: ${analytics.cashOrdersCount} orders (£${analytics.cashRevenue.toFixed(2)})`,
      `• Online / Card / Stripe: ${analytics.onlineOrdersCount} orders (£${analytics.onlineRevenue.toFixed(2)})`,
      `----------------------------------------`,
      `FULFILLMENT MODES:`,
      ...analytics.orderTypeBreakdown.map((f) => `• ${f.name}: ${f.count} orders (${f.percentage}%)`),
      `----------------------------------------`,
      `ORDER LIFECYCLE:`,
      ...analytics.statusReport.map((s) => `• ${s.name}: ${s.count}`),
    ];

    if (topDishes.length > 0) {
      lines.push(`----------------------------------------`);
      lines.push(`TOP DISHES:`);
      topDishes.forEach((d, idx) => {
        lines.push(`#${idx + 1} ${d.itemName} - ${d.totalQuantitySold} sold (£${d.totalRevenue.toFixed(2)})`);
      });
    }

    try {
      await Share.share({
        title: `${restaurantName} Analytics Report`,
        message: lines.join('\n'),
      });
    } catch (e) {
      console.error('Share report error:', e);
    }
  };

  // Trajectory chart calculations
  const chartData = useMemo(() => {
    if (analytics.dailyBreakdown.length > 0) return analytics.dailyBreakdown;
    // Fallback if no daily points: show dummy day
    return [
      {
        date: 'Today',
        rawDate: new Date(),
        orders: analytics.totalOrders,
        delivered: analytics.deliveredOrders,
        revenue: analytics.totalRevenue,
        cashOrders: analytics.cashOrdersCount,
        onlineOrders: analytics.onlineOrdersCount,
      },
    ];
  }, [analytics]);

  const maxChartValue = useMemo(() => {
    if (chartMetric === 'revenue') {
      const maxRev = Math.max(...chartData.map((d) => d.revenue), 10);
      return maxRev;
    }
    if (chartMetric === 'orders') {
      const maxOrd = Math.max(...chartData.map((d) => d.orders), 5);
      return maxOrd;
    }
    // payment comparison
    const maxPay = Math.max(...chartData.map((d) => Math.max(d.cashOrders, d.onlineOrders)), 5);
    return maxPay;
  }, [chartData, chartMetric]);

  const totalCashAndOnline = analytics.cashOrdersCount + analytics.onlineOrdersCount;
  const cashPct = totalCashAndOnline > 0 ? Math.round((analytics.cashOrdersCount / totalCashAndOnline) * 100) : 0;
  const onlinePct = totalCashAndOnline > 0 ? 100 - cashPct : 0;

  const fulfillmentRate =
    analytics.totalOrders > 0
      ? Math.round((analytics.deliveredOrders / analytics.totalOrders) * 100)
      : 0;

  const cancellationRate =
    analytics.totalOrders > 0
      ? Math.round((analytics.cancelledOrders / analytics.totalOrders) * 100)
      : 0;

  const maxDishQty = useMemo(() => {
    return Math.max(...topDishes.map((d) => d.totalQuantitySold), 1);
  }, [topDishes]);

  const selectedDay = selectedDayIndex !== null && chartData[selectedDayIndex] ? chartData[selectedDayIndex] : null;

  return (
    <View style={styles.container}>
      {/* Analytics Section Header with Live Operations & Actions */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.titleRow}>
            <Text style={styles.headerTitle}>Business Overview</Text>
            <View style={styles.livePill}>
              <View style={styles.liveDot} />
              <Text style={styles.livePillText}>Live</Text>
            </View>
          </View>
          <Text style={styles.headerSubtitle}>Sales & Order Performance</Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => fetchAnalyticsData(timeframe)}
            disabled={loading}
            activeOpacity={0.7}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FF5C39" />
            ) : (
              <RefreshCw size={15} color="#4B5563" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.iconButton, styles.exportButton]}
            onPress={handleShareReport}
            activeOpacity={0.7}
          >
            <Share2 size={15} color="#FF5C39" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Timeframe Selector Ribbon */}
      <View style={styles.timeframeBarContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeframeBar}>
          {TIMEFRAMES.map((tf) => {
            const isSelected = timeframe === tf.id;
            const isCustom = tf.id === 'custom';
            const customLabel =
              isCustom && timeframe === 'custom'
                ? isDateSameDay(customStartDate, customEndDate)
                  ? customStartDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                  : `${customStartDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${customEndDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                : tf.label;

            return (
              <TouchableOpacity
                key={tf.id}
                style={[
                  styles.timeframePill,
                  isSelected && styles.timeframePillActive,
                  isCustom && styles.timeframePillCustom,
                ]}
                onPress={() => {
                  if (isCustom) {
                    setPickerStartDate(customStartDate);
                    setPickerEndDate(customEndDate);
                    setCalendarMonth(new Date(customStartDate));
                    setDateRangeModalVisible(true);
                  } else {
                    setTimeframe(tf.id);
                    setSelectedDayIndex(null);
                  }
                }}
                activeOpacity={0.8}
              >
                {isCustom && (
                  <CalendarDays
                    size={13}
                    color={isSelected ? '#FFFFFF' : '#4B5563'}
                    style={{ marginRight: 5 }}
                  />
                )}
                <Text style={[styles.timeframePillText, isSelected && styles.timeframePillTextActive]}>
                  {customLabel}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 1. Executive 6-KPI Ribbon Grid */}
      <View style={[styles.kpiGrid, { gap: gridGap }]}>
        {/* Gross Sales */}
        <View style={[styles.kpiCard, styles.kpiCardRevenue, { width: cardWidth }, isSmallScreen && { padding: 10 }]}>
          <View
            style={[
              styles.kpiGlowBackdrop,
              { backgroundColor: '#FFEDD5', width: glowSize, height: glowSize, borderRadius: glowSize / 2 },
            ]}
            pointerEvents="none"
          />
          <Image
            source={require('../assets/kpi-gross-sales.png')}
            style={[styles.kpiBgIllustration, { width: illustrationSize, height: illustrationSize }]}
          />

          <View style={styles.kpiContentContainer}>
            <View style={styles.kpiTopRow}>
              <View style={[styles.kpiIconBox, { backgroundColor: '#FFF7ED' }]}>
                <TrendingUp size={isSmallScreen ? 15 : 17} color="#EA580C" />
              </View>
              <View style={[styles.kpiBadge, { backgroundColor: '#FFEDD5' }]}>
                <Text style={[styles.kpiBadgeText, { color: '#C2410C' }]}>REVENUE</Text>
              </View>
            </View>
            <Text
              style={[styles.kpiValue, isSmallScreen && { fontSize: 14 }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              £{analytics.totalRevenue.toFixed(2)}
            </Text>
            <Text style={styles.kpiLabel} numberOfLines={1}>Gross Sales</Text>
            <Text style={styles.kpiSub} numberOfLines={1} ellipsizeMode="tail">
              From {analytics.totalOrders - analytics.cancelledOrders} valid orders
            </Text>
          </View>
        </View>

        {/* Total Orders */}
        <View style={[styles.kpiCard, styles.kpiCardVolume, { width: cardWidth }, isSmallScreen && { padding: 10 }]}>
          <View
            style={[
              styles.kpiGlowBackdrop,
              { backgroundColor: '#DBEAFE', width: glowSize, height: glowSize, borderRadius: glowSize / 2 },
            ]}
            pointerEvents="none"
          />
          <Image
            source={require('../assets/kpi-total-orders.png')}
            style={[styles.kpiBgIllustration, { width: illustrationSize, height: illustrationSize }]}
          />

          <View style={styles.kpiContentContainer}>
            <View style={styles.kpiTopRow}>
              <View style={[styles.kpiIconBox, { backgroundColor: '#EFF6FF' }]}>
                <ShoppingBag size={isSmallScreen ? 15 : 17} color="#2563EB" />
              </View>
              <View style={[styles.kpiBadge, { backgroundColor: '#DBEAFE' }]}>
                <Text style={[styles.kpiBadgeText, { color: '#1E40AF' }]}>VOLUME</Text>
              </View>
            </View>
            <Text
              style={[styles.kpiValue, isSmallScreen && { fontSize: 14 }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {analytics.totalOrders}
            </Text>
            <Text style={styles.kpiLabel} numberOfLines={1}>Total Orders</Text>
            <Text style={styles.kpiSub} numberOfLines={1} ellipsizeMode="tail">
              {analytics.deliveredOrders} fulfilled
            </Text>
          </View>
        </View>

        {/* Cash on Delivery */}
        <View style={[styles.kpiCard, styles.kpiCardCash, { width: cardWidth }, isSmallScreen && { padding: 10 }]}>
          <View
            style={[
              styles.kpiGlowBackdrop,
              { backgroundColor: '#D1FAE5', width: glowSize, height: glowSize, borderRadius: glowSize / 2 },
            ]}
            pointerEvents="none"
          />
          <Image
            source={require('../assets/kpi-cash-orders.png')}
            style={[styles.kpiBgIllustration, { width: illustrationSize, height: illustrationSize }]}
          />

          <View style={styles.kpiContentContainer}>
            <View style={styles.kpiTopRow}>
              <View style={[styles.kpiIconBox, { backgroundColor: '#ECFDF5' }]}>
                <Banknote size={isSmallScreen ? 15 : 17} color="#059669" />
              </View>
              <View style={[styles.kpiBadge, { backgroundColor: '#D1FAE5' }]}>
                <Text style={[styles.kpiBadgeText, { color: '#065F46' }]}>{cashPct}% COD</Text>
              </View>
            </View>
            <Text
              style={[styles.kpiValue, isSmallScreen && { fontSize: 14 }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              £{analytics.cashRevenue.toFixed(2)}
            </Text>
            <Text style={styles.kpiLabel} numberOfLines={1}>Cash Orders</Text>
            <Text style={styles.kpiSub} numberOfLines={1} ellipsizeMode="tail">
              {analytics.cashOrdersCount} cash orders
            </Text>
          </View>
        </View>

        {/* Online / Stripe */}
        <View style={[styles.kpiCard, styles.kpiCardOnline, { width: cardWidth }, isSmallScreen && { padding: 10 }]}>
          <View
            style={[
              styles.kpiGlowBackdrop,
              { backgroundColor: '#E0E7FF', width: glowSize, height: glowSize, borderRadius: glowSize / 2 },
            ]}
            pointerEvents="none"
          />
          <Image
            source={require('../assets/kpi-online-card.png')}
            style={[styles.kpiBgIllustration, { width: illustrationSize, height: illustrationSize }]}
          />

          <View style={styles.kpiContentContainer}>
            <View style={styles.kpiTopRow}>
              <View style={[styles.kpiIconBox, { backgroundColor: '#EEF2FF' }]}>
                <CreditCard size={isSmallScreen ? 15 : 17} color="#4F46E5" />
              </View>
              <View style={[styles.kpiBadge, { backgroundColor: '#E0E7FF' }]}>
                <Text style={[styles.kpiBadgeText, { color: '#3730A3' }]}>{onlinePct}% CARD</Text>
              </View>
            </View>
            <Text
              style={[styles.kpiValue, isSmallScreen && { fontSize: 14 }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              £{analytics.onlineRevenue.toFixed(2)}
            </Text>
            <Text style={styles.kpiLabel} numberOfLines={1}>Online / Card</Text>
            <Text style={styles.kpiSub} numberOfLines={1} ellipsizeMode="tail">
              {analytics.onlineOrdersCount} online orders
            </Text>
          </View>
        </View>

        {/* Average Order Value (AOV) */}
        <View style={[styles.kpiCard, styles.kpiCardAov, { width: cardWidth }, isSmallScreen && { padding: 10 }]}>
          <View
            style={[
              styles.kpiGlowBackdrop,
              { backgroundColor: '#EDE9FE', width: glowSize, height: glowSize, borderRadius: glowSize / 2 },
            ]}
            pointerEvents="none"
          />
          <Image
            source={require('../assets/kpi-avg-value.png')}
            style={[styles.kpiBgIllustration, { width: illustrationSize, height: illustrationSize }]}
          />

          <View style={styles.kpiContentContainer}>
            <View style={styles.kpiTopRow}>
              <View style={[styles.kpiIconBox, { backgroundColor: '#F5F3FF' }]}>
                <Receipt size={isSmallScreen ? 15 : 17} color="#7C3AED" />
              </View>
              <View style={[styles.kpiBadge, { backgroundColor: '#EDE9FE' }]}>
                <Text style={[styles.kpiBadgeText, { color: '#6D28D9' }]}>AOV</Text>
              </View>
            </View>
            <Text
              style={[styles.kpiValue, isSmallScreen && { fontSize: 14 }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              £{analytics.averageOrderValue.toFixed(2)}
            </Text>
            <Text style={styles.kpiLabel} numberOfLines={1}>Avg Order Value</Text>
            <Text style={styles.kpiSub} numberOfLines={1} ellipsizeMode="tail">
              Average ticket basket size
            </Text>
          </View>
        </View>

        {/* Fulfillment Rate */}
        <View style={[styles.kpiCard, styles.kpiCardRate, { width: cardWidth }, isSmallScreen && { padding: 10 }]}>
          <View
            style={[
              styles.kpiGlowBackdrop,
              { backgroundColor: '#CCFBF1', width: glowSize, height: glowSize, borderRadius: glowSize / 2 },
            ]}
            pointerEvents="none"
          />
          <Image
            source={require('../assets/kpi-fulfillment-rate.png')}
            style={[styles.kpiBgIllustration, { width: illustrationSize, height: illustrationSize }]}
          />

          <View style={styles.kpiContentContainer}>
            <View style={styles.kpiTopRow}>
              <View style={[styles.kpiIconBox, { backgroundColor: '#F0FDFA' }]}>
                <CheckCircle2 size={isSmallScreen ? 15 : 17} color="#0D9488" />
              </View>
              <View style={[styles.kpiBadge, { backgroundColor: '#CCFBF1' }]}>
                <Text style={[styles.kpiBadgeText, { color: '#0F766E' }]}>RATE</Text>
              </View>
            </View>
            <Text
              style={[styles.kpiValue, isSmallScreen && { fontSize: 14 }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {fulfillmentRate}%
            </Text>
            <Text style={styles.kpiLabel} numberOfLines={1}>Fulfillment Rate</Text>
            <Text style={styles.kpiSub} numberOfLines={1} ellipsizeMode="tail">
              {analytics.cancelledOrders} cancelled ({cancellationRate}%)
            </Text>
          </View>
        </View>
      </View>

      {/* 2. Interactive Sales & Orders Trajectory Trend Chart */}
      <View style={styles.cardSection}>
        <View style={styles.chartHeaderRow}>
          <View>
            <Text style={styles.cardSectionTitle}>Performance Trajectory</Text>
            <Text style={styles.cardSectionSub}>
              {chartMetric === 'revenue'
                ? 'Daily revenue progress'
                : chartMetric === 'orders'
                  ? 'Daily volume of placed orders'
                  : 'Cash vs Online order volume comparison'}
            </Text>
          </View>

          {/* Metric Segment Toggle */}
          <View style={styles.segmentContainer}>
            <TouchableOpacity
              style={[styles.segmentBtn, chartMetric === 'revenue' && styles.segmentBtnActive]}
              onPress={() => setChartMetric('revenue')}
            >
              <Text style={[styles.segmentBtnText, chartMetric === 'revenue' && styles.segmentBtnTextActive]}>
                £ Revenue
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentBtn, chartMetric === 'orders' && styles.segmentBtnActive]}
              onPress={() => setChartMetric('orders')}
            >
              <Text style={[styles.segmentBtnText, chartMetric === 'orders' && styles.segmentBtnTextActive]}>
                Orders
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentBtn, chartMetric === 'payment' && styles.segmentBtnActive]}
              onPress={() => setChartMetric('payment')}
            >
              <Text style={[styles.segmentBtnText, chartMetric === 'payment' && styles.segmentBtnTextActive]}>
                Cash/Card
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Selected Day Tooltip / Indicator Bar */}
        {selectedDay ? (
          <View style={styles.tooltipBox}>
            <View style={styles.tooltipDot} />
            <Text style={styles.tooltipText}>
              <Text style={{ fontWeight: '800', color: '#111827' }}>{selectedDay.date}: </Text>
              £{selectedDay.revenue.toFixed(2)} Revenue • {selectedDay.orders} Orders ({selectedDay.cashOrders} Cash,{' '}
              {selectedDay.onlineOrders} Card)
            </Text>
          </View>
        ) : null}

        {/* Bar Chart Canvas */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartScrollArea}>
          <View style={styles.chartCanvas}>
            {chartData.map((item, index) => {
              const isSelected = selectedDayIndex === index;

              if (chartMetric === 'revenue') {
                const heightPct = Math.max((item.revenue / maxChartValue) * 100, 8);
                return (
                  <TouchableOpacity
                    key={item.date + index}
                    style={styles.barCol}
                    activeOpacity={0.8}
                    onPress={() => setSelectedDayIndex(isSelected ? null : index)}
                  >
                    <Text style={styles.barTopVal}>£{item.revenue > 999 ? `${(item.revenue / 1000).toFixed(1)}k` : item.revenue.toFixed(0)}</Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          { height: `${Math.min(heightPct, 100)}%`, backgroundColor: isSelected ? '#C2410C' : '#FF5C39' },
                        ]}
                      />
                    </View>
                    <Text style={[styles.barDateLabel, isSelected && styles.barDateLabelSelected]}>
                      {item.date}
                    </Text>
                  </TouchableOpacity>
                );
              }

              if (chartMetric === 'orders') {
                const heightPct = Math.max((item.orders / maxChartValue) * 100, 8);
                return (
                  <TouchableOpacity
                    key={item.date + index}
                    style={styles.barCol}
                    activeOpacity={0.8}
                    onPress={() => setSelectedDayIndex(isSelected ? null : index)}
                  >
                    <Text style={styles.barTopVal}>{item.orders}</Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          { height: `${Math.min(heightPct, 100)}%`, backgroundColor: isSelected ? '#1D4ED8' : '#3B82F6' },
                        ]}
                      />
                    </View>
                    <Text style={[styles.barDateLabel, isSelected && styles.barDateLabelSelected]}>
                      {item.date}
                    </Text>
                  </TouchableOpacity>
                );
              }

              // Payment Comparison: Dual bars for Cash vs Online
              const cashHeight = Math.max((item.cashOrders / maxChartValue) * 100, 6);
              const onlineHeight = Math.max((item.onlineOrders / maxChartValue) * 100, 6);
              return (
                <TouchableOpacity
                  key={item.date + index}
                  style={styles.dualBarCol}
                  activeOpacity={0.8}
                  onPress={() => setSelectedDayIndex(isSelected ? null : index)}
                >
                  <Text style={styles.barTopVal}>{item.orders}</Text>
                  <View style={styles.dualBarTrack}>
                    <View style={[styles.dualBar, { height: `${Math.min(cashHeight, 100)}%`, backgroundColor: '#10B981' }]} />
                    <View style={[styles.dualBar, { height: `${Math.min(onlineHeight, 100)}%`, backgroundColor: '#6366F1' }]} />
                  </View>
                  <Text style={[styles.barDateLabel, isSelected && styles.barDateLabelSelected]}>
                    {item.date}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* Legend */}
        {chartMetric === 'payment' && (
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendSquare, { backgroundColor: '#10B981' }]} />
              <Text style={styles.legendText}>Cash Orders</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendSquare, { backgroundColor: '#6366F1' }]} />
              <Text style={styles.legendText}>Online / Card Orders</Text>
            </View>
          </View>
        )}
      </View>

      {/* 3. Payment Method Breakdown Progress Card */}
      <View style={styles.cardSection}>
        <Text style={styles.cardSectionTitle}>Payment Method Share</Text>
        <Text style={styles.cardSectionSub}>Volume and revenue ratio by payment channel</Text>

        {/* Dual Progress Bar */}
        <View style={styles.dualProgressWrapper}>
          <View style={[styles.dualProgressFill, { flex: cashPct || 1, backgroundColor: '#10B981' }]} />
          <View style={[styles.dualProgressFill, { flex: onlinePct || 1, backgroundColor: '#6366F1' }]} />
        </View>

        {/* Stats Row */}
        <View style={styles.paymentDetailsRow}>
          <View style={styles.paymentDetailBox}>
            <View style={styles.paymentDetailTop}>
              <View style={[styles.paymentDot, { backgroundColor: '#10B981' }]} />
              <Text style={styles.paymentDetailTitle}>Cash on Delivery</Text>
            </View>
            <Text style={styles.paymentAmountText}>£{analytics.cashRevenue.toFixed(2)}</Text>
            <Text style={styles.paymentCountSub}>
              {analytics.cashOrdersCount} orders • {cashPct}% volume
            </Text>
          </View>

          <View style={styles.paymentDivider} />

          <View style={styles.paymentDetailBox}>
            <View style={styles.paymentDetailTop}>
              <View style={[styles.paymentDot, { backgroundColor: '#6366F1' }]} />
              <Text style={styles.paymentDetailTitle}>Online / Card</Text>
            </View>
            <Text style={styles.paymentAmountText}>£{analytics.onlineRevenue.toFixed(2)}</Text>
            <Text style={styles.paymentCountSub}>
              {analytics.onlineOrdersCount} orders • {onlinePct}% volume
            </Text>
          </View>
        </View>
      </View>

      {/* 4. Store Performance: Orders & Fulfillment Breakdown Table */}
      <View style={styles.cardSection}>
        <View style={styles.tableHeaderSection}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Receipt size={18} color="#FF5C39" />
            <Text style={styles.cardSectionTitle}>Store Performance & Order Breakdown</Text>
          </View>
          <Text style={styles.cardSectionSub}>
            Complete breakdown of delivered orders, cancelled orders, and order channels
          </Text>
        </View>

        {/* Breakdown Table */}
        <View style={styles.analyticsTable}>
          {/* Table Header Row */}
          <View style={styles.tableHeadRow}>
            <Text style={[styles.tableHeadCell, { flex: 2.2 }]}>Category / Type</Text>
            <Text style={[styles.tableHeadCell, { flex: 1, textAlign: 'center' }]}>Orders</Text>
            <Text style={[styles.tableHeadCell, { flex: 1, textAlign: 'center' }]}>Share</Text>
            <Text style={[styles.tableHeadCell, { flex: 1.4, textAlign: 'right' }]}>Revenue</Text>
          </View>

          {/* Table Section: Order Types */}
          <View style={styles.tableGroupHeader}>
            <Text style={styles.tableGroupHeaderText}>FULFILLMENT CHANNELS (TYPE OF ORDER)</Text>
          </View>

          {analytics.orderTypeBreakdown.map((item, idx) => {
            const isLast = idx === analytics.orderTypeBreakdown.length - 1;
            return (
              <View key={item.id} style={[styles.tableRow, isLast && styles.tableRowDivider]}>
                <View style={[styles.tableCellCol, { flex: 2.2 }]}>
                  <Text style={styles.tableCellMainText}>
                    {item.icon} {item.name}
                  </Text>
                </View>
                <Text style={[styles.tableCellText, { flex: 1, textAlign: 'center', fontWeight: '700' }]}>
                  {item.count}
                </Text>
                <View style={[styles.tableCellCol, { flex: 1, alignItems: 'center' }]}>
                  <View style={styles.shareBadge}>
                    <Text style={styles.shareBadgeText}>{item.percentage}%</Text>
                  </View>
                </View>
                <Text style={[styles.tableCellAmount, { flex: 1.4, textAlign: 'right' }]}>
                  £{item.revenue.toFixed(2)}
                </Text>
              </View>
            );
          })}

          {/* Table Section: Order Outcomes */}
          <View style={styles.tableGroupHeader}>
            <Text style={styles.tableGroupHeaderText}>ORDER OUTCOMES & FULFILLMENT</Text>
          </View>

          {/* Delivered Orders Row */}
          <View style={styles.tableRow}>
            <View style={[styles.tableCellCol, { flex: 2.2 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <CheckCircle2 size={15} color="#059669" />
                <Text style={[styles.tableCellMainText, { color: '#065F46' }]}>Delivered Orders</Text>
              </View>
              <Text style={styles.tableCellSubText}>Successfully fulfilled</Text>
            </View>
            <Text style={[styles.tableCellText, { flex: 1, textAlign: 'center', fontWeight: '800', color: '#059669' }]}>
              {analytics.deliveredOrders}
            </Text>
            <View style={[styles.tableCellCol, { flex: 1, alignItems: 'center' }]}>
              <View style={[styles.shareBadge, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                <Text style={[styles.shareBadgeText, { color: '#047857' }]}>
                  {analytics.totalOrders > 0 ? Math.round((analytics.deliveredOrders / analytics.totalOrders) * 100) : 0}%
                </Text>
              </View>
            </View>
            <Text style={[styles.tableCellAmount, { flex: 1.4, textAlign: 'right', color: '#059669' }]}>
              £{analytics.deliveredRevenue.toFixed(2)}
            </Text>
          </View>

          {/* Cancelled Orders Row */}
          <View style={[styles.tableRow, styles.tableRowDivider]}>
            <View style={[styles.tableCellCol, { flex: 2.2 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <X size={15} color="#DC2626" />
                <Text style={[styles.tableCellMainText, { color: '#991B1B' }]}>Cancelled Orders</Text>
              </View>
              <Text style={styles.tableCellSubText}>Rejected or cancelled</Text>
            </View>
            <Text style={[styles.tableCellText, { flex: 1, textAlign: 'center', fontWeight: '800', color: '#DC2626' }]}>
              {analytics.cancelledOrders}
            </Text>
            <View style={[styles.tableCellCol, { flex: 1, alignItems: 'center' }]}>
              <View style={[styles.shareBadge, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                <Text style={[styles.shareBadgeText, { color: '#B91C1C' }]}>
                  {analytics.totalOrders > 0 ? Math.round((analytics.cancelledOrders / analytics.totalOrders) * 100) : 0}%
                </Text>
              </View>
            </View>
            <Text style={[styles.tableCellAmount, { flex: 1.4, textAlign: 'right', color: '#DC2626' }]}>
              {analytics.cancelledRevenue > 0 ? `-£${analytics.cancelledRevenue.toFixed(2)}` : '£0.00'}
            </Text>
          </View>

          {/* Table Total Summary Row */}
          <View style={styles.tableTotalRow}>
            <View style={[styles.tableCellCol, { flex: 2.2 }]}>
              <Text style={styles.tableTotalLabel}>Total Orders</Text>
              <Text style={styles.tableCellSubText}>All recorded activity</Text>
            </View>
            <Text style={[styles.tableTotalVal, { flex: 1, textAlign: 'center' }]}>
              {analytics.totalOrders}
            </Text>
            <View style={[styles.tableCellCol, { flex: 1, alignItems: 'center' }]}>
              <View style={[styles.shareBadge, { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' }]}>
                <Text style={[styles.shareBadgeText, { color: '#0F172A', fontWeight: '800' }]}>100%</Text>
              </View>
            </View>
            <Text style={[styles.tableTotalAmount, { flex: 1.4, textAlign: 'right' }]}>
              £{analytics.totalRevenue.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Compact Lifecycle Pipeline Status Pills */}
        <View style={styles.lifecycleRowContainer}>
          <Text style={styles.lifecycleHeaderLabel}>Live Status Distribution</Text>
          <View style={styles.lifecyclePillsRow}>
            {analytics.statusReport.map((st) => {
              const bg =
                st.id === 'delivered'
                  ? '#ECFDF5'
                  : st.id === 'cancelled'
                    ? '#FEF2F2'
                    : st.id === 'ready_for_pickup'
                      ? '#FFF7ED'
                      : st.id === 'preparing'
                        ? '#EFF6FF'
                        : '#F9FAFB';
              const textCol =
                st.id === 'delivered'
                  ? '#059669'
                  : st.id === 'cancelled'
                    ? '#DC2626'
                    : st.id === 'ready_for_pickup'
                      ? '#EA580C'
                      : st.id === 'preparing'
                        ? '#2563EB'
                        : '#4B5563';
              return (
                <View key={st.id} style={[styles.lifecycleChipCompact, { backgroundColor: bg }]}>
                  <Text style={[styles.lifecycleCountCompact, { color: textCol }]}>{st.count}</Text>
                  <Text style={styles.lifecycleLabelCompact}>{st.name}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      {/* 5. Top Performing Menu Items (Leaderboard) */}
      <View style={styles.cardSection}>
        <View style={styles.leaderboardHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Flame size={18} color="#FF5C39" />
            <Text style={styles.cardSectionTitle}>Top Performing Dishes</Text>
          </View>
          {/* <Text style={styles.cardSectionSubSmall}>Ranked by quantity sold</Text> */}
        </View>

        {topDishes.length === 0 ? (
          <View style={styles.emptyDishesBox}>
            <Award size={24} color="#CBD5E1" />
            <Text style={styles.emptyDishesText}>No item performance data available for this timeframe.</Text>
          </View>
        ) : (
          <View style={styles.dishList}>
            {topDishes.map((dish, idx) => {
              const rankColor = idx === 0 ? '#F59E0B' : idx === 1 ? '#94A3B8' : idx === 2 ? '#B45309' : '#64748B';
              const fillPct = Math.round((dish.totalQuantitySold / maxDishQty) * 100);
              return (
                <View key={dish.itemName + idx} style={styles.dishRow}>
                  <View style={[styles.rankCircle, { backgroundColor: rankColor + '20' }]}>
                    <Text style={[styles.rankText, { color: rankColor }]}>#{idx + 1}</Text>
                  </View>

                  <View style={{ flex: 1, marginHorizontal: 10 }}>
                    <View style={styles.dishNameRow}>
                      <Text style={styles.dishName} numberOfLines={1}>
                        {dish.itemName}
                      </Text>
                      <Text style={styles.dishRev}>
                        {dish.totalRevenue > 0 ? `£${dish.totalRevenue.toFixed(2)}` : ''}
                      </Text>
                    </View>
                    <View style={styles.dishBarTrack}>
                      <View style={[styles.dishBarFill, { width: `${fillPct}%`, backgroundColor: rankColor }]} />
                    </View>
                  </View>

                  <View style={styles.dishQtyBadge}>
                    <Text style={styles.dishQtyText}>{dish.totalQuantitySold} sold</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* 6. Quick Action to Live Orders Board */}
      {/* {onNavigateOrders ? (
        <TouchableOpacity style={styles.ordersLinkBanner} onPress={onNavigateOrders} activeOpacity={0.85}>
          <View style={styles.ordersLinkLeft}>
            <View style={styles.ordersLinkIconBox}>
              <ShoppingBag size={18} color="#FFFFFF" />
            </View>
            <View>
              <Text style={styles.ordersLinkTitle}>Live Operations Board</Text>
              <Text style={styles.ordersLinkSub}>Manage incoming kitchen & delivery orders</Text>
            </View>
          </View>
          <ChevronRight size={20} color="#FF5C39" />
        </TouchableOpacity>
      ) : null} */}
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
                <Text style={styles.dateModalTitle}>Select Date Range</Text>
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
            <Text style={styles.modalSectionLabel}>Quick Presets</Text>
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
                <Text style={styles.applyBtnText}>Apply Range</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  timeframePillCustom: {
    flexDirection: 'row',
    alignItems: 'center',
  },
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
    borderRadius: 20,
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
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
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
    color: '#166534',
  },
  rangeSummaryDates: {
    fontSize: 12,
    fontWeight: '800',
    color: '#15803D',
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
  container: {
    marginTop: 4,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  livePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  exportButton: {
    borderColor: '#FDBA74',
    backgroundColor: '#FFF7ED',
  },

  /* Timeframe Bar */
  timeframeBarContainer: {
    marginBottom: 16,
  },
  timeframeBar: {
    flexDirection: 'row',
    gap: 8,
  },
  timeframePill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  timeframePillActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  timeframePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
  },
  timeframePillTextActive: {
    color: '#FFFFFF',
  },

  /* 6 KPI Cards Grid */
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  kpiCard: {
    borderRadius: 16,
    padding: 13,
    borderWidth: 1,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  kpiCardRevenue: {
    backgroundColor: '#FFFAF5',
    borderColor: '#FED7AA',
  },
  kpiCardVolume: {
    backgroundColor: '#F8FAFF',
    borderColor: '#BFDBFE',
  },
  kpiCardCash: {
    backgroundColor: '#F6FDF9',
    borderColor: '#A7F3D0',
  },
  kpiCardOnline: {
    backgroundColor: '#F8F9FF',
    borderColor: '#C7D2FE',
  },
  kpiCardAov: {
    backgroundColor: '#FAF8FF',
    borderColor: '#DDD6FE',
  },
  kpiCardRate: {
    backgroundColor: '#F4FDFB',
    borderColor: '#99F6E4',
  },
  kpiGlowBackdrop: {
    position: 'absolute',
    bottom: -16,
    right: -16,
    width: 76,
    height: 76,
    borderRadius: 40,
    opacity: 0.55,
    zIndex: 0,
  },
  kpiBgIllustration: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 54,
    height: 54,
    resizeMode: 'contain',
    opacity: 0.85,
    zIndex: 1,
  },
  kpiContentContainer: {
    position: 'relative',
    zIndex: 2,
    paddingRight: 10,
  },
  kpiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  kpiIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiBadge: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  kpiBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 2,
  },
  kpiSub: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
  },

  /* Card Section Standard */
  cardSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.2,
  },
  cardSectionSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  cardSectionTitleSmall: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 10,
  },
  chartHeaderRow: {
    flexDirection: 'column',
    gap: 8,
    marginBottom: 12,
  },
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 2,
    alignSelf: 'flex-start',
  },
  segmentBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
  },
  segmentBtnTextActive: {
    color: '#111827',
  },

  /* Chart Tooltip */
  tooltipBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  tooltipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF5C39',
    marginRight: 6,
  },
  tooltipText: {
    fontSize: 11,
    color: '#475569',
  },

  /* Chart Canvas */
  chartScrollArea: {
    paddingBottom: 4,
  },
  chartCanvas: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 120,
    paddingTop: 16,
    gap: 12,
  },
  barCol: {
    alignItems: 'center',
    width: 42,
    height: '100%',
    justifyContent: 'flex-end',
  },
  barTopVal: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 3,
  },
  barTrack: {
    width: 20,
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 6,
  },
  barDateLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 6,
  },
  barDateLabelSelected: {
    color: '#FF5C39',
    fontWeight: '800',
  },

  /* Dual Bars for Cash vs Online */
  dualBarCol: {
    alignItems: 'center',
    width: 46,
    height: '100%',
    justifyContent: 'flex-end',
  },
  dualBarTrack: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    width: 32,
    flex: 1,
    justifyContent: 'center',
    gap: 3,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    padding: 2,
  },
  dualBar: {
    width: 12,
    borderRadius: 4,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendSquare: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 11,
    color: '#4B5563',
    fontWeight: '600',
  },

  /* Payment Split Progress */
  dualProgressWrapper: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    marginTop: 12,
    marginBottom: 12,
    backgroundColor: '#E5E7EB',
  },
  dualProgressFill: {
    height: '100%',
  },
  paymentDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentDetailBox: {
    flex: 1,
  },
  paymentDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E5E7EB',
    marginHorizontal: 12,
  },
  paymentDetailTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  paymentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  paymentDetailTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4B5563',
  },
  paymentAmountText: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 2,
  },
  paymentCountSub: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 1,
  },

  /* Store Performance & Order Breakdown Table Styles */
  tableHeaderSection: {
    marginBottom: 12,
  },
  analyticsTable: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: 14,
  },
  tableHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tableHeadCell: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  tableGroupHeader: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tableGroupHeaderText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.4,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableRowDivider: {
    borderBottomWidth: 1.5,
    borderBottomColor: '#E2E8F0',
  },
  tableCellCol: {
    justifyContent: 'center',
  },
  tableCellMainText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  tableCellSubText: {
    fontSize: 9.5,
    color: '#94A3B8',
    marginTop: 1,
  },
  tableCellText: {
    fontSize: 12.5,
    color: '#334155',
  },
  tableCellAmount: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  shareBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  shareBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  tableTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  tableTotalLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  tableTotalVal: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  tableTotalAmount: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FF5C39',
  },

  /* Compact Lifecycle Row */
  lifecycleRowContainer: {
    paddingTop: 4,
  },
  lifecycleHeaderLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  lifecyclePillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  lifecycleChipCompact: {
    flexGrow: 1,
    flexBasis: '30%',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  lifecycleCountCompact: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  lifecycleLabelCompact: {
    fontSize: 9,
    fontWeight: '700',
    color: '#6B7280',
    marginTop: 1,
  },

  /* Leaderboard */
  leaderboardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardSectionSubSmall: {
    fontSize: 10.5,
    color: Colors.textMuted,
  },
  emptyDishesBox: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 6,
  },
  emptyDishesText: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  dishList: {
    gap: 10,
  },
  dishRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rankCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 10,
    fontWeight: '800',
  },
  dishNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  dishName: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
    marginRight: 6,
  },
  dishRev: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#059669',
  },
  dishBarTrack: {
    height: 5,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  dishBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  dishQtyBadge: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dishQtyText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },

  /* Quick Orders Banner */
  ordersLinkBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 14,
    padding: 12,
    marginTop: 2,
    marginBottom: 10,
  },
  ordersLinkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ordersLinkIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FF5C39',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ordersLinkTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },
  ordersLinkSub: {
    fontSize: 10.5,
    color: '#6B7280',
    marginTop: 1,
  },
});
