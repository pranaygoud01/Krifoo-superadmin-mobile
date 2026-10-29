import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  TextInput,
  ScrollView,
  Platform,
  Linking,
  KeyboardAvoidingView,
  Keyboard,
  Animated,
  Easing,
  Alert,
  PermissionsAndroid,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import {
  Printer,
  Bluetooth,
  Wifi,
  Smartphone,
  FileText,
  CheckCircle2,
  X,
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  Scissors,
  DollarSign,
  Sparkles,
  ExternalLink,
  Sliders,
  Check,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react-native';
import {
  discoverEpsonPrinters,
  testEpsonPrinter,
  isSunmiAvailable,
  savePosPrinterConfig,
  verifyPrinterConnection,
  formatPrinterConnectionError,
  isLikelyAudioDevice,
} from '../services/thermal-print.service';
import { PosPrinterConfig, PosBrand, PosConnectionType } from '../services/pos-config.service';
import {
  getAllReceiptTemplates,
  getActiveReceiptTemplate,
  saveReceiptTemplate,
  ReceiptTemplate,
} from '../services/receipt-customization.service';

export interface PrinterSetupWizardModalProps {
  visible: boolean;
  onClose: () => void;
  restaurantId?: string;
  currentConfig: PosPrinterConfig;
  onComplete: (newConfig: PosPrinterConfig, isVerified?: boolean) => void;
}

export function PrinterSetupWizardModal({
  visible,
  onClose,
  restaurantId,
  currentConfig,
  onComplete,
}: PrinterSetupWizardModalProps) {
  const insets = useSafeAreaInsets();
  // Safe top padding ensuring status bar clearance on all iOS and Android devices
  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 24
  );

  // Wizard Step: 1 = Choose Type, 2 = Find & Connect, 3 = Preferences & Test
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Selected connection type in wizard: default to network on iOS, bluetooth on Android
  const [selectedType, setSelectedType] = useState<PosConnectionType>(
    currentConfig.connectionType || (Platform.OS === 'ios' ? 'network' : 'bluetooth')
  );

  // Discovered devices & scanning
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<Array<{ id: string; name: string; connectionType: 'bluetooth' | 'network'; target?: string; ipAddress?: string; macAddress?: string }>>([]);
  const [selectedDevice, setSelectedDevice] = useState<{ id: string; name: string; target?: string; ipAddress?: string; macAddress?: string } | null>(null);

  // Nearby devices permission state (Android)
  const [hasNearbyPermission, setHasNearbyPermission] = useState<boolean | null>(null);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [isBluetoothDisabled, setIsBluetoothDisabled] = useState(false);

  // Manual IP inputs
  const [ipInput, setIpInput] = useState(currentConfig.ipAddress || '');
  const [portInput, setPortInput] = useState(String(currentConfig.port || 9100));

  // Manual Bluetooth target input
  const [manualBtInput, setManualBtInput] = useState(currentConfig.target || '');
  const [showManualBtToggle, setShowManualBtToggle] = useState(false);

  // Step 3 Preferences (Default to 58mm paper roll size)
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>(currentConfig.paperWidth || '58mm');
  const [copies, setCopies] = useState<number>(currentConfig.copies || 1);
  const [autoCut, setAutoCut] = useState<boolean>(currentConfig.autoCut ?? true);
  const [autoPrint, setAutoPrint] = useState<boolean>(currentConfig.autoPrint ?? true);
  const [openCashDrawer, setOpenCashDrawer] = useState<boolean>(currentConfig.openCashDrawer ?? true);

  // Template dropdown state
  const [templates, setTemplates] = useState<ReceiptTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ReceiptTemplate | null>(null);
  const [isTemplateDropdownOpen, setIsTemplateDropdownOpen] = useState(false);

  // Live Bluetooth Connection Verification State
  const [isVerifyingConnection, setIsVerifyingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    checked: boolean;
    success: boolean;
    message: string;
    rawError?: string;
  } | null>(null);

  // Testing status
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  // Auto-manage keyboard offset so inputs are never covered
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardOffset(e.endCoordinates.height);
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 120);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardOffset(0);
      }
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Scanning radar and rotating sweep animations
  const pulseAnim1 = useRef(new Animated.Value(0)).current;
  const pulseAnim2 = useRef(new Animated.Value(0)).current;
  const sweepAnim = useRef(new Animated.Value(0)).current;
  const centerPulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let animLoop: Animated.CompositeAnimation | null = null;
    let sweepLoop: Animated.CompositeAnimation | null = null;
    let centerLoop: Animated.CompositeAnimation | null = null;

    if (isScanning) {
      pulseAnim1.setValue(0);
      pulseAnim2.setValue(0);
      sweepAnim.setValue(0);
      centerPulseAnim.setValue(1);

      // Radar concentric waves
      animLoop = Animated.loop(
        Animated.parallel([
          Animated.timing(pulseAnim1, {
            toValue: 1,
            duration: 1800,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.delay(900),
            Animated.timing(pulseAnim2, {
              toValue: 1,
              duration: 1800,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        ])
      );

      // 360-degree continuous radar sweep beam
      sweepLoop = Animated.loop(
        Animated.timing(sweepAnim, {
          toValue: 1,
          duration: 2200,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );

      // Breathing beacon center icon
      centerLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(centerPulseAnim, {
            toValue: 1.14,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(centerPulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );

      animLoop.start();
      sweepLoop.start();
      centerLoop.start();
    } else {
      pulseAnim1.setValue(0);
      pulseAnim2.setValue(0);
      sweepAnim.setValue(0);
      centerPulseAnim.setValue(1);
    }

    return () => {
      animLoop?.stop();
      sweepLoop?.stop();
      centerLoop?.stop();
    };
  }, [isScanning]);

  const pulseScale1 = pulseAnim1.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 2.3],
  });
  const pulseOpacity1 = pulseAnim1.interpolate({
    inputRange: [0, 0.2, 0.8, 1],
    outputRange: [0, 0.75, 0.3, 0],
  });

  const pulseScale2 = pulseAnim2.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 2.3],
  });
  const pulseOpacity2 = pulseAnim2.interpolate({
    inputRange: [0, 0.2, 0.8, 1],
    outputRange: [0, 0.75, 0.3, 0],
  });

  const sweepAngle = sweepAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const miniPulseScale = pulseAnim1.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 2.3],
  });
  const miniPulseOpacity = pulseAnim1.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0.85, 0.4, 0],
  });

  useEffect(() => {
    if (visible) {
      setStep(1);
      setSelectedType(currentConfig.connectionType || 'bluetooth');
      setPaperWidth(currentConfig.paperWidth || '58mm');
      setCopies(currentConfig.copies || 1);
      setAutoCut(currentConfig.autoCut ?? true);
      setAutoPrint(currentConfig.autoPrint ?? true);
      setOpenCashDrawer(currentConfig.openCashDrawer ?? true);
      setIpInput(currentConfig.ipAddress || '');
      setPortInput(String(currentConfig.port || 9100));
      setTestResult(null);
      setIsTemplateDropdownOpen(false);
      setHasNearbyPermission(null);
      setIsRequestingPermission(false);
      setIsBluetoothDisabled(false);

      // Load available receipt templates & current active template
      getAllReceiptTemplates(restaurantId).then((allTpls) => {
        setTemplates(allTpls);
        getActiveReceiptTemplate(restaurantId).then((activeTpl) => {
          setSelectedTemplate(activeTpl);
          if (activeTpl?.layout?.paperWidth) {
            setPaperWidth(activeTpl.layout.paperWidth);
          }
        });
      });

      if (currentConfig.target || currentConfig.macAddress) {
        setSelectedDevice({
          id: currentConfig.target || currentConfig.macAddress || 'curr_dev',
          name:
            currentConfig.deviceName ||
            currentConfig.printerName ||
            (currentConfig.brand === 'star' ? 'Star Micronics Printer' : 'Bluetooth Thermal Printer'),
          target: currentConfig.target,
          macAddress: currentConfig.macAddress,
          ipAddress: currentConfig.ipAddress,
        });
      } else {
        setSelectedDevice(null);
      }
    }
  }, [visible, currentConfig, restaurantId]);

  // Check if Nearby Devices permissions are already granted
  const checkNearbyPermissions = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    try {
      if (Platform.Version >= 31) {
        const scan = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
        const connect = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
        return scan && connect;
      } else {
        const fineLoc = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        return fineLoc;
      }
    } catch (e) {
      console.warn('[Permissions] check error:', e);
      return false;
    }
  };

  // Request Nearby Devices permissions on Android
  const requestNearbyPermissions = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    setIsRequestingPermission(true);
    try {
      if (Platform.Version >= 31) {
        const permissions: any[] = [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ];
        if (Platform.Version >= 33) {
          const nearbyWifi =
            (PermissionsAndroid.PERMISSIONS as any).NEARBY_WIFI_DEVICES ||
            'android.permission.NEARBY_WIFI_DEVICES';
          permissions.push(nearbyWifi);
        }
        permissions.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);

        const statuses = await PermissionsAndroid.requestMultiple(permissions);

        const scanGranted =
          statuses[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED;
        const connectGranted =
          statuses[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;

        const isGranted = scanGranted || connectGranted;
        setHasNearbyPermission(isGranted);
        return isGranted;
      } else {
        const statuses = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ]);
        const isGranted =
          statuses[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED ||
          statuses[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
        setHasNearbyPermission(isGranted);
        return isGranted;
      }
    } catch (e) {
      console.warn('[Permissions] request error:', e);
      setHasNearbyPermission(false);
      return false;
    } finally {
      setIsRequestingPermission(false);
    }
  };

  const handleGrantPermissionPress = async () => {
    const granted = await requestNearbyPermissions();
    if (granted) {
      runDeviceScan();
    } else {
      Alert.alert(
        'Nearby Devices Permission Required',
        'Android requires "Nearby devices" permission to detect and connect to Bluetooth thermal printers. Please allow it in App Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
    }
  };

  // Scan when entering Step 2 with Bluetooth
  useEffect(() => {
    if (visible && step === 2 && selectedType === 'bluetooth') {
      runDeviceScan();
    }
  }, [step, selectedType, visible]);

  const runDeviceScan = async () => {
    if (Platform.OS === 'android') {
      const alreadyGranted = await checkNearbyPermissions();
      if (!alreadyGranted) {
        const granted = await requestNearbyPermissions();
        if (!granted) {
          setHasNearbyPermission(false);
          setIsScanning(false);
          return;
        }
      }
      setHasNearbyPermission(true);
    }

    setIsScanning(true);
    setDevices([]);
    setIsBluetoothDisabled(false);
    const startTime = Date.now();
    try {
      const results = await discoverEpsonPrinters();
      const btOnly = results.filter((r) => r.connectionType === 'bluetooth');
      // Ensure radar animation displays smoothly for at least 1300ms
      const elapsed = Date.now() - startTime;
      if (elapsed < 1300) {
        await new Promise((res) => setTimeout(res, 1300 - elapsed));
      }
      setDevices(btOnly);
    } catch (err: any) {
      console.warn('[Wizard] Scan error:', err);
      if (err?.message?.toLowerCase().includes('bluetooth is disabled') || err?.code === 'BLUETOOTH_DISABLED') {
        setIsBluetoothDisabled(true);
      }
    } finally {
      setIsScanning(false);
    }
  };

  const requestEnableBluetooth = async () => {
    if (Platform.OS === 'android') {
      try {
        await Linking.sendIntent('android.bluetooth.adapter.action.REQUEST_ENABLE');
        setTimeout(() => runDeviceScan(), 1200);
        return;
      } catch {}
      try {
        await Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
        return;
      } catch {}
    } else {
      try {
        await Linking.openURL('App-Prefs:Bluetooth');
        return;
      } catch {}
    }
    await Linking.openSettings();
  };

  const openBluetoothSettings = async () => {
    try {
      if (Platform.OS === 'android') {
        await Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
      } else {
        await Linking.openURL('App-Prefs:Bluetooth');
      }
    } catch {
      await Linking.openSettings();
    }
  };

  // Step 1: Select Type & Advance
  const handleSelectTypeAndNext = (type: PosConnectionType) => {
    setSelectedType(type);
    if (type === 'builtin') {
      setSelectedDevice({
        id: 'sunmi_internal',
        name: 'Sunmi POS Built-in Thermal Printer',
      });
      setStep(3);
    } else if (type === 'system') {
      setSelectedDevice({
        id: 'system_spooler',
        name: 'System Spooler (AirPrint / Android Print)',
      });
      setStep(3);
    } else {
      setStep(2);
    }
  };

  // Step 2: Select Discovered Device & Advance Immediately
  const handleSelectDiscoveredDevice = (dev: { id: string; name: string; target?: string; ipAddress?: string; macAddress?: string }) => {
    // Instantly update selection, stop radio scanning, and navigate to Step 3 without blocking
    setSelectedDevice(dev);
    setIsScanning(false);
    setConnectionStatus(null);
    setStep(3);

    // Verify Bluetooth connection asynchronously in background of Step 3
    if (selectedType === 'bluetooth') {
      setIsVerifyingConnection(true);
      const targetVal = dev.target || dev.macAddress || dev.id;
      const macVal = dev.macAddress || (targetVal.startsWith('BT:') ? '' : targetVal);
      const verifyConfig: PosPrinterConfig = {
        ...currentConfig,
        brand: dev.name.toLowerCase().includes('star') ? 'star' : 'epson',
        connectionType: 'bluetooth',
        target: targetVal,
        macAddress: macVal,
        paperWidth,
        autoPrint,
        copies,
        autoCut,
        openCashDrawer,
      };

      verifyPrinterConnection(verifyConfig)
        .then((check) => {
          setConnectionStatus({
            checked: true,
            success: check.success,
            message: check.message,
            rawError: (check as any).rawError || check.message,
          });
        })
        .catch((err: any) => {
          setConnectionStatus({
            checked: true,
            success: false,
            message: err?.message || 'Bluetooth connection check failed',
            rawError: err?.message,
          });
        })
        .finally(() => {
          setIsVerifyingConnection(false);
        });
    }
  };

  // Step 2: Save Manual Bluetooth Device & Advance Immediately
  const handleSaveManualBt = () => {
    const target = manualBtInput.trim();
    if (!target) return;
    const dev = {
      id: `manual_${Date.now()}`,
      name: `Bluetooth Printer (${target})`,
      target,
      macAddress: target.startsWith('BT:') ? undefined : target,
    };
    setSelectedDevice(dev);
    setIsScanning(false);
    setConnectionStatus(null);
    setStep(3);

    setIsVerifyingConnection(true);
    const verifyConfig: PosPrinterConfig = {
      ...currentConfig,
      brand: 'epson',
      connectionType: 'bluetooth',
      target,
      macAddress: dev.macAddress || '',
      paperWidth,
      autoPrint,
      copies,
      autoCut,
      openCashDrawer,
    };

    verifyPrinterConnection(verifyConfig)
      .then((check) => {
        setConnectionStatus({
          checked: true,
          success: check.success,
          message: check.message,
          rawError: (check as any).rawError || check.message,
        });
      })
      .catch((err: any) => {
        setConnectionStatus({
          checked: true,
          success: false,
          message: err?.message || 'Bluetooth connection check failed',
          rawError: err?.message,
        });
      })
      .finally(() => {
        setIsVerifyingConnection(false);
      });
  };

  // Step 2: Save Manual Network IP
  const handleSaveManualNetwork = () => {
    const ip = ipInput.trim();
    if (!ip) return;
    const port = parseInt(portInput, 10) || 9100;
    const dev = {
      id: `net_${ip}_${port}`,
      name: `Network Printer (${ip}:${port})`,
      ipAddress: ip,
    };
    setSelectedDevice(dev);
    setConnectionStatus(null);
    setStep(3);

    // Verify Network connection asynchronously in background of Step 3
    setIsVerifyingConnection(true);
    const verifyConfig: PosPrinterConfig = {
      ...currentConfig,
      brand: 'epson',
      connectionType: 'network',
      ipAddress: ip,
      port,
      paperWidth,
      autoPrint,
      copies,
      autoCut,
      openCashDrawer,
    };

    verifyPrinterConnection(verifyConfig)
      .then((check) => {
        setConnectionStatus({
          checked: true,
          success: check.success,
          message: check.message,
          rawError: (check as any).rawError || check.message,
        });
      })
      .catch((err: any) => {
        setConnectionStatus({
          checked: true,
          success: false,
          message: err?.message || 'Network connection check failed',
          rawError: err?.message,
        });
      })
      .finally(() => {
        setIsVerifyingConnection(false);
      });
  };

  // Step 3: Select Receipt Template from Dropdown
  const handleSelectTemplate = (tpl: ReceiptTemplate) => {
    setSelectedTemplate(tpl);
    setIsTemplateDropdownOpen(false);
    if (tpl.layout?.paperWidth) {
      setPaperWidth(tpl.layout.paperWidth);
    }
  };

  // Step 3: Switch Paper Width and Keep in Sync with Template
  const handleSelectPaperWidth = (width: '80mm' | '58mm') => {
    setPaperWidth(width);
    if (selectedTemplate) {
      setSelectedTemplate({
        ...selectedTemplate,
        layout: {
          ...selectedTemplate.layout,
          paperWidth: width,
        },
      });
    }
  };

  // Step 3: Re-verify Connection on Demand
  const handleVerifyCurrentConnection = async () => {
    setIsVerifyingConnection(true);
    try {
      const targetVal = selectedDevice?.target || manualBtInput.trim();
      const macVal = selectedDevice?.macAddress || (targetVal.startsWith('BT:') ? '' : targetVal);
      const ipVal = selectedDevice?.ipAddress || ipInput.trim();
      const portVal = parseInt(portInput, 10) || 9100;
      const verifyConfig: PosPrinterConfig = {
        ...currentConfig,
        brand: selectedDevice?.name?.toLowerCase().includes('star') ? 'star' : 'epson',
        connectionType: selectedType,
        target: selectedType === 'bluetooth' ? targetVal : '',
        macAddress: selectedType === 'bluetooth' ? macVal : '',
        ipAddress: selectedType === 'network' ? ipVal : '',
        port: selectedType === 'network' ? portVal : undefined,
        paperWidth,
        autoPrint,
        copies,
        autoCut,
        openCashDrawer,
      };
      const check = await verifyPrinterConnection(verifyConfig);
      setConnectionStatus({
        checked: true,
        success: check.success,
        message: check.message,
        rawError: (check as any).rawError || check.message,
      });
    } catch (err: any) {
      setConnectionStatus({
        checked: true,
        success: false,
        message: err?.message || 'Verification check failed',
        rawError: err?.message,
      });
    } finally {
      setIsVerifyingConnection(false);
    }
  };

  // Step 3: Test Print
  const handleRunTestPrint = async () => {
    setIsTesting(true);
    setTestResult(null);

    const targetVal = selectedDevice?.target || (selectedType === 'bluetooth' ? manualBtInput.trim() : '');
    const macVal = selectedDevice?.macAddress || (selectedType === 'bluetooth' ? (targetVal.startsWith('BT:') ? '' : targetVal) : '');
    const ipVal = selectedDevice?.ipAddress || (selectedType === 'network' ? ipInput.trim() : '');
    const portVal = parseInt(portInput, 10) || 9100;
    const brandVal: PosBrand = selectedDevice?.name?.toLowerCase().includes('star')
      ? 'star'
      : selectedType === 'builtin'
        ? 'sunmi'
        : selectedType === 'system'
          ? 'system'
          : 'epson';

    const testConfig: PosPrinterConfig = {
      ...currentConfig,
      connectionType: selectedType,
      target: targetVal,
      macAddress: macVal,
      ipAddress: ipVal,
      port: portVal,
      paperWidth,
      copies,
      autoCut,
      autoPrint,
      openCashDrawer,
      brand: brandVal,
    };

    // Synchronize template paper width with selected paper width
    const tplWithPaperWidth = selectedTemplate
      ? {
          ...selectedTemplate,
          layout: {
            ...selectedTemplate.layout,
            paperWidth,
          },
        }
      : undefined;

    try {
      const res = await testEpsonPrinter(testConfig, restaurantId, tplWithPaperWidth);
      if (res.success) {
        setConnectionStatus({
          checked: true,
          success: true,
          message: 'Printer connected & test print verified ✅',
        });
        setTestResult({
          success: true,
          message: res.message || `Test receipt printed successfully on ${paperWidth} roll!`,
        });
      } else {
        setTestResult({
          success: false,
          message: (res as any).error || res.message || 'Could not reach printer. Check power & pairing.',
        });
      }
    } catch (e: any) {
      setTestResult({
        success: false,
        message: e.message || 'Test print failed. Please verify printer status.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Connection verification status
  const isConnectionVerified =
    selectedType === 'builtin' ||
    selectedType === 'system' ||
    (connectionStatus?.checked === true && connectionStatus.success === true);

  // Step 3: Complete Wizard and Save with Verified Connection
  const handleFinishWizard = async () => {
    if (!isConnectionVerified) {
      // If user tries to finish before connecting, trigger connection check
      handleVerifyCurrentConnection();
      return;
    }

    const targetVal = selectedDevice?.target || manualBtInput.trim();
    const ipVal = selectedDevice?.ipAddress || ipInput.trim();
    const portVal = parseInt(portInput, 10) || 9100;
    const brandVal: PosBrand = selectedDevice?.name?.toLowerCase().includes('star')
      ? 'star'
      : selectedType === 'builtin'
        ? 'sunmi'
        : selectedType === 'system'
          ? 'system'
          : 'epson';

    const resolvedDeviceName =
      selectedDevice?.name ||
      (selectedType === 'builtin'
        ? 'Sunmi POS Built-in Thermal Printer'
        : selectedType === 'system'
          ? 'System Print Spooler'
          : selectedType === 'bluetooth'
            ? 'Bluetooth Thermal Printer'
            : 'Network Thermal Printer');

    const finalConfig: Partial<PosPrinterConfig> = {
      connectionType: selectedType,
      brand: brandVal,
      deviceName: resolvedDeviceName,
      printerName: resolvedDeviceName,
      target: selectedType === 'bluetooth' ? targetVal : '',
      macAddress: selectedType === 'bluetooth' ? (selectedDevice?.macAddress || (targetVal.startsWith('BT:') ? '' : targetVal)) : '',
      ipAddress: selectedType === 'network' ? ipVal : '',
      port: selectedType === 'network' ? portVal : undefined,
      paperWidth,
      copies,
      autoCut,
      autoPrint: true,
      openCashDrawer,
    };

    await executeSave(finalConfig, true);
  };

  // Step 3: Save configuration offline without live printer connection
  const handleSaveOffline = async () => {
    const targetVal = selectedDevice?.target || manualBtInput.trim();
    const ipVal = selectedDevice?.ipAddress || ipInput.trim();
    const portVal = parseInt(portInput, 10) || 9100;
    const brandVal: PosBrand = selectedDevice?.name?.toLowerCase().includes('star')
      ? 'star'
      : selectedType === 'builtin'
        ? 'sunmi'
        : selectedType === 'system'
          ? 'system'
          : 'epson';

    const resolvedDeviceName =
      selectedDevice?.name ||
      (selectedType === 'builtin'
        ? 'Sunmi POS Built-in Thermal Printer'
        : selectedType === 'system'
          ? 'System Print Spooler'
          : selectedType === 'bluetooth'
            ? 'Bluetooth Thermal Printer'
            : 'Network Thermal Printer');

    const offlineConfig: Partial<PosPrinterConfig> = {
      connectionType: selectedType,
      brand: brandVal,
      deviceName: resolvedDeviceName,
      printerName: resolvedDeviceName,
      target: selectedType === 'bluetooth' ? targetVal : '',
      macAddress: selectedType === 'bluetooth' ? (selectedDevice?.macAddress || (targetVal.startsWith('BT:') ? '' : targetVal)) : '',
      ipAddress: selectedType === 'network' ? ipVal : '',
      port: selectedType === 'network' ? portVal : undefined,
      paperWidth,
      copies,
      autoCut,
      autoPrint: false, // Keep auto-print off while offline to prevent printing errors on orders
      openCashDrawer,
    };

    await executeSave(offlineConfig, false);
  };

  const executeSave = async (finalConfig: Partial<PosPrinterConfig>, isVerified: boolean = true) => {
    setIsSaving(true);
    try {
      const saved = await savePosPrinterConfig(finalConfig, restaurantId);

      // Synchronize with active receipt template
      try {
        const tplToSave = selectedTemplate || (await getActiveReceiptTemplate(restaurantId));
        if (tplToSave) {
          await saveReceiptTemplate(
            {
              ...tplToSave,
              layout: {
                ...tplToSave.layout,
                paperWidth,
              },
            },
            restaurantId,
            true
          );
        }
      } catch (err) {
        console.warn('[Wizard] Template sync warning:', err);
      }

      onComplete(saved, isVerified);
      onClose();
    } catch (err) {
      console.warn('[Wizard] Save failed:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.safeArea,
          {
            paddingTop: topInset,
            paddingBottom: Math.max(insets.bottom, 12),
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}
      >
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" translucent={true} />

        {/* Top Header */}
        <View style={styles.navBar}>
          <View style={styles.navBarInner}>
            <TouchableOpacity
              onPress={() => {
                if (step > 1) {
                  setStep((s) => ((s - 1) as 1 | 2));
                } else {
                  onClose();
                }
              }}
              style={styles.navBackBtn}
              activeOpacity={0.7}
            >
              <ArrowLeft size={22} color="#111827" />
            </TouchableOpacity>

            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.navTitle}>Printer Setup Wizard</Text>
              <Text style={styles.navSubtitle}>
                Step {step} of 3: {step === 1 ? 'Select Type' : step === 2 ? 'Find & Connect' : 'Preferences & Test'}
              </Text>
            </View>

            <TouchableOpacity onPress={onClose} style={styles.navCloseBtn} activeOpacity={0.7}>
              <X size={20} color="#111827" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Step Progress Bar */}
        <View style={styles.progressBarRow}>
          <View style={styles.progressBarInner}>
            <View style={[styles.progressStep, step >= 1 && styles.progressStepActive]} />
            <View style={[styles.progressStep, step >= 2 && styles.progressStepActive]} />
            <View style={[styles.progressStep, step >= 3 && styles.progressStepActive]} />
          </View>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            ref={scrollViewRef}
            style={styles.contentScroll}
            contentContainerStyle={[
              styles.contentContainer,
              { paddingBottom: Math.max(keyboardOffset + 50, 70) },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.maxConstraintContainer}>
          {/* ============================================================== */}
          {/* STEP 1: CHOOSE CONNECTION TYPE                                 */}
          {/* ============================================================== */}
          {step === 1 && (
            <View>
              <View style={styles.stepIntroBox}>
                <Text style={styles.stepTitle}>How is your printer connected?</Text>
                <Text style={styles.stepDescription}>
                  Choose your hardware setup. We will automatically find and configure the right driver for you.
                </Text>
              </View>

              {/* Option 1: Bluetooth Wireless */}
              <TouchableOpacity
                style={[styles.wizardCard, selectedType === 'bluetooth' && styles.wizardCardSelected]}
                onPress={() => handleSelectTypeAndNext('bluetooth')}
                activeOpacity={0.8}
              >
                <View style={[styles.wizardIconCircle, { backgroundColor: '#EFF6FF' }]}>
                  <Bluetooth size={24} color="#2563EB" />
                </View>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <Text style={styles.cardMainTitle}>Wireless Bluetooth</Text>
                    {Platform.OS !== 'ios' ? (
                      <View style={styles.recBadge}>
                        <Text style={styles.recBadgeText}>RECOMMENDED</Text>
                      </View>
                    ) : (
                      <View style={[styles.recBadge, { backgroundColor: '#FEF3C7' }]}>
                        <Text style={[styles.recBadgeText, { color: '#B45309' }]}>MFi / ANDROID ONLY</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.cardSubTitle}>
                    {Platform.OS === 'ios'
                      ? 'Requires Apple MFi certified printer (Star TSP650II BTi, Epson TM-m30II). Generic SPP printers require Android.'
                      : 'Epson TM-m30, Star Micronics TSP143, POS-80 & wireless mobile printers.'}
                  </Text>
                </View>
                <ArrowRight size={20} color="#9CA3AF" />
              </TouchableOpacity>

              {/* Option 2: Wi-Fi or Network Cable */}
              <TouchableOpacity
                style={[styles.wizardCard, selectedType === 'network' && styles.wizardCardSelected]}
                onPress={() => handleSelectTypeAndNext('network')}
                activeOpacity={0.8}
              >
                <View style={[styles.wizardIconCircle, { backgroundColor: '#ECFDF5' }]}>
                  <Wifi size={24} color="#059669" />
                </View>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <Text style={styles.cardMainTitle}>Network IP (Wi-Fi / Ethernet)</Text>
                    {Platform.OS === 'ios' && (
                      <View style={[styles.recBadge, { backgroundColor: '#ECFDF5' }]}>
                        <Text style={[styles.recBadgeText, { color: '#059669' }]}>RECOMMENDED FOR IPAD</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.cardSubTitle}>
                    Epson ePOS or Kitchen ESC/POS printers connected to your Wi-Fi router (Port 9100 / 8008).
                  </Text>
                </View>
                <ArrowRight size={20} color="#9CA3AF" />
              </TouchableOpacity>

              {/* Option 3: Sunmi Built-in */}
              <TouchableOpacity
                style={[styles.wizardCard, selectedType === 'builtin' && styles.wizardCardSelected]}
                onPress={() => handleSelectTypeAndNext('builtin')}
                activeOpacity={0.8}
              >
                <View style={[styles.wizardIconCircle, { backgroundColor: '#FFF7ED' }]}>
                  <Smartphone size={24} color="#C2410C" />
                </View>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.cardMainTitle}>Sunmi POS Built-in Terminal</Text>
                  <Text style={styles.cardSubTitle}>
                    Integrated thermal printhead on Sunmi V2, V3, and T2 Android POS devices.
                  </Text>
                </View>
                <ArrowRight size={20} color="#9CA3AF" />
              </TouchableOpacity>

              {/* Option 4: System Spooler */}
              <TouchableOpacity
                style={[styles.wizardCard, selectedType === 'system' && styles.wizardCardSelected]}
                onPress={() => handleSelectTypeAndNext('system')}
                activeOpacity={0.8}
              >
                <View style={[styles.wizardIconCircle, { backgroundColor: '#F3F4F6' }]}>
                  <FileText size={24} color="#475569" />
                </View>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.cardMainTitle}>System Spooler (AirPrint / PDF)</Text>
                  <Text style={styles.cardSubTitle}>
                    Standard tablet print sheet for AirPrint or Android cloud print queues.
                  </Text>
                </View>
                <ArrowRight size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          )}

          {/* ============================================================== */}
          {/* STEP 2: AUTO-FIND & CONNECT                                    */}
          {/* ============================================================== */}
          {step === 2 && selectedType === 'bluetooth' && (
            <View>
              <View style={styles.stepIntroBox}>
                <Text style={styles.stepTitle}>Connect your Bluetooth Printer</Text>
                <Text style={styles.stepDescription}>
                  Make sure your printer is powered ON and paired in your tablet settings.
                </Text>
              </View>

              {Platform.OS === 'ios' && (
                <View
                  style={{
                    backgroundColor: '#FEF3C7',
                    borderWidth: 1,
                    borderColor: '#FDE68A',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 16,
                    flexDirection: 'row',
                    gap: 10,
                    alignItems: 'flex-start',
                  }}
                >
                  <AlertCircle size={18} color="#B45309" style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#92400E', marginBottom: 2 }}>
                      iPad / iOS Bluetooth Limitation
                    </Text>
                    <Text style={{ fontSize: 12, color: '#B45309', lineHeight: 17 }}>
                      Apple strictly blocks Classic Bluetooth (SPP) on iPad and iPhone. Standard retail thermal printers (POS-58, BKT04, Munbyn, Xprinter) are not supported on iOS over Bluetooth. Only Apple MFi-certified hardware can connect.
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        setSelectedType('network');
                        setStep(1);
                      }}
                      style={{
                        marginTop: 8,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        backgroundColor: '#FFFFFF',
                        borderWidth: 1,
                        borderColor: '#059669',
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 6,
                        alignSelf: 'flex-start',
                      }}
                      activeOpacity={0.8}
                    >
                      <Wifi size={14} color="#059669" />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#059669' }}>
                        Switch to Network IP (Wi-Fi)
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Scanning status */}
              <View style={styles.scanStatusRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  {isScanning ? (
                    <View style={styles.miniRadarContainer}>
                      <Animated.View
                        style={[
                          styles.miniRadarPulse,
                          {
                            transform: [{ scale: miniPulseScale }],
                            opacity: miniPulseOpacity,
                          },
                        ]}
                      />
                      <View style={styles.miniRadarCenter} />
                    </View>
                  ) : isBluetoothDisabled ? (
                    <View style={[styles.dotGreen, { backgroundColor: '#F59E0B' }]} />
                  ) : hasNearbyPermission === false ? (
                    <View style={[styles.dotGreen, { backgroundColor: '#EF4444' }]} />
                  ) : (
                    <View style={styles.dotGreen} />
                  )}
                  <Text style={styles.scanStatusText}>
                    {isScanning
                      ? 'Scanning for paired printers...'
                      : isBluetoothDisabled
                        ? 'Bluetooth is turned off'
                        : hasNearbyPermission === false
                          ? 'Nearby devices permission required'
                          : devices.length > 0
                            ? `Found ${devices.length} nearby printer(s)`
                            : 'No printers found nearby'}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={
                    isBluetoothDisabled
                      ? requestEnableBluetooth
                      : hasNearbyPermission === false
                        ? handleGrantPermissionPress
                        : runDeviceScan
                  }
                  disabled={isScanning || isRequestingPermission}
                  style={[styles.rescanMiniBtn, (isScanning || isRequestingPermission) && { opacity: 0.75 }]}
                  activeOpacity={0.7}
                >
                  <Animated.View style={isScanning ? { transform: [{ rotate: sweepAngle }] } : undefined}>
                    <RefreshCw size={13} color="#000000" />
                  </Animated.View>
                  <Text style={styles.rescanMiniBtnText}>
                    {isScanning
                      ? 'Scanning...'
                      : isBluetoothDisabled
                        ? 'Turn On'
                        : hasNearbyPermission === false
                          ? 'Grant'
                          : 'Rescan'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Bluetooth Disabled Card */}
              {isBluetoothDisabled && (
                <View style={[styles.permissionCard, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                  <View style={styles.permissionCardHeader}>
                    <View style={[styles.permissionIconCircle, { backgroundColor: '#FEF3C7' }]}>
                      <Bluetooth size={22} color="#D97706" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.permissionTitle, { color: '#B45309' }]}>Bluetooth is Turned Off</Text>
                      <Text style={[styles.permissionDesc, { color: '#92400E' }]}>
                        Bluetooth is currently disabled on this device. Please turn on Bluetooth to detect and connect with your receipt printer.
                      </Text>
                    </View>
                  </View>
                  <View style={styles.permissionActionsRow}>
                    <TouchableOpacity
                      style={[styles.grantPermissionBtn, { backgroundColor: '#D97706' }]}
                      onPress={requestEnableBluetooth}
                      activeOpacity={0.8}
                    >
                      <Bluetooth size={16} color="#FFFFFF" />
                      <Text style={styles.grantPermissionBtnText}>Turn On Bluetooth</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.openSettingsMiniBtn, { borderColor: '#FCD34D' }]}
                      onPress={openBluetoothSettings}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.openSettingsMiniBtnText, { color: '#B45309' }]}>Bluetooth Settings</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Nearby Devices Permission Required Card (Android) */}
              {Platform.OS === 'android' && hasNearbyPermission === false && (
                <View style={styles.permissionCard}>
                  <View style={styles.permissionCardHeader}>
                    <View style={styles.permissionIconCircle}>
                      <ShieldAlert size={22} color="#DC2626" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.permissionTitle}>Nearby Devices Permission Required</Text>
                      <Text style={styles.permissionDesc}>
                        Android requires "Nearby devices" permission to search, pair, and send orders to Bluetooth receipt printers.
                      </Text>
                    </View>
                  </View>
                  <View style={styles.permissionActionsRow}>
                    <TouchableOpacity
                      style={styles.grantPermissionBtn}
                      onPress={handleGrantPermissionPress}
                      disabled={isRequestingPermission}
                      activeOpacity={0.8}
                    >
                      {isRequestingPermission ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <Check size={16} color="#FFFFFF" />
                          <Text style={styles.grantPermissionBtnText}>Grant Permission</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.openSettingsMiniBtn}
                      onPress={() => Linking.openSettings()}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.openSettingsMiniBtnText}>Open Settings</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Impressive Radar Scanning Visualizer (Shown while scanning) */}
              {isScanning ? (
                <View style={styles.scanningVisualizerCard}>
                  <View style={styles.radarVisualizerContainer}>
                    {/* Concentric Animated Radar Waves */}
                    <Animated.View
                      style={[
                        styles.radarPulseRing,
                        {
                          transform: [{ scale: pulseScale1 }],
                          opacity: pulseOpacity1,
                        },
                      ]}
                    />
                    <Animated.View
                      style={[
                        styles.radarPulseRing,
                        {
                          transform: [{ scale: pulseScale2 }],
                          opacity: pulseOpacity2,
                        },
                      ]}
                    />

                    {/* Target Guide Circles */}
                    <View style={styles.radarOuterRing} />
                    <View style={styles.radarInnerRing} />

                    {/* Rotating Radar Sweep Line */}
                    <Animated.View
                      style={[
                        styles.radarSweepContainer,
                        {
                          transform: [{ rotate: sweepAngle }],
                        },
                      ]}
                    >
                      <View style={styles.radarSweepLine} />
                    </Animated.View>

                    {/* Center Breathing Beacon Disc */}
                    <Animated.View
                      style={[
                        styles.radarCenterDisc,
                        {
                          transform: [{ scale: centerPulseAnim }],
                        },
                      ]}
                    >
                      <Bluetooth size={24} color="#059669" />
                    </Animated.View>
                  </View>

                  <Text style={styles.scanningVisualizerTitle}>Searching for Bluetooth Printers</Text>
                  <Text style={styles.scanningVisualizerDesc}>
                    Listening for Epson, Star, Sunmi, Xprinter and paired ESC/POS thermal stations...
                  </Text>

                  {/* Live Status Pills */}
                  <View style={styles.scanningPillsRow}>
                    <View style={styles.scanningPill}>
                      <View style={styles.pillPulseDot} />
                      <Text style={styles.scanningPillText}>Bluetooth SPP Active</Text>
                    </View>
                    <View style={styles.scanningPill}>
                      <Text style={styles.scanningPillText}>ESC/POS Ready</Text>
                    </View>
                  </View>
                </View>
              ) : devices.length > 0 ? (
                <View style={{ marginVertical: 12 }}>
                  {devices.map((dev) => (
                    <TouchableOpacity
                      key={dev.id}
                      style={styles.foundDeviceRow}
                      onPress={() => handleSelectDiscoveredDevice(dev)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.deviceIconCircle}>
                        <Printer size={20} color="#111827" />
                      </View>
                      <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={styles.foundDeviceName}>{dev.name}</Text>
                        <Text style={styles.foundDeviceTarget}>
                          {dev.target || dev.macAddress || 'Bluetooth Connected'}
                        </Text>
                      </View>
                      <View style={styles.selectBtnPill}>
                        <Text style={styles.selectBtnPillText}>Select</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : !isScanning && !isBluetoothDisabled && hasNearbyPermission !== false ? (
                /* Empty state shown only when Bluetooth is active but no paired printers were detected */
                <View style={styles.wizardEmptyBox}>
                  <Printer size={36} color="#9CA3AF" style={{ marginBottom: 10 }} />
                  <Text style={styles.emptyHeader}>Printer not showing up?</Text>
                  <Text style={styles.emptyDesc}>
                    Desktop Bluetooth printers must first be paired in your tablet's Bluetooth menu:
                  </Text>

                  <View style={styles.stepsMiniBox}>
                    {[
                      'Turn printer power switch ON.',
                      'Pair in tablet Bluetooth Settings (PIN is usually 0000 or 1234).',
                      'Tap "Rescan" above to detect it.',
                    ].map((stepText, idx) => (
                      <Text key={idx} style={styles.stepsMiniItem}>
                        {idx + 1}. {stepText}
                      </Text>
                    ))}
                  </View>

                  <TouchableOpacity
                    onPress={openBluetoothSettings}
                    style={[styles.openSettingsBtn, { width: '100%', justifyContent: 'center' }]}
                    activeOpacity={0.8}
                  >
                    <Bluetooth size={15} color="#2563EB" />
                    <Text style={styles.openSettingsBtnText}>Open Bluetooth Settings</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Manual Device Target toggle for power users */}
              <TouchableOpacity
                onPress={() => {
                  const nextVal = !showManualBtToggle;
                  setShowManualBtToggle(nextVal);
                  if (nextVal) {
                    setTimeout(() => {
                      scrollViewRef.current?.scrollToEnd({ animated: true });
                    }, 120);
                  }
                }}
                style={styles.manualToggleRow}
                activeOpacity={0.7}
              >
                <Text style={styles.manualToggleText}>
                  {showManualBtToggle ? '▲ Hide manual entry' : '▼ Know your printer MAC or Bluetooth name? Enter manually'}
                </Text>
              </TouchableOpacity>

              {showManualBtToggle && (
                <View style={styles.manualInputCard}>
                  <Text style={styles.manualInputLabel}>Bluetooth Device Name or MAC Address</Text>
                  <TextInput
                    style={styles.manualTextInput}
                    value={manualBtInput}
                    onChangeText={setManualBtInput}
                    placeholder="e.g. BT:EP-TM-M30III or 00:01:90:84:7B:A2"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="none"
                    onFocus={() => {
                      setTimeout(() => {
                        scrollViewRef.current?.scrollToEnd({ animated: true });
                      }, 120);
                    }}
                  />
                  <TouchableOpacity
                    onPress={handleSaveManualBt}
                    disabled={!manualBtInput.trim()}
                    style={[styles.saveManualBtn, !manualBtInput.trim() && { opacity: 0.5 }]}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.saveManualBtnText}>Continue with Manual Address</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* STEP 2: NETWORK IP SETUP */}
          {step === 2 && selectedType === 'network' && (
            <View>
              <View style={styles.stepIntroBox}>
                <Text style={styles.stepTitle}>Enter Network Printer IP</Text>
                <Text style={styles.stepDescription}>
                  Enter the static IP address assigned to your Ethernet / Wi-Fi receipt printer.
                </Text>
              </View>

              <View style={styles.manualInputCard}>
                <Text style={styles.manualInputLabel}>Printer IP Address</Text>
                <TextInput
                  style={styles.manualTextInput}
                  value={ipInput}
                  onChangeText={setIpInput}
                  placeholder="e.g. 192.168.1.100"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="decimal-pad"
                  autoCapitalize="none"
                  onFocus={() => {
                    setTimeout(() => {
                      scrollViewRef.current?.scrollToEnd({ animated: true });
                    }, 120);
                  }}
                />

                <Text style={[styles.manualInputLabel, { marginTop: 12 }]}>Port</Text>
                <TextInput
                  style={styles.manualTextInput}
                  value={portInput}
                  onChangeText={setPortInput}
                  placeholder="9100 (Universal) or 8008 (Epson ePOS)"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                  onFocus={() => {
                    setTimeout(() => {
                      scrollViewRef.current?.scrollToEnd({ animated: true });
                    }, 120);
                  }}
                />

                <TouchableOpacity
                  onPress={handleSaveManualNetwork}
                  disabled={!ipInput.trim()}
                  style={[styles.saveManualBtn, !ipInput.trim() && { opacity: 0.5 }]}
                  activeOpacity={0.8}
                >
                  <Text style={styles.saveManualBtnText}>Connect & Continue</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ============================================================== */}
          {/* STEP 3: PREFERENCES & LIVE TEST PRINT                          */}
          {/* ============================================================== */}
          {step === 3 && (
            <View>
              {/* Connected / Connection Status Card */}
                  {(selectedType === 'bluetooth' || selectedType === 'network') &&
                    connectionStatus?.checked &&
                    !connectionStatus.success ? (
                (() => {
                  const errInfo = formatPrinterConnectionError(
                    connectionStatus.rawError || connectionStatus.message,
                    selectedDevice?.name || (selectedType === 'network' ? `${ipInput.trim()}:${portInput}` : undefined),
                    selectedType
                  );
                  return (
                    <View style={styles.errorHeroCard}>
                      {/* Error Header */}
                      <View style={styles.errorHeroHeader}>
                        <View style={styles.errorHeroIconWrap}>
                          <AlertCircle size={20} color="#DC2626" />
                        </View>
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={styles.errorHeroDeviceTitle} numberOfLines={1}>
                            {selectedDevice?.name || (selectedType === 'network' ? `Network Printer (${ipInput.trim()}:${portInput})` : 'Selected Device')}
                          </Text>
                          <Text style={styles.errorHeroCategory}>
                            {errInfo.title}
                          </Text>
                        </View>
                        <View style={styles.errorBadge}>
                          <Text style={styles.errorBadgeText}>NOT CONNECTED</Text>
                        </View>
                      </View>

                      {/* Clear, Human-Friendly Explanation */}
                      <View style={styles.errorBodyBox}>
                        <Text style={styles.errorExplanationText}>
                          {errInfo.message}
                        </Text>

                        {/* Troubleshooting Checklist */}
                        {errInfo.troubleshootingSteps.length > 0 && (
                          <View style={styles.errorChecklist}>
                            <Text style={styles.errorChecklistHeader}>
                              {errInfo.isLikelyNonPrinter ? 'How to resolve:' : 'Check the following:'}
                            </Text>
                            {errInfo.troubleshootingSteps.map((stepText, idx) => (
                              <View key={idx} style={styles.errorChecklistRow}>
                                <Text style={styles.errorBullet}>•</Text>
                                <Text style={styles.errorChecklistText}>{stepText}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>

                      {/* Action Buttons */}
                      <View style={styles.errorActionsRow}>
                        <TouchableOpacity
                          style={styles.changePrinterBtn}
                          onPress={() => setStep(2)}
                          activeOpacity={0.8}
                        >
                          <ArrowLeft size={14} color="#374151" />
                          <Text style={styles.changePrinterBtnText}>
                            {selectedType === 'network' ? 'Edit IP' : 'Choose Different'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.retryConnectionBtn}
                          onPress={handleVerifyCurrentConnection}
                          disabled={isVerifyingConnection}
                          activeOpacity={0.8}
                        >
                          {isVerifyingConnection ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <>
                              <RefreshCw size={13} color="#FFFFFF" />
                              <Text style={styles.retryConnectionBtnText}>Retry Link</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>

                      {Platform.OS === 'android' && selectedType === 'bluetooth' && (
                        <TouchableOpacity
                          style={styles.openSettingsBtn}
                          onPress={openBluetoothSettings}
                          activeOpacity={0.8}
                        >
                          <ExternalLink size={14} color="#1D4ED8" />
                          <Text style={styles.openSettingsBtnText}>Pair in Android Bluetooth Settings</Text>
                        </TouchableOpacity>
                      )}

                      {Platform.OS === 'android' && selectedType === 'network' && (
                        <TouchableOpacity
                          style={styles.openSettingsBtn}
                          onPress={async () => {
                            try {
                              await Linking.sendIntent('android.settings.WIFI_SETTINGS');
                            } catch {
                              await Linking.openSettings();
                            }
                          }}
                          activeOpacity={0.8}
                        >
                          <ExternalLink size={14} color="#1D4ED8" />
                          <Text style={styles.openSettingsBtnText}>Open Wi-Fi Settings</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })()
              ) : (
                <View
                  style={[
                    styles.connectedDeviceHero,
                          (selectedType === 'bluetooth' || selectedType === 'network') &&
                          isVerifyingConnection &&
                          styles.connectedDeviceHeroChecking,
                  ]}
                >
                  <View style={styles.connectedDeviceHeroTop}>
                          {isVerifyingConnection ? (
                            <ActivityIndicator size="small" color="#2563EB" />
                          ) : connectionStatus?.checked && connectionStatus.success ? (
                            <CheckCircle2 size={24} color="#059669" />
                            ) : selectedType === 'bluetooth' ? (
                              <Bluetooth size={24} color="#2563EB" />
                              ) : selectedType === 'network' ? (
                                <Wifi size={24} color="#2563EB" />
                    ) : (
                      <CheckCircle2 size={24} color="#059669" />
                    )}
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.heroDeviceTitle}>
                              {selectedDevice?.name ||
                                (selectedType === 'network'
                                  ? `Network Printer (${ipInput.trim()}:${portInput})`
                                  : 'Thermal POS Printer')}
                      </Text>
                      <Text style={styles.heroDeviceSubtitle}>
                              {isVerifyingConnection
                                ? selectedType === 'network'
                                  ? `Testing network link to ${ipInput.trim()}:${portInput}...`
                                  : 'Checking Bluetooth connection handshake...'
                                : connectionStatus?.checked && connectionStatus.success
                                  ? `${selectedType === 'network' ? 'Network' : 'Bluetooth'} Link Confirmed • Ready to Print`
                                  : `${selectedType.toUpperCase()} Device Selected • Ready for setup & test print`}
                      </Text>
                    </View>

                          {/* Re-verify Button for Bluetooth & Network */}
                          {(selectedType === 'bluetooth' || selectedType === 'network') && (
                      <TouchableOpacity
                        style={styles.recheckBtn}
                        onPress={handleVerifyCurrentConnection}
                        disabled={isVerifyingConnection}
                        activeOpacity={0.7}
                      >
                        {isVerifyingConnection ? (
                          <ActivityIndicator size="small" color="#2563EB" />
                        ) : (
                          <>
                            <RefreshCw size={12} color="#059669" />
                            <Text style={styles.recheckBtnText}>Re-check</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}

              {/* Receipt Template Dropdown Section */}
              <View style={styles.templateSection}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitleHeader}>RECEIPT TEMPLATE</Text>
                  {selectedTemplate?.layout?.paperWidth && (
                    <View style={styles.templateActiveTag}>
                      <Text style={styles.templateActiveTagText}>
                        {selectedTemplate.layout.paperWidth.toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.sectionSubHeader}>
                  Select the receipt template to print from this station:
                </Text>

                {/* Dropdown Selector Button */}
                <TouchableOpacity
                  style={[
                    styles.dropdownButton,
                    isTemplateDropdownOpen && styles.dropdownButtonOpen,
                  ]}
                  onPress={() => setIsTemplateDropdownOpen(!isTemplateDropdownOpen)}
                  activeOpacity={0.8}
                >
                  <View style={styles.dropdownLeftTile}>
                    <FileText size={20} color="#059669" />
                  </View>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.dropdownSelectedTitle} numberOfLines={1}>
                        {selectedTemplate?.name || 'Standard POS Receipt'}
                      </Text>
                      {selectedTemplate?.isDefault && (
                        <View style={styles.defaultBadge}>
                          <Text style={styles.defaultBadgeText}>DEFAULT</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.dropdownSelectedSub} numberOfLines={1}>
                      {selectedTemplate?.description || 'Balanced thermal receipt layout'}
                    </Text>
                  </View>
                  {isTemplateDropdownOpen ? (
                    <ChevronUp size={20} color="#059669" />
                  ) : (
                    <ChevronDown size={20} color="#64748B" />
                  )}
                </TouchableOpacity>

                {/* Expanded Dropdown Options List */}
                {isTemplateDropdownOpen && (
                  <View style={styles.dropdownMenuCard}>
                    {templates.map((tpl, index) => {
                      const isSelected = selectedTemplate?.id === tpl.id;
                      return (
                        <React.Fragment key={tpl.id || index}>
                          <TouchableOpacity
                            style={[
                              styles.dropdownOptionRow,
                              isSelected && styles.dropdownOptionRowSelected,
                            ]}
                            onPress={() => handleSelectTemplate(tpl)}
                            activeOpacity={0.7}
                          >
                            <View style={{ flex: 1, marginRight: 8 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                <Text style={[styles.dropdownOptionTitle, isSelected && styles.dropdownOptionTitleSelected]}>
                                  {tpl.name}
                                </Text>
                                <View style={styles.optionWidthBadge}>
                                  <Text style={styles.optionWidthBadgeText}>{tpl.layout.paperWidth}</Text>
                                </View>
                              </View>
                              {tpl.description ? (
                                <Text style={styles.dropdownOptionDesc} numberOfLines={2}>
                                  {tpl.description}
                                </Text>
                              ) : null}
                            </View>
                            <View
                              style={[
                                styles.optionRadio,
                                isSelected && styles.optionRadioSelected,
                              ]}
                            >
                              {isSelected && <Check size={12} color="#FFFFFF" />}
                            </View>
                          </TouchableOpacity>
                          {index < templates.length - 1 && <View style={styles.dropdownOptionDivider} />}
                        </React.Fragment>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* Preferences Configuration */}
              <View style={styles.configCard}>
                <Text style={styles.sectionTitleHeader}>PRINTER PREFERENCES</Text>
                <Text style={styles.sectionSubHeader}>
                  Applicable for Test Printer Button Only
                </Text>

                {/* Paper Roll Width */}
                <View style={styles.prefOptionRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.prefOptionTitle}>Paper Roll Width</Text>
                    <Text style={styles.prefOptionSubtitle}>58mm compact roll (Standard) or 80mm wide</Text>
                  </View>
                  <View style={styles.segmentedCtrl}>
                    <TouchableOpacity
                      style={[styles.segmentCtrlBtn, paperWidth === '58mm' && styles.segmentCtrlBtnActive]}
                      onPress={() => handleSelectPaperWidth('58mm')}
                    >
                      <Text style={[styles.segmentCtrlText, paperWidth === '58mm' && styles.segmentCtrlTextActive]}>
                        58mm (2")
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.segmentCtrlBtn, paperWidth === '80mm' && styles.segmentCtrlBtnActive]}
                      onPress={() => handleSelectPaperWidth('80mm')}
                    >
                      <Text style={[styles.segmentCtrlText, paperWidth === '80mm' && styles.segmentCtrlTextActive]}>
                        80mm (3")
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Number of Copies */}
                <View style={styles.prefOptionRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.prefOptionTitle}>Receipt Copies</Text>
                    <Text style={styles.prefOptionSubtitle}>1 copy (Kitchen) or 2 copies (Kitchen + Customer)</Text>
                  </View>
                  <View style={styles.segmentedCtrl}>
                    <TouchableOpacity
                      style={[styles.segmentCtrlBtn, copies === 1 && styles.segmentCtrlBtnActive]}
                      onPress={() => setCopies(1)}
                    >
                      <Text style={[styles.segmentCtrlText, copies === 1 && styles.segmentCtrlTextActive]}>
                        1 Copy
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.segmentCtrlBtn, copies === 2 && styles.segmentCtrlBtnActive]}
                      onPress={() => setCopies(2)}
                    >
                      <Text style={[styles.segmentCtrlText, copies === 2 && styles.segmentCtrlTextActive]}>
                        2 Copies
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Auto-print orders toggle */}
                <View style={styles.prefOptionRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.prefOptionTitle}>Auto-print new orders</Text>
                    <Text style={styles.prefOptionSubtitle}>Print automatically when an order arrives</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.toggleBtn, autoPrint && styles.toggleBtnActive]}
                    onPress={() => setAutoPrint(!autoPrint)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.toggleBtnText, autoPrint && styles.toggleBtnTextActive]}>
                      {autoPrint ? 'ON' : 'OFF'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Auto-cut paper toggle */}
                <View style={[styles.prefOptionRow, { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.prefOptionTitle}>Auto-cut paper</Text>
                    <Text style={styles.prefOptionSubtitle}>Automatically trigger paper guillotine cut</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.toggleBtn, autoCut && styles.toggleBtnActive]}
                    onPress={() => setAutoCut(!autoCut)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.toggleBtnText, autoCut && styles.toggleBtnTextActive]}>
                      {autoCut ? 'ON' : 'OFF'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Live Test Print Section */}
              <View style={styles.testSectionBox}>
                <Text style={styles.sectionTitleHeader}>VERIFY HARDWARE</Text>
                <Text style={styles.sectionSubHeader}>
                  Tap below to send a live test receipt to confirm printer communications:
                </Text>

                <TouchableOpacity
                  style={styles.testActionBtn}
                  onPress={handleRunTestPrint}
                  disabled={isTesting}
                  activeOpacity={0.8}
                >
                  {isTesting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Printer size={18} color="#FFFFFF" />
                  )}
                  <Text style={styles.testActionBtnText}>
                    {isTesting ? 'Printing sample receipt...' : 'Print Test Receipt Now'}
                  </Text>
                </TouchableOpacity>

                {testResult && (
                  <View
                    style={[
                      styles.testResultAlert,
                      testResult.success ? styles.testResultSuccess : styles.testResultError,
                    ]}
                  >
                    <Text
                      style={[
                        styles.testResultText,
                        testResult.success ? { color: '#065F46' } : { color: '#991B1B' },
                      ]}
                    >
                      {testResult.message}
                    </Text>
                  </View>
                )}
              </View>

              {/* Complete Setup Action Area */}
              <View style={styles.wizardFooterActions}>
                {isConnectionVerified ? (
                  <View>
                    <TouchableOpacity
                      style={styles.completeWizardBtn}
                      onPress={handleFinishWizard}
                      disabled={isSaving || isVerifyingConnection}
                      activeOpacity={0.8}
                    >
                      {isSaving ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <Check size={18} color="#FFFFFF" />
                          <Text style={styles.completeWizardBtnText}>Save & Start Printing</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <Text style={styles.footerVerifiedHint}>
                      ✓ Hardware link confirmed • Ready for automatic receipt printing
                    </Text>
                  </View>
                ) : (
                  <View style={styles.unverifiedActionsBox}>
                    {/* Primary Action: Retry Link & Verify */}
                    <TouchableOpacity
                      style={styles.retryPrimaryActionBtn}
                      onPress={handleVerifyCurrentConnection}
                      disabled={isVerifyingConnection || isSaving}
                      activeOpacity={0.8}
                    >
                      {isVerifyingConnection ? (
                        <>
                          <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 8 }} />
                          <Text style={styles.retryPrimaryActionBtnText}>Verifying Connection...</Text>
                        </>
                      ) : (
                        <>
                          <RefreshCw size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                          <Text style={styles.retryPrimaryActionBtnText}>Connect & Verify Printer</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    {/* Secondary Action: Save Configuration Offline without Error Dialogs */}
                    <TouchableOpacity
                      style={styles.saveOfflineBtn}
                      onPress={handleSaveOffline}
                      disabled={isSaving || isVerifyingConnection}
                      activeOpacity={0.7}
                    >
                      {isSaving ? (
                        <ActivityIndicator size="small" color="#64748B" />
                      ) : (
                        <Text style={styles.saveOfflineBtnText}>
                          Save Settings for Later (Printer Offline)
                        </Text>
                      )}
                    </TouchableOpacity>
                    <Text style={styles.footerOfflineHint}>
                      Printer will be saved. Automatic printing remains paused until the printer is connected.
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  navBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  navBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
  },
  progressBarRow: {
    backgroundColor: '#E5E7EB',
    height: 4,
  },
  progressBarInner: {
    flexDirection: 'row',
    height: 4,
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
  },
  maxConstraintContainer: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
  },
  navBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  navSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
  },
  navCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressStep: {
    flex: 1,
    backgroundColor: '#E5E7EB',
  },
  progressStepActive: {
    backgroundColor: '#10B981',
  },
  contentScroll: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },

  /* Step Intro */
  stepIntroBox: {
    marginBottom: 16,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  stepDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
    lineHeight: 18,
  },

  /* Wizard Cards */
  wizardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  wizardCardSelected: {
    borderColor: '#000000',
    backgroundColor: '#FAFAFA',
  },
  wizardIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  cardMainTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#111827',
  },
  cardSubTitle: {
    fontSize: 11.5,
    color: '#6B7280',
    marginTop: 2,
    lineHeight: 16,
  },
  recBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  recBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#059669',
  },

  /* Step 2 Scanning */
  scanStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    marginBottom: 8,
  },
  dotGreen: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  scanStatusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  rescanMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  rescanMiniBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#111827',
  },

  /* Mini Radar in Status Row */
  miniRadarContainer: {
    width: 14,
    height: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  miniRadarPulse: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10B981',
  },
  miniRadarCenter: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#059669',
  },

  /* Full Radar Scanning Visualizer Card */
  scanningVisualizerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 24,
    alignItems: 'center',
    marginVertical: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  radarVisualizerContainer: {
    width: 150,
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  radarPulseRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  radarOuterRing: {
    position: 'absolute',
    width: 136,
    height: 136,
    borderRadius: 68,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
  },
  radarInnerRing: {
    position: 'absolute',
    width: 94,
    height: 94,
    borderRadius: 47,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  radarSweepContainer: {
    position: 'absolute',
    width: 136,
    height: 136,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  radarSweepLine: {
    width: 2.5,
    height: 68,
    backgroundColor: '#10B981',
    borderRadius: 1.25,
    opacity: 0.85,
  },
  radarCenterDisc: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#ECFDF5',
    borderWidth: 2,
    borderColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  scanningVisualizerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  scanningVisualizerDesc: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 290,
    marginBottom: 16,
  },
  scanningPillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  scanningPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  pillPulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  scanningPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  foundDeviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    padding: 12,
    marginBottom: 8,
  },
  deviceIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  foundDeviceName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  foundDeviceTarget: {
    fontSize: 11.5,
    color: '#6B7280',
    marginTop: 2,
  },
  selectBtnPill: {
    backgroundColor: '#000000',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
  },
  selectBtnPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  /* Empty state */
  wizardEmptyBox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 24,
    marginVertical: 10,
  },
  emptyHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  emptyDesc: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  stepsMiniBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 10,
    width: '100%',
    marginBottom: 14,
    gap: 4,
  },
  stepsMiniItem: {
    fontSize: 11.5,
    color: '#4B5563',
  },
  openSettingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  openSettingsBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
  },

  /* Manual toggle & inputs */
  manualToggleRow: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  manualToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  manualInputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    marginTop: 6,
  },
  manualInputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
  },
  manualTextInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#111827',
  },
  saveManualBtn: {
    backgroundColor: '#000000',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  saveManualBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  /* Step 3 Styles */
  connectedDeviceHero: {
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 14,
    marginBottom: 16,
  },
  connectedDeviceHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroDeviceTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#065F46',
  },
  heroDeviceSubtitle: {
    fontSize: 12,
    color: '#047857',
    marginTop: 1,
  },
  connectedDeviceHeroOffline: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  connectedDeviceHeroChecking: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  recheckBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  recheckBtnOffline: {
    borderColor: '#FECACA',
    backgroundColor: '#FFFFFF',
  },
  recheckBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },

  /* Dedicated Error Card Styles */
  errorHeroCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  errorHeroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  errorHeroIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorHeroDeviceTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#991B1B',
  },
  errorHeroCategory: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
    marginTop: 1,
  },
  errorBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B91C1C',
    letterSpacing: 0.5,
  },
  errorBodyBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    padding: 12,
    marginBottom: 14,
  },
  errorExplanationText: {
    fontSize: 13,
    color: '#374151',
    lineHeight: 18,
    fontWeight: '500',
  },
  errorChecklist: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  errorChecklistHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  errorChecklistRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  errorBullet: {
    fontSize: 13,
    color: '#DC2626',
    marginRight: 6,
    lineHeight: 18,
    fontWeight: '700',
  },
  errorChecklistText: {
    flex: 1,
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 17,
  },
  errorActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  changePrinterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  changePrinterBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
  },
  retryConnectionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#DC2626',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  retryConnectionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  /* Template Dropdown Section */
  templateSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  sectionTitleHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  sectionSubHeader: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
    marginBottom: 10,
  },
  templateActiveTag: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  templateActiveTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.4,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 12,
    minHeight: 56,
  },
  dropdownButtonOpen: {
    borderColor: '#059669',
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  dropdownLeftTile: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  dropdownSelectedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  dropdownSelectedSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  defaultBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  defaultBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#2563EB',
    letterSpacing: 0.3,
  },
  dropdownMenuCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderColor: '#059669',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    overflow: 'hidden',
    marginTop: -1,
  },
  dropdownOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FFFFFF',
    minHeight: 48,
  },
  dropdownOptionRowSelected: {
    backgroundColor: '#F0FDF4',
  },
  dropdownOptionTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  dropdownOptionTitleSelected: {
    fontWeight: '700',
    color: '#059669',
  },
  optionWidthBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  optionWidthBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  dropdownOptionDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
  optionRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  optionRadioSelected: {
    borderColor: '#059669',
    backgroundColor: '#059669',
  },
  dropdownOptionDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginHorizontal: 12,
  },

  /* Preferences Card */
  configCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    marginBottom: 16,
  },
  prefOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  prefOptionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  prefOptionSubtitle: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 1,
  },
  segmentedCtrl: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    padding: 2,
  },
  segmentCtrlBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 5,
  },
  segmentCtrlBtnActive: {
    backgroundColor: '#000000',
  },
  segmentCtrlText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  segmentCtrlTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  toggleBtn: {
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  toggleBtnActive: {
    backgroundColor: '#10B981',
  },
  toggleBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#4B5563',
  },
  toggleBtnTextActive: {
    color: '#FFFFFF',
  },

  /* Test Section */
  testSectionBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    marginBottom: 16,
  },
  testActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    borderRadius: 8,
    paddingVertical: 12,
    marginTop: 6,
  },
  testActionBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  testResultAlert: {
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  testResultSuccess: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  testResultError: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  testResultText: {
    fontSize: 12,
    fontWeight: '600',
  },

  /* Wizard Footer Actions */
  wizardFooterActions: {
    marginTop: 4,
    marginBottom: 20,
  },
  completeWizardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669', // Emerald success green
    borderRadius: 12,
    paddingVertical: 14,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  completeWizardBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
  },
  footerVerifiedHint: {
    textAlign: 'center',
    fontSize: 11.5,
    color: '#059669',
    fontWeight: '600',
    marginTop: 8,
  },
  unverifiedActionsBox: {
    width: '100%',
  },
  retryPrimaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A', // Slate 900 primary
    borderRadius: 12,
    paddingVertical: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  retryPrimaryActionBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
  },
  saveOfflineBtn: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  saveOfflineBtnText: {
    color: '#475569',
    fontSize: 13.5,
    fontWeight: '700',
  },
  footerOfflineHint: {
    textAlign: 'center',
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
    marginTop: 8,
    paddingHorizontal: 8,
  },

  /* Nearby Devices Permission Card */
  permissionCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    padding: 14,
    marginBottom: 14,
  },
  permissionCardHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  permissionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991B1B',
    marginBottom: 3,
  },
  permissionDesc: {
    fontSize: 12,
    color: '#B91C1C',
    lineHeight: 17,
  },
  permissionActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  grantPermissionBtn: {
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    flex: 1,
  },
  grantPermissionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  openSettingsMiniBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F87171',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  openSettingsMiniBtnText: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '600',
  },
});
