import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Header } from '../components/Header';
import { Colors } from '../constants/colors';
import { deliveryChargeService } from '../services/delivery-charge.service';
import { useToast } from '../context/ToastContext';
import { DeliveryChargeTier } from '../types';
import {
  Plus,
  Edit2,
  Trash2,
  Truck,
  MapPin,
  Save,
  X,
  ShieldAlert,
} from 'lucide-react-native';

export default function DeliveryChargesScreen() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const { showToast } = useToast();

  const [tiers, setTiers] = useState<DeliveryChargeTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTier, setEditingTier] = useState<DeliveryChargeTier | null>(null);
  const [maxDistance, setMaxDistance] = useState('');
  const [charge, setCharge] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchTiers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await deliveryChargeService.getDeliveryCharges();
      if (res.success && res.data) {
        // Sort tiers by distance ascending
        const sorted = [...res.data].sort((a, b) => Number(a.maxDistance) - Number(b.maxDistance));
        setTiers(sorted);
      } else {
        showToast({ title: 'Error', message: res.message || 'Failed to load delivery charges', type: 'error' });
      }
    } catch (e: any) {
      showToast({ title: 'Error', message: e.message || 'Could not fetch delivery charges', type: 'error' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTiers();
  }, [fetchTiers]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchTiers();
  };

  const handleOpenAdd = () => {
    setEditingTier(null);
    setMaxDistance('');
    setCharge('');
    setModalVisible(true);
  };

  const handleOpenEdit = (tier: DeliveryChargeTier) => {
    setEditingTier(tier);
    setMaxDistance(String(tier.maxDistance));
    setCharge(String(tier.charge));
    setModalVisible(true);
  };

  const handleSaveTier = async () => {
    const distNum = parseFloat(maxDistance);
    const chargeNum = parseFloat(charge);

    if (isNaN(distNum) || distNum < 0) {
      showToast({ title: 'Validation', message: 'Enter a valid maximum distance in miles.', type: 'error' });
      return;
    }
    if (isNaN(chargeNum) || chargeNum < 0) {
      showToast({ title: 'Validation', message: 'Enter a valid delivery charge in £.', type: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      let res;
      if (editingTier) {
        res = await deliveryChargeService.updateDeliveryCharge(editingTier._id, {
          maxDistance: distNum,
          charge: chargeNum,
        });
      } else {
        res = await deliveryChargeService.createDeliveryCharge({
          maxDistance: distNum,
          charge: chargeNum,
        });
      }

      if (res.success) {
        showToast({
          title: 'Success',
          message: editingTier ? 'Delivery tier updated.' : 'New delivery tier created.',
          type: 'success',
        });
        setModalVisible(false);
        fetchTiers();
      } else {
        showToast({ title: 'Error', message: res.message || 'Failed to save delivery tier', type: 'error' });
      }
    } catch (e: any) {
      showToast({ title: 'Error', message: e.message || 'Error occurred while saving', type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTier = (tier: DeliveryChargeTier) => {
    Alert.alert(
      'Delete Delivery Tier',
      `Delete tier up to ${tier.maxDistance} miles (£${tier.charge})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await deliveryChargeService.deleteDeliveryCharge(tier._id);
              if (res.success) {
                showToast({ title: 'Deleted', message: 'Tier deleted successfully.', type: 'success' });
                fetchTiers();
              } else {
                showToast({ title: 'Error', message: res.message || 'Failed to delete tier', type: 'error' });
              }
            } catch (e: any) {
              showToast({ title: 'Error', message: e.message || 'Error deleting tier', type: 'error' });
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Header
        title="Delivery Charges"
        showBackButton={true}
        rightAction={
          <TouchableOpacity style={styles.addHeaderBtn} onPress={handleOpenAdd}>
            <Plus size={18} color="#FFFFFF" />
            <Text style={styles.addHeaderBtnText}>Add Tier</Text>
          </TouchableOpacity>
        }
      />

      <View style={styles.infoBanner}>
        <Truck size={20} color={Colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.infoTitle}>Platform Delivery Tiers</Text>
          <Text style={styles.infoSubtitle}>
            Configure standard distance-based delivery charges applied to customer orders on the marketplace.
          </Text>
        </View>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Fetching delivery tiers...</Text>
        </View>
      ) : (
        <FlatList
          data={tiers}
          keyExtractor={(item) => item._id}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          contentContainerStyle={[
            styles.listContent,
            { paddingHorizontal: isTablet ? 24 : 16, maxWidth: 840, alignSelf: 'center', width: '100%' },
          ]}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <ShieldAlert size={44} color={Colors.textSubtle} />
              <Text style={styles.emptyTitle}>No Delivery Tiers Configured</Text>
              <Text style={styles.emptySubtitle}>
                Add distance threshold tiers (e.g. 0-2 miles: £2.00, 2-3 miles: £3.00).
              </Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={styles.tierCard}>
              <View style={styles.tierIndexBadge}>
                <Text style={styles.tierIndexText}>#{index + 1}</Text>
              </View>

              <View style={styles.tierDetails}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MapPin size={16} color={Colors.primary} />
                  <Text style={styles.tierDistanceText}>
                    Up to <Text style={{ fontWeight: '800' }}>{item.maxDistance} Miles</Text>
                  </Text>
                </View>
                <Text style={styles.tierSub}>Standard delivery charge bracket</Text>
              </View>

              <View style={styles.tierPriceBadge}>
                <Text style={styles.tierPriceText}>£{Number(item.charge).toFixed(2)}</Text>
              </View>

              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleOpenEdit(item)}>
                  <Edit2 size={16} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.deleteBtn]}
                  onPress={() => handleDeleteTier(item)}
                >
                  <Trash2 size={16} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* Add / Edit Tier Modal */}
      <Modal visible={modalVisible} transparent={true} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingTier ? 'Edit Delivery Tier' : 'Add Delivery Tier'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={20} color={Colors.textSubtle} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Max Distance (Miles) *</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. 2, 3, 5"
                  placeholderTextColor={Colors.textSubtle}
                  keyboardType="numeric"
                  value={maxDistance}
                  onChangeText={setMaxDistance}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Delivery Charge (£) *</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="e.g. 2.50"
                  placeholderTextColor={Colors.textSubtle}
                  keyboardType="numeric"
                  value={charge}
                  onChangeText={setCharge}
                />
              </View>
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
                disabled={submitting}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
                onPress={handleSaveTier}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Save size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.submitBtnText}>{editingTier ? 'Update' : 'Save Tier'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  addHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  addHeaderBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    gap: 12,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  infoSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: Colors.textMuted,
    fontSize: 14,
  },
  listContent: {
    paddingVertical: 16,
    gap: 10,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 14,
  },
  emptySubtitle: {
    color: Colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  tierCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  tierIndexBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.cardSurface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  tierIndexText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textMuted,
  },
  tierDetails: {
    flex: 1,
    marginLeft: 12,
  },
  tierDistanceText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  tierSub: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
  },
  tierPriceBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  tierPriceText: {
    color: '#2563EB',
    fontSize: 15,
    fontWeight: '800',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtn: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FEE2E2',
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
    maxWidth: 460,
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
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  modalBody: {
    padding: 16,
    gap: 14,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  modalInput: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingHorizontal: 12,
    height: 42,
    color: Colors.text,
    fontSize: 14,
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
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  cancelBtnText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  submitBtn: {
    flex: 2,
    height: 42,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
