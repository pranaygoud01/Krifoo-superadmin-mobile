import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, BarChart3, RefreshCw } from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { useAuth } from '../context/AuthContext';
import { orderService } from '../services/order.service';
import { RestaurantAnalytics } from '../components/RestaurantAnalytics';
import { Order } from '../types';

export default function AnalyticsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const isTablet = windowWidth >= 768;

  const [orders, setOrders] = useState<Order[]>([]);
  const [ownerStats, setOwnerStats] = useState({
    totalOrders: 0,
    totalDelivered: 0,
    totalCancelled: 0,
    totalIncome: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [ordersRes, statsRes] = await Promise.allSettled([
        orderService.fetchAllOrders(),
        orderService.getRestaurantStats(),
      ]);

      if (ordersRes.status === 'fulfilled' && ordersRes.value.success) {
        const orderList = ordersRes.value.data || (ordersRes.value as any).orders || [];
        setOrders(orderList);
      }

      if (statsRes.status === 'fulfilled' && statsRes.value.success && statsRes.value.data) {
        const overall = statsRes.value.data.overall || statsRes.value.data;
        setOwnerStats({
          totalOrders: overall.totalOrders || 0,
          totalDelivered: overall.totalDelivered || 0,
          totalCancelled: overall.totalCancelled || 0,
          totalIncome: overall.totalIncome || 0,
        });
      }
    } catch (err) {
      console.error('[AnalyticsScreen] Load data error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const restaurantName = user?.restaurantName || (user as any)?.name || 'Restaurant';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Top Header Bar */}
      <View style={[styles.headerBar, isTablet && styles.headerBarTablet]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ArrowLeft size={20} color="#0F172A" />
          </TouchableOpacity>
          <View>
            <View style={styles.titleRow}>
              <Text style={[styles.headerTitle, isTablet && styles.headerTitleTablet]}>
                Analytics & Insights
              </Text>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>Live</Text>
              </View>
            </View>
            <Text style={styles.headerSubtitle}>{restaurantName}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={onRefresh}
          disabled={refreshing}
          activeOpacity={0.7}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color="#FF5C39" />
          ) : (
            <RefreshCw size={16} color="#475569" />
          )}
        </TouchableOpacity>
      </View>

      {/* Main Analytics Content */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF5C39" />
          <Text style={styles.loadingText}>Loading performance analytics...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, isTablet && styles.scrollContentTablet]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#FF5C39']}
              tintColor="#FF5C39"
            />
          }
        >
          <RestaurantAnalytics
            initialOrders={orders}
            ownerStats={ownerStats}
            restaurantName={restaurantName}
            onNavigateOrders={() => router.push('/(tabs)/orders')}
          />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerBarTablet: {
    paddingHorizontal: 28,
    paddingVertical: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  headerTitleTablet: {
    fontSize: 20,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 1,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  liveText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#059669',
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 40,
  },
  scrollContentTablet: {
    paddingHorizontal: 28,
    paddingTop: 20,
    paddingBottom: 60,
  },
});
