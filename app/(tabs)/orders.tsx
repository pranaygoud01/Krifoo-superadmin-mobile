import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Header } from '../../components/Header';
import { FilterChip } from '../../components/FilterChip';
import { OrderCard } from '../../components/OrderCard';
import { OrderDetailModal } from '../../components/OrderDetailModal';
import { AssignDeliveryModal } from '../../components/AssignDeliveryModal';
import { Colors } from '../../constants/colors';
import { orderService } from '../../services/order.service';
import { Order } from '../../types';
import { Search, ShoppingBag } from 'lucide-react-native';

export default function OrdersScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<string>('all');

  // Modal states
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [assignModalVisible, setAssignModalVisible] = useState(false);

  const fetchOrders = async () => {
    try {
      const res = await orderService.getAllOrders();
      if (res.success && res.data) {
        setOrders(res.data);
      }
    } catch (e) {
      console.error('Failed fetching orders:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders();
  };

  const filterOptions = [
    { label: 'All Orders', value: 'all', count: orders.length },
    {
      label: 'Placed',
      value: 'placed',
      count: orders.filter((o) => o.status === 'placed').length,
    },
    {
      label: 'Confirmed',
      value: 'confirmed',
      count: orders.filter((o) => o.status === 'confirmed').length,
    },
    {
      label: 'Preparing',
      value: 'preparing',
      count: orders.filter((o) => o.status === 'preparing').length,
    },
    {
      label: 'Out For Delivery',
      value: 'out_for_delivery',
      count: orders.filter((o) => o.status === 'out_for_delivery').length,
    },
    {
      label: 'Delivered',
      value: 'delivered',
      count: orders.filter((o) => o.status === 'delivered').length,
    },
    {
      label: 'Cancelled',
      value: 'cancelled',
      count: orders.filter((o) => o.status === 'cancelled').length,
    },
  ];

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Status filter
      if (selectedFilter !== 'all' && order.status !== selectedFilter) {
        return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const orderIdMatch = order._id?.toLowerCase().includes(q) || order.orderNumber?.toLowerCase().includes(q);
        
        const restName = typeof order.restaurantId === 'object' ? order.restaurantId?.restaurantName : '';
        const restMatch = restName?.toLowerCase().includes(q);
        
        const custName = typeof order.customerId === 'object'
          ? order.customerId?.fullName || order.customerDetails?.name
          : order.customerDetails?.name || '';
        const custMatch = custName?.toLowerCase().includes(q);
        
        return orderIdMatch || restMatch || custMatch;
      }

      return true;
    });
  }, [orders, selectedFilter, searchQuery]);

  const handleAssignConfirm = async (deliveryPartnerId: string) => {
    if (!selectedOrder) return;
    const res = await orderService.assignDeliveryPartner(selectedOrder._id, deliveryPartnerId);
    if (res.success) {
      Alert.alert('Success', 'Delivery partner successfully assigned to order.');
      fetchOrders();
    } else {
      Alert.alert('Error', res.message || 'Failed to assign delivery partner.');
    }
  };

  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    try {
      const res = await orderService.updateOrderStatus(orderId, newStatus);
      if (res.success) {
        Alert.alert('Success', `Order status updated to '${newStatus}'.`);
        // Update local state
        if (selectedOrder && selectedOrder._id === orderId) {
          setSelectedOrder({ ...selectedOrder, status: newStatus });
        }
        fetchOrders();
      } else {
        Alert.alert('Error', res.message || 'Failed to update order status.');
      }
    } catch (e) {
      Alert.alert('Error', 'An unexpected error occurred while updating status.');
    }
  };

  return (
    <View style={styles.container}>
      <Header
        title="Krifoo Admin"
      // subtitle="Super Admin Management Portal"
      />

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Search size={18} color={Colors.textSubtle} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by Order #, Restaurant, or Customer..."
          placeholderTextColor={Colors.textSubtle}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Filter Chips */}
      <View style={styles.filterRow}>
        <FlatList
          horizontal={true}
          data={filterOptions}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.value}
          renderItem={({ item }) => (
            <FilterChip
              label={item.label}
              count={item.count}
              isSelected={selectedFilter === item.value}
              onPress={() => setSelectedFilter(item.value)}
            />
          )}
        />
      </View>

      {/* Order Cards List */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Fetching cross-restaurant orders...</Text>
        </View>
      ) : filteredOrders.length === 0 ? (
        <View style={styles.centerBox}>
          <ShoppingBag size={48} color={Colors.cardBorder} />
          <Text style={styles.emptyTitle}>No Orders Found</Text>
          <Text style={styles.emptySub}>
            No orders match the selected filter tab or search criteria.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onPress={(o) => {
                router.push({ pathname: '/order-details', params: { orderId: o._id } });
              }}
              onAssignDelivery={(o) => {
                setSelectedOrder(o);
                setAssignModalVisible(true);
              }}
            />
          )}
        />
      )}

      {/* Order Detail Modal */}
      <OrderDetailModal
        visible={detailModalVisible}
        order={selectedOrder}
        onClose={() => setDetailModalVisible(false)}
        onAssignDelivery={(o) => {
          setSelectedOrder(o);
          setAssignModalVisible(true);
        }}
        onUpdateStatus={handleUpdateStatus}
      />

      {/* Assign Delivery Partner Modal */}
      <AssignDeliveryModal
        visible={assignModalVisible}
        order={selectedOrder}
        onClose={() => setAssignModalVisible(false)}
        onConfirmAssign={handleAssignConfirm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    height: 44,
    fontSize: 13,
  },
  filterRow: {
    paddingHorizontal: 16,
    marginVertical: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
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
    marginTop: 12,
  },
  emptySub: {
    color: Colors.textSubtle,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
});
