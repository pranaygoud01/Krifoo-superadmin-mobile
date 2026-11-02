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
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  ArrowRight,
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
  discoverEpsonPrinters,
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
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
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

      // If Bluetooth printer is configured but lacks real deviceName (or has generic fallback),
      // resolve its actual name from paired/discovered devices
      if (
        cfg.connectionType === 'bluetooth' &&
        (cfg.macAddress || cfg.target) &&
        (!cfg.deviceName ||
          cfg.deviceName.includes('Star Micronics') ||
          cfg.deviceName.includes('Epson TM-m30') ||
          cfg.deviceName === 'Bluetooth Thermal Printer')
      ) {
        try {
          const currentTarget = (cfg.macAddress || cfg.target || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const devList = await discoverEpsonPrinters();
          const match = devList.find((d) => {
            const dTarget = (d.macAddress || d.target || d.id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            return dTarget && currentTarget && (dTarget === currentTarget || currentTarget.includes(dTarget) || dTarget.includes(currentTarget));
          });
          if (match && match.name) {
            cfg = await savePosPrinterConfig({ deviceName: match.name, printerName: match.name }, restaurantId);
          }
        } catch (e) {
          console.warn('[PrinterSettings] Auto-resolve device name error:', e);
        }
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
          deviceName: device.name,
          printerName: device.name,
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
          deviceName: device.name,
          printerName: device.name,
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
        deviceName: '',
        printerName: '',
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
      <Header
        title="Receipt Printing"
        showBackButton={true}
        rightAction={
          <TouchableOpacity
            style={styles.guideHeaderBtn}
            onPress={() => router.push('/printer-guide')}
            activeOpacity={0.75}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <HelpCircle size={24} color="#000000ff" />

          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollBody,
          {
            paddingHorizontal: isTablet ? 24 : 16,
            maxWidth: 840,
            alignSelf: 'center',
            width: '100%',
            paddingBottom: Math.max(insets.bottom + 24, 48),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
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
                        ? isTestingPrint || posConfig.autoPrint === false
                          ? styles.statusDotAmber
                          : styles.statusDotGreen
                        : styles.statusDotMuted,
                    ]}
                  />
                  <Text style={[styles.heroStatusText, !isConfigured && styles.heroStatusTextMuted]}>
                    {isConfigured
                      ? isTestingPrint
                        ? 'SENDING TEST PRINT...'
                        : posConfig.autoPrint === false
                          ? 'SAVED (OFFLINE / NOT CONNECTED)'
                          : 'CONNECTED & READY'
                      : 'NO PRINTER CONNECTED'}
                  </Text>
                </View>

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
                    {posConfig.deviceName || posConfig.printerName || arch.title}
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

              <View style={styles.faqItemSeparator} />

              {/* Accordion: iPad / iOS Network IP Printing Guide */}
              <TouchableOpacity
                style={styles.faqItem}
                onPress={() => setExpandedFaq(expandedFaq === 'ipad_ios' ? null : 'ipad_ios')}
                activeOpacity={0.7}
              >
                <View style={styles.faqQuestionRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8, flexWrap: 'wrap' }}>

                    <Text style={styles.faqQuestionText}>How to connect iPad / iPhone with Network IP?</Text>

                  </View>
                  {expandedFaq === 'ipad_ios' ? (
                    <ChevronUp size={16} color="#64748B" />
                  ) : (
                    <ChevronDown size={16} color="#94A3B8" />
                  )}
                </View>
                {expandedFaq === 'ipad_ios' && (
                  <View style={styles.faqAnswerBox}>
                    <Text style={[styles.faqAnswerText, { marginBottom: 12 }]}>
                      Network IP (Wi-Fi or Ethernet LAN) is the <Text style={{ fontWeight: '700', color: '#0F172A' }}>industry standard for iPad POS systems</Text> (Square, Toast, Lightspeed).
                    </Text>

                    {/* Step-by-Step Cards */}
                    <View style={styles.guideStepContainer}>
                      {/* Step 1 */}
                      <View style={styles.guideStepCard}>
                        <View style={styles.guideStepNumCircle}>
                          <Text style={styles.guideStepNumText}>1</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.guideStepHeading}>Connect Printer & iPad to the Same Wi-Fi</Text>
                          <Text style={styles.guideStepDetail}>
                            Plug an <Text style={{ fontWeight: '600', color: '#0F172A' }}>Ethernet (LAN) cable</Text> from the back of your thermal printer (Epson TM-m30II/III, Star, Munbyn) into your Wi-Fi router (or connect printer to Wi-Fi). Make sure your iPad is connected to that <Text style={{ fontWeight: '600', color: '#0F172A' }}>same Wi-Fi network</Text>.
                          </Text>
                        </View>
                      </View>

                      {/* Step 2 */}
                      <View style={styles.guideStepCard}>
                        <View style={styles.guideStepNumCircle}>
                          <Text style={styles.guideStepNumText}>2</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.guideStepHeading}>Print Printer's Self-Test IP Slip</Text>
                          <Text style={styles.guideStepDetail}>
                            Turn the printer power switch <Text style={{ fontWeight: '700', color: '#0F172A' }}>OFF</Text>. Press & hold the <Text style={{ fontWeight: '700', color: '#0F172A' }}>FEED</Text> button on the printer while switching power <Text style={{ fontWeight: '700', color: '#0F172A' }}>ON</Text>. Keep holding for 3 seconds until it prints a slip. Look for the line showing <Text style={{ fontWeight: '700', color: '#059669' }}>IP Address: 192.168.X.X</Text>.
                          </Text>
                        </View>
                      </View>

                      {/* Step 3 */}
                      <View style={styles.guideStepCard}>
                        <View style={styles.guideStepNumCircle}>
                          <Text style={styles.guideStepNumText}>3</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.guideStepHeading}>Enter IP in Setup Wizard</Text>
                          <Text style={styles.guideStepDetail}>
                            Tap <Text style={{ fontWeight: '600', color: '#0F172A' }}>Setup Wizard</Text> below and select <Text style={{ fontWeight: '600', color: '#059669' }}>Network IP (Wi-Fi / Ethernet)</Text>. Enter the IP from Step 2.{'\n'}
                            • <Text style={{ fontWeight: '600', color: '#0F172A' }}>Epson (TM-m30II, TM-m30III, TM-T88)</Text>: Set Port to <Text style={{ fontWeight: '700', color: '#059669' }}>8008</Text> (ePOS) or 9100.{'\n'}
                            • <Text style={{ fontWeight: '600', color: '#0F172A' }}>Star / Munbyn / Xprinter / Other</Text>: Set Port to <Text style={{ fontWeight: '700', color: '#059669' }}>9100</Text> (Raw ESC/POS).
                          </Text>
                        </View>
                      </View>

                      {/* Step 4 */}
                      <View style={styles.guideStepCard}>
                        <View style={styles.guideStepNumCircle}>
                          <Text style={styles.guideStepNumText}>4</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.guideStepHeading}>Verify & Test Print</Text>
                          <Text style={styles.guideStepDetail}>
                            Tap <Text style={{ fontWeight: '600', color: '#059669' }}>Verify & Run Test Print</Text>. The receipt will print immediately. Then tap <Text style={{ fontWeight: '700', color: '#0F172A' }}>Save & Start Printing</Text> to route all station orders automatically!
                          </Text>
                        </View>
                      </View>
                    </View>


                  </View>
                )}
              </TouchableOpacity>

              <View style={styles.faqItemSeparator} />

              {/* Accordion: SUNMI Built-in POS Terminals */}
              <TouchableOpacity
                style={styles.faqItem}
                onPress={() => setExpandedFaq(expandedFaq === 'sunmi_pos' ? null : 'sunmi_pos')}
                activeOpacity={0.7}
              >
                <View style={styles.faqQuestionRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8, flexWrap: 'wrap' }}>

                    <Text style={styles.faqQuestionText}>Using a SUNMI POS Terminal (Built-in Printer)?</Text>

                  </View>
                  {expandedFaq === 'sunmi_pos' ? (
                    <ChevronUp size={16} color="#64748B" />
                  ) : (
                    <ChevronDown size={16} color="#94A3B8" />
                  )}
                </View>
                {expandedFaq === 'sunmi_pos' && (
                  <View style={styles.faqAnswerBox}>
                    <Text style={[styles.faqAnswerText, { marginBottom: 10 }]}>
                      SUNMI terminals (such as the <Text style={{ fontWeight: '700', color: '#0F172A' }}>V2, V2s, V3 MIX, T2, T2 mini, and D2</Text>) are all-in-one Android POS devices with an integrated high-speed thermal printer head built directly into the tablet body.
                    </Text>

                    {/* Feature 1: Zero configuration */}
                    <View style={[styles.guideStepCard, { marginBottom: 8 }]}>
                      <View style={[styles.guideStepNumCircle, { backgroundColor: '#C2410C' }]}>
                        <Check size={12} color="#FFFFFF" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.guideStepHeading}>Zero Setup Required (Plug & Play)</Text>
                        <Text style={styles.guideStepDetail}>
                          When Krifoo Admin runs on a SUNMI device, the app automatically detects the internal printhead via native Android AIDL. No Bluetooth pairing, Wi-Fi IP address, or cables are needed.
                        </Text>
                      </View>
                    </View>

                    {/* Feature 2: Paper size guidance */}
                    <View style={[styles.guideStepCard, { marginBottom: 8 }]}>
                      <View style={[styles.guideStepNumCircle, { backgroundColor: '#C2410C' }]}>
                        <Text style={styles.guideStepNumText}>58</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.guideStepHeading}>Paper Roll Width Guidelines</Text>
                        <Text style={styles.guideStepDetail}>
                          • <Text style={{ fontWeight: '600', color: '#0F172A' }}>Handheld (V2, V2s, V3):</Text> Use 58mm compact roll (32 columns).{'\n'}
                          • <Text style={{ fontWeight: '600', color: '#0F172A' }}>Countertop (T2, T2 mini, D2):</Text> Use 80mm wide roll (48 columns) with automatic cutter.
                        </Text>
                      </View>
                    </View>

                    {/* Feature 3: iPad / External Device Notice */}
                    <View style={styles.guideStepCard}>
                      <View style={[styles.guideStepNumCircle, { backgroundColor: '#64748B' }]}>
                        <Info size={12} color="#FFFFFF" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.guideStepHeading}>Can an iPad or iPhone print to a SUNMI terminal?</Text>
                        <Text style={styles.guideStepDetail}>
                          No. A SUNMI terminal's built-in printer is wired to that specific Android hardware. To print from an iPad, connect an external printer (like an <Text style={{ fontWeight: '600', color: '#059669' }}>Epson TM-m30II / TM-m30III</Text>) via Network IP or AirPrint.
                        </Text>
                      </View>
                    </View>
                  </View>
                )}
              </TouchableOpacity>

              <View style={styles.faqItemSeparator} />

              {/* Accordion 5: Supported Printers & Series */}
              <TouchableOpacity
                style={styles.faqItem}
                onPress={() => setExpandedFaq(expandedFaq === 'supported_printers' ? null : 'supported_printers')}
                activeOpacity={0.7}
              >
                <View style={styles.faqQuestionRow}>
                  <Text style={styles.faqQuestionText}>Which Bluetooth & thermal printers are supported?</Text>
                  {expandedFaq === 'supported_printers' ? (
                    <ChevronUp size={16} color="#64748B" />
                  ) : (
                    <ChevronDown size={16} color="#94A3B8" />
                  )}
                </View>
                {expandedFaq === 'supported_printers' && (
                  <View style={styles.faqAnswerBox}>
                    <Text style={[styles.faqAnswerText, { marginBottom: 10 }]}>
                      Krifoo POS uses the universal <Text style={{ fontWeight: '700', color: '#0F172A' }}>ESC/POS</Text> command architecture and Epson <Text style={{ fontWeight: '700', color: '#0F172A' }}>ePOS</Text> protocol over Bluetooth (SPP & BLE), Wi-Fi/Ethernet, and built-in POS terminals. The following brands and series are verified and supported:
                    </Text>

                    {/* 1. Epson */}
                    <View style={styles.faqPrinterCategory}>
                      <View style={styles.faqCategoryHeader}>
                        <Text style={styles.faqCategoryTitle}>1. Epson TM Series</Text>
                        <View style={[styles.faqCategoryBadge, { backgroundColor: '#EFF6FF' }]}>
                          <Text style={[styles.faqCategoryBadgeText, { color: '#1D4ED8' }]}>RECOMMENDED</Text>
                        </View>
                      </View>
                      <Text style={styles.faqCategoryDesc}>
                        • <Text style={{ fontWeight: '600' }}>TM-m30 Series:</Text> TM-m30, TM-m30II, TM-m30II-H, TM-m30III (Bluetooth BLE/SPP & WiFi){'\n'}
                        • <Text style={{ fontWeight: '600' }}>TM-m10 & TM-m50:</Text> TM-m10 (Compact 58mm POS), TM-m50{'\n'}
                        • <Text style={{ fontWeight: '600' }}>TM-T88 Series:</Text> TM-T88VI-i, TM-T88VII (Bluetooth & Ethernet LAN){'\n'}
                        • <Text style={{ fontWeight: '600' }}>TM-T20 & TM-T82:</Text> TM-T20II, TM-T20III, TM-T20X, TM-T82II, TM-T82III{'\n'}
                        • <Text style={{ fontWeight: '600' }}>TM-U220 Series:</Text> TM-U220 (Impact/Dot-matrix kitchen printer){'\n'}
                        • <Text style={{ fontWeight: '600' }}>Mobile Series:</Text> TM-P20, TM-P60II, TM-P80
                      </Text>
                    </View>

                    {/* 2. Star Micronics */}
                    <View style={styles.faqPrinterCategory}>
                      <View style={styles.faqCategoryHeader}>
                        <Text style={styles.faqCategoryTitle}>2. Star Micronics Series</Text>

                      </View>
                      <Text style={styles.faqCategoryDesc}>
                        • <Text style={{ fontWeight: '600' }}>TSP100 / TSP143 Series:</Text> TSP143IIIBI, TSP100III Bluetooth{'\n'}
                        • <Text style={{ fontWeight: '600' }}>TSP650 Series:</Text> TSP654IIBI, TSP650II Bluetooth{'\n'}
                        • <Text style={{ fontWeight: '600' }}>mC-Print Series:</Text> mC-Print2 (MCP21LB), mC-Print3 (MCP31LB){'\n'}
                        • <Text style={{ fontWeight: '600' }}>mPOP Series:</Text> Combined Bluetooth receipt printer & cash drawer{'\n'}
                        • <Text style={{ fontWeight: '600' }}>SM Mobile Series:</Text> SM-L200, SM-S220i, SM-S230i, SM-T300i, SM-T400i
                      </Text>
                    </View>

                    {/* 3. Munbyn, Xprinter & Rongta */}
                    <View style={styles.faqPrinterCategory}>
                      <View style={styles.faqCategoryHeader}>
                        <Text style={styles.faqCategoryTitle}>3. Munbyn / Xprinter / Rongta</Text>

                      </View>
                      <Text style={styles.faqCategoryDesc}>
                        • <Text style={{ fontWeight: '600' }}>Xprinter 58mm & 80mm:</Text> XP-58, XP-58IIH, XP-N160I, XP-N160II, XP-C260, XP-C300, XP-Q90EC{'\n'}
                        • <Text style={{ fontWeight: '600' }}>Munbyn Series:</Text> ITPP047, ITPP068, ITPP964, ITPP082, IMP001, IMP002{'\n'}
                        • <Text style={{ fontWeight: '600' }}>Rongta Series:</Text> RP326, RP327, RP80, RPP02, RPP200, RPP300
                      </Text>
                    </View>

                    {/* 4. SUNMI POS Built-in */}
                    <View style={styles.faqPrinterCategory}>
                      <View style={styles.faqCategoryHeader}>
                        <Text style={styles.faqCategoryTitle}>4. SUNMI POS Built-in Terminals</Text>

                      </View>
                      <Text style={styles.faqCategoryDesc}>
                        • <Text style={{ fontWeight: '600' }}>Handheld Series:</Text> SUNMI V2, V2 Pro, V2s, V2s PLUS, V3 MIX (58mm roll){'\n'}
                        • <Text style={{ fontWeight: '600' }}>Countertop Series:</Text> SUNMI T2, T2 mini, T2s, D2, D2s, D3, K2 Kiosk (80mm roll)
                      </Text>
                    </View>

                    {/* 5. Generic Bluetooth ESC/POS */}
                    <View style={styles.faqPrinterCategory}>
                      <View style={styles.faqCategoryHeader}>
                        <Text style={styles.faqCategoryTitle}>5. Generic Desktop & Portable Bluetooth Printers</Text>
                      </View>
                      <Text style={styles.faqCategoryDesc}>
                        • <Text style={{ fontWeight: '600' }}>POS-58 Series (58mm):</Text> POS-5802DD, POS-5805DD, MPT-II, ZJ-5802, GOOJPRT PT-210, JP-58H{'\n'}
                        • <Text style={{ fontWeight: '600' }}>POS-80 Series (80mm):</Text> POS-8001, POS-8002, MPT-III, RP80, ZJ-8220, ZJ-8250{'\n'}
                        • <Text style={{ fontWeight: '600' }}>HOIN Series:</Text> HOP-E58, HOP-E801, HOP-E802
                      </Text>
                    </View>

                    {/* 6. Citizen & Bixolon */}
                    <View style={styles.faqPrinterCategory}>
                      <View style={styles.faqCategoryHeader}>
                        <Text style={styles.faqCategoryTitle}>6. Citizen & Bixolon</Text>
                      </View>
                      <Text style={styles.faqCategoryDesc}>
                        • <Text style={{ fontWeight: '600' }}>Citizen:</Text> CT-S310II, CT-S651, CMP-20II, CMP-30II{'\n'}
                        • <Text style={{ fontWeight: '600' }}>Bixolon & Sam4s:</Text> SRP-350plusIII, SRP-Q300, SPP-R200III/R310, Sam4s Giant-100
                      </Text>
                    </View>

                    {/* Specifications Box */}
                    <View style={[styles.faqSpecsBox, { marginTop: 12 }]}>
                      <Text style={styles.faqSpecsTitle}>Hardware Specifications & Capabilities</Text>
                      <Text style={styles.faqSpecsText}>
                        • <Text style={{ fontWeight: '700' }}>Paper Roll Sizes:</Text> 58mm (2-inch / 32 columns, default) & 80mm (3-inch / 48 columns){'\n'}
                        • <Text style={{ fontWeight: '700' }}>Bluetooth Modes:</Text> Classic Bluetooth SPP (Android) & Bluetooth Low Energy (BLE){'\n'}
                        • <Text style={{ fontWeight: '700' }}>Peripherals:</Text> Automatic Paper Cut (Full/Partial) and RJ11/RJ12 Cash Drawer Kick (Pins 1 & 2)
                      </Text>
                    </View>
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
        onComplete={(newCfg, isVerified = true) => {
          setPosConfig(newCfg);
          loadActiveTemplate();
          if (isVerified) {
            showToast({
              title: 'Printer Ready',
              message: 'Your printer has been successfully connected and tested.',
              type: 'success',
            });
          } else {
            showToast({
              title: 'Printer Saved (Offline)',
              message: 'Configuration saved. Power ON your printer to start automatic printing.',
              type: 'warning',
            });
          }
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

  const resolvedName = config.deviceName || config.printerName || (profile as any)?.deviceName;

  switch (profile.connectionType) {
    case 'network_epos':
      return {
        title: resolvedName || (config.brand === 'epson' ? 'Epson TM-m30 / TM-T88 Network' : 'Network ePOS Printer'),
        transportBadge: 'Wi-Fi / LAN (Port 8008)',
        targetSummary: `IP: ${profile.ipAddress}:${profile.port || 8008}`,
        encoderName: 'EposXmlEncoder',
        transportName: 'HttpEposTransport (Cached)',
        classifierName: 'classifyEposXmlResult',
      };
    case 'network_raw':
      return {
        title: resolvedName || 'Universal ESC/POS Network Printer',
        transportBadge: 'Wi-Fi / LAN (Port 9100)',
        targetSummary: `IP: ${profile.ipAddress}:${profile.port || 9100}`,
        encoderName: 'EscPosEncoder',
        transportName: 'TcpSocketTransport',
        classifierName: 'classifyRawByteResult',
      };
    case 'ble':
      return {
        title: resolvedName || 'Bluetooth Low Energy Printer',
        transportBadge: 'Bluetooth Low Energy (BLE)',
        targetSummary: `MAC: ${profile.macAddress}`,
        encoderName: 'EscPosEncoder',
        transportName: 'BleTransport',
        classifierName: 'classifyRawByteResult',
      };
    case 'spp':
      return {
        title: resolvedName || 'Bluetooth Thermal Printer',
        transportBadge: 'Bluetooth Classic (SPP)',
        targetSummary: `${profile.target || profile.macAddress}`,
        encoderName: 'EscPosEncoder',
        transportName: 'SppTransport',
        classifierName: 'classifyRawByteResult',
      };
    case 'builtin':
      return {
        title: resolvedName || 'Sunmi POS Integrated Printer',
        transportBadge: 'Sunmi Hardware AIDL',
        targetSummary: 'Sunmi Internal Printer Service',
        encoderName: 'Direct Sunmi Native',
        transportName: 'SunmiTransport',
        classifierName: 'classifyRawByteResult',
      };
    case 'system':
      return {
        title: resolvedName || 'System Print Spooler',
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
    height: 48,
    minHeight: 48,
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
    height: 48,
    minHeight: 48,
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
    height: 44,
    minHeight: 44,
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
  faqPrinterCategory: {
    marginTop: 10,
    marginBottom: 4,
  },
  faqCategoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  faqCategoryTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  faqCategoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  faqCategoryBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  faqCategoryDesc: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 18,
    paddingLeft: 2,
  },
  faqSpecsBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 6,
  },
  faqSpecsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  faqSpecsText: {
    fontSize: 11,
    color: '#334155',
    lineHeight: 17,
  },

  /* iPad Network IP Step-by-Step Guide styles */
  faqCategoryBadgeIpad: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  faqCategoryBadgeIpadText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#065F46',
    letterSpacing: 0.3,
  },
  guideStepContainer: {
    gap: 8,
    marginTop: 6,
    marginBottom: 12,
  },
  guideStepCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    gap: 10,
  },
  guideStepNumCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  guideStepNumText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  guideStepHeading: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 3,
  },
  guideStepDetail: {
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 17,
  },
  guideLaunchWizardBtn: {
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 4,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  guideLaunchWizardBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
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
  guideHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 6,
  },
  guideHeaderBtnText: {
    fontSize: 12,
    fontFamily: 'InterTight_600SemiBold',
    color: '#059669',
    marginLeft: 4,
  },
});
