import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Header } from '../components/Header';
import { Colors } from '../constants/colors';
import { restaurantOwnerService } from '../services/restaurant-owner.service';
import { Plus, User, Phone, Trash2, X, Check, Search, Star, Key, MapPin, Truck } from 'lucide-react-native';

interface Driver {
  _id: string;
  fullName: string;
  username: string;
  phoneNumber: string;
  isActive: boolean;
  deliveryPartnerProfile?: {
    vehicleType: string;
    vehicleNumber?: string;
    licenseNumber?: string;
    isAvailable: boolean;
    rating?: number;
    completedOrdersCount?: number;
  };
}

export default function FleetScreen() {
  const router = useRouter();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal States
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<'link' | 'register'>('link');
  const [submitting, setSubmitting] = useState(false);

  // Link Form State
  const [linkUsername, setLinkUsername] = useState('');

  // Register Form State
  const [registerForm, setRegisterForm] = useState({
    fullName: '',
    username: '',
    password: '',
    phoneNumber: '',
    vehicleType: 'bicycle',
    vehicleNumber: '',
    licenseNumber: '',
  });

  const loadDrivers = async () => {
    setLoading(true);
    try {
      const res = await restaurantOwnerService.getFleet();
      if (res.success && res.data) {
        setDrivers(res.data);
      }
    } catch (e) {
      console.error('Failed loading fleet drivers:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDrivers();
  }, []);

  const openAddModal = () => {
    setLinkUsername('');
    setRegisterForm({
      fullName: '',
      username: '',
      password: '',
      phoneNumber: '',
      vehicleType: 'bicycle',
      vehicleNumber: '',
      licenseNumber: '',
    });
    setModalMode('link');
    setModalVisible(true);
  };

  const handleUnlink = async (driver: Driver) => {
    Alert.alert(
      'Remove Driver',
      `Are you sure you want to remove ${driver.fullName} from your restaurant's fleet?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const res = await restaurantOwnerService.unlinkDriver(driver._id);
            if (res.success) {
              Alert.alert('Success', 'Driver unlinked.');
              loadDrivers();
            } else {
              Alert.alert('Error', res.message || 'Failed to remove driver.');
            }
          },
        },
      ]
    );
  };

  const handleLinkDriver = async () => {
    if (!linkUsername.trim()) return Alert.alert('Error', 'Please enter driver username.');

    setSubmitting(true);
    try {
      const res = await restaurantOwnerService.linkDriver(linkUsername.trim());
      if (res.success) {
        Alert.alert('Success', 'Driver linked successfully.');
        setModalVisible(false);
        loadDrivers();
      } else {
        Alert.alert('Error', res.message || 'Failed to link driver.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterDriver = async () => {
    const f = registerForm;
    if (!f.fullName.trim()) return Alert.alert('Error', 'Full name is required.');
    if (!f.username.trim()) return Alert.alert('Error', 'Username is required.');
    if (!f.password.trim() || f.password.length < 8) {
      return Alert.alert('Error', 'Password must be at least 8 characters.');
    }
    if (!f.phoneNumber.trim()) return Alert.alert('Error', 'Phone number is required.');

    setSubmitting(true);
    try {
      const formattedPhone = f.phoneNumber.startsWith('+44')
        ? f.phoneNumber
        : '+44' + f.phoneNumber.replace(/\D/g, '');

      const payload = {
        fullName: f.fullName.trim(),
        username: f.username.trim().toLowerCase(),
        password: f.password,
        phoneNumber: formattedPhone,
        deliveryPartnerProfile: {
          vehicleType: f.vehicleType,
          vehicleNumber: f.vehicleNumber.trim() || undefined,
          licenseNumber: f.licenseNumber.trim() || undefined,
        },
      };

      const res = await restaurantOwnerService.createDriver(payload);
      if (res.success) {
        Alert.alert('Success', 'Driver registered and linked successfully.');
        setModalVisible(false);
        loadDrivers();
      } else {
        Alert.alert('Error', res.message || 'Failed to register driver.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredDrivers = drivers.filter(
    (d) =>
      d.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <Header title="Fleet Management" showBackButton={true} />

      {/* Search Header */}
      <View style={styles.topFilterBox}>
        <View style={styles.searchBox}>
          <Search size={16} color={Colors.textSubtle} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search drivers by name or username..."
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
        </View>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading fleet...</Text>
        </View>
      ) : filteredDrivers.length === 0 ? (
        <View style={styles.centerBox}>
          <Truck size={48} color={Colors.cardBorder} />
          <Text style={styles.emptyTitle}>No Drivers Connected</Text>
          <Text style={styles.emptySub}>
            Link existing drivers or register new ones to handle local deliveries.
          </Text>
          <TouchableOpacity style={styles.createBtn} onPress={openAddModal}>
            <Text style={styles.createBtnText}>Add Driver</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredDrivers}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const hasProfile = !!item.deliveryPartnerProfile;
            const isAvailable = item.deliveryPartnerProfile?.isAvailable ?? false;
            const rating = item.deliveryPartnerProfile?.rating ?? 5;
            const completedCount = item.deliveryPartnerProfile?.completedOrdersCount ?? 0;

            return (
              <View style={styles.driverCard}>
                <View style={styles.driverHeader}>
                  <View style={styles.driverAvatar}>
                    <User size={20} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.driverName}>{item.fullName}</Text>
                    <Text style={styles.driverUsername}>@{item.username}</Text>
                  </View>

                  <View style={[styles.statusBadge, isAvailable ? styles.badgeGreen : styles.badgeGray]}>
                    <Text style={[styles.statusText, isAvailable ? styles.textGreen : styles.textGray]}>
                      {isAvailable ? 'Online' : 'Offline'}
                    </Text>
                  </View>
                </View>

                {hasProfile ? (
                  <View style={styles.profileBox}>
                    <View style={styles.metaRow}>
                      <View style={styles.metaItem}>
                        <Truck size={12} color={Colors.textSubtle} style={{ marginRight: 4 }} />
                        <Text style={styles.metaLabel}>Vehicle: </Text>
                        <Text style={styles.metaValue}>
                          {item.deliveryPartnerProfile!.vehicleType.toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.metaItem}>
                        <Star size={12} color="#F59E0B" style={{ marginRight: 4 }} />
                        <Text style={styles.metaValue}>{rating.toFixed(1)}</Text>
                      </View>
                    </View>

                    {item.deliveryPartnerProfile!.vehicleNumber ? (
                      <Text style={styles.profileText}>
                        Reg Plate: <Text style={styles.bold}>{item.deliveryPartnerProfile!.vehicleNumber}</Text>
                      </Text>
                    ) : null}

                    <Text style={styles.profileText}>
                      Trips Completed: <Text style={styles.bold}>{completedCount}</Text>
                    </Text>
                  </View>
                ) : null}

                <View style={styles.divider} />

                <View style={styles.driverFooter}>
                  <View style={styles.contactItem}>
                    <Phone size={12} color={Colors.textSubtle} style={{ marginRight: 6 }} />
                    <Text style={styles.phoneText}>{item.phoneNumber}</Text>
                  </View>

                  <TouchableOpacity style={styles.btnUnlink} onPress={() => handleUnlink(item)}>
                    <Trash2 size={13} color={Colors.danger} style={{ marginRight: 4 }} />
                    <Text style={styles.btnUnlinkText}>Unlink</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* Floating Add FAB */}
      {drivers.length > 0 && (
        <TouchableOpacity style={styles.fab} onPress={openAddModal} activeOpacity={0.85}>
          <Plus size={24} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* Add / Link Driver Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Connect Driver</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <X size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Toggle Modes */}
            <View style={styles.modeTabs}>
              <TouchableOpacity
                style={[styles.modeTab, modalMode === 'link' && styles.modeTabActive]}
                onPress={() => setModalMode('link')}
              >
                <Text style={[styles.modeLabel, modalMode === 'link' && styles.modeLabelActive]}>
                  Link Existing
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modeTab, modalMode === 'register' && styles.modeTabActive]}
                onPress={() => setModalMode('register')}
              >
                <Text style={[styles.modeLabel, modalMode === 'register' && styles.modeLabelActive]}>
                  Register New
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {modalMode === 'link' ? (
                <View style={styles.linkForm}>
                  <Text style={styles.sectionDesc}>
                    Link an existing delivery rider already registered on the Krifoo network.
                  </Text>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Driver Username / Email</Text>
                    <View style={styles.inputWrapper}>
                      <User size={16} color={Colors.textSubtle} style={{ marginRight: 10 }} />
                      <TextInput
                        style={styles.inputStyle}
                        placeholder="rider_username"
                        autoCapitalize="none"
                        value={linkUsername}
                        onChangeText={setLinkUsername}
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.saveBtn, submitting && { opacity: 0.7 }]}
                    disabled={submitting}
                    onPress={handleLinkDriver}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <Text style={styles.saveBtnText}>Link Delivery Partner</Text>
                        <Check size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.registerForm}>
                  <Text style={styles.sectionDesc}>
                    Create and configure credentials for a dedicated restaurant driver.
                  </Text>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Rider Full Name</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="David Smith"
                      value={registerForm.fullName}
                      onChangeText={(val) => setRegisterForm((prev) => ({ ...prev, fullName: val }))}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Username / Login ID</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="smith_rider"
                      autoCapitalize="none"
                      value={registerForm.username}
                      onChangeText={(val) => setRegisterForm((prev) => ({ ...prev, username: val }))}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Password</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Min 8 characters"
                      secureTextEntry
                      value={registerForm.password}
                      onChangeText={(val) => setRegisterForm((prev) => ({ ...prev, password: val }))}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Phone Number</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="0712345678"
                      keyboardType="phone-pad"
                      value={registerForm.phoneNumber}
                      onChangeText={(val) => setRegisterForm((prev) => ({ ...prev, phoneNumber: val }))}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Vehicle Type</Text>
                    <View style={styles.selectorRow}>
                      {['bicycle', 'motorcycle', 'car'].map((type) => (
                        <TouchableOpacity
                          key={type}
                          style={[styles.selectorItem, registerForm.vehicleType === type && styles.selectorItemActive]}
                          onPress={() => setRegisterForm((prev) => ({ ...prev, vehicleType: type }))}
                        >
                          <Text style={[styles.selectorLabel, registerForm.vehicleType === type && styles.selectorLabelActive]}>
                            {type.toUpperCase()}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.rowInputs}>
                    <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                      <Text style={styles.label}>Reg Plate (Optional)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="AB12 CDE"
                        autoCapitalize="characters"
                        value={registerForm.vehicleNumber}
                        onChangeText={(val) => setRegisterForm((prev) => ({ ...prev, vehicleNumber: val }))}
                      />
                    </View>
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={styles.label}>License No (Optional)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="SMITH987654"
                        autoCapitalize="characters"
                        value={registerForm.licenseNumber}
                        onChangeText={(val) => setRegisterForm((prev) => ({ ...prev, licenseNumber: val }))}
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.saveBtn, submitting && { opacity: 0.7 }]}
                    disabled={submitting}
                    onPress={handleRegisterDriver}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <Text style={styles.saveBtnText}>Register Driver</Text>
                        <Check size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topFilterBox: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    paddingVertical: 12,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardSurface,
    borderColor: Colors.cardBorder,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
    marginHorizontal: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: Colors.text,
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
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 14,
  },
  emptySub: {
    fontSize: 13,
    color: Colors.textSubtle,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 240,
    lineHeight: 18,
    marginBottom: 20,
  },
  createBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  createBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
  },
  driverCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    padding: 14,
    marginBottom: 12,
  },
  driverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverName: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
  },
  driverUsername: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
    fontWeight: '700',
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeGreen: {
    backgroundColor: '#ECFDF5',
  },
  badgeGray: {
    backgroundColor: Colors.cardSurface,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '800',
  },
  textGreen: {
    color: '#065F46',
  },
  textGray: {
    color: Colors.textMuted,
  },
  profileBox: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 10,
    marginTop: 10,
    gap: 4,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  metaValue: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.text,
  },
  profileText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  bold: {
    color: Colors.text,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.cardBorder,
    marginVertical: 12,
  },
  driverFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  phoneText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  btnUnlink: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  btnUnlinkText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.danger,
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: Colors.primary,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 28, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  closeBtn: {
    padding: 6,
  },
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: Colors.backgroundSecondary,
    padding: 4,
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 10,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  modeTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  modeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSubtle,
  },
  modeLabelActive: {
    color: Colors.text,
  },
  modalBody: {
    padding: 16,
  },
  linkForm: {},
  registerForm: {},
  sectionDesc: {
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 18,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardSurface,
    borderColor: Colors.cardBorder,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
  },
  inputStyle: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
  },
  input: {
    backgroundColor: Colors.cardSurface,
    borderColor: Colors.cardBorder,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 14,
    color: Colors.text,
  },
  selectorRow: {
    flexDirection: 'row',
    gap: 8,
  },
  selectorItem: {
    flex: 1,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectorItemActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  selectorLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  selectorLabelActive: {
    color: Colors.primary,
  },
  rowInputs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 30,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
});
