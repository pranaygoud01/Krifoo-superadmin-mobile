import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Header } from '../components/Header';
import { Colors } from '../constants/colors';
import { menuService } from '../services/menu.service';
import { Category } from '../types';
import {
  Save,
  Plus,
  Trash2,
  Check,
  X,
  Sparkles,
  Percent,
  Truck,
  Store,
  ShoppingBag,
  Tag,
  Utensils,
  Layers,
  Camera,
  Coins,
  Package,
  CheckCircle2,
  Info,
  Gift,
  Scale,
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import * as ImagePicker from 'expo-image-picker';

export default function AddEditMenuScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const isEditMode = !!id;
  const { user } = useAuth();
  const restaurantId =
    (typeof user?.restaurantId === 'object' ? user?.restaurantId?._id : user?.restaurantId) ||
    user?._id ||
    '';

  const [activeTab, setActiveTab] = useState<'basic' | 'custom'>('basic');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);

  // Form State
  const [formState, setFormState] = useState({
    itemName: '',
    description: '',
    isFood: true,
    itemType: 'veg' as 'veg' | 'non-veg' | 'egg',
    basePrice: '',
    deliveryPrice: '',
    collectionPrice: '',
    eatInPrice: '',
    stock: '',
    discountPercentage: '0',
    pricingType: 'fixed' as 'fixed' | 'weight' | 'portion',
    weightUnit: 'gm' as 'gm' | 'kg' | 'ml' | 'l' | 'pcs' | 'pack',
    category: '',
    packageType: '',
    minimumQuantity: '1',
    maximumQuantity: '10',
    isBestseller: false,
    isBuyOneGetOne: false,
    offerTag: '',
    availableForDelivery: true,
    availableForEatIn: true,
    availableForCollection: true,
  });

  // Advanced Form Array Lists
  const [weightVariants, setWeightVariants] = useState<any[]>([]);
  const [variantGroups, setVariantGroups] = useState<any[]>([]);
  const [addonGroups, setAddonGroups] = useState<any[]>([]);

  // Image Upload States
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permissionResult.granted === false) {
      Alert.alert('Permission Denied', 'Permission to access gallery is required to choose an image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setImageUri(result.assets[0].uri);
    }
  };

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const res = await menuService.getAllCategories();
        if (res.success && res.data) {
          setCategories(res.data);
          if (res.data && res.data.length > 0 && !formState.category) {
            setFormState((prev) => ({ ...prev, category: res.data![0].categoryName }));
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadCategories();
  }, []);

  useEffect(() => {
    const loadItemDetails = async () => {
      if (!isEditMode) return;
      if (!restaurantId) return;
      setLoading(true);
      try {
        const res = await menuService.getRestaurantMenu(restaurantId);
        const item = res.data?.find((i) => i._id === id);
        if (item) {
          setFormState({
            itemName: item.itemName || item.name || '',
            description: item.description || '',
            isFood: item.isFood !== false,
            itemType: (item.itemType || 'veg') as any,
            basePrice: String(item.basePrice ?? item.price ?? '0'),
            deliveryPrice: item.deliveryPrice != null ? String(item.deliveryPrice) : '',
            collectionPrice: item.collectionPrice != null ? String(item.collectionPrice) : '',
            eatInPrice: item.eatInPrice != null ? String(item.eatInPrice) : '',
            stock: item.stock != null ? String(item.stock) : '',
            discountPercentage: String(item.discountPercentage ?? '0'),
            pricingType: (item.pricingType || 'fixed') as any,
            weightUnit: (item.weightUnit || 'gm') as any,
            category: item.categories?.[0]?.categoryName || item.category || '',
            packageType: item.packageType || '',
            minimumQuantity: String(item.minimumQuantity ?? '1'),
            maximumQuantity: String(item.maximumQuantity ?? '10'),
            isBestseller: !!item.isBestseller,
            isBuyOneGetOne: !!item.isBuyOneGetOne,
            offerTag: item.offerTag || '',
            availableForDelivery: item.availableForDelivery !== false,
            availableForEatIn: item.availableForEatIn !== false,
            availableForCollection: item.availableForCollection !== false,
          });

          setWeightVariants(item.weightVariants || []);
          setVariantGroups(item.variantGroups || []);
          setAddonGroups(item.addonGroups || []);
          if (item.displayImageUrl || item.displayImage) {
            setExistingImageUrl(item.displayImageUrl || item.displayImage || null);
          }
        }
      } catch (e) {
        console.error('Failed loading item details:', e);
      } finally {
        setLoading(false);
      }
    };

    loadItemDetails();
  }, [id, restaurantId, isEditMode]);

  const handleChange = (field: string, val: any) => {
    setFormState((prev) => ({ ...prev, [field]: val }));
  };

  // --- Weight Variants Handlers ---
  const addWeightVariant = () => {
    setWeightVariants((prev) => [
      ...prev,
      { variantName: '', weight: '', unit: formState.weightUnit, price: '' },
    ]);
  };

  const updateWeightVariant = (index: number, field: string, value: any) => {
    setWeightVariants((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item))
    );
  };

  const removeWeightVariant = (index: number) => {
    setWeightVariants((prev) => prev.filter((_, idx) => idx !== index));
  };

  // --- Portion Options (Variant Groups) Handlers ---
  const addVariantGroup = () => {
    setVariantGroups((prev) => [
      ...prev,
      { groupTitle: '', variants: [{ variantName: '', additionalPrice: '' }] },
    ]);
  };

  const updateVariantGroupTitle = (index: number, title: string) => {
    setVariantGroups((prev) =>
      prev.map((g, idx) => (idx === index ? { ...g, groupTitle: title } : g))
    );
  };

  const addVariantOption = (groupIndex: number) => {
    setVariantGroups((prev) =>
      prev.map((g, idx) =>
        idx === groupIndex
          ? { ...g, variants: [...g.variants, { variantName: '', additionalPrice: '' }] }
          : g
      )
    );
  };

  const updateVariantOption = (groupIndex: number, optIndex: number, field: string, val: any) => {
    setVariantGroups((prev) =>
      prev.map((g, idx) => {
        if (idx !== groupIndex) return g;
        const updatedOptions = g.variants.map((o: any, oidx: number) =>
          oidx === optIndex ? { ...o, [field]: val } : o
        );
        return { ...g, variants: updatedOptions };
      })
    );
  };

  const removeVariantOption = (groupIndex: number, optIndex: number) => {
    setVariantGroups((prev) =>
      prev.map((g, idx) => {
        if (idx !== groupIndex) return g;
        return { ...g, variants: g.variants.filter((_: any, oidx: number) => oidx !== optIndex) };
      })
    );
  };

  const removeVariantGroup = (index: number) => {
    setVariantGroups((prev) => prev.filter((_, idx) => idx !== index));
  };

  // --- Extra Addons Handlers ---
  const addAddonGroup = () => {
    setAddonGroups((prev) => [
      ...prev,
      {
        groupTitle: '',
        customizationBehavior: 'optional',
        minSelection: '0',
        maxSelection: '5',
        addons: [{ optionTitle: '', price: '' }],
      },
    ]);
  };

  const updateAddonGroupField = (index: number, field: string, val: any) => {
    setAddonGroups((prev) =>
      prev.map((g, idx) => (idx === index ? { ...g, [field]: val } : g))
    );
  };

  const addAddonOption = (groupIndex: number) => {
    setAddonGroups((prev) =>
      prev.map((g, idx) =>
        idx === groupIndex ? { ...g, addons: [...g.addons, { optionTitle: '', price: '' }] } : g
      )
    );
  };

  const updateAddonOption = (groupIndex: number, optIndex: number, field: string, val: any) => {
    setAddonGroups((prev) =>
      prev.map((g, idx) => {
        if (idx !== groupIndex) return g;
        const updatedOptions = g.addons.map((o: any, oidx: number) =>
          oidx === optIndex ? { ...o, [field]: val } : o
        );
        return { ...g, addons: updatedOptions };
      })
    );
  };

  const removeAddonOption = (groupIndex: number, optIndex: number) => {
    setAddonGroups((prev) =>
      prev.map((g, idx) => {
        if (idx !== groupIndex) return g;
        return { ...g, addons: g.addons.filter((_: any, oidx: number) => oidx !== optIndex) };
      })
    );
  };

  const removeAddonGroup = (index: number) => {
    setAddonGroups((prev) => prev.filter((_, idx) => idx !== index));
  };

  // --- Live Discounted Price Computation ---
  const calculatedDiscountedPrice = useMemo(() => {
    const base = parseFloat(formState.basePrice);
    const disc = parseFloat(formState.discountPercentage);
    if (isNaN(base) || base <= 0) return null;
    if (isNaN(disc) || disc <= 0) return base;
    return Math.max(0, base * (1 - disc / 100));
  }, [formState.basePrice, formState.discountPercentage]);

  // --- Form Submit ---
  const handleSaveItem = async () => {
    const f = formState;
    if (!f.itemName.trim()) return Alert.alert('Missing Field', 'Please enter a name for this dish.');
    if (f.pricingType === 'fixed') {
      if (!f.basePrice.trim() || isNaN(Number(f.basePrice))) {
        return Alert.alert('Invalid Price', 'Please enter a valid base price.');
      }
    }

    if (!f.availableForDelivery && !f.availableForEatIn && !f.availableForCollection) {
      return Alert.alert('Channel Required', 'At least one fulfillment channel (Delivery, Dine-In, or Pickup) must be enabled.');
    }

    setSubmitting(true);
    try {
      const uploadData = new FormData();
      uploadData.append('itemName', f.itemName.trim());
      uploadData.append('description', f.description.trim());
      uploadData.append('isFood', String(f.isFood));
      uploadData.append('itemType', f.itemType);
      uploadData.append('pricingType', f.pricingType);
      uploadData.append('weightUnit', f.weightUnit);
      uploadData.append('categoryNames', JSON.stringify([f.category]));

      uploadData.append('minimumQuantity', f.minimumQuantity);
      uploadData.append('maximumQuantity', f.maximumQuantity);
      uploadData.append('discountPercentage', f.discountPercentage || '0');
      uploadData.append('isBestseller', String(f.isBestseller));
      uploadData.append('isBuyOneGetOne', String(f.isBuyOneGetOne));
      uploadData.append('offerTag', f.offerTag || '');

      uploadData.append('availableForDelivery', String(f.availableForDelivery));
      uploadData.append('availableForEatIn', String(f.availableForEatIn));
      uploadData.append('availableForCollection', String(f.availableForCollection));

      if (f.pricingType === 'fixed') {
        uploadData.append('basePrice', f.basePrice);
        if (f.deliveryPrice.trim()) uploadData.append('deliveryPrice', f.deliveryPrice.trim());
        if (f.collectionPrice.trim()) uploadData.append('collectionPrice', f.collectionPrice.trim());
        if (f.eatInPrice.trim()) uploadData.append('eatInPrice', f.eatInPrice.trim());
      }
      if (f.stock.trim()) {
        uploadData.append('stock', f.stock.trim());
      } else if (f.pricingType === 'weight') {
        const cleanedWeightVariants = weightVariants
          .map((wv) => ({
            variantName: wv.variantName || `${wv.weight} ${wv.unit || f.weightUnit}`,
            weight: Number(wv.weight || 0),
            unit: wv.unit || f.weightUnit,
            price: Number(wv.price || 0),
          }))
          .filter((wv) => wv.weight > 0 && wv.price >= 0);
        uploadData.append('weightVariants', JSON.stringify(cleanedWeightVariants));
        uploadData.append('basePrice', String(cleanedWeightVariants[0]?.price || 0));
      }

      // Customizations
      const cleanedVariantGroups = variantGroups
        .map((g) => ({
          groupTitle: g.groupTitle.trim(),
          variants: g.variants
            .map((v: any) => ({
              variantName: v.variantName.trim(),
              additionalPrice: Number(v.additionalPrice || 0),
            }))
            .filter((v: any) => v.variantName),
        }))
        .filter((g) => g.groupTitle && g.variants.length > 0);
      uploadData.append('variantGroups', JSON.stringify(cleanedVariantGroups));

      const cleanedAddonGroups = addonGroups
        .map((g) => ({
          groupTitle: g.groupTitle.trim(),
          customizationBehavior: g.customizationBehavior,
          minSelection: Number(g.minSelection || 0),
          maxSelection: Number(g.maxSelection || 5),
          addons: g.addons
            .map((a: any) => ({
              optionTitle: a.optionTitle.trim(),
              price: Number(a.price || 0),
            }))
            .filter((a: any) => a.optionTitle),
        }))
        .filter((g) => g.groupTitle && g.addons.length > 0);
      uploadData.append('addonGroups', JSON.stringify(cleanedAddonGroups));

      if (imageUri) {
        const uriParts = imageUri.split('.');
        const fileType = uriParts[uriParts.length - 1];
        uploadData.append('displayImage', {
          uri: Platform.OS === 'android' ? imageUri : imageUri.replace('file://', ''),
          name: `displayImage.${fileType}`,
          type: `image/${fileType === 'jpg' ? 'jpeg' : fileType}`,
        } as any);
      }

      let res;
      if (isEditMode) {
        res = await menuService.updateMenuItem(id as string, uploadData);
      } else {
        res = await menuService.addMenuItem(uploadData);
      }

      if (res.success) {
        Alert.alert('Success', `Menu item ${isEditMode ? 'updated' : 'added'} successfully.`, [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert(
          'Save Failed',
          res.message?.includes('Owner access required')
            ? 'Owner access required. Please sign in with the Restaurant Owner account to create or edit menu items.'
            : (res.message || 'Failed to save menu item.')
        );
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteThisItem = () => {
    if (!id) return;
    Alert.alert(
      'Delete Menu Item',
      `Are you sure you want to permanently delete "${formState.itemName || 'this item'}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Item',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const res = await menuService.deleteMenuItem(id as string);
              if (res.success) {
                Alert.alert('Deleted', 'Menu item deleted successfully.', [
                  { text: 'OK', onPress: () => router.back() },
                ]);
              } else {
                Alert.alert(
                  'Delete Failed',
                  res.message?.includes('Owner access required')
                    ? 'Owner access required. Please sign in with the Restaurant Owner account to delete this item.'
                    : (res.message || 'Failed to delete item.')
                );
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete item.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const totalCustomizationsCount = variantGroups.length + addonGroups.length;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <Header
        title={isEditMode ? 'Edit Menu Item' : 'Add New Item'}
        showBackButton={true}
        rightElement={
          isEditMode ? (
            <TouchableOpacity
              onPress={handleDeleteThisItem}
              disabled={deleting || submitting}
              style={styles.headerDeleteBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Trash2 size={17} color="#DC2626" />
            </TouchableOpacity>
          ) : undefined
        }
      />

      {/* Modern Segmented Navigation Tabs */}
      <View style={styles.tabsHeaderContainer}>
        <View style={styles.tabsHeader}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'basic' && styles.tabBtnActive]}
            onPress={() => setActiveTab('basic')}
            activeOpacity={0.8}
          >
            <Utensils size={14} color={activeTab === 'basic' ? '#FFFFFF' : '#64748B'} style={{ marginRight: 6 }} />
            <Text style={[styles.tabLabel, activeTab === 'basic' && styles.tabLabelActive]}>
              Basic & Pricing
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'custom' && styles.tabBtnActive]}
            onPress={() => setActiveTab('custom')}
            activeOpacity={0.8}
          >
            <Layers size={14} color={activeTab === 'custom' ? '#FFFFFF' : '#64748B'} style={{ marginRight: 6 }} />
            <Text style={[styles.tabLabel, activeTab === 'custom' && styles.tabLabelActive]}>
              Variants & Addons
            </Text>
            {totalCustomizationsCount > 0 && (
              <View style={[styles.tabBadge, activeTab === 'custom' ? styles.tabBadgeActive : styles.tabBadgeInactive]}>
                <Text style={[styles.tabBadgeText, activeTab === 'custom' && { color: '#0F172A' }]}>
                  {totalCustomizationsCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#FF5C39" />
          <Text style={styles.loadingText}>Fetching dish details...</Text>
        </View>
      ) : (
        <ScrollView style={styles.formBody} contentContainerStyle={{ paddingBottom: 70 }} showsVerticalScrollIndicator={false}>
          {/* TAB 1: BASIC INFO & PRICING */}
          {activeTab === 'basic' && (
            <View style={styles.tabContent}>
              {/* CARD 1: Image Upload Box */}
              <View style={styles.cardSection}>
                <View style={styles.sectionHeaderRow}>
                  <Camera size={16} color="#FF5C39" />
                  <Text style={styles.sectionHeading}>Dish Photograph</Text>
                </View>
                <Text style={styles.sectionSub}>Upload a crisp, mouth-watering photo for customer app display</Text>

                <TouchableOpacity style={styles.imageBox} onPress={pickImage} activeOpacity={0.88}>
                  {imageUri ? (
                    <Image source={{ uri: imageUri }} style={styles.imagePreview} />
                  ) : existingImageUrl ? (
                    <Image source={{ uri: existingImageUrl }} style={styles.imagePreview} />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <View style={styles.uploadIconCircle}>
                        <Camera size={24} color="#FF5C39" />
                      </View>
                      <Text style={styles.imagePlaceholderTitle}>Upload Dish Cover</Text>
                      <Text style={styles.imagePlaceholderSub}>PNG, JPG or WEBP (Max 5MB)</Text>
                    </View>
                  )}

                  {(imageUri || existingImageUrl) && (
                    <View style={styles.imageOverlayAction}>
                      <Camera size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                      <Text style={styles.imageOverlayActionText}>Change Photo</Text>
                    </View>
                  )}
                </TouchableOpacity>

                {(imageUri || existingImageUrl) && (
                  <TouchableOpacity
                    style={styles.removeImageBtn}
                    onPress={() => {
                      setImageUri(null);
                      setExistingImageUrl(null);
                    }}
                  >
                    <Trash2 size={13} color="#DC2626" style={{ marginRight: 4 }} />
                    <Text style={styles.removeImageText}>Remove Photo</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* CARD 2: General Details */}
              <View style={styles.cardSection}>
                <View style={styles.sectionHeaderRow}>
                  <Utensils size={16} color="#0F172A" />
                  <Text style={styles.sectionHeading}>Dish Information</Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>
                    Dish / Item Name <Text style={styles.requiredMark}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Gourmet Truffle Smash Burger"
                    placeholderTextColor="#94A3B8"
                    value={formState.itemName}
                    onChangeText={(val) => handleChange('itemName', val)}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Category</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                    {categories.map((cat) => {
                      const isSelected = formState.category === cat.categoryName;
                      return (
                        <TouchableOpacity
                          key={cat._id}
                          style={[styles.catChip, isSelected && styles.catChipActive]}
                          onPress={() => handleChange('category', cat.categoryName)}
                          activeOpacity={0.7}
                        >
                          {isSelected && <Check size={13} color="#FFFFFF" style={{ marginRight: 4 }} />}
                          <Text style={[styles.catChipLabel, isSelected && styles.catChipLabelActive]}>
                            {cat.categoryName}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Description</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Describe flavour profile, core ingredients, allergen alerts, and serving size..."
                    placeholderTextColor="#94A3B8"
                    multiline
                    numberOfLines={4}
                    value={formState.description}
                    onChangeText={(val) => handleChange('description', val)}
                  />
                </View>
              </View>

              {/* CARD 3: Dietary Classification */}
              <View style={styles.cardSection}>
                <View style={styles.sectionHeaderRow}>
                  <Tag size={16} color="#16A34A" />
                  <Text style={styles.sectionHeading}>Dietary Classification</Text>
                </View>
                <Text style={styles.sectionSub}>Indicates food badge color and filtering options for customers</Text>

                <View style={styles.dietaryRow}>
                  {[
                    { id: 'veg', label: 'Pure Veg', color: '#16A34A', bg: '#DCFCE7', border: '#86EFAC', icon: '🟢' },
                    { id: 'non-veg', label: 'Non-Veg', color: '#DC2626', bg: '#FEE2E2', border: '#FCA5A5', icon: '🔴' },
                    { id: 'egg', label: 'Contains Egg', color: '#D97706', bg: '#FEF3C7', border: '#FDE68A', icon: '🟡' },
                  ].map((diet) => {
                    const isSelected = formState.itemType === diet.id;
                    return (
                      <TouchableOpacity
                        key={diet.id}
                        style={[
                          styles.dietaryCard,
                          isSelected && { borderColor: diet.color, backgroundColor: diet.bg },
                        ]}
                        onPress={() => handleChange('itemType', diet.id)}
                        activeOpacity={0.75}
                      >
                        <Text style={{ fontSize: 18, marginBottom: 4 }}>{diet.icon}</Text>
                        <Text style={[styles.dietaryCardLabel, isSelected && { color: diet.color, fontWeight: '800' }]}>
                          {diet.label}
                        </Text>
                        {isSelected && (
                          <View style={[styles.dietarySelectedDot, { backgroundColor: diet.color }]}>
                            <Check size={10} color="#FFFFFF" strokeWidth={3} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* CARD 4: Pricing Scheme & Live Price Preview */}
              <View style={styles.cardSection}>
                <View style={styles.sectionHeaderRow}>
                  <Coins size={16} color="#0F172A" />
                  <Text style={styles.sectionHeading}>Pricing & Channels</Text>
                </View>

                {/* Scheme Segmented Buttons */}
                <View style={styles.pricingSchemePills}>
                  {[
                    { id: 'fixed', label: 'Fixed Price' },
                    { id: 'weight', label: 'By Weight' },
                    { id: 'portion', label: 'By Portion' },
                  ].map((mode) => (
                    <TouchableOpacity
                      key={mode.id}
                      style={[
                        styles.pricingSchemePill,
                        formState.pricingType === mode.id && styles.pricingSchemePillActive,
                      ]}
                      onPress={() => handleChange('pricingType', mode.id)}
                    >
                      <Text
                        style={[
                          styles.pricingSchemePillText,
                          formState.pricingType === mode.id && styles.pricingSchemePillTextActive,
                        ]}
                      >
                        {mode.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {formState.pricingType === 'fixed' ? (
                  <View style={{ gap: 14 }}>
                    <View style={styles.rowInputs}>
                      <View style={[styles.inputGroup, { flex: 1.2 }]}>
                        <Text style={styles.inputLabel}>
                          Base Price (£) <Text style={styles.requiredMark}>*</Text>
                        </Text>
                        <View style={styles.priceInputWrapper}>
                          <Text style={styles.currencyPrefix}>£</Text>
                          <TextInput
                            style={styles.priceInput}
                            keyboardType="numeric"
                            placeholder="9.99"
                            placeholderTextColor="#94A3B8"
                            value={formState.basePrice}
                            onChangeText={(val) => handleChange('basePrice', val)}
                          />
                        </View>
                      </View>

                      <View style={[styles.inputGroup, { flex: 1 }]}>
                        <Text style={styles.inputLabel}>Discount (%)</Text>
                        <View style={styles.priceInputWrapper}>
                          <TextInput
                            style={[styles.priceInput, { paddingLeft: 12 }]}
                            keyboardType="numeric"
                            placeholder="0"
                            placeholderTextColor="#94A3B8"
                            value={formState.discountPercentage}
                            onChangeText={(val) => handleChange('discountPercentage', val)}
                          />
                          <Text style={styles.percentSuffix}>%</Text>
                        </View>
                      </View>
                    </View>

                    {/* Live Pricing Preview Pill */}
                    {calculatedDiscountedPrice !== null && (
                      <View style={styles.livePriceBanner}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Percent size={14} color="#16A34A" />
                          <Text style={styles.livePriceText}>
                            Base: <Text style={{ fontWeight: '700' }}>£{Number(formState.basePrice || 0).toFixed(2)}</Text>
                            {Number(formState.discountPercentage) > 0 && (
                              <Text style={{ color: '#DC2626' }}> -{formState.discountPercentage}% OFF</Text>
                            )}
                          </Text>
                        </View>
                        <View style={styles.livePriceFinalPill}>
                          <Text style={styles.livePriceFinalText}>
                            Final: £{Number(calculatedDiscountedPrice).toFixed(2)}
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Specific Channel Overrides */}
                    <Text style={[styles.inputLabel, { marginTop: 6 }]}>Channel-Specific Prices (Optional)</Text>
                    <View style={styles.rowInputs}>
                      <View style={[styles.inputGroup, { flex: 1 }]}>
                        <View style={styles.channelLabelRow}>
                          <Truck size={11} color="#64748B" />
                          <Text style={styles.channelInputLabel}>Delivery</Text>
                        </View>
                        <TextInput
                          style={styles.channelInput}
                          keyboardType="numeric"
                          placeholder="Auto"
                          placeholderTextColor="#94A3B8"
                          value={formState.deliveryPrice}
                          onChangeText={(val) => handleChange('deliveryPrice', val)}
                        />
                      </View>

                      <View style={[styles.inputGroup, { flex: 1 }]}>
                        <View style={styles.channelLabelRow}>
                          <ShoppingBag size={11} color="#64748B" />
                          <Text style={styles.channelInputLabel}>Pickup</Text>
                        </View>
                        <TextInput
                          style={styles.channelInput}
                          keyboardType="numeric"
                          placeholder="Auto"
                          placeholderTextColor="#94A3B8"
                          value={formState.collectionPrice}
                          onChangeText={(val) => handleChange('collectionPrice', val)}
                        />
                      </View>

                      <View style={[styles.inputGroup, { flex: 1 }]}>
                        <View style={styles.channelLabelRow}>
                          <Store size={11} color="#64748B" />
                          <Text style={styles.channelInputLabel}>Dine-in</Text>
                        </View>
                        <TextInput
                          style={styles.channelInput}
                          keyboardType="numeric"
                          placeholder="Auto"
                          placeholderTextColor="#94A3B8"
                          value={formState.eatInPrice}
                          onChangeText={(val) => handleChange('eatInPrice', val)}
                        />
                      </View>
                    </View>
                  </View>
                ) : formState.pricingType === 'weight' ? (
                  <View style={{ gap: 14 }}>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Weight Unit Metric</Text>
                      <View style={styles.weightUnitRow}>
                        {['gm', 'kg', 'ml', 'l', 'pcs', 'pack'].map((unit) => (
                          <TouchableOpacity
                            key={unit}
                            style={[
                              styles.weightUnitChip,
                              formState.weightUnit === unit && styles.weightUnitChipActive,
                            ]}
                            onPress={() => handleChange('weightUnit', unit)}
                          >
                            <Text
                              style={[
                                styles.weightUnitText,
                                formState.weightUnit === unit && styles.weightUnitTextActive,
                              ]}
                            >
                              {unit.toUpperCase()}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    <View style={styles.arrayHeader}>
                      <View style={styles.arrayTitleRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                          <Scale size={16} color="#0F172A" />
                          <Text style={styles.sectionHeading}>Weight Tiers</Text>
                        </View>
                        <TouchableOpacity style={styles.arrayAddBtn} onPress={addWeightVariant} activeOpacity={0.8}>
                          <Plus size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                          <Text style={styles.arrayAddText}>Add Tier</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.arraySub}>Define custom weights and specific prices</Text>
                    </View>

                    {weightVariants.length === 0 ? (
                      <View style={styles.emptyArrayBox}>
                        <Scale size={24} color="#94A3B8" />
                        <Text style={styles.emptyArrayText}>No weight tiers added yet</Text>
                      </View>
                    ) : (
                      weightVariants.map((wv, index) => (
                        <View key={index} style={styles.weightRowCard}>
                          <TextInput
                            style={[styles.input, { flex: 2, marginRight: 8 }]}
                            placeholder="e.g. 250"
                            placeholderTextColor="#94A3B8"
                            keyboardType="numeric"
                            value={String(wv.weight || '')}
                            onChangeText={(val) => updateWeightVariant(index, 'weight', val)}
                          />
                          <Text style={styles.unitText}>{formState.weightUnit}</Text>
                          <TextInput
                            style={[styles.input, { flex: 2, marginLeft: 8, marginRight: 8 }]}
                            placeholder="£ Price"
                            placeholderTextColor="#94A3B8"
                            keyboardType="numeric"
                            value={String(wv.price || '')}
                            onChangeText={(val) => updateWeightVariant(index, 'price', val)}
                          />
                          <TouchableOpacity onPress={() => removeWeightVariant(index)}>
                            <Trash2 size={16} color="#DC2626" />
                          </TouchableOpacity>
                        </View>
                      ))
                    )}
                  </View>
                ) : (
                  <View style={styles.portionNoticeCard}>
                    <Info size={16} color="#3B82F6" />
                    <Text style={styles.portionNoticeText}>
                      Portion pricing is controlled via the <Text style={{ fontWeight: '800' }}>Variants & Addons</Text> tab. Configure sizes (e.g. Small, Regular, Large) with distinct prices there.
                    </Text>
                  </View>
                )}
              </View>

              {/* CARD 5: Marketing & Promotional Tags */}
              <View style={styles.cardSection}>
                <View style={styles.sectionHeaderRow}>
                  <Sparkles size={16} color="#D97706" />
                  <Text style={styles.sectionHeading}>Promotions & Badges</Text>
                </View>

                {/* Bestseller Toggle Card */}
                <View style={styles.promoToggleCard}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 15 }}>⭐</Text>
                      <Text style={styles.promoToggleTitle}>Platform Bestseller</Text>
                    </View>
                    <Text style={styles.promoToggleSub}>Highlight this dish with a glowing Bestseller badge in the catalog</Text>
                  </View>
                  <Switch
                    value={formState.isBestseller}
                    onValueChange={(val) => handleChange('isBestseller', val)}
                    trackColor={{ true: '#F59E0B', false: '#E2E8F0' }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                {/* BOGO Toggle Card */}
                <View style={[styles.promoToggleCard, { marginTop: 10 }]}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Gift size={16} color="#7C3AED" />
                      <Text style={styles.promoToggleTitle}>Buy 1 Get 1 Free (BOGO)</Text>
                    </View>
                    <Text style={styles.promoToggleSub}>Applies promotional 2-for-1 discount automatically at checkout</Text>
                  </View>
                  <Switch
                    value={formState.isBuyOneGetOne}
                    onValueChange={(val) => handleChange('isBuyOneGetOne', val)}
                    trackColor={{ true: '#7C3AED', false: '#E2E8F0' }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                {/* Custom Offer Tag */}
                <View style={[styles.inputGroup, { marginTop: 12 }]}>
                  <Text style={styles.inputLabel}>Custom Offer Tag</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. CHEF SPECIAL or WEEKEND OFFER"
                    placeholderTextColor="#94A3B8"
                    value={formState.offerTag}
                    onChangeText={(val) => handleChange('offerTag', val)}
                  />
                </View>
              </View>

              {/* CARD 6: Stock & Limits */}
              <View style={styles.cardSection}>
                <View style={styles.sectionHeaderRow}>
                  <Package size={16} color="#0F172A" />
                  <Text style={styles.sectionHeading}>Inventory & Order Limits</Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Stock Count</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    placeholder="Leave empty for unlimited stock"
                    placeholderTextColor="#94A3B8"
                    value={formState.stock}
                    onChangeText={(val) => handleChange('stock', val)}
                  />
                </View>

                <View style={styles.rowInputs}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Min Order Qty</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={formState.minimumQuantity}
                      onChangeText={(val) => handleChange('minimumQuantity', val)}
                    />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Max Order Qty</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      value={formState.maximumQuantity}
                      onChangeText={(val) => handleChange('maximumQuantity', val)}
                    />
                  </View>
                </View>
              </View>

              {/* CARD 7: Fulfillment Channels */}
              <View style={styles.cardSection}>
                <View style={styles.sectionHeaderRow}>
                  <Truck size={16} color="#0F172A" />
                  <Text style={styles.sectionHeading}>Order Fulfillment Channels</Text>
                </View>
                <Text style={styles.sectionSub}>Enable or disable which customer channels can order this dish</Text>

                <View style={{ gap: 8 }}>
                  <View style={styles.channelToggleRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={[styles.channelIconBox, { backgroundColor: '#EFF6FF' }]}>
                        <Truck size={16} color="#2563EB" />
                      </View>
                      <View>
                        <Text style={styles.channelRowTitle}>Delivery</Text>
                        <Text style={styles.channelRowSub}>Available for home & office delivery</Text>
                      </View>
                    </View>
                    <Switch
                      value={formState.availableForDelivery}
                      onValueChange={(val) => handleChange('availableForDelivery', val)}
                      trackColor={{ true: '#10B981', false: '#E2E8F0' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>

                  <View style={styles.channelToggleRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={[styles.channelIconBox, { backgroundColor: '#F0FDF4' }]}>
                        <Store size={16} color="#16A34A" />
                      </View>
                      <View>
                        <Text style={styles.channelRowTitle}>Dine-in</Text>
                        <Text style={styles.channelRowSub}>Available for table order & QR menu</Text>
                      </View>
                    </View>
                    <Switch
                      value={formState.availableForEatIn}
                      onValueChange={(val) => handleChange('availableForEatIn', val)}
                      trackColor={{ true: '#10B981', false: '#E2E8F0' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>

                  <View style={styles.channelToggleRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={[styles.channelIconBox, { backgroundColor: '#FAF5FF' }]}>
                        <ShoppingBag size={16} color="#7C3AED" />
                      </View>
                      <View>
                        <Text style={styles.channelRowTitle}>Pickup / Collection</Text>
                        <Text style={styles.channelRowSub}>Available for takeaway pickup</Text>
                      </View>
                    </View>
                    <Switch
                      value={formState.availableForCollection}
                      onValueChange={(val) => handleChange('availableForCollection', val)}
                      trackColor={{ true: '#10B981', false: '#E2E8F0' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* TAB 2: OPTIONS & CUSTOMIZATIONS */}
          {activeTab === 'custom' && (
            <View style={styles.tabContent}>
              {/* Variant Groups (Sizes) Section */}
              <View style={styles.cardSection}>
                <View style={styles.arrayHeader}>
                  <View style={styles.arrayTitleRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                      <Layers size={16} color="#0F172A" />
                      <Text style={styles.sectionHeading}>Portion Sizes</Text>
                    </View>
                    <TouchableOpacity style={styles.arrayAddBtn} onPress={addVariantGroup} activeOpacity={0.8}>
                      <Plus size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                      <Text style={styles.arrayAddText}>Add Size Group</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.arraySub}>Customer selects one size option (e.g. Regular, Large)</Text>
                </View>

                {variantGroups.length === 0 ? (
                  <View style={styles.emptyArrayBox}>
                    <Layers size={28} color="#94A3B8" />
                    <Text style={styles.emptyArrayText}>No size variations configured.</Text>
                    <Text style={styles.emptyArraySub}>Add a portion group like "Pizza Size" or "Portion".</Text>
                  </View>
                ) : (
                  variantGroups.map((g, gidx) => (
                    <View key={gidx} style={styles.customGroupCard}>
                      <View style={styles.groupHeader}>
                        <TextInput
                          style={[styles.input, { flex: 1, marginRight: 10, fontWeight: '700' }]}
                          placeholder="Group Title (e.g. Portion Size)"
                          placeholderTextColor="#94A3B8"
                          value={g.groupTitle}
                          onChangeText={(val) => updateVariantGroupTitle(gidx, val)}
                        />
                        <TouchableOpacity onPress={() => removeVariantGroup(gidx)} style={styles.groupTrashBtn}>
                          <Trash2 size={16} color="#DC2626" />
                        </TouchableOpacity>
                      </View>

                      <Text style={styles.optionsLabel}>Size Choices & Additional Price (£):</Text>
                      {g.variants?.map((v: any, vidx: number) => (
                        <View key={vidx} style={styles.optionRow}>
                          <TextInput
                            style={[styles.input, { flex: 3, marginRight: 8 }]}
                            placeholder="Option Name (e.g. Large)"
                            placeholderTextColor="#94A3B8"
                            value={v.variantName}
                            onChangeText={(val) => updateVariantOption(gidx, vidx, 'variantName', val)}
                          />
                          <TextInput
                            style={[styles.input, { flex: 2, marginRight: 8 }]}
                            placeholder="+£ Extra"
                            placeholderTextColor="#94A3B8"
                            keyboardType="numeric"
                            value={String(v.additionalPrice || '')}
                            onChangeText={(val) => updateVariantOption(gidx, vidx, 'additionalPrice', val)}
                          />
                          <TouchableOpacity onPress={() => removeVariantOption(gidx, vidx)} style={styles.optionRemoveBtn}>
                            <X size={15} color="#94A3B8" />
                          </TouchableOpacity>
                        </View>
                      ))}

                      <TouchableOpacity style={styles.addOptionBtn} onPress={() => addVariantOption(gidx)}>
                        <Plus size={12} color="#0F172A" style={{ marginRight: 4 }} />
                        <Text style={styles.addOptionText}>Add Another Size Choice</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>

              {/* Addon Groups (Extras) Section */}
              <View style={styles.cardSection}>
                <View style={styles.arrayHeader}>
                  <View style={styles.arrayTitleRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                      <Plus size={16} color="#7C3AED" />
                      <Text style={styles.sectionHeading}>Extras & Add-ons</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.arrayAddBtn, { backgroundColor: '#7C3AED' }]}
                      onPress={addAddonGroup}
                      activeOpacity={0.8}
                    >
                      <Plus size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                      <Text style={styles.arrayAddText}>Add Add-on Group</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.arraySub}>Customer can pick multiple toppings or additions</Text>
                </View>

                {addonGroups.length === 0 ? (
                  <View style={styles.emptyArrayBox}>
                    <Tag size={28} color="#94A3B8" />
                    <Text style={styles.emptyArrayText}>No extras or add-ons defined.</Text>
                    <Text style={styles.emptyArraySub}>Add groups like "Extra Cheese", "Sauces" or "Dips".</Text>
                  </View>
                ) : (
                  addonGroups.map((g, gidx) => (
                    <View key={gidx} style={[styles.customGroupCard, { borderColor: '#DDD6FE' }]}>
                      <View style={styles.groupHeader}>
                        <TextInput
                          style={[styles.input, { flex: 1, marginRight: 10, fontWeight: '700' }]}
                          placeholder="Extras Title (e.g. Extra Toppings)"
                          placeholderTextColor="#94A3B8"
                          value={g.groupTitle}
                          onChangeText={(val) => updateAddonGroupField(gidx, 'groupTitle', val)}
                        />
                        <TouchableOpacity onPress={() => removeAddonGroup(gidx)} style={styles.groupTrashBtn}>
                          <Trash2 size={16} color="#DC2626" />
                        </TouchableOpacity>
                      </View>

                      <View style={styles.addonSettingRow}>
                        <Text style={styles.addonSettingLabel}>Selection Requirement:</Text>
                        <View style={styles.selectorSmall}>
                          {['compulsory', 'optional'].map((mode) => (
                            <TouchableOpacity
                              key={mode}
                              style={[
                                styles.selectorSmallItem,
                                g.customizationBehavior === mode && styles.selectorSmallItemActive,
                              ]}
                              onPress={() => updateAddonGroupField(gidx, 'customizationBehavior', mode)}
                            >
                              <Text
                                style={[
                                  styles.selectorSmallLabel,
                                  g.customizationBehavior === mode && { color: '#7C3AED', fontWeight: '800' },
                                ]}
                              >
                                {mode.toUpperCase()}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>

                      <View style={styles.rowInputs}>
                        <View style={[styles.inputGroup, { flex: 1 }]}>
                          <Text style={styles.addonSettingLabel}>Min Picks</Text>
                          <TextInput
                            style={[styles.input, { height: 40 }]}
                            keyboardType="numeric"
                            value={String(g.minSelection ?? '0')}
                            onChangeText={(val) => updateAddonGroupField(gidx, 'minSelection', val)}
                          />
                        </View>
                        <View style={[styles.inputGroup, { flex: 1 }]}>
                          <Text style={styles.addonSettingLabel}>Max Picks</Text>
                          <TextInput
                            style={[styles.input, { height: 40 }]}
                            keyboardType="numeric"
                            value={String(g.maxSelection ?? '5')}
                            onChangeText={(val) => updateAddonGroupField(gidx, 'maxSelection', val)}
                          />
                        </View>
                      </View>

                      <Text style={[styles.optionsLabel, { marginTop: 10 }]}>Add-on Items & Extra Price (£):</Text>
                      {g.addons?.map((a: any, aidx: number) => (
                        <View key={aidx} style={styles.optionRow}>
                          <TextInput
                            style={[styles.input, { flex: 3, marginRight: 8 }]}
                            placeholder="Choice Name (e.g. Mozzarella)"
                            placeholderTextColor="#94A3B8"
                            value={a.optionTitle}
                            onChangeText={(val) => updateAddonOption(gidx, aidx, 'optionTitle', val)}
                          />
                          <TextInput
                            style={[styles.input, { flex: 2, marginRight: 8 }]}
                            placeholder="+£ Price"
                            placeholderTextColor="#94A3B8"
                            keyboardType="numeric"
                            value={String(a.price || '')}
                            onChangeText={(val) => updateAddonOption(gidx, aidx, 'price', val)}
                          />
                          <TouchableOpacity onPress={() => removeAddonOption(gidx, aidx)} style={styles.optionRemoveBtn}>
                            <X size={15} color="#94A3B8" />
                          </TouchableOpacity>
                        </View>
                      ))}

                      <TouchableOpacity style={styles.addOptionBtn} onPress={() => addAddonOption(gidx)}>
                        <Plus size={12} color="#7C3AED" style={{ marginRight: 4 }} />
                        <Text style={[styles.addOptionText, { color: '#7C3AED' }]}>Add Extras Choice</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            </View>
          )}

          {/* Form Actions Footer */}
          <View style={styles.formFooterActions}>
            <TouchableOpacity
              style={[styles.saveBtn, (submitting || deleting) && { opacity: 0.7 }]}
              disabled={submitting || deleting}
              onPress={handleSaveItem}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Save size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.saveBtnText}>
                    {isEditMode ? 'Update Dish Details' : 'Publish Dish to Catalog'}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {isEditMode && (
              <TouchableOpacity
                style={[styles.deleteItemBtn, (deleting || submitting) && { opacity: 0.6 }]}
                disabled={deleting || submitting}
                onPress={handleDeleteThisItem}
                activeOpacity={0.8}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#DC2626" />
                ) : (
                  <>
                    <Trash2 size={16} color="#DC2626" style={{ marginRight: 6 }} />
                    <Text style={styles.deleteItemBtnText}>Permanently Delete This Dish</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  headerDeleteBtn: {
    padding: 7,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    marginRight: 4,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    color: '#64748B',
    fontSize: 13,
    marginTop: 10,
    fontWeight: '600',
  },
  tabsHeaderContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tabsHeader: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 9,
  },
  tabBtnActive: {
    backgroundColor: '#0F172A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#64748B',
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
  tabBadge: {
    marginLeft: 6,
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeActive: {
    backgroundColor: '#FFFFFF',
  },
  tabBadgeInactive: {
    backgroundColor: '#CBD5E1',
  },
  tabBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  formBody: {
    flex: 1,
    padding: 16,
  },
  tabContent: {
    gap: 16,
  },
  cardSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sectionHeading: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  sectionSub: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
    marginBottom: 14,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  requiredMark: {
    color: '#DC2626',
    fontWeight: '800',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1.2,
    borderRadius: 11,
    paddingHorizontal: 13,
    height: 46,
    fontSize: 13.5,
    color: '#0F172A',
  },
  textArea: {
    height: 95,
    paddingTop: 11,
    textAlignVertical: 'top',
    lineHeight: 19,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 10,
  },
  categoryScroll: {
    flexDirection: 'row',
    paddingVertical: 2,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1.2,
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 7,
    marginRight: 8,
  },
  catChipActive: {
    borderColor: '#0F172A',
    backgroundColor: '#0F172A',
  },
  catChipLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  catChipLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  dietaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dietaryCard: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    position: 'relative',
  },
  dietaryCardLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  dietarySelectedDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pricingSchemePills: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
  },
  pricingSchemePill: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  pricingSchemePillActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  pricingSchemePillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  pricingSchemePillTextActive: {
    color: '#0F172A',
  },
  priceInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1.2,
    borderRadius: 11,
    overflow: 'hidden',
  },
  currencyPrefix: {
    paddingLeft: 13,
    fontSize: 15,
    fontWeight: '800',
    color: '#475569',
  },
  percentSuffix: {
    paddingRight: 13,
    fontSize: 14,
    fontWeight: '800',
    color: '#475569',
  },
  priceInput: {
    flex: 1,
    height: 46,
    paddingHorizontal: 8,
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  livePriceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  livePriceText: {
    fontSize: 12,
    color: '#166534',
  },
  livePriceFinalPill: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  livePriceFinalText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 11.5,
  },
  channelLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 5,
  },
  channelInputLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  channelInput: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1.2,
    borderRadius: 9,
    paddingHorizontal: 10,
    height: 40,
    fontSize: 13,
    color: '#0F172A',
  },
  weightUnitRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  weightUnitChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  weightUnitChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  weightUnitText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  weightUnitTextActive: {
    color: '#FFFFFF',
  },
  weightRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  unitText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
  },
  emptyArrayBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  emptyArrayText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginTop: 6,
  },
  emptyArraySub: {
    fontSize: 11.5,
    color: '#94A3B8',
    marginTop: 2,
  },
  portionNoticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    padding: 12,
  },
  portionNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#1E40AF',
    lineHeight: 17,
  },
  promoToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
  },
  promoToggleTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  promoToggleSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
  channelToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
  },
  channelIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelRowTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  channelRowSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  arrayHeader: {
    marginBottom: 14,
  },
  arrayTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  arrayTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  arraySub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 16,
  },
  arrayAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
    flexShrink: 0,
  },
  arrayAddText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  customGroupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 14,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  groupTrashBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
  },
  optionsLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  optionRemoveBtn: {
    padding: 6,
  },
  addOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    paddingVertical: 5,
  },
  addOptionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  addonSettingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  addonSettingLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  selectorSmall: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    padding: 2,
    borderRadius: 8,
  },
  selectorSmallItem: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  selectorSmallItemActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  selectorSmallLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
  },
  imageBox: {
    width: '100%',
    height: 180,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  uploadIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFF1EE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  imagePlaceholderTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#334155',
  },
  imagePlaceholderSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  imageOverlayAction: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  imageOverlayActionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  removeImageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  removeImageText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  formFooterActions: {
    marginTop: 16,
    marginBottom: 24,
    gap: 12,
  },
  saveBtn: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  deleteItemBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FECACA',
    borderRadius: 14,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteItemBtnText: {
    color: '#DC2626',
    fontWeight: '800',
    fontSize: 14,
  },
});
