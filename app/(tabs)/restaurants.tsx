import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { useRouter, useFocusEffect } from 'expo-router';
import { Header } from '../../components/Header';
import { FilterChip } from '../../components/FilterChip';
import { RestaurantCard } from '../../components/RestaurantCard';
import { ConfirmModal } from '../../components/ConfirmModal';
import { Colors } from '../../constants/colors';
import { restaurantService } from '../../services/restaurant.service';
import { useToast } from '../../context/ToastContext';
import { Restaurant, VerificationStatus } from '../../types';
import { Search, Store } from 'lucide-react-native';

export default function RestaurantsScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<string>('all');

  // Confirm Deactivate Switch States
  const [deactivateModalVisible, setDeactivateModalVisible] = useState(false);
  const [selectedRestaurantToDeactivate, setSelectedRestaurantToDeactivate] = useState<Restaurant | null>(null);

  // Pagination states
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchRestaurants = async (pageNum = 1, isRefresh = false) => {
    try {
      if (pageNum === 1) {
        if (!isRefresh) setLoading(true);
      } else {
        setLoadingMore(true);
      }

      // Backend supports filtering by status (pending, approved, rejected)
      const statusParam = ['pending', 'approved', 'rejected'].includes(selectedFilter)
        ? selectedFilter
        : undefined;

      const res = await restaurantService.getRestaurants({
        page: pageNum,
        limit: 10,
        status: statusParam,
      });

      if (res.success && res.data) {
        if (pageNum === 1) {
          setRestaurants(res.data);
        } else {
          setRestaurants((prev) => [...prev, ...res.data!]);
        }
        setPage(pageNum);
        setTotalPages(res.totalPages || 1);
      }
    } catch (e) {
      console.error('Failed fetching restaurants:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchRestaurants(1, true);
    }, [selectedFilter])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchRestaurants(1, true);
  };

  const handleLoadMore = () => {
    if (!loadingMore && page < totalPages) {
      fetchRestaurants(page + 1);
    }
  };

  // Status Filter options
  const filterOptions = [
    { label: 'All', value: 'all', count: restaurants.length },
    {
      label: 'Pending',
      value: 'pending',
      count: restaurants.filter((r) => r.verificationStatus === 'pending').length,
    },
    {
      label: 'Approved',
      value: 'approved',
      count: restaurants.filter((r) => r.verificationStatus === 'approved').length,
    },
    {
      label: 'Rejected',
      value: 'rejected',
      count: restaurants.filter((r) => r.verificationStatus === 'rejected').length,
    },
    {
      label: 'Active',
      value: 'active',
      count: restaurants.filter((r) => r.isActive).length,
    },
    {
      label: 'Inactive',
      value: 'inactive',
      count: restaurants.filter((r) => !r.isActive).length,
    },
  ];

  const filteredRestaurants = useMemo(() => {
    return restaurants.filter((item) => {
      // Local filters for active/inactive since backend getRestaurantsForAdmin does not support active/inactive filter parameter directly.
      if (selectedFilter === 'active' && !item.isActive) return false;
      if (selectedFilter === 'inactive' && item.isActive) return false;

      // Filter by search query (on currently loaded list)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = item.restaurantName?.toLowerCase().includes(q);
        const ownerMatch = (item.ownerFullName ?? item.ownerName)?.toLowerCase().includes(q);
        const emailMatch = item.email?.toLowerCase().includes(q);
        const phoneMatch = item.phoneNumber?.toLowerCase().includes(q);
        return nameMatch || ownerMatch || emailMatch || phoneMatch;
      }

      return true;
    });
  }, [restaurants, selectedFilter, searchQuery]);

  // Actions
  const handleVerifyStatusChange = async (
    restaurant: Restaurant,
    newStatus: VerificationStatus,
    remarks?: string
  ) => {
    const res = await restaurantService.verifyRestaurant(restaurant._id, newStatus, remarks);
    if (res.success) {
      showToast({
        title: 'Status Updated',
        message: `Restaurant '${restaurant.restaurantName}' verification set to: ${newStatus.toUpperCase()}`,
        type: 'success',
      });
      fetchRestaurants(1, true);
    } else {
      showToast({ title: 'Error', message: res.message || 'Failed to update verification status.', type: 'error' });
    }
  };

  const handleToggleActive = async (restaurant: Restaurant, currentActive: boolean) => {
    // If we are deactivating (currentActive is false), show confirmation modal
    if (!currentActive) {
      setSelectedRestaurantToDeactivate(restaurant);
      setDeactivateModalVisible(true);
    } else {
      // Activating directly
      await performToggleActive(restaurant, true);
    }
  };

  const performToggleActive = async (restaurant: Restaurant, nextActive: boolean) => {
    const res = await restaurantService.toggleActiveStatus(restaurant._id, nextActive);
    if (res.success) {
      setRestaurants((prev) =>
        prev.map((r) => (r._id === restaurant._id ? { ...r, isActive: nextActive } : r))
      );
      showToast({
        title: 'Active Status Changed',
        message: `Restaurant '${restaurant.restaurantName}' is now ${nextActive ? 'active' : 'inactive'}.`,
        type: 'success',
      });
    } else {
      showToast({ title: 'Error', message: res.message || 'Failed to toggle active status.', type: 'error' });
    }
  };

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Header
        title="Krifoo Admin"
      />

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Search size={18} color={Colors.textSubtle} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by restaurant, owner, email, or phone..."
          placeholderTextColor={Colors.textSubtle}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Status Filter Chips */}
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

      {/* Restaurants List */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading registered restaurants...</Text>
        </View>
      ) : filteredRestaurants.length === 0 ? (
        <View style={styles.centerBox}>
          <Store size={48} color={Colors.cardBorder} />
          <Text style={styles.emptyTitle}>No Restaurants Found</Text>
          <Text style={styles.emptySub}>
            No restaurants match the selected filter or search query.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredRestaurants}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          renderItem={({ item }) => (
            <RestaurantCard
              restaurant={item}
              onViewDetails={(r) => {
                router.push({ pathname: '/restaurant-details', params: { restaurantId: r._id } });
              }}
              onVerifyStatusChange={(r, status) => handleVerifyStatusChange(r, status)}
              onToggleActive={(r, active) => handleToggleActive(r, active)}
            />
          )}
        />
      )}

      {/* Confirm Deactivate Modal */}
      <ConfirmModal
        visible={deactivateModalVisible}
        title="Deactivate Restaurant"
        message={`Are you sure you want to deactivate '${selectedRestaurantToDeactivate?.restaurantName || 'this restaurant'}'? Customers will not be able to view their menu or place orders.`}
        confirmText="Deactivate"
        isDestructive={true}
        onConfirm={async () => {
          if (selectedRestaurantToDeactivate) {
            await performToggleActive(selectedRestaurantToDeactivate, false);
          }
          setDeactivateModalVisible(false);
          setSelectedRestaurantToDeactivate(null);
        }}
        onClose={() => {
          setDeactivateModalVisible(false);
          setSelectedRestaurantToDeactivate(null);
        }}
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
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});
