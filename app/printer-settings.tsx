import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  Platform,
  Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Header } from '../components/Header';
import { Colors } from '../constants/colors';
import { useToast } from '../context/ToastContext';
import {
  Printer,
  Wifi,
  Bluetooth,
  Smartphone,
  FileText,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  Save,
  DollarSign,
  Layers,
  ChevronDown,
  ChevronUp,
  Search,
  Check,
  ShieldCheck,
  Radio,
  Sliders,
  Sparkles,
  Info,
  ChevronRight,
  HelpCircle,
  ExternalLink,
  XCircle,
  Scissors,
  FileCheck,
  Wrench,
} from 'lucide-react-native';
import {
  printSampleThermalReceipt,
  isAutoPrintEnabled,
  setAutoPrintEnabled,
  getPosPrinterConfig,
  savePosPrinterConfig,
  POS_BRANDS,
  testEpsonPrinter,
  testPrinterAlignmentSlip,
  openCashDrawer,
  isSunmiAvailable,
} from '../services/thermal-print.service';
import {
  PosPrinterConfig,
  PosBrand,
  PosConnectionType,
  DEFAULT_POS_CONFIG,
  validatePosConfig,
  isProfileConfigured,
  profileFromConfig,
  PrinterProfile,
} from '../services/pos-config.service';
import { BluetoothPrinterModal, DiscoveredPrinterDevice } from '../components/BluetoothPrinterModal';
import { PrinterSetupWizardModal } from '../components/PrinterSetupWizardModal';
import {
  getActiveReceiptTemplate,
  saveReceiptTemplate,
  ReceiptTemplate,
} from '../services/receipt-customization.service';

