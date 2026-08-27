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
  Save,
  ChevronDown,
  ChevronUp,
  Plus,
  Edit2,
  Trash2,
  X,
  Check,
  Bell,
  Volume2,
  VolumeX,
  Printer,
  Smartphone,
  Monitor,
  RotateCw,
} from 'lucide-react-native';
import { playOrderBuzzSound, stopOrderBuzzSound } from '../services/sound.service';
import {
  printSampleThermalReceipt,
  isAutoPrintEnabled,
  setAutoPrintEnabled,
} from '../services/thermal-print.service';
import {
  getSavedOrientation,
  applyOrientation,
  AppOrientation,
} from '../services/orientation.service';

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  const [apiUrl, setApiUrl] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [deliveryCharges, setDeliveryCharges] = useState<DeliveryChargeTier[]>([]);
  const [loading, setLoading] = useState(false);

  // Confirm Modal States
  const [deleteTierModalVisible, setDeleteTierModalVisible] = useState(false);
  const [selectedTierToDelete, setSelectedTierToDelete] = useState<{ id: string; distance: number } | null>(null);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);

  // Toggle states
  const [showCategories, setShowCategories] = useState(false);
  const [showDeliveryCharges, setShowDeliveryCharges] = useState(false);

  // Delivery charge editing / adding states
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [editMaxDistance, setEditMaxDistance] = useState('');
  const [editCharge, setEditCharge] = useState('');

  const [isAddingTier, setIsAddingTier] = useState(false);
  const [newMaxDistance, setNewMaxDistance] = useState('');
  const [newCharge, setNewCharge] = useState('');
  const [submittingTier, setSubmittingTier] = useState(false);
  const [isTestingSound, setIsTestingSound] = useState(false);
  const [autoPrintEnabled, setAutoPrintState] = useState(true);
  const [isTestingPrint, setIsTestingPrint] = useState(false);
  const [appOrientation, setAppOrientation] = useState<AppOrientation>('portrait');
  const [isChangingOrientation, setIsChangingOrientation] = useState(false);

  useEffect(() => {
    isAutoPrintEnabled().then(setAutoPrintState);
    getSavedOrientation().then(setAppOrientation);
  }, []);

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
      } else {
        showToast({ title: 'Error', message: 'Failed to rotate screen.', type: 'error' });
      }
    } catch {
      showToast({ title: 'Error', message: 'Failed to apply orientation.', type: 'error' });
    } finally {
      setIsChangingOrientation(false);
    }
  };

  const handleToggleAutoPrint = async (val: boolean) => {
    setAutoPrintState(val);
    await setAutoPrintEnabled(val);
    showToast({
      title: val ? 'Auto-Print Enabled' : 'Auto-Print Disabled',
      message: val ? 'New orders will automatically print on thermal paper.' : 'Auto-printing for new orders disabled.',
      type: 'info',
    });
  };

  const handleTestPrint = async () => {
    setIsTestingPrint(true);
    try {
      showToast({ title: 'Testing Printer', message: 'Generating sample thermal receipt...', type: 'info' });
      const success = await printSampleThermalReceipt();
      if (success) {
        showToast({ title: 'Print Success', message: 'Sample receipt sent to printer.', type: 'success' });
      } else {
        showToast({ title: 'Print Cancelled', message: 'Print job cancelled or printer unavailable.', type: 'warning' });
      }
    } catch (e) {
      showToast({ title: 'Print Error', message: 'Failed to test print receipt.', type: 'error' });
    } finally {
      setIsTestingPrint(false);
    }
  };

  const handleTestOrderBuzz = async () => {
    if (isTestingSound) {
      await stopOrderBuzzSound();
      setIsTestingSound(false);
      showToast({ title: 'Alert Stopped', message: 'Order buzz alert test stopped.', type: 'info' });
    } else {
      setIsTestingSound(true);
      showToast({ title: 'Playing Alert', message: '5-second order buzz sound and vibration started...', type: 'info' });
      await playOrderBuzzSound(5000);
      setTimeout(() => {
        setIsTestingSound(false);
      }, 5000);
    }
  };

  useEffect(() => {
    if (user && user.userType !== 'super_admin') {
      router.replace('/restaurant-settings');
      return;
    }
    getApiBaseUrl().then(setApiUrl);
    loadGlobalConfig();
  }, [user]);

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
    } catch (e) {
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
    } catch (e) {
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
    } catch (e) {
      showToast({ title: 'Error', message: 'Failed to delete delivery charge tier.', type: 'error' });
    } finally {
      setSubmittingTier(false);
      setSelectedTierToDelete(null);
    }
  };

  const handleLogout = () => {
    setLogoutModalVisible(true);
  };

  const handleLogoutConfirm = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <View style={styles.container}>
      <Header title="Settings & Config" subtitle="Super admin system preferences" />

      <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={styles.card}>
          <View style={styles.profileRow}>
            <View style={styles.avatarCircle}>
              <ShieldCheck size={28} color={Colors.primary} />
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user?.fullName || 'Super Admin'}</Text>
              <Text style={styles.profileEmail}>{user?.email || 'admin@krifoo.com'}</Text>
              <View style={styles.adminBadge}>
                <Text style={styles.adminBadgeText}>SUPER ADMIN ROLE</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Server API Config */}
        {/* <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Server size={18} color={Colors.info} />
            <Text style={styles.cardTitle}>Backend Server Configuration</Text>
          </View>

          <Text style={styles.cardSubtitle}>
            Configure the HTTP endpoint for API requests (e.g. backend server host).
          </Text>

          <View style={styles.urlInputRow}>
            <TextInput
              style={styles.urlInput}
              value={apiUrl}
              onChangeText={setApiUrl}
              placeholder="http://localhost:5000"
              placeholderTextColor={Colors.textSubtle}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.saveUrlBtn} onPress={handleSaveApiUrl}>
              <Save size={16} color="#FFFFFF" />
              <Text style={styles.saveUrlText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View> */}

        {/* Global Categories */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.cardHeaderPressable}
            onPress={() => setShowCategories(!showCategories)}
            activeOpacity={0.7}
          >
            <View style={styles.headerTitleGroup}>
              <Grid size={18} color={Colors.primary} />
              <Text style={styles.cardTitle}>Global Categories ({categories.length})</Text>
            </View>
            {showCategories ? (
              <ChevronUp size={18} color={Colors.textMuted} />
            ) : (
              <ChevronDown size={18} color={Colors.textMuted} />
            )}
          </TouchableOpacity>

          {showCategories && (
            <View style={styles.expandableContent}>
              {categories.length === 0 ? (
                <Text style={styles.emptyText}>No global menu categories configured yet.</Text>
              ) : (
                categories.map((cat) => (
                  <View key={cat._id} style={styles.configItem}>
                    <Text style={styles.configItemTitle}>{cat.categoryName}</Text>
                    <Text style={styles.configItemSub}>
                      {cat.description || 'Global Category'} ({cat.isActive ? 'Active' : 'Inactive'})
                    </Text>
                  </View>
                ))
              )}
            </View>
          )}
        </View>

        {/* Editable Delivery Charges Tiers */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.cardHeaderPressable}
            onPress={() => setShowDeliveryCharges(!showDeliveryCharges)}
            activeOpacity={0.7}
          >
            <View style={styles.headerTitleGroup}>
              <Truck size={18} color={Colors.warning} />
              <Text style={styles.cardTitle}>
                Delivery Charge Tiers ({deliveryCharges.length})
              </Text>
            </View>
            {showDeliveryCharges ? (
              <ChevronUp size={18} color={Colors.textMuted} />
            ) : (
              <ChevronDown size={18} color={Colors.textMuted} />
            )}
          </TouchableOpacity>

          {showDeliveryCharges && (
            <View style={styles.expandableContent}>
              <View style={styles.tierSectionTop}>
                <Text style={styles.tierSubHeader}>Distance-based Delivery Pricing Tiers</Text>
                {!isAddingTier && (
                  <TouchableOpacity
                    style={styles.addTierBtn}
                    onPress={() => setIsAddingTier(true)}
                  >
                    <Plus size={14} color="#FFFFFF" />
                    <Text style={styles.addTierBtnText}>Add Tier</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Add New Tier Inline Form */}
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
                        placeholder="e.g. 40"
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

              {/* Tiers List */}
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
                          Max Distance: <Text style={{ color: Colors.primary }}>{tier.maxDistance} miles</Text>
                        </Text>
                        <Text style={styles.configItemVal}>
                          Delivery Fee: €{tier.charge?.toFixed(2)}
                        </Text>
                      </View>

                      <View style={styles.tierActions}>
                        <TouchableOpacity
                          style={styles.iconActionBtn}
                          onPress={() => handleStartEditTier(tier)}
                        >
                          <Edit2 size={16} color={Colors.info} />
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.iconActionBtn}
                          onPress={() => handleDeleteTier(tier._id, tier.maxDistance)}
                        >
                          <Trash2 size={16} color={Colors.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}
        </View>

        {/* Sound & Notifications Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Bell size={20} color={Colors.primary} />
            <Text style={styles.cardTitle}>Order Sound & Buzz Alerts</Text>
          </View>
          <Text style={styles.cardSubtitle}>
            When a new order is received, the app will play a loud 5-second buzzer sound and vibrate the device.
          </Text>

          <View style={[styles.configItem, { borderBottomWidth: 0, paddingVertical: 8 }]}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.configItemTitle}>5-Second Buzz Alert</Text>
              <Text style={styles.configItemSub}>Active on all incoming WebSocket & Push orders</Text>
            </View>
            <TouchableOpacity
              style={[
                styles.soundTestBtn,
                isTestingSound && styles.soundTestBtnActive,
              ]}
              onPress={handleTestOrderBuzz}
              activeOpacity={0.8}
            >
              {isTestingSound ? (
                <>
                  <VolumeX size={16} color="#FFFFFF" />
                  <Text style={styles.soundTestBtnText}>Stop Alert</Text>
                </>
              ) : (
                <>
                  <Volume2 size={16} color="#FFFFFF" />
                  <Text style={styles.soundTestBtnText}>Test 5s Buzz</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Thermal Printer & Auto-Print Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Printer size={20} color={Colors.primary} />
            <Text style={styles.cardTitle}> POS Thermal Printer</Text>
          </View>
          <Text style={styles.cardSubtitle}>
            Auto-prints formatted receipts matching standard restaurant POS printers whenever a new order arrives.
          </Text>

          {/* Auto Print Toggle */}
          <View style={[styles.configItem, { paddingVertical: 10 }]}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.configItemTitle}>Auto-Print New Orders</Text>
              <Text style={styles.configItemSub}>Automatically triggers print job on order placement</Text>
            </View>
            <Switch
              value={autoPrintEnabled}
              onValueChange={handleToggleAutoPrint}
              trackColor={{ true: Colors.primary, false: Colors.cardBorder }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Test Print Button */}
          <View style={[styles.configItem, { borderBottomWidth: 0, paddingVertical: 10 }]}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.configItemTitle}>Test Thermal Print</Text>
              <Text style={styles.configItemSub}>Print a sample POS receipt</Text>
            </View>
            <TouchableOpacity
              style={[
                styles.soundTestBtn,
                { backgroundColor: '#1E293B' },
              ]}
              onPress={handleTestPrint}
              disabled={isTestingPrint}
              activeOpacity={0.8}
            >
              {isTestingPrint ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Printer size={16} color="#FFFFFF" />
                  <Text style={styles.soundTestBtnText}>Test Print</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Screen Orientation & POS Display Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Monitor size={20} color={Colors.primary} />
            <Text style={styles.cardTitle}>Screen Orientation & Display</Text>
          </View>
          <Text style={styles.cardSubtitle}>
            Rotate the app into Landscape mode for Sunmi V3 MIX desktop POS setups or switch back to Portrait.
          </Text>

          <View style={styles.orientationButtonsRow}>
            {/* Portrait Button */}
            <TouchableOpacity
              style={[
                styles.orientationBtn,
                appOrientation === 'portrait' && styles.orientationBtnActive,
              ]}
              onPress={() => handleSetOrientation('portrait')}
              disabled={isChangingOrientation}
              activeOpacity={0.8}
            >
              <Smartphone
                size={18}
                color={appOrientation === 'portrait' ? '#FFFFFF' : Colors.textMuted}
              />
              <Text
                style={[
                  styles.orientationBtnText,
                  appOrientation === 'portrait' && styles.orientationBtnTextActive,
                ]}
              >
                Portrait
              </Text>
            </TouchableOpacity>

            {/* Landscape Button */}
            <TouchableOpacity
              style={[
                styles.orientationBtn,
                appOrientation === 'landscape' && styles.orientationBtnActive,
              ]}
              onPress={() => handleSetOrientation('landscape')}
              disabled={isChangingOrientation}
              activeOpacity={0.8}
            >
              <Monitor
                size={18}
                color={appOrientation === 'landscape' ? '#FFFFFF' : Colors.textMuted}
              />
              <Text
                style={[
                  styles.orientationBtnText,
                  appOrientation === 'landscape' && styles.orientationBtnTextActive,
                ]}
              >
                Landscape
              </Text>
            </TouchableOpacity>

            {/* Auto Rotate Button */}
            <TouchableOpacity
              style={[
                styles.orientationBtn,
                appOrientation === 'auto' && styles.orientationBtnActive,
              ]}
              onPress={() => handleSetOrientation('auto')}
              disabled={isChangingOrientation}
              activeOpacity={0.8}
            >
              <RotateCw
                size={18}
                color={appOrientation === 'auto' ? '#FFFFFF' : Colors.textMuted}
              />
              <Text
                style={[
                  styles.orientationBtnText,
                  appOrientation === 'auto' && styles.orientationBtnTextActive,
                ]}
              >
                Auto-Rotate
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Legal & Policies Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <ShieldCheck size={20} color={Colors.primary} />
            <Text style={styles.cardTitle}>Legal & Policies</Text>
          </View>
          <Text style={styles.cardSubtitle}>Review Krifoo Admin operator terms and guidelines</Text>

          <TouchableOpacity
            style={styles.configItem}
            onPress={() => router.push('/terms-conditions')}
            activeOpacity={0.7}
          >
            <View>
              <Text style={styles.configItemTitle}>Terms & Conditions</Text>
              <Text style={styles.configItemSub}>Read our terms of service</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.configItem, { borderBottomWidth: 0 }]}
            onPress={() => router.push('/privacy-policy')}
            activeOpacity={0.7}
          >
            <View>
              <Text style={styles.configItemTitle}>Privacy Policy</Text>
              <Text style={styles.configItemSub}>Read our data privacy policy</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <LogOut size={18} color="#FFFFFF" />
          <Text style={styles.logoutBtnText}>Log Out of Admin</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Delete Tier Confirm Modal */}
      <ConfirmModal
        visible={deleteTierModalVisible}
        title="Delete Tier"
        message={`Are you sure you want to delete the ${selectedTierToDelete?.distance || ''} miles delivery charge tier?`}
        confirmText="Delete"
        isDestructive={true}
        onConfirm={handleDeleteTierConfirm}
        onClose={() => {
          setDeleteTierModalVisible(false);
          setSelectedTierToDelete(null);
        }}
      />

      {/* Logout Confirm Modal */}
      <ConfirmModal
        visible={logoutModalVisible}
        title="Logout"
        message="Are you sure you want to log out?"
        confirmText="Logout"
        isDestructive={true}
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
  scrollBody: {
    padding: 16,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    borderColor: Colors.primary,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 14,
  },
  profileName: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  profileEmail: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  adminBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  adminBadgeText: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cardHeaderPressable: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cardTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  cardSubtitle: {
    color: Colors.textMuted,
    fontSize: 12,
    marginBottom: 12,
  },
  urlInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  urlInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    borderRadius: 8,
    color: Colors.text,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 13,
  },
  saveUrlBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    borderRadius: 8,
    justifyContent: 'center',
  },
  saveUrlText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  emptyText: {
    color: Colors.textSubtle,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  configItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  configItemTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  configItemSub: {
    color: Colors.textSubtle,
    fontSize: 12,
  },
  configItemVal: {
    color: Colors.warning,
    fontSize: 13,
    fontWeight: '700',
  },
  logoutBtn: {
    backgroundColor: Colors.danger,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 10,
    marginBottom: 30,
  },
  logoutBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  expandableContent: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
    paddingTop: 8,
  },
  tierSectionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tierSubHeader: {
    color: Colors.textSubtle,
    fontSize: 11,
    fontWeight: '600',
  },
  addTierBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  addTierBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
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
    alignItems: 'center',
    gap: 12,
  },
  iconActionBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  addTierForm: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.primary,
    padding: 12,
    marginBottom: 12,
  },
  editingTierCard: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.info,
    padding: 12,
    marginVertical: 6,
  },
  formTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  inputsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    color: Colors.textSubtle,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  formInput: {
    backgroundColor: '#FFFFFF',
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    borderRadius: 8,
    color: Colors.text,
    paddingHorizontal: 10,
    height: 38,
    fontSize: 13,
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
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
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
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  soundTestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
  },
  soundTestBtnActive: {
    backgroundColor: Colors.danger,
  },
  soundTestBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  orientationButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  orientationBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
  },
  orientationBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  orientationBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  orientationBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
