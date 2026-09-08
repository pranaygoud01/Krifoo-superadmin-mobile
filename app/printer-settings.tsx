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
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
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
} from 'lucide-react-native';
import {
  printSampleThermalReceipt,
  isAutoPrintEnabled,
  setAutoPrintEnabled,
  getPosPrinterConfig,
  savePosPrinterConfig,
  POS_BRANDS,
  testEpsonPrinter,
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

export default function PrinterSettingsScreen() {
  const router = useRouter();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{ restaurantId?: string }>();
  const restaurantId = params.restaurantId;

  // Master switch (Uber Eats mechanism: Receipt printing enabled)
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
  const [isTestingDrawer, setIsTestingDrawer] = useState(false);
  const [showBtModal, setShowBtModal] = useState(false);
  const [isSunmiHardware, setIsSunmiHardware] = useState<boolean | null>(null);

  // Fetch initial config and check hardware
  useEffect(() => {
    getPosPrinterConfig(restaurantId).then((cfg) => {
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

  // Select Connection Mode (Uber Eats connection mechanism)
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
    showToast({
      title: 'Printer Disconnected',
      message: 'The printer has been removed from this station.',
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
    const updated = await savePosPrinterConfig({ paperWidth: width }, restaurantId);
    setPosConfig(updated);
    showToast({ title: 'Paper Roll Updated', message: `Format set to ${width}`, type: 'info' });
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

  // Test actions
  const handleTestPrint = async () => {
    if (!isConfigured) {
      showToast({
        title: 'No Printer Connected',
        message: 'Please search for or connect a printer before running a test.',
        type: 'error',
      });
      return;
    }

    setIsTestingPrint(true);
    showToast({ title: 'Testing Printer', message: 'Sending test receipt...', type: 'info' });
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
        showToast({ title: 'Cash Drawer Kicked', message: 'Drawer kick signal acknowledged', type: 'success' });
      } else {
        showToast({ title: 'Drawer Notice', message: 'Could not pulse cash drawer. Check printer connection.', type: 'info' });
      }
    } finally {
      setIsTestingDrawer(false);
    }
  };

  const arch = getArchitectureDetails(posConfig, activeProfile);

  return (
    <View style={styles.container}>
      <Header title="Receipt printing" showBackButton={true} />

      <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
        {/* ========================================================================= */}
        {/* UBER EATS MASTER TOGGLE: Receipt printing enabled                         */}
        {/* ========================================================================= */}
        <View style={styles.uberCard}>
          <View style={styles.masterRow}>
            <View style={styles.masterIconCircle}>
              <Printer size={22} color={receiptPrintingEnabled ? Colors.primary : Colors.textMuted} />
            </View>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.masterTitle}>Receipt printing</Text>
              <Text style={styles.masterSubtitle}>
                {receiptPrintingEnabled ? 'Receipt printing is enabled for this station' : 'Receipt printing is turned off'}
              </Text>
            </View>
            <Switch
              value={receiptPrintingEnabled}
              onValueChange={handleToggleMasterPrinting}
              trackColor={{ false: Colors.cardBorder, true: '#10B981' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Receipt Customization Banner */}
        <TouchableOpacity
          style={styles.customizationBannerCard}
          onPress={() =>
            router.push({
              pathname: '/receipt-customization',
              params: restaurantId ? { restaurantId } : {},
            })
          }
          activeOpacity={0.85}
        >
          <View style={styles.customizationIconContainer}>
            <Sparkles size={20} color="#FF5C39" />
          </View>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.customizationTitle}>Receipt Templates</Text>
              <View style={styles.customizationNewBadge}>
                <Text style={styles.customizationNewBadgeText}>CUSTOMIZE</Text>
              </View>
            </View>
            {/* <Text style={styles.customizationSubtitle}>
              Personalize layout, fonts, logo, alignments, QR code & custom messages
            </Text> */}
          </View>
          <ChevronRight size={18} color="#94A3B8" />
        </TouchableOpacity>

        {receiptPrintingEnabled && (
          <>
            {/* ========================================================================= */}
            {/* UBER EATS CONNECTED PRINTER SECTION                                      */}
            {/* ========================================================================= */}
            <View style={styles.sectionBlock}>
              <Text style={styles.uberSectionHeader}>CONNECTED PRINTER</Text>

              {isConfigured ? (
                /* Connected State Card */
                <View style={styles.connectedPrinterCard}>
                  <View style={styles.connectedTopRow}>
                    <View style={styles.connectedIconBox}>
                      <Printer size={24} color="#10B981" />
                    </View>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={styles.greenPulseDot} />
                        <Text style={styles.connectedStatusText}>Connected</Text>
                      </View>
                      <Text style={styles.connectedPrinterName} numberOfLines={1}>
                        {arch.title}
                      </Text>
                      <Text style={styles.connectedDetailsText} numberOfLines={1}>
                        {arch.transportBadge} • {arch.targetSummary}
                      </Text>
                    </View>
                  </View>

                  {/* Uber Eats Action Row on Connected Card */}
                  <View style={styles.connectedActionRow}>
                    <TouchableOpacity
                      style={styles.uberTestBtn}
                      onPress={handleTestPrint}
                      disabled={isTestingPrint}
                      activeOpacity={0.8}
                    >
                      {isTestingPrint ? (
                        <ActivityIndicator size="small" color={Colors.text} />
                      ) : (
                        <>
                          <Printer size={15} color={Colors.text} />
                          <Text style={styles.uberTestBtnText}>Test print receipt</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.uberDisconnectBtn}
                      onPress={handleDisconnectPrinter}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.uberDisconnectBtnText}>Disconnect</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                /* Not Connected Card with "Search for printer" */
                <View style={styles.notConnectedCard}>
                  <View style={styles.notConnectedTopRow}>
                    <View style={styles.notConnectedIconBox}>
                      <Printer size={24} color={Colors.textMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={styles.grayDot} />
                        <Text style={styles.notConnectedStatusText}>No printer connected</Text>
                      </View>
                      <Text style={styles.notConnectedSub}>
                        Connect your Bluetooth or local network receipt printer.
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.uberPrimaryBtn}
                    onPress={() => setShowBtModal(true)}
                    activeOpacity={0.8}
                  >
                    <Search size={16} color="#FFFFFF" />
                    <Text style={styles.uberPrimaryBtnText}>Search for Printer</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* ========================================================================= */}
            {/* UBER EATS CONNECTION METHODS (Select or Change Connection)                */}
            {/* ========================================================================= */}
            <View style={styles.sectionBlock}>
              <Text style={styles.uberSectionHeader}>CONNECT A PRINTER</Text>

              <View style={styles.uberCardGroup}>
                {/* 1. Bluetooth Wireless (Recommended for TM-m30 / Star TSP143) */}
                <TouchableOpacity
                  style={styles.uberListRow}
                  onPress={() => handleSelectConnectionType('bluetooth')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.methodIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.1)' }]}>
                    <Bluetooth size={18} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.methodTitle}>Bluetooth Printer</Text>
                      <View style={styles.recBadgePill}>
                        <Text style={styles.recBadgePillText}>RECOMMENDED</Text>
                      </View>
                    </View>
                    <Text style={styles.methodSubtitle}>
                      {posConfig.connectionType === 'bluetooth' && (posConfig.target || posConfig.macAddress)
                        ? `Connected: ${posConfig.target || posConfig.macAddress}`
                        : 'Epson TM-m30, Star Micronics TSP143 & portable wireless'}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={Colors.textMuted} />
                </TouchableOpacity>

                {/* 2. Network (LAN / Wi-Fi IP) */}
                <TouchableOpacity
                  style={styles.uberListRow}
                  onPress={() => {
                    handleSelectConnectionType('network');
                    setShowIpSetup(true);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.methodIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                    <Wifi size={18} color="#059669" />
                  </View>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.methodTitle}>Network IP (Ethernet / Wi-Fi)</Text>
                    <Text style={styles.methodSubtitle}>
                      {posConfig.connectionType === 'network' && posConfig.ipAddress
                        ? `Connected IP: ${posConfig.ipAddress}:${posConfig.port}`
                        : 'Epson ePOS (Port 8008) or Universal ESC/POS (Port 9100)'}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={Colors.textMuted} />
                </TouchableOpacity>

                {/* 3. Sunmi Built-in POS Terminal */}
                <TouchableOpacity
                  style={styles.uberListRow}
                  onPress={() => handleSelectConnectionType('builtin')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.methodIconBox, { backgroundColor: 'rgba(255, 92, 57, 0.1)' }]}>
                    <Smartphone size={18} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.methodTitle}>Built-in Terminal</Text>
                    <Text style={styles.methodSubtitle}>
                      {isSunmiHardware ? 'Sunmi POS internal high-speed printer ready' : 'Sunmi Android POS devices (V2, T2, V3 MIX)'}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={Colors.textMuted} />
                </TouchableOpacity>

                {/* 4. AirPrint / System Spooler */}
                <TouchableOpacity
                  style={[styles.uberListRow, { borderBottomWidth: 0 }]}
                  onPress={() => handleSelectConnectionType('system')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.methodIconBox, { backgroundColor: 'rgba(100, 116, 139, 0.1)' }]}>
                    <FileText size={18} color="#475569" />
                  </View>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.methodTitle}>System Spooler (AirPrint / PDF)</Text>
                    <Text style={styles.methodSubtitle}>Standard iOS AirPrint & Android print sheet</Text>
                  </View>
                  <ChevronRight size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Collapsible Network IP Setup Form */}
              {showIpSetup && (
                <View style={styles.ipSetupBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <Text style={styles.ipSetupTitle}>Configure Network Printer IP</Text>
                    <TouchableOpacity onPress={() => setShowIpSetup(false)}>
                      <Text style={styles.cancelLinkText}>Close</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 3 }}>
                      <Text style={styles.inputMiniLabel}>Printer IP Address</Text>
                      <TextInput
                        style={styles.uberTextInput}
                        value={printerIpInput}
                        onChangeText={setPrinterIpInput}
                        placeholder="e.g. 192.168.1.100"
                        placeholderTextColor={Colors.textSubtle}
                        keyboardType="decimal-pad"
                        autoCapitalize="none"
                      />
                    </View>
                    <View style={{ flex: 1.3 }}>
                      <Text style={styles.inputMiniLabel}>Port</Text>
                      <TextInput
                        style={styles.uberTextInput}
                        value={printerPortInput}
                        onChangeText={setPrinterPortInput}
                        placeholder="9100 / 8008"
                        placeholderTextColor={Colors.textSubtle}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    <TouchableOpacity
                      style={styles.scanSecondaryBtn}
                      onPress={() => setShowBtModal(true)}
                      activeOpacity={0.7}
                    >
                      <Search size={14} color={Colors.text} />
                      <Text style={styles.scanSecondaryBtnText}>Auto-Discover</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.savePrimaryBtn}
                      onPress={handleSaveNetworkSettings}
                      disabled={isSaving}
                      activeOpacity={0.8}
                    >
                      {isSaving ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.savePrimaryBtnText}>Save & Connect</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* ========================================================================= */}
            {/* UBER EATS PRINTING PREFERENCES                                           */}
            {/* ========================================================================= */}
            <View style={styles.sectionBlock}>
              <Text style={styles.uberSectionHeader}>ORDER PRINTING PREFERENCES</Text>

              <View style={styles.uberCardGroup}>
                {/* Auto-print orders toggle */}
                <View style={styles.preferenceRow}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.prefTitle}>Auto-print orders</Text>
                    <Text style={styles.prefSubtitle}>Print receipt automatically when an order arrives</Text>
                  </View>
                  <Switch
                    value={posConfig.autoPrint}
                    onValueChange={handleToggleAutoPrint}
                    trackColor={{ false: Colors.cardBorder, true: '#10B981' }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                {/* Copies per order */}
                <View style={styles.preferenceRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.prefTitle}>Number of copies</Text>
                    <Text style={styles.prefSubtitle}>1 copy (Kitchen) or 2 copies (Kitchen + Customer)</Text>
                  </View>
                  <View style={styles.segmentGroup}>
                    <TouchableOpacity
                      style={[styles.segmentBtn, posConfig.copies === 1 && styles.segmentBtnActive]}
                      onPress={() => handleSetCopies(1)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.segmentText, posConfig.copies === 1 && styles.segmentTextActive]}>1 copy</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.segmentBtn, posConfig.copies === 2 && styles.segmentBtnActive]}
                      onPress={() => handleSetCopies(2)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.segmentText, posConfig.copies === 2 && styles.segmentTextActive]}>2 copies</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Paper Roll Width */}
                <View style={styles.preferenceRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.prefTitle}>Paper roll width</Text>
                    <Text style={styles.prefSubtitle}>Standard 80mm roll or compact 58mm roll</Text>
                  </View>
                  <View style={styles.segmentGroup}>
                    <TouchableOpacity
                      style={[styles.segmentBtn, posConfig.paperWidth === '80mm' && styles.segmentBtnActive]}
                      onPress={() => handleSetPaperWidth('80mm')}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.segmentText, posConfig.paperWidth === '80mm' && styles.segmentTextActive]}>80mm</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.segmentBtn, posConfig.paperWidth === '58mm' && styles.segmentBtnActive]}
                      onPress={() => handleSetPaperWidth('58mm')}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.segmentText, posConfig.paperWidth === '58mm' && styles.segmentTextActive]}>58mm</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Auto-cut receipt */}
                <View style={styles.preferenceRow}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.prefTitle}>Cut receipt</Text>
                    <Text style={styles.prefSubtitle}>Automatically cut paper after each receipt is printed</Text>
                  </View>
                  <Switch
                    value={posConfig.autoCut}
                    onValueChange={handleToggleAutoCut}
                    trackColor={{ false: Colors.cardBorder, true: '#10B981' }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                {/* Open cash drawer */}
                <View style={[styles.preferenceRow, { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.prefTitle}>Open cash drawer</Text>
                    <Text style={styles.prefSubtitle}>Kick drawer open when order payment is cash</Text>
                  </View>
                  <Switch
                    value={posConfig.openCashDrawer}
                    onValueChange={handleToggleCashDrawer}
                    trackColor={{ false: Colors.cardBorder, true: '#10B981' }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>
            </View>

            {/* ========================================================================= */}
            {/* TESTING & CASH DRAWER CONTROLS                                           */}
            {/* ========================================================================= */}
            <View style={styles.sectionBlock}>
              <Text style={styles.uberSectionHeader}>TESTING & HARDWARE TOOLS</Text>

              <View style={styles.uberCardGroup}>
                <TouchableOpacity
                  style={styles.uberActionRow}
                  onPress={handleTestPrint}
                  disabled={isTestingPrint}
                  activeOpacity={0.7}
                >
                  <View style={styles.actionIconBox}>
                    <Printer size={18} color={Colors.text} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionRowTitle}>Test print receipt</Text>
                    <Text style={styles.actionRowSubtitle}>Send a sample order ticket to verify printer output</Text>
                  </View>
                  {isTestingPrint ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <ChevronRight size={18} color={Colors.textMuted} />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.uberActionRow, { borderBottomWidth: 0 }]}
                  onPress={handleOpenCashDrawerTest}
                  disabled={isTestingDrawer}
                  activeOpacity={0.7}
                >
                  <View style={styles.actionIconBox}>
                    <DollarSign size={18} color={Colors.text} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionRowTitle}>Test cash drawer</Text>
                    <Text style={styles.actionRowSubtitle}>Send drawer pulse without printing paper</Text>
                  </View>
                  {isTestingDrawer ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <ChevronRight size={18} color={Colors.textMuted} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* ========================================================================= */}
            {/* UBER EATS TROUBLESHOOTING & HELP ACCORDION                                */}
            {/* ========================================================================= */}
            <View style={styles.sectionBlock}>
              <Text style={styles.uberSectionHeader}>TROUBLESHOOTING & HELP</Text>

              <View style={styles.uberCardGroup}>
                {/* 1. Star Micronics Pairing */}
                <TouchableOpacity
                  style={styles.faqRow}
                  onPress={() => setExpandedFaq(expandedFaq === 'star' ? null : 'star')}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.faqQuestion}>How to pair Star Micronics printers</Text>
                  </View>
                  {expandedFaq === 'star' ? <ChevronUp size={18} color={Colors.textMuted} /> : <ChevronDown size={18} color={Colors.textMuted} />}
                </TouchableOpacity>
                {expandedFaq === 'star' && (
                  <View style={styles.faqAnswerBox}>
                    <Text style={styles.faqAnswerText}>
                      1. Turn ON your Star printer.{'\n'}
                      2. Locate the red PAIR button on the back of the device.{'\n'}
                      3. Press and hold the PAIR button for 5 seconds until the green LED flashes.{'\n'}
                      4. Open tablet Bluetooth settings and pair with your printer, then tap "Search for Printer" above.
                    </Text>
                  </View>
                )}

                {/* 2. Epson TM-m30 Pairing */}
                <TouchableOpacity
                  style={styles.faqRow}
                  onPress={() => setExpandedFaq(expandedFaq === 'epson' ? null : 'epson')}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.faqQuestion}>How to connect Epson TM-m30 printers</Text>
                  </View>
                  {expandedFaq === 'epson' ? <ChevronUp size={18} color={Colors.textMuted} /> : <ChevronDown size={18} color={Colors.textMuted} />}
                </TouchableOpacity>
                {expandedFaq === 'epson' && (
                  <View style={styles.faqAnswerBox}>
                    <Text style={styles.faqAnswerText}>
                      • Bluetooth: Make sure Bluetooth is turned ON in your tablet settings. Tap "Search for Printer" above and select your TM-m30.{'\n'}
                      • Wi-Fi / Ethernet: Ensure your printer and tablet are on the same Wi-Fi network. Tap "Network IP", enter your printer's IP, and tap Save & Connect.
                    </Text>
                  </View>
                )}

                {/* 3. Paper Roll Direction */}
                <TouchableOpacity
                  style={[styles.faqRow, { borderBottomWidth: 0 }]}
                  onPress={() => setExpandedFaq(expandedFaq === 'paper' ? null : 'paper')}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.faqQuestion}>How to load thermal paper roll</Text>
                  </View>
                  {expandedFaq === 'paper' ? <ChevronUp size={18} color={Colors.textMuted} /> : <ChevronDown size={18} color={Colors.textMuted} />}
                </TouchableOpacity>
                {expandedFaq === 'paper' && (
                  <View style={styles.faqAnswerBox}>
                    <Text style={styles.faqAnswerText}>
                      Thermal paper must feed from the BOTTOM of the roll (facing upward). If the paper is loaded backwards, receipts will feed blank without any printed text.
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Architecture Pipeline Summary Badge (Subtle footer) */}
            <View style={styles.architectureFooter}>
              <Layers size={13} color={Colors.textMuted} />
              <Text style={styles.architectureFooterText}>
                5-Layer Pipeline: {arch.encoderName} → {arch.transportName}
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Bluetooth / Network Discovery Modal */}
      <BluetoothPrinterModal
        visible={showBtModal}
        activeTarget={posConfig.target || posConfig.macAddress || posConfig.ipAddress}
        onClose={() => setShowBtModal(false)}
        onSelectPrinter={handlePairDevice}
      />
    </View>
  );
}

