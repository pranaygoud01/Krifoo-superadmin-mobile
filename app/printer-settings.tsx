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
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Header } from '../components/Header';
import { Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import {
  Printer,
  Settings2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Wifi,
  RotateCw,
  Save,
  Bluetooth,
  FileText,
  DollarSign,
  Info,
} from 'lucide-react-native';
import {
  printSampleThermalReceipt,
  isAutoPrintEnabled,
  setAutoPrintEnabled,
  getPosPrinterConfig,
  savePosPrinterConfig,
  POS_BRANDS,
  testEpsonPrinter,
} from '../services/thermal-print.service';
import { PosPrinterConfig, PosBrand, PosConnectionType, DEFAULT_POS_CONFIG } from '../services/pos-config.service';
import { BluetoothPrinterModal, DiscoveredPrinterDevice } from '../components/BluetoothPrinterModal';
import { EpsonPrinterService } from '../src/services/printer/EpsonPrinterService';

export default function PrinterSettingsScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{ restaurantId?: string }>();
  const restaurantId = params.restaurantId;

  const [posConfig, setPosConfig] = useState<PosPrinterConfig>(DEFAULT_POS_CONFIG);
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [printerIpInput, setPrinterIpInput] = useState('192.168.1.100');
  const [printerPortInput, setPrinterPortInput] = useState('9100');
  const [isSavingIp, setIsSavingIp] = useState(false);
  const [isTestingPrint, setIsTestingPrint] = useState(false);
  const [showBtModal, setShowBtModal] = useState(false);
  const [autoPrintEnabled, setAutoPrintState] = useState(true);

  useEffect(() => {
    getPosPrinterConfig(restaurantId).then((cfg) => {
      setPosConfig(cfg);
      setPrinterIpInput(cfg.ipAddress || '192.168.1.100');
      setPrinterPortInput(String(cfg.port || 9100));
      setAutoPrintState(cfg.autoPrint);
    });
  }, [restaurantId]);

  const handleSelectBrand = async (brandId: PosBrand) => {
    const selectedBrand = POS_BRANDS.find((b) => b.id === brandId);
    const newConn = selectedBrand?.defaultConnection || 'bluetooth';
    const updated = await savePosPrinterConfig(
      { brand: brandId, connectionType: newConn },
      restaurantId
    );
    setPosConfig(updated);
    setShowBrandDropdown(false);
    showToast({
      title: 'POS Brand Updated',
      message: `Configured for ${selectedBrand?.name}`,
      type: 'success',
    });
  };

  const handleSelectConnectionType = async (connType: PosConnectionType) => {
    const updated = await savePosPrinterConfig({ connectionType: connType }, restaurantId);
    setPosConfig(updated);
    showToast({
      title: 'Connection Mode Saved',
      message: `Set to ${connType.toUpperCase()} mode`,
      type: 'info',
    });
  };

  const handlePairDevice = async (device: DiscoveredPrinterDevice) => {
    if (device.connectionType === 'bluetooth') {
      const updated = await savePosPrinterConfig(
        {
          brand: 'epson',
          connectionType: 'bluetooth',
          target: device.target || 'BT:EP-TM-M30III',
          macAddress: device.macAddress || '',
        },
        restaurantId
      );
      setPosConfig(updated);
      showToast({
        title: 'Bluetooth Printer Paired',
        message: `Successfully connected ${device.name}`,
        type: 'success',
      });
    } else if (device.ipAddress) {
      setPrinterIpInput(device.ipAddress);
      const updated = await savePosPrinterConfig(
        {
          brand: 'epson',
          connectionType: 'network',
          ipAddress: device.ipAddress,
        },
        restaurantId
      );
      setPosConfig(updated);
      showToast({
        title: 'Network Printer Paired',
        message: `Connected ${device.name} at IP ${device.ipAddress}`,
        type: 'success',
      });
    }
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
        restaurantId
      );
      setPosConfig(updated);
      showToast({
        title: 'Network Settings Saved',
        message: `Printer IP set to ${printerIpInput.trim()}:${portNum}`,
        type: 'success',
      });
    } catch (err) {
      showToast({ title: 'Error', message: 'Failed to save network settings', type: 'error' });
    } finally {
      setIsSavingIp(false);
    }
  };

  const handleSetPaperWidth = async (width: '80mm' | '58mm') => {
    const updated = await savePosPrinterConfig({ paperWidth: width }, restaurantId);
    setPosConfig(updated);
    showToast({ title: 'Paper Width Updated', message: `Set to ${width} thermal roll`, type: 'info' });
  };

  const handleSetCopies = async (copies: number) => {
    const updated = await savePosPrinterConfig({ copies }, restaurantId);
    setPosConfig(updated);
  };

  const handleToggleAutoCut = async (autoCut: boolean) => {
    const updated = await savePosPrinterConfig({ autoCut }, restaurantId);
    setPosConfig(updated);
  };

  const handleToggleAutoPrint = async (val: boolean) => {
    setAutoPrintState(val);
    await setAutoPrintEnabled(val);
    const updated = await savePosPrinterConfig({ autoPrint: val }, restaurantId);
    setPosConfig(updated);
  };

  const handleToggleCashDrawer = async (val: boolean) => {
    const updated = await savePosPrinterConfig({ openCashDrawer: val }, restaurantId);
    setPosConfig(updated);
  };

  const handleTestPrint = async () => {
    setIsTestingPrint(true);
    showToast({ title: 'Testing Printer', message: 'Sending test receipt payload...', type: 'info' });
    try {
      const result = await testEpsonPrinter(posConfig);
      if (result.success) {
        showToast({ title: 'Test Print Success', message: result.message, type: 'success' });
      } else {
        const fallback = await printSampleThermalReceipt();
        if (fallback) {
          showToast({ title: 'Test Receipt Sent', message: 'Printed sample receipt successfully', type: 'success' });
        } else {
          showToast({ title: 'Print Error', message: result.message, type: 'error' });
        }
      }
    } catch (e: any) {
      showToast({ title: 'Print Error', message: 'Failed to send print command', type: 'error' });
    } finally {
      setIsTestingPrint(false);
    }
  };

  const handleOpenCashDrawerTest = async () => {
    showToast({ title: 'Testing Cash Drawer', message: 'Sending pulse signal...', type: 'info' });
    await EpsonPrinterService.openCashDrawer(posConfig);
  };

  const activeBrandObj = POS_BRANDS.find((b) => b.id === posConfig.brand) || POS_BRANDS[0];

  return (
    <View style={styles.container}>
      <Header title="POS & Thermal Printer Setup" showBack={true} />

      <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
        {/* Status Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusIconBox}>
            <Printer size={24} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1, flexShrink: 1, marginRight: 8 }}>
            <Text style={styles.statusTitle} numberOfLines={1}>{activeBrandObj.name}</Text>
            <Text style={styles.statusSub} numberOfLines={2}>
              {posConfig.connectionType === 'bluetooth'
                ? `🔵 Bluetooth Wireless • Target: ${posConfig.target || 'BT:EP-TM-M30III'}`
                : posConfig.connectionType === 'network'
                ? `📶 Local Network • IP: ${posConfig.ipAddress}:${posConfig.port}`
                : `📱 ${posConfig.connectionType.toUpperCase()} Mode`}
            </Text>
          </View>
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>ACTIVE</Text>
          </View>
        </View>

        {/* Action Button: Scan & Pair Bluetooth Printer */}
        <TouchableOpacity
          style={styles.scanBtn}
          onPress={() => setShowBtModal(true)}
          activeOpacity={0.8}
        >
          <RotateCw size={16} color="#FFFFFF" />
          <Text style={styles.scanBtnText}>🔍 Scan & Pair Bluetooth Printer</Text>
        </TouchableOpacity>

        {/* 1. Brand Selection Section */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardHeaderTitle}>Printer Brand</Text>
            <TouchableOpacity
              style={styles.selectBrandBtn}
              onPress={() => setShowBrandDropdown(!showBrandDropdown)}
            >
              <Settings2 size={14} color="#FFFFFF" />
              <Text style={styles.selectBrandBtnText}>
                {showBrandDropdown ? 'Close' : 'Change Brand'}
              </Text>
              {showBrandDropdown ? <ChevronUp size={13} color="#FFFFFF" /> : <ChevronDown size={13} color="#FFFFFF" />}
            </TouchableOpacity>
          </View>

          {showBrandDropdown && (
            <View style={styles.brandList}>
              {POS_BRANDS.map((brand) => {
                const isSelected = posConfig.brand === brand.id;
                return (
                  <TouchableOpacity
                    key={brand.id}
                    style={[styles.brandItem, isSelected && styles.brandItemSelected]}
                    onPress={() => handleSelectBrand(brand.id)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.brandName, isSelected && styles.brandNameSelected]}>
                          {brand.name}
                        </Text>
                        {brand.badge && (
                          <View
                            style={{
                              backgroundColor: brand.badge === 'RECOMMENDED' ? '#10B981' : Colors.primary,
                              paddingHorizontal: 5,
                              paddingVertical: 1,
                              borderRadius: 4,
                            }}
                          >
                            <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '800' }}>
                              {brand.badge}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.brandSub}>{brand.subtitle}</Text>
                    </View>
                    {isSelected && <CheckCircle2 size={18} color={Colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* 2. Connection Mode Selection */}
        <View style={styles.card}>
          <Text style={styles.cardHeaderTitle}>Connection Mode</Text>
          <Text style={styles.cardSubtitle}>
            Select how your POS tablet connects to the thermal printer.
          </Text>

          <View style={styles.connGrid}>
            <TouchableOpacity
              style={[
                styles.connBtn,
                posConfig.connectionType === 'bluetooth' && styles.connBtnActive,
              ]}
              onPress={() => handleSelectConnectionType('bluetooth')}
            >
              <Text
                style={[styles.connText, posConfig.connectionType === 'bluetooth' && styles.connTextActive]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                🔵 Bluetooth Wireless
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.connBtn,
                posConfig.connectionType === 'network' && styles.connBtnActive,
              ]}
              onPress={() => handleSelectConnectionType('network')}
            >
              <Text
                style={[styles.connText, posConfig.connectionType === 'network' && styles.connTextActive]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                📶 WiFi / LAN IP
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.connBtn,
                posConfig.connectionType === 'builtin' && styles.connBtnActive,
              ]}
              onPress={() => handleSelectConnectionType('builtin')}
            >
              <Text
                style={[styles.connText, posConfig.connectionType === 'builtin' && styles.connTextActive]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                📱 Built-in Terminal
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.connBtn,
                posConfig.connectionType === 'system' && styles.connBtnActive,
              ]}
              onPress={() => handleSelectConnectionType('system')}
            >
              <Text
                style={[styles.connText, posConfig.connectionType === 'system' && styles.connTextActive]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                📄 AirPrint / Dialog
              </Text>
            </TouchableOpacity>
          </View>

          {/* Network IP Form if Network Mode */}
          {posConfig.connectionType === 'network' && (
            <View style={styles.netBox}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Wifi size={16} color={Colors.primary} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text }}>LAN / WiFi Network IP Settings</Text>
              </View>
              <View style={styles.netRow}>
                <View style={{ flex: 2 }}>
                  <Text style={styles.miniLabel}>Printer IP Address</Text>
                  <TextInput
                    style={styles.netInput}
                    value={printerIpInput}
                    onChangeText={setPrinterIpInput}
                    placeholder="192.168.1.100"
                    placeholderTextColor={Colors.textSubtle}
                    keyboardType="numeric"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.miniLabel}>Port</Text>
                  <TextInput
                    style={styles.netInput}
                    value={printerPortInput}
                    onChangeText={setPrinterPortInput}
                    placeholder="9100"
                    placeholderTextColor={Colors.textSubtle}
                    keyboardType="numeric"
                  />
                </View>
                <TouchableOpacity
                  style={styles.saveNetBtn}
                  onPress={handleSaveNetworkSettings}
                  disabled={isSavingIp}
                >
                  {isSavingIp ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Save size={14} color="#FFFFFF" />}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* 3. Paper & Receipt Preferences */}
        <View style={styles.card}>
          <Text style={styles.cardHeaderTitle}>Receipt Layout & Formatting</Text>

          {/* Paper Width */}
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>Thermal Paper Roll Format</Text>
              <Text style={styles.settingSub}>80mm (Standard POS) or 58mm (Compact)</Text>
            </View>
            <View style={styles.segmentGroup}>
              <TouchableOpacity
                style={[styles.segmentBtn, posConfig.paperWidth === '80mm' && styles.segmentBtnActive]}
                onPress={() => handleSetPaperWidth('80mm')}
              >
                <Text style={[styles.segmentText, posConfig.paperWidth === '80mm' && styles.segmentTextActive]}>80mm</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentBtn, posConfig.paperWidth === '58mm' && styles.segmentBtnActive]}
                onPress={() => handleSetPaperWidth('58mm')}
              >
                <Text style={[styles.segmentText, posConfig.paperWidth === '58mm' && styles.segmentTextActive]}>58mm</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Receipt Copies */}
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>Copies per Order</Text>
              <Text style={styles.settingSub}>1 Copy (Kitchen) or 2 Copies (Kitchen + Customer)</Text>
            </View>
            <View style={styles.segmentGroup}>
              <TouchableOpacity
                style={[styles.segmentBtn, posConfig.copies === 1 && styles.segmentBtnActive]}
                onPress={() => handleSetCopies(1)}
              >
                <Text style={[styles.segmentText, posConfig.copies === 1 && styles.segmentTextActive]}>1 Copy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentBtn, posConfig.copies === 2 && styles.segmentBtnActive]}
                onPress={() => handleSetCopies(2)}
              >
                <Text style={[styles.segmentText, posConfig.copies === 2 && styles.segmentTextActive]}>2 Copies</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Auto Cut */}
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>Automatic Paper Cut</Text>
              <Text style={styles.settingSub}>Send auto-cut signal (\x1D\x56\x00) after each receipt</Text>
            </View>
            <Switch
              value={posConfig.autoCut}
              onValueChange={handleToggleAutoCut}
              trackColor={{ false: Colors.cardBorder, true: Colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Auto Print New Orders */}
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>Auto-Print Live Orders</Text>
              <Text style={styles.settingSub}>Automatically print receipt when a new website/app order arrives</Text>
            </View>
            <Switch
              value={autoPrintEnabled}
              onValueChange={handleToggleAutoPrint}
              trackColor={{ false: Colors.cardBorder, true: Colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Open Cash Drawer */}
          <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingTitle}>Open Cash Drawer on Cash Payments</Text>
              <Text style={styles.settingSub}>Pulse drawer kickout code (\x1B\x70\x00\x19\xFA) on cash orders</Text>
            </View>
            <Switch
              value={posConfig.openCashDrawer}
              onValueChange={handleToggleCashDrawer}
              trackColor={{ false: Colors.cardBorder, true: Colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* 4. Hardware Test Controls */}
        <View style={styles.card}>
          <Text style={styles.cardHeaderTitle}>Hardware Diagnostic Controls</Text>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <TouchableOpacity
              style={styles.testBtn}
              onPress={handleTestPrint}
              disabled={isTestingPrint}
              activeOpacity={0.8}
            >
              {isTestingPrint ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Printer size={15} color="#FFFFFF" />
                  <Text style={styles.testBtnText}>Print Test Receipt</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.testBtn, { backgroundColor: '#10B981' }]}
              onPress={handleOpenCashDrawerTest}
              activeOpacity={0.8}
            >
              <DollarSign size={15} color="#FFFFFF" />
              <Text style={styles.testBtnText}>Kick Cash Drawer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Bluetooth Pairing Modal */}
      <BluetoothPrinterModal
        visible={showBtModal}
        onClose={() => setShowBtModal(false)}
        onSelectPrinter={handlePairDevice}
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
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 12,
    marginBottom: 12,
  },
  statusIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FF5C39',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  statusSub: {
    fontSize: 12,
    color: Colors.textSubtle,
    marginTop: 2,
  },
  activeBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  activeBadgeText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '800',
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF5C39',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
    marginBottom: 16,
  },
  scanBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  cardSubtitle: {
    fontSize: 12,
    color: Colors.textSubtle,
    marginTop: 2,
    marginBottom: 12,
  },
  selectBrandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF5C39',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  selectBrandBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  brandList: {
    marginTop: 12,
    gap: 8,
  },
  brandItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.background,
  },
  brandItemSelected: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(255, 92, 57, 0.05)',
  },
  brandName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  brandNameSelected: {
    color: Colors.primary,
  },
  brandSub: {
    fontSize: 11,
    color: Colors.textSubtle,
    marginTop: 2,
  },
  connGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 8,
  },
  connBtn: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.background,
    alignItems: 'center',
  },
  connBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  connText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSubtle,
  },
  connTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  netBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  netRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  miniLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSubtle,
    marginBottom: 4,
  },
  netInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 38,
    fontSize: 13,
    color: Colors.text,
  },
  saveNetBtn: {
    backgroundColor: Colors.primary,
    width: 38,
    height: 38,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  settingTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  settingSub: {
    fontSize: 11,
    color: Colors.textSubtle,
    marginTop: 2,
  },
  segmentGroup: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  segmentBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  segmentBtnActive: {
    backgroundColor: Colors.primary,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSubtle,
  },
  segmentTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  testBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FF5C39',
    paddingVertical: 10,
    borderRadius: 8,
  },
  testBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
