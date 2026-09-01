import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
  TextInput,
  RefreshControl,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/colors';
import { MenuItemDetailModal } from '../../components/MenuItemDetailModal';
import { menuService } from '../../services/menu.service';
import { MenuItem, Category } from '../../types';
import {
  Search,
  RefreshCw,
  Plus,
  Edit2,
  Trash2,
  Tag,
  Utensils,
  Layers,
  ShoppingBag,
  Sparkles,
  Percent,
  Truck,
  Store,
  CheckCircle2,
  X,
} from 'lucide-react-native';

const TYPE_FILTERS = [
  { label: 'All Items', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Veg', value: 'veg' },
  { label: 'Non-Veg', value: 'non_veg' },
];

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
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedDetailItem, setSelectedDetailItem] = useState<MenuItem | null>(null);

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

      const itemsList = menuRes.data || menuRes.menuItems || (menuRes as any).items;
      if (menuRes.success && itemsList) {
        setMenuItems(itemsList);
      }
      const catList = catRes.data || catRes.categories || (catRes as any).items;
      if (catRes.success && catList) {
        setCategories(catList);
      }
    } catch (e) {
      console.error('Failed to load menu data:', e);
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
    React.useCallback(() => {
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
      'Are you sure you want to delete this menu item?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const res = await menuService.deleteMenuItem(itemId);
            if (res.success) {
              Alert.alert('Success', 'Menu item deleted successfully.');
              loadMenuData(true);
            } else {
              Alert.alert('Error', res.message || 'Failed to delete item.');
            }
          },
        },
      ]
    );
  };

  const handleToggleAvailability = async (itemId: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    setMenuItems((prev) =>
      prev.map((item) => (item._id === itemId ? { ...item, isAvailable: newStatus } : item))
    );
    setSelectedDetailItem((prev) =>
      prev && prev._id === itemId ? { ...prev, isAvailable: newStatus } : prev
    );

    try {
      const res = await menuService.updateMenuItem(itemId, { isAvailable: newStatus });
      if (!res.success) {
        setMenuItems((prev) =>
          prev.map((item) => (item._id === itemId ? { ...item, isAvailable: currentStatus } : item))
        );
        setSelectedDetailItem((prev) =>
          prev && prev._id === itemId ? { ...prev, isAvailable: currentStatus } : prev
        );
        Alert.alert('Error', res.message || 'Failed to update item availability.');
      }
    } catch (e: any) {
      setMenuItems((prev) =>
        prev.map((item) => (item._id === itemId ? { ...item, isAvailable: currentStatus } : item))
      );
      setSelectedDetailItem((prev) =>
        prev && prev._id === itemId ? { ...prev, isAvailable: currentStatus } : prev
      );
      Alert.alert('Error', e.message || 'Could not change item availability.');
    }
  };

  // Filtered Menu Items
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      if (!item) return false;
      const itemName = item.itemName || item.name || '';
      const itemDesc = item.description || '';
      const itemCategory = item.categories?.[0]?.categoryName || item.category || '';

      // Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = itemName.toLowerCase().includes(q);
        const matchesDesc = itemDesc.toLowerCase().includes(q);
        const matchesCat = itemCategory.toLowerCase().includes(q);
        if (!matchesName && !matchesDesc && !matchesCat) return false;
      }

      // Category Filter
      if (selectedCategoryFilter !== 'all' && itemCategory !== selectedCategoryFilter) {
        return false;
      }

      // Type Filter
      if (typeFilter === 'active' && !item.isAvailable) return false;
      if (typeFilter === 'inactive' && item.isAvailable) return false;
      if (typeFilter === 'veg' && item.itemType !== 'veg') return false;
      if (typeFilter === 'non_veg' && item.itemType !== 'non-veg') return false;

      return true;
    });
  }, [menuItems, searchQuery, selectedCategoryFilter, typeFilter]);

  const activeCount = useMemo(() => {
    return menuItems.filter((i) => i.isAvailable).length;
  }, [menuItems]);

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = { all: menuItems.length };
    menuItems.forEach((item) => {
      const cat = item.categories?.[0]?.categoryName || item.category || 'General';
      map[cat] = (map[cat] || 0) + 1;
    });
    return map;
  }, [menuItems]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Page Header matching Orders Board style */}
      <View style={styles.pageHeader}>
        <View>
          <View style={styles.pageTitleRow}>
            <Text style={styles.pageTitle}>Menu Management</Text>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Active</Text>
            </View>
          </View>
          <Text style={styles.pageSubtitle}>
            {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''} listed ({activeCount} online)
          </Text>
        </View>

        <View style={styles.headerRightControls}>
          {/* {!isSuperAdmin && (
            <TouchableOpacity style={styles.addItemHeaderBtn} onPress={openAddPage} activeOpacity={0.8}>
              <Plus size={14} color="#FFFFFF" />
              <Text style={styles.addItemHeaderBtnText}>Add Item</Text>
            </TouchableOpacity>
          )} */}

          <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh} activeOpacity={0.7}>
            <RefreshCw size={16} color={Colors.textSubtle} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Controls: Search and Sub-Type Filter Chips */}
      <View style={styles.controlsRow}>
        <View style={styles.searchBox}>
          <Search size={14} color={Colors.textSubtle} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search menu items, category, desc..."
            placeholderTextColor={Colors.textSubtle}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={14} color={Colors.textSubtle} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeFilters}>
          {TYPE_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.value}
              style={[styles.typeChip, typeFilter === f.value && styles.typeChipActive]}
              onPress={() => setTypeFilter(f.value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.typeChipText, typeFilter === f.value && styles.typeChipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Categories Horizontal Tabs Navigation Bar */}
      <View style={styles.statusTabsBarContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusTabsBar}>
          <TouchableOpacity
            style={[
              styles.statusTabPill,
              selectedCategoryFilter === 'all' && { backgroundColor: '#11181C', borderColor: '#11181C' },
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
                selectedCategoryFilter === 'all' ? styles.tabBadgeActive : { backgroundColor: '#FF5C39' },
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
                  isCatActive && { backgroundColor: '#11181C', borderColor: '#11181C' },
                ]}
                onPress={() => setSelectedCategoryFilter(cat.categoryName)}
                activeOpacity={0.7}
              >
                <Text style={[styles.statusTabLabel, isCatActive && styles.statusTabLabelActive]}>
                  {cat.categoryName}
                </Text>
                <View
                  style={[
                    styles.tabBadge,
                    isCatActive ? styles.tabBadgeActive : { backgroundColor: '#687076' },
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

      {/* Menu Item Feed */}
      {loading ? (
        <View style={styles.centerLoader}>
          <ActivityIndicator size="large" color="#FF5C39" />
          <Text style={styles.loadingText}>Fetching menu items...</Text>
        </View>
      ) : filteredItems.length === 0 ? (
          <View style={styles.centerEmpty}>
            <Utensils size={48} color="#EEEEEE" />
            <Text style={styles.emptyTitle}>No Menu Items Found</Text>
            <Text style={styles.emptySubtitle}>
              There are no items matching the selected category or search filters.
          </Text>
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
                onPress={() => setSelectedDetailItem(item)}
                activeOpacity={0.88}
              >
                {/* Top Section */}
                <View style={styles.menuCardTop}>
                  {imageUrl ? (
                    <Image source={{ uri: imageUrl }} style={styles.itemThumbnail} resizeMode="cover" />
                  ) : (
                    <View style={styles.placeholderThumbnail}>
                        <Utensils size={22} color={Colors.textSubtle} />
                    </View>
                  )}

                  <View style={styles.cardMainInfo}>
                    <View style={styles.titleRow}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {itemName}
                      </Text>
                      {item.itemType ? (
                        <View
                          style={[
                            styles.typeDotBox,
                            {
                              borderColor:
                                item.itemType === 'veg'
                                  ? '#10B981'
                                  : item.itemType === 'egg'
                                    ? '#F59E0B'
                                    : '#EF4444',
                            },
                          ]}
                        >
                          <View
                            style={[
                              styles.typeDot,
                              {
                                backgroundColor:
                                  item.itemType === 'veg'
                                    ? '#10B981'
                                    : item.itemType === 'egg'
                                      ? '#F59E0B'
                                      : '#EF4444',
                              },
                            ]}
                          />
                        </View>
                      ) : null}
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

                  {/* Switch and status */}
                  <TouchableOpacity
                    style={styles.switchWrapper}
                    onPress={(e) => {
                      e.stopPropagation();
                      handleToggleAvailability(item._id, !!item.isAvailable);
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
                        {item.isAvailable ? 'ACTIVE' : 'INACTIVE'}
                      </Text>
                    </View>
                    <Switch
                      value={!!item.isAvailable}
                      onValueChange={() => handleToggleAvailability(item._id, !!item.isAvailable)}
                      trackColor={{ true: '#FF5C39', false: '#E2E8F0' }}
                      thumbColor={item.isAvailable ? '#FFFFFF' : '#94A3B8'}
                      style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }], marginTop: 2 }}
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
                    <View style={[styles.miniBadge, { backgroundColor: '#FEF3C7' }]}>
                      <Sparkles size={10} color="#D97706" style={{ marginRight: 3 }} />
                      <Text style={[styles.miniBadgeText, { color: '#B45309' }]}>Bestseller</Text>
                    </View>
                  )}
                  {item.isBuyOneGetOne && (
                    <View style={[styles.miniBadge, { backgroundColor: '#EDE9FE' }]}>
                      <Text style={[styles.miniBadgeText, { color: '#6D28D9' }]}>BOGO</Text>
                    </View>
                  )}
                  {item.offerTag ? (
                    <View style={[styles.miniBadge, { backgroundColor: '#FEE2E2' }]}>
                      <Tag size={10} color="#DC2626" style={{ marginRight: 3 }} />
                      <Text style={[styles.miniBadgeText, { color: '#B91C1C' }]}>{item.offerTag}</Text>
                    </View>
                  ) : null}
                  {item.tags?.slice(0, 3).map((tag, tIdx) => (
                    <View key={tIdx} style={styles.tagPill}>
                      <Text style={styles.tagPillText}>#{tag}</Text>
                    </View>
                  ))}
                </View>

                {/* Card Footer Divider & Actions */}
                <View style={styles.cardFooter}>
                  <View style={styles.channelsInfo}>
                    {item.availableForDelivery !== false && (
                      <View style={styles.channelBadge}>
                        <Truck size={11} color="#687076" />
                        <Text style={styles.channelBadgeText}>Delivery</Text>
                      </View>
                    )}
                    {item.availableForEatIn !== false && (
                      <View style={styles.channelBadge}>
                        <Store size={11} color="#687076" />
                        <Text style={styles.channelBadgeText}>Dine-in</Text>
                      </View>
                    )}
                    {item.availableForCollection !== false && (
                      <View style={styles.channelBadge}>
                        <ShoppingBag size={11} color="#687076" />
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
                        <Edit2 size={13} color="#11181C" />
                        <Text style={styles.actionBtnEditText}>Edit</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.actionBtnDelete}
                        onPress={(e) => {
                          e.stopPropagation();
                          handleDeleteItem(item._id);
                        }}
                        activeOpacity={0.7}
                      >
                        <Trash2 size={13} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Floating Add FAB for Mobile ergonomics */}
      {!isSuperAdmin && (
        <TouchableOpacity style={styles.fab} onPress={openAddPage} activeOpacity={0.85}>
          <Plus size={24} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* Full Menu Item Details Modal */}
      <MenuItemDetailModal
        visible={!!selectedDetailItem}
        item={selectedDetailItem}
        onClose={() => setSelectedDetailItem(null)}
        onEdit={openEditPage}
        onDelete={handleDeleteItem}
        onToggleAvailability={handleToggleAvailability}
        isSuperAdmin={isSuperAdmin}
      />
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
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
    color: '#11181C',
    letterSpacing: -0.3,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  liveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  pageSubtitle: {
    fontSize: 12,
    color: '#9BA1A6',
    marginTop: 2,
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
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 4,
    shadowColor: '#FF5C39',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  addItemHeaderBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  refreshBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  controlsRow: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    paddingHorizontal: 10,
    gap: 8,
    height: 38,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#11181C',
    height: 38,
  },
  typeFilters: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  typeChipActive: {
    backgroundColor: '#11181C',
    borderColor: '#11181C',
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#687076',
  },
  typeChipTextActive: {
    color: '#FFFFFF',
  },
  statusTabsBarContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    paddingVertical: 8,
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
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  statusTabLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#11181C',
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
  tabBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  tabItemsList: {
    padding: 16,
    gap: 12,
    paddingBottom: 110,
  },
  centerLoader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    color: '#9BA1A6',
    fontSize: 13,
    marginTop: 10,
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
    fontWeight: '700',
    color: '#11181C',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#9BA1A6',
    textAlign: 'center',
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  menuCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  itemThumbnail: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#F8F9FA',
  },
  placeholderThumbnail: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#EEEEEE',
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
    color: '#11181C',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  typeDotBox: {
    width: 12,
    height: 12,
    borderWidth: 1.2,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  typeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  itemCategory: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF5C39',
    textTransform: 'uppercase',
    marginTop: 2,
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
    color: '#11181C',
  },
  originalPrice: {
    fontSize: 11,
    color: '#9BA1A6',
    textDecorationLine: 'line-through',
  },
  discountPill: {
    backgroundColor: '#EF4444',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  discountPillText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  switchWrapper: {
    alignItems: 'flex-end',
    gap: 2,
  },
  statusBadgePill: {
    borderRadius: 4,
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
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusTextGreen: {
    color: '#065F46',
  },
  statusTextGray: {
    color: '#64748B',
  },
  itemDesc: {
    color: '#687076',
    fontSize: 12,
    lineHeight: 17,
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
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  miniBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  tagPill: {
    backgroundColor: '#F8F9FA',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  tagPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#687076',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 10,
    marginTop: 10,
  },
  channelsInfo: {
    flexDirection: 'row',
    gap: 6,
  },
  channelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  channelBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#687076',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtnEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  actionBtnEditText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#11181C',
  },
  actionBtnDelete: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
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
});
