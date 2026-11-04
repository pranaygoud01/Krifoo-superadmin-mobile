import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Header } from '../components/Header';
import { Colors } from '../constants/colors';
import { restaurantOwnerService } from '../services/restaurant-owner.service';
import {
  Truck,
  Save,
  Clock,
  MapPin,
  Plus,
  Minus,
  Sparkles,
  Percent,
  Banknote,
  Check,
  Info,
} from 'lucide-react-native';

export default function DeliverySettingsScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [config, setConfig] = useState({
    freeDeliveryRadius: '2',
    chargePerMile: '1',
    maxDeliveryRadius: '10',
    handlingChargesPercentage: '5.0',
    defaultDeliveryTime: '30',
  });

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await restaurantOwnerService.getRestaurantProfile();
      if (res.success && res.data) {
        const r = res.data;
        setConfig({
          freeDeliveryRadius: (r.deliverySettings?.freeDeliveryRadius ?? 2).toString(),
          chargePerMile: (r.deliverySettings?.chargePerMile ?? 1).toString(),
          maxDeliveryRadius: (r.deliverySettings?.maxDeliveryRadius ?? 10).toString(),
          handlingChargesPercentage: (r.handlingChargesPercentage ?? 5.0).toString(),
          defaultDeliveryTime: (r.defaultDeliveryTime ?? 30).toString(),
        });
      }
    } catch (e) {
      console.error('Failed loading delivery settings:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleChange = (field: keyof typeof config, value: string) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const adjustValue = (
    field: keyof typeof config,
    delta: number,
    min = 0,
    max = 999,
    isFloat = false,
    decimals = 1
  ) => {
    const cur = isFloat ? parseFloat(config[field]) || 0 : parseInt(config[field], 10) || 0;
    const next = Math.min(max, Math.max(min, cur + delta));
    setConfig((prev) => ({
      ...prev,
      [field]: isFloat ? next.toFixed(decimals) : next.toString(),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        handlingChargesPercentage: parseFloat(config.handlingChargesPercentage) || 0,
        defaultDeliveryTime: parseInt(config.defaultDeliveryTime, 10) || 30,
        deliverySettings: {
          freeDeliveryRadius: parseFloat(config.freeDeliveryRadius) || 0,
          chargePerMile: parseFloat(config.chargePerMile) || 0,
          maxDeliveryRadius: parseFloat(config.maxDeliveryRadius) || 0,
        },
      };

      let res = await restaurantOwnerService.updateRestaurantSettings(payload);
      if (!res.success) {
        res = await restaurantOwnerService.updateRestaurantProfile(payload);
      }

      if (res.success) {
        Alert.alert('Success', 'Delivery parameters updated successfully.');
        loadConfig();
      } else {
        Alert.alert('Error', res.message || 'Failed to save delivery parameters.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'An error occurred while saving.');
    } finally {
      setSaving(false);
    }
  };

  // Human-readable summary calculation
  const freeRadNum = parseFloat(config.freeDeliveryRadius) || 0;
  const maxRadNum = parseFloat(config.maxDeliveryRadius) || 0;
  const chargeNum = parseFloat(config.chargePerMile) || 0;
  const timeNum = parseInt(config.defaultDeliveryTime, 10) || 30;
  const handlingNum = parseFloat(config.handlingChargesPercentage) || 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header title="Delivery Parameters" showBackButton={true} />

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Fetching delivery parameters...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: isTablet ? 24 : 16, maxWidth: 840, alignSelf: 'center', width: '100%' },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top Overview Banner */}
          <View style={styles.heroBanner}>
            <View style={styles.heroIconBox}>
              <Truck size={24} color="#EA580C" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>Delivery & Order Settings</Text>
              <Text style={styles.heroSub}>
                Fine-tune fulfillment radius, per-mile rates, and expected kitchen delivery time.
              </Text>
            </View>
          </View>

          {/* SECTION 1: Expected Delivery Time (Primary Operational Parameter) */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.sectionIconBadge, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                <Clock size={18} color="#2563EB" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Default Expected Delivery Time</Text>
                <Text style={styles.cardSub}>
                  Default time displayed on new orders and to customers at checkout
                </Text>
              </View>
            </View>

            {/* Stepper Control */}
            <View style={styles.stepperBox}>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => adjustValue('defaultDeliveryTime', -5, 10, 180)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Minus size={18} color="#475569" strokeWidth={2.5} />
              </TouchableOpacity>

              <View style={styles.stepperDisplay}>
                <TextInput
                  style={styles.stepperInput}
                  keyboardType="numeric"
                  value={config.defaultDeliveryTime}
                  onChangeText={(val) => handleChange('defaultDeliveryTime', val)}
                  selectTextOnFocus
                />
                <Text style={styles.stepperUnit}>mins</Text>
              </View>

              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => adjustValue('defaultDeliveryTime', 5, 10, 180)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Plus size={18} color="#475569" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            {/* Quick Presets */}
            <View style={styles.presetsRow}>
              {[20, 25, 30, 45, 60].map((mins) => {
                const isSelected = parseInt(config.defaultDeliveryTime, 10) === mins;
                return (
                  <TouchableOpacity
                    key={mins}
                    style={[styles.presetChip, isSelected && styles.presetChipActive]}
                    onPress={() => handleChange('defaultDeliveryTime', mins.toString())}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.presetChipText, isSelected && styles.presetChipTextActive]}>
                      {mins} mins
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.infoTipBox}>
              <Info size={14} color="#2563EB" style={{ marginTop: 2, marginRight: 6 }} />
              <Text style={styles.infoTipText}>
                You can customize this estimated time per individual order in the Orders tracking board.
              </Text>
            </View>
          </View>

          {/* SECTION 2: Delivery Radius & Coverage */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.sectionIconBadge, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                <MapPin size={18} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Delivery Coverage Radius</Text>
                <Text style={styles.cardSub}>Define your free delivery zone and maximum service area</Text>
              </View>
            </View>

            {/* Free Radius Field */}
            <View style={styles.fieldBlock}>
              <View style={styles.fieldHeaderRow}>
                <Text style={styles.fieldLabel}>Free Delivery Radius</Text>
                <Text style={styles.fieldSubLabel}>Customers within this radius pay £0 delivery</Text>
              </View>

              <View style={styles.stepperBox}>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => adjustValue('freeDeliveryRadius', -0.5, 0, 50, true, 1)}
                  activeOpacity={0.7}
                >
                  <Minus size={18} color="#475569" strokeWidth={2.5} />
                </TouchableOpacity>

                <View style={styles.stepperDisplay}>
                  <TextInput
                    style={styles.stepperInput}
                    keyboardType="decimal-pad"
                    value={config.freeDeliveryRadius}
                    onChangeText={(val) => handleChange('freeDeliveryRadius', val)}
                    selectTextOnFocus
                  />
                  <Text style={styles.stepperUnit}>miles</Text>
                </View>

                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => adjustValue('freeDeliveryRadius', 0.5, 0, 50, true, 1)}
                  activeOpacity={0.7}
                >
                  <Plus size={18} color="#475569" strokeWidth={2.5} />
                </TouchableOpacity>
              </View>

              <View style={styles.presetsRow}>
                {[0, 1, 2, 3, 5].map((rad) => {
                  const isSelected = parseFloat(config.freeDeliveryRadius) === rad;
                  return (
                    <TouchableOpacity
                      key={rad}
                      style={[styles.presetChip, isSelected && styles.presetChipActive]}
                      onPress={() => handleChange('freeDeliveryRadius', rad.toString())}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.presetChipText, isSelected && styles.presetChipTextActive]}>
                        {rad === 0 ? 'No Free' : `${rad} mi`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.divider} />

            {/* Max Radius Field */}
            <View style={styles.fieldBlock}>
              <View style={styles.fieldHeaderRow}>
                <Text style={styles.fieldLabel}>Maximum Delivery Radius</Text>
                <Text style={styles.fieldSubLabel}>Riders will not accept orders beyond this distance</Text>
              </View>

              <View style={styles.stepperBox}>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => adjustValue('maxDeliveryRadius', -1, 1, 100)}
                  activeOpacity={0.7}
                >
                  <Minus size={18} color="#475569" strokeWidth={2.5} />
                </TouchableOpacity>

                <View style={styles.stepperDisplay}>
                  <TextInput
                    style={styles.stepperInput}
                    keyboardType="numeric"
                    value={config.maxDeliveryRadius}
                    onChangeText={(val) => handleChange('maxDeliveryRadius', val)}
                    selectTextOnFocus
                  />
                  <Text style={styles.stepperUnit}>miles</Text>
                </View>

                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => adjustValue('maxDeliveryRadius', 1, 1, 100)}
                  activeOpacity={0.7}
                >
                  <Plus size={18} color="#475569" strokeWidth={2.5} />
                </TouchableOpacity>
              </View>

              <View style={styles.presetsRow}>
                {[5, 8, 10, 15, 20].map((rad) => {
                  const isSelected = parseInt(config.maxDeliveryRadius, 10) === rad;
                  return (
                    <TouchableOpacity
                      key={rad}
                      style={[styles.presetChip, isSelected && styles.presetChipActive]}
                      onPress={() => handleChange('maxDeliveryRadius', rad.toString())}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.presetChipText, isSelected && styles.presetChipTextActive]}>
                        {rad} mi max
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {/* SECTION 3: Fees & Charges */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.sectionIconBadge, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
                <Banknote size={18} color="#EA580C" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Distance Rates & Handling</Text>
                <Text style={styles.cardSub}>Rate charged per mile after the free zone and order handling</Text>
              </View>
            </View>

            {/* Charge Per Mile */}
            <View style={styles.fieldBlock}>
              <View style={styles.fieldHeaderRow}>
                <Text style={styles.fieldLabel}>Per-Mile Delivery Rate</Text>
                <Text style={styles.fieldSubLabel}>Applied per mile after the free delivery radius</Text>
              </View>

              <View style={styles.stepperBox}>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => adjustValue('chargePerMile', -0.25, 0, 50, true, 2)}
                  activeOpacity={0.7}
                >
                  <Minus size={18} color="#475569" strokeWidth={2.5} />
                </TouchableOpacity>

                <View style={styles.stepperDisplay}>
                  <Text style={styles.currencyPrefix}>£</Text>
                  <TextInput
                    style={styles.stepperInput}
                    keyboardType="decimal-pad"
                    value={config.chargePerMile}
                    onChangeText={(val) => handleChange('chargePerMile', val)}
                    selectTextOnFocus
                  />
                  <Text style={styles.stepperUnit}>/ mile</Text>
                </View>

                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => adjustValue('chargePerMile', 0.25, 0, 50, true, 2)}
                  activeOpacity={0.7}
                >
                  <Plus size={18} color="#475569" strokeWidth={2.5} />
                </TouchableOpacity>
              </View>

              <View style={styles.presetsRow}>
                {[0.5, 1.0, 1.5, 2.0].map((rate) => {
                  const isSelected = parseFloat(config.chargePerMile) === rate;
                  return (
                    <TouchableOpacity
                      key={rate}
                      style={[styles.presetChip, isSelected && styles.presetChipActive]}
                      onPress={() => handleChange('chargePerMile', rate.toFixed(2))}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.presetChipText, isSelected && styles.presetChipTextActive]}>
                        £{rate.toFixed(2)} / mi
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.divider} />

            {/* Handling Fee Percentage */}
            <View style={styles.fieldBlock}>
              <View style={styles.fieldHeaderRow}>
                <Text style={styles.fieldLabel}>Handling / Packaging Fee</Text>
                <Text style={styles.fieldSubLabel}>Percentage added to order subtotal for handling</Text>
              </View>

              <View style={styles.stepperBox}>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => adjustValue('handlingChargesPercentage', -0.5, 0, 100, true, 1)}
                  activeOpacity={0.7}
                >
                  <Minus size={18} color="#475569" strokeWidth={2.5} />
                </TouchableOpacity>

                <View style={styles.stepperDisplay}>
                  <TextInput
                    style={styles.stepperInput}
                    keyboardType="decimal-pad"
                    value={config.handlingChargesPercentage}
                    onChangeText={(val) => handleChange('handlingChargesPercentage', val)}
                    selectTextOnFocus
                  />
                  <Text style={styles.stepperUnit}>%</Text>
                </View>

                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => adjustValue('handlingChargesPercentage', 0.5, 0, 100, true, 1)}
                  activeOpacity={0.7}
                >
                  <Plus size={18} color="#475569" strokeWidth={2.5} />
                </TouchableOpacity>
              </View>

              <View style={styles.presetsRow}>
                {[0, 2.5, 5.0, 10.0].map((pct) => {
                  const isSelected = parseFloat(config.handlingChargesPercentage) === pct;
                  return (
                    <TouchableOpacity
                      key={pct}
                      style={[styles.presetChip, isSelected && styles.presetChipActive]}
                      onPress={() => handleChange('handlingChargesPercentage', pct.toFixed(1))}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.presetChipText, isSelected && styles.presetChipTextActive]}>
                        {pct}%
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Customer Checkout Policy Preview */}
          <View style={styles.previewCard}>
            <View style={styles.previewHeaderRow}>
              <Sparkles size={16} color="#059669" />
              <Text style={styles.previewCardTitle}>Live Policy Summary</Text>
            </View>

            <View style={styles.previewBulletRow}>
              <View style={styles.previewDot} />
              <Text style={styles.previewBulletText}>
                {freeRadNum > 0
                  ? `Customers within ${freeRadNum} miles get FREE delivery.`
                  : 'All deliveries are charged per mile.'}
              </Text>
            </View>

            <View style={styles.previewBulletRow}>
              <View style={styles.previewDot} />
              <Text style={styles.previewBulletText}>
                Beyond {freeRadNum} miles: £{chargeNum.toFixed(2)} per mile up to {maxRadNum} miles max range.
              </Text>
            </View>

            <View style={styles.previewBulletRow}>
              <View style={styles.previewDot} />
              <Text style={styles.previewBulletText}>
                Estimated fulfillment time shown at checkout: ~{timeNum} minutes.
              </Text>
            </View>

            {handlingNum > 0 && (
              <View style={styles.previewBulletRow}>
                <View style={styles.previewDot} />
                <Text style={styles.previewBulletText}>
                  A {handlingNum.toFixed(1)}% packaging & handling charge applies to orders.
                </Text>
              </View>
            )}
          </View>

          {/* Save Action Button */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.7 }]}
            disabled={saving}
            onPress={handleSave}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.saveBtnText}>Save Delivery Parameters</Text>
                <Save size={18} color="#FFFFFF" style={{ marginLeft: 8 }} />
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 56, // Generous padding so floating buttons don't block Save button
  },
  heroBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  heroIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  heroSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  sectionIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  fieldBlock: {
    marginTop: 4,
  },
  fieldHeaderRow: {
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  fieldSubLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  stepperBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 4,
    marginBottom: 8,
  },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  stepperDisplay: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  currencyPrefix: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  stepperInput: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    minWidth: 50,
    paddingVertical: 4,
  },
  stepperUnit: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetChipActive: {
    backgroundColor: '#FF5C39',
    borderColor: '#FF5C39',
  },
  presetChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  presetChipTextActive: {
    color: '#FFFFFF',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  infoTipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  infoTipText: {
    flex: 1,
    fontSize: 11.5,
    color: '#1E40AF',
    lineHeight: 16,
  },
  previewCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  previewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  previewCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#166534',
    letterSpacing: -0.2,
  },
  previewBulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  previewDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#16A34A',
  },
  previewBulletText: {
    fontSize: 12,
    color: '#15803D',
    flex: 1,
    fontWeight: '500',
  },
  saveBtn: {
    backgroundColor: '#FF5C39',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    borderRadius: 14,
    shadowColor: '#FF5C39',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
  },
});