export default function PrinterSettingsScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{ restaurantId?: string }>();
  const restaurantId = params.restaurantId;

  // Master switch: Receipt printing enabled
  const [receiptPrintingEnabled, setReceiptPrintingEnabled] = useState(true);

  // Configuration state
  const [posConfig, setPosConfig] = useState<PosPrinterConfig>(DEFAULT_POS_CONFIG);
  const [printerIpInput, setPrinterIpInput] = useState('');
  const [printerPortInput, setPrinterPortInput] = useState('9100');
  const [showIpSetup, setShowIpSetup] = useState(false);
  const [showManualBt, setShowManualBt] = useState(false);
  const [manualBtInput, setManualBtInput] = useState('');

  // Troubleshooting accordions
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);

  // Status & action indicators
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingPrint, setIsTestingPrint] = useState(false);
  const [isTestingCalibration, setIsTestingCalibration] = useState(false);
  const [isTestingDrawer, setIsTestingDrawer] = useState(false);
  const [showBtModal, setShowBtModal] = useState(false);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [isSunmiHardware, setIsSunmiHardware] = useState<boolean | null>(null);
  const [testResult, setTestResult] = useState<{ status: 'success' | 'error'; message: string } | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<ReceiptTemplate | null>(null);

  // Load and cache active template for UI display
  const loadActiveTemplate = useCallback(async () => {
    try {
      const tpl = await getActiveReceiptTemplate(restaurantId);
      if (tpl) {
        setActiveTemplate(tpl);
      }
    } catch (e) {
      console.warn('[PrinterSettings] Error loading active template:', e);
    }
  }, [restaurantId]);

  // Synchronize active template when screen gains focus (e.g. returning from /receipt-customization)
  useFocusEffect(
    useCallback(() => {
      loadActiveTemplate();
    }, [loadActiveTemplate])
  );

  // Fetch initial config and check hardware
  useEffect(() => {
    getPosPrinterConfig(restaurantId).then(async (cfg) => {
      // Synchronize with active receipt template if present
      try {
        const activeTpl = await getActiveReceiptTemplate(restaurantId);
        if (activeTpl) {
          setActiveTemplate(activeTpl);
          if (activeTpl.layout?.paperWidth && activeTpl.layout.paperWidth !== cfg.paperWidth) {
            cfg = await savePosPrinterConfig({ paperWidth: activeTpl.layout.paperWidth }, restaurantId);
          }
        }
      } catch (e) {
        console.warn('[PrinterSettings] Error checking template paper width sync:', e);
      }

      setPosConfig(cfg);
      setReceiptPrintingEnabled(cfg.autoPrint !== false || isProfileConfigured(cfg));
      setPrinterIpInput(cfg.ipAddress || '');
      setPrinterPortInput(String(cfg.port || (cfg.brand === 'epson' ? 8008 : 9100)));
      setManualBtInput(cfg.target || cfg.macAddress || '');
    });

    isSunmiAvailable().then((avail) => {
      setIsSunmiHardware(avail);
    });
  }, [restaurantId]);

  const isConfigured = isProfileConfigured(posConfig);
  const activeProfile = profileFromConfig(posConfig);

  // Toggle Master Receipt Printing switch
  const handleToggleMasterPrinting = async (val: boolean) => {
    setReceiptPrintingEnabled(val);
    await setAutoPrintEnabled(val);
    const updated = await savePosPrinterConfig({ autoPrint: val }, restaurantId);
    setPosConfig(updated);
    showToast({
      title: val ? 'Receipt Printing Enabled' : 'Receipt Printing Disabled',
      message: val ? 'Orders will be formatted and routed to your printer' : 'Receipt printing is currently turned off',
      type: val ? 'success' : 'info',
    });
  };

  // Select Connection Mode
  const handleSelectConnectionType = async (connType: PosConnectionType) => {
    let targetBrand = posConfig.brand;
    let targetPort = posConfig.port;

    if (connType === 'builtin') {
      targetBrand = 'sunmi';
    } else if (connType === 'system') {
      targetBrand = 'system';
    } else if (connType === 'network' && posConfig.brand === 'sunmi') {
      targetBrand = 'epson';
      targetPort = 8008;
    }

    const updated = await savePosPrinterConfig(
      {
        connectionType: connType,
        brand: targetBrand,
        port: targetPort,
      },
      restaurantId
    );

    setPosConfig(updated);
    setPrinterPortInput(String(updated.port || 9100));

    if (connType === 'bluetooth') {
      setShowBtModal(true);
    } else if (connType === 'network') {
      setShowIpSetup(true);
    } else if (connType === 'builtin') {
      showToast({
        title: 'Built-in Sunmi Terminal Selected',
        message: 'Printer routed to internal hardware AIDL service.',
        type: 'success',
      });
    } else if (connType === 'system') {
      showToast({
        title: 'System Spooler Selected',
        message: 'Using native iOS AirPrint / Android print spooler.',
        type: 'info',
      });
    }
  };

  // Pair a Discovered Device from Modal
  const handlePairDevice = async (device: DiscoveredPrinterDevice) => {
    if (device.connectionType === 'bluetooth') {
      const deviceTarget = device.target || device.macAddress || device.name || '';
      const brand: PosBrand = device.name?.toLowerCase().includes('star')
        ? 'star'
        : device.name?.toLowerCase().includes('epson')
        ? 'epson'
        : posConfig.brand || 'epson';

      const updated = await savePosPrinterConfig(
        {
          brand,
          connectionType: 'bluetooth',
          target: deviceTarget,
          macAddress: device.macAddress || (deviceTarget.startsWith('BT:') ? '' : deviceTarget),
        },
        restaurantId
      );
      setPosConfig(updated);
      setManualBtInput(deviceTarget);
      showToast({
        title: 'Printer Connected',
        message: `Successfully connected ${device.name}`,
        type: 'success',
      });
    } else if (device.ipAddress) {
      setPrinterIpInput(device.ipAddress);
      const updated = await savePosPrinterConfig(
        {
          connectionType: 'network',
          ipAddress: device.ipAddress,
        },
        restaurantId
      );
      setPosConfig(updated);
      showToast({
        title: 'Network Printer Connected',
        message: `Connected ${device.name} at IP ${device.ipAddress}`,
        type: 'success',
      });
    }
  };

  // Save manual IP address
  const handleSaveNetworkSettings = async () => {
    const ip = printerIpInput.trim();
    const portNum = parseInt(printerPortInput, 10) || (posConfig.brand === 'epson' ? 8008 : 9100);

    const validation = validatePosConfig({ connectionType: 'network', ipAddress: ip });
    if (!validation.valid) {
      showToast({
        title: 'Invalid IP Address',
        message: validation.error || 'Please enter a valid IP address.',
        type: 'error',
      });
      return;
    }

    setIsSaving(true);
    try {
      const updated = await savePosPrinterConfig(
        {
          ipAddress: ip,
          port: portNum,
          connectionType: 'network',
        },
        restaurantId
      );
      setPosConfig(updated);
      setShowIpSetup(false);
      showToast({
        title: 'Printer IP Saved',
        message: `Connected at ${ip}:${portNum}`,
        type: 'success',
      });
    } catch (err) {
      showToast({ title: 'Error', message: 'Failed to save network configuration', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // Disconnect / Forget Printer
  const handleDisconnectPrinter = async () => {
    const updated = await savePosPrinterConfig(
      {
        ipAddress: '',
        target: '',
        macAddress: '',
        connectionType: 'bluetooth',
      },
      restaurantId
    );
    setPosConfig(updated);
    setPrinterIpInput('');
    setManualBtInput('');
    setTestResult(null);
    showToast({
      title: 'Printer Disconnected',
      message: 'The printer has been unlinked from this station.',
      type: 'info',
    });
  };

  // Save manual Bluetooth target
  const handleSaveManualBtTarget = async () => {
    const target = manualBtInput.trim();
    if (!target) {
      showToast({
        title: 'Input Required',
        message: 'Please enter a Bluetooth device target or MAC address.',
        type: 'error',
      });
      return;
    }

    const updated = await savePosPrinterConfig(
      {
        connectionType: 'bluetooth',
        target,
        macAddress: target.startsWith('BT:') ? '' : target,
      },
      restaurantId
    );
    setPosConfig(updated);
    setShowManualBt(false);
    showToast({
      title: 'Bluetooth Target Saved',
      message: `Target set to ${target}`,
      type: 'success',
    });
  };

  // Setting handlers
  const handleSetPaperWidth = async (width: '80mm' | '58mm') => {
    // 1. Update POS printer hardware config
    const updated = await savePosPrinterConfig({ paperWidth: width }, restaurantId);
    setPosConfig(updated);

    // 2. Synchronize active receipt template
    try {
      const activeTpl = await getActiveReceiptTemplate(restaurantId);
      if (activeTpl && activeTpl.layout.paperWidth !== width) {
        const saved = await saveReceiptTemplate(
          {
            ...activeTpl,
            layout: {
              ...activeTpl.layout,
              paperWidth: width,
            },
          },
          restaurantId,
          true
        );
        setActiveTemplate(saved);
      } else if (activeTpl) {
        setActiveTemplate(activeTpl);
      }
    } catch (e) {
      console.warn('[PrinterSettings] Failed to sync template paper width:', e);
    }

    showToast({ title: 'Paper Roll Updated', message: `Station set to ${width} roll`, type: 'info' });
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
    await setAutoPrintEnabled(val);
    const updated = await savePosPrinterConfig({ autoPrint: val }, restaurantId);
    setPosConfig(updated);
  };

  const handleToggleCashDrawer = async (val: boolean) => {
    const updated = await savePosPrinterConfig({ openCashDrawer: val }, restaurantId);
    setPosConfig(updated);
  };

  // 1-Tap Quick Setup Presets
  const handleApplyPreset = async (preset: 'counter' | 'kitchen' | 'mobile') => {
    let newSettings: Partial<PosPrinterConfig> = {};
    let presetLabel = '';

    if (preset === 'counter') {
      newSettings = {
        paperWidth: '80mm',
        copies: 1,
        autoCut: true,
        autoPrint: true,
        openCashDrawer: true,
      };
      presetLabel = 'Counter POS';
    } else if (preset === 'kitchen') {
      newSettings = {
        paperWidth: '80mm',
        copies: 2,
        autoCut: true,
        autoPrint: true,
        openCashDrawer: false,
      };
      presetLabel = 'Kitchen Station';
    } else if (preset === 'mobile') {
      newSettings = {
        paperWidth: '58mm',
        copies: 1,
        autoCut: false,
        autoPrint: true,
        openCashDrawer: false,
      };
      presetLabel = 'Mobile Handheld';
    }

    const updated = await savePosPrinterConfig(newSettings, restaurantId);
    setPosConfig(updated);

    if (newSettings.paperWidth) {
      try {
        const activeTpl = await getActiveReceiptTemplate(restaurantId);
        if (activeTpl && activeTpl.layout.paperWidth !== newSettings.paperWidth) {
          await saveReceiptTemplate(
            {
              ...activeTpl,
              layout: { ...activeTpl.layout, paperWidth: newSettings.paperWidth },
            },
            restaurantId,
            true
          );
        }
      } catch (err) {
        console.warn('[PrinterSettings] Preset template sync error:', err);
      }
    }

    showToast({
      title: `${presetLabel} Applied`,
      message: 'Printing preferences updated.',
      type: 'success',
    });
  };

  // Live Test Print
  const handleTestPrint = async () => {
    if (!isConfigured) {
      showToast({
        title: 'No Printer Connected',
        message: 'Please connect a printer before running a test print.',
        type: 'error',
      });
      return;
    }

    setIsTestingPrint(true);
    setTestResult(null);
    showToast({ title: 'Testing Printer', message: 'Sending test receipt...', type: 'info' });
    try {
      const result = await testEpsonPrinter(posConfig, restaurantId);
      if (result.success) {
        setTestResult({ status: 'success', message: result.message || 'Test receipt printed successfully! Printer hardware is operational.' });
        showToast({ title: 'Print Verified', message: result.message, type: 'success' });
      } else {
        const fallback = await printSampleThermalReceipt(restaurantId, posConfig);
        if (fallback) {
          setTestResult({ status: 'success', message: 'Sample receipt printed successfully!' });
          showToast({ title: 'Receipt Printed', message: 'Printed sample receipt successfully', type: 'success' });
        } else {
          setTestResult({ status: 'error', message: result.message || 'Printer did not respond. Check power, paper roll, and connection.' });
          showToast({ title: 'Print Error', message: result.message || 'Printer communication failed', type: 'error' });
        }
      }
    } catch (e: any) {
      setTestResult({ status: 'error', message: e.message || 'Failed to send test receipt to printer.' });
      showToast({ title: 'Print Error', message: 'Failed to send test receipt', type: 'error' });
    } finally {
      setIsTestingPrint(false);
    }
  };

  const handleOpenCashDrawerTest = async () => {
    setIsTestingDrawer(true);
    showToast({ title: 'Testing Cash Drawer', message: 'Sending drawer pulse signal...', type: 'info' });
    try {
      const success = await openCashDrawer(restaurantId);
      if (success) {
        showToast({ title: 'Cash Drawer Kicked', message: 'Drawer kick pulse acknowledged', type: 'success' });
      } else {
        showToast({ title: 'Drawer Notice', message: 'Could not pulse cash drawer. Check printer RJ11 cable.', type: 'info' });
      }
    } finally {
      setIsTestingDrawer(false);
    }
  };

  const openBluetoothSettings = async () => {
    if (Platform.OS === 'android') {
      try {
        await Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
        return;
      } catch { }
    }
    try {
      await Linking.openSettings();
    } catch (e) {
      console.warn('Could not open system settings:', e);
    }
  };

  const handleTestCalibration = async () => {
    if (!isConfigured) {
      showToast({
        title: 'No Printer Connected',
        message: 'Please connect a printer before running calibration.',
        type: 'error',
      });
      return;
    }

    setIsTestingCalibration(true);
    showToast({ title: 'Printing Alignment Slip', message: 'Testing ruler, columns & margins...', type: 'info' });
    try {
      const result = await testPrinterAlignmentSlip(posConfig);
      if (result.success) {
        showToast({ title: 'Calibration Printed', message: result.message, type: 'success' });
      } else {
        showToast({ title: 'Calibration Notice', message: result.message, type: 'error' });
      }
    } catch (e: any) {
      showToast({ title: 'Print Error', message: 'Failed to send calibration slip', type: 'error' });
    } finally {
      setIsTestingCalibration(false);
    }
  };

  const arch = getArchitectureDetails(posConfig, activeProfile);

  // Active preset determination
  const isCounterActive =
    posConfig.paperWidth === '80mm' &&
    posConfig.copies === 1 &&
    posConfig.autoCut === true &&
    posConfig.openCashDrawer === true;

  const isKitchenActive =
    posConfig.paperWidth === '80mm' &&
    posConfig.copies === 2 &&
    posConfig.autoCut === true &&
    posConfig.openCashDrawer === false;

  const isMobileActive =
    posConfig.paperWidth === '58mm' &&
    posConfig.copies === 1 &&
    posConfig.autoCut === false;

  return (
    <View style={styles.container}>
      <Header title="Receipt Printing" showBackButton={true} />

      <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
        {/* ========================================================================= */}
        {/* STATION MASTER SWITCH                                                     */}
        {/* ========================================================================= */}
        <View style={styles.masterCard}>
          <View style={styles.masterRow}>
            <View style={[styles.masterIconTile, receiptPrintingEnabled && styles.masterIconTileActive]}>
              <Printer size={22} color={receiptPrintingEnabled ? '#059669' : '#64748B'} />
            </View>
            <View style={styles.masterContent}>
              <Text style={styles.masterTitle}>Receipt Printing Station</Text>
              <Text style={styles.masterSubtitle}>
                {receiptPrintingEnabled ? 'Printing enabled for this POS station' : 'Printing is turned off for this station'}
              </Text>
            </View>
            <Switch
              value={receiptPrintingEnabled}
              onValueChange={handleToggleMasterPrinting}
              trackColor={{ false: '#E2E8F0', true: '#059669' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {receiptPrintingEnabled && (
          <>
            {/* ===================================================================== */}
            {/* 1. CONNECTED PRINTER HERO (Primary Focal Point)                       */}
            {/* ===================================================================== */}
            <View style={[styles.connectedHeroCard, isConfigured ? styles.connectedHeroCardActive : styles.connectedHeroCardInactive]}>
              {/* Status Header Bar */}
              <View style={styles.heroStatusRow}>
                <View style={styles.heroStatusBadge}>
                  <View
                    style={[
                      styles.heroStatusDot,
                      isConfigured
                        ? isTestingPrint
                          ? styles.statusDotAmber
                          : styles.statusDotGreen
                        : styles.statusDotMuted,
                    ]}
                  />
                  <Text style={[styles.heroStatusText, !isConfigured && styles.heroStatusTextMuted]}>
                    {isConfigured
                      ? isTestingPrint
                        ? 'SENDING TEST PRINT...'
                        : 'CONNECTED & READY'
                      : 'NO PRINTER CONNECTED'}
                  </Text>
                </View>
                {isConfigured && (
                  <Text style={styles.heroStationLabel}>PRIMARY POS PRINTER</Text>
                )}
              </View>

              {/* Printer Details */}
              <View style={styles.heroDetailsRow}>
                <View style={[styles.heroPrinterIconTile, isConfigured && styles.heroPrinterIconTileActive]}>
                  {posConfig.connectionType === 'builtin' ? (
                    <Smartphone size={24} color="#059669" />
                  ) : posConfig.connectionType === 'network' ? (
                    <Wifi size={24} color="#059669" />
                  ) : posConfig.connectionType === 'system' ? (
                    <FileText size={24} color="#059669" />
                  ) : (
                    <Printer size={24} color={isConfigured ? '#059669' : '#94A3B8'} />
                  )}
                </View>
                <View style={styles.heroTextContainer}>
                  <Text style={styles.heroPrinterTitle} numberOfLines={1}>
                    {arch.title}
                  </Text>
                  <Text style={styles.heroPrinterSubtitle} numberOfLines={1}>
                    {arch.targetSummary}
                  </Text>
                </View>
              </View>

              {/* Hardware Spec Badges */}
              {isConfigured && (
                <View style={styles.heroSpecsRow}>
                  <View style={styles.heroSpecChip}>
                    <Text style={styles.heroSpecChipText}>{arch.transportBadge}</Text>
                  </View>
                  <View style={styles.heroSpecChip}>
                    <Text style={styles.heroSpecChipText}>
                      {posConfig.paperWidth === '80mm' ? '80mm Roll (48 Cols)' : '58mm Roll (32 Cols)'}
                    </Text>
                  </View>
                  <View style={styles.heroSpecChip}>
                    <Text style={styles.heroSpecChipText}>
                      {posConfig.autoCut ? 'Auto-Cut ON' : 'Tear Bar'}
                    </Text>
                  </View>
                  <View style={styles.heroSpecChip}>
                    <Text style={styles.heroSpecChipText}>
                      {posConfig.copies || 1} {posConfig.copies === 2 ? 'Copies' : 'Copy'}
                    </Text>
                  </View>
                </View>
              )}

              {/* Inline Live Test Alert */}
              {testResult && (
                <View
                  style={[
                    styles.inlineAlertBox,
                    testResult.status === 'success' ? styles.inlineAlertSuccess : styles.inlineAlertError,
                  ]}
                >
                  {testResult.status === 'success' ? (
                    <CheckCircle2 size={16} color="#059669" style={{ marginTop: 1 }} />
                  ) : (
                    <AlertCircle size={16} color="#DC2626" style={{ marginTop: 1 }} />
                  )}
                  <Text
                    style={[
                      styles.inlineAlertText,
                      testResult.status === 'success' ? styles.inlineAlertTextSuccess : styles.inlineAlertTextError,
                    ]}
                  >
                    {testResult.message}
                  </Text>
                </View>
              )}

              {/* Actions Divider */}
              <View style={styles.heroDivider} />

              {/* Primary & Secondary Action Buttons */}
              {isConfigured ? (
                <View style={styles.heroActionsContainer}>
                  {/* Primary 48px Action: Test Print */}
                  <TouchableOpacity
                    style={[styles.primaryTestBtn, isTestingPrint && styles.btnDisabled]}
                    onPress={handleTestPrint}
                    disabled={isTestingPrint}
                    activeOpacity={0.8}
                  >
                    {isTestingPrint ? (
                      <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
                    ) : (
                      <Printer size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                    )}
                    <Text style={styles.primaryTestBtnText}>
                      {isTestingPrint ? 'Printing Test Receipt...' : 'Print Test Receipt'}
                    </Text>
                  </TouchableOpacity>

                  {/* Secondary Actions Row */}
                  <View style={styles.heroSecondaryActionsRow}>
                    <TouchableOpacity
                      style={styles.secondarySetupBtn}
                      onPress={() => setShowSetupWizard(true)}
                      activeOpacity={0.7}
                    >
                      <Wrench size={16} color="#065F46" style={{ marginRight: 6 }} />
                      <Text style={styles.secondarySetupBtnText}>Setup Wizard</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.secondaryDisconnectBtn}
                      onPress={handleDisconnectPrinter}
                      activeOpacity={0.7}
                    >
                      <XCircle size={16} color="#DC2626" style={{ marginRight: 6 }} />
                      <Text style={styles.secondaryDisconnectBtnText}>Disconnect</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                  /* Empty state prompt */
                  <View style={styles.emptyConnectContainer}>
                    <Text style={styles.emptyConnectSubtitle}>
                      Connect your POS receipt printer via Bluetooth, local Network IP, or built-in hardware.
                    </Text>
                    <TouchableOpacity
                      style={styles.heroLaunchWizardBtn}
                      onPress={() => setShowSetupWizard(true)}
                      activeOpacity={0.85}
                    >
                      <Sparkles size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                      <Text style={styles.heroLaunchWizardBtnText}>Setup Printer</Text>
                    </TouchableOpacity>
                  </View>
              )}
            </View>

            {/* ===================================================================== */}
            {/* 2. RECEIPT TEMPLATE (Active Template Showcase)                        */}
            {/* ===================================================================== */}
            <View style={[styles.sectionHeaderRow, styles.sectionHeaderRowBetween]}>
              <Text style={styles.sectionTitle}>RECEIPT TEMPLATE</Text>
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: '/receipt-customization',
                    params: restaurantId ? { restaurantId } : {},
                  })
                }
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <Text style={styles.sectionHeaderAction}>Customize</Text>
              </TouchableOpacity>
            </View>

            {/* Active Template Showcase Card */}
            <TouchableOpacity
              style={styles.templateHeroCard}
              onPress={() =>
                router.push({
                  pathname: '/receipt-customization',
                  params: restaurantId ? { restaurantId } : {},
                })
              }
              activeOpacity={0.75}
            >
              {/* Card Top Row: Branded Icon Tile, Name & Active Tag, Edit Pill */}
              <View style={styles.templateCardTopRow}>
                <View style={styles.templateIconTileEnhanced}>
                  <Sparkles size={20} color="#EA580C" />
                </View>

                <View style={styles.templateHeaderContent}>
                  <View style={styles.templateLiveTagRow}>
                    <View style={styles.liveIndicatorDot} />
                    <Text style={styles.templateLiveTagText}>CURRENT TEMPLATE</Text>
                  </View>
                  <Text style={styles.templateHeroTitle} numberOfLines={1}>
                    {activeTemplate?.name || 'Standard POS Receipt'}
                  </Text>
                </View>

              </View>


              {/* Active Layout Spec Chips */}
              <View style={styles.templateChipsRow}>
                <View style={styles.templateChipHighlight}>
                  <Text style={styles.templateChipHighlightText}>
                    {(activeTemplate?.layout?.paperWidth || posConfig.paperWidth) === '80mm'
                      ? '80mm Wide (48 col)'
                      : '58mm Roll (32 col)'}
                  </Text>
                </View>

                <View style={styles.templateChipNeutral}>
                  <Text style={styles.templateChipNeutralText}>
                    {activeTemplate?.layout?.fontSize
                      ? activeTemplate.layout.fontSize.charAt(0).toUpperCase() +
                      activeTemplate.layout.fontSize.slice(1)
                      : 'Medium'}{' '}
                    Font
                  </Text>
                </View>

                {activeTemplate?.content?.showTaxId ? (
                  <View style={styles.templateChipNeutral}>
                    <Text style={styles.templateChipNeutralText}>Tax / VAT</Text>
                  </View>
                ) : null}

                {activeTemplate?.content?.showQrCode ? (
                  <View style={styles.templateChipNeutral}>
                    <Text style={styles.templateChipNeutralText}>QR Code</Text>
                  </View>
                ) : null}

                {activeTemplate?.content?.showLogo ? (
                  <View style={styles.templateChipNeutral}>
                    <Text style={styles.templateChipNeutralText}>Store Logo</Text>
                  </View>
                ) : null}

                {activeTemplate?.content?.showItemNotes ? (
                  <View style={styles.templateChipNeutral}>
                    <Text style={styles.templateChipNeutralText}>Notes</Text>
                  </View>
                ) : null}
              </View>

              {/* Footer Helper */}
              <View style={styles.templateCardFooter}>
                <Text style={styles.templateCardFooterText}>
                  Tap to edit header, store details, fonts & footer notes
                </Text>
                <ChevronRight size={14} color="#94A3B8" />
              </View>
            </TouchableOpacity>

            {/* ===================================================================== */}
            {/* 4. PAPER & LAYOUT (Paper Configuration)                              */}
            {/* ===================================================================== */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>PAPER & LAYOUT</Text>
              {/* <Text style={styles.sectionSubtitle}>Roll size, column grid, and receipt template</Text> */}
            </View>

            {/* Selectable Paper Size Cards */}
            <View style={styles.paperSizesContainer}>
              {/* 80mm Card */}
              <TouchableOpacity
                style={[
                  styles.paperSizeCard,
                  posConfig.paperWidth === '80mm' && styles.paperSizeCardSelected,
                ]}
                onPress={() => handleSetPaperWidth('80mm')}
                activeOpacity={0.8}
              >
                <View style={styles.paperSizeCardHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.paperSizeTitleRow}>
                      <Text style={styles.paperSizeTitle}>80mm Standard Roll (3-Inch)</Text>

                    </View>

                  </View>
                  <View
                    style={[
                      styles.radioCircle,
                      posConfig.paperWidth === '80mm' && styles.radioCircleSelected,
                    ]}
                  >
                    {posConfig.paperWidth === '80mm' && <Check size={14} color="#FFFFFF" />}
                  </View>
                </View>

                <View style={styles.paperSpecsRow}>
                  <View style={styles.paperSpecTag}>
                    <Text style={styles.paperSpecTagText}>48 Columns Wide</Text>
                  </View>
                  <View style={styles.paperSpecTag}>
                    <Text style={styles.paperSpecTagText}>Standard Desktop POS</Text>
                  </View>
                </View>
              </TouchableOpacity>

              {/* 58mm Card */}
              <TouchableOpacity
                style={[
                  styles.paperSizeCard,
                  posConfig.paperWidth === '58mm' && styles.paperSizeCardSelected,
                ]}
                onPress={() => handleSetPaperWidth('58mm')}
                activeOpacity={0.8}
              >
                <View style={styles.paperSizeCardHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.paperSizeTitleRow}>
                      <Text style={styles.paperSizeTitle}>58mm Compact Roll (2-Inch)</Text>

                    </View>

                  </View>
                  <View
                    style={[
                      styles.radioCircle,
                      posConfig.paperWidth === '58mm' && styles.radioCircleSelected,
                    ]}
                  >
                    {posConfig.paperWidth === '58mm' && <Check size={14} color="#FFFFFF" />}
                  </View>
                </View>

                <View style={styles.paperSpecsRow}>
                  <View style={styles.paperSpecTag}>
                    <Text style={styles.paperSpecTagText}>32 Columns Wide</Text>
                  </View>
                  <View style={styles.paperSpecTag}>
                    <Text style={styles.paperSpecTagText}>Mobile Wireless</Text>
                  </View>
                </View>
              </TouchableOpacity>
            </View>

            {/* ===================================================================== */}
            {/* 3. RECEIPT BEHAVIOR (Printing Preferences)                            */}
            {/* ===================================================================== */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>RECEIPT BEHAVIOR</Text>
              {/* <Text style={styles.sectionSubtitle}>Station profile & printing automations</Text> */}
            </View>

            {/* Receipt Behavior Settings Card */}
            <View style={styles.groupedSettingsCard}>


              {/* Number of copies (Segmented Control) */}
              <View style={styles.settingRowColumn}>
                <View style={styles.settingTextContainer}>
                  <Text style={styles.settingTitle}>Number of copies</Text>
                  <Text style={styles.settingSubtitle}>1 copy (Customer) or 2 copies (Kitchen + Customer)</Text>
                </View>

                {/* 44px Segmented Control */}
                <View style={styles.segmentedControlWrap}>
                  <TouchableOpacity
                    style={[
                      styles.segmentBtn,
                      (posConfig.copies || 1) === 1 && styles.segmentBtnActive,
                    ]}
                    onPress={() => handleSetCopies(1)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.segmentBtnText,
                        (posConfig.copies || 1) === 1 && styles.segmentBtnTextActive,
                      ]}
                    >
                      1 copy
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.segmentBtn,
                      posConfig.copies === 2 && styles.segmentBtnActive,
                    ]}
                    onPress={() => handleSetCopies(2)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.segmentBtnText,
                        posConfig.copies === 2 && styles.segmentBtnTextActive,
                      ]}
                    >
                      2 copies
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.settingSeparator} />

              {/* Auto-print orders */}
              <View style={styles.settingRow}>
                <View style={styles.settingTextContainer}>
                  <Text style={styles.settingTitle}>Auto-print orders</Text>
                  <Text style={styles.settingSubtitle}>Print receipt automatically when an order arrives</Text>
                </View>
                <Switch
                  value={posConfig.autoPrint !== false}
                  onValueChange={handleToggleAutoPrint}
                  trackColor={{ false: '#E2E8F0', true: '#059669' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={styles.settingSeparator} />

              {/* Cut receipt */}
              <View style={styles.settingRow}>
                <View style={styles.settingTextContainer}>
                  <Text style={styles.settingTitle}>Cut receipt</Text>
                  <Text style={styles.settingSubtitle}>Automatically cut paper after each receipt is printed</Text>
                </View>
                <Switch
                  value={posConfig.autoCut ?? true}
                  onValueChange={handleToggleAutoCut}
                  trackColor={{ false: '#E2E8F0', true: '#059669' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={styles.settingSeparator} />

              {/* Cash Drawer */}
              <View style={styles.settingRow}>
                <View style={styles.settingTextContainer}>
                  <Text style={styles.settingTitle}>Open cash drawer</Text>
                  <Text style={styles.settingSubtitle}>Kick drawer open when order payment is cash</Text>
                </View>
                <Switch
                  value={posConfig.openCashDrawer ?? true}
                  onValueChange={handleToggleCashDrawer}
                  trackColor={{ false: '#E2E8F0', true: '#059669' }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>


            {/* ===================================================================== */}
            {/* 5. TESTING & TROUBLESHOOTING                                          */}
            {/* ===================================================================== */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>TESTING & TROUBLESHOOTING</Text>
              {/* <Text style={styles.sectionSubtitle}>Hardware diagnostics and issue resolution</Text> */}
            </View>

            {/* Hardware Diagnostics Card */}
            <View style={styles.groupedListCard}>
              {/* Test 1: Test Print Receipt */}
              <TouchableOpacity
                style={styles.listRowTouchable}
                onPress={handleTestPrint}
                disabled={isTestingPrint}
                activeOpacity={0.7}
              >
                <View style={[styles.listRowIconTile, { backgroundColor: '#F0FDF4' }]}>
                  {isTestingPrint ? (
                    <ActivityIndicator size="small" color="#059669" />
                  ) : (
                      <Printer size={20} color="#059669" />
                  )}
                </View>
                <View style={styles.listRowTextContainer}>
                  <Text style={styles.listRowTitle}>Test print receipt</Text>
                  <Text style={styles.listRowSubtitle}>Send a sample customer order to verify live printing</Text>
                </View>
                <ChevronRight size={18} color="#94A3B8" />
              </TouchableOpacity>

              <View style={styles.listRowSeparator} />



              {/* Test 3: Test Cash Drawer */}
              <TouchableOpacity
                style={styles.listRowTouchable}
                onPress={handleOpenCashDrawerTest}
                disabled={isTestingDrawer}
                activeOpacity={0.7}
              >
                <View style={[styles.listRowIconTile, { backgroundColor: '#F8FAFC' }]}>
                  {isTestingDrawer ? (
                    <ActivityIndicator size="small" color="#475569" />
                  ) : (
                      <DollarSign size={20} color="#475569" />
                  )}
                </View>
                <View style={styles.listRowTextContainer}>
                  <Text style={styles.listRowTitle}>Test cash drawer</Text>
                  <Text style={styles.listRowSubtitle}>Send drawer pulse without printing paper</Text>
                </View>
                <ChevronRight size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Troubleshooting Accordions (Progressive Disclosure) */}
            <View style={styles.faqCard}>
              <View style={styles.faqHeader}>
                <HelpCircle size={18} color="#64748B" />
                <Text style={styles.faqHeaderTitle}>Hardware Troubleshooting Guide</Text>
              </View>

              {/* Accordion 1: Blank Paper */}
              <TouchableOpacity
                style={styles.faqItem}
                onPress={() => setExpandedFaq(expandedFaq === 'blank' ? null : 'blank')}
                activeOpacity={0.7}
              >
                <View style={styles.faqQuestionRow}>
                  <Text style={styles.faqQuestionText}>Blank paper is feeding through?</Text>
                  {expandedFaq === 'blank' ? (
                    <ChevronUp size={16} color="#64748B" />
                  ) : (
                    <ChevronDown size={16} color="#94A3B8" />
                  )}
                </View>
                {expandedFaq === 'blank' && (
                  <View style={styles.faqAnswerBox}>
                    <Text style={styles.faqAnswerText}>
                      Thermal paper only prints on one side. If paper feeds but has no ink, open the roll lid and turn the paper roll over so the coated side faces the thermal printhead.
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              <View style={styles.faqItemSeparator} />

              {/* Accordion 2: Prices cut off */}
              <TouchableOpacity
                style={styles.faqItem}
                onPress={() => setExpandedFaq(expandedFaq === 'cutoff' ? null : 'cutoff')}
                activeOpacity={0.7}
              >
                <View style={styles.faqQuestionRow}>
                  <Text style={styles.faqQuestionText}>Prices or item names are cut off?</Text>
                  {expandedFaq === 'cutoff' ? (
                    <ChevronUp size={16} color="#64748B" />
                  ) : (
                    <ChevronDown size={16} color="#94A3B8" />
                  )}
                </View>
                {expandedFaq === 'cutoff' && (
                  <View style={styles.faqAnswerBox}>
                    <Text style={styles.faqAnswerText}>
                      Ensure the selected paper size matches your hardware. If using a 58mm roll, select "58mm Compact Roll (2-Inch)" above to format the 32-column grid and prevent price truncation.
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              <View style={styles.faqItemSeparator} />

              {/* Accordion 3: Bluetooth won't connect */}
              <TouchableOpacity
                style={styles.faqItem}
                onPress={() => setExpandedFaq(expandedFaq === 'bluetooth' ? null : 'bluetooth')}
                activeOpacity={0.7}
              >
                <View style={styles.faqQuestionRow}>
                  <Text style={styles.faqQuestionText}>Bluetooth printer won't connect or pair?</Text>
                  {expandedFaq === 'bluetooth' ? (
                    <ChevronUp size={16} color="#64748B" />
                  ) : (
                    <ChevronDown size={16} color="#94A3B8" />
                  )}
                </View>
                {expandedFaq === 'bluetooth' && (
                  <View style={styles.faqAnswerBox}>
                    <Text style={styles.faqAnswerText}>
                      1. Check Android system Bluetooth settings and pair with your printer (PIN is typically 0000 or 1234).{'\n'}
                      2. Ensure Location & Nearby Devices permissions are granted.{'\n'}
                      3. Make sure the printer is not currently paired to another tablet.
                    </Text>
                    <TouchableOpacity
                      style={styles.faqSystemBtn}
                      onPress={openBluetoothSettings}
                      activeOpacity={0.7}
                    >
                      <ExternalLink size={14} color="#059669" style={{ marginRight: 6 }} />
                      <Text style={styles.faqSystemBtnText}>Open System Bluetooth Settings</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>

              <View style={styles.faqItemSeparator} />

              {/* Accordion 4: Cash Drawer */}
              <TouchableOpacity
                style={styles.faqItem}
                onPress={() => setExpandedFaq(expandedFaq === 'drawer' ? null : 'drawer')}
                activeOpacity={0.7}
              >
                <View style={styles.faqQuestionRow}>
                  <Text style={styles.faqQuestionText}>Cash drawer does not kick open?</Text>
                  {expandedFaq === 'drawer' ? (
                    <ChevronUp size={16} color="#64748B" />
                  ) : (
                    <ChevronDown size={16} color="#94A3B8" />
                  )}
                </View>
                {expandedFaq === 'drawer' && (
                  <View style={styles.faqAnswerBox}>
                    <Text style={styles.faqAnswerText}>
                      The cash drawer connects to the printer via an RJ11/RJ12 cable (phone-style connector) on the back of the thermal printer. Verify the cable is securely plugged into the DK (Drawer Kick) port.
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>


          </>
        )}
      </ScrollView>

      {/* Bluetooth Discovery Modal */}
      <BluetoothPrinterModal
        visible={showBtModal}
        activeTarget={posConfig.target || posConfig.macAddress || posConfig.ipAddress}
        onClose={() => setShowBtModal(false)}
        onSelectPrinter={handlePairDevice}
      />

      {/* 3-Step Guided Printer Setup Wizard */}
      <PrinterSetupWizardModal
        visible={showSetupWizard}
        onClose={() => setShowSetupWizard(false)}
        restaurantId={restaurantId}
        currentConfig={posConfig}
        onComplete={(newCfg) => {
          setPosConfig(newCfg);
          loadActiveTemplate();
          showToast({
            title: 'Printer Ready',
            message: 'Your printer has been successfully configured and tested.',
            type: 'success',
          });
        }}
      />
    </View>
  );
}

// Helper to compute architecture details from profile
function getArchitectureDetails(config: PosPrinterConfig, profile: PrinterProfile | null) {
  if (!profile) {
    return {
      title: 'No Printer Connected',
      transportBadge: 'Not Connected',
      targetSummary: 'Search for a printer to connect',
      encoderName: 'EscPosEncoder',
      transportName: 'Awaiting Printer Connection',
      classifierName: 'classifyRawByteResult',
    };
  }

  switch (profile.connectionType) {
    case 'network_epos':
      return {
        title: config.brand === 'epson' ? 'Epson TM-m30 / TM-T88 Network' : 'Network ePOS Printer',
        transportBadge: 'Wi-Fi / LAN (Port 8008)',
        targetSummary: `IP: ${profile.ipAddress}:${profile.port || 8008}`,
        encoderName: 'EposXmlEncoder',
        transportName: 'HttpEposTransport (Cached)',
        classifierName: 'classifyEposXmlResult',
      };
    case 'network_raw':
      return {
        title: 'Universal ESC/POS Network Printer',
        transportBadge: 'Wi-Fi / LAN (Port 9100)',
        targetSummary: `IP: ${profile.ipAddress}:${profile.port || 9100}`,
        encoderName: 'EscPosEncoder',
        transportName: 'TcpSocketTransport',
        classifierName: 'classifyRawByteResult',
      };
    case 'ble':
      return {
        title: 'Epson TM-m30 / TM-m10 Bluetooth',
        transportBadge: 'Bluetooth Low Energy (BLE)',
        targetSummary: `MAC: ${profile.macAddress}`,
        encoderName: 'EscPosEncoder',
        transportName: 'BleTransport',
        classifierName: 'classifyRawByteResult',
      };
    case 'spp':
      return {
        title: 'Star Micronics / ESC-POS Bluetooth',
        transportBadge: 'Bluetooth Classic (SPP)',
        targetSummary: `${profile.target || profile.macAddress}`,
        encoderName: 'EscPosEncoder',
        transportName: 'SppTransport',
        classifierName: 'classifyRawByteResult',
      };
    case 'builtin':
      return {
        title: 'Sunmi POS Integrated Printer',
        transportBadge: 'Sunmi Hardware AIDL',
        targetSummary: 'Sunmi Internal Printer Service',
        encoderName: 'Direct Sunmi Native',
        transportName: 'SunmiTransport',
        classifierName: 'classifyRawByteResult',
      };
    case 'system':
      return {
        title: 'System Print Spooler',
        transportBadge: 'AirPrint / Android Spooler',
        targetSummary: 'Native Print Dialog',
        encoderName: 'HTML / CSS 80mm',
        transportName: 'SystemTransport',
        classifierName: 'classifyRawByteResult',
      };
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC', // Slate 50
  },
  scrollBody: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 48,
  },

  /* Master Station Card */
  masterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  masterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  masterIconTile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  masterIconTileActive: {
    backgroundColor: '#ECFDF5',
  },
  masterContent: {
    flex: 1,
    marginRight: 12,
  },
  masterTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  masterSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },

  /* Section Headers */
  sectionHeaderRow: {
    marginTop: 20,
    marginBottom: 8,
  },
  sectionHeaderRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderAction: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#EA580C',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#475569',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },

  /* 1. Connected Printer Hero */
  connectedHeroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  connectedHeroCardActive: {
    borderColor: '#059669',
  },
  connectedHeroCardInactive: {
    borderColor: '#E2E8F0',
  },
  heroStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  heroStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotGreen: {
    backgroundColor: '#10B981',
  },
  statusDotAmber: {
    backgroundColor: '#F59E0B',
  },
  statusDotMuted: {
    backgroundColor: '#94A3B8',
  },
  heroStatusText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: '#059669',
  },
  heroStatusTextMuted: {
    color: '#64748B',
  },
  heroStationLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  heroDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  heroPrinterIconTile: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  heroPrinterIconTileActive: {
    backgroundColor: '#ECFDF5',
  },
  heroTextContainer: {
    flex: 1,
  },
  heroPrinterTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  heroPrinterSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  heroSpecsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  heroSpecChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  heroSpecChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  inlineAlertBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  inlineAlertSuccess: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  inlineAlertError: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  inlineAlertText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  inlineAlertTextSuccess: {
    color: '#166534',
  },
  inlineAlertTextError: {
    color: '#991B1B',
  },
  heroDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  heroActionsContainer: {
    gap: 8,
  },
  primaryTestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    backgroundColor: '#0F172A',
    borderRadius: 12,
  },
  primaryTestBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  heroSecondaryActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  secondarySetupBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
  },
  secondarySetupBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#065F46',
  },
  secondaryDisconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    height: 44,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
  },
  secondaryDisconnectBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
  emptyConnectContainer: {
    paddingVertical: 6,
  },
  emptyConnectSubtitle: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 12,
  },
  heroLaunchWizardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    backgroundColor: '#059669',
    borderRadius: 12,
  },
  heroLaunchWizardBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  /* 2. Grouped List Card (Printer Setup & Testing) */
  groupedListCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  listRowTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    minHeight: 56,
  },
  listRowIconTile: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  listRowTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  listRowTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  listRowTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  listRowSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  listRowSeparator: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginLeft: 68,
  },
  recommendedBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recommendedBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#2563EB',
    letterSpacing: 0.3,
  },
  sunmiDetectedBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sunmiDetectedBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.3,
  },
  networkFormContainer: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  formFieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  formTextInput: {
    height: 44,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0F172A',
  },
  formSaveBtn: {
    height: 44,
    backgroundColor: '#059669',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formSaveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  manualBtToggleBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  manualBtToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
  },

  /* 3. Receipt Behavior (Presets & Settings) */
  presetsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  presetCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  presetCardActive: {
    borderColor: '#059669',
    backgroundColor: '#F0FDF4',
  },
  presetCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
    textAlign: 'center',
  },
  presetCardTitleActive: {
    color: '#059669',
  },
  presetCardDesc: {
    fontSize: 10.5,
    color: '#64748B',
    textAlign: 'center',
  },
  groupedSettingsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  settingRowColumn: {
    paddingVertical: 2,
  },
  settingTextContainer: {
    flex: 1,
    marginRight: 12,
  },
  settingTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  settingSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  settingSeparator: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  segmentedControlWrap: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 4,
    marginTop: 10,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#0F172A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  segmentBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  /* 4. Paper & Layout */
  paperSizesContainer: {
    gap: 10,
    marginBottom: 12,
  },
  paperSizeCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 14,
  },
  paperSizeCardSelected: {
    borderColor: '#059669',
    backgroundColor: '#FCFDFD',
  },
  paperSizeCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  paperSizeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  paperSizeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  paperSizeDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
    marginBottom: 10,
    paddingRight: 8,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleSelected: {
    borderColor: '#059669',
    backgroundColor: '#059669',
  },
  paperSpecsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  paperSpecTag: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  paperSpecTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  /* 2. Active Template Showcase Card */
  templateHeroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  templateCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  templateIconTileEnhanced: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFEDD5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  templateHeaderContent: {
    flex: 1,
    justifyContent: 'center',
  },
  templateLiveTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  liveIndicatorDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },
  templateLiveTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.6,
  },
  templateHeroTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 5,
  },
  templateCustomizePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FFF7ED',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFEDD5',
  },
  templateCustomizePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EA580C',
  },
  templateHeroDescription: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginTop: 10,
    marginBottom: 12,
  },
  templateChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  templateChipHighlight: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  templateChipHighlightText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  templateChipNeutral: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  templateChipNeutralText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  templateCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  templateCardFooterText: {
    fontSize: 11.5,
    color: '#64748B',
    flex: 1,
    marginRight: 8,
  },

  /* 5. Testing & Troubleshooting */
  faqCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginTop: 16,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  faqHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
  },
  faqItem: {
    paddingVertical: 8,
  },
  faqQuestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 36,
  },
  faqQuestionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    flex: 1,
    marginRight: 8,
  },
  faqAnswerBox: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  faqAnswerText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
  },
  faqSystemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  faqSystemBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  faqItemSeparator: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 4,
  },

  /* Architecture pipeline footer */
  architectureFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
  },
  architectureFooterText: {
    fontSize: 11,
    color: '#94A3B8',
  },

  btnDisabled: {
    opacity: 0.6,
  },
});
