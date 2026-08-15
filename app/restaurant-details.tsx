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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Header } from '../components/Header';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmModal } from '../components/ConfirmModal';
import { Colors } from '../constants/colors';
import { restaurantService } from '../services/restaurant.service';
import { useToast } from '../context/ToastContext';
import { Restaurant, VerificationStatus } from '../types';
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
  const [deactivateModalVisible, setDeactivateModalVisible] = useState(false);

  const fetchRestaurantDetail = async () => {
    if (!restaurantId) return;
    try {
      setLoading(true);
      const res = await restaurantService.getRestaurantById(restaurantId);
      if (res.success && res.data) {
        setRestaurant(res.data);
        setRemarks(res.data.verificationRemarks || '');
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
        // Reload details
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
    // If deactivating (value is false), prompt for confirmation
    if (!value) {
      setDeactivateModalVisible(true);
    } else {
      // Activating directly
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

  // Address Parsing
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
      <Header title="Verify Restaurant" showBackButton={true} />

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

        {/* FULL LOCATION DETAIL CARD */}
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
              {addr?.area && (
                <View style={styles.locationFieldRow}>
                  <Text style={styles.locationLabel}>Area/Neighborhood:</Text>
                  <Text style={styles.locationValue}>{addr.area}</Text>
                </View>
              )}
              {addr?.city && (
                <View style={styles.locationFieldRow}>
                  <Text style={styles.locationLabel}>City:</Text>
                  <Text style={styles.locationValue}>{addr.city}</Text>
                </View>
              )}
              {addr?.landmark && (
                <View style={styles.locationFieldRow}>
                  <Text style={styles.locationLabel}>Landmark:</Text>
                  <Text style={styles.locationValue}>{addr.landmark}</Text>
                </View>
              )}
              {addr?.pincode && (
                <View style={styles.locationFieldRow}>
                  <Text style={styles.locationLabel}>Pincode/Postcode:</Text>
                  <Text style={styles.locationValue}>{addr.pincode}</Text>
                </View>
              )}

              {/* Coordinates display */}
              {addr?.coordinates?.coordinates && (
                <View style={[styles.locationFieldRow, styles.coordsRow]}>
                  <Text style={styles.locationLabel}>Coordinates:</Text>
                  <Text style={styles.coordsValue}>
                    Lng: {addr.coordinates.coordinates[0]?.toFixed(6)}, Lat:{' '}
                    {addr.coordinates.coordinates[1]?.toFixed(6)}
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.locationFields}>
              <View style={styles.locationFieldRow}>
                <Text style={styles.locationLabel}>Address Text:</Text>
                <Text style={styles.locationValue}>{displayAddress}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Submitted Documents Card */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Verification Documents</Text>
          {restaurant.documents && restaurant.documents.length > 0 ? (
            restaurant.documents.map((doc, idx) => (
              <View key={idx} style={styles.docItem}>
                <FileText size={20} color={Colors.primary} />
                <View style={styles.docInfo}>
                  <Text style={styles.docType}>{doc.docType || `Document ${idx + 1}`}</Text>
                  <Text style={styles.docStatus}>Status: {doc.status?.toUpperCase() || 'PENDING'}</Text>
                </View>
                {doc.docUrl ? (
                  <TouchableOpacity
                    onPress={() => Linking.openURL(doc.docUrl)}
                    style={styles.viewDocBtn}
                  >
                    <Text style={styles.viewDocText}>View File</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.noDocText}>No attachment</Text>
                )}
              </View>
            ))
          ) : (
            <Text style={styles.emptyDocText}>No verification documents submitted in profile.</Text>
          )}
        </View>

        {/* Verification Status Feedback Remarks */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Verification Feedback & Remarks</Text>
          <TextInput
            style={styles.remarksInput}
            placeholder="Type verification remarks, reasons for rejection, or general feedback here..."
            placeholderTextColor={Colors.textSubtle}
            multiline={true}
            numberOfLines={4}
            value={remarks}
            onChangeText={setRemarks}
          />
          {restaurant.verificationRemarks ? (
            <View style={styles.previousRemarksBox}>
              <Text style={styles.previousRemarksLabel}>Active feedback history:</Text>
              <Text style={styles.previousRemarksText}>{restaurant.verificationRemarks}</Text>
            </View>
          ) : null}
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
    width: 80,
    height: 80,
    borderRadius: 14,
  },
  imagePlaceholder: {
    backgroundColor: Colors.cardSurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: Colors.text,
    fontSize: 32,
    fontWeight: '800',
  },
  bannerInfo: {
    flex: 1,
    marginLeft: 14,
  },
  restaurantName: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  rowAlign: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  ownerText: {
    color: Colors.textMuted,
    fontSize: 13,
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
    gap: 6,
    marginBottom: 12,
  },
  sectionTitle: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  detailVal: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
  locationFields: {
    gap: 10,
    marginTop: 4,
  },
  locationFieldRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    paddingVertical: 8,
  },
  locationLabel: {
    color: Colors.textSubtle,
    width: 120,
    fontSize: 13,
    fontWeight: '600',
  },
  locationValue: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  coordsRow: {
    borderBottomWidth: 0,
    backgroundColor: Colors.cardSurface,
    borderRadius: 8,
    paddingHorizontal: 10,
    marginTop: 4,
  },
  coordsValue: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  docItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  docInfo: {
    flex: 1,
    marginLeft: 10,
  },
  docType: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  docStatus: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  viewDocBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  viewDocText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  noDocText: {
    color: Colors.textSubtle,
    fontSize: 12,
  },
  emptyDocText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 10,
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
    height: 90,
  },
  previousRemarksBox: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FEF3C7',
  },
  previousRemarksLabel: {
    color: Colors.warning,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  previousRemarksText: {
    color: Colors.text,
    fontSize: 13,
    marginTop: 2,
    fontWeight: '500',
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
    marginBottom: 30,
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
    fontWeight: '800',
    fontSize: 13,
  },
});
