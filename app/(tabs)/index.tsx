import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  DeviceEventEmitter,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Header } from '../../components/Header';
import { StatCard } from '../../components/StatCard';
import { StatusBadge } from '../../components/StatusBadge';
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
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const isSuperAdmin = user?.userType === 'super_admin';

  const [refreshing, setRefreshing] = useState(false);

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalUsersCount, setTotalUsersCount] = useState(0);
  const [tablesCount, setTablesCount] = useState(0);
  const [activeSlotsCount, setActiveSlotsCount] = useState(0);

  const [ownerStats, setOwnerStats] = useState({
    totalOrders: 0,
    totalDelivered: 0,
    totalCancelled: 0,
    totalIncome: 0,
  });

  const loadDashboardData = async () => {
    setRefreshing(true);
    try {
      if (isSuperAdmin) {
        const [restRes, orderRes, userRes] = await Promise.all([
          restaurantService.getRestaurants({ limit: 1000 }),
          orderService.getAllOrders({ limit: 1000 }),
          userService.getAllUsers({ limit: 1000 }),
        ]);

        const restList = restRes.data || restRes.restaurants;
        if (restRes.success && restList) {
          setRestaurants(restList);
        }
        const orderList = orderRes.data || orderRes.orders;
        if (orderRes.success && orderList) {
          setOrders(orderList);
        }
        const userList = userRes.data || userRes.users;
        if (userRes.success && userList) {
          setTotalUsersCount(userRes.totalUsers || userList.length);
        }
      } else {
        const [statsRes, orderRes, tablesRes] = await Promise.all([
          orderService.getRestaurantStats(),
          orderService.getAllOrders({ limit: 10 }),
          restaurantOwnerService.getTables(),
        ]);

        if (statsRes.success && statsRes.data) {
          const overall = statsRes.data.overall || {};
          setOwnerStats({
            totalOrders: overall.totalOrders || 0,
            totalDelivered: overall.totalDelivered || 0,
            totalCancelled: overall.totalCancelled || 0,
            totalIncome: overall.totalIncome || 0,
          });
        }
        const ownerOrderList = orderRes.data || orderRes.orders;
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
    } catch (e) {
      console.error('Failed loading dashboard data:', e);
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

  return (
    <View style={styles.container}>
      <Header
        title="Krifoo Admin"
      // subtitle="Super Admin Management Portal"
      />

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


        {/* Pending Approvals Warning Banner */}
        {isSuperAdmin && pendingApprovals > 0 ? (
          <TouchableOpacity
            style={styles.warningBanner}
            onPress={() => router.push('/(tabs)/restaurants')}
          >
            <View style={styles.warningLeft}>
              <AlertTriangle size={20} color={Colors.warning} />
              <View style={styles.warningTextGroup}>
                <Text style={styles.warningTitle}>
                  {pendingApprovals} Restaurant Application{pendingApprovals > 1 ? 's' : ''} Pending
                </Text>
                <Text style={styles.warningSub}>Requires Super Admin verification and document review.</Text>
              </View>
            </View>
            <ArrowRight size={18} color="#D97706" />
          </TouchableOpacity>
        ) : null}

        {/* System Control Center Grid (Super Admin Only) */}
        {isSuperAdmin && (
          <View style={styles.controlCenterSection}>
            <Text style={styles.sectionHeader}>System Control Center</Text>

            <View style={styles.gridContainer}>
              <TouchableOpacity
                style={styles.gridCard}
                onPress={() => router.push('/(tabs)/restaurants')}
                activeOpacity={0.7}
              >
                <View style={styles.gridCardTextContainer}>
                  <Text style={styles.gridTitle}>Restaurants</Text>
                  <Text style={styles.gridSub}>
                    {restaurants.length} store{restaurants.length !== 1 ? 's' : ''} ({activeRestaurants} active)
                  </Text>
                </View>
                <Image source={require('../../assets/store.png')} style={styles.gridIllustration} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.gridCard}
                onPress={() => router.push('/(tabs)/orders')}
                activeOpacity={0.7}
              >
                <View style={styles.gridCardTextContainer}>
                  <Text style={styles.gridTitle}>All Orders</Text>
                  <Text style={styles.gridSub}>
                    {orders.length} order{orders.length !== 1 ? 's' : ''} • £{totalRevenue.toFixed(0)}
                  </Text>
                </View>
                <Image source={require('../../assets/food.png')} style={styles.gridIllustration} />
              </TouchableOpacity>
            </View>

            <View style={styles.gridContainer}>
              <TouchableOpacity
                style={styles.gridCard}
                onPress={() => router.push('/(tabs)/users')}
                activeOpacity={0.7}
              >
                <View style={styles.gridCardTextContainer}>
                  <Text style={styles.gridTitle}>Users & Partners</Text>
                  <Text style={styles.gridSub}>{totalUsersCount} accounts</Text>
                </View>
                <Image source={require('../../assets/grocery.png')} style={styles.gridIllustration} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.gridCard}
                onPress={() => router.push('/marketing')}
                activeOpacity={0.7}
              >
                <View style={styles.gridCardTextContainer}>
                  <Text style={styles.gridTitle}>Campaigns</Text>
                  <Text style={styles.gridSub}>Promo coupons</Text>
                </View>
                <Image source={require('../../assets/publicity.png')} style={styles.gridIllustration} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Business Control Center Grid (Restaurant Owner Only) */}
        {!isSuperAdmin && (
          <View style={styles.controlCenterSection}>
            <Text style={styles.sectionHeader}>Business Control Center</Text>

            <View style={styles.gridContainer}>
              <TouchableOpacity
                style={styles.gridCard}
                onPress={() => router.push('/bookings')}
                activeOpacity={0.7}
              >
                <View style={styles.gridCardTextContainer}>
                  <Text style={styles.gridTitle}>Reservations</Text>
                  <Text style={styles.gridSub}>Bookings feed</Text>
                </View>
                <Image source={require('../../assets/preorder.png')} style={styles.gridIllustration} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.gridCard}
                onPress={() => router.push('/tables')}
                activeOpacity={0.7}
              >
                <View style={styles.gridCardTextContainer}>
                  <Text style={styles.gridTitle}>Dining Tables</Text>
                  <Text style={styles.gridSub}>
                    {tablesCount > 0
                       ? `${tablesCount} table${tablesCount !== 1 ? 's' : ''} • ${activeSlotsCount} slots`
                      : 'Configure & post tables'}
                  </Text>
                </View>
                <Image source={require('../../assets/table.png')} style={styles.gridIllustration} />
              </TouchableOpacity>
            </View>

            <View style={styles.gridContainer}>
              <TouchableOpacity
                style={styles.gridCard}
                onPress={() => router.push('/fleet')}
                activeOpacity={0.7}
              >
                <View style={styles.gridCardTextContainer}>
                  <Text style={styles.gridTitle}>My Fleet</Text>
                  <Text style={styles.gridSub}>Connect riders</Text>
                </View>
                <Image source={require('../../assets/grocery.png')} style={styles.gridIllustration} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.gridCard}
                onPress={() => router.push('/marketing')}
                activeOpacity={0.7}
              >
                <View style={styles.gridCardTextContainer}>
                  <Text style={styles.gridTitle}>Campaigns</Text>
                  <Text style={styles.gridSub}>Promo coupons</Text>
                </View>
                <Image source={require('../../assets/publicity.png')} style={styles.gridIllustration} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* KPI Grid */}
        <Text style={styles.sectionHeader}>Key Metrics</Text>
        {isSuperAdmin ? (
          <>
            <View style={styles.kpiGrid}>
              <StatCard
                title="Total Restaurants"
                value={restaurants.length}
                subtitle={`${activeRestaurants} active`}
                icon={<Image source={require('../../assets/restaurant.png')} style={styles.kpiIllustration} />}
                accentColor={Colors.primary}
                onPress={() => router.push('/(tabs)/restaurants')}
              />
              <StatCard
                title="Pending Review"
                value={pendingApprovals}
                subtitle="Needs action"
                icon={<Image source={require('../../assets/preorder.png')} style={styles.kpiIllustration} />}
                accentColor={Colors.warning}
                onPress={() => router.push('/(tabs)/restaurants')}
              />
            </View>

            <View style={styles.kpiGrid}>
              <StatCard
                title="All Orders"
                value={orders.length}
                subtitle={`${orders.filter((o) => o.status === 'placed').length} placed orders`}
                icon={<Image source={require('../../assets/online-order.png')} style={styles.kpiIllustration} />}
                accentColor={Colors.info}
                onPress={() => router.push('/(tabs)/orders')}
              />
              <StatCard
                title="Total Volume"
                value={`£${totalRevenue.toFixed(0)}`}
                subtitle="Platform Gross Sales"
                icon={<Image source={require('../../assets/spoon-and-fork.png')} style={styles.kpiIllustration} />}
                accentColor="#C084FC"
                onPress={() => router.push('/(tabs)/orders')}
              />
            </View>
          </>
        ) : (
          <>
            <View style={styles.kpiGrid}>
              <StatCard
                title="Restaurant Orders"
                value={ownerStats.totalOrders}
                subtitle="All-time orders"
                icon={<Image source={require('../../assets/online-order.png')} style={styles.kpiIllustration} />}
                accentColor={Colors.info}
                onPress={() => router.push('/(tabs)/orders')}
              />
              <StatCard
                title="Total Earnings"
                  value={`£${ownerStats.totalIncome.toFixed(0)}`}
                subtitle="Restaurant Sales"
                icon={<Image source={require('../../assets/spoon-and-fork.png')} style={styles.kpiIllustration} />}
                accentColor="#C084FC"
                onPress={() => router.push('/(tabs)/orders')}
              />
            </View>

            <View style={styles.kpiGrid}>
              <StatCard
                title="Completed Deliveries"
                value={ownerStats.totalDelivered}
                subtitle="Successfully served"
                icon={<Image source={require('../../assets/grocery.png')} style={styles.kpiIllustration} />}
                accentColor={Colors.success}
                onPress={() => router.push('/(tabs)/orders')}
              />
              <StatCard
                  title="Cancelled"
                value={ownerStats.totalCancelled}
                subtitle="Unfulfilled orders"
                icon={<Image source={require('../../assets/tag.png')} style={styles.kpiIllustration} />}
                accentColor={Colors.danger}
                onPress={() => router.push('/(tabs)/orders')}
              />
            </View>
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

        {/* Recent Orders Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionHeader}>Recent Orders</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/orders')}>
              <Text style={styles.seeAllText}>See All </Text>
            </TouchableOpacity>
          </View>

          {orders.length === 0 ? (
            <View style={styles.emptyRecentBox}>
              <ShoppingBag size={28} color={Colors.cardBorder} />
              <Text style={styles.emptyRecentText}>No recent orders available</Text>
            </View>
          ) : (
            <View style={styles.recentOrdersList}>
              {orders.slice(0, 3).map((order) => {
                const restName = typeof order.restaurantId === 'object'
                  ? order.restaurantId?.restaurantName || 'Restaurant'
                  : 'Restaurant';

                const custName = typeof order.customerId === 'object'
                  ? order.customerId?.fullName || order.customerDetails?.name || 'Customer'
                  : order.customerDetails?.name || 'Customer';

                const totalAmt =
                  order.pricing?.totalAmount ??
                  order.pricing?.total ??
                  order.totalAmount ??
                  order.totalPrice ??
                  (order.orderedItems || []).reduce(
                    (acc, item) => acc + (item.price || (item as any).basePrice || 0) * (item.quantity || 1),
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
      </ScrollView>
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
  kpiGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
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
    paddingRight: 40,
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
});
