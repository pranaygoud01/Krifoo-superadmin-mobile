import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Switch, ActivityIndicator, StyleSheet, RefreshControl, DeviceEventEmitter } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ConfirmModal } from '../components/ConfirmModal';
import { Colors } from '../constants/colors';
import { RestaurantSettingsSkeleton } from '../components/Skeleton';
import { restaurantOwnerService, STORE_STATUS_CHANGED_EVENT } from '../services/restaurant-owner.service';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Store,
  Settings2,
  Truck,
  Clock,
  Printer,
  Bell,
  CreditCard,
  Shield,
  FileText,
  Globe,
} from 'lucide-react-native';
import {
  DangerZone,
  SettingsNoResults,
  SettingsSectionData,
  SettingsSectionsGrid,
  SettingsTopBar,
  filterSections,
  settingsStyles as ss,
  useSettingsLayout,
} from '../components/settings/SettingsKit';

const STORE_TYPE_LABELS: Record<string, string> = {
  food_delivery_and_dining: 'Food & Dining',
  food_delivery: 'Delivery only',
  groceries: 'Groceries',
  meat_poultry: 'Meat & Poultry',
};

/** Maps a Stripe account status to a friendly label + badge tone. */
const payoutStatus = (s: string): { label: string; tone: 'success' | 'warning' | 'neutral' } => {
  const v = (s || '').toLowerCase();
  if (v === 'active' || v === 'enabled' || v === 'complete' || v === 'verified') return { label: 'Active', tone: 'success' };
  if (v === 'restricted' || v === 'rejected' || v === 'disabled') return { label: 'Action needed', tone: 'warning' };
  return { label: 'Pending', tone: 'warning' };
};

