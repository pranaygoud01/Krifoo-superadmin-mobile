import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Linking,
} from 'react-native';
import { Restaurant, VerificationStatus } from '../types';
import { Colors } from '../constants/colors';
import { StatusBadge } from './StatusBadge';
import { X, FileText, CheckCircle, XCircle, Clock } from 'lucide-react-native';

interface RestaurantDetailModalProps {
  visible: boolean;
  restaurant: Restaurant | null;
  onClose: () => void;
  onUpdateVerification: (status: VerificationStatus, remarks: string) => Promise<void>;
}

export const RestaurantDetailModal: React.FC<RestaurantDetailModalProps> = ({
  visible,
  restaurant,
  onClose,
  onUpdateVerification,
}) => {
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!restaurant) return null;

  const handleStatusSubmit = async (status: VerificationStatus) => {
    setSubmitting(true);
    await onUpdateVerification(status, remarks);
    setSubmitting(false);
    setRemarks('');
  };

  const addressText = typeof restaurant.address === 'object'
    ? restaurant.address?.formattedAddress || `${restaurant.address?.street || ''}, ${restaurant.address?.city || ''} ${restaurant.address?.pincode || ''}`
    : restaurant.address || 'N/A';

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Restaurant Verification</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
            {/* Banner & Basic Info */}
            <View style={styles.bannerRow}>
              {restaurant.imageUrl ? (
                <Image source={{ uri: restaurant.imageUrl }} style={styles.bannerImage} />
              ) : (
                <View style={[styles.bannerImage, styles.imagePlaceholder]}>
                  <Text style={styles.placeholderText}>{restaurant.restaurantName?.charAt(0)}</Text>
                </View>
              )}
              <View style={styles.bannerInfo}>
                <Text style={styles.restaurantName}>{restaurant.restaurantName}</Text>
                <Text style={styles.ownerText}>Owner: {restaurant.ownerName || 'Not specified'}</Text>
                <View style={styles.badgeWrap}>
                  <StatusBadge status={restaurant.verificationStatus} type="restaurant" />
                  <StatusBadge status={restaurant.isActive ? 'active' : 'inactive'} type="restaurant" />
                </View>
              </View>
            </View>

            {/* Info Grid */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Contact & Location</Text>
              <View style={styles.infoRow}>
                <Text style={styles.label}>Email:</Text>
                <Text style={styles.value}>{restaurant.email || 'N/A'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.label}>Phone:</Text>
                <Text style={styles.value}>{restaurant.phoneNumber || 'N/A'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.label}>Address:</Text>
                <Text style={styles.value}>{addressText}</Text>
              </View>
              {restaurant.cuisineTypes && restaurant.cuisineTypes.length > 0 ? (
                <View style={styles.infoRow}>
                  <Text style={styles.label}>Cuisines:</Text>
                  <Text style={styles.value}>{restaurant.cuisineTypes.join(', ')}</Text>
                </View>
              ) : null}
            </View>

            {/* Documents Section */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Submitted Verification Documents</Text>
              {restaurant.documents && restaurant.documents.length > 0 ? (
                restaurant.documents.map((doc, idx) => (
                  <View key={idx} style={styles.docItem}>
                    <FileText size={18} color={Colors.primary} />
                    <Text style={styles.docType}>{doc.docType || `Document ${idx + 1}`}</Text>
                    {doc.docUrl ? (
                      <TouchableOpacity
                        onPress={() => Linking.openURL(doc.docUrl)}
                        style={styles.viewDocBtn}
                      >
                        <Text style={styles.viewDocText}>View</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.noDocText}>No file attached</Text>
                    )}
                  </View>
                ))
              ) : (
                <Text style={styles.emptyDocText}>No specific documents attached in profile.</Text>
              )}
            </View>

            {/* Verification Remarks & Action Section */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Admin Remarks</Text>
              <TextInput
                style={styles.remarksInput}
                placeholder="Enter approval/rejection remarks or feedback for owner..."
                placeholderTextColor={Colors.textSubtle}
                multiline={true}
                numberOfLines={3}
                value={remarks}
                onChangeText={setRemarks}
              />

              {restaurant.verificationRemarks ? (
                <View style={styles.existingRemarksBox}>
                  <Text style={styles.existingRemarksTitle}>Previous Remarks:</Text>
                  <Text style={styles.existingRemarksText}>{restaurant.verificationRemarks}</Text>
                </View>
              ) : null}
            </View>
          </ScrollView>

          {/* Action Footer */}
          <View style={styles.footerActions}>
            <TouchableOpacity
              disabled={submitting}
              style={[styles.actionBtn, styles.approveBtn]}
              onPress={() => handleStatusSubmit('approved')}
            >
              <CheckCircle size={16} color="#FFFFFF" />
              <Text style={styles.approveBtnText}>Approve</Text>
            </TouchableOpacity>

            <TouchableOpacity
              disabled={submitting}
              style={[styles.actionBtn, styles.pendingBtn]}
              onPress={() => handleStatusSubmit('pending')}
            >
              <Clock size={16} color="#FFFFFF" />
              <Text style={styles.pendingBtnText}>Reset Pending</Text>
            </TouchableOpacity>

            <TouchableOpacity
              disabled={submitting}
              style={[styles.actionBtn, styles.rejectBtn]}
              onPress={() => handleStatusSubmit('rejected')}
            >
              <XCircle size={16} color="#FFFFFF" />
              <Text style={styles.rejectBtnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
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
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 6,
  },
  scrollBody: {
    padding: 16,
  },
  bannerRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  bannerImage: {
    width: 70,
    height: 70,
    borderRadius: 12,
  },
  imagePlaceholder: {
    backgroundColor: Colors.cardSurface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: '800',
  },
  bannerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  restaurantName: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 2,
  },
  ownerText: {
    color: Colors.textMuted,
    fontSize: 14,
    marginBottom: 6,
  },
  badgeWrap: {
    flexDirection: 'row',
    gap: 6,
  },
  sectionCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14,
  },
  sectionTitle: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  label: {
    color: Colors.textSubtle,
    width: 80,
    fontSize: 13,
    fontWeight: '600',
  },
  value: {
    color: Colors.text,
    fontSize: 13,
    flex: 1,
  },
  docItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  docType: {
    color: Colors.text,
    fontSize: 13,
    flex: 1,
    marginLeft: 8,
  },
  viewDocBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
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
  },
  remarksInput: {
    backgroundColor: '#FFFFFF',
    color: Colors.text,
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    textAlignVertical: 'top',
  },
  existingRemarksBox: {
    marginTop: 10,
    padding: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
  },
  existingRemarksTitle: {
    color: Colors.textSubtle,
    fontSize: 11,
    fontWeight: '700',
  },
  existingRemarksText: {
    color: Colors.warning,
    fontSize: 12,
    marginTop: 2,
  },
  footerActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
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
