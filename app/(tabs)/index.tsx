import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  DeviceEventEmitter,
  Image,
  useWindowDimensions,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Header } from '../../components/Header';
import { StatCard } from '../../components/StatCard';
import { StatusBadge } from '../../components/StatusBadge';
import { RestaurantAnalytics } from '../../components/RestaurantAnalytics';
import { ErrorState } from '../../components/ErrorState';
import { ApiErrorType } from '../../services/api';
import { Colors } from '../../constants/colors';
import { restaurantService } from '../../services/restaurant.service';
import { orderService } from '../../services/order.service';
import { userService } from '../../services/user.service';
import { restaurantOwnerService } from '../../services/restaurant-owner.service';
import { Restaurant, Order } from '../../types';
import {
  Store,
  Clock,
  ShoppingBag,
  Users,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Utensils,
  Calendar,
  Truck,
  Megaphone,
  Settings,
  Sparkles,
  Plus,
  Check,
  Award,
  ChevronRight,
  ChevronLeft,
  Bike,
  X,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const isSuperAdmin = user?.userType === 'super_admin';

  const { width: windowWidth } = useWindowDimensions();
  const isSmallScreen = windowWidth < 375;
  const isTablet = windowWidth >= 768;

  const [refreshing, setRefreshing] = useState(false);

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalUsersCount, setTotalUsersCount] = useState(0);
  const [deliveryPartnersCount, setDeliveryPartnersCount] = useState(0);
  const [tablesCount, setTablesCount] = useState(0);
  const [activeSlotsCount, setActiveSlotsCount] = useState(0);

  const [ownerStats, setOwnerStats] = useState({
    totalOrders: 0,
    totalDelivered: 0,
    totalCancelled: 0,
    totalIncome: 0,
  });

  const [dashboardError, setDashboardError] = useState<{
    type: ApiErrorType;
    message: string;
    statusCode?: number;
  } | null>(null);

  const loadDashboardData = async () => {
    setRefreshing(true);
    try {
      if (isSuperAdmin) {
        const [restRes, orderRes, userRes] = await Promise.all([
          restaurantService.getRestaurants({ limit: 1000 }),
          orderService.fetchAllOrders(),
          userService.getAllUsers({ limit: 1000 }),
        ]);

        const anySuccess = restRes.success || orderRes.success || userRes.success;
        if (!anySuccess) {
          const errRes: any = !restRes.success ? restRes : !orderRes.success ? orderRes : userRes;
          setDashboardError({
            type: errRes.errorType || 'unknown',
            message: errRes.message || 'Failed to connect to backend server.',
            statusCode: errRes.statusCode,
          });
        } else {
          setDashboardError(null);
        }

        const restList = restRes.data || (restRes as any).restaurants;
        if (restRes.success && restList) {
          setRestaurants(restList);
        }
        const orderList = orderRes.data || (orderRes as any).orders;
        if (orderRes.success && orderList) {
          setOrders(orderList);
        }
        const userList = userRes.data || (userRes as any).users;
        if (userRes.success && userList) {
          setTotalUsersCount(userRes.totalUsers || userList.length);
          const riders = userList.filter(
            (u: any) =>
              u.userType === 'delivery_partner' ||
              u.userType === 'rider' ||
              u.role === 'delivery_partner'
          );
          setDeliveryPartnersCount(riders.length);
        }
      } else {
        const [statsRes, orderRes, tablesRes] = await Promise.all([
          orderService.getRestaurantStats(),
          orderService.fetchAllOrders(),
          restaurantOwnerService.getTables(),
        ]);

        const anySuccess = statsRes.success || orderRes.success || tablesRes.success;
        if (!anySuccess) {
          const errRes: any = !statsRes.success ? statsRes : !orderRes.success ? orderRes : tablesRes;
          setDashboardError({
            type: errRes.errorType || 'unknown',
            message: errRes.message || 'Failed to connect to backend server.',
            statusCode: errRes.statusCode,
          });
        } else {
          setDashboardError(null);
        }

        if (statsRes.success && statsRes.data) {
          const overall = statsRes.data.overall || {};
          setOwnerStats({
            totalOrders: overall.totalOrders || 0,
            totalDelivered: overall.totalDelivered || 0,
            totalCancelled: overall.totalCancelled || 0,
            totalIncome: overall.totalIncome || 0,
          });
        }
        const ownerOrderList = orderRes.data || (orderRes as any).orders;
        if (orderRes.success && ownerOrderList) {
          setOrders(ownerOrderList);
        }
        if (tablesRes.success && tablesRes.data) {
          setTablesCount(tablesRes.data.length);
          const totalSlots = tablesRes.data.reduce(
            (sum: number, t: any) => sum + (t.availableHours?.length || 0),
            0
          );
          setActiveSlotsCount(totalSlots);
        }
      }
    } catch (e: any) {
      console.warn('Failed loading dashboard data:', e);
      setDashboardError({
        type: 'network',
        message: e?.message || 'Cannot reach server.',
      });
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData();

    // Listen for WebSocket updates from the backend
    const sub = DeviceEventEmitter.addListener('websocket_message', (data) => {
      console.log('[Dashboard] WebSocket notification received:', data);
      if (
        data.type === 'RESTAURANT_ORDER_UPDATE' ||
        data.type === 'SUPERADMIN_ORDER_UPDATE'
      ) {
        console.log('[Dashboard] Reloading metrics due to WebSocket event');
        loadDashboardData();
      }
    });

    return () => sub.remove();
  }, [isSuperAdmin]);

  // Compute stats
  const pendingApprovals = restaurants.filter((r) => r.verificationStatus === 'pending').length;
  const activeRestaurants = restaurants.filter((r) => r.isActive).length;
  const totalRevenue = orders
    .filter((o) => o.status === 'delivered')
    .reduce((sum, o) => {
      const amt = o.pricing?.totalAmount ?? o.pricing?.total ?? o.totalAmount ?? o.totalPrice ?? 0;
      return sum + amt;
    }, 0);
  const activeOrdersCount = orders.filter(
    (o) => o.status !== 'delivered' && o.status !== 'cancelled'
  ).length;

  // Super Admin Timeframe State & Filtered Metrics
  const [superTimeframe, setSuperTimeframe] = useState<'today' | '7d' | '30d' | 'all' | 'custom'>('today');
  const [customStartDate, setCustomStartDate] = useState<Date>(() => {
    const d = new Date();
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

  const filteredSuperOrders = useMemo(() => {
    if (superTimeframe === 'all') return orders;
    const now = new Date();
    let startCutoff = 0;
    let endCutoff = Infinity;

    if (superTimeframe === 'today') {
      startCutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
      endCutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
    } else if (superTimeframe === '7d') {
      startCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    } else if (superTimeframe === '30d') {
      startCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    } else if (superTimeframe === 'custom') {
      const s = new Date(customStartDate);
      s.setHours(0, 0, 0, 0);
      startCutoff = s.getTime();

      const e = new Date(customEndDate);
      e.setHours(23, 59, 59, 999);
      endCutoff = e.getTime();
    }

    return orders.filter((o) => {
      const d = new Date(o.createdAt).getTime();
      return !isNaN(d) && d >= startCutoff && d <= endCutoff;
    });
  }, [orders, superTimeframe, customStartDate, customEndDate]);

  const superGmv = useMemo(() => {
    return filteredSuperOrders
      .filter((o) => o.status !== 'cancelled')
      .reduce((sum, o) => {
        const amt = o.pricing?.totalAmount ?? o.pricing?.total ?? o.totalAmount ?? o.totalPrice ?? 0;
        return sum + amt;
      }, 0);
  }, [filteredSuperOrders]);

  const superCommission = useMemo(() => {
    return superGmv * 0.12;
  }, [superGmv]);

  const superOrdersCount = filteredSuperOrders.length;

  const livePreparingCount = useMemo(() => {
    return orders.filter((o) => o.status === 'preparing' || o.status === 'confirmed').length;
  }, [orders]);

  const liveInTransitCount = useMemo(() => {
    return orders.filter((o) => o.status === 'out_for_delivery' || o.status === 'ready_for_pickup').length;
  }, [orders]);

  const liveDeliveredTodayCount = useMemo(() => {
    const now = new Date();
    return orders.filter((o) => {
      if (o.status !== 'delivered') return false;
      const d = new Date(o.updatedAt || o.createdAt);
      return (
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()
      );
    }).length;
  }, [orders]);

  const topRestaurants = useMemo(() => {
    const map = new Map<string, { id: string; name: string; orders: number; gmv: number }>();
    filteredSuperOrders.forEach((o) => {
      if (o.status === 'cancelled') return;
      const restId =
        (o as any).restaurantId?._id ||
        (o as any).restaurantId ||
        (o.restaurant as any)?._id ||
        (o.restaurant as any)?.id ||
        'unknown';
      const restName =
        (o as any).restaurantId?.restaurantName ||
        (o as any).restaurantId?.name ||
        (o.restaurant as any)?.name ||
        (o as any).restaurantName ||
        'Restaurant';
      const amt = o.pricing?.totalAmount ?? o.pricing?.total ?? o.totalAmount ?? o.totalPrice ?? 0;
      const cur = map.get(restId) || { id: restId, name: restName, orders: 0, gmv: 0 };
      cur.orders += 1;
      cur.gmv += amt;
      map.set(restId, cur);
    });
    return Array.from(map.values())
      .sort((a, b) => b.gmv - a.gmv)
      .slice(0, 4);
  }, [filteredSuperOrders]);

  // Selected range label helper
  const selectedRangeLabel = useMemo(() => {
    switch (superTimeframe) {
      case 'today':
        return 'Today';
      case '7d':
        return '7 Days';
      case '30d':
        return '30 Days';
      case 'all':
        return 'All Time';
      case 'custom': {
        const startStr = customStartDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        const endStr = customEndDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        return `${startStr} - ${endStr}`;
      }
      default:
        return 'Selected Range';
    }
  }, [superTimeframe, customStartDate, customEndDate]);

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

  const handleApplyCustomRange = () => {
    if (pickerStartDate) {
      const s = new Date(pickerStartDate);
      s.setHours(0, 0, 0, 0);
      const e = pickerEndDate ? new Date(pickerEndDate) : new Date(pickerStartDate);
      e.setHours(23, 59, 59, 999);
      setCustomStartDate(s);
      setCustomEndDate(e);
      setSuperTimeframe('custom');
    }
    setDateRangeModalVisible(false);
  };

  // Comprehensive table data for ALL restaurants across the selected range
  const restaurantTableData = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        name: string;
        isActive?: boolean;
        totalOrders: number;
        deliveredOrders: number;
        totalIncome: number;
      }
    >();

    // 1. Initialize with all registered restaurants
    restaurants.forEach((r) => {
      const id = r._id || (r as any).id;
      const name = r.restaurantName || (r as any).name || 'Unnamed Store';
      map.set(id, {
        id,
        name,
        isActive: r.isActive,
        totalOrders: 0,
        deliveredOrders: 0,
        totalIncome: 0,
      });
    });

    // 2. Tally metrics from filteredSuperOrders (the active selected range)
    filteredSuperOrders.forEach((o) => {
      const restId =
        (o as any).restaurantId?._id ||
        (o as any).restaurantId ||
        (o.restaurant as any)?._id ||
        (o.restaurant as any)?.id ||
        'unknown';
      const restName =
        (o as any).restaurantId?.restaurantName ||
        (o as any).restaurantId?.name ||
        (o.restaurant as any)?.name ||
        (o as any).restaurantName ||
        'Restaurant';

      let row = map.get(restId);
      if (!row) {
        row = {
          id: restId,
          name: restName,
          isActive: true,
          totalOrders: 0,
          deliveredOrders: 0,
          totalIncome: 0,
        };
        map.set(restId, row);
      }

      row.totalOrders += 1;
      if (o.status === 'delivered') {
        row.deliveredOrders += 1;
        const amt =
          o.pricing?.totalAmount ??
          o.pricing?.total ??
          o.totalAmount ??
          o.totalPrice ??
          0;
        row.totalIncome += amt;
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      if (b.totalIncome !== a.totalIncome) return b.totalIncome - a.totalIncome;
      if (b.totalOrders !== a.totalOrders) return b.totalOrders - a.totalOrders;
      return a.name.localeCompare(b.name);
    });
  }, [restaurants, filteredSuperOrders]);

  const tableTotals = useMemo(() => {
    return restaurantTableData.reduce(
      (acc, r) => {
        acc.totalOrders += r.totalOrders;
        acc.deliveredOrders += r.deliveredOrders;
        acc.totalIncome += r.totalIncome;
        return acc;
      },
      { totalOrders: 0, deliveredOrders: 0, totalIncome: 0 }
    );
  }, [restaurantTableData]);

  const superCardWidth = isTablet
    ? Math.floor((windowWidth - 32 - 3 * 12) / 4)
    : Math.floor((windowWidth - 32 - (isSmallScreen ? 8 : 10)) / 2);
  const superIllustrationSize = isSmallScreen ? 44 : 52;
  const superGlowSize = isSmallScreen ? 60 : 72;

  return (
    <View style={styles.container}>
      <Header
        title="Krifoo Admin"
      // subtitle="Super Admin Management Portal"
      />

      {dashboardError && restaurants.length === 0 && orders.length === 0 ? (
        <ErrorState
          errorType={dashboardError.type}
          message={dashboardError.message}
          statusCode={dashboardError.statusCode}
          onRetry={loadDashboardData}
          isRetrying={refreshing}
        />
      ) : (
        <ScrollView
          style={styles.scrollBody}
          contentContainerStyle={{ paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={loadDashboardData}
              tintColor={Colors.primary}
            />
          }
        >


        {isSuperAdmin ? (
          /* ================= SUPER ADMIN COMMAND CENTER ================= */
          <>
            {/* 1. Action Required Triage Banner */}
            {pendingApprovals > 0 ? (
              <TouchableOpacity
                style={styles.triageBanner}
                onPress={() => router.push('/(tabs)/restaurants')}
                activeOpacity={0.85}
              >
                <View style={styles.triageLeft}>
                  <View style={styles.triageIconBadge}>
                    <AlertTriangle size={18} color="#D97706" />
                  </View>
                  <View style={styles.triageContent}>
                    <Text style={styles.triageTitle}>
                      {pendingApprovals} Restaurant Application{pendingApprovals > 1 ? 's' : ''} Pending
                    </Text>
                    <Text style={styles.triageSub}>Requires Super Admin verification and review</Text>
                  </View>
                </View>
                <View style={styles.triageReviewBtn}>
                  <Text style={styles.triageReviewBtnText}>Review</Text>
                  <ArrowRight size={13} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
            ) : null}

            {/* 2. Super Admin Quick Actions Dock */}
            <View style={styles.quickDockCard}>
              <Text style={styles.quickDockHeaderTitle}>Quick Actions</Text>
              <View style={styles.quickDockRow}>
                <TouchableOpacity
                  style={styles.quickDockItem}
                  onPress={() => router.push('/(tabs)/restaurants')}
                  activeOpacity={0.75}
                >
                  <View style={[styles.quickDockIconCircle, { backgroundColor: '#FFF7ED' }]}>
                    <Plus size={20} color="#EA580C" />
                  </View>
                  <Text style={styles.quickDockLabel} numberOfLines={1}>Add Store</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quickDockItem}
                  onPress={() => router.push('/marketing')}
                  activeOpacity={0.75}
                >
                  <View style={[styles.quickDockIconCircle, { backgroundColor: '#EFF6FF' }]}>
                    <Megaphone size={19} color="#2563EB" />
                  </View>
                  <Text style={styles.quickDockLabel} numberOfLines={1}>Broadcast</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quickDockItem}
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/users',
                      params: { role: 'delivery_partner' },
                    })
                  }
                  activeOpacity={0.75}
                >
                  <View style={[styles.quickDockIconCircle, { backgroundColor: '#F5F3FF' }]}>
                    <Bike size={19} color="#7C3AED" />
                    {deliveryPartnersCount > 0 && (
                      <View style={styles.dockCountBadge}>
                        <Text style={styles.dockCountBadgeText}>{deliveryPartnersCount}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.quickDockLabel} numberOfLines={1}>Riders</Text>
                  {/* {deliveryPartnersCount > 0 && (
                    <Text style={styles.quickDockSubCount}>{deliveryPartnersCount} Partners</Text>
                  )} */}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quickDockItem}
                  onPress={() => router.push('/(tabs)/orders')}
                  activeOpacity={0.75}
                >
                  <View style={[styles.quickDockIconCircle, { backgroundColor: '#ECFDF5' }]}>
                    <ShoppingBag size={19} color="#059669" />
                  </View>
                  <Text style={styles.quickDockLabel} numberOfLines={1}>All Orders</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 5. Live Operations Pulse Pipeline */}
            <View style={styles.livePipelineCard}>
              <View style={styles.livePipelineHeaderRow}>
                <View style={styles.livePipelineTitleGroup}>
                  <View style={styles.livePulseDot} />
                  <Text style={styles.livePipelineTitle}>Live Operations Pulse</Text>
                </View>

              </View>

              <View style={styles.pipelineChipsRow}>
                <View style={[styles.pipelineChip, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
                  <Clock size={15} color="#EA580C" />
                  <Text style={[styles.pipelineCount, { color: '#C2410C' }]}>{livePreparingCount}</Text>
                  <Text style={styles.pipelineLabel}>Preparing</Text>
                </View>
                <View style={[styles.pipelineChip, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                  <Truck size={15} color="#2563EB" />
                  <Text style={[styles.pipelineCount, { color: '#1E40AF' }]}>{liveInTransitCount}</Text>
                  <Text style={styles.pipelineLabel}>In Transit</Text>
                </View>
                {/* <TouchableOpacity
                  style={[styles.pipelineChip, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }]}
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/users',
                      params: { role: 'delivery_partner' },
                    })
                  }
                  activeOpacity={0.8}
                >
                  <Bike size={15} color="#7C3AED" />
                  <Text style={[styles.pipelineCount, { color: '#6D28D9' }]}>{deliveryPartnersCount}</Text>
                  <Text style={styles.pipelineLabel}>Riders</Text>
                </TouchableOpacity> */}
                <View style={[styles.pipelineChip, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                  <Check size={15} color="#059669" />
                  <Text style={[styles.pipelineCount, { color: '#065F46' }]}>{liveDeliveredTodayCount}</Text>
                  <Text style={styles.pipelineLabel}>Delivered</Text>
                </View>
              </View>
            </View>


            {/* 3. Timeframe Filter Section */}
            <View style={styles.timeframeSection}>
              <View style={styles.timeframeHeaderRow}>
                <View style={styles.timeframeTitleGroup}>
                  <Calendar size={15} color="#475569" />
                  <Text style={styles.timeframeTitle}>Select Range</Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.superTimeframePill,
                    styles.superTimeframeCustomPill,
                    superTimeframe === 'custom' && styles.superTimeframePillActive,
                  ]}
                  onPress={() => {
                    setPickerStartDate(customStartDate);
                    setPickerEndDate(customEndDate);
                    setCalendarMonth(new Date(customStartDate));
                    setDateRangeModalVisible(true);
                  }}
                  activeOpacity={0.8}
                >
                  <Calendar
                    size={13}
                    color={superTimeframe === 'custom' ? '#FFFFFF' : '#4B5563'}
                    style={{ marginRight: 5 }}
                  />
                  <Text
                    style={[
                      styles.superTimeframePillText,
                      superTimeframe === 'custom' && styles.superTimeframePillTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {superTimeframe === 'custom' ? selectedRangeLabel : 'Custom'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.superTimeframeRow}>
                {(['today', '7d', '30d', 'all'] as const).map((tf) => {
                  const labels = { today: 'Today', '7d': '7 Days', '30d': '30 Days', all: 'All Time' };
                  const isSelected = superTimeframe === tf;
                  return (
                    <TouchableOpacity
                      key={tf}
                      style={[
                        styles.superTimeframePill,
                        styles.superTimeframeQuickPill,
                        isSelected && styles.superTimeframePillActive,
                      ]}
                      onPress={() => setSuperTimeframe(tf)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.superTimeframePillText, isSelected && styles.superTimeframePillTextActive]}>
                        {labels[tf]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* 4. Super Admin Executive 3D KPI Grid */}
            <View style={[styles.kpiGrid, isSmallScreen && { gap: 8 }]}>
              {/* Card 1: Platform Net Commission */}
              <View style={[styles.kpiCard, styles.kpiCardCash, { width: superCardWidth }, isSmallScreen && { padding: 10 }]}>
                <View
                  style={[
                    styles.kpiGlowBackdrop,
                    { backgroundColor: '#D1FAE5', width: superGlowSize, height: superGlowSize, borderRadius: superGlowSize / 2 },
                  ]}
                  pointerEvents="none"
                />
                <Image
                  source={require('../../assets/kpi-gross-sales.png')}
                  style={[styles.kpiBgIllustration, { width: superIllustrationSize, height: superIllustrationSize }]}
                />
                <View style={styles.kpiContentContainer}>
                  <View style={styles.kpiTopRow}>
                    <View style={[styles.kpiIconBox, { backgroundColor: '#ECFDF5' }]}>
                      <TrendingUp size={isSmallScreen ? 15 : 17} color="#059669" />
                    </View>
                    <View style={[styles.kpiBadge, { backgroundColor: '#D1FAE5' }]}>
                      <Text style={[styles.kpiBadgeText, { color: '#065F46' }]}>PLATFORM</Text>
                    </View>
                  </View>
                  <Text
                    style={[styles.kpiValue, isSmallScreen && { fontSize: 14 }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    £{superCommission.toFixed(2)}
                  </Text>
                  <Text style={styles.kpiLabel} numberOfLines={1}>Platform Net Rev</Text>
                  <Text style={styles.kpiSub} numberOfLines={1} ellipsizeMode="tail">
                    Est. 12% take-rate
                  </Text>
                </View>
              </View>

              {/* Card 2: Platform GMV */}
              <View style={[styles.kpiCard, styles.kpiCardRevenue, { width: superCardWidth }, isSmallScreen && { padding: 10 }]}>
                <View
                  style={[
                    styles.kpiGlowBackdrop,
                    { backgroundColor: '#FFEDD5', width: superGlowSize, height: superGlowSize, borderRadius: superGlowSize / 2 },
                  ]}
                  pointerEvents="none"
                />
                <Image
                  source={require('../../assets/kpi-online-card.png')}
                  style={[styles.kpiBgIllustration, { width: superIllustrationSize, height: superIllustrationSize }]}
                />
                <View style={styles.kpiContentContainer}>
                  <View style={styles.kpiTopRow}>
                    <View style={[styles.kpiIconBox, { backgroundColor: '#FFF7ED' }]}>
                      <ShoppingBag size={isSmallScreen ? 15 : 17} color="#EA580C" />
                    </View>
                    <View style={[styles.kpiBadge, { backgroundColor: '#FFEDD5' }]}>
                      <Text style={[styles.kpiBadgeText, { color: '#C2410C' }]}>GMV</Text>
                    </View>
                  </View>
                  <Text
                    style={[styles.kpiValue, isSmallScreen && { fontSize: 14 }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    £{superGmv.toFixed(2)}
                  </Text>
                  <Text style={styles.kpiLabel} numberOfLines={1}>Platform GMV</Text>
                  <Text style={styles.kpiSub} numberOfLines={1} ellipsizeMode="tail">
                    Gross order sales
                  </Text>
                </View>
              </View>

              {/* Card 3: Active Stores */}
              <View style={[styles.kpiCard, styles.kpiCardVolume, { width: superCardWidth }, isSmallScreen && { padding: 10 }]}>
                <View
                  style={[
                    styles.kpiGlowBackdrop,
                    { backgroundColor: '#DBEAFE', width: superGlowSize, height: superGlowSize, borderRadius: superGlowSize / 2 },
                  ]}
                  pointerEvents="none"
                />
                <Image
                  source={require('../../assets/store.png')}
                  style={[styles.kpiBgIllustration, { width: superIllustrationSize, height: superIllustrationSize }]}
                />
                <View style={styles.kpiContentContainer}>
                  <View style={styles.kpiTopRow}>
                    <View style={[styles.kpiIconBox, { backgroundColor: '#EFF6FF' }]}>
                      <Store size={isSmallScreen ? 15 : 17} color="#2563EB" />
                    </View>
                    <View style={[styles.kpiBadge, { backgroundColor: '#DBEAFE' }]}>
                      <Text style={[styles.kpiBadgeText, { color: '#1E40AF' }]}>STORES</Text>
                    </View>
                  </View>
                  <Text
                    style={[styles.kpiValue, isSmallScreen && { fontSize: 14 }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {activeRestaurants} / {restaurants.length}
                  </Text>
                  <Text style={styles.kpiLabel} numberOfLines={1}>Active Stores</Text>
                  <Text style={styles.kpiSub} numberOfLines={1} ellipsizeMode="tail">
                    {pendingApprovals > 0 ? `${pendingApprovals} pending review` : 'All verified stores'}
                  </Text>
                </View>
              </View>

              {/* Card 4: Total Orders */}
              <View style={[styles.kpiCard, styles.kpiCardAov, { width: superCardWidth }, isSmallScreen && { padding: 10 }]}>
                <View
                  style={[
                    styles.kpiGlowBackdrop,
                    { backgroundColor: '#EDE9FE', width: superGlowSize, height: superGlowSize, borderRadius: superGlowSize / 2 },
                  ]}
                  pointerEvents="none"
                />
                <Image
                  source={require('../../assets/kpi-total-orders.png')}
                  style={[styles.kpiBgIllustration, { width: superIllustrationSize, height: superIllustrationSize }]}
                />
                <View style={styles.kpiContentContainer}>
                  <View style={styles.kpiTopRow}>
                    <View style={[styles.kpiIconBox, { backgroundColor: '#F5F3FF' }]}>
                      <Clock size={isSmallScreen ? 15 : 17} color="#7C3AED" />
                    </View>
                    <View style={[styles.kpiBadge, { backgroundColor: '#EDE9FE' }]}>
                      <Text style={[styles.kpiBadgeText, { color: '#6D28D9' }]}>VOLUME</Text>
                    </View>
                  </View>
                  <Text
                    style={[styles.kpiValue, isSmallScreen && { fontSize: 14 }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
                    {superOrdersCount}
                  </Text>
                  <Text style={styles.kpiLabel} numberOfLines={1}>Total Orders</Text>
                  <Text style={styles.kpiSub} numberOfLines={1} ellipsizeMode="tail">
                    {filteredSuperOrders.filter(o => o.status === 'delivered').length} fulfilled
                  </Text>
                </View>
              </View>
            </View>


            {/* 6. All Stores Selected Range Performance Table */}
            <View style={styles.topRestCard}>
              <View style={styles.topRestHeaderRow}>
                <View style={styles.sectionTitleGroup}>
                  <Award size={18} color="#EA580C" />
                  <Text style={styles.topRestTitle}>Store Performance</Text>
                  <TouchableOpacity
                    style={styles.rangePillBadge}
                    onPress={() => {
                      setPickerStartDate(customStartDate);
                      setPickerEndDate(customEndDate);
                      setCalendarMonth(new Date(customStartDate));
                      setDateRangeModalVisible(true);
                    }}
                    activeOpacity={0.7}
                  >
                    {/* <Calendar size={11} color="#EA580C" style={{ marginRight: 3 }} /> */}
                    <Text style={styles.rangePillBadgeText}>{selectedRangeLabel}</Text>
                  </TouchableOpacity>
                </View>

              </View>

              <View style={styles.storeTableCard}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.tableInner}>
                    {/* Table Header */}
                    <View style={styles.tableHeaderRow}>
                      <Text style={[styles.tableHeaderCell, styles.colRestaurant, { textAlign: 'left' }]}>RESTAURANT</Text>
                      <Text style={[styles.tableHeaderCell, styles.colOrders]}>TOTAL ORDERS</Text>
                      <Text style={[styles.tableHeaderCell, styles.colDelivered]}>DELIVERED</Text>
                      <Text style={[styles.tableHeaderCell, styles.colIncome]}>TOTAL INCOME</Text>
                    </View>

                    {/* Table Body */}
                    {restaurantTableData.length === 0 ? (
                      <View style={styles.tableEmptyBox}>
                        <ShoppingBag size={24} color={Colors.cardBorder} />
                        <Text style={styles.tableEmptyText}>No restaurant data available</Text>
                      </View>
                    ) : (
                      restaurantTableData.map((row, idx) => (
                        <TouchableOpacity
                          key={row.id + idx}
                          style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}
                          activeOpacity={0.7}
                          onPress={() => {
                            if (row.id && row.id !== 'unknown') {
                              router.push({
                                pathname: '/restaurant-details',
                                params: { restaurantId: row.id },
                              });
                            }
                          }}
                        >
                          {/* Restaurant Name & Status */}
                          <View style={[styles.tableCell, styles.colRestaurant, styles.cellRestaurantGroup]}>
                            <View
                              style={[
                                styles.statusDot,
                                { backgroundColor: row.isActive !== false ? '#10B981' : '#9CA3AF' },
                              ]}
                            />
                            <Text style={styles.restaurantCellName} numberOfLines={1}>
                              {row.name}
                            </Text>
                          </View>

                          {/* Total Orders */}
                          <View style={[styles.tableCell, styles.colOrders]}>
                            <View style={styles.orderBadgePill}>
                              <Text style={styles.orderBadgePillText}>{row.totalOrders}</Text>
                            </View>
                          </View>

                          {/* Delivered */}
                          <View style={[styles.tableCell, styles.colDelivered]}>
                            <View
                              style={[
                                styles.deliveredBadgePill,
                                row.deliveredOrders > 0 && styles.deliveredBadgePillActive,
                              ]}
                            >

                              <Text
                                style={[
                                  styles.deliveredBadgePillText,
                                  row.deliveredOrders > 0 && styles.deliveredBadgePillTextActive,
                                ]}
                              >
                                {row.deliveredOrders}
                              </Text>
                            </View>
                          </View>

                          {/* Total Income */}
                          <View style={[styles.tableCell, styles.colIncome]}>
                            <Text style={styles.incomeCellText}>
                              £{row.totalIncome.toFixed(2)}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))
                    )}

                    {/* Summary Footer Row */}
                    {restaurantTableData.length > 0 && (
                      <View style={styles.tableFooterRow}>
                        <View style={[styles.tableCell, styles.colRestaurant]}>
                          <Text style={styles.tableFooterLabel}>
                            All Stores ({restaurantTableData.length})
                          </Text>
                        </View>
                        <View style={[styles.tableCell, styles.colOrders]}>
                          <Text style={styles.tableFooterValue}>{tableTotals.totalOrders}</Text>
                        </View>
                        <View style={[styles.tableCell, styles.colDelivered]}>
                          <Text style={[styles.tableFooterValue, { color: '#059669' }]}>
                            {tableTotals.deliveredOrders}
                          </Text>
                        </View>
                        <View style={[styles.tableCell, styles.colIncome]}>
                          <Text style={[styles.tableFooterValue, styles.tableFooterIncome]}>
                            £{tableTotals.totalIncome.toFixed(2)}
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                </ScrollView>
              </View>
            </View>
          </>
        ) : (
          /* ================= RESTAURANT OWNER DASHBOARD ================= */
          <>
            {/* Business Control Center Grid */}
            <View style={styles.controlCenterSection}>
                {/* <Text style={styles.sectionHeader}>Manage Store</Text> */}

                <View style={[styles.gridContainer, isSmallScreen && { gap: 8 }]}>
                  <TouchableOpacity
                    style={[styles.gridCard, isSmallScreen && { padding: 11, minHeight: 80 }]}
                    onPress={() => router.push('/bookings')}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.gridCardTextContainer, isSmallScreen && { paddingRight: 32 }]}>
                      <Text style={styles.gridTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                        Reservations
                      </Text>
                      <Text style={styles.gridSub} numberOfLines={2} ellipsizeMode="tail">
                        Bookings feed
                      </Text>
                    </View>
                    <Image
                      source={require('../../assets/reservation.png')}
                      style={[styles.gridIllustration, isSmallScreen && { width: 44, height: 44, bottom: -4, right: -4 }]}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.gridCard, isSmallScreen && { padding: 11, minHeight: 80 }]}
                    onPress={() => router.push('/tables')}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.gridCardTextContainer, isSmallScreen && { paddingRight: 32 }]}>
                      <Text style={styles.gridTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                        Dining Tables
                      </Text>
                      <Text style={styles.gridSub} numberOfLines={2} ellipsizeMode="tail">
                        {tablesCount > 0
                          ? `${tablesCount} table${tablesCount !== 1 ? 's' : ''} • ${activeSlotsCount} slots`
                          : 'Configure & post tables'}
                      </Text>
                    </View>
                    <Image
                      source={require('../../assets/dining-table.png')}
                      style={[styles.gridIllustration, isSmallScreen && { width: 44, height: 44, bottom: -4, right: -4 }]}
                    />
                  </TouchableOpacity>
                </View>

                <View style={[styles.gridContainer, isSmallScreen && { gap: 8 }]}>
                  <TouchableOpacity
                    style={[styles.gridCard, isSmallScreen && { padding: 11, minHeight: 80 }]}
                    onPress={() => router.push('/fleet')}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.gridCardTextContainer, isSmallScreen && { paddingRight: 32 }]}>
                      <Text style={styles.gridTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                        My Fleet
                      </Text>
                      <Text style={styles.gridSub} numberOfLines={2} ellipsizeMode="tail">
                        Connect riders
                      </Text>
                    </View>
                    <Image
                      source={require('../../assets/fleet.png')}
                      style={[styles.gridIllustration, isSmallScreen && { width: 44, height: 44, bottom: -4, right: -4 }]}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.gridCard, isSmallScreen && { padding: 11, minHeight: 80 }]}
                    onPress={() => router.push('/marketing')}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.gridCardTextContainer, isSmallScreen && { paddingRight: 32 }]}>
                      <Text style={styles.gridTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                        Campaigns
                      </Text>
                      <Text style={styles.gridSub} numberOfLines={2} ellipsizeMode="tail">
                        Promo coupons
                      </Text>
                    </View>
                    <Image
                      source={require('../../assets/publicity.png')}
                      style={[styles.gridIllustration, isSmallScreen && { width: 44, height: 44, bottom: -4, right: -4 }]}
                    />
                  </TouchableOpacity>
                </View>
            </View>

              {/* Restaurant Owner Full Analytics Suite */}
              <RestaurantAnalytics
                initialOrders={orders}
                ownerStats={ownerStats}
                restaurantName={user?.restaurantName || (user as any)?.name || 'Restaurant'}
                onNavigateOrders={() => router.push('/(tabs)/orders')}
              />
          </>
        )}

        {/* <View style={styles.singleKpiRow}>
          <StatCard
            title="Total Platform Users"
            value={totalUsersCount}
            subtitle="Customers & Delivery Partners"
            icon={<Users size={18} color="#38BDF8" />}
            accentColor="#38BDF8"
            onPress={() => router.push('/(tabs)/users')}
          />
        </View> */}

        {/* Recent Orders Section (Restaurant Owner Only) */}
        {!isSuperAdmin && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeader}>Recent Orders</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/orders')}>
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>

            {orders.length === 0 ? (
              <View style={styles.emptyRecentBox}>
                <ShoppingBag size={28} color={Colors.cardBorder} />
                <Text style={styles.emptyRecentText}>No recent orders available</Text>
              </View>
            ) : (
              <View style={styles.recentOrdersList}>
                  {orders.slice(0, 5).map((order) => {
                    const restName =
                      typeof order.restaurantId === 'object'
                        ? order.restaurantId?.restaurantName || 'Restaurant'
                        : 'Restaurant';

                    const custName =
                      typeof order.customerId === 'object'
                        ? order.customerId?.fullName || order.customerDetails?.name || 'Customer'
                        : order.customerDetails?.name || 'Customer';

                    const totalAmt =
                      order.pricing?.totalAmount ??
                      order.pricing?.total ??
                      order.totalAmount ??
                      order.totalPrice ??
                      (order.orderedItems || []).reduce(
                        (acc, item) =>
                          acc + (item.price || (item as any).basePrice || 0) * (item.quantity || 1),
                        0
                      );

                    return (
                      <TouchableOpacity
                        key={order._id}
                        style={styles.recentOrderCard}
                        activeOpacity={0.7}
                        onPress={() =>
                          router.push({
                            pathname: '/order-details',
                            params: { orderId: order._id },
                          })
                        }
                      >
                        <View style={styles.recentOrderTop}>
                          <View style={styles.recentOrderInfo}>
                            <Text style={styles.recentOrderId}>
                              #{order.orderNumber || order._id?.substring(0, 8)}
                            </Text>
                            <Text style={styles.recentOrderSub} numberOfLines={1}>
                              {restName} • {custName}
                            </Text>
                          </View>
                          <StatusBadge status={order.status} type="order" />
                        </View>

                        <View style={styles.recentOrderBottom}>
                          <Text style={styles.recentOrderItems} numberOfLines={1}>
                            {(order.orderedItems || [])
                              .map((i) => `${i.name || (i as any).itemName} x${i.quantity}`)
                              .join(', ')}
                          </Text>
                          <Text style={styles.recentOrderPrice}>£{totalAmt.toFixed(2)}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
              </View>
            )}
          </View>
        )}
      </ScrollView>
      )}

      {/* Date Range Selector Modal */}
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
                <Calendar size={18} color="#EA580C" />
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
                        : 'Pick end date'
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
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollBody: {
    padding: 16,
  },
  welcomeSection: {
    marginBottom: 20,
    marginTop: 4,
  },
  welcomeTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.6,
  },
  welcomeSubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
    fontWeight: '500',
  },
  warningBanner: {
    backgroundColor: '#FFFBEB',
    borderLeftWidth: 4,
    borderLeftColor: Colors.warning,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FDE68A', // soft yellow outline
  },
  warningLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  warningTextGroup: {
    marginLeft: 12,
    flex: 1,
  },
  warningTitle: {
    color: '#B45309',
    fontSize: 14,
    fontWeight: '700',
  },
  warningSub: {
    color: '#D97706',
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  section: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  sectionHeader: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginTop: 8,
    marginBottom: 12,
  },
  seeAllText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  emptyRecentBox: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyRecentText: {
    color: Colors.textSubtle,
    fontSize: 13,
    marginTop: 8,
  },
  recentOrdersList: {
    gap: 10,
    marginBottom: 16,
  },
  recentOrderCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderColor: '#EEEEEE',
    borderWidth: 1,
    padding: 14,
  },
  recentOrderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recentOrderInfo: {
    flex: 1,
    marginRight: 8,
  },
  recentOrderId: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  recentOrderSub: {
    color: Colors.textSubtle,
    fontSize: 12,
    marginTop: 2,
  },
  recentOrderBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  recentOrderItems: {
    color: Colors.textMuted,
    fontSize: 12,
    flex: 1,
    marginRight: 8,
  },
  recentOrderPrice: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  /* Super Admin Triage Banner */
  triageBanner: {
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    borderWidth: 1.2,
    borderColor: '#FDE68A',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  triageLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  triageIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  triageContent: {
    flex: 1,
  },
  triageTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#92400E',
  },
  triageSub: {
    fontSize: 10.5,
    color: '#B45309',
    marginTop: 1,
    fontWeight: '600',
  },
  triageReviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D97706',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  triageReviewBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },

  /* Super Admin Quick Actions Dock */
  quickDockCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  quickDockHeaderTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.2,
    marginBottom: 12,
  },
  quickDockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quickDockItem: {
    alignItems: 'center',
    flex: 1,
  },
  quickDockIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  quickDockLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text,
  },
  dockCountBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#7C3AED',
    borderRadius: 9,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  dockCountBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  quickDockSubCount: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#7C3AED',
    marginTop: 1,
  },

  /* Super Admin Timeframe Filter Section */
  timeframeSection: {
    marginBottom: 14,
  },
  timeframeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  timeframeTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeframeTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: -0.2,
  },
  superTimeframeRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  superTimeframeQuickPill: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 7,
  },
  superTimeframePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  superTimeframePillActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  superTimeframePillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#4B5563',
  },
  superTimeframePillTextActive: {
    color: '#FFFFFF',
  },
  superTimeframeCustomPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },

  /* Super Admin 3D Executive KPI Ribbon */
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  kpiCard: {
    borderRadius: 16,
    padding: 12,
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
  kpiCardAov: {
    backgroundColor: '#FAF8FF',
    borderColor: '#DDD6FE',
  },
  kpiGlowBackdrop: {
    position: 'absolute',
    bottom: -16,
    right: -16,
    width: 72,
    height: 72,
    borderRadius: 36,
    opacity: 0.55,
    zIndex: 0,
  },
  kpiBgIllustration: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 52,
    height: 52,
    resizeMode: 'contain',
    opacity: 0.85,
    zIndex: 1,
  },
  kpiContentContainer: {
    position: 'relative',
    zIndex: 2,
    paddingRight: 8,
  },
  kpiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  kpiIconBox: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  kpiBadgeText: {
    fontSize: 8.5,
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
    fontSize: 11.5,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 2,
  },
  kpiSub: {
    fontSize: 9.5,
    color: Colors.textMuted,
    marginTop: 2,
  },

  /* Live Operations Pulse Pipeline */
  livePipelineCard: {
    backgroundColor: '#FFFFFF',

    marginBottom: 14,

  },
  livePipelineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  livePipelineTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  livePulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  livePipelineTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.2,
  },
  livePipelineSub: {
    fontSize: 10.5,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  pipelineChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pipelineChip: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  pipelineCount: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 3,
  },
  pipelineLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6B7280',
    marginTop: 1,
  },

  /* Top Performing Restaurants Leaderboard */
  topRestCard: {
    backgroundColor: '#FFFFFF',
    // borderRadius: 16,
    // padding: 14,
    // borderWidth: 1,
    borderColor: '#EEEEEE',
    marginBottom: 14,
    // shadowColor: '#000',
    // shadowOpacity: 0.03,
    // shadowRadius: 6,
    // shadowOffset: { width: 0, height: 2 },
    // elevation: 1,
  },
  topRestHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  topRestTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topRestTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.2,
  },
  topRestList: {
    gap: 6,
  },
  topRestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  topRestRank: {
    fontSize: 15,
    width: 26,
    textAlign: 'center',
  },
  topRestInfo: {
    flex: 1,
    marginLeft: 6,
  },
  topRestName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: Colors.text,
  },
  topRestSub: {
    fontSize: 10.5,
    color: Colors.textMuted,
    marginTop: 1,
  },
  topRestRevenue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
  },
  singleKpiRow: {
    marginBottom: 12,
  },
  shortcutRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  shortcutCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderColor: '#EEEEEE',
    borderWidth: 1,
    padding: 16,
  },
  shortcutTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 12,
    letterSpacing: -0.2,
  },
  shortcutSub: {
    color: Colors.textSubtle,
    fontSize: 12,
    marginTop: 4,
  },
  // Control center styling
  controlCenterSection: {
    marginBottom: 24,
  },
  gridContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  gridCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    padding: 14,
    minHeight: 88,
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  gridCardTextContainer: {
    flex: 1,
    paddingRight: 36,
    zIndex: 2,
  },
  gridTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.1,
  },
  gridSub: {
    fontSize: 10.5,
    color: Colors.textSubtle,
    fontWeight: '600',
    marginTop: 3,
    lineHeight: 14,
  },
  // Redesign additions: illustrations & hero
  heroCard: {
    backgroundColor: '#FFF0EC', // soft brand orange background matching colors.ts
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FFE0D8',
    overflow: 'hidden',
    shadowColor: '#FF5C39',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  heroTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  heroGreeting: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FF5C39',
    letterSpacing: -0.5,
  },
  heroTagline: {
    fontSize: 12,
    color: '#687076',
    marginTop: 6,
    fontWeight: '600',
    lineHeight: 16,
  },
  heroButton: {
    backgroundColor: '#FF5C39',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 14,
  },
  heroButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  heroImage: {
    width: 84,
    height: 84,
    resizeMode: 'contain',
  },
  cardIllustration: {
    width: 44,
    height: 44,
    resizeMode: 'contain',
    marginBottom: 8,
  },
  gridIllustration: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    width: 52,
    height: 52,
    resizeMode: 'contain',
    opacity: 0.85,
    zIndex: 1,
  },
  kpiIllustration: {
    width: 22,
    height: 22,
    resizeMode: 'contain',
  },
  sectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rangePillBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  rangePillBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1D4ED8',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  viewToggleGroup: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 2,
  },
  viewToggleBtn: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  viewToggleBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  viewToggleBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  viewToggleBtnTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  storeTableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    marginTop: 6,
  },
  tableInner: {
    minWidth: 505,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  tableHeaderCell: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.6,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableRowAlt: {
    backgroundColor: '#FBFBFB',
  },
  tableCell: {
    justifyContent: 'center',
  },
  colRestaurant: {
    width: 170,
    alignItems: 'flex-start',
    justifyContent: 'center',
    textAlign: 'left',
  },
  colOrders: {
    width: 110,
    alignItems: 'center',
    textAlign: 'center',
  },
  colDelivered: {
    width: 105,
    alignItems: 'center',
    textAlign: 'center',
  },
  colIncome: {
    width: 120,
    alignItems: 'flex-end',
    textAlign: 'right',
    paddingRight: 4,
  },
  cellRestaurantGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  restaurantCellName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'left',
    flexShrink: 1,
  },
  orderBadgePill: {
    // backgroundColor: '#F1F5F9',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
    minWidth: 28,
    alignItems: 'center',
  },
  orderBadgePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  deliveredBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    // backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    minWidth: 32,
    justifyContent: 'center',
  },
  deliveredBadgePillActive: {
    backgroundColor: '#ECFDF5',
  },
  deliveredBadgePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  deliveredBadgePillTextActive: {
    color: '#059669',
  },
  incomeCellText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
  },
  tableFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1.5,
    borderTopColor: '#E2E8F0',
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  tableFooterLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'left',
  },
  tableFooterValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  tableFooterIncome: {
    color: '#059669',
    fontSize: 13,
  },
  tableEmptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    gap: 6,
  },
  tableEmptyText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '500',
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
});
