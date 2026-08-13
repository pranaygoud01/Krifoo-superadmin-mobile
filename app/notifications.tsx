import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Header } from '../components/Header';
import { StatusBadge } from '../components/StatusBadge';
import { Colors } from '../constants/colors';
import { orderService } from '../services/order.service';
import { restaurantService } from '../services/restaurant.service';
import { Order, Restaurant } from '../types';
import {
  Bell,
  ShoppingBag,
  Store,
  CheckCircle2,
  Clock,
  ChevronRight,
  Trash2,
} from 'lucide-react-native';

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  type: 'order' | 'restaurant' | 'system';
  read: boolean;
  orderId?: string;
  restaurantId?: string;
  statusBadge?: string;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotificationsData = async () => {
    try {
      const [orderRes, restRes] = await Promise.all([
        orderService.getAllOrders(),
        restaurantService.getRestaurants(),
      ]);

      const list: NotificationItem[] = [];

      // 1. Pending Restaurants (Requires Action)
      if (restRes.success && restRes.data) {
        const pendingRests = restRes.data.filter((r) => r.verificationStatus === 'pending');
        pendingRests.forEach((r) => {
          list.push({
            id: `rest_${r._id}`,
            title: 'New Restaurant Registration',
            message: `"${r.restaurantName}" submitted details and requires verification & document review.`,
            timestamp: r.createdAt ? new Date(r.createdAt).toLocaleString() : 'Recently',
            type: 'restaurant',
            read: false,
            restaurantId: r._id,
          });
        });
      }

      // 2. Active & Placed Orders (Live Activity)
      if (orderRes.success && orderRes.data) {
        const activeOrders = orderRes.data.slice(0, 15);
        activeOrders.forEach((o) => {
          const restName =
            typeof o.restaurantId === 'object'
              ? o.restaurantId?.restaurantName || 'Restaurant'
              : 'Restaurant';

          const isNew = o.status === 'placed';

          list.push({
            id: `order_${o._id}`,
            title: isNew ? 'New Order Placed' : `Order`,
            message: `Order #${o.orderNumber || o._id.substring(0, 8)} at ${restName} is currently ${o.status.replace(/_/g, ' ')}.`,
            timestamp: o.createdAt ? new Date(o.createdAt).toLocaleString() : 'Recently',
            type: 'order',
            read: o.status === 'delivered' || o.status === 'cancelled',
            orderId: o._id,
            statusBadge: o.status,
          });
        });
      }

      // Sort by newest
      setNotifications(list);
    } catch (e) {
      console.error('Error fetching notification alerts:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchNotificationsData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotificationsData();
  };

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleItemPress = (item: NotificationItem) => {
    // Mark as read
    setNotifications((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, read: true } : n))
    );

    if (item.type === 'order' && item.orderId) {
      router.push({ pathname: '/order-details', params: { orderId: item.orderId } });
    } else if (item.type === 'restaurant') {
      router.push('/(tabs)/restaurants');
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <View style={styles.container}>
      <Header
        title="Notifications"
        showBackButton={true}
        rightElement={
          unreadCount > 0 ? (
            <TouchableOpacity style={styles.markReadBtn} onPress={handleMarkAllRead}>
              <CheckCircle2 size={16} color={Colors.primary} />
              <Text style={styles.markReadText}>Mark all read</Text>
            </TouchableOpacity>
          ) : null
        }
      />

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Fetching admin notifications...</Text>
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.centerBox}>
          <Bell size={48} color={Colors.cardBorder} />
          <Text style={styles.emptyTitle}>No Notifications</Text>
          <Text style={styles.emptySub}>
            You're all caught up! No recent system or order alerts.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, !item.read && styles.unreadCard]}
              activeOpacity={0.8}
              onPress={() => handleItemPress(item)}
            >
              <View style={styles.iconContainer}>
                {item.type === 'restaurant' ? (
                  <View style={[styles.iconBadge, { backgroundColor: Colors.warningLight }]}>
                    <Store size={18} color={Colors.warning} />
                  </View>
                ) : (
                  <View style={[styles.iconBadge, { backgroundColor: Colors.primaryLight }]}>
                    <ShoppingBag size={18} color={Colors.primary} />
                  </View>
                )}
              </View>

              <View style={styles.contentContainer}>
                <View style={styles.cardHeaderRow}>
                  <Text style={[styles.cardTitle, !item.read && styles.unreadTitle]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {!item.read && <View style={styles.unreadDot} />}
                </View>

                <Text style={styles.cardMessage}>{item.message}</Text>

                <View style={styles.cardFooterRow}>
                  <View style={styles.timeGroup}>
                    <Clock size={12} color={Colors.textSubtle} />
                    <Text style={styles.timestamp}>{item.timestamp}</Text>
                  </View>

                  {item.statusBadge ? (
                    <StatusBadge status={item.statusBadge} type="order" />
                  ) : (
                    <ChevronRight size={16} color={Colors.textSubtle} />
                  )}
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: 14,
    marginTop: 12,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
  },
  emptySub: {
    color: Colors.textSubtle,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  markReadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.primaryLight,
  },
  markReadText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  unreadCard: {
    backgroundColor: '#FFFFFF',
    borderColor: Colors.primary,
    borderWidth: 1.5,
  },
  iconContainer: {
    justifyContent: 'flex-start',
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentContainer: {
    flex: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  unreadTitle: {
    fontWeight: '800',
    color: Colors.text,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    marginLeft: 6,
  },
  cardMessage: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  timeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timestamp: {
    color: Colors.textSubtle,
    fontSize: 11,
  },
});
