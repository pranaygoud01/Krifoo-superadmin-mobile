import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Modal,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Header } from '../components/Header';
import { Colors } from '../constants/colors';
import { categoryService } from '../services/category.service';
import { useToast } from '../context/ToastContext';
import { Category } from '../types';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Layers,
  CheckCircle2,
  XCircle,
  X,
  Save,
  Image as ImageIcon,
} from 'lucide-react-native';

export default function CategoriesScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const { showToast } = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      const res = await categoryService.getCategories();
      if (res.success && res.data) {
        setCategories(res.data);
      } else {
        showToast({ title: 'Error', message: res.message || 'Failed to load categories', type: 'error' });
      }
    } catch (e: any) {
      showToast({ title: 'Error', message: e.message || 'Could not fetch categories', type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchCategories();
  };

  const handleOpenAdd = () => {
    setEditingCategory(null);
    setCategoryName('');
    setDescription('');
    setImageUrl('');
    setIsActive(true);
    setModalVisible(true);
  };

  const handleOpenEdit = (item: Category) => {
    setEditingCategory(item);
    setCategoryName(item.categoryName || '');
    setDescription(item.description || '');
    setImageUrl(item.imageUrl || '');
    setIsActive(item.isActive ?? true);
    setModalVisible(true);
  };

  const handleSaveCategory = async () => {
    if (!categoryName.trim()) {
      showToast({ title: 'Validation', message: 'Category name is required.', type: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('categoryName', categoryName.trim());
      formData.append('description', description.trim());
      formData.append('isActive', String(isActive));
      if (imageUrl.trim()) {
        formData.append('imageUrl', imageUrl.trim());
      }

      let res;
      if (editingCategory) {
        res = await categoryService.updateCategory(editingCategory._id, formData);
      } else {
        res = await categoryService.createCategory(formData);
      }

      if (res.success) {
        showToast({
          title: 'Success',
          message: editingCategory ? 'Category updated successfully' : 'Category created successfully',
          type: 'success',
        });
        setModalVisible(false);
        fetchCategories();
      } else {
        showToast({ title: 'Error', message: res.message || 'Failed to save category', type: 'error' });
      }
    } catch (e: any) {
      showToast({ title: 'Error', message: e.message || 'Error occurred while saving', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCategory = (item: Category) => {
    Alert.alert(
      'Delete Category',
      `Are you sure you want to delete '${item.categoryName}'? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await categoryService.deleteCategory(item._id);
              if (res.success) {
                showToast({ title: 'Deleted', message: 'Category removed successfully.', type: 'success' });
                fetchCategories();
              } else {
                showToast({ title: 'Error', message: res.message || 'Failed to delete category', type: 'error' });
              }
            } catch (e: any) {
              showToast({ title: 'Error', message: e.message || 'Error deleting category', type: 'error' });
            }
          },
        },
      ]
    );
  };

  const filteredCategories = categories.filter((cat) => {
    const matchesSearch =
      cat.categoryName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cat.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      filterStatus === 'all' ||
      (filterStatus === 'active' && cat.isActive) ||
      (filterStatus === 'inactive' && !cat.isActive);
    return matchesSearch && matchesFilter;
  });

  return (
    <View style={styles.container}>
      <Header
        title="Global Categories"
        showBackButton={true}
        rightAction={
          <TouchableOpacity style={styles.addHeaderBtn} onPress={handleOpenAdd}>
            <Plus size={18} color="#FFFFFF" />
            <Text style={styles.addHeaderBtnText}>Add</Text>
          </TouchableOpacity>
        }
      />

      {/* Search & Filter Bar */}
      <View style={styles.filterContainer}>
        <View style={styles.searchBar}>
          <Search size={16} color={Colors.textSubtle} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search categories..."
            placeholderTextColor={Colors.textSubtle}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={16} color={Colors.textSubtle} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.tabsRow}>
          {(['all', 'active', 'inactive'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.filterTab, filterStatus === tab && styles.activeFilterTab]}
              onPress={() => setFilterStatus(tab)}
            >
              <Text style={[styles.filterTabText, filterStatus === tab && styles.activeFilterTabText]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Categories List */}
      {loading && !refreshing ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading categories...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredCategories}
          keyExtractor={(item) => item._id}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={[
            styles.listContent,
            { paddingHorizontal: isTablet ? 24 : 16, maxWidth: 900, alignSelf: 'center', width: '100%' },
          ]}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Layers size={48} color={Colors.textSubtle} />
              <Text style={styles.emptyTitle}>No categories found</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery ? 'Try matching another search query' : 'Create your first global food or grocery category.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.categoryCard}>
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.categoryThumb} />
              ) : (
                <View style={[styles.categoryThumb, styles.placeholderThumb]}>
                  <ImageIcon size={22} color={Colors.textMuted} />
                </View>
              )}

              <View style={styles.cardInfo}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.categoryTitle}>{item.categoryName}</Text>
                  <View style={[styles.statusPill, item.isActive ? styles.activePill : styles.inactivePill]}>
                    <Text style={[styles.statusPillText, item.isActive ? styles.activePillText : styles.inactivePillText]}>
                      {item.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </Text>
                  </View>
                </View>

                {item.description ? (
                  <Text style={styles.categoryDesc} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
              </View>

              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.actionIconButton} onPress={() => handleOpenEdit(item)}>
                  <Edit2 size={16} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionIconButton, styles.deleteIconButton]}
                  onPress={() => handleDeleteCategory(item)}
                >
                  <Trash2 size={16} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* Add / Edit Category Modal */}
      <Modal visible={modalVisible} transparent={true} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingCategory ? 'Edit Category' : 'Add New Category'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={20} color={Colors.textSubtle} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Category Name *</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. Starters, Main Course, Groceries"
                  placeholderTextColor={Colors.textSubtle}
                  value={categoryName}
                  onChangeText={setCategoryName}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Image URL (Optional)</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="https://..."
                  placeholderTextColor={Colors.textSubtle}
                  value={imageUrl}
                  onChangeText={setImageUrl}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Description (Optional)</Text>
                <TextInput
                  style={[styles.modalInput, styles.modalTextArea]}
                  placeholder="Brief description about this category..."
                  placeholderTextColor={Colors.textSubtle}
                  multiline={true}
                  numberOfLines={3}
                  value={description}
                  onChangeText={setDescription}
                />
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Category Status (Active)</Text>
                <Switch
                  value={isActive}
                  onValueChange={setIsActive}
                  trackColor={{ false: '#334155', true: '#10B981' }}
                  thumbColor={isActive ? '#FFFFFF' : '#94A3B8'}
                />
              </View>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
                disabled={submitting}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
                onPress={handleSaveCategory}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Save size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.submitBtnText}>{editingCategory ? 'Update' : 'Save'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  addHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  addHeaderBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  filterContainer: {
    padding: 16,
    gap: 12,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardSurface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 12,
    height: 42,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 13,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  activeFilterTab: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  activeFilterTabText: {
    color: '#FFFFFF',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: Colors.textMuted,
    fontSize: 14,
  },
  listContent: {
    paddingVertical: 16,
    gap: 12,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 14,
  },
  emptySubtitle: {
    color: Colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  categoryCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  categoryThumb: {
    width: 60,
    height: 60,
    borderRadius: 10,
  },
  placeholderThumb: {
    backgroundColor: Colors.cardSurface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  cardInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  categoryTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  activePill: {
    backgroundColor: '#ECFDF5',
  },
  inactivePill: {
    backgroundColor: '#FEF2F2',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  activePillText: {
    color: '#10B981',
  },
  inactivePillText: {
    color: '#EF4444',
  },
  categoryDesc: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionIconButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteIconButton: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FEE2E2',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalBox: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    width: '100%',
    maxWidth: 500,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  modalBody: {
    padding: 16,
    gap: 14,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  modalInput: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 12,
    height: 42,
    color: Colors.text,
    fontSize: 13,
  },
  modalTextArea: {
    height: 70,
    textAlignVertical: 'top',
    paddingVertical: 8,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  cancelBtn: {
    flex: 1,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  cancelBtnText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  submitBtn: {
    flex: 2,
    height: 42,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
