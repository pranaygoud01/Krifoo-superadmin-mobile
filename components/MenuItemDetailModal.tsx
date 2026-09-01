import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Switch,
} from 'react-native';
import { MenuItem } from '../types';
import { Colors } from '../constants/colors';
import {
  X,
  Utensils,
  Edit2,
  Trash2,
  Tag,
  CheckCircle2,
  XCircle,
  Percent,
  Layers,
  PlusCircle,
  Truck,
  ShoppingBag,
  Store,
  Sparkles,
} from 'lucide-react-native';

interface MenuItemDetailModalProps {
  visible: boolean;
  item: MenuItem | null;
  onClose: () => void;
  onEdit: (item: MenuItem) => void;
  onDelete: (itemId: string) => void;
  onToggleAvailability: (itemId: string, currentStatus: boolean) => void;
  isSuperAdmin?: boolean;
}

export const MenuItemDetailModal: React.FC<MenuItemDetailModalProps> = ({
  visible,
  item,
  onClose,
  onEdit,
  onDelete,
  onToggleAvailability,
  isSuperAdmin = false,
}) => {
  if (!item) return null;

  const itemName = item.itemName || item.name || 'Unnamed Item';
  const itemPrice = item.basePrice ?? item.price ?? 0;
  const itemCategory = item.categories?.[0]?.categoryName || item.category || 'General';
  const imageUrl = item.displayImageUrl || item.displayImage;
  const discount = item.discountPercentage || 0;
  const discountedPrice = discount > 0 ? itemPrice * (1 - discount / 100) : itemPrice;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                Item Details
              </Text>
              <Text style={styles.headerSubtitle}>{itemCategory}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <X size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
            {/* Top Banner & Hero Info */}
            <View style={styles.bannerRow}>
              {imageUrl ? (
                <Image source={{ uri: imageUrl }} style={styles.bannerImage} resizeMode="cover" />
              ) : (
                <View style={[styles.bannerImage, styles.imagePlaceholder]}>
                  <Utensils size={32} color={Colors.textSubtle} />
                </View>
              )}

              <View style={styles.bannerInfo}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {itemName}
                </Text>

                <View style={styles.typeBadgeRow}>
                  {item.itemType ? (
                    <View
                      style={[
                        styles.badge,
                        item.itemType === 'veg'
                          ? styles.badgeVeg
                          : item.itemType === 'egg'
                          ? styles.badgeEgg
                          : styles.badgeNonVeg,
                      ]}
                    >
                      <View
                        style={[
                          styles.dot,
                          {
                            backgroundColor:
                              item.itemType === 'veg'
                                ? '#10B981'
                                : item.itemType === 'egg'
                                ? '#F59E0B'
                                : '#EF4444',
                          },
                        ]}
                      />
                      <Text
                        style={[
                          styles.badgeText,
                          {
                            color:
                              item.itemType === 'veg'
                                ? '#065F46'
                                : item.itemType === 'egg'
                                ? '#92400E'
                                : '#991B1B',
                          },
                        ]}
                      >
                        {item.itemType.toUpperCase()}
                      </Text>
                    </View>
                  ) : null}

                  {item.pricingType && item.pricingType !== 'fixed' ? (
                    <View style={[styles.badge, styles.badgeNeutral]}>
                      <Text style={styles.badgeNeutralText}>
                        {item.pricingType.toUpperCase()}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Availability Toggle */}
                <View style={styles.availabilityRow}>
                  <Text style={styles.availabilityLabel}>
                    Status: <Text style={{ fontWeight: '800', color: item.isAvailable ? '#059669' : Colors.textMuted }}>{item.isAvailable ? 'Active' : 'Inactive'}</Text>
                  </Text>
                  <Switch
                    value={!!item.isAvailable}
                    onValueChange={() => onToggleAvailability(item._id, !!item.isAvailable)}
                    trackColor={{ true: Colors.primaryLight, false: Colors.cardBorder }}
                    thumbColor={item.isAvailable ? Colors.primary : Colors.textSubtle}
                    style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                  />
                </View>
              </View>
            </View>

            {/* Price & Discount Card */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Pricing Information</Text>
              <View style={styles.priceContainer}>
                <View>
                  <Text style={styles.priceMain}>£{Number(discountedPrice).toFixed(2)}</Text>
                  {discount > 0 && (
                    <Text style={styles.originalPrice}>
                      Base: £{Number(itemPrice).toFixed(2)}
                    </Text>
                  )}
                </View>

                {discount > 0 && (
                  <View style={styles.discountBadge}>
                    <Percent size={12} color="#FFFFFF" style={{ marginRight: 4 }} />
                    <Text style={styles.discountBadgeText}>{discount}% OFF</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Description */}
            {item.description ? (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Description</Text>
                <Text style={styles.descriptionText}>{item.description}</Text>
              </View>
            ) : null}

            {/* Product Specifications */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Specifications & Channels</Text>
              <View style={styles.specGrid}>
                {item.weightUnit ? (
                  <View style={styles.specItem}>
                    <Text style={styles.specLabel}>Unit / Weight</Text>
                    <Text style={styles.specValue}>{item.weightUnit.toUpperCase()}</Text>
                  </View>
                ) : null}

                {item.packageType ? (
                  <View style={styles.specItem}>
                    <Text style={styles.specLabel}>Package Type</Text>
                    <Text style={styles.specValue}>{item.packageType}</Text>
                  </View>
                ) : null}

                <View style={styles.specItem}>
                  <Text style={styles.specLabel}>Min / Max Order Qty</Text>
                  <Text style={styles.specValue}>
                    {item.minimumQuantity ?? 1} - {item.maximumQuantity ?? 'Unlimited'}
                  </Text>
                </View>
              </View>

              {/* Service Channels */}
              <View style={styles.channelRow}>
                <View
                  style={[
                    styles.channelPill,
                    item.availableForDelivery !== false ? styles.channelActive : styles.channelInactive,
                  ]}
                >
                  <Truck size={14} color={item.availableForDelivery !== false ? Colors.primary : Colors.textSubtle} />
                  <Text
                    style={[
                      styles.channelText,
                      item.availableForDelivery !== false ? styles.channelActiveText : styles.channelInactiveText,
                    ]}
                  >
                    Delivery
                  </Text>
                </View>

                <View
                  style={[
                    styles.channelPill,
                    item.availableForEatIn !== false ? styles.channelActive : styles.channelInactive,
                  ]}
                >
                  <Store size={14} color={item.availableForEatIn !== false ? Colors.primary : Colors.textSubtle} />
                  <Text
                    style={[
                      styles.channelText,
                      item.availableForEatIn !== false ? styles.channelActiveText : styles.channelInactiveText,
                    ]}
                  >
                    Eat-In
                  </Text>
                </View>

                <View
                  style={[
                    styles.channelPill,
                    item.availableForCollection !== false ? styles.channelActive : styles.channelInactive,
                  ]}
                >
                  <ShoppingBag size={14} color={item.availableForCollection !== false ? Colors.primary : Colors.textSubtle} />
                  <Text
                    style={[
                      styles.channelText,
                      item.availableForCollection !== false ? styles.channelActiveText : styles.channelInactiveText,
                    ]}
                  >
                    Collection
                  </Text>
                </View>
              </View>
            </View>

            {/* Special Badges & Offers */}
            {(item.isBestseller || item.isBuyOneGetOne || item.offerTag) && (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Offers & Badges</Text>
                <View style={styles.badgeRowWrap}>
                  {item.isBestseller && (
                    <View style={[styles.offerBadge, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
                      <Sparkles size={12} color="#D97706" style={{ marginRight: 4 }} />
                      <Text style={[styles.offerBadgeText, { color: '#B45309' }]}>Bestseller</Text>
                    </View>
                  )}
                  {item.isBuyOneGetOne && (
                    <View style={[styles.offerBadge, { backgroundColor: '#EDE9FE', borderColor: '#8B5CF6' }]}>
                      <Text style={[styles.offerBadgeText, { color: '#6D28D9' }]}>Buy 1 Get 1 Free</Text>
                    </View>
                  )}
                  {item.offerTag ? (
                    <View style={[styles.offerBadge, { backgroundColor: '#FEE2E2', borderColor: '#EF4444' }]}>
                      <Tag size={12} color="#DC2626" style={{ marginRight: 4 }} />
                      <Text style={[styles.offerBadgeText, { color: '#B91C1C' }]}>{item.offerTag}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            )}

            {/* Weight Variants */}
            {item.weightVariants && item.weightVariants.length > 0 && (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>
                  Weight Variants ({item.weightVariants.length})
                </Text>
                {item.weightVariants.map((v, idx) => (
                  <View key={idx} style={styles.variantItemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.variantName}>
                        {v.variantName || `${v.weight} ${v.unit}`}
                      </Text>
                      {v.cutType ? (
                        <Text style={styles.variantCut}>Cut: {v.cutType}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.variantPrice}>£{Number(v.price).toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Variant Groups (Sizes, Options) */}
            {item.variantGroups && item.variantGroups.length > 0 && (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>
                  Variant Groups ({item.variantGroups.length})
                </Text>
                {item.variantGroups.map((group, gIdx) => (
                  <View key={gIdx} style={styles.groupContainer}>
                    <View style={styles.groupHeader}>
                      <Layers size={14} color={Colors.primary} style={{ marginRight: 6 }} />
                      <Text style={styles.groupTitle}>{group.title || `Group ${gIdx + 1}`}</Text>
                      {group.isRequired && (
                        <Text style={styles.requiredBadge}>Required</Text>
                      )}
                    </View>
                    {group.options &&
                      group.options.map((opt: any, oIdx: number) => (
                        <View key={oIdx} style={styles.optionRow}>
                          <Text style={styles.optionName}>{opt.name}</Text>
                          <Text style={styles.optionPrice}>
                            {opt.price > 0 ? `+£${Number(opt.price).toFixed(2)}` : 'Free'}
                          </Text>
                        </View>
                      ))}
                  </View>
                ))}
              </View>
            )}

            {/* Add-on Groups */}
            {item.addonGroups && item.addonGroups.length > 0 && (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>
                  Add-on Groups ({item.addonGroups.length})
                </Text>
                {item.addonGroups.map((group, aIdx) => (
                  <View key={aIdx} style={styles.groupContainer}>
                    <View style={styles.groupHeader}>
                      <PlusCircle size={14} color={Colors.primary} style={{ marginRight: 6 }} />
                      <Text style={styles.groupTitle}>{group.title || `Add-on ${aIdx + 1}`}</Text>
                    </View>
                    {group.addons &&
                      group.addons.map((add: any, oIdx: number) => (
                        <View key={oIdx} style={styles.optionRow}>
                          <Text style={styles.optionName}>{add.name}</Text>
                          <Text style={styles.optionPrice}>
                            +£{Number(add.price || 0).toFixed(2)}
                          </Text>
                        </View>
                      ))}
                  </View>
                ))}
              </View>
            )}

            {/* Tags */}
            {item.tags && item.tags.length > 0 && (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionTitle}>Tags</Text>
                <View style={styles.tagRow}>
                  {item.tags.map((tag, tIdx) => (
                    <View key={tIdx} style={styles.tagBadge}>
                      <Tag size={10} color={Colors.textMuted} style={{ marginRight: 4 }} />
                      <Text style={styles.tagLabel}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer Action Buttons */}
          <View style={styles.footerActions}>
            {!isSuperAdmin ? (
              <>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.editBtn]}
                  onPress={() => {
                    onClose();
                    onEdit(item);
                  }}
                  activeOpacity={0.8}
                >
                  <Edit2 size={16} color="#FFFFFF" />
                  <Text style={styles.editBtnText}>Edit Item</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.deleteBtn]}
                  onPress={() => {
                    onClose();
                    onDelete(item._id);
                  }}
                  activeOpacity={0.8}
                >
                  <Trash2 size={16} color="#EF4444" />
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[styles.actionBtn, styles.closeFullBtn]}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Text style={styles.closeFullBtnText}>Close</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 28, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    color: Colors.textSubtle,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: Colors.cardSurface,
  },
  scrollBody: {
    padding: 16,
  },
  bannerRow: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 14,
    marginBottom: 14,
    alignItems: 'center',
  },
  bannerImage: {
    width: 80,
    height: 80,
    borderRadius: 14,
    backgroundColor: Colors.cardSurface,
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderStyle: 'dashed',
  },
  bannerInfo: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  itemName: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 22,
    letterSpacing: -0.3,
  },
  typeBadgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  badgeVeg: {
    backgroundColor: '#ECFDF5',
  },
  badgeNonVeg: {
    backgroundColor: '#FEF2F2',
  },
  badgeEgg: {
    backgroundColor: '#FFFBEB',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  badgeNeutral: {
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  badgeNeutralText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  availabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  availabilityLabel: {
    fontSize: 12,
    color: Colors.textSubtle,
  },
  sectionCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceMain: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.text,
  },
  originalPrice: {
    fontSize: 12,
    color: Colors.textSubtle,
    textDecorationLine: 'line-through',
    marginTop: 2,
  },
  discountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF4444',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  discountBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  descriptionText: {
    color: Colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  specGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  specItem: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 10,
    padding: 10,
    flex: 1,
    minWidth: '45%',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  specLabel: {
    fontSize: 11,
    color: Colors.textSubtle,
    fontWeight: '600',
  },
  specValue: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 2,
  },
  channelRow: {
    flexDirection: 'row',
    gap: 8,
  },
  channelPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  channelActive: {
    backgroundColor: Colors.primaryLight,
    borderColor: Colors.primary,
  },
  channelInactive: {
    backgroundColor: Colors.cardSurface,
    borderColor: Colors.cardBorder,
    opacity: 0.6,
  },
  channelText: {
    fontSize: 11,
    fontWeight: '700',
  },
  channelActiveText: {
    color: Colors.primary,
  },
  channelInactiveText: {
    color: Colors.textSubtle,
  },
  badgeRowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  offerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  offerBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  variantItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cardBorder,
  },
  variantName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  variantCut: {
    fontSize: 11,
    color: Colors.textSubtle,
    marginTop: 1,
  },
  variantPrice: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
  },
  groupContainer: {
    backgroundColor: Colors.cardSurface,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  groupTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.text,
    flex: 1,
  },
  requiredBadge: {
    fontSize: 9,
    fontWeight: '800',
    color: '#DC2626',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.03)',
  },
  optionName: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  optionPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardSurface,
    borderColor: Colors.cardBorder,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  footerActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
  },
  editBtn: {
    flex: 2,
    backgroundColor: Colors.primary,
  },
  editBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  deleteBtn: {
    flex: 1,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  deleteBtnText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '800',
  },
  closeFullBtn: {
    flex: 1,
    backgroundColor: Colors.cardSurface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  closeFullBtnText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
});
