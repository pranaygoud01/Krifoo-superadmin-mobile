import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Order, UserAccount } from '../types';
import { Colors } from '../constants/colors';
import { userService } from '../services/user.service';
import { X, Bike, Check, Phone } from 'lucide-react-native';

interface AssignDeliveryModalProps {
  visible: boolean;
  order: Order | null;
  onClose: () => void;
  onConfirmAssign: (deliveryPartnerId: string) => Promise<void>;
}

export const AssignDeliveryModal: React.FC<AssignDeliveryModalProps> = ({
  visible,
  order,
  onClose,
  onConfirmAssign,
}) => {
  const [partners, setPartners] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      loadDeliveryPartners();
      if (order && typeof order.deliveryPartnerId === 'object') {
        setSelectedPartnerId(order.deliveryPartnerId._id);
      } else {
        setSelectedPartnerId(null);
      }
    }
  }, [visible, order]);

  const loadDeliveryPartners = async () => {
    setLoading(true);
    const res = await userService.getAllUsers('delivery_partner');
    if (res.success && res.data) {
      setPartners(res.data);
    }
    setLoading(false);
  };

  const handleAssign = async () => {
    if (!selectedPartnerId) return;
    setSubmitting(true);
    await onConfirmAssign(selectedPartnerId);
    setSubmitting(false);
    onClose();
  };

  if (!order) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Bike size={20} color={Colors.primary} />
              <Text style={styles.headerTitle}>Assign Delivery Partner</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.orderSummary}>
            <Text style={styles.orderSummaryText}>
              Assigning driver for Order #{order.orderNumber || order._id?.substring(0, 8)}
            </Text>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Fetching available delivery partners...</Text>
            </View>
          ) : partners.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No registered delivery partners found.</Text>
            </View>
          ) : (
            <FlatList
              data={partners}
              keyExtractor={(item) => item._id}
              style={styles.list}
              renderItem={({ item }) => {
                const isSelected = selectedPartnerId === item._id;
                return (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setSelectedPartnerId(item._id)}
                    style={[styles.partnerItem, isSelected && styles.partnerItemSelected]}
                  >
                    <View style={styles.partnerInfo}>
                      <Text style={styles.partnerName}>{item.fullName}</Text>
                      {item.phoneNumber ? (
                        <View style={styles.partnerPhoneRow}>
                          <Phone size={12} color={Colors.textSubtle} />
                          <Text style={styles.partnerPhone}>{item.phoneNumber}</Text>
                        </View>
                      ) : null}
                      {item.vehicleNumber ? (
                        <Text style={styles.partnerVehicle}>
                          Vehicle: {item.vehicleType || ''} ({item.vehicleNumber})
                        </Text>
                      ) : null}
                    </View>

                    {isSelected && (
                      <View style={styles.checkCircle}>
                        <Check size={16} color="#FFFFFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}

          <View style={styles.footer}>
            <TouchableOpacity
              disabled={!selectedPartnerId || submitting}
              style={[
                styles.confirmBtn,
                (!selectedPartnerId || submitting) && styles.confirmBtnDisabled,
              ]}
              onPress={handleAssign}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmBtnText}>Confirm Assignment</Text>
              )}
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
    maxHeight: '80%',
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 6,
  },
  orderSummary: {
    backgroundColor: Colors.card,
    padding: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  orderSummaryText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  loadingBox: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 10,
  },
  emptyBox: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: Colors.textSubtle,
    fontSize: 14,
  },
  list: {
    padding: 16,
  },
  partnerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 12,
    marginBottom: 10,
  },
  partnerItemSelected: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
  },
  partnerInfo: {
    flex: 1,
  },
  partnerName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  partnerPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  partnerPhone: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  partnerVehicle: {
    color: Colors.textSubtle,
    fontSize: 11,
    marginTop: 2,
  },
  checkCircle: {
    backgroundColor: Colors.primary,
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  confirmBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmBtnDisabled: {
    opacity: 0.5,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
});
