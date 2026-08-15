import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Header } from '../components/Header';
import { Colors } from '../constants/colors';
import { restaurantOwnerService } from '../services/restaurant-owner.service';
import { Plus, Megaphone, Trash2, X, Check, Tag, Calendar, Sparkles } from 'lucide-react-native';

interface Campaign {
  _id: string;
  title: string;
  content: string;
  announcementType: 'text' | 'image' | 'offer';
  imageUrl?: string;
  isActive: boolean;
  offerDetails?: {
    promoCode: string;
    discountType: 'percentage' | 'flat';
    discountValue: number;
    minOrderValue: number;
    validUntil: string;
  };
  reactions?: {
    like?: number;
    love?: number;
    wow?: number;
  };
}

export default function MarketingScreen() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formState, setFormState] = useState({
    title: '',
    content: '',
    announcementType: 'text' as 'text' | 'offer',
    promoCode: '',
    discountType: 'percentage' as 'percentage' | 'flat',
    discountValue: '',
    minOrderValue: '',
    validUntil: '',
  });

  const loadCampaigns = async () => {
    setLoading(true);
    try {
      const [campRes, statsRes] = await Promise.all([
        restaurantOwnerService.getAnnouncements(),
        restaurantOwnerService.getAnnouncementStats(),
      ]);

      if (campRes.success && campRes.data) {
        setCampaigns(campRes.data);
      }
      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      }
    } catch (e) {
      console.error('Failed loading marketing campaigns:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  const openAddModal = () => {
    // Default validUntil to 30 days from now
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);
    const dateString = nextMonth.toISOString().split('T')[0];

    setFormState({
      title: '',
      content: '',
      announcementType: 'text',
      promoCode: '',
      discountType: 'percentage',
      discountValue: '',
      minOrderValue: '',
      validUntil: dateString,
    });
    setModalVisible(true);
  };

  const handleToggleStatus = async (campaign: Campaign) => {
    try {
      const res = await restaurantOwnerService.toggleAnnouncement(campaign._id);
      if (res.success) {
        setCampaigns((prev) =>
          prev.map((c) => (c._id === campaign._id ? { ...c, isActive: !c.isActive } : c))
        );
      } else {
        Alert.alert('Error', res.message || 'Failed to update campaign status.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    Alert.alert('Delete Campaign', 'Are you sure you want to delete this marketing campaign?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const res = await restaurantOwnerService.deleteAnnouncement(id);
          if (res.success) {
            Alert.alert('Success', 'Campaign deleted.');
            loadCampaigns();
          } else {
            Alert.alert('Error', res.message || 'Failed to delete campaign.');
          }
        },
      },
    ]);
  };

  const handleCreateCampaign = async () => {
    if (!formState.title.trim()) return Alert.alert('Error', 'Campaign title is required.');
    if (!formState.content.trim()) return Alert.alert('Error', 'Campaign description is required.');

    if (formState.announcementType === 'offer') {
      if (!formState.promoCode.trim()) return Alert.alert('Error', 'Promo code is required.');
      if (!formState.discountValue || isNaN(Number(formState.discountValue))) {
        return Alert.alert('Error', 'Please enter a valid discount value.');
      }
      if (!formState.minOrderValue || isNaN(Number(formState.minOrderValue))) {
        return Alert.alert('Error', 'Please enter a valid minimum order value.');
      }
    }

    setSubmitting(true);
    try {
      const uploadData = new FormData();
      uploadData.append('title', formState.title.trim());
      uploadData.append('content', formState.content.trim());
      uploadData.append('announcementType', formState.announcementType);

      if (formState.announcementType === 'offer') {
        const details = {
          promoCode: formState.promoCode.trim().toUpperCase(),
          discountType: formState.discountType,
          discountValue: Number(formState.discountValue),
          minOrderValue: Number(formState.minOrderValue),
          validUntil: formState.validUntil || new Date().toISOString(),
        };
        uploadData.append('offerDetails', JSON.stringify(details));
      }

      const res = await restaurantOwnerService.createAnnouncement(uploadData);
      if (res.success) {
        setModalVisible(false);
        loadCampaigns();
      } else {
        Alert.alert('Error', res.message || 'Failed to launch campaign.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Marketing Panel" showBackButton={true} />

      {/* Stats Summary Panel */}
      {stats && (
        <View style={styles.statsPanel}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.totalCampaigns || 0}</Text>
            <Text style={styles.statLabel}>Campaigns</Text>
          </View>
          <View style={[styles.statCard, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.cardBorder }]}>
            <Text style={styles.statValue}>{stats.activeOffers || 0}</Text>
            <Text style={styles.statLabel}>Active Promo Codes</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.totalReactions || 0}</Text>
            <Text style={styles.statLabel}>Customer Views</Text>
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Fetching campaigns...</Text>
        </View>
      ) : campaigns.length === 0 ? (
        <View style={styles.centerBox}>
          <Megaphone size={48} color={Colors.cardBorder} />
          <Text style={styles.emptyTitle}>No Campaigns Found</Text>
          <Text style={styles.emptySub}>
            Reach out to customers by announcing menu offers, discounts, or new cuisines.
          </Text>
          <TouchableOpacity style={styles.createBtn} onPress={openAddModal}>
            <Text style={styles.createBtnText}>Create Campaign</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={campaigns}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.campaignCard}>
              <View style={styles.campaignHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.campaignTitle}>{item.title}</Text>
                  <View style={styles.badgeRow}>
                    <View style={[styles.typeBadge, item.announcementType === 'offer' ? styles.badgePurple : styles.badgeBlue]}>
                      <Text style={[styles.typeText, item.announcementType === 'offer' ? { color: '#7C3AED' } : { color: '#0284C7' }]}>
                        {item.announcementType.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.switchCol}>
                  <Switch
                    value={item.isActive}
                    onValueChange={() => handleToggleStatus(item)}
                    trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                    thumbColor={item.isActive ? Colors.primary : Colors.textSubtle}
                    style={{ transform: [{ scaleX: 0.75 }, { scaleY: 0.75 }] }}
                  />
                </View>
              </View>

              <Text style={styles.campaignContent}>{item.content}</Text>

              {item.announcementType === 'offer' && item.offerDetails ? (
                <View style={styles.couponContainer}>
                  <View style={styles.couponHeader}>
                    <Tag size={12} color={Colors.primary} style={{ marginRight: 6 }} />
                    <Text style={styles.couponCode}>{item.offerDetails.promoCode}</Text>
                  </View>
                  <View style={styles.couponDetails}>
                    <Text style={styles.couponValue}>
                      {item.offerDetails.discountType === 'percentage'
                        ? `${item.offerDetails.discountValue}% Off`
                        : `€${item.offerDetails.discountValue.toFixed(2)} Off`}
                    </Text>
                    <Text style={styles.couponMin}>Min Order: €{item.offerDetails.minOrderValue}</Text>
                  </View>
                  {item.offerDetails.validUntil ? (
                    <View style={styles.validityRow}>
                      <Calendar size={10} color={Colors.textSubtle} style={{ marginRight: 4 }} />
                      <Text style={styles.validityText}>Valid Until: {item.offerDetails.validUntil.split('T')[0]}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* View Reactions if they exist */}
              {item.reactions && (Object.values(item.reactions).reduce((a, b) => a + b, 0) > 0) && (
                <View style={styles.reactionsRow}>
                  <Sparkles size={11} color={Colors.success} style={{ marginRight: 4 }} />
                  <Text style={styles.reactionsText}>
                    Engagements: {item.reactions.like || 0} Likes · {item.reactions.love || 0} Loves · {item.reactions.wow || 0} Wows
                  </Text>
                </View>
              )}

              <View style={styles.cardFooter}>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  activeOpacity={0.7}
                  onPress={() => handleDeleteCampaign(item._id)}
                >
                  <Trash2 size={13} color={Colors.danger} style={{ marginRight: 4 }} />
                  <Text style={styles.deleteBtnText}>Remove Campaign</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      {/* Floating Add FAB */}
      {campaigns.length > 0 && (
        <TouchableOpacity style={styles.fab} onPress={openAddModal} activeOpacity={0.85}>
          <Plus size={24} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* Add Campaign Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Launch Campaign</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <X size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Campaign Type</Text>
                <View style={styles.selectorRow}>
                  <TouchableOpacity
                    style={[styles.selectorItem, formState.announcementType === 'text' && styles.selectorItemActive]}
                    onPress={() => setFormState((prev) => ({ ...prev, announcementType: 'text' }))}
                  >
                    <Text style={[styles.selectorLabel, formState.announcementType === 'text' && styles.selectorLabelActive]}>
                      News / Info Text
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.selectorItem, formState.announcementType === 'offer' && styles.selectorItemActive]}
                    onPress={() => setFormState((prev) => ({ ...prev, announcementType: 'offer' }))}
                  >
                    <Text style={[styles.selectorLabel, formState.announcementType === 'offer' && styles.selectorLabelActive]}>
                      Discount Offer
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Campaign Title</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Weekend Pizza Fiesta!"
                  value={formState.title}
                  onChangeText={(val) => setFormState((prev) => ({ ...prev, title: val }))}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Description Content</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Get weekend discount or general announcements details..."
                  multiline
                  numberOfLines={3}
                  value={formState.content}
                  onChangeText={(val) => setFormState((prev) => ({ ...prev, content: val }))}
                />
              </View>

              {formState.announcementType === 'offer' && (
                <View style={styles.offerSection}>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Promo Code (Coupon)</Text>
                    <TextInput
                      style={[styles.input, { textTransform: 'uppercase' }]}
                      placeholder="e.g. SAVE20"
                      value={formState.promoCode}
                      onChangeText={(val) => setFormState((prev) => ({ ...prev, promoCode: val }))}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Discount Type</Text>
                    <View style={styles.selectorRow}>
                      <TouchableOpacity
                        style={[styles.selectorItem, formState.discountType === 'percentage' && styles.selectorItemActive]}
                        onPress={() => setFormState((prev) => ({ ...prev, discountType: 'percentage' }))}
                      >
                        <Text style={[styles.selectorLabel, formState.discountType === 'percentage' && styles.selectorLabelActive]}>
                          Percentage %
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.selectorItem, formState.discountType === 'flat' && styles.selectorItemActive]}
                        onPress={() => setFormState((prev) => ({ ...prev, discountType: 'flat' }))}
                      >
                        <Text style={[styles.selectorLabel, formState.discountType === 'flat' && styles.selectorLabelActive]}>
                          Flat Cash €
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.rowInputs}>
                    <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                      <Text style={styles.label}>Discount Value</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="20"
                        keyboardType="numeric"
                        value={formState.discountValue}
                        onChangeText={(val) => setFormState((prev) => ({ ...prev, discountValue: val }))}
                      />
                    </View>
                    <View style={[styles.inputGroup, { flex: 1 }]}>
                      <Text style={styles.label}>Min Order (€)</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="15"
                        keyboardType="numeric"
                        value={formState.minOrderValue}
                        onChangeText={(val) => setFormState((prev) => ({ ...prev, minOrderValue: val }))}
                      />
                    </View>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Expiry Date (YYYY-MM-DD)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. 2026-12-31"
                      value={formState.validUntil}
                      onChangeText={(val) => setFormState((prev) => ({ ...prev, validUntil: val }))}
                    />
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={[styles.saveBtn, submitting && { opacity: 0.7 }]}
                disabled={submitting}
                onPress={handleCreateCampaign}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.saveBtnText}>Launch Campaign</Text>
                    <Check size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
                  </>
                )}
              </TouchableOpacity>
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
  statsPanel: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
    paddingVertical: 12,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  statLabel: {
    fontSize: 10,
    color: Colors.textSubtle,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
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
  campaignCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.cardBorder,
    padding: 14,
    marginBottom: 12,
  },
  campaignHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  campaignTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.2,
  },
  badgeRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  typeBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgePurple: {
    backgroundColor: '#F3E8FF',
  },
  badgeBlue: {
    backgroundColor: '#E0F2FE',
  },
  typeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  switchCol: {
    paddingLeft: 10,
  },
  campaignContent: {
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 18,
    marginVertical: 8,
  },
  couponContainer: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 10,
    marginVertical: 6,
  },
  couponHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  couponCode: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  couponDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  couponValue: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
  },
  couponMin: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  validityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  validityText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSubtle,
  },
  reactionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  reactionsText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textSubtle,
  },
  cardFooter: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  deleteBtnText: {
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
  modalBody: {
    padding: 16,
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
  textArea: {
    height: 80,
    paddingTop: 12,
    textAlignVertical: 'top',
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
    fontSize: 12,
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
  offerSection: {
    gap: 0,
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
