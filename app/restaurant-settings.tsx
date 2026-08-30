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
import {
  Save,
  Clock,
  Shield,
  HelpCircle,
  AlertCircle,
  ExternalLink,
  CreditCard,
  Check,
  LogOut,
  Bell,
  Volume2,
  VolumeX,
  Printer,
  Settings2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Wifi,
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { ConfirmModal } from '../components/ConfirmModal';
import { playOrderBuzzSound, stopOrderBuzzSound } from '../services/sound.service';
import {
  printSampleThermalReceipt,
  isAutoPrintEnabled,
  setAutoPrintEnabled,
} from '../services/thermal-print.service';
import {
  POS_BRANDS,
  PosBrand,
  PosPrinterConfig,
  getPosPrinterConfig,
  savePosPrinterConfig,
  DEFAULT_POS_CONFIG,
} from '../services/pos-config.service';

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
  const [isTestingSound, setIsTestingSound] = useState(false);
  const [autoPrintEnabled, setAutoPrintState] = useState(true);
  const [isTestingPrint, setIsTestingPrint] = useState(false);
  const [restaurantId, setRestaurantId] = useState<string>('');

  // POS Printer Configuration State
  const [posConfig, setPosConfig] = useState<PosPrinterConfig>(DEFAULT_POS_CONFIG);
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [printerIpInput, setPrinterIpInput] = useState('192.168.1.100');
  const [printerPortInput, setPrinterPortInput] = useState('9100');
  const [isSavingIp, setIsSavingIp] = useState(false);

  useEffect(() => {
    isAutoPrintEnabled().then(setAutoPrintState);
    getPosPrinterConfig().then((cfg) => {
      setPosConfig(cfg);
      setPrinterIpInput(cfg.ipAddress || '192.168.1.100');
      setPrinterPortInput(String(cfg.port || 9100));
    });
  }, []);

  const handleSelectBrand = async (brandId: PosBrand) => {
    const selectedBrand = POS_BRANDS.find((b) => b.id === brandId);
    const newConn = selectedBrand?.defaultConnection || 'network';
    const updated = await savePosPrinterConfig(
      {
        brand: brandId,
        connectionType: newConn,
      },
      restaurantId || undefined
    );
    setPosConfig(updated);
    setShowBrandDropdown(false);
    Alert.alert('POS Brand Configured', `Restaurant printer set to ${selectedBrand?.name}`);
  };

  const handleSaveNetworkSettings = async () => {
    setIsSavingIp(true);
    try {
      const portNum = parseInt(printerPortInput, 10) || 9100;
      const updated = await savePosPrinterConfig(
        {
          ipAddress: printerIpInput.trim(),
          port: portNum,
        },
        restaurantId || undefined
      );
      setPosConfig(updated);
      Alert.alert('Network Printer Saved', `Connected to ${printerIpInput.trim()}:${portNum}`);
    } catch {
      Alert.alert('Error', 'Failed to save network printer settings');
    } finally {
      setIsSavingIp(false);
    }
  };

  const handleSetPaperWidth = async (width: '80mm' | '58mm') => {
    const updated = await savePosPrinterConfig({ paperWidth: width }, restaurantId || undefined);
    setPosConfig(updated);
  };

  const handleSetCopies = async (copies: number) => {
    const updated = await savePosPrinterConfig({ copies }, restaurantId || undefined);
    setPosConfig(updated);
  };

  const handleToggleAutoCut = async (autoCut: boolean) => {
    const updated = await savePosPrinterConfig({ autoCut }, restaurantId || undefined);
    setPosConfig(updated);
  };

  const handleToggleAutoPrint = async (val: boolean) => {
    setAutoPrintState(val);
    await setAutoPrintEnabled(val);
    const updated = await savePosPrinterConfig({ autoPrint: val }, restaurantId || undefined);
    setPosConfig(updated);
  };

  const handleTestPrint = async () => {
    setIsTestingPrint(true);
    try {
      const success = await printSampleThermalReceipt();
      if (success) {
        Alert.alert('Print Sent', `Test receipt sent to ${POS_BRANDS.find((b) => b.id === posConfig.brand)?.name || 'printer'}.`);
      } else {
        Alert.alert('Print Status', 'Could not reach thermal printer. Ensure printer is on the same WiFi/Network.');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Print Error', 'Failed to send test print.');
    } finally {
      setIsTestingPrint(false);
    }
  };

  const handleTestOrderBuzz = async () => {
    if (isTestingSound) {
      await stopOrderBuzzSound();
      setIsTestingSound(false);
    } else {
      setIsTestingSound(true);
      await playOrderBuzzSound(5000);
      setTimeout(() => {
        setIsTestingSound(false);
      }, 5000);
    }
  };

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
        if (r._id) {
          setRestaurantId(r._id);
          const pConfig = await getPosPrinterConfig(r._id);
          setPosConfig(pConfig);
          setPrinterIpInput(pConfig.ipAddress || '192.168.1.100');
          setPrinterPortInput(String(pConfig.port || 9100));
          setAutoPrintState(pConfig.autoPrint);
        }

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

          {/* Order Sound & Buzz Alert Card */}
          <View style={styles.sectionCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Bell size={18} color={Colors.primary} />
              <Text style={styles.sectionHeader}>Order Sound & Buzz Alerts</Text>
            </View>
            <Text style={styles.sectionSub}>
              Loud 5-second buzzer chime and haptic vibration for real-time incoming orders.
            </Text>

            <View style={[styles.timingRow, { borderBottomWidth: 0, paddingVertical: 10 }]}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text }}>5-Sec Buzzer Alert</Text>
                <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>Enabled for all new orders</Text>
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
                    <VolumeX size={15} color="#FFFFFF" />
                    <Text style={styles.soundTestBtnText}>Stop Alert</Text>
                  </>
                ) : (
                  <>
                    <Volume2 size={15} color="#FFFFFF" />
                    <Text style={styles.soundTestBtnText}>Test 5s Buzz</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Universal Thermal POS Printer & Multi-Brand Setup */}
          <View style={styles.sectionCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Printer size={18} color={Colors.primary} />
              <Text style={styles.sectionHeader}>Universal POS & Thermal Printer</Text>
            </View>
            <Text style={styles.sectionSub}>
              Configure your restaurant's thermal receipt printer. Supports Epson TM-m30, SUNMI V3 MIX, Star Micronics, RetailZ, Citizen, Munbyn & WiFi/LAN printers.
            </Text>

            {/* 1. Brand Selector Header */}
            <View style={[styles.timingRow, { paddingVertical: 12 }]}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text }}>Configured Brand</Text>
                <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '700', marginTop: 2 }}>
                  {POS_BRANDS.find((b) => b.id === posConfig.brand)?.name || 'Generic POS'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.changeBrandBtn}
                onPress={() => setShowBrandDropdown(!showBrandDropdown)}
                activeOpacity={0.8}
              >
                <Settings2 size={14} color="#FFFFFF" />
                <Text style={styles.changeBrandBtnText}>
                  {showBrandDropdown ? 'Close' : 'Select Brand'}
                </Text>
                {showBrandDropdown ? (
                  <ChevronUp size={13} color="#FFFFFF" />
                ) : (
                  <ChevronDown size={13} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            </View>

            {/* 2. Expandable Brand Selection List */}
            {showBrandDropdown && (
              <View style={styles.brandDropdownList}>
                <Text style={styles.dropdownHeader}>Select this Restaurant's Printer Brand:</Text>
                {POS_BRANDS.map((brand) => {
                  const isSelected = posConfig.brand === brand.id;
                  return (
                    <TouchableOpacity
                      key={brand.id}
                      style={[
                        styles.brandOptionRow,
                        isSelected && styles.brandOptionRowSelected,
                      ]}
                      onPress={() => handleSelectBrand(brand.id)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.brandOptionName,
                            isSelected && styles.brandOptionNameSelected,
                          ]}
                        >
                          {brand.name}
                        </Text>
                        <Text style={styles.brandOptionSub}>{brand.subtitle}</Text>
                      </View>
                      {isSelected && (
                        <CheckCircle2 size={18} color={Colors.primary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* 3. Connection Specific Settings */}
            {posConfig.connectionType === 'builtin' ? (
              <View style={styles.hardwareBadgeBox}>
                <CheckCircle2 size={16} color="#10B981" />
                <Text style={styles.hardwareBadgeText}>
                  Hardware Built-in Direct Native SDK Active
                </Text>
              </View>
            ) : posConfig.connectionType === 'network' ? (
              <View style={styles.networkConfigBox}>
                <View style={styles.networkHeaderRow}>
                  <Wifi size={15} color={Colors.primary} />
                  <Text style={styles.networkBoxTitle}>WiFi / LAN Printer Network Settings</Text>
                </View>
                <Text style={styles.networkBoxSub}>
                  Enter the local IP address printed on your printer's self-test slip (Port 9100 / 80).
                </Text>
                <View style={styles.networkInputsRow}>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.inputMiniLabel}>Printer IP Address</Text>
                    <TextInput
                      style={styles.netFormInput}
                      value={printerIpInput}
                      onChangeText={setPrinterIpInput}
                      placeholder="192.168.1.100"
                      placeholderTextColor={Colors.textSubtle}
                      keyboardType="numeric"
                      autoCapitalize="none"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputMiniLabel}>Port</Text>
                    <TextInput
                      style={styles.netFormInput}
                      value={printerPortInput}
                      onChangeText={setPrinterPortInput}
                      placeholder="9100"
                      placeholderTextColor={Colors.textSubtle}
                      keyboardType="numeric"
                    />
                  </View>
                  <TouchableOpacity
                    style={styles.saveIpBtn}
                    onPress={handleSaveNetworkSettings}
                    disabled={isSavingIp}
                  >
                    {isSavingIp ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Save size={13} color="#FFFFFF" />
                        <Text style={styles.saveIpBtnText}>Save</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {/* 4. Thermal Paper Width */}
            <View style={[styles.timingRow, { paddingVertical: 10 }]}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text }}>Thermal Paper Width</Text>
                <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>80mm (Standard POS) or 58mm (Compact)</Text>
              </View>
              <View style={styles.segmentGroup}>
                <TouchableOpacity
                  style={[
                    styles.segmentBtn,
                    posConfig.paperWidth === '80mm' && styles.segmentBtnActive,
                  ]}
                  onPress={() => handleSetPaperWidth('80mm')}
                >
                  <Text
                    style={[
                      styles.segmentBtnText,
                      posConfig.paperWidth === '80mm' && styles.segmentBtnTextActive,
                    ]}
                  >
                    80mm
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.segmentBtn,
                    posConfig.paperWidth === '58mm' && styles.segmentBtnActive,
                  ]}
                  onPress={() => handleSetPaperWidth('58mm')}
                >
                  <Text
                    style={[
                      styles.segmentBtnText,
                      posConfig.paperWidth === '58mm' && styles.segmentBtnTextActive,
                    ]}
                  >
                    58mm
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 5. Print Copies */}
            <View style={[styles.timingRow, { paddingVertical: 10 }]}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text }}>Print Copies</Text>
                <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>1 for customer, or 2 for Customer + Kitchen</Text>
              </View>
              <View style={styles.segmentGroup}>
                <TouchableOpacity
                  style={[
                    styles.segmentBtn,
                    posConfig.copies === 1 && styles.segmentBtnActive,
                  ]}
                  onPress={() => handleSetCopies(1)}
                >
                  <Text
                    style={[
                      styles.segmentBtnText,
                      posConfig.copies === 1 && styles.segmentBtnTextActive,
                    ]}
                  >
                    1 Copy
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.segmentBtn,
                    posConfig.copies === 2 && styles.segmentBtnActive,
                  ]}
                  onPress={() => handleSetCopies(2)}
                >
                  <Text
                    style={[
                      styles.segmentBtnText,
                      posConfig.copies === 2 && styles.segmentBtnTextActive,
                    ]}
                  >
                    2 Copies
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 6. Auto Paper Cut */}
            <View style={[styles.timingRow, { paddingVertical: 10 }]}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text }}>Auto Paper Cut</Text>
                <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>Automatically slice receipt after printing</Text>
              </View>
              <Switch
                value={posConfig.autoCut}
                onValueChange={handleToggleAutoCut}
                trackColor={{ true: Colors.primary, false: Colors.cardBorder }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* 7. Auto Print Switch */}
            <View style={[styles.timingRow, { paddingVertical: 10 }]}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text }}>Auto-Print New Orders</Text>
                <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>Print receipt automatically on order placement</Text>
              </View>
              <Switch
                value={autoPrintEnabled}
                onValueChange={handleToggleAutoPrint}
                trackColor={{ true: Colors.primary, false: Colors.cardBorder }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* 8. Test Print Button */}
            <View style={[styles.timingRow, { borderBottomWidth: 0, paddingVertical: 12 }]}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text }}>Test Active Printer</Text>
                <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                  Send a sample receipt to {POS_BRANDS.find((b) => b.id === posConfig.brand)?.name || 'active printer'}
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.soundTestBtn,
                  { backgroundColor: '#0F172A' },
                ]}
                onPress={handleTestPrint}
                disabled={isTestingPrint}
                activeOpacity={0.8}
              >
                {isTestingPrint ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Printer size={15} color="#FFFFFF" />
                    <Text style={styles.soundTestBtnText}>Test Print</Text>
                  </>
                )}
              </TouchableOpacity>
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

          {/* Legal & Policies Section */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionHeader}>Legal & Policies</Text>
            <Text style={styles.sectionSub}>Review Krifoo Admin partner terms and data guidelines</Text>

            <TouchableOpacity
              style={styles.timingRow}
              onPress={() => router.push('/terms-conditions')}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text }}>Terms & Conditions</Text>
                <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>Read our terms of service</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.timingRow, { borderBottomWidth: 0 }]}
              onPress={() => router.push('/privacy-policy')}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text }}>Privacy Policy</Text>
                <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>Read our data privacy policy</Text>
              </View>
            </TouchableOpacity>
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
  soundTestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
  changeBrandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  changeBrandBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  brandDropdownList: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 10,
    marginVertical: 10,
    gap: 6,
  },
  dropdownHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  brandOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  brandOptionRowSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  brandOptionName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  brandOptionNameSelected: {
    color: Colors.primary,
  },
  brandOptionSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  hardwareBadgeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    padding: 10,
    borderRadius: 8,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  hardwareBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
    flex: 1,
  },
  networkConfigBox: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 12,
    marginVertical: 8,
  },
  networkHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  networkBoxTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  networkBoxSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: 10,
    lineHeight: 15,
  },
  networkInputsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  inputMiniLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
    marginBottom: 4,
  },
  netFormInput: {
    backgroundColor: Colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    color: Colors.text,
  },
  saveIpBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 8,
  },
  saveIpBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  segmentGroup: {
    flexDirection: 'row',
    backgroundColor: Colors.cardSurface,
    borderRadius: 8,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  segmentBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  segmentBtnActive: {
    backgroundColor: Colors.primary,
  },
  segmentBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  segmentBtnTextActive: {
    color: '#FFFFFF',
  },
});
