import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  DeviceEventEmitter,
  useWindowDimensions,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '../../components/Header';
import { StatCard } from '../../components/StatCard';
import { StatusBadge } from '../../components/StatusBadge';
import { RestaurantAnalytics } from '../../components/RestaurantAnalytics';
import { SuperAdminDashboard } from '../../components/admin/SuperAdminDashboard';
import { CreateOrderModal } from '../../components/CreateOrderModal';
import { ErrorState } from '../../components/ErrorState';
import { ApiErrorType } from '../../services/api';
import { Colors } from '../../constants/colors';
import { restaurantService } from '../../services/restaurant.service';
import { orderService } from '../../services/order.service';
import { userService } from '../../services/user.service';
import { restaurantOwnerService } from '../../services/restaurant-owner.service';
import { Restaurant, Order } from '../../types';
import { printThermalReceipt } from '../../services/thermal-print.service';
import {
  Store,
  Clock,
  ShoppingBag,
  Users,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Utensils,
  UtensilsCrossed,
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
  CalendarDays,
  BarChart3,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';

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
  if (
    oType === 'pickup' ||
    oType === 'collection' ||
    notes.includes('pickup') ||
    notes.includes('collection') ||
    notes.includes('self pickup') ||
    addr1.includes('pickup')
  ) {
    return 'pickup';
  }

  const isTakeawayApp =
    oType === 'takeaway' ||
    app.includes('takeaway') ||
    notes.includes('takeaway') ||
    custName.includes('takeaway');

  if (isTakeawayApp) return 'takeaway';
  return 'delivery';
}

interface OrderNextAction {
  nextStatus: string;
  label: string;
  color: string;
  bgColor: string;
  IconComponent: any;
}

function getOrderNextAction(order: Order): OrderNextAction | null {
  const status = (order.status || '').toLowerCase();
  const fulfillment = getOrderFulfillmentType(order);

  // 1. Placed / Pending -> Accept
  if (status === 'placed' || status === 'pending') {
    return {
      nextStatus: 'preparing',
      label: 'Accept',
      color: '#FFFFFF',
      bgColor: '#10B981',
      IconComponent: Check,
    };
  }

  // 2. Confirmed / Preparing
  if (status === 'confirmed' || status === 'preparing') {
    if (fulfillment === 'dine_in') {
      return {
        nextStatus: 'delivered',
        label: 'Ready to Serve',
        color: '#FFFFFF',
        bgColor: '#7C3AED',
        IconComponent: UtensilsCrossed,
      };
    }
    if (fulfillment === 'takeaway' || fulfillment === 'pickup') {
      return {
        nextStatus: 'ready_for_pickup',
        label: fulfillment === 'takeaway' ? 'Ready (Takeaway)' : 'Ready (Pickup)',
        color: '#FFFFFF',
        bgColor: '#FF5C39',
        IconComponent: Check,
      };
    }
    return {
      nextStatus: 'out_for_delivery',
      label: 'Dispatch',
      color: '#FFFFFF',
      bgColor: '#2563EB',
      IconComponent: Bike,
    };
  }

  // 3. Ready for pickup
  if (status === 'ready_for_pickup') {
    return {
      nextStatus: 'delivered',
      label: fulfillment === 'takeaway' ? 'Mark Collected' : 'Mark Delivered',
      color: '#FFFFFF',
      bgColor: '#10B981',
      IconComponent: Check,
    };
  }

  // 4. Out for delivery
  if (status === 'out_for_delivery') {
    return {
      nextStatus: 'delivered',
      label: 'Delivered',
      color: '#FFFFFF',
      bgColor: '#10B981',
      IconComponent: Check,
    };
  }

  return null;
}

