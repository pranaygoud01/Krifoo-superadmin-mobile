import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  Image,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header } from '../components/Header';
import { Colors } from '../constants/colors';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { restaurantService } from '../services/restaurant.service';
import { restaurantOwnerService } from '../services/restaurant-owner.service';
import {
  Globe,
  Truck,
  Palette,
  Check,
  Plus,
  Trash2,
  ExternalLink,
  ChevronDown,
  Sparkles,
  Info,
  Layers,
  ShoppingBag,
  Store,
  Clock,
} from 'lucide-react-native';
import { ExternalDistanceTier, Restaurant } from '../types';

const COLOR_PRESETS = [
  { name: 'Crimson', color: '#E11D48' },
  { name: 'Indigo', color: '#4F46E5' },
  { name: 'Emerald', color: '#059669' },
  { name: 'Amber', color: '#D97706' },
  { name: 'Violet', color: '#7C3AED' },
  { name: 'Rose', color: '#F43F5E' },
  { name: 'Dark Slate', color: '#0F172A' },
];

export default function ExternalWebsiteSettingsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ restaurantId?: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const isSuperAdmin = user?.userType === 'super_admin';

  // Selected Restaurant State
  const [restaurantsList, setRestaurantsList] = useState<Restaurant[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string>(params.restaurantId || '');
  const [currentRestaurant, setCurrentRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'branding' | 'delivery'>('branding');

  // Website Settings Form
  const [domain, setDomain] = useState('');
  const [brandName, setBrandName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#E11D48');
  const [secondaryColor, setSecondaryColor] = useState('#4F46E5');
  const [heroBannerUrl, setHeroBannerUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [facebookUrl, setFacebookUrl] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [isPublished, setIsPublished] = useState(true);

  // Delivery Settings Form
  const [extDeliveryEnabled, setExtDeliveryEnabled] = useState(false);
  const [deliveryChargeType, setDeliveryChargeType] = useState<'tiered' | 'fixed' | 'per_mile'>('tiered');
  const [fixedCharge, setFixedCharge] = useState('2.50');
  const [freeDeliveryOver, setFreeDeliveryOver] = useState('');
  const [chargePerMile, setChargePerMile] = useState('1.50');
  const [baseDeliveryCharge, setBaseDeliveryCharge] = useState('2.00');
  const [baseDeliveryDistance, setBaseDeliveryDistance] = useState('2');
  const [maxDeliveryRadius, setMaxDeliveryRadius] = useState('8');
  const [distanceTiers, setDistanceTiers] = useState<ExternalDistanceTier[]>([]);

  // New Tier input state
  const [newTierDist, setNewTierDist] = useState('');
  const [newTierFee, setNewTierFee] = useState('');

  // Restaurant picker dropdown
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, [params.restaurantId]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      if (isSuperAdmin) {
        const listRes = await restaurantService.getRestaurants({ limit: 100 });
        if (listRes.success && listRes.data && listRes.data.length > 0) {
          setRestaurantsList(listRes.data);
          const targetId = params.restaurantId || selectedRestaurantId || listRes.data[0]._id;
          setSelectedRestaurantId(targetId);
          await loadRestaurantData(targetId);
        }
      } else {
        const profileRes = await restaurantOwnerService.getRestaurantProfile();
        if (profileRes.success && profileRes.data) {
          applyRestaurantToState(profileRes.data);
        }
      }
    } catch (e) {
      console.error('Failed to load initial external website data:', e);
      showToast({ title: 'Error', message: 'Could not load website settings.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const loadRestaurantData = async (restId: string) => {
    try {
      const res = await restaurantService.getRestaurantById(restId);
      if (res.success && res.data) {
        applyRestaurantToState(res.data);
      }
    } catch (e) {
      console.error('Failed to fetch restaurant details:', e);
    }
  };

  const applyRestaurantToState = (r: Restaurant) => {
    setCurrentRestaurant(r);
    setSelectedRestaurantId(r._id);

    const ws = r.externalWebsiteSettings || {};
    setDomain(ws.domain || '');
    setBrandName(ws.brandName || r.restaurantName || '');
    setPrimaryColor(ws.primaryColor || '#E11D48');
    setSecondaryColor(ws.secondaryColor || '#4F46E5');
    setHeroBannerUrl(ws.heroBannerUrl || '');
    setLogoUrl(ws.logoUrl || r.imageUrl || '');
    setMetaTitle(ws.metaTitle || '');
    setMetaDescription(ws.metaDescription || '');
    setFacebookUrl(ws.facebookUrl || '');
    setInstagramUrl(ws.instagramUrl || '');
    setIsPublished(ws.isPublished !== false);

    const ds = r.externalDeliverySettings || {
      enabled: false,
      deliveryChargeType: 'tiered',
      fixedCharge: 2.5,
      chargePerMile: 1.5,
      baseDeliveryCharge: 2.0,
      baseDeliveryDistance: 2,
      maxDeliveryRadius: 8,
      distanceTiers: [
        { maxDistance: 2, charge: 2.0 },
        { maxDistance: 4, charge: 3.5 },
        { maxDistance: 6, charge: 5.0 },
      ],
    };

    setExtDeliveryEnabled(ds.enabled === true);
    setDeliveryChargeType(ds.deliveryChargeType || 'tiered');
    setFixedCharge(ds.fixedCharge !== undefined ? String(ds.fixedCharge) : '2.50');
    setFreeDeliveryOver(
      ds.freeDeliveryOverOrderValue !== null && ds.freeDeliveryOverOrderValue !== undefined
        ? String(ds.freeDeliveryOverOrderValue)
        : ''
    );
    setChargePerMile(ds.chargePerMile !== undefined ? String(ds.chargePerMile) : '1.50');
    setBaseDeliveryCharge(ds.baseDeliveryCharge !== undefined ? String(ds.baseDeliveryCharge) : '2.00');
    setBaseDeliveryDistance(ds.baseDeliveryDistance !== undefined ? String(ds.baseDeliveryDistance) : '2');
    setMaxDeliveryRadius(ds.maxDeliveryRadius !== undefined ? String(ds.maxDeliveryRadius) : '8');
    setDistanceTiers(
      Array.isArray(ds.distanceTiers) && ds.distanceTiers.length > 0
        ? ds.distanceTiers
        : [
            { maxDistance: 2, charge: 2.0 },
            { maxDistance: 4, charge: 3.5 },
            { maxDistance: 6, charge: 5.0 },
          ]
    );
  };

  const handleSelectRestaurant = async (rest: Restaurant) => {
    setSelectedRestaurantId(rest._id);
    setShowPicker(false);
    setLoading(true);
    await loadRestaurantData(rest._id);
    setLoading(false);
  };

  const handleAddTier = () => {
    const dist = parseFloat(newTierDist);
    const fee = parseFloat(newTierFee);
    if (isNaN(dist) || dist <= 0) {
      showToast({ title: 'Invalid Distance', message: 'Enter a valid max distance in miles.', type: 'warning' });
      return;
    }
    if (isNaN(fee) || fee < 0) {
      showToast({ title: 'Invalid Charge', message: 'Enter a valid delivery charge (£).', type: 'warning' });
      return;
    }

    const updated = [...distanceTiers, { maxDistance: dist, charge: fee }].sort(
      (a, b) => a.maxDistance - b.maxDistance
    );
    setDistanceTiers(updated);
    setNewTierDist('');
    setNewTierFee('');
  };

  const handleDeleteTier = (index: number) => {
    setDistanceTiers(distanceTiers.filter((_, idx) => idx !== index));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = {
        externalWebsiteSettings: {
          domain: domain ? domain.trim().toLowerCase() : null,
          brandName: brandName ? brandName.trim() : '',
          primaryColor: primaryColor.trim(),
          secondaryColor: secondaryColor.trim(),
          heroBannerUrl: heroBannerUrl.trim(),
          logoUrl: logoUrl.trim(),
          metaTitle: metaTitle.trim(),
          metaDescription: metaDescription.trim(),
          facebookUrl: facebookUrl.trim(),
          instagramUrl: instagramUrl.trim(),
          isPublished,
        },
        externalDeliverySettings: {
          enabled: extDeliveryEnabled,
          deliveryChargeType,
          fixedCharge: parseFloat(fixedCharge) || 0,
          freeDeliveryOverOrderValue: freeDeliveryOver ? parseFloat(freeDeliveryOver) : null,
          chargePerMile: parseFloat(chargePerMile) || 0,
          baseDeliveryCharge: parseFloat(baseDeliveryCharge) || 0,
          baseDeliveryDistance: parseFloat(baseDeliveryDistance) || 0,
          maxDeliveryRadius: parseFloat(maxDeliveryRadius) || 10,
          distanceTiers,
        },
      };

      let res;
      if (isSuperAdmin) {
        if (!selectedRestaurantId) {
          showToast({ title: 'No Restaurant', message: 'Please select a restaurant to update.', type: 'warning' });
          return;
        }
        res = await restaurantService.updateRestaurantDetails(selectedRestaurantId, payload);
      } else {
        res = await restaurantOwnerService.updateRestaurantSettings(payload);
      }

      if (res.success) {
        showToast({
          title: 'Saved Successfully',
          message: 'External website & delivery configurations updated.',
          type: 'success',
        });
      } else {
        showToast({ title: 'Update Failed', message: res.message || 'Could not save settings.', type: 'error' });
      }
    } catch (e: any) {
      console.error('Error saving external website settings:', e);
      showToast({ title: 'Error', message: e.message || 'An error occurred while saving.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header
        title="External Website & Delivery"
        showBackButton={true}
        rightElement={
          <TouchableOpacity
            style={[styles.headerSaveBtn, saving && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={saving || loading}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <View style={styles.headerSaveBtnContent}>
                <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.headerSaveBtnText}>Save</Text>
              </View>
            )}
          </TouchableOpacity>
        }
      />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading settings...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: isTablet ? 24 : 16, maxWidth: 840, alignSelf: 'center', width: '100%' },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Restaurant Selector for SuperAdmin */}
          {isSuperAdmin && restaurantsList.length > 0 && (
            <View style={styles.selectorCard}>
              <Text style={styles.sectionCaption}>SELECT RESTAURANT</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowPicker(!showPicker)}
                activeOpacity={0.7}
              >
                <View style={styles.pickerContent}>
                  <Store size={18} color={Colors.primary} />
                  <Text style={styles.pickerText} numberOfLines={1}>
                    {currentRestaurant?.restaurantName || 'Choose Restaurant'}
                  </Text>
                </View>
                <ChevronDown size={18} color={Colors.textMuted} />
              </TouchableOpacity>

              {showPicker && (
                <View style={styles.dropdownList}>
                  {restaurantsList.map((rest) => (
                    <TouchableOpacity
                      key={rest._id}
                      style={[
                        styles.dropdownItem,
                        rest._id === selectedRestaurantId && styles.dropdownItemActive,
                      ]}
                      onPress={() => handleSelectRestaurant(rest)}
                    >
                      <Text
                        style={[
                          styles.dropdownItemText,
                          rest._id === selectedRestaurantId && styles.dropdownItemTextActive,
                        ]}
                      >
                        {rest.restaurantName}
                      </Text>
                      {rest._id === selectedRestaurantId && <Check size={16} color={Colors.primary} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Website Preview & Status Header */}
          <View style={styles.previewHeroCard}>
            <View style={styles.previewHeroHeader}>
              <View style={styles.badgeRow}>
                <View
                  style={[
                    styles.statusPill,
                    isPublished ? styles.statusPillLive : styles.statusPillDraft,
                  ]}
                >
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: isPublished ? '#10B981' : '#6B7280' },
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: isPublished ? '#065F46' : '#374151' },
                    ]}
                  >
                    {isPublished ? 'STOREFRONT LIVE' : 'DRAFT / OFFLINE'}
                  </Text>
                </View>

                {domain ? (
                  <View style={styles.domainPill}>
                    <Globe size={12} color={Colors.primary} />
                    <Text style={styles.domainPillText} numberOfLines={1}>
                      {domain}
                    </Text>
                  </View>
                ) : null}
              </View>

              <Switch
                value={isPublished}
                onValueChange={setIsPublished}
                trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                thumbColor={isPublished ? Colors.primary : Colors.textSubtle}
              />
            </View>

            <Text style={styles.previewHeroTitle}>
              {brandName || currentRestaurant?.restaurantName || 'Online Storefront'}
            </Text>
            <Text style={styles.previewHeroSubtitle}>
              Dedicated domain and tailored theme for direct customer orders with 0% extra commission.
            </Text>
          </View>

          {/* Minimal Tab Bar */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'branding' && styles.tabBtnActive]}
              onPress={() => setActiveTab('branding')}
              activeOpacity={0.7}
            >
              <Palette
                size={16}
                color={activeTab === 'branding' ? Colors.primary : Colors.textMuted}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'branding' && styles.tabTextActive,
                ]}
              >
                Website & Theme
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'delivery' && styles.tabBtnActive]}
              onPress={() => setActiveTab('delivery')}
              activeOpacity={0.7}
            >
              <Truck
                size={16}
                color={activeTab === 'delivery' ? Colors.primary : Colors.textMuted}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'delivery' && styles.tabTextActive,
                ]}
              >
                External Delivery & Fees
              </Text>
            </TouchableOpacity>
          </View>

          {/* TAB 1: WEBSITE & BRANDING */}
          {activeTab === 'branding' && (
            <View style={styles.tabContent}>
              {/* Domain & Brand Identity */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Storefront Domain & Identity</Text>
                <Text style={styles.cardSubtitle}>
                  Route orders from your standalone website directly into this POS app.
                </Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Custom Domain / Subdomain</Text>
                  <View style={styles.inputWithIcon}>
                    <Globe size={18} color={Colors.textMuted} style={styles.inputIcon} />
                    <TextInput
                      style={styles.textInputWithIcon}
                      value={domain}
                      onChangeText={setDomain}
                      placeholder="e.g. swaad.orderin.me or order.myshop.co.uk"
                      placeholderTextColor={Colors.textSubtle}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Website Brand Name</Text>
                  <TextInput
                    style={styles.textInput}
                    value={brandName}
                    onChangeText={setBrandName}
                    placeholder="e.g. Swaad Indian Cuisine"
                    placeholderTextColor={Colors.textSubtle}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Logo Image URL</Text>
                  <TextInput
                    style={styles.textInput}
                    value={logoUrl}
                    onChangeText={setLogoUrl}
                    placeholder="https://.../logo.png"
                    placeholderTextColor={Colors.textSubtle}
                    autoCapitalize="none"
                  />
                  {logoUrl ? (
                    <View style={styles.imageThumbnailRow}>
                      <Image source={{ uri: logoUrl }} style={styles.logoPreview} />
                      <Text style={styles.imageThumbnailCaption}>Logo Preview</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Hero Banner Image URL</Text>
                  <TextInput
                    style={styles.textInput}
                    value={heroBannerUrl}
                    onChangeText={setHeroBannerUrl}
                    placeholder="https://.../hero-banner.jpg"
                    placeholderTextColor={Colors.textSubtle}
                    autoCapitalize="none"
                  />
                  {heroBannerUrl ? (
                    <Image source={{ uri: heroBannerUrl }} style={styles.bannerPreview} />
                  ) : null}
                </View>
              </View>

              {/* Theme Colors */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Brand Theme Colors</Text>
                <Text style={styles.cardSubtitle}>
                  Choose the color accents for buttons, headers, and highlights.
                </Text>

                <Text style={styles.inputLabel}>Quick Color Presets</Text>
                <View style={styles.presetColorRow}>
                  {COLOR_PRESETS.map((p) => (
                    <TouchableOpacity
                      key={p.color}
                      style={[
                        styles.colorCircle,
                        { backgroundColor: p.color },
                        primaryColor === p.color && styles.colorCircleSelected,
                      ]}
                      onPress={() => setPrimaryColor(p.color)}
                      activeOpacity={0.8}
                    >
                      {primaryColor === p.color && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.rowInputs}>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Primary Color</Text>
                    <View style={styles.hexInputRow}>
                      <View style={[styles.miniColorDot, { backgroundColor: primaryColor || '#E11D48' }]} />
                      <TextInput
                        style={styles.hexInput}
                        value={primaryColor}
                        onChangeText={setPrimaryColor}
                        placeholder="#E11D48"
                        placeholderTextColor={Colors.textSubtle}
                        autoCapitalize="characters"
                      />
                    </View>
                  </View>

                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>Secondary Color</Text>
                    <View style={styles.hexInputRow}>
                      <View style={[styles.miniColorDot, { backgroundColor: secondaryColor || '#4F46E5' }]} />
                      <TextInput
                        style={styles.hexInput}
                        value={secondaryColor}
                        onChangeText={setSecondaryColor}
                        placeholder="#4F46E5"
                        placeholderTextColor={Colors.textSubtle}
                        autoCapitalize="characters"
                      />
                    </View>
                  </View>
                </View>
              </View>

              {/* Social Links & SEO */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Social & SEO Metadata</Text>
                <Text style={styles.cardSubtitle}>Boost Google search visibility and link customer social channels.</Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Meta Page Title</Text>
                  <TextInput
                    style={styles.textInput}
                    value={metaTitle}
                    onChangeText={setMetaTitle}
                    placeholder="e.g. Swaad - Authentic Indian Takeaway & Delivery"
                    placeholderTextColor={Colors.textSubtle}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Meta Description</Text>
                  <TextInput
                    style={[styles.textInput, { height: 68, textAlignVertical: 'top' }]}
                    value={metaDescription}
                    onChangeText={setMetaDescription}
                    placeholder="Order delicious curry, biryanis & tandoori online..."
                    placeholderTextColor={Colors.textSubtle}
                    multiline
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Instagram Profile URL</Text>
                  <TextInput
                    style={styles.textInput}
                    value={instagramUrl}
                    onChangeText={setInstagramUrl}
                    placeholder="https://instagram.com/myrestaurant"
                    placeholderTextColor={Colors.textSubtle}
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Facebook Page URL</Text>
                  <TextInput
                    style={styles.textInput}
                    value={facebookUrl}
                    onChangeText={setFacebookUrl}
                    placeholder="https://facebook.com/myrestaurant"
                    placeholderTextColor={Colors.textSubtle}
                    autoCapitalize="none"
                  />
                </View>
              </View>
            </View>
          )}

          {/* TAB 2: DELIVERY & CHARGES */}
          {activeTab === 'delivery' && (
            <View style={styles.tabContent}>
              {/* Master Toggle */}
              <View style={styles.card}>
                <View style={styles.toggleHeader}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={styles.cardTitle}>Custom External Delivery Rates</Text>
                    <Text style={styles.cardSubtitle}>
                      When enabled, orders placed via your standalone website use these tailored rates instead of the generic platform rates.
                    </Text>
                  </View>
                  <Switch
                    value={extDeliveryEnabled}
                    onValueChange={setExtDeliveryEnabled}
                    trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                    thumbColor={extDeliveryEnabled ? Colors.primary : Colors.textSubtle}
                  />
                </View>
              </View>

              {extDeliveryEnabled && (
                <>
                  {/* Fee Calculation Model */}
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Delivery Fee Calculation Model</Text>
                    <Text style={styles.cardSubtitle}>Select how external delivery charges are calculated.</Text>

                    <View style={styles.modelOptionsRow}>
                      <TouchableOpacity
                        style={[
                          styles.modelPill,
                          deliveryChargeType === 'tiered' && styles.modelPillActive,
                        ]}
                        onPress={() => setDeliveryChargeType('tiered')}
                        activeOpacity={0.7}
                      >
                        <Layers
                          size={16}
                          color={deliveryChargeType === 'tiered' ? Colors.primary : Colors.textMuted}
                        />
                        <Text
                          style={[
                            styles.modelPillText,
                            deliveryChargeType === 'tiered' && styles.modelPillTextActive,
                          ]}
                        >
                          Distance Tiers
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.modelPill,
                          deliveryChargeType === 'fixed' && styles.modelPillActive,
                        ]}
                        onPress={() => setDeliveryChargeType('fixed')}
                        activeOpacity={0.7}
                      >
                        <ShoppingBag
                          size={16}
                          color={deliveryChargeType === 'fixed' ? Colors.primary : Colors.textMuted}
                        />
                        <Text
                          style={[
                            styles.modelPillText,
                            deliveryChargeType === 'fixed' && styles.modelPillTextActive,
                          ]}
                        >
                          Fixed Fee
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.modelPill,
                          deliveryChargeType === 'per_mile' && styles.modelPillActive,
                        ]}
                        onPress={() => setDeliveryChargeType('per_mile')}
                        activeOpacity={0.7}
                      >
                        <Truck
                          size={16}
                          color={deliveryChargeType === 'per_mile' ? Colors.primary : Colors.textMuted}
                        />
                        <Text
                          style={[
                            styles.modelPillText,
                            deliveryChargeType === 'per_mile' && styles.modelPillTextActive,
                          ]}
                        >
                          Per-Mile
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Mode Specific Inputs */}
                    {deliveryChargeType === 'fixed' && (
                      <View style={[styles.inputGroup, { marginTop: 14 }]}>
                        <Text style={styles.inputLabel}>Flat Delivery Charge (£)</Text>
                        <TextInput
                          style={styles.textInput}
                          value={fixedCharge}
                          onChangeText={setFixedCharge}
                          placeholder="2.50"
                          placeholderTextColor={Colors.textSubtle}
                          keyboardType="numeric"
                        />
                      </View>
                    )}

                    {deliveryChargeType === 'per_mile' && (
                      <View style={{ marginTop: 14, gap: 12 }}>
                        <View style={styles.rowInputs}>
                          <View style={[styles.inputGroup, { flex: 1 }]}>
                            <Text style={styles.inputLabel}>Base Charge (£)</Text>
                            <TextInput
                              style={styles.textInput}
                              value={baseDeliveryCharge}
                              onChangeText={setBaseDeliveryCharge}
                              placeholder="2.00"
                              placeholderTextColor={Colors.textSubtle}
                              keyboardType="numeric"
                            />
                          </View>
                          <View style={[styles.inputGroup, { flex: 1 }]}>
                            <Text style={styles.inputLabel}>Base Dist (Miles)</Text>
                            <TextInput
                              style={styles.textInput}
                              value={baseDeliveryDistance}
                              onChangeText={setBaseDeliveryDistance}
                              placeholder="2"
                              placeholderTextColor={Colors.textSubtle}
                              keyboardType="numeric"
                            />
                          </View>
                        </View>

                        <View style={styles.inputGroup}>
                          <Text style={styles.inputLabel}>Charge Per Extra Mile (£/mile)</Text>
                          <TextInput
                            style={styles.textInput}
                            value={chargePerMile}
                            onChangeText={setChargePerMile}
                            placeholder="1.50"
                            placeholderTextColor={Colors.textSubtle}
                            keyboardType="numeric"
                          />
                        </View>
                      </View>
                    )}

                    {deliveryChargeType === 'tiered' && (
                      <View style={{ marginTop: 16 }}>
                        <Text style={styles.inputLabel}>Distance Tiers Matrix</Text>

                        {distanceTiers.length === 0 ? (
                          <Text style={styles.emptyTiersText}>No distance tiers defined yet.</Text>
                        ) : (
                          <View style={styles.tierTable}>
                            <View style={styles.tierTableHeader}>
                              <Text style={styles.tierTableColHeader}>Up to Distance</Text>
                              <Text style={styles.tierTableColHeader}>Charge (£)</Text>
                              <Text style={[styles.tierTableColHeader, { width: 40, textAlign: 'right' }]}>
                                Action
                              </Text>
                            </View>

                            {distanceTiers.map((tier, idx) => (
                              <View key={idx} style={styles.tierTableRow}>
                                <Text style={styles.tierTableColText}>{tier.maxDistance} miles</Text>
                                <Text style={styles.tierTableColText}>£{Number(tier.charge).toFixed(2)}</Text>
                                <TouchableOpacity
                                  style={styles.deleteTierBtn}
                                  onPress={() => handleDeleteTier(idx)}
                                >
                                  <Trash2 size={16} color={Colors.danger} />
                                </TouchableOpacity>
                              </View>
                            ))}
                          </View>
                        )}

                        {/* Add New Tier Row */}
                        <View style={styles.addTierRow}>
                          <TextInput
                            style={[styles.tierInput, { flex: 1 }]}
                            value={newTierDist}
                            onChangeText={setNewTierDist}
                            placeholder="Dist (e.g. 5 mi)"
                            placeholderTextColor={Colors.textSubtle}
                            keyboardType="numeric"
                          />
                          <TextInput
                            style={[styles.tierInput, { flex: 1 }]}
                            value={newTierFee}
                            onChangeText={setNewTierFee}
                            placeholder="Fee (e.g. 3.50)"
                            placeholderTextColor={Colors.textSubtle}
                            keyboardType="numeric"
                          />
                          <TouchableOpacity style={styles.addTierActionBtn} onPress={handleAddTier}>
                            <Plus size={16} color="#FFFFFF" />
                            <Text style={styles.addTierActionBtnText}>Add</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>

                  {/* Thresholds & Radius */}
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Thresholds & Coverage Radius</Text>

                    <View style={styles.rowInputs}>
                      <View style={[styles.inputGroup, { flex: 1 }]}>
                        <Text style={styles.inputLabel}>Max Delivery Radius (Miles)</Text>
                        <TextInput
                          style={styles.textInput}
                          value={maxDeliveryRadius}
                          onChangeText={setMaxDeliveryRadius}
                          placeholder="8"
                          placeholderTextColor={Colors.textSubtle}
                          keyboardType="numeric"
                        />
                      </View>

                      <View style={[styles.inputGroup, { flex: 1 }]}>
                        <Text style={styles.inputLabel}>Free Delivery Over (£)</Text>
                        <TextInput
                          style={styles.textInput}
                          value={freeDeliveryOver}
                          onChangeText={setFreeDeliveryOver}
                          placeholder="Optional (e.g. 25)"
                          placeholderTextColor={Colors.textSubtle}
                          keyboardType="numeric"
                        />
                      </View>
                    </View>
                  </View>

                  {/* Delivery Operating Timings Shortcut */}
                  <View style={styles.card}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={styles.cardTitle}>External Delivery Timings</Text>
                        <Text style={styles.cardSubtitle}>
                          Define customized open/close delivery hours for this external website separate from store hours.
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          backgroundColor: Colors.primaryLight,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 8,
                        }}
                        onPress={() =>
                          router.push({
                            pathname: '/operational-timings',
                            params: { restaurantId: selectedRestaurantId },
                          })
                        }
                      >
                        <Clock size={14} color={Colors.primary} />
                        <Text style={{ fontSize: 12, fontWeight: '800', color: Colors.primary }}>
                          Set Timings →
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              )}
            </View>
          )}

          {/* Bottom Save Button */}
          <TouchableOpacity
            style={[styles.bottomSaveBtn, saving && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={saving || loading}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.bottomSaveBtnText}>Save External Website Settings</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerSaveBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerSaveBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerSaveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.textMuted,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 120,
  },
  selectorCard: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  sectionCaption: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textSubtle,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  pickerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  pickerText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  dropdownList: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
    paddingTop: 6,
    maxHeight: 180,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  dropdownItemActive: {
    backgroundColor: Colors.primaryLight,
  },
  dropdownItemText: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '500',
  },
  dropdownItemTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  previewHeroCard: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  previewHeroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 6,
  },
  statusPillLive: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  statusPillDraft: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  domainPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  domainPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  previewHeroTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 4,
  },
  previewHeroSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
    lineHeight: 18,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.cardSurface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: Colors.primaryLight,
  },
  tabText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  tabContent: {
    gap: 14,
  },
  card: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
  },
  cardSubtitle: {
    fontSize: 11.5,
    color: Colors.textMuted,
    marginTop: 2,
    marginBottom: 14,
    lineHeight: 16,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: Colors.text,
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  inputIcon: {
    marginRight: 6,
  },
  textInputWithIcon: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 13,
    color: Colors.text,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 12,
  },
  presetColorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  colorCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorCircleSelected: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  hexInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  miniColorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 8,
  },
  hexInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 13,
    color: Colors.text,
    fontWeight: '700',
  },
  imageThumbnailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  logoPreview: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  imageThumbnailCaption: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  bannerPreview: {
    width: '100%',
    height: 100,
    borderRadius: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  toggleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modelOptionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  modelPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  modelPillActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  modelPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  modelPillTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  tierTable: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
    marginBottom: 10,
  },
  tierTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  tierTableColHeader: {
    flex: 1,
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textSubtle,
    letterSpacing: 0.3,
  },
  tierTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  tierTableColText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    color: Colors.text,
  },
  deleteTierBtn: {
    padding: 4,
  },
  emptyTiersText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
    paddingVertical: 10,
  },
  addTierRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  tierInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: Colors.text,
  },
  addTierActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  addTierActionBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  bottomSaveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    elevation: 2,
    shadowColor: Colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  bottomSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
