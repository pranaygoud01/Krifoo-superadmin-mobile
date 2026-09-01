import React, { useState, useEffect } from 'react';
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
import { ArrowLeft, Save, Plus, Trash2, Check, HelpCircle, AlertTriangle, X } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import * as ImagePicker from 'expo-image-picker';

export default function AddEditMenuScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const isEditMode = !!id;
  const { user } = useAuth();
  const restaurantId = (typeof user?.restaurantId === 'object' ? user?.restaurantId?._id : user?.restaurantId) || user?._id || '';

  const [activeTab, setActiveTab] = useState<'basic' | 'custom'>('basic');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);

  // Form State
  const [formState, setFormState] = useState({
    itemName: '',
    description: '',
    isFood: true,
    itemType: 'veg' as 'veg' | 'non-veg' | 'egg',
    basePrice: '',
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
          if (res.data.length > 0 && !formState.category) {
            setFormState((prev) => ({ ...prev, category: res.data[0].categoryName }));
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
        const res = await menuService.getRestaurantMenu(restaurantId); // Pass restaurantId
        const item = res.data?.find((i) => i._id === id);
        if (item) {
          setFormState({
            itemName: item.itemName || item.name || '',
            description: item.description || '',
            isFood: item.isFood !== false,
            itemType: (item.itemType || 'veg') as any,
            basePrice: String(item.basePrice ?? item.price ?? '0'),
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
            setExistingImageUrl(item.displayImageUrl || item.displayImage);
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
    setWeightVariants((prev) => [...prev, { variantName: '', weight: '', unit: formState.weightUnit, price: '' }]);
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
    setVariantGroups((prev) => [...prev, { groupTitle: '', variants: [{ variantName: '', additionalPrice: '' }] }]);
  };

  const updateVariantGroupTitle = (index: number, title: string) => {
    setVariantGroups((prev) =>
      prev.map((g, idx) => (idx === index ? { ...g, groupTitle: title } : g))
    );
  };

  const addVariantOption = (groupIndex: number) => {
    setVariantGroups((prev) =>
      prev.map((g, idx) =>
        idx === groupIndex ? { ...g, variants: [...g.variants, { variantName: '', additionalPrice: '' }] } : g
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
      { groupTitle: '', customizationBehavior: 'optional', minSelection: '0', maxSelection: '5', addons: [{ optionTitle: '', price: '' }] },
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

  // --- Form Submit ---
  const handleSaveItem = async () => {
    const f = formState;
    if (!f.itemName.trim()) return Alert.alert('Error', 'Item name is required.');
    if (f.pricingType === 'fixed') {
      if (!f.basePrice.trim() || isNaN(Number(f.basePrice))) {
        return Alert.alert('Error', 'Please enter a valid base price.');
      }
    }

    if (!f.availableForDelivery && !f.availableForEatIn && !f.availableForCollection) {
      return Alert.alert('Error', 'At least one availability option must be enabled.');
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
      uploadData.append('isBestseller', String(f.isBestseller));
      uploadData.append('isBuyOneGetOne', String(f.isBuyOneGetOne));
      uploadData.append('offerTag', f.offerTag || '');

      uploadData.append('availableForDelivery', String(f.availableForDelivery));
      uploadData.append('availableForEatIn', String(f.availableForEatIn));
      uploadData.append('availableForCollection', String(f.availableForCollection));

      if (f.pricingType === 'fixed') {
        uploadData.append('basePrice', f.basePrice);
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

      // Add Customizations
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
        Alert.alert('Error', res.message || 'Failed to save menu item.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <Header title={isEditMode ? 'Edit Menu Item' : 'New Menu Item'} showBackButton={true} />

      {/* Tabs */}
      <View style={styles.tabsHeader}>
        {[
          { id: 'basic', label: 'Basic Info & Pricing' },
          { id: 'custom', label: 'Options & Customizations' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tabBtn, activeTab === tab.id && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab.id as any)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Fetching menu details...</Text>
        </View>
      ) : (
        <ScrollView style={styles.formBody} showsVerticalScrollIndicator={false}>
          {/* TAB 1: BASIC INFO & PRICING */}
          {activeTab === 'basic' && (
            <View style={styles.tabContent}>
              {/* Image Picker Box */}
              <View style={styles.imagePickerContainer}>
                <Text style={styles.label}>Product Image</Text>
                <TouchableOpacity style={styles.imageBox} onPress={pickImage} activeOpacity={0.85}>
                  {imageUri ? (
                    <Image source={{ uri: imageUri }} style={styles.imagePreview} />
                  ) : existingImageUrl ? (
                    <Image source={{ uri: existingImageUrl }} style={styles.imagePreview} />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <Plus size={20} color={Colors.textSubtle} style={{ marginBottom: 4 }} />
                      <Text style={styles.imagePlaceholderText}>Upload Display Image</Text>
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
                    <Text style={styles.removeImageText}>Remove Image</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Dish / Item Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Classic Margherita Pizza"
                  value={formState.itemName}
                  onChangeText={(val) => handleChange('itemName', val)}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryRow}>
                  {categories.map((cat) => (
                    <TouchableOpacity
                      key={cat._id}
                      style={[
                        styles.catChip,
                        formState.category === cat.categoryName && styles.catChipActive,
                      ]}
                      onPress={() => handleChange('category', cat.categoryName)}
                    >
                      <Text
                        style={[
                          styles.catChipLabel,
                          formState.category === cat.categoryName && styles.catChipLabelActive,
                        ]}
                      >
                        {cat.categoryName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Pricing Scheme */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Pricing Scheme</Text>
                <View style={styles.radioRow}>
                  {[
                    { label: 'Fixed Price', value: 'fixed' },
                    { label: 'By Weight', value: 'weight' },
                    { label: 'By Portion Size', value: 'portion' },
                  ].map((mode) => (
                    <TouchableOpacity
                      key={mode.value}
                      style={[
                        styles.radioItem,
                        formState.pricingType === mode.value && styles.radioItemActive,
                      ]}
                      onPress={() => handleChange('pricingType', mode.value)}
                    >
                      <Text
                        style={[
                          styles.radioLabel,
                          formState.pricingType === mode.value && styles.radioLabelActive,
                        ]}
                      >
                        {mode.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {formState.pricingType === 'fixed' ? (
                <View style={styles.subSection}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Base Price (€) *</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      placeholder="e.g. 9.99"
                      value={formState.basePrice}
                      onChangeText={(val) => handleChange('basePrice', val)}
                    />
                  </View>

                  <View style={styles.toggleItem}>
                    <View>
                      <Text style={styles.toggleTitle}>Platform Bestseller</Text>
                      <Text style={styles.toggleSub}>Highlight item with bestseller tag</Text>
                    </View>
                    <Switch
                      value={formState.isBestseller}
                      onValueChange={(val) => handleChange('isBestseller', val)}
                      trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                      thumbColor={formState.isBestseller ? Colors.primary : Colors.textSubtle}
                    />
                  </View>

                  <View style={styles.toggleItem}>
                    <View>
                      <Text style={styles.toggleTitle}>Buy 1 Get 1 Free (BOGO)</Text>
                      <Text style={styles.toggleSub}>Double delivery quantity automatically</Text>
                    </View>
                    <Switch
                      value={formState.isBuyOneGetOne}
                      onValueChange={(val) => handleChange('isBuyOneGetOne', val)}
                      trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                      thumbColor={formState.isBuyOneGetOne ? Colors.primary : Colors.textSubtle}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Custom Offer Tag / Promotion Text</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. 10% OFF WEEKEND"
                      value={formState.offerTag}
                      onChangeText={(val) => handleChange('offerTag', val)}
                    />
                  </View>
                </View>
              ) : formState.pricingType === 'weight' ? (
                <View style={styles.subSection}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Weight Unit</Text>
                    <View style={styles.radioRow}>
                      {['gm', 'kg', 'ml', 'l', 'pcs', 'pack'].map((unit) => (
                        <TouchableOpacity
                          key={unit}
                          style={[
                            styles.radioItem,
                            formState.weightUnit === unit && styles.radioItemActive,
                          ]}
                          onPress={() => handleChange('weightUnit', unit)}
                        >
                          <Text
                            style={[
                              styles.radioLabel,
                              formState.weightUnit === unit && styles.radioLabelActive,
                            ]}
                          >
                            {unit.toUpperCase()}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.arrayHeader}>
                    <Text style={styles.arrayTitle}>Weight / Size Tiers</Text>
                    <TouchableOpacity style={styles.arrayAddBtn} onPress={addWeightVariant}>
                      <Plus size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                      <Text style={styles.arrayAddText}>Add Tier</Text>
                    </TouchableOpacity>
                  </View>

                  {weightVariants.length === 0 ? (
                    <Text style={styles.arrayEmptyText}>No weight pricing tiers defined.</Text>
                  ) : (
                    weightVariants.map((wv, index) => (
                      <View key={index} style={styles.arrayItemRow}>
                        <TextInput
                          style={[styles.input, { flex: 2, marginRight: 8 }]}
                          placeholder="e.g. 250"
                          keyboardType="numeric"
                          value={String(wv.weight || '')}
                          onChangeText={(val) => updateWeightVariant(index, 'weight', val)}
                        />
                        <Text style={styles.unitText}>{formState.weightUnit}</Text>
                        <TextInput
                          style={[styles.input, { flex: 2, marginLeft: 8, marginRight: 8 }]}
                          placeholder="€ Price"
                          keyboardType="numeric"
                          value={String(wv.price || '')}
                          onChangeText={(val) => updateWeightVariant(index, 'price', val)}
                        />
                        <TouchableOpacity onPress={() => removeWeightVariant(index)}>
                          <Trash2 size={16} color={Colors.danger} />
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                </View>
              ) : (
                <View style={styles.subSection}>
                  <Text style={styles.infoText}>
                    Portion-wise pricing uses custom options configured in the "Options & Customizations" tab. Set the base prices in variant options.
                  </Text>
                </View>
              )}

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Describe ingredients, allergen warnings, or size descriptions..."
                  multiline
                  numberOfLines={4}
                  value={formState.description}
                  onChangeText={(val) => handleChange('description', val)}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Dietary Type</Text>
                <View style={styles.radioRow}>
                  {[
                    { label: 'Vegetarian', value: 'veg' },
                    { label: 'Non-Vegetarian', value: 'non-veg' },
                    { label: 'Contains Egg', value: 'egg' },
                  ].map((type) => (
                    <TouchableOpacity
                      key={type.value}
                      style={[
                        styles.radioItem,
                        formState.itemType === type.value && styles.radioItemActive,
                      ]}
                      onPress={() => handleChange('itemType', type.value)}
                    >
                      <Text
                        style={[
                          styles.radioLabel,
                          formState.itemType === type.value && styles.radioLabelActive,
                        ]}
                      >
                        {type.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.rowInputs}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.label}>Min Order Qty</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={formState.minimumQuantity}
                    onChangeText={(val) => handleChange('minimumQuantity', val)}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Max Order Qty</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="numeric"
                    value={formState.maximumQuantity}
                    onChangeText={(val) => handleChange('maximumQuantity', val)}
                  />
                </View>
              </View>

              {/* Fulfilment Availabilities */}
              <View style={[styles.inputGroup, { marginTop: 12 }]}>
                <Text style={styles.label}>Availability Methods</Text>
                <View style={styles.toggleItem}>
                  <Text style={styles.toggleTitle}>Available for Delivery</Text>
                  <Switch
                    value={formState.availableForDelivery}
                    onValueChange={(val) => handleChange('availableForDelivery', val)}
                    trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                    thumbColor={formState.availableForDelivery ? Colors.primary : Colors.textSubtle}
                  />
                </View>
                <View style={styles.toggleItem}>
                  <Text style={styles.toggleTitle}>Available for Eat-In</Text>
                  <Switch
                    value={formState.availableForEatIn}
                    onValueChange={(val) => handleChange('availableForEatIn', val)}
                    trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                    thumbColor={formState.availableForEatIn ? Colors.primary : Colors.textSubtle}
                  />
                </View>
                <View style={styles.toggleItem}>
                  <Text style={styles.toggleTitle}>Available for Collection</Text>
                  <Switch
                    value={formState.availableForCollection}
                    onValueChange={(val) => handleChange('availableForCollection', val)}
                    trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                    thumbColor={formState.availableForCollection ? Colors.primary : Colors.textSubtle}
                  />
                </View>
              </View>
            </View>
          )}

          {/* TAB 3: CUSTOM OPTIONS & CUSTOMIZATIONS */}
          {activeTab === 'custom' && (
            <View style={styles.tabContent}>
              {/* Variant Groups Section */}
              <View style={styles.arrayHeader}>
                <View>
                  <Text style={styles.arrayTitle}>Portion Options (Sizes)</Text>
                  <Text style={styles.arraySub}>Customer chooses one size option (e.g. Regular, Large)</Text>
                </View>
                <TouchableOpacity style={styles.arrayAddBtn} onPress={addVariantGroup}>
                  <Plus size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.arrayAddText}>Add Group</Text>
                </TouchableOpacity>
              </View>

              {variantGroups.map((g, gidx) => (
                <View key={gidx} style={styles.groupCard}>
                  <View style={styles.groupHeader}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginRight: 10 }]}
                      placeholder="Group Title (e.g. Portion Size)"
                      value={g.groupTitle}
                      onChangeText={(val) => updateVariantGroupTitle(gidx, val)}
                    />
                    <TouchableOpacity onPress={() => removeVariantGroup(gidx)}>
                      <Trash2 size={16} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.optionsLabel}>Size Choices & Additional Prices:</Text>
                  {g.variants?.map((v: any, vidx: number) => (
                    <View key={vidx} style={styles.optionRow}>
                      <TextInput
                        style={[styles.input, { flex: 3, marginRight: 8 }]}
                        placeholder="Option Name (e.g. Large)"
                        value={v.variantName}
                        onChangeText={(val) => updateVariantOption(gidx, vidx, 'variantName', val)}
                      />
                      <TextInput
                        style={[styles.input, { flex: 2, marginRight: 8 }]}
                        placeholder="+€ Extra Fee"
                        keyboardType="numeric"
                        value={String(v.additionalPrice || '')}
                        onChangeText={(val) => updateVariantOption(gidx, vidx, 'additionalPrice', val)}
                      />
                      <TouchableOpacity onPress={() => removeVariantOption(gidx, vidx)}>
                        <X size={16} color={Colors.textSubtle} />
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity style={styles.addOptionBtn} onPress={() => addVariantOption(gidx)}>
                    <Plus size={12} color={Colors.primary} style={{ marginRight: 4 }} />
                    <Text style={styles.addOptionText}>Add Choice</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <View style={styles.divider} />

              {/* Addon Groups Section */}
              <View style={styles.arrayHeader}>
                <View>
                  <Text style={styles.arrayTitle}>Extras / Add-on Customizations</Text>
                  <Text style={styles.arraySub}>Customer chooses multiple additions (e.g. Extra Cheese)</Text>
                </View>
                <TouchableOpacity style={[styles.arrayAddBtn, { backgroundColor: '#7C3AED' }]} onPress={addAddonGroup}>
                  <Plus size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.arrayAddText}>Add Extras</Text>
                </TouchableOpacity>
              </View>

              {addonGroups.map((g, gidx) => (
                <View key={gidx} style={[styles.groupCard, { borderColor: '#DDD6FE' }]}>
                  <View style={styles.groupHeader}>
                    <TextInput
                      style={[styles.input, { flex: 1, marginRight: 10 }]}
                      placeholder="Extras Title (e.g. Toppings)"
                      value={g.groupTitle}
                      onChangeText={(val) => updateAddonGroupField(gidx, 'groupTitle', val)}
                    />
                    <TouchableOpacity onPress={() => removeAddonGroup(gidx)}>
                      <Trash2 size={16} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.addonSettingRow}>
                    <Text style={styles.addonSettingLabel}>Selection Mode:</Text>
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
                          <Text style={[styles.selectorSmallLabel, g.customizationBehavior === mode && { color: '#7C3AED' }]}>
                            {mode.toUpperCase()}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <Text style={styles.optionsLabel}>Add-on Items & Extra Price:</Text>
                  {g.addons?.map((a: any, aidx: number) => (
                    <View key={aidx} style={styles.optionRow}>
                      <TextInput
                        style={[styles.input, { flex: 3, marginRight: 8 }]}
                        placeholder="Choice Title (e.g. Cheese)"
                        value={a.optionTitle}
                        onChangeText={(val) => updateAddonOption(gidx, aidx, 'optionTitle', val)}
                      />
                      <TextInput
                        style={[styles.input, { flex: 2, marginRight: 8 }]}
                        placeholder="€ Price"
                        keyboardType="numeric"
                        value={String(a.price || '')}
                        onChangeText={(val) => updateAddonOption(gidx, aidx, 'price', val)}
                      />
                      <TouchableOpacity onPress={() => removeAddonOption(gidx, aidx)}>
                        <X size={16} color={Colors.textSubtle} />
                      </TouchableOpacity>
                    </View>
                  ))}

                  <TouchableOpacity style={styles.addOptionBtn} onPress={() => addAddonOption(gidx)}>
                    <Plus size={12} color="#7C3AED" style={{ marginRight: 4 }} />
                    <Text style={[styles.addOptionText, { color: '#7C3AED' }]}>Add Extras Choice</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveBtn, submitting && { opacity: 0.7 }]}
            disabled={submitting}
            onPress={handleSaveItem}
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.saveBtnText}>Save Product Catalog</Text>
                <Save size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
  tabsHeader: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    paddingHorizontal: 8,
    paddingVertical: 10,
    gap: 6,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: Colors.primaryLight,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    textAlign: 'center',
  },
  tabLabelActive: {
    color: Colors.primary,
  },
  formBody: {
    flex: 1,
    padding: 16,
  },
  tabContent: {
    gap: 16,
  },
  inputGroup: {
    marginBottom: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: Colors.cardBorder,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 14,
    color: Colors.text,
  },
  textArea: {
    height: 90,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  rowInputs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  categoryRow: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  catChip: {
    backgroundColor: Colors.cardSurface,
    borderColor: Colors.cardBorder,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
  },
  catChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  catChipLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  catChipLabelActive: {
    color: Colors.primary,
  },
  radioRow: {
    flexDirection: 'row',
    gap: 8,
  },
  radioItem: {
    flex: 1,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioItemActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  radioLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  radioLabelActive: {
    color: Colors.primary,
  },
  subSection: {
    gap: 16,
  },
  toggleItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 12,
    marginVertical: 2,
  },
  toggleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  toggleSub: {
    fontSize: 11,
    color: Colors.textSubtle,
    marginTop: 2,
  },
  infoText: {
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 18,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 12,
    borderRadius: 12,
  },
  arrayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 8,
  },
  arrayTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.2,
  },
  arraySub: {
    fontSize: 10.5,
    color: Colors.textSubtle,
    marginTop: 2,
    maxWidth: 240,
  },
  arrayAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  arrayAddText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  arrayEmptyText: {
    fontSize: 12,
    color: Colors.textSubtle,
    textAlign: 'center',
    marginVertical: 14,
  },
  arrayItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  unitText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  groupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    padding: 14,
    marginBottom: 16,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  optionsLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textMuted,
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  addOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    paddingVertical: 4,
  },
  addOptionText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.cardBorder,
    marginVertical: 16,
  },
  addonSettingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  addonSettingLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.text,
  },
  selectorSmall: {
    flexDirection: 'row',
    backgroundColor: Colors.cardSurface,
    padding: 3,
    borderRadius: 8,
  },
  selectorSmallItem: {
    paddingHorizontal: 10,
    paddingVertical: 5,
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
    fontSize: 9,
    fontWeight: '800',
    color: Colors.textSubtle,
  },
  saveBtn: {
    backgroundColor: Colors.success,
    borderRadius: 12,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    marginBottom: 50,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  imagePickerContainer: {
    marginBottom: 16,
  },
  imageBox: {
    width: '100%',
    height: 160,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.cardBorder,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    marginTop: 4,
  },
  removeImageBtn: {
    alignSelf: 'center',
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  removeImageText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.danger,
  },
});