const STATUS_PICKER_OPTIONS: { id: string; label: string; color: string }[] = [
  { id: 'placed', label: 'Placed (New Order)', color: '#D97706' },
  { id: 'preparing', label: 'In Kitchen / Preparing', color: '#7C3AED' },
  { id: 'ready_for_pickup', label: 'Ready for Pickup', color: '#EA580C' },
  { id: 'out_for_delivery', label: 'Out for Delivery', color: '#2563EB' },
  { id: 'delivered', label: 'Delivered / Completed', color: '#059669' },
  { id: 'cancelled', label: 'Cancelled', color: '#DC2626' },
];

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

  const [createOrderModalVisible, setCreateOrderModalVisible] = useState(false);
  const [createOrderInitialChannel, setCreateOrderInitialChannel] = useState<'dine_in' | 'takeaway'>('dine_in');

  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [statusPickerOrder, setStatusPickerOrder] = useState<Order | null>(null);

  // Individual Restaurant Analytics Modal & Selection State
  const [selectedAnalyticsRestaurantId, setSelectedAnalyticsRestaurantId] = useState<string | null>(null);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState<boolean>(false);

  const handleUpdateOrderStatus = async (order: Order, newStatus: string) => {
    if (!order?._id) return;
    setUpdatingOrderId(order._id);
    const prevOrders = orders;

    // 1. Optimistic local state update
    setOrders((current) =>
      current.map((o) => (o._id === order._id ? { ...o, status: newStatus as any } : o))
    );

    // 2. Update server
    try {
      const res = await orderService.updateOrderStatus(order._id, newStatus);
      if (res.success) {
        if (res.data) {
          setOrders((current) =>
            current.map((o) => (o._id === order._id ? { ...o, ...res.data } : o))
          );
        }
        // 2. Auto-print only AFTER the server accepted the change (in the background)
        if (newStatus === 'preparing' || newStatus === 'confirmed') {
          (async () => {
            try {
              let orderToPrint: any = res.data ? { ...order, ...res.data } : order;
              if (!orderToPrint?.orderedItems?.length && !orderToPrint?.items?.length) {
                const fullOrderRes = await orderService.getOrderById(order._id);
                if (fullOrderRes.success && fullOrderRes.data) orderToPrint = fullOrderRes.data;
              }
              if (orderToPrint) await printThermalReceipt(orderToPrint, false, undefined, undefined, 'accepted');
            } catch (printErr) {
              console.error('[Dashboard] Auto-print failed:', printErr);
            }
          })();
        }
      } else {
        setOrders(prevOrders);
        Alert.alert('Status Update Failed', res.message || 'Could not update order status.');
      }
    } catch (err: any) {
      setOrders(prevOrders);
      Alert.alert('Error', err?.message || 'Network error updating order status.');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // Live Counts for Order Terminal channels
  const orderTerminalCounts = useMemo(() => {
    let inStore = 0;
    let pickup = 0;
    let delivery = 0;

    orders.forEach((o) => {
      const oType = ((o.orderType || (o as any).deliveryType || '') as string).toLowerCase();
      const notes = typeof o.notes === 'string' ? o.notes.toLowerCase() : '';
      const addr1 = typeof (o.deliveryAddress as any)?.addressLine1 === 'string' ? (o.deliveryAddress as any).addressLine1.toLowerCase() : '';

      if (
        oType === 'dine_in' ||
        oType === 'dinein' ||
        oType === 'eatin' ||
        oType === 'eat_in' ||
        oType === 'takeaway' ||
        (o as any).tableNumber ||
        notes.includes('eat-in') ||
        notes.includes('dine-in') ||
        notes.includes('dine in') ||
        notes.includes('takeaway') ||
        notes.includes('table') ||
        addr1.startsWith('table')
      ) {
        inStore++;
      } else if (
        oType === 'pickup' ||
        oType === 'collection' ||
        notes.includes('pickup') ||
        notes.includes('collection') ||
        notes.includes('self pickup') ||
        addr1.includes('pickup') ||
        addr1.includes('collection')
      ) {
        pickup++;
      } else if (oType === 'delivery') {
        delivery++;
      } else {
        if (o.deliveryAddress) delivery++;
        else pickup++;
      }
    });

    return { inStore, pickup, delivery };
  }, [orders]);

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
      setLastUpdated(new Date());
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

  // Super Admin Timeframe State & Filtered Metrics
  const [superTimeframe, setSuperTimeframe] = useState<'today' | 'yesterday' | '7d' | '30d' | 'month' | 'all' | 'custom'>('today');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
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

  // Selected restaurant for individual performance analytics
  const activeAnalyticsRestaurant = useMemo(() => {
    if (!restaurants || restaurants.length === 0) return null;
    if (selectedAnalyticsRestaurantId) {
      const found = restaurants.find(
        (r) => (r._id || (r as any).id) === selectedAnalyticsRestaurantId
      );
      if (found) return found;
    }
    return restaurants[0];
  }, [restaurants, selectedAnalyticsRestaurantId]);

  // Scoped orders for active analytics restaurant
  const activeAnalyticsOrders = useMemo(() => {
    if (!activeAnalyticsRestaurant) return [];
    const targetId = activeAnalyticsRestaurant._id || (activeAnalyticsRestaurant as any).id;
    return orders.filter((o: any) => {
      const rId =
        o.restaurantId?._id ||
        o.restaurantId?.id ||
        o.restaurantId ||
        (o.restaurant as any)?._id ||
        (o.restaurant as any)?.id;
      return String(rId) === String(targetId);
    });
  }, [activeAnalyticsRestaurant, orders]);

  // Scoped summary stats for active analytics restaurant
  const activeAnalyticsStats = useMemo(() => {
    if (!activeAnalyticsRestaurant) {
      return { totalOrders: 0, totalDelivered: 0, totalCancelled: 0, totalIncome: 0 };
    }
    const totalOrders = activeAnalyticsOrders.length;
    const totalDelivered = activeAnalyticsOrders.filter((o) => o.status === 'delivered').length;
    const totalCancelled = activeAnalyticsOrders.filter((o) => o.status === 'cancelled').length;
    const totalIncome = activeAnalyticsOrders
      .filter((o) => o.status === 'delivered')
      .reduce((sum, o) => {
        const amt = o.pricing?.totalAmount ?? o.pricing?.total ?? o.totalAmount ?? o.totalPrice ?? 0;
        return sum + amt;
      }, 0);
    return { totalOrders, totalDelivered, totalCancelled, totalIncome };
  }, [activeAnalyticsRestaurant, activeAnalyticsOrders]);

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
            contentContainerStyle={[
              styles.scrollContent,
              isTablet && styles.scrollBodyTablet,
              { paddingBottom: isTablet ? 140 : 110 }
            ]}
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
          /* ================= SUPER ADMIN OVERVIEW ================= */
          <SuperAdminDashboard
            orders={orders}
            restaurants={restaurants}
            ridersCount={deliveryPartnersCount}
            preset={superTimeframe === 'all' ? '30d' : superTimeframe}
            onPresetChange={(p) => setSuperTimeframe(p)}
            customRange={{ start: customStartDate, end: customEndDate }}
            onOpenCustomRange={() => {
              setPickerStartDate(customStartDate);
              setPickerEndDate(customEndDate);
              setCalendarMonth(new Date(customStartDate));
              setDateRangeModalVisible(true);
            }}
            onOpenStore={(id) => {
              setSelectedAnalyticsRestaurantId(id);
              setShowAnalyticsModal(true);
            }}
            onNavigate={(route) => {
              if (route === 'orders') router.push('/(tabs)/orders');
              else if (route === 'restaurants') router.push('/(tabs)/restaurants');
              else if (route === 'marketing') router.push('/marketing');
              else router.push({ pathname: '/(tabs)/users', params: { role: 'delivery_partner' } } as any);
            }}
            lastUpdated={lastUpdated}
          />
        ) : (
          /* ================= RESTAURANT OWNER DASHBOARD ================= */
          <>
                  {/* Quick Order Terminal & Channels Section */}
                  <View style={[styles.orderTerminalSection, isTablet && styles.orderTerminalSectionTablet]}>
                    <View style={[styles.orderSectionHeaderRow, isTablet && styles.orderSectionHeaderRowTablet]}>
                      <View style={styles.orderSectionTitleGroup}>
                        {/* <Text style={[styles.orderSectionTitle, isTablet && styles.orderSectionTitleTablet]}>
                          Quick Orders 
                        </Text> */}

                      </View>
                      {/* <TouchableOpacity
                        style={styles.quickNewOrderBtn}
                        onPress={() => {
                          setCreateOrderInitialChannel('dine_in');
                          setCreateOrderModalVisible(true);
                        }}
                        activeOpacity={0.8}
                      >
                        <Plus size={13} color="#FFFFFF" />
                        <Text style={styles.quickNewOrderBtnText}>Create Order</Text>
                      </TouchableOpacity> */}
                    </View>

                    {/* 4 Cards Grid - Responsive: 4 in 1 row on iPad, 2x2 on mobile */}
                    <View style={[styles.orderGridWrapper, isTablet && styles.orderGridWrapperTablet]}>
                      {/* Pair 1: Create Order & Instore Orders */}
                      <View style={[styles.gridContainer, isSmallScreen && { gap: 8 }, isTablet && styles.gridContainerTablet]}>
                        {/* 1. Create Order Card */}
                        <TouchableOpacity
                          style={[styles.gridCard, isSmallScreen && { padding: 11, minHeight: 80 }, isTablet && styles.gridCardTablet, styles.createOrderCardAccent]}
                          onPress={() => {
                            setCreateOrderInitialChannel('dine_in');
                            setCreateOrderModalVisible(true);
                          }}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.gridCardTextContainer, isSmallScreen && { paddingRight: 32 }]}>
                            <View style={styles.orderBadgeWrapper}>
                              <View style={[styles.channelBadge, { backgroundColor: '#FFF0EC', borderColor: '#FED7AA' }]}>
                                <Text style={[styles.channelBadgeText, { color: '#EA580C' }]}>+ POS NEW</Text>
                              </View>
                            </View>
                            <Text style={[styles.gridTitle, isTablet && styles.gridTitleTablet]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                              Create Order
                            </Text>
                            <Text style={[styles.gridSub, isTablet && styles.gridSubTablet]} numberOfLines={2} ellipsizeMode="tail">
                              Instant POS terminal
                            </Text>
                          </View>
                          <View style={[styles.gridIllustrationBadge, { backgroundColor: '#FFF0EC', borderColor: '#FED7AA' }, isTablet && styles.gridIllustrationBadgeTablet]}>
                            <Plus size={isTablet ? 24 : 20} color="#EA580C" />
                            </View>
                        </TouchableOpacity>

                        {/* 2. Instore Orders Card */}
                        <TouchableOpacity
                          style={[styles.gridCard, isSmallScreen && { padding: 11, minHeight: 80 }, isTablet && styles.gridCardTablet]}
                          onPress={() => router.push({ pathname: '/(tabs)/orders', params: { channel: 'dine_in' } })}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.gridCardTextContainer, isSmallScreen && { paddingRight: 32 }]}>
                            <View style={styles.orderBadgeWrapper}>
                              <View style={[styles.channelBadge, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }]}>
                                <Text style={[styles.channelBadgeText, { color: '#7C3AED' }]}>IN-STORE</Text>
                              </View>
                            </View>
                            <Text style={[styles.gridTitle, isTablet && styles.gridTitleTablet]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                              Instore Orders
                            </Text>
                            <Text style={[styles.gridSub, isTablet && styles.gridSubTablet]} numberOfLines={2} ellipsizeMode="tail">
                              {orderTerminalCounts.inStore > 0
                                ? `${orderTerminalCounts.inStore} active • Dine-in`
                                : 'Dine-in service'}
                            </Text>
                          </View>
                          <View style={[styles.gridIllustrationBadge, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }, isTablet && styles.gridIllustrationBadgeTablet]}>
                              <UtensilsCrossed size={isTablet ? 24 : 20} color="#7C3AED" />
                            </View>
                        </TouchableOpacity>
                      </View>

                      {/* Pair 2: Pickup Orders & Delivery Orders */}
                      <View style={[styles.gridContainer, isSmallScreen && { gap: 8 }, isTablet && styles.gridContainerTablet]}>
                        {/* 3. Pickup Orders Card */}
                        <TouchableOpacity
                          style={[styles.gridCard, isSmallScreen && { padding: 11, minHeight: 80 }, isTablet && styles.gridCardTablet]}
                          onPress={() => router.push({ pathname: '/(tabs)/orders', params: { channel: 'pickup' } })}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.gridCardTextContainer, isSmallScreen && { paddingRight: 32 }]}>
                            <View style={styles.orderBadgeWrapper}>
                              <View style={[styles.channelBadge, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
                                <Text style={[styles.channelBadgeText, { color: '#EA580C' }]}>PICKUP</Text>
                              </View>
                            </View>
                            <Text style={[styles.gridTitle, isTablet && styles.gridTitleTablet]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                              Pickup Orders
                            </Text>
                            <Text style={[styles.gridSub, isTablet && styles.gridSubTablet]} numberOfLines={2} ellipsizeMode="tail">
                              {orderTerminalCounts.pickup > 0
                                ? `${orderTerminalCounts.pickup} active • Pickup`
                                : 'Pickup & collection'}
                            </Text>
                          </View>
                          <View style={[styles.gridIllustrationBadge, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }, isTablet && styles.gridIllustrationBadgeTablet]}>
                            <ShoppingBag size={isTablet ? 24 : 20} color="#EA580C" />
                            </View>
                        </TouchableOpacity>

                        {/* 4. Delivery Orders Card */}
                        <TouchableOpacity
                          style={[styles.gridCard, isSmallScreen && { padding: 11, minHeight: 80 }, isTablet && styles.gridCardTablet]}
                          onPress={() => router.push({ pathname: '/(tabs)/orders', params: { channel: 'delivery' } })}
                          activeOpacity={0.7}
                        >
                          <View style={[styles.gridCardTextContainer, isSmallScreen && { paddingRight: 32 }]}>
                            <View style={styles.orderBadgeWrapper}>
                              <View style={[styles.channelBadge, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                                <Text style={[styles.channelBadgeText, { color: '#2563EB' }]}>DELIVERY</Text>
                              </View>
                            </View>
                            <Text style={[styles.gridTitle, isTablet && styles.gridTitleTablet]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                              Delivery Orders
                            </Text>
                            <Text style={[styles.gridSub, isTablet && styles.gridSubTablet]} numberOfLines={2} ellipsizeMode="tail">
                              {orderTerminalCounts.delivery > 0
                                ? `${orderTerminalCounts.delivery} active • Fleet`
                                : 'Direct & fleet'}
                            </Text>
                          </View>
                          <View style={[styles.gridIllustrationBadge, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }, isTablet && styles.gridIllustrationBadgeTablet]}>
                        <Bike size={isTablet ? 24 : 20} color="#2563EB" />
                      </View>
                  </TouchableOpacity>
                </View>
                    </View>
            </View>

                  {/* Quick Action Section Title */}
                  <View style={[styles.quickActionHeaderRow, isTablet && styles.quickActionHeaderRowTablet]}>
                    <Text style={[styles.quickActionSectionTitle, isTablet && styles.quickActionSectionTitleTablet]}>
                      Quick Action
                    </Text>
                  </View>

                  {/* Quick Action Capsule Bar (Bookings, Tables, Fleet, Promo, Analytics) */}
                  <View style={[styles.quickActionBar, isTablet && styles.quickActionBarTablet]}>
                    {/* 1. Bookings */}
                    <TouchableOpacity
                      style={styles.quickActionItem}
                      onPress={() => router.push('/bookings')}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.quickActionCircle, { backgroundColor: '#eeeeee', borderColor: '#cccbc9' }, isTablet && styles.quickActionCircleTablet]}>
                        <CalendarDays size={isTablet ? 26 : 22} color="#807e7d" />
                      </View>
                      <Text style={[styles.quickActionLabel, isTablet && styles.quickActionLabelTablet]} numberOfLines={1}>
                        Bookings
                      </Text>
                    </TouchableOpacity>

                    {/* 2. Tables */}
                    <TouchableOpacity
                      style={styles.quickActionItem}
                      onPress={() => router.push('/tables')}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.quickActionCircle, { backgroundColor: '#eeeeee', borderColor: '#cccbc9' }, isTablet && styles.quickActionCircleTablet]}>
                        {tablesCount > 0 && (
                          <View style={styles.quickActionBadge}>
                            <Text style={styles.quickActionBadgeText}>{tablesCount}</Text>
                          </View>
                        )}
                        <UtensilsCrossed size={isTablet ? 26 : 22} color="#807e7d" />
                      </View>
                      <Text style={[styles.quickActionLabel, isTablet && styles.quickActionLabelTablet]} numberOfLines={1}>
                        Tables
                      </Text>
                    </TouchableOpacity>

                    {/* 3. Fleet */}
                    <TouchableOpacity
                      style={styles.quickActionItem}
                      onPress={() => router.push('/fleet')}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.quickActionCircle, { backgroundColor: '#eeeeee', borderColor: '#cccbc9' }, isTablet && styles.quickActionCircleTablet]}>
                        {deliveryPartnersCount > 0 && (
                          <View style={styles.quickActionBadge}>
                            <Text style={styles.quickActionBadgeText}>{deliveryPartnersCount}</Text>
                          </View>
                        )}
                        <Bike size={isTablet ? 26 : 22} color="#807e7d" />
                      </View>
                      <Text style={[styles.quickActionLabel, isTablet && styles.quickActionLabelTablet]} numberOfLines={1}>
                        Fleet
                      </Text>
                    </TouchableOpacity>

                    {/* 4. Promo */}
                    <TouchableOpacity
                      style={styles.quickActionItem}
                      onPress={() => router.push('/marketing')}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.quickActionCircle, { backgroundColor: '#eeeeee', borderColor: '#cccbc9' }, isTablet && styles.quickActionCircleTablet]}>
                        <Sparkles size={isTablet ? 26 : 22} color="#807e7d" />
                      </View>
                      <Text style={[styles.quickActionLabel, isTablet && styles.quickActionLabelTablet]} numberOfLines={1}>
                        Promo
                      </Text>
                    </TouchableOpacity>

                    {/* 5. Analytics */}
                    <TouchableOpacity
                      style={styles.quickActionItem}
                      onPress={() => router.push('/analytics')}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.quickActionCircle, { backgroundColor: '#eeeeee', borderColor: '#cccbc9' }, isTablet && styles.quickActionCircleTablet]}>
                        <BarChart3 size={isTablet ? 26 : 22} color="#807e7d" />
                      </View>
                      <Text style={[styles.quickActionLabel, isTablet && styles.quickActionLabelTablet]} numberOfLines={1}>
                        Analytics
                      </Text>
                    </TouchableOpacity>
                  </View>
          </>
        )}

  

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
              <View style={[styles.recentOrdersList, isTablet && styles.recentOrdersListTablet]}>
                      {orders.slice(0, 4).map((order) => {
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

                    const nextAction = getOrderNextAction(order);

                    return (
                      <TouchableOpacity
                        key={order._id}
                        style={[styles.recentOrderCard, isTablet && styles.recentOrderCardTablet]}
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
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={styles.recentOrderId}>
                                #{order.orderNumber || order._id?.substring(0, 8)}
                              </Text>
                              <StatusBadge status={order.paymentStatus || 'pending'} type="payment" />
                            </View>
                            <Text style={styles.recentOrderSub} numberOfLines={1}>
                              {restName} • {custName}
                            </Text>
                          </View>

                          {nextAction ? (
                            <TouchableOpacity
                              style={[
                                styles.orderActionBtn,
                                { backgroundColor: nextAction.bgColor },
                                updatingOrderId === order._id && styles.orderActionBtnDisabled,
                              ]}
                              onPress={(e: any) => {
                                e.stopPropagation?.();
                                handleUpdateOrderStatus(order, nextAction.nextStatus);
                              }}
                              onLongPress={(e: any) => {
                                e.stopPropagation?.();
                                setStatusPickerOrder(order);
                              }}
                              activeOpacity={0.8}
                              disabled={updatingOrderId === order._id}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                              {updatingOrderId === order._id ? (
                                <ActivityIndicator size="small" color="#FFFFFF" style={{ transform: [{ scale: 0.75 }] }} />
                              ) : (
                                <>
                                  <nextAction.IconComponent size={12} color="#FFFFFF" strokeWidth={2.8} />
                                  <Text style={styles.orderActionBtnText}>{nextAction.label}</Text>
                                </>
                              )}
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity
                              activeOpacity={0.8}
                              onPress={(e: any) => {
                                e.stopPropagation?.();
                                setStatusPickerOrder(order);
                              }}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                              <StatusBadge status={order.status} type="order" />
                            </TouchableOpacity>
                          )}
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
        statusBarTranslucent={true}
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

      {/* Create Order POS Terminal Modal */}
      <CreateOrderModal
        visible={createOrderModalVisible}
        onClose={() => setCreateOrderModalVisible(false)}
        onOrderCreated={() => {
          loadDashboardData();
        }}
        initialChannel={createOrderInitialChannel}
        restaurantId={user?.restaurantId || user?._id || (user as any)?.id}
        restaurantName={user?.restaurantName || (user as any)?.name || 'Restaurant'}
        restaurantPhone={user?.phoneNumber || (typeof user?.restaurantId === 'object' ? user?.restaurantId?.phoneNumber : undefined)}
      />

      {/* Status Picker Modal */}
      <Modal
        visible={!!statusPickerOrder}
        transparent
        animationType="fade"
        statusBarTranslucent={true}
        onRequestClose={() => setStatusPickerOrder(null)}
      >
        <TouchableOpacity
          style={styles.statusModalOverlay}
          activeOpacity={1}
          onPress={() => setStatusPickerOrder(null)}
        >
          <View
            style={[styles.statusModalCard, isTablet && styles.statusModalCardTablet]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.statusModalHeader}>
              <View>
                <Text style={styles.statusModalTitle}>
                  Update Order #{statusPickerOrder?.orderNumber || statusPickerOrder?._id?.substring(0, 8)}
                </Text>
                <Text style={styles.statusModalSub}>Choose a new status for this order</Text>
              </View>
              <TouchableOpacity
                style={styles.statusModalCloseBtn}
                onPress={() => setStatusPickerOrder(null)}
                activeOpacity={0.7}
              >
                <X size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.statusOptionsList}>
              {STATUS_PICKER_OPTIONS.map((opt) => {
                const isCurrent = statusPickerOrder?.status === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[
                      styles.statusOptionRow,
                      isCurrent && styles.statusOptionRowActive,
                    ]}
                    onPress={() => {
                      if (statusPickerOrder) {
                        const target = statusPickerOrder;
                        setStatusPickerOrder(null);
                        handleUpdateOrderStatus(target, opt.id);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.pickerStatusDot, { backgroundColor: opt.color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.statusOptionText, isCurrent && styles.statusOptionTextActive]}>
                        {opt.label}
                      </Text>
                    </View>
                    {isCurrent && <Check size={16} color="#FF5C39" strokeWidth={2.5} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.statusModalCancelBtn}
              onPress={() => setStatusPickerOrder(null)}
              activeOpacity={0.8}
            >
              <Text style={styles.statusModalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* JSX_ANALYTICS_MODAL_CONTAINER */}
      <Modal
        visible={showAnalyticsModal}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowAnalyticsModal(false)}
      >
        <SafeAreaView style={styles.analyticsModalSafeArea} edges={['top', 'bottom']}>
          {/* Top Modal Header */}
          <View style={[styles.analyticsModalHeader, isTablet && styles.analyticsModalHeaderTablet]}>
            <TouchableOpacity
              style={styles.modalCloseCircle}
              onPress={() => setShowAnalyticsModal(false)}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <X size={20} color="#0F172A" />
            </TouchableOpacity>

            <View style={styles.modalHeaderTitleGroup}>
              <View style={styles.modalHeaderTitleRow}>
                <Text style={styles.modalHeaderTitle} numberOfLines={1}>
                  {activeAnalyticsRestaurant?.restaurantName || (activeAnalyticsRestaurant as any)?.name || 'Restaurant'}
                </Text>
                <View style={styles.modalLiveBadge}>
                  <View style={styles.modalLiveDot} />
                  <Text style={styles.modalLiveText}>Live</Text>
                </View>
              </View>
              <Text style={styles.modalHeaderSub} numberOfLines={1}>
                Performance, Sales Breakdown & Operational Lifecycle
              </Text>
            </View>

            <TouchableOpacity
              style={styles.modalDoneBtn}
              onPress={() => setShowAnalyticsModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalDoneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Restaurant Switcher inside Modal */}
          {restaurants.length > 1 && (
            <View style={styles.modalStoreSwitchBar}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.modalStoreSwitchRibbon}
              >
                {restaurants.map((r) => {
                  const rId = r._id || (r as any).id;
                  const isCur =
                    (activeAnalyticsRestaurant?._id || (activeAnalyticsRestaurant as any)?.id) === rId;
                  return (
                    <TouchableOpacity
                      key={rId}
                      style={[
                        styles.modalStoreSwitchPill,
                        isCur && styles.modalStoreSwitchPillActive,
                      ]}
                      onPress={() => setSelectedAnalyticsRestaurantId(rId)}
                      activeOpacity={0.75}
                    >
                      <View
                        style={[
                          styles.storeStatusDot,
                          { backgroundColor: r.isActive ? '#10B981' : '#94A3B8' },
                        ]}
                      />
                      <Text
                        style={[
                          styles.modalStoreSwitchPillText,
                          isCur && styles.modalStoreSwitchPillTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {r.restaurantName || (r as any).name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Modal Scrollable Body */}
          <ScrollView
            style={styles.analyticsModalBody}
            contentContainerStyle={[
              styles.analyticsModalBodyContent,
              isTablet && styles.analyticsModalBodyContentTablet,
            ]}
            showsVerticalScrollIndicator={false}
          >
            <RestaurantAnalytics
              initialOrders={activeAnalyticsOrders}
              ownerStats={activeAnalyticsStats}
              restaurantName={activeAnalyticsRestaurant?.restaurantName || (activeAnalyticsRestaurant as any)?.name || 'Restaurant'}
              restaurantId={activeAnalyticsRestaurant?._id || (activeAnalyticsRestaurant as any)?.id}
              onNavigateOrders={() => {
                setShowAnalyticsModal(false);
                router.push('/(tabs)/orders');
              }}
              onClose={() => setShowAnalyticsModal(false)}
            />
          </ScrollView>
        </SafeAreaView>
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
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  scrollBodyTablet: {
    maxWidth: 1200,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 28,
    paddingTop: 14,
  },
  controlCenterSectionTablet: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 20,
  },
  gridContainerTablet: {
    flex: 1,
    gap: 14,
    marginBottom: 0,
  },
  gridCardTablet: {
    minHeight: 96,
    padding: 16,
    borderRadius: 18,
  },
  gridTitleTablet: {
    fontSize: 15,
  },
  gridSubTablet: {
    fontSize: 11.5,
    marginTop: 4,
  },
  gridIllustrationTablet: {
    width: 60,
    height: 60,
    bottom: -4,
    right: -4,
  },
  recentOrdersListTablet: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  recentOrderCardTablet: {
    width: '48.8%',
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
  orderActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  orderActionBtnDisabled: {
    opacity: 0.7,
  },
  orderActionBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  statusModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  statusModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  statusModalCardTablet: {
    maxWidth: 440,
  },
  statusModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  statusModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  statusModalSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  statusModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusOptionsList: {
    gap: 8,
    marginBottom: 16,
  },
  statusOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  statusOptionRowActive: {
    backgroundColor: '#FFF0EC',
    borderColor: '#FF5C39',
  },
  pickerStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  statusOptionTextActive: {
    color: '#FF5C39',
    fontWeight: '700',
  },
  statusModalCancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  statusModalCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
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
    width: 76,
    height: 76,
    borderRadius: 40,
    opacity: 0.55,
    zIndex: 0,
  },
  kpiWatermarkBox: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  kpiWatermarkBoxTablet: {
    width: 58,
    height: 58,
    bottom: 6,
    right: 6,
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
  // Order Terminal styling
  orderTerminalSection: {
    marginBottom: 20,
  },
  orderTerminalSectionTablet: {
    marginBottom: 22,
  },
  orderSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 2,
  },
  orderSectionHeaderRowTablet: {
    marginBottom: 12,
  },
  orderSectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  orderSectionTitleTablet: {
    fontSize: 17,
  },
  orderLivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  orderLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  orderLiveText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.3,
  },
  quickNewOrderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FF5C39',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    shadowColor: '#FF5C39',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  quickNewOrderBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
  orderGridWrapper: {
    gap: 0,
  },
  orderGridWrapperTablet: {
    flexDirection: 'row',
    gap: 14,
  },
  orderBadgeWrapper: {
    marginBottom: 4,
  },
  channelBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
  channelBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  createOrderCardAccent: {
    borderColor: '#FED7AA',
    backgroundColor: '#FFFAF8',
  },
  // Quick Action Capsule Bar styling (matching user sketch)
  quickActionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
    marginTop: 2,
  },
  quickActionHeaderRowTablet: {
    marginBottom: 12,
  },
  quickActionSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  quickActionSectionTitleTablet: {
    fontSize: 17,
  },
  quickActionBar: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 13,
    paddingHorizontal: 6,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quickActionBarTablet: {
    paddingVertical: 18,
    paddingHorizontal: 28,
    borderRadius: 28,
    marginBottom: 22,
  },
  quickActionItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  quickActionCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    position: 'relative',
   
    marginBottom: 5,
  },
  quickActionCircleTablet: {
    width: 62,
    height: 62,
    borderRadius: 31,
    marginBottom: 8,
  },
  quickActionIconImg: {
    width: 28,
    height: 28,
  },
  quickActionIconImgTablet: {
    width: 36,
    height: 36,
  },
  quickActionLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  quickActionLabelTablet: {
    fontSize: 12.5,
  },
  quickActionBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#FF5C39',
    borderRadius: 9,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    zIndex: 3,
  },
  quickActionBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  // Control center styling
  controlCenterSection: {
    marginBottom: 20,
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
  gridIllustrationFallback: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridIllustrationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridIllustrationBadgeTablet: {
    width: 44,
    height: 44,
    borderRadius: 12,
    bottom: 10,
    right: 10,
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
  tableInnerTablet: {
    minWidth: '100%',
    width: '100%',
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

  /* Individual Restaurant Analytics Hub Card */
  analyticsHubCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  analyticsHubCardTablet: {
    padding: 22,
    borderRadius: 24,
  },
  analyticsHubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  analyticsHubTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  analyticsIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  analyticsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  analyticsHubTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  analyticsLivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 4,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  analyticsLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4F46E5',
  },
  analyticsLiveText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#4F46E5',
    letterSpacing: 0.4,
  },
  analyticsHubSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  storeCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  storeCountBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
  },
  analyticsStoreRibbonWrapper: {
    marginBottom: 14,
  },
  analyticsStoreRibbon: {
    gap: 8,
    paddingVertical: 2,
  },
  storeSelectorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  storeSelectorChipActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  storeStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  storeSelectorChipText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#475569',
  },
  storeSelectorChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  selectedStorePreviewBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  selectedStoreTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  selectedStoreInfo: {
    flex: 1,
    marginRight: 10,
  },
  selectedStoreName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  selectedStoreSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  storeActiveBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  storeActiveBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  selectedStoreMetricsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  previewMetricPill: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  previewMetricLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  previewMetricValue: {
    fontSize: 14,
    fontWeight: '800',
  },
  openAnalyticsBtn: {
    backgroundColor: '#4F46E5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  openAnalyticsBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  storeLeaderboardSection: {
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  leaderboardHeader: {
    marginBottom: 10,
  },
  leaderboardTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  leaderboardSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  leaderboardList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    overflow: 'hidden',
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
    gap: 10,
  },
  leaderboardRowSelected: {
    backgroundColor: '#F5F3FF',
  },
  leaderboardRankBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaderboardRankText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
  },
  leaderboardStoreInfo: {
    flex: 1,
  },
  leaderboardStoreName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  leaderboardStoreSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  leaderboardRevenueBox: {
    alignItems: 'flex-end',
    marginRight: 4,
  },
  leaderboardRevenueText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
  },
  rowAnalyticsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  rowAnalyticsBtnActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  rowAnalyticsBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#4F46E5',
  },
  rowAnalyticsBtnTextActive: {
    color: '#FFFFFF',
  },

  /* Individual Restaurant Analytics Fullscreen Modal */
  analyticsModalSafeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  analyticsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 12,
  },
  analyticsModalHeaderTablet: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  modalCloseCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderTitleGroup: {
    flex: 1,
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 4,
  },
  modalLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#4F46E5',
  },
  modalLiveText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#4F46E5',
  },
  modalHeaderSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  modalDoneBtn: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  modalDoneBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  modalStoreSwitchBar: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalStoreSwitchRibbon: {
    gap: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  modalStoreSwitchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalStoreSwitchPillActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  modalStoreSwitchPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  modalStoreSwitchPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  analyticsModalBody: {
    flex: 1,
  },
  analyticsModalBodyContent: {
    padding: 16,
    paddingBottom: 40,
  },
  analyticsModalBodyContentTablet: {
    paddingHorizontal: 28,
    paddingVertical: 20,
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
  },
});