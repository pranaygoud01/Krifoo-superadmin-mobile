import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Linking,
  ActivityIndicator,
  Switch,
  Alert,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header } from '../components/Header';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmModal } from '../components/ConfirmModal';
import { Colors } from '../constants/colors';
import { restaurantService } from '../services/restaurant.service';
import { useToast } from '../context/ToastContext';
import { Restaurant, VerificationStatus, ExternalDeliverySettings, ExternalWebsiteSettings, ExternalDistanceTier } from '../types';
import {
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  MapPin,
  Mail,
  Phone,
  User,
  Info,
  Globe,
  Truck,
  Percent,
  Save,
  Plus,
  Trash2,
  Edit2,
  X,
} from 'lucide-react-native';

export default function RestaurantDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const restaurantId = params.restaurantId as string;
  const { showToast } = useToast();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [remarks, setRemarks] = useState('');
  const [updating, setUpdating] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [deactivateModalVisible, setDeactivateModalVisible] = useState(false);

  // Editable Form States
  const [commissionRate, setCommissionRate] = useState('10');
  const [defaultDeliveryTime, setDefaultDeliveryTime] = useState('30');
  const [handlingFee, setHandlingFee] = useState('0');

  // External Website Form States
  const [extDomain, setExtDomain] = useState('');
  const [extBrandName, setExtBrandName] = useState('');
  const [extPrimaryColor, setExtPrimaryColor] = useState('#E11D48');
  const [extSecondaryColor, setExtSecondaryColor] = useState('#4F46E5');
  const [extHeroBanner, setExtHeroBanner] = useState('');
  const [extLogoUrl, setExtLogoUrl] = useState('');
  const [extPublished, setExtPublished] = useState(true);

  // External Delivery Form States
  const [extDeliveryEnabled, setExtDeliveryEnabled] = useState(false);
  const [extChargeType, setExtChargeType] = useState<'tiered' | 'fixed' | 'per_mile'>('tiered');
  const [extFixedCharge, setExtFixedCharge] = useState('0');
  const [extFreeThreshold, setExtFreeThreshold] = useState('');
  const [extPerMile, setExtPerMile] = useState('0');
  const [extBaseDist, setExtBaseDist] = useState('0');
  const [extBaseCharge, setExtBaseCharge] = useState('0');
  const [extMaxRadius, setExtMaxRadius] = useState('10');
  const [extDistanceTiers, setExtDistanceTiers] = useState<ExternalDistanceTier[]>([]);

  // Distance Tier Modal States
  const [tierModalVisible, setTierModalVisible] = useState(false);
  const [tierMaxDist, setTierMaxDist] = useState('');
  const [tierCharge, setTierCharge] = useState('');
  const [editingTierIndex, setEditingTierIndex] = useState<number | null>(null);

  const fetchRestaurantDetail = async () => {
    if (!restaurantId) return;
    try {
      setLoading(true);
      const res = await restaurantService.getRestaurantById(restaurantId);
      if (res.success && res.data) {
        const r = res.data;
        setRestaurant(r);
        setRemarks(r.verificationRemarks || '');
        setCommissionRate(String(r.commissionRate ?? 10));
        setDefaultDeliveryTime(String(r.defaultDeliveryTime ?? 30));
        setHandlingFee(String(r.handlingChargesPercentage ?? 0));

        // Populate External Website
        const ws = r.externalWebsiteSettings;
        setExtDomain(ws?.domain || '');
        setExtBrandName(ws?.brandName || '');
        setExtPrimaryColor(ws?.primaryColor || '#E11D48');
        setExtSecondaryColor(ws?.secondaryColor || '#4F46E5');
        setExtHeroBanner(ws?.heroBannerUrl || '');
        setExtLogoUrl(ws?.logoUrl || '');
        setExtPublished(ws?.isPublished ?? true);

        // Populate External Delivery
        const eds = r.externalDeliverySettings;
        setExtDeliveryEnabled(eds?.enabled ?? false);
        setExtChargeType(eds?.deliveryChargeType || 'tiered');
        setExtFixedCharge(String(eds?.fixedCharge ?? 0));
        setExtFreeThreshold(eds?.freeDeliveryOverOrderValue != null ? String(eds.freeDeliveryOverOrderValue) : '');
        setExtPerMile(String(eds?.chargePerMile ?? 0));
        setExtBaseDist(String(eds?.baseDeliveryDistance ?? 0));
        setExtBaseCharge(String(eds?.baseDeliveryCharge ?? 0));
        setExtMaxRadius(String(eds?.maxDeliveryRadius ?? 10));
        setExtDistanceTiers(Array.isArray(eds?.distanceTiers) ? eds.distanceTiers : []);
      } else {
        showToast({ title: 'Error', message: 'Restaurant details not found.', type: 'error' });
      }
    } catch (e) {
      console.error('Failed fetching restaurant details:', e);
      showToast({ title: 'Error', message: 'Could not load restaurant details.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRestaurantDetail();
  }, [restaurantId]);

  const handleUpdateVerification = async (newStatus: VerificationStatus) => {
    if (!restaurant) return;
    setUpdating(true);
    try {
      const res = await restaurantService.verifyRestaurant(restaurant._id, newStatus, remarks);
      if (res.success) {
        showToast({
          title: 'Status Updated',
          message: `Restaurant verification set to: ${newStatus.toUpperCase()}`,
          type: 'success',
        });
        await fetchRestaurantDetail();
      } else {
        showToast({ title: 'Error', message: res.message || 'Failed to update verification status.', type: 'error' });
      }
    } catch (e) {
      showToast({ title: 'Error', message: 'Failed to update verification status.', type: 'error' });
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleActive = async (value: boolean) => {
    if (!restaurant) return;
    if (!value) {
      setDeactivateModalVisible(true);
    } else {
      await performToggleActive(true);
    }
  };

  const performToggleActive = async (nextActive: boolean) => {
    if (!restaurant) return;
    try {
      const res = await restaurantService.toggleActiveStatus(restaurant._id, nextActive);
      if (res.success) {
        setRestaurant((prev) => (prev ? { ...prev, isActive: nextActive } : null));
        showToast({
          title: 'Active Status Changed',
          message: `Restaurant is now ${nextActive ? 'active' : 'inactive'}.`,
          type: 'success',
        });
      } else {
        showToast({ title: 'Error', message: res.message || 'Failed to change active status.', type: 'error' });
      }
    } catch (e) {
      showToast({ title: 'Error', message: 'Failed to change active status.', type: 'error' });
    }
  };

  const handleSaveSettings = async () => {
    if (!restaurant) return;
    setSavingSettings(true);
    try {
      const payload: Partial<Restaurant> = {
        commissionRate: parseFloat(commissionRate) || 0,
        defaultDeliveryTime: parseInt(defaultDeliveryTime, 10) || 30,
        handlingChargesPercentage: parseFloat(handlingFee) || 0,
        externalWebsiteSettings: {
          domain: extDomain.trim() || undefined,
          brandName: extBrandName.trim() || undefined,
          primaryColor: extPrimaryColor.trim() || '#E11D48',
          secondaryColor: extSecondaryColor.trim() || '#4F46E5',
          heroBannerUrl: extHeroBanner.trim() || undefined,
          logoUrl: extLogoUrl.trim() || undefined,
          isPublished: extPublished,
        },
        externalDeliverySettings: {
          enabled: extDeliveryEnabled,
          deliveryChargeType: extChargeType,
          fixedCharge: parseFloat(extFixedCharge) || 0,
          freeDeliveryOverOrderValue: extFreeThreshold.trim() ? parseFloat(extFreeThreshold) : null,
          chargePerMile: parseFloat(extPerMile) || 0,
          baseDeliveryDistance: parseFloat(extBaseDist) || 0,
          baseDeliveryCharge: parseFloat(extBaseCharge) || 0,
          maxDeliveryRadius: parseFloat(extMaxRadius) || 10,
          distanceTiers: extDistanceTiers,
        },
      };

      const res = await restaurantService.updateRestaurantDetails(restaurant._id, payload);
      if (res.success) {
        showToast({ title: 'Saved', message: 'Restaurant settings and rates saved successfully.', type: 'success' });
        fetchRestaurantDetail();
      } else {
        showToast({ title: 'Error', message: res.message || 'Failed to save settings.', type: 'error' });
      }
    } catch (e: any) {
      showToast({ title: 'Error', message: e.message || 'Error occurred while saving.', type: 'error' });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveTier = () => {
    const maxD = parseFloat(tierMaxDist);
    const ch = parseFloat(tierCharge);
    if (isNaN(maxD) || maxD < 0 || isNaN(ch) || ch < 0) {
      showToast({ title: 'Validation', message: 'Enter valid distance and charge numbers.', type: 'error' });
      return;
    }

    if (editingTierIndex !== null) {
      const updated = [...extDistanceTiers];
      updated[editingTierIndex] = { maxDistance: maxD, charge: ch };
      setExtDistanceTiers(updated.sort((a, b) => a.maxDistance - b.maxDistance));
    } else {
      const updated = [...extDistanceTiers, { maxDistance: maxD, charge: ch }];
      setExtDistanceTiers(updated.sort((a, b) => a.maxDistance - b.maxDistance));
    }
    setTierModalVisible(false);
  };

  const handleDeleteTier = (index: number) => {
    setExtDistanceTiers(extDistanceTiers.filter((_, idx) => idx !== index));
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header title="Restaurant Details" showBackButton={true} />
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading restaurant details...</Text>
        </View>
      </View>
    );
  }

  if (!restaurant) {
    return (
      <View style={styles.container}>
        <Header title="Restaurant Details" showBackButton={true} />
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>No restaurant data loaded.</Text>
        </View>
      </View>
    );
  }

  const addr = typeof restaurant.address === 'object' && restaurant.address !== null ? restaurant.address : null;
  const showFullLocation = addr !== null;
  const displayAddress = addr
    ? addr.formattedAddress ||
      [addr.shopNo, addr.floor, addr.street, addr.area, addr.city, addr.pincode]
        .filter(Boolean)
        .join(', ')
    : typeof restaurant.address === 'string'
    ? restaurant.address
    : 'N/A';

  return (
    <View style={styles.container}>
      <Header
        title="Restaurant Details"
        showBackButton={true}
        rightAction={
          <TouchableOpacity style={styles.saveHeaderBtn} onPress={handleSaveSettings} disabled={savingSettings}>
            {savingSettings ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Save size={15} color="#FFFFFF" />
                <Text style={styles.saveHeaderBtnText}>Save</Text>
              </>
            )}
          </TouchableOpacity>
        }
      />

      <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
        {/* Banner & Brand Card */}
        <View style={styles.bannerCard}>
          {restaurant.imageUrl ? (
            <Image source={{ uri: restaurant.imageUrl }} style={styles.bannerImage} />
          ) : (
            <View style={[styles.bannerImage, styles.imagePlaceholder]}>
              <Text style={styles.placeholderText}>{restaurant.restaurantName?.charAt(0)}</Text>
            </View>
          )}
          <View style={styles.bannerInfo}>
            <Text style={styles.restaurantName}>{restaurant.restaurantName}</Text>
            <View style={styles.rowAlign}>
              <User size={14} color={Colors.textMuted} />
              <Text style={styles.ownerText}>Owner: {restaurant.ownerFullName ?? restaurant.ownerName ?? 'Not specified'}</Text>
            </View>
            <View style={styles.badgeWrap}>
              <StatusBadge status={restaurant.verificationStatus} type="restaurant" />
              <StatusBadge status={restaurant.isActive ? 'active' : 'inactive'} type="restaurant" />
            </View>
          </View>
        </View>

        {/* Commercial & Rate Settings Card */}
        <View style={styles.sectionCard}>
          <View style={styles.titleRow}>
            <Percent size={18} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Commercial & Operations</Text>
          </View>

          <View style={styles.formRow}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.inputLabel}>Commission Rate (%)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={commissionRate}
                onChangeText={setCommissionRate}
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>Default Prep Time (Mins)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                value={defaultDeliveryTime}
                onChangeText={setDefaultDeliveryTime}
              />
            </View>
          </View>
        </View>

        {/* External Website Configuration Card */}
        <View style={styles.sectionCard}>
          <View style={[styles.titleRow, { justifyContent: 'space-between' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Globe size={18} color={Colors.primary} />
              <Text style={styles.sectionTitle}>External Website & Branding</Text>
            </View>
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: '/external-website-settings',
                  params: { restaurantId: restaurant._id },
                })
              }
              style={{ paddingVertical: 4, paddingHorizontal: 8, backgroundColor: Colors.primaryLight, borderRadius: 6 }}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.primary }}>Studio UI →</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Custom Domain / Hostname</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. swaadcambridge.co.uk"
              placeholderTextColor={Colors.textSubtle}
              autoCapitalize="none"
              value={extDomain}
              onChangeText={setExtDomain}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Brand Display Name</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Swaad Cambridge"
              placeholderTextColor={Colors.textSubtle}
              value={extBrandName}
              onChangeText={setExtBrandName}
            />
          </View>

          <View style={styles.formRow}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.inputLabel}>Primary Color</Text>
              <TextInput
                style={styles.textInput}
                placeholder="#E11D48"
                placeholderTextColor={Colors.textSubtle}
                value={extPrimaryColor}
                onChangeText={setExtPrimaryColor}
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>Secondary Color</Text>
              <TextInput
                style={styles.textInput}
                placeholder="#4F46E5"
                placeholderTextColor={Colors.textSubtle}
                value={extSecondaryColor}
                onChangeText={setExtSecondaryColor}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Hero Banner Image URL</Text>
            <TextInput
              style={styles.textInput}
              placeholder="https://..."
              placeholderTextColor={Colors.textSubtle}
              value={extHeroBanner}
              onChangeText={setExtHeroBanner}
            />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>External Website Published</Text>
            <Switch
              value={extPublished}
              onValueChange={setExtPublished}
              trackColor={{ false: '#334155', true: '#10B981' }}
              thumbColor={extPublished ? '#FFFFFF' : '#94A3B8'}
            />
          </View>
        </View>

        {/* External Delivery Settings Card */}
        <View style={styles.sectionCard}>
          <View style={styles.titleRow}>
            <Truck size={18} color={Colors.primary} />
            <Text style={styles.sectionTitle}>External Delivery Configuration</Text>
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Enable Custom External Delivery Charges</Text>
            <Switch
              value={extDeliveryEnabled}
              onValueChange={setExtDeliveryEnabled}
              trackColor={{ false: '#334155', true: '#10B981' }}
              thumbColor={extDeliveryEnabled ? '#FFFFFF' : '#94A3B8'}
            />
          </View>

          {extDeliveryEnabled && (
            <View style={{ gap: 12, marginTop: 12 }}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Delivery Charge Type</Text>
                <View style={styles.typeSelectorRow}>
                  {(['tiered', 'fixed', 'per_mile'] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.typeOption, extChargeType === t && styles.activeTypeOption]}
                      onPress={() => setExtChargeType(t)}
                    >
                      <Text style={[styles.typeOptionText, extChargeType === t && styles.activeTypeOptionText]}>
                        {t === 'tiered' ? 'Tiered' : t === 'fixed' ? 'Fixed' : 'Per Mile'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={styles.inputLabel}>Max Delivery Radius (Miles)</Text>
                  <TextInput
                    style={styles.textInput}
                    keyboardType="numeric"
                    value={extMaxRadius}
                    onChangeText={setExtMaxRadius}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Free Delivery Over (£)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. 30"
                    placeholderTextColor={Colors.textSubtle}
                    keyboardType="numeric"
                    value={extFreeThreshold}
                    onChangeText={setExtFreeThreshold}
                  />
                </View>
              </View>

              {extChargeType === 'fixed' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Fixed Delivery Charge (£)</Text>
                  <TextInput
                    style={styles.textInput}
                    keyboardType="numeric"
                    value={extFixedCharge}
                    onChangeText={setExtFixedCharge}
                  />
                </View>
              )}

              {extChargeType === 'per_mile' && (
                <View style={styles.formRow}>
                  <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                    <Text style={styles.inputLabel}>Base Charge (£)</Text>
                    <TextInput
                      style={styles.textInput}
                      keyboardType="numeric"
                      value={extBaseCharge}
                      onChangeText={setExtBaseCharge}
                    />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                    <Text style={styles.inputLabel}>Base Distance (Mi)</Text>
                    <TextInput
                      style={styles.textInput}
                      keyboardType="numeric"
                      value={extBaseDist}
                      onChangeText={setExtBaseDist}
                    />
                  </View>
                  <View style={[styles.inputGroup, { flex: 1 }]}>
                    <Text style={styles.inputLabel}>£ / Addl Mile</Text>
                    <TextInput
                      style={styles.textInput}
                      keyboardType="numeric"
                      value={extPerMile}
                      onChangeText={setExtPerMile}
                    />
                  </View>
                </View>
              )}

              {extChargeType === 'tiered' && (
                <View style={{ gap: 8, marginTop: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.inputLabel}>Distance Tiers</Text>
                    <TouchableOpacity
                      style={styles.addTierBtn}
                      onPress={() => {
                        setEditingTierIndex(null);
                        setTierMaxDist('');
                        setTierCharge('');
                        setTierModalVisible(true);
                      }}
                    >
                      <Plus size={14} color={Colors.primary} />
                      <Text style={styles.addTierBtnText}>Add Tier</Text>
                    </TouchableOpacity>
                  </View>

                  {extDistanceTiers.length === 0 ? (
                    <Text style={styles.noTiersText}>No custom distance tiers added yet.</Text>
                  ) : (
                    extDistanceTiers.map((tier, idx) => (
                      <View key={idx} style={styles.tierRowItem}>
                        <Text style={styles.tierRowText}>
                          Up to <Text style={{ fontWeight: '700' }}>{tier.maxDistance} Mi</Text>
                        </Text>
                        <Text style={styles.tierRowCharge}>£{Number(tier.charge).toFixed(2)}</Text>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <TouchableOpacity
                            onPress={() => {
                              setEditingTierIndex(idx);
                              setTierMaxDist(String(tier.maxDistance));
                              setTierCharge(String(tier.charge));
                              setTierModalVisible(true);
                            }}
                          >
                            <Edit2 size={15} color={Colors.primary} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDeleteTier(idx)}>
                            <Trash2 size={15} color={Colors.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              )}
            </View>
          )}
        </View>

        {/* Contact Info Card */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Contact Profile</Text>
          <View style={styles.detailRow}>
            <Mail size={16} color={Colors.textSubtle} />
            <Text style={styles.detailVal}>{restaurant.email || 'N/A'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Phone size={16} color={Colors.textSubtle} />
            <Text style={styles.detailVal}>{restaurant.phoneNumber || 'N/A'}</Text>
          </View>
          {restaurant.cuisineTypes && restaurant.cuisineTypes.length > 0 && (
            <View style={styles.detailRow}>
              <Info size={16} color={Colors.textSubtle} />
              <Text style={styles.detailVal}>Cuisines: {restaurant.cuisineTypes.join(', ')}</Text>
            </View>
          )}
        </View>

        {/* Location Details Card */}
        <View style={styles.sectionCard}>
          <View style={styles.titleRow}>
            <MapPin size={18} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Full Location Details</Text>
          </View>

          {showFullLocation ? (
            <View style={styles.locationFields}>
              {addr?.shopNo && (
                <View style={styles.locationFieldRow}>
                  <Text style={styles.locationLabel}>Shop/Flat No:</Text>
                  <Text style={styles.locationValue}>{addr.shopNo}</Text>
                </View>
              )}
              {addr?.floor && (
                <View style={styles.locationFieldRow}>
                  <Text style={styles.locationLabel}>Floor:</Text>
                  <Text style={styles.locationValue}>{addr.floor}</Text>
                </View>
              )}
              {addr?.street && (
                <View style={styles.locationFieldRow}>
                  <Text style={styles.locationLabel}>Street/Road:</Text>
                  <Text style={styles.locationValue}>{addr.street}</Text>
                </View>
              )}
              {addr?.city && (
                <View style={styles.locationFieldRow}>
                  <Text style={styles.locationLabel}>City:</Text>
                  <Text style={styles.locationValue}>{addr.city}</Text>
                </View>
              )}
              {addr?.pincode && (
                <View style={styles.locationFieldRow}>
                  <Text style={styles.locationLabel}>Pincode/Postcode:</Text>
                  <Text style={styles.locationValue}>{addr.pincode}</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.locationFields}>
              <View style={styles.locationFieldRow}>
                <Text style={styles.locationLabel}>Address:</Text>
                <Text style={styles.locationValue}>{displayAddress}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Verification Status Feedback Remarks */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Verification Feedback & Remarks</Text>
          <TextInput
            style={styles.remarksInput}
            placeholder="Type verification remarks or reasons for rejection here..."
            placeholderTextColor={Colors.textSubtle}
            multiline={true}
            numberOfLines={4}
            value={remarks}
            onChangeText={setRemarks}
          />
        </View>

        {/* Global Active Status Switch */}
        <View style={styles.activeStatusCard}>
          <View style={styles.activeStatusHeader}>
            <Text style={styles.activeStatusTitle}>Account Active Status</Text>
            <Text style={styles.activeStatusSubtitle}>Allow restaurant login and ordering availability</Text>
          </View>
          <Switch
            value={restaurant.isActive}
            onValueChange={handleToggleActive}
            trackColor={{ false: '#334155', true: '#10B981' }}
            thumbColor={restaurant.isActive ? '#FFFFFF' : '#94A3B8'}
          />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Action Footer Actions */}
      <View style={styles.footerActions}>
        <TouchableOpacity
          disabled={updating}
          style={[styles.actionBtn, styles.approveBtn]}
          onPress={() => handleUpdateVerification('approved')}
        >
          {updating ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <CheckCircle size={15} color="#FFFFFF" />
              <Text style={styles.approveBtnText}>Approve</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          disabled={updating}
          style={[styles.actionBtn, styles.pendingBtn]}
          onPress={() => handleUpdateVerification('pending')}
        >
          <Clock size={15} color="#FFFFFF" />
          <Text style={styles.pendingBtnText}>Pending</Text>
        </TouchableOpacity>

        <TouchableOpacity
          disabled={updating}
          style={[styles.actionBtn, styles.rejectBtn]}
          onPress={() => handleUpdateVerification('rejected')}
        >
          <XCircle size={15} color="#FFFFFF" />
          <Text style={styles.rejectBtnText}>Reject</Text>
        </TouchableOpacity>
      </View>

      {/* Tier Modal */}
      <Modal visible={tierModalVisible} transparent={true} animationType="slide" onRequestClose={() => setTierModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingTierIndex !== null ? 'Edit Tier' : 'Add Distance Tier'}</Text>
              <TouchableOpacity onPress={() => setTierModalVisible(false)}>
                <X size={20} color={Colors.textSubtle} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 16, gap: 12 }}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Max Distance (Miles) *</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  placeholder="e.g. 3"
                  placeholderTextColor={Colors.textSubtle}
                  value={tierMaxDist}
                  onChangeText={setTierMaxDist}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Delivery Charge (£) *</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  placeholder="e.g. 2.50"
                  placeholderTextColor={Colors.textSubtle}
                  value={tierCharge}
                  onChangeText={setTierCharge}
                />
              </View>
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setTierModalVisible(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitBtn} onPress={handleSaveTier}>
                <Text style={styles.submitBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Deactivate Confirm Modal */}
      <ConfirmModal
        visible={deactivateModalVisible}
        title="Deactivate Restaurant"
        message={`Are you sure you want to deactivate '${restaurant?.restaurantName || 'this restaurant'}'? Customers will not be able to view their menu or place orders.`}
        confirmText="Deactivate"
        isDestructive={true}
        onConfirm={async () => {
          await performToggleActive(false);
          setDeactivateModalVisible(false);
        }}
        onClose={() => setDeactivateModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  saveHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  saveHeaderBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: 14,
    marginTop: 12,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 15,
    fontWeight: '600',
  },
  scrollBody: {
    padding: 16,
  },
  bannerCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  bannerImage: {
    width: 72,
    height: 72,
    borderRadius: 14,
  },
  imagePlaceholder: {
    backgroundColor: Colors.cardSurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  bannerInfo: {
    flex: 1,
    marginLeft: 14,
  },
  restaurantName: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  rowAlign: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  ownerText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  badgeWrap: {
    flexDirection: 'row',
    gap: 6,
  },
  sectionCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  sectionTitle: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  formRow: {
    flexDirection: 'row',
  },
  inputGroup: {
    marginBottom: 12,
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  textInput: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 12,
    height: 40,
    color: Colors.text,
    fontSize: 13,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeOption: {
    flex: 1,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  activeTypeOption: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  typeOptionText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  activeTypeOptionText: {
    color: '#FFFFFF',
  },
  addTierBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: Colors.cardSurface,
  },
  addTierBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
  },
  noTiersText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  tierRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.cardSurface,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  tierRowText: {
    fontSize: 13,
    color: Colors.text,
  },
  tierRowCharge: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.primary,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  detailVal: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '500',
  },
  locationFields: {
    gap: 8,
  },
  locationFieldRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    paddingVertical: 6,
  },
  locationLabel: {
    color: Colors.textSubtle,
    width: 110,
    fontSize: 12,
    fontWeight: '600',
  },
  locationValue: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  remarksInput: {
    backgroundColor: Colors.cardSurface,
    color: Colors.text,
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    textAlignVertical: 'top',
    height: 80,
  },
  activeStatusCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  activeStatusHeader: {
    flex: 1,
    marginRight: 16,
  },
  activeStatusTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  activeStatusSubtitle: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  footerActions: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: Colors.card,
    borderColor: Colors.cardBorder,
    borderTopWidth: 1,
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  approveBtn: {
    backgroundColor: Colors.primary,
  },
  approveBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  pendingBtn: {
    backgroundColor: Colors.warning,
  },
  pendingBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  rejectBtn: {
    backgroundColor: Colors.danger,
  },
  rejectBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalBox: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  cancelBtn: {
    flex: 1,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: Colors.cardSurface,
  },
  cancelBtnText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  submitBtn: {
    flex: 1,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: Colors.primary,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
