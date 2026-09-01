import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Header } from '../components/Header';
import { Colors } from '../constants/colors';
import { restaurantOwnerService } from '../services/restaurant-owner.service';
import { Store, Save } from 'lucide-react-native';

import { useWindowDimensions } from 'react-native';

export default function StoreProfileScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const isNarrow = width < 480;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [profileForm, setProfileForm] = useState({
    restaurantName: '',
    ownerFullName: '',
    primaryContactName: '',
    email: '',
    phoneNumber: '',
    restaurantType: 'food_delivery_and_dining',
    isActive: true,
    shopNo: '',
    floor: '',
    area: '',
    city: '',
    landmark: '',
    orderNotificationEmails: '',
  });

  const loadProfile = async () => {
    setLoading(true);
    try {
      const res = await restaurantOwnerService.getRestaurantProfile();
      if (res.success && res.data) {
        const r = res.data;
        setProfileForm({
          restaurantName: r.restaurantName || '',
          ownerFullName: r.ownerFullName || '',
          primaryContactName: r.primaryContactName || '',
          email: r.email || '',
          phoneNumber: r.phoneNumber || '',
          restaurantType: r.restaurantType || 'food_delivery_and_dining',
          isActive: r.isActive ?? true,
          shopNo: r.address?.shopNo || '',
          floor: r.address?.floor || '',
          area: r.address?.area || '',
          city: r.address?.city || '',
          landmark: r.address?.landmark || '',
          orderNotificationEmails: (r.orderNotificationEmails || []).join(', '),
        });
      }
    } catch (e) {
      console.error('Failed loading store profile:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleChange = (field: string, value: string) => {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payloadProfile = {
        restaurantName: profileForm.restaurantName,
        ownerFullName: profileForm.ownerFullName,
        primaryContactName: profileForm.primaryContactName,
        phoneNumber: profileForm.phoneNumber,
        restaurantType: profileForm.restaurantType,
        isActive: profileForm.isActive,
        orderNotificationEmails: profileForm.orderNotificationEmails
          .split(',')
          .map((e) => e.trim())
          .filter(Boolean),
        address: {
          shopNo: profileForm.shopNo,
          floor: profileForm.floor,
          area: profileForm.area,
          city: profileForm.city,
          landmark: profileForm.landmark,
        },
      };

      const res = await restaurantOwnerService.updateRestaurantProfile(payloadProfile);
      if (res.success) {
        Alert.alert('Success', 'Store profile details updated successfully.');
        loadProfile();
      } else {
        Alert.alert('Error', res.message || 'Failed to save store profile.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'An error occurred while saving profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <Header title="Store & Restaurant Profile" showBackButton={true} />

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Fetching store profile...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: isTablet ? 24 : 16, maxWidth: 840, alignSelf: 'center', width: '100%' },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sectionCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={styles.storeIconBadge}>
                  <Store size={20} color={Colors.primary} />
                </View>
                <View>
                  <Text style={styles.sectionHeader}>Store Identity & Contact</Text>
                  <Text style={styles.sectionSub}>Update name, owner contact & notifications</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {/* <View style={[styles.statusBadge, profileForm.isActive ? styles.statusActive : styles.statusInactive]}>
                  <Text style={styles.statusBadgeText}>{profileForm.isActive ? 'ONLINE' : 'OFFLINE'}</Text>
                </View> */}
                {/* <Switch
                  value={profileForm.isActive}
                  onValueChange={(val) => setProfileForm((prev) => ({ ...prev, isActive: val }))}
                  trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                  thumbColor={profileForm.isActive ? Colors.primary : Colors.textSubtle}
                /> */}
              </View>
            </View>

            {/* Store Name & Type */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Store / Restaurant Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Krifoo Diner & Grill"
                value={profileForm.restaurantName}
                onChangeText={(val) => handleChange('restaurantName', val)}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Business / Store Type</Text>
              <View style={styles.typePillRow}>
                {[
                  { id: 'food_delivery_and_dining', label: 'Food & Dining' },
                  { id: 'food_delivery', label: 'Delivery Only' },
                  { id: 'groceries', label: 'Groceries' },
                  { id: 'meat_poultry', label: 'Meat & Poultry' },
                ].map((typeItem) => {
                  const isSel = profileForm.restaurantType === typeItem.id;
                  return (
                    <TouchableOpacity
                      key={typeItem.id}
                      style={[styles.typePill, isSel && styles.typePillSelected]}
                      onPress={() => handleChange('restaurantType', typeItem.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.typePillText, isSel && styles.typePillTextSelected]}>
                        {typeItem.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.rowInputs}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Owner Full Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Owner Name"
                  value={profileForm.ownerFullName}
                  onChangeText={(val) => handleChange('ownerFullName', val)}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Primary Contact</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Contact Name"
                  value={profileForm.primaryContactName}
                  onChangeText={(val) => handleChange('primaryContactName', val)}
                />
              </View>
            </View>

            <View style={styles.rowInputs}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Store Email (Login)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: '#F3F4F6', color: Colors.textMuted }]}
                  editable={false}
                  value={profileForm.email}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Store Phone Number</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="phone-pad"
                  placeholder="+44 1234 567890"
                  value={profileForm.phoneNumber}
                  onChangeText={(val) => handleChange('phoneNumber', val)}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Order Notification Emails</Text>
              <TextInput
                style={styles.input}
                placeholder="orders@store.com, manager@store.com"
                value={profileForm.orderNotificationEmails}
                onChangeText={(val) => handleChange('orderNotificationEmails', val)}
              />
              <Text style={styles.inputSubText}>Multiple emails separated by commas</Text>
            </View>

            <Text style={[styles.gridSectionTitle, { marginTop: 16, marginBottom: 8 }]}>Store Address & Location</Text>

            <View style={styles.rowInputs}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Shop No / Unit</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Unit 4B"
                  value={profileForm.shopNo}
                  onChangeText={(val) => handleChange('shopNo', val)}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Floor</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Ground Floor"
                  value={profileForm.floor}
                  onChangeText={(val) => handleChange('floor', val)}
                />
              </View>
            </View>

            <View style={styles.rowInputs}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.label}>Area / Street</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Street Area"
                  value={profileForm.area}
                  onChangeText={(val) => handleChange('area', val)}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>City</Text>
                <TextInput
                  style={styles.input}
                  placeholder="City"
                  value={profileForm.city}
                  onChangeText={(val) => handleChange('city', val)}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Landmark / Directions</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Near High Street Central Station"
                value={profileForm.landmark}
                onChangeText={(val) => handleChange('landmark', val)}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.7 }]}
            disabled={saving}
            onPress={handleSave}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.saveBtnText}>Save Store Profile</Text>
                <Save size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.textMuted,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionCard: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  storeIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  sectionSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  statusInactive: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
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
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 12,
    height: 42,
    fontSize: 13,
    color: Colors.text,
  },
  rowInputs: {
    flexDirection: 'row',
  },
  typePillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  typePill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  typePillSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  typePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  typePillTextSelected: {
    color: '#FFFFFF',
  },
  inputSubText: {
    fontSize: 11,
    color: Colors.textSubtle,
    marginTop: 4,
  },
  gridSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textSubtle,
    textTransform: 'uppercase',
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: 12,
    marginTop: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
