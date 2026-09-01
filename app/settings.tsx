import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Header } from '../components/Header';
import { ConfirmModal } from '../components/ConfirmModal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Colors } from '../constants/colors';
import { getApiBaseUrl, setApiBaseUrl } from '../services/api';
import { settingsService } from '../services/settings.service';
import { Category, DeliveryChargeTier } from '../types';
import {
  ShieldCheck,
  Server,
  LogOut,
  Grid,
  Truck,
  Plus,
  Edit2,
  Trash2,
  X,
  Check,
  Bell,
  Printer,
  Monitor,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Shield,
  Layers,
} from 'lucide-react-native';
import {
  getSavedOrientation,
  applyOrientation,
  AppOrientation,
} from '../services/orientation.service';
import { RestaurantSettingsSkeleton } from '../components/Skeleton';
import RestaurantSettingsScreen from './restaurant-settings';

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  if (user && user.userType !== 'super_admin') {
    return <RestaurantSettingsScreen />;
  }

  const [apiUrl, setApiUrl] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [deliveryCharges, setDeliveryCharges] = useState<DeliveryChargeTier[]>([]);
  const [loading, setLoading] = useState(false);

  // Confirm Modal States
  const [deleteTierModalVisible, setDeleteTierModalVisible] = useState(false);
  const [selectedTierToDelete, setSelectedTierToDelete] = useState<{ id: string; distance: number } | null>(null);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);

  // Expandable sections
  const [showCategories, setShowCategories] = useState(false);
  const [showDeliveryCharges, setShowDeliveryCharges] = useState(false);
  const [showApiConfig, setShowApiConfig] = useState(false);
  const [showOrientationConfig, setShowOrientationConfig] = useState(false);

  // Delivery charge editing / adding states
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [editMaxDistance, setEditMaxDistance] = useState('');
  const [editCharge, setEditCharge] = useState('');

  const [isAddingTier, setIsAddingTier] = useState(false);
  const [newMaxDistance, setNewMaxDistance] = useState('');
  const [newCharge, setNewCharge] = useState('');
  const [submittingTier, setSubmittingTier] = useState(false);
  const [appOrientation, setAppOrientation] = useState<AppOrientation>('portrait');
  const [isChangingOrientation, setIsChangingOrientation] = useState(false);

  useEffect(() => {
    getApiBaseUrl().then(setApiUrl);
    getSavedOrientation().then(setAppOrientation);
    loadGlobalConfig();
  }, []);

  const loadGlobalConfig = async () => {
    setLoading(true);
    try {
      const [catRes, chargeRes] = await Promise.all([
        settingsService.getCategories(),
        settingsService.getDeliveryCharges(),
      ]);

      if (catRes.success && catRes.data) {
        setCategories(catRes.data);
      }
      if (chargeRes.success && chargeRes.data) {
        setDeliveryCharges(chargeRes.data);
      }
    } catch (e) {
      console.error('Failed loading categories/delivery charges:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveApiUrl = async () => {
    if (!apiUrl.trim()) return;
    await setApiBaseUrl(apiUrl.trim());
    showToast({ title: 'Saved', message: 'API Base URL updated successfully.', type: 'success' });
    setShowApiConfig(false);
  };

  const handleSetOrientation = async (mode: AppOrientation) => {
    if (isChangingOrientation) return;
    setIsChangingOrientation(true);
    try {
      setAppOrientation(mode);
      const success = await applyOrientation(mode);
      if (success) {
        showToast({
          title: 'Display Mode Changed',
          message:
            mode === 'landscape'
              ? 'Rotated into Landscape mode (POS setup)'
              : mode === 'portrait'
              ? 'Rotated into Portrait mode'
              : 'Auto-rotate sensor enabled',
          type: 'success',
        });
      }
    } catch {
      showToast({ title: 'Error', message: 'Failed to apply orientation.', type: 'error' });
    } finally {
      setIsChangingOrientation(false);
    }
  };

  // --- Delivery Charge Actions ---
  const handleStartEditTier = (tier: DeliveryChargeTier) => {
    setEditingTierId(tier._id);
    setEditMaxDistance(tier.maxDistance.toString());
    setEditCharge(tier.charge.toString());
  };

  const handleSaveEditTier = async (tierId: string) => {
    const dist = parseFloat(editMaxDistance);
    const fee = parseFloat(editCharge);

    if (isNaN(dist) || dist <= 0) {
      showToast({ title: 'Invalid Input', message: 'Max distance must be a valid positive number.', type: 'warning' });
      return;
    }
    if (isNaN(fee) || fee < 0) {
      showToast({ title: 'Invalid Input', message: 'Delivery charge must be a valid positive number.', type: 'warning' });
      return;
    }

    setSubmittingTier(true);
    try {
      const res = await settingsService.updateDeliveryCharge(tierId, {
        maxDistance: dist,
        charge: fee,
      });

      if (res.success) {
        showToast({ title: 'Success', message: 'Delivery charge tier updated.', type: 'success' });
        setEditingTierId(null);
        loadGlobalConfig();
      } else {
        showToast({ title: 'Error', message: res.message || 'Failed to update delivery charge.', type: 'error' });
      }
    } catch {
      showToast({ title: 'Error', message: 'An error occurred while updating delivery charge tier.', type: 'error' });
    } finally {
      setSubmittingTier(false);
    }
  };

  const handleCreateTier = async () => {
    const dist = parseFloat(newMaxDistance);
    const fee = parseFloat(newCharge);

    if (isNaN(dist) || dist <= 0) {
      showToast({ title: 'Invalid Input', message: 'Max distance must be a valid positive number.', type: 'warning' });
      return;
    }
    if (isNaN(fee) || fee < 0) {
      showToast({ title: 'Invalid Input', message: 'Delivery charge must be a valid positive number.', type: 'warning' });
      return;
    }

    setSubmittingTier(true);
    try {
      const res = await settingsService.createDeliveryCharge(dist, fee);
      if (res.success) {
        showToast({ title: 'Success', message: 'New delivery charge tier added.', type: 'success' });
        setIsAddingTier(false);
        setNewMaxDistance('');
        setNewCharge('');
        loadGlobalConfig();
      } else {
        showToast({ title: 'Error', message: res.message || 'Failed to create delivery charge tier.', type: 'error' });
      }
    } catch {
      showToast({ title: 'Error', message: 'An error occurred while creating delivery charge tier.', type: 'error' });
    } finally {
      setSubmittingTier(false);
    }
  };

  const handleDeleteTier = (tierId: string, maxDistance: number) => {
    setSelectedTierToDelete({ id: tierId, distance: maxDistance });
    setDeleteTierModalVisible(true);
  };

  const handleDeleteTierConfirm = async () => {
    if (!selectedTierToDelete) return;
    const { id: tierId } = selectedTierToDelete;
    setSubmittingTier(true);
    try {
      const res = await settingsService.deleteDeliveryCharge(tierId);
      if (res.success) {
        showToast({ title: 'Deleted', message: 'Delivery charge tier deleted.', type: 'success' });
        loadGlobalConfig();
      } else {
        showToast({ title: 'Error', message: res.message || 'Failed to delete tier.', type: 'error' });
      }
    } catch {
      showToast({ title: 'Error', message: 'Failed to delete delivery charge tier.', type: 'error' });
    } finally {
      setSubmittingTier(false);
      setSelectedTierToDelete(null);
    }
  };

  const handleLogoutConfirm = async () => {
    setLogoutModalVisible(false);
    await logout();
    router.replace('/login');
  };

  return (
    <View style={styles.container}>
      <Header
        title="Settings & Config"
        showBackButton={true}
        rightElement={
          <TouchableOpacity
            style={{ padding: 8, marginRight: 4 }}
            onPress={() => setLogoutModalVisible(true)}
            activeOpacity={0.7}
          >
            <LogOut size={22} color={Colors.danger} />
          </TouchableOpacity>
        }
      />

      {loading ? (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: isTablet ? 24 : 16, maxWidth: 840, alignSelf: 'center', width: '100%' },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <RestaurantSettingsSkeleton />
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: isTablet ? 24 : 16, maxWidth: 840, alignSelf: 'center', width: '100%' },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Super Admin Profile Banner Card */}
          <View style={styles.profileBannerCard}>
            <View style={styles.profileBannerBadge}>
              <ShieldCheck size={24} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerName}>{user?.fullName || 'Super Administrator'}</Text>
              <Text style={styles.bannerSub}>{user?.email || 'admin@krifoo.com'} · System Root</Text>
            </View>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>SUPER ADMIN</Text>
            </View>
          </View>

          <Text style={styles.menuSectionTitle}>SYSTEM & PLATFORM CONFIG</Text>

          {/* 1. Global Menu Categories */}
          <View style={styles.expandableCard}>
            <TouchableOpacity
              style={styles.menuCardRow}
              onPress={() => setShowCategories(!showCategories)}
              activeOpacity={0.7}
            >
              <View style={styles.iconBadge}>
                <Grid size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuTitle}>Global Menu Categories</Text>
                <Text style={styles.menuSub} numberOfLines={1}>
                  {categories.length} global categories configured
                </Text>
              </View>
              {showCategories ? (
                <ChevronUp size={20} color={Colors.textMuted} />
              ) : (
                <ChevronDown size={20} color={Colors.textMuted} />
              )}
            </TouchableOpacity>

            {showCategories && (
              <View style={styles.expandedContent}>
                {categories.length === 0 ? (
                  <Text style={styles.emptyText}>No global menu categories configured.</Text>
                ) : (
                  categories.map((cat) => (
                    <View key={cat._id} style={styles.configItem}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.configItemTitle}>{cat.categoryName}</Text>
                        <Text style={styles.configItemSub}>
                          {cat.description || 'Global Category'} · {cat.isActive ? 'Active' : 'Inactive'}
                        </Text>
                      </View>
                      <View style={[styles.miniStatusBadge, cat.isActive ? styles.miniActive : styles.miniInactive]}>
                        <Text style={styles.miniStatusText}>{cat.isActive ? 'ONLINE' : 'OFFLINE'}</Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>

          {/* 2. Delivery Distance & Charge Tiers */}
          <View style={styles.expandableCard}>
            <TouchableOpacity
              style={styles.menuCardRow}
              onPress={() => setShowDeliveryCharges(!showDeliveryCharges)}
              activeOpacity={0.7}
            >
              <View style={styles.iconBadge}>
                <Truck size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuTitle}>Delivery Charge Tiers</Text>
                <Text style={styles.menuSub} numberOfLines={1}>
                  {deliveryCharges.length} distance tiers (€ per mile threshold)
                </Text>
              </View>
              {showDeliveryCharges ? (
                <ChevronUp size={20} color={Colors.textMuted} />
              ) : (
                <ChevronDown size={20} color={Colors.textMuted} />
              )}
            </TouchableOpacity>

            {showDeliveryCharges && (
              <View style={styles.expandedContent}>
                <View style={styles.tierHeaderRow}>
                  <Text style={styles.tierHeaderTitle}>Distance-based Pricing Tiers</Text>
                  {!isAddingTier && (
                    <TouchableOpacity
                      style={styles.addTierBtn}
                      onPress={() => setIsAddingTier(true)}
                    >
                      <Plus size={13} color="#FFFFFF" />
                      <Text style={styles.addTierBtnText}>Add Tier</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {isAddingTier && (
                  <View style={styles.addTierForm}>
                    <Text style={styles.formTitle}>New Delivery Tier</Text>
                    <View style={styles.inputsRow}>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Max Dist (miles)</Text>
                        <TextInput
                          style={styles.formInput}
                          keyboardType="numeric"
                          placeholder="e.g. 5"
                          placeholderTextColor={Colors.textSubtle}
                          value={newMaxDistance}
                          onChangeText={setNewMaxDistance}
                        />
                      </View>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Fee (€)</Text>
                        <TextInput
                          style={styles.formInput}
                          keyboardType="numeric"
                          placeholder="e.g. 4.00"
                          placeholderTextColor={Colors.textSubtle}
                          value={newCharge}
                          onChangeText={setNewCharge}
                        />
                      </View>
                    </View>
                    <View style={styles.formActions}>
                      <TouchableOpacity
                        style={styles.cancelBtn}
                        onPress={() => setIsAddingTier(false)}
                      >
                        <X size={14} color={Colors.textMuted} />
                        <Text style={styles.cancelBtnText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.confirmSaveBtn}
                        onPress={handleCreateTier}
                        disabled={submittingTier}
                      >
                        {submittingTier ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <>
                            <Check size={14} color="#FFFFFF" />
                            <Text style={styles.confirmSaveText}>Save Tier</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {deliveryCharges.length === 0 ? (
                  <Text style={styles.emptyText}>No delivery charge tiers configured.</Text>
                ) : (
                  deliveryCharges.map((tier) => {
                    const isEditing = editingTierId === tier._id;

                    if (isEditing) {
                      return (
                        <View key={tier._id} style={styles.editingTierCard}>
                          <View style={styles.inputsRow}>
                            <View style={styles.inputGroup}>
                              <Text style={styles.inputLabel}>Max Dist (miles)</Text>
                              <TextInput
                                style={styles.formInput}
                                keyboardType="numeric"
                                value={editMaxDistance}
                                onChangeText={setEditMaxDistance}
                              />
                            </View>
                            <View style={styles.inputGroup}>
                              <Text style={styles.inputLabel}>Fee (€)</Text>
                              <TextInput
                                style={styles.formInput}
                                keyboardType="numeric"
                                value={editCharge}
                                onChangeText={setEditCharge}
                              />
                            </View>
                          </View>
                          <View style={styles.formActions}>
                            <TouchableOpacity
                              style={styles.cancelBtn}
                              onPress={() => setEditingTierId(null)}
                            >
                              <X size={14} color={Colors.textMuted} />
                              <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.confirmSaveBtn}
                              onPress={() => handleSaveEditTier(tier._id)}
                              disabled={submittingTier}
                            >
                              {submittingTier ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                              ) : (
                                <>
                                  <Check size={14} color="#FFFFFF" />
                                  <Text style={styles.confirmSaveText}>Update</Text>
                                </>
                              )}
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    }

                    return (
                      <View key={tier._id} style={styles.tierItemRow}>
                        <View>
                          <Text style={styles.configItemTitle}>
                            Up to <Text style={{ color: Colors.primary, fontWeight: '800' }}>{tier.maxDistance} miles</Text>
                          </Text>
                          <Text style={styles.configItemSub}>Delivery Fee: €{tier.charge?.toFixed(2)}</Text>
                        </View>

                        <View style={styles.tierActions}>
                          <TouchableOpacity
                            style={styles.iconActionBtn}
                            onPress={() => handleStartEditTier(tier)}
                          >
                            <Edit2 size={15} color={Colors.info} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.iconActionBtn}
                            onPress={() => handleDeleteTier(tier._id, tier.maxDistance)}
                          >
                            <Trash2 size={15} color={Colors.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}
          </View>

          {/* 3. Universal Thermal POS Printer Setup */}
          <TouchableOpacity
            style={styles.menuCard}
            onPress={() => router.push('/printer-settings')}
            activeOpacity={0.7}
          >
            <View style={styles.iconBadge}>
              <Printer size={20} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuTitle}>Universal POS & Thermal Printing Setup</Text>
              <Text style={styles.menuSub} numberOfLines={1}>
                Epson TM-m30III, SUNMI, Star Micronics & Bluetooth/LAN Printers
              </Text>
            </View>
            <ChevronRight size={20} color={Colors.textMuted} />
          </TouchableOpacity>

          {/* 4. Order Sound & Buzz Alerts */}
          <TouchableOpacity
            style={styles.menuCard}
            onPress={() => router.push('/sound-settings')}
            activeOpacity={0.7}
          >
            <View style={styles.iconBadge}>
              <Bell size={20} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuTitle}>Order Sound & Buzz Alerts</Text>
              <Text style={styles.menuSub} numberOfLines={1}>
                Alert duration, volume level, buzzer chime & haptic vibration
              </Text>
            </View>
            <ChevronRight size={20} color={Colors.textMuted} />
          </TouchableOpacity>

          {/* 5. Display Orientation (POS Desktop Mode) */}
          <View style={styles.expandableCard}>
            <TouchableOpacity
              style={styles.menuCardRow}
              onPress={() => setShowOrientationConfig(!showOrientationConfig)}
              activeOpacity={0.7}
            >
              <View style={styles.iconBadge}>
                <Monitor size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuTitle}>Screen Orientation & Display</Text>
                <Text style={styles.menuSub} numberOfLines={1}>
                  Current: {appOrientation.toUpperCase()} (Portrait / POS Landscape)
                </Text>
              </View>
              {showOrientationConfig ? (
                <ChevronUp size={20} color={Colors.textMuted} />
              ) : (
                <ChevronDown size={20} color={Colors.textMuted} />
              )}
            </TouchableOpacity>

            {showOrientationConfig && (
              <View style={styles.expandedContent}>
                <View style={styles.orientationButtonsRow}>
                  <TouchableOpacity
                    style={[
                      styles.orientationBtn,
                      appOrientation === 'portrait' && styles.orientationBtnActive,
                    ]}
                    onPress={() => handleSetOrientation('portrait')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.orientationBtnText, appOrientation === 'portrait' && styles.orientationBtnTextActive]}>
                      Portrait (Default)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.orientationBtn,
                      appOrientation === 'landscape' && styles.orientationBtnActive,
                    ]}
                    onPress={() => handleSetOrientation('landscape')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.orientationBtnText, appOrientation === 'landscape' && styles.orientationBtnTextActive]}>
                      Landscape (POS)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.orientationBtn,
                      appOrientation === 'default' && styles.orientationBtnActive,
                    ]}
                    onPress={() => handleSetOrientation('default')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.orientationBtnText, appOrientation === 'default' && styles.orientationBtnTextActive]}>
                      Sensor Auto
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* 6. Backend API Server Configuration */}
          <View style={styles.expandableCard}>
            <TouchableOpacity
              style={styles.menuCardRow}
              onPress={() => setShowApiConfig(!showApiConfig)}
              activeOpacity={0.7}
            >
              <View style={styles.iconBadge}>
                <Server size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuTitle}>Backend Server & API Config</Text>
                <Text style={styles.menuSub} numberOfLines={1}>
                  Endpoint: {apiUrl || 'Default Base URL'}
                </Text>
              </View>
              {showApiConfig ? (
                <ChevronUp size={20} color={Colors.textMuted} />
              ) : (
                <ChevronDown size={20} color={Colors.textMuted} />
              )}
            </TouchableOpacity>

            {showApiConfig && (
              <View style={styles.expandedContent}>
                <View style={styles.urlInputRow}>
                  <TextInput
                    style={styles.urlInput}
                    value={apiUrl}
                    onChangeText={setApiUrl}
                    placeholder="https://api.krifoo.com"
                    placeholderTextColor={Colors.textSubtle}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity style={styles.saveUrlBtn} onPress={handleSaveApiUrl}>
                    <Text style={styles.saveUrlText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          <Text style={[styles.menuSectionTitle, { marginTop: 16 }]}>LEGAL & SUPPORT</Text>

          {/* 7. Terms & Conditions */}
          <TouchableOpacity
            style={styles.menuCard}
            onPress={() => router.push('/terms-conditions')}
            activeOpacity={0.7}
          >
            <View style={styles.iconBadge}>
              <Shield size={20} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuTitle}>Terms & Conditions</Text>
              <Text style={styles.menuSub} numberOfLines={1}>
                Krifoo Super Admin platform agreement & policies
              </Text>
            </View>
            <ChevronRight size={20} color={Colors.textMuted} />
          </TouchableOpacity>

          {/* 8. Privacy Policy */}
          <TouchableOpacity
            style={styles.menuCard}
            onPress={() => router.push('/privacy-policy')}
            activeOpacity={0.7}
          >
            <View style={styles.iconBadge}>
              <Shield size={20} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuTitle}>Privacy Policy</Text>
              <Text style={styles.menuSub} numberOfLines={1}>
                Platform security & data governance policies
              </Text>
            </View>
            <ChevronRight size={20} color={Colors.textMuted} />
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Delete Tier Confirm Modal */}
      <ConfirmModal
        visible={deleteTierModalVisible}
        title="Delete Delivery Tier"
        message={`Delete tier for distances up to ${selectedTierToDelete?.distance} miles?`}
        confirmText="Delete"
        cancelText="Cancel"
        isDanger={true}
        onConfirm={handleDeleteTierConfirm}
        onClose={() => setDeleteTierModalVisible(false)}
      />

      {/* Logout Confirm Modal */}
      <ConfirmModal
        visible={logoutModalVisible}
        title="Logout"
        message="Are you sure you want to log out from Super Admin?"
        confirmText="Logout"
        cancelText="Cancel"
        isDanger={true}
        onConfirm={handleLogoutConfirm}
        onClose={() => setLogoutModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  profileBannerCard: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileBannerBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  bannerName: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  bannerSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  roleBadge: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#065F46',
    letterSpacing: 0.3,
  },
  menuSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSubtle,
    letterSpacing: 0.5,
    marginBottom: 10,
    marginLeft: 4,
  },
  menuCard: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  expandableCard: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  menuCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
  },
  menuSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  expandedContent: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
    paddingTop: 12,
  },
  emptyText: {
    fontSize: 12,
    color: Colors.textSubtle,
    fontStyle: 'italic',
    paddingVertical: 6,
  },
  configItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  configItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  configItemSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  miniStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  miniActive: {
    backgroundColor: '#ECFDF5',
  },
  miniInactive: {
    backgroundColor: '#FEF2F2',
  },
  miniStatusText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#065F46',
  },
  tierHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  tierHeaderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.text,
  },
  addTierBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  addTierBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  tierItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  tierActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconActionBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  addTierForm: {
    backgroundColor: Colors.card,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  editingTierCard: {
    backgroundColor: Colors.card,
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  formTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 8,
  },
  inputsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    marginBottom: 3,
  },
  formInput: {
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: Colors.text,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  cancelBtnText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '700',
  },
  confirmSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  confirmSaveText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  orientationButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  orientationBtn: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'center',
  },
  orientationBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  orientationBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text,
  },
  orientationBtnTextActive: {
    color: '#FFFFFF',
  },
  urlInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  urlInput: {
    flex: 1,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: Colors.text,
  },
  saveUrlBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  saveUrlText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
