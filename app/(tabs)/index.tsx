import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Header } from '../../components/Header';
import { StatCard } from '../../components/StatCard';
import { StatusBadge } from '../../components/StatusBadge';
import { Colors } from '../../constants/colors';
import { restaurantService } from '../../services/restaurant.service';
import { orderService } from '../../services/order.service';
import { userService } from '../../services/user.service';
import { Restaurant, Order } from '../../types';
import {
  Store,
  Clock,
  ShoppingBag,
  Users,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
} from 'lucide-react-native';

export default function DashboardScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalUsersCount, setTotalUsersCount] = useState(0);

  const loadDashboardData = async () => {
    setRefreshing(true);
    try {
      const [restRes, orderRes, userRes] = await Promise.all([
        restaurantService.getRestaurants(),
        orderService.getAllOrders(),
        userService.getAllUsers(),
      ]);

      if (restRes.success && restRes.data) {
        setRestaurants(restRes.data);
      }
      if (orderRes.success && orderRes.data) {
        setOrders(orderRes.data);
      }
      if (userRes.success && userRes.data) {
        setTotalUsersCount(userRes.data.length);
      }
    } catch (e) {
      console.error('Failed loading dashboard data:', e);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Compute stats
  const pendingApprovals = restaurants.filter((r) => r.verificationStatus === 'pending').length;
  const activeRestaurants = restaurants.filter((r) => r.isActive).length;
  const totalRevenue = orders.reduce((sum, o) => sum + (o.pricing?.total || 0), 0);
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
        {pendingApprovals > 0 ? (
          <TouchableOpacity
            style={styles.warningBanner}
            onPress={() => router.push('/(tabs)/restaurants')}
          >
            <View style={styles.warningLeft}>
              <AlertTriangle size={20} color="#FBBF24" />
              <View style={styles.warningTextGroup}>
                <Text style={styles.warningTitle}>
                  {pendingApprovals} Restaurant Application{pendingApprovals > 1 ? 's' : ''} Pending
                </Text>
                <Text style={styles.warningSub}>Requires Super Admin verification and document review.</Text>
              </View>
            </View>
            <ArrowRight size={18} color="#FBBF24" />
          </TouchableOpacity>
        ) : null}

        {/* Quick Shortcut Buttons */}
        {/* ss<Text style={styles.sectionHeader}>Quick Actions</Text> */}
        <View style={styles.shortcutRow}>
          <TouchableOpacity
            style={styles.shortcutCard}
            onPress={() => router.push('/(tabs)/restaurants')}
          >
            <Store size={22} color={Colors.primary} />
            <Text style={styles.shortcutTitle}>Manage Restaurants</Text>
            {/* <Text style={styles.shortcutSub}>Approvals, verification & active status</Text> */}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.shortcutCard}
            onPress={() => router.push('/(tabs)/orders')}
          >
            <ShoppingBag size={22} color={Colors.info} />
            <Text style={styles.shortcutTitle}>Manage Orders </Text>
            {/* <Text style={styles.shortcutSub}>Cross-restaurant order feed & dispatch</Text> */}
          </TouchableOpacity>
        </View>

        {/* KPI Grid */}
        <Text style={styles.sectionHeader}>Key Metrics</Text>
        <View style={styles.kpiGrid}>
          <StatCard
            title="Total Restaurants"
            value={restaurants.length}
            subtitle={`${activeRestaurants} active`}
            icon={<Store size={18} color={Colors.primary} />}
            accentColor={Colors.primary}
            onPress={() => router.push('/(tabs)/restaurants')}
          />
          <StatCard
            title="Pending Review"
            value={pendingApprovals}
            subtitle="Needs action"
            icon={<Clock size={18} color={Colors.warning} />}
            accentColor={Colors.warning}
            onPress={() => router.push('/(tabs)/restaurants')}
          />
        </View>

        <View style={styles.kpiGrid}>
          <StatCard
            title="All Orders"
            value={orders.length}
            subtitle={`${activeOrdersCount} live / active`}
            icon={<ShoppingBag size={18} color={Colors.info} />}
            accentColor={Colors.info}
            onPress={() => router.push('/(tabs)/orders')}
          />
          <StatCard
            title="Total Volume"
            value={`€${totalRevenue.toFixed(0)}`}
            subtitle="Platform Gross Sales"
            icon={<TrendingUp size={18} color="#C084FC" />}
            accentColor="#C084FC"
            onPress={() => router.push('/(tabs)/orders')}
          />
        </View>

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
              <Text style={styles.seeAllText}>See All ({orders.length})</Text>
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
                      <Text style={styles.recentOrderPrice}>€{totalAmt.toFixed(2)}</Text>
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
  warningBanner: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: Colors.warning,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  warningLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  warningTextGroup: {
    marginLeft: 10,
    flex: 1,
  },
  warningTitle: {
    color: Colors.warning,
    fontSize: 14,
    fontWeight: '700',
  },
  warningSub: {
    color: '#FCD34D',
    fontSize: 12,
    marginTop: 2,
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
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
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
    borderRadius: 12,
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    padding: 12,
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
    marginBottom: 30,
  },
  shortcutCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    padding: 16,
  },
  shortcutTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 10,
  },
  shortcutSub: {
    color: Colors.textSubtle,
    fontSize: 12,
    marginTop: 4,
  },
});
