import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
  TextInput,
  RefreshControl,
  Switch,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/colors';
import { ErrorState } from '../../components/ErrorState';
import { ApiErrorType } from '../../services/api';
import { menuService } from '../../services/menu.service';
import { MenuItem, Category } from '../../types';
import { Skeleton } from '../../components/Skeleton';
import {
  Search,
  RefreshCw,
  Plus,
  Edit2,
  Trash2,
  Tag,
  Utensils,
  ShoppingBag,
  Sparkles,
  Percent,
  Truck,
  Store,
  CheckCircle2,
  X,
  ShieldAlert,
  SlidersHorizontal,
  ArrowUpDown,
  Check,
  RotateCcw,
  Flame,
  Layers,
  Power,
  PowerOff,
} from 'lucide-react-native';

type SortOption = 'default' | 'price_asc' | 'price_desc' | 'discount' | 'name_asc' | 'stock_asc';

export default function MenuScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const isSuperAdmin = user?.userType === 'super_admin';
  const restaurantId =
    (typeof user?.restaurantId === 'object' ? user?.restaurantId?._id : user?.restaurantId) ||
    user?._id ||
    '';

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedSort, setSelectedSort] = useState<SortOption>('default');
  const [channelFilter, setChannelFilter] = useState<'all' | 'delivery' | 'dine_in' | 'collection'>('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'out_of_stock'>('all');
  const [filterModalOpen, setFilterModalOpen] = useState(false);


  // Availability Confirmation Modal State
  const [availabilityConfirmItem, setAvailabilityConfirmItem] = useState<{
    id: string;
    name: string;
    currentStatus: boolean;
  } | null>(null);

  const [menuError, setMenuError] = useState<{
    type: ApiErrorType;
    message: string;
    statusCode?: number;
  } | null>(null);

  const loadMenuData = async (isRefresh = false) => {
    if (!isSuperAdmin && !restaurantId) return;
    if (!isRefresh) setLoading(true);
    try {
      const [menuRes, catRes] = await Promise.all([
        isSuperAdmin
          ? menuService.getAllMenuItems()
          : menuService.getRestaurantMenu(restaurantId),
        menuService.getAllCategories(),
      ]);

      if (!menuRes.success && !catRes.success) {
        setMenuError({
          type: (menuRes as any).errorType || (catRes as any).errorType || 'unknown',
          message: menuRes.message || catRes.message || 'Failed to load menu data from server.',
          statusCode: (menuRes as any).statusCode || (catRes as any).statusCode,
        });
      } else {
        setMenuError(null);
      }

      const itemsList = menuRes.data || (menuRes as any).menuItems || (menuRes as any).items;
      if (menuRes.success && itemsList) {
        setMenuItems(itemsList);
      }
      const catList = catRes.data || (catRes as any).categories || (catRes as any).items;
      if (catRes.success && catList) {
        setCategories(catList);
      }
    } catch (e: any) {
      console.error('Failed to load menu data:', e);
      setMenuError({
        type: 'network',
        message: e?.message || 'Cannot connect to server.',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadMenuData(true);
  };

  useFocusEffect(
    useCallback(() => {
      loadMenuData();
    }, [restaurantId])
  );

  const openAddPage = () => {
    router.push('/add-edit-menu');
  };

  const openEditPage = (item: MenuItem) => {
    router.push(`/add-edit-menu?id=${item._id}`);
  };

  const handleDeleteItem = async (itemId: string) => {
    Alert.alert(
      'Confirm Delete',
      'Are you sure you want to delete this menu item? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const res = await menuService.deleteMenuItem(itemId);
            if (res.success) {
              setMenuItems((prev) => prev.filter((i) => i._id !== itemId));
              loadMenuData(true);
            } else {
              Alert.alert(
                'Delete Failed',
                res.message?.includes('Owner access required')
                  ? 'Owner access required. Please sign in with the Restaurant Owner account to delete this item.'
                  : (res.message || 'Failed to delete item.')
              );
            }
          },
        },
      ]
    );
  };

  const requestToggleAvailability = (item: { _id: string; itemName?: string; name?: string; isAvailable?: boolean }) => {
    if (isSuperAdmin) {
      Alert.alert(
        'Action Not Permitted',
        'You are logged in as a Super Admin (View-Only mode). Menu availability can only be changed by the respective Restaurant Owner account.'
      );
      return;
    }
    const itemName = item.itemName || item.name || 'this item';
    setAvailabilityConfirmItem({
      id: item._id,
      name: itemName,
      currentStatus: !!item.isAvailable,
    });
  };

  const executeToggleAvailability = async (itemId: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    // Optimistic update
    setMenuItems((prev) =>
      prev.map((item) => (item._id === itemId ? { ...item, isAvailable: newStatus } : item))
    );

    try {
      const res = await menuService.updateMenuItem(itemId, { isAvailable: newStatus });
      if (!res.success) {
        // Rollback
        setMenuItems((prev) =>
          prev.map((item) => (item._id === itemId ? { ...item, isAvailable: currentStatus } : item))
        );
        Alert.alert(
          'Update Failed',
          res.message?.includes('Owner access required')
            ? 'Owner access required. Please sign in with the Restaurant Owner account to change item availability.'
            : (res.message || 'Failed to update item availability.')
        );
      }
    } catch (e: any) {
      // Rollback
      setMenuItems((prev) =>
        prev.map((item) => (item._id === itemId ? { ...item, isAvailable: currentStatus } : item))
      );
      Alert.alert('Error', e.message || 'Could not change item availability.');
    }
  };

  // KPI Counts at-a-glance
  const stats = useMemo(() => {
    const total = menuItems.length;
    let online = 0;
    let offline = 0;
    let veg = 0;
    let nonVeg = 0;
    let bestseller = 0;
    let discount = 0;
    let bogo = 0;

    menuItems.forEach((i) => {
      if (i.isAvailable) online++;
      else offline++;
      if (i.itemType === 'veg') veg++;
      else if (i.itemType === 'non-veg') nonVeg++;
      if (i.isBestseller) bestseller++;
      if ((i.discountPercentage || 0) > 0) discount++;
      if (i.isBuyOneGetOne) bogo++;
    });

    return { total, online, offline, veg, nonVeg, bestseller, discount, bogo };
  }, [menuItems]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = { all: menuItems.length };
    menuItems.forEach((item) => {
      const cat = item.categories?.[0]?.categoryName || item.category || 'General';
      map[cat] = (map[cat] || 0) + 1;
    });
    return map;
  }, [menuItems]);

  // Filtered & Sorted Items
  const filteredItems = useMemo(() => {
    let result = menuItems.filter((item) => {
      if (!item) return false;
      const itemName = item.itemName || item.name || '';
      const itemDesc = item.description || '';
      const itemCategory = item.categories?.[0]?.categoryName || item.category || '';
      const itemTags = Array.isArray(item.tags) ? item.tags.join(' ') : '';

      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = itemName.toLowerCase().includes(q);
        const matchesDesc = itemDesc.toLowerCase().includes(q);
        const matchesCat = itemCategory.toLowerCase().includes(q);
        const matchesTags = itemTags.toLowerCase().includes(q);
        if (!matchesName && !matchesDesc && !matchesCat && !matchesTags) return false;
      }

      // 2. Category Tab
      if (selectedCategoryFilter !== 'all' && itemCategory !== selectedCategoryFilter) {
        return false;
      }

      // 3. Quick Type Filter
      if (typeFilter === 'active' && !item.isAvailable) return false;
      if (typeFilter === 'inactive' && item.isAvailable) return false;
      if (typeFilter === 'veg' && item.itemType !== 'veg') return false;
      if (typeFilter === 'non_veg' && item.itemType !== 'non-veg') return false;
      if (typeFilter === 'egg' && item.itemType !== 'egg') return false;
      if (typeFilter === 'bestseller' && !item.isBestseller) return false;
      if (typeFilter === 'discount' && (item.discountPercentage || 0) <= 0) return false;
      if (typeFilter === 'bogo' && !item.isBuyOneGetOne) return false;
      if (typeFilter === 'delivery' && item.availableForDelivery === false) return false;
      if (typeFilter === 'dine_in' && item.availableForEatIn === false) return false;
      if (typeFilter === 'collection' && item.availableForCollection === false) return false;

      // 4. Modal Channel Filter
      if (channelFilter === 'delivery' && item.availableForDelivery === false) return false;
      if (channelFilter === 'dine_in' && item.availableForEatIn === false) return false;
      if (channelFilter === 'collection' && item.availableForCollection === false) return false;

      // 5. Modal Stock Filter
      if (stockFilter === 'in_stock' && item.stock !== undefined && item.stock !== null && item.stock <= 0) return false;
      if (stockFilter === 'out_of_stock' && (item.stock === undefined || item.stock === null || item.stock > 0)) return false;

      return true;
    });

    // Sort Result
    if (selectedSort !== 'default') {
      result = [...result].sort((a, b) => {
        const priceA = a.basePrice ?? a.price ?? 0;
        const priceB = b.basePrice ?? b.price ?? 0;
        const discA = a.discountPercentage ?? 0;
        const discB = b.discountPercentage ?? 0;
        const nameA = (a.itemName || a.name || '').toLowerCase();
        const nameB = (b.itemName || b.name || '').toLowerCase();
        const stockA = a.stock ?? Infinity;
        const stockB = b.stock ?? Infinity;

        switch (selectedSort) {
          case 'price_asc':
            return priceA - priceB;
          case 'price_desc':
            return priceB - priceA;
          case 'discount':
            return discB - discA;
          case 'name_asc':
            return nameA.localeCompare(nameB);
          case 'stock_asc':
            return stockA - stockB;
          default:
            return 0;
        }
      });
    }

    return result;
  }, [menuItems, searchQuery, selectedCategoryFilter, typeFilter, channelFilter, stockFilter, selectedSort]);

  // Active filter badge count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (typeFilter !== 'all') count++;
    if (selectedCategoryFilter !== 'all') count++;
    if (channelFilter !== 'all') count++;
    if (stockFilter !== 'all') count++;
    if (selectedSort !== 'default') count++;
    if (searchQuery.trim().length > 0) count++;
    return count;
  }, [typeFilter, selectedCategoryFilter, channelFilter, stockFilter, selectedSort, searchQuery]);

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedCategoryFilter('all');
    setTypeFilter('all');
    setChannelFilter('all');
    setStockFilter('all');
    setSelectedSort('default');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* 1. Page Header */}
      <View style={styles.pageHeader}>
        <View>
          <View style={styles.pageTitleRow}>
            <Text style={styles.pageTitle}>Menu Management</Text>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              {/* <Text style={styles.liveText}>Catalog</Text> */}
            </View>
          </View>
          <Text style={styles.pageSubtitle}>
            {filteredItems.length} of {stats.total} items showing ({stats.online} online)
          </Text>
        </View>

        <View style={styles.headerRightControls}>
          {!isSuperAdmin && (
            <TouchableOpacity style={styles.addItemHeaderBtn} onPress={openAddPage} activeOpacity={0.85}>
              <Plus size={14} color="#FFFFFF" strokeWidth={2.8} />
              <Text style={styles.addItemHeaderBtnText}>Add New</Text>
            </TouchableOpacity>
          )}

          {/* <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh} activeOpacity={0.7}>
            <RefreshCw size={15} color={Colors.textSubtle} />
          </TouchableOpacity> */}
        </View>
      </View>

      {/* 2. Super Admin Read-Only Notice */}
      {isSuperAdmin && (
        <View style={styles.adminBanner}>
          <ShieldAlert size={16} color="#B45309" style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.adminBannerTitle}>Super Admin (Catalog View)</Text>
            <Text style={styles.adminBannerSubtitle}>
              Viewing catalog across all stores. Adding, editing, and online availability toggles are reserved for Restaurant Owner accounts.
            </Text>
          </View>
        </View>
      )}

      {/* 3. Catalog KPI Quick Pulse Bar */}
      <View style={styles.kpiContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kpiScroll}>
          <TouchableOpacity
            style={[styles.kpiCard, typeFilter === 'all' && styles.kpiCardActive]}
            onPress={() => setTypeFilter('all')}
            activeOpacity={0.8}
          >
            <Text style={[styles.kpiNumber, typeFilter === 'all' && styles.kpiNumberActive]}>{stats.total}</Text>
            <Text style={[styles.kpiLabel, typeFilter === 'all' && styles.kpiLabelActive]}>Total Dishes</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.kpiCard, typeFilter === 'active' && styles.kpiCardActive]}
            onPress={() => setTypeFilter(typeFilter === 'active' ? 'all' : 'active')}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={[styles.kpiDot, { backgroundColor: '#10B981' }]} />
              <Text style={[styles.kpiNumber, typeFilter === 'active' && styles.kpiNumberActive]}>{stats.online}</Text>
            </View>
            <Text style={[styles.kpiLabel, typeFilter === 'active' && styles.kpiLabelActive]}>Online</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.kpiCard, typeFilter === 'inactive' && styles.kpiCardActive]}
            onPress={() => setTypeFilter(typeFilter === 'inactive' ? 'all' : 'inactive')}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={[styles.kpiDot, { backgroundColor: '#94A3B8' }]} />
              <Text style={[styles.kpiNumber, typeFilter === 'inactive' && styles.kpiNumberActive]}>{stats.offline}</Text>
            </View>
            <Text style={[styles.kpiLabel, typeFilter === 'inactive' && styles.kpiLabelActive]}>Offline</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.kpiCard, typeFilter === 'bestseller' && styles.kpiCardActive]}
            onPress={() => setTypeFilter(typeFilter === 'bestseller' ? 'all' : 'bestseller')}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Sparkles size={11} color="#D97706" />
              <Text style={[styles.kpiNumber, typeFilter === 'bestseller' && styles.kpiNumberActive]}>{stats.bestseller}</Text>
            </View>
            <Text style={[styles.kpiLabel, typeFilter === 'bestseller' && styles.kpiLabelActive]}>Bestsellers</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.kpiCard, typeFilter === 'veg' && styles.kpiCardActive]}
            onPress={() => setTypeFilter(typeFilter === 'veg' ? 'all' : 'veg')}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={[styles.kpiDot, { backgroundColor: '#16A34A' }]} />
              <Text style={[styles.kpiNumber, typeFilter === 'veg' && styles.kpiNumberActive]}>{stats.veg}</Text>
            </View>
            <Text style={[styles.kpiLabel, typeFilter === 'veg' && styles.kpiLabelActive]}>Veg</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.kpiCard, typeFilter === 'non_veg' && styles.kpiCardActive]}
            onPress={() => setTypeFilter(typeFilter === 'non_veg' ? 'all' : 'non_veg')}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={[styles.kpiDot, { backgroundColor: '#DC2626' }]} />
              <Text style={[styles.kpiNumber, typeFilter === 'non_veg' && styles.kpiNumberActive]}>{stats.nonVeg}</Text>
            </View>
            <Text style={[styles.kpiLabel, typeFilter === 'non_veg' && styles.kpiLabelActive]}>Non-Veg</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.kpiCard, typeFilter === 'discount' && styles.kpiCardActive]}
            onPress={() => setTypeFilter(typeFilter === 'discount' ? 'all' : 'discount')}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Percent size={11} color="#DC2626" />
              <Text style={[styles.kpiNumber, typeFilter === 'discount' && styles.kpiNumberActive]}>{stats.discount}</Text>
            </View>
            <Text style={[styles.kpiLabel, typeFilter === 'discount' && styles.kpiLabelActive]}>On Discount</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.kpiCard, typeFilter === 'bogo' && styles.kpiCardActive]}
            onPress={() => setTypeFilter(typeFilter === 'bogo' ? 'all' : 'bogo')}
            activeOpacity={0.8}
          >
            <Text style={[styles.kpiNumber, typeFilter === 'bogo' && styles.kpiNumberActive]}>{stats.bogo}</Text>
            <Text style={[styles.kpiLabel, typeFilter === 'bogo' && styles.kpiLabelActive]}>BOGO Free</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* 4. Search and Filter Modal Button Row */}
      <View style={styles.controlsRow}>
        <View style={styles.searchBox}>
          <Search size={15} color={Colors.textSubtle} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search items, ingredients, tags..."
            placeholderTextColor={Colors.textSubtle}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={15} color={Colors.textSubtle} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[styles.filterButton, activeFiltersCount > 0 && styles.filterButtonActive]}
          onPress={() => setFilterModalOpen(true)}
          activeOpacity={0.8}
        >
          <SlidersHorizontal size={14} color={activeFiltersCount > 0 ? '#FFFFFF' : '#11181C'} />
          <Text style={[styles.filterButtonText, activeFiltersCount > 0 && styles.filterButtonTextActive]}>
            Filters
          </Text>
          {activeFiltersCount > 0 && (
            <View style={styles.filterCountBadge}>
              <Text style={styles.filterCountBadgeText}>{activeFiltersCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* 5. Categories Horizontal Navigation Tabs */}
      <View style={styles.statusTabsBarContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusTabsBar}>
          <TouchableOpacity
            style={[
              styles.statusTabPill,
              selectedCategoryFilter === 'all' && styles.statusTabPillActive,
            ]}
            onPress={() => setSelectedCategoryFilter('all')}
            activeOpacity={0.7}
          >
            <Utensils size={13} color={selectedCategoryFilter === 'all' ? '#FFFFFF' : '#FF5C39'} />
            <Text
              style={[
                styles.statusTabLabel,
                selectedCategoryFilter === 'all' && styles.statusTabLabelActive,
              ]}
            >
              All Categories
            </Text>
            <View
              style={[
                styles.tabBadge,
                selectedCategoryFilter === 'all' ? styles.tabBadgeActive : styles.tabBadgeInactive,
              ]}
            >
              <Text
                style={[
                  styles.tabBadgeText,
                  selectedCategoryFilter === 'all' && { color: '#11181C' },
                ]}
              >
                {categoryCounts['all'] || 0}
              </Text>
            </View>
          </TouchableOpacity>

          {categories.map((cat) => {
            const isCatActive = selectedCategoryFilter === cat.categoryName;
            const count = categoryCounts[cat.categoryName] || 0;
            return (
              <TouchableOpacity
                key={cat._id}
                style={[
                  styles.statusTabPill,
                  isCatActive && styles.statusTabPillActive,
                ]}
                onPress={() => setSelectedCategoryFilter(isCatActive ? 'all' : cat.categoryName)}
                activeOpacity={0.7}
              >
                <Text style={[styles.statusTabLabel, isCatActive && styles.statusTabLabelActive]}>
                  {cat.categoryName}
                </Text>
                <View
                  style={[
                    styles.tabBadge,
                    isCatActive ? styles.tabBadgeActive : { backgroundColor: '#CBD5E1' },
                  ]}
                >
                  <Text style={[styles.tabBadgeText, isCatActive && { color: '#11181C' }]}>
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Active filters pill badge line when filters are active */}
      {activeFiltersCount > 0 && (
        <View style={styles.activeFilterNotice}>
          <Text style={styles.activeFilterNoticeText}>
            Showing <Text style={{ fontWeight: '800', color: '#11181C' }}>{filteredItems.length}</Text> filtered items
          </Text>
          <TouchableOpacity onPress={clearAllFilters} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Text style={styles.clearAllFiltersText}>Reset All</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 7. Menu Item Feed */}
      {loading ? (
        <ScrollView contentContainerStyle={styles.tabItemsList} showsVerticalScrollIndicator={false}>
          {[1, 2, 3, 4].map((i) => (
            <View key={i} style={[styles.menuCard, { opacity: 0.95 }]}>
              <View style={styles.menuCardTop}>
                <Skeleton width={72} height={72} borderRadius={12} />
                <View style={[styles.cardMainInfo, { gap: 6 }]}>
                  <Skeleton width="65%" height={16} borderRadius={4} />
                  <Skeleton width="35%" height={12} borderRadius={3} />
                  <Skeleton width="45%" height={16} borderRadius={4} />
                </View>
                <Skeleton width={50} height={26} borderRadius={13} />
              </View>
              <View style={{ marginTop: 10, gap: 5 }}>
                <Skeleton width="90%" height={11} borderRadius={3} />
                <Skeleton width="60%" height={11} borderRadius={3} />
              </View>
              <View style={[styles.cardFooter, { marginTop: 12 }]}>
                <Skeleton width={130} height={22} borderRadius={6} />
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Skeleton width={55} height={28} borderRadius={6} />
                  <Skeleton width={30} height={28} borderRadius={6} />
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      ) : menuError && menuItems.length === 0 ? (
        <ErrorState
          errorType={menuError.type}
          message={menuError.message}
          statusCode={menuError.statusCode}
          onRetry={() => loadMenuData(false)}
          isRetrying={loading || refreshing}
        />
      ) : filteredItems.length === 0 ? (
          <View style={styles.centerEmpty}>
            <Utensils size={48} color="#D1D5DB" />
            <Text style={styles.emptyTitle}>No Dishes Found</Text>
            <Text style={styles.emptySubtitle}>
              There are no menu items matching your active search, category, or filter criteria.
          </Text>
            {activeFiltersCount > 0 && (
              <TouchableOpacity style={styles.emptyResetBtn} onPress={clearAllFilters} activeOpacity={0.8}>
                <RotateCcw size={14} color="#FFFFFF" />
                <Text style={styles.emptyResetBtnText}>Reset Filters</Text>
              </TouchableOpacity>
            )}
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item._id}
              contentContainerStyle={styles.tabItemsList}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#FF5C39"
              colors={['#FF5C39']}
            />
          }
          renderItem={({ item }) => {
            const itemName = item.itemName || item.name || 'Unnamed Item';
            const itemPrice = item.basePrice ?? item.price ?? 0;
            const itemCategory = item.categories?.[0]?.categoryName || item.category || 'General';
            const imageUrl = item.displayImageUrl || item.displayImage;
            const discount = item.discountPercentage || 0;
            const discountedPrice = discount > 0 ? itemPrice * (1 - discount / 100) : itemPrice;

            return (
              <TouchableOpacity
                style={styles.menuCard}
                onPress={() => !isSuperAdmin && openEditPage(item)}
                activeOpacity={0.92}
              >
                {/* Top Section */}
                <View style={styles.menuCardTop}>
                  <View style={styles.thumbWrapper}>
                    {imageUrl ? (
                      <Image source={{ uri: imageUrl }} style={styles.itemThumbnail} resizeMode="cover" />
                    ) : (
                      <View style={styles.placeholderThumbnail}>
                        <Utensils size={24} color={Colors.textSubtle} />
                      </View>
                    )}

                    {/* Dietary Corner Indicator */}
                    {item.itemType ? (
                      <View
                        style={[
                          styles.dietaryCornerDot,
                          {
                            borderColor:
                              item.itemType === 'veg'
                                ? '#16A34A'
                                : item.itemType === 'egg'
                                  ? '#D97706'
                                  : '#DC2626',
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.dietaryInnerDot,
                            {
                              backgroundColor:
                                item.itemType === 'veg'
                                  ? '#16A34A'
                                  : item.itemType === 'egg'
                                    ? '#D97706'
                                    : '#DC2626',
                            },
                          ]}
                        />
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.cardMainInfo}>
                    <View style={styles.titleRow}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {itemName}
                      </Text>
                    </View>

                    <Text style={styles.itemCategory}>{itemCategory}</Text>

                    <View style={styles.priceRow}>
                      <Text style={styles.itemPrice}>£{Number(discountedPrice).toFixed(2)}</Text>
                      {discount > 0 && (
                        <Text style={styles.originalPrice}>£{Number(itemPrice).toFixed(2)}</Text>
                      )}
                      {discount > 0 && (
                        <View style={styles.discountPill}>
                          <Text style={styles.discountPillText}>{discount}% OFF</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Switch and status indicator */}
                  <TouchableOpacity
                    style={styles.switchWrapper}
                    onPress={(e) => {
                      e.stopPropagation();
                      requestToggleAvailability(item);
                    }}
                    activeOpacity={0.8}
                  >
                    <View
                      style={[
                        styles.statusBadgePill,
                        item.isAvailable ? styles.statusBadgeGreen : styles.statusBadgeGray,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          item.isAvailable ? styles.statusTextGreen : styles.statusTextGray,
                        ]}
                      >
                        {item.isAvailable ? 'ONLINE' : 'OFFLINE'}
                      </Text>
                    </View>
                    <Switch
                      value={!!item.isAvailable}
                      onValueChange={() => requestToggleAvailability(item)}
                      trackColor={{ true: '#10B981', false: '#E2E8F0' }}
                      thumbColor={item.isAvailable ? '#FFFFFF' : '#94A3B8'}
                      style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }], marginTop: 2 }}
                    />
                  </TouchableOpacity>
                </View>

                {/* Description snippet */}
                {item.description ? (
                  <Text style={styles.itemDesc} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}

                {/* Tags & Badges */}
                <View style={styles.tagRow}>
                  {item.isBestseller && (
                    <View style={[styles.miniBadge, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A', borderWidth: 1 }]}>
                      <Sparkles size={10} color="#D97706" style={{ marginRight: 3 }} />
                      <Text style={[styles.miniBadgeText, { color: '#B45309' }]}>Bestseller</Text>
                    </View>
                  )}
                  {item.isBuyOneGetOne && (
                    <View style={[styles.miniBadge, { backgroundColor: '#EDE9FE', borderColor: '#DDD6FE', borderWidth: 1 }]}>
                      <Text style={[styles.miniBadgeText, { color: '#6D28D9' }]}>BOGO Free</Text>
                    </View>
                  )}
                  {item.offerTag ? (
                    <View style={[styles.miniBadge, { backgroundColor: '#FEE2E2', borderColor: '#FECACA', borderWidth: 1 }]}>
                      <Tag size={10} color="#DC2626" style={{ marginRight: 3 }} />
                      <Text style={[styles.miniBadgeText, { color: '#B91C1C' }]}>{item.offerTag}</Text>
                    </View>
                  ) : null}
                  {item.tags?.slice(0, 3).map((tag, tIdx) => (
                    <View key={tIdx} style={styles.tagPill}>
                      <Text style={styles.tagPillText}>#{tag}</Text>
                    </View>
                  ))}
                  {item.variantGroups && item.variantGroups.length > 0 && (
                    <View style={[styles.miniBadge, { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0', borderWidth: 1 }]}>
                      <Layers size={9} color="#475569" style={{ marginRight: 3 }} />
                      <Text style={[styles.miniBadgeText, { color: '#475569' }]}>
                        {item.variantGroups.length} Variant{item.variantGroups.length > 1 ? 's' : ''}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Card Footer Divider & Actions */}
                <View style={styles.cardFooter}>
                  <View style={styles.channelsInfo}>
                    {item.availableForDelivery !== false && (
                      <View style={styles.channelBadge}>
                        <Truck size={11} color="#475569" />
                        <Text style={styles.channelBadgeText}>Delivery</Text>
                      </View>
                    )}
                    {item.availableForEatIn !== false && (
                      <View style={styles.channelBadge}>
                        <Store size={11} color="#475569" />
                        <Text style={styles.channelBadgeText}>Dine-in</Text>
                      </View>
                    )}
                    {item.availableForCollection !== false && (
                      <View style={styles.channelBadge}>
                        <ShoppingBag size={11} color="#475569" />
                        <Text style={styles.channelBadgeText}>Pickup</Text>
                      </View>
                    )}
                  </View>

                  {!isSuperAdmin && (
                    <View style={styles.cardActions}>
                      <TouchableOpacity
                        style={styles.actionBtnEdit}
                        onPress={(e) => {
                          e.stopPropagation();
                          openEditPage(item);
                        }}
                        activeOpacity={0.7}
                      >
                        <Edit2 size={13} color="#0F172A" />
                        <Text style={styles.actionBtnEditText}>Edit</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Floating Add Item FAB */}
      {!isSuperAdmin && (
        <TouchableOpacity style={styles.fab} onPress={openAddPage} activeOpacity={0.88}>
          <Plus size={26} color="#FFFFFF" strokeWidth={2.8} />
        </TouchableOpacity>
      )}


      {/* Online/Offline Availability Confirmation Modal */}
      <Modal
        visible={!!availabilityConfirmItem}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setAvailabilityConfirmItem(null)}
      >
        <View style={styles.confirmModalOverlay}>
          <View style={styles.confirmModalBox}>
            <View
              style={[
                styles.confirmIconContainer,
                availabilityConfirmItem?.currentStatus
                  ? styles.confirmIconContainerOffline
                  : styles.confirmIconContainerOnline,
              ]}
            >
              {availabilityConfirmItem?.currentStatus ? (
                <PowerOff size={28} color="#DC2626" />
              ) : (
                <Power size={28} color="#16A34A" />
              )}
            </View>

            <Text style={styles.confirmModalTitle}>
              {availabilityConfirmItem?.currentStatus ? 'Turn Item Offline?' : 'Make Item Online?'}
            </Text>

            <Text style={styles.confirmModalItemName} numberOfLines={2}>
              "{availabilityConfirmItem?.name}"
            </Text>

            <Text style={styles.confirmModalMessage}>
              {availabilityConfirmItem?.currentStatus
                ? 'Taking this dish offline will hide it immediately from customers in your store catalog. Customers will NOT be able to order it until you turn it back online.'
                : 'Making this dish online will immediately make it visible and orderable for customers across all enabled fulfillment channels.'}
            </Text>

            <View style={styles.confirmModalActions}>
              <TouchableOpacity
                style={styles.confirmModalCancelBtn}
                onPress={() => setAvailabilityConfirmItem(null)}
                activeOpacity={0.7}
              >
                <Text style={styles.confirmModalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.confirmModalConfirmBtn,
                  availabilityConfirmItem?.currentStatus
                    ? styles.confirmModalBtnOffline
                    : styles.confirmModalBtnOnline,
                ]}
                onPress={async () => {
                  if (availabilityConfirmItem) {
                    const { id, currentStatus } = availabilityConfirmItem;
                    setAvailabilityConfirmItem(null);
                    await executeToggleAvailability(id, currentStatus);
                  }
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.confirmModalConfirmText}>
                  {availabilityConfirmItem?.currentStatus ? 'Yes, Turn Offline' : 'Yes, Turn Online'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Filter & Sort Bottom Sheet Modal */}
      <Modal
        visible={filterModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setFilterModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Filter & Sort Menu</Text>
                <Text style={styles.modalSubtitle}>Refine catalog items by channels, pricing, and stock</Text>
              </View>
              <TouchableOpacity
                onPress={() => setFilterModalOpen(false)}
                style={styles.modalCloseBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={18} color="#475569" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
              {/* Sort By Section */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Sort Dishes By</Text>
                <View style={styles.modalOptionGrid}>
                  {[
                    { id: 'default', label: 'Default' },
                    { id: 'price_asc', label: 'Price: Low to High' },
                    { id: 'price_desc', label: 'Price: High to Low' },
                    { id: 'discount', label: 'Highest Discount' },
                    { id: 'name_asc', label: 'Name: A to Z' },
                    { id: 'stock_asc', label: 'Low Stock First' },
                  ].map((opt) => (
                    <TouchableOpacity
                      key={opt.id}
                      style={[
                        styles.modalOptionChip,
                        selectedSort === opt.id && styles.modalOptionChipActive,
                      ]}
                      onPress={() => setSelectedSort(opt.id as SortOption)}
                    >
                      <Text
                        style={[
                          styles.modalOptionText,
                          selectedSort === opt.id && styles.modalOptionTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Availability Status Section */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Availability Status</Text>
                <View style={styles.modalOptionGrid}>
                  {[
                    { id: 'all', label: 'All Items' },
                    { id: 'active', label: '🟢 Online (Available)' },
                    { id: 'inactive', label: '⚪ Offline (Unavailable)' },
                  ].map((st) => {
                    const isActive = typeFilter === st.id || (st.id === 'all' && typeFilter !== 'active' && typeFilter !== 'inactive');
                    return (
                      <TouchableOpacity
                        key={st.id}
                        style={[
                          styles.modalOptionChip,
                          isActive && styles.modalOptionChipActive,
                        ]}
                        onPress={() => setTypeFilter(st.id === 'all' ? 'all' : st.id)}
                      >
                        <Text
                          style={[
                            styles.modalOptionText,
                            isActive && styles.modalOptionTextActive,
                          ]}
                        >
                          {st.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Dietary & Specials Section */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Dietary & Specials</Text>
                <View style={styles.modalOptionGrid}>
                  {[
                    { id: 'all', label: 'All Dishes' },
                    { id: 'veg', label: '🟢 Pure Veg' },
                    { id: 'non_veg', label: '🔴 Non-Veg' },
                    { id: 'egg', label: '🟡 Contains Egg' },
                    { id: 'bestseller', label: '⭐ Bestseller' },
                    { id: 'discount', label: '🏷️ On Discount' },
                    { id: 'bogo', label: '🎁 Buy 1 Get 1 (BOGO)' },
                  ].map((diet) => {
                    const isActive = typeFilter === diet.id || (diet.id === 'all' && ['all', 'active', 'inactive'].includes(typeFilter));
                    return (
                      <TouchableOpacity
                        key={diet.id}
                        style={[
                          styles.modalOptionChip,
                          isActive && styles.modalOptionChipActive,
                        ]}
                        onPress={() => setTypeFilter(diet.id === 'all' ? 'all' : diet.id)}
                      >
                        <Text
                          style={[
                            styles.modalOptionText,
                            isActive && styles.modalOptionTextActive,
                          ]}
                        >
                          {diet.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Order Channel Section */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Order Fulfillment Channel</Text>
                <View style={styles.modalOptionGrid}>
                  {[
                    { id: 'all', label: 'All Channels' },
                    { id: 'delivery', label: '🛵 Delivery Enabled' },
                    { id: 'dine_in', label: '🍽️ Dine-in Enabled' },
                    { id: 'collection', label: '🛍️ Pickup Enabled' },
                  ].map((ch) => (
                    <TouchableOpacity
                      key={ch.id}
                      style={[
                        styles.modalOptionChip,
                        channelFilter === ch.id && styles.modalOptionChipActive,
                      ]}
                      onPress={() => setChannelFilter(ch.id as any)}
                    >
                      <Text
                        style={[
                          styles.modalOptionText,
                          channelFilter === ch.id && styles.modalOptionTextActive,
                        ]}
                      >
                        {ch.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Stock Inventory Section */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Inventory & Stock</Text>
                <View style={styles.modalOptionGrid}>
                  {[
                    { id: 'all', label: 'All Items' },
                    { id: 'in_stock', label: 'In Stock (> 0)' },
                    { id: 'out_of_stock', label: 'Out of Stock (0)' },
                  ].map((st) => (
                    <TouchableOpacity
                      key={st.id}
                      style={[
                        styles.modalOptionChip,
                        stockFilter === st.id && styles.modalOptionChipActive,
                      ]}
                      onPress={() => setStockFilter(st.id as any)}
                    >
                      <Text
                        style={[
                          styles.modalOptionText,
                          stockFilter === st.id && styles.modalOptionTextActive,
                        ]}
                      >
                        {st.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            {/* Modal Bottom Actions */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalResetBtn}
                onPress={() => {
                  setSelectedSort('default');
                  setChannelFilter('all');
                  setStockFilter('all');
                  setTypeFilter('all');
                }}
              >
                <RotateCcw size={14} color="#64748B" />
                <Text style={styles.modalResetBtnText}>Reset</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalApplyBtn}
                onPress={() => setFilterModalOpen(false)}
              >
                <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.modalApplyBtnText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  pageTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    // backgroundColor: '#ECFDF5',
    // paddingHorizontal: 8,
    // paddingVertical: 3,
    gap: 4,
  },
  liveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#10B981',
  },
  liveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  pageSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  headerRightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addItemHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF5C39',
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 9,
    gap: 5,
    shadowColor: '#FF5C39',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  addItemHeaderBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  refreshBtn: {
    padding: 8,
    borderRadius: 9,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  adminBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  adminBannerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 2,
  },
  adminBannerSubtitle: {
    fontSize: 11,
    color: '#B45309',
    lineHeight: 15,
  },
  kpiContainer: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  kpiScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  kpiCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 80,
    alignItems: 'center',
  },
  kpiCardActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  kpiDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  kpiNumber: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  kpiNumberActive: {
    color: '#FFFFFF',
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  kpiLabelActive: {
    color: '#CBD5E1',
  },
  controlsRow: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    gap: 8,
    height: 38,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    height: 38,
    paddingVertical: 0,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 9,
  },
  filterButtonActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  filterButtonTextActive: {
    color: '#FFFFFF',
  },
  filterCountBadge: {
    backgroundColor: '#FF5C39',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 16,
    alignItems: 'center',
  },
  filterCountBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  statusTabsBarContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  statusTabsBar: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  statusTabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusTabPillActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  statusTabLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  statusTabLabelActive: {
    color: '#FFFFFF',
  },
  tabBadge: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeActive: {
    backgroundColor: '#FFFFFF',
  },
  tabBadgeInactive: {
    backgroundColor: '#FF5C39',
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  activeFilterNotice: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
    backgroundColor: '#F1F5F9',
  },
  activeFilterNoticeText: {
    fontSize: 11.5,
    color: '#475569',
  },
  clearAllFiltersText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FF5C39',
  },
  tabItemsList: {
    padding: 16,
    gap: 12,
    paddingBottom: 110,
  },
  centerEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    marginTop: 12,
  },
  emptyResetBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 13,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1.5,
  },
  menuCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  thumbWrapper: {
    position: 'relative',
  },
  itemThumbnail: {
    width: 66,
    height: 66,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  placeholderThumbnail: {
    width: 66,
    height: 66,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dietaryCornerDot: {
    position: 'absolute',
    top: 5,
    left: 5,
    width: 13,
    height: 13,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dietaryInnerDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  cardMainInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemName: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  itemCategory: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF5C39',
    textTransform: 'uppercase',
    marginTop: 2,
    letterSpacing: 0.2,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 4,
  },
  itemPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  originalPrice: {
    fontSize: 11.5,
    color: '#94A3B8',
    textDecorationLine: 'line-through',
    fontWeight: '500',
  },
  discountPill: {
    backgroundColor: '#FEE2E2',
    borderWidth: 0.8,
    borderColor: '#FECACA',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  discountPillText: {
    color: '#DC2626',
    fontSize: 9.5,
    fontWeight: '800',
  },
  switchWrapper: {
    alignItems: 'flex-end',
    gap: 2,
  },
  statusBadgePill: {
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusBadgeGreen: {
    backgroundColor: '#ECFDF5',
  },
  statusBadgeGray: {
    backgroundColor: '#F1F5F9',
  },
  statusBadgeText: {
    fontSize: 8.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  statusTextGreen: {
    color: '#065F46',
  },
  statusTextGray: {
    color: '#64748B',
  },
  itemDesc: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 16.5,
    marginTop: 8,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  miniBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 5,
  },
  miniBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  tagPill: {
    backgroundColor: '#F8FAFC',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tagPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 9,
    marginTop: 9,
  },
  channelsInfo: {
    flexDirection: 'row',
    gap: 6,
  },
  channelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  channelBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtnEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 7,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  actionBtnEditText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  actionBtnDelete: {
    padding: 6.5,
    borderRadius: 7,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 95,
    right: 20,
    backgroundColor: '#FF5C39',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF5C39',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  modalSection: {
    marginTop: 16,
  },
  modalSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 9,
  },
  modalOptionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modalOptionChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalOptionChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  modalOptionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  modalOptionTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  modalResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  modalResetBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  modalApplyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#0F172A',
  },
  modalApplyBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  confirmModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  confirmModalBox: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  confirmIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  confirmIconContainerOnline: {
    backgroundColor: '#DCFCE7',
  },
  confirmIconContainerOffline: {
    backgroundColor: '#FEE2E2',
  },
  confirmModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  confirmModalItemName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 12,
    textAlign: 'center',
  },
  confirmModalMessage: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 24,
  },
  confirmModalActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  confirmModalCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmModalCancelText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#475569',
  },
  confirmModalConfirmBtn: {
    flex: 1.4,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmModalBtnOnline: {
    backgroundColor: '#16A34A',
  },
  confirmModalBtnOffline: {
    backgroundColor: '#DC2626',
  },
  confirmModalConfirmText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
