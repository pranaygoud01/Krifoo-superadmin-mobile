import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header } from '../components/Header';
import { Colors } from '../constants/colors';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { restaurantService } from '../services/restaurant.service';
import { restaurantOwnerService } from '../services/restaurant-owner.service';
import {
  Settings2,
  Store,
  Smartphone,
  Globe,
  CreditCard,
  Banknote,
  UtensilsCrossed,
  CheckCircle2,
  ChevronDown,
  Check,
  Info,
  ShieldCheck,
  Truck,
  ShoppingBag,
} from 'lucide-react-native';
import { Restaurant } from '../types';

export default function OperationSettingsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ restaurantId?: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const isSuperAdmin = user?.userType === 'super_admin';

  // Restaurant Selection State (for SuperAdmin)
  const [restaurantsList, setRestaurantsList] = useState<Restaurant[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string>(params.restaurantId || '');
  const [currentRestaurantName, setCurrentRestaurantName] = useState<string>('');
  const [showPicker, setShowPicker] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'krifoo' | 'external'>('krifoo');

  // Krifoo Marketplace Acceptance Settings
  const [krifooConfig, setKrifooConfig] = useState({
    acceptsOnlineOrders: true,
    acceptsDelivery: true,
    acceptsPickup: true,
    acceptsOnlineDelivery: true,
    acceptsCashOnDelivery: true,
    acceptsOnlinePickup: true,
    acceptsPayAtCounter: true,
    acceptsDining: true,
    autoApproveOrders: false,
  });

  // External Website Acceptance Settings
  const [externalConfig, setExternalConfig] = useState({
    acceptsDelivery: true,
    acceptsPickup: true,
    acceptsOnlineDelivery: true,
    acceptsCashOnDelivery: true,
    acceptsOnlinePickup: true,
    acceptsPayAtCounter: true,
  });

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
          const matched = listRes.data.find((r) => r._id === targetId);
          if (matched) {
            setCurrentRestaurantName(matched.restaurantName);
            applyRestaurantData(matched);
          }
        }
      } else {
        const profileRes = await restaurantOwnerService.getRestaurantProfile();
        if (profileRes.success && profileRes.data) {
          applyRestaurantData(profileRes.data);
        }
      }
    } catch (e) {
      console.error('Failed loading acceptance settings:', e);
      showToast({ title: 'Error', message: 'Could not load acceptance settings.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const loadRestaurantById = async (restId: string) => {
    try {
      const res = await restaurantService.getRestaurantById(restId);
      if (res.success && res.data) {
        applyRestaurantData(res.data);
      }
    } catch (e) {
      console.error('Failed loading restaurant by ID:', e);
    }
  };

  const applyRestaurantData = (r: Restaurant) => {
    setKrifooConfig({
      acceptsOnlineOrders: r.acceptsOnlineOrders ?? true,
      acceptsDelivery: r.acceptsDelivery ?? true,
      acceptsPickup: r.acceptsPickup ?? true,
      acceptsOnlineDelivery: r.acceptsOnlineDelivery ?? true,
      acceptsCashOnDelivery: r.acceptsCashOnDelivery ?? true,
      acceptsOnlinePickup: r.acceptsOnlinePickup ?? true,
      acceptsPayAtCounter: r.acceptsPayAtCounter ?? true,
      acceptsDining: r.acceptsDining ?? true,
      autoApproveOrders: r.autoApproveOrders ?? false,
    });

    const eps = r.externalPaymentSettings || {};
    setExternalConfig({
      acceptsDelivery: (eps as any).acceptsDelivery !== false,
      acceptsPickup: (eps as any).acceptsPickup !== false,
      acceptsOnlineDelivery: eps.acceptsOnlineDelivery !== false,
      acceptsCashOnDelivery: eps.acceptsCashOnDelivery !== false,
      acceptsOnlinePickup: eps.acceptsOnlinePickup !== false,
      acceptsPayAtCounter: eps.acceptsPayAtCounter !== false,
    });
  };

  const handleSelectRestaurant = async (rest: Restaurant) => {
    setSelectedRestaurantId(rest._id);
    setCurrentRestaurantName(rest.restaurantName);
    setShowPicker(false);
    setLoading(true);
    await loadRestaurantById(rest._id);
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = {
        acceptsOnlineOrders: krifooConfig.acceptsOnlineOrders,
        acceptsDelivery: krifooConfig.acceptsDelivery,
        acceptsPickup: krifooConfig.acceptsPickup,
        acceptsOnlineDelivery: krifooConfig.acceptsOnlineDelivery,
        acceptsCashOnDelivery: krifooConfig.acceptsCashOnDelivery,
        acceptsOnlinePickup: krifooConfig.acceptsOnlinePickup,
        acceptsPayAtCounter: krifooConfig.acceptsPayAtCounter,
        acceptsDining: krifooConfig.acceptsDining,
        autoApproveOrders: krifooConfig.autoApproveOrders,
        externalPaymentSettings: {
          acceptsDelivery: externalConfig.acceptsDelivery,
          acceptsPickup: externalConfig.acceptsPickup,
          acceptsOnlineDelivery: externalConfig.acceptsOnlineDelivery,
          acceptsCashOnDelivery: externalConfig.acceptsCashOnDelivery,
          acceptsOnlinePickup: externalConfig.acceptsOnlinePickup,
          acceptsPayAtCounter: externalConfig.acceptsPayAtCounter,
        },
      };

      let res;
      if (isSuperAdmin) {
        if (!selectedRestaurantId) {
          showToast({ title: 'No Restaurant', message: 'Please select a restaurant.', type: 'warning' });
          return;
        }
        res = await restaurantService.updateRestaurantDetails(selectedRestaurantId, payload);
      } else {
        res = await restaurantOwnerService.updateRestaurantSettings(payload);
      }

      if (res.success) {
        showToast({
          title: 'Settings Saved',
          message: 'Order acceptance and payment rules updated successfully.',
          type: 'success',
        });
      } else {
        showToast({ title: 'Error', message: res.message || 'Failed to save acceptance settings.', type: 'error' });
      }
    } catch (e: any) {
      console.error('Error saving acceptance settings:', e);
      showToast({ title: 'Error', message: e.message || 'An error occurred while saving.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header
        title="Acceptance & Payments"
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
          <Text style={styles.loadingText}>Loading acceptance parameters...</Text>
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
                    {currentRestaurantName || 'Choose Restaurant'}
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

          {/* 2-Way Channel Segment Tab Bar */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'krifoo' && styles.tabBtnActive]}
              onPress={() => setActiveTab('krifoo')}
              activeOpacity={0.7}
            >
              <Smartphone
                size={16}
                color={activeTab === 'krifoo' ? Colors.primary : Colors.textMuted}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'krifoo' && styles.tabTextActive,
                ]}
              >
                Krifoo App Channel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'external' && styles.tabBtnActive]}
              onPress={() => setActiveTab('external')}
              activeOpacity={0.7}
            >
              <Globe
                size={16}
                color={activeTab === 'external' ? Colors.primary : Colors.textMuted}
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'external' && styles.tabTextActive,
                ]}
              >
                External Website
              </Text>
            </TouchableOpacity>
          </View>

          {/* TAB 1: KRIFOO APP ACCEPTANCE RULES */}
          {activeTab === 'krifoo' && (
            <View style={styles.tabContent}>
              {/* Master Orders Toggle */}
              <View style={styles.card}>
                <View style={styles.toggleHeader}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.cardTitle}>Accept Online Orders (Krifoo App)</Text>
                    <Text style={styles.cardSubtitle}>
                      Master toggle allowing customers to place new orders via the Krifoo customer marketplace app.
                    </Text>
                  </View>
                  <Switch
                    value={krifooConfig.acceptsOnlineOrders}
                    onValueChange={(v) => setKrifooConfig((p) => ({ ...p, acceptsOnlineOrders: v }))}
                    trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                    thumbColor={krifooConfig.acceptsOnlineOrders ? Colors.primary : Colors.textSubtle}
                  />
                </View>
              </View>

              {/* Order Fulfillment Modes (Delivery & Pickup On/Off) */}
              <View style={styles.card}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.cardSectionTitle}>FULFILLMENT MODES (DELIVERY & PICKUP)</Text>
                </View>

                {/* Accept Delivery Orders Switch */}
                <View style={[styles.toggleRow, styles.toggleRowBorder]}>
                  <View style={styles.toggleInfo}>
                    <View style={styles.iconTitleRow}>
                      <View style={[styles.badgeIconBox, { backgroundColor: '#EFF6FF' }]}>
                        <Truck size={16} color="#2563EB" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.toggleTitle}>Delivery Orders</Text>
                          <View style={[styles.statusPill, { backgroundColor: krifooConfig.acceptsDelivery ? '#DCFCE7' : '#FEE2E2' }]}>
                            <Text style={[styles.statusPillText, { color: krifooConfig.acceptsDelivery ? '#15803D' : '#B91C1C' }]}>
                              {krifooConfig.acceptsDelivery ? 'ON' : 'OFF'}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.toggleSub}>
                          Enable or disable home & office delivery orders on Krifoo app
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Switch
                    value={krifooConfig.acceptsDelivery}
                    onValueChange={(v) => setKrifooConfig((p) => ({ ...p, acceptsDelivery: v }))}
                    trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                    thumbColor={krifooConfig.acceptsDelivery ? Colors.primary : Colors.textSubtle}
                  />
                </View>

                {/* Accept Pickup Orders Switch */}
                <View style={styles.toggleRow}>
                  <View style={styles.toggleInfo}>
                    <View style={styles.iconTitleRow}>
                      <View style={[styles.badgeIconBox, { backgroundColor: '#FFF7ED' }]}>
                        <ShoppingBag size={16} color="#EA580C" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.toggleTitle}>Pickup / Collection Orders</Text>
                          <View style={[styles.statusPill, { backgroundColor: krifooConfig.acceptsPickup ? '#DCFCE7' : '#FEE2E2' }]}>
                            <Text style={[styles.statusPillText, { color: krifooConfig.acceptsPickup ? '#15803D' : '#B91C1C' }]}>
                              {krifooConfig.acceptsPickup ? 'ON' : 'OFF'}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.toggleSub}>
                          Enable or disable takeaway / self-pickup collection orders on Krifoo app
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Switch
                    value={krifooConfig.acceptsPickup}
                    onValueChange={(v) => setKrifooConfig((p) => ({ ...p, acceptsPickup: v }))}
                    trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                    thumbColor={krifooConfig.acceptsPickup ? Colors.primary : Colors.textSubtle}
                  />
                </View>
              </View>

              {/* Payment Methods for Delivery */}
              <View style={[styles.card, !krifooConfig.acceptsDelivery && styles.cardDisabled]}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.cardSectionTitle}>DELIVERY PAYMENT METHODS</Text>
                  {!krifooConfig.acceptsDelivery && (
                    <View style={styles.disabledBadge}>
                      <Text style={styles.disabledBadgeText}>DELIVERY IS OFF</Text>
                    </View>
                  )}
                </View>

                <View style={[styles.toggleRow, styles.toggleRowBorder]}>
                  <View style={styles.toggleInfo}>
                    <View style={styles.iconTitleRow}>
                      <CreditCard size={16} color={Colors.primary} />
                      <Text style={styles.toggleTitle}>Online Card Payment</Text>
                    </View>
                    <Text style={styles.toggleSub}>Accept instant Stripe debit/credit card payments for delivery</Text>
                  </View>
                  <Switch
                    value={krifooConfig.acceptsOnlineDelivery}
                    onValueChange={(v) => setKrifooConfig((p) => ({ ...p, acceptsOnlineDelivery: v }))}
                    trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                    thumbColor={krifooConfig.acceptsOnlineDelivery ? Colors.primary : Colors.textSubtle}
                  />
                </View>

                <View style={styles.toggleRow}>
                  <View style={styles.toggleInfo}>
                    <View style={styles.iconTitleRow}>
                      <Banknote size={16} color="#16A34A" />
                      <Text style={styles.toggleTitle}>Cash on Delivery (COD)</Text>
                    </View>
                    <Text style={styles.toggleSub}>Allow customers to pay cash directly to the driver upon delivery</Text>
                  </View>
                  <Switch
                    value={krifooConfig.acceptsCashOnDelivery}
                    onValueChange={(v) => setKrifooConfig((p) => ({ ...p, acceptsCashOnDelivery: v }))}
                    trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                    thumbColor={krifooConfig.acceptsCashOnDelivery ? Colors.primary : Colors.textSubtle}
                  />
                </View>
              </View>

              {/* Payment Methods for Pickup / Collection */}
              <View style={[styles.card, !krifooConfig.acceptsPickup && styles.cardDisabled]}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.cardSectionTitle}>PICKUP / COLLECTION PAYMENT METHODS</Text>
                  {!krifooConfig.acceptsPickup && (
                    <View style={styles.disabledBadge}>
                      <Text style={styles.disabledBadgeText}>PICKUP IS OFF</Text>
                    </View>
                  )}
                </View>

                <View style={[styles.toggleRow, styles.toggleRowBorder]}>
                  <View style={styles.toggleInfo}>
                    <View style={styles.iconTitleRow}>
                      <CreditCard size={16} color={Colors.primary} />
                      <Text style={styles.toggleTitle}>Online Card Payment (Pickup)</Text>
                    </View>
                    <Text style={styles.toggleSub}>Pre-pay online via card before collecting food at the store</Text>
                  </View>
                  <Switch
                    value={krifooConfig.acceptsOnlinePickup}
                    onValueChange={(v) => setKrifooConfig((p) => ({ ...p, acceptsOnlinePickup: v }))}
                    trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                    thumbColor={krifooConfig.acceptsOnlinePickup ? Colors.primary : Colors.textSubtle}
                  />
                </View>

                <View style={styles.toggleRow}>
                  <View style={styles.toggleInfo}>
                    <View style={styles.iconTitleRow}>
                      <Store size={16} color="#0284C7" />
                      <Text style={styles.toggleTitle}>Pay at Counter</Text>
                    </View>
                    <Text style={styles.toggleSub}>Pay in person with cash or card terminal when picking up order</Text>
                  </View>
                  <Switch
                    value={krifooConfig.acceptsPayAtCounter}
                    onValueChange={(v) => setKrifooConfig((p) => ({ ...p, acceptsPayAtCounter: v }))}
                    trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                    thumbColor={krifooConfig.acceptsPayAtCounter ? Colors.primary : Colors.textSubtle}
                  />
                </View>
              </View>

              {/* Dining & Auto Approval */}
              <View style={styles.card}>
                <Text style={styles.cardSectionTitle}>DINING & DISPATCH AUTOMATION</Text>

                <View style={[styles.toggleRow, styles.toggleRowBorder]}>
                  <View style={styles.toggleInfo}>
                    <View style={styles.iconTitleRow}>
                      <UtensilsCrossed size={16} color="#D97706" />
                      <Text style={styles.toggleTitle}>Accept Table Bookings</Text>
                    </View>
                    <Text style={styles.toggleSub}>Allow dine-in guests to reserve dining tables through the platform</Text>
                  </View>
                  <Switch
                    value={krifooConfig.acceptsDining}
                    onValueChange={(v) => setKrifooConfig((p) => ({ ...p, acceptsDining: v }))}
                    trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                    thumbColor={krifooConfig.acceptsDining ? Colors.primary : Colors.textSubtle}
                  />
                </View>

                <View style={styles.toggleRow}>
                  <View style={styles.toggleInfo}>
                    <View style={styles.iconTitleRow}>
                      <CheckCircle2 size={16} color="#059669" />
                      <Text style={styles.toggleTitle}>Auto-Approve Orders</Text>
                    </View>
                    <Text style={styles.toggleSub}>Automatically confirm incoming paid orders without manual tapping</Text>
                  </View>
                  <Switch
                    value={krifooConfig.autoApproveOrders}
                    onValueChange={(v) => setKrifooConfig((p) => ({ ...p, autoApproveOrders: v }))}
                    trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                    thumbColor={krifooConfig.autoApproveOrders ? Colors.primary : Colors.textSubtle}
                  />
                </View>
              </View>
            </View>
          )}

          {/* TAB 2: EXTERNAL WEBSITE ACCEPTANCE RULES */}
          {activeTab === 'external' && (
            <View style={styles.tabContent}>
              <View style={styles.bannerInfoCard}>
                <Globe size={18} color="#4F46E5" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.bannerInfoTitle}>Standalone Website Order Acceptance</Text>
                  <Text style={styles.bannerInfoSub}>
                    Control which payment and fulfillment options are available to customers on your direct website (e.g. Swaad Cambridge).
                  </Text>
                </View>
              </View>

              {/* External Website Fulfillment Modes (Delivery & Pickup On/Off) */}
              <View style={styles.card}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.cardSectionTitle}>WEBSITE FULFILLMENT MODES</Text>
                </View>

                {/* Accept Website Delivery Switch */}
                <View style={[styles.toggleRow, styles.toggleRowBorder]}>
                  <View style={styles.toggleInfo}>
                    <View style={styles.iconTitleRow}>
                      <View style={[styles.badgeIconBox, { backgroundColor: '#EEF2FF' }]}>
                        <Truck size={16} color="#4F46E5" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.toggleTitle}>Website Delivery Orders</Text>
                          <View style={[styles.statusPill, { backgroundColor: externalConfig.acceptsDelivery ? '#DCFCE7' : '#FEE2E2' }]}>
                            <Text style={[styles.statusPillText, { color: externalConfig.acceptsDelivery ? '#15803D' : '#B91C1C' }]}>
                              {externalConfig.acceptsDelivery ? 'ON' : 'OFF'}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.toggleSub}>
                          Enable or disable home & office delivery for direct website visitors
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Switch
                    value={externalConfig.acceptsDelivery}
                    onValueChange={(v) => setExternalConfig((p) => ({ ...p, acceptsDelivery: v }))}
                    trackColor={{ true: '#A5B4FC', false: Colors.cardBorder }}
                    thumbColor={externalConfig.acceptsDelivery ? '#4F46E5' : Colors.textSubtle}
                  />
                </View>

                {/* Accept Website Pickup Switch */}
                <View style={styles.toggleRow}>
                  <View style={styles.toggleInfo}>
                    <View style={styles.iconTitleRow}>
                      <View style={[styles.badgeIconBox, { backgroundColor: '#FFF7ED' }]}>
                        <ShoppingBag size={16} color="#EA580C" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.toggleTitle}>Website Pickup / Collection</Text>
                          <View style={[styles.statusPill, { backgroundColor: externalConfig.acceptsPickup ? '#DCFCE7' : '#FEE2E2' }]}>
                            <Text style={[styles.statusPillText, { color: externalConfig.acceptsPickup ? '#15803D' : '#B91C1C' }]}>
                              {externalConfig.acceptsPickup ? 'ON' : 'OFF'}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.toggleSub}>
                          Enable or disable takeaway collection for direct website visitors
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Switch
                    value={externalConfig.acceptsPickup}
                    onValueChange={(v) => setExternalConfig((p) => ({ ...p, acceptsPickup: v }))}
                    trackColor={{ true: '#A5B4FC', false: Colors.cardBorder }}
                    thumbColor={externalConfig.acceptsPickup ? '#4F46E5' : Colors.textSubtle}
                  />
                </View>
              </View>

              {/* External Delivery Methods */}
              <View style={[styles.card, !externalConfig.acceptsDelivery && styles.cardDisabled]}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.cardSectionTitle}>EXTERNAL WEBSITE DELIVERY PAYMENT METHODS</Text>
                  {!externalConfig.acceptsDelivery && (
                    <View style={styles.disabledBadge}>
                      <Text style={styles.disabledBadgeText}>DELIVERY IS OFF</Text>
                    </View>
                  )}
                </View>

                <View style={[styles.toggleRow, styles.toggleRowBorder]}>
                  <View style={styles.toggleInfo}>
                    <View style={styles.iconTitleRow}>
                      <CreditCard size={16} color="#4F46E5" />
                      <Text style={styles.toggleTitle}>Online Card Payment</Text>
                    </View>
                    <Text style={styles.toggleSub}>Direct Stripe Checkout session for website delivery orders</Text>
                  </View>
                  <Switch
                    value={externalConfig.acceptsOnlineDelivery}
                    onValueChange={(v) => setExternalConfig((p) => ({ ...p, acceptsOnlineDelivery: v }))}
                    trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                    thumbColor={externalConfig.acceptsOnlineDelivery ? Colors.primary : Colors.textSubtle}
                  />
                </View>

                <View style={styles.toggleRow}>
                  <View style={styles.toggleInfo}>
                    <View style={styles.iconTitleRow}>
                      <Banknote size={16} color="#16A34A" />
                      <Text style={styles.toggleTitle}>Cash on Delivery (COD)</Text>
                    </View>
                    <Text style={styles.toggleSub}>Allow direct website customers to choose Cash on Delivery</Text>
                  </View>
                  <Switch
                    value={externalConfig.acceptsCashOnDelivery}
                    onValueChange={(v) => setExternalConfig((p) => ({ ...p, acceptsCashOnDelivery: v }))}
                    trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                    thumbColor={externalConfig.acceptsCashOnDelivery ? Colors.primary : Colors.textSubtle}
                  />
                </View>
              </View>

              {/* External Collection Methods */}
              <View style={[styles.card, !externalConfig.acceptsPickup && styles.cardDisabled]}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.cardSectionTitle}>EXTERNAL WEBSITE COLLECTION PAYMENT METHODS</Text>
                  {!externalConfig.acceptsPickup && (
                    <View style={styles.disabledBadge}>
                      <Text style={styles.disabledBadgeText}>PICKUP IS OFF</Text>
                    </View>
                  )}
                </View>

                <View style={[styles.toggleRow, styles.toggleRowBorder]}>
                  <View style={styles.toggleInfo}>
                    <View style={styles.iconTitleRow}>
                      <CreditCard size={16} color="#4F46E5" />
                      <Text style={styles.toggleTitle}>Online Card Payment (Pickup)</Text>
                    </View>
                    <Text style={styles.toggleSub}>Accept online pre-payments for website collection orders</Text>
                  </View>
                  <Switch
                    value={externalConfig.acceptsOnlinePickup}
                    onValueChange={(v) => setExternalConfig((p) => ({ ...p, acceptsOnlinePickup: v }))}
                    trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                    thumbColor={externalConfig.acceptsOnlinePickup ? Colors.primary : Colors.textSubtle}
                  />
                </View>

                <View style={styles.toggleRow}>
                  <View style={styles.toggleInfo}>
                    <View style={styles.iconTitleRow}>
                      <Store size={16} color="#0284C7" />
                      <Text style={styles.toggleTitle}>Pay at Counter (Pickup)</Text>
                    </View>
                    <Text style={styles.toggleSub}>Allow website customers to pay when collecting at the store</Text>
                  </View>
                  <Switch
                    value={externalConfig.acceptsPayAtCounter}
                    onValueChange={(v) => setExternalConfig((p) => ({ ...p, acceptsPayAtCounter: v }))}
                    trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                    thumbColor={externalConfig.acceptsPayAtCounter ? Colors.primary : Colors.textSubtle}
                  />
                </View>
              </View>
            </View>
          )}

          {/* Bottom Save Action Button */}
          <TouchableOpacity
            style={[styles.bottomSaveBtn, saving && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={saving || loading}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.bottomSaveBtnText}>Save Acceptance & Payment Rules</Text>
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
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.cardSurface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
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
    fontSize: 12,
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
    lineHeight: 16,
  },
  cardSectionTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: Colors.textSubtle,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  toggleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
  },
  toggleRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  toggleInfo: {
    flex: 1,
    paddingRight: 10,
  },
  iconTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toggleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  toggleSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
    lineHeight: 15,
  },
  bannerInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.cardSurface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  bannerInfoTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: Colors.text,
  },
  bannerInfoSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
    lineHeight: 15,
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
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  cardDisabled: {
    opacity: 0.65,
  },
  disabledBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  disabledBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: 0.3,
  },
});
