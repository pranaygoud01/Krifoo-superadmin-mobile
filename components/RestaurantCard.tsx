import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, Linking, ActivityIndicator, Platform } from 'react-native';
import { Image } from 'expo-image';
import { resolveMediaImageSource } from '../services/image.helper';
import { Restaurant } from '../types';
import { Colors } from '../constants/colors';
import { MapPin, Phone, Mail, Check, X, ChevronRight, CalendarDays, Star, MessageSquareText } from 'lucide-react-native';

/* ── Shared helpers (also used by the Restaurants screen) ─────────────────── */

export type RestaurantStatus = 'pending' | 'approved' | 'rejected';

/** Backend aggregation sometimes nests verificationStatus inside `documents`. */
export const getVerificationStatus = (r: Restaurant): RestaurantStatus => {
  const nested = (r as any).documents?.verificationStatus;
  const s = (nested ?? r.verificationStatus ?? 'pending').toString().toLowerCase();
  return s === 'approved' || s === 'rejected' ? s : 'pending';
};

/** Returns a copy of the restaurant with its verification status updated in every place it may live. */
export const withVerificationStatus = (r: Restaurant, status: RestaurantStatus, remarks?: string): Restaurant => {
  const docs = (r as any).documents;
  const nextDocs =
    docs && typeof docs === 'object' && !Array.isArray(docs) ? { ...docs, verificationStatus: status } : docs;
  return {
    ...r,
    verificationStatus: status,
    verificationRemarks: remarks ?? r.verificationRemarks,
    documents: nextDocs,
  };
};

export const getAddressText = (r: Restaurant): string => {
  const a = r.address;
  if (typeof a === 'string') return a;
  if (a && typeof a === 'object') {
    return (
      a.formattedAddress ||
      [a.shopNo, a.floor, a.street, a.landmark, a.area, a.city, a.pincode].filter(Boolean).join(', ')
    );
  }
  return '';
};

const formatDate = (iso?: string) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const STATUS_STYLES: Record<RestaurantStatus, { label: string; bg: string; text: string; dot: string }> = {
  pending: { label: 'Pending review', bg: Colors.statusPending.bg, text: Colors.statusPending.text, dot: Colors.warning },
  approved: { label: 'Approved', bg: Colors.statusApproved.bg, text: Colors.statusApproved.text, dot: Colors.statusApproved.border },
  rejected: { label: 'Rejected', bg: Colors.statusRejected.bg, text: Colors.statusRejected.text, dot: Colors.danger },
};

/* ── Card ─────────────────────────────────────────────────────────────────── */

export type CardBusyAction = 'approve' | 'reject' | 'active' | null;

interface RestaurantCardProps {
  restaurant: Restaurant;
  onPress: (restaurant: Restaurant) => void;
  onApprove: (restaurant: Restaurant) => void;
  onReject: (restaurant: Restaurant) => void;
  /** Called with the value the switch is moving to. */
  onToggleActive: (restaurant: Restaurant, nextActive: boolean) => void;
  busy?: CardBusyAction;
}