export default function RestaurantSettingsScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const { showToast } = useToast();
  const { isTablet, gutter } = useSettingsLayout();

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [restaurantId, setRestaurantId] = useState('');
  const [store, setStore] = useState({
    name: 'My Store',
    city: '',
    isActive: true,
    type: 'food_delivery_and_dining',
    stripeStatus: 'pending',
    hasExternalWebsite: false,
  });

  const [togglingActive, setTogglingActive] = useState(false);
  const [offlineConfirmVisible, setOfflineConfirmVisible] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [deleteAccountModalVisible, setDeleteAccountModalVisible] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const loadedOnce = useRef(false);

  /* ── Data ─────────────────────────────────────────────────────────────── */

  const loadStoreSummary = useCallback(async () => {
    if (!loadedOnce.current) setLoading(true);
    try {
      const res = await restaurantOwnerService.getRestaurantProfile();
      if (res.success && res.data) {
        const r = res.data;
        if (r._id) setRestaurantId(r._id);
        setStore({
          name: r.restaurantName || 'My Store',
          city: r.address?.city || '',
          isActive: r.isActive ?? true,
          type: r.restaurantType || 'food_delivery_and_dining',
          stripeStatus: r.stripeAccountStatus || 'pending',
          hasExternalWebsite: Boolean(r.externalWebsiteSettings?.domain),
        });
        loadedOnce.current = true;
      }
    } catch (e) {
      console.error('Failed loading settings hub:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Refresh whenever the screen is shown, so edits made on sub-pages show up here.
  useFocusEffect(
    useCallback(() => {
      loadStoreSummary();
    }, [loadStoreSummary])
  );

  /* ── Actions ──────────────────────────────────────────────────────────── */

  const applyStoreActive = async (newVal: boolean) => {
    setTogglingActive(true);
    try {
      let res = await restaurantOwnerService.toggleRestaurantStatus(newVal);
      if (!res.success) res = await restaurantOwnerService.updateRestaurantProfile({ isActive: newVal });
      if (res.success) {
        const actual = res.data?.isActive !== undefined ? Boolean(res.data.isActive) : newVal;
        setStore((prev) => ({ ...prev, isActive: actual }));
        DeviceEventEmitter.emit(STORE_STATUS_CHANGED_EVENT, actual);
        showToast({
          title: actual ? 'Store is online' : 'Store is offline',
          message: actual ? 'Customers can see your menu and order again.' : 'Customers can’t place new orders.',
          type: 'success',
        });
      } else {
        showToast({ title: 'Update failed', message: res.message || 'Could not change store status.', type: 'error' });
      }
    } catch (e: any) {
      showToast({ title: 'Update failed', message: e?.message || 'Could not reach the server.', type: 'error' });
    } finally {
      setTogglingActive(false);
    }
  };

  const onToggleStore = (next: boolean) => {
    if (next) applyStoreActive(true);
    else setOfflineConfirmVisible(true); // taking the store offline is disruptive — confirm first
  };

  const handleDeleteAccountConfirm = async () => {
    if (isDeletingAccount) return;
    setIsDeletingAccount(true);
    try {
      const res = await restaurantOwnerService.deleteAccount();
      if (res.success) {
        setDeleteAccountModalVisible(false);
        await logout();
        showToast({
          title: 'Account deleted',
          message: 'Your store account and data have been permanently deleted.',
          type: 'success',
        });
        router.replace('/login');
      } else {
        showToast({ title: 'Delete failed', message: res.message || 'Please contact support.', type: 'error' });
      }
    } catch (e: any) {
      showToast({ title: 'Delete failed', message: e?.message || 'Could not reach the server.', type: 'error' });
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleLogoutConfirm = async () => {
    setLogoutModalVisible(false);
    await logout();
    router.replace('/login');
  };

  /* ── Content ──────────────────────────────────────────────────────────── */

  const payout = payoutStatus(store.stripeStatus);

  const sections: SettingsSectionData[] = useMemo(
    () => [
      {
        key: 'store',
        title: 'Store & online channels',
        items: [
          {
            key: 'profile',
            title: 'Store profile',
            subtitle: 'Name, contact details, address and notifications',
            icon: Store,
            color: '#16A34A',
            bg: '#F0FDF4',
            keywords: 'restaurant identity logo phone email',
            onPress: () => router.push('/store-profile'),
          },
          {
            key: 'website',
            title: 'Website Delivery settings',
            subtitle: 'Custom your website delivery rules and delivery fees',
            icon: Globe,
            color: '#4F46E5',
            bg: '#EEF2FF',
            badge: store.hasExternalWebsite ? { label: 'CONNECTED', tone: 'success' } : { label: 'NOT SET UP', tone: 'neutral' },
            keywords: 'external domain brand',
            onPress: () => router.push({ pathname: '/external-website-settings', params: { restaurantId } }),
          },
        ],
      },
      {
        key: 'operations',
        title: 'Operations & delivery',
        items: [
          {
            key: 'acceptance',
            title: 'Order acceptance',
            subtitle: 'Online orders, table bookings, cash on delivery, auto-approve',
            icon: Settings2,
            color: '#D97706',
            bg: '#FEF3C7',
            keywords: 'cod payment pickup dining booking',
            onPress: () => router.push('/operation-settings'),
          },
          {
            key: 'delivery',
            title: 'Delivery settings',
            subtitle: 'Free delivery radius, per-mile charge and handling fee',
            icon: Truck,
            color: '#CA8A04',
            bg: '#FEF9C3',
            keywords: 'distance miles radius fee',
            onPress: () => router.push('/delivery-settings'),
          },
          {
            key: 'timings',
            title: 'Opening hours',
            subtitle: 'Weekly opening times and delivery hours',
            icon: Clock,
            color: '#9333EA',
            bg: '#F3E8FF',
            keywords: 'timings schedule open close',
            onPress: () => router.push('/operational-timings'),
          },
        ],
      },
      {
        key: 'hardware',
        title: 'Printing & alerts',
        items: [
          {
            key: 'printer',
            title: 'Set up printer',
            subtitle: 'Bluetooth and LAN/Wifi printers',
            icon: Printer,
            color: '#0284C7',
            bg: '#E0F2FE',
            keywords: 'thermal pos receipt print',
            onPress: () => router.push({ pathname: '/printer-settings', params: { restaurantId } }),
          },
          {
            key: 'sound',
            title: 'Order alerts',
            subtitle: 'New-order buzzer, volume, repeat and vibration',
            icon: Bell,
            color: '#DC2626',
            bg: '#FEE2E2',
            keywords: 'sound buzz notification vibrate',
            onPress: () => router.push('/sound-settings'),
          },
        ],
      },
      {
        key: 'payments',
        title: 'Payments',
        items: [
          {
            key: 'payouts',
            title: 'Payouts',
            subtitle: 'Stripe account and bank settlements',
            icon: CreditCard,
            color: '#059669',
            bg: '#ECFDF5',
            badge: { label: payout.label.toUpperCase(), tone: payout.tone },
            keywords: 'stripe bank money settlement',
            onPress: () => router.push('/payout-settings'),
          },
        ],
      },
      {
        key: 'legal',
        title: 'Legal',
        items: [
          {
            key: 'terms',
            title: 'Terms & Conditions',
            subtitle: 'Krifoo partner service agreement',
            icon: FileText,
            color: Colors.textMuted,
            bg: Colors.cardSurface,
            onPress: () => router.push('/terms-conditions'),
          },
          {
            key: 'privacy',
            title: 'Privacy Policy',
            subtitle: 'How partner data is protected',
            icon: Shield,
            color: Colors.textMuted,
            bg: Colors.cardSurface,
            keywords: 'gdpr data',
            onPress: () => router.push('/privacy-policy'),
          },
        ],
      },
    ],
    [router, restaurantId, store.hasExternalWebsite, payout.label, payout.tone]
  );

  const visible = filterSections(sections, query);
  const searching = query.trim().length > 0;

  return (
    <View style={ss.screen}>
      <SettingsTopBar query={query} onQueryChange={setQuery} />

      <ScrollView
        contentContainerStyle={[ss.scroll, { paddingHorizontal: gutter }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadStoreSummary();
            }}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        <View style={ss.frame}>
          {loading ? (
            <RestaurantSettingsSkeleton />
          ) : (
            <>
              {/* Store hero with the online / offline switch */}
              {!searching && (
                <View style={[ss.hero, isTablet && ss.heroTablet]}>
                  <View style={[ss.heroAvatar, { backgroundColor: Colors.primaryLight }]}>
                    <Text style={[ss.heroAvatarText, { color: Colors.primary }]}>
                      {store.name.trim().charAt(0).toUpperCase() || 'S'}
                    </Text>
                  </View>
                  <View style={ss.heroBody}>
                    <Text style={ss.heroTitle} numberOfLines={1}>
                      {store.name}
                    </Text>
                    <Text style={ss.heroSub} numberOfLines={1}>
                      {[store.city, STORE_TYPE_LABELS[store.type] || 'Store'].filter(Boolean).join(' · ')}
                    </Text>
                    <View style={ss.pillRow}>
                      <View
                        style={[ss.pill, { backgroundColor: store.isActive ? Colors.statusApproved.bg : Colors.cardSurface }]}
                      >
                        <View style={[ss.pillDot, { backgroundColor: store.isActive ? Colors.success : Colors.textSubtle }]} />
                        <Text style={[ss.pillText, { color: store.isActive ? Colors.statusApproved.text : Colors.textMuted }]}>
                          {store.isActive ? 'ONLINE' : 'OFFLINE'}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.switchCol}>
                    {togglingActive ? (
                      <ActivityIndicator color={Colors.primary} style={styles.switchSpinner} />
                    ) : (
                      <Switch
                        value={store.isActive}
                        onValueChange={onToggleStore}
                        trackColor={{ false: Colors.cardBorder, true: Colors.success }}
                        thumbColor="#FFFFFF"
                        ios_backgroundColor={Colors.cardBorder}
                        accessibilityLabel={store.isActive ? 'Store is online. Turn off to go offline' : 'Store is offline. Turn on to go online'}
                      />
                    )}
                    <Text style={styles.switchLabel}>{store.isActive ? 'Accepting orders' : 'Paused'}</Text>
                  </View>
                </View>
              )}

              {visible.length ? (
                <SettingsSectionsGrid sections={visible} />
              ) : (
                <SettingsNoResults query={query} onClear={() => setQuery('')} />
              )}

              {!searching && (
                <>
                  <DangerZone
                    signOutLabel="Log out"
                    onSignOut={() => setLogoutModalVisible(true)}
                    deleteSubtitle="Permanently removes your store, menu, order history and account."
                    onDelete={() => setDeleteAccountModalVisible(true)}
                  />
                  <Text style={ss.version}>Krifoo Store Portal</Text>
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>

      <ConfirmModal
        visible={offlineConfirmVisible}
        title="Take your store offline?"
        message="Customers won’t be able to see your menu or place new orders until you turn it back on."
        confirmText="Go offline"
        cancelText="Stay online"
        isDestructive
        onConfirm={() => {
          setOfflineConfirmVisible(false);
          applyStoreActive(false);
        }}
        onClose={() => setOfflineConfirmVisible(false)}
      />

      <ConfirmModal
        visible={deleteAccountModalVisible}
        title="Delete your store account?"
        message="This permanently erases your store profile, menu items, order history and account data. This can’t be undone."
        confirmText={isDeletingAccount ? 'Deleting…' : 'Delete account'}
        cancelText="Cancel"
        isDestructive
        onConfirm={handleDeleteAccountConfirm}
        onClose={() => !isDeletingAccount && setDeleteAccountModalVisible(false)}
      />

      <ConfirmModal
        visible={logoutModalVisible}
        title="Log out?"
        message="You’ll need to sign in again to manage your store."
        confirmText="Log out"
        cancelText="Cancel"
        isDestructive
        onConfirm={handleLogoutConfirm}
        onClose={() => setLogoutModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  switchCol: { alignItems: 'center', gap: 4 },
  switchSpinner: { width: 51, height: 31 },
  switchLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
});
