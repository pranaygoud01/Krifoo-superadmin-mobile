import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ActivityIndicator,
  FlatList,
  TextInput,
  ScrollView,
} from 'react-native';
import { Colors } from '../constants/colors';
import { Printer, Bluetooth, RefreshCw, CheckCircle2, X, ShieldCheck, Edit3, Radio } from 'lucide-react-native';
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
  onClose: () => void;
  onSelectPrinter: (device: DiscoveredPrinterDevice) => void;
}

export const BluetoothPrinterModal: React.FC<BluetoothPrinterModalProps> = ({
  visible,
  onClose,
  onSelectPrinter,
}) => {
  const [activeTab, setActiveTab] = useState<'discovered' | 'manual'>('discovered');
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<DiscoveredPrinterDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  // Custom manual entry states per individual user credentials
  const [customName, setCustomName] = useState('');
  const [customConnectionType, setCustomConnectionType] = useState<'bluetooth' | 'network'>('bluetooth');
  const [customTarget, setCustomTarget] = useState('');
  const [customIp, setCustomIp] = useState('');

  const startScan = async () => {
    setIsScanning(true);
    try {
      const results = await discoverEpsonPrinters();
      const mapped: DiscoveredPrinterDevice[] = results.map((d: any, idx: number) => ({
        id: d.id || d.target || d.macAddress || `dev_${idx}_${Date.now()}`,
        name: d.name || (d.connectionType === 'bluetooth' ? 'Bluetooth Thermal Printer' : 'Network POS Printer'),
        connectionType: d.connectionType || (d.ipAddress ? 'network' : 'bluetooth'),
        target: d.target || d.macAddress,
        ipAddress: d.ipAddress,
        macAddress: d.macAddress,
        isRecommended: d.name?.includes('Epson') || d.name?.includes('m30') || d.name?.includes('TM'),
      }));

      setDevices(mapped);
      if (mapped.length > 0) {
        setSelectedDeviceId(mapped[0].id);
      } else {
        setSelectedDeviceId(null);
      }
    } catch (err) {
      console.warn('[BluetoothModal] Real-time scan error:', err);
      setDevices([]);
      setSelectedDeviceId(null);
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (visible) {
      startScan();
    }
  }, [visible]);

  const handlePairSelected = (device: DiscoveredPrinterDevice) => {
    onSelectPrinter(device);
    onClose();
  };

  const handleSaveManual = () => {
    const isBt = customConnectionType === 'bluetooth';
    const device: DiscoveredPrinterDevice = {
      id: `custom_${Date.now()}`,
      name: customName.trim() || (isBt ? 'Bluetooth Thermal Printer' : 'Network Thermal Printer'),
      connectionType: customConnectionType,
      target: isBt ? (customTarget.trim() || 'BT:EP-TM-M30III') : undefined,
      ipAddress: !isBt ? (customIp.trim() || '192.168.1.100') : undefined,
      macAddress: isBt ? (customTarget.trim().startsWith('BT:') ? undefined : customTarget.trim()) : undefined,
      isRecommended: true,
    };
    onSelectPrinter(device);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modalContent}>
              {/* Header */}
              <View style={styles.headerRow}>
                <View style={styles.iconCircle}>
                  <Bluetooth size={20} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.titleText}>In-App Printer Pairing</Text>
                  <Text style={styles.subtitleText}>
                    Real-time discovery & custom target setup for your station.
                  </Text>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                  <X size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Mode Selector Tabs */}
              <View style={styles.tabContainer}>
                <TouchableOpacity
                  style={[styles.tabBtn, activeTab === 'discovered' && styles.tabBtnActive]}
                  onPress={() => setActiveTab('discovered')}
                  activeOpacity={0.8}
                >
                  <Radio size={14} color={activeTab === 'discovered' ? Colors.primary : Colors.textSubtle} />
                  <Text style={[styles.tabText, activeTab === 'discovered' && styles.tabTextActive]}>
                    Discovered ({devices.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabBtn, activeTab === 'manual' && styles.tabBtnActive]}
                  onPress={() => setActiveTab('manual')}
                  activeOpacity={0.8}
                >
                  <Edit3 size={14} color={activeTab === 'manual' ? Colors.primary : Colors.textSubtle} />
                  <Text style={[styles.tabText, activeTab === 'manual' && styles.tabTextActive]}>
                    Custom Entry
                  </Text>
                </TouchableOpacity>
              </View>

              {activeTab === 'discovered' ? (
                <>
                  {/* Status & Rescan Banner */}
                  <View style={styles.statusBanner}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                      {isScanning ? (
                        <ActivityIndicator size="small" color={Colors.primary} />
                      ) : (
                        <ShieldCheck size={16} color="#10B981" />
                      )}
                      <Text style={styles.statusBannerText}>
                        {isScanning
                          ? 'Scanning Bluetooth & LAN printers...'
                          : devices.length > 0
                          ? `Found ${devices.length} Active Real-Time Printer(s)`
                          : 'No active printers found nearby'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={startScan}
                      disabled={isScanning}
                      style={styles.rescanBtn}
                      activeOpacity={0.7}
                    >
                      <RefreshCw size={13} color={Colors.primary} />
                      <Text style={styles.rescanBtnText}>Scan</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Discovered Devices List */}
                  <View style={{ maxHeight: 240, marginVertical: 10 }}>
                    <FlatList
                      data={devices}
                      keyExtractor={(item) => item.id}
                      renderItem={({ item }) => {
                        const isSelected = item.id === selectedDeviceId;
                        return (
                          <TouchableOpacity
                            style={[
                              styles.deviceRow,
                              isSelected && styles.deviceRowSelected,
                            ]}
                            onPress={() => setSelectedDeviceId(item.id)}
                            activeOpacity={0.8}
                          >
                            <View style={styles.deviceIconBox}>
                              <Printer size={18} color={isSelected ? Colors.primary : Colors.textSubtle} />
                            </View>
                            <View style={{ flex: 1, flexShrink: 1 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <Text
                                  style={[
                                    styles.deviceName,
                                    isSelected && styles.deviceNameSelected,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {item.name}
                                </Text>
                                {item.isRecommended && (
                                  <View style={styles.recBadge}>
                                    <Text style={styles.recBadgeText}>ACTIVE</Text>
                                  </View>
                                )}
                              </View>
                              <Text style={styles.deviceSub} numberOfLines={1}>
                                {item.connectionType === 'bluetooth'
                                  ? `Bluetooth MFi/SPP • Target: ${item.target || item.macAddress || 'BT:TM-m30III'}`
                                  : `WiFi Network • IP: ${item.ipAddress}`}
                              </Text>
                            </View>
                            {isSelected && <CheckCircle2 size={18} color={Colors.primary} />}
                          </TouchableOpacity>
                        );
                      }}
                      ListEmptyComponent={
                        <View style={styles.emptyBox}>
                          <Text style={styles.emptyTitle}>No Live Printers Detected</Text>
                          <Text style={styles.emptySub}>
                            Turn on your Bluetooth printer or switch to the "Custom Entry" tab to manually enter your printer's MAC / IP target.
                          </Text>
                        </View>
                      }
                    />
                  </View>

                  {/* Action Buttons */}
                  <View style={styles.buttonRow}>
                    <TouchableOpacity onPress={onClose} style={styles.cancelBtn} activeOpacity={0.7}>
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        const targetDev = devices.find((d) => d.id === selectedDeviceId);
                        if (targetDev) handlePairSelected(targetDev);
                      }}
                      disabled={!selectedDeviceId}
                      style={[
                        styles.pairBtn,
                        !selectedDeviceId && { opacity: 0.5 },
                      ]}
                      activeOpacity={0.8}
                    >
                      <Bluetooth size={14} color="#FFFFFF" />
                      <Text style={styles.pairBtnText} numberOfLines={1}>Pair & Save Target</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                /* Manual Custom Entry Tab */
                <ScrollView style={{ marginVertical: 8 }} keyboardShouldPersistTaps="handled">
                  <Text style={styles.inputLabel}>Printer Display Name</Text>
                  <TextInput
                    style={styles.textInput}
                    value={customName}
                    onChangeText={setCustomName}
                    placeholder="e.g. Epson TM-m30III Takeaway"
                    placeholderTextColor={Colors.textMuted}
                  />

                  <Text style={styles.inputLabel}>Connection Mode</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                    <TouchableOpacity
                      style={[
                        styles.chipBtn,
                        customConnectionType === 'bluetooth' && styles.chipBtnSelected,
                      ]}
                      onPress={() => setCustomConnectionType('bluetooth')}
                      activeOpacity={0.8}
                    >
                      <Bluetooth size={14} color={customConnectionType === 'bluetooth' ? Colors.primary : Colors.textSubtle} />
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
                      <Printer size={14} color={customConnectionType === 'network' ? Colors.primary : Colors.textSubtle} />
                      <Text style={[styles.chipText, customConnectionType === 'network' && styles.chipTextSelected]}>
                        WiFi / LAN IP
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {customConnectionType === 'bluetooth' ? (
                    <>
                      <Text style={styles.inputLabel}>Bluetooth Target Name / MAC Address</Text>
                      <TextInput
                        style={styles.textInput}
                        value={customTarget}
                        onChangeText={setCustomTarget}
                        placeholder="e.g. BT:EP-TM-M30III or 00:01:90:84:7B:A2"
                        placeholderTextColor={Colors.textMuted}
                        autoCapitalize="characters"
                      />
                    </>
                  ) : (
                    <>
                      <Text style={styles.inputLabel}>Printer IP Address (LAN / Wi-Fi)</Text>
                      <TextInput
                        style={styles.textInput}
                        value={customIp}
                        onChangeText={setCustomIp}
                        placeholder="e.g. 192.168.1.100"
                        placeholderTextColor={Colors.textMuted}
                        keyboardType="decimal-pad"
                      />
                    </>
                  )}

                  <View style={[styles.buttonRow, { marginTop: 16 }]}>
                    <TouchableOpacity onPress={onClose} style={styles.cancelBtn} activeOpacity={0.7}>
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={handleSaveManual}
                      style={styles.pairBtn}
                      activeOpacity={0.8}
                    >
                      <CheckCircle2 size={14} color="#FFFFFF" />
                      <Text style={styles.pairBtnText} numberOfLines={1}>Save Printer Target</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FF5C39',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  subtitleText: {
    fontSize: 12,
    color: Colors.textSubtle,
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  statusBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text,
  },
  rescanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 92, 57, 0.1)',
  },
  rescanBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.card,
    marginBottom: 8,
    gap: 12,
  },
  deviceRowSelected: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(255, 92, 57, 0.05)',
  },
  deviceIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deviceName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  deviceNameSelected: {
    color: Colors.primary,
  },
  deviceSub: {
    fontSize: 11,
    color: Colors.textSubtle,
    marginTop: 2,
  },
  recBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  recBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  emptyBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  emptySub: {
    fontSize: 11,
    color: Colors.textSubtle,
    textAlign: 'center',
    lineHeight: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: 8,
    padding: 3,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    borderRadius: 6,
  },
  tabBtnActive: {
    backgroundColor: Colors.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSubtle,
  },
  tabTextActive: {
    fontWeight: '700',
    color: Colors.text,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 8,
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: Colors.text,
    marginBottom: 6,
  },
  chipBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.background,
  },
  chipBtnSelected: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(255, 92, 57, 0.08)',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSubtle,
  },
  chipTextSelected: {
    fontWeight: '700',
    color: Colors.primary,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.background,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSubtle,
  },
  pairBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#FF5C39',
  },
  pairBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