const RestaurantCardBase: React.FC<RestaurantCardProps> = ({
  restaurant,
  onPress,
  onApprove,
  onReject,
  onToggleActive,
  busy = null,
}) => {
  const status = getVerificationStatus(restaurant);
  const statusStyle = STATUS_STYLES[status];
  const isActive = restaurant.isActive ?? false;
  const owner = restaurant.ownerFullName ?? restaurant.ownerName;
  const address = getAddressText(restaurant);
  const joined = formatDate(restaurant.createdAt);
  const isBusy = busy !== null;

  const imageSource = resolveMediaImageSource(
    restaurant.imageUrl ||
      (restaurant as any).logoUrl ||
      (restaurant as any).logo ||
      restaurant.externalWebsiteSettings?.logoUrl ||
      restaurant.externalWebsiteSettings?.heroBannerUrl
  );

  const openLink = (url: string) => Linking.openURL(url).catch(() => {});

  return (
    <TouchableOpacity
      style={[styles.card, status === 'pending' && styles.cardPending]}
      activeOpacity={0.85}
      onPress={() => onPress(restaurant)}
      accessibilityRole="button"
      accessibilityLabel={`${restaurant.restaurantName}, ${statusStyle.label}, ${isActive ? 'live' : 'offline'}. Open details`}
    >
      {/* Identity */}
      <View style={styles.header}>
        {imageSource ? (
          <Image source={imageSource} style={styles.logo} contentFit="cover" transition={200} cachePolicy="memory-disk" />
        ) : (
          <View style={[styles.logo, styles.logoPlaceholder]}>
            <Text style={styles.logoInitial}>{restaurant.restaurantName?.trim().charAt(0).toUpperCase() || 'R'}</Text>
          </View>
        )}
        <View style={styles.headerText}>
          <Text style={styles.name} numberOfLines={1}>
            {restaurant.restaurantName || 'Unnamed restaurant'}
          </Text>
          {owner ? (
            <Text style={styles.owner} numberOfLines={1}>
              {owner}
            </Text>
          ) : null}
          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: statusStyle.bg }]}>
              <View style={[styles.badgeDot, { backgroundColor: statusStyle.dot }]} />
              <Text style={[styles.badgeText, { color: statusStyle.text }]}>{statusStyle.label}</Text>
            </View>
            {status !== 'pending' && (
              <View style={[styles.badge, { backgroundColor: isActive ? Colors.statusActive.bg : Colors.cardSurface }]}>
                <View style={[styles.badgeDot, { backgroundColor: isActive ? Colors.info : Colors.textSubtle }]} />
                <Text style={[styles.badgeText, { color: isActive ? Colors.statusActive.text : Colors.textMuted }]}>
                  {isActive ? 'Live' : 'Offline'}
                </Text>
              </View>
            )}
          </View>
        </View>
        <ChevronRight size={18} color={Colors.textSubtle} />
      </View>

      {/* Contact */}
      <View style={styles.details}>
        <View style={styles.infoRow}>
          <MapPin size={14} color={Colors.textSubtle} />
          <Text style={[styles.infoText, !address && styles.infoMissing]} numberOfLines={2}>
            {address || 'No address provided'}
          </Text>
        </View>
        {restaurant.phoneNumber ? (
          <TouchableOpacity
            style={styles.infoRow}
            onPress={() => openLink(`tel:${restaurant.phoneNumber!.replace(/\s/g, '')}`)}
            hitSlop={{ top: 4, bottom: 4 }}
            accessibilityRole="link"
            accessibilityLabel={`Call ${restaurant.phoneNumber}`}
          >
            <Phone size={14} color={Colors.textSubtle} />
            <Text style={[styles.infoText, styles.infoLink]} numberOfLines={1}>
              {restaurant.phoneNumber}
            </Text>
          </TouchableOpacity>
        ) : null}
        {restaurant.email ? (
          <TouchableOpacity
            style={styles.infoRow}
            onPress={() => openLink(`mailto:${restaurant.email}`)}
            hitSlop={{ top: 4, bottom: 4 }}
            accessibilityRole="link"
            accessibilityLabel={`Email ${restaurant.email}`}
          >
            <Mail size={14} color={Colors.textSubtle} />
            <Text style={[styles.infoText, styles.infoLink]} numberOfLines={1}>
              {restaurant.email}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Meta */}
      {(joined || restaurant.rating || restaurant.totalOrdersCount) ? (
        <View style={styles.metaRow}>
          {joined && (
            <View style={styles.metaItem}>
              <CalendarDays size={12} color={Colors.textSubtle} />
              <Text style={styles.metaText}>Joined {joined}</Text>
            </View>
          )}
          {!!restaurant.rating && (
            <View style={styles.metaItem}>
              <Star size={12} color={Colors.warning} fill={Colors.warning} />
              <Text style={styles.metaText}>{restaurant.rating.toFixed(1)}</Text>
            </View>
          )}
          {!!restaurant.totalOrdersCount && (
            <Text style={styles.metaText}>{restaurant.totalOrdersCount} orders</Text>
          )}
        </View>
      ) : null}

      {status === 'rejected' && restaurant.verificationRemarks ? (
        <View style={styles.remarks}>
          <MessageSquareText size={13} color={Colors.statusRejected.text} />
          <Text style={styles.remarksText} numberOfLines={2}>
            {restaurant.verificationRemarks}
          </Text>
        </View>
      ) : null}

      {/* Spacer keeps footers aligned across cards in a grid row */}
      <View style={styles.flexSpacer} />

      {/* Actions */}
      {status === 'pending' ? (
        <View style={styles.reviewRow}>
          <TouchableOpacity
            style={[styles.reviewBtn, styles.rejectBtn, isBusy && styles.btnDisabled]}
            onPress={() => onReject(restaurant)}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel={`Reject ${restaurant.restaurantName}`}
          >
            {busy === 'reject' ? (
              <ActivityIndicator size="small" color={Colors.danger} />
            ) : (
              <>
                <X size={16} color={Colors.danger} strokeWidth={2.5} />
                <Text style={styles.rejectText}>Reject</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.reviewBtn, styles.approveBtn, isBusy && styles.btnDisabled]}
            onPress={() => onApprove(restaurant)}
            disabled={isBusy}
            accessibilityRole="button"
            accessibilityLabel={`Approve ${restaurant.restaurantName}`}
          >
            {busy === 'approve' ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.approveText}>Approve</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.footer}>
          <View style={styles.footerText}>
            <Text style={styles.footerLabel}>{isActive ? 'Visible to customers' : 'Hidden from customers'}</Text>
            <Text style={styles.footerHint}>{isActive ? 'Accepting orders' : 'Not accepting orders'}</Text>
          </View>
          {busy === 'active' ? (
            <ActivityIndicator size="small" color={Colors.primary} style={styles.switchSpinner} />
          ) : (
            <Switch
              value={isActive}
              onValueChange={(val) => onToggleActive(restaurant, val)}
              disabled={isBusy}
              trackColor={{ false: Colors.cardBorder, true: Colors.success }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={Colors.cardBorder}
              accessibilityLabel={`${restaurant.restaurantName} active`}
              style={Platform.OS === 'ios' ? styles.switchIos : undefined}
            />
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

export const RestaurantCard = React.memo(RestaurantCardBase);

const styles = StyleSheet.create({
  card: {
    flexGrow: 1,
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardPending: { borderColor: '#FDE7B0' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 56, height: 56, borderRadius: 14 },
  logoPlaceholder: { backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  logoInitial: { color: Colors.primary, fontSize: 22, fontWeight: '800' },
  headerText: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '800', color: Colors.text, letterSpacing: -0.2 },
  owner: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  details: { gap: 8, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.cardBorder },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  infoText: { flex: 1, fontSize: 13, color: Colors.textMuted, lineHeight: 18, marginTop: -2 },
  infoLink: { color: Colors.text },
  infoMissing: { color: Colors.textSubtle, fontStyle: 'italic' },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14, marginTop: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: Colors.textSubtle, fontWeight: '600' },

  remarks: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: Colors.statusRejected.bg,
  },
  remarksText: { flex: 1, fontSize: 12, color: Colors.statusRejected.text, lineHeight: 17 },

  flexSpacer: { flexGrow: 1, minHeight: 14 },

  reviewRow: { flexDirection: 'row', gap: 10 },
  reviewBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  rejectBtn: { borderWidth: 1.5, borderColor: '#FECACA', backgroundColor: '#FFFFFF' },
  approveBtn: { backgroundColor: Colors.success },
  rejectText: { fontSize: 14, fontWeight: '800', color: Colors.danger },
  approveText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  btnDisabled: { opacity: 0.6 },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  footerText: { flex: 1 },
  footerLabel: { fontSize: 13, fontWeight: '700', color: Colors.text },
  footerHint: { fontSize: 12, color: Colors.textSubtle, marginTop: 1 },
  switchSpinner: { width: 51, height: 31 },
  switchIos: { transform: [{ scale: 0.9 }] },
});
