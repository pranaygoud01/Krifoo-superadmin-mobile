import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ConfirmModal } from '../components/ConfirmModal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Colors } from '../constants/colors';
import {
  Grid,
  Truck,
  Bell,
  Printer,
  Monitor,
  Shield,
  FileText,
  Layers,
  Globe,
  Clock,
  Sliders,
  ShieldCheck,
} from 'lucide-react-native';
import { getSavedOrientation, applyOrientation, AppOrientation } from '../services/orientation.service';
import RestaurantSettingsScreen from './restaurant-settings';
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

export default function SettingsScreen() {
  const { user } = useAuth();

  // Restaurant owners get store-specific settings. Kept as separate components so
  // a role change (e.g. logout -> user = null) never changes the hook order.
  if (user && user.userType !== 'super_admin') {
    return <RestaurantSettingsScreen />;
  }
  return <SuperAdminSettingsScreen />;
}

const ORIENTATIONS: { value: AppOrientation; label: string }[] = [
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape (POS)' },
  { value: 'auto', label: 'Auto-rotate' },
];

const initials = (name?: string) =>
  (name || 'Super Admin')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');

function SuperAdminSettingsScreen() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const { isTablet, gutter } = useSettingsLayout();

  const [query, setQuery] = useState('');
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [appOrientation, setAppOrientation] = useState<AppOrientation>('portrait');
  const [isChangingOrientation, setIsChangingOrientation] = useState(false);

  useEffect(() => {
    getSavedOrientation().then(setAppOrientation);
  }, []);

  const handleSetOrientation = async (mode: AppOrientation) => {
    if (isChangingOrientation || mode === appOrientation) return;
    const previous = appOrientation;
    setIsChangingOrientation(true);
    setAppOrientation(mode);
    try {
      const success = await applyOrientation(mode);
      if (success) {
        showToast({
          title: 'Display updated',
          message:
            mode === 'landscape'
              ? 'Switched to landscape for POS use.'
              : mode === 'portrait'
              ? 'Switched to portrait.'
              : 'Screen will now rotate with the device.',
          type: 'success',
        });
      } else {
        setAppOrientation(previous);
        showToast({ title: 'Not supported', message: 'This device couldn’t change orientation.', type: 'error' });
      }
    } catch {
      setAppOrientation(previous);
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

  const sections: SettingsSectionData[] = useMemo(
    () => [
      {
        key: 'platform',
        title: 'Platform & channels',
        items: [
          {
            key: 'website',
            title: 'Online ordering',
            subtitle: 'Custom  tiered delivery fees',
            icon: Globe,
            color: '#4F46E5',
            bg: '#EEF2FF',
            keywords: 'external domain brand',
            onPress: () => router.push('/external-website-settings'),
          },
          {
            key: 'categories',
            title: 'Menu categories',
            subtitle: 'Platform-wide categories, photos and visibility',
            icon: Grid,
            color: '#16A34A',
            bg: '#F0FDF4',
            keywords: 'global category menu',
            onPress: () => router.push('/categories'),
          },
          {
            key: 'global',
            title: 'Platform settings',
            subtitle: 'Who gets emailed about new orders',
            icon: Layers,
            color: '#DB2777',
            bg: '#FDF2F8',
            keywords: 'global commission email fees',
            onPress: () => router.push('/global-settings'),
          },
        ],
      },
      {
        key: 'operations',
        title: 'Operations & delivery',
        items: [
          {
            key: 'delivery',
            title: 'Delivery distance tiers',
            subtitle: 'Default mileage bands and delivery fees (£)',
            icon: Truck,
            color: '#D97706',
            bg: '#FEF3C7',
            keywords: 'miles distance fee charges',
            onPress: () => router.push('/delivery-charges'),
          },
          {
            key: 'timings',
            title: 'Opening & delivery hours',
            subtitle: 'Store hours, Krifoo delivery schedule and website hours',
            icon: Clock,
            color: '#9333EA',
            bg: '#F3E8FF',
            keywords: 'timings schedule open close',
            onPress: () => router.push('/operational-timings'),
          },
          {
            key: 'acceptance',
            title: 'Acceptance & payment rules',
            subtitle: 'Online payments, cash on delivery and pickup for app and website',
            icon: Sliders,
            color: '#B45309',
            bg: '#FFF7ED',
            keywords: 'cod payment pickup',
            onPress: () => router.push('/operation-settings'),
          },
        ],
      },
      {
        key: 'device',
        title: 'This device',
        description: 'Applies to this tablet or phone only',
        items: [
          {
            key: 'printer',
            title: 'Receipt printers',
            subtitle: 'Epson, SUNMI, Star Micronics, Bluetooth and LAN',
            icon: Printer,
            color: '#0284C7',
            bg: '#E0F2FE',
            keywords: 'thermal pos receipt print',
            onPress: () => router.push('/printer-settings'),
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
          {
            key: 'orientation',
            title: 'Screen orientation',
            icon: Monitor,
            color: '#475569',
            bg: '#F1F5F9',
            keywords: 'rotate landscape portrait display',
            render: () => (
              <View style={styles.segment} accessibilityRole="radiogroup">
                {ORIENTATIONS.map((o) => {
                  const active = appOrientation === o.value;
                  return (
                    <TouchableOpacity
                      key={o.value}
                      style={[styles.segmentItem, active && styles.segmentItemActive]}
                      onPress={() => handleSetOrientation(o.value)}
                      disabled={isChangingOrientation}
                      activeOpacity={0.8}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
                        {o.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ),
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
            subtitle: 'Platform usage terms and merchant agreement',
            icon: FileText,
            color: Colors.textMuted,
            bg: Colors.cardSurface,
            onPress: () => router.push('/terms-conditions'),
          },
          {
            key: 'privacy',
            title: 'Privacy Policy',
            subtitle: 'Data protection and GDPR compliance',
            icon: Shield,
            color: Colors.textMuted,
            bg: Colors.cardSurface,
            keywords: 'gdpr data',
            onPress: () => router.push('/privacy-policy'),
          },
        ],
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, appOrientation, isChangingOrientation]
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
      >
        <View style={ss.frame}>
          {!searching && (
            <View style={[ss.hero, isTablet && ss.heroTablet]}>
              <View style={[ss.heroAvatar, { backgroundColor: Colors.primaryLight }]}>
                <Text style={[ss.heroAvatarText, { color: Colors.primary }]}>{initials(user?.fullName)}</Text>
              </View>
              <View style={ss.heroBody}>
                <Text style={ss.heroTitle} numberOfLines={1}>
                  {user?.fullName || 'Super Administrator'}
                </Text>
                <Text style={ss.heroSub} numberOfLines={1}>
                  {user?.email || '—'}
                </Text>
                <View style={ss.pillRow}>
                  <View style={[ss.pill, { backgroundColor: Colors.primaryLight }]}>
                    <ShieldCheck size={12} color={Colors.primary} />
                    <Text style={[ss.pillText, { color: Colors.primary }]}>SUPER ADMIN</Text>
                  </View>
                </View>
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
              <DangerZone signOutLabel="Sign out" onSignOut={() => setLogoutModalVisible(true)} />
              <Text style={ss.version}>Krifoo Super Admin</Text>
            </>
          )}
        </View>
      </ScrollView>

      <ConfirmModal
        visible={logoutModalVisible}
        title="Sign out?"
        message="You’ll need to sign in again to access the Super Admin portal."
        confirmText="Sign out"
        cancelText="Cancel"
        isDestructive
        onConfirm={handleLogoutConfirm}
        onClose={() => setLogoutModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  segment: {
    flexDirection: 'row',
    marginTop: 10,
    padding: 3,
    borderRadius: 10,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  segmentItem: { flex: 1, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segmentItemActive: {
    backgroundColor: Colors.background,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  segmentText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  segmentTextActive: { color: Colors.text },
});
