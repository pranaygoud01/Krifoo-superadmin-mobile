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
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Header } from '../components/Header';
import { ConfirmModal } from '../components/ConfirmModal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Colors } from '../constants/colors';
import { getApiBaseUrl, setApiBaseUrl } from '../services/api';
import {
  ShieldCheck,
  Server,
  LogOut,
  Grid,
  Truck,
  Bell,
  Printer,
  Monitor,
  ChevronRight,
  Shield,
  Layers,
  Globe,
  Check,
  Smartphone,
  Edit3,
  Clock,
  Sliders,
} from 'lucide-react-native';
import {
  getSavedOrientation,
  applyOrientation,
  AppOrientation,
} from '../services/orientation.service';
import RestaurantSettingsScreen from './restaurant-settings';

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  // If logged in as restaurant owner, render store-specific settings
  if (user && user.userType !== 'super_admin') {
    return <RestaurantSettingsScreen />;
  }

  const [apiUrl, setApiUrl] = useState('');
  const [editingApiUrl, setEditingApiUrl] = useState(false);
  const [tempApiUrl, setTempApiUrl] = useState('');
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [appOrientation, setAppOrientation] = useState<AppOrientation>('portrait');
  const [isChangingOrientation, setIsChangingOrientation] = useState(false);

  useEffect(() => {
    getApiBaseUrl().then((url) => {
      setApiUrl(url);
      setTempApiUrl(url);
    });
    getSavedOrientation().then(setAppOrientation);
  }, []);

  const handleSaveApiUrl = async () => {
    if (!tempApiUrl.trim()) return;
    await setApiBaseUrl(tempApiUrl.trim());
    setApiUrl(tempApiUrl.trim());
    setEditingApiUrl(false);
    showToast({ title: 'Saved', message: 'API Base URL updated successfully.', type: 'success' });
  };

  const handleSetOrientation = async (mode: AppOrientation) => {
    if (isChangingOrientation || mode === appOrientation) return;
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

  const handleLogoutConfirm = async () => {
    setLogoutModalVisible(false);
    await logout();
    router.replace('/login');
  };

  return (
    <View style={styles.container}>
      <Header
        title="Settings & System"
        showBackButton={true}
        rightElement={
          <TouchableOpacity
            style={styles.headerLogoutBtn}
            onPress={() => setLogoutModalVisible(true)}
            activeOpacity={0.7}
          >
            <LogOut size={18} color={Colors.danger} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingHorizontal: isTablet ? 24 : 16, maxWidth: 840, alignSelf: 'center', width: '100%' },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <ShieldCheck size={24} color={Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{user?.fullName || 'Super Administrator'}</Text>
            <Text style={styles.profileEmail}>{user?.email || 'admin@krifoo.com'}</Text>
          </View>
          <View style={styles.adminBadge}>
            <Text style={styles.adminBadgeText}>SUPER ADMIN</Text>
          </View>
        </View>

        {/* SECTION 1: CHANNELS & STORES */}
        <Text style={styles.sectionHeader}>STOREFRONT & ORDERING CHANNELS</Text>
        <View style={styles.cardGroup}>
          {/* External Website & Domain */}
          <TouchableOpacity
            style={[styles.groupItem, styles.groupItemBorder]}
            onPress={() => router.push('/external-website-settings')}
            activeOpacity={0.7}
          >
            <View style={[styles.itemIconBadge, { backgroundColor: '#EEF2FF' }]}>
              <Globe size={18} color="#4F46E5" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.itemTitleRow}>
                <Text style={styles.itemTitle}>External Website & Delivery</Text>
                <View style={styles.newBadge}>
                  <Text style={styles.newBadgeText}>PORTED</Text>
                </View>
              </View>
              <Text style={styles.itemSubtitle}>Custom domain, brand colors, banners & tiered delivery fees</Text>
            </View>
            <ChevronRight size={18} color={Colors.textMuted} />
          </TouchableOpacity>

          {/* Global Menu Categories */}
          <TouchableOpacity
            style={[styles.groupItem, styles.groupItemBorder]}
            onPress={() => router.push('/categories')}
            activeOpacity={0.7}
          >
            <View style={[styles.itemIconBadge, { backgroundColor: '#F0FDF4' }]}>
              <Grid size={18} color="#16A34A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>Global Menu Categories</Text>
              <Text style={styles.itemSubtitle}>Platform categories, photo badges & visibility toggles</Text>
            </View>
            <ChevronRight size={18} color={Colors.textMuted} />
          </TouchableOpacity>

          {/* Platform Delivery Distance Tiers */}
          <TouchableOpacity
            style={[styles.groupItem, styles.groupItemBorder]}
            onPress={() => router.push('/delivery-charges')}
            activeOpacity={0.7}
          >
            <View style={[styles.itemIconBadge, { backgroundColor: '#FEF3C7' }]}>
              <Truck size={18} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>Platform Delivery Distance Tiers</Text>
              <Text style={styles.itemSubtitle}>Default mileage threshold tiers & delivery fees (£)</Text>
            </View>
            <ChevronRight size={18} color={Colors.textMuted} />
          </TouchableOpacity>

          {/* Operational & Delivery Timings */}
          <TouchableOpacity
            style={[styles.groupItem, styles.groupItemBorder]}
            onPress={() => router.push('/operational-timings')}
            activeOpacity={0.7}
          >
            <View style={[styles.itemIconBadge, { backgroundColor: '#F3E8FF' }]}>
              <Clock size={18} color="#9333EA" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>Operating & Delivery Timings</Text>
              <Text style={styles.itemSubtitle}>Store hours, Krifoo delivery schedule & external website hours</Text>
            </View>
            <ChevronRight size={18} color={Colors.textMuted} />
          </TouchableOpacity>

          {/* Acceptance & Payment Settings */}
          <TouchableOpacity
            style={[styles.groupItem, styles.groupItemBorder]}
            onPress={() => router.push('/operation-settings')}
            activeOpacity={0.7}
          >
            <View style={[styles.itemIconBadge, { backgroundColor: '#FEF3C7' }]}>
              <Sliders size={18} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>Acceptance & Payment Rules</Text>
              <Text style={styles.itemSubtitle}>Krifoo app and external website online payments, COD & pickup</Text>
            </View>
            <ChevronRight size={18} color={Colors.textMuted} />
          </TouchableOpacity>

          {/* Global Platform Settings */}
          <TouchableOpacity
            style={styles.groupItem}
            onPress={() => router.push('/global-settings')}
            activeOpacity={0.7}
          >
            <View style={[styles.itemIconBadge, { backgroundColor: '#FDF2F8' }]}>
              <Layers size={18} color="#DB2777" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>Global Platform Settings</Text>
              <Text style={styles.itemSubtitle}>Order notification emails, commission rates & fee rules</Text>
            </View>
            <ChevronRight size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* SECTION 2: HARDWARE & DISPLAY */}
        <Text style={styles.sectionHeader}>POS HARDWARE & DISPLAY</Text>
        <View style={styles.cardGroup}>
          {/* Thermal POS Printer Setup */}
          <TouchableOpacity
            style={[styles.groupItem, styles.groupItemBorder]}
            onPress={() => router.push('/printer-settings')}
            activeOpacity={0.7}
          >
            <View style={[styles.itemIconBadge, { backgroundColor: '#E0F2FE' }]}>
              <Printer size={18} color="#0284C7" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>Thermal POS Printers</Text>
              <Text style={styles.itemSubtitle}>Epson TM-m30III, SUNMI, Star Micronics & Bluetooth/LAN</Text>
            </View>
            <ChevronRight size={18} color={Colors.textMuted} />
          </TouchableOpacity>

          {/* Sound & Buzz Alerts */}
          <TouchableOpacity
            style={[styles.groupItem, styles.groupItemBorder]}
            onPress={() => router.push('/sound-settings')}
            activeOpacity={0.7}
          >
            <View style={[styles.itemIconBadge, { backgroundColor: '#FEE2E2' }]}>
              <Bell size={18} color="#DC2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>Order Sound & Buzz Alerts</Text>
              <Text style={styles.itemSubtitle}>Continuous buzzer loop, loud chime volume & haptic pulses</Text>
            </View>
            <ChevronRight size={18} color={Colors.textMuted} />
          </TouchableOpacity>

          {/* Minimal Screen Orientation Selector */}
          <View style={styles.groupItem}>
            <View style={[styles.itemIconBadge, { backgroundColor: '#F1F5F9' }]}>
              <Monitor size={18} color="#475569" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>Screen Orientation</Text>
              <View style={styles.orientationPillRow}>
                <TouchableOpacity
                  style={[
                    styles.orientationPill,
                    appOrientation === 'portrait' && styles.orientationPillActive,
                  ]}
                  onPress={() => handleSetOrientation('portrait')}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.orientationPillText,
                      appOrientation === 'portrait' && styles.orientationPillTextActive,
                    ]}
                  >
                    Portrait
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.orientationPill,
                    appOrientation === 'landscape' && styles.orientationPillActive,
                  ]}
                  onPress={() => handleSetOrientation('landscape')}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.orientationPillText,
                      appOrientation === 'landscape' && styles.orientationPillTextActive,
                    ]}
                  >
                    POS Landscape
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.orientationPill,
                    appOrientation === 'default' && styles.orientationPillActive,
                  ]}
                  onPress={() => handleSetOrientation('default')}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.orientationPillText,
                      appOrientation === 'default' && styles.orientationPillTextActive,
                    ]}
                  >
                    Auto
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* SECTION 3: SYSTEM & LEGAL */}
        <Text style={styles.sectionHeader}>SYSTEM & LEGAL</Text>
        <View style={styles.cardGroup}>
          {/* API Server Endpoint */}
          <View style={[styles.groupItem, styles.groupItemBorder]}>
            <View style={[styles.itemIconBadge, { backgroundColor: '#ECFEFF' }]}>
              <Server size={18} color="#0891B2" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.itemTitleRow}>
                <Text style={styles.itemTitle}>Backend API Server</Text>
                <TouchableOpacity
                  onPress={() => setEditingApiUrl(!editingApiUrl)}
                  style={styles.miniEditBtn}
                >
                  <Edit3 size={12} color={Colors.primary} />
                  <Text style={styles.miniEditBtnText}>
                    {editingApiUrl ? 'Cancel' : 'Edit'}
                  </Text>
                </TouchableOpacity>
              </View>

              {editingApiUrl ? (
                <View style={styles.apiEditContainer}>
                  <TextInput
                    style={styles.apiInput}
                    value={tempApiUrl}
                    onChangeText={setTempApiUrl}
                    placeholder="https://api.krifoo.com"
                    placeholderTextColor={Colors.textSubtle}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity style={styles.apiSaveBtn} onPress={handleSaveApiUrl}>
                    <Check size={14} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.apiSaveBtnText}>Save</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.apiUrlText} numberOfLines={1}>
                  {apiUrl || 'Default Base URL'}
                </Text>
              )}
            </View>
          </View>

          {/* Terms & Conditions */}
          <TouchableOpacity
            style={[styles.groupItem, styles.groupItemBorder]}
            onPress={() => router.push('/terms-conditions')}
            activeOpacity={0.7}
          >
            <View style={[styles.itemIconBadge, { backgroundColor: '#F8FAFC' }]}>
              <Shield size={18} color={Colors.textMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>Terms & Conditions</Text>
              <Text style={styles.itemSubtitle}>Platform usage terms and merchant agreement</Text>
            </View>
            <ChevronRight size={18} color={Colors.textMuted} />
          </TouchableOpacity>

          {/* Privacy Policy */}
          <TouchableOpacity
            style={styles.groupItem}
            onPress={() => router.push('/privacy-policy')}
            activeOpacity={0.7}
          >
            <View style={[styles.itemIconBadge, { backgroundColor: '#F8FAFC' }]}>
              <Shield size={18} color={Colors.textMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>Privacy Policy</Text>
              <Text style={styles.itemSubtitle}>Data encryption and GDPR compliance</Text>
            </View>
            <ChevronRight size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Logout Button Card */}
        <TouchableOpacity
          style={styles.logoutCard}
          onPress={() => setLogoutModalVisible(true)}
          activeOpacity={0.7}
        >
          <LogOut size={18} color={Colors.danger} />
          <Text style={styles.logoutCardText}>Sign Out from Super Admin</Text>
        </TouchableOpacity>

        <Text style={styles.versionFooter}>Krifoo SuperAdmin Mobile · Build 2.4.0 (External Sync)</Text>
      </ScrollView>

      {/* Logout Confirm Modal */}
      <ConfirmModal
        visible={logoutModalVisible}
        title="Logout"
        message="Are you sure you want to sign out from the Super Admin portal?"
        confirmText="Sign Out"
        cancelText="Cancel"
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
  headerLogoutBtn: {
    padding: 8,
    marginRight: 4,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 110,
  },
  profileCard: {
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
  profileAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileName: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  profileEmail: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  adminBadge: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  adminBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
    letterSpacing: 0.3,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSubtle,
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 4,
  },
  cardGroup: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 20,
    overflow: 'hidden',
  },
  groupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  groupItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  itemIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: Colors.text,
  },
  itemSubtitle: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
    lineHeight: 15,
  },
  newBadge: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 6,
  },
  newBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#4F46E5',
    letterSpacing: 0.3,
  },
  orientationPillRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  orientationPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  orientationPillActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  orientationPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  orientationPillTextActive: {
    color: Colors.primary,
    fontWeight: '800',
  },
  miniEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  miniEditBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  apiUrlText: {
    fontSize: 11.5,
    color: Colors.textMuted,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  apiEditContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  apiInput: {
    flex: 1,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    color: Colors.text,
  },
  apiSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  apiSaveBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  logoutCard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  logoutCardText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: Colors.danger,
  },
  versionFooter: {
    textAlign: 'center',
    fontSize: 11,
    color: Colors.textSubtle,
    marginTop: 4,
  },
});
