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
import { Header } from '../../components/Header';
import { FilterChip } from '../../components/FilterChip';
import { RestaurantCard } from '../../components/RestaurantCard';
import { RestaurantDetailModal } from '../../components/RestaurantDetailModal';
import { Colors } from '../../constants/colors';
import { restaurantService } from '../../services/restaurant.service';
import { Restaurant, VerificationStatus } from '../../types';
import { Search, Store } from 'lucide-react-native';

export default function RestaurantsScreen() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<string>('all');

  // Selected restaurant for verification/detail modal
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const fetchRestaurants = async () => {
    try {
      const res = await restaurantService.getRestaurants();
      if (res.success && res.data) {
        setRestaurants(res.data);
      }
    } catch (e) {
      console.error('Failed fetching restaurants:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRestaurants();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRestaurants();
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
      // Filter by category tab
      if (selectedFilter === 'pending' && item.verificationStatus !== 'pending') return false;
      if (selectedFilter === 'approved' && item.verificationStatus !== 'approved') return false;
      if (selectedFilter === 'rejected' && item.verificationStatus !== 'rejected') return false;
      if (selectedFilter === 'active' && !item.isActive) return false;
      if (selectedFilter === 'inactive' && item.isActive) return false;

      // Filter by search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = item.restaurantName?.toLowerCase().includes(q);
        const ownerMatch = item.ownerName?.toLowerCase().includes(q);
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
      Alert.alert(
        'Status Updated',
        `Restaurant '${restaurant.restaurantName}' verification set to: ${newStatus.toUpperCase()}`
      );
      setModalVisible(false);
      fetchRestaurants();
    } else {
      Alert.alert('Error', res.message || 'Failed to update verification status.');
    }
  };

  const handleToggleActive = async (restaurant: Restaurant, currentActive: boolean) => {
    const res = await restaurantService.toggleActiveStatus(restaurant._id, currentActive);
    if (res.success) {
      setRestaurants((prev) =>
        prev.map((r) => (r._id === restaurant._id ? { ...r, isActive: currentActive } : r))
      );
    } else {
      Alert.alert('Error', res.message || 'Failed to toggle active status.');
    }
  };

  const handleDeleteRestaurant = (restaurant: Restaurant) => {
    Alert.alert(
      'Confirm Permanent Delete',
      `Are you sure you want to delete '${restaurant.restaurantName}'? This will also remove all products, orders, and connected data!`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const res = await restaurantService.deleteRestaurant(restaurant._id);
            if (res.success) {
              setRestaurants((prev) => prev.filter((r) => r._id !== restaurant._id));
              Alert.alert('Deleted', 'Restaurant deleted successfully.');
            } else {
              Alert.alert('Error', res.message || 'Failed to delete restaurant.');
            }
          },
        },
      ]
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
          renderItem={({ item }) => (
            <RestaurantCard
              restaurant={item}
              onViewDetails={(r) => {
                setSelectedRestaurant(r);
                setModalVisible(true);
              }}
              onVerifyStatusChange={(r, status) => handleVerifyStatusChange(r, status)}
              onToggleActive={(r, active) => handleToggleActive(r, active)}
              onDelete={(r) => handleDeleteRestaurant(r)}
            />
          )}
        />
      )}

      {/* Restaurant Detail & Verification Modal */}
      <RestaurantDetailModal
        visible={modalVisible}
        restaurant={selectedRestaurant}
        onClose={() => setModalVisible(false)}
        onUpdateVerification={async (status, remarks) => {
          if (selectedRestaurant) {
            await handleVerifyStatusChange(selectedRestaurant, status, remarks);
          }
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
});
