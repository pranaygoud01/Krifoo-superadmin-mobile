import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Header } from '../components/Header';
import { ConfirmModal } from '../components/ConfirmModal';
import { Colors } from '../constants/colors';
import { RestaurantSettingsSkeleton } from '../components/Skeleton';
import { restaurantOwnerService } from '../services/restaurant-owner.service';
import { useAuth } from '../context/AuthContext';
import {
  Store,
  Settings2,
  Truck,
  Clock,
  Printer,
  Bell,
  CreditCard,
  Shield,
  ChevronRight,
  LogOut,
  Globe,
} from 'lucide-react-native';

export default function RestaurantSettingsScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [loading, setLoading] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [restaurantId, setRestaurantId] = useState<string>('');

  const [storeSummary, setStoreSummary] = useState({
    name: 'My Store',
    city: '',
    isActive: true,
    type: 'food_delivery_and_dining',
    stripeStatus: 'pending',
    hasExternalWebsite: false,
  });

  const loadStoreSummary = async () => {
    setLoading(true);
    try {
      const res = await restaurantOwnerService.getRestaurantProfile();
      if (res.success && res.data) {
        const r = res.data;
        if (r._id) setRestaurantId(r._id);
        setStoreSummary({
          name: r.restaurantName || 'My Store',
          city: r.address?.city || 'Location',
          isActive: r.isActive ?? true,
          type: r.restaurantType || 'food_delivery_and_dining',
          stripeStatus: r.stripeAccountStatus || 'pending',
          hasExternalWebsite: Boolean(r.externalWebsiteSettings?.domain),
        });
      }
    } catch (e) {
      console.error('Failed loading settings hub:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStoreSummary();
  }, []);

  const [togglingActive, setTogglingActive] = useState(false);

  const handleToggleStoreActive = async (newVal: boolean) => {
    setTogglingActive(true);
    try {
      const res = await restaurantOwnerService.updateRestaurantProfile({ isActive: newVal });
      if (res.success) {
        setStoreSummary((prev) => ({ ...prev, isActive: newVal }));
        Alert.alert('Store Status Updated', `Your store is now ${newVal ? 'ACTIVE (ONLINE)' : 'INACTIVE (OFFLINE)'}.`);
      } else {
        Alert.alert('Error', res.message || 'Failed to update store status.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not change store active status.');
    } finally {
      setTogglingActive(false);
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
        title="Store Configuration"
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
          {/* Store Summary Banner */}
          <View style={styles.storeBannerCard}>
            <View style={styles.storeBannerBadge}>
              <Store size={22} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerStoreName}>{storeSummary.name}</Text>
              <Text style={styles.bannerStoreSub}>
                {storeSummary.city ? `${storeSummary.city} · ` : ''}
                {storeSummary.type === 'food_delivery_and_dining'
                  ? 'Food & Dining'
                  : storeSummary.type === 'food_delivery'
                  ? 'Delivery Only'
                  : 'Retail Store'}
              </Text>
            </View>
            <View style={styles.statusToggleContainer}>
              <View
                style={[
                  styles.statusBadge,
                  storeSummary.isActive ? styles.statusActive : styles.statusInactive,
                ]}
              >
                <Text style={styles.statusBadgeText}>
                  {storeSummary.isActive ? 'ONLINE' : 'OFFLINE'}
                </Text>
              </View>
              <Switch
                value={storeSummary.isActive}
                disabled={togglingActive}
                onValueChange={handleToggleStoreActive}
                trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                thumbColor={storeSummary.isActive ? Colors.primary : Colors.textSubtle}
              />
            </View>
          </View>

          {/* SECTION 1: STORE & CHANNELS */}
          <Text style={styles.sectionHeader}>STOREFRONT & ONLINE CHANNELS</Text>
          <View style={styles.cardGroup}>
            {/* Store & Restaurant Profile */}
            <TouchableOpacity
              style={[styles.groupItem, styles.groupItemBorder]}
              onPress={() => router.push('/store-profile')}
              activeOpacity={0.7}
            >
              <View style={[styles.itemIconBadge, { backgroundColor: '#F0FDF4' }]}>
                <Store size={18} color="#16A34A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>Store & Restaurant Profile</Text>
                <Text style={styles.itemSubtitle}>Identity, contact details, shop address & notifications</Text>
              </View>
              <ChevronRight size={18} color={Colors.textMuted} />
            </TouchableOpacity>

            {/* External Website & Online Ordering */}
            <TouchableOpacity
              style={styles.groupItem}
              onPress={() =>
                router.push({
                  pathname: '/external-website-settings',
                  params: { restaurantId },
                })
              }
              activeOpacity={0.7}
            >
              <View style={[styles.itemIconBadge, { backgroundColor: '#EEF2FF' }]}>
                <Globe size={18} color="#4F46E5" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.itemTitleRow}>
                  <Text style={styles.itemTitle}>External Website & Delivery</Text>
                  <View style={styles.newBadge}>
                    <Text style={styles.newBadgeText}>LIVE EDITS</Text>
                  </View>
                </View>
                <Text style={styles.itemSubtitle}>
                  Custom domain, theme colors, banners & tiered delivery rates
                </Text>
              </View>
              <ChevronRight size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* SECTION 2: OPERATIONS & TIMINGS */}
          <Text style={styles.sectionHeader}>OPERATIONS & DELIVERY RULES</Text>
          <View style={styles.cardGroup}>
            {/* Acceptance Settings */}
            <TouchableOpacity
              style={[styles.groupItem, styles.groupItemBorder]}
              onPress={() => router.push('/operation-settings')}
              activeOpacity={0.7}
            >
              <View style={[styles.itemIconBadge, { backgroundColor: '#FEF3C7' }]}>
                <Settings2 size={18} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>Acceptance Settings</Text>
                <Text style={styles.itemSubtitle}>Online Orders, Table Bookings, COD, Auto Approve</Text>
              </View>
              <ChevronRight size={18} color={Colors.textMuted} />
            </TouchableOpacity>

            {/* Platform Delivery Settings */}
            <TouchableOpacity
              style={[styles.groupItem, styles.groupItemBorder]}
              onPress={() => router.push('/delivery-settings')}
              activeOpacity={0.7}
            >
              <View style={[styles.itemIconBadge, { backgroundColor: '#FEF9C3' }]}>
                <Truck size={18} color="#CA8A04" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>Standard Delivery Settings</Text>
                <Text style={styles.itemSubtitle}>Free delivery radius, per-mile charges & handling fees</Text>
              </View>
              <ChevronRight size={18} color={Colors.textMuted} />
            </TouchableOpacity>

            {/* Operational Timings */}
            <TouchableOpacity
              style={styles.groupItem}
              onPress={() => router.push('/operational-timings')}
              activeOpacity={0.7}
            >
              <View style={[styles.itemIconBadge, { backgroundColor: '#F3E8FF' }]}>
                <Clock size={18} color="#9333EA" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>Operational Timings</Text>
                <Text style={styles.itemSubtitle}>Weekly open/close schedule & delivery operating hours</Text>
              </View>
              <ChevronRight size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* SECTION 3: HARDWARE & SOUND */}
          <Text style={styles.sectionHeader}>POS HARDWARE & NOTIFICATIONS</Text>
          <View style={styles.cardGroup}>
            {/* Universal Thermal POS Printer Setup */}
            <TouchableOpacity
              style={[styles.groupItem, styles.groupItemBorder]}
              onPress={() => router.push({ pathname: '/printer-settings', params: { restaurantId } })}
              activeOpacity={0.7}
            >
              <View style={[styles.itemIconBadge, { backgroundColor: '#E0F2FE' }]}>
                <Printer size={18} color="#0284C7" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>Thermal Printing Setup</Text>
                <Text style={styles.itemSubtitle}>Epson TM-m30III, SUNMI, Star Micronics & LAN</Text>
              </View>
              <ChevronRight size={18} color={Colors.textMuted} />
            </TouchableOpacity>

            {/* Order Sound & Buzz Alerts */}
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
                <Text style={styles.itemSubtitle}>Loud buzzer chime, duration loop & vibrations</Text>
              </View>
              <ChevronRight size={18} color={Colors.textMuted} />
            </TouchableOpacity>

            {/* Payouts Integration */}
            <TouchableOpacity
              style={styles.groupItem}
              onPress={() => router.push('/payout-settings')}
              activeOpacity={0.7}
            >
              <View style={[styles.itemIconBadge, { backgroundColor: '#ECFDF5' }]}>
                <CreditCard size={18} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>Payouts Integration (Stripe)</Text>
                <Text style={styles.itemSubtitle}>Status: {storeSummary.stripeStatus.toUpperCase()} · Bank settlements</Text>
              </View>
              <ChevronRight size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* SECTION 4: LEGAL & SUPPORT */}
          <Text style={styles.sectionHeader}>LEGAL & SUPPORT</Text>
          <View style={styles.cardGroup}>
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
                <Text style={styles.itemSubtitle}>Krifoo Admin partner service agreement</Text>
              </View>
              <ChevronRight size={18} color={Colors.textMuted} />
            </TouchableOpacity>

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
                <Text style={styles.itemSubtitle}>Partner data protection & guidelines</Text>
              </View>
              <ChevronRight size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Logout Button */}
          <TouchableOpacity
            style={styles.logoutCard}
            onPress={() => setLogoutModalVisible(true)}
            activeOpacity={0.7}
          >
            <LogOut size={18} color={Colors.danger} />
            <Text style={styles.logoutCardText}>Log Out from Store Portal</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      <ConfirmModal
        visible={logoutModalVisible}
        title="Logout"
        message="Are you sure you want to log out?"
        confirmText="Logout"
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
  storeBannerCard: {
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
  storeBannerBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerStoreName: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
  },
  bannerStoreSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  statusToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  statusInactive: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  statusBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#065F46',
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
});
