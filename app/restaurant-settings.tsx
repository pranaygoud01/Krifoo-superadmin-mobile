import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Header } from '../components/Header';
import { Colors } from '../constants/colors';
import { restaurantOwnerService } from '../services/restaurant-owner.service';
import { Save, Clock, Shield, HelpCircle, AlertCircle, ExternalLink, CreditCard, Check, LogOut } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { ConfirmModal } from '../components/ConfirmModal';

interface Timing {
  day: string;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

export default function RestaurantSettingsScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);

  const handleLogout = async () => {
    setLogoutModalVisible(false);
    await logout();
    router.replace('/login');
  };

  // Operations Toggles State
  const [config, setConfig] = useState({
    acceptsOnlineOrders: true,
    acceptsDining: true,
    acceptsCashOnDelivery: true,
    autoApproveOrders: false,
    handlingChargesPercentage: '5.00',
    freeDeliveryRadius: '2',
    chargePerMile: '1',
    maxDeliveryRadius: '10',
  });

  // Timings State
  const [timings, setTimings] = useState<Timing[]>([]);
  const [stripeStatus, setStripeStatus] = useState('pending'); // 'pending', 'active'

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await restaurantOwnerService.getRestaurantProfile();
      if (res.success && res.data) {
        const r = res.data;
        setConfig({
          acceptsOnlineOrders: r.acceptsOnlineOrders ?? true,
          acceptsDining: r.acceptsDining ?? true,
          acceptsCashOnDelivery: r.acceptsCashOnDelivery ?? true,
          autoApproveOrders: r.autoApproveOrders ?? false,
          handlingChargesPercentage: (r.handlingChargesPercentage ?? 5.0).toString(),
          freeDeliveryRadius: (r.deliverySettings?.freeDeliveryRadius ?? 2).toString(),
          chargePerMile: (r.deliverySettings?.chargePerMile ?? 1).toString(),
          maxDeliveryRadius: (r.deliverySettings?.maxDeliveryRadius ?? 10).toString(),
        });

        if (r.timings && r.timings.length > 0) {
          setTimings(r.timings);
        } else {
          // Initialize empty timings
          const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
          setTimings(
            days.map((d) => ({
              day: d,
              isOpen: true,
              openTime: '09:00',
              closeTime: '23:00',
            }))
          );
        }

        if (r.stripeAccountStatus) {
          setStripeStatus(r.stripeAccountStatus);
        }
      }
    } catch (e) {
      console.error('Failed loading settings profile:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleConfigChange = (field: string, value: string | boolean) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleTimingToggle = (day: string) => {
    setTimings((prev) => prev.map((t) => (t.day === day ? { ...t, isOpen: !t.isOpen } : t)));
  };

  const handleTimingTimeChange = (day: string, field: 'openTime' | 'closeTime', val: string) => {
    setTimings((prev) => prev.map((t) => (t.day === day ? { ...t, [field]: val } : t)));
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const payloadProfile = {
        acceptsDining: config.acceptsDining,
        acceptsCashOnDelivery: config.acceptsCashOnDelivery,
        acceptsOnlineOrders: config.acceptsOnlineOrders,
      };

      const payloadSettings = {
        handlingChargesPercentage: Number(config.handlingChargesPercentage),
        freeDeliveryRadius: Number(config.freeDeliveryRadius),
        chargePerMile: Number(config.chargePerMile),
        maxDeliveryRadius: Number(config.maxDeliveryRadius),
        autoApproveOrders: config.autoApproveOrders,
      };

      const [profRes, setRes, timRes] = await Promise.all([
        restaurantOwnerService.updateRestaurantProfile(payloadProfile),
        restaurantOwnerService.updateRestaurantSettings(payloadSettings),
        restaurantOwnerService.updateRestaurantTimings(timings),
      ]);

      if (profRes.success && setRes.success && timRes.success) {
        Alert.alert('Success', 'Restaurant settings saved successfully.');
        loadSettings();
      } else {
        Alert.alert('Error', 'Failed to save some configurations. Please verify your fields.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'An error occurred while saving.');
    } finally {
      setSaving(false);
    }
  };

  const handleStripeAction = async () => {
    try {
      if (stripeStatus === 'active') {
        const res = await restaurantOwnerService.getStripeLoginLink();
        if (res.success && res.data?.url) {
          Linking.openURL(res.data.url);
        } else {
          Alert.alert('Error', 'Could not retrieve Stripe login link.');
        }
      } else {
        const res = await restaurantOwnerService.getStripeOnboardingLink();
        if (res.success && res.data?.url) {
          Linking.openURL(res.data.url);
        } else {
          Alert.alert('Error', 'Could not retrieve Stripe onboarding link.');
        }
      }
    } catch (e) {
      console.error(e);
    }
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
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Fetching profile settings...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Operations Parameters */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeader}>Restaurant Settings</Text>

            <View style={styles.toggleRow}>
              <View>
                <Text style={styles.toggleTitle}>Accept Online Orders</Text>
                <Text style={styles.toggleSub}>Open store for online requests</Text>
              </View>
              <Switch
                value={config.acceptsOnlineOrders}
                onValueChange={(val) => handleConfigChange('acceptsOnlineOrders', val)}
                trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                thumbColor={config.acceptsOnlineOrders ? Colors.primary : Colors.textSubtle}
              />
            </View>

            <View style={styles.toggleRow}>
              <View>
                <Text style={styles.toggleTitle}>Accept Table Bookings</Text>
                <Text style={styles.toggleSub}>Allow customers to book dining tables</Text>
              </View>
              <Switch
                value={config.acceptsDining}
                onValueChange={(val) => handleConfigChange('acceptsDining', val)}
                trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                thumbColor={config.acceptsDining ? Colors.primary : Colors.textSubtle}
              />
            </View>

            <View style={styles.toggleRow}>
              <View>
                <Text style={styles.toggleTitle}>Accept Cash on Delivery</Text>
                <Text style={styles.toggleSub}>Allow payment upon rider dispatch</Text>
              </View>
              <Switch
                value={config.acceptsCashOnDelivery}
                onValueChange={(val) => handleConfigChange('acceptsCashOnDelivery', val)}
                trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                thumbColor={config.acceptsCashOnDelivery ? Colors.primary : Colors.textSubtle}
              />
            </View>

            <View style={styles.toggleRow}>
              <View>
                <Text style={styles.toggleTitle}>Auto Approve Orders</Text>
                <Text style={styles.toggleSub}>Bypasses manual order confirmation</Text>
              </View>
              <Switch
                value={config.autoApproveOrders}
                onValueChange={(val) => handleConfigChange('autoApproveOrders', val)}
                trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                thumbColor={config.autoApproveOrders ? Colors.primary : Colors.textSubtle}
              />
            </View>
          </View>

          {/* Delivery Configuration */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeader}>Delivery Parameters</Text>

            <View style={styles.rowInputs}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Free Radius (Miles)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={config.freeDeliveryRadius}
                  onChangeText={(val) => handleConfigChange('freeDeliveryRadius', val)}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>£ / Mile Fee</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={config.chargePerMile}
                  onChangeText={(val) => handleConfigChange('chargePerMile', val)}
                />
              </View>
            </View>

            <View style={styles.rowInputs}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Max Radius (Miles)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={config.maxDeliveryRadius}
                  onChangeText={(val) => handleConfigChange('maxDeliveryRadius', val)}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Handling Fee %</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={config.handlingChargesPercentage}
                  onChangeText={(val) => handleConfigChange('handlingChargesPercentage', val)}
                />
              </View>
            </View>
          </View>

          {/* Timings Grid */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeader}>Operational Timings</Text>
            <Text style={styles.sectionSub}>Configure your weekly operating hours</Text>

            {timings.map((t) => (
              <View key={t.day} style={styles.timingRow}>
                <View style={styles.timingLabelCol}>
                  <Text style={styles.dayName}>{t.day.toUpperCase().substring(0, 3)}</Text>
                  <Switch
                    value={t.isOpen}
                    onValueChange={() => handleTimingToggle(t.day)}
                    trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                    thumbColor={t.isOpen ? Colors.primary : Colors.textSubtle}
                    style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }}
                  />
                </View>

                {t.isOpen ? (
                  <View style={styles.timeInputsCol}>
                    <TextInput
                      style={styles.timeInput}
                      placeholder="09:00"
                      value={t.openTime}
                      onChangeText={(val) => handleTimingTimeChange(t.day, 'openTime', val)}
                    />
                    <Text style={styles.timeTo}>to</Text>
                    <TextInput
                      style={styles.timeInput}
                      placeholder="23:00"
                      value={t.closeTime}
                      onChangeText={(val) => handleTimingTimeChange(t.day, 'closeTime', val)}
                    />
                  </View>
                ) : (
                  <View style={styles.closedCol}>
                    <Text style={styles.closedText}>CLOSED ON THIS DAY</Text>
                  </View>
                )}
              </View>
            ))}
          </View>

          {/* Stripe Connect Section */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeader}>Payouts Integration</Text>

            <View style={styles.stripeBox}>
              <View style={styles.stripeHeader}>
                <CreditCard size={20} color={stripeStatus === 'active' ? Colors.success : Colors.warning} />
                <Text style={styles.stripeTitle}>Stripe Connect Integration</Text>
              </View>
              <Text style={styles.stripeDesc}>
                Payouts are handled securely via Stripe. Setup payouts to receive customers payments instantly.
              </Text>
              <View style={styles.stripeStatusRow}>
                <Text style={styles.statusLabel}>Setup Status: </Text>
                <View style={[styles.stripeBadge, stripeStatus === 'active' ? styles.badgeActive : styles.badgePending]}>
                  <Text style={[styles.stripeBadgeText, stripeStatus === 'active' ? { color: '#065F46' } : { color: '#92400E' }]}>
                    {stripeStatus.toUpperCase()}
                  </Text>
                </View>
              </View>

              <TouchableOpacity style={styles.stripeBtn} onPress={handleStripeAction}>
                <Text style={styles.stripeBtnText}>
                  {stripeStatus === 'active' ? 'Stripe Dashboard' : 'Complete Setup'}
                </Text>
                <ExternalLink size={14} color="#FFFFFF" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Save Configurations Button */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.7 }]}
            disabled={saving}
            onPress={handleSaveSettings}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.saveBtnText}>Save Configurations</Text>
                <Save size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}

      <ConfirmModal
        visible={logoutModalVisible}
        title="Logout"
        message="Are you sure you want to log out?"
        onConfirm={handleLogout}
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
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 10,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.2,
    marginBottom: 12,
  },
  sectionSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: -8,
    marginBottom: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
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
  rowInputs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  inputGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.cardSurface,
    borderColor: Colors.cardBorder,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 13,
    color: Colors.text,
  },
  timingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  timingLabelCol: {
    width: 90,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 10,
  },
  dayName: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.text,
  },
  timeInputsCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  timeInput: {
    backgroundColor: Colors.cardSurface,
    borderColor: Colors.cardBorder,
    borderWidth: 1.2,
    borderRadius: 8,
    width: 70,
    height: 36,
    textAlign: 'center',
    fontSize: 12,
    color: Colors.text,
  },
  timeTo: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSubtle,
  },
  closedCol: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  closedText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textSubtle,
  },
  stripeBox: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: Colors.cardBorder,
    padding: 14,
  },
  stripeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  stripeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
  },
  stripeDesc: {
    fontSize: 11,
    color: Colors.textMuted,
    lineHeight: 16,
    marginBottom: 12,
  },
  stripeStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  statusLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '700',
  },
  stripeBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeActive: {
    backgroundColor: '#D1FAE5',
  },
  badgePending: {
    backgroundColor: '#FEF3C7',
  },
  stripeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  stripeBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripeBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  saveBtn: {
    backgroundColor: Colors.success,
    borderRadius: 12,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 40,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
});
