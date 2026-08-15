import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { Colors } from '../../constants/colors';
import { Header } from '../../components/Header';
import { menuService } from '../../services/menu.service';
import { MenuItem, Category } from '../../types';
import { Plus, Edit2, Trash2, Tag, Utensils, Search } from 'lucide-react-native';

export default function MenuScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const restaurantId = user?.restaurantId || user?._id || '';

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');

  const loadMenuData = async () => {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const [menuRes, catRes] = await Promise.all([
        menuService.getRestaurantMenu(restaurantId),
        menuService.getAllCategories(),
      ]);

      if (menuRes.success && menuRes.data) {
        setMenuItems(menuRes.data);
      }
      if (catRes.success && catRes.data) {
        setCategories(catRes.data);
      }
    } catch (e) {
      console.error('Failed to load menu data:', e);
    } finally {
      setLoading(false);
    }
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
              loadMenuData();
            } else {
              Alert.alert('Error', res.message || 'Failed to delete item.');
            }
          },
        },
      ]
    );
  };

  const filteredItems = menuItems.filter((item) => {
    if (!item) return false;
    const itemName = item.itemName || item.name || '';
    const itemCategory = item.categories?.[0]?.categoryName || item.category || '';
    const matchesSearch =
      itemName.toLowerCase().includes((searchQuery || '').toLowerCase()) ||
      (item.description || '').toLowerCase().includes((searchQuery || '').toLowerCase());
    const matchesCategory =
      selectedCategoryFilter === 'all' || itemCategory === selectedCategoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <View style={styles.container}>
      <Header title="Menu Management" />

      {/* Search and Category Filters */}
      <View style={styles.topFilterBox}>
        <View style={styles.searchBox}>
          <Search size={16} color={Colors.textSubtle} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search menu items..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Horizontal Categories */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryScrollContent}
        >
          <TouchableOpacity
            style={[
              styles.filterChip,
              selectedCategoryFilter === 'all' && styles.filterChipActive,
            ]}
            onPress={() => setSelectedCategoryFilter('all')}
          >
            <Text
              style={[
                styles.filterChipLabel,
                selectedCategoryFilter === 'all' && styles.filterChipLabelActive,
              ]}
            >
              All Items
            </Text>
          </TouchableOpacity>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat._id}
              style={[
                styles.filterChip,
                selectedCategoryFilter === cat.categoryName && styles.filterChipActive,
              ]}
              onPress={() => setSelectedCategoryFilter(cat.categoryName)}
            >
              <Text
                style={[
                  styles.filterChipLabel,
                  selectedCategoryFilter === cat.categoryName && styles.filterChipLabelActive,
                ]}
              >
                {cat.categoryName}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Menu Item Feed */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Fetching menu items...</Text>
        </View>
      ) : filteredItems.length === 0 ? (
        <View style={styles.centerBox}>
          <Utensils size={48} color={Colors.cardBorder} />
          <Text style={styles.emptyTitle}>No Items Found</Text>
          <Text style={styles.emptySub}>
            Add items to your menu to see them listed here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const itemName = item.itemName || item.name || '';
            const itemPrice = item.basePrice ?? item.price ?? 0;
            const itemCategory = item.categories?.[0]?.categoryName || item.category || '';
            const imageUrl = item.displayImageUrl || item.displayImage;

            return (
              <View style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  {imageUrl ? (
                    <Image source={{ uri: imageUrl }} style={styles.itemThumbnail} />
                  ) : (
                    <View style={styles.placeholderThumbnail}>
                      <Utensils size={18} color={Colors.textSubtle} />
                    </View>
                  )}

                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.itemName}>{itemName}</Text>
                    <Text style={styles.itemCategory}>{itemCategory}</Text>
                  </View>
                  <View
                    style={[
                      styles.availabilityBadge,
                      item.isAvailable ? styles.badgeGreen : styles.badgeGray,
                    ]}
                  >
                    <Text
                      style={[
                        styles.availabilityText,
                        item.isAvailable ? styles.textGreen : styles.textGray,
                      ]}
                    >
                      {item.isAvailable ? 'Available' : 'Unavailable'}
                    </Text>
                  </View>
                </View>

                {item.description ? (
                  <Text style={styles.itemDesc} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}

                {item.tags && item.tags.length > 0 ? (
                  <View style={styles.tagRow}>
                    {item.tags.map((tag) => (
                      <View key={tag} style={styles.tagBadge}>
                        <Tag size={10} color={Colors.textMuted} style={{ marginRight: 4 }} />
                        <Text style={styles.tagLabel}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={styles.itemFooter}>
                  <Text style={styles.itemPrice}>€{Number(itemPrice).toFixed(2)}</Text>
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={styles.actionBtnEdit}
                      onPress={() => openEditPage(item)}
                    >
                      <Edit2 size={14} color={Colors.text} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtnDelete}
                      onPress={() => handleDeleteItem(item._id)}
                    >
                      <Trash2 size={14} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Floating Add FAB */}
      <TouchableOpacity style={styles.fab} onPress={openAddPage} activeOpacity={0.85}>
        <Plus size={24} color="#FFFFFF" />
      </TouchableOpacity>


    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topFilterBox: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    paddingTop: 12,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardSurface,
    borderColor: Colors.cardBorder,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
  },
  categoryScroll: {
    paddingLeft: 16,
    marginBottom: 10,
  },
  categoryScrollContent: {
    paddingRight: 32,
    gap: 8,
  },
  filterChip: {
    backgroundColor: Colors.cardSurface,
    borderColor: Colors.cardBorder,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  filterChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  filterChipLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  filterChipLabelActive: {
    color: Colors.primary,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 14,
  },
  emptySub: {
    fontSize: 13,
    color: Colors.textSubtle,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 240,
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  itemCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    padding: 14,
    marginBottom: 12,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  itemName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  itemCategory: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSubtle,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  availabilityBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeGreen: {
    backgroundColor: '#ECFDF5',
  },
  badgeGray: {
    backgroundColor: Colors.cardSurface,
  },
  availabilityText: {
    fontSize: 10,
    fontWeight: '800',
  },
  textGreen: {
    color: '#065F46',
  },
  textGray: {
    color: Colors.textMuted,
  },
  itemDesc: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  tagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardSurface,
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
    paddingTop: 10,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtnEdit: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  actionBtnDelete: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: Colors.primary,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 28, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  closeBtn: {
    padding: 6,
  },
  modalScroll: {
    padding: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.cardSurface,
    borderColor: Colors.cardBorder,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 14,
    color: Colors.text,
  },
  textArea: {
    height: 80,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  catSelectRow: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  catOption: {
    backgroundColor: Colors.cardSurface,
    borderColor: Colors.cardBorder,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  catOptionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  catOptionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  catOptionLabelActive: {
    color: Colors.primary,
  },
  switchGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.cardSurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 12,
    marginBottom: 24,
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  switchSub: {
    fontSize: 11,
    color: Colors.textSubtle,
    marginTop: 2,
    maxWidth: 220,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  itemThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: Colors.cardSurface,
  },
  placeholderThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: Colors.cardSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderStyle: 'dashed',
  },
});
