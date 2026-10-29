import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Wifi,
  Bluetooth,
  Smartphone,
  FileText,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  Sliders,
  ChevronDown,
  ChevronUp,
  Info,
  ShieldCheck,
  Zap,
  Printer,
  DollarSign,
  Scissors,
  Layers,
  Wrench,
  Check,
  CornerDownRight,
} from 'lucide-react-native';
import { Header } from '../components/Header';

type GuideTab = 'network' | 'bluetooth' | 'sunmi' | 'system' | 'paper_hardware' | 'troubleshooting';

export default function PrinterGuideScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [activeTab, setActiveTab] = useState<GuideTab>('network');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);

  const openBluetoothSettings = async () => {
    if (Platform.OS === 'android') {
      try {
        await Linking.sendIntent('android.bluetooth.adapter.action.REQUEST_ENABLE');
        return;
      } catch { }
      try {
        await Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS');
        return;
      } catch { }
    }
    await Linking.openSettings();
  };

  const openWifiSettings = async () => {
    if (Platform.OS === 'android') {
      try {
        await Linking.sendIntent('android.settings.WIFI_SETTINGS');
        return;
      } catch { }
    }
    await Linking.openSettings();
  };

  return (
    <View style={styles.container}>
      <Header
        title="Printer Connection Guide"
        subtitle="Complete hardware manual for Network, BT, Sunmi & AirPrint"
        showBackButton={true}

      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollBody,
          {
            paddingHorizontal: isTablet ? 24 : 16,
            maxWidth: 780,
            alignSelf: 'center',
            width: '100%',
            paddingBottom: Math.max(insets.bottom + 24, 48),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Category Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabScroll}
        >
          <TouchableOpacity
            style={[styles.tabChip, activeTab === 'network' && styles.tabChipActive]}
            onPress={() => setActiveTab('network')}
            activeOpacity={0.7}
          >
            <Wifi size={15} color={activeTab === 'network' ? '#059669' : '#64748B'} />
            <Text style={[styles.tabChipText, activeTab === 'network' && styles.tabChipTextActive]}>
              Wi-Fi / LAN
            </Text>
            <View style={styles.proTag}>
              <Text style={styles.proTagText}>BEST</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabChip, activeTab === 'bluetooth' && styles.tabChipActive]}
            onPress={() => setActiveTab('bluetooth')}
            activeOpacity={0.7}
          >
            <Bluetooth size={15} color={activeTab === 'bluetooth' ? '#2563EB' : '#64748B'} />
            <Text style={[styles.tabChipText, activeTab === 'bluetooth' && styles.tabChipTextActive]}>
              Bluetooth
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabChip, activeTab === 'sunmi' && styles.tabChipActive]}
            onPress={() => setActiveTab('sunmi')}
            activeOpacity={0.7}
          >
            <Smartphone size={15} color={activeTab === 'sunmi' ? '#D97706' : '#64748B'} />
            <Text style={[styles.tabChipText, activeTab === 'sunmi' && styles.tabChipTextActive]}>
              Sunmi POS
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabChip, activeTab === 'system' && styles.tabChipActive]}
            onPress={() => setActiveTab('system')}
            activeOpacity={0.7}
          >
            <FileText size={15} color={activeTab === 'system' ? '#7C3AED' : '#64748B'} />
            <Text style={[styles.tabChipText, activeTab === 'system' && styles.tabChipTextActive]}>
              AirPrint / Spooler
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabChip, activeTab === 'paper_hardware' && styles.tabChipActive]}
            onPress={() => setActiveTab('paper_hardware')}
            activeOpacity={0.7}
          >
            <Printer size={15} color={activeTab === 'paper_hardware' ? '#0F766E' : '#64748B'} />
            <Text style={[styles.tabChipText, activeTab === 'paper_hardware' && styles.tabChipTextActive]}>
              Paper & Drawer
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabChip, activeTab === 'troubleshooting' && styles.tabChipActive]}
            onPress={() => setActiveTab('troubleshooting')}
            activeOpacity={0.7}
          >
            <AlertCircle size={15} color={activeTab === 'troubleshooting' ? '#DC2626' : '#64748B'} />
            <Text style={[styles.tabChipText, activeTab === 'troubleshooting' && styles.tabChipTextActive]}>
              Diagnostics & FAQ
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* ========================================================================= */}
        {/* 1. NETWORK (WI-FI / ETHERNET LAN)                                         */}
        {/* ========================================================================= */}
        {activeTab === 'network' && (
          <View>
            {/* Overview Card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconCircle, { backgroundColor: '#ECFDF5' }]}>
                  <Wifi size={22} color="#059669" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.cardTitle}>Network Thermal Printing (Ethernet & Wi-Fi)</Text>
                  <Text style={styles.cardSubtitle}>Recommended for high-volume POS counters & busy kitchen stations</Text>
                </View>
              </View>

              <View style={styles.badgeRow}>
                <View style={styles.badgeSuccess}>
                  <CheckCircle2 size={12} color="#059669" />
                  <Text style={styles.badgeSuccessText}>Android: Fully Supported (TCP 9100)</Text>
                </View>
                <View style={styles.badgeSuccess}>
                  <CheckCircle2 size={12} color="#059669" />
                  <Text style={styles.badgeSuccessText}>iOS: Fully Supported (TCP 9100 & ePOS)</Text>
                </View>
              </View>

              <Text style={styles.hardwareText}>
                <Text style={styles.bold}>Supported Hardware:</Text> Bonkaso POS-8390, Epson TM-T88 / TM-m30, Star Micronics (TSP654 / mC-Print), Xprinter, Rongta, Munbyn, and all standard ESC/POS network printers.
              </Text>
            </View>

            {/* Critical Routing Notice */}
            <View style={styles.warningBox}>
              <AlertCircle size={20} color="#D97706" style={{ marginTop: 1 }} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.warningTitle}>CRITICAL: Turn OFF Mobile Data on Phone/Tablet</Text>
                <Text style={styles.warningText}>
                  When 4G/5G mobile data is active on your phone or tablet, Android and iOS frequently route local private IP addresses (<Text style={styles.code}>192.168.x.x</Text>) to the cellular network instead of your Wi-Fi router.
                  {'\n\n'}
                  <Text style={styles.bold}>Result:</Text> Connection attempts time out after 6 seconds (<Text style={styles.code}>TCP connection timed out</Text>).
                  {'\n'}
                  <Text style={styles.bold}>Fix:</Text> Turn <Text style={styles.bold}>OFF Mobile Data</Text> in quick settings and connect your device to the exact same Wi-Fi router as the printer.
                </Text>
              </View>
            </View>

            {/* Detailed Step-by-Step Instructions */}
            <View style={styles.card}>
              <Text style={styles.cardSectionHeading}>COMPLETE SETUP WALKTHROUGH</Text>

              {/* Step 1 */}
              <View style={styles.detailedStep}>
                <View style={styles.stepNumCircle}><Text style={styles.stepNumText}>1</Text></View>
                <View style={styles.detailedStepContent}>
                  <Text style={styles.stepTitle}>Cabling & Power Indicator</Text>
                  <Text style={styles.stepDesc}>
                    Connect an RJ45 Ethernet cable from a LAN port on your Wi-Fi router directly into the back of the printer. Turn the printer power switch <Text style={styles.bold}>ON</Text>. Look at the Ethernet port on the back of the printer:
                  </Text>
                  <View style={styles.bulletList}>
                    <Text style={styles.bulletItem}>• <Text style={styles.bold}>Green LED:</Text> Solid indicates active physical Ethernet link.</Text>
                    <Text style={styles.bulletItem}>• <Text style={styles.bold}>Orange LED:</Text> Flashing indicates active local network traffic.</Text>
                  </View>
                </View>
              </View>

              {/* Step 2 */}
              <View style={styles.detailedStep}>
                <View style={styles.stepNumCircle}><Text style={styles.stepNumText}>2</Text></View>
                <View style={styles.detailedStepContent}>
                  <Text style={styles.stepTitle}>Print Hardware Self-Test Slip (Find Printer IP)</Text>
                  <Text style={styles.stepDesc}>
                    Thermal printers print their current IP, subnet mask, gateway, and MAC address on a self-test configuration receipt:
                  </Text>
                  <View style={styles.numberedBox}>
                    <Text style={styles.numberedItem}>1. Turn printer power switch <Text style={styles.bold}>OFF</Text>.</Text>
                    <Text style={styles.numberedItem}>2. Hold down the <Text style={styles.bold}>FEED</Text> button on the top panel.</Text>
                    <Text style={styles.numberedItem}>3. While holding <Text style={styles.bold}>FEED</Text>, turn the power switch <Text style={styles.bold}>ON</Text>.</Text>
                    <Text style={styles.numberedItem}>4. Keep holding <Text style={styles.bold}>FEED</Text> for 2–3 seconds until the printer starts printing, then release.</Text>
                    <Text style={styles.numberedItem}>5. Inspect the slip for <Text style={styles.code}>IP Address</Text> (e.g. <Text style={styles.bold}>192.168.1.200</Text> or <Text style={styles.bold}>192.168.0.200</Text>).</Text>
                  </View>
                </View>
              </View>

              {/* Step 3 */}
              <View style={styles.detailedStep}>
                <View style={styles.stepNumCircle}><Text style={styles.stepNumText}>3</Text></View>
                <View style={styles.detailedStepContent}>
                  <Text style={styles.stepTitle}>Subnet Matching (Router vs Printer)</Text>
                  <Text style={styles.stepDesc}>
                    Your phone/tablet and printer <Text style={styles.bold}>must be on the same subnet</Text>:
                  </Text>
                  <View style={styles.tableCard}>
                    <View style={styles.tableRowHeader}>
                      <Text style={styles.tableColHeader}>Device</Text>
                      <Text style={styles.tableColHeader}>Subnet Example</Text>
                      <Text style={styles.tableColHeader}>Status</Text>
                    </View>
                    <View style={styles.tableRow}>
                      <Text style={styles.tableColBold}>Router / Phone</Text>
                      <Text style={styles.tableCol}>192.168.<Text style={styles.bold}>1</Text>.x</Text>
                      <Text style={styles.tableCol}>Gateway 192.168.1.1</Text>
                    </View>
                    <View style={styles.tableRow}>
                      <Text style={styles.tableColBold}>Printer</Text>
                      <Text style={styles.tableCol}>192.168.<Text style={styles.bold}>1</Text>.200</Text>
                      <Text style={[styles.tableCol, { color: '#059669', fontWeight: '700' }]}>✓ MATCH (OK)</Text>
                    </View>
                    <View style={[styles.tableRow, { borderBottomWidth: 0 }]}>
                      <Text style={styles.tableColBold}>Factory Default</Text>
                      <Text style={styles.tableCol}>192.168.<Text style={[styles.bold, { color: '#DC2626' }]}>0</Text>.200</Text>
                      <Text style={[styles.tableCol, { color: '#DC2626', fontWeight: '700' }]}>✗ MISMATCH</Text>
                    </View>
                  </View>
                  <View style={styles.tipBox}>
                    <Info size={14} color="#2563EB" style={{ marginTop: 1 }} />
                    <Text style={styles.tipBoxText}>
                      <Text style={styles.bold}>If Subnet is 0 (192.168.0.200):</Text> Use the printer configuration utility (<Text style={styles.bold}>PRINT_SET V1.5</Text> on Windows PC) via UDP broadcast (<Text style={styles.bold}>"Cross network set IP"</Text>) to set the New IP to <Text style={styles.code}>192.168.1.200</Text> and Gateway to <Text style={styles.code}>192.168.1.1</Text>.
                    </Text>
                  </View>
                </View>
              </View>

              {/* Step 4 */}
              <View style={styles.detailedStep}>
                <View style={styles.stepNumCircle}><Text style={styles.stepNumText}>4</Text></View>
                <View style={styles.detailedStepContent}>
                  <Text style={styles.stepTitle}>Connect in Krifoo Admin Wizard</Text>
                  <Text style={styles.stepDesc}>
                    1. In Krifoo Admin, tap <Text style={styles.bold}>Printer Setup Wizard</Text>.{'\n'}
                    2. Choose <Text style={styles.bold}>Wi-Fi / LAN Network</Text>.{'\n'}
                    3. Enter the Printer IP Address (e.g. <Text style={styles.code}>192.168.1.200</Text>).{'\n'}
                    4. Enter Port <Text style={styles.code}>9100</Text> (standard universal ESC/POS raw socket).{'\n'}
                    5. Tap <Text style={styles.bold}>Connect & Continue</Text>.
                  </Text>
                </View>
              </View>

              {/* Step 5 */}
              <View style={[styles.detailedStep, { borderBottomWidth: 0 }]}>
                <View style={styles.stepNumCircle}><Text style={styles.stepNumText}>5</Text></View>
                <View style={styles.detailedStepContent}>
                  <Text style={styles.stepTitle}>Verify Handshake & Print Test</Text>
                  <Text style={styles.stepDesc}>
                    The app immediately pings the socket and performs a bidirectional ESC/POS pulse handshake. Look for the green badge:
                    {'\n'}
                    <Text style={[styles.bold, { color: '#059669' }]}>"Network Link Confirmed • Ready to Print"</Text>
                    {'\n\n'}
                    Tap <Text style={styles.bold}>Print Test Receipt</Text> to verify layout and paper alignment, then tap <Text style={styles.bold}>Save & Start Printing</Text>.
                  </Text>
                </View>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.buttonRow}>
              {Platform.OS === 'android' && (
                <TouchableOpacity style={styles.secondaryBtn} onPress={openWifiSettings} activeOpacity={0.8}>
                  <Text style={styles.secondaryBtnText}>Wi-Fi Settings</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => router.push('/printer-settings')}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryBtnText}>Open Printer Setup</Text>
                <ChevronRight size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ========================================================================= */}
        {/* 2. BLUETOOTH                                                              */}
        {/* ========================================================================= */}
        {activeTab === 'bluetooth' && (
          <View>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconCircle, { backgroundColor: '#EFF6FF' }]}>
                  <Bluetooth size={22} color="#2563EB" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.cardTitle}>Bluetooth Wireless Printing</Text>
                  <Text style={styles.cardSubtitle}>For front counter tablet stands, food trucks & portable handhelds</Text>
                </View>
              </View>

              <View style={styles.badgeRow}>
                <View style={styles.badgeSuccess}>
                  <CheckCircle2 size={12} color="#059669" />
                  <Text style={styles.badgeSuccessText}>Android: 100% Compatible (Classic SPP)</Text>
                </View>
                <View style={styles.badgeAlert}>
                  <AlertCircle size={12} color="#DC2626" />
                  <Text style={styles.badgeAlertText}>iOS: BLE GATT Only (MFi Restricted)</Text>
                </View>
              </View>

              <Text style={styles.hardwareText}>
                <Text style={styles.bold}>Supported Hardware:</Text> All ESC/POS desktop thermal Bluetooth stations, 58mm/80mm portable Bluetooth receipt belts, Star TSP654IIIBI, Epson TM-m30 BLE.
              </Text>
            </View>

            {/* Apple MFi vs Android Notice */}
            <View style={styles.infoBox}>
              <AlertCircle size={20} color="#2563EB" style={{ marginTop: 1 }} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.infoTitle}>Crucial Difference: Android vs iPad / iPhone</Text>
                <Text style={styles.infoText}>
                  • <Text style={styles.bold}>Android Devices:</Text> Connect directly to virtually all Bluetooth thermal receipt printers via Classic Bluetooth SPP (Serial Port Profile).{'\n\n'}
                  • <Text style={styles.bold}>Apple iPads & iPhones:</Text> Apple strictly restricts Classic Bluetooth SPP unless the printer manufacturer paid for an official Apple MFi cryptographic security chip. Standard generic Bluetooth receipt printers will <Text style={styles.bold}>NOT</Text> appear in iPad Bluetooth searches. For iPad, use <Text style={styles.bold}>Wi-Fi / LAN Network (Port 9100)</Text>, Apple AirPrint, or certified BLE printers.
                </Text>
              </View>
            </View>

            {/* Android Setup Walkthrough */}
            <View style={styles.card}>
              <Text style={styles.cardSectionHeading}>ANDROID PAIRING & SETUP WALKTHROUGH</Text>

              {/* Step 1 */}
              <View style={styles.detailedStep}>
                <View style={styles.stepNumCircle}><Text style={styles.stepNumText}>1</Text></View>
                <View style={styles.detailedStepContent}>
                  <Text style={styles.stepTitle}>Power On Printer</Text>
                  <Text style={styles.stepDesc}>
                    Turn on the printer power switch. Verify the green power LED is lit and the thermal paper roll is loaded. Ensure the printer is within 3–5 meters of your tablet.
                  </Text>
                </View>
              </View>

              {/* Step 2 */}
              <View style={styles.detailedStep}>
                <View style={styles.stepNumCircle}><Text style={styles.stepNumText}>2</Text></View>
                <View style={styles.detailedStepContent}>
                  <Text style={styles.stepTitle}>Pair in Android System Settings First</Text>
                  <Text style={styles.stepDesc}>
                    Bluetooth thermal printers <Text style={styles.bold}>must be paired in Android OS Settings</Text> before POS apps can communicate with them:
                  </Text>
                  <View style={styles.numberedBox}>
                    <Text style={styles.numberedItem}>1. Open your tablet's Android <Text style={styles.bold}>Settings</Text>.</Text>
                    <Text style={styles.numberedItem}>2. Tap <Text style={styles.bold}>Connected devices</Text> → <Text style={styles.bold}>Bluetooth</Text>.</Text>
                    <Text style={styles.numberedItem}>3. Tap <Text style={styles.bold}>Pair new device</Text>.</Text>
                    <Text style={styles.numberedItem}>4. Select your printer name (e.g. <Text style={styles.code}>POS-8390</Text>, <Text style={styles.code}>RP-80</Text>, or <Text style={styles.code}>BT Printer</Text>).</Text>
                    <Text style={styles.numberedItem}>5. When asked for PIN, enter <Text style={styles.code}>0000</Text> or <Text style={styles.code}>1234</Text> (or <Text style={styles.code}>1111</Text> / <Text style={styles.code}>8888</Text>).</Text>
                    <Text style={styles.numberedItem}>6. Confirm the printer appears in your <Text style={styles.bold}>"Paired devices"</Text> list.</Text>
                  </View>
                </View>
              </View>

              {/* Step 3 */}
              <View style={styles.detailedStep}>
                <View style={styles.stepNumCircle}><Text style={styles.stepNumText}>3</Text></View>
                <View style={styles.detailedStepContent}>
                  <Text style={styles.stepTitle}>Allow Permissions in Krifoo Admin</Text>
                  <Text style={styles.stepDesc}>
                    Open Krifoo Admin → tap <Text style={styles.bold}>Printer Setup Wizard</Text> → select <Text style={styles.bold}>Wireless Bluetooth</Text>.
                    {'\n\n'}
                    When prompted by Android, grant <Text style={styles.bold}>"Nearby devices"</Text> and <Text style={styles.bold}>"Location"</Text> permissions (mandated by Android 12+ for hardware device communication).
                  </Text>
                </View>
              </View>

              {/* Step 4 */}
              <View style={[styles.detailedStep, { borderBottomWidth: 0 }]}>
                <View style={styles.stepNumCircle}><Text style={styles.stepNumText}>4</Text></View>
                <View style={styles.detailedStepContent}>
                  <Text style={styles.stepTitle}>Select Printer & Confirm Link</Text>
                  <Text style={styles.stepDesc}>
                    Your paired printer will appear in the scanner list. Tap <Text style={styles.bold}>Select</Text>.
                    {'\n\n'}
                    The app tests the SPP serial handshake. Tap <Text style={styles.bold}>Print Test Receipt</Text> to verify, then tap <Text style={styles.bold}>Save & Start Printing</Text>.
                  </Text>
                </View>
              </View>
            </View>

            {/* Quick Actions */}
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={openBluetoothSettings} activeOpacity={0.8}>
                <Text style={styles.secondaryBtnText}>Bluetooth Settings</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => router.push('/printer-settings')}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryBtnText}>Open Printer Setup</Text>
                <ChevronRight size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ========================================================================= */}
        {/* 3. SUNMI POS BUILT-IN                                                     */}
        {/* ========================================================================= */}
        {activeTab === 'sunmi' && (
          <View>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconCircle, { backgroundColor: '#FEF3C7' }]}>
                  <Smartphone size={22} color="#D97706" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.cardTitle}>Sunmi POS Built-in Terminal</Text>
                  <Text style={styles.cardSubtitle}>For all-in-one Sunmi handhelds & desktop terminals</Text>
                </View>
              </View>

              <View style={styles.badgeRow}>
                <View style={styles.badgeSuccess}>
                  <CheckCircle2 size={12} color="#059669" />
                  <Text style={styles.badgeSuccessText}>Zero Pairing Required</Text>
                </View>
                <View style={styles.badgeSuccess}>
                  <CheckCircle2 size={12} color="#059669" />
                  <Text style={styles.badgeSuccessText}>Internal Hardware AIDL Bus</Text>
                </View>
              </View>

              <Text style={styles.hardwareText}>
                <Text style={styles.bold}>Supported Models:</Text> Sunmi V2, V2 Pro, V2s, V3 Mix, T2, T2 Mini, T2s, D2s, K2 kiosk terminals.
              </Text>
            </View>

            {/* How Sunmi works */}
            <View style={styles.card}>
              <Text style={styles.cardSectionHeading}>DIRECT HARDWARE INTEGRATION</Text>
              <Text style={styles.paragraph}>
                Sunmi POS devices include an internal thermal printhead directly wired into the motherboard. Krifoo Admin interfaces directly via Sunmi's official Android system service (<Text style={styles.code}>woyou.aidlservice.jiuiv5</Text>).
                {'\n\n'}
                • No Bluetooth pairing needed.{'\n'}
                • No IP address or network cables needed.{'\n'}
                • Instantaneous response with zero latency.
              </Text>

              <View style={styles.divider} />

              <View style={styles.stepRow}>
                <View style={styles.stepNum}><Text style={styles.stepNumText}>1</Text></View>
                <Text style={styles.stepText}>
                  Open Krifoo Admin → <Text style={styles.bold}>Printer Setup Wizard</Text>.
                </Text>
              </View>

              <View style={styles.stepRow}>
                <View style={styles.stepNum}><Text style={styles.stepNumText}>2</Text></View>
                <Text style={styles.stepText}>
                  Select <Text style={styles.bold}>Sunmi POS Built-in Thermal Printer</Text>. The app immediately binds to the internal service.
                </Text>
              </View>

              <View style={styles.stepRow}>
                <View style={styles.stepNum}><Text style={styles.stepNumText}>3</Text></View>
                <Text style={styles.stepText}>
                  Select roll size: choose <Text style={styles.bold}>58mm</Text> for handhelds (V2/V2 Pro), or <Text style={styles.bold}>80mm</Text> for desktop terminals (T2/T2s).
                </Text>
              </View>

              <View style={styles.stepRow}>
                <View style={styles.stepNum}><Text style={styles.stepNumText}>4</Text></View>
                <Text style={styles.stepText}>
                  Tap <Text style={styles.bold}>Print Test Receipt</Text> to verify razor-sharp thermal output → tap <Text style={styles.bold}>Save & Start Printing</Text>.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.primaryBtnFull}
              onPress={() => router.push('/printer-settings')}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>Open Printer Setup</Text>
              <ChevronRight size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* ========================================================================= */}
        {/* 4. SYSTEM PRINT SPOOLER                                                   */}
        {/* ========================================================================= */}
        {activeTab === 'system' && (
          <View>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconCircle, { backgroundColor: '#EDE9FE' }]}>
                  <FileText size={22} color="#7C3AED" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.cardTitle}>System Print Spooler (AirPrint / Android)</Text>
                  <Text style={styles.cardSubtitle}>Universal fallback for standard wireless office & laser printers</Text>
                </View>
              </View>

              <View style={styles.badgeRow}>
                <View style={styles.badgeSuccess}>
                  <CheckCircle2 size={12} color="#059669" />
                  <Text style={styles.badgeSuccessText}>iOS: Apple AirPrint</Text>
                </View>
                <View style={styles.badgeSuccess}>
                  <CheckCircle2 size={12} color="#059669" />
                  <Text style={styles.badgeSuccessText}>Android: Mopria / Print Services</Text>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardSectionHeading}>WHEN TO USE SYSTEM SPOOLER</Text>
              <Text style={styles.paragraph}>
                Use System Print Spooler when printing to standard Wi-Fi office printers (A4 / Letter), AirPrint-certified thermal stations, or when direct binary driver communication is unavailable.
              </Text>

              <View style={styles.divider} />

              <View style={styles.stepRow}>
                <View style={styles.stepNum}><Text style={styles.stepNumText}>1</Text></View>
                <Text style={styles.stepText}>
                  Verify your printer is discoverable on your phone's native print menu (AirPrint on iPhone/iPad, or Mopria Print Service on Android).
                </Text>
              </View>

              <View style={styles.stepRow}>
                <View style={styles.stepNum}><Text style={styles.stepNumText}>2</Text></View>
                <Text style={styles.stepText}>
                  In Krifoo Admin → <Text style={styles.bold}>Printer Setup Wizard</Text> → select <Text style={styles.bold}>System Spooler (AirPrint / Android)</Text>.
                </Text>
              </View>

              <View style={styles.stepRow}>
                <View style={styles.stepNum}><Text style={styles.stepNumText}>3</Text></View>
                <Text style={styles.stepText}>
                  When receipts print, Krifoo Admin renders formatted HTML thermal receipts and passes them to the operating system print dialog.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.primaryBtnFull}
              onPress={() => router.push('/printer-settings')}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>Open Printer Setup</Text>
              <ChevronRight size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* ========================================================================= */}
        {/* 5. PAPER, CUTTER & CASH DRAWER                                            */}
        {/* ========================================================================= */}
        {activeTab === 'paper_hardware' && (
          <View>
            {/* Paper Orientation Card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconCircle, { backgroundColor: '#F0FDFA' }]}>
                  <Printer size={22} color="#0F766E" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.cardTitle}>Thermal Paper Roll Loading</Text>
                  <Text style={styles.cardSubtitle}>Thermal paper only has heat-sensitive coating on one side</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <Text style={styles.paragraph}>
                <Text style={styles.bold}>How to tell if thermal paper is right-side up:</Text>
                {'\n'}
                Scratch the paper surface firmly with your fingernail. If a <Text style={styles.bold}>black friction line</Text> appears, that is the active thermal chemical side!
                {'\n\n'}
                <Text style={styles.bold}>Correct Insertion:</Text>
                {'\n'}
                Place the roll into the cradle so the paper feeds <Text style={styles.bold}>from the bottom of the spool upward toward the front cutter</Text>. If inserted backward, the printer will spin and feed blank white paper with no text.
              </Text>
            </View>

            {/* 58mm vs 80mm Roll Widths */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconCircle, { backgroundColor: '#F1F5F9' }]}>
                  <Layers size={22} color="#334155" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.cardTitle}>58mm vs 80mm Paper Widths</Text>
                  <Text style={styles.cardSubtitle}>Choosing the right column width in template customization</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.tableCard}>
                <View style={styles.tableRowHeader}>
                  <Text style={styles.tableColHeader}>Specification</Text>
                  <Text style={styles.tableColHeader}>58mm Roll</Text>
                  <Text style={styles.tableColHeader}>80mm Roll</Text>
                </View>
                <View style={styles.tableRow}>
                  <Text style={styles.tableColBold}>Physical Width</Text>
                  <Text style={styles.tableCol}>2.25 inches (58mm)</Text>
                  <Text style={styles.tableCol}>3.125 inches (80mm)</Text>
                </View>
                <View style={styles.tableRow}>
                  <Text style={styles.tableColBold}>Text Columns</Text>
                  <Text style={styles.tableCol}>32 characters/line</Text>
                  <Text style={styles.tableCol}>48 characters/line</Text>
                </View>
                <View style={styles.tableRow}>
                  <Text style={styles.tableColBold}>Auto-Cutter</Text>
                  <Text style={styles.tableCol}>Manual tear bar</Text>
                  <Text style={styles.tableCol}>Motorized auto-cut</Text>
                </View>
                <View style={[styles.tableRow, { borderBottomWidth: 0 }]}>
                  <Text style={styles.tableColBold}>Best For</Text>
                  <Text style={styles.tableCol}>Handhelds & Mobile</Text>
                  <Text style={styles.tableCol}>Counters & Kitchen</Text>
                </View>
              </View>
            </View>

            {/* Cash Drawer RJ11 Port */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconCircle, { backgroundColor: '#ECFDF5' }]}>
                  <DollarSign size={22} color="#059669" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.cardTitle}>Cash Drawer (RJ11) Kick Port</Text>
                  <Text style={styles.cardSubtitle}>Automatic cash drawer kick on cash order completion</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <Text style={styles.paragraph}>
                Standard POS cash drawers do not connect to tablets directly. They plug into the <Text style={styles.bold}>RJ11/RJ12 modular port</Text> on the back of your thermal receipt printer.
                {'\n\n'}
                When a cash payment is completed, Krifoo Admin transmits an electrical pulse code (<Text style={styles.code}>ESC p 0 25 250</Text>) through the printer to instantly pop the cash drawer open.
                {'\n\n'}
                You can test drawer kick anytime from <Text style={styles.bold}>Printer Settings → Test Cash Drawer</Text>.
              </Text>
            </View>
          </View>
        )}

        {/* ========================================================================= */}
        {/* 6. DIAGNOSTICS & TROUBLESHOOTING FAQ                                      */}
        {/* ========================================================================= */}
        {activeTab === 'troubleshooting' && (
          <View>
            <View style={[styles.card, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconCircle, { backgroundColor: '#FEE2E2' }]}>
                  <AlertCircle size={22} color="#DC2626" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.cardTitle}>Diagnostic & Troubleshooting FAQ</Text>
                  <Text style={styles.cardSubtitle}>Tap any issue below for exact resolution steps</Text>
                </View>
              </View>
            </View>

            {[
              {
                id: 0,
                title: 'TCP connection to IP:9100 timed out after 6s',
                badge: 'NETWORK',
                answer:
                  '1. Turn OFF Mobile Data (4G/5G) on your phone/tablet. This is the #1 cause on mobile devices: having cellular data active causes Android/iOS to route private intranet IPs out to mobile data instead of the local Wi-Fi router.\n\n2. Verify Wi-Fi network: ensure your tablet is connected to the primary Wi-Fi SSID of the same router where the printer is plugged in. Avoid "Guest Wi-Fi" or 5GHz networks with AP Client Isolation enabled.\n\n3. Check Subnet matching: print the self-test slip (hold FEED while turning ON). If printer is on 192.168.0.200 while your router is on 192.168.1.1, change printer IP to 192.168.1.200 using PRINT_SET V1.5 on PC.',
              },
              {
                id: 1,
                title: 'Connection refused on Port 9100',
                badge: 'SOCKET BUSY',
                answer:
                  'Budget thermal receipt printers operate in "Single Connect" mode and only allow 1 active device socket at a time. If another computer, phone, or test script has the port open, the printer refuses new connections.\n\nFix: Turn the printer power switch OFF for 5 seconds and turn it back ON. This forcefully closes and resets the listening socket.',
              },
              {
                id: 2,
                title: 'Printer prints raw text & <epos-print> XML',
                badge: 'DRIVER',
                answer:
                  'This occurs when an app sends Epson HTTP/SOAP XML web payloads to port 9100 on a raw ESC/POS printer. Krifoo Admin v1.0.13+ automatically maps Port 9100 to the high-speed binary ESC/POS socket. Make sure Port 9100 is selected in your printer settings.',
              },
              {
                id: 3,
                title: 'Blank white paper feeds out with no text',
                badge: 'PAPER',
                answer:
                  'Thermal paper only has heat-sensitive chemical coating on one side. The paper roll is currently upside down.\n\nFix: Open the printer lid, flip the paper roll over so the paper feeds from the bottom of the spool towards the front tear bar, and close the lid firmly.',
              },
              {
                id: 4,
                title: 'Bluetooth printer not showing in scanner',
                badge: 'BLUETOOTH',
                answer:
                  '1. Desktop Bluetooth printers MUST be paired in Android System Settings first before apps can see them. Open tablet Settings → Bluetooth → Pair New Device (PIN: 0000 or 1234).\n\n2. Ensure "Nearby Devices" permission is granted for Krifoo Admin in tablet App Permissions.\n\n3. Remember that iOS (iPhone/iPad) blocks generic Classic Bluetooth receipt printers due to Apple MFi licensing restrictions.',
              },
              {
                id: 5,
                title: 'Auto-cutter is not cutting paper',
                badge: 'HARDWARE',
                answer:
                  '1. 58mm portable printers do not have motorized cutters; they feature a manual serrated tear bar. In Step 3 preferences, toggle "Auto Cut" OFF.\n\n2. For 80mm printers, ensure the paper roll cover is pushed completely down until both latches click into place.',
              },
            ].map((faq) => {
              const isOpen = expandedFaq === faq.id;
              return (
                <TouchableOpacity
                  key={faq.id}
                  style={styles.faqCard}
                  onPress={() => setExpandedFaq(isOpen ? null : faq.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.faqCardHeader}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.faqTagRow}>
                        <View style={styles.faqTag}>
                          <Text style={styles.faqTagText}>{faq.badge}</Text>
                        </View>
                      </View>
                      <Text style={styles.faqCardTitle}>{faq.title}</Text>
                    </View>
                    {isOpen ? (
                      <ChevronUp size={20} color="#64748B" />
                    ) : (
                      <ChevronDown size={20} color="#64748B" />
                    )}
                  </View>
                  {isOpen && (
                    <Text style={styles.faqCardAnswer}>{faq.answer}</Text>
                  )}
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={[styles.primaryBtnFull, { marginTop: 12 }]}
              onPress={() => router.push('/printer-settings')}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>Open Printer Setup</Text>
              <ChevronRight size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollBody: {
    paddingTop: 12,
  },
  openWizardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginRight: 4,
  },
  openWizardBtnText: {
    fontSize: 12,
    fontFamily: 'InterTight_600SemiBold',
    color: '#059669',
    marginLeft: 4,
  },
  tabScroll: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  tabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  tabChipActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
  },
  tabChipText: {
    fontSize: 13,
    fontFamily: 'InterTight_500Medium',
    color: '#64748B',
  },
  tabChipTextActive: {
    fontFamily: 'InterTight_700Bold',
    color: '#059669',
  },
  proTag: {
    backgroundColor: '#059669',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  proTagText: {
    fontSize: 9,
    fontFamily: 'InterTight_700Bold',
    color: '#FFFFFF',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: 'InterTight_700Bold',
    color: '#111827',
  },
  cardSubtitle: {
    fontSize: 12,
    fontFamily: 'InterTight_400Regular',
    color: '#64748B',
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  badgeSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 5,
  },
  badgeSuccessText: {
    fontSize: 11,
    fontFamily: 'InterTight_600SemiBold',
    color: '#059669',
  },
  badgeAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 5,
  },
  badgeAlertText: {
    fontSize: 11,
    fontFamily: 'InterTight_600SemiBold',
    color: '#DC2626',
  },
  hardwareText: {
    fontSize: 12,
    fontFamily: 'InterTight_400Regular',
    color: '#475569',
    marginTop: 12,
    lineHeight: 18,
  },
  cardSectionHeading: {
    fontSize: 11.5,
    fontFamily: 'InterTight_700Bold',
    color: '#64748B',
    letterSpacing: 0.6,
    marginBottom: 14,
  },
  detailedStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingBottom: 16,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  stepNumCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 1,
  },
  stepNumText: {
    fontSize: 12,
    fontFamily: 'InterTight_700Bold',
    color: '#FFFFFF',
  },
  detailedStepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 14,
    fontFamily: 'InterTight_700Bold',
    color: '#0F172A',
    marginBottom: 4,
  },
  stepDesc: {
    fontSize: 12.5,
    fontFamily: 'InterTight_400Regular',
    color: '#475569',
    lineHeight: 19,
  },
  bulletList: {
    marginTop: 6,
    gap: 4,
  },
  bulletItem: {
    fontSize: 12,
    fontFamily: 'InterTight_400Regular',
    color: '#334155',
  },
  numberedBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  numberedItem: {
    fontSize: 12,
    fontFamily: 'InterTight_400Regular',
    color: '#334155',
    lineHeight: 18,
  },
  tableCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 8,
    overflow: 'hidden',
  },
  tableRowHeader: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tableColHeader: {
    flex: 1,
    fontSize: 11,
    fontFamily: 'InterTight_700Bold',
    color: '#475569',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableColBold: {
    flex: 1,
    fontSize: 11.5,
    fontFamily: 'InterTight_600SemiBold',
    color: '#0F172A',
  },
  tableCol: {
    flex: 1,
    fontSize: 11.5,
    fontFamily: 'InterTight_400Regular',
    color: '#475569',
  },
  tipBox: {
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    padding: 9,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    gap: 6,
  },
  tipBoxText: {
    flex: 1,
    fontSize: 11.5,
    fontFamily: 'InterTight_400Regular',
    color: '#1E40AF',
    lineHeight: 17,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    padding: 13,
    marginBottom: 14,
  },
  warningTitle: {
    fontSize: 13,
    fontFamily: 'InterTight_700Bold',
    color: '#92400E',
    marginBottom: 3,
  },
  warningText: {
    fontSize: 12,
    fontFamily: 'InterTight_400Regular',
    color: '#78350F',
    lineHeight: 18,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    padding: 13,
    marginBottom: 14,
  },
  infoTitle: {
    fontSize: 13,
    fontFamily: 'InterTight_700Bold',
    color: '#1E40AF',
    marginBottom: 3,
  },
  infoText: {
    fontSize: 12,
    fontFamily: 'InterTight_400Regular',
    color: '#1E3A8A',
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  stepText: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: 'InterTight_400Regular',
    color: '#334155',
    lineHeight: 18,
  },
  paragraph: {
    fontSize: 12.5,
    fontFamily: 'InterTight_400Regular',
    color: '#475569',
    lineHeight: 19,
  },
  bold: {
    fontFamily: 'InterTight_700Bold',
    color: '#0F172A',
  },
  code: {
    fontFamily: 'InterTight_700Bold',
    color: '#059669',
    backgroundColor: '#F1F5F9',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    marginBottom: 12,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 13,
    fontFamily: 'InterTight_600SemiBold',
    color: '#334155',
  },
  primaryBtn: {
    flex: 1.2,
    flexDirection: 'row',
    backgroundColor: '#059669',
    paddingVertical: 11,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  primaryBtnFull: {
    flexDirection: 'row',
    backgroundColor: '#059669',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 4,
    marginBottom: 12,
  },
  primaryBtnText: {
    fontSize: 13,
    fontFamily: 'InterTight_600SemiBold',
    color: '#FFFFFF',
  },
  faqCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  faqCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  faqTagRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  faqTag: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  faqTagText: {
    fontSize: 9.5,
    fontFamily: 'InterTight_700Bold',
    color: '#475569',
  },
  faqCardTitle: {
    fontSize: 13.5,
    fontFamily: 'InterTight_700Bold',
    color: '#0F172A',
    lineHeight: 18,
  },
  faqCardAnswer: {
    fontSize: 12.5,
    fontFamily: 'InterTight_400Regular',
    color: '#475569',
    lineHeight: 19,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
});