// Helper to compute architecture details from profile
function getArchitectureDetails(config: PosPrinterConfig, profile: PrinterProfile | null) {
  if (!profile) {
    return {
      title: 'No Printer Connected',
      transportBadge: 'Not connected',
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
        transportBadge: 'Local Network (Wi-Fi/LAN)',
        targetSummary: `IP: ${profile.ipAddress}:${profile.port || 8008}`,
        encoderName: 'EposXmlEncoder',
        transportName: 'HttpEposTransport (Cached)',
        classifierName: 'classifyEposXmlResult',
      };
    case 'network_raw':
      return {
        title: 'Universal ESC/POS Network Printer',
        transportBadge: 'Local Network (Port 9100)',
        targetSummary: `IP: ${profile.ipAddress}:${profile.port}`,
        encoderName: 'EscPosEncoder',
        transportName: 'TcpSocketTransport',
        classifierName: 'classifyRawByteResult',
      };
    case 'ble':
      return {
        title: 'Epson TM-m30 / TM-m10 Bluetooth',
        transportBadge: 'Bluetooth Wireless (BLE)',
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
        transportBadge: 'Internal Hardware',
        targetSummary: 'Sunmi AIDL Native Service',
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
    backgroundColor: '#F6F6F6', // Uber Eats signature soft merchant gray background
  },
  scrollBody: {
    padding: 16,
    paddingBottom: 48,
  },

  /* Master Switch Card */
  uberCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  masterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  masterIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  masterTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  masterSubtitle: {
    fontSize: 12.5,
    color: '#6B7280',
    marginTop: 2,
  },

  /* Section Headers (Uber Eats Uppercase tracking) */
  sectionBlock: {
    marginBottom: 20,
  },
  uberSectionHeader: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#6B7280',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  uberCardGroup: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    overflow: 'hidden',
  },

  /* Connected Printer Card (Uber Eats style) */
  connectedPrinterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  connectedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  connectedIconBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  greenPulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  connectedStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
  },
  connectedPrinterName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
    marginTop: 1,
  },
  connectedDetailsText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  connectedActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  uberTestBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F3F4F6',
    paddingVertical: 10,
    borderRadius: 8,
  },
  uberTestBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000000',
  },
  uberDisconnectBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
  },
  uberDisconnectBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#EF4444',
  },

  /* Not Connected Card */
  notConnectedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  notConnectedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  notConnectedIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  grayDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#9CA3AF',
  },
  notConnectedStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  notConnectedSub: {
    fontSize: 12.5,
    color: '#4B5563',
    marginTop: 2,
  },
  uberPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#000000', // Uber signature black button
    paddingVertical: 12,
    borderRadius: 8,
  },
  uberPrimaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  /* Connection Method List Rows (Uber Eats style) */
  uberListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  methodIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  methodTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
  },
  recBadgePill: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  recBadgePillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#4F46E5',
  },
  methodSubtitle: {
    fontSize: 11.5,
    color: '#6B7280',
    marginTop: 2,
  },

  /* IP Setup Expandable Box */
  ipSetupBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  ipSetupTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000000',
  },
  cancelLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  inputMiniLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  uberTextInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#000000',
  },
  scanSecondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F3F4F6',
    paddingVertical: 10,
    borderRadius: 8,
  },
  scanSecondaryBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#000000',
  },
  savePrimaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#000000',
    paddingVertical: 10,
    borderRadius: 8,
  },
  savePrimaryBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  /* Preferences Rows */
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  prefTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#000000',
  },
  prefSubtitle: {
    fontSize: 11.5,
    color: '#6B7280',
    marginTop: 2,
  },
  segmentGroup: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 3,
  },
  segmentBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  segmentBtnActive: {
    backgroundColor: '#000000',
  },
  segmentText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#6B7280',
  },
  segmentTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  /* Action Rows */
  uberActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 12,
  },
  actionIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionRowTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#000000',
  },
  actionRowSubtitle: {
    fontSize: 11.5,
    color: '#6B7280',
    marginTop: 2,
  },

  /* Troubleshooting FAQ */
  faqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  faqQuestion: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  faqAnswerBox: {
    backgroundColor: '#F9FAFB',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  faqAnswerText: {
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 18,
  },

  /* Architecture Footer */
  architectureFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 18,
  },
  architectureFooterText: {
    fontSize: 11,
    color: '#9CA3AF',
  },

  /* Customization Banner */
  customizationBannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#cfcfcf',
    marginBottom: 16,
  },
  customizationIconContainer: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#FFF1EE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  customizationTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  customizationNewBadge: {
    backgroundColor: '#FFF1EE',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  customizationNewBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FF5C39',
  },
  customizationSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
});
