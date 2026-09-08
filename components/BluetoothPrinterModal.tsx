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
  Animated,
  Easing,
  useWindowDimensions,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import {
  Printer,
  Bluetooth,
  RefreshCw,
  CheckCircle2,
  X,
  ArrowLeft,
  Radio,
  Search,
  Wifi,
  HelpCircle,
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Cpu,
  Sparkles,
  ExternalLink,
} from 'lucide-react-native';
import { discoverEpsonPrinters } from '../services/thermal-print.service';

export interface DiscoveredPrinterDevice {
  id: string;
  name: string;
  connectionType: 'bluetooth' | 'network';
  target?: string;
  ipAddress?: string;
  macAddress?: string;
  isRecommended?: boolean;
}

interface BluetoothPrinterModalProps {
  visible: boolean;
  activeTarget?: string;
  onClose: () => void;
  onSelectPrinter: (device: DiscoveredPrinterDevice) => void;
}

export const BluetoothPrinterModal: React.FC<BluetoothPrinterModalProps> = ({
  visible,
  activeTarget,
  onClose,
  onSelectPrinter,
}) => {
  const { width: windowWidth } = useWindowDimensions();
  const isTablet = windowWidth >= 768;

  const [activeTab, setActiveTab] = useState<'discovered' | 'manual'>('discovered');
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<DiscoveredPrinterDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [connectingDeviceId, setConnectingDeviceId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showHelpAccordion, setShowHelpAccordion] = useState(false);

  // Custom manual entry states
  const [customName, setCustomName] = useState('');
  const [customConnectionType, setCustomConnectionType] = useState<'bluetooth' | 'network'>('bluetooth');
  const [customTarget, setCustomTarget] = useState('');
  const [customIp, setCustomIp] = useState('');
  const [customPort, setCustomPort] = useState('8008');

  // Pulse animation for scanning radar effect
  const radarScale = useRef(new Animated.Value(1)).current;
  const radarOpacity = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    if (isScanning) {
      radarScale.setValue(1);
      radarOpacity.setValue(0.7);
      animation = Animated.loop(
        Animated.parallel([
          Animated.timing(radarScale, {
            toValue: 1.65,
            duration: 1200,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(radarOpacity, {
            toValue: 0,
            duration: 1200,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
    } else {
      radarScale.setValue(1);
      radarOpacity.setValue(0);
    }

    return () => {
      if (animation) animation.stop();
    };
  }, [isScanning, radarScale, radarOpacity]);

  const startScan = async () => {
    setIsScanning(true);
    setSearchQuery('');
    try {
      const results = await discoverEpsonPrinters();
      const mapped: DiscoveredPrinterDevice[] = results.map((d: any, idx: number) => ({
        id: d.id || d.target || d.macAddress || `dev_${idx}_${Date.now()}`,
        name: d.name || (d.connectionType === 'bluetooth' ? 'Bluetooth Receipt Printer' : 'Network POS Printer'),
        connectionType: d.connectionType || (d.ipAddress ? 'network' : 'bluetooth'),
        target: d.target || d.macAddress,
        ipAddress: d.ipAddress,
        macAddress: d.macAddress,
        isRecommended:
          d.name?.toLowerCase().includes('epson') ||
          d.name?.toLowerCase().includes('m30') ||
          d.name?.toLowerCase().includes('star') ||
          d.name?.toLowerCase().includes('tsp') ||
          d.name?.toLowerCase().includes('sunmi'),
      }));

      setDevices(mapped);
      if (mapped.length > 0) {
        setSelectedDeviceId(mapped[0].id);
      } else {
        setSelectedDeviceId(null);
      }
    } catch (err) {
      console.warn('[BluetoothModal] Scan error:', err);
      setDevices([]);
      setSelectedDeviceId(null);
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (visible) {
      startScan();
      setConnectingDeviceId(null);
    }
  }, [visible]);

  // Tactile connect action with visual pairing indicator
  const handlePairSelected = (device: DiscoveredPrinterDevice) => {
    setSelectedDeviceId(device.id);
    setConnectingDeviceId(device.id);
    setTimeout(() => {
      onSelectPrinter(device);
      setConnectingDeviceId(null);
      onClose();
    }, 450);
  };

  const handleSaveManual = () => {
    const isBt = customConnectionType === 'bluetooth';
    const targetVal = customTarget.trim();
    const ipVal = customIp.trim();

    if (isBt && !targetVal) {
      alert('Please enter a Bluetooth device name or MAC address.');
      return;
    }
    if (!isBt && !ipVal) {
      alert('Please enter a valid printer IP address.');
      return;
    }

    const device: DiscoveredPrinterDevice = {
      id: `custom_${Date.now()}`,
      name: customName.trim() || (isBt ? 'Bluetooth Thermal Printer' : 'Network Thermal Printer'),
      connectionType: customConnectionType,
      target: isBt ? targetVal : undefined,
      ipAddress: !isBt ? ipVal : undefined,
      macAddress: isBt ? (targetVal.startsWith('BT:') ? undefined : targetVal) : undefined,
      isRecommended: false,
    };
    onSelectPrinter(device);
    onClose();
  };

  // Helper for brand badges
  const getBrandInfo = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes('epson') || n.includes('m30') || n.includes('tm-')) {
      return { label: 'EPSON', bg: '#EFF6FF', text: '#1D4ED8' };
    }
    if (n.includes('star') || n.includes('tsp') || n.includes('mc-print')) {
      return { label: 'STAR MICRONICS', bg: '#FFFBEB', text: '#B45309' };
    }
    if (n.includes('sunmi') || n.includes('v2') || n.includes('t2')) {
      return { label: 'SUNMI POS', bg: '#FFF7ED', text: '#C2410C' };
    }
    return { label: 'ESC/POS', bg: '#F3F4F6', text: '#4B5563' };
  };

  // Filtered devices based on search query
  const filteredDevices = devices.filter((d) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      (d.target && d.target.toLowerCase().includes(q)) ||
      (d.macAddress && d.macAddress.toLowerCase().includes(q)) ||
      (d.ipAddress && d.ipAddress.toLowerCase().includes(q))
    );
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.fullScreenSafeArea} edges={['top', 'bottom', 'left', 'right']}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

        {/* ============================================================= */}
        {/* FULL SCREEN UBER EATS TOP NAVIGATION BAR                     */}
        {/* ============================================================= */}
        <View style={styles.topNavBar}>
          <View style={[styles.innerContentContainer, { flexDirection: 'row', alignItems: 'center' }]}>
            <TouchableOpacity onPress={onClose} style={styles.backBtn} activeOpacity={0.7}>
              <ArrowLeft size={22} color="#000000" />
            </TouchableOpacity>

            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.navBarTitle}>Search for printers</Text>
              <Text style={styles.navBarSubtitle} numberOfLines={1}>
                Connect via Bluetooth or IP
              </Text>
            </View>

            <TouchableOpacity onPress={onClose} style={styles.closeRoundBtn} activeOpacity={0.7}>
              <X size={20} color="#000000" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ============================================================= */}
        {/* MAIN BODY AREA                                                */}
        {/* ============================================================= */}
        <View style={styles.mainBodyContainer}>
          <View style={[styles.innerContentContainer, { flex: 1 }]}>
            {/* Segmented Mode Selector (Uber Eats merchant style) */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'discovered' && styles.tabBtnActive]}
                onPress={() => setActiveTab('discovered')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, activeTab === 'discovered' && styles.tabTextActive]}>
                  Nearby Printers {devices.length > 0 ? `(${devices.length})` : ''}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'manual' && styles.tabBtnActive]}
                onPress={() => setActiveTab('manual')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, activeTab === 'manual' && styles.tabTextActive]}>
                  Manual Setup
                </Text>
              </TouchableOpacity>
            </View>

            {/* ============================================================= */}
            {/* TAB 1: NEARBY DISCOVERED PRINTERS                             */}
            {/* ============================================================= */}
            {activeTab === 'discovered' ? (
              <View style={{ flex: 1 }}>
                {/* Status Banner with Live Radar Indicator */}
                <View style={styles.statusBanner}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                    <View style={styles.radarContainer}>
                      {isScanning ? (
                        <>
                          <Animated.View
                            style={[
                              styles.radarWave,
                              {
                                transform: [{ scale: radarScale }],
                                opacity: radarOpacity,
                              },
                            ]}
                          />
                          <View style={styles.radarCenterPulse} />
                        </>
                      ) : (
                        <View style={styles.greenDot} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.statusBannerTitle}>
                        {isScanning
                          ? 'Scanning for Bluetooth & Wi-Fi printers...'
                          : devices.length > 0
                          ? `Found ${devices.length} nearby printer(s)`
                          : 'No printers detected nearby'}
                      </Text>
                      <Text style={styles.statusBannerSub}>
                        {isScanning
                          ? 'Checking BLE, SPP, and ePOS ports'
                          : 'Tap Connect on any printer below to route receipts'}
                      </Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={startScan}
                    disabled={isScanning}
                    style={styles.rescanBtn}
                    activeOpacity={0.7}
                  >
                    {isScanning ? (
                      <ActivityIndicator size="small" color="#000000" />
                    ) : (
                      <RefreshCw size={13} color="#000000" />
                    )}
                    <Text style={styles.rescanBtnText}>{isScanning ? 'Searching' : 'Search again'}</Text>
                  </TouchableOpacity>
                </View>

                {/* Search Filter Bar (if devices present) */}
                {devices.length > 1 ? (
                  <View style={styles.searchBarBox}>
                    <Search size={16} color="#9CA3AF" />
                    <TextInput
                      style={styles.searchBarInput}
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      placeholder="Filter by name, MAC, or IP address..."
                      placeholderTextColor="#9CA3AF"
                    />
                    {searchQuery ? (
                      <TouchableOpacity onPress={() => setSearchQuery('')}>
                        <X size={16} color="#6B7280" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}

                {/* Discovered Printers List */}
                <FlatList
                  data={filteredDevices}
                  keyExtractor={(item) => item.id}
                  style={{ flex: 1 }}
                  contentContainerStyle={{ paddingBottom: 24 }}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => {
                    const isSelected = item.id === selectedDeviceId;
                    const isConnecting = item.id === connectingDeviceId;
                    const isCurrentActive = Boolean(
                      activeTarget &&
                        (item.target === activeTarget ||
                          item.macAddress === activeTarget ||
                          item.ipAddress === activeTarget ||
                          item.id === activeTarget)
                    );
                    const brand = getBrandInfo(item.name);

                    return (
                      <TouchableOpacity
                        style={[
                          styles.deviceRow,
                          isSelected && styles.deviceRowSelected,
                          isCurrentActive && styles.deviceRowActive,
                        ]}
                        onPress={() => handlePairSelected(item)}
                        disabled={isConnecting}
                        activeOpacity={0.85}
                      >
                        {/* Icon Box */}
                        <View
                          style={[
                            styles.deviceIconBox,
                            isCurrentActive && { backgroundColor: '#ECFDF5' },
                          ]}
                        >
                          {item.connectionType === 'bluetooth' ? (
                            <Bluetooth
                              size={24}
                              color={isCurrentActive ? '#059669' : '#000000'}
                            />
                          ) : (
                            <Wifi
                              size={24}
                              color={isCurrentActive ? '#059669' : '#000000'}
                            />
                          )}
                        </View>

                        {/* Device Info */}
                        <View style={{ flex: 1, marginRight: 12 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <Text style={styles.deviceName} numberOfLines={1}>
                              {item.name}
                            </Text>

                            <View style={[styles.brandBadge, { backgroundColor: brand.bg }]}>
                              <Text style={[styles.brandBadgeText, { color: brand.text }]}>
                                {brand.label}
                              </Text>
                            </View>

                            {isCurrentActive ? (
                              <View style={styles.activeBadge}>
                                <View style={styles.activeDot} />
                                <Text style={styles.activeBadgeText}>ACTIVE</Text>
                              </View>
                            ) : null}
                          </View>

                          {/* Target details line */}
                          <Text style={styles.deviceSub} numberOfLines={1}>
                            {item.connectionType === 'bluetooth'
                              ? item.target
                                ? `Bluetooth BLE • ${item.target}`
                                : item.macAddress
                                ? `Bluetooth MAC • ${item.macAddress}`
                                : 'Bluetooth Wireless Connection'
                              : `Network IP • ${item.ipAddress || '192.168.x.x'}`}
                          </Text>
                        </View>

                        {/* Connect Action Button */}
                        <TouchableOpacity
                          style={[
                            styles.connectBtnAction,
                            isCurrentActive && styles.connectBtnActionConnected,
                            isConnecting && styles.connectBtnActionConnecting,
                          ]}
                          onPress={() => handlePairSelected(item)}
                          disabled={isConnecting}
                          activeOpacity={0.8}
                        >
                          {isConnecting ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <ActivityIndicator size="small" color="#FFFFFF" />
                              <Text style={styles.connectBtnActionText}>Pairing...</Text>
                            </View>
                          ) : isCurrentActive ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Check size={14} color="#059669" />
                              <Text style={styles.connectBtnActionConnectedText}>Connected</Text>
                            </View>
                          ) : (
                            <Text style={styles.connectBtnActionText}>Connect</Text>
                          )}
                        </TouchableOpacity>
                      </TouchableOpacity>
                    );
                  }}
                  ListEmptyComponent={
                    !isScanning ? (
                      <View style={styles.emptyBox}>
                        <View style={styles.emptyIconCircle}>
                          <Printer size={34} color="#9CA3AF" />
                        </View>
                        <Text style={styles.emptyTitle}>No printers found nearby</Text>
                        <Text style={styles.emptySub}>
                          {searchQuery
                            ? `No devices matching "${searchQuery}". Clear your search or tap Search again.`
                            : 'Make sure your printer is powered on, has receipt paper loaded, and is within Bluetooth or Wi-Fi range.'}
                        </Text>

                        <TouchableOpacity
                          onPress={startScan}
                          style={styles.emptyRescanBtn}
                          activeOpacity={0.8}
                        >
                          <RefreshCw size={15} color="#FFFFFF" />
                          <Text style={styles.emptyRescanBtnText}>Search again</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null
                  }
                  ListFooterComponent={
                    /* Troubleshooting & Pairing Help Accordion */
                    <View style={styles.helpAccordionContainer}>
                      <TouchableOpacity
                        style={styles.helpAccordionHeader}
                        onPress={() => setShowHelpAccordion(!showHelpAccordion)}
                        activeOpacity={0.7}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <HelpCircle size={18} color="#374151" />
                          <Text style={styles.helpAccordionTitle}>Need help connecting your printer?</Text>
                        </View>
                        {showHelpAccordion ? (
                          <ChevronUp size={18} color="#4B5563" />
                        ) : (
                          <ChevronDown size={18} color="#4B5563" />
                        )}
                      </TouchableOpacity>

                      {showHelpAccordion && (
                        <View style={styles.helpAccordionContent}>
                          <View style={styles.helpStepRow}>
                            <Text style={styles.helpStepNumber}>1</Text>
                            <Text style={styles.helpStepText}>
                              <Text style={{ fontWeight: '700', color: '#000000' }}>Pair in tablet settings first:</Text>{' '}
                              For Bluetooth printers (Star Micronics & Epson), open your tablet's{' '}
                              <Text style={{ fontWeight: '700', color: '#000000' }}>Settings &gt; Bluetooth</Text> and pair first.
                            </Text>
                          </View>

                          <View style={styles.helpStepRow}>
                            <Text style={styles.helpStepNumber}>2</Text>
                            <Text style={styles.helpStepText}>
                              <Text style={{ fontWeight: '700', color: '#000000' }}>Star Micronics TSP143:</Text> Press and
                              hold the red <Text style={{ fontWeight: '700', color: '#000000' }}>PAIR</Text> button on the back for
                              5 seconds until the green LED blinks.
                            </Text>
                          </View>

                          <View style={styles.helpStepRow}>
                            <Text style={styles.helpStepNumber}>3</Text>
                            <Text style={styles.helpStepText}>
                              <Text style={{ fontWeight: '700', color: '#000000' }}>Epson TM-m30 / TM-T88:</Text> Check that the
                              power & Bluetooth LED is solid blue and receipt paper roll is feeding from the bottom.
                            </Text>
                          </View>

                          <View style={styles.helpStepRow}>
                            <Text style={styles.helpStepNumber}>4</Text>
                            <Text style={styles.helpStepText}>
                              <Text style={{ fontWeight: '700', color: '#000000' }}>Network IP:</Text> If your printer is connected
                              via Ethernet or Wi-Fi, use the <Text style={{ fontWeight: '700', color: '#000000' }}>Manual Setup</Text> tab above.
                            </Text>
                          </View>
                        </View>
                      )}
                    </View>
                  }
                />
              </View>
            ) : (
              /* ============================================================= */
              /* TAB 2: MANUAL ENTRY                                           */
              /* ============================================================= */
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 32 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.formCard}>
                  <Text style={styles.formCardHeader}>Configure Printer Connection</Text>

                  <Text style={styles.inputLabel}>Connection Interface</Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                    <TouchableOpacity
                      style={[
                        styles.chipBtn,
                        customConnectionType === 'bluetooth' && styles.chipBtnSelected,
                      ]}
                      onPress={() => setCustomConnectionType('bluetooth')}
                      activeOpacity={0.8}
                    >
                      <Bluetooth size={16} color={customConnectionType === 'bluetooth' ? '#000000' : '#6B7280'} />
                      <Text style={[styles.chipText, customConnectionType === 'bluetooth' && styles.chipTextSelected]}>
                        Bluetooth Wireless
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.chipBtn,
                        customConnectionType === 'network' && styles.chipBtnSelected,
                      ]}
                      onPress={() => setCustomConnectionType('network')}
                      activeOpacity={0.8}
                    >
                      <Wifi size={16} color={customConnectionType === 'network' ? '#000000' : '#6B7280'} />
                      <Text style={[styles.chipText, customConnectionType === 'network' && styles.chipTextSelected]}>
                          IP (LAN / Wi-Fi)
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.inputLabel}>Printer Nickname (Optional)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={customName}
                    onChangeText={setCustomName}
                    placeholder="e.g. Front Counter (Epson TM-m30)"
                    placeholderTextColor="#9CA3AF"
                  />

                  {customConnectionType === 'bluetooth' ? (
                    <>
                      <Text style={styles.inputLabel}>Bluetooth Device Target or MAC Address</Text>
                      <TextInput
                        style={styles.textInput}
                        value={customTarget}
                        onChangeText={setCustomTarget}
                        placeholder="e.g. BT:EP-TM-M30III or 00:01:90:84:7B:A2"
                        placeholderTextColor="#9CA3AF"
                        autoCapitalize="characters"
                      />
                      <Text style={styles.inputHint}>
                        Enter the device name as shown in your tablet's Bluetooth paired list, or the 12-digit MAC address on the printer sticker.
                      </Text>
                    </>
                  ) : (
                    <>
                      <View style={{ flexDirection: 'row', gap: 12 }}>
                        <View style={{ flex: 2 }}>
                          <Text style={styles.inputLabel}>Printer IP Address</Text>
                          <TextInput
                            style={styles.textInput}
                            value={customIp}
                            onChangeText={setCustomIp}
                            placeholder="e.g. 192.168.1.100"
                            placeholderTextColor="#9CA3AF"
                            keyboardType="decimal-pad"
                            autoCapitalize="none"
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.inputLabel}>Port</Text>
                          <TextInput
                            style={styles.textInput}
                            value={customPort}
                            onChangeText={setCustomPort}
                            placeholder="8008"
                            placeholderTextColor="#9CA3AF"
                            keyboardType="number-pad"
                          />
                        </View>
                      </View>
                      <Text style={styles.inputHint}>
                        Use port 8008 for Epson ePOS XML, or port 9100 for standard ESC/POS raw socket printing.
                      </Text>
                    </>
                  )}

                  <View style={styles.buttonRow}>
                    <TouchableOpacity onPress={onClose} style={styles.cancelBtn} activeOpacity={0.7}>
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={handleSaveManual}
                      style={styles.uberBlackBtn}
                      activeOpacity={0.8}
                    >
                      <Check size={17} color="#FFFFFF" />
                      <Text style={styles.uberBlackBtnText}>Connect Printer</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  fullScreenSafeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  innerContentContainer: {
    width: '100%',
    maxWidth: 780,
    alignSelf: 'center',
    paddingHorizontal: 16,
  },

  /* Top Navigation Bar */
  topNavBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 2,
  },
  backBtn: {
    padding: 8,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeRoundBtn: {
    padding: 8,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  navBarTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#000000',
    letterSpacing: -0.3,
  },
  navBarSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },

  /* Main Body */
  mainBodyContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    paddingTop: 16,
  },

  /* Segmented Tabs */
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 9,
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  tabText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#6B7280',
  },
  tabTextActive: {
    fontWeight: '700',
    color: '#000000',
  },

  /* Status Banner */
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  radarContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarWave: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#10B981',
  },
  radarCenterPulse: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#059669',
  },
  greenDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
  },
  statusBannerTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#111827',
  },
  statusBannerSub: {
    fontSize: 11.5,
    color: '#6B7280',
    marginTop: 2,
  },
  rescanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    marginLeft: 8,
  },
  rescanBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000000',
  },

  /* Search Bar */
  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    gap: 8,
  },
  searchBarInput: {
    flex: 1,
    fontSize: 13,
    color: '#000000',
    padding: 0,
  },

  /* Device Rows */
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  deviceRowSelected: {
    borderColor: '#000000',
    backgroundColor: '#FAFAFA',
  },
  deviceRowActive: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  deviceIconBox: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  deviceName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000000',
  },
  deviceSub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },

  /* Badges */
  brandBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 5,
  },
  brandBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 5,
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#059669',
  },
  activeBadgeText: {
    color: '#059669',
    fontSize: 9.5,
    fontWeight: '800',
  },

  /* Connect Button */
  connectBtnAction: {
    backgroundColor: '#000000',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
  },
  connectBtnActionConnecting: {
    backgroundColor: '#374151',
    paddingHorizontal: 12,
  },
  connectBtnActionConnected: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  connectBtnActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  connectBtnActionConnectedText: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '700',
  },

  /* Empty State */
  emptyBox: {
    paddingVertical: 36,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 8,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000000',
  },
  emptySub: {
    fontSize: 12.5,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
    lineHeight: 18,
    maxWidth: 380,
  },
  emptyRescanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#000000',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 9,
  },
  emptyRescanBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  /* Troubleshooting Accordion */
  helpAccordionContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 14,
    overflow: 'hidden',
  },
  helpAccordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  helpAccordionTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#111827',
  },
  helpAccordionContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  helpStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  helpStepNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '800',
    color: '#000000',
    lineHeight: 20,
    marginTop: 1,
  },
  helpStepText: {
    flex: 1,
    fontSize: 12.5,
    color: '#4B5563',
    lineHeight: 18,
  },

  /* Form Card for Manual Tab */
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  formCardHeader: {
    fontSize: 16,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginTop: 6,
    marginBottom: 8,
  },
  inputHint: {
    fontSize: 11.5,
    color: '#6B7280',
    lineHeight: 16,
    marginBottom: 10,
    marginTop: -2,
  },
  textInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 13.5,
    color: '#000000',
    marginBottom: 10,
  },
  chipBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  chipBtnSelected: {
    borderColor: '#000000',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#6B7280',
  },
  chipTextSelected: {
    fontWeight: '700',
    color: '#000000',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 20,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 9,
    backgroundColor: '#F3F4F6',
  },
  cancelBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#374151',
  },
  uberBlackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 9,
    backgroundColor: '#000000',
  },
  uberBlackBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});


