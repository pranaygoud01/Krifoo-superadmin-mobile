import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  Alert,
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
} from 'lucide-react-native';

import { useWindowDimensions } from 'react-native';

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
            {/* Store Summary Banner */}
            <View style={styles.storeBannerCard}>
              <View style={styles.storeBannerBadge}>
                <Store size={24} color={Colors.primary} />
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={[styles.statusBadge, storeSummary.isActive ? styles.statusActive : styles.statusInactive]}>
                  <Text style={styles.statusBadgeText}>{storeSummary.isActive ? 'ONLINE' : 'OFFLINE'}</Text>
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

            <Text style={styles.menuSectionTitle}>SETTINGS & PREFERENCES</Text>

            {/* 1. Store & Restaurant Profile */}
            <TouchableOpacity
              style={styles.menuCard}
              onPress={() => router.push('/store-profile')}
              activeOpacity={0.7}
            >
              <View style={styles.iconBadge}>
                <Store size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuTitle}>Store & Restaurant Profile</Text>
                <Text style={styles.menuSub} numberOfLines={1}>
                  Identity, owner contact, notifications & shop address
                </Text>
              </View>
              <ChevronRight size={20} color={Colors.textMuted} />
            </TouchableOpacity>

            {/* 2. Acceptance & Operation Settings */}
            <TouchableOpacity
              style={styles.menuCard}
              onPress={() => router.push('/operation-settings')}
              activeOpacity={0.7}
            >
              <View style={styles.iconBadge}>
                <Settings2 size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuTitle}>Acceptance Settings</Text>
                <Text style={styles.menuSub} numberOfLines={1}>
                  Accept Online Orders, Table Bookings, COD, Auto Approve
                </Text>
              </View>
              <ChevronRight size={20} color={Colors.textMuted} />
            </TouchableOpacity>

            {/* 3. Delivery Parameters */}
            <TouchableOpacity
              style={styles.menuCard}
              onPress={() => router.push('/delivery-settings')}
              activeOpacity={0.7}
            >
              <View style={styles.iconBadge}>
                <Truck size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuTitle}>Delivery Parameters</Text>
                <Text style={styles.menuSub} numberOfLines={1}>
                  Delivery radius, per-mile charges & handling fees
                </Text>
              </View>
              <ChevronRight size={20} color={Colors.textMuted} />
            </TouchableOpacity>

            {/* 4. Operational Timings */}
            <TouchableOpacity
              style={styles.menuCard}
              onPress={() => router.push('/operational-timings')}
              activeOpacity={0.7}
            >
              <View style={styles.iconBadge}>
                <Clock size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuTitle}>Operational Timings</Text>
                <Text style={styles.menuSub} numberOfLines={1}>
                  Weekly operating hours & open/close schedule
                </Text>
              </View>
              <ChevronRight size={20} color={Colors.textMuted} />
            </TouchableOpacity>

            {/* 5. Universal Thermal POS Printer Setup */}
            <TouchableOpacity
              style={styles.menuCard}
              onPress={() => router.push({ pathname: '/printer-settings', params: { restaurantId } })}
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

            {/* 6. Order Sound & Buzz Alerts */}
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
                  5-second loud buzzer chime & haptic vibration alerts
                </Text>
              </View>
              <ChevronRight size={20} color={Colors.textMuted} />
            </TouchableOpacity>

            {/* 7. Payouts Integration */}
            <TouchableOpacity
              style={styles.menuCard}
              onPress={() => router.push('/payout-settings')}
              activeOpacity={0.7}
            >
              <View style={styles.iconBadge}>
                <CreditCard size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuTitle}>Payouts Integration (Stripe)</Text>
                <Text style={styles.menuSub} numberOfLines={1}>
                  Status: {storeSummary.stripeStatus.toUpperCase()} · Bank settlements
                </Text>
              </View>
              <ChevronRight size={20} color={Colors.textMuted} />
            </TouchableOpacity>

            <Text style={[styles.menuSectionTitle, { marginTop: 16 }]}>LEGAL & SUPPORT</Text>

            {/* 8. Terms & Conditions */}
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
                  Krifoo Admin partner service agreement
                </Text>
              </View>
              <ChevronRight size={20} color={Colors.textMuted} />
            </TouchableOpacity>

            {/* 9. Privacy Policy */}
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
                  Partner data protection & guidelines
                </Text>
              </View>
              <ChevronRight size={20} color={Colors.textMuted} />
          </TouchableOpacity>
        </ScrollView>
      )}

      <ConfirmModal
        visible={logoutModalVisible}
        title="Logout"
        message="Are you sure you want to log out?"
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
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.textMuted,
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
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  bannerStoreName: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  bannerStoreSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
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
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
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
});
