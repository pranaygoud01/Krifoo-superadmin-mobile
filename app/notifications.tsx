import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Header } from '../components/Header';
import { StatusBadge } from '../components/StatusBadge';
import { Colors } from '../constants/colors';
import { orderService } from '../services/order.service';
import { restaurantService } from '../services/restaurant.service';
import {
  Bell,
  ShoppingBag,
  Store,
  CheckCircle2,
  Clock,
  ChevronRight,
  Search,
  X,
  CheckCheck,
  Bike,
  AlertCircle,
  Sparkles,
  ArrowRight,
  SlidersHorizontal,
} from 'lucide-react-native';
import {
  getReadNotificationIds,
  getNotificationsLastSeenAt,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  setNotificationsSeen,
} from '../services/notification-tracker.service';

export type NotificationCategory = 'all' | 'unread' | 'order' | 'restaurant';

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  rawDate?: string;
  type: 'order' | 'restaurant' | 'system';
  read: boolean;
  orderId?: string;
  orderNumber?: string;
  orderTotal?: number;
  restaurantId?: string;
  restaurantName?: string;
  statusBadge?: string;
  actionLabel?: string;
}

function formatRelativeTime(dateString?: string): string {
  if (!dateString) return 'Recently';
  const date = new Date(dateString);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 172800) {
    const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `Yesterday, ${timeStr}`;
  }

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<NotificationCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchNotificationsData = useCallback(async () => {
    try {
      const [orderRes, restRes, readIds, lastSeenAt] = await Promise.all([
        orderService.fetchAllOrders(),
        restaurantService.getRestaurants({ limit: 1000 }),
        getReadNotificationIds(),
        getNotificationsLastSeenAt(),
      ]);

      const list: NotificationItem[] = [];

      // 1. Pending Restaurant Applications (Critical Action)
      if (restRes.success && Array.isArray(restRes.data)) {
        const pendingRests = restRes.data.filter((r) => r.verificationStatus === 'pending');
        pendingRests.forEach((r) => {
          const id = `rest_${r._id}`;
          const createdAtTime = r.createdAt ? new Date(r.createdAt).getTime() : 0;
          const isRead = readIds.has(id) || (lastSeenAt > 0 && createdAtTime <= lastSeenAt);

          list.push({
            id,
            title: 'New Store Application',
            message: `"${r.restaurantName}" submitted credentials and is waiting for onboarding verification.`,
            timestamp: formatRelativeTime(r.createdAt),
            rawDate: r.createdAt,
            type: 'restaurant',
            read: isRead,
            restaurantId: r._id,
            restaurantName: r.restaurantName,
            statusBadge: 'pending',
            actionLabel: 'Review Credentials',
          });
        });
      }

      // 2. Orders Stream (Live Operational Activity)
      if (orderRes.success && Array.isArray(orderRes.data)) {
        const activeOrders = orderRes.data.slice(0, 30);
        activeOrders.forEach((o) => {
          const restName =
            typeof o.restaurantId === 'object'
              ? o.restaurantId?.restaurantName || 'Restaurant'
              : 'Restaurant';

          const orderNum = o.orderNumber || (o._id ? `#${o._id.substring(o._id.length - 6).toUpperCase()}` : '#00000');
          const isNew = o.status === 'placed';
          const id = `order_${o._id}`;
          const createdAtTime = o.createdAt ? new Date(o.createdAt).getTime() : 0;
          const isTerminal = o.status === 'delivered' || o.status === 'cancelled';
          const isRead = isTerminal || readIds.has(id) || (lastSeenAt > 0 && createdAtTime <= lastSeenAt);

          let dynamicTitle = 'Order Update';
          let dynamicMsg = `Order ${orderNum} at ${restName} is currently ${o.status.replace(/_/g, ' ')}.`;

          if (isNew) {
            dynamicTitle = 'New Order Placed';
            dynamicMsg = `New order ${orderNum} received at ${restName}. Needs kitchen acceptance.`;
          } else if (o.status === 'preparing') {
            dynamicTitle = 'Kitchen Preparing';
            dynamicMsg = `Order ${orderNum} is being cooked and packaged at ${restName}.`;
          } else if (o.status === 'out_for_delivery') {
            dynamicTitle = 'Out For Delivery';
            dynamicMsg = `Rider is delivering order ${orderNum} to customer.`;
          } else if (o.status === 'delivered') {
            dynamicTitle = 'Order Delivered';
            dynamicMsg = `Order ${orderNum} has been successfully completed.`;
          } else if (o.status === 'cancelled') {
            dynamicTitle = 'Order Cancelled';
            dynamicMsg = `Order ${orderNum} was cancelled.`;
          }

          list.push({
            id,
            title: dynamicTitle,
            message: dynamicMsg,
            timestamp: formatRelativeTime(o.createdAt),
            rawDate: o.createdAt,
            type: 'order',
            read: isRead,
            orderId: o._id,
            orderNumber: orderNum,
            orderTotal: o.totalAmount || o.pricing?.total,
            restaurantName: restName,
            statusBadge: o.status,
            actionLabel: 'View Order Details',
          });
        });
      }

      // Sort by newest createdAt timestamp
      list.sort((a, b) => {
        const timeA = a.rawDate ? new Date(a.rawDate).getTime() : 0;
        const timeB = b.rawDate ? new Date(b.rawDate).getTime() : 0;
        return timeB - timeA;
      });

      setNotifications(list);

      // Auto-mark notifications as seen on initial load
      setNotificationsSeen().catch(() => { });
    } catch (e) {
      console.error('[Notifications] Error fetching alerts:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchNotificationsData();
  }, [fetchNotificationsData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchNotificationsData();
  };

  const handleMarkAllRead = async () => {
    const allIds = notifications.map((n) => n.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await markAllNotificationsAsRead(allIds);
  };

  const handleItemPress = async (item: NotificationItem) => {
  // Mark as read in state & persistent storage
    setNotifications((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, read: true } : n))
    );
    await markNotificationAsRead(item.id);

    if (item.type === 'order' && item.orderId) {
      router.push({ pathname: '/order-details', params: { orderId: item.orderId } });
    } else if (item.type === 'restaurant') {
      router.push('/(tabs)/restaurants');
    }
  };

  // Filter & Search Logic
  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      // Category filter
      if (selectedCategory === 'unread' && item.read) return false;
      if (selectedCategory === 'order' && item.type !== 'order') return false;
      if (selectedCategory === 'restaurant' && item.type !== 'restaurant') return false;

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchTitle = item.title.toLowerCase().includes(query);
        const matchMsg = item.message.toLowerCase().includes(query);
        const matchOrderNum = item.orderNumber?.toLowerCase().includes(query);
        const matchRestName = item.restaurantName?.toLowerCase().includes(query);
        return matchTitle || matchMsg || matchOrderNum || matchRestName;
      }

      return true;
    });
  }, [notifications, selectedCategory, searchQuery]);

  // Counts
  const totalCount = notifications.length;
  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);
  const ordersCount = useMemo(() => notifications.filter((n) => n.type === 'order').length, [notifications]);
  const storesCount = useMemo(() => notifications.filter((n) => n.type === 'restaurant').length, [notifications]);

  // Render Icon according to notification type and status
  const renderItemIcon = (item: NotificationItem) => {
    if (item.type === 'restaurant') {
      return (
        <View style={[styles.iconBadge, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
          <Store size={20} color="#EA580C" />
        </View>
      );
    }

    if (item.statusBadge === 'out_for_delivery') {
      return (
        <View style={[styles.iconBadge, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }]}>
          <Bike size={20} color="#7C3AED" />
        </View>
      );
    }

    if (item.statusBadge === 'delivered') {
      return (
        <View style={[styles.iconBadge, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
          <CheckCircle2 size={20} color="#059669" />
        </View>
      );
    }

    if (item.statusBadge === 'cancelled') {
      return (
        <View style={[styles.iconBadge, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
          <AlertCircle size={20} color="#DC2626" />
        </View>
      );
    }

    if (item.statusBadge === 'preparing') {
      return (
        <View style={[styles.iconBadge, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
          <Clock size={20} color="#2563EB" />
        </View>
      );
    }

    // Default 'placed' or new order
    return (
      <View style={[styles.iconBadge, { backgroundColor: '#FFF1EE', borderColor: '#FFD3CA' }]}>
        <ShoppingBag size={20} color="#FF5C39" />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Notification Feed" showBackButton={true} />

      <View style={[styles.contentWrapper, isTablet && styles.contentWrapperTablet]}>
        {/* ========================================================================= */}
        {/* EXECUTIVE SUMMARY HERO BANNER                                             */}
        {/* ========================================================================= */}

        {/* ========================================================================= */}
        {/* SEARCH & QUICK FILTERS                                                    */}
        {/* ========================================================================= */}
        <View style={styles.searchFilterSection}>
          {/* Search Input Bar */}
          <View style={styles.searchBar}>
            <Search size={16} color="#94A3B8" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by Order #, store name or status..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={15} color="#64748B" />
              </TouchableOpacity>
            )}
          </View>

          {/* Filter Category Segment Pills */}
          <View style={styles.categoryPillsRow}>
            <TouchableOpacity
              style={[styles.categoryPill, selectedCategory === 'all' && styles.categoryPillActive]}
              onPress={() => setSelectedCategory('all')}
              activeOpacity={0.7}
            >
              <Text style={[styles.categoryPillText, selectedCategory === 'all' && styles.categoryPillTextActive]}>
                All ({totalCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.categoryPill, selectedCategory === 'unread' && styles.categoryPillActive]}
              onPress={() => setSelectedCategory('unread')}
              activeOpacity={0.7}
            >
              <Text style={[styles.categoryPillText, selectedCategory === 'unread' && styles.categoryPillTextActive]}>
                Unread ({unreadCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.categoryPill, selectedCategory === 'order' && styles.categoryPillActive]}
              onPress={() => setSelectedCategory('order')}
              activeOpacity={0.7}
            >
              <Text style={[styles.categoryPillText, selectedCategory === 'order' && styles.categoryPillTextActive]}>
                Orders ({ordersCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.categoryPill, selectedCategory === 'restaurant' && styles.categoryPillActive]}
              onPress={() => setSelectedCategory('restaurant')}
              activeOpacity={0.7}
            >
              <Text style={[styles.categoryPillText, selectedCategory === 'restaurant' && styles.categoryPillTextActive]}>
                Stores ({storesCount})
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ========================================================================= */}
        {/* NOTIFICATIONS STREAM LIST                                                 */}
        {/* ========================================================================= */}
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Syncing live activity alerts...</Text>
          </View>
        ) : filteredNotifications.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Bell size={32} color="#94A3B8" />
            </View>
            <Text style={styles.emptyTitle}>
              {searchQuery ? 'No Matching Notifications' : 'You’re All Caught Up!'}
            </Text>
            <Text style={styles.emptySub}>
                {searchQuery
                  ? `No notifications found matching "${searchQuery}". Try a different search keyword.`
                  : 'There are no active alerts in this category. New customer orders and store registrations will appear here in real-time.'}
              </Text>
              {searchQuery ? (
                <TouchableOpacity style={styles.emptyResetBtn} onPress={() => setSearchQuery('')}>
                  <Text style={styles.emptyResetBtnText}>Clear Search Filter</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            <FlatList
                data={filteredNotifications}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor={Colors.primary}
                  />
                }
                renderItem={({ item }) => {
                  const isUnread = !item.read;

                  return (
                    <TouchableOpacity
                  style={[
                    styles.notificationCard,
                    isUnread && styles.notificationCardUnread,
                  ]}
                  activeOpacity={0.75}
                  onPress={() => handleItemPress(item)}
                >
                  {/* Left Unread Accent Stripe */}
                  {isUnread && <View style={styles.unreadAccentBar} />}

                  <View style={styles.cardHeaderRow}>
                    {/* Visual Icon Badge */}
                    {renderItemIcon(item)}

                    {/* Title & Metadata Header */}
                    <View style={styles.cardTitleBlock}>
                      <View style={styles.titleWithBadgeRow}>
                        <Text
                          style={[styles.cardTitle, isUnread && styles.cardTitleUnread]}
                          numberOfLines={1}
                        >
                          {item.title}
                        </Text>
                        {isUnread && <View style={styles.unreadPulseDot} />}
                      </View>

                      <View style={styles.cardSubMetaRow}>
                        <Clock size={11} color="#94A3B8" />
                        <Text style={styles.cardTimestamp}>{item.timestamp}</Text>
                        {item.orderTotal !== undefined && item.orderTotal > 0 && (
                          <>
                            <Text style={styles.metaDot}>•</Text>
                            <Text style={styles.cardTotalBadge}>£{Number(item.orderTotal).toFixed(2)}</Text>
                          </>
                        )}
                      </View>
                    </View>

                    {/* Status Badge */}
                    {item.statusBadge && (
                      <View style={styles.badgeWrapper}>
                        <StatusBadge
                          status={item.statusBadge}
                          type={item.type === 'restaurant' ? 'restaurant' : 'order'}
                        />
                      </View>
                    )}
                  </View>

                  {/* Body Message */}
                  <Text style={[styles.cardMessage, isUnread && styles.cardMessageUnread]}>
                    {item.message}
                  </Text>

                  {/* Bottom Action Footer */}
                  <View style={styles.cardActionFooter}>
                    <View style={styles.actionPromptGroup}>
                      <Text style={styles.actionPromptText}>{item.actionLabel || 'View Details'}</Text>
                      <ArrowRight size={13} color="#FF5C39" />
                    </View>
                    <ChevronRight size={16} color="#CBD5E1" />
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  contentWrapper: {
    flex: 1,
    width: '100%',
  },
  contentWrapperTablet: {
    maxWidth: 760,
    alignSelf: 'center',
  },

  /* Summary Hero Card */
  summaryCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  summaryHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  unreadCountPill: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  unreadCountPillText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '700',
  },
  allCaughtUpPill: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  allCaughtUpPillText: {
    color: '#16A34A',
    fontSize: 11,
    fontWeight: '700',
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  markAllBtnText: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '700',
  },
  metricsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  metricItem: {
    alignItems: 'center',
    flex: 1,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  metricLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
    fontWeight: '500',
  },
  metricDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#E2E8F0',
  },

  /* Search & Category Filter Section */
  searchFilterSection: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    gap: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 0,
  },
  categoryPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryPillActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  categoryPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  /* List & Cards */
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 40,
    gap: 10,
  },
  notificationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  notificationCardUnread: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  unreadAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#FF5C39',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 8,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleBlock: {
    flex: 1,
  },
  titleWithBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
  },
  cardTitleUnread: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  unreadPulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#FF5C39',
  },
  cardSubMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  cardTimestamp: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  metaDot: {
    fontSize: 11,
    color: '#CBD5E1',
  },
  cardTotalBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  badgeWrapper: {
    marginLeft: 'auto',
  },
  cardMessage: {
    fontSize: 13,
    lineHeight: 18,
    color: '#64748B',
    marginBottom: 10,
  },
  cardMessageUnread: {
    color: '#1E293B',
    fontWeight: '500',
  },
  cardActionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  actionPromptGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionPromptText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FF5C39',
  },

  /* Empty & Loading States */
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    minHeight: 280,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 56,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    lineHeight: 19,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyResetBtn: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  emptyResetBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
